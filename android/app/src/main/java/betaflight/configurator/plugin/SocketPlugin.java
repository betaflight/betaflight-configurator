package betaflight.configurator.plugin;

import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Capacitor plugin that provides raw TCP socket functionality with thread safety,
 * robust resource management, and comprehensive error handling.
 */
@CapacitorPlugin(name = "SocketPlugin")
public class SocketPlugin extends Plugin {
    private static final String TAG = "SocketPlugin";

    // Error messages
    private static final String ERROR_IP_REQUIRED = "IP address is required";
    private static final String ERROR_INVALID_PORT = "Invalid port number";
    private static final String ERROR_ALREADY_CONNECTED = "Already connected; please disconnect first";
    private static final String ERROR_NOT_CONNECTED = "Not connected to any server";
    private static final String ERROR_DATA_REQUIRED = "Data is required";
    private static final String ERROR_CONNECTION_LOST = "Connection lost";
    private static final String ERROR_CONNECTION_CLOSED = "Connection closed by peer";

    // Connection settings
    private static final int DEFAULT_TIMEOUT_MS = 30_000;
    private static final int MIN_PORT = 1;
    private static final int MAX_PORT = 65535;

    private enum ConnectionState {
        DISCONNECTED,
        CONNECTING,
        CONNECTED,
        DISCONNECTING,
        ERROR
    }

    // Thread-safe state and locks
    private final AtomicReference<ConnectionState> state = new AtomicReference<>(ConnectionState.DISCONNECTED);
    private final ReentrantLock socketLock = new ReentrantLock();
    private final ReentrantLock writerLock = new ReentrantLock();

    private Socket socket;
    private BufferedReader reader;
    private BufferedWriter writer;

    @PluginMethod
    public void connect(final PluginCall call) {
        call.setKeepAlive(true);
        String ip = call.getString("ip");
        int port = call.getInt("port", -1);

        if (ip == null || ip.isEmpty()) {
            call.reject(ERROR_IP_REQUIRED);
            call.setKeepAlive(false);
            return;
        }
        if (port < MIN_PORT || port > MAX_PORT) {
            call.reject(ERROR_INVALID_PORT);
            call.setKeepAlive(false);
            return;
        }
        if (!compareAndSetState(ConnectionState.DISCONNECTED, ConnectionState.CONNECTING)) {
            call.reject(ERROR_ALREADY_CONNECTED);
            call.setKeepAlive(false);
            return;
        }

        getBridge().getExecutor().execute(() -> {
            socketLock.lock();
            try {
                socket = new Socket();
                socket.connect(new InetSocketAddress(ip, port), DEFAULT_TIMEOUT_MS);
                socket.setSoTimeout(DEFAULT_TIMEOUT_MS);

                reader = new BufferedReader(new InputStreamReader(socket.getInputStream()));
                writer = new BufferedWriter(new OutputStreamWriter(socket.getOutputStream()));

                state.set(ConnectionState.CONNECTED);
                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
                Log.d(TAG, "Connected to " + ip + ":" + port);
            } catch (Exception e) {
                state.set(ConnectionState.ERROR);
                closeResourcesInternal();
                call.reject("Connection failed: " + e.getMessage());
                Log.e(TAG, "Connection failed", e);
            } finally {
                socketLock.unlock();
                call.setKeepAlive(false);
            }
        });
    }

    @PluginMethod
    public void send(final PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.isEmpty()) {
            call.reject(ERROR_DATA_REQUIRED);
            return;
        }
        if (state.get() != ConnectionState.CONNECTED) {
            call.reject(ERROR_NOT_CONNECTED);
            return;
        }
        call.setKeepAlive(true);

