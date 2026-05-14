package betaflight.app.protocols.dfu;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Explicit BroadcastReceiver to receive USB permission results on Android 14+.
 * Forwards the Intent to the active BetaflightDfuPlugin instance.
 */
public class DfuUsbPermissionReceiver extends BroadcastReceiver {
    private static final String TAG = "BetaflightDfu";

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "DfuUsbPermissionReceiver.onReceive called with action: " + intent.getAction());
        BetaflightDfuPlugin.onUsbPermissionResult(context, intent);
    }
}
