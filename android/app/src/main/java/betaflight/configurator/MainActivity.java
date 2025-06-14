package betaflight.configurator;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import betaflight.configurator.plugin.SocketPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    registerPlugin(SocketPlugin.class);
  }
}
