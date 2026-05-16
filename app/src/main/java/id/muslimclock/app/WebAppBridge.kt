package id.muslimclock.app

import android.content.Context
import android.content.Intent
import android.webkit.JavascriptInterface

/**
 * Bridges the in-WebView JS world to the native app. Only wire up the bare
 * minimum we currently need — every method here is reachable from any web
 * page loaded in the WebView, so we keep the surface tiny and trusted (we
 * only load `file:///android_asset/...`, never remote pages).
 */
class WebAppBridge(private val ctx: Context) {

    /** Returns the full settings JSON. Called on every page load. */
    @JavascriptInterface
    fun getConfig(): String = Settings.toJson(ctx)

    /** Open the native Android settings screen from a button in the web UI. */
    @JavascriptInterface
    fun openSettings() {
        val i = Intent(ctx, SettingsActivity::class.java)
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(i)
    }
}