        getBridge().getExecutor().execute(() -> {
            writerLock.lock();
            try {
                if (writer == null || state.get() != ConnectionState.CONNECTED) {
                    call.reject(ERROR_CONNECTION_LOST);
                    return;
                }
                writer.write(data);
                writer.newLine();
                writer.flush();

                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
                Log.d(TAG, "Sent data: " + truncateForLog(data));
            } catch (Exception e) {
                handleCommunicationError(e, "Send failed", call);
            } finally {
                writerLock.unlock();
                call.setKeepAlive(false);
            }
        });
    }

    @PluginMethod
    public void receive(final PluginCall call) {
        if (state.get() != ConnectionState.CONNECTED || reader == null) {
            call.reject(ERROR_NOT_CONNECTED);
            return;
        }
        call.setKeepAlive(true);

        getBridge().getExecutor().execute(() -> {
            try {
                String data = reader.readLine();
                if (data == null) {
                    handleCommunicationError(new IOException("End of stream"), ERROR_CONNECTION_CLOSED, call);
                    return;
                }
                JSObject result = new JSObject();
                result.put("data", data);
                call.resolve(result);
                Log.d(TAG, "Received data: " + truncateForLog(data));
            } catch (Exception e) {
                handleCommunicationError(e, "Receive failed", call);
            } finally {
                call.setKeepAlive(false);
            }
        });
    }

    @PluginMethod
    public void disconnect(final PluginCall call) {
        ConnectionState current = state.get();
        if (current == ConnectionState.DISCONNECTED) {
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
            return;
        }
        if (!compareAndSetState(current, ConnectionState.DISCONNECTING)) {
            call.reject("Invalid state for disconnect: " + current);
            return;
        }
        call.setKeepAlive(true);

        getBridge().getExecutor().execute(() -> {
            socketLock.lock();
            try {
                closeResourcesInternal();
                state.set(ConnectionState.DISCONNECTED);
                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
                Log.d(TAG, "Disconnected successfully");
            } catch (Exception e) {
                state.set(ConnectionState.ERROR);
                call.reject("Disconnect failed: " + e.getMessage());
                Log.e(TAG, "Disconnect failed", e);
            } finally {
                socketLock.unlock();
                call.setKeepAlive(false);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        socketLock.lock();
        try {
            state.set(ConnectionState.DISCONNECTING);
            closeResourcesInternal();
            state.set(ConnectionState.DISCONNECTED);
        } catch (Exception e) {
            Log.e(TAG, "Error cleaning up resources on destroy", e);
        } finally {
            socketLock.unlock();
        }
        super.handleOnDestroy();
    }

    private void closeResourcesInternal() {
        if (reader != null) {
            try { reader.close(); } catch (IOException e) { Log.e(TAG, "Error closing reader", e); } finally { reader = null; }
        }
        if (writer != null) {
            try { writer.flush(); writer.close(); } catch (IOException e) { Log.e(TAG, "Error closing writer", e); } finally { writer = null; }
        }
        if (socket != null) {
            try { socket.close(); } catch (IOException e) { Log.e(TAG, "Error closing socket", e); } finally { socket = null; }
        }
    }

    private void handleCommunicationError(Exception error, String message, PluginCall call) {
        socketLock.lock();
        try {
            state.set(ConnectionState.ERROR);
            closeResourcesInternal();
            state.set(ConnectionState.DISCONNECTED);
            call.reject(message + ": " + error.getMessage());
            Log.e(TAG, message, error);
        } finally {
            socketLock.unlock();
        }
    }

    private boolean compareAndSetState(ConnectionState expected, ConnectionState newState) {
        return state.compareAndSet(expected, newState);
    }

    private String truncateForLog(String data) {
        if (data == null) return "null";
        final int maxLen = 100;
        if (data.length() <= maxLen) return data;
        return data.substring(0, maxLen) + "... (" + data.length() + " chars)";
    }
}
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
            return;
        }
        if (!compareAndSetState(current, ConnectionState.DISCONNECTING)) {
            call.reject("Invalid state for disconnect: " + current);
            return;
        }
        call.setKeepAlive(true);

        getBridge().getExecutor().execute(() -> {
            socketLock.lock();
            try {
                closeResourcesInternal();
                state.set(ConnectionState.DISCONNECTED);
                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
                Log.d(TAG, "Disconnected successfully");
            } catch (Exception e) {
                state.set(ConnectionState.ERROR);
                call.reject("Disconnect failed: " + e.getMessage());
                Log.e(TAG, "Disconnect failed", e);
            } finally {
                socketLock.unlock();
                call.setKeepAlive(false);
            }
        });
    }

    @PluginMethod
    public void getStatus(final PluginCall call) {
        JSObject result = new JSObject();
        result.put("connected", state.get() == ConnectionState.CONNECTED);
        result.put("state", state.get().toString());
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        socketLock.lock();
        try {
            state.set(ConnectionState.DISCONNECTING);
            closeResourcesInternal();
            state.set(ConnectionState.DISCONNECTED);
        } catch (Exception e) {
            Log.e(TAG, "Error cleaning up resources on destroy", e);
        } finally {
            socketLock.unlock();
        }
        super.handleOnDestroy();
    }

    private void closeResourcesInternal() {
        if (reader != null) {
            try { reader.close(); } catch (IOException e) { Log.e(TAG, "Error closing reader", e);} finally { reader = null; }
        }
        if (writer != null) {
            try { writer.flush(); writer.close(); } catch (IOException e) { Log.e(TAG, "Error closing writer", e);} finally { writer = null; }
        }
        if (socket != null) {
            try { socket.close(); } catch (IOException e) { Log.e(TAG, "Error closing socket", e);} finally { socket = null; }
        }
    }

    private void handleCommunicationError(Exception error, String message, PluginCall call) {
        socketLock.lock();
        try {
            state.set(ConnectionState.ERROR);
            closeResourcesInternal();
            state.set(ConnectionState.DISCONNECTED);
            call.reject(message + ": " + error.getMessage());
            Log.e(TAG, message, error);
        } finally {
            socketLock.unlock();
        }
    }

    private boolean compareAndSetState(ConnectionState expected, ConnectionState newState) {
        return state.compareAndSet(expected, newState);
    }

    private String truncateForLog(String data) {
        if (data == null) return "null";
        final int maxLen = 100;
        if (data.length() <= maxLen) return data;
        return data.substring(0, maxLen) + "... (" + data.length() + " chars)";
    }
}
