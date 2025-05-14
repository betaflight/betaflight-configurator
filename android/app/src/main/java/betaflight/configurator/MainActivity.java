package betaflight.configurator;

import android.os.Bundle;

import betaflight.configurator.protocols.serial.BetaflightSerialPlugin;
import com.getcapacitor.BridgeActivity;
import betaflight.configurator.plugin.SocketPlugin;

public class MainActivity extends BridgeActivity {
	@Override
	protected void onCreate(Bundle savedInstanceState) {
		registerPlugin(BetaflightSerialPlugin.class);
		super.onCreate(savedInstanceState);
	}
}
