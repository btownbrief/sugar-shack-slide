/* Sugar Shack Slide - pure rules for both modes. No DOM. Works in browser and node.
 *
 * mode 'shack' : Threes-style. A swipe moves every tile that can move by ONE cell.
 *                1 + 2 make 3; from 3 up equal tiles make double. One new tile enters
 *                from the edge you swiped away from, in a line that moved.
 * mode 'quick' : 2048-style. Tiles slide all the way, equal tiles merge (once per move),
 *                a new 2 (or 4) appears in a random empty cell.
 *
 * State is plain JSON (safe to save in localStorage). Tiles: {id, v, r, c}.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SSSRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const N = 4;
  const DIRS = {
    left: { dr: 0, dc: -1 }, right: { dr: 0, dc: 1 },
    up: { dr: -1, dc: 0 }, down: { dr: 1, dc: 0 },
  };
  const DIR_NAMES = ['left', 'right', 'up', 'down'];
  const BAG = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3];
  const BONUS_AT = 48;      // highest tile needed before bonus tiles can show up
  const BONUS_CHANCE = 1 / 21;

  // ---------- random (state.seed is the whole rng state, so saves replay) ----------
  function rand(st) {
    st.seed = (st.seed + 0x6D2B79F5) >>> 0;
    let t = st.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(arr, st) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand(st) * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ---------- value helpers ----------
  /** Index into the 14 art characters (0..13). */
  function artIndex(mode, v) {
    if (mode === 'quick') return Math.max(0, Math.min(13, Math.round(Math.log2(v)) - 1));
    if (v <= 2) return v - 1;
    return Math.min(13, 2 + Math.round(Math.log2(v / 3)));
  }
  /** Threes rank used for scoring: 3 -> 1, 6 -> 2, 12 -> 3 ... ; 1 and 2 -> 0 */
  function rank(v) { return v < 3 ? 0 : Math.round(Math.log2(v / 3)) + 1; }
  function points(v) { return v < 3 ? 0 : Math.pow(3, rank(v)); }

  function mergeValue(mode, a, b) {
    if (mode === 'quick') return a === b ? a * 2 : 0;
    if ((a === 1 && b === 2) || (a === 2 && b === 1)) return 3;
    if (a === b && a >= 3) return a * 2;
    return 0;
  }

  function lineCell(dir, i, k) {
    switch (dir) {
      case 'left': return [i, k];
      case 'right': return [i, N - 1 - k];
      case 'up': return [k, i];
      default: return [N - 1 - k, i]; // down
    }
  }

  // ---------- line sliders (line[0] is the cell nearest the destination edge) ----------
  function slideThrees(line) {
    for (let i = 1; i < N; i++) {
      const a = line[i - 1], b = line[i];
      const open = !a;
      const merges = a && b && mergeValue('shack', a.v, b.v) > 0;
      if (!open && !merges) continue;
      // an empty gap with nothing behind it is not a move
      if (open && !line.slice(i).some(Boolean)) return null;
      const moves = [], merged = [];
      if (b) {
        if (merges) {
          moves.push({ tile: b, from: i, to: i - 1, into: a });
          merged.push({ survivor: a, absorbed: b, value: mergeValue('shack', a.v, b.v), at: i - 1 });
        } else moves.push({ tile: b, from: i, to: i - 1 });
      }
      for (let j = i + 1; j < N; j++) if (line[j]) moves.push({ tile: line[j], from: j, to: j - 1 });
      if (!moves.length) return null;
      return { moves, merges: merged };
    }
    return null;
  }

  function slideQuick(line) {
    const out = [], moves = [], merged = [];
    let lastMerged = -1;
    line.forEach((t, k) => {
      if (!t) return;
      const last = out[out.length - 1];
      if (last && out.length - 1 !== lastMerged && last.v === t.v) {
        moves.push({ tile: t, from: k, to: out.length - 1, into: last });
        merged.push({ survivor: last, absorbed: t, value: last.v * 2, at: out.length - 1 });
        lastMerged = out.length - 1;
      } else {
        out.push(t);
        if (out.length - 1 !== k) moves.push({ tile: t, from: k, to: out.length - 1 });
      }
    });
    return moves.length ? { moves, merges: merged } : null;
  }

  /** What would a swipe do? Does not change the state. */
  function plan(st, dir) {
    const slide = st.mode === 'quick' ? slideQuick : slideThrees;
    const moves = [], merges = [], movedLines = [];
    for (let i = 0; i < N; i++) {
      const line = [];
      for (let k = 0; k < N; k++) {
        const [r, c] = lineCell(dir, i, k);
        line.push(st.grid[r * N + c]);
      }
      const res = slide(line);
      if (!res) continue;
      movedLines.push(i);
      res.moves.forEach(m => moves.push({
        id: m.tile.id, tile: m.tile, from: lineCell(dir, i, m.from), to: lineCell(dir, i, m.to),
        absorbedBy: m.into ? m.into.id : null,
      }));
      res.merges.forEach(m => merges.push({
        survivor: m.survivor, absorbed: m.absorbed, value: m.value, at: lineCell(dir, i, m.at),
      }));
    }
    return { dir, moved: moves.length > 0, moves, merges, movedLines };
  }

  /** Where the next Threes tile will enter for this swipe (no state change). */
  function previewSpawn(st, dir, p) {
    if (st.mode !== 'shack') return null;
    p = p || plan(st, dir);
    if (!p.moved) return null;
    const line = p.movedLines[Math.min(p.movedLines.length - 1, Math.floor(st.spawnRoll * p.movedLines.length))];
    const [r, c] = lineCell(dir, line, N - 1);
    return { r, c, v: st.next, bonus: st.nextBonus, line };
  }

  // ---------- Threes deal ----------
  function drawFromBag(st) {
    if (!st.bag.length) st.bag = shuffle(BAG.slice(), st);
    return st.bag.pop();
  }
  function drawNext(st) {
    st.nextBonus = false;
    if (st.highest >= BONUS_AT && rand(st) < BONUS_CHANCE) {
      const cand = [];
      for (let v = 6; v <= st.highest / 8; v *= 2) cand.push(v);
      if (cand.length) {
        st.next = cand[Math.floor(rand(st) * cand.length)];
        st.nextBonus = true;
        return;
      }
    }
    st.next = drawFromBag(st);
  }

  function newGame(mode, seed) {
    const st = {
      mode, seed: (seed == null ? (Math.random() * 4294967296) : seed) >>> 0,
      grid: new Array(N * N).fill(null), nextId: 1, score: 0, moves: 0, merges: 0, highest: 0,
      bag: [], next: 0, nextBonus: false, spawnRoll: 0, undoUsed: false, snap: null, over: false,
    };
    const cells = shuffle([...Array(N * N).keys()], st);
    const count = mode === 'quick' ? 2 : 9;
    for (let i = 0; i < count; i++) {
      const v = mode === 'quick' ? (rand(st) < 0.9 ? 2 : 4) : drawFromBag(st);
      const idx = cells[i];
      st.grid[idx] = { id: st.nextId++, v, r: Math.floor(idx / N), c: idx % N };
    }
    st.highest = maxTile(st);
    if (mode === 'shack') { drawNext(st); st.spawnRoll = rand(st); }
    st.score = computeScore(st);
    return st;
  }

  function maxTile(st) {
    let m = 0;
    st.grid.forEach(t => { if (t && t.v > m) m = t.v; });
    return m;
  }
  function tiles(st) { return st.grid.filter(Boolean); }
  function emptyCells(st) {
    const e = [];
    st.grid.forEach((t, i) => { if (!t) e.push(i); });
    return e;
  }
  function computeScore(st) {
    if (st.mode === 'quick') return st.score || 0; // running total
    return tiles(st).reduce((s, t) => s + points(t.v), 0);
  }

  /** Perform a swipe. Returns {moved:false} or a rich result the view can animate. */
  function move(st, dir) {
    if (st.over) return { moved: false };
    const p = plan(st, dir);
    if (!p.moved) return { moved: false };
    if (st.mode === 'quick' && !st.undoUsed) st.snap = snapshot(st);
    const prevHighest = st.highest;
    const scoreBefore = st.score;

    // clear every moving tile's old cell, then put tiles at their new cells
    p.moves.forEach(m => { st.grid[m.from[0] * N + m.from[1]] = null; });
    p.moves.forEach(m => {
      if (m.absorbedBy != null) return;
      m.tile.r = m.to[0]; m.tile.c = m.to[1];
      st.grid[m.tile.r * N + m.tile.c] = m.tile;
    });
    let quickGain = 0;
    p.merges.forEach(m => {
      m.survivor.v = m.value;
      quickGain += m.value;
      st.merges++;
    });
    if (st.mode === 'quick') st.score += quickGain;

    // spawn
    let spawned = null;
    if (st.mode === 'shack') {
      const line = p.movedLines[Math.min(p.movedLines.length - 1, Math.floor(st.spawnRoll * p.movedLines.length))];
      const [r, c] = lineCell(dir, line, N - 1);
      spawned = { id: st.nextId++, v: st.next, r, c, bonus: st.nextBonus };
      st.grid[r * N + c] = spawned;
    } else {
      const e = emptyCells(st);
      if (e.length) {
        const idx = e[Math.floor(rand(st) * e.length)];
        spawned = { id: st.nextId++, v: rand(st) < 0.9 ? 2 : 4, r: Math.floor(idx / N), c: idx % N };
        st.grid[idx] = spawned;
      }
    }
    st.moves++;
    st.highest = Math.max(st.highest, maxTile(st));
    if (st.mode === 'shack') { drawNext(st); st.spawnRoll = rand(st); }
    st.score = computeScore(st);
    st.over = isOver(st);
    return {
      moved: true, dir, moves: p.moves, merges: p.merges, spawned,
      scoreDelta: st.score - scoreBefore,
      newHighest: st.highest > prevHighest, prevHighest, over: st.over,
    };
  }

  function isOver(st) {
    for (const d of DIR_NAMES) if (plan(st, d).moved) return false;
    return true;
  }

  // ---------- undo (Quick Slide only, one per game) ----------
  function snapshot(st) {
    return {
      grid: st.grid.map(t => t ? { id: t.id, v: t.v, r: t.r, c: t.c } : null),
      score: st.score, moves: st.moves, merges: st.merges, nextId: st.nextId, seed: st.seed, highest: st.highest,
    };
  }
  function canUndo(st) { return st.mode === 'quick' && !st.undoUsed && !!st.snap; }
  function undo(st) {
    if (!canUndo(st)) return false;
    const s = st.snap;
    st.grid = s.grid.map(t => t ? { id: t.id, v: t.v, r: t.r, c: t.c } : null);
    st.score = s.score; st.moves = s.moves; st.merges = s.merges; st.nextId = s.nextId; st.highest = s.highest;
    // keep the rng moving forward so the same spawn is not forced again
    st.undoUsed = true; st.snap = null; st.over = false;
    return true;
  }

  /** Shack end-of-game tally: every tile, smallest first, with its points. */
  function tally(st) {
    return tiles(st).map(t => ({ tile: t, points: points(t.v) }))
      .sort((a, b) => a.tile.v - b.tile.v || (a.tile.r * N + a.tile.c) - (b.tile.r * N + b.tile.c));
  }

  /** "The Sugarmaker's par" for a daily board: a simple one-move-lookahead player's final score on that seed.
   *  Deterministic, so everyone gets the same par for the same date. */
  // three simple play styles (how much they value empty cells); the par is the best of the three
  const PAR_W = [10, 6, 15];
  function parValue(s, w) { let m = 0; for (const d of DIR_NAMES) if (plan(s, d).moved) m++; return emptyCells(s).length * w + computeScore(s) * 0.02 + m * 6 + (s.over ? -1000 : 0); }
  /** One move of a par player (in place). Returns false when it can't move. */
  function parStep(st, w) {
    let best = null, bv = -Infinity;
    for (const d of DIR_NAMES) { if (!plan(st, d).moved) continue; const s1 = JSON.parse(JSON.stringify(st)); move(s1, d); const v = parValue(s1, w || 10); if (v > bv) { bv = v; best = d; } }
    if (!best) return false;
    move(st, best); return true;
  }
  // simple bots swing a lot from board to board, so the par leans on a floor: 600 + 0.6 x the best bot
  function parFromBot(top) { return Math.round(600 + top * 0.6); }
  // ---------- daily twists: each date gets one of these starting boards (same for everyone) ----------
  const TWISTS = [
    { name: 'Classic run', blurb: 'a plain board' },
    { name: 'Head start', blurb: 'one tile starts as a 24' },
    { name: 'Busy morning', blurb: 'twelve tiles to start' },
    { name: 'Twin pans', blurb: 'two 12s waiting to meet' },
  ];
  function newDaily(seed, twist) {
    const st = newGame('shack', seed);
    const empty = () => emptyCells(st), put = (idx, v) => { st.grid[idx] = { id: st.nextId++, v, r: Math.floor(idx / N), c: idx % N }; };
    if (twist === 1) { const t = tiles(st); const pick = t[Math.floor(rand(st) * t.length)]; pick.v = 24; }
    else if (twist === 2) { for (let i = 0; i < 3; i++) { const e = empty(); put(e[Math.floor(rand(st) * e.length)], drawFromBag(st)); } }
    else if (twist === 3) { for (let i = 0; i < 2; i++) { const e = empty(); put(e[Math.floor(rand(st) * e.length)], 12); } }
    st.highest = maxTile(st); st.score = computeScore(st); st.over = isOver(st);
    return st;
  }
  function parScore(seed, maxMoves, twist) {
    let top = 0;
    PAR_W.forEach(w => { const st = newDaily(seed, twist || 0); let n = 0; while (!st.over && n < (maxMoves || 2500) && parStep(st, w)) n++; top = Math.max(top, st.score); });
    return parFromBot(top);
  }

  return {
    parScore, parStep, parFromBot, PAR_W, TWISTS, newDaily,
    N, DIRS, DIR_NAMES, BAG, BONUS_AT,
    rand, shuffle, artIndex, rank, points, mergeValue, lineCell,
    plan, previewSpawn, newGame, move, isOver, tiles, emptyCells, maxTile, computeScore,
    snapshot, canUndo, undo, tally, drawNext, drawFromBag,
  };
});
