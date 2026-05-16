package id.muslimclock.app

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * Hosts a WebView that loads the bundled HTML/JS/CSS from
 * `assets/web/index.html`. Designed for Android TV (landscape, fullscreen,
 * keep-screen-on) but also works on phones/tablets in landscape.
 *
 * The WebView talks to native code via [WebAppBridge], registered as
 * `window.MCAndroid`. On every page finished load we inject the latest
 * config from [Settings] so JS sees the same values the Settings screen
 * just wrote.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var lastConfigSnapshot: String? = null

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        Settings.ensureDefaults(this)

        // Edge-to-edge + keep screen on (always-on prayer display)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        webView = WebView(this).apply {
            setBackgroundColor(0xFF000000.toInt())
            isFocusable = true
            isFocusableInTouchMode = true

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                @Suppress("DEPRECATION")
                databaseEnabled = true
                cacheMode = WebSettings.LOAD_DEFAULT
                mediaPlaybackRequiresUserGesture = false
                loadWithOverviewMode = true
                useWideViewPort = true
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                allowFileAccess = false
                allowContentAccess = false
            }

            addJavascriptInterface(WebAppBridge(this@MainActivity), "MCAndroid")

            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    pushConfigToWeb()
                }
            }
            webChromeClient = WebChromeClient()
        }
        setContentView(webView)

        webView.loadUrl("file:///android_asset/web/index.html")
    }

    /**
     * Hand the current settings to JS. Cheap, idempotent — safe to call on
     * every onResume / onPageFinished. Triggers `window.applyConfig(json)`
     * so `clock.js` re-applies theme/text without a page reload.
     */
    private fun pushConfigToWeb() {
        val json = Settings.toJson(this)
        if (json == lastConfigSnapshot) return
        lastConfigSnapshot = json
        // JSON.parse keeps escaping safe; double-encode to embed in JS literal.
        val escaped = org.json.JSONObject.quote(json)
        val js = "if (window.applyConfig) { window.applyConfig(JSON.parse($escaped)); } " +
                 "else { window.MC_CONFIG = JSON.parse($escaped); }"
        webView.evaluateJavascript(js, null)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    private fun hideSystemUi() {
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())

        // Older devices: legacy immersive flags
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    or View.SYSTEM_UI_FLAG_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                )
        }
    }

    private fun openSettings() {
        startActivity(Intent(this, SettingsActivity::class.java))
    }

    /**
     * MENU on TV remote opens settings; OK/CENTER forwards as Enter to JS
     * (legacy hook from the original web build).
     */
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        return when (keyCode) {
            KeyEvent.KEYCODE_MENU -> { openSettings(); true }
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                webView.evaluateJavascript(
                    "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));",
                    null
                )
                true
            }
            else -> super.onKeyDown(keyCode, event)
        }
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        hideSystemUi()
        // Re-push config in case the user just changed something in SettingsActivity.
        pushConfigToWeb()
    }

    override fun onDestroy() {
        webView.stopLoading()
        webView.destroy()
        super.onDestroy()
    }
}
