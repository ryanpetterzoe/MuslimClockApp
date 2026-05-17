# HANDOFF — Muslim Clock Android App

> Dokumen ini berisi konteks lengkap untuk melanjutkan development di session
> Kiro baru. Cukup kirim: "Lanjutkan project di repo ryanpetterzoe/MuslimClockApp.
> Baca HANDOFF.md untuk konteks."

## Repo & Branch

- **Repo:** `ryanpetterzoe/MuslimClockApp`
- **Main branch:** `main`
- **Preference user:** setiap fix/fitur = branch baru = PR baru (jangan force-push ke PR existing)

## Arsitektur

- **Android Kotlin** (AGP 8.5.2, Kotlin 1.9.24, Gradle wrapper 8.7, compileSdk 34, minSdk 21)
- **WebView** memuat bundled web app dari `assets/web/` via `WebViewAssetLoader`
  - URL: `https://appassets.androidplatform.net/assets/web/index.html`
  - Slideshow images: `https://appassets.androidplatform.net/slides/<uuid>.ext`
- **Layout system:** 5 HTML `<template>` (minimal, mosque, cinema, neon, classic) di `index.html`, di-clone ke `#layoutHost` oleh `clock.js`
- **Config flow:** `Settings.kt` → `SharedPreferences` → `Settings.toJson()` → `MainActivity.pushConfigToWeb()` → JS `window.applyConfig(json)` → re-render tanpa reload
- **Bridge:** `WebAppBridge.kt` expose `MCAndroid.getConfig()` & `MCAndroid.openSettings()` ke JS
- **Prayer times:** Aladhan API `/v1/calendar/{year}/{month}`, cache bulanan di localStorage (32d TTL), pre-fetch bulan depan 5 hari sebelum akhir bulan
- **Slideshow:** URL list di config, crossfade 2 `.slide` div, pre-load via `Image()`, skip URL gagal
- **File picker:** `SlideStorage.kt` copy `content://` URI ke `filesDir/slides/`, serve via `InternalStoragePathHandler`

## File Penting

| File | Peran |
|---|---|
| `app/src/main/java/id/muslimclock/app/MainActivity.kt` | WebView host, immersive, WebViewAssetLoader, bridge |
| `app/src/main/java/id/muslimclock/app/Settings.kt` | SharedPreferences ↔ JSON config |
| `app/src/main/java/id/muslimclock/app/SettingsActivity.kt` | PreferenceFragment + file picker |
| `app/src/main/java/id/muslimclock/app/WebAppBridge.kt` | @JavascriptInterface |
| `app/src/main/java/id/muslimclock/app/SlideStorage.kt` | Import image dari URI ke private storage |
| `app/src/main/assets/web/index.html` | 5 layout templates + adzan overlay + analog template |
| `app/src/main/assets/web/js/clock.js` | Semua logika: mount layout, config, slideshow, prayer, adzan, analog, digital, hijri |
| `app/src/main/assets/web/css/screen.css` | Styles termasuk `.app-screen`, `.slide`, layout-specific |
| `app/src/main/res/xml/preferences.xml` | Settings UI definition |
| `app/src/main/res/values/strings.xml` | Label bahasa Indonesia |
| `app/src/main/res/values/arrays.xml` | Dropdown: calc method, timezone, layout |

## PR History (semua merged)

| # | Branch | Fitur |
|---|---|---|
| 1 | settings-native | Settings screen native + JS bridge |
| 3 | feat/monthly-calendar | Monthly Aladhan fetch + offline cache |
| 4 | feat/multi-layout | 5 layout (minimal, mosque, cinema, neon, classic) |
| 5 | feat/slideshow | Slideshow background URL list + crossfade |
| 6 | feat/file-picker | File picker galeri + WebViewAssetLoader migration |
| 8 | fix/viewport-clipped | Viewport fix: h-screen → app-screen + --app-vh JS |
| 21 | feat/quran-rotation-ticker-fix | Quran ayat rotation (single mode) + ticker fix |
| 23 | feat/quran-modes-and-fix | Fix show_quran toggle bug + 5 mode types (fullcard/card/typewriter/slide/marquee) |

## BUG MASIH OPEN

### Kartu sholat di bawah masih kepotong (bagian bawah layar)

**Screenshot:** kartu Subuh/Syuruq/Dzuhur/Ashar/Maghrib/Isya di layout `minimal` terpotong — hanya label terlihat, angka jam terpotong.

**Sudah dicoba (PR #8):**
- Ganti `h-screen` → `.app-screen` dengan `height: var(--app-vh)`
- JS update `--app-vh` dari `window.innerHeight` + `resize` event
- Native dispatch synthetic resize 350ms setelah immersive

**Belum dicoba / saran fix berikutnya:**
1. **Padding bottom safe-area:** Tambah `padding-bottom: env(safe-area-inset-bottom, 0)` di `.app-screen`
2. **Reduce content height:** Prayer section pakai `pb-8` (32px). Coba kurangi padding atau kecilkan font kartu
3. **Grid auto-fit:** Ganti grid-template-rows dari fixed `80px 1fr auto` → `minmax(60px, auto) 1fr minmax(0, auto)` agar section bawah shrink jika tidak cukup ruang
4. **Android side:** Coba tambah di theme `<item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>` (API 28+)
5. **Force WebView match_parent:** Pastikan WebView `setContentView` benar-benar full-screen tanpa padding dari Activity

**Device info yang perlu ditanyakan ke user:**
- Android version berapa?
- Ini di HP landscape atau Android TV?
- Ada navigation bar (soft keys) di bawah?

## Roadmap (belum dikerjakan)

| Prioritas | Item |
|---|---|
| 🔥 CRITICAL | Fix viewport clipping (bug di atas) |
| 🟡 P2 | Port 18 layout sisanya (aurora, galaxy, geometric, dll.) |
| 🟢 P3 | Running text custom (ticker di bawah layar) |
| 🟢 P3 | Rotasi ayat Al-Qur'an + terjemahan |
| 🟢 P3 | Jadwal imam mingguan |
| 🟢 P3 | Leanback Preferences (native TV look) |
| 🟢 P3 | Tailwind CSS statis (gantikan Play CDN) + signing config release |
| 🟢 P3 | Video slideshow support |

## Config Keys (Settings.kt ↔ preferences.xml ↔ clock.js)

```
masjid_name, masjid_address, masjid_logo,
location_lat, location_lng, timezone, calc_method,
theme_primary, theme_accent,
font_display, font_digital,
adzan_message, adzan_duration, iqomah_duration,
show_analog, show_countdown,
layout,
slideshow_urls, slide_duration,
show_ticker, ticker_text, ticker_speed,
show_quran, quran_interval, quran_mode
```

## Cara Build

```bash
git clone https://github.com/ryanpetterzoe/MuslimClockApp.git
cd MuslimClockApp
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
adb install app/build/outputs/apk/debug/app-debug.apk
```

## Catatan Teknis

- Tailwind Play CDN di-bundle lokal (`js/tailwind.js`, 398KB) — warning console normal
- Google Fonts (Inter, Orbitron, Amiri) loaded online, fallback graceful
- `allowFileAccess = false` — semua file serving via WebViewAssetLoader
- Aladhan API gratis, butuh internet 1× per bulan
- localStorage dipakai untuk: calendar cache, adzan trigger history
- Adzan overlay trigger: cek setiap detik, fire jika nowSec - targetSec ∈ [0, 60) dan belum triggered hari itu
