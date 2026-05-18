package id.muslimclock.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Auto-launches [MainActivity] after the device finishes booting, when
 * the user has the start-on-boot toggle enabled. Designed for the
 * primary use case: a TV permanently mounted in a masjid that needs
 * to come back up by itself after a power cut.
 *
 * Resilience choices:
 *
 *   - We listen for `BOOT_COMPLETED` plus the two QUICKBOOT_POWERON
 *     variants (HTC's namespaced one and the legacy unprefixed form
 *     used by some Chinese Android TV boxes).
 *
 *   - The receiver bails early if the toggle is off, so leaving it
 *     enabled in the manifest is harmless even when the user disables
 *     the feature.
 *
 *   - Every external call is wrapped in a try/catch. A receiver that
 *     throws can block subsequent broadcasts on some OEM ROMs; we'd
 *     rather log and continue than crash. If launching the activity
 *     fails the user can still tap the icon manually — the cost of
 *     a failure here is very small.
 *
 *   - We use `FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_CLEAR_TOP`. The
 *     first is mandatory when starting an activity from a non-activity
 *     context; the second avoids resurrecting any zombie task left
 *     over from before the reboot.
 *
 *   - The receiver is *not* `directBootAware`, because we read prefs
 *     from credential-encrypted storage (where Android 7+ keeps
 *     SharedPreferences by default). That means we won't see the
 *     broadcast until the user unlocks the device for the first time,
 *     which is fine — masjid TVs run without a lockscreen anyway.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context?, intent: Intent?) {
        val ctx = context ?: return
        val action = intent?.action ?: return
        Log.i(TAG, "Received: $action")

        if (action != Intent.ACTION_BOOT_COMPLETED &&
            action != "android.intent.action.QUICKBOOT_POWERON" &&
            action != "com.htc.intent.action.QUICKBOOT_POWERON") {
            return
        }

        val enabled = try {
            Settings.prefs(ctx).getBoolean(Settings.K_START_ON_BOOT, true)
        } catch (t: Throwable) {
            // If prefs can't be read for any reason (corrupt file,
            // direct-boot edge case) default to NOT auto-launching so
            // we never trap the user in a boot-loop they can't escape.
            Log.w(TAG, "Could not read start-on-boot pref, skipping", t)
            return
        }

        if (!enabled) {
            Log.i(TAG, "start-on-boot disabled by user, skipping")
            return
        }

        try {
            val launch = Intent(ctx, MainActivity::class.java).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP
                )
            }
            ctx.startActivity(launch)
            Log.i(TAG, "Launched MainActivity after boot")
        } catch (t: Throwable) {
            // Some OEMs (Xiaomi/MIUI, ColorOS) require the user to
            // whitelist the app for autostart in OS settings; without
            // that, startActivity() throws SecurityException. Logging
            // is all we can do — the user will need to enable
            // autostart manually in their TV/box's launcher.
            Log.e(TAG, "Failed to start MainActivity from BootReceiver", t)
        }
    }

    companion object {
        private const val TAG = "MCBootReceiver"
    }
}
