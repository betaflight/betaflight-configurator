package betaflight.configurator.plugin;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.*;
import java.net.Socket;

@CapacitorPlugin(name = "SocketPlugin")
public class SocketPlugin extends Plugin {
    private Socket socket;
    private BufferedReader reader;
    private BufferedWriter writer;

    @PluginMethod
    public void connect(PluginCall call) {
        String ip = call.getString("ip");
        int port = call.getInt("port");
        try {
            socket = new Socket(ip, port);
            reader = new BufferedReader(new InputStreamReader(socket.getInputStream()));
            writer = new BufferedWriter(new OutputStreamWriter(socket.getOutputStream()));
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Connection failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void send(PluginCall call) {
        String data = call.getString("data");
        try {
            writer.write(data);
            writer.flush();
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Send failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void receive(PluginCall call) {
        try {
            String data = reader.readLine();
            JSObject ret = new JSObject();
            ret.put("data", data);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Receive failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        try {
            if (socket != null) socket.close();
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Disconnect failed: " + e.getMessage());
        }
    }
}
