# Muslim Clock — Android (TV / Landscape)

Aplikasi Android (Android TV-ready, landscape) untuk menampilkan jadwal sholat,
jam digital + analog, hitung mundur, dan overlay adzan — **tanpa perlu hosting
server**. Versi ini adalah port dari project web
[`muslimclockweb`](https://github.com/ryanpetterzoe/muslimclockweb), dibungkus
sebagai WebView yang me-load aset HTML/CSS/JS yang di-bundle di dalam APK.

> **Status:** MVP + Settings native + 5 layout. Layout bisa diganti lewat
> Pengaturan (Tampilan → Tema Tampilan): minimal, mosque, cinema, neon,
> classic. Layout sisanya menyusul di PR berikutnya.

## Fitur MVP

- Jam digital besar + jam analog
- Tanggal Masehi & Hijriyah (lokal, via `Intl.DateTimeFormat`)
- 6 kartu jadwal sholat: Subuh, Syuruq, Dzuhur/Jum'at, Ashar, Maghrib, Isya
- Hitung mundur ke waktu sholat berikutnya
- Overlay adzan + iqomah otomatis ketika waktu tiba (durasi configurable)
- Caching jadwal di `localStorage` (6 jam) — tetap menampilkan data
  terakhir saat offline
- Fullscreen + immersive mode + keep-screen-on
- Mendukung Android TV (`LEANBACK_LAUNCHER`) maupun HP/tablet landscape

## Sumber data

- **Jadwal sholat:** [Aladhan API](https://aladhan.com/prayer-times-api),
  metode default `20` (Indonesia / KEMENAG). Aplikasi mengambil **kalender
  satu bulan penuh** sekaligus dari endpoint `v1/calendar/{tahun}/{bulan}`,
  cache di `localStorage` selama 32 hari, dan akan refetch otomatis tiap
  bulan baru. Pre-fetch bulan depan dimulai 5 hari sebelum akhir bulan agar
  rollover tengah malam mulus. Jadi: **butuh internet hanya 1× per bulan**;
  selebihnya app bekerja sepenuhnya offline.
- **Hijriyah:** dihitung di perangkat dengan `Intl.DateTimeFormat`
  (kalender `islamic-umalqura`).

## Build

Anda butuh Android SDK terinstal. Cara paling mudah lewat
[Android Studio](https://developer.android.com/studio) (Hedgehog atau lebih
baru).

```bash
# Clone
git clone https://github.com/ryanpetterzoe/MuslimClockApp.git
cd MuslimClockApp

# Build debug APK
./gradlew assembleDebug
# Output: app/build/outputs/apk/debug/app-debug.apk
```

Untuk build release (perlu signing config):

```bash
./gradlew assembleRelease
```

### Toolchain yang dipakai

- Android Gradle Plugin **8.5.2**
- Kotlin **1.9.24**
- Gradle wrapper **8.7**
- `compileSdk` 34, `minSdk` 21, `targetSdk` 34
- JDK 17 (jika lokal mesin Anda pakai JDK 21+, set `JAVA_HOME` ke 17 sebelum build)

## Install ke Android TV / device

### Lewat ADB (cara paling umum untuk Android TV)

1. Aktifkan **Developer Options** di Android TV
   (Settings → Device Preferences → About → tap "Build" 7×).
2. Aktifkan **USB debugging** dan/atau **Network debugging**.
3. Cari IP device Anda (Settings → Network).
4. Dari komputer:

```bash
adb connect <IP-tv>:5555
adb install app/build/outputs/apk/debug/app-debug.apk
```

5. Buka launcher Android TV — banner "Muslim Clock" akan muncul di baris aplikasi.

### Lewat sideload (file APK ke USB / Send Files to TV)

Salin `app-debug.apk` ke flashdisk atau gunakan aplikasi seperti
"Send Files to TV" lalu buka file untuk install. Pastikan
**Install from Unknown Sources** sudah diaktifkan di Android TV.

## Konfigurasi

Buka aplikasi → klik ikon **roda gigi** di pojok kanan atas, atau tekan tombol
**MENU** pada remote Android TV. Tersedia:

- **Masjid**: nama, alamat, URL logo (opsional)
- **Lokasi & Hisab**: latitude, longitude, zona waktu, metode hitung
  (KEMENAG / MWL / Karachi / dll. — sesuai daftar Aladhan)
- **Tampilan**: pilih tema layout (minimal/mosque/cinema/neon/classic),
  warna primary, warna accent, toggle jam analog &amp; countdown
- **Slideshow Background**: tombol **Tambah Gambar dari Galeri** (multi-pick
  dari storage Android — file dicopy ke penyimpanan privat aplikasi); juga
  bisa paste URL eksternal manual ke field "Daftar URL Gambar". Tombol
  **Hapus Semua Gambar Tersimpan** untuk membersihkan. Hanya berlaku di
  layout `minimal` &amp; `cinema`.
- **Adzan & Iqomah**: pesan, durasi (detik)

Setting tersimpan di `SharedPreferences` lokal dan otomatis aktif saat kembali
ke layar utama (tema/teks live, jadwal di-fetch ulang jika lokasi berubah).

## Hotkey saat aplikasi berjalan

| Tombol | Fungsi |
|---|---|
| `MENU` (remote TV) / ikon roda gigi | Buka layar Pengaturan |
| `T` | Trigger overlay adzan untuk testing |
| `Esc` | Tutup overlay adzan |
| Double-click / D-Pad center | (di dalam WebView) memicu retry autoplay video |

## Arsitektur singkat

```
app/src/main/
├── AndroidManifest.xml          # Leanback launcher, landscape, fullscreen
├── java/id/muslimclock/app/
│   └── MainActivity.kt          # WebView host, immersive mode, keep-screen-on
├── res/                         # icons, theme, strings
└── assets/web/                  # bundled web app (loaded via file:///android_asset/)
    ├── index.html               # layout minimal, MC_CONFIG
    ├── css/screen.css           # ported from muslimclockweb
    ├── img/default-bg.svg
    └── js/
        ├── tailwind.js          # Tailwind Play CDN bundled offline
        └── clock.js             # ported & adapted (Aladhan direct, no PHP proxy)
```

## Roadmap (tidak di MVP)

- ~~Settings screen native Android~~ ✅ done
- ~~5 layout populer (minimal, mosque, cinema, neon, classic)~~ ✅ done
- ~~Slideshow background (URL list, fade transition)~~ ✅ done
- ~~File picker storage Android (multi-pick gambar dari galeri)~~ ✅ done
- Port 18 layout sisanya (aurora, festival, frame, galaxy, geometric, kinetic,
  magazine, marble, polaroid, portrait, showcase, split, stadium, sunset,
  terminal, theater, window, compact)
- Running text custom
- Rotasi ayat Al-Qur'an + terjemahan
- Jadwal imam mingguan
- Skin Android TV native untuk Settings (Leanback Preferences)

## Lisensi & atribusi

- Project asal: `muslimclockweb` (PHP web app).
- Jadwal sholat: [Aladhan API](https://aladhan.com/) — gratis, butuh atribusi.
- Tailwind CSS via Play CDN (di-bundle, untuk produksi sebenarnya disarankan
  build CSS statis dengan Tailwind CLI).
- Font: Inter, Orbitron, Amiri (Google Fonts).
