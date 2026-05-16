/* Muslim Clock — Android WebView build
 *
 * Config sources, in priority order:
 *   1. native bridge `MCAndroid.getConfig()` (when running inside the app)
 *   2. window.MC_CONFIG (defined in index.html — used outside Android)
 *   3. hardcoded defaults below
 *
 * The native side calls window.applyConfig(json) whenever Settings change,
 * so theme/text update live and prayer times re-fetch if location changed.
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
        show_analog: true,
        show_countdown: true,
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

    /* ===== State (mutable) ===== */
    const state = {
        cfg: Object.assign({}, DEFAULTS, window.MC_CONFIG || {}),
        times: {},
        adzanActive: false,
        iqomahActive: false,
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

        // Masjid name + address
        const name = cfg.masjid_name || 'Masjid';
        const namePrefixEl = $('#masjidPrefix');
        const nameEl = $('#masjidName');
        if (namePrefixEl && nameEl) {
            if (/^Masjid\s+/i.test(name)) {
                namePrefixEl.textContent = 'Masjid';
                nameEl.textContent = name.replace(/^Masjid\s+/i, '');
            } else {
                namePrefixEl.textContent = '';
                nameEl.textContent = name;
            }
        }
        const addrEl = $('#masjidAddress');
        if (addrEl) addrEl.textContent = cfg.masjid_address || '';

        // Logo (only initial render — avoids replacing the element repeatedly)
        if (cfg.masjid_logo) {
            const box = document.querySelector('#logoBox');
            if (box && !box.dataset.replaced) {
                box.dataset.replaced = '1';
                box.innerHTML = '';
                const img = document.createElement('img');
                img.src = cfg.masjid_logo;
                img.alt = 'logo';
                img.className = 'w-12 h-12 object-contain rounded-xl';
                img.onerror = () => { img.replaceWith(box); }; // restore on failure
                box.replaceWith(img);
            }
        }

        // Friday label
        if (new Date().getDay() === 5) {
            const dl = $('#dhuhrLabel');
            if (dl) dl.textContent = "Jum'at";
        }

        // Body data-* attrs (kept for parity with screen.css selectors)
        document.body.dataset.adzanMsg     = cfg.adzan_message || 'Saatnya Waktu Sholat';
        document.body.dataset.adzanDur     = String(cfg.adzan_duration || 600);
        document.body.dataset.iqomahDur    = String(cfg.iqomah_duration || 600);
        document.body.dataset.showAnalog   = cfg.show_analog    ? '1' : '0';
        document.body.dataset.showCountdown= cfg.show_countdown ? '1' : '0';

        // Toggle modules
        const a = $('#analogWrap'); if (a) a.style.display = cfg.show_analog    ? '' : 'none';
        const p = $('#nextPill');   if (p) p.style.display = cfg.show_countdown ? '' : 'none';

        const ovMsg = $('#ovMsg');
        if (ovMsg) ovMsg.textContent = cfg.adzan_message || 'Saatnya Waktu Sholat';

        // Show settings button only when the bridge is available
        const gear = $('#gearBtn');
        if (gear) gear.style.display = (window.MCAndroid && window.MCAndroid.openSettings) ? '' : 'none';
    }

    /**
     * Public API: native code calls this when settings change so we can
     * re-render and re-fetch without a page reload.
     */
    window.applyConfig = function (newCfg) {
        const prev = state.cfg;
        state.cfg = Object.assign({}, DEFAULTS, newCfg || {});
        applyConfigToDom();

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

    /* ===== Analog clock ===== */
    function buildAnalogStatic() {
        const ticks = $('#ticks');
        const nums  = $('#numerals');
        if (!ticks || !nums) return;
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

    /* ===== Prayer times via Aladhan ===== */
    function cacheKey(d) {
        const cfg = state.cfg;
        const dd = pad(d.getDate()), mm = pad(d.getMonth()+1), yy = d.getFullYear();
        return `mc_prayer_${cfg.location_lat},${cfg.location_lng},${cfg.calc_method},${dd}-${mm}-${yy}`;
    }

    async function loadPrayerTimes() {
        const cfg = state.cfg;
        const lat = cfg.location_lat;
        const lng = cfg.location_lng;
        const method = cfg.calc_method;
        const tz = cfg.timezone;
        const now = new Date();
        const dd = pad(now.getDate()), mm = pad(now.getMonth()+1), yy = now.getFullYear();
        const dParam = `${dd}-${mm}-${yy}`;
        const ck = cacheKey(now);

        // Cache (valid 6h)
        try {
            const raw = localStorage.getItem(ck);
            if (raw) {
                const cached = JSON.parse(raw);
                if (cached && cached._ts && (Date.now() - cached._ts) < 6 * 3600 * 1000) {
                    state.times = normalizeTimes(cached.timings);
                    renderTimes();
                }
            }
        } catch (e) { /* ignore */ }

        const url = `https://api.aladhan.com/v1/timings/${dParam}` +
                    `?latitude=${encodeURIComponent(lat)}` +
                    `&longitude=${encodeURIComponent(lng)}` +
                    `&method=${encodeURIComponent(method)}` +
                    `&school=0&timezonestring=${encodeURIComponent(tz)}`;
        try {
            const r = await fetch(url, { cache: 'no-store' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const data = await r.json();
            const t = data && data.data && data.data.timings;
            if (t) {
                state.times = normalizeTimes(t);
                renderTimes();
                try {
                    localStorage.setItem(ck, JSON.stringify({ _ts: Date.now(), timings: t }));
                } catch (e) { /* quota */ }
            }
        } catch (e) {
            console.warn('Aladhan fetch failed; using cache or fallback:', e);
            if (!Object.keys(state.times).length) {
                state.times = normalizeTimes({
                    Fajr: '04:30', Sunrise: '05:45', Dhuhr: '12:00',
                    Asr: '15:15', Maghrib: '18:00', Isha: '19:15'
                });
                renderTimes();
            }
        }
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
        overlay.classList.remove('hidden');

        startCountdown(dur, () => {
            state.adzanActive = false;
            state.iqomahActive = true;
            $('#ovSub').textContent = 'IQOMAH';
            startCountdown(iqDur, () => {
                state.iqomahActive = false;
                overlay.classList.add('hidden');
            });
        });
    }
    function hideAdzan() {
        state.adzanActive = false;
        state.iqomahActive = false;
        $('#adzanOverlay').classList.add('hidden');
    }
    function startCountdown(seconds, onDone) {
        const el = $('#ovCount');
        let s = seconds;
        const render = () => {
            const m = Math.floor(s / 60), r = s % 60;
            el.textContent = pad(m) + ':' + pad(r);
        };
        render();
        const t = setInterval(() => {
            s--;
            if (s <= 0) { clearInterval(t); render(); onDone && onDone(); return; }
            render();
        }, 1000);
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
        applyConfigToDom();
        wireGear();
        buildAnalogStatic();
        tickDigital();
        setInterval(tickDigital, 1000);
        requestAnimationFrame(tickAnalog);

        loadHijri();
        loadPrayerTimes();
        setInterval(loadPrayerTimes, 60 * 60 * 1000);

        // Midnight refresh
        setInterval(() => {
            const n = new Date();
            if (n.getHours() === 0 && n.getMinutes() === 0 && n.getSeconds() < 5) {
                loadPrayerTimes(); loadHijri();
            }
        }, 4000);

        document.addEventListener('keydown', (e) => {
            if (e.key === 't' || e.key === 'T') {
                if (!state.adzanActive && !state.iqomahActive) showAdzan('maghrib');
            }
            if (e.key === 'Escape') hideAdzan();
        });

        console.log('[MuslimClock] Android WebView build, bridge=' + !!window.MCAndroid);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
