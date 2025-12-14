package betaflight.configurator;

import android.os.Bundle;

import betaflight.configurator.protocols.serial.BetaflightSerialPlugin;
import betaflight.configurator.protocols.ble.BetaflightBlePlugin;
import com.getcapacitor.BridgeActivity;
import betaflight.configurator.protocols.tcp.BetaflightTcpPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(BetaflightSerialPlugin.class);
    registerPlugin(BetaflightBlePlugin.class);
    registerPlugin(BetaflightTcpPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
