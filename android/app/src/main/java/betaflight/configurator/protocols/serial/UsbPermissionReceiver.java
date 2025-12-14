package betaflight.app.protocols.serial;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Explicit BroadcastReceiver to receive USB permission results on Android 14+.
 * Forwards the Intent to the active BetaflightSerialPlugin instance.
 */
public class UsbPermissionReceiver extends BroadcastReceiver {
    private static final String TAG = "BetaflightSerial";

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "UsbPermissionReceiver.onReceive called with action: " + intent.getAction());
        BetaflightSerialPlugin.onUsbPermissionResult(context, intent);
    }
}
