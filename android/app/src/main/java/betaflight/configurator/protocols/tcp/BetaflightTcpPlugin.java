package betaflight.configurator.protocols.tcp;

import android.util.Base64;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Capacitor plugin that provides raw TCP socket functionality with thread safety,
 * robust resource management, and comprehensive error handling.
 */
@CapacitorPlugin(name = "BetaflightTcp")
public class BetaflightTcpPlugin extends Plugin {
    private static final String TAG = "BetaflightTcp";

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
    private InputStream input;
    private OutputStream output;
    private Thread readerThread;
    private volatile boolean readerRunning = false;

    @PluginMethod
    public void connect(final PluginCall call) {
        call.setKeepAlive(true);
        final String ip = call.getString("ip");

        Integer portObj = call.getInt("port");
        final int port = (portObj != null) ? portObj : -1;

        if (ip == null || ip.isEmpty()) {
            call.reject(ERROR_IP_REQUIRED);
            call.setKeepAlive(false);
            return;
        }
        
        if (!compareAndSetState(ConnectionState.DISCONNECTED, ConnectionState.CONNECTING)) {
            call.reject(ERROR_ALREADY_CONNECTED);
            call.setKeepAlive(false);
            return;
        }


        new Thread(() -> {
            socketLock.lock();
            try {
                socket = new Socket();
                InetSocketAddress address = new InetSocketAddress(ip, port);
                socket.connect(address, DEFAULT_TIMEOUT_MS);
                socket.setSoTimeout(DEFAULT_TIMEOUT_MS);

                input = socket.getInputStream();
                output = socket.getOutputStream();

                state.set(ConnectionState.CONNECTED);
                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
                Log.d(TAG, "Connected to " + ip + (port != -1 ? (":" + port) : ""));

                startReaderThread();
            } catch (Exception e) {
                state.set(ConnectionState.ERROR);
                closeResourcesInternal();
                state.set(ConnectionState.DISCONNECTED);
                call.reject("Connection failed: " + e.getMessage());
                Log.e(TAG, "Connection failed", e);
            } finally {
                socketLock.unlock();
                call.setKeepAlive(false);
            }
        }).start();
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

        new Thread(() -> {
            writerLock.lock();
            try {
                if (output == null || state.get() != ConnectionState.CONNECTED) {
                    call.reject(ERROR_CONNECTION_LOST);
                    return;
                }
                byte[] payload = Base64.decode(data, Base64.NO_WRAP);
                output.write(payload);
                output.flush();

                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
                Log.d(TAG, "Sent " + payload.length + " bytes");
            } catch (Exception e) {
                handleCommunicationError(e, "Send failed", call);
            } finally {
                writerLock.unlock();
                call.setKeepAlive(false);
            }
        }).start();
    }

    @PluginMethod
    public void receive(final PluginCall call) {
        // Deprecated by continuous reader (Task 2)
        JSObject result = new JSObject();
        result.put("data", "");
        call.reject("Continuous read active. Listen for 'dataReceived' events instead.");
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

        new Thread(() -> {
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
                // Ensure cleanup completes even on error
                try {
                    closeResourcesInternal();
                } catch (Exception ce) {
                    Log.e(TAG, "Cleanup error during disconnect", ce);
                }
                call.reject("Disconnect failed: " + e.getMessage());
                Log.e(TAG, "Disconnect failed", e);
                // Reset to a clean disconnected state after handling error
                state.set(ConnectionState.DISCONNECTED);
            } finally {
                socketLock.unlock();
                call.setKeepAlive(false);
            }
        }).start();
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

    private void startReaderThread() {
        if (readerThread != null && readerThread.isAlive()) return;
        readerRunning = true;
        readerThread = new Thread(() -> {
            Log.d(TAG, "Reader thread started");
            try {
                byte[] buf = new byte[4096];
                while (readerRunning && state.get() == ConnectionState.CONNECTED && input != null) {
                    int read = input.read(buf);
                    if (read == -1) {
                        notifyDisconnectFromPeer();
                        break;
                    }
                    if (read > 0) {
                        byte[] chunk = Arrays.copyOf(buf, read);
                        String b64 = Base64.encodeToString(chunk, Base64.NO_WRAP);
                        JSObject payload = new JSObject();
                        payload.put("data", b64);
                        notifyListeners("dataReceived", payload);
                    }
                }
            } catch (Exception e) {
                if (readerRunning) {
                    Log.e(TAG, "Reader thread error", e);
                    JSObject err = new JSObject();
                    err.put("error", e.getMessage());
                    notifyListeners("dataReceivedError", err);
                    handleCommunicationError(e, "Receive failed", null);
                }
            } finally {
                Log.d(TAG, "Reader thread stopped");
            }
        }, "SocketReaderThread");
        readerThread.start();
    }

    private void notifyDisconnectFromPeer() {
        Log.d(TAG, "Peer closed connection");
        JSObject evt = new JSObject();
        evt.put("reason", "peer_closed");
        notifyListeners("connectionClosed", evt);
        socketLock.lock();
        try {
            state.set(ConnectionState.ERROR);
            closeResourcesInternal();
            state.set(ConnectionState.DISCONNECTED);
        } finally {
            socketLock.unlock();
        }
    }

    private void stopReaderThread() {
        readerRunning = false;
        if (readerThread != null) {
            try {
                readerThread.interrupt();
                readerThread.join(500);
            } catch (InterruptedException ignored) {}
            readerThread = null;
        }
    }

    private void closeResourcesInternal() {
        stopReaderThread();
        if (input != null) { try { input.close(); } catch (IOException e) { Log.e(TAG, "Error closing input stream", e); } finally { input = null; } }
        if (output != null) { try { output.close(); } catch (IOException e) { Log.e(TAG, "Error closing output stream", e); } finally { output = null; } }
        if (socket != null) { try { socket.close(); } catch (IOException e) { Log.e(TAG, "Error closing socket", e); } finally { socket = null; } }
    }

    private void handleCommunicationError(Exception error, String message, PluginCall call) {
        socketLock.lock();
        try {
            state.set(ConnectionState.ERROR);
            closeResourcesInternal();
            state.set(ConnectionState.DISCONNECTED);

            String fullMsg = message + ": " + (error != null ? error.getMessage() : "unknown error");
            if (call != null) {
                call.reject(fullMsg);
            } else {
                // No PluginCall available (e.g., background reader thread). Log the error.
                Log.e(TAG, fullMsg, error);
                // Optionally notify listeners (commented to avoid duplicate notifications):
                // JSObject err = new JSObject();
                // err.put("error", fullMsg);
                // notifyListeners("socketError", err);
            }
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
