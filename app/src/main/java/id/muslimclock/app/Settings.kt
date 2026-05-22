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

    // Keep these in sync with res/xml/pref_*.xml
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
    // Adzan alarm audio. URL points either to a user-imported file
    // served via WebViewAssetLoader (appassets://...) or an external
    // http(s) URL. Loop count: how many times to play the clip in a row
    // when the prayer time hits; 1 = play once, ≥2 repeats.
    const val K_ADZAN_AUDIO_URL = "adzan_audio_url"
    const val K_ADZAN_AUDIO_LOOPS = "adzan_audio_loops"
    const val K_DIGITAL_STYLE  = "digital_style"
    const val K_HIDE_SECONDS   = "hide_seconds"
    const val K_ANALOG_STYLE   = "analog_style"
    const val K_SHOW_ANALOG    = "show_analog"
    const val K_SHOW_COUNTDOWN = "show_countdown"
    const val K_LAYOUT         = "layout"
    const val K_SLIDESHOW_URLS = "slideshow_urls"
    const val K_SLIDE_DURATION = "slide_duration"
    const val K_SLIDESHOW_OPACITY = "slideshow_opacity"
    const val K_SHOW_TICKER    = "show_ticker"
    const val K_TICKER_TEXT    = "ticker_text"
    const val K_TICKER_SPEED   = "ticker_speed"
    const val K_TICKER_STYLE   = "ticker_style"
    const val K_TICKER_BG      = "ticker_bg"
    const val K_SHOW_QURAN     = "show_quran"
    const val K_QURAN_INTERVAL = "quran_interval"
    const val K_QURAN_MODE     = "quran_mode"
    const val K_QURAN_MARQUEE_SPEED = "quran_marquee_speed"

    // Imam schedule. One field per prayer slot (same imam every day).
    // Friday extras hold the Jum'at imam + khatib (preacher).
    const val K_SHOW_IMAM         = "show_imam"
    const val K_IMAM_FAJR         = "imam_fajr"
    const val K_IMAM_DHUHR        = "imam_dhuhr"
    const val K_IMAM_ASR          = "imam_asr"
    const val K_IMAM_MAGHRIB      = "imam_maghrib"
    const val K_IMAM_ISHA         = "imam_isha"
    const val K_IMAM_JUMAT        = "imam_jumat"
    const val K_KHATIB_JUMAT      = "khatib_jumat"

    // Per-prayer adzan overlay content. Each prayer can show a Quran card,
    // custom text, or nothing in the overlay below the countdown.
    const val K_ADZAN_CONTENT_FAJR    = "adzan_content_fajr"
    const val K_ADZAN_TEXT_FAJR       = "adzan_text_fajr"
    const val K_ADZAN_CONTENT_DHUHR   = "adzan_content_dhuhr"
    const val K_ADZAN_TEXT_DHUHR      = "adzan_text_dhuhr"
    const val K_ADZAN_CONTENT_ASR     = "adzan_content_asr"
    const val K_ADZAN_TEXT_ASR        = "adzan_text_asr"
    const val K_ADZAN_CONTENT_MAGHRIB = "adzan_content_maghrib"
    const val K_ADZAN_TEXT_MAGHRIB    = "adzan_text_maghrib"
    const val K_ADZAN_CONTENT_ISHA    = "adzan_content_isha"
    const val K_ADZAN_TEXT_ISHA       = "adzan_text_isha"

    // Layout editor — per-element positioning. Each editable element has
    // three knobs: size (50..200% of default), and X/Y offset in viewport
    // percent (-50..+50). All are clamped server-side in [toJson] so a
    // corrupted prefs file can never push elements completely off-screen.
    const val K_ANALOG_SIZE   = "analog_size"
    const val K_ANALOG_X_PCT  = "analog_x_pct"
    const val K_ANALOG_Y_PCT  = "analog_y_pct"

    const val K_DIGITAL_SIZE  = "digital_size"
    const val K_DIGITAL_X_PCT = "digital_x_pct"
    const val K_DIGITAL_Y_PCT = "digital_y_pct"

    const val K_PRAYERS_SIZE  = "prayers_size"
    const val K_PRAYERS_X_PCT = "prayers_x_pct"
    const val K_PRAYERS_Y_PCT = "prayers_y_pct"

    const val K_QURAN_SIZE    = "quran_size"
    const val K_QURAN_X_PCT   = "quran_x_pct"
    const val K_QURAN_Y_PCT   = "quran_y_pct"

    const val K_DATE_SIZE     = "date_size"
    const val K_DATE_X_PCT    = "date_x_pct"
    const val K_DATE_Y_PCT    = "date_y_pct"

    // "Menuju Sholat" countdown pill — same triple of knobs (size + X/Y).
    // Useful when users want to enlarge / reposition the prayer-countdown
    // independently of the digital clock above it.
    const val K_NEXT_SIZE     = "next_size"
    const val K_NEXT_X_PCT    = "next_x_pct"
    const val K_NEXT_Y_PCT    = "next_y_pct"

    // Identity sizing & position — controls the logo box dimensions,
    // masjid name/address font size, and header alignment (left/center/right).
    const val K_LOGO_SIZE          = "logo_size"
    const val K_IDENTITY_SIZE      = "identity_size"
    const val K_IDENTITY_POSITION  = "identity_position"
    const val K_IDENTITY_X_PCT     = "identity_x_pct"
    const val K_IDENTITY_Y_PCT     = "identity_y_pct"
    const val K_LOGO_POSITION      = "logo_position"

    // Date position — independent control over date (Masehi & Hijriah)
    // alignment. Defaults to "auto" which derives position from identity_position:
    // identity left => date right, identity center => date center, identity right => date left.
    const val K_DATE_POSITION      = "date_position"

    // System: auto-launch the app after the device finishes booting.
    // Default ON because the primary deployment is a TV permanently
    // mounted on a masjid wall — when power blinks the user expects
    // the clock to come back by itself.
    const val K_START_ON_BOOT = "start_on_boot"

    // Long-press OK on the remote = cycle to the next layout/theme.
    // Default ON because the gesture is designed for masjid admins to
    // try out themes from across the room without a keyboard. Some
    // venues prefer to disable it (e.g. a kid keeps holding OK), so
    // we surface a toggle in Settings → Sistem.
    const val K_LONGPRESS_THEME = "longpress_theme"

    // License system: 1 code = 1 device. When is_pro is false the
    // WebView shows a "DEMO VERSION" watermark. Once the user enters
    // a valid code and Firebase confirms it, is_pro flips to true and
    // the watermark disappears.
    const val K_IS_PRO      = "is_pro"
    const val K_LICENSE_KEY = "license_key"

    fun prefs(ctx: Context): SharedPreferences =
        PreferenceManager.getDefaultSharedPreferences(ctx.applicationContext)

    /**
     * Apply sensible Indonesian defaults the first time the app launches.
     * Subsequent launches keep whatever the user set.
     */
    fun ensureDefaults(ctx: Context) {
        val p = prefs(ctx)

        // Migration: an older build (alarm-adzan PR) wrote
        // K_ADZAN_AUDIO_LOOPS as a String, but preferences.xml declares
        // the key as a SeekBarPreference which reads it via getInt().
        // On devices that ran the buggy build, opening Settings throws
        // ClassCastException ("String cannot be cast to Integer") the
        // moment the framework tries to inflate the slider. Detect any
        // String-typed value here and rewrite it as an Int so the next
        // Settings open succeeds.
        runCatching {
            val raw = p.all[K_ADZAN_AUDIO_LOOPS]
            if (raw is String) {
                val n = raw.toIntOrNull()?.coerceIn(1, 20) ?: 1
                p.edit().remove(K_ADZAN_AUDIO_LOOPS).apply()
                p.edit().putInt(K_ADZAN_AUDIO_LOOPS, n).apply()
            }
        }

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
            .putString(K_ADZAN_AUDIO_URL, "")
            .putInt(K_ADZAN_AUDIO_LOOPS, 1)
            .putBoolean(K_SHOW_ANALOG,   true)
            .putBoolean(K_SHOW_COUNTDOWN,true)
            .putString(K_LAYOUT,         "cinema")
            .putString(K_DIGITAL_STYLE,  "classic")
            .putBoolean(K_HIDE_SECONDS,  false)
            .putString(K_ANALOG_STYLE,   "classic")
            .putString(K_SLIDESHOW_URLS, "")
            .putString(K_SLIDE_DURATION, "8")
            .putInt(K_SLIDESHOW_OPACITY, 100)
            .putBoolean(K_SHOW_TICKER,   true)
            .putString(K_TICKER_TEXT,    "Selamat Datang di Masjid Muslim Clock | Jadwal Sholat Hari Ini")
            .putString(K_TICKER_SPEED,   "30")
            .putString(K_TICKER_STYLE,   "classic")
            .putString(K_TICKER_BG,      "solid_dark")
            .putBoolean(K_SHOW_QURAN,    true)
            .putString(K_QURAN_INTERVAL, "30")
            .putString(K_QURAN_MODE,     "fullcard")
            .putInt(K_QURAN_MARQUEE_SPEED, 50)
            .putBoolean(K_SHOW_IMAM,     true)
            .putString(K_IMAM_FAJR,      "")
            .putString(K_IMAM_DHUHR,     "")
            .putString(K_IMAM_ASR,       "")
            .putString(K_IMAM_MAGHRIB,   "")
            .putString(K_IMAM_ISHA,      "")
            .putString(K_IMAM_JUMAT,     "")
            .putString(K_KHATIB_JUMAT,   "")
            .putString(K_ADZAN_CONTENT_FAJR, "quran")
            .putString(K_ADZAN_TEXT_FAJR, "")
            .putString(K_ADZAN_CONTENT_DHUHR, "quran")
            .putString(K_ADZAN_TEXT_DHUHR, "")
            .putString(K_ADZAN_CONTENT_ASR, "quran")
            .putString(K_ADZAN_TEXT_ASR, "")
            .putString(K_ADZAN_CONTENT_MAGHRIB, "quran")
            .putString(K_ADZAN_TEXT_MAGHRIB, "")
            .putString(K_ADZAN_CONTENT_ISHA, "quran")
            .putString(K_ADZAN_TEXT_ISHA, "")
            .putInt(K_ANALOG_SIZE,    100)
            .putInt(K_ANALOG_X_PCT,   0)
            .putInt(K_ANALOG_Y_PCT,   0)
            .putInt(K_DIGITAL_SIZE,   100)
            .putInt(K_DIGITAL_X_PCT,  0)
            .putInt(K_DIGITAL_Y_PCT,  0)
            .putInt(K_PRAYERS_SIZE,   100)
            .putInt(K_PRAYERS_X_PCT,  0)
            .putInt(K_PRAYERS_Y_PCT,  0)
            .putInt(K_QURAN_SIZE,     100)
            .putInt(K_QURAN_X_PCT,    0)
            .putInt(K_QURAN_Y_PCT,    0)
            .putInt(K_DATE_SIZE,      100)
            .putInt(K_DATE_X_PCT,     0)
            .putInt(K_DATE_Y_PCT,     0)
            .putInt(K_NEXT_SIZE,      100)
            .putInt(K_NEXT_X_PCT,     0)
            .putInt(K_NEXT_Y_PCT,     0)
            .putInt(K_LOGO_SIZE,      100)
            .putInt(K_IDENTITY_SIZE,  100)
            .putString(K_IDENTITY_POSITION, "left")
            .putInt(K_IDENTITY_X_PCT, 0)
            .putInt(K_IDENTITY_Y_PCT, 0)
            .putString(K_LOGO_POSITION, "right")
            .putString(K_DATE_POSITION, "auto")
            .putBoolean(K_START_ON_BOOT, true)
            .putBoolean(K_LONGPRESS_THEME, true)
            .putBoolean(K_IS_PRO, false)
            .putString(K_LICENSE_KEY, "")
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
            put("adzan_audio_url",   str(K_ADZAN_AUDIO_URL, ""))
            // Loops are clamped to a sane band: at minimum once (you
            // wouldn't pick an alarm sound to never play it), at most
            // 20 — a 5-min clip × 20 = ~100 minutes, well past the
            // adzan window even at the longest practical setting.
            put("adzan_audio_loops", p.getInt(K_ADZAN_AUDIO_LOOPS, 1).coerceIn(1, 20))
            put("show_analog",     p.getBoolean(K_SHOW_ANALOG,    true))
            put("show_countdown",  p.getBoolean(K_SHOW_COUNTDOWN, true))
            put("layout",          str(K_LAYOUT,                  "cinema"))
            put("digital_style",   str(K_DIGITAL_STYLE,           "classic"))
            put("hide_seconds",    p.getBoolean(K_HIDE_SECONDS,   false))
            put("analog_style",    str(K_ANALOG_STYLE,            "classic"))
            put("slideshow_urls",  str(K_SLIDESHOW_URLS,          ""))
            put("slide_duration",  int(K_SLIDE_DURATION,           8))
            put("slideshow_opacity", p.getInt(K_SLIDESHOW_OPACITY, 100).coerceIn(0, 100))
            put("show_ticker",     p.getBoolean(K_SHOW_TICKER,    true))
            put("ticker_text",     str(K_TICKER_TEXT,             "Selamat Datang di Masjid Muslim Clock | Jadwal Sholat Hari Ini"))
            put("ticker_speed",    int(K_TICKER_SPEED,            30))
            put("ticker_style",    str(K_TICKER_STYLE,            "classic"))
            put("ticker_bg",       str(K_TICKER_BG,               "solid_dark"))
            put("show_quran",      p.getBoolean(K_SHOW_QURAN,    true))
            put("quran_interval",  int(K_QURAN_INTERVAL,          30))
            put("quran_mode",      str(K_QURAN_MODE,              "fullcard"))
            put("quran_marquee_speed", p.getInt(K_QURAN_MARQUEE_SPEED, 50).coerceIn(10, 300))
            // Imam schedule. The web side reads these to label the adzan
            // overlay with the responsible imam (and Jum'at khatib).
            put("show_imam",       p.getBoolean(K_SHOW_IMAM, true))
            put("imam_fajr",       str(K_IMAM_FAJR,        ""))
            put("imam_dhuhr",      str(K_IMAM_DHUHR,       ""))
            put("imam_asr",        str(K_IMAM_ASR,         ""))
            put("imam_maghrib",    str(K_IMAM_MAGHRIB,     ""))
            put("imam_isha",       str(K_IMAM_ISHA,        ""))
            put("imam_jumat",      str(K_IMAM_JUMAT,       ""))
            put("khatib_jumat",    str(K_KHATIB_JUMAT,     ""))
            // Per-prayer overlay content
            put("adzan_content_fajr",    str(K_ADZAN_CONTENT_FAJR,    "quran"))
            put("adzan_text_fajr",       str(K_ADZAN_TEXT_FAJR,       ""))
            put("adzan_content_dhuhr",   str(K_ADZAN_CONTENT_DHUHR,   "quran"))
            put("adzan_text_dhuhr",      str(K_ADZAN_TEXT_DHUHR,      ""))
            put("adzan_content_asr",     str(K_ADZAN_CONTENT_ASR,     "quran"))
            put("adzan_text_asr",        str(K_ADZAN_TEXT_ASR,        ""))
            put("adzan_content_maghrib", str(K_ADZAN_CONTENT_MAGHRIB, "quran"))
            put("adzan_text_maghrib",    str(K_ADZAN_TEXT_MAGHRIB,    ""))
            put("adzan_content_isha",    str(K_ADZAN_CONTENT_ISHA,    "quran"))
            put("adzan_text_isha",       str(K_ADZAN_TEXT_ISHA,       ""))
            // Layout editor — clamped server-side so a corrupted prefs
            // file can never force the JS into nonsense (e.g. negative size).
            put("analog_size",     p.getInt(K_ANALOG_SIZE,   100).coerceIn(50, 200))
            put("analog_x_pct",    p.getInt(K_ANALOG_X_PCT,  0).coerceIn(-50, 50))
            put("analog_y_pct",    p.getInt(K_ANALOG_Y_PCT,  0).coerceIn(-50, 50))
            put("digital_size",    p.getInt(K_DIGITAL_SIZE,  100).coerceIn(50, 200))
            put("digital_x_pct",   p.getInt(K_DIGITAL_X_PCT, 0).coerceIn(-50, 50))
            put("digital_y_pct",   p.getInt(K_DIGITAL_Y_PCT, 0).coerceIn(-50, 50))
            put("prayers_size",    p.getInt(K_PRAYERS_SIZE,  100).coerceIn(50, 200))
            put("prayers_x_pct",   p.getInt(K_PRAYERS_X_PCT, 0).coerceIn(-50, 50))
            put("prayers_y_pct",   p.getInt(K_PRAYERS_Y_PCT, 0).coerceIn(-50, 50))
            put("quran_size",      p.getInt(K_QURAN_SIZE,    100).coerceIn(50, 200))
            put("quran_x_pct",     p.getInt(K_QURAN_X_PCT,   0).coerceIn(-50, 50))
            put("quran_y_pct",     p.getInt(K_QURAN_Y_PCT,   0).coerceIn(-50, 50))
            put("date_size",       p.getInt(K_DATE_SIZE,     100).coerceIn(50, 200))
            put("date_x_pct",      p.getInt(K_DATE_X_PCT,    0).coerceIn(-50, 50))
            put("date_y_pct",      p.getInt(K_DATE_Y_PCT,    0).coerceIn(-50, 50))
            put("next_size",       p.getInt(K_NEXT_SIZE,     100).coerceIn(50, 200))
            put("next_x_pct",      p.getInt(K_NEXT_X_PCT,    0).coerceIn(-50, 50))
            put("next_y_pct",      p.getInt(K_NEXT_Y_PCT,    0).coerceIn(-50, 50))
            put("logo_size",       p.getInt(K_LOGO_SIZE,     100).coerceIn(50, 200))
            put("identity_size",   p.getInt(K_IDENTITY_SIZE, 100).coerceIn(50, 200))
            put("identity_position", str(K_IDENTITY_POSITION, "left"))
            put("identity_x_pct",  p.getInt(K_IDENTITY_X_PCT, 0).coerceIn(-50, 50))
            put("identity_y_pct",  p.getInt(K_IDENTITY_Y_PCT, 0).coerceIn(-50, 50))
            put("logo_position",   str(K_LOGO_POSITION, "right"))
            put("date_position", str(K_DATE_POSITION, "auto"))
            put("start_on_boot",   p.getBoolean(K_START_ON_BOOT, true))
            put("longpress_theme", p.getBoolean(K_LONGPRESS_THEME, true))
            put("is_pro",          p.getBoolean(K_IS_PRO, false))
            put("show_running",    p.getBoolean(K_SHOW_TICKER, true))
        }.toString()
    }
}
