package betaflight.configurator.plugin;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.*;
import java.net.Socket;

/**
 * Capacitor plugin that provides raw TCP socket functionality.
 * Implements methods to connect, send, receive, and disconnect.
 */
@CapacitorPlugin(name = "SocketPlugin")
public class SocketPlugin extends Plugin {
    private Socket socket;
    private BufferedReader reader;
    private BufferedWriter writer;
    private boolean isConnected = false;

    @PluginMethod
    public void connect(PluginCall call) {
        String ip = call.getString("ip");
        // Use a default value (e.g., -1) to avoid NullPointerException if "port" is missing
        int port = call.getInt("port", -1);

        // Validate inputs
        if (ip == null || ip.isEmpty()) {
            call.reject("IP address is required");
            return;
        }

        if (port <= 0 || port > 65535) {
            call.reject("Invalid port number");
            return;
        }

        // Prevent duplicate connections
        if (socket != null && !socket.isClosed()) {
            call.reject("Already connected; please disconnect first");
            return;
        }

        // Run network operations on a background thread
        getBridge().getExecutor().execute(() -> {
            try {
                socket = new Socket(ip, port);
                socket.setSoTimeout(30_000); // 30s timeout
                reader = new BufferedReader(new InputStreamReader(socket.getInputStream()));
                writer = new BufferedWriter(new OutputStreamWriter(socket.getOutputStream()));
                isConnected = true;
                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception e) {
                closeResources();
                call.reject("Connection failed: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void send(PluginCall call) {
        String data = call.getString("data");

        // Validate input
        if (data == null) {
            call.reject("Data is required");
            return;
        }

        // Check connection state
        if (socket == null || socket.isClosed() || !isConnected || reader == null || writer == null) {
            call.reject("Not connected to any server");
            return;
        }

        // Run write operation on a background thread and synchronize on writer
        getBridge().getExecutor().execute(() -> {
            try {
                synchronized (writer) {
                    // Append newline for framing; adjust as needed for your protocol
                    writer.write(data);
                    writer.newLine();
                    writer.flush();
                }
                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception e) {
                closeResources();
                isConnected = false;
                call.reject("Send failed: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void receive(PluginCall call) {
        // Check connection state
        if (socket == null || socket.isClosed() || !isConnected || reader == null) {
            call.reject("Not connected to any server");
            return;
        }

        // Run read operation on a background thread to avoid blocking the UI
        getBridge().getExecutor().execute(() -> {
            try {
                String data = reader.readLine();
                if (data == null) {
                    // Stream ended or connection closed by peer
                    closeResources();
                    isConnected = false;
                    call.reject("Connection closed by peer");
                    return;
                }
                JSObject ret = new JSObject();
                ret.put("data", data);
                call.resolve(ret);
            } catch (Exception e) {
                closeResources();
                isConnected = false;
                call.reject("Receive failed: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        try {
            closeResources();
            isConnected = false;
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Disconnect failed: " + e.getMessage());
        }
    }

    /**
     * Helper method to close all resources and clean up state
     */
    private void closeResources() {
        try {
            if (reader != null) {
                reader.close();
                reader = null;
            }
            if (writer != null) {
                writer.close();
                writer = null;
            }
            if (socket != null) {
                socket.close();
                socket = null;
            }
        } catch (IOException e) {
            // Log but continue cleanup
            isConnected = false;
            getContext().getActivity().runOnUiThread(() ->
                Log.e("SocketPlugin", "Error closing resources", e));
        }
    }
}
