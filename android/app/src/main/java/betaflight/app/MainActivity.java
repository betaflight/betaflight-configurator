package betaflight.app;

import android.os.Bundle;

import betaflight.app.protocols.serial.BetaflightSerialPlugin;
import com.getcapacitor.BridgeActivity;
import betaflight.app.protocols.tcp.BetaflightTcpPlugin;
import betaflight.app.protocols.ble.BetaflightBlePlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(BetaflightSerialPlugin.class);
    registerPlugin(BetaflightBlePlugin.class);
    registerPlugin(BetaflightTcpPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
