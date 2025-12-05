package betaflight.configurator;

import android.os.Bundle;

import betaflight.configurator.protocols.bluetooth.BetaflightBluetoothPlugin;
import betaflight.configurator.protocols.serial.BetaflightSerialPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
	@Override
	protected void onCreate(Bundle savedInstanceState) {
		registerPlugin(BetaflightSerialPlugin.class);
		registerPlugin(BetaflightBluetoothPlugin.class);
		super.onCreate(savedInstanceState);
	}
}
