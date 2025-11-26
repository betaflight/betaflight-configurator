package betaflight.configurator;

import android.os.Bundle;

import betaflight.configurator.protocols.serial.BetaflightSerialPlugin;
import com.getcapacitor.BridgeActivity;
import betaflight.configurator.plugin.SocketPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    registerPlugin(BetaflightSerialPlugin.class);
    registerPlugin(SocketPlugin.class);
  }
}
