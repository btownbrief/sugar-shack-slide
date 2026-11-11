/* Sugar Shack Slide - WebAudio synth sounds + a light generative marimba loop. No audio files. */
(function (root) {
  'use strict';
  let ctx = null, master = null, sfxBus = null, musBus = null, noiseBuf = null;
  const S = { sfx: true, music: true, started: false };
  let musicTimer = null, nextNoteTime = 0, step = 0, musicOn = false;

  // C major pentatonic across octaves; i = scale degree index (can exceed 5)
  const PENT = [0, 2, 4, 7, 9];
  function noteFreq(i, base) {
    i = Math.max(0, Math.min(15, Math.round(i))); // never shrill: tops out around 2 kHz
    const semis = PENT[i % 5] + 12 * Math.floor(i / 5);
    return (base || 261.63) * Math.pow(2, semis / 12);
  }

  function init() {
    if (ctx) return;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = S.sfx ? 1 : 0; sfxBus.connect(master);
    musBus = ctx.createGain(); musBus.gain.value = S.music ? 0.5 : 0; musBus.connect(master);
    const len = ctx.sampleRate * 0.6;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  /** Call from the first pointer/key event (iOS needs a user gesture). */
  function unlock() {
    init();
    if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume && ctx.resume();
    S.started = true;
    if (S.music) startMusic();
  }
  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume() { if (ctx && S.started && ctx.state !== 'running') ctx.resume(); }

  function tone(freq, dur, type, vol, opts) {
    if (!ctx || !S.sfx) return;
    opts = opts || {};
    const t0 = ctx.currentTime + (opts.delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + (opts.attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }
  function noise(dur, freq, q, vol, opts) {
    if (!ctx || !S.sfx) return;
    opts = opts || {};
    const t0 = ctx.currentTime + (opts.delay || 0);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = opts.type || 'bandpass';
    f.frequency.setValueAtTime(freq, t0);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
    f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t0); src.stop(t0 + dur + 0.03);
  }
  // a plucked marimba-ish note: sine + quiet octave + fast decay
  function pluck(freq, vol, delay, bus, dur) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    dur = dur || 0.5;
    [[1, 1], [2.01, 0.25], [4.0, 0.08]].forEach(p => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq * p[0];
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime((vol || 0.2) * p[1], t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur / p[0] * 1.2);
      o.connect(g); g.connect(bus || sfxBus);
      o.start(t0); o.stop(t0 + dur + 0.05);
    });
  }

  const A = {
    S, unlock, suspend, resume, noteFreq,
    slide(dir) { // soft whoosh + woody thud, pitched a little by direction
      // phone speakers can't play much under ~200 Hz, so the woody knock lives at 300-450 Hz, with a little variety per move
      const v = 0.92 + Math.random() * 0.16, f = ({ left: 900, right: 1300, up: 1500, down: 700 }[dir] || 1000) * v;
      noise(0.12, f, 1.2, 0.08, { to: f * 0.45 });
      tone(420 * v, 0.07, 'triangle', 0.11, { to: 260 * v });
      tone(840 * v, 0.03, 'sine', 0.04, { to: 520 * v });
    },
    tick(p) { tone(660 + p * 440, 0.05, 'triangle', 0.07); }, // drag crossed the commit threshold
    untick() { tone(520, 0.05, 'triangle', 0.045, { to: 380 }); }, // dragged back under it
    bonk() { tone(240, 0.12, 'square', 0.06, { to: 150 }); tone(480, 0.06, 'triangle', 0.04, { to: 300 }); },
    spawn() { tone(520, 0.08, 'sine', 0.06, { to: 760 }); },
    /** merge: pitch climbs with the character rank and with combo count inside one move */
    merge(art, combo) {
      // pitched for a phone speaker: fundamentals ~520-1,750 Hz, a woody click and a soft square edge
      const i = Math.min(9, art * 0.55 + (combo || 0) * 0.7);
      const f = noteFreq(Math.floor(i), 523.25);
      pluck(f, 0.2, 0, null, 0.42);
      tone(f, 0.07, 'square', 0.025, { to: f * 0.98 });
      pluck(f * 1.5, 0.05, 0.03, null, 0.25);
      noise(0.025, 2600, 3, 0.07);
    },
    newHighest(art) { // rising arpeggio
      const base = Math.min(5, Math.floor(art * 0.6));
      for (let i = 0; i < 5; i++) pluck(noteFreq(base + i * 2, 261.63), 0.2 - i * 0.012, i * 0.075, null, 0.6);
      tone(noteFreq(base + 10, 261.63), 0.5, 'triangle', 0.07, { delay: 0.35 });
    },
    combo(n) { // bright rising chime, one note per merge in the swipe
      n = Math.min(n, 5);
      for (let i = 0; i < n + 1; i++) pluck(noteFreq(5 + i + n, 261.63), 0.12, 0.03 + i * 0.05, null, 0.4);
      tone(noteFreq(8 + n, 261.63), 0.25, 'triangle', 0.05, { delay: 0.05 + n * 0.05 });
    },
    finale(art) { // the big tile in the end-of-game count: low thump + a chord
      tone(330, 0.22, 'triangle', 0.22, { to: 160 }); noise(0.25, 500, 0.8, 0.14, { to: 180 }); noise(0.06, 2400, 2, 0.08);
      tone(noteFreq(Math.min(8, Math.floor(art * 0.5) + 3), 523.25), 0.3, 'square', 0.035, { delay: 0.02 });
      [0, 2, 4].forEach((d, i) => pluck(noteFreq(Math.min(8, Math.floor(art * 0.5) + 3) + d, 261.63), 0.18, 0.02 + i * 0.02, null, 0.9));
    },
    medal(m) { // a little fanfare: bigger for better leaves
      const n = 3 + m;
      for (let i = 0; i < n; i++) pluck(noteFreq(4 + i * 1.5, 261.63), 0.16, i * 0.08, null, 0.6);
      tone(noteFreq(6 + n, 261.63), 0.6, 'triangle', 0.08, { delay: n * 0.08 });
    },
    gradeUp(g) { [0, 2, 4, 7].forEach((d, i) => pluck(noteFreq(3 + g + d * 0.5, 261.63), 0.12, i * 0.06, null, 0.5)); },
    hello(art) { // each character's own little two-note chirp, in its own register (small ones high, big ones lower and rounder)
      const base = 1150 - art * 45, up = art % 2 ? 1.33 : 1.5, type = art < 4 ? 'sine' : art < 9 ? 'triangle' : 'square';
      tone(base, 0.09, type, type === 'square' ? 0.035 : 0.09, { to: base * up }); tone(base * up, 0.13, type, type === 'square' ? 0.03 : 0.08, { delay: 0.1, to: base * (art % 3 ? 1.12 : 0.9) });
    },
    undo() { tone(700, 0.18, 'triangle', 0.12, { to: 300 }); },
    count(i, n) { const f = noteFreq(Math.min(8, i * 0.5), 523.25); pluck(f, 0.12, 0, null, 0.22); noise(0.02, 3000, 3, 0.03); },
    over() { [0, 3, 5, 7].reverse().forEach((s, i) => pluck(noteFreq(s + 5, 220), 0.17, i * 0.14, null, 0.8)); },
    best() { for (let i = 0; i < 7; i++) pluck(noteFreq(5 + i, 261.63), 0.17, i * 0.07, null, 0.5); },
    click() { tone(500, 0.05, 'triangle', 0.08, { to: 700 }); },
    setSfx(on) { S.sfx = !!on; if (sfxBus) sfxBus.gain.value = on ? 1 : 0; },
    setMusic(on) {
      S.music = !!on;
      if (musBus) musBus.gain.value = on ? (ducked ? 0.16 : 0.5) : 0;
      if (on && S.started) startMusic(); else stopMusic();
    },
  };

  // ---- music: a composed 16-bar sugarhouse waltz (3/4). Bass "oom", chord "pah-pah", a soft shaker, and a
  // fiddle-ish tune. Layer 2 (a high glockenspiel answer + woodblock) joins once your top tile is big.
  const BPM = 104;
  const mf = m => 440 * Math.pow(2, (m - 69) / 12);
  // chord per bar: [bass midi, triad]
  const CH = { C: [48, [60, 64, 67]], F: [41, [60, 65, 69]], Am: [45, [57, 60, 64]], G: [43, [55, 59, 62]], Dm: [50, [57, 62, 65]] };
  const PROG = ['C', 'C', 'F', 'C', 'Am', 'F', 'G', 'G', 'C', 'C', 'F', 'C', 'Dm', 'G', 'C', 'G'];
  // melody per bar: [startEighth, lengthEighths, midi]  (6 eighths per bar)
  const MEL = [
    [[0, 2, 64], [2, 2, 67], [4, 2, 72]],
    [[0, 3, 76], [3, 1, 74], [4, 2, 72]],
    [[0, 2, 69], [2, 2, 72], [4, 2, 77]],
    [[0, 4, 76], [4, 2, 72]],
    [[0, 2, 72], [2, 2, 71], [4, 2, 69]],
    [[0, 2, 69], [2, 2, 72], [4, 2, 69]],
    [[0, 2, 67], [2, 2, 69], [4, 2, 71]],
    [[0, 4, 74], [4, 2, 67]],
    [[0, 2, 79], [2, 2, 76], [4, 2, 72]],
    [[0, 3, 76], [3, 1, 77], [4, 2, 79]],
    [[0, 2, 81], [2, 2, 79], [4, 2, 77]],
    [[0, 4, 76], [4, 2, 72]],
    [[0, 2, 74], [2, 2, 77], [4, 2, 81]],
    [[0, 2, 79], [2, 2, 77], [4, 2, 74]],
    [[0, 6, 72]],
    [[2, 2, 74], [4, 2, 71]],
  ];
  // B section: its own chords and tune, so the loop is A, B, A (with a high bell doubling), B (tune resting)
  const PROG_B = ['F', 'F', 'C', 'C', 'Dm', 'Dm', 'G', 'G', 'Am', 'Am', 'F', 'F', 'Dm', 'G', 'C', 'C'];
  const MEL_B = [
    [[0, 2, 77], [2, 2, 76], [4, 2, 74]],
    [[0, 4, 72], [4, 2, 69]],
    [[0, 2, 67], [2, 2, 72], [4, 2, 76]],
    [[0, 6, 79]],
    [[0, 2, 77], [2, 2, 74], [4, 2, 69]],
    [[0, 3, 74], [3, 1, 72], [4, 2, 74]],
    [[0, 2, 71], [2, 2, 74], [4, 2, 79]],
    [[0, 4, 77], [4, 2, 74]],
    [[0, 2, 76], [2, 2, 72], [4, 2, 69]],
    [[0, 3, 72], [3, 1, 71], [4, 2, 69]],
    [[0, 2, 65], [2, 2, 69], [4, 2, 72]],
    [[0, 4, 77], [4, 2, 76]],
    [[0, 2, 74], [2, 2, 77], [4, 2, 74]],
    [[0, 2, 71], [2, 2, 67], [4, 2, 71]],
    [[0, 6, 72]],
    [[4, 2, 67]],
  ];
  let level = 0, ducked = false, tension = 0;
  function startMusic() {
    if (!ctx || musicOn) return;
    musicOn = true; step = 0; nextNoteTime = ctx.currentTime + 0.2;
    musicTimer = setInterval(schedule, 100);
  }
  function stopMusic() {
    musicOn = false;
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }
  function schedule() {
    if (!ctx || !musicOn) return;
    const eighth = 60 / BPM / 2;
    while (nextNoteTime < ctx.currentTime + 0.35) {
      if (ctx.state === 'running') playStep(step, Math.max(0, nextNoteTime - ctx.currentTime), eighth);
      nextNoteTime += eighth; step++;
    }
  }
  // a soft bowed/whistled voice: triangle + quiet octave sine, gentle attack, slow vibrato
  function voice(freq, dur, delay, vol) {
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
    const lfo = ctx.createOscillator(), lg_ = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = freq; o2.type = 'sine'; o2.frequency.value = freq * 2;
    lfo.frequency.value = 5.2; lg_.gain.setValueAtTime(0, t0); lg_.gain.linearRampToValueAtTime(freq * 0.006, t0 + Math.min(0.35, dur * 0.6));
    lfo.connect(lg_); lg_.connect(o.frequency); lg_.connect(o2.frequency);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.04);
    g.gain.setValueAtTime(vol, t0 + Math.max(0.05, dur - 0.12)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.08);
    g2.gain.value = 0.18;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(musBus);
    [o, o2, lfo].forEach(x => { x.start(t0); x.stop(t0 + dur + 0.12); });
  }
  function shaker(delay, vol) {
    const t0 = ctx.currentTime + delay, src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 4200; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
    src.connect(f); f.connect(g); g.connect(musBus); src.start(t0, Math.random() * 0.4); src.stop(t0 + 0.09);
  }
  function wood(delay, f) {
    const t0 = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * 0.7, t0 + 0.05);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
    o.connect(g); g.connect(musBus); o.start(t0); o.stop(t0 + 0.1);
  }
  function playStep(s, delay, eighth) {
    const bar = Math.floor(s / 6) % 16, pos = s % 6, sec = Math.floor(s / 96) % 4; // sections: A, B, A', B'
    const isB = sec % 2 === 1, ch = CH[(isB ? PROG_B : PROG)[bar]], mel = (isB ? MEL_B : MEL)[bar];
    if (pos === 0) pluck(mf(ch[0] + 12), 0.17, delay, musBus, 1.0);                               // oom (an octave up so a phone speaker can play it)
    if (pos === 2 || pos === 4) ch[1].forEach((m, i) => pluck(mf(m), 0.045, delay + i * 0.006, musBus, 0.45)); // pah pah
    if (pos % 2 === 0) shaker(delay, pos === 0 ? 0.018 : 0.01);                                  // soft, on the beats only
    // B' lets the tune rest (bells only) so it never nags; A' doubles the tune with a soft high bell
    const rest = sec === 3 && bar < 12;
    mel.forEach(n => {
      if (n[0] !== pos) return;
      if (!rest) voice(mf(n[2]), n[1] * eighth * 0.95, delay, 0.075);
      if (sec === 2 || rest) pluck(mf(n[2] + 12), rest ? 0.07 : 0.035, delay, musBus, 0.5);
    });
    // board nearly full: a soft ticking on the off-beats (two octaves over the bass) and the bells hold back
    if (tension >= 1 && (pos === 1 || pos === 3 || pos === 5)) pluck(mf(ch[0] + 24), tension >= 2 ? 0.06 : 0.035, delay, musBus, 0.18);
    if (level >= 1 && tension < 2) {
      if (pos === 0) wood(delay, 1250); if (pos === 3) wood(delay, 950);
      // glockenspiel answer: the chord's top note, two octaves up, on the off-beats of even bars
      if (bar % 2 === 1 && (pos === 3 || pos === 5)) pluck(mf(ch[1][pos === 3 ? 2 : 1] + 24), 0.05, delay, musBus, 0.6);
    }
  }
  A.setLevel = n => { level = n; };
  A.setTension = n => { tension = n; };
  /** A soft snare roll that swells over `dur` seconds (the beat before the biggest tile is counted). */
  A.roll = dur => {
    if (!ctx || !S.sfx) return;
    const n = Math.floor(dur / 0.045);
    for (let i = 0; i < n; i++) noise(0.05, 1800, 0.9, 0.02 + 0.05 * (i / n), { delay: i * 0.045, type: 'bandpass' });
  };
  /** The end screen names your batch of syrup: a warm chord that grows with the grade. */
  A.grade = g => { if (!ctx) return; [0, 2, 4, 7].slice(0, 2 + Math.min(2, g)).forEach((d, i) => pluck(noteFreq(2 + g + d, 261.63), 0.15, 0.05 + i * 0.09, null, 0.9)); tone(noteFreq(4 + g + 7, 261.63), 0.7, 'triangle', 0.05, { delay: 0.35 }); };
  /** Quieter music under the end-of-game count and the pause menu. */
  A.duck = on => { ducked = !!on; if (musBus && ctx) musBus.gain.setTargetAtTime(S.music ? (ducked ? 0.16 : 0.5) : 0, ctx.currentTime, 0.25); };

  root.SSSAudio = A;
})(typeof self !== 'undefined' ? self : this);
