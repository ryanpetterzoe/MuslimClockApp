package id.muslimclock.app

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader

/**
 * Hosts a WebView that loads the bundled HTML/JS/CSS via [WebViewAssetLoader].
 *
 * The asset loader gives us a real http(s) origin — we pick
 * `https://appassets.androidplatform.net` — so that:
 *   1. We never have to enable `allowFileAccess` (a security smell).
 *   2. User-imported slideshow images stored in `filesDir/slides/` can be
 *      served at `https://appassets.androidplatform.net/slides/<name>` and
 *      consumed by `<img>` / CSS background just like any remote URL.
 *
 * The bridge object [WebAppBridge] is registered as `window.MCAndroid`. On
 * every page-finish + onResume we push a fresh JSON config to JS so theme
 * and slideshow stay in sync with whatever Settings just wrote.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var assetLoader: WebViewAssetLoader
    private var lastConfigSnapshot: String? = null
    private var lastSafeAreaJs: String? = null

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        Settings.ensureDefaults(this)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        assetLoader = WebViewAssetLoader.Builder()
            // Bundled web app: assets/web/* -> /assets/*
            .addPathHandler(
                "/assets/",
                WebViewAssetLoader.AssetsPathHandler(this)
            )
            // User-imported slideshow images: filesDir/slides/* -> /slides/*
            .addPathHandler(
                "/slides/",
                WebViewAssetLoader.InternalStoragePathHandler(this, SlideStorage.dir(this))
            )
            // User-uploaded masjid logo: filesDir/logo/* -> /logo/*
            .addPathHandler(
                "/logo/",
                WebViewAssetLoader.InternalStoragePathHandler(this, LogoStorage.dir(this))
            )
            // User-uploaded adzan alarm audio: filesDir/audio/* -> /audio/*
            .addPathHandler(
                "/audio/",
                WebViewAssetLoader.InternalStoragePathHandler(this, AudioStorage.dir(this))
            )
            .build()

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
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    pushConfigToWeb()
                    // Re-apply cached safe-area insets — the inset listener
                    // may have fired before the page was ready.
                    lastSafeAreaJs?.let { webView.evaluateJavascript(it, null) }
                }
            }
            webChromeClient = WebChromeClient()
        }
        setContentView(webView)

        // Cutout / system-bar insets: forward to the page as CSS
        // custom properties so layouts can dodge the notch and any
        // residual bottom-bar area.
        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
            val sysBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val cutout  = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
            val density = resources.displayMetrics.density.coerceAtLeast(1f)
            fun toCssPx(px: Int) = (px / density).toInt()
            val top    = toCssPx(maxOf(sysBars.top, cutout.top))
            val bottom = toCssPx(maxOf(sysBars.bottom, cutout.bottom))
            val left   = toCssPx(maxOf(sysBars.left, cutout.left))
            val right  = toCssPx(maxOf(sysBars.right, cutout.right))
            val js = """
                (function(){
                    var r = document.documentElement;
                    if (!r) return;
                    r.style.setProperty('--safe-top',    '${top}px');
                    r.style.setProperty('--safe-bottom', '${bottom}px');
                    r.style.setProperty('--safe-left',   '${left}px');
                    r.style.setProperty('--safe-right',  '${right}px');
                    window.dispatchEvent(new Event('resize'));
                })();
            """.trimIndent()
            lastSafeAreaJs = js
            webView.evaluateJavascript(js, null)
            insets
        }

        webView.loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
    }

    /**
     * Hand the current settings to JS. Idempotent: only emits the eval call
     * when the JSON actually changed since the last push.
     */
    private fun pushConfigToWeb() {
        val json = Settings.toJson(this)
        if (json == lastConfigSnapshot) return
        lastConfigSnapshot = json
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

        // The system bars hide animates over a few frames. Tell the page
        // to re-measure once that's done so the layout matches the final
        // visible area, otherwise the layout's bottom edge gets clipped.
        webView.postDelayed({
            if (::webView.isInitialized) {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new Event('resize'));", null
                )
                lastSafeAreaJs?.let { webView.evaluateJavascript(it, null) }
            }
        }, 350)
        // Second pass: some devices need more time for the bars to finish
        // animating away (e.g. Samsung One UI).
        webView.postDelayed({
            if (::webView.isInitialized) {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new Event('resize'));", null
                )
            }
        }, 800)
    }

    private fun openSettings() {
        startActivity(Intent(this, SettingsActivity::class.java))
    }

    // ─── Key event handling ────────────────────────────────────────────
    //
    // WebView is the sole focusable View and it consumes DPAD_CENTER /
    // ENTER internally, so Activity.onKeyDown is never reached for those
    // keys. We override dispatchKeyEvent() — which fires BEFORE the View
    // hierarchy sees the event — to intercept OK/Enter at the Activity
    // level. This lets us implement the long-press dance (startTracking +
    // onKeyLongPress + onKeyUp) reliably regardless of WebView focus.

    /** Track whether we are currently managing DPAD_CENTER/ENTER. */
    private var trackingOkKey = false
    /** Set to true when onKeyLongPress fires so onKeyUp doesn't also fire a tap. */
    private var longPressConsumed = false

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val keyCode = event.keyCode

        // MENU / SETTINGS: open settings immediately on down.
        if (keyCode == KeyEvent.KEYCODE_MENU || keyCode == KeyEvent.KEYCODE_SETTINGS) {
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                openSettings()
            }
            return true
        }

        // Only intercept OK / Enter.
        if (keyCode != KeyEvent.KEYCODE_DPAD_CENTER && keyCode != KeyEvent.KEYCODE_ENTER) {
            return super.dispatchKeyEvent(event)
        }

        when (event.action) {
            KeyEvent.ACTION_DOWN -> {
                if (event.repeatCount == 0) {
                    // First press: arm tracking for long-press detection.
                    trackingOkKey = true
                    longPressConsumed = false
                    event.startTracking()
                }
                // Check if held long enough for a long-press (500ms default).
                // Android fires repeat events while held; after the long-press
                // threshold the framework sets FLAG_LONG_PRESS internally, but
                // since we intercept at dispatchKeyEvent we implement our own
                // threshold using repeatCount. ~20 repeats ≈ 500ms on most
                // devices (key repeat starts at ~50ms intervals after initial
                // delay of ~400ms, so repeatCount >= 1 after ~450ms).
                if (event.repeatCount == 1 && trackingOkKey && !longPressConsumed) {
                    longPressConsumed = true
                    webView.post { cycleToNextLayout() }
                }
                return true // consume, don't let WebView see it
            }
            KeyEvent.ACTION_UP -> {
                if (trackingOkKey && !longPressConsumed) {
                    // Short tap: forward synthetic Enter to JS so handlers
                    // (e.g. dismiss adzan overlay) still work.
                    webView.evaluateJavascript(
                        "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));",
                        null
                    )
                }
                trackingOkKey = false
                return true
            }
        }
        return true // swallow any other action (ACTION_MULTIPLE etc.)
    }

    /**
     * Pick the next layout in [R.array.layout_values], save it to
     * preferences, push the config to the WebView so the new theme
     * mounts immediately, and surface a Toast so the user sees which
     * theme they just landed on.
     *
     * Wraps around at the end of the list. If the current value isn't
     * found (corrupted prefs) we start from the top.
     */
    private fun cycleToNextLayout() {
        val values  = resources.getStringArray(R.array.layout_values)
        val entries = resources.getStringArray(R.array.layout_entries)
        if (values.isEmpty()) return

        val prefs = Settings.prefs(this)
        val current = prefs.getString(Settings.K_LAYOUT, values[0]) ?: values[0]
        val curIdx = values.indexOf(current).takeIf { it >= 0 } ?: -1
        val nextIdx = (curIdx + 1) % values.size
        val nextKey = values[nextIdx]
        val nextLabel = if (nextIdx < entries.size) entries[nextIdx] else nextKey

        prefs.edit().putString(Settings.K_LAYOUT, nextKey).apply()

        // Force a config push even if pushConfigToWeb's snapshot check
        // would otherwise short-circuit.
        lastConfigSnapshot = null
        pushConfigToWeb()

        android.widget.Toast.makeText(
            this,
            getString(R.string.theme_switched_to, nextLabel),
            android.widget.Toast.LENGTH_SHORT
        ).show()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        hideSystemUi()
        pushConfigToWeb()
    }

    override fun onDestroy() {
        webView.stopLoading()
        webView.destroy()
        super.onDestroy()
    }
}
