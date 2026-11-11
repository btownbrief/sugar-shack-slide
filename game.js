/* Sugar Shack Slide - game: layout, rendering, drag-preview input, effects, screens. */
(function () {
  'use strict';
  const R = SSSRules, A = SSSArt, Snd = SSSAudio;
  const $ = id => document.getElementById(id);
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOutCubic = k => 1 - Math.pow(1 - k, 3);
  const easeInOut = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const easeOutBack = k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
  const DV = R.DIRS;
  const SHACK_VALUES = [1, 2, 3, 6, 12, 24, 48, 96, 192, 384, 768, 1536, 3072, 6144];
  const MODE_NAME = { shack: 'Sugar Shack', quick: 'Quick Slide' };

  // ---------------------------------------------------------------- storage
  const KEY = 'sss.v1.';
  function load(k, d) { try { const v = localStorage.getItem(KEY + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) { /* private mode etc. */ } }
  function drop(k) { try { localStorage.removeItem(KEY + k); } catch (e) { /* ignore */ } }
  const defMode = () => ({ games: 0, best: 0, top: 0, moves: 0, total: 0 });
  let settings = Object.assign({ sfx: true, music: true, vib: true }, load('settings', {}));
  let stats = load('stats', {}) || {};
  stats.modes = stats.modes || {};
  stats.modes.shack = Object.assign(defMode(), stats.modes.shack);
  stats.modes.quick = Object.assign(defMode(), stats.modes.quick);
  stats.merges = stats.merges || 0; stats.moves = stats.moves || 0; stats.met = Array.isArray(stats.met) ? stats.met : [];
  stats.daily = Object.assign({ date: '', best: 0, streak: 0, lastDone: '', plays: 0 }, stats.daily);
  const saveStats = () => save('stats', stats);

  // ---- Daily Sap Run: one Sugar Shack board per calendar day, the same for everyone
  const p2 = n => (n < 10 ? '0' : '') + n;
  const dayKey = (d) => { d = d || new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  const dayNum = k => { const a = (k || '').split('-').map(Number); return a.length === 3 ? Math.round(Date.UTC(a[0], a[1] - 1, a[2]) / 864e5) : -9; };
  const twistOf = k => ((dayNum(k) % 4) + 4) % 4;
  function daySeed(k) { let h = 2166136261; for (const ch of 'sugar-shack-daily:' + k) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
  // the first run each day is the official one (score, medal, streak, share); replays are practice
  const todayEntry = () => stats.daily.hist[dayKey()] || null;
  const todayBest = () => { const e = todayEntry(); return e && e.done ? e.best : 0; };
  // one missed day a week is forgiven (a "sap freeze"), so a single busy day doesn't wipe a long streak
  const freezeReady = k => dayNum(k || dayKey()) - dayNum(stats.daily.freezeAt || '') >= 7;
  const streakNow = () => { const d = dayNum(dayKey()) - dayNum(stats.daily.lastDone); return d === 0 || d === 1 || (d === 2 && freezeReady()) ? stats.daily.streak : 0; };
  function recordDaily(k, score, top, practice) {
    const D = stats.daily, H = D.hist, h = H[k] || (H[k] = { best: 0, top: 0 });
    D.plays++;
    if (practice) { h.prac = Math.max(h.prac || 0, score); saveStats(); return; }
    if (h.done) return;
    if (D.date !== k) { D.date = k; D.best = 0; }
    D.best = score; h.done = true; h.best = score; h.top = Math.max(h.top, top || 0);
    if (D.lastDone !== k) {
      const gap = dayNum(k) - dayNum(D.lastDone);
      if (gap === 1) D.streak++;
      else if (gap === 2 && freezeReady(k) && D.streak > 0) { D.streak++; D.freezeAt = k; G.usedFreeze = true; }
      else D.streak = 1;
      D.lastDone = k;
    }
    h.m = Math.max(h.m || 0, medalFor(k, score));
    noteDailyTop(k, top || 0);
  }
  // ---- the Sugarmaker's par: a fixed target per twist (bots made it noisy: free gold some days, impossible others).
  // Bronze is a solid run (usually a 192), silver = par (a 384 or a deep 192 board), gold needs a 768-class board.
  const TWIST_K = [1, 1.15, 0.9, 1.1];
  const nice = n => (n >= 1000 ? Math.round(n / 50) * 50 : Math.max(10, Math.round(n / 10) * 10));
  const goals = k => { const f = TWIST_K[twistOf(k)]; return [0, nice(1500 * f), nice(4000 * f), nice(10000 * f)]; };
  function leafPoints() { let n = 0; Object.values(stats.daily.hist).forEach(h => { if (h.done) n += entryMedal(h); }); return n; }
  const medalFor = (k, score) => { const t = goals(k); return score >= t[3] ? 3 : score >= t[2] ? 2 : score >= t[1] ? 1 : 0; };
  const entryMedal = e => (e ? (e.m != null ? e.m : medalOf(e.top)) : 0);
  // daily leaves: bronze for half the Sugarmaker's par, silver for beating it, gold for doubling it
  const MEDALS = [null, { name: 'Bronze', col: '#d98b4a', em: '\ud83e\udd49', what: 'half par' }, { name: 'Silver', col: '#dfe7ec', em: '\ud83e\udd48', what: 'beat par' }, { name: 'Gold', col: '#ffd23a', em: '\ud83e\udd47', what: 'double par' }];
  const medalOf = top => (top >= 384 ? 3 : top >= 192 ? 2 : top >= 96 ? 1 : 0);
  stats.daily.hist = stats.daily.hist && typeof stats.daily.hist === 'object' ? stats.daily.hist : {};
  Object.keys(stats.daily.hist).forEach(k => { const h = stats.daily.hist[k]; if (h.done == null) h.done = h.best > 0; }); // older saves
  function noteDailyTop(k, top, score) {
    const H = stats.daily.hist, h = H[k] || (H[k] = { best: 0, top: 0 });
    if (h.done && score != null) return;
    h.top = Math.max(h.top, top);
    const keys = Object.keys(H).sort(); while (keys.length > 60) delete H[keys.shift()];
    saveStats();
  }
  const todayMedal = () => entryMedal(todayEntry());
  const LEAF_PTS = [[0, -98], [15, -62], [33, -76], [36, -38], [66, -54], [60, -16], [95, -8], [70, 14], [88, 46], [44, 40], [12, 64], [6, 72], [6, 98], [-6, 98], [-6, 72], [-12, 64], [-44, 40], [-88, 46], [-70, 14], [-95, -8], [-60, -16], [-66, -54], [-36, -38], [-33, -76], [-15, -62]];
  const LEAF_D = 'M' + LEAF_PTS.map(p => p.join(' ')).join('L') + 'Z';
  function leafSvg(m, cls) {
    // m: 1..3 medal, -1 played without a medal (maple red), 0 not played (just an outline)
    const col = m > 0 ? MEDALS[m].col : m < 0 ? '#c4553a' : 'rgba(255,241,207,.08)', stroke = m ? '#3b2412' : 'rgba(255,241,207,.45)';
    return '<svg class="leaf ' + (cls || '') + '" viewBox="-110 -110 220 220" aria-hidden="true"><path d="' + LEAF_D + '" fill="' + col + '" stroke="' + stroke + '" stroke-width="' + (m ? 16 : 10) + '" stroke-linejoin="round"/>' + (m ? '<path d="M0 60L0 -40M0 20L-40 -20M0 20L40 -20" stroke="rgba(59,36,18,.35)" stroke-width="9" fill="none" stroke-linecap="round"/>' : '') + '</svg>';
  }
  const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  function weekStrip(days) {
    days = days || 7;
    let h = '<div class="week' + (days > 7 ? ' month' : '') + '">';
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i), k = dayKey(d), e = stats.daily.hist[k];
      h += '<span class="wd' + (i === 0 ? ' today' : '') + (e ? ' played' : '') + '">' + leafSvg(e ? (entryMedal(e) || -1) : 0) + '<i>' + (days > 7 ? d.getDate() : DOW[d.getDay()]) + '</i></span>';
    }
    return h + '</div>';
  }
  function leafCount() {
    const c = [0, 0, 0, 0]; Object.values(stats.daily.hist).forEach(h => { if (h.done) c[entryMedal(h)]++; });
    return c[1] + c[2] + c[3] ? MEDALS.slice(1).map((m, i) => leafSvg(i + 1, 'sl') + ' ' + c[i + 1]).join(' &nbsp;') : '-';
  }
  function lastDays() {
    const keys = Object.keys(stats.daily.hist).filter(k => stats.daily.hist[k].done).sort().reverse().slice(0, 7);
    if (!keys.length) return '';
    return '<div class="ssub">Recent official runs</div>' + keys.map(k => { const h = stats.daily.hist[k], par = goals(k)[2];
      return '<div class="srow day"><span>' + leafSvg(entryMedal(h) || -1, 'sl') + ' ' + k.slice(5).replace('-', '/') + '</span><b>' + fmt(h.best) + ' <i>par ' + fmt(par) + '</i>' + '</b></div>'; }).join('');
  }
  function untilTomorrow() {
    const n = new Date(), t = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1), m = Math.max(1, Math.round((t - n) / 60000));
    return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm';
  }
  function shareDaily() {
    const k = G.daily || dayKey(), e = stats.daily.hist[k] || { best: 0, top: 0 }, m = entryMedal(e), sk = streakNow();
    const now = new Date(); let row = '';
    for (let i = 6; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i), h = stats.daily.hist[dayKey(d)]; row += h && h.done ? ['\ud83c\udf42', '\ud83d\udfe4', '\u26aa', '\ud83d\udfe1'][entryMedal(h)] : '\u25ab\ufe0f'; }
    const txt = 'Sugar Shack Slide \u00b7 Daily Sap Run ' + k + ' (' + R.TWISTS[twistOf(k)].name + ')\n' + (m ? '\ud83c\udf41'.repeat(m) + ' ' + MEDALS[m].name + ' leaf \u00b7 ' : '') + fmt(e.best) + ' pts (par ' + fmt(goals(k)[2]) + ') \u00b7 top tile ' + e.top + '\n' + row + (sk > 1 ? '  ' + sk + '-day streak' : '') + (/^https?:/.test(location.protocol) ? '\n' + location.origin + location.pathname : '');
    try {
      if (navigator.share) { navigator.share({ text: txt }).catch(() => {}); return; }
      navigator.clipboard.writeText(txt).then(() => toast('Copied! Paste it to a friend'), () => toast('Couldn\u2019t copy'));
    } catch (er) { toast('Couldn\u2019t share'); }
  }
  const slot = () => (G.daily ? 'daily' : G.mode);
  const saveSettings = () => save('settings', settings);
  Snd.S.sfx = settings.sfx; Snd.S.music = settings.music;

  let tapped = false;
  function vib(p) { if (tapped && settings.vib && navigator.vibrate && !(navigator.userActivation && !navigator.userActivation.hasBeenActive)) { try { navigator.vibrate(p); } catch (e) { /* none */ } } }
  const fmt = n => Math.round(n).toLocaleString('en-US');

  // ---------------------------------------------------------------- state
  const G = {
    screen: 'title', overlay: null, mode: 'shack', daily: null, st: null, gen: 0, t: 0,
    views: new Map(), ghosts: [], parts: [], q: [], bubbles: [],
    pv: { dir: null, p: 0, tp: 0, plan: null, spawn: null, armed: false, dragging: false, demo: false, cacheMoves: -1, plans: {}, moveIds: new Set(), absIds: new Set(), mergeIds: new Set(), dead: false },
    tilt: { x: 0, y: 0, vx: 0, vy: 0 },
    over: false, tally: null, bestAtStart: 0, nerv: 0, nextBounce: -1e9, nextSeen: 0,
    ghost: { on: false, t: 0, dir: 'left' }, idle: 0, resumed: false, topPop: -1e9,
  };
  const L = { W: 0, H: 0, land: false, bs: 300, m: 30, pad: 8, gap: 6, cell: 70, cw: 360, ch: 360, dpr: 1 };
  let appEl, bgC, bgX, boardC, bx, trayC, nextC, nx, paradeC, px_;

  // ---------------------------------------------------------------- layout
  function safeInsets() {
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;visibility:hidden;left:0;top:0;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(p);
    const cs = getComputedStyle(p), r = { t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 };
    p.remove(); return r;
  }
  let lastW = 0, lastH = 0, lastLand = null;
  function layout(force) {
    const W = window.innerWidth, H = window.innerHeight;
    const land = W > H * 1.05;
    if (!force && lastLand === land && Math.abs(W - lastW) <= 2 && Math.abs(H - lastH) < 160) return; // toolbar show/hide: ignore
    lastW = W; lastH = H; lastLand = land;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    L.W = W; L.H = H; L.land = land; L.dpr = dpr;
    appEl.style.width = W + 'px'; appEl.style.height = H + 'px';
    appEl.classList.toggle('land', land);
    const ins = safeInsets();
    let bs;
    if (!land) bs = Math.min(W - 24, H - (ins.t + 8 + 152) - (ins.b + 10 + 180) - 14);
    else bs = Math.min(H - 28 - ins.t - ins.b, W * 0.62);
    bs = Math.floor(clamp(bs, 200, 600));
    L.bs = bs; L.m = Math.round(bs * 0.1);
    L.pad = bs * 0.027; L.gap = bs * 0.02; L.cell = (bs - 2 * L.pad - 3 * L.gap) / 4;
    L.cw = L.ch = bs + 2 * L.m;
    const st = $('stage');
    st.style.width = L.cw + 'px'; st.style.height = L.ch + 'px'; st.style.margin = (-L.m) + 'px';
    boardC.width = Math.round(L.cw * dpr); boardC.height = Math.round(L.ch * dpr);
    boardC.style.width = L.cw + 'px'; boardC.style.height = L.ch + 'px';
    bx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nextC.width = nextC.height = Math.round(52 * dpr); nx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildTray(); drawBg();
    sizeParade();
    G.parts.length = 0;
  }
  function sizeParade() {
    if (!paradeC.clientWidth) return; // title is hidden right now; sized again when it shows
    const w = paradeC.clientWidth, h = paradeC.clientHeight;
    paradeC.width = Math.round(w * L.dpr); paradeC.height = Math.round(h * L.dpr);
    px_.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
  }

  function cellXY(cx, cy) { return [L.m + L.pad + cx * (L.cell + L.gap) + L.cell / 2, L.m + L.pad + cy * (L.cell + L.gap) + L.cell / 2]; }

  function buildTray() {
    const { bs, m, pad, gap, cell, dpr, cw, ch } = L;
    trayC = document.createElement('canvas'); trayC.width = Math.round(cw * dpr); trayC.height = Math.round(ch * dpr);
    const c = trayC.getContext('2d'); c.scale(dpr, dpr);
    const rad = bs * 0.075;
    c.save(); c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 26; c.shadowOffsetY = 12;
    A.rr(c, m, m, bs, bs, rad); c.fillStyle = '#4a2a15'; c.fill(); c.restore();
    A.rr(c, m, m, bs, bs, rad);
    const g = c.createLinearGradient(m, m, m + bs, m + bs); g.addColorStop(0, '#945931'); g.addColorStop(0.5, '#6b3f1f'); g.addColorStop(1, '#4e2c15');
    c.fillStyle = g; c.fill();
    const trayImg = A.ASSETS.tray;
    if (trayImg && trayImg.complete && trayImg.naturalWidth) { c.save(); A.rr(c, m, m, bs, bs, rad); c.clip(); c.drawImage(trayImg, m, m, bs, bs); c.restore(); }
    c.save(); A.rr(c, m, m, bs, bs, rad); c.clip();
    for (let i = 0; i < 46 && !(trayImg && trayImg.naturalWidth); i++) { // wood grain
      const y = m + (i / 46) * bs + Math.sin(i * 12.9) * 4;
      c.beginPath(); c.moveTo(m, y);
      c.bezierCurveTo(m + bs * 0.3, y + Math.sin(i * 3.1) * 7, m + bs * 0.65, y - Math.cos(i * 1.7) * 7, m + bs, y + Math.sin(i * 0.7) * 5);
      c.strokeStyle = i % 3 ? 'rgba(30,12,2,.16)' : 'rgba(255,200,130,.07)'; c.lineWidth = i % 5 === 0 ? 2 : 1; c.stroke();
    }
    c.restore();
    A.rr(c, m, m, bs, bs, rad); c.lineWidth = 4; c.strokeStyle = '#2a160a'; c.stroke();
    A.rr(c, m + 3, m + 3, bs - 6, bs - 6, rad * 0.9); c.lineWidth = 2; c.strokeStyle = 'rgba(255,215,160,.28)'; c.stroke();
    for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) {
      const x = m + pad + q * (cell + gap), y = m + pad + r * (cell + gap);
      A.rr(c, x, y, cell, cell, cell * 0.2);
      const sg = c.createLinearGradient(0, y, 0, y + cell); sg.addColorStop(0, '#1b0e05'); sg.addColorStop(1, '#33200f');
      c.fillStyle = sg; c.fill();
      A.rr(c, x + 1, y + 1, cell - 2, cell - 2, cell * 0.19); c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,.35)'; c.stroke();
      A.rr(c, x, y + 1.5, cell, cell, cell * 0.2); c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,215,160,.16)'; c.stroke();
    }
  }

  function drawBg() {
    const { W, H, dpr } = L;
    bgC.width = Math.round(W * dpr); bgC.height = Math.round(H * dpr);
    bgC.style.width = W + 'px'; bgC.style.height = H + 'px';
    const c = bgX; c.setTransform(dpr, 0, 0, dpr, 0, 0);
    let g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#16263f'); g.addColorStop(0.45, '#27525a'); g.addColorStop(0.8, '#2d5c55'); g.addColorStop(1, '#1d3e38');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const bgImg = A.ASSETS.bg;
    if (bgImg && bgImg.complete && bgImg.naturalWidth) { // painted backdrop: cover-fit
      const k = Math.max(W / bgImg.naturalWidth, H / bgImg.naturalHeight), w = bgImg.naturalWidth * k, h = bgImg.naturalHeight * k;
      c.drawImage(bgImg, (W - w) / 2, (H - h) / 2, w, h); c.fillStyle = 'rgba(8,16,22,.18)'; c.fillRect(0, 0, W, H); return;
    }
    // stars + moon
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 46; i++) { c.fillStyle = 'rgba(255,248,220,' + (0.25 + rnd() * 0.5).toFixed(2) + ')'; c.beginPath(); c.arc(rnd() * W, rnd() * H * 0.4, 0.6 + rnd() * 1.2, 0, TAU); c.fill(); }
    // hills
    const hill = (y0, amp, col, ph, step) => {
      c.beginPath(); c.moveTo(0, H);
      for (let x = 0; x <= W + step; x += step) c.lineTo(x, y0 + Math.sin(x / W * 5 + ph) * amp + Math.sin(x / W * 11 + ph * 2) * amp * 0.35);
      c.lineTo(W, H); c.closePath(); c.fillStyle = col; c.fill();
    };
    hill(H * 0.62, H * 0.03, '#2f5a68', 1, 10);
    hill(H * 0.7, H * 0.028, '#3f7573', 3, 10);
    // pines
    const pine = (x, y, s, col) => {
      c.fillStyle = col;
      for (let i = 0; i < 3; i++) { const w = s * (0.5 + i * 0.28), yy = y - s * 1.1 + i * s * 0.36; c.beginPath(); c.moveTo(x, yy - s * 0.45); c.lineTo(x + w, yy + s * 0.3); c.lineTo(x - w, yy + s * 0.3); c.closePath(); c.fill(); }
      c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(x, y - s * 1.55, s * 0.12, 0, TAU); c.fill();
    };
    for (let i = 0; i < 9; i++) pine(rnd() * W, H * (0.69 + rnd() * 0.05), 22 + rnd() * 26, i % 2 ? '#1a3b38' : '#21463f');
    // snowy foreground + sugarhouse
    hill(H * 0.86, H * 0.022, '#cfe0e6', 5, 8);
    g = c.createLinearGradient(0, H * 0.84, 0, H); g.addColorStop(0, 'rgba(235,245,248,.0)'); g.addColorStop(1, 'rgba(40,70,80,.6)'); c.fillStyle = g; c.fillRect(0, H * 0.84, W, H * 0.16);
    // the sugarhouse: board-and-batten walls, snowy roof with a steam cupola, a lit window, a woodpile, tapped maples
    const hs = Math.min(W, H) * (L.land ? 0.1 : 0.085), hx = L.land ? W * 0.86 : W * 0.2, hy = L.land ? H * 0.93 : H * 0.965;
    const maple = (x, y, h, bucket) => {
      c.fillStyle = '#3a2618'; c.fillRect(x - h * 0.06, y - h, h * 0.12, h);
      c.strokeStyle = '#3a2618'; c.lineWidth = h * 0.035; c.lineCap = 'round';
      [[-0.5, -1.25, -0.75], [0.45, -1.2, -0.7], [-0.2, -1.3, -0.9], [0.25, -1.35, -0.95]].forEach(q => { c.beginPath(); c.moveTo(x, y + h * q[2]); c.lineTo(x + h * q[0], y + h * q[1]); c.stroke(); });
      if (bucket) { const bw = h * 0.16, by = y - h * 0.42;
        c.fillStyle = '#9fb0ba'; c.beginPath(); c.moveTo(x - bw * 0.5, by); c.lineTo(x + bw * 0.5, by); c.lineTo(x + bw * 0.4, by + bw * 0.9); c.lineTo(x - bw * 0.4, by + bw * 0.9); c.closePath(); c.fill();
        c.fillStyle = '#5e6b73'; c.fillRect(x - bw * 0.55, by - bw * 0.15, bw * 1.1, bw * 0.18); }
    };
    maple(hx + hs * 2.1, hy, hs * 2.1, true); maple(hx - hs * 1.9, hy + hs * 0.05, hs * 1.7, true);
    // every two leaf points from the daily hangs another bucket in the sugarbush
    const lp = leafPoints();
    for (let i = 0; i < Math.min(6, Math.floor(lp / 2)); i++) { const x = L.land ? hx - hs * (3.4 + i * 1.4) : hx + hs * (3.5 + i * 1.45); if (x > 8 && x < W - 8) maple(x, hy - hs * 0.05 * (i % 2), hs * (1.6 + (i % 3) * 0.25), true); }
    // window light on the snow
    g = c.createRadialGradient(hx, hy + hs * 0.1, 0, hx, hy + hs * 0.1, hs * 1.6); g.addColorStop(0, 'rgba(255,200,90,.38)'); g.addColorStop(1, 'rgba(255,200,90,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(hx, hy + hs * 0.1, hs * 1.7, hs * 0.5, 0, 0, TAU); c.fill();
    // walls
    const wx = hx - hs, wy = hy - hs * 0.78, ww = hs * 2, wh = hs * 0.8;
    g = c.createLinearGradient(wx, 0, wx + ww, 0); g.addColorStop(0, '#6b3f22'); g.addColorStop(1, '#4a2914');
    c.fillStyle = g; c.fillRect(wx, wy, ww, wh);
    c.strokeStyle = 'rgba(25,10,3,.55)'; c.lineWidth = 1;
    for (let x = wx + hs * 0.16; x < wx + ww; x += hs * 0.16) { c.beginPath(); c.moveTo(x, wy); c.lineTo(x, wy + wh); c.stroke(); }
    // door + window
    c.fillStyle = '#2f1a0c'; c.fillRect(hx + hs * 0.38, wy + wh * 0.32, hs * 0.34, wh * 0.68);
    g = c.createLinearGradient(0, wy + wh * 0.25, 0, wy + wh * 0.65); g.addColorStop(0, '#fff1a8'); g.addColorStop(1, '#ffb43a');
    c.fillStyle = g; c.fillRect(hx - hs * 0.62, wy + wh * 0.25, hs * 0.55, wh * 0.4);
    c.strokeStyle = '#3b2412'; c.lineWidth = 1.6; c.strokeRect(hx - hs * 0.62, wy + wh * 0.25, hs * 0.55, wh * 0.4);
    c.beginPath(); c.moveTo(hx - hs * 0.345, wy + wh * 0.25); c.lineTo(hx - hs * 0.345, wy + wh * 0.65); c.moveTo(hx - hs * 0.62, wy + wh * 0.45); c.lineTo(hx - hs * 0.07, wy + wh * 0.45); c.stroke();
    // roof with overhang, then a thick snow cap
    const ry = wy, rt = hy - hs * 1.5;
    c.fillStyle = '#7a2a1c'; c.beginPath(); c.moveTo(hx - hs * 1.22, ry + hs * 0.06); c.lineTo(hx, rt); c.lineTo(hx + hs * 1.22, ry + hs * 0.06); c.lineTo(hx + hs * 1.22, ry - hs * 0.02); c.lineTo(hx, rt - hs * 0.08); c.lineTo(hx - hs * 1.22, ry - hs * 0.02); c.closePath(); c.fill();
    c.fillStyle = '#9a3a26'; c.beginPath(); c.moveTo(hx - hs * 1.18, ry); c.lineTo(hx, rt); c.lineTo(hx, rt + hs * 0.2); c.lineTo(hx - hs * 0.95, ry + hs * 0.02); c.closePath(); c.fill();
    c.fillStyle = '#eef6f8'; c.beginPath(); c.moveTo(hx - hs * 1.25, ry - hs * 0.02); c.lineTo(hx, rt - hs * 0.1); c.lineTo(hx + hs * 1.25, ry - hs * 0.02);
    c.quadraticCurveTo(hx + hs * 0.9, ry - hs * 0.02, hx + hs * 0.6, ry - hs * 0.22); c.lineTo(hx, rt + hs * 0.12); c.lineTo(hx - hs * 0.6, ry - hs * 0.22); c.quadraticCurveTo(hx - hs * 0.9, ry - hs * 0.02, hx - hs * 1.25, ry - hs * 0.02); c.closePath(); c.fill();
    c.strokeStyle = '#d8e8ee'; c.lineWidth = 1.2; for (let i = -4; i <= 4; i++) { const ix = hx + i * hs * 0.24, iy = ry + hs * 0.02; c.beginPath(); c.moveTo(ix, iy); c.lineTo(ix + 0.5, iy + hs * (0.08 + (i & 1) * 0.06)); c.stroke(); }
    // steam cupola on the ridge and its plume (the sign that the sap is boiling)
    c.fillStyle = '#5a3419'; c.fillRect(hx - hs * 0.2, rt - hs * 0.36, hs * 0.4, hs * 0.3);
    c.fillStyle = '#eef6f8'; c.beginPath(); c.moveTo(hx - hs * 0.32, rt - hs * 0.34); c.lineTo(hx, rt - hs * 0.58); c.lineTo(hx + hs * 0.32, rt - hs * 0.34); c.closePath(); c.fill();
    for (let i = 0; i < 6; i++) { const sx = hx + Math.sin(i * 1.3) * hs * 0.25 + i * hs * 0.12, sy = rt - hs * 0.7 - i * hs * 0.36, sr = hs * (0.22 + i * 0.09);
      g = c.createRadialGradient(sx, sy, 0, sx, sy, sr); g.addColorStop(0, 'rgba(255,255,255,' + (0.42 - i * 0.06).toFixed(2) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(sx, sy, sr, 0, TAU); c.fill(); }
    if (lp >= 8) { // string lights along the eaves for a well-tended sugarbush
      const cols = ['#ffd36a', '#f08a5a', '#82c9de', '#8ac36c'];
      for (let i = 0; i <= 10; i++) { const k = i / 10, lx = hx - hs * 1.15 + k * hs * 2.3, ly = ry + hs * 0.05 + Math.sin(k * Math.PI) * hs * 0.08;
        g = c.createRadialGradient(lx, ly, 0, lx, ly, hs * 0.12); g.addColorStop(0, cols[i % 4]); g.addColorStop(1, 'rgba(255,220,120,0)'); c.fillStyle = g; c.beginPath(); c.arc(lx, ly, hs * 0.12, 0, TAU); c.fill(); }
    }
    // woodpile
    for (let r = 0; r < 3; r++) for (let q = 0; q < 4 - r; q++) { const lx = hx - hs * 1.45 + q * hs * 0.19 + r * hs * 0.095, ly = hy - hs * 0.08 - r * hs * 0.17;
      c.fillStyle = '#8a5a32'; c.beginPath(); c.arc(lx, ly, hs * 0.095, 0, TAU); c.fill(); c.fillStyle = '#c99a62'; c.beginPath(); c.arc(lx, ly, hs * 0.055, 0, TAU); c.fill(); }
    c.fillStyle = '#eef6f8'; c.fillRect(hx - hs * 1.6, hy - hs * 0.02, hs * 3.2, hs * 0.08);
    c.fillStyle = 'rgba(8,16,22,.28)'; c.fillRect(0, 0, W, H); // calm it down so the board pops
    // a warm glowing moon (drawn after the calm-down layer so it stays bright)
    const mr = Math.min(W, H) * 0.045, mx = L.land ? mr * 1.7 : W * 0.84, my = H * 0.1; // landscape: top-left corner, clear of the HUD
    g = c.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 4); g.addColorStop(0, 'rgba(255,226,150,.28)'); g.addColorStop(1, 'rgba(255,226,150,0)');
    c.fillStyle = g; c.beginPath(); c.arc(mx, my, mr * 4, 0, TAU); c.fill();
    g = c.createRadialGradient(mx - mr * 0.35, my - mr * 0.35, mr * 0.1, mx, my, mr); g.addColorStop(0, '#fffbe8'); g.addColorStop(1, '#f2d58f');
    c.fillStyle = g; c.beginPath(); c.arc(mx, my, mr, 0, TAU); c.fill();
    c.fillStyle = 'rgba(200,160,90,.28)';
    [[0.3, -0.2, 0.22], [-0.25, 0.3, 0.16], [0.1, 0.45, 0.1]].forEach(q => { c.beginPath(); c.arc(mx + q[0] * mr, my + q[1] * mr, q[2] * mr, 0, TAU); c.fill(); });
  }

  // ---------------------------------------------------------------- views
  const artOf = v => R.artIndex(G.mode, v);
  function mkView(tile) {
    return { id: tile.id, v: tile.v, x: tile.c, y: tile.r, fx: tile.c, fy: tile.r, tx: tile.c, ty: tile.r, t0: 0, dur: 0, bornT: -1e9, popT: -1e9, hopT: -1e9,
      happyUntil: 0, helloUntil: 0, blinkNext: G.t + 600 + Math.random() * 3500, blinkT: -1e9, phase: Math.random() * 6.28, clip: false, bonus: !!tile.bonus, steamT: 0, under: false };
  }
  function viewPos(v) {
    if (v.dur > 0) {
      const k = (G.t - v.t0) / v.dur;
      if (k >= 1) { v.x = v.tx; v.y = v.ty; v.dur = 0; v.clip = false; }
      else { const e = easeOutCubic(Math.max(0, k)); v.x = v.fx + (v.tx - v.fx) * e; v.y = v.fy + (v.ty - v.fy) * e; }
    }
    return v;
  }
  function slideFrom(v, fx, fy, tx, ty, dur) { v.fx = fx; v.fy = fy; v.tx = tx; v.ty = ty; v.t0 = G.t; v.dur = dur; v.x = fx; v.y = fy; }
  function rebuildViews(stagger) {
    G.views.clear(); G.ghosts.length = 0;
    let i = 0;
    G.st.grid.forEach(t => { if (!t) return; const v = mkView(t); v.bornT = G.t + (stagger ? i * 40 : -1e9); G.views.set(t.id, v); i++; });
  }
  function later(ms, fn) { G.q.push({ at: G.t + ms, fn, gen: G.gen }); }

  // ---------------------------------------------------------------- particles
  function burst(x, y, col, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = 60 + Math.random() * 150;
      G.parts.push({ k: 'dot', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 70, g: 460, life: 0, max: 420 + Math.random() * 340, size: 2 + Math.random() * 3.6, col });
    }
    for (let i = 0; i < 3; i++) G.parts.push({ k: 'star', x, y, vx: (Math.random() - 0.5) * 140, vy: -60 - Math.random() * 90, g: 200, life: 0, max: 520, size: 4 + Math.random() * 3, col: '#fff6b8' });
    if (G.parts.length > 320) G.parts.splice(0, G.parts.length - 320);
  }
  function ring(x, y, col) { G.parts.push({ k: 'ring', x, y, life: 0, max: 400, size: L.cell * 0.28, col }); }
  function floatText(x, y, txt, col, size) { G.parts.push({ k: 'text', x, y, vx: 0, vy: -26, life: 0, max: 950, txt, col: col || '#fff1cf', size: size || 22 }); }
  // big word in the middle of the board (combo, finale): grows in with a wobble, drifts up, fades
  function callout(txt, size, col, max) { // one at a time: a second callout waits for the first to clear
    if (G.t < (G.calloutUntil || 0)) { const w = G.calloutUntil - G.t + 40; later(w, () => callout(txt, size, col, max)); return; }
    G.calloutUntil = G.t + (max || 1000) * 0.8;
    G.parts.push({ k: 'callout', x: L.cw / 2, y: L.ch / 2, vx: 0, vy: -26, life: 0, max: max || 1000, txt, col: col || '#ffe27a', size });
  }
  function confetti(n) {
    const cols = ['#ffd36a', '#f08a5a', '#82c9de', '#8ac36c', '#fff1cf', '#d8452a'];
    for (let i = 0; i < n; i++) G.parts.push({ k: 'conf', x: L.m + Math.random() * L.bs, y: L.m - 10 - Math.random() * 60, vx: (Math.random() - 0.5) * 60, vy: 40 + Math.random() * 80, g: 160, life: 0, max: 1600 + Math.random() * 900, size: 4 + Math.random() * 4, col: cols[i % cols.length], spin: Math.random() * 6, rot: Math.random() * 6 });
  }
  function steam(x, y) { G.parts.push({ k: 'steam', x, y, vx: (Math.random() - 0.5) * 12, vy: -24 - Math.random() * 16, life: 0, max: 1100 + Math.random() * 600, size: 4 + Math.random() * 4 }); }

  function updateParts(dt) {
    const s = dt / 1000;
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const p = G.parts[i]; p.life += dt;
      if (p.life >= p.max) { G.parts.splice(i, 1); continue; }
      p.x += (p.vx || 0) * s; p.y += (p.vy || 0) * s;
      if (p.g) p.vy += p.g * s;
      if (p.k === 'steam') p.vx += Math.sin(p.life / 220 + p.x) * 0.4;
    }
  }
  function drawParts(c) {
    G.parts.forEach(p => {
      const k = p.life / p.max;
      c.save();
      if (p.k === 'dot') { c.globalAlpha = 1 - k * k; c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y, p.size * (1 - k * 0.4), 0, TAU); c.fill(); }
      else if (p.k === 'star') {
        c.globalAlpha = 1 - k; c.translate(p.x, p.y); c.rotate(k * 6); c.fillStyle = p.col; c.beginPath();
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? p.size * 0.35 : p.size; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        c.closePath(); c.fill();
      } else if (p.k === 'ring') { c.globalAlpha = (1 - k) * 0.9; c.strokeStyle = p.col; c.lineWidth = 4 * (1 - k) + 1; c.beginPath(); c.arc(p.x, p.y, p.size * (1 + k * 2.2), 0, TAU); c.stroke(); }
      else if (p.k === 'steam') {
        const r = p.size * (1 + k * 3.2), a = 0.34 * Math.sin(Math.min(1, k * 1.2) * Math.PI) * (1 - k * 0.4);
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); g.addColorStop(0, 'rgba(255,255,255,' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.fill();
      } else if (p.k === 'text') {
        const sc = k < 0.15 ? easeOutBack(k / 0.15) : 1; c.globalAlpha = k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1;
        c.translate(p.x, p.y); c.scale(sc, sc); c.font = p.size + 'px "Lilita One", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = 5; c.lineJoin = 'round'; c.strokeStyle = '#3b2412'; c.strokeText(p.txt, 0, 0); c.fillStyle = p.col; c.fillText(p.txt, 0, 0);
      } else if (p.k === 'callout') {
        const sc = k < 0.2 ? easeOutBack(k / 0.2) : 1 + (k - 0.2) * 0.08;
        c.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
        c.translate(p.x, p.y); c.rotate(Math.sin(k * 9) * 0.05 * (1 - k) - 0.04); c.scale(sc, sc);
        c.font = p.size + 'px "Lilita One", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineJoin = 'round'; c.lineWidth = p.size * 0.32; c.strokeStyle = '#3b2412'; c.strokeText(p.txt, 0, 0);
        const g = c.createLinearGradient(0, -p.size * 0.5, 0, p.size * 0.5); g.addColorStop(0, '#fff6c2'); g.addColorStop(0.55, p.col); g.addColorStop(1, '#e07c0c');
        c.fillStyle = g; c.fillText(p.txt, 0, 0);
      } else if (p.k === 'conf') {
        c.globalAlpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1; c.translate(p.x, p.y); c.rotate(p.rot + k * p.spin * 4);
        c.fillStyle = p.col; c.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
      }
      c.restore();
    });
  }

  // ---------------------------------------------------------------- preview / plans
  function getPlan(dir) {
    const pv = G.pv, st = G.st;
    if (pv.cacheMoves !== st.moves + st.nextId * 1000) { pv.plans = {}; pv.cacheMoves = st.moves + st.nextId * 1000; }
    return pv.plans[dir] || (pv.plans[dir] = R.plan(st, dir));
  }
  function setPreviewDir(dir) {
    const pv = G.pv, plan = getPlan(dir);
    if (pv.dir !== dir) {
      pv.dir = dir; pv.plan = plan; pv.armed = false;
      pv.moveIds = new Set(plan.moves.map(m => m.id));
      pv.absIds = new Set(plan.moves.filter(m => m.absorbedBy != null).map(m => m.id));
      pv.mergeIds = new Set(); plan.merges.forEach(m => { pv.mergeIds.add(m.survivor.id); pv.mergeIds.add(m.absorbed.id); });
      pv.result = new Map(plan.merges.map(m => [m.survivor.id, m.value]));
      pv.spawn = G.mode === 'shack' ? R.previewSpawn(G.st, dir, plan) : null;
      // every line that moves could receive the new tile; which one is only decided when you let go
      pv.spawns = pv.spawn ? plan.movedLines.map(line => { const rc = R.lineCell(dir, line, R.N - 1); return { r: rc[0], c: rc[1] }; }) : [];
      pv.dead = !plan.moved;
    }
  }
  function clearPreview() { const pv = G.pv; pv.dir = null; pv.p = 0; pv.tp = 0; pv.armed = false; pv.dragging = false; pv.demo = false; pv.hold = false; pv.plan = null; pv.spawn = null; pv.dead = false; }

  // ---------------------------------------------------------------- committing a move
  function commit(dir, p0) {
    if (G.over || G.screen !== 'game') return false;
    const st = G.st, pv = G.pv, dv = DV[dir];
    const useOff = G.mode === 'shack' && pv.dir === dir && !pv.dead ? clamp(pv.p, 0, 1) : 0;
    const nextBefore = st.next;
    const res = R.move(st, dir);
    if (!res.moved) { Snd.bonk(); vib(8); kickTilt(dir, -0.6); return false; }
    const dur = G.mode === 'shack' ? Math.round(150 - useOff * 70) : 130;
    clearPreview();
    G.idle = 0; stopGhost();

    // slide every tile
    res.moves.forEach(m => {
      const v = G.views.get(m.id); if (!v) return;
      viewPos(v);
      const fx = v.x + dv.dc * useOff, fy = v.y + dv.dr * useOff;
      slideFrom(v, fx, fy, m.to[1], m.to[0], dur);
      if (m.absorbedBy != null) { G.views.delete(m.id); v.endAt = G.t + dur; G.ghosts.push(v); }
    });
    // merges pop when the slide lands
    const combo = { n: 0 };
    res.merges.forEach((m, i) => {
      const oldA = m.value === 3 ? 0 : m.value / 2;
      const delta = G.mode === 'quick' ? m.value : R.points(m.value) - R.points(oldA) * 2;
      later(dur * 0.92, () => doMerge(m, i, delta));
    });
    const nm = res.merges.length;
    if (nm >= 2) later(dur + 30, () => {
      const words = ['', '', 'Double!', 'Triple!', 'Sap rush!', 'Sugar storm!'];
      callout(words[Math.min(5, nm)], nm === 2 ? 34 : 46, nm === 2 ? '#ffd36a' : '#ffb52e', nm === 2 ? 760 : 1100);
      Snd.combo(nm); vib(nm === 2 ? 12 : [12, 30, 18]);
      if (nm >= 3) G.shakeBig = G.t + 140;
    });
    // new tile
    if (res.spawned) {
      const sp = res.spawned, v = mkView(sp);
      if (G.mode === 'shack') {
        v.fx = sp.c + dv.dc * (useOff - 1); v.fy = sp.r + dv.dr * (useOff - 1); v.x = v.fx; v.y = v.fy; v.tx = sp.c; v.ty = sp.r; v.t0 = G.t; v.dur = dur; v.clip = true;
        v.bornT = -1e9; v.bonus = !!sp.bonus;
      } else { v.bornT = G.t + dur * 0.8; }
      G.views.set(sp.id, v);
    }
    G.nextBounce = G.t + dur; G.nextSeen = G.st.next;
    // sounds
    Snd.slide(dir); vib(6);
    if (res.spawned) later(dur * 0.9, () => Snd.spawn());
    kickTilt(dir, 1);
    // stats + save
    stats.moves++; stats.merges += res.merges.length; if (G.daily) stats.daily.moves = (stats.daily.moves || 0) + 1; else stats.modes[G.mode].moves++;
    saveStats();
    if (res.newHighest && st.highest >= 3) later(dur + 140, () => celebrateHighest(st.highest));
    if (G.daily && !G.practice) {
      const h = stats.daily.hist[G.daily] || (stats.daily.hist[G.daily] = { best: 0, top: 0 });
      const was = h.m || 0, m = medalFor(G.daily, st.score);
      if (m > was) h.m = m;
      noteDailyTop(G.daily, st.highest);
      if (m > was) later(dur + 700, () => { callout(MEDALS[m].name + ' leaf!', 40, ['', '#ffb36b', '#f4fbff', '#ffe27a'][m], 1500); Snd.medal(m); vib([20, 40, 20]); setHint(); });
    }
    computeNerv();
    updateHUD();
    setHint();
    if (res.over) { later(dur + 520, () => startOver()); saveGame(true); } else saveGame();
    return true;
  }

  function doMerge(m, order, delta) {
    const sv = G.views.get(m.survivor.id); if (!sv) return;
    sv.v = m.value; sv.popT = G.t; sv.happyUntil = G.t + 720; sv.bonus = false;
    const [x, y] = cellXY(sv.tx, sv.ty), idx = artOf(m.value);
    burst(x, y, A.colorOf(idx), 11); ring(x, y, '#fff3c0');
    if (delta > 0) floatText(x, y - L.cell * 0.12, '+' + fmt(delta), '#fff1cf', 19);
    Snd.merge(idx, order); vib(10);
    if (G.tally == null) { G.shake = G.t + 120; }
  }

  function celebrateHighest(val) {
    if (G.over) return;
    const idx = artOf(val);
    const view = [...G.views.values()].find(v => v.v === val); if (!view) return;
    view.helloUntil = G.t + 1100; view.hopT = G.t;
    const first = stats.met.indexOf(idx) < 0;
    if (first) { stats.met.push(idx); saveStats(); }
    // the hello bubble waits for any combo callout to clear, so they never stack
    const wait = Math.max(0, (G.calloutUntil || 0) - G.t);
    const say = () => { G.bubbles.push({ id: view.id, text: A.HELLO[idx], sub: first ? 'New friend: ' + A.NAMES[idx] : '', t0: G.t, dur: first ? 1300 : 950 }); Snd.hello(idx); };
    if (wait > 0) later(wait, say); else say();
    Snd.newHighest(idx); vib([15, 30, 25]);
    G.topPop = G.t; $('topName').classList.remove('bump'); void $('topName').offsetWidth; $('topName').classList.add('bump');
    const [x, y] = cellXY(view.tx, view.ty);
    burst(x, y, A.colorOf(idx), 22); ring(x, y, '#ffe27a');
    G.shakeBig = G.t + 160;
  }

  function computeNerv() {
    const e = R.emptyCells(G.st).length;
    G.nerv = e <= 1 ? 2 : e <= 2 ? 1 : 0;
    // only the tiles that can't move any way sweat (not the whole board)
    G.stuck = new Set();
    if (G.nerv) { const mv = new Set(); R.DIR_NAMES.forEach(d => R.plan(G.st, d).moves.forEach(m => mv.add(m.id))); G.st.grid.forEach(t => { if (t && !mv.has(t.id)) G.stuck.add(t.id); }); }
    if (Snd.setTension) Snd.setTension(G.over ? 0 : G.nerv);
  }

  function doUndo() {
    if (G.mode !== 'quick' || !R.canUndo(G.st)) return;
    if (G.over) { // rescue a lost game with the one undo
      G.over = false; G.tally = null; G.pendingRecord = null; G.gen++; G.q = [];
      $('over').classList.add('hidden'); $('foot').classList.remove('ended');
    }
    G.gen++; G.q = []; if (Snd.duck) Snd.duck(false);
    R.undo(G.st);
    const keep = new Set();
    G.ghosts.length = 0;
    G.st.grid.forEach(t => {
      if (!t) return; keep.add(t.id);
      let v = G.views.get(t.id);
      if (!v) { v = mkView(t); v.bornT = G.t; G.views.set(t.id, v); }
      else { viewPos(v); slideFrom(v, v.x, v.y, t.c, t.r, 170); v.v = t.v; }
    });
    [...G.views.keys()].forEach(id => { if (!keep.has(id)) G.views.delete(id); });
    Snd.undo(); vib(12); clearPreview(); computeNerv(); updateHUD(); saveGame(); setHint();
    toast('Undone!');
  }

  // ---------------------------------------------------------------- tilt
  function kickTilt(dir, s) {
    const a = 70 * s;
    if (dir === 'up') G.tilt.vx += a; else if (dir === 'down') G.tilt.vx -= a; else if (dir === 'right') G.tilt.vy += a; else G.tilt.vy -= a;
  }
  function updateTilt(dt) {
    const pv = G.pv, T = G.tilt, s = dt / 1000;
    let tx = 0, ty = 0;
    if (pv.dir) {
      const a = 5.5 * clamp(pv.tp, 0, 1.15);
      if (pv.dir === 'up') tx = a; else if (pv.dir === 'down') tx = -a; else if (pv.dir === 'right') ty = a; else ty = -a;
    }
    const k = 260, c = 20;
    T.vx += ((tx - T.x) * k - T.vx * c) * s; T.x += T.vx * s;
    T.vy += ((ty - T.y) * k - T.vy * c) * s; T.y += T.vy * s;
  }

  // ---------------------------------------------------------------- face moods
  function faceFor(v) {
    const t = G.t / 1000, fm = { mode: 'idle', t, blink: 0, lx: 0, ly: 0, phase: v.phase };
    if (G.t >= v.blinkNext) { v.blinkT = G.t; v.blinkNext = G.t + 1800 + Math.random() * 3800; }
    const bk = (G.t - v.blinkT) / 140; if (bk >= 0 && bk < 1) fm.blink = Math.sin(bk * Math.PI);
    if (G.t < v.happyUntil) fm.mode = 'happy';
    else if (G.t < v.helloUntil) fm.mode = 'hello';
    else if (G.over) fm.mode = G.tally ? 'idle' : 'nervous';
    else if (G.nerv > 0 && G.stuck && G.stuck.has(v.id)) fm.mode = 'nervous';
    else if (G.pv.dir && !G.pv.dead && G.pv.mergeIds.has(v.id) && G.pv.p > 0.25) fm.mode = 'excited';
    const pv = G.pv;
    if (pv.dir && !pv.dead) { const d = DV[pv.dir]; fm.lx = d.dc; fm.ly = d.dr; }
    else { fm.lx = Math.sin(t * 0.8 + v.phase) * 0.6; fm.ly = Math.cos(t * 0.6 + v.phase * 1.3) * 0.35; }
    return fm;
  }

  // ---------------------------------------------------------------- rendering
  function drawView(c, v, dx, dy, opts) {
    opts = opts || {};
    viewPos(v);
    if (G.t < v.bornT) return;
    const px = cellXY(v.x + dx, v.y + dy);
    let X = px[0], Y = px[1], sx = 1, sy = 1, rot = 0, glow = opts.glow || 0;
    const S = L.cell * 0.985;
    let k = (G.t - v.bornT) / 280;
    if (k < 1) { const s = Math.max(0.02, easeOutBack(k)); sx = sy = s; }
    k = (G.t - v.popT) / 400;
    if (k >= 0 && k < 1) {
      const base = 1 + 0.22 * Math.sin(Math.PI * Math.min(1, k * 1.7)) * (k < 0.6 ? 1 : (1 - (k - 0.6) / 0.4));
      const w = 0.16 * Math.sin(k * Math.PI * 3.2) * (1 - k);
      sx *= base * (1 + w); sy *= base * (1 - w);
    }
    k = (G.t - v.hopT) / 800;
    if (k >= 0 && k < 1) { Y -= L.cell * 0.14 * Math.abs(Math.sin(k * Math.PI * 3)) * (1 - k); rot = Math.sin(k * 14) * 0.09 * (1 - k); }
    if (G.nerv > 0 && !G.over && G.stuck && G.stuck.has(v.id)) { X += Math.sin(G.t * 0.07 + v.phase * 5) * 0.5 * G.nerv; Y += Math.cos(G.t * 0.09 + v.phase * 3) * 0.4 * G.nerv; }
    if (G.over) { X += Math.sin(G.t * 0.07 + v.phase * 5) * 0.4; }
    A.drawTile(c, X, Y, S, artOf(v.v), v.v, { sx, sy, rot, fm: faceFor(v), t: G.t / 1000, glow, phase: v.phase, bonus: v.bonus });
  }

  function render() {
    const c = bx, pv = G.pv, { cw, ch, m, bs, pad } = L;
    c.clearRect(0, 0, cw, ch);
    c.drawImage(trayC, 0, 0, cw, ch);
    if (pv.armed && pv.dir && !pv.dead) {
      c.save(); A.rr(c, m - 2, m - 2, bs + 4, bs + 4, bs * 0.08); c.strokeStyle = 'rgba(255,205,90,' + (0.6 + 0.25 * Math.sin(G.t / 80)).toFixed(2) + ')';
      c.lineWidth = 4; c.shadowColor = '#ffb52e'; c.shadowBlur = 16; c.stroke(); c.restore();
    }
    const d = pv.dir ? DV[pv.dir] : null;
    const useOff = G.mode === 'shack' && pv.dir && !pv.dead;
    G.ghosts.forEach(v => drawView(c, v, 0, 0));
    const list = [...G.views.values()];
    // tiles about to be swallowed sit underneath; popping and hello tiles sit on top
    const rank = v => (useOff && pv.absIds.has(v.id) ? -1 : (G.t - v.popT < 420 || G.t < v.helloUntil ? 1 : 0));
    list.sort((a, b) => rank(a) - rank(b));
    list.forEach(v => {
      let dx = 0, dy = 0, glow = 0;
      if (useOff && pv.moveIds.has(v.id)) { dx = d.dc * pv.p; dy = d.dr * pv.p; }
      if (useOff && pv.mergeIds.has(v.id) && !pv.absIds.has(v.id)) glow = clamp((pv.p - 0.2) * 1.2, 0, 0.7);
      if (pv.dead && pv.dir && pv.dragging) { const n = Math.min(0.07, pv.tp * 0.3) + Math.sin(G.t / 28 + v.phase) * 0.008 * clamp(pv.tp * 5, 0, 1); dx = DV[pv.dir].dc * n; dy = DV[pv.dir].dr * n; } // tiles bump the wall: nothing can move this way
      if (v.clip) { c.save(); A.rr(c, m + pad * 0.4, m + pad * 0.4, bs - pad * 0.8, bs - pad * 0.8, bs * 0.06); c.clip(); drawView(c, v, dx, dy, { glow }); c.restore(); }
      else drawView(c, v, dx, dy, { glow });
    });
    // what each merge will make: a little badge grows on the tile as you drag
    if (useOff && pv.result && pv.p > 0.1) pv.result.forEach((val, id) => {
      const v = G.views.get(id); if (!v) return;
      drawBadge(c, v, val, clamp((pv.p - 0.1) / 0.3, 0, 1));
    });
    // the incoming tile peeks in from the edge as you drag
    if (useOff && pv.spawn && pv.p > 0.02) {
      const sp = pv.spawn, many = pv.spawns.length > 1;
      c.save(); A.rr(c, m + pad * 0.4, m + pad * 0.4, bs - pad * 0.8, bs - pad * 0.8, bs * 0.06); c.clip();
      pv.spawns.forEach((cell, i) => {
        const px = cellXY(cell.c + d.dc * (pv.p - 1), cell.r + d.dr * (pv.p - 1));
        const al = many ? (0.22 + 0.33 * pv.p) * (0.85 + 0.15 * Math.sin(G.t / 160 + i * 1.7)) : 0.5 + 0.5 * pv.p;
        A.drawTile(c, px[0], px[1], L.cell * 0.985, artOf(sp.v), sp.v, { alpha: al, t: G.t / 1000, bonus: sp.bonus, fm: { mode: 'excited', t: G.t / 1000 } });
      });
      c.restore();
      if (many) pv.spawns.forEach(cell => { // a "?" pinned at the tray rim on each row it might enter (never clipped)
        const ex = cellXY(cell.c, cell.r), rx = d.dc ? (d.dc < 0 ? m + bs - L.cell * 0.2 : m + L.cell * 0.2) : ex[0], ry = d.dr ? (d.dr < 0 ? m + bs - L.cell * 0.2 : m + L.cell * 0.2) : ex[1];
        c.save(); c.globalAlpha = clamp(pv.p * 2.2, 0, 1); c.beginPath(); c.arc(rx, ry, L.cell * 0.16, 0, TAU); c.fillStyle = '#ffe27a'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#3b2412'; c.stroke();
        c.font = Math.round(L.cell * 0.22) + 'px "Lilita One", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#3b2412'; c.fillText('?', rx, ry + 1); c.restore();
      });
    }
    drawSpotlight(c);
    drawBubbles(c);
    drawParts(c);
    drawNextCard();
  }

  // the end beat: once the count is done the board dims and your top character takes a bow
  function drawSpotlight(c) {
    const T = G.tally; if (!G.over || !T || !T.done || !G.st) return;
    const k = clamp((G.t - T.doneT) / 450, 0, 1), { m, bs, cw, ch } = L, cx = cw / 2, cy = ch / 2 - L.cell * 0.12;
    c.save(); A.rr(c, m, m, bs, bs, bs * 0.075); c.fillStyle = 'rgba(14,8,3,' + (0.62 * k).toFixed(3) + ')'; c.fill();
    c.translate(cx, cy); c.rotate(G.t / 4000);
    for (let i = 0; i < 12; i++) { c.rotate(TAU / 12); c.beginPath(); c.moveTo(0, 0); c.lineTo(bs * 0.48, -bs * 0.06); c.lineTo(bs * 0.48, bs * 0.06); c.closePath(); c.fillStyle = 'rgba(255,214,110,' + (0.13 * k).toFixed(3) + ')'; c.fill(); }
    c.restore();
    const top = G.st.highest, idx = artOf(top), S = L.cell * 1.85 * easeOutBack(k), t = G.t / 1000;
    if (S > 2) A.drawTile(c, cx, cy + Math.sin(t * 2) * 3, S, idx, top, { t, phase: 1, rot: Math.sin(t * 1.3) * 0.03, fm: { mode: G.t - T.doneT < 1600 ? 'hello' : 'happy', t, blink: 0, lx: 0, ly: 0.2, phase: 1 } });
    if (k > 0.5) {
      c.save(); c.globalAlpha = (k - 0.5) * 2; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = Math.round(L.cell * 0.32) + 'px "Lilita One", system-ui, sans-serif'; c.lineJoin = 'round'; c.lineWidth = 6; c.strokeStyle = '#3b2412';
      const y = cy + L.cell * 1.18, label = A.NAMES[idx];
      c.strokeText(label, cx, y); c.fillStyle = '#ffe27a'; c.fillText(label, cx, y);
      c.font = '800 ' + Math.round(L.cell * 0.17) + 'px Nunito, system-ui, sans-serif'; c.lineWidth = 4;
      const q = '\u201c' + A.HELLO[idx] + '\u201d'; c.strokeText(q, cx, y + L.cell * 0.32); c.fillStyle = '#fff1cf'; c.fillText(q, cx, y + L.cell * 0.32);
      c.restore();
    }
  }

  function drawBadge(c, v, val, k) {
    const [x, y] = cellXY(v.x, v.y), cell = L.cell, s = easeOutBack(k);
    const txt = fmt(val), fs = Math.round(cell * 0.25);
    c.save();
    c.font = fs + 'px "Lilita One", system-ui, sans-serif';
    const w = Math.max(cell * 0.4, c.measureText(txt).width + cell * 0.2), h = cell * 0.34;
    c.translate(x + cell * 0.36, y - cell * 0.4 + Math.sin(G.t / 120) * 1.2); c.scale(s, s); c.rotate(0.08);
    c.shadowColor = 'rgba(255,190,60,.8)'; c.shadowBlur = 10;
    A.rr(c, -w / 2, -h / 2, w, h, h / 2); c.fillStyle = '#ffe58a'; c.fill(); c.shadowBlur = 0;
    c.lineWidth = 2.5; c.strokeStyle = '#3b2412'; c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#7a2e0e'; c.fillText(txt, 0, h * 0.06);
    c.restore();
  }

  function drawBubbles(c) {
    for (let i = G.bubbles.length - 1; i >= 0; i--) {
      const b = G.bubbles[i], k = (G.t - b.t0) / b.dur;
      if (k >= 1) { G.bubbles.splice(i, 1); continue; }
      const v = G.views.get(b.id); if (!v) { G.bubbles.splice(i, 1); continue; }
      viewPos(v);
      const [x, y0] = cellXY(v.x, v.y);
      const sc = k < 0.12 ? easeOutBack(k / 0.12) : 1, al = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
      c.save(); c.globalAlpha = al;
      c.font = '19px "Lilita One", system-ui, sans-serif';
      const w1 = c.measureText(b.text).width; c.font = '800 12px Nunito, system-ui, sans-serif'; const w2 = b.sub ? c.measureText(b.sub).width : 0;
      const w = Math.max(w1, w2) + 24, h = b.sub ? 48 : 32;
      let bxx = clamp(x, L.m + w / 2 + 2, L.cw - L.m - w / 2 - 2);
      let by = y0 - L.cell * 0.55 - h / 2 - Math.sin(k * 6) * 2 - k * 6;
      const below = by - h / 2 < 2;
      if (below) by = y0 + L.cell * 0.5 + h / 2 + 8 + Math.sin(k * 6) * 2;
      c.translate(bxx, by); c.scale(sc, sc);
      A.rr(c, -w / 2, -h / 2, w, h, 14); c.fillStyle = '#fff6dc'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#3b2412'; c.stroke();
      const tx = clamp(x - bxx, -w / 2 + 14, w / 2 - 14);
      const sg = below ? -1 : 1; // tail points up when the bubble sits below the tile
      c.beginPath(); c.moveTo(tx - 7, sg * (h / 2 - 1)); c.lineTo(tx, sg * (h / 2 + 9)); c.lineTo(tx + 7, sg * (h / 2 - 1)); c.closePath(); c.fillStyle = '#fff6dc'; c.fill(); c.lineWidth = 3; c.stroke();
      c.beginPath(); c.moveTo(tx - 6, sg * (h / 2 - 0.5)); c.lineTo(tx + 6, sg * (h / 2 - 0.5)); c.strokeStyle = '#fff6dc'; c.lineWidth = 4; c.stroke();
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#3b2412';
      c.font = '19px "Lilita One", system-ui, sans-serif'; c.fillText(b.text, 0, b.sub ? -9 : 1);
      if (b.sub) { c.font = '800 12px Nunito, system-ui, sans-serif'; c.fillStyle = '#b3481f'; c.fillText(b.sub, 0, 13); }
      c.restore();
    }
  }

  function drawNextCard() {
    if (G.mode !== 'shack' || !G.st) return;
    const c = nx; c.clearRect(0, 0, 52, 52);
    const k = clamp((G.t - G.nextBounce) / 300, 0, 1);
    const s = 0.55 + 0.45 * easeOutBack(k);
    const st = G.st, t = G.t / 1000;
    A.drawTile(c, 26, 27, 44, artOf(st.next), st.next, { sx: s, sy: s, t, bonus: st.nextBonus, shadow: false, fm: { mode: 'idle', t, blink: 0, lx: 0, ly: 0, phase: 1 } });
  }

  // ---------------------------------------------------------------- update
  function update(dt) {
    G.t += dt;
    for (let i = 0; i < G.q.length; i++) {
      if (G.t >= G.q[i].at) { const e = G.q.splice(i, 1)[0]; i--; if (e.gen === G.gen) e.fn(); }
    }
    if (G.screen === 'title') return;
    if (G.screen !== 'game') return;
    for (let i = G.ghosts.length - 1; i >= 0; i--) if (G.t >= G.ghosts[i].endAt) G.ghosts.splice(i, 1);
    updateParts(dt);
    const pv = G.pv;
    if (!pv.dragging && !pv.demo && !pv.hold && pv.dir) {
      const f = 1 - Math.exp(-dt / 50);
      pv.p += (0 - pv.p) * f; pv.tp += (0 - pv.tp) * f;
      if (pv.p < 0.004 && pv.tp < 0.004) clearPreview();
    }
    updateTilt(dt);
    // steam from boiling pans (art 4) and a little more when happy
    G.views.forEach(v => {
      if (artOf(v.v) !== 4 || G.t < v.bornT) return;
      v.steamT -= dt;
      if (v.steamT <= 0) { v.steamT = 110 + Math.random() * 80; viewPos(v); const [x, y] = cellXY(v.x, v.y); steam(x + (Math.random() - 0.5) * L.cell * 0.4, y - L.cell * 0.28); }
    });
    updateGhost(dt);
    updateTally(dt);
    G.idle += dt;
    if (!G.over && !G.ghost.on && !G.overlay && G.idle > 7000 && stats.modes[G.mode].moves < 10 && !pv.dragging && G.screen === 'game') startGhost();
    // apply tilt + screen shake to the stage
    const sh = G.t < G.shakeBig ? (Math.random() - 0.5) * 4 : (G.t < G.shake ? (Math.random() - 0.5) * 1.6 : 0);
    const sh2 = G.t < G.shakeBig ? (Math.random() - 0.5) * 4 : (G.t < G.shake ? (Math.random() - 0.5) * 1.6 : 0);
    $('stage').style.transform = 'rotateX(' + G.tilt.x.toFixed(2) + 'deg) rotateY(' + G.tilt.y.toFixed(2) + 'deg) translate(' + sh.toFixed(1) + 'px,' + sh2.toFixed(1) + 'px)';
  }

  // ---------------------------------------------------------------- tutorial ghost hand
  function bestDemoDir() {
    let best = null, bs = -1;
    R.DIR_NAMES.forEach(d => { const p = R.plan(G.st, d); if (!p.moved) return; const s = p.merges.length * 10 + p.moves.length; if (s > bs) { bs = s; best = d; } });
    return best || 'left';
  }
  function startGhost() {
    if (G.over || G.ghost.on || G.pv.dragging) return;
    G.ghost.on = true; G.ghost.t = 0; G.ghost.dir = bestDemoDir();
    $('ghost').classList.remove('hidden');
  }
  function stopGhost() {
    if (!G.ghost.on) return;
    G.ghost.on = false; $('ghost').classList.add('hidden'); $('ghost').style.opacity = 0;
    if (G.pv.demo) clearPreview();
    $('hint').classList.remove('pulse');
  }
  function updateGhost(dt) {
    const g = G.ghost; if (!g.on) return;
    g.t += dt;
    const per = 3200, k = g.t % per, dir = g.dir, d = DV[dir];
    let p = 0, op = 1;
    if (k < 350) { op = k / 350; p = 0; }
    else if (k < 1350) p = easeInOut((k - 350) / 1000) * 0.82;
    else if (k < 1950) p = 0.82;
    else if (k < 2550) p = 0.82 * (1 - easeInOut((k - 1950) / 600));
    else { op = 1 - (k - 2550) / 650; p = 0; }
    const r = $('stage').getBoundingClientRect(), gr = $('game').getBoundingClientRect();
    const cx = r.left - gr.left + r.width / 2, cy = r.top - gr.top + r.height / 2;
    const off = p * L.cell * 0.9;
    $('ghost').style.transform = 'translate(' + (cx + d.dc * (off - 10)) + 'px,' + (cy + d.dr * (off - 10) + 20) + 'px) scale(' + (k > 1950 && k < 2550 ? 1 : 1) + ')';
    $('ghost').style.opacity = op;
    $('hint').classList.add('pulse');
    if (G.mode === 'shack') {
      const pv = G.pv;
      if (!pv.dragging) {
        if (p > 0.001) { setPreviewDir(dir); pv.demo = true; pv.p = p; pv.tp = p; pv.armed = p > 0.5; }
        else if (pv.demo) { pv.p = 0; pv.tp = 0; pv.armed = false; }
      }
    }
  }

  // ---------------------------------------------------------------- hud
  function updateHUD() {
    const st = G.st; if (!st) return;
    // while the end-of-game count runs, the HUD counts along with it (no spoiler)
    const counting = G.tally && !G.tally.done, shown = counting ? (G.tally.shown || 0) : st.score;
    const prev = G.bestAtStart || 0, best = counting ? prev : G.daily ? (G.over && !G.practice ? shown : prev) : Math.max(prev, shown); // daily: the box is today's official score
    $('score').previousElementSibling.textContent = counting ? 'COUNTING' : 'SCORE';
    const sEl = $('score'); sEl.style.fontSize = fmt(shown).length > 8 ? '17px' : '';
    if (sEl.textContent !== fmt(shown)) { sEl.textContent = fmt(shown); sEl.classList.remove('bump'); void sEl.offsetWidth; sEl.classList.add('bump'); }
    const bt = G.daily ? (best ? fmt(best) : '\u2014') : prev || (G.over && !counting) ? fmt(best) : '\u2014'; // first game ever: nothing to beat yet
    $('best').textContent = bt; $('best').style.fontSize = bt.length > 8 ? '17px' : '';
    const idx = artOf(st.highest || (G.mode === 'quick' ? 2 : 1));
    $('topName').textContent = (st.highest || '-') + ' \u00b7 ' + A.NAMES[idx]; $('topTile').querySelector('.tt').firstChild.textContent = G.mode === 'shack' ? 'Top ' : 'Top tile '; // number first: if it's cut, the name goes, not the number
    updateBag(); updateGrade();
    if (Snd.setLevel) Snd.setLevel(G.screen === 'game' && !G.over && st.highest >= (G.mode === 'quick' ? 64 : 48) ? 1 : 0);
    $('modeName').textContent = G.daily ? (G.practice ? 'Daily \u00b7 Practice' : 'Daily Sap Run') : MODE_NAME[G.mode];
    $('bestLbl').textContent = G.daily ? 'OFFICIAL' : 'BEST';
    $('nextBox').classList.toggle('hidden', G.mode !== 'shack');
    const ub = $('btnUndo'); ub.classList.toggle('hidden', G.mode !== 'quick');
    ub.disabled = !R.canUndo(st) || (G.over && G.tally && !G.tally.done); $('undoN').textContent = st.undoUsed ? '0' : '1';
  }
  // what's left in the deal (four each of 1, 2, 3, reshuffled when empty): counting it is the core planning skill
  function updateBag() {
    const on = G.mode === 'shack' && G.st;
    $('bag').classList.toggle('hidden', !on); if (!on) return;
    const bag = G.st.bag && G.st.bag.length ? G.st.bag : R.BAG;
    [1, 2, 3].forEach(v => {
      const n = bag.filter(x => x === v).length, el = $('bag' + v);
      if (el.textContent !== String(n)) { el.textContent = n; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
      el.parentNode.classList.toggle('out', n === 0); el.parentNode.classList.toggle('low', n === 1);
    });
  }
  const SHACK_TIPS = ['Drag back to change your mind', 'Check the bucket before a risky swipe', 'Keep your biggest tile tucked in a corner', 'A \u201c?\u201d marks each row the new tile might enter', 'Fewer moving rows = fewer places it can land', 'Twins next to each other are a merge waiting to happen'];
  function setHint() {
    const h = $('hint'); if (G.over) { h.textContent = ''; return; }
    if (G.daily) {
      const tw = R.TWISTS[twistOf(G.daily)];
      h.textContent = G.practice ? 'Practice: today\u2019s result is already in' : G.st.moves < 3 ? 'Today: ' + tw.name + ' (' + tw.blurb + ') \u00b7 one official run' : 'Beat the Sugarmaker\u2019s par for silver';
      h.classList.remove('pulse'); return;
    }
    const early = stats.modes[G.mode].moves < 14;
    if (G.mode === 'shack') h.textContent = G.st.moves === 0 ? (early ? '1 + 2 make 3 \u00b7 drag to peek, let go to slide' : 'Drag to peek, let go to slide') : (early ? (G.st.moves < 8 ? '1 + 2 make 3. Then match twins!' : 'The bucket shows which 1s, 2s and 3s are still to come') : SHACK_TIPS[Math.floor(G.st.moves / 30) % SHACK_TIPS.length]);
    else h.textContent = G.st.moves === 0 ? 'Swipe to slide. Twins merge!' : (early ? 'Make the biggest tile you can' : '');
    if (G.st.moves > 0 || stats.modes[G.mode].moves >= 8) h.classList.remove('pulse');
  }
  let toastTimer = 0;
  function toast(msg, ms) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms || 1400);
  }

  // ---------------------------------------------------------------- saving
  function saveGame(over) {
    if (over || G.over) { drop('save.' + slot()); return; }
    save('save.' + slot(), { st: G.st, date: G.daily, practice: !!G.practice });
  }

  // ---------------------------------------------------------------- syrup grades
  // Every Sugar Shack run boils down to a grade of syrup (the real Vermont grades, lightest to darkest).
  const GRADES = [
    { at: 0, name: 'Just sap', col: '#cfeaf2', note: 'Keep boiling!' },
    { at: 300, name: 'Golden Delicate', col: '#f4c64a' },
    { at: 1500, name: 'Amber Rich', col: '#d9861c' },
    { at: 5000, name: 'Dark Robust', col: '#9a4c12' },
    { at: 15000, name: 'Very Dark Strong', col: '#5a2608' },
    { at: 50000, name: 'Sugarmaker\u2019s Reserve', col: '#3a1503' },
  ];
  const gradeOf = sc => { let g = 0; GRADES.forEach((x, i) => { if (sc >= x.at) g = i; }); return g; };
  function jugSvg(g, fill) { // a little syrup jug filled with the grade's colour
    const c = GRADES[g].col, f = clamp(fill == null ? 1 : fill, 0, 1), top = 46 - 30 * f;
    return '<svg class="jug" viewBox="0 0 60 60" aria-hidden="true"><defs><clipPath id="jc' + g + '"><path d="M18 22 Q14 24 14 32 L14 50 Q14 56 20 56 L40 56 Q46 56 46 50 L46 32 Q46 24 42 22 Z"/></clipPath></defs>' +
      '<path d="M18 22 Q14 24 14 32 L14 50 Q14 56 20 56 L40 56 Q46 56 46 50 L46 32 Q46 24 42 22 Z" fill="rgba(255,241,207,.85)"/>' +
      '<g clip-path="url(#jc' + g + ')"><rect class="jfill" x="10" y="' + (top + 10) + '" width="40" height="50" fill="' + c + '"/></g>' +
      '<path d="M18 22 Q14 24 14 32 L14 50 Q14 56 20 56 L40 56 Q46 56 46 50 L46 32 Q46 24 42 22 Z" fill="none" stroke="#3b2412" stroke-width="4"/>' +
      '<rect x="22" y="10" width="16" height="12" rx="3" fill="#c0392b" stroke="#3b2412" stroke-width="4"/>' +
      '<path d="M46 30 Q56 32 54 40 Q52 46 46 45" fill="none" stroke="#3b2412" stroke-width="4"/></svg>';
  }

  // the footer goal bar: syrup grade (Sugar Shack), today's leaves (daily), the next friend to meet (Quick Slide)
  function setBar(key, icon, name, next, k, c1, c2) {
    if (G.barKey !== key) { const up = G.barKey != null && G.barKey.split(':')[0] === key.split(':')[0] && G.st.moves > 0; G.barKey = key; $('gJug').innerHTML = icon; $('gName').textContent = name;
      if (up) { $('grade').classList.remove('up'); void $('grade').offsetWidth; $('grade').classList.add('up'); Snd.gradeUp && Snd.gradeUp(+key.split(':')[1] || 1); vib(10); } }
    $('gNext').textContent = next;
    $('gFill').style.width = (clamp(k, 0, 1) * 100).toFixed(1) + '%';
    $('gFill').style.background = 'linear-gradient(90deg,' + c1 + ',' + c2 + ')';
  }
  function updateGrade() {
    const on = G.st && !G.over;
    $('grade').classList.toggle('hidden', !on); if (!on) return;
    const sc = G.st.score;
    if (G.daily && !G.practice) {
      const t = goals(G.daily), m = medalFor(G.daily, sc), nx = m < 3 ? m + 1 : 0;
      const k = nx ? (sc - t[m]) / (t[nx] - t[m]) : 1;
      setBar('leaf:' + m, leafSvg(m || -1, 'gl'), m ? MEDALS[m].name + ' leaf' : 'No leaf yet', nx ? MEDALS[nx].name + ' at ' + fmt(t[nx]) + (nx === 2 ? ' (par)' : '') : 'Gold! Double the par', k, nx ? MEDALS[Math.max(1, m)].col : '#ffe27a', nx ? MEDALS[nx].col : '#ffd23a');
    } else if (G.daily) {
      const off = todayBest();
      setBar('prac:0', leafSvg(todayMedal() || -1, 'gl'), 'Practice', 'official ' + fmt(off), off ? sc / off : 1, '#8ac36c', '#ffe27a');
    } else if (G.mode === 'quick') {
      const top = G.st.highest || 2, nv = top * 2, idx = R.artIndex('quick', nv), vals = G.st.grid.filter(Boolean).map(t => t.v).sort((a, b) => b - a), sum = vals[0] + Math.min(vals[0], vals[1] || 0); // your two biggest tiles vs the next one
      if (G.barKey !== 'q:' + nv) { const cv = document.createElement('canvas'); cv.width = cv.height = 76; const cx = cv.getContext('2d'); cx.scale(2, 2); A.drawTile(cx, 19, 19, 34, idx, nv, { t: 0, shadow: false }); cv.className = 'gtile'; setBar('q:' + nv, '', 'Next: ' + A.NAMES[idx], 'make a ' + nv, sum / nv, A.TINT[idx][0], A.TINT[idx][1]); $('gJug').innerHTML = ''; $('gJug').appendChild(cv); }
      else setBar('q:' + nv, '', 'Next: ' + A.NAMES[idx], 'make a ' + nv, sum / nv, A.TINT[idx][0], A.TINT[idx][1]);
    } else {
      const g = gradeOf(sc), nx = GRADES[g + 1];
      setBar('grade:' + g, jugSvg(g, 1), GRADES[g].name, nx ? nx.name + ' at ' + fmt(nx.at) : 'The darkest batch there is!', nx ? (sc - GRADES[g].at) / (nx.at - GRADES[g].at) : 1, GRADES[g].col, nx ? nx.col : GRADES[g].col);
    }
  }

  // ---------------------------------------------------------------- game over
  function startOver() {
    if (G.over || !G.st.over) return;
    G.over = true; clearPreview(); stopGhost(); drop('save.' + slot()); if (Snd.setTension) Snd.setTension(0);
    Snd.over(); vib([30, 50, 30]); if (Snd.duck) Snd.duck(true);
    $('over').classList.remove('hidden'); $('foot').classList.add('ended'); $('grade').classList.add('hidden');
    $('hint').textContent = '';
    $('overTitle').textContent = 'No more moves!';
    $('overScore').textContent = '0';
    $('overSub').innerHTML = (G.mode === 'shack' ? 'Counting up your tiles\u2026' : '') + '<span class="skip">tap anywhere to skip</span>';
    $('over').querySelector('.over-btns').style.visibility = 'hidden';
    if (G.mode === 'shack') G.tally = { items: R.tally(G.st), i: 0, next: G.t + 800, total: 0, done: false };
    else G.tally = { items: [], i: 0, next: G.t + 500, total: 0, done: false, quick: true, start: G.t + 500 };
  }
  function updateTally(dt) {
    const T = G.tally; if (!T || T.done) return;
    if (T.quick) {
      if (G.t < T.start) return;
      const k = clamp((G.t - T.start) / 900, 0, 1), val = Math.round(G.st.score * easeOutCubic(k));
      $('overScore').textContent = fmt(val); if (T.shown !== val) { T.shown = val; updateHUD(); }
      if (Math.floor(k * 12) !== T.tickN) { T.tickN = Math.floor(k * 12); Snd.count(T.tickN, 12); }
      if (k >= 1) finishOver();
      return;
    }
    if (G.t < T.next) return;
    const it = T.items[T.i];
    if (!it) { finishOver(); return; }
    const last = T.i === T.items.length - 1 && it.points > 0 && T.items.length > 1;
    if (last && !T.drum) { // hold a beat before the big one
      T.drum = true; T.next = G.t + 620; if (Snd.roll) Snd.roll(0.6);
      $('overSub').textContent = 'And the big one\u2026';
      const v = G.views.get(it.tile.id); if (v) v.helloUntil = G.t + 520;
      return;
    }
    const v = G.views.get(it.tile.id);
    if (v) {
      v.popT = G.t; v.happyUntil = G.t + (last ? 1600 : 500);
      viewPos(v); const [x, y] = cellXY(v.x, v.y), idx = artOf(v.v);
      if (last) {
        v.hopT = G.t; floatText(x, y - L.cell * 0.45, '+' + fmt(it.points), '#ffe27a', 32);
        burst(x, y, A.colorOf(idx), 26); burst(x, y, '#ffe27a', 10); ring(x, y, '#ffe27a');
        later(480, () => G.bubbles.push({ id: v.id, text: A.HELLO[idx], sub: '', t0: G.t, dur: 1300 }));
        G.shakeBig = G.t + 180; Snd.finale(idx); vib([20, 30, 40]);
      } else if (it.points > 0) { floatText(x, y - L.cell * 0.1, '+' + fmt(it.points), '#fff1cf', 20); burst(x, y, A.colorOf(idx), 6); }
    }
    T.total += it.points; T.shown = T.total; updateHUD();
    if (last) $('overSub').textContent = '';
    const el = $('overScore'); el.textContent = fmt(T.total); el.classList.remove('pop', 'slam'); void el.offsetWidth; el.classList.add(last ? 'slam' : 'pop');
    if (!last) { Snd.count(T.i, T.items.length); vib(4); }
    T.i++;
    T.next = G.t + (last ? 750 : it.points === 0 ? 60 : Math.max(80, 260 - T.i * 14));
  }
  function skipTally() {
    const T = G.tally; if (!T || T.done) return;
    if (!T.quick) T.items.slice(T.i).forEach(it => { const v = G.views.get(it.tile.id); if (v) { v.popT = G.t; v.happyUntil = G.t + 400; } });
    finishOver();
  }
  function finishOver() {
    const T = G.tally; if (!T || T.done) return;
    T.done = true; T.doneT = G.t; G.bubbles.length = 0;
    const st = G.st, ms = stats.modes[G.mode];
    const newBest = st.score > G.bestAtStart && st.score > 0 && G.bestAtStart > 0; // a first-ever game is not a new best
    $('overScore').textContent = fmt(st.score);
    // the game is written into the stats when you leave this screen (so Quick's one undo can still rescue it)
    G.pendingRecord = G.daily ? null : { mode: G.mode, score: st.score, top: st.highest };
    const idx = artOf(st.highest);
    const prevBest = G.bestAtStart, short = prevBest - st.score;
    let sub = 'Top tile: ' + A.NAMES[idx] + ' (' + st.highest + ')';
    if (G.mode === 'shack' && !G.daily) { // the run boils down to a grade of syrup
      const g = gradeOf(st.score), nx = GRADES[g + 1];
      if (Snd.grade && !newBest) later(250, () => Snd.grade(g));
      sub = '<span class="gline">' + jugSvg(g, 1) + '<span><b>' + GRADES[g].name + '</b>' + (g ? ' batch' : '') + ' \u00b7 top tile ' + st.highest + '</span></span>';
      if (g > (stats.bestGrade || 0)) { const firstGame = !G.bestAtStart; stats.bestGrade = g; saveStats(); if (g >= 2 && !firstGame) sub = sub.replace('</span></span>', ' <i class="newg">\u00b7 first time!</i></span></span>'); }
      if (nx && !newBest && !(short > 0 && short <= prevBest * 0.25)) sub += '<span class="l2">' + nx.name + ' at ' + fmt(nx.at) + '</span>';
    }
    if (G.daily) {
      recordDaily(G.daily, st.score, st.highest, G.practice);
      const sk = stats.daily.streak, m = todayMedal();
      if (G.practice) $('overTitle').innerHTML = leafSvg(m || -1, 'tl') + (st.score > prevBest ? 'Practice beat it!' : 'Practice run');
      else $('overTitle').innerHTML = (m ? leafSvg(m, 'tl') : '') + (m ? MEDALS[m].name + ' leaf today!' : 'Daily done!') + (G.usedFreeze ? ' <i class="newg">streak saved</i>' : '');
      G.usedFreeze = false;
      const par = goals(G.daily)[2], beat = st.score - par;
      sub = weekStrip().replace('</div>', '<span class="wnext">' + (sk > 1 ? '<b>' + sk + '-day streak</b>' : '<b>Day 1 of a streak</b>') + (G.practice ? 'Practice \u00b7 ' : '') + 'Par ' + fmt(par) + (beat >= 0 ? ' (+' + fmt(beat) + ')' : '') + '<br>New board in ' + untilTomorrow() + '</span></div>');
    } else {
      $('overTitle').textContent = newBest ? 'New best!' : !G.bestAtStart ? (G.mode === 'shack' ? 'Your first batch!' : 'First board done!') : (G.mode === 'shack' ? 'Sugared out!' : 'Board full!');
      $('overTitle').querySelectorAll('svg').forEach(x => x.remove());
      if (!newBest && short > 0 && short <= prevBest * 0.25) sub += '<span class="l2 near">Just ' + fmt(short) + ' short of your best!</span>';
      else if (!newBest && prevBest && G.mode !== 'shack') sub += '  \u00b7  Best ' + fmt(Math.max(ms.best, st.score)); // Sugar Shack shows its next grade instead
    }
    $('overSub').innerHTML = sub;
    const ob = $('over').querySelector('.over-btns'); ob.style.visibility = 'visible';
    ob.classList.add('lock'); clearTimeout(finishOver.lockT); finishOver.lockT = setTimeout(() => ob.classList.remove('lock'), 420);
    $('btnUndoOver').classList.toggle('hidden', !(G.mode === 'quick' && R.canUndo(st)));
    $('btnShare').classList.toggle('hidden', !G.daily);
    // after the official daily, sharing is the main thing; practice is the small button
    $('btnShare').className = G.daily && !G.practice ? 'big' : 'pill' + (G.daily ? '' : ' hidden');
    $('btnShare').innerHTML = G.daily && !G.practice ? '<span class="bt">Share</span>' : 'Share';
    $('btnAgain').className = G.daily && !G.practice ? 'pill' : 'big';
    $('btnAgain').innerHTML = G.daily && !G.practice ? 'Practice' : '<span class="bt">' + (G.daily ? 'Practice' : 'Play again') + '</span>';
    const medalWin = G.daily && !G.practice && todayMedal() >= 1;
    if ((newBest && !G.daily) || medalWin) {
      Snd.best(); vib([20, 40, 20, 40, 30]); const c = cellXY(1.5, 1.5); burst(c[0], c[1], '#ffd36a', 30); confetti(46);
      $('overTitle').classList.remove('bump'); void $('overTitle').offsetWidth; $('overTitle').classList.add('bump');
    }
    updateHUD();
  }
  function flushRecord() {
    const r = G.pendingRecord; if (!r) return;
    G.pendingRecord = null;
    const ms = stats.modes[r.mode];
    ms.games++; ms.total += r.score; ms.best = Math.max(ms.best, r.score); ms.top = Math.max(ms.top, r.top);
    saveStats();
  }

  // ---------------------------------------------------------------- screens
  function showScreen(name) {
    G.screen = name;
    $('title').classList.toggle('hidden', name !== 'title');
    $('game').classList.toggle('hidden', name !== 'game');
    if (name === 'title') { refreshTitle(); sizeParade(); if (Snd.setLevel) Snd.setLevel(0); }
  }
  function refreshTitle() {
    ['shack', 'quick'].forEach(m => {
      const sv = load('save.' + m, null), b = stats.modes[m].best;
      const el = $(m === 'shack' ? 'subShack' : 'subQuick');
      const base = m === 'shack' ? 'Drag to peek, let go to slide' : 'Slide all the way, merge twins';
      el.textContent = sv && sv.st && !sv.st.over ? 'Continue · ' + fmt(sv.st.score) + ' pts' + (b ? ' · Best ' + fmt(b) : '') : (b ? base + ' · Best ' + fmt(b) : base);
    });
    settleStaleDaily();
    const dsv = load('save.daily', null), tk = dayKey(), tb = todayBest(), sk = streakNow();
    const te = todayEntry(), done = !!(te && te.done), tm = todayMedal();
    const yd = new Date(); yd.setDate(yd.getDate() - 1); const ye = stats.daily.hist[dayKey(yd)];
    const inProg = dsv && dsv.st && !dsv.st.over && dsv.date === tk;
    $('subDaily').textContent = inProg ? (dsv.practice ? 'Continue practice \u00b7 official ' + fmt(tb) : 'Continue today\u2019s run \u00b7 ' + fmt(dsv.st.score) + ' pts')
      : done ? (tm ? MEDALS[tm].name + ' leaf \u00b7 ' : '') + fmt(tb) + ' pts \u00b7 new board in ' + untilTomorrow()
      : sk ? 'Keep your ' + sk + '-day streak going!' + (ye && ye.done && entryMedal(ye) ? ' (yesterday ' + MEDALS[entryMedal(ye)].name.toLowerCase() + ')' : '')
      : 'Today: ' + R.TWISTS[twistOf(tk)].name + ' \u00b7 par ' + fmt(goals(tk)[2]);
    $('btnDaily').classList.toggle('done', done);
    $('dailyIcon').innerHTML = leafSvg(todayMedal() || -1, 'di');
    const met = new Set([0, 1, 2].concat(stats.met)).size;
    const lp = leafPoints();
    $('friends').innerHTML = 'Friends met <b>' + met + ' / 14</b>' + (lp ? ' \u00b7 ' + leafSvg(3, 'sl') + ' <b>' + lp + '</b> leaf points' : met < 14 ? ' \u00b7 grow bigger tiles to meet more' : ' \u00b7 the whole cast!');
    if (lp !== G.bgLeaves) { G.bgLeaves = lp; drawBg(); } // leaves hang more buckets in the sugarbush
    $('btnSound').textContent = 'Sound: ' + (settings.sfx ? 'on' : 'off');
    $('btnMusic').textContent = 'Music: ' + (settings.music ? 'on' : 'off');
  }
  function settleStaleDaily() {
    const sv = load('save.daily', null);
    if (sv && sv.st && !sv.st.over && sv.date && sv.date !== dayKey()) {
      if (!sv.practice && sv.st.moves > 0) recordDaily(sv.date, sv.st.score, sv.st.highest, false);
      drop('save.daily');
    }
  }
  function startGame(mode, fresh, seed, daily) {
    settleOver(); settleStaleDaily();
    G.daily = daily ? dayKey() : null;
    if (G.daily) { mode = 'shack'; seed = daySeed(G.daily); }
    G.gen++; G.q = []; G.parts.length = 0; G.bubbles.length = 0; G.over = false; G.tally = null; G.overlay = null;
    $('pause').classList.add('hidden'); $('statsPanel').classList.add('hidden');
    clearPreview(); G.ghost.on = false; $('ghost').classList.add('hidden');
    G.mode = mode;
    let st = null;
    if (!fresh) {
      const sv = load('save.' + (G.daily ? 'daily' : mode), null);
      if (sv && sv.st && sv.st.grid && sv.st.grid.length === 16 && !sv.st.over && sv.st.mode === mode && (!G.daily || sv.date === G.daily)) { st = sv.st; G.practice = !!sv.practice; }
    }
    if (!st) G.practice = !!(G.daily && todayEntry() && todayEntry().done);
    if (!G.daily) G.practice = false;
    G.resumed = !!st;
    if (!st) { st = G.daily ? R.newDaily(seed, twistOf(G.daily)) : R.newGame(mode, seed); drop('save.' + (G.daily ? 'daily' : mode)); }
    G.st = st; G.bestAtStart = G.daily ? todayBest() : stats.modes[mode].best; G.allBestAtStart = stats.modes[mode].best;
    G.tilt.x = G.tilt.y = G.tilt.vx = G.tilt.vy = 0; if (Snd.duck) Snd.duck(false); G.barKey = null;
    rebuildViews(true); computeNerv();
    G.nextBounce = G.t; G.idle = 0;
    $('over').classList.add('hidden'); $('foot').classList.remove('ended');
    showScreen('game');
    layout(true);
    updateHUD(); setHint();
    if (!G.resumed) saveGame();
    if (!G.resumed && stats.modes[mode].moves < 8) later(900, () => startGhost());
  }
  function openPause() { if (G.screen !== 'game' || G.overlay) return; G.overlay = 'pause'; if (Snd.duck) Snd.duck(true); cancelDrag(); stopGhost(); updateToggleLabels(); $('pause').classList.remove('hidden'); }
  function closeOverlay() { if (G.overlay === 'pause' && !G.over && Snd.duck) Snd.duck(false); G.overlay = null; $('pause').classList.add('hidden'); $('statsPanel').classList.add('hidden'); G.idle = 0; }
  function goHome() { if (Snd.duck) Snd.duck(false); settleOver(); G.gen++; G.q = []; closeOverlay(); cancelDrag(); stopGhost(); showScreen('title'); }
  function settleOver() {
    if (G.over && G.tally && !G.tally.done) finishOver();
    flushRecord();
    if (G.st && !G.over && G.st.moves > 0 && !G.daily) { // abandoned or leaving mid-game: keep best score and top tile
      const ms = stats.modes[G.mode]; ms.best = Math.max(ms.best, G.st.score); ms.top = Math.max(ms.top, G.st.highest); saveStats();
    }
  }

  function updateToggleLabels() {
    const s = 'Sound: ' + (settings.sfx ? 'on' : 'off'), mu = 'Music: ' + (settings.music ? 'on' : 'off');
    $('btnSound').textContent = s; $('pSound').textContent = s; $('btnMusic').textContent = mu; $('pMusic').textContent = mu;
    $('btnSnd').classList.toggle('off', !settings.sfx && !settings.music);
  }
  function toggleAll() { const on = !(settings.sfx || settings.music); settings.sfx = on; settings.music = on; Snd.setSfx(on); Snd.setMusic(on); saveSettings(); updateToggleLabels(); if (on) Snd.click(); }
  function toggleSfx() { settings.sfx = !settings.sfx; Snd.setSfx(settings.sfx); saveSettings(); updateToggleLabels(); if (settings.sfx) Snd.click(); }
  function toggleMusic() { settings.music = !settings.music; Snd.setMusic(settings.music); saveSettings(); updateToggleLabels(); }

  function openStats() {
    flushRecord();
    G.overlay = 'stats';
    const row = (a, b) => '<div class="srow"><span>' + a + '</span><b>' + b + '</b></div>';
    const block = m => { const s = stats.modes[m]; if (!s.games && !s.moves) return '<div class="stitle">' + MODE_NAME[m] + '</div><div class="ssub">Not played yet</div>'; return '<div class="stitle">' + MODE_NAME[m] + '</div>' + row('Games played', fmt(s.games)) + row('Best score', fmt(s.best)) + row('Highest tile', s.top ? A.NAMES[R.artIndex(m, s.top)] + ' (' + s.top + ')' : '-') + row('Moves', fmt(s.moves)); };
    const sap = stats.merges * 5, syrup = sap / 40;
    const D = stats.daily;
    const dailyBlock = '<div class="stitle">Daily Sap Run</div>' + row('Day streak', streakNow() ? streakNow() + (streakNow() > 1 ? ' days' : ' day') : '-') + row('Today\u2019s official run', todayBest() ? fmt(todayBest()) : '-') + row('Leaves won', leafCount()) + row('Streak freeze', freezeReady() ? 'Ready' : 'Used this week') + lastDays() + (Object.keys(D.hist).length >= 5 ? '<div class="ssub">Last four weeks</div>' + weekStrip(28) : '');
    $('statsBody').innerHTML = '<div class="stitle">Friends met</div><div class="gallery" id="gal"></div>' + block('shack') + dailyBlock + block('quick') +
      '<div class="fun">Sap boiled so far: ' + fmt(sap) + ' gallons, which makes ' + syrup.toFixed(1) + ' gallons of syrup.<br>(It really takes about 40 gallons of sap to make 1 gallon of syrup!)</div>';
    const gal = $('gal');
    for (let i = 0; i < 14; i++) {
      const cv = document.createElement('canvas'), z = 46; cv.width = z * 2; cv.height = z * 2; gal.appendChild(cv);
      const c = cv.getContext('2d'); c.scale(2, 2);
      const met = stats.met.indexOf(i) >= 0 || i < 3;
      if (met) A.drawTile(c, z / 2, z / 2, z - 4, i, SHACK_VALUES[i], { t: 0, shadow: false });
      else { A.rr(c, 2, 2, z - 4, z - 4, 9); c.fillStyle = 'rgba(0,0,0,.35)'; c.fill(); c.fillStyle = 'rgba(255,241,207,.4)'; c.font = '20px "Lilita One", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', z / 2, z / 2 + 1); }
    }
    $('statsPanel').classList.remove('hidden');
  }

  // ---------------------------------------------------------------- input
  let ptr = null, suppressClick = false;
  const gameEl = () => $('game');
  function cancelDrag() {
    if (ptr) { try { if (ptr.captured) gameEl().releasePointerCapture(ptr.id); } catch (e) { /* gone */ } }
    ptr = null;
    if (G.pv.dir) { G.pv.dragging = false; G.pv.armed = false; G.pv.demo = false; }
  }
  function onDown(e) {
    tapped = true; Snd.unlock();
    if (G.screen !== 'game' || G.overlay) return;
    if (ptr && performance.now() - ptr.seen > 1500) ptr = null; // lost pointerup safety net
    if (ptr) return; // second finger: ignored
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    ptr = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, axis: null, swiped: false, captured: false, fired: false, seen: performance.now(), hist: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }], onBtn: !!(e.target.closest && e.target.closest('button')) };
    suppressClick = false;
    if (G.ghost.on) stopGhost();
    G.idle = 0;
    if (!G.over) G.bubbles.forEach(b => { b.dur = Math.min(b.dur, G.t - b.t0 + 160); }); // a touch waves the hello bubble away
    if (G.over && G.tally && !G.tally.done && !ptr.onBtn) skipTally();
  }
  function onMove(e) {
    if (!ptr || e.pointerId !== ptr.id) return;
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.seen = performance.now();
    ptr.hist.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    while (ptr.hist.length > 2 && e.timeStamp - ptr.hist[0].t > 110) ptr.hist.shift();
    if (G.over || G.overlay) return;
    updateDrag();
  }
  function updateDrag() {
    const dx = ptr.x - ptr.x0, dy = ptr.y - ptr.y0, ax = Math.abs(dx), ay = Math.abs(dy);
    if (!ptr.axis) {
      if (Math.max(ax, ay) < (ptr.onBtn ? 16 : 7)) return;
      ptr.axis = ax >= ay ? 'h' : 'v';
    } else if (ptr.axis === 'h' && ay > ax + 18) ptr.axis = 'v';
    else if (ptr.axis === 'v' && ax > ay + 18) ptr.axis = 'h';
    if (!ptr.swiped) {
      ptr.swiped = true;
      try { gameEl().setPointerCapture(ptr.id); ptr.captured = true; } catch (e) { /* ignore */ }
    }
    const d = ptr.axis === 'h' ? dx : dy, dist = Math.abs(d);
    const dir = ptr.axis === 'h' ? (d < 0 ? 'left' : 'right') : (d < 0 ? 'up' : 'down');
    const pv = G.pv;
    if (G.mode === 'shack') {
      if (pv.demo) { clearPreview(); }
      pv.dragging = true; pv.demo = false;
      if (pv.dir !== dir) setPreviewDir(dir);
      if (pv.dead) { pv.p = 0; pv.tp = 0.22 * clamp(dist / 40, 0, 1); pv.armed = false; }
      else {
        pv.p = clamp(dist / (L.cell * 0.95), 0, 1); pv.tp = pv.p;
        const armed = pv.armed ? pv.p >= 0.36 : pv.p >= 0.5; // arms at half a cell; a little hysteresis so a resting finger doesn't flicker // a little hysteresis so a resting finger doesn't flicker
        if (armed !== pv.armed) { pv.armed = armed; if (armed) { Snd.tick(pv.p); vib(5); } else Snd.untick(); }
      }
    } else {
      if (ptr.fired) return; // one slide per touch: lift your finger to slide again
      pv.dragging = true; pv.dir = dir; pv.dead = false; pv.p = 0; pv.tp = clamp(dist / 26, 0, 1) * 0.8; pv.moveIds = new Set(); pv.absIds = new Set(); pv.mergeIds = new Set();
      if (dist >= 26) {
        ptr.fired = true; pv.dragging = false; pv.dir = null;
        commit(dir, 0);
      }
    }
  }
  function onUp(e) {
    if (!ptr || e.pointerId !== ptr.id) return;
    const p = ptr; ptr = null;
    try { if (p.captured) gameEl().releasePointerCapture(p.id); } catch (er) { /* ignore */ }
    if (p.swiped) suppressClick = true;
    if (e.type === 'pointercancel' && !(G.mode === 'shack' && G.pv.dragging && G.pv.armed && !G.pv.dead )) { G.pv.dragging = false; G.pv.armed = false; return; } // an armed drag that the system cancels (finger off the edge) still slides
    if (G.mode === 'shack' && G.pv.dragging) {
      const pv = G.pv;
      pv.dragging = false;
      let flick = false;
      const h = p.hist, a = h[0], b = h[h.length - 1];
      if (h.length > 1 && b.t - a.t > 12) {
        const vx = (b.x - a.x) / (b.t - a.t), vy = (b.y - a.y) / (b.t - a.t);
        const along = DV[pv.dir].dc * vx + DV[pv.dir].dr * vy;
        const dist = Math.abs(p.axis === 'h' ? (p.x - p.x0) : (p.y - p.y0));
        flick = (along > 0.3 && dist > 12) || (along > 0.12 && dist > 22); // a short quick swipe slides too (a peek pauses before you let go)
      }
      if (!pv.dead && (pv.armed || (flick && pv.plan && pv.plan.moved))) { const d = pv.dir; commit(d, pv.p); }
      else if (pv.dead && pv.dir) { Snd.bonk(); }
      // otherwise the preview eases back by itself: you changed your mind
    } else if (G.mode === 'quick') {
      G.pv.dragging = false;
      if (!p.fired && p.axis && !G.over) { // a quick flick slides too
        const h = p.hist, a = h[0], b = h[h.length - 1], dx = p.x - p.x0, dy = p.y - p.y0;
        const d = p.axis === 'h' ? dx : dy, dir = p.axis === 'h' ? (d < 0 ? 'left' : 'right') : (d < 0 ? 'up' : 'down');
        if (h.length > 1 && b.t - a.t > 12 && Math.abs(d) > 12) {
          const v = Math.abs(p.axis === 'h' ? b.x - a.x : b.y - a.y) / (b.t - a.t);
          if (v > 0.3) commit(dir, 0); // same flick feel as Sugar Shack
        }
      }
    }
  }
  function keyMove(dir) {
    if (G.screen !== 'game' || G.overlay) return;
    if (G.over) { if (G.tally && !G.tally.done) skipTally(); return; }
    if (G.pv.dragging) return;
    stopGhost(); clearPreview();
    commit(dir, 0);
  }
  function onKey(e) {
    tapped = true; Snd.unlock();
    const k = e.key.toLowerCase();
    const map = { arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down' };
    if (G.screen === 'game' && map[k]) { e.preventDefault(); keyMove(map[k]); return; }
    if (k === 'escape' || k === 'p') { if (G.overlay) closeOverlay(); else openPause(); return; }
    if (k === 'm') { toggleSfx(); return; }
    if ((k === 'z' || k === 'u') && G.screen === 'game') { doUndo(); }
  }

  // ---------------------------------------------------------------- title parade
  const parade = { hops: [], t0: 0, mx: 0.5 };
  function drawParade() {
    const w = paradeC.clientWidth, h = paradeC.clientHeight;
    if (!w) return;
    if (paradeC.width !== Math.round(w * L.dpr) || paradeC.height !== Math.round(h * L.dpr)) sizeParade(); // fonts/layout settled after first sizing
    px_.clearRect(0, 0, w, h);
    const n = w < 380 ? 6 : 7, S = Math.min(62, w / n - 12, h - 18), t = G.t / 1000;
    for (let i = 0; i < n; i++) {
      const x = (w / n) * (i + 0.5), hop = parade.hops[i] ? Math.max(0, 1 - (G.t - parade.hops[i]) / 700) : 0;
      const y = h / 2 + 4 + Math.sin(t * 2.2 + i * 0.8) * 3 - Math.abs(Math.sin(hop * Math.PI * 3)) * hop * 14;
      const blink = (Math.sin(t * 1.3 + i * 2.7) > 0.985) ? 1 : 0;
      A.drawTile(px_, x, y, S, i, SHACK_VALUES[i], { t, rot: Math.sin(t * 1.7 + i) * 0.04 + Math.sin(hop * 30) * 0.1 * hop, phase: i, fm: { mode: hop > 0 ? 'happy' : 'idle', t, blink, lx: (parade.mx - x / w) * 2, ly: 0.2, phase: i } });
    }
  }

  // ---------------------------------------------------------------- main loop
  let last = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = 0; return; }
    const dt = last ? Math.min(50, ts - last) : 16; last = ts;
    tick(dt);
  }
  function tick(dt) {
    update(dt);
    if (G.screen === 'game') render();
    else if (G.screen === 'title') drawParade();
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    appEl = $('app'); bgC = $('bg'); bgX = bgC.getContext('2d'); boardC = $('board'); bx = boardC.getContext('2d');
    nextC = $('nextc'); nx = nextC.getContext('2d'); paradeC = $('parade'); px_ = paradeC.getContext('2d');
    G.shake = 0; G.shakeBig = 0;
    layout(true);
    if (/[?&]art=1/.test(location.search)) { // painted art, when assets/*.png exist (see IMAGE-PROMPTS.md)
      [...Array(14).keys()].map(i => 'char' + i).concat(['bg', 'tray']).forEach(k => { const im = new Image(); im.onload = () => { A.ASSETS[k] = im; if (k === 'bg' || k === 'tray') layout(true); }; im.src = 'assets/' + k + '.png'; });
    }
    let rt = 0;
    const re = () => { clearTimeout(rt); rt = setTimeout(() => {
      // a shorter window (toolbar appeared) must never hide buttons: re-fit, but not under a finger mid-game
      if (window.innerHeight < lastH - 2 && (G.screen !== 'game' || G.over || !ptr)) layout(true); else layout(false);
    }, 120); };
    window.addEventListener('resize', re); window.addEventListener('orientationchange', () => { cancelDrag(); clearTimeout(rt); rt = setTimeout(() => layout(true), 250); });

    const g = gameEl();
    g.addEventListener('pointerdown', onDown);
    g.addEventListener('pointermove', onMove);
    g.addEventListener('pointerup', onUp);
    g.addEventListener('pointercancel', onUp);
    g.addEventListener('click', e => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; } }, true);
    g.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('dblclick', e => e.preventDefault());
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelDrag(); settleOver(); Snd.suspend(); } else { Snd.resume(); last = 0; } });
    window.addEventListener('blur', cancelDrag);
    window.addEventListener('pagehide', settleOver);
    ['pointerdown', 'pointerup', 'click', 'touchend'].forEach(t => window.addEventListener(t, () => { tapped = true; Snd.unlock(); }, { capture: true, passive: true }));

    // title
    $('btnShack').addEventListener('click', () => { Snd.click(); startGame('shack', false); });
    $('btnQuick').addEventListener('click', () => { Snd.click(); startGame('quick', false); });
    $('btnDaily').addEventListener('click', () => { Snd.click(); startGame('shack', false, undefined, true); });
    $('btnStats').addEventListener('click', () => { Snd.click(); openStats(); });
    $('btnSound').addEventListener('click', toggleSfx);
    $('btnMusic').addEventListener('click', toggleMusic);
    $('sClose').addEventListener('click', () => { Snd.click(); closeOverlay(); });
    paradeC.addEventListener('pointerdown', e => {
      const r = paradeC.getBoundingClientRect(), n = paradeC.clientWidth < 380 ? 6 : 7, i = clamp(Math.floor((e.clientX - r.left) / (r.width / n)), 0, n - 1);
      parade.hops[i] = G.t; Snd.unlock(); Snd.merge(i, 0); parade.mx = (e.clientX - r.left) / r.width;
    });
    paradeC.addEventListener('pointermove', e => { const r = paradeC.getBoundingClientRect(); parade.mx = (e.clientX - r.left) / r.width; });
    // game
    $('btnMenu').addEventListener('click', () => { Snd.click(); openPause(); });
    $('btnSnd').addEventListener('click', toggleAll);
    $('btnUndo').addEventListener('click', doUndo);
    $('pResume').addEventListener('click', () => { Snd.click(); closeOverlay(); });
    let newArm = 0;
    $('pNew').addEventListener('click', () => {
      Snd.click();
      if (G.st && G.st.moves > 0 && !G.over && !newArm) { // protect a run from a mis-tap
        $('pNew').textContent = G.daily && !G.practice ? 'Tap again: end today\u2019s run here' : 'Tap again to start over'; newArm = setTimeout(() => { newArm = 0; $('pNew').textContent = 'New game'; }, 2500); return;
      }
      if (G.daily && !G.practice && G.st && G.st.moves > 0 && !G.over) recordDaily(G.daily, G.st.score, G.st.highest, false); // giving up still counts as today's run
      clearTimeout(newArm); newArm = 0; $('pNew').textContent = 'New game'; startGame(G.mode, true, undefined, !!G.daily);
    });
    $('pSound').addEventListener('click', toggleSfx);
    $('pMusic').addEventListener('click', toggleMusic);
    $('pHome').addEventListener('click', () => { Snd.click(); goHome(); });
    $('btnUndoOver').addEventListener('click', doUndo);
    $('btnShare').addEventListener('click', () => { Snd.click(); shareDaily(); });
    $('btnAgain').addEventListener('click', () => { Snd.click(); startGame(G.mode, true, undefined, !!G.daily); });
    $('btnHome').addEventListener('click', () => { Snd.click(); goHome(); });
    updateToggleLabels();
    showScreen('title');
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- test hooks
  window.__T = {
    start(mode, seed) { startGame(mode || 'shack', true, seed); return this.state(); },
    resume(mode) { startGame(mode || 'shack', false); return this.state(); },
    step(ms) { let n = ms || 0; while (n > 0) { const d = Math.min(16, n); tick(d); n -= d; } return this.state(); },
    state() {
      const st = G.st; if (!st) return { screen: G.screen };
      const board = []; for (let r = 0; r < 4; r++) { board.push([]); for (let c = 0; c < 4; c++) { const t = st.grid[r * 4 + c]; board[r].push(t ? t.v : 0); } }
      return { screen: G.screen, mode: G.mode, score: st.score, moves: st.moves, highest: st.highest, over: G.over, rulesOver: st.over, next: st.next, nextBonus: st.nextBonus, board,
        undo: R.canUndo(st), nerv: G.nerv, preview: { dir: G.pv.dir, p: +G.pv.p.toFixed(3), armed: G.pv.armed, dead: G.pv.dead }, ghost: G.ghost.on, particles: G.parts.length, tilt: { x: +G.tilt.x.toFixed(2), y: +G.tilt.y.toFixed(2) } };
    },
    move(dir) { stopGhost(); clearPreview(); return commit(dir, 0); },
    preview(dir, p) { stopGhost(); G.pv.demo = false; setPreviewDir(dir); G.pv.hold = true; G.pv.dragging = true; G.pv.p = p; G.pv.tp = p; G.pv.armed = p >= 0.5 && !G.pv.dead; },
    release(doCommit) { const pv = G.pv; pv.dragging = false; if (doCommit && pv.dir && !pv.dead) commit(pv.dir, pv.p); },
    setBoard(rows, next) {
      const st = G.st; st.grid = new Array(16).fill(null); let id = 1;
      rows.forEach((row, r) => row.forEach((v, c) => { if (v) st.grid[r * 4 + c] = { id: id++, v, r, c }; }));
      st.nextId = id; st.highest = R.maxTile(st); st.over = false;
      if (G.mode === 'shack') { st.next = next || 3; st.nextBonus = false; st.bag = []; }
      st.score = G.mode === 'quick' ? st.score : R.computeScore(st);
      G.over = false; G.tally = null; $('over').classList.add('hidden'); $('foot').classList.remove('ended'); G.gen++; G.q = [];
      rebuildViews(false); computeNerv(); clearPreview(); updateHUD(); return this.state();
    },
    endNow() { startOver(); },
    skip() { skipTally(); },
    layout: L, G,
    openStats, openPause,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
