/* Muslim Clock — Android WebView build (MVP)
 *
 * Differences from the original web build:
 *  - Reads config from window.MC_CONFIG (no PHP backend)
 *  - Calls Aladhan API directly (no api/prayer.php proxy)
 *  - Caches prayer times in localStorage (offline-tolerant)
 *  - Single layout (minimal); features like slideshow/Quran/imam are stubbed off
 */
(function () {
    'use strict';

    const $  = (s, p = document) => p.querySelector(s);
    const $$ = (s, p = document) => p.querySelectorAll(s);
    const pad = (n) => String(n).padStart(2, '0');

    const CFG = window.MC_CONFIG || {};

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

    const state = {
        times: {},
        adzanActive: false,
        iqomahActive: false,
    };

    /* ============= Apply config to DOM ============= */
    function applyConfig() {
        if (CFG.theme_primary) {
            document.documentElement.style.setProperty('--primary', CFG.theme_primary);
            document.documentElement.style.setProperty('--primary-dark',
                `color-mix(in srgb, ${CFG.theme_primary} 60%, black)`);
            document.documentElement.style.setProperty('--primary-light',
                `color-mix(in srgb, ${CFG.theme_primary} 80%, white)`);
        }
        if (CFG.theme_accent) {
            document.documentElement.style.setProperty('--accent', CFG.theme_accent);
            document.documentElement.style.setProperty('--accent-shadow',
                `color-mix(in srgb, ${CFG.theme_accent} 40%, transparent)`);
        }

        const name = CFG.masjid_name || 'Masjid';
        const prefixMatch = /^Masjid\s+/i.test(name);
        const namePrefixEl = $('#masjidPrefix');
        const nameEl = $('#masjidName');
        if (prefixMatch && nameEl && namePrefixEl) {
            namePrefixEl.textContent = 'Masjid';
            nameEl.textContent = name.replace(/^Masjid\s+/i, '');
        } else if (nameEl && namePrefixEl) {
            namePrefixEl.textContent = '';
            nameEl.textContent = name;
        }
        const addrEl = $('#masjidAddress');
        if (addrEl) addrEl.textContent = CFG.masjid_address || '';

        if (CFG.masjid_logo) {
            const box = $('#logoBox');
            if (box) {
                box.innerHTML = '';
                const img = document.createElement('img');
                img.src = CFG.masjid_logo;
                img.alt = 'logo';
                img.className = 'w-12 h-12 object-contain rounded-xl';
                box.replaceWith(img);
            }
        }

        // Friday label
        if (new Date().getDay() === 5) {
            const dl = $('#dhuhrLabel');
            if (dl) dl.textContent = "Jum'at";
        }

        // Body data-* attrs (kept for parity with screen.css selectors)
        document.body.dataset.adzanMsg   = CFG.adzan_message || 'Saatnya Waktu Sholat';
        document.body.dataset.adzanDur   = String(CFG.adzan_duration || 600);
        document.body.dataset.iqomahDur  = String(CFG.iqomah_duration || 600);
        document.body.dataset.showAnalog    = CFG.show_analog    ? '1' : '0';
        document.body.dataset.showCountdown = CFG.show_countdown ? '1' : '0';

        // Hide modules disabled in MVP
        if (!CFG.show_analog) {
            const a = $('#analogWrap'); if (a) a.style.display = 'none';
        }
        if (!CFG.show_countdown) {
            const p = $('#nextPill'); if (p) p.style.display = 'none';
        }

        const ovMsg = $('#ovMsg');
        if (ovMsg) ovMsg.textContent = CFG.adzan_message || 'Saatnya Waktu Sholat';
    }

    /* ============= Analog clock ticks/numerals (built dynamically) ============= */
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

    /* ============= Digital clock + date ============= */
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

    /* ============= Hijri date ============= */
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

    /* ============= Prayer times via Aladhan ============= */
    function cacheKey(d) {
        const dd = pad(d.getDate()), mm = pad(d.getMonth()+1), yy = d.getFullYear();
        return `mc_prayer_${CFG.location_lat},${CFG.location_lng},${CFG.calc_method},${dd}-${mm}-${yy}`;
    }

    async function loadPrayerTimes() {
        const lat = CFG.location_lat ?? -6.2;
        const lng = CFG.location_lng ?? 106.816666;
        const method = CFG.calc_method ?? 20;
        const tz = CFG.timezone || 'Asia/Jakarta';
        const now = new Date();
        const dd = pad(now.getDate()), mm = pad(now.getMonth()+1), yy = now.getFullYear();
        const dParam = `${dd}-${mm}-${yy}`;
        const ck = cacheKey(now);

        // Try cache first (valid for 6 hours)
        try {
            const raw = localStorage.getItem(ck);
            if (raw) {
                const cached = JSON.parse(raw);
                if (cached && cached._ts && (Date.now() - cached._ts) < 6 * 3600 * 1000) {
                    state.times = normalizeTimes(cached.timings);
                    renderTimes();
                }
            }
        } catch (e) { /* ignore cache errors */ }

        // Fetch fresh
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
            // Final fallback: hardcoded approximate times so UI never empty
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
            const card = $(`.prayer[data-key="${k}"]`);
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
        const next = $(`.prayer[data-key="${nextKey}"]`);
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

    /* ============= Adzan overlay ============= */
    function dateKey(d) {
        return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
    }
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

    /* ============= init ============= */
    function init() {
        applyConfig();
        buildAnalogStatic();
        tickDigital();
        setInterval(tickDigital, 1000);
        requestAnimationFrame(tickAnalog);

        loadHijri();
        loadPrayerTimes();
        // Refresh every hour; will also cross midnight cleanly
        setInterval(loadPrayerTimes, 60 * 60 * 1000);

        // Midnight refresh
        setInterval(() => {
            const n = new Date();
            if (n.getHours() === 0 && n.getMinutes() === 0 && n.getSeconds() < 5) {
                loadPrayerTimes(); loadHijri();
            }
        }, 4000);

        // Test hotkey: T to simulate adzan, ESC to dismiss
        document.addEventListener('keydown', (e) => {
            if (e.key === 't' || e.key === 'T') {
                if (!state.adzanActive && !state.iqomahActive) showAdzan('maghrib');
            }
            if (e.key === 'Escape') hideAdzan();
        });

        console.log('[MuslimClock] Android WebView build');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
