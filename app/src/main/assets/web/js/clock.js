/* Muslim Clock — Android WebView build
 *
 * Config sources, in priority order:
 *   1. native bridge `MCAndroid.getConfig()` (when running inside the app)
 *   2. window.MC_CONFIG (defined in index.html — used outside Android)
 *   3. hardcoded defaults below
 *
 * The native side calls window.applyConfig(json) whenever Settings change,
 * so theme/text update live and prayer times re-fetch if location changed.
 *
 * Layouts are HTML <template>s in index.html. We clone the chosen one into
 * #layoutHost on init and again whenever the layout setting changes.
 */
(function () {
    'use strict';

    const $  = (s, p = document) => p.querySelector(s);
    const pad = (n) => String(n).padStart(2, '0');

    const DEFAULTS = {
        masjid_name: 'Masjid Muslim Clock',
        masjid_address: 'Jakarta, Indonesia',
        masjid_logo: '',
        location_lat: -6.2,
        location_lng: 106.816666,
        timezone: 'Asia/Jakarta',
        calc_method: 20,
        theme_primary: '#0a4ea3',
        theme_accent: '#f5b301',
        font_display: 'Inter',
        font_digital: 'Orbitron',
        adzan_message: 'Saatnya Waktu Sholat',
        adzan_duration: 600,
        iqomah_duration: 600,
        // Adzan alarm audio. Empty URL = silent (visual overlay only).
        // Loops controls how many full plays to chain — 1 = once, 2+ = repeat.
        adzan_audio_url: '',
        adzan_audio_loops: 1,
        show_analog: true,
        show_countdown: true,
        layout: 'minimal',
        slideshow_urls: '',     // newline / comma separated. Empty = default bg.
        slide_duration: 8,      // seconds per slide
        slideshow_opacity: 100, // 0..100 — visual intensity of the slideshow background (default: full)
        show_ticker: true,
        ticker_text: 'Selamat Datang di Masjid Muslim Clock | Jadwal Sholat Hari Ini',
        ticker_speed: 30,       // seconds for one full scroll cycle
        show_quran: true,
        quran_interval: 30,     // seconds between ayat rotation
        quran_mode: 'fullcard', // fullcard | card | typewriter | slide | marquee
        quran_marquee_speed: 50, // seconds per full marquee loop (longer = slower)
        show_gear: true,        // gear icon always visible (very faint until focused)
        // Imam schedule: per-prayer name, plus Jum'at-specific imam & khatib.
        // Empty strings ⇒ row hidden in the adzan overlay.
        show_imam: true,
        imam_fajr: '',
        imam_dhuhr: '',
        imam_asr: '',
        imam_maghrib: '',
        imam_isha: '',
        imam_jumat: '',
        khatib_jumat: '',
        // Layout editor — defaults match Settings.kt. 100% size = use the
        // layout's natural dimensions; 0% offset = no translation.
        analog_size:  100, analog_x_pct:  0, analog_y_pct:  0,
        digital_size: 100, digital_x_pct: 0, digital_y_pct: 0,
        prayers_size: 100, prayers_x_pct: 0, prayers_y_pct: 0,
        quran_size:   100, quran_x_pct:   0, quran_y_pct:   0,
    };

    const PRAYER_LABEL_ID = {
        fajr: 'Subuh', dhuhr: 'Dzuhur', asr: 'Ashar',
        maghrib: 'Maghrib', isha: 'Isya'
    };

    const HIJRI_MONTHS_ID = [
        'Muharram', 'Safar', "Rabi'ul Awal", "Rabi'ul Akhir",
        'Jumadil Awal', 'Jumadil Akhir', 'Rajab', "Sya'ban",
        'Ramadhan', 'Syawal', "Dzulqa'dah", 'Dzulhijjah'
    ];
    const HIJRI_MAP = {
        muharram: 0, safar: 1,
        rabiulawal: 2, rabi_iawal: 2, rabi_iawwal: 2,
        rabiulakhir: 3, rabi_iiakhir: 3, rabi_iithani: 3,
        jumadalula: 4, jumadaawal: 4, jumadiawal: 4,
        jumadalakhir: 5, jumadaakhir: 5, jumadithani: 5,
        rajab: 6,
        shaban: 7, syaban: 7,
        ramadan: 8, ramadhan: 8,
        shawwal: 9, syawal: 9,
        dhualqadah: 10, dzulqadah: 10, zulkaedah: 10,
        dhualhijjah: 11, dzulhijjah: 11, zulhijah: 11,
    };

    const SUPPORTED_LAYOUTS = [
        'minimal', 'mosque', 'cinema', 'neon', 'classic',
        'aurora', 'frame', 'stadium', 'magazine',
        'theater', 'showcase', 'split', 'polaroid',
        'window', 'festival', 'portrait',
        'galaxy', 'geometric', 'kinetic', 'marble', 'terminal', 'sunset',
        'glass', 'newspaper', 'brutalist', 'heritage', 'mono', 'sunrise',
        'arabesque', 'royal', 'calligraphy', 'jade', 'ottoman',
        'celestial', 'rumi', 'andalusia', 'medina', 'batik'
    ];

    /* ===== State (mutable) ===== */
    const state = {
        cfg: Object.assign({}, DEFAULTS, window.MC_CONFIG || {}),
        times: {},
        adzanActive: false,
        iqomahActive: false,
        mountedLayout: null,
        slideshow: { timer: null, idx: 0, urls: [], slots: [] },
    };

    function loadFromBridge() {
        try {
            if (window.MCAndroid && typeof window.MCAndroid.getConfig === 'function') {
                const raw = window.MCAndroid.getConfig();
                if (raw) {
                    state.cfg = Object.assign({}, DEFAULTS, JSON.parse(raw));
                }
            }
        } catch (e) {
            console.warn('Bridge getConfig failed:', e);
        }
    }

    /* ===== Layout mount =====
     *
     * Clones <template id="layout-{name}"> into #layoutHost. Used both at
     * initial render and when the user picks a different layout in Settings.
     * Falls back to `minimal` for unknown values to keep the screen alive.
     */
    function mountLayout(name) {
        const host = $('#layoutHost');
        if (!host) return false;
        const safe = SUPPORTED_LAYOUTS.includes(name) ? name : 'minimal';
        const tmpl = document.getElementById('layout-' + safe);
        if (!tmpl) {
            console.warn('Layout template missing:', safe);
            return false;
        }
        host.innerHTML = '';
        host.appendChild(tmpl.content.cloneNode(true));
        state.mountedLayout = safe;
        // Inject the analog SVG into every [data-analog] slot the layout has.
        const analogTmpl = document.getElementById('tmpl-analog');
        if (analogTmpl) {
            host.querySelectorAll('[data-analog]').forEach(slot => {
                slot.innerHTML = '';
                slot.appendChild(analogTmpl.content.cloneNode(true));
            });
        }
        // Make sure every layout has a .slideshow-host slot — even the
        // ones whose templates don't declare one — so the user's
        // slideshow is visible across all themes.
        ensureSlideshowHost(host);
        buildAnalogStatic();   // populate ticks/numerals on the freshly cloned SVG
        return true;
    }

    /**
     * Inject a `<div class="slideshow-host">` (plus a darkening scrim)
     * as the first children of the active layout root, but only when
     * the template didn't already supply one. Idempotent.
     *
     * Why first children: existing decorative absolute divs (blurs,
     * gradients, patterns) and the actual content (header / main /
     * section with `relative z-10`) all paint above us, which is
     * exactly the layered look we want — slideshow at the bottom,
     * decoration in the middle, content on top.
     *
     * Magazine is a light-theme layout. Stacking dark scrim + light
     * text below would render invisible captions, so we use a light
     * scrim there instead. Same goes for any future light layouts.
     */
    function ensureSlideshowHost(host) {
        const root = host.firstElementChild;
        if (!root || !root.classList) return;
        // Some layouts (e.g. cinema) declare their own .slideshow-host
        // *nested* inside a subsection rather than as a direct child of
        // the layout root. We must detect any descendant — otherwise
        // the auto-injected wrapper covers the whole screen and breaks
        // multi-column designs like cinema.
        if (root.querySelector('.slideshow-host')) return;

        // Pick a scrim that keeps text contrast working on the layout's
        // existing colour scheme. The dark variant is the right choice
        // for almost every theme; the light one is for layouts that
        // use dark text on a pale background (e.g. layout-magazine).
        const lightThemes = ['layout-magazine'];
        const isLight = lightThemes.some(c => root.classList.contains(c));

        const slot = document.createElement('div');
        slot.className = 'slideshow-host absolute inset-0';

        const scrim = document.createElement('div');
        scrim.className = 'absolute inset-0';
        scrim.style.pointerEvents = 'none';
        scrim.style.background = isLight
            ? 'linear-gradient(180deg,rgba(250,249,246,0.55) 0%,rgba(250,249,246,0.82) 100%)'
            : 'linear-gradient(180deg,rgba(0,0,0,0.40) 0%,rgba(0,0,0,0.72) 100%)';

        // Insert in reverse so we end up with [slot, scrim, ...rest].
        root.insertBefore(scrim, root.firstChild);
        root.insertBefore(slot,  root.firstChild);
    }

    /* ===== Apply config to DOM ===== */
    function applyConfigToDom() {
        const cfg = state.cfg;

        // CSS custom properties
        if (cfg.theme_primary) {
            document.documentElement.style.setProperty('--primary', cfg.theme_primary);
            document.documentElement.style.setProperty(
                '--primary-dark', `color-mix(in srgb, ${cfg.theme_primary} 60%, black)`);
            document.documentElement.style.setProperty(
                '--primary-light', `color-mix(in srgb, ${cfg.theme_primary} 80%, white)`);
        }
        if (cfg.theme_accent) {
            document.documentElement.style.setProperty('--accent', cfg.theme_accent);
            document.documentElement.style.setProperty(
                '--accent-shadow', `color-mix(in srgb, ${cfg.theme_accent} 40%, transparent)`);
        }

        // Slideshow visual intensity. The user picks 0..100% in Settings;
        // we map it to the --slide-opacity CSS var that .slide.active reads,
        // so a faded slideshow doesn't fight with the foreground content.
        const op = Math.max(0, Math.min(100, parseInt(cfg.slideshow_opacity, 10)));
        const opVal = Number.isFinite(op) ? op : 100;
        document.documentElement.style.setProperty('--slide-opacity', String(opVal / 100));

        // Masjid name + address
        const name = cfg.masjid_name || 'Masjid';
        const namePrefixEl = $('#masjidPrefix');
        const nameEl = $('#masjidName');
        if (nameEl) {
            if (namePrefixEl && /^Masjid\s+/i.test(name) && namePrefixEl.style.display !== 'none') {
                namePrefixEl.textContent = 'Masjid';
                nameEl.textContent = name.replace(/^Masjid\s+/i, '');
            } else {
                if (namePrefixEl && namePrefixEl.style.display !== 'none') {
                    namePrefixEl.textContent = '';
                }
                nameEl.textContent = name;
            }
        }
        const addrEl = $('#masjidAddress');
        if (addrEl) addrEl.textContent = cfg.masjid_address || '';

        // Logo. When the user provides one, the request is "show what
        // I uploaded, exactly as I uploaded it" — so we strip the
        // decorative chrome from #logoBox (background colour, rounded
        // corners, shadow, border) and let the image render as-is,
        // transparency and all.
        const box = $('#logoBox');
        if (box) {
            const desired = cfg.masjid_logo || '';
            if (box.dataset.logoSrc !== desired) {
                box.dataset.logoSrc = desired;
                if (desired) {
                    // Capture a definite pixel size before we wipe the
                    // styles — some layouts (mosque, classic) put the
                    // size on the inline SVG instead of the box, so
                    // offsetWidth/Height on the empty box can be 0.
                    const cs = getComputedStyle(box);
                    const measured = Math.max(
                        box.offsetWidth || 0,
                        box.offsetHeight || 0,
                        parseFloat(cs.width)  || 0,
                        parseFloat(cs.height) || 0
                    );
                    const size = measured > 0 ? measured : 48;

                    box.style.background    = 'transparent';
                    box.style.backgroundColor = 'transparent';
                    box.style.boxShadow     = 'none';
                    box.style.border        = 'none';
                    box.style.padding       = '0';
                    box.style.borderRadius  = '0';
                    box.style.width         = size + 'px';
                    box.style.height        = size + 'px';

                    const img = document.createElement('img');
                    img.src = desired;
                    img.alt = 'logo';
                    img.draggable = false;
                    img.style.width        = '100%';
                    img.style.height       = '100%';
                    img.style.objectFit    = 'contain';
                    img.style.background   = 'transparent';
                    img.style.borderRadius = '0';
                    img.onerror = () => {
                        // Image failed to load — drop the marker so the
                        // next config push can retry, and leave the box
                        // empty (better a blank gap than a broken-image
                        // glyph next to "Masjid Al-Hidayah").
                        box.removeAttribute('data-logo-src');
                        box.replaceChildren();
                    };
                    box.replaceChildren(img);
                }
                // If `desired` is empty we deliberately leave whatever
                // the layout template provided in place (the default
                // crescent/star). We don't try to undo the strip-styles
                // path because, having gone down it, the template's
                // original chrome is already gone for this DOM node;
                // the template gets re-cloned cleanly on the next
                // layout switch.
            }
        }

        // Friday label
        if (new Date().getDay() === 5) {
            const dl = $('#dhuhrLabel');
            if (dl) dl.textContent = "Jum'at";
        }

        // Body data-* attrs (used by adzan overlay countdown)
        document.body.dataset.adzanMsg     = cfg.adzan_message || 'Saatnya Waktu Sholat';
        document.body.dataset.adzanDur     = String(cfg.adzan_duration || 600);
        document.body.dataset.iqomahDur    = String(cfg.iqomah_duration || 600);
        document.body.dataset.adzanAudio   = cfg.adzan_audio_url || '';
        document.body.dataset.adzanLoops   = String(
            Math.max(1, Math.min(20, parseInt(cfg.adzan_audio_loops, 10) || 1))
        );
        document.body.dataset.showAnalog   = cfg.show_analog    ? '1' : '0';
        document.body.dataset.showCountdown= cfg.show_countdown ? '1' : '0';

        // Toggle modules — these IDs may or may not exist in any given layout.
        const a = $('#analogWrap'); if (a) a.style.display = cfg.show_analog    ? '' : 'none';
        const p = $('#nextPill');   if (p) p.style.display = cfg.show_countdown ? '' : 'none';

        const ovMsg = $('#ovMsg');
        if (ovMsg) ovMsg.textContent = cfg.adzan_message || 'Saatnya Waktu Sholat';

        // Floating gear button — always visible when bridge is available.
        // Rendered very faintly (CSS handles opacity) so it doesn't
        // distract from the clock display, but becomes fully visible
        // when the user hovers / focuses / taps near it.
        const gear = $('#gearBtn');
        if (gear) {
            const bridgeOk = !!(window.MCAndroid && window.MCAndroid.openSettings);
            gear.style.display = bridgeOk ? '' : 'none';
        }

        // Ticker (running text)
        applyTicker();

        // Quran ayat rotation
        applyQuran();

        // Per-element resize / translate via Settings → Editor Tata Letak.
        applyLayoutEditor();

        // Font selection — load the chosen Google Font on demand and
        // apply it via CSS custom properties.
        applyFonts();
    }

    /**
     * Public API: native code calls this when settings change so we can
     * re-render and re-fetch without a page reload.
     */
    window.applyConfig = function (newCfg) {
        const prev = state.cfg;
        state.cfg = Object.assign({}, DEFAULTS, newCfg || {});

        // Remount if layout changed (or wasn't mounted yet).
        const wantedLayout = state.cfg.layout || 'minimal';
        if (state.mountedLayout !== wantedLayout) {
            mountLayout(wantedLayout);
        }

        applyConfigToDom();
        renderTimes();   // refresh card values for new DOM nodes
        applySlideshow();

        // If the adzan overlay is currently visible, refresh its imam
        // line so the user sees the latest config without waiting for
        // the next prayer.
        if (state.adzanActive || state.iqomahActive) {
            const cur = document.getElementById('ovPrayer');
            const txt = (cur && cur.textContent || '').toLowerCase();
            const map = { subuh: 'fajr', dzuhur: 'dhuhr', "jum'at": 'dhuhr',
                          ashar: 'asr', maghrib: 'maghrib', isya: 'isha' };
            const k = map[txt] || null;
            if (k) applyImamToOverlay(k);
        }

        const locChanged =
            prev.location_lat  !== state.cfg.location_lat  ||
            prev.location_lng  !== state.cfg.location_lng  ||
            prev.calc_method   !== state.cfg.calc_method   ||
            prev.timezone      !== state.cfg.timezone;
        if (locChanged) {
            state.times = {};
            renderTimes();
            loadPrayerTimes();
        }
    };

    /* ===== Ticker (running text) ===== */
    function applyTicker() {
        const cfg = state.cfg;
        const bar = $('#tickerBar');
        if (!bar) return;

        const show = cfg.show_ticker !== false && cfg.show_running !== false;
        const text = cfg.ticker_text || '';

        if (!show || !text.trim()) {
            bar.style.display = 'none';
            // Remove bottom padding when ticker hidden
            document.documentElement.style.setProperty('--ticker-h', '0px');
            return;
        }

        bar.style.display = '';
        // Reserve space at the bottom so layouts don't get clipped by the ticker
        document.documentElement.style.setProperty('--ticker-h', '32px');

        const content = $('#tickerContent');
        if (content) {
            // Replace | separator with spacing for visual separation
            const formatted = text.split('|').map(s => s.trim()).filter(Boolean).join('      ●      ');
            content.textContent = formatted;

            // Set animation speed
            const speed = Math.max(5, parseInt(cfg.ticker_speed, 10) || 30);
            content.style.animationDuration = speed + 's';
        }
    }

    /* ===== Quran rotation =====
     * Displays a random ayat (Arabic + Indonesian translation) that
     * rotates every cfg.quran_interval seconds. Uses a bundled list
     * of short surahs for offline capability.
     */
    const QURAN_AYAT = [
        { surah: 'Al-Fatihah', ayat: 1, arab: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ', trans: 'Dengan nama Allah Yang Maha Pengasih, Maha Penyayang.' },
        { surah: 'Al-Fatihah', ayat: 2, arab: 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ', trans: 'Segala puji bagi Allah, Tuhan seluruh alam.' },
        { surah: 'Al-Ikhlas', ayat: 1, arab: 'قُلْ هُوَ اللَّهُ أَحَدٌ', trans: 'Katakanlah (Muhammad), "Dialah Allah, Yang Maha Esa."' },
        { surah: 'Al-Ikhlas', ayat: 2, arab: 'اللَّهُ الصَّمَدُ', trans: 'Allah tempat meminta segala sesuatu.' },
        { surah: 'Al-Ikhlas', ayat: 3, arab: 'لَمْ يَلِدْ وَلَمْ يُولَدْ', trans: 'Dia tidak beranak dan tidak pula diperanakkan.' },
        { surah: 'Al-Ikhlas', ayat: 4, arab: 'وَلَمْ يَكُنْ لَهُ كُفُوًا أَحَدٌ', trans: 'Dan tidak ada sesuatu yang setara dengan Dia.' },
        { surah: 'Al-Falaq', ayat: 1, arab: 'قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ', trans: 'Katakanlah, "Aku berlindung kepada Tuhan yang menguasai subuh."' },
        { surah: 'An-Nas', ayat: 1, arab: 'قُلْ أَعُوذُ بِرَبِّ النَّاسِ', trans: 'Katakanlah, "Aku berlindung kepada Tuhannya manusia."' },
        { surah: 'Al-Asr', ayat: 1, arab: 'وَالْعَصْرِ', trans: 'Demi masa.' },
        { surah: 'Al-Asr', ayat: 2, arab: 'إِنَّ الْإِنْسَانَ لَفِي خُسْرٍ', trans: 'Sungguh, manusia berada dalam kerugian.' },
        { surah: 'Al-Asr', ayat: 3, arab: 'إِلَّا الَّذِينَ آمَنُوا وَعَمِلُوا الصَّالِحَاتِ وَتَوَاصَوْا بِالْحَقِّ وَتَوَاصَوْا بِالصَّبْرِ', trans: 'Kecuali orang-orang yang beriman dan mengerjakan kebajikan serta saling menasihati untuk kebenaran dan saling menasihati untuk kesabaran.' },
        { surah: 'Al-Kawthar', ayat: 1, arab: 'إِنَّا أَعْطَيْنَاكَ الْكَوْثَرَ', trans: 'Sungguh, Kami telah memberimu (Muhammad) nikmat yang banyak.' },
        { surah: 'Al-Kawthar', ayat: 2, arab: 'فَصَلِّ لِرَبِّكَ وَانْحَرْ', trans: 'Maka laksanakanlah salat karena Tuhanmu, dan berkurbanlah.' },
        { surah: 'Al-Fil', ayat: 1, arab: 'أَلَمْ تَرَ كَيْفَ فَعَلَ رَبُّكَ بِأَصْحَابِ الْفِيلِ', trans: 'Tidakkah engkau (Muhammad) perhatikan bagaimana Tuhanmu telah bertindak terhadap pasukan bergajah?' },
        { surah: 'Al-Baqarah', ayat: 286, arab: 'لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا', trans: 'Allah tidak membebani seseorang melainkan sesuai dengan kesanggupannya.' },
        { surah: 'Ali Imran', ayat: 139, arab: 'وَلَا تَهِنُوا وَلَا تَحْزَنُوا وَأَنْتُمُ الْأَعْلَوْنَ إِنْ كُنْتُمْ مُؤْمِنِينَ', trans: 'Dan janganlah kamu merasa lemah, dan jangan pula bersedih hati, sebab kamu paling tinggi derajatnya, jika kamu orang beriman.' },
        { surah: 'Ar-Rahman', ayat: 13, arab: 'فَبِأَيِّ آلَاءِ رَبِّكُمَا تُكَذِّبَانِ', trans: 'Maka nikmat Tuhanmu yang manakah yang kamu dustakan?' },
        { surah: 'Al-Insyirah', ayat: 5, arab: 'فَإِنَّ مَعَ الْعُسْرِ يُسْرًا', trans: 'Maka sesungguhnya bersama kesulitan ada kemudahan.' },
        { surah: 'Al-Insyirah', ayat: 6, arab: 'إِنَّ مَعَ الْعُسْرِ يُسْرًا', trans: 'Sesungguhnya bersama kesulitan ada kemudahan.' },
        { surah: 'Ibrahim', ayat: 7, arab: 'لَئِنْ شَكَرْتُمْ لَأَزِيدَنَّكُمْ', trans: 'Jika kamu bersyukur, niscaya Aku akan menambah (nikmat) kepadamu.' },
    ];

    let quranTimer = null;
    let quranTypingTimer = null;
    let quranIdx = Math.floor(Math.random() * QURAN_AYAT.length);
    let quranBuilt = '';        // last-built mode signature

    const QURAN_MODES = ['fullcard', 'card', 'typewriter', 'slide', 'marquee'];

    function clearQuranTimers() {
        if (quranTimer)       { clearInterval(quranTimer);     quranTimer = null; }
        if (quranTypingTimer) { clearInterval(quranTypingTimer); quranTypingTimer = null; }
    }

    function applyQuran() {
        const cfg = state.cfg;
        const bar = document.getElementById('quranBar');
        const inner = document.getElementById('quranInner');
        if (!bar || !inner) return;

        const show = cfg.show_quran === true;
        if (!show) {
            bar.style.display = 'none';
            clearQuranTimers();
            // Release reserved space so layouts re-flow.
            document.documentElement.style.setProperty('--quran-h', '0px');
            return;
        }

        const mode = QURAN_MODES.includes(cfg.quran_mode) ? cfg.quran_mode : 'fullcard';
        bar.style.display = '';

        // (Re)build the inner DOM whenever the mode changes. Avoid rebuild
        // when nothing structural changed so animations don't restart on
        // every config push.
        if (bar.dataset.mode !== mode || !quranBuilt) {
            bar.dataset.mode = mode;
            inner.innerHTML = buildQuranInner(mode);
            quranBuilt = mode;
        }

        clearQuranTimers();

        // Render the first ayat for this mode immediately.
        showNextAyat(true);

        // Reserve room at the bottom so prayer cards never overlap.
        // Measure after layout settles. ResizeObserver also keeps it
        // accurate if the host rotates / fonts load late.
        reserveQuranSpace(bar);

        // Marquee rotates at its own animation speed; the ayat itself
        // doesn't rotate per-interval (the whole list scrolls in one loop).
        if (mode === 'marquee') return;

        const interval = Math.max(10, parseInt(cfg.quran_interval, 10) || 30) * 1000;
        quranTimer = setInterval(() => showNextAyat(false), interval);
    }

    function buildQuranInner(mode) {
        if (mode === 'marquee') {
            // The track is filled live in renderMarquee() because we want
            // every ayat in a single pass, joined by a separator.
            return `<div class="q-marquee"><div class="q-marquee-track"></div></div>`;
        }
        // All card-style modes share the same skeleton.
        return `
            <div class="q-card${mode === 'slide' ? ' q-enter' : ''}">
                <div class="q-arab"></div>
                <div class="q-trans"></div>
                <div class="q-ref"></div>
            </div>
        `;
    }

    function reserveQuranSpace(bar) {
        // Defer one frame so the new DOM has measurable height.
        requestAnimationFrame(() => {
            const h = bar.getBoundingClientRect().height || 0;
            document.documentElement.style.setProperty('--quran-h', Math.ceil(h) + 'px');
        });
    }

    function showNextAyat(initial) {
        const mode = state.cfg.quran_mode || 'fullcard';

        if (mode === 'marquee') {
            renderMarquee();
            return;
        }

        if (initial) {
            // Pick a fresh starting index every (re)build so users don't
            // see the same ayat after toggling settings.
            quranIdx = Math.floor(Math.random() * QURAN_AYAT.length);
        } else {
            quranIdx = (quranIdx + 1) % QURAN_AYAT.length;
        }
        const ayat = QURAN_AYAT[quranIdx];

        switch (mode) {
            case 'typewriter': renderTypewriter(ayat); break;
            case 'slide':      renderSlide(ayat);      break;
            case 'fullcard':   renderFullCard(ayat);   break;
            case 'card':
            default:           renderCard(ayat);       break;
        }
    }

    function setAyatText(ayat) {
        const arabEl  = document.querySelector('#quranBar .q-arab');
        const transEl = document.querySelector('#quranBar .q-trans');
        const refEl   = document.querySelector('#quranBar .q-ref');
        if (arabEl)  arabEl.textContent  = ayat.arab;
        if (transEl) transEl.textContent = ayat.trans;
        if (refEl)   refEl.textContent   = `— QS. ${ayat.surah}: ${ayat.ayat}`;
    }

    function renderCard(ayat) {
        setAyatText(ayat);
        reserveQuranSpace(document.getElementById('quranBar'));
    }

    function renderFullCard(ayat) {
        setAyatText(ayat);
        const arabEl  = document.querySelector('#quranBar .q-arab');
        const transEl = document.querySelector('#quranBar .q-trans');
        // Auto-fit guard: shrink font-size step by step until both lines
        // fit inside the 2-line clamp box (no truncation visible).
        autoFitToTwoLines(arabEl,  14);
        autoFitToTwoLines(transEl, 10);
        reserveQuranSpace(document.getElementById('quranBar'));
    }

    function autoFitToTwoLines(el, minPx) {
        if (!el) return;
        // Reset any previous adjustment so reflow uses CSS-defined size first.
        el.style.fontSize = '';
        // Measure: lineHeight*2 should be >= scrollHeight. If not, shrink.
        let safety = 12;
        while (el.scrollHeight > el.clientHeight + 1 && safety-- > 0) {
            const cur = parseFloat(window.getComputedStyle(el).fontSize);
            const next = Math.max(minPx, cur - 1);
            if (next === cur) break;
            el.style.fontSize = next + 'px';
        }
    }

    function renderSlide(ayat) {
        const card = document.querySelector('#quranBar .q-card');
        if (!card) { setAyatText(ayat); return; }
        // Restart enter animation by re-toggling the class.
        card.classList.remove('q-enter');
        // Force reflow so the next add re-triggers the animation.
        // eslint-disable-next-line no-unused-expressions
        void card.offsetWidth;
        setAyatText(ayat);
        card.classList.add('q-enter');
        reserveQuranSpace(document.getElementById('quranBar'));
    }

    function renderTypewriter(ayat) {
        const arabEl  = document.querySelector('#quranBar .q-arab');
        const transEl = document.querySelector('#quranBar .q-trans');
        const refEl   = document.querySelector('#quranBar .q-ref');
        if (!arabEl || !transEl || !refEl) return;

        if (quranTypingTimer) { clearInterval(quranTypingTimer); quranTypingTimer = null; }

        // Start blank and type Arabic first, then translation, then ref.
        arabEl.innerHTML  = '<span class="quran-cursor">|</span>';
        transEl.innerHTML = '';
        refEl.textContent = '';

        const arabChars  = Array.from(ayat.arab);
        const transChars = Array.from(ayat.trans);
        const refText    = `— QS. ${ayat.surah}: ${ayat.ayat}`;

        // Per-character delay scaled to fit comfortably within the rotation
        // interval (we want typing to finish well before the next switch).
        const intervalMs = Math.max(10, parseInt(state.cfg.quran_interval, 10) || 30) * 1000;
        const totalChars = arabChars.length + transChars.length + refText.length;
        const charDelay  = Math.max(15, Math.min(60, Math.floor(intervalMs * 0.6 / totalChars)));

        let phase = 0;     // 0 = arab, 1 = trans, 2 = ref, 3 = done
        let i = 0;
        let arabBuf = '', transBuf = '';

        quranTypingTimer = setInterval(() => {
            if (phase === 0) {
                if (i < arabChars.length) {
                    arabBuf += arabChars[i++];
                    arabEl.innerHTML = arabBuf + '<span class="quran-cursor">|</span>';
                } else {
                    arabEl.textContent = ayat.arab;
                    transEl.innerHTML  = '<span class="quran-cursor">|</span>';
                    phase = 1; i = 0;
                }
            } else if (phase === 1) {
                if (i < transChars.length) {
                    transBuf += transChars[i++];
                    transEl.innerHTML = transBuf + '<span class="quran-cursor">|</span>';
                } else {
                    transEl.textContent = ayat.trans;
                    phase = 2; i = 0;
                }
            } else if (phase === 2) {
                if (i < refText.length) {
                    refEl.textContent = refText.slice(0, ++i);
                } else {
                    phase = 3;
                    clearInterval(quranTypingTimer);
                    quranTypingTimer = null;
                }
            }
        }, charDelay);

        reserveQuranSpace(document.getElementById('quranBar'));
    }

    function renderMarquee() {
        const track = document.querySelector('#quranBar .q-marquee-track');
        if (!track) return;
        // Build a single long line: arab • trans (— QS. ...) | next ...
        const parts = QURAN_AYAT.map(a => {
            return `<span class="q-arab">${escapeHtml(a.arab)}</span>` +
                   `<span class="q-trans">${escapeHtml(a.trans)}</span>` +
                   `<span class="q-ref">— QS. ${escapeHtml(a.surah)}: ${a.ayat}</span>` +
                   `<span class="q-sep">●</span>`;
        }).join('');
        track.innerHTML = parts;

        // Scroll duration is the user's marquee_speed setting (seconds for
        // one full loop). Smaller = faster scroll. Clamp to a sane range
        // so we never trip into a freeze (0s) or imperceptible crawl.
        const speed = Math.max(10, Math.min(300, parseInt(state.cfg.quran_marquee_speed, 10) || 50));
        track.style.animationDuration = speed + 's';

        reserveQuranSpace(document.getElementById('quranBar'));
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* ===== Layout editor =====
     *
     * Lets the user resize and translate each major UI element (analog
     * clock, digital clock, prayer cards, Quran bar) through the
     * Settings → Editor Tata Letak section. Each element gets three
     * knobs:
     *   - size  (50..200%, applied as CSS `transform: scale()`)
     *   - X/Y   (-50..+50% of viewport, applied via `translate()`)
     *
     * We read all four elements from each rendered layout — they're
     * standardised across templates by their selectors — and write a
     * single transform per element. transform-origin defaults to the
     * element's natural anchor (centre for the clocks, top centre for
     * the prayer row, etc.) which keeps things visually predictable
     * without per-layout overrides.
     *
     * Applied at:
     *   1. mountLayout — fresh DOM, fresh transforms
     *   2. applyConfig push from native — live preview as the user drags
     *      a slider in Settings.
     */
    function applyLayoutEditor() {
        const cfg = state.cfg;
        const apply = (selector, size, xPct, yPct, origin) => {
            const els = document.querySelectorAll(selector);
            if (!els.length) return;
            const sz   = Math.max(50, Math.min(200, parseInt(size,  10) || 100)) / 100;
            const x    = Math.max(-50, Math.min(50,  parseInt(xPct, 10) || 0));
            const y    = Math.max(-50, Math.min(50,  parseInt(yPct, 10) || 0));
            // Skip the work entirely when the user is at defaults — keeps
            // the original layout pristine in that common case.
            const isDefault = sz === 1 && x === 0 && y === 0;
            for (const el of els) {
                el.style.transformOrigin = origin || 'center center';
                el.style.transform = isDefault
                    ? ''
                    : `translate(${x}vw, ${y}vh) scale(${sz})`;
                // Prevent transformed elements from clipping inside their
                // parents when scaled up. `will-change` keeps the WebView's
                // compositor on its toes during slider drags.
                if (!isDefault) el.style.willChange = 'transform';
                else el.style.willChange = '';
            }
        };

        // Analog clock — the [data-analog] slot is the size box, so
        // scaling it scales the inner SVG too. Origin: center.
        apply('[data-analog]', cfg.analog_size, cfg.analog_x_pct, cfg.analog_y_pct);

        // Digital clock — the giant time text.
        apply('#digital', cfg.digital_size, cfg.digital_x_pct, cfg.digital_y_pct);

        // Prayer-time cards. Most layouts expose them inside a single
        // `<section class="row-fixed">` containing all six .prayer
        // children. We transform that section so all six move together.
        // Fallback to scaling individual cards in pill-style layouts that
        // don't have a single common parent.
        const prayerSection = findPrayerContainer();
        if (prayerSection) {
            apply(uniqueSelectorFor(prayerSection),
                  cfg.prayers_size, cfg.prayers_x_pct, cfg.prayers_y_pct,
                  'center bottom');
        }

        // Quran bar — sits at the bottom edge already; default origin
        // works fine, but bias toward the bottom so resizing doesn't
        // float the card up off-screen.
        apply('#quranBar', cfg.quran_size, cfg.quran_x_pct, cfg.quran_y_pct,
              'center bottom');
    }

    /**
     * Locate the node that contains all .prayer cards inside the
     * currently mounted layout. Returns the deepest ancestor that
     * contains every .prayer in the layout host (i.e. their lowest
     * common parent), so we transform exactly that node.
     */
    function findPrayerContainer() {
        const host = document.getElementById('layoutHost');
        if (!host) return null;
        const cards = host.querySelectorAll('.prayer');
        if (!cards.length) return null;
        // Walk up from the first card until the parent contains all of them.
        let node = cards[0].parentElement;
        while (node && node !== host) {
            let containsAll = true;
            for (const c of cards) {
                if (!node.contains(c)) { containsAll = false; break; }
            }
            if (containsAll) return node;
            node = node.parentElement;
        }
        return null;
    }

    /**
     * Build a CSS selector that uniquely identifies [el] inside the
     * layout host, so [apply] can find it via querySelectorAll. We
     * stamp a data attribute the first time we see the node, then
     * reuse it on subsequent calls — cheaper than recomputing a
     * positional path every applyConfig.
     */
    function uniqueSelectorFor(el) {
        if (!el) return null;
        if (!el.dataset.mcEditorSlot) {
            el.dataset.mcEditorSlot = 'prayers';
        }
        return `[data-mc-editor-slot="${el.dataset.mcEditorSlot}"]`;
    }

    /* ===== Fonts =====
     *
     * The user picks a display font and a digital font from a dropdown
     * in Settings (Tampilan section). Both default to fonts already
     * preloaded in index.html, but for the wider catalogue we lazy-load
     * the requested family from Google Fonts on demand. Failures fall
     * back silently to the system serif/sans-serif via CSS.
     */
    const _loadedFonts = new Set();

    function ensureGoogleFont(family) {
        if (!family) return;
        // Built-in or already-loaded families need no extra request.
        const skip = ['monospace', 'sans-serif', 'serif', 'system-ui'];
        if (skip.includes(family.toLowerCase())) return;
        const key = family.toLowerCase();
        if (_loadedFonts.has(key)) return;
        _loadedFonts.add(key);

        // We can't tell from the JS side which weights a given font ships;
        // request the most useful range and let Google Fonts cap to what
        // exists. Wrap in a try because malformed font names should fail
        // gracefully (broken stylesheet links don't crash the page).
        try {
            const safe = encodeURIComponent(family);
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = `https://fonts.googleapis.com/css2?family=${safe}:wght@400;500;600;700;800;900&display=swap`;
            link.crossOrigin = 'anonymous';
            link.referrerPolicy = 'no-referrer';
            document.head.appendChild(link);
        } catch (e) { /* offline or CSP blocked — fall back to system font */ }
    }

    function applyFonts() {
        const cfg = state.cfg;
        const display = (cfg.font_display || 'Inter').trim();
        const digital = (cfg.font_digital || 'Orbitron').trim();
        ensureGoogleFont(display);
        ensureGoogleFont(digital);

        // Quote the family name in the CSS rule so multi-word fonts
        // ('Plus Jakarta Sans', 'Press Start 2P', etc.) resolve correctly.
        document.documentElement.style.setProperty(
            '--font-display',
            `"${display}", system-ui, sans-serif`
        );
        document.documentElement.style.setProperty(
            '--font-digital',
            `"${digital}", "Orbitron", monospace`
        );
    }

    /* ===== Slideshow =====
     *
     * Layouts that support a background slideshow expose a div.slideshow-host
     * (currently `minimal` and `cinema`). We render two .slide layers inside
     * that host and crossfade via CSS opacity.
     *
     * URL list comes from cfg.slideshow_urls — newline / comma separated.
     * Empty list falls back to the bundled default-bg.svg so the layout
     * always has *some* background image.
     *
     * Bad URLs (decode error / 404) are dropped silently; if every URL fails
     * we fall back to the default image.
     */
    function parseSlideshowUrls(raw) {
        if (!raw) return [];
        // Accepts http(s), data: (small inline images), and the bundled
        // `img/...` relative path. Anything starting with javascript: /
        // vbscript: / etc. is rejected. The Android side serves user-imported
        // images at https://appassets.androidplatform.net/slides/* which
        // satisfies the https: branch automatically.
        return String(raw)
            .split(/[\n,]+/)
            .map(s => s.trim())
            .filter(s => s.length > 0 && /^(https?:|data:|img\/)/i.test(s));
    }

    /** True if [url] looks like a video file (by extension). */
    function isVideoUrl(url) {
        // We can't probe the mime cheaply from the JS side, so the
        // extension list has to be exhaustive enough for common formats
        // exported by Android galleries and slide-storage.
        return /\.(mp4|m4v|webm|mkv|mov|3gp)(\?.*)?$/i.test(url);
    }

    function applySlideshow() {
        // Stop any running slideshow first.
        if (state.slideshow.timer) {
            clearTimeout(state.slideshow.timer);
            state.slideshow.timer = null;
        }

        const host = document.querySelector('.slideshow-host');
        if (!host) {
            // Layouts without a slideshow slot: nothing to do.
            return;
        }

        const urls = parseSlideshowUrls(state.cfg.slideshow_urls);
        const useFallback = urls.length === 0;
        const list = useFallback ? ['img/default-bg.svg'] : urls;

        // Build two crossfade slots if not already present. Slots are
        // empty containers — we put either a positioned <div> with a
        // CSS background-image (for stills) or a <video> element
        // inside them at swap time, keeping the same .active /
        // opacity-fade contract for both kinds of media.
        host.innerHTML = '';
        const slotA = document.createElement('div');
        const slotB = document.createElement('div');
        for (const el of [slotA, slotB]) {
            el.className = 'slide';
            el.style.position = 'absolute';
            el.style.inset = '0';
            host.appendChild(el);
        }
        state.slideshow.slots = [slotA, slotB];
        state.slideshow.urls  = list;
        state.slideshow.idx   = 0;

        // Show first slide immediately.
        showSlide(0);

        // Even with a single image we don't need a timer; for a single
        // video we still let it loop natively. Either way: skip rotation.
        if (list.length < 2) return;

        scheduleNextSlide();
    }

    /**
     * Move on to the next slide in [state.slideshow.urls]. Used both by
     * the natural-end handler on videos and the configured-duration
     * timer on stills, so a mixed list rotates through smoothly.
     */
    function advanceSlide() {
        const list = state.slideshow.urls;
        if (!list || list.length < 2) return;
        state.slideshow.idx = (state.slideshow.idx + 1) % list.length;
        showSlide(state.slideshow.idx);
        scheduleNextSlide();
    }

    /**
     * Schedule the next rotation. Stills use the user's slide_duration;
     * videos default to letting playback finish naturally (we hook
     * `ended` in [showSlide]) but we keep a generous safety timeout in
     * case the video stalls or is very long — so the slideshow never
     * gets stuck on a broken clip.
     */
    function scheduleNextSlide() {
        if (state.slideshow.timer) {
            clearTimeout(state.slideshow.timer);
            state.slideshow.timer = null;
        }
        const list = state.slideshow.urls;
        if (!list || list.length < 2) return;

        const url = list[state.slideshow.idx];
        const dur = Math.max(3, parseInt(state.cfg.slide_duration, 10) || 8) * 1000;

        if (isVideoUrl(url)) {
            // Videos progress on natural end. The timer is a long-fuse
            // fallback so a frozen / very long video doesn't trap us.
            state.slideshow.timer = setTimeout(advanceSlide, 5 * 60 * 1000);
        } else {
            state.slideshow.timer = setTimeout(advanceSlide, dur);
        }
    }

    function showSlide(idx) {
        const list = state.slideshow.urls;
        const [a, b] = state.slideshow.slots;
        if (!a || !b) return;
        const url = list[idx];

        // Decide which slot is currently hidden — that's where we paint next.
        const front = a.classList.contains('active') ? a : b;
        const back  = front === a ? b : a;

        if (isVideoUrl(url)) {
            paintVideoSlide(back, url, idx);
        } else {
            paintImageSlide(back, front, url, idx);
        }
    }

    /**
     * Render a still image into [back], then crossfade. Pre-decodes the
     * image so we never flash through a transparent slot, and skips
     * forward if the URL fails (network / 404 / decode error).
     */
    function paintImageSlide(back, front, url, idx) {
        const list = state.slideshow.urls;
        const probe = new Image();
        probe.onload = () => {
            // Clear any previous video element in this slot before
            // painting; otherwise it stays alive and keeps audio /
            // CPU spinning even though it's invisible.
            back.innerHTML = '';
            back.style.background = `#0a1a3c url("${cssUrl(url)}") center/cover no-repeat`;
            back.classList.add('active');
            requestAnimationFrame(() => {
                front.classList.remove('active');
                // Free the previous slot's video element if any.
                if (front.firstChild && front.firstChild.tagName === 'VIDEO') {
                    try { front.firstChild.pause(); } catch (e) {}
                    front.innerHTML = '';
                    front.style.background = '';
                }
            });
        };
        probe.onerror = () => {
            // Skip this URL; advance so a single bad link doesn't freeze
            // the slideshow.
            if (list.length <= 1) return;
            const next = (idx + 1) % list.length;
            if (next !== idx) {
                state.slideshow.idx = next;
                showSlide(next);
            }
        };
        probe.src = url;
    }

    /**
     * Render a video into [back]. We force `muted` because Android
     * WebView only autoplays muted media by default; the native side
     * additionally sets mediaPlaybackRequiresUserGesture=false but we
     * want the page to still autoplay sensibly inside a regular browser.
     *
     * The crossfade contract: we add `.active` to the back slot first
     * (revealing the loaded video), then in the next frame remove
     * `.active` from the previous front slot. CSS does the rest.
     */
    function paintVideoSlide(back, url, idx) {
        const list = state.slideshow.urls;
        // Wipe any previous content in this slot first, including a
        // stale video element that might still be playing.
        const old = back.firstChild;
        if (old && old.tagName === 'VIDEO') {
            try { old.pause(); } catch (e) {}
        }
        back.innerHTML = '';
        back.style.background = '#000';

        const v = document.createElement('video');
        v.className = 'slide-video';
        v.src = url;
        v.muted = true;
        v.autoplay = true;
        v.loop = (list.length === 1);   // single-video list ⇒ loop forever
        v.playsInline = true;
        v.setAttribute('playsinline', '');
        v.setAttribute('webkit-playsinline', '');
        v.setAttribute('preload', 'auto');
        v.style.position = 'absolute';
        v.style.inset = '0';
        v.style.width  = '100%';
        v.style.height = '100%';
        v.style.objectFit = 'cover';

        // Auto-skip on error or natural end (multi-video lists).
        let advanced = false;
        const tryAdvance = () => {
            if (advanced) return;
            advanced = true;
            // The scheduler re-fires this anyway, but doing it here
            // makes mixed photo/video lists look snappier when a video
            // ends well before its scheduler timeout.
            advanceSlide();
        };
        v.addEventListener('ended', () => {
            if (list.length > 1) tryAdvance();
        });
        v.addEventListener('error', () => {
            if (list.length <= 1) return;
            const next = (idx + 1) % list.length;
            if (next !== idx) {
                state.slideshow.idx = next;
                showSlide(next);
            }
        });

        back.appendChild(v);

        // Reveal the new slot, then hide the previous one. The same
        // dance as paintImageSlide.
        const front = back === state.slideshow.slots[0]
            ? state.slideshow.slots[1]
            : state.slideshow.slots[0];

        const reveal = () => {
            back.classList.add('active');
            requestAnimationFrame(() => {
                front.classList.remove('active');
                // Free the previous slot's video element after the fade.
                setTimeout(() => {
                    const prev = front.firstChild;
                    if (prev && prev.tagName === 'VIDEO') {
                        try { prev.pause(); } catch (e) {}
                        front.innerHTML = '';
                        front.style.background = '';
                    }
                }, 1200);   // matches CSS .slide transition
            });
        };

        // Try to play right away. If the first call rejects (some Android
        // builds reject before the readyState bumps), retry once on
        // canplay — which is when WebView is happiest with autoplay.
        const playAttempt = v.play();
        if (playAttempt && typeof playAttempt.catch === 'function') {
            playAttempt.catch(() => {
                v.addEventListener('canplay', () => {
                    v.play().catch(() => { /* give up silently */ });
                }, { once: true });
            });
        }
        // Fade in once the video has actually decoded a frame so we
        // don't crossfade to a black slot.
        if (v.readyState >= 2) {
            reveal();
        } else {
            v.addEventListener('loadeddata', reveal, { once: true });
            // Fallback: if loadeddata never fires (network slow),
            // reveal anyway after 600ms so the user isn't stuck on
            // the previous slide.
            setTimeout(reveal, 600);
        }
    }

    function cssUrl(s) {
        // Escape the only chars that break inside a CSS url("...").
        return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    /* ===== Analog clock ===== */
    function buildAnalogStatic() {
        const ticks = $('#ticks');
        const nums  = $('#numerals');
        if (!ticks || !nums) return;
        // Idempotent: only build once per mount.
        if (ticks.childNodes.length || nums.childNodes.length) return;
        const svgNS = 'http://www.w3.org/2000/svg';
        for (let i = 0; i < 60; i++) {
            const angle = i * 6;
            const isHour = i % 5 === 0;
            const r1 = isHour ? 75 : 80;
            const r2 = 84;
            const sw = isHour ? 2.4 : 0.7;
            const rad = (angle - 90) * Math.PI / 180;
            const line = document.createElementNS(svgNS, 'line');
            line.setAttribute('x1', (r1 * Math.cos(rad)).toFixed(2));
            line.setAttribute('y1', (r1 * Math.sin(rad)).toFixed(2));
            line.setAttribute('x2', (r2 * Math.cos(rad)).toFixed(2));
            line.setAttribute('y2', (r2 * Math.sin(rad)).toFixed(2));
            line.setAttribute('stroke-width', String(sw));
            ticks.appendChild(line);
        }
        for (let n = 1; n <= 12; n++) {
            const a = n * 30;
            const rad = (a - 90) * Math.PI / 180;
            const t = document.createElementNS(svgNS, 'text');
            t.setAttribute('x', (65 * Math.cos(rad)).toFixed(2));
            t.setAttribute('y', (65 * Math.sin(rad)).toFixed(2));
            t.textContent = String(n);
            nums.appendChild(t);
        }
    }

    function tickAnalog() {
        const now = new Date();
        const ms  = now.getMilliseconds();
        const sec = now.getSeconds() + ms / 1000;
        const min = now.getMinutes() + sec / 60;
        const hr  = (now.getHours() % 12) + min / 60;
        const handS = $('#handS'), handM = $('#handM'), handH = $('#handH');
        if (handH) handH.setAttribute('transform', `rotate(${(hr * 30).toFixed(2)})`);
        if (handM) handM.setAttribute('transform', `rotate(${(min * 6).toFixed(2)})`);
        if (handS) handS.setAttribute('transform', `rotate(${(sec * 6).toFixed(2)})`);
        requestAnimationFrame(tickAnalog);
    }

    /* ===== Digital clock + date ===== */
    function tickDigital() {
        const now = new Date();
        const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
        const main = $('#digital');
        if (main) {
            main.innerHTML =
                `${pad(h)}<span style="color: var(--accent);">:</span>${pad(m)}` +
                `<span style="color: var(--accent); font-size: 0.4em;" class="align-top ml-3">${pad(s)}</span>`;
        }
        const days   = ['Minggu','Senin','Selasa','Rabu','Kamis',"Jum'at",'Sabtu'];
        const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
        const greg = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
        const gd = $('#greg-date'); if (gd) gd.textContent = greg;

        updateNextCountdown(now);
        checkAdzanTrigger(now);
    }

    /* ===== Hijri date ===== */
    function loadHijri() {
        const el = $('#hij-date');
        if (!el) return;
        try {
            const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
                day: 'numeric', month: 'long', year: 'numeric'
            }).formatToParts(new Date());
            let day = '', monthName = '', year = '';
            for (const p of parts) {
                if (p.type === 'day')   day = p.value;
                if (p.type === 'month') monthName = p.value;
                if (p.type === 'year')  year = p.value.replace(/\D/g, '');
            }
            const key = monthName.toLowerCase().replace(/['‘’`\s\-_.]/g, '');
            let idx = HIJRI_MAP[key];
            if (idx === undefined) {
                for (const [m, i] of Object.entries(HIJRI_MAP)) {
                    if (key.includes(m)) { idx = i; break; }
                }
            }
            const monthId = (idx !== undefined) ? HIJRI_MONTHS_ID[idx] : monthName;
            el.textContent = `${day} ${monthId} ${year} H`;
        } catch (e) { el.textContent = ''; }
    }

    /* ===== Prayer times via Aladhan =====
     *
     * Strategy: fetch the *whole month* with /v1/calendar/{y}/{m} and cache
     * it locally. We then index into that cache by day-of-month. Effects:
     *   - 1 network call per month instead of per day
     *   - Fully offline after the first successful fetch
     *   - Pre-fetches next month near month-end for a seamless rollover
     * Falls back to the per-day /v1/timings endpoint if calendar fails,
     * and to hardcoded approximate times if the network is fully down.
     */
    const CALENDAR_TTL_MS = 32 * 24 * 3600 * 1000;
    const CALENDAR_PREFIX = 'mc_calendar_';

    function calendarKey(year, month1Based) {
        const cfg = state.cfg;
        return `${CALENDAR_PREFIX}${cfg.location_lat},${cfg.location_lng},` +
               `${cfg.calc_method},${cfg.timezone},${year}-${pad(month1Based)}`;
    }

    function pruneOldCalendarCache() {
        try {
            const now = Date.now();
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const k = localStorage.key(i);
                if (!k) continue;
                if (k.startsWith('mc_prayer_')) {
                    localStorage.removeItem(k);
                    continue;
                }
                if (!k.startsWith(CALENDAR_PREFIX)) continue;
                const raw = localStorage.getItem(k);
                if (!raw) continue;
                try {
                    const obj = JSON.parse(raw);
                    if (!obj || !obj._ts || (now - obj._ts) > 90 * 24 * 3600 * 1000) {
                        localStorage.removeItem(k);
                    }
                } catch (e) { localStorage.removeItem(k); }
            }
        } catch (e) { /* localStorage unavailable */ }
    }

    function readCachedCalendar(year, month1Based) {
        try {
            const raw = localStorage.getItem(calendarKey(year, month1Based));
            if (!raw) return null;
            const obj = JSON.parse(raw);
            if (!obj || !obj._ts || !Array.isArray(obj.days)) return null;
            if ((Date.now() - obj._ts) > CALENDAR_TTL_MS) return null;
            return obj.days;
        } catch (e) { return null; }
    }

    function writeCachedCalendar(year, month1Based, days) {
        try {
            localStorage.setItem(
                calendarKey(year, month1Based),
                JSON.stringify({ _ts: Date.now(), days })
            );
        } catch (e) { /* quota */ }
    }

    function timingsFromCalendar(days, dayOfMonth) {
        if (!Array.isArray(days)) return null;
        const entry = days.find(d => {
            const dn = d && d.date && d.date.gregorian && parseInt(d.date.gregorian.day, 10);
            return dn === dayOfMonth;
        }) || days[dayOfMonth - 1];
        return entry && entry.timings ? entry.timings : null;
    }

    async function fetchMonthlyCalendar(year, month1Based) {
        const cfg = state.cfg;
        const url = `https://api.aladhan.com/v1/calendar/${year}/${month1Based}` +
                    `?latitude=${encodeURIComponent(cfg.location_lat)}` +
                    `&longitude=${encodeURIComponent(cfg.location_lng)}` +
                    `&method=${encodeURIComponent(cfg.calc_method)}` +
                    `&school=0&timezonestring=${encodeURIComponent(cfg.timezone)}`;
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        if (!data || !Array.isArray(data.data)) {
            throw new Error('Unexpected calendar payload');
        }
        return data.data;
    }

    async function fetchDailyFallback(now) {
        const cfg = state.cfg;
        const dd = pad(now.getDate()), mm = pad(now.getMonth()+1), yy = now.getFullYear();
        const url = `https://api.aladhan.com/v1/timings/${dd}-${mm}-${yy}` +
                    `?latitude=${encodeURIComponent(cfg.location_lat)}` +
                    `&longitude=${encodeURIComponent(cfg.location_lng)}` +
                    `&method=${encodeURIComponent(cfg.calc_method)}` +
                    `&school=0&timezonestring=${encodeURIComponent(cfg.timezone)}`;
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        return data && data.data && data.data.timings;
    }

    async function loadPrayerTimes() {
        pruneOldCalendarCache();

        const now = new Date();
        const year   = now.getFullYear();
        const month  = now.getMonth() + 1;
        const dayNum = now.getDate();

        let days = readCachedCalendar(year, month);
        if (days) {
            const t = timingsFromCalendar(days, dayNum);
            if (t) { state.times = normalizeTimes(t); renderTimes(); }
        }

        if (!days) {
            try {
                days = await fetchMonthlyCalendar(year, month);
                writeCachedCalendar(year, month, days);
                const t = timingsFromCalendar(days, dayNum);
                if (t) { state.times = normalizeTimes(t); renderTimes(); }
            } catch (e) {
                console.warn('Monthly calendar fetch failed:', e);
            }
        }

        if (!Object.keys(state.times).length) {
            try {
                const t = await fetchDailyFallback(now);
                if (t) { state.times = normalizeTimes(t); renderTimes(); }
            } catch (e) {
                console.warn('Daily fallback failed:', e);
            }
        }

        if (!Object.keys(state.times).length) {
            state.times = normalizeTimes({
                Fajr: '04:30', Sunrise: '05:45', Dhuhr: '12:00',
                Asr: '15:15', Maghrib: '18:00', Isha: '19:15'
            });
            renderTimes();
        }

        // Pre-fetch next month near end of month for instant rollover.
        const lastDay = new Date(year, month, 0).getDate();
        if (dayNum >= lastDay - 4) {
            const nm = month === 12 ? 1 : month + 1;
            const ny = month === 12 ? year + 1 : year;
            if (!readCachedCalendar(ny, nm)) {
                fetchMonthlyCalendar(ny, nm)
                    .then(d => writeCachedCalendar(ny, nm, d))
                    .catch(err => console.warn('Pre-fetch next month failed:', err));
            }
        }
    }

    function refreshFromCacheOnly() {
        const now = new Date();
        const days = readCachedCalendar(now.getFullYear(), now.getMonth() + 1);
        if (!days) return false;
        const t = timingsFromCalendar(days, now.getDate());
        if (!t) return false;
        state.times = normalizeTimes(t);
        renderTimes();
        return true;
    }

    function normalizeTimes(t) {
        const out = {};
        ['Fajr','Sunrise','Dhuhr','Asr','Maghrib','Isha'].forEach(k => {
            if (t[k]) out[k.toLowerCase()] = String(t[k]).split(' ')[0];
        });
        return out;
    }

    function renderTimes() {
        const order = ['fajr','sunrise','dhuhr','asr','maghrib','isha'];
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        let nextKey = null, bestDiff = Infinity;
        order.forEach(k => {
            const t = state.times[k];
            const card = document.querySelector(`.prayer[data-key="${k}"]`);
            if (!card) return;
            card.classList.remove('next');
            const tEl = card.querySelector('[data-time]');
            if (tEl) tEl.textContent = t || '--:--';
            if (!t || k === 'sunrise') return;
            const [hh, mm] = t.split(':').map(Number);
            const m = hh * 60 + mm;
            const diff = m - nowMin;
            if (diff > 0 && diff < bestDiff) { bestDiff = diff; nextKey = k; }
        });
        if (!nextKey) nextKey = 'fajr';
        const next = document.querySelector(`.prayer[data-key="${nextKey}"]`);
        if (next) next.classList.add('next');
    }

    function updateNextCountdown(now) {
        const order = ['fajr','dhuhr','asr','maghrib','isha'];
        const nowSec = now.getHours()*3600 + now.getMinutes()*60 + now.getSeconds();
        let next = null, bestDiff = Infinity;
        order.forEach(k => {
            if (!state.times[k]) return;
            const [hh, mm] = state.times[k].split(':').map(Number);
            const sec = hh*3600 + mm*60;
            const d = sec - nowSec;
            if (d > 0 && d < bestDiff) { bestDiff = d; next = k; }
        });
        if (!next && state.times.fajr) {
            const [hh, mm] = state.times.fajr.split(':').map(Number);
            bestDiff = (24*3600 - nowSec) + (hh*3600 + mm*60);
            next = 'fajr';
        }
        const lbl = $('#nextLabel'), cd = $('#nextCountdown');
        if (next && bestDiff !== Infinity) {
            if (lbl) lbl.textContent = PRAYER_LABEL_ID[next] || next;
            if (cd) {
                const h = Math.floor(bestDiff / 3600);
                const m = Math.floor((bestDiff % 3600) / 60);
                const s = bestDiff % 60;
                cd.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
            }
        }
    }

    /* ===== Adzan overlay ===== */
    function dateKey(d) { return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`; }
    function loadTriggered() {
        try { return JSON.parse(localStorage.getItem('mc_triggered') || '{}'); }
        catch { return {}; }
    }
    function saveTriggered(obj) {
        try { localStorage.setItem('mc_triggered', JSON.stringify(obj)); } catch {}
    }

    function checkAdzanTrigger(now) {
        if (state.adzanActive || state.iqomahActive) return;
        const dKey = dateKey(now);
        const triggered = loadTriggered();
        Object.keys(triggered).forEach(k => {
            if (!k.startsWith(dKey)) delete triggered[k];
        });
        const nowSec = now.getHours()*3600 + now.getMinutes()*60 + now.getSeconds();
        const triggerable = ['fajr','dhuhr','asr','maghrib','isha'];
        for (const k of triggerable) {
            const t = state.times[k];
            if (!t) continue;
            const [hh, mm] = t.split(':').map(Number);
            const targetSec = hh*3600 + mm*60;
            const diff = nowSec - targetSec;
            const key = `${dKey}-${k}`;
            if (diff >= 0 && diff < 60 && !triggered[key]) {
                triggered[key] = true;
                saveTriggered(triggered);
                showAdzan(k);
                break;
            }
        }
    }

    function showAdzan(key) {
        state.adzanActive = true;
        const overlay = $('#adzanOverlay');
        const dur   = parseInt(document.body.dataset.adzanDur  || '600', 10);
        const iqDur = parseInt(document.body.dataset.iqomahDur || '600', 10);
        $('#ovPrayer').textContent = (PRAYER_LABEL_ID[key] || key).toUpperCase();
        $('#ovSub').textContent = 'BERLANGSUNG';
        applyImamToOverlay(key);
        overlay.classList.remove('hidden');

        // Kick off the alarm sound (no-op if no audio URL configured).
        // We start playback BEFORE the visual countdown so a long
        // intro/takbir sound aligns with the overlay appearing.
        playAdzanAlarm();

        startCountdown(dur, () => {
            state.adzanActive = false;
            state.iqomahActive = true;
            $('#ovSub').textContent = 'IQOMAH';
            // Iqomah is a different phase from adzan — no audio loop;
            // most masjids handle iqomah with a live caller, not a
            // recording. Stopping here also covers the case where the
            // configured loops outlast the adzan window itself.
            stopAdzanAlarm();
            startCountdown(iqDur, () => {
                state.iqomahActive = false;
                overlay.classList.add('hidden');
            });
        });
    }

    /* ===== Adzan alarm audio =====
     *
     * Plays the user's chosen audio file (cfg.adzan_audio_url) `loops`
     * times back-to-back when the prayer time hits. Implementation
     * notes:
     *
     *   - We deliberately do NOT use HTMLMediaElement.loop because that
     *     would loop forever / can't be used for "play exactly N times".
     *     Instead we hook `ended` and replay until the configured count
     *     is reached.
     *   - Android WebView's autoplay rules: with
     *     `mediaPlaybackRequiresUserGesture=false` set in MainActivity
     *     (it is), unmuted programmatic play is allowed. If a future
     *     build flips that flag back, we attempt to play and silently
     *     fall back to muted-then-unmute on the first canplay.
     *   - The adzan duration timer in showAdzan stops audio when the
     *     user moves into iqomah, so we don't need a separate timeout.
     */
    let _adzanPlayState = null;

    function playAdzanAlarm() {
        const audio = document.getElementById('adzanAudio');
        if (!audio) return;
        const url = (document.body.dataset.adzanAudio || '').trim();
        if (!url) return;   // silent mode: no file configured
        const loops = Math.max(1, Math.min(20,
            parseInt(document.body.dataset.adzanLoops, 10) || 1));

        // If we're already mid-play (e.g. somebody fired showAdzan twice
        // in quick succession), reset and start fresh rather than stack
        // ended-handlers.
        stopAdzanAlarm();

        _adzanPlayState = { remaining: loops, src: url };

        const onEnded = () => {
            // Defensive: bail if we got here after stopAdzanAlarm() ran.
            if (!_adzanPlayState) return;
            _adzanPlayState.remaining -= 1;
            if (_adzanPlayState.remaining > 0) {
                // Replay. Setting currentTime first guarantees a fresh
                // pass even if the file's duration is sub-second
                // (Android WebView occasionally skips the first play()
                // call on an already-seeked element otherwise).
                try { audio.currentTime = 0; } catch (e) { /* readonly while loading */ }
                audio.play().catch(() => { /* device denied; give up silently */ });
            } else {
                // All loops done — release the slot so the next adzan
                // starts cleanly.
                stopAdzanAlarm();
            }
        };

        audio.removeEventListener('ended', _adzanPlayState._onEndedAttached || (() => {}));
        audio.addEventListener('ended', onEnded);
        _adzanPlayState._onEndedAttached = onEnded;

        // Fresh src triggers a load() automatically. Setting muted=false
        // explicitly because WebView's previous slideshow video may have
        // left the global audio context muted on some builds.
        audio.muted = false;
        audio.volume = 1.0;
        audio.src = url;

        const attempt = audio.play();
        if (attempt && typeof attempt.catch === 'function') {
            attempt.catch(() => {
                // First play rejected. Wait for canplay then retry once.
                audio.addEventListener('canplay', () => {
                    audio.play().catch(() => { /* give up — silent adzan */ });
                }, { once: true });
            });
        }
    }

    function stopAdzanAlarm() {
        const audio = document.getElementById('adzanAudio');
        if (!audio) return;
        if (_adzanPlayState && _adzanPlayState._onEndedAttached) {
            audio.removeEventListener('ended', _adzanPlayState._onEndedAttached);
        }
        _adzanPlayState = null;
        try {
            audio.pause();
            audio.currentTime = 0;
        } catch (e) { /* not yet loaded */ }
    }

    /**
     * Pick the right imam name for the current prayer and reveal the
     * imam block on the adzan overlay. Friday + dhuhr triggers the
     * Jum'at imam (with the khatib appearing as a second line). Other
     * combos use the per-prayer field. Empty fields ⇒ block hidden.
     */
    function applyImamToOverlay(key) {
        const cfg = state.cfg;
        const block       = document.getElementById('ovImamBlock');
        const labelEl     = document.getElementById('ovImamLabel');
        const nameEl      = document.getElementById('ovImamName');
        const khatibLine  = document.getElementById('ovKhatibLine');
        const khatibNameEl= document.getElementById('ovKhatibName');
        if (!block || !nameEl) return;

        if (cfg.show_imam === false) {
            block.style.display = 'none';
            return;
        }

        const isFriday = new Date().getDay() === 5;
        const isJumat  = isFriday && key === 'dhuhr';

        let label = 'Imam';
        let name  = '';
        let khatib = '';

        if (isJumat) {
            label  = "Imam Jum'at";
            name   = (cfg.imam_jumat || '').trim();
            khatib = (cfg.khatib_jumat || '').trim();
        } else {
            const pick = {
                fajr:    cfg.imam_fajr,
                dhuhr:   cfg.imam_dhuhr,
                asr:     cfg.imam_asr,
                maghrib: cfg.imam_maghrib,
                isha:    cfg.imam_isha,
            }[key];
            name = (pick || '').trim();
        }

        // Hide the block entirely when there's nothing to show — neither
        // a primary name nor a Friday khatib. This keeps the overlay
        // clean for masjids that haven't set up an imam schedule yet.
        if (!name && !khatib) {
            block.style.display = 'none';
            return;
        }

        block.style.display = '';
        if (labelEl) labelEl.textContent = label;
        nameEl.textContent = name || '—';

        if (khatib && khatibLine && khatibNameEl) {
            khatibLine.style.display = '';
            khatibNameEl.textContent = khatib;
        } else if (khatibLine) {
            khatibLine.style.display = 'none';
        }
    }
    function hideAdzan() {
        state.adzanActive = false;
        state.iqomahActive = false;
        // Also kill any in-flight audio so dismissing the overlay
        // really does silence the alarm. If the user only meant to
        // hide the visual and keep listening they can let it run on
        // its own — they won't hit hideAdzan in that flow.
        stopAdzanAlarm();
        $('#adzanOverlay').classList.add('hidden');
    }
    function startCountdown(seconds, onDone) {
        const el = $('#ovCount');
        let s = seconds;
        const render = () => {
            const m = Math.floor(s / 60), r = s % 60;
            if (el) el.textContent = pad(m) + ':' + pad(r);
        };
        render();
        const t = setInterval(() => {
            s--;
            if (s <= 0) { clearInterval(t); render(); onDone && onDone(); return; }
            render();
        }, 1000);
    }

    /* ===== Viewport sizing =====
     *
     * Android WebView's `100vh` and Tailwind's `h-screen` can include the
     * area behind translucent status / nav bars before our immersive flags
     * have applied, causing the bottom of the layout to be clipped. We
     * track the *real* viewport via window.innerHeight and expose it as
     * a CSS custom property `--app-vh` that the `.app-screen` class reads.
     */
    function syncViewportHeight() {
        try {
            // Prefer visualViewport (more reliable in Android WebView
            // immersive mode where window.innerHeight can lag behind).
            const vp = window.visualViewport;
            const h = vp ? vp.height : window.innerHeight;
            if (h > 0) {
                document.documentElement.style.setProperty('--app-vh', h + 'px');
            }
        } catch (e) { /* noop */ }
    }

    /* ===== Settings button ===== */
    function wireGear() {
        const gear = $('#gearBtn');
        if (!gear) return;
        gear.addEventListener('click', () => {
            try {
                if (window.MCAndroid && window.MCAndroid.openSettings) {
                    window.MCAndroid.openSettings();
                }
            } catch (e) { console.warn(e); }
        });
    }

    /* ===== init ===== */
    function init() {
        loadFromBridge();
        syncViewportHeight();
        mountLayout(state.cfg.layout || 'minimal');
        applyConfigToDom();
        applySlideshow();
        wireGear();
        tickDigital();
        setInterval(tickDigital, 1000);
        requestAnimationFrame(tickAnalog);

        // Re-measure when the viewport changes — covers immersive mode
        // applying after first paint, screen rotation, and split-screen.
        window.addEventListener('resize', syncViewportHeight);
        window.addEventListener('orientationchange', syncViewportHeight);
        // visualViewport fires more reliably on Android WebView when
        // system bars animate in/out.
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', syncViewportHeight);
        }

        loadHijri();
        loadPrayerTimes();
        setInterval(loadPrayerTimes, 6 * 3600 * 1000);

        setInterval(() => {
            const n = new Date();
            if (n.getHours() === 0 && n.getMinutes() === 0 && n.getSeconds() < 5) {
                if (!refreshFromCacheOnly()) loadPrayerTimes();
                loadHijri();
            }
        }, 4000);

        document.addEventListener('keydown', (e) => {
            if (e.key === 't' || e.key === 'T') {
                if (!state.adzanActive && !state.iqomahActive) showAdzan('maghrib');
            }
            if (e.key === 'Escape') hideAdzan();
        });

        console.log('[MuslimClock] mounted layout=' + state.mountedLayout +
                    ', bridge=' + !!window.MCAndroid);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
