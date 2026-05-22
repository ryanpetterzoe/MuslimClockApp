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
        layout: 'cinema',
        digital_style: 'classic',   // classic | split | neon | flip | dualtone | matrix | retro | minimal | gradient | outline | shadow | lcd | binary | dots | wave
        hide_seconds: false,        // hide seconds display on digital clock
        analog_style: 'classic',    // classic | modern | minimal | roman | arabic | dots | skeleton | luxury | sport | radar
        slideshow_urls: '',     // newline / comma separated. Empty = default bg.
        slide_duration: 8,      // seconds per slide
        slideshow_opacity: 100, // 0..100 — visual intensity of the slideshow background (default: full)
        show_ticker: true,
        ticker_text: 'Selamat Datang di Masjid Muslim Clock | Jadwal Sholat Hari Ini',
        ticker_speed: 30,       // seconds for one full scroll cycle
        ticker_style: 'classic', // classic | bounce | fade | neon | typewriter
        ticker_bg: 'solid_dark', // solid_dark | transparent | glass | accent | gradient_sunset | gradient_ocean | gradient_purple | green_islamic | red_dark
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
        // Per-prayer adzan overlay content
        adzan_content_fajr: 'quran',
        adzan_text_fajr: '',
        adzan_content_dhuhr: 'quran',
        adzan_text_dhuhr: '',
        adzan_content_asr: 'quran',
        adzan_text_asr: '',
        adzan_content_maghrib: 'quran',
        adzan_text_maghrib: '',
        adzan_content_isha: 'quran',
        adzan_text_isha: '',
        // Layout editor — defaults match Settings.kt. 100% size = use the
        // layout's natural dimensions; 0% offset = no translation.
        analog_size:  100, analog_x_pct:  0, analog_y_pct:  0,
        digital_size: 100, digital_x_pct: 0, digital_y_pct: 0,
        prayers_size: 100, prayers_x_pct: 0, prayers_y_pct: 0,
        quran_size:   100, quran_x_pct:   0, quran_y_pct:   0,
        date_size:    100, date_x_pct:    0, date_y_pct:    0,
        next_size:    100, next_x_pct:    0, next_y_pct:    0,
        // Identity sizing & position
        logo_size: 100,
        identity_size: 100,
        identity_position: 'left',
        identity_x_pct: 0,
        identity_y_pct: 0,
        logo_position: 'right',
        date_position: 'auto',
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
        'cinema', 'classic',
        'theater', 'showcase', 'polaroid',
        'window', 'festival',
        'galaxy', 'geometric', 'marble', 'sunset',
        'glass', 'newspaper', 'heritage', 'mono',
        'arabesque', 'royal', 'jade',
        // Photo-frame themes (foto + jam besar + jadwal horizontal)
        'gallery', 'studio', 'memory',
        // Big-schedule themes (kartu jadwal sholat besar/jelas)
        'bigboard', 'pulpit', 'tower', 'beacon',
        // Vertical prayer-card themes (jadwal sholat tersusun tegak)
        'vertical', 'pillar', 'stack', 'rack', 'column',
        // Ornament-rich themes (Islamic visual languages)
        'lantern',
        // Special themed layouts with custom assets
        'special1', 'special3',
        // Photo-frame + centered-logo themes
        'exhibit', 'pavilion', 'shrine', 'atrium', 'dome', 'minaret',
        'sanctuary', 'terrace',
        'oasis', 'arch', 'courtyard', 'panorama',
        // Full-background-photo layouts (slideshow as full BG)
        'fullphoto1', 'fullphoto2', 'fullphoto3', 'fullphoto4', 'fullphoto5',
        'fullphoto6', 'fullphoto7', 'fullphoto8', 'fullphoto9', 'fullphoto10',
        'fullphoto11', 'fullphoto12', 'fullphoto13', 'fullphoto14', 'fullphoto15',
        'fullphoto16', 'fullphoto17', 'fullphoto18', 'fullphoto19', 'fullphoto20'
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
        const safe = SUPPORTED_LAYOUTS.includes(name) ? name : 'cinema';
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
        setTimeout(autoFitVerticalOverflow, 50);
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
        const lightThemes = ['layout-andalusia'];
        const isLight = lightThemes.some(c => root.classList.contains(c));

        const slot = document.createElement('div');
        slot.className = 'slideshow-host absolute inset-0';

        const scrim = document.createElement('div');
        scrim.className = 'absolute inset-0';
        scrim.style.pointerEvents = 'none';
        scrim.style.zIndex = '0';
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

        // Logo size — scale the #logoBox based on logo_size/100.
        if (box) {
            const logoScale = Math.max(50, Math.min(200, parseInt(cfg.logo_size, 10) || 100)) / 100;
            box.style.transform = logoScale !== 1 ? `scale(${logoScale})` : '';
            box.style.transformOrigin = 'center center';
        }

        // Logo position — controls whether the logo appears to the right
        // of the identity text ("right", default) or above it ("top").
        // We achieve this by setting flex-direction on the logo's parent
        // container (which typically holds logo + name/address as siblings).
        if (box) {
            const logoPos = cfg.logo_position || 'right';
            const identParent = box.parentElement;
            if (identParent && identParent.tagName !== 'HEADER') {
                if (logoPos === 'top') {
                    identParent.style.flexDirection = 'column';
                    identParent.style.alignItems = identParent.style.alignItems || 'flex-start';
                    // Move logo before text siblings by reinserting as first child
                    if (box !== identParent.firstElementChild) {
                        identParent.insertBefore(box, identParent.firstElementChild);
                    }
                } else {
                    // "right" — default row layout, logo after text
                    identParent.style.flexDirection = '';
                }
            }
        }

        // Identity text size — scale #masjidName and #masjidAddress font-size.
        const identityScale = Math.max(50, Math.min(200, parseInt(cfg.identity_size, 10) || 100)) / 100;
        if (nameEl) nameEl.style.fontSize = identityScale !== 1 ? `${identityScale}em` : '';
        if (addrEl) addrEl.style.fontSize = identityScale !== 1 ? `${identityScale}em` : '';

        // Identity position — control alignment of the header identity block.
        const idPos = cfg.identity_position || 'left';
        // Use closest('header') for robust header lookup instead of fragile parentElement traversal.
        const identityEl = box || nameEl;
        const header = identityEl ? identityEl.closest('header') : null;

        // Date position — resolve 'auto' to a concrete position based on identity_position.
        // auto: identity left => date right, identity center => date center, identity right => date left.
        let datePos = cfg.date_position;
        if (!datePos || datePos === 'auto') {
            if (idPos === 'left') datePos = 'right';
            else if (idPos === 'right') datePos = 'left';
            else datePos = 'center';
        }

        const gregDate = $('#greg-date');
        const hijDate = $('#hij-date');
        const dateContainer = gregDate ? gregDate.parentElement : (hijDate ? hijDate.parentElement : null);

        if (header) {
            // Reset inline styles first
            header.style.justifyContent = '';
            header.style.flexDirection = '';
            header.style.alignItems = '';
            header.style.textAlign = '';
            header.style.flexWrap = '';
            header.style.position = '';
            if (dateContainer) {
                dateContainer.style.justifyContent = '';
                dateContainer.style.textAlign = '';
                dateContainer.style.alignSelf = '';
                dateContainer.style.marginLeft = '';
                dateContainer.style.marginRight = '';
                dateContainer.style.position = '';
                dateContainer.style.left = '';
                dateContainer.style.right = '';
                dateContainer.style.transform = '';
                dateContainer.style.order = '';
                dateContainer.style.width = '';
            }
            // Reset identity block order
            const identityBlock = identityEl ? identityEl.closest('header > *') || identityEl.parentElement : null;
            if (identityBlock && identityBlock !== header) {
                identityBlock.style.order = '';
            }
            // Reset logo positioning (may have been set to absolute in center+center mode)
            if (box) {
                box.style.position = '';
                box.style.left = '';
                box.style.top = '';
                // Restore logo scale transform (don't clear transform entirely, re-apply logo_size)
                const logoScale = Math.max(50, Math.min(200, parseInt(cfg.logo_size, 10) || 100)) / 100;
                box.style.transform = logoScale !== 1 ? `scale(${logoScale})` : '';
                const identParent = box.parentElement;
                if (identParent && identParent !== header) {
                    identParent.style.flexDirection = '';
                    identParent.style.alignItems = '';
                    identParent.style.textAlign = '';
                    identParent.style.position = '';
                    identParent.style.paddingTop = '';
                }
            }

            // Detect if the header uses column flex-direction (e.g. fullphoto1, fullphoto4).
            const isColumnFlex = header.classList.contains('flex-col') ||
                getComputedStyle(header).flexDirection === 'column';

            if (idPos === 'center' && datePos === 'center') {
                // Both centered: stack vertically, center-align all text.
                // Logo should NOT affect centering of text elements.
                if (!isColumnFlex) {
                    header.style.flexDirection = 'column';
                }
                header.style.alignItems = 'center';
                header.style.textAlign = 'center';
                if (dateContainer) {
                    dateContainer.style.textAlign = 'center';
                    dateContainer.style.alignSelf = 'center';
                    dateContainer.style.width = '100%';
                }
                // Make the logo absolute so it doesn't shift the text centering
                if (box) {
                    box.style.position = 'absolute';
                    box.style.left = '50%';
                    box.style.transform = 'translateX(-50%)';
                    box.style.top = '0';
                    // Adjust the identity block to not include logo in flex flow
                    const identParent = box.parentElement;
                    if (identParent && identParent !== header) {
                        identParent.style.flexDirection = 'column';
                        identParent.style.alignItems = 'center';
                        identParent.style.textAlign = 'center';
                        identParent.style.position = 'relative';
                        identParent.style.paddingTop = (box.offsetHeight || 40) + 8 + 'px';
                    }
                }
            } else if (idPos === 'center' && datePos !== 'center') {
                // Identity centered, date on a side: use column for identity, position date absolutely.
                if (!isColumnFlex) {
                    header.style.flexDirection = 'column';
                }
                header.style.alignItems = 'center';
                header.style.textAlign = 'center';
                header.style.position = 'relative';
                if (dateContainer) {
                    dateContainer.style.position = 'absolute';
                    dateContainer.style.top = '50%';
                    dateContainer.style.transform = 'translateY(-50%)';
                    if (datePos === 'right') {
                        dateContainer.style.right = '2rem';
                        dateContainer.style.textAlign = 'right';
                    } else {
                        dateContainer.style.left = '2rem';
                        dateContainer.style.textAlign = 'left';
                    }
                }
            } else if (idPos === 'left' && datePos === 'right') {
                // Default natural layout: space-between keeps identity left, date right.
                // Do NOT override justifyContent - let the original class handle it.
                header.style.justifyContent = 'space-between';
                if (dateContainer) {
                    dateContainer.style.textAlign = 'right';
                }
            } else if (idPos === 'right' && datePos === 'left') {
                // Swap: date goes left, identity goes right. Use row-reverse or order.
                header.style.justifyContent = 'space-between';
                if (isColumnFlex) {
                    header.style.alignItems = 'flex-end';
                } else {
                    header.style.flexDirection = 'row-reverse';
                }
                if (dateContainer) {
                    dateContainer.style.textAlign = 'left';
                }
            } else if (idPos === 'left' && datePos === 'left') {
                // Both left: identity first, date after, both at flex-start.
                header.style.justifyContent = 'flex-start';
                if (dateContainer) {
                    dateContainer.style.marginLeft = '1.5rem';
                    dateContainer.style.textAlign = 'left';
                }
            } else if (idPos === 'right' && datePos === 'right') {
                // Both right: pack everything to the end.
                header.style.justifyContent = 'flex-end';
                if (isColumnFlex) {
                    header.style.alignItems = 'flex-end';
                }
                if (dateContainer) {
                    dateContainer.style.marginLeft = '1.5rem';
                    dateContainer.style.textAlign = 'right';
                }
            } else if (idPos === 'left' && datePos === 'center') {
                // Identity left, date centered absolutely.
                header.style.justifyContent = 'flex-start';
                header.style.position = 'relative';
                if (dateContainer) {
                    dateContainer.style.position = 'absolute';
                    dateContainer.style.left = '50%';
                    dateContainer.style.top = '50%';
                    dateContainer.style.transform = 'translate(-50%, -50%)';
                    dateContainer.style.textAlign = 'center';
                }
            } else if (idPos === 'right' && datePos === 'center') {
                // Identity right, date centered absolutely.
                header.style.justifyContent = 'flex-end';
                if (isColumnFlex) {
                    header.style.alignItems = 'flex-end';
                }
                header.style.position = 'relative';
                if (dateContainer) {
                    dateContainer.style.position = 'absolute';
                    dateContainer.style.left = '50%';
                    dateContainer.style.top = '50%';
                    dateContainer.style.transform = 'translate(-50%, -50%)';
                    dateContainer.style.textAlign = 'center';
                }
            } else {
                // Fallback: space-between
                header.style.justifyContent = 'space-between';
                if (dateContainer) {
                    dateContainer.style.textAlign = datePos === 'right' ? 'right' : (datePos === 'center' ? 'center' : 'left');
                }
            }
        } else if (dateContainer) {
            // No header found, just style the date container directly
            dateContainer.style.textAlign = datePos === 'right' ? 'right' : (datePos === 'center' ? 'center' : 'left');
            dateContainer.style.alignSelf = datePos === 'right' ? 'flex-end' : (datePos === 'center' ? 'center' : 'flex-start');
        }
        // Also set text-align on individual date elements for consistency
        if (gregDate) gregDate.style.textAlign = datePos === 'center' ? 'center' : (datePos === 'right' ? 'right' : 'left');
        if (hijDate) hijDate.style.textAlign = datePos === 'center' ? 'center' : (datePos === 'right' ? 'right' : 'left');

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

        // License watermark — show "DEMO VERSION" overlay when not Pro.
        applyLicenseWatermark();

        // Transparent-container passthrough logic.
        // Containers that are visually transparent should not block/clip
        // adjacent content. Only sections with a visible background
        // should reserve space and visually block things behind them.
        applyTransparentPassthrough();
        setTimeout(autoFitVerticalOverflow, 50);
    }

    /* ===== Transparent passthrough helpers ===== */

    /**
     * Check whether an element is visually transparent (no background
     * color, no background image, no backdrop-filter, no glass class).
     */
    function isElTransparent(el) {
        if (!el) return false;
        var cs = getComputedStyle(el);
        var bg = cs.backgroundColor;
        var bgImage = cs.backgroundImage;
        var hasBackdrop = cs.backdropFilter && cs.backdropFilter !== 'none';
        if (!hasBackdrop) {
            // Webkit prefix fallback
            var wkBackdrop = cs.webkitBackdropFilter;
            hasBackdrop = wkBackdrop && wkBackdrop !== 'none';
        }
        var hasBgClass = /\b(bg-(?!transparent\b|opacity\b)\S+|glass-dark|glass|backdrop-blur)\b/.test(el.className);
        var hasInlineBg = el.style.background ||
            (el.style.backgroundColor && el.style.backgroundColor !== 'transparent' && el.style.backgroundColor !== 'rgba(0, 0, 0, 0)');
        var bgTransparent = (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)');
        var noBgImage = (!bgImage || bgImage === 'none');
        return bgTransparent && noBgImage && !hasBackdrop && !hasBgClass && !hasInlineBg;
    }

    /**
     * Apply passthrough to a single element. When transparent, it is taken
     * out of normal flow so it does not reserve space or clip adjacent content.
     * When it has a visible background, it stays in normal flow.
     *
     * @param {Element} el - The container element
     * @param {string} anchor - 'top' or 'bottom' positioning when absolute
     */
    function setPassthrough(el, anchor) {
        if (!el) return;
        if (isElTransparent(el)) {
            // Already positioned by identity_position logic: skip if position
            // was set to relative for absolute children (e.g. date_position).
            // Also skip if the element was explicitly set to 'relative' by
            // other code (identity positioning needs it for absolute children).
            var needsRelative = el.style.position === 'relative' ||
                                el.querySelector('[style*="position: absolute"]') ||
                                el.querySelector('[style*="position:absolute"]');
            if (!needsRelative) {
                el.style.position = 'absolute';
                el.style.left = '0';
                el.style.right = '0';
                if (anchor === 'bottom') {
                    // Offset from the bottom by the combined height of the
                    // fixed quran bar + ticker so the prayer section never
                    // overlaps those bottom-pinned elements.
                    el.style.bottom = 'calc(var(--ticker-h, 0px) + var(--quran-h, 0px))';
                    el.style.top = '';
                } else {
                    el.style.top = '0';
                    el.style.bottom = '';
                }
            }
            el.style.zIndex = '0';
            el.style.pointerEvents = 'none';
            var children = el.children;
            for (var i = 0; i < children.length; i++) {
                children[i].style.pointerEvents = 'auto';
            }
            el.dataset.passthrough = '1';
        } else {
            // Has visible background - ensure it is in normal flow.
            if (el.dataset.passthrough === '1') {
                if (el.style.position === 'absolute' && !el.classList.contains('absolute')) {
                    el.style.position = '';
                    el.style.left = '';
                    el.style.right = '';
                    el.style.top = '';
                    el.style.bottom = '';
                }
                el.style.zIndex = '';
                el.style.pointerEvents = '';
                var children2 = el.children;
                for (var j = 0; j < children2.length; j++) {
                    children2[j].style.pointerEvents = '';
                }
                delete el.dataset.passthrough;
            }
        }
    }

    /**
     * For the quran bar: when a sidebar/vertical-prayer layout is active,
     * shrink the quran bar width so it does not cover the sidebar area.
     * The quran card itself is already pointer-events:none, but visually
     * its backdrop-filter and background cover the full width.
     */
    function applyQuranPassthrough() {
        var bar = document.getElementById('quranBar');
        if (!bar) return;
        var inner = document.getElementById('quranInner');
        if (!inner) return;

        // Detect sidebar-style layouts with vertical prayer cards.
        var host = document.getElementById('layoutHost');
        if (!host) return;
        var aside = host.querySelector('aside');
        var hasSidebar = aside && aside.querySelector('[data-key]');

        // Cinema layout uses a 3-column grid with an <aside> for prayer
        // times, but it's NOT a sidebar layout — quranBar should span
        // full width and center the card visually.
        var isCinema = host.querySelector('.layout-cinema');
        if (isCinema) hasSidebar = false;

        if (hasSidebar) {
            // Get the sidebar's width so quranBar avoids that area.
            var sidebarRect = aside.getBoundingClientRect();
            var isLeft = sidebarRect.left < window.innerWidth / 2;
            if (isLeft) {
                bar.style.left = sidebarRect.width + 'px';
                bar.style.right = '0';
            } else {
                bar.style.left = '0';
                bar.style.right = sidebarRect.width + 'px';
            }
        } else {
            // Reset to full width (default).
            bar.style.left = '0';
            bar.style.right = '0';
        }
    }

    function applyTransparentPassthrough() {
        var host = document.getElementById('layoutHost');
        if (!host) return;
        var screen = host.querySelector('.app-screen');
        if (!screen) return;

        // Apply to the header (identity area) - it is at the top.
        var hdr = screen.querySelector('header.row-fixed');
        if (hdr) setPassthrough(hdr, 'top');

        // Apply to bottom sections with prayer cards (section.row-fixed).
        // IMPORTANT: Never passthrough a section that contains prayer
        // schedule cards ([data-key]) — those MUST remain in flex flow
        // so they sit at the bottom of the viewport, not float to center.
        var sections = screen.querySelectorAll('section.row-fixed');
        for (var i = 0; i < sections.length; i++) {
            if (sections[i].querySelector('[data-key]')) {
                // Revert any stale passthrough on prayer sections
                if (sections[i].dataset.passthrough === '1') {
                    sections[i].style.position = '';
                    sections[i].style.left = '';
                    sections[i].style.right = '';
                    sections[i].style.top = '';
                    sections[i].style.bottom = '';
                    sections[i].style.zIndex = '';
                    sections[i].style.pointerEvents = '';
                    delete sections[i].dataset.passthrough;
                }
                continue;
            }
            setPassthrough(sections[i], 'bottom');
        }

        // Handle quran bar passthrough for sidebar layouts.
        applyQuranPassthrough();
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
            // Reset digital autofit on layout change
            _lastDigitalStyle = '';
            _digitalFitSize = '';
        }

        // Rebuild analog clock face if the style changed.
        if (prev.analog_style !== state.cfg.analog_style) {
            const ticks = $('#ticks');
            const nums  = $('#numerals');
            if (ticks) ticks.innerHTML = '';
            if (nums) nums.innerHTML = '';
            buildAnalogStatic();
        }

        // Reset digital autofit cache when style or hide_seconds changes
        if (prev.digital_style !== state.cfg.digital_style ||
            prev.hide_seconds !== state.cfg.hide_seconds) {
            _lastDigitalStyle = '';
            _digitalFitSize = '';
        }

        applyConfigToDom();
        renderTimes();   // refresh card values for new DOM nodes
        loadHijri();     // re-render hijri date on fresh DOM (fixes blank after theme switch)
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

            // Apply ticker style + background. Both are surfaced to CSS
            // via data-attributes so the stylesheet can branch without
            // any inline overrides leaking between style switches.
            const style = cfg.ticker_style || 'classic';
            bar.dataset.tickerStyle = style;
            bar.dataset.tickerBg = cfg.ticker_bg || 'solid_dark';
            content.className = 'marquee-inner';  // reset
            // Reset properties that individual cases below may have set
            // on a previous render. Without this, switching from
            // typewriter back to classic leaves stale animation/width.
            content.style.animationIterationCount = '';
            content.style.width = '';
            content.style.paddingLeft = '';
            switch (style) {
                case 'bounce':
                    content.style.animationName = 'tickerBounce';
                    content.style.animationTimingFunction = 'ease-in-out';
                    break;
                case 'fade':
                    content.style.animationName = 'tickerFade';
                    content.style.animationTimingFunction = 'ease';
                    content.style.paddingLeft = '0';
                    break;
                case 'neon':
                    content.classList.add('ticker-neon');
                    content.style.animationName = 'ticker';
                    content.style.animationTimingFunction = 'linear';
                    break;
                case 'typewriter':
                    // True typewriter: width animates 0→100% in steps so
                    // characters appear one-by-one, then briefly holds
                    // and resets. The blinking caret is composed via a
                    // second keyframe (tickerCaretBlink) running on the
                    // same element. Padding-left:0 is enforced by the
                    // CSS data-attribute rule so the text actually
                    // appears in the visible bar instead of being
                    // pushed off-screen by the classic-scroll offset.
                    content.style.paddingLeft = '0';
                    // Cap step count to character length so each step
                    // reveals one character. Fall back to a reasonable
                    // default for very short / empty strings.
                    {
                        const charCount = Math.max(8, formatted.length);
                        content.style.animationName = 'tickerTypewriter, tickerCaretBlink';
                        content.style.animationTimingFunction = `steps(${charCount}, end), steps(1, end)`;
                        content.style.animationDuration = `${speed}s, 0.7s`;
                        content.style.animationIterationCount = 'infinite, infinite';
                    }
                    break;
                case 'classic':
                default:
                    content.style.animationName = 'ticker';
                    content.style.animationTimingFunction = 'linear';
                    break;
            }
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

    const QURAN_MODES = ['fullcard', 'card', 'typewriter', 'slide', 'marquee', 'fade', 'flip', 'glow', 'minimalcard', 'scroll'];

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
            // Re-run autofit and collision check after the quran height is
            // established so prayer cards adjust to the new available space.
            setTimeout(() => {
                autoFitVerticalOverflow();
                preventPrayerQuranCollision();
            }, 30);
        });

        // Install a ResizeObserver (once) so that whenever the quran bar
        // changes height (e.g. font load, ayat rotation, mode switch),
        // the reserved space stays accurate and layouts don't overlap.
        if (!bar._quranRO) {
            bar._quranRO = new ResizeObserver(() => {
                const h2 = bar.getBoundingClientRect().height || 0;
                document.documentElement.style.setProperty('--quran-h', Math.ceil(h2) + 'px');
                // Re-check collision after height changes.
                preventPrayerQuranCollision();
            });
            bar._quranRO.observe(bar);
        }
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
            case 'fade':       renderFade(ayat);       break;
            case 'flip':       renderFlip(ayat);       break;
            case 'glow':       renderGlow(ayat);       break;
            case 'minimalcard':renderMinimalCard(ayat); break;
            case 'scroll':     renderScroll(ayat);     break;
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

    /* ===== New Quran modes: fade, flip, glow, minimalcard, scroll ===== */

    function renderFade(ayat) {
        const card = document.querySelector('#quranBar .q-card');
        if (!card) { setAyatText(ayat); return; }
        // Fade out, swap text, fade in
        card.style.transition = 'opacity 0.4s ease';
        card.style.opacity = '0';
        setTimeout(() => {
            setAyatText(ayat);
            card.style.opacity = '1';
        }, 400);
        reserveQuranSpace(document.getElementById('quranBar'));
    }

    function renderFlip(ayat) {
        const card = document.querySelector('#quranBar .q-card');
        if (!card) { setAyatText(ayat); return; }
        // Flip animation: rotate out on Y axis, swap text, rotate back
        card.style.transition = 'transform 0.3s ease';
        card.style.transform = 'rotateX(90deg)';
        setTimeout(() => {
            setAyatText(ayat);
            card.style.transform = 'rotateX(0deg)';
        }, 300);
        reserveQuranSpace(document.getElementById('quranBar'));
    }

    function renderGlow(ayat) {
        const card = document.querySelector('#quranBar .q-card');
        if (!card) { setAyatText(ayat); return; }
        setAyatText(ayat);
        // Pulse glow effect on the card
        card.style.transition = 'box-shadow 0.6s ease';
        card.style.boxShadow = '0 0 30px var(--accent), 0 0 60px var(--accent)';
        setTimeout(() => {
            card.style.boxShadow = '';
        }, 1200);
        reserveQuranSpace(document.getElementById('quranBar'));
    }

    function renderMinimalCard(ayat) {
        setAyatText(ayat);
        // Minimal mode: CSS handles the transparent look via data-mode attr.
        // No inline style manipulation needed — keeps card tidy.
        reserveQuranSpace(document.getElementById('quranBar'));
    }

    function renderScroll(ayat) {
        const card = document.querySelector('#quranBar .q-card');
        if (!card) { setAyatText(ayat); return; }
        // Scroll up out, then scroll up in from below
        card.style.transition = 'transform 0.35s ease, opacity 0.35s ease';
        card.style.transform = 'translateY(-100%)';
        card.style.opacity = '0';
        setTimeout(() => {
            setAyatText(ayat);
            card.style.transition = 'none';
            card.style.transform = 'translateY(100%)';
            // Force reflow
            void card.offsetWidth;
            card.style.transition = 'transform 0.35s ease, opacity 0.35s ease';
            card.style.transform = 'translateY(0)';
            card.style.opacity = '1';
        }, 350);
        reserveQuranSpace(document.getElementById('quranBar'));
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

        // "Menuju Sholat" countdown pill — every layout exposes it under
        // #nextPill. We transform it independently of the digital clock
        // (which lives under #digital) so users can enlarge the
        // countdown without resizing the time.
        apply('#nextPill', cfg.next_size, cfg.next_x_pct, cfg.next_y_pct,
              'center center');

        // Date block (Gregorian + Hijri). Each layout has its own
        // wrapper — `#greg-date` and `#hij-date` are siblings inside a
        // small text-right div in the header. We find that common
        // ancestor and transform it as a unit so both lines move /
        // resize together. Origin: top right, since most layouts pin
        // the date to the right edge of the header.
        const dateWrap = findDateContainer();
        if (dateWrap) {
            apply(uniqueDateSelector(dateWrap),
                  cfg.date_size, cfg.date_x_pct, cfg.date_y_pct,
                  'top right');
        }

        // Identity header block — translate the entire header (logo +
        // name + address) using identity_x_pct / identity_y_pct. The
        // identity_size scaling is handled separately in applyConfigToDom
        // (per-text element), so here we only apply the translate offset.
        const identityHeader = (function () {
            const el = document.getElementById('logoBox') || document.getElementById('masjidName');
            return el ? el.closest('header') : null;
        })();
        if (identityHeader) {
            const ix = Math.max(-50, Math.min(50, parseInt(cfg.identity_x_pct, 10) || 0));
            const iy = Math.max(-50, Math.min(50, parseInt(cfg.identity_y_pct, 10) || 0));
            const isDefault = ix === 0 && iy === 0;
            identityHeader.style.transform = isDefault ? '' : `translate(${ix}vw, ${iy}vh)`;
            identityHeader.style.willChange = isDefault ? '' : 'transform';
        }

        // After all transforms are applied, schedule a collision check
        // so that visually the prayer section never overlaps the quran bar.
        requestAnimationFrame(preventPrayerQuranCollision);
    }

    /**
     * Prevent the prayer-card section from visually overlapping the
     * quran bar. After layout-editor transforms (translate/scale) are
     * applied, the prayer section might extend below its intended area
     * and collide with the fixed-bottom quran bar. This function
     * detects the overlap using bounding rects and nudges the prayer
     * section upward with an additional translateY correction.
     */
    function preventPrayerQuranCollision() {
        const bar = document.getElementById('quranBar');
        if (!bar || bar.style.display === 'none') return;

        const host = document.getElementById('layoutHost');
        if (!host) return;
        const prayerSection = findPrayerContainer();
        if (!prayerSection) return;

        // Strip any previous collision correction so we measure the
        // "natural" position (with only layout-editor transforms).
        const currentTransform = prayerSection.style.transform || '';
        const baseTransform = currentTransform.replace(/translateY\(-\d+(\.\d+)?px\)\s*/g, '').trim();
        if (currentTransform !== baseTransform) {
            prayerSection.style.transform = baseTransform || '';
        }

        // Force a synchronous layout so rects reflect the base position.
        const barRect = bar.getBoundingClientRect();
        const prayerRect = prayerSection.getBoundingClientRect();

        // If there's no quran bar height, nothing to collide with.
        if (barRect.height <= 0) return;

        // Calculate overlap: how many pixels the prayer section's bottom
        // extends below the quran bar's top.
        const overlap = prayerRect.bottom - barRect.top;
        if (overlap <= 0) return; // No collision

        // Apply a correction by shifting upward by the overlap + a gap.
        const gap = 8; // px of breathing room
        const correction = Math.ceil(overlap + gap);

        if (baseTransform) {
            prayerSection.style.transform = `translateY(-${correction}px) ` + baseTransform;
        } else {
            prayerSection.style.transform = `translateY(-${correction}px)`;
        }
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

    /**
     * Find the wrapper that contains both `#greg-date` and `#hij-date`
     * in the active layout. They're always siblings inside a small
     * text-right div in the header; we walk up from the Gregorian
     * date until we reach a node that contains the Hijri one too.
     */
    function findDateContainer() {
        const host = document.getElementById('layoutHost');
        if (!host) return null;
        const greg = host.querySelector('#greg-date');
        const hij  = host.querySelector('#hij-date');
        if (!greg) return null;
        // Some templates use only one of the two. Fall back to the
        // single element's parent so the user can still resize it.
        if (!hij) return greg.parentElement;
        let node = greg.parentElement;
        while (node && node !== host) {
            if (node.contains(hij)) return node;
            node = node.parentElement;
        }
        return greg.parentElement;
    }

    /** Same idea as [uniqueSelectorFor] but for the date wrapper. */
    function uniqueDateSelector(el) {
        if (!el) return null;
        if (!el.dataset.mcEditorSlot) {
            el.dataset.mcEditorSlot = 'date';
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

        // Arabic-style fonts need a serif or Arabic fallback chain rather
        // than system-ui / monospace, so the browser picks a matching
        // generic when glyphs are missing.
        const ARABIC_FONTS = [
            'amiri', 'scheherazade new', 'cairo', 'noto kufi arabic',
            'el messiri', 'reem kufi', 'lateef', 'harmattan',
            'noto naskh arabic', 'aref ruqaa', 'marhey', 'readex pro',
            'tajawal', 'changa', 'almarai', 'lalezar', 'rakkas',
            'baloo bhaijaan 2', 'kufam', 'mirza', 'vibes', 'mada'
        ];

        const isArabicDisplay = ARABIC_FONTS.includes(display.toLowerCase());
        const isArabicDigital = ARABIC_FONTS.includes(digital.toLowerCase());

        // Quote the family name in the CSS rule so multi-word fonts
        // ('Plus Jakarta Sans', 'Press Start 2P', etc.) resolve correctly.
        const displayFallback = isArabicDisplay
            ? `"${display}", "Amiri", "Traditional Arabic", serif`
            : `"${display}", system-ui, sans-serif`;
        const digitalFallback = isArabicDigital
            ? `"${digital}", "Cairo", "Noto Kufi Arabic", sans-serif`
            : `"${digital}", "Orbitron", monospace`;

        document.documentElement.style.setProperty('--font-display', displayFallback);
        document.documentElement.style.setProperty('--font-digital', digitalFallback);

        // Add a body class for layout CSS to target Arabic font mode.
        document.body.classList.toggle('arabic-font-active', isArabicDisplay || isArabicDigital);

        // Re-run the prayer-card auto-fit once the chosen fonts actually
        // arrive over the network. Without this, switching to a wider
        // font would leave clipped text on screen until the next clock
        // tick (or layout change) triggered renderTimes() again.
        if (document.fonts && typeof document.fonts.ready?.then === 'function') {
            document.fonts.ready.then(() => {
                requestAnimationFrame(autoFitPrayerCards);
            }).catch(() => {});
        } else {
            // Older WebView fallback: defer 250ms so the @font-face has
            // had a chance to load before we measure.
            setTimeout(autoFitPrayerCards, 250);
        }
    }

    /**
     * Show or hide the "DEMO VERSION" watermark depending on cfg.is_pro.
     * When not Pro, a fixed overlay covers the screen with a semi-transparent
     * banner reminding the user to purchase a license.
     */
    function applyLicenseWatermark() {
        const cfg = state.cfg;
        const isPro = cfg.is_pro === true;
        let overlay = document.getElementById('demoWatermark');

        if (isPro) {
            // Pro user: remove watermark if present
            if (overlay) overlay.remove();
            return;
        }

        // Demo mode: create watermark if not already present
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'demoWatermark';
            overlay.style.cssText = 'position:fixed;inset:0;z-index:40;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;';
            overlay.innerHTML = `
                <div style="background:rgba(0,0,0,0.75);padding:24px 48px;border-radius:16px;text-align:center;border:2px solid rgba(255,255,255,0.3);">
                    <div style="font-size:clamp(24px,4vw,48px);font-weight:900;color:#ff4444;letter-spacing:4px;text-transform:uppercase;text-shadow:0 2px 8px rgba(0,0,0,0.5);">DEMO VERSION</div>
                    <div style="margin-top:12px;font-size:clamp(14px,2vw,24px);color:#ffffff;font-weight:600;">Hubungi 082325942017</div>
                    <div style="margin-top:6px;font-size:clamp(11px,1.5vw,16px);color:rgba(255,255,255,0.7);">untuk membeli lisensi Pro</div>
                </div>
            `;
            document.body.appendChild(overlay);
        }
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

    const ANALOG_STYLES = ['classic', 'modern', 'minimal', 'roman', 'arabic', 'dots', 'skeleton', 'luxury', 'sport', 'radar'];

    function buildAnalogStatic() {
        const ticks = $('#ticks');
        const nums  = $('#numerals');
        if (!ticks || !nums) return;

        const analogStyle = ANALOG_STYLES.includes(state.cfg.analog_style) ? state.cfg.analog_style : 'classic';
        const svgNS = 'http://www.w3.org/2000/svg';

        // Apply analog style class to the SVG root for CSS targeting
        const svg = document.getElementById('analog');
        if (svg) {
            // Skip rebuild if already built for this style
            if (svg.dataset.analogStyle === analogStyle && ticks.childNodes.length) return;
            svg.dataset.analogStyle = analogStyle;
            // Remove previous style classes
            ANALOG_STYLES.forEach(s => svg.classList.remove('analog-' + s));
            svg.classList.add('analog-' + analogStyle);
        }

        // Clear existing content for rebuild
        ticks.innerHTML = '';
        nums.innerHTML = '';

        buildAnalogByStyle(analogStyle, ticks, nums, svgNS);
    }

    function buildAnalogByStyle(style, ticks, nums, svgNS) {
        switch (style) {
            case 'modern':
                // Clean modern: only hour markers, no numerals, thick bars
                for (let i = 0; i < 12; i++) {
                    const angle = i * 30;
                    const rad = (angle - 90) * Math.PI / 180;
                    const line = document.createElementNS(svgNS, 'line');
                    line.setAttribute('x1', (74 * Math.cos(rad)).toFixed(2));
                    line.setAttribute('y1', (74 * Math.sin(rad)).toFixed(2));
                    line.setAttribute('x2', (84 * Math.cos(rad)).toFixed(2));
                    line.setAttribute('y2', (84 * Math.sin(rad)).toFixed(2));
                    line.setAttribute('stroke-width', '3');
                    line.setAttribute('stroke', '#ffffff');
                    line.setAttribute('stroke-linecap', 'round');
                    ticks.appendChild(line);
                }
                break;

            case 'minimal':
                // Only 4 markers at 12, 3, 6, 9
                [0, 90, 180, 270].forEach(angle => {
                    const rad = (angle - 90) * Math.PI / 180;
                    const line = document.createElementNS(svgNS, 'line');
                    line.setAttribute('x1', (72 * Math.cos(rad)).toFixed(2));
                    line.setAttribute('y1', (72 * Math.sin(rad)).toFixed(2));
                    line.setAttribute('x2', (84 * Math.cos(rad)).toFixed(2));
                    line.setAttribute('y2', (84 * Math.sin(rad)).toFixed(2));
                    line.setAttribute('stroke-width', '2.5');
                    line.setAttribute('stroke', '#ffffff');
                    line.setAttribute('stroke-linecap', 'round');
                    ticks.appendChild(line);
                });
                break;

            case 'roman':
                // Roman numerals
                for (let i = 0; i < 60; i++) {
                    const angle = i * 6;
                    const isHour = i % 5 === 0;
                    if (!isHour) {
                        const rad = (angle - 90) * Math.PI / 180;
                        const line = document.createElementNS(svgNS, 'line');
                        line.setAttribute('x1', (80 * Math.cos(rad)).toFixed(2));
                        line.setAttribute('y1', (80 * Math.sin(rad)).toFixed(2));
                        line.setAttribute('x2', (84 * Math.cos(rad)).toFixed(2));
                        line.setAttribute('y2', (84 * Math.sin(rad)).toFixed(2));
                        line.setAttribute('stroke-width', '0.5');
                        ticks.appendChild(line);
                    }
                }
                const romanNums = ['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI'];
                for (let n = 0; n < 12; n++) {
                    const a = n * 30;
                    const rad = (a - 90) * Math.PI / 180;
                    const t = document.createElementNS(svgNS, 'text');
                    t.setAttribute('x', (65 * Math.cos(rad)).toFixed(2));
                    t.setAttribute('y', (65 * Math.sin(rad)).toFixed(2));
                    t.setAttribute('font-size', '9');
                    t.setAttribute('font-weight', '700');
                    t.setAttribute('fill', '#0f172a');
                    t.setAttribute('text-anchor', 'middle');
                    t.setAttribute('dominant-baseline', 'central');
                    t.setAttribute('font-family', 'serif');
                    t.textContent = romanNums[n];
                    nums.appendChild(t);
                }
                break;

            case 'arabic':
                // Arabic/Eastern Arabic numerals
                const arabicNums = ['١٢','١','٢','٣','٤','٥','٦','٧','٨','٩','١٠','١١'];
                for (let i = 0; i < 60; i++) {
                    const angle = i * 6;
                    const isHour = i % 5 === 0;
                    const rad = (angle - 90) * Math.PI / 180;
                    const line = document.createElementNS(svgNS, 'line');
                    line.setAttribute('x1', ((isHour ? 75 : 80) * Math.cos(rad)).toFixed(2));
                    line.setAttribute('y1', ((isHour ? 75 : 80) * Math.sin(rad)).toFixed(2));
                    line.setAttribute('x2', (84 * Math.cos(rad)).toFixed(2));
                    line.setAttribute('y2', (84 * Math.sin(rad)).toFixed(2));
                    line.setAttribute('stroke-width', isHour ? '2' : '0.7');
                    ticks.appendChild(line);
                }
                for (let n = 0; n < 12; n++) {
                    const a = n * 30;
                    const rad = (a - 90) * Math.PI / 180;
                    const t = document.createElementNS(svgNS, 'text');
                    t.setAttribute('x', (62 * Math.cos(rad)).toFixed(2));
                    t.setAttribute('y', (62 * Math.sin(rad)).toFixed(2));
                    t.setAttribute('font-size', '11');
                    t.setAttribute('font-weight', '700');
                    t.setAttribute('fill', '#0f172a');
                    t.setAttribute('text-anchor', 'middle');
                    t.setAttribute('dominant-baseline', 'central');
                    t.setAttribute('font-family', "'Amiri', serif");
                    t.textContent = arabicNums[n];
                    nums.appendChild(t);
                }
                break;

            case 'dots':
                // Dot markers instead of lines
                for (let i = 0; i < 12; i++) {
                    const angle = i * 30;
                    const rad = (angle - 90) * Math.PI / 180;
                    const circle = document.createElementNS(svgNS, 'circle');
                    circle.setAttribute('cx', (78 * Math.cos(rad)).toFixed(2));
                    circle.setAttribute('cy', (78 * Math.sin(rad)).toFixed(2));
                    circle.setAttribute('r', i === 0 ? '4' : '2.5');
                    circle.setAttribute('fill', i === 0 ? 'var(--accent)' : '#0f172a');
                    ticks.appendChild(circle);
                }
                break;

            case 'skeleton':
                // Open/skeleton style — no face fill, thin markers
                for (let i = 0; i < 60; i++) {
                    const angle = i * 6;
                    const isHour = i % 5 === 0;
                    const rad = (angle - 90) * Math.PI / 180;
                    const line = document.createElementNS(svgNS, 'line');
                    line.setAttribute('x1', ((isHour ? 70 : 78) * Math.cos(rad)).toFixed(2));
                    line.setAttribute('y1', ((isHour ? 70 : 78) * Math.sin(rad)).toFixed(2));
                    line.setAttribute('x2', (84 * Math.cos(rad)).toFixed(2));
                    line.setAttribute('y2', (84 * Math.sin(rad)).toFixed(2));
                    line.setAttribute('stroke-width', isHour ? '1.5' : '0.3');
                    line.setAttribute('stroke', isHour ? 'var(--accent)' : 'rgba(255,255,255,0.4)');
                    ticks.appendChild(line);
                }
                for (let n = 1; n <= 12; n++) {
                    const a = n * 30;
                    const rad = (a - 90) * Math.PI / 180;
                    const t = document.createElementNS(svgNS, 'text');
                    t.setAttribute('x', (58 * Math.cos(rad)).toFixed(2));
                    t.setAttribute('y', (58 * Math.sin(rad)).toFixed(2));
                    t.setAttribute('font-size', '11');
                    t.setAttribute('font-weight', '600');
                    t.setAttribute('fill', '#ffffff');
                    t.setAttribute('text-anchor', 'middle');
                    t.setAttribute('dominant-baseline', 'central');
                    t.textContent = String(n);
                    nums.appendChild(t);
                }
                break;

            case 'luxury':
                // Gold-toned luxury with diamond markers at quarters
                for (let i = 0; i < 60; i++) {
                    const angle = i * 6;
                    const isHour = i % 5 === 0;
                    const isQuarter = i % 15 === 0;
                    const rad = (angle - 90) * Math.PI / 180;
                    if (isQuarter) {
                        // Diamond shape for quarters
                        const cx = 78 * Math.cos(rad);
                        const cy = 78 * Math.sin(rad);
                        const diamond = document.createElementNS(svgNS, 'polygon');
                        diamond.setAttribute('points', `${cx},${cy-4} ${cx+3},${cy} ${cx},${cy+4} ${cx-3},${cy}`);
                        diamond.setAttribute('fill', '#d4af37');
                        ticks.appendChild(diamond);
                    } else if (isHour) {
                        const line = document.createElementNS(svgNS, 'line');
                        line.setAttribute('x1', (74 * Math.cos(rad)).toFixed(2));
                        line.setAttribute('y1', (74 * Math.sin(rad)).toFixed(2));
                        line.setAttribute('x2', (84 * Math.cos(rad)).toFixed(2));
                        line.setAttribute('y2', (84 * Math.sin(rad)).toFixed(2));
                        line.setAttribute('stroke-width', '2');
                        line.setAttribute('stroke', '#d4af37');
                        line.setAttribute('stroke-linecap', 'round');
                        ticks.appendChild(line);
                    } else {
                        const line = document.createElementNS(svgNS, 'line');
                        line.setAttribute('x1', (81 * Math.cos(rad)).toFixed(2));
                        line.setAttribute('y1', (81 * Math.sin(rad)).toFixed(2));
                        line.setAttribute('x2', (84 * Math.cos(rad)).toFixed(2));
                        line.setAttribute('y2', (84 * Math.sin(rad)).toFixed(2));
                        line.setAttribute('stroke-width', '0.5');
                        line.setAttribute('stroke', '#d4af37');
                        ticks.appendChild(line);
                    }
                }
                for (let n = 1; n <= 12; n++) {
                    const a = n * 30;
                    const rad = (a - 90) * Math.PI / 180;
                    const t = document.createElementNS(svgNS, 'text');
                    t.setAttribute('x', (62 * Math.cos(rad)).toFixed(2));
                    t.setAttribute('y', (62 * Math.sin(rad)).toFixed(2));
                    t.setAttribute('font-size', '12');
                    t.setAttribute('font-weight', '800');
                    t.setAttribute('fill', '#d4af37');
                    t.setAttribute('text-anchor', 'middle');
                    t.setAttribute('dominant-baseline', 'central');
                    t.setAttribute('font-family', "'Playfair Display', serif");
                    t.textContent = String(n);
                    nums.appendChild(t);
                }
                break;

            case 'sport':
                // Bold sporty look with thick markers and 5-min intervals highlighted
                for (let i = 0; i < 60; i++) {
                    const angle = i * 6;
                    const isHour = i % 5 === 0;
                    const rad = (angle - 90) * Math.PI / 180;
                    const line = document.createElementNS(svgNS, 'line');
                    line.setAttribute('x1', ((isHour ? 70 : 79) * Math.cos(rad)).toFixed(2));
                    line.setAttribute('y1', ((isHour ? 70 : 79) * Math.sin(rad)).toFixed(2));
                    line.setAttribute('x2', (84 * Math.cos(rad)).toFixed(2));
                    line.setAttribute('y2', (84 * Math.sin(rad)).toFixed(2));
                    line.setAttribute('stroke-width', isHour ? '4' : '1');
                    line.setAttribute('stroke', isHour ? '#ff4444' : '#333333');
                    line.setAttribute('stroke-linecap', 'butt');
                    ticks.appendChild(line);
                }
                for (let n = 1; n <= 12; n++) {
                    const a = n * 30;
                    const rad = (a - 90) * Math.PI / 180;
                    const t = document.createElementNS(svgNS, 'text');
                    t.setAttribute('x', (56 * Math.cos(rad)).toFixed(2));
                    t.setAttribute('y', (56 * Math.sin(rad)).toFixed(2));
                    t.setAttribute('font-size', '14');
                    t.setAttribute('font-weight', '900');
                    t.setAttribute('fill', '#0f172a');
                    t.setAttribute('text-anchor', 'middle');
                    t.setAttribute('dominant-baseline', 'central');
                    t.setAttribute('font-family', "'Orbitron', sans-serif");
                    t.textContent = String(n);
                    nums.appendChild(t);
                }
                break;

            case 'radar':
                // Radar/military style with concentric rings and degree ticks
                // Add concentric circles
                [30, 50, 70].forEach(r => {
                    const circle = document.createElementNS(svgNS, 'circle');
                    circle.setAttribute('cx', '0');
                    circle.setAttribute('cy', '0');
                    circle.setAttribute('r', String(r));
                    circle.setAttribute('fill', 'none');
                    circle.setAttribute('stroke', 'rgba(74,222,128,0.15)');
                    circle.setAttribute('stroke-width', '0.5');
                    ticks.appendChild(circle);
                });
                // Cross-hair lines
                [0, 90, 180, 270].forEach(angle => {
                    const rad = (angle - 90) * Math.PI / 180;
                    const line = document.createElementNS(svgNS, 'line');
                    line.setAttribute('x1', '0');
                    line.setAttribute('y1', '0');
                    line.setAttribute('x2', (84 * Math.cos(rad)).toFixed(2));
                    line.setAttribute('y2', (84 * Math.sin(rad)).toFixed(2));
                    line.setAttribute('stroke', 'rgba(74,222,128,0.2)');
                    line.setAttribute('stroke-width', '0.5');
                    ticks.appendChild(line);
                });
                for (let i = 0; i < 60; i++) {
                    const angle = i * 6;
                    const isHour = i % 5 === 0;
                    const rad = (angle - 90) * Math.PI / 180;
                    const line = document.createElementNS(svgNS, 'line');
                    line.setAttribute('x1', ((isHour ? 76 : 81) * Math.cos(rad)).toFixed(2));
                    line.setAttribute('y1', ((isHour ? 76 : 81) * Math.sin(rad)).toFixed(2));
                    line.setAttribute('x2', (84 * Math.cos(rad)).toFixed(2));
                    line.setAttribute('y2', (84 * Math.sin(rad)).toFixed(2));
                    line.setAttribute('stroke-width', isHour ? '1.5' : '0.5');
                    line.setAttribute('stroke', '#4ade80');
                    ticks.appendChild(line);
                }
                for (let n = 1; n <= 12; n++) {
                    const a = n * 30;
                    const rad = (a - 90) * Math.PI / 180;
                    const t = document.createElementNS(svgNS, 'text');
                    t.setAttribute('x', (66 * Math.cos(rad)).toFixed(2));
                    t.setAttribute('y', (66 * Math.sin(rad)).toFixed(2));
                    t.setAttribute('font-size', '10');
                    t.setAttribute('font-weight', '700');
                    t.setAttribute('fill', '#4ade80');
                    t.setAttribute('text-anchor', 'middle');
                    t.setAttribute('dominant-baseline', 'central');
                    t.setAttribute('font-family', "'Share Tech Mono', monospace");
                    t.textContent = String(n * 5).padStart(2, '0');
                    nums.appendChild(t);
                }
                break;

            case 'classic':
            default:
                // Default classic style
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
                break;
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

    const DIGITAL_STYLES = ['classic', 'split', 'neon', 'flip', 'dualtone', 'matrix', 'retro', 'minimal', 'gradient', 'outline', 'shadow', 'lcd', 'binary', 'dots', 'wave'];

    function tickDigital() {
        const now = new Date();
        const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
        const main = $('#digital');
        if (main) {
            const style = DIGITAL_STYLES.includes(state.cfg.digital_style)
                ? state.cfg.digital_style : 'classic';
            const hideSeconds = state.cfg.hide_seconds === true;
            main.innerHTML = renderDigitalStyle(style, h, m, s, hideSeconds);
            // Ensure the container has the style class for CSS targeting
            main.dataset.digitalStyle = style;
            // Autofit: shrink #digital if it overflows its parent container
            autoFitDigital(main);
        }
        const days   = ['Minggu','Senin','Selasa','Rabu','Kamis',"Jum'at",'Sabtu'];
        const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
        const greg = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
        const gd = $('#greg-date'); if (gd) gd.textContent = greg;

        updateNextCountdown(now);
        checkAdzanTrigger(now);
    }

    /**
     * Render the digital clock HTML based on the selected style.
     * All styles receive h, m, s as integers. hideSeconds controls
     * whether the seconds portion is displayed.
     */
    function renderDigitalStyle(style, h, m, s, hideSeconds) {
        switch (style) {
            case 'split':
                // Hours giant, minutes:seconds below in a smaller line
                return `<div style="display:flex;flex-direction:column;align-items:center;line-height:1;">` +
                    `<span style="font-size:1em;">${pad(h)}</span>` +
                    `<span style="font-size:0.45em;color:var(--accent);letter-spacing:0.1em;margin-top:0.1em;">` +
                    `${pad(m)}${hideSeconds ? '' : ` <span style="color:rgba(255,255,255,0.5);">:</span> ${pad(s)}`}</span>` +
                    `</div>`;

            case 'neon':
                // Glow effect with text-shadow on all digits
                return `<span class="digi-neon-glow">${pad(h)}</span>` +
                    `<span class="digi-neon-sep">:</span>` +
                    `<span class="digi-neon-glow">${pad(m)}</span>` +
                    (hideSeconds ? '' : `<span class="digi-neon-sep">:</span><span class="digi-neon-glow" style="font-size:0.65em;">${pad(s)}</span>`);

            case 'flip':
                // Each digit in its own flip-card-style box
                return renderFlipDigits(h, m, s, hideSeconds);

            case 'dualtone':
                // Hours in accent, minutes white, seconds dimmed
                return `<span style="color:var(--accent);">${pad(h)}</span>` +
                    `<span style="color:rgba(255,255,255,0.4);margin:0 0.05em;">:</span>` +
                    `<span style="color:#ffffff;">${pad(m)}</span>` +
                    (hideSeconds ? '' : `<span style="color:rgba(255,255,255,0.4);margin:0 0.05em;">:</span><span style="color:rgba(255,255,255,0.45);font-size:0.55em;vertical-align:top;margin-left:0.1em;">${pad(s)}</span>`);

            case 'matrix':
                // Matrix/hacker green style with trailing glow
                return `<span class="digi-matrix">${pad(h)}</span>` +
                    `<span class="digi-matrix-sep">:</span>` +
                    `<span class="digi-matrix">${pad(m)}</span>` +
                    (hideSeconds ? '' : `<span class="digi-matrix-sep">:</span><span class="digi-matrix" style="font-size:0.65em;">${pad(s)}</span>`);

            case 'retro':
                // Retro CRT/VHS look with scanlines
                return `<span class="digi-retro-wrap">` +
                    `<span class="digi-retro">${pad(h)}:${pad(m)}${hideSeconds ? '' : ':' + pad(s)}</span>` +
                    `</span>`;

            case 'minimal':
                // Clean, thin with only hours and minutes large, seconds tiny superscript
                return `<span style="font-weight:300;letter-spacing:0.15em;">${pad(h)}<span style="opacity:0.4;">:</span>${pad(m)}</span>` +
                    (hideSeconds ? '' : `<span style="font-size:0.3em;opacity:0.5;vertical-align:super;margin-left:0.15em;font-weight:400;">${pad(s)}</span>`);

            case 'gradient':
                // Gradient text from accent to white
                return `<span class="digi-gradient">${pad(h)}<span class="digi-gradient-sep">:</span>${pad(m)}${hideSeconds ? '' : `<span class="digi-gradient-sep">:</span>${pad(s)}`}</span>`;

            case 'outline':
                // Outlined/stroke text, no fill
                return `<span class="digi-outline">${pad(h)}</span>` +
                    `<span class="digi-outline-sep">:</span>` +
                    `<span class="digi-outline">${pad(m)}</span>` +
                    (hideSeconds ? '' : `<span class="digi-outline-sep">:</span><span class="digi-outline" style="font-size:0.6em;">${pad(s)}</span>`);

            case 'shadow':
                // Deep 3D shadow/emboss effect
                return `<span class="digi-shadow">${pad(h)}</span>` +
                    `<span class="digi-shadow-sep">:</span>` +
                    `<span class="digi-shadow">${pad(m)}</span>` +
                    (hideSeconds ? '' : `<span class="digi-shadow-sep">:</span><span class="digi-shadow" style="font-size:0.6em;">${pad(s)}</span>`);

            case 'lcd':
                // LCD/segment display style
                return `<span class="digi-lcd-wrap">` +
                    `<span class="digi-lcd">${pad(h)}</span>` +
                    `<span class="digi-lcd-sep">:</span>` +
                    `<span class="digi-lcd">${pad(m)}</span>` +
                    (hideSeconds ? '' : `<span class="digi-lcd-sep">:</span><span class="digi-lcd" style="font-size:0.65em;">${pad(s)}</span>`) +
                    `</span>`;

            case 'binary':
                // Show time in binary representation below decimal
                return `<span class="digi-binary-wrap">` +
                    `<span class="digi-binary-decimal">${pad(h)}<span style="color:var(--accent);">:</span>${pad(m)}${hideSeconds ? '' : `<span style="color:var(--accent);">:</span>${pad(s)}`}</span>` +
                    `<span class="digi-binary-row">${h.toString(2).padStart(5,'0')} ${m.toString(2).padStart(6,'0')}${hideSeconds ? '' : ' ' + s.toString(2).padStart(6,'0')}</span>` +
                    `</span>`;

            case 'dots':
                // Dotted/pixelated separator with rounded pill background
                return `<span class="digi-dots-wrap">` +
                    `<span class="digi-dots-digit">${pad(h)}</span>` +
                    `<span class="digi-dots-sep">●<br>●</span>` +
                    `<span class="digi-dots-digit">${pad(m)}</span>` +
                    (hideSeconds ? '' : `<span class="digi-dots-sep">●<br>●</span><span class="digi-dots-digit" style="font-size:0.65em;">${pad(s)}</span>`) +
                    `</span>`;

            case 'wave':
                // Each digit has a wave animation offset
                const timeStr = hideSeconds ? `${pad(h)}:${pad(m)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
                let waveHtml = '<span class="digi-wave-wrap">';
                for (let i = 0; i < timeStr.length; i++) {
                    const ch = timeStr[i];
                    if (ch === ':') {
                        waveHtml += `<span class="digi-wave-sep">:</span>`;
                    } else {
                        waveHtml += `<span class="digi-wave-char" style="animation-delay:${i * 0.1}s;">${ch}</span>`;
                    }
                }
                waveHtml += '</span>';
                return waveHtml;

            case 'classic':
            default:
                // Original style
                return `${pad(h)}<span style="color: var(--accent);">:</span>${pad(m)}` +
                    (hideSeconds ? '' : `<span style="color: var(--accent); font-size: 0.4em;" class="align-top ml-3">${pad(s)}</span>`);
        }
    }

    /** Render flip-card style: each digit gets a rounded box behind it */
    function renderFlipDigits(h, m, s, hideSeconds) {
        const digits = hideSeconds ? `${pad(h)}:${pad(m)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
        let html = '<span class="digi-flip-wrap">';
        for (let i = 0; i < digits.length; i++) {
            const ch = digits[i];
            if (ch === ':') {
                html += '<span class="digi-flip-colon">:</span>';
            } else {
                html += `<span class="digi-flip-card">${ch}</span>`;
            }
        }
        html += '</span>';
        return html;
    }


    /* ===== Hijri date =====
     *
     * Two sources, in priority order:
     *   1. Aladhan monthly calendar entry (already cached by
     *      [loadPrayerTimes]). It carries an authoritative
     *      `date.hijri` object with numeric month + year, so it
     *      doesn't depend on the WebView's Intl backend.
     *   2. Intl.DateTimeFormat with `islamic-umalqura`, as a fallback
     *      when no calendar data is available yet (first launch
     *      before the network call returns).
     *
     * The historical bug — "1 Desember 1447 H" — came from older
     * Android WebViews that accept the calendar tag but silently fall
     * back to Gregorian month names. We detect that here by checking
     * that the parsed month name matches a known Hijri month; if it
     * doesn't, we drop the result and try the cache (which is the
     * common case once the prayer-time fetch completes).
     */
    function loadHijri() {
        const el = $('#hij-date');
        if (!el) return;

        // 1. Try Aladhan cache first — most reliable on Android.
        const fromCache = hijriFromCalendarCache(new Date());
        if (fromCache) {
            el.textContent = fromCache;
            return;
        }

        // 2. Intl fallback. Guarded against the Gregorian-month-name
        //    fallback bug seen on some Android WebViews.
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
            const idx = hijriMonthIndex(monthName);
            if (idx === undefined) {
                // WebView returned a Gregorian month → unreliable.
                // Leave the existing text alone (or blank if none yet)
                // and wait for the calendar fetch to deliver real data.
                if (!el.textContent || el.textContent === '—') el.textContent = '';
                return;
            }
            el.textContent = `${day} ${HIJRI_MONTHS_ID[idx]} ${year} H`;
        } catch (e) {
            if (!el.textContent || el.textContent === '—') el.textContent = '';
        }
    }

    /**
     * Look up a Hijri month index (0..11) from a month name string.
     * Tolerant of transliteration variants — strips spaces, dashes,
     * and apostrophes before matching against [HIJRI_MAP], and also
     * tries a contains-check for partial transliterations.
     */
    function hijriMonthIndex(monthName) {
        if (!monthName) return undefined;
        const key = String(monthName).toLowerCase().replace(/['‘’`\s\-_.]/g, '');
        if (HIJRI_MAP[key] !== undefined) return HIJRI_MAP[key];
        for (const [m, i] of Object.entries(HIJRI_MAP)) {
            if (key.includes(m)) return i;
        }
        return undefined;
    }

    /**
     * Build the Indonesian Hijri date string from the cached Aladhan
     * monthly calendar. Returns null if the cache hasn't been
     * populated yet, or if the entry for [now] is missing the hijri
     * sub-object.
     *
     * Aladhan's payload shape (per day):
     *   date: {
     *     hijri: { day, month: { number, en, ar }, year, ... },
     *     gregorian: { day, ... }
     *   }
     */
    function hijriFromCalendarCache(now) {
        try {
            const days = readCachedCalendar(now.getFullYear(), now.getMonth() + 1);
            if (!Array.isArray(days)) return null;
            const dayNum = now.getDate();
            const entry = days.find(d => {
                const dn = d && d.date && d.date.gregorian
                    && parseInt(d.date.gregorian.day, 10);
                return dn === dayNum;
            }) || days[dayNum - 1];
            const h = entry && entry.date && entry.date.hijri;
            if (!h) return null;
            const day = parseInt(h.day, 10);
            const year = parseInt(h.year, 10);
            // Prefer the numeric month; fall back to the English name
            // through our own mapper for older payloads.
            let idx;
            if (h.month && h.month.number != null) {
                idx = parseInt(h.month.number, 10) - 1;
            }
            if (idx === undefined || idx < 0 || idx > 11) {
                idx = hijriMonthIndex(h.month && (h.month.en || h.month.ar));
            }
            if (!Number.isFinite(day) || !Number.isFinite(year) ||
                idx === undefined) return null;
            return `${day} ${HIJRI_MONTHS_ID[idx]} ${year} H`;
        } catch (e) { return null; }
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
            // Cache had hijri info too — refresh the displayed date so
            // any earlier Intl fallback is replaced by the authoritative
            // Aladhan value.
            loadHijri();
        }

        if (!days) {
            try {
                days = await fetchMonthlyCalendar(year, month);
                writeCachedCalendar(year, month, days);
                const t = timingsFromCalendar(days, dayNum);
                if (t) { state.times = normalizeTimes(t); renderTimes(); }
                loadHijri();
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

        // Cross-font safety: shrink any prayer-card text that overflows
        // its container. Defer one frame so the DOM has measurable
        // dimensions (especially after a layout swap).
        requestAnimationFrame(autoFitPrayerCards);
    }

    /**
     * Make sure every prayer-card label and time digit fits its container,
     * regardless of which Google Font the user picked. The clamp() font
     * sizes baked into each layout template are tuned for the default
     * Inter / Orbitron pair; wider-glyph fonts (Press Start 2P, Major
     * Mono Display, Bungee, Cinzel, Audiowide) and tall-ascender fonts
     * (Playfair Display, Merriweather) routinely overflow those bounds.
     *
     * For each `.prayer` we walk every text-bearing inline / block child
     * and incrementally shrink its `font-size` until `scrollWidth` no
     * longer exceeds `clientWidth`. Bounded by a minimum so we never
     * shrink to illegibility. Idempotent — resets `font-size` first so a
     * later font swap (or layout change) measures from the baseline.
     */
    function autoFitPrayerCards() {
        const cards = document.querySelectorAll('.prayer');
        if (!cards.length) return;
        cards.forEach(card => {
            // 1) The time digit cell. Strict no-wrap, must fit horizontally.
            const tEl = card.querySelector('[data-time]');
            if (tEl) shrinkOneLineToWidth(tEl, 11);
            // 2) Any other text-bearing leaf inside the card (label /
            //    pname / ptime / arrow / bullet etc.). We target only
            //    elements that own direct text nodes so we don't try to
            //    shrink purely structural wrappers.
            const candidates = card.querySelectorAll('div, span, strong, p');
            candidates.forEach(el => {
                if (el === tEl) return;
                if (tEl && (tEl.contains(el) || el.contains(tEl))) return;
                const hasOwnText = Array.from(el.childNodes).some(n =>
                    n.nodeType === 3 && n.textContent.trim().length > 0);
                if (!hasOwnText) return;
                shrinkOneLineToWidth(el, 8);
            });
        });
    }

    /**
     * Shrink [el]'s font-size step-by-step until its content no longer
     * overflows horizontally. Bounded by [minPx]. Resets the inline
     * `font-size` before measuring so we always start from the
     * stylesheet-defined baseline (re-runnable / idempotent).
     */
    function shrinkOneLineToWidth(el, minPx) {
        if (!el) return;
        // Reset previous adjustment; we want fresh CSS-defined size.
        el.style.fontSize = '';
        // Bail early if the element has no measurable width yet (e.g.
        // hidden or display:none container). Otherwise the loop would
        // spin until safety expires.
        if (!el.clientWidth) return;
        let safety = 16;
        while ((el.scrollWidth > el.clientWidth + 1) && safety-- > 0) {
            const cur = parseFloat(window.getComputedStyle(el).fontSize) || 16;
            const next = Math.max(minPx, cur - 1);
            if (next === cur) break;
            el.style.fontSize = next + 'px';
        }
    }

    /**
     * Detect vertical overflow in the flex layout and scale down prayer
     * sections (section.row-fixed) to prevent overlap. Works by measuring
     * the natural height of all row-fixed children vs. available container
     * height. If row-fixed items consume more than 60% of the viewport,
     * scale the largest section down to fit.
     */
    function autoFitVerticalOverflow() {
        var host = document.getElementById('layoutHost');
        if (!host) return;
        var screen = host.querySelector('.app-screen');
        if (!screen) return;

        var containerH = screen.clientHeight;
        if (containerH <= 0) return;

        var rowFixed = screen.querySelectorAll(':scope > .row-fixed');
        if (!rowFixed.length) return;

        // Reset transforms first so we measure natural sizes
        rowFixed.forEach(function(el) {
            if (el.dataset.vfitScale) {
                el.style.transform = '';
                el.style.transformOrigin = '';
                el.style.height = '';
                delete el.dataset.vfitScale;
            }
        });

        // Wait one frame for layout to settle after reset
        requestAnimationFrame(function() {
            var containerH2 = screen.clientHeight;
            if (containerH2 <= 0) return;

            var totalFixed = 0;
            var sections = [];
            rowFixed.forEach(function(el) {
                var pos = window.getComputedStyle(el).position;
                if (pos === 'absolute' || pos === 'fixed') return;
                var h = el.scrollHeight || el.offsetHeight || 0;
                totalFixed += h;
                if (el.tagName === 'SECTION' || (el.tagName !== 'HEADER' && el.querySelector('[data-key]'))) {
                    sections.push({ el: el, h: h });
                }
            });

            var maxFixed = containerH2 * 0.60;
            if (totalFixed <= maxFixed) return;

            var headerH = 0;
            rowFixed.forEach(function(el) {
                var pos = window.getComputedStyle(el).position;
                if (pos === 'absolute' || pos === 'fixed') return;
                if (el.tagName === 'HEADER') {
                    headerH += el.scrollHeight || el.offsetHeight || 0;
                }
            });

            var sectionBudget = maxFixed - headerH;
            var totalSectionH = 0;
            sections.forEach(function(s) { totalSectionH += s.h; });

            if (totalSectionH <= 0 || sectionBudget <= 0) return;

            var scaleFactor = Math.max(0.65, Math.min(1.0, sectionBudget / totalSectionH));
            if (scaleFactor >= 0.98) return;

            sections.forEach(function(s) {
                s.el.style.transform = 'scale(' + scaleFactor + ')';
                s.el.style.height = Math.ceil(s.h * scaleFactor) + 'px';
                s.el.style.transformOrigin = 'center bottom';
                s.el.dataset.vfitScale = String(scaleFactor);
            });
        });
    }

    /**
     * Autofit the #digital clock element so it never overflows its
     * parent container horizontally, regardless of which digital_style
     * is active. This is critical when switching between styles like
     * Binary (which renders two rows) or Dots (wider due to pill bg)
     * on layouts with narrow clock areas.
     *
     * Strategy: measure the parent's available width vs the rendered
     * clock's scrollWidth. If the clock overflows, shrink font-size
     * step-by-step until it fits. Bounded by a minimum so the clock
     * never becomes unreadable. Only runs once per render (called from
     * tickDigital) and resets on each call for idempotency.
     */
    let _lastDigitalStyle = '';
    let _digitalFitSize = '';

    function autoFitDigital(el) {
        // Autofit completely disabled — do nothing.
        // The digital clock was becoming too small on many layouts
        // because the old shrink loop was too aggressive. We now let
        // the clock use its natural CSS/inline size from the template.
        // IMPORTANT: Do NOT clear el.style.fontSize here because the
        // layout templates set the size via inline style attribute
        // (e.g. "font-size: clamp(56px, min(13vw, 22vh), 180px)")
        // and clearing it would remove that definition entirely.
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

        // --- Per-prayer overlay content (Quran card or custom text) ---
        const cfg = state.cfg;
        const contentMode = cfg['adzan_content_' + key] || 'none';
        const ovContent = $('#ovContent');
        const ovQuranCard = $('#ovQuranCard');
        const ovCustomText = $('#ovCustomText');

        // Clear any previous rotation timer
        if (_ovQuranTimer) { clearInterval(_ovQuranTimer); _ovQuranTimer = null; }

        if (contentMode === 'quran' && QURAN_AYAT.length > 0) {
            // Show a Quran ayat and rotate sequentially
            const showOverlayAyat = () => {
                _ovQuranIdx = (_ovQuranIdx + 1) % QURAN_AYAT.length;
                const ayat = QURAN_AYAT[_ovQuranIdx];
                $('#ovQuranArab').textContent = ayat.arab;
                $('#ovQuranTrans').textContent = ayat.trans;
                $('#ovQuranRef').textContent = 'QS. ' + ayat.surah + ': ' + ayat.ayat;
            };
            _ovQuranIdx = Math.floor(Math.random() * QURAN_AYAT.length);
            showOverlayAyat();
            // Rotate ayat at the configured interval
            const interval = Math.max(10, parseInt(cfg.quran_interval, 10) || 30) * 1000;
            _ovQuranTimer = setInterval(showOverlayAyat, interval);
            ovQuranCard.style.display = '';
            ovCustomText.style.display = 'none';
            ovContent.style.display = '';
        } else if (contentMode === 'custom') {
            const text = (cfg['adzan_text_' + key] || '').trim();
            if (text) {
                ovCustomText.textContent = text;
                ovCustomText.style.display = '';
                ovQuranCard.style.display = 'none';
                ovContent.style.display = '';
            } else {
                ovContent.style.display = 'none';
            }
        } else {
            ovContent.style.display = 'none';
        }

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
                // Clean up overlay content
                if (_ovQuranTimer) { clearInterval(_ovQuranTimer); _ovQuranTimer = null; }
                const ovContent = $('#ovContent');
                if (ovContent) ovContent.style.display = 'none';
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
    let _ovQuranTimer = null;
    let _ovQuranIdx = 0;

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
                // Replay with a small delay to avoid WebView race condition
                // where setting currentTime=0 + play() on the same tick
                // can fire 'ended' again immediately on some Android builds.
                setTimeout(() => {
                    if (!_adzanPlayState) return;
                    try { audio.currentTime = 0; } catch (e) { /* readonly while loading */ }
                    audio.play().catch(() => { /* device denied; give up silently */ });
                }, 100);
            } else {
                // All loops done — release the slot so the next adzan
                // starts cleanly.
                stopAdzanAlarm();
            }
        };

        // Clean up any stale listener from a previous play cycle
        if (_adzanPlayState._onEndedAttached) {
            audio.removeEventListener('ended', _adzanPlayState._onEndedAttached);
        }
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
        if (_ovQuranTimer) { clearInterval(_ovQuranTimer); _ovQuranTimer = null; }
        const ovContent = $('#ovContent');
        if (ovContent) ovContent.style.display = 'none';
        state.adzanActive = false;
        state.iqomahActive = false;
        // Also kill any in-flight audio so dismissing the overlay
        // really does silence the alarm. If the user only meant to
        // hide the visual and keep listening they can let it run on
        // its own -- they won't hit hideAdzan in that flow.
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

        // Auto-hide: if the gear icon is focused/hovered but not
        // activated within 3 seconds, blur it so CSS drops opacity
        // back to the resting value (0.08).
        let _gearHideTimer = null;
        const GEAR_HIDE_DELAY = 3000;

        function startGearHideTimer() {
            clearGearHideTimer();
            _gearHideTimer = setTimeout(() => {
                gear.blur();
            }, GEAR_HIDE_DELAY);
        }

        function clearGearHideTimer() {
            if (_gearHideTimer) {
                clearTimeout(_gearHideTimer);
                _gearHideTimer = null;
            }
        }

        gear.addEventListener('focus', startGearHideTimer);
        gear.addEventListener('mouseenter', startGearHideTimer);
        gear.addEventListener('blur', clearGearHideTimer);
        gear.addEventListener('mouseleave', clearGearHideTimer);

        // If the user actually clicks or activates via keyboard,
        // cancel the timer (settings will open, no need to hide).
        gear.addEventListener('click', clearGearHideTimer);
        gear.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                clearGearHideTimer();
            }
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

        // Prayer-card auto-fit must also re-run on viewport changes
        // because every clamp() inside the templates is `vw`-relative.
        // Debounced so we don't burn cycles during a continuous resize.
        let _autoFitTimer = null;
        const scheduleAutoFit = () => {
            if (_autoFitTimer) clearTimeout(_autoFitTimer);
            _autoFitTimer = setTimeout(() => {
                _autoFitTimer = null;
                autoFitPrayerCards();
            }, 120);
        };
        window.addEventListener('resize', scheduleAutoFit);
        window.addEventListener('orientationchange', scheduleAutoFit);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', scheduleAutoFit);
        }

        // Vertical overflow auto-fit on resize/orientation change
        var _vfitTimer = null;
        function scheduleVfit() {
            if (_vfitTimer) clearTimeout(_vfitTimer);
            _vfitTimer = setTimeout(autoFitVerticalOverflow, 150);
        }
        window.addEventListener('resize', scheduleVfit);
        window.addEventListener('orientationchange', function() { setTimeout(scheduleVfit, 300); });

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
