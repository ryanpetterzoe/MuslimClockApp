package id.muslimclock.app

import android.content.Context
import android.content.SharedPreferences
import androidx.preference.PreferenceManager
import org.json.JSONObject

/**
 * Single source of truth for app configuration. Backs onto Android's
 * default SharedPreferences so [androidx.preference.PreferenceFragmentCompat]
 * can read/write the same values without any plumbing.
 *
 * The [toJson] form is what we hand to the WebView so `clock.js` can read
 * the exact same config the Settings screen wrote.
 */
object Settings {

    // Keep these in sync with res/xml/preferences.xml
    const val K_MASJID_NAME    = "masjid_name"
    const val K_MASJID_ADDRESS = "masjid_address"
    const val K_MASJID_LOGO    = "masjid_logo"
    const val K_LAT            = "location_lat"
    const val K_LNG            = "location_lng"
    const val K_TIMEZONE       = "timezone"
    const val K_CALC_METHOD    = "calc_method"
    const val K_THEME_PRIMARY  = "theme_primary"
    const val K_THEME_ACCENT   = "theme_accent"
    const val K_FONT_DISPLAY   = "font_display"
    const val K_FONT_DIGITAL   = "font_digital"
    const val K_ADZAN_MESSAGE  = "adzan_message"
    const val K_ADZAN_DURATION = "adzan_duration"
    const val K_IQOMAH_DURATION = "iqomah_duration"
    const val K_SHOW_ANALOG    = "show_analog"
    const val K_SHOW_COUNTDOWN = "show_countdown"
    const val K_LAYOUT         = "layout"
    const val K_SLIDESHOW_URLS = "slideshow_urls"
    const val K_SLIDE_DURATION = "slide_duration"
    const val K_SHOW_TICKER    = "show_ticker"
    const val K_TICKER_TEXT    = "ticker_text"
    const val K_TICKER_SPEED   = "ticker_speed"
    const val K_SHOW_QURAN     = "show_quran"
    const val K_QURAN_INTERVAL = "quran_interval"
    const val K_QURAN_MODE     = "quran_mode"

    fun prefs(ctx: Context): SharedPreferences =
        PreferenceManager.getDefaultSharedPreferences(ctx.applicationContext)

    /**
     * Apply sensible Indonesian defaults the first time the app launches.
     * Subsequent launches keep whatever the user set.
     */
    fun ensureDefaults(ctx: Context) {
        val p = prefs(ctx)
        if (p.getBoolean("__initialized", false)) return
        p.edit()
            .putString(K_MASJID_NAME,    "Masjid Muslim Clock")
            .putString(K_MASJID_ADDRESS, "Jakarta, Indonesia")
            .putString(K_MASJID_LOGO,    "")
            .putString(K_LAT,            "-6.2")
            .putString(K_LNG,            "106.816666")
            .putString(K_TIMEZONE,       "Asia/Jakarta")
            .putString(K_CALC_METHOD,    "20")  // Indonesia / KEMENAG
            .putString(K_THEME_PRIMARY,  "#0A4EA3")
            .putString(K_THEME_ACCENT,   "#F5B301")
            .putString(K_FONT_DISPLAY,   "Inter")
            .putString(K_FONT_DIGITAL,   "Orbitron")
            .putString(K_ADZAN_MESSAGE,  "Saatnya Waktu Sholat")
            .putString(K_ADZAN_DURATION, "600")
            .putString(K_IQOMAH_DURATION,"600")
            .putBoolean(K_SHOW_ANALOG,   true)
            .putBoolean(K_SHOW_COUNTDOWN,true)
            .putString(K_LAYOUT,         "minimal")
            .putString(K_SLIDESHOW_URLS, "")
            .putString(K_SLIDE_DURATION, "8")
            .putBoolean(K_SHOW_TICKER,   true)
            .putString(K_TICKER_TEXT,    "Selamat Datang di Masjid Muslim Clock | Jadwal Sholat Hari Ini")
            .putString(K_TICKER_SPEED,   "30")
            .putBoolean(K_SHOW_QURAN,    true)
            .putString(K_QURAN_INTERVAL, "30")
            .putString(K_QURAN_MODE,     "fullcard")
            .putBoolean("__initialized", true)
            .apply()
    }

    fun toJson(ctx: Context): String {
        val p = prefs(ctx)
        fun str(k: String, d: String) = p.getString(k, d) ?: d
        fun dbl(k: String, d: Double): Double =
            (p.getString(k, d.toString()) ?: d.toString()).toDoubleOrNull() ?: d
        fun int(k: String, d: Int): Int =
            (p.getString(k, d.toString()) ?: d.toString()).toIntOrNull() ?: d

        return JSONObject().apply {
            put("masjid_name",     str(K_MASJID_NAME,    "Masjid Muslim Clock"))
            put("masjid_address",  str(K_MASJID_ADDRESS, "Jakarta, Indonesia"))
            put("masjid_logo",     str(K_MASJID_LOGO,    ""))
            put("location_lat",    dbl(K_LAT, -6.2))
            put("location_lng",    dbl(K_LNG, 106.816666))
            put("timezone",        str(K_TIMEZONE,       "Asia/Jakarta"))
            put("calc_method",     int(K_CALC_METHOD,    20))
            put("theme_primary",   str(K_THEME_PRIMARY,  "#0A4EA3"))
            put("theme_accent",    str(K_THEME_ACCENT,   "#F5B301"))
            put("font_display",    str(K_FONT_DISPLAY,   "Inter"))
            put("font_digital",    str(K_FONT_DIGITAL,   "Orbitron"))
            put("adzan_message",   str(K_ADZAN_MESSAGE,  "Saatnya Waktu Sholat"))
            put("adzan_duration",  int(K_ADZAN_DURATION,  600))
            put("iqomah_duration", int(K_IQOMAH_DURATION, 600))
            put("show_analog",     p.getBoolean(K_SHOW_ANALOG,    true))
            put("show_countdown",  p.getBoolean(K_SHOW_COUNTDOWN, true))
            put("layout",          str(K_LAYOUT,                  "minimal"))
            put("slideshow_urls",  str(K_SLIDESHOW_URLS,          ""))
            put("slide_duration",  int(K_SLIDE_DURATION,           8))
            put("show_ticker",     p.getBoolean(K_SHOW_TICKER,    true))
            put("ticker_text",     str(K_TICKER_TEXT,             "Selamat Datang di Masjid Muslim Clock | Jadwal Sholat Hari Ini"))
            put("ticker_speed",    int(K_TICKER_SPEED,            30))
            put("show_quran",      p.getBoolean(K_SHOW_QURAN,    true))
            put("quran_interval",  int(K_QURAN_INTERVAL,          30))
            put("quran_mode",      str(K_QURAN_MODE,              "fullcard"))
            // Modules not yet implemented in MVP — keep keys stable so future
            // PRs can flip these without touching clock.js again.
            put("show_imam",       false)
            put("show_running",    p.getBoolean(K_SHOW_TICKER, true))
        }.toString()
    }
}
