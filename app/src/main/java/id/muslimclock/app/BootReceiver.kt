package id.muslimclock.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Auto-launches [MainActivity] after the device finishes booting, so the
 * masjid display comes back up by itself after a power outage / nightly
 * reboot — which is the whole point of running this on a TV in the corner
 * of the prayer hall.
 *
 * The user can disable this from Settings (key [Settings.K_START_ON_BOOT]).
 * Default is ON because the kiosk use case is overwhelmingly "device on a
 * wall, just want it to come back".
 *
 * Caveats users should know about (documented in the summary string):
 *   - Many OEMs (Xiaomi/MIUI, Huawei, Honor, OPPO ColorOS) require an
 *     explicit "autostart" / "background" whitelist in OS settings. We
 *     can't bypass that from app code.
 *   - On Android 10+ devices that don't expose the LEANBACK launcher
 *     intent, the system may show a "starting in background" warning
 *     before the activity surfaces. That's normal.
 *
 * Intent filter handles both [Intent.ACTION_BOOT_COMPLETED] and the
 * `QUICKBOOT_POWERON` action that some HTC / older Samsung / cheap TV
 * boxes broadcast instead of (or in addition to) the standard one.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED &&
            action != "android.intent.action.QUICKBOOT_POWERON" &&
            // HTC's variant — some Android TV boxes use the same one.
            action != "com.htc.intent.action.QUICKBOOT_POWERON") {
            return
        }

        if (!Settings.prefs(context).getBoolean(Settings.K_START_ON_BOOT, true)) {
            Log.i(TAG, "Boot received ($action), but start_on_boot is OFF")
            return
        }

        Log.i(TAG, "Boot received ($action), launching MainActivity")
        try {
            val launch = Intent(context, MainActivity::class.java).apply {
                // Required when starting an activity from a non-activity
                // context — broadcasts run in the receiver's process.
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                // Cleanly start a fresh stack so resuming after a long
                // sleep doesn't dredge up a stale instance.
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            context.startActivity(launch)
        } catch (e: Exception) {
            // Swallow — receiver crashes block subsequent boot
            // broadcasts on some devices, and the worst case is just
            // "user has to tap the icon themselves once".
            Log.w(TAG, "Failed to launch on boot", e)
        }
    }

    companion object {
        private const val TAG = "MCBootReceiver"
    }
}
