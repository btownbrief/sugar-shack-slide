/* Sugar Shack Slide - code-drawn art: 14 maple-sugaring characters on wooden tag cards.
 *
 * Every character is drawn in "character units" (-1..1 box, y down). The tile card, number
 * plaque and face system are shared. Painted art can replace any character later:
 *   SSSArt.ASSETS['char0'] = <HTMLImageElement>   (see IMAGE-PROMPTS.md)
 * If an image is present and loaded it is drawn instead of the code art; the face (moods,
 * blinking, nervous eyes) is still drawn on top by code.
 */
(function (root) {
  'use strict';
  const OUT = '#3b2412';
  const TAU = Math.PI * 2;
  const ASSETS = {};

  const NAMES = ['Sap Drop', 'Maple Leaf', 'Tap', 'Sap Bucket', 'Boiling Pan', 'Syrup Jug', 'Amber Bottle',
    'Sugarhouse', 'Sugar Maple', 'Sugar on Snow', 'Maple Creemee', 'Pancake Stack', 'Maple Moon', 'Grand Maple Crown'];
  const HELLO = ['Drip!', 'Fall in!', 'Tap tap!', 'Zzz... oh, hi', 'Hot hot hot!', 'Ho ho, sweet!', 'Charmed.',
    'Come on in!', 'Hello, friend', 'Brr-illiant!', 'Soft serve!', "Stack 'em!", 'Sweet dreams', 'All hail!'];
  // card tint (top, bottom) - cool sap-water up through warm amber, then the treats
  const TINT = [
    ['#d3f1f6', '#82c9de'], ['#ffc2b0', '#e24a32'], ['#fbeaa8', '#efc04a'], ['#cfe6b8', '#8ac36c'],
    ['#ffd8a0', '#f3901f'], ['#cdeee6', '#55b5a2'], ['#f6d6ec', '#c96a9e'], ['#dcd5f8', '#8a7ad6'],
    ['#e3e9ef', '#7d93a8'], ['#bfe0ff', '#3f88d6'], ['#ecd2b8', '#9c6a44'], ['#ffcade', '#e0457f'],
    ['#9aa6e6', '#2f3b85'], ['#ffec92', '#f0b01a'],
  ];
  // face anchor (character units), eye spacing, eye radius, personality
  const FACE = [
    { x: 0, y: 0.36, es: 0.25, er: 0.15, tr: 'shy' },
    { x: 0, y: -0.02, es: 0.22, er: 0.14, tr: 'cheery' },
    { x: 0.06, y: 0.0, es: 0.22, er: 0.13, tr: 'cheeky' },
    { x: 0, y: 0.2, es: 0.25, er: 0.15, tr: 'sleepy' },
    { x: 0, y: 0.3, es: 0.28, er: 0.15, tr: 'hothead' },
    { x: 0, y: 0.28, es: 0.26, er: 0.15, tr: 'jolly' },
    { x: 0, y: 0.38, es: 0.2, er: 0.13, tr: 'proper', white: true },
    { x: 0, y: 0.26, es: 0.27, er: 0.15, tr: 'proud', white: true },
    { x: 0, y: -0.22, es: 0.26, er: 0.15, tr: 'wise' },
    { x: 0, y: 0.46, es: 0.25, er: 0.14, tr: 'cheeky' },
    { x: 0, y: -0.2, es: 0.2, er: 0.13, tr: 'playful' },
    { x: 0, y: 0.06, es: 0.26, er: 0.14, tr: 'yummy' },
    { x: 0, y: 0.08, es: 0.28, er: 0.15, tr: 'dreamy' },
    { x: 0, y: 0.48, es: 0.27, er: 0.14, tr: 'regal' },
  ];
  const TRAIT = {
    shy: { blush: 1, mouth: 'smallsmile', brow: 'worried' },
    cheery: { mouth: 'grin' },
    grumpy: { mouth: 'pout', brow: 'angry' },
    sleepy: { mouth: 'smile', lid: 0.25 },
    hothead: { mouth: 'grin', blush: 1, blushRed: 1 },
    jolly: { mouth: 'grin', blush: 1 },
    proper: { mouth: 'smile' },
    proud: { mouth: 'smile' },
    wise: { mouth: 'smile', lid: 0.12 },
    cheeky: { mouth: 'smirk', brow: 'raised' },
    playful: { mouth: 'tongue' },
    yummy: { mouth: 'smile', blush: 1, closed: 1 },
    dreamy: { mouth: 'smile', lid: 0.2 },
    regal: { mouth: 'smirk', brow: 'raised', lid: 0.2 },
  };

  // ---------- helpers ----------
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) { c.roundRect(x, y, w, h, r); return; }
    r = Math.min(r, w / 2, h / 2);
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function lg(c, x0, y0, x1, y1, stops) {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
    return g;
  }
  function rg(c, x, y, r0, r1, stops) {
    const g = c.createRadialGradient(x, y, r0, x, y, r1);
    stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
    return g;
  }
  const LW = 0.075;
  function fs(c, fill, lw) {
    c.fillStyle = fill; c.fill();
    c.lineWidth = lw || LW; c.strokeStyle = OUT; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
  }
  function ell(c, x, y, rx, ry, rot) { c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
  function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); }

  // ---------- the characters ----------
  const CHARS = [];

  CHARS[0] = (c) => { // Sap Drop
    c.beginPath(); c.moveTo(0, -0.98);
    c.bezierCurveTo(0.12, -0.55, 0.8, -0.2, 0.8, 0.3);
    c.bezierCurveTo(0.8, 0.74, 0.42, 0.97, 0, 0.97);
    c.bezierCurveTo(-0.42, 0.97, -0.8, 0.74, -0.8, 0.3);
    c.bezierCurveTo(-0.8, -0.2, -0.12, -0.55, 0, -0.98); c.closePath();
    fs(c, rg(c, -0.2, 0.1, 0.05, 1.0, ['#f2fdff', '#8fd8ea', '#3f9cc4']));
    c.fillStyle = 'rgba(255,255,255,.7)'; ell(c, -0.45, 0.1, 0.09, 0.22, 0.35); c.fill();
    c.fillStyle = 'rgba(255,255,255,.55)'; circ(c, -0.4, 0.5, 0.06); c.fill();
  };

  const LEAF = [[0.15, -0.62], [0.33, -0.76], [0.36, -0.38], [0.66, -0.54], [0.6, -0.16], [0.95, -0.08], [0.7, 0.14], [0.88, 0.46], [0.44, 0.4], [0.12, 0.64]];
  CHARS[1] = (c) => { // Maple Leaf
    c.beginPath(); c.moveTo(0, -0.98);
    LEAF.forEach(p => c.lineTo(p[0], p[1]));
    c.lineTo(0, 0.72);
    for (let i = LEAF.length - 1; i >= 0; i--) c.lineTo(-LEAF[i][0], LEAF[i][1]);
    c.closePath();
    fs(c, rg(c, -0.2, -0.3, 0.05, 1.1, ['#ff9a55', '#e8452a', '#b32a1e']));
    c.beginPath(); c.moveTo(0, 0.7); c.lineTo(0, 0.99); c.lineWidth = 0.14; c.strokeStyle = OUT; c.lineCap = 'round'; c.stroke();
    c.lineWidth = 0.05; c.strokeStyle = '#8a8a2a'; c.beginPath(); c.moveTo(0, 0.7); c.lineTo(0, 0.98); c.stroke();
    c.strokeStyle = 'rgba(120,20,10,.35)'; c.lineWidth = 0.035;
    c.beginPath(); c.moveTo(0, 0.6); c.lineTo(0.5, -0.4); c.moveTo(0, 0.6); c.lineTo(-0.5, -0.4); c.stroke();
  };

  CHARS[2] = (c) => { // Tap (a metal spile driven into a chunk of maple trunk)
    // the trunk it's tapped into: bark slab on the left
    rr(c, -1.0, -0.95, 0.5, 1.9, 0.16);
    fs(c, lg(c, -1, 0, -0.5, 0, ['#4a2c17', '#7b4f2c', '#5a361c']));
    c.strokeStyle = 'rgba(30,14,4,.55)'; c.lineWidth = 0.05; c.lineCap = 'round';
    [[-0.86, -0.8, -0.82, -0.2], [-0.66, -0.5, -0.7, 0.3], [-0.84, 0.15, -0.8, 0.78], [-0.64, 0.45, -0.66, 0.8]].forEach(q => { c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(q[2], q[3]); c.stroke(); });
    // bucket hook hanging under the spout
    c.beginPath(); c.moveTo(0.42, 0.42); c.lineTo(0.42, 0.7); c.quadraticCurveTo(0.42, 0.86, 0.26, 0.86); c.quadraticCurveTo(0.12, 0.86, 0.12, 0.72);
    c.lineWidth = 0.13; c.strokeStyle = OUT; c.stroke(); c.lineWidth = 0.055; c.strokeStyle = '#b9c4cb'; c.stroke();
    // tapered spile body
    c.beginPath(); c.moveTo(-0.62, -0.5); c.lineTo(0.7, -0.3); c.quadraticCurveTo(0.78, -0.29, 0.78, -0.2);
    c.lineTo(0.78, 0.36); c.quadraticCurveTo(0.78, 0.45, 0.7, 0.45); c.lineTo(-0.62, 0.55); c.closePath();
    fs(c, lg(c, 0, -0.5, 0, 0.55, ['#f2f6f8', '#bcc7ce', '#7d8a93']));
    c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.moveTo(-0.5, -0.38); c.lineTo(0.55, -0.22); c.lineTo(0.55, -0.15); c.lineTo(-0.5, -0.28); c.closePath(); c.fill();
    // spout lip, open end
    ell(c, 0.8, 0.08, 0.1, 0.3); fs(c, lg(c, 0, -0.22, 0, 0.38, ['#8b98a1', '#56636c']), 0.05);
    // drip
    c.beginPath(); c.moveTo(0.88, 0.4); c.quadraticCurveTo(1.0, 0.6, 0.88, 0.72); c.quadraticCurveTo(0.76, 0.6, 0.88, 0.4);
    fs(c, '#a7e0ef', 0.045);
  };

  CHARS[3] = (c) => { // Sap Bucket
    // handle
    c.beginPath(); c.moveTo(-0.72, -0.4); c.quadraticCurveTo(0, -1.45, 0.72, -0.4);
    c.lineWidth = 0.13; c.strokeStyle = OUT; c.lineCap = 'round'; c.stroke();
    c.lineWidth = 0.05; c.strokeStyle = '#b4c1c9'; c.stroke();
    // body
    c.beginPath(); c.moveTo(-0.78, -0.42); c.lineTo(0.78, -0.42); c.lineTo(0.58, 0.9); c.quadraticCurveTo(0, 1.02, -0.58, 0.9); c.closePath();
    fs(c, lg(c, -0.8, 0, 0.8, 0, ['#8fa3b0', '#d6e0e6', '#9db0bc', '#6e8392']));
    // band
    c.strokeStyle = 'rgba(40,60,75,.4)'; c.lineWidth = 0.05;
    c.beginPath(); c.moveTo(-0.68, 0.5); c.quadraticCurveTo(0, 0.6, 0.68, 0.5); c.stroke();
    // rim + sap
    ell(c, 0, -0.42, 0.8, 0.17); fs(c, '#6e8392', 0.06);
    ell(c, 0, -0.42, 0.66, 0.11); c.fillStyle = '#bfeaf5'; c.fill();
    c.fillStyle = 'rgba(255,255,255,.8)'; ell(c, -0.2, -0.45, 0.14, 0.035); c.fill();
  };

  CHARS[4] = (c, t) => { // Boiling Pan
    // fire box
    rr(c, -0.92, 0.5, 1.84, 0.46, 0.14); fs(c, lg(c, 0, 0.5, 0, 0.96, ['#5a3a2a', '#2a1a12']));
    for (let i = 0; i < 4; i++) {
      const x = -0.62 + i * 0.42, h = 0.2 + 0.07 * Math.sin(t * 9 + i * 1.7);
      c.beginPath(); c.moveTo(x - 0.14, 0.94); c.quadraticCurveTo(x - 0.08, 0.94 - h, x, 0.94 - h - 0.14);
      c.quadraticCurveTo(x + 0.08, 0.94 - h, x + 0.14, 0.94); c.closePath();
      c.fillStyle = i % 2 ? '#ffd24a' : '#ff9a2e'; c.fill();
    }
    // pan
    rr(c, -0.98, -0.12, 1.96, 0.74, 0.2);
    fs(c, lg(c, 0, -0.12, 0, 0.62, ['#e2e8ec', '#a7b3bb', '#6f7d87']));
    // bubbling syrup
    rr(c, -0.85, -0.04, 1.7, 0.2, 0.1); c.fillStyle = lg(c, 0, -0.04, 0, 0.16, ['#ffd27a', '#e2931f']); c.fill();
    for (let i = 0; i < 4; i++) {
      const bx = -0.6 + i * 0.4, ph = (t * 1.6 + i * 0.37) % 1;
      c.fillStyle = 'rgba(255,240,190,.9)'; circ(c, bx, 0.1 - ph * 0.12, 0.05 + ph * 0.03); c.fill();
    }
    // handles
    c.fillStyle = '#6f7d87'; rr(c, -1.04, 0.08, 0.14, 0.2, 0.05); fs(c, '#6f7d87', 0.05);
    rr(c, 0.9, 0.08, 0.14, 0.2, 0.05); fs(c, '#6f7d87', 0.05);
  };

  CHARS[5] = (c) => { // Syrup Jug
    // handle
    c.beginPath(); c.moveTo(0.52, -0.05); c.bezierCurveTo(1.12, -0.1, 1.12, 0.62, 0.55, 0.6);
    c.lineWidth = 0.2; c.strokeStyle = OUT; c.lineCap = 'round'; c.stroke();
    c.lineWidth = 0.09; c.strokeStyle = '#c9781c'; c.stroke();
    // body
    c.beginPath(); c.moveTo(-0.22, -0.62); c.lineTo(-0.24, -0.42);
    c.bezierCurveTo(-0.72, -0.3, -0.72, 0.1, -0.7, 0.55); c.bezierCurveTo(-0.7, 0.9, -0.5, 0.97, 0, 0.97);
    c.bezierCurveTo(0.5, 0.97, 0.7, 0.9, 0.7, 0.55); c.bezierCurveTo(0.72, 0.1, 0.72, -0.3, 0.24, -0.42);
    c.lineTo(0.22, -0.62); c.closePath();
    fs(c, lg(c, -0.7, 0, 0.7, 0, ['#9c5614', '#e9a233', '#c3731c', '#8a4a10']));
    c.fillStyle = 'rgba(255,235,170,.5)'; rr(c, -0.5, -0.12, 0.1, 0.5, 0.05); c.fill();
    // cap
    rr(c, -0.3, -0.95, 0.6, 0.38, 0.12); fs(c, lg(c, 0, -0.95, 0, -0.57, ['#ec5a3c', '#b02a1a']));
    // label leaf
    c.beginPath(); c.moveTo(0, -0.34); c.lineTo(0.06, -0.26); c.lineTo(0.14, -0.28); c.lineTo(0.1, -0.2); c.lineTo(0, -0.1); c.lineTo(-0.1, -0.2); c.lineTo(-0.14, -0.28); c.lineTo(-0.06, -0.26); c.closePath();
    c.fillStyle = '#fff1cf'; c.fill();
  };

  CHARS[6] = (c) => { // Amber Bottle
    c.beginPath(); c.moveTo(-0.17, -0.72); c.lineTo(-0.17, -0.42);
    c.bezierCurveTo(-0.62, -0.3, -0.55, -0.1, -0.55, 0.15); c.lineTo(-0.55, 0.78);
    c.quadraticCurveTo(-0.55, 0.97, -0.34, 0.97); c.lineTo(0.34, 0.97); c.quadraticCurveTo(0.55, 0.97, 0.55, 0.78);
    c.lineTo(0.55, 0.15); c.bezierCurveTo(0.55, -0.1, 0.62, -0.3, 0.17, -0.42); c.lineTo(0.17, -0.72); c.closePath();
    fs(c, lg(c, -0.55, 0, 0.55, 0, ['#9c5a0c', '#f3b238', '#d98c1a', '#8a4d0a']));
    c.fillStyle = 'rgba(255,240,190,.55)'; rr(c, -0.42, -0.1, 0.09, 0.6, 0.04); c.fill();
    // cork
    rr(c, -0.2, -0.98, 0.4, 0.3, 0.07); fs(c, lg(c, 0, -0.98, 0, -0.68, ['#e5c58e', '#b08a4d']));
    // label
    rr(c, -0.42, 0.0, 0.84, 0.34, 0.05); fs(c, '#fff1cf', 0.04);
    c.fillStyle = '#c9402a'; c.beginPath(); c.moveTo(0, 0.07); c.lineTo(0.06, 0.15); c.lineTo(0.14, 0.13); c.lineTo(0.09, 0.2); c.lineTo(0, 0.29); c.lineTo(-0.09, 0.2); c.lineTo(-0.14, 0.13); c.lineTo(-0.06, 0.15); c.closePath(); c.fill();
  };

  CHARS[7] = (c, t) => { // Sugarhouse
    // chimney + steam
    rr(c, 0.3, -1.0, 0.3, 0.6, 0.04); fs(c, lg(c, 0.3, 0, 0.6, 0, ['#a55a3d', '#7c3d28']), 0.05);
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.6 + i / 3) % 1;
      c.fillStyle = 'rgba(255,255,255,' + (0.7 * (1 - ph)).toFixed(2) + ')'; circ(c, 0.45 + Math.sin(ph * 5 + i) * 0.08, -1.0 - ph * 0.0, 0.07 + ph * 0.1); c.fill();
    }
    // wall
    rr(c, -0.8, -0.22, 1.6, 1.16, 0.06); fs(c, lg(c, -0.8, 0, 0.8, 0, ['#9a5e32', '#c68a56', '#a56a3a']));
    c.strokeStyle = 'rgba(60,30,12,.28)'; c.lineWidth = 0.03;
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(-0.8 + i * 0.4, -0.2); c.lineTo(-0.8 + i * 0.4, 0.92); c.stroke(); }
    // roof
    c.beginPath(); c.moveTo(-1.0, -0.1); c.lineTo(0, -0.92); c.lineTo(1.0, -0.1); c.closePath();
    fs(c, lg(c, 0, -0.92, 0, -0.1, ['#e0614a', '#a8301f']));
    // snow on roof
    c.beginPath(); c.moveTo(-0.5, -0.5); c.lineTo(0, -0.9); c.lineTo(0.5, -0.5);
    c.quadraticCurveTo(0.35, -0.42, 0.25, -0.54); c.quadraticCurveTo(0.1, -0.4, 0, -0.55); c.quadraticCurveTo(-0.12, -0.4, -0.26, -0.54); c.quadraticCurveTo(-0.38, -0.42, -0.5, -0.5);
    c.fillStyle = '#f4faff'; c.fill();
    c.lineWidth = 0.04; c.strokeStyle = OUT; c.stroke();
    // lit window glow left+right of face
    c.fillStyle = 'rgba(255,220,120,.35)'; rr(c, -0.7, 0.62, 0.3, 0.24, 0.03); c.fill(); rr(c, 0.4, 0.62, 0.3, 0.24, 0.03); c.fill();
  };

  CHARS[8] = (c, t) => { // Sugar Maple tree
    // trunk
    c.beginPath(); c.moveTo(-0.22, 0.2); c.lineTo(-0.3, 0.97); c.lineTo(0.3, 0.97); c.lineTo(0.22, 0.2); c.closePath();
    fs(c, lg(c, -0.3, 0, 0.3, 0, ['#6e4224', '#a06a3c', '#6e4224']));
    // crown
    const blobs = [[-0.45, -0.05, 0.46], [0.45, -0.05, 0.46], [0, -0.45, 0.58], [-0.25, 0.1, 0.5], [0.25, 0.1, 0.5]];
    blobs.forEach(b => { circ(c, b[0], b[1], b[2]); c.fillStyle = OUT; c.fill(); });
    blobs.forEach(b => { circ(c, b[0], b[1], b[2] - 0.065); c.fillStyle = rg(c, b[0] - 0.1, b[1] - 0.15, 0.02, b[2], ['#ff9456', '#e5522c', '#bf3820']); c.fill(); });
    // little leaf falling
    const ph = (t * 0.4) % 1;
    c.save(); c.translate(0.82 - ph * 0.2, -0.2 + ph * 1.1); c.rotate(ph * 5); c.scale(0.12, 0.12);
    c.beginPath(); c.moveTo(0, -1); c.lineTo(0.5, -0.2); c.lineTo(1, 0.2); c.lineTo(0, 0.6); c.lineTo(-1, 0.2); c.lineTo(-0.5, -0.2); c.closePath();
    c.fillStyle = '#e8452a'; c.fill(); c.restore();
  };

  CHARS[9] = (c) => { // Sugar on Snow
    c.beginPath(); c.moveTo(-0.99, 0.92);
    c.bezierCurveTo(-0.99, 0.0, -0.45, -0.5, 0, -0.5); c.bezierCurveTo(0.45, -0.5, 0.99, 0.0, 0.99, 0.92); c.closePath();
    fs(c, rg(c, -0.2, -0.2, 0.05, 1.2, ['#ffffff', '#e0ecfa', '#a9c4e8']));
    // taffy ribbon
    c.beginPath(); c.moveTo(-0.62, -0.02);
    c.bezierCurveTo(-0.45, -0.5, -0.2, 0.14, 0.02, -0.3); c.bezierCurveTo(0.2, -0.55, 0.42, 0.1, 0.62, -0.1);
    c.lineWidth = 0.2; c.strokeStyle = OUT; c.lineCap = 'round'; c.stroke();
    c.lineWidth = 0.1; c.strokeStyle = '#f0ab2c'; c.stroke();
    c.lineWidth = 0.03; c.strokeStyle = 'rgba(255,240,180,.9)'; c.stroke();
    // sparkle
    c.fillStyle = '#fff'; circ(c, 0.7, 0.4, 0.03); c.fill(); circ(c, -0.75, 0.55, 0.025); c.fill();
  };

  CHARS[10] = (c) => { // Maple Creemee
    // cone
    c.beginPath(); c.moveTo(-0.52, 0.18); c.lineTo(0.52, 0.18); c.lineTo(0.0, 0.99); c.closePath();
    fs(c, lg(c, -0.5, 0, 0.5, 0, ['#c88a3c', '#efc274', '#c88a3c']));
    c.strokeStyle = 'rgba(110,60,15,.45)'; c.lineWidth = 0.04;
    c.beginPath(); c.moveTo(-0.3, 0.2); c.lineTo(0.22, 0.75); c.moveTo(0.3, 0.2); c.lineTo(-0.22, 0.75); c.moveTo(-0.1, 0.2); c.lineTo(0.12, 0.45); c.moveTo(0.1, 0.2); c.lineTo(-0.12, 0.45); c.stroke();
    // swirl layers
    const L = [[0, 0.04, 0.7, 0.3], [0, -0.3, 0.58, 0.26], [0, -0.58, 0.42, 0.22]];
    L.forEach(l => { ell(c, l[0], l[1], l[2], l[3]); fs(c, lg(c, 0, l[1] - l[3], 0, l[1] + l[3], ['#fffaf0', '#f6dc9f'])); });
    c.beginPath(); c.moveTo(-0.14, -0.74); c.quadraticCurveTo(0.04, -1.1, 0.12, -0.74); c.closePath(); fs(c, '#fff3d6', 0.06);
    // maple drizzle
    c.beginPath(); c.moveTo(-0.38, -0.66); c.quadraticCurveTo(-0.1, -0.5, 0.3, -0.66);
    c.lineTo(0.28, -0.52); c.quadraticCurveTo(0.26, -0.36, 0.2, -0.52); c.lineTo(0.0, -0.5); c.quadraticCurveTo(-0.04, -0.3, -0.1, -0.5); c.lineTo(-0.3, -0.54); c.closePath();
    c.fillStyle = '#d98a1c'; c.fill();
  };

  CHARS[11] = (c) => { // Pancake Stack
    const P = [[0.2, 0.62], [-0.2, 0.6], [-0.62, 0.6]];
    [0.34, -0.1, -0.56].forEach((y, i) => {
      rr(c, -0.88, y, 1.76, 0.62, 0.3);
      fs(c, lg(c, 0, y, 0, y + 0.62, ['#fbd68a', '#e2a24a', '#c07a2a']));
      c.fillStyle = 'rgba(255,240,200,.35)'; rr(c, -0.7, y + 0.06, 1.1, 0.07, 0.03); c.fill();
    });
    // syrup pour on top
    c.beginPath(); c.moveTo(-0.7, -0.5); c.quadraticCurveTo(0, -0.7, 0.7, -0.5);
    c.quadraticCurveTo(0.9, -0.3, 0.76, -0.1); c.quadraticCurveTo(0.7, 0.2, 0.62, -0.12);
    c.quadraticCurveTo(0.5, -0.3, 0.4, -0.18); c.quadraticCurveTo(0.3, 0.1, 0.18, -0.2);
    c.quadraticCurveTo(0, -0.3, -0.2, -0.2); c.quadraticCurveTo(-0.3, 0.0, -0.42, -0.2); c.quadraticCurveTo(-0.7, -0.3, -0.7, -0.5); c.closePath();
    c.fillStyle = 'rgba(179,92,12,.92)'; c.fill(); c.lineWidth = 0.04; c.strokeStyle = OUT; c.stroke();
    c.fillStyle = 'rgba(255,220,140,.5)'; ell(c, -0.2, -0.5, 0.25, 0.05); c.fill();
    // butter
    rr(c, -0.14, -0.86, 0.34, 0.26, 0.05); fs(c, lg(c, 0, -0.86, 0, -0.6, ['#fff6b0', '#f4d65a']), 0.05);
  };

  CHARS[12] = (c, t) => { // Maple Moon
    // stars
    [[-0.9, -0.7, 0], [0.88, -0.55, 1.3], [0.84, 0.8, 2.4], [-0.86, 0.72, 0.7]].forEach(s => {
      const k = 0.1 + 0.05 * Math.sin(t * 3 + s[2]);
      c.save(); c.translate(s[0], s[1]); c.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? k * 0.35 : k * 1.6; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      c.closePath(); c.fillStyle = '#fff2a0'; c.fill(); c.restore();
    });
    circ(c, 0, 0.04, 0.84);
    fs(c, rg(c, -0.25, -0.25, 0.05, 1.0, ['#fffbd0', '#f6d160', '#d49c2a']));
    c.fillStyle = 'rgba(160,100,10,.22)';
    circ(c, 0.45, -0.3, 0.14); c.fill(); circ(c, -0.52, 0.42, 0.1); c.fill(); circ(c, 0.4, 0.55, 0.08); c.fill();
  };

  CHARS[13] = (c, t) => { // Grand Maple Crown
    c.beginPath(); c.moveTo(-0.92, 0.26); c.lineTo(-0.96, -0.62); c.lineTo(-0.46, -0.14); c.lineTo(0, -0.9);
    c.lineTo(0.46, -0.14); c.lineTo(0.96, -0.62); c.lineTo(0.92, 0.26); c.closePath();
    fs(c, lg(c, -1, -0.9, 1, 0.3, ['#fff3a0', '#f5c332', '#d08f10']));
    // band
    rr(c, -0.96, 0.18, 1.92, 0.8, 0.14); fs(c, lg(c, 0, 0.18, 0, 0.98, ['#ffe36e', '#eeb524', '#c88710']));
    // jewels
    [[-0.96, -0.66, '#d8352a'], [0, -0.94, '#d8352a'], [0.96, -0.66, '#d8352a']].forEach(j => {
      circ(c, j[0], j[1], 0.13); fs(c, rg(c, j[0] - 0.04, j[1] - 0.04, 0.01, 0.14, ['#ffb0a0', j[2]]), 0.05);
    });
    // maple gem on the band
    c.save(); c.translate(0, 0.28); c.scale(0.11, 0.11);
    c.beginPath(); LEAF.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(0, -1)); for (let i = LEAF.length - 1; i >= 0; i--) c.lineTo(-LEAF[i][0], LEAF[i][1]); c.closePath();
    c.fillStyle = '#d8352a'; c.fill(); c.restore();
    const k = 0.5 + 0.5 * Math.sin(t * 4);
    c.fillStyle = 'rgba(255,255,255,' + (0.4 + 0.5 * k).toFixed(2) + ')';
    c.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 0.03 : 0.12; c.lineTo(0.7 + Math.cos(a) * r, -0.3 + Math.sin(a) * r); }
    c.closePath(); c.fill();
  };

  // ---------- faces ----------
  function drawBrows(c, kind, es, er, ey) {
    c.lineWidth = 0.055; c.strokeStyle = OUT; c.lineCap = 'round';
    [-1, 1].forEach(s => {
      const x = s * es;
      c.beginPath();
      if (kind === 'worried') { c.moveTo(x - s * er * 1.4, ey - er * 2.3); c.lineTo(x + s * er * 1.3, ey - er * 1.5); }
      else if (kind === 'angry') { c.moveTo(x - s * er * 1.3, ey - er * 1.5); c.lineTo(x + s * er * 1.4, ey - er * 2.3); }
      else if (kind === 'raised') { if (s === 1) { c.moveTo(x - er * 1.2, ey - er * 1.9); c.quadraticCurveTo(x, ey - er * 2.9, x + er * 1.2, ey - er * 2.0); } else return; }
      c.stroke();
    });
  }

  function eyeShape(c, f, T, x, y, fm, mode, which) {
    const er = f.er, bl = fm.blink || 0;
    const lx = (fm.lx || 0) * er * 0.55, ly = (fm.ly || 0) * er * 0.5;
    if (mode === 'happy' || (T.closed && mode === 'idle')) { // ^ ^
      c.beginPath(); c.arc(x, y + er * 0.55, er * 1.1, Math.PI * 1.08, Math.PI * 1.92);
      c.lineWidth = 0.075; c.strokeStyle = OUT; c.lineCap = 'round'; c.stroke(); return;
    }
    if (mode === 'nervous') {
      const dart = Math.sin(fm.t * 11 + (fm.phase || 0) + which) * er * 0.55;
      circ(c, x, y, er * 1.3); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 0.04; c.strokeStyle = OUT; c.stroke();
      c.fillStyle = OUT; circ(c, x + dart, y + er * 0.1, er * 0.5); c.fill();
      return;
    }
    const big = (mode === 'hello' || mode === 'excited') ? 1.22 : 1;
    if (f.white) {
      c.beginPath(); c.ellipse(x, y, er * 1.15 * big, er * 1.25 * big * (1 - bl * 0.92), 0, 0, TAU);
      c.fillStyle = '#fffdf4'; c.fill(); c.lineWidth = 0.045; c.strokeStyle = OUT; c.stroke();
      if (bl < 0.6) { c.fillStyle = OUT; circ(c, x + lx * 1.1, y + ly * 1.1, er * 0.62 * big); c.fill(); c.fillStyle = '#fff'; circ(c, x + lx * 1.1 - er * 0.2, y + ly * 1.1 - er * 0.22, er * 0.2); c.fill(); }
      return;
    }
    c.save();
    if (T.lid && mode === 'idle') { c.beginPath(); c.rect(x - er * 2, y - er * 1.4 + T.lid * er * 2.2, er * 4, er * 4); c.clip(); }
    c.beginPath(); c.ellipse(x + lx * 0.5, y + ly * 0.5, er * 0.88 * big, er * big * (1 - bl * 0.9), 0, 0, TAU);
    c.fillStyle = OUT; c.fill();
    if (bl < 0.5) { c.fillStyle = '#fff'; circ(c, x + lx * 0.5 - er * 0.28, y + ly * 0.5 - er * 0.32, er * 0.3); c.fill(); circ(c, x + lx * 0.5 + er * 0.22, y + ly * 0.5 + er * 0.28, er * 0.14); c.fill(); }
    c.restore();
    if (T.lid && mode === 'idle') {
      c.beginPath(); c.moveTo(x - er * 0.95, y - er * 1.4 + T.lid * er * 2.2); c.lineTo(x + er * 0.95, y - er * 1.4 + T.lid * er * 2.2);
      c.lineWidth = 0.05; c.strokeStyle = OUT; c.lineCap = 'round'; c.stroke();
    }
  }

  function mouthShape(c, kind, my, es, fm, mode) {
    const w = es * 0.95;
    c.lineWidth = 0.065; c.strokeStyle = OUT; c.lineCap = 'round'; c.lineJoin = 'round';
    if (mode === 'nervous') {
      c.beginPath();
      const wob = Math.sin(fm.t * 14) * 0.012;
      c.moveTo(-w * 0.8, my + 0.03);
      for (let i = 1; i <= 4; i++) c.lineTo(-w * 0.8 + (w * 1.6) * i / 4, my + (i % 2 ? -0.05 : 0.04) + wob);
      c.stroke(); return;
    }
    if (mode === 'happy' || mode === 'hello' || mode === 'excited') {
      const open = mode === 'happy' ? 1 : 0.75;
      c.beginPath(); c.moveTo(-w, my - 0.04); c.quadraticCurveTo(0, my + 0.04 + 0.5 * open, w, my - 0.04); c.closePath();
      c.fillStyle = '#4a1d12'; c.fill(); c.stroke();
      c.save(); c.clip(); c.fillStyle = '#ff7a8a'; ell(c, 0, my + 0.34 * open, w * 0.55, 0.12 * open); c.fill(); c.restore();
      return;
    }
    c.beginPath();
    switch (kind) {
      case 'grin':
        c.moveTo(-w, my - 0.03); c.quadraticCurveTo(0, my + 0.48, w, my - 0.03); c.closePath();
        c.fillStyle = '#4a1d12'; c.fill(); c.stroke();
        c.save(); c.clip(); c.fillStyle = '#ff7a8a'; ell(c, 0, my + 0.27, w * 0.5, 0.09); c.fill(); c.restore();
        return;
      case 'smile': c.moveTo(-w * 0.8, my - 0.02); c.quadraticCurveTo(0, my + 0.28, w * 0.8, my - 0.02); break;
      case 'smallsmile': c.moveTo(-w * 0.5, my); c.quadraticCurveTo(0, my + 0.15, w * 0.5, my); break;
      case 'pout': c.moveTo(-w * 0.5, my + 0.05); c.quadraticCurveTo(0, my - 0.08, w * 0.5, my + 0.05); break;
      case 'flat': c.moveTo(-w * 0.5, my); c.lineTo(w * 0.5, my - 0.01); break;
      case 'smirk': c.moveTo(-w * 0.5, my + 0.03); c.quadraticCurveTo(w * 0.1, my + 0.12, w * 0.8, my - 0.08); break;
      case 'tongue':
        c.moveTo(-w * 0.8, my - 0.02); c.quadraticCurveTo(0, my + 0.3, w * 0.8, my - 0.02); c.stroke();
        c.beginPath(); c.moveTo(-0.02, my + 0.12); c.quadraticCurveTo(0.02, my + 0.4, w * 0.45, my + 0.2); c.quadraticCurveTo(w * 0.45, my + 0.08, w * 0.3, my + 0.07);
        c.fillStyle = '#ff7a8a'; c.fill(); c.lineWidth = 0.045; c.stroke(); return;
      default: c.moveTo(-w * 0.5, my); c.lineTo(w * 0.5, my);
    }
    c.stroke();
  }

  /** Draw the face for character idx. fm = {mode, blink, lx, ly, t, phase}; call inside char units. */
  function drawFace(c, idx, fm) {
    const f = FACE[idx], T = TRAIT[f.tr], mode = fm.mode || 'idle';
    c.save(); c.translate(f.x, f.y);
    const es = f.es, er = f.er, my = er * 2.6;
    if (T.blush || mode === 'happy' || mode === 'hello') {
      c.fillStyle = T.blushRed ? 'rgba(255,60,30,.45)' : 'rgba(255,110,120,.5)';
      [-1, 1].forEach(s => { ell(c, s * (es + er * 1.55), er * 1.5, er * 0.95, er * 0.58); c.fill(); });
    }
    if (mode === 'idle' && T.brow) drawBrows(c, T.brow, es, er, 0);
    if (mode === 'nervous') drawBrows(c, 'worried', es, er, 0);
    if (mode === 'excited' || mode === 'hello') drawBrows(c, 'raised', es, er, 0);
    eyeShape(c, f, T, -es, 0, fm, mode, 0);
    eyeShape(c, f, T, es, 0, fm, mode, 1);
    mouthShape(c, T.mouth, my, es, fm, mode);
    if (mode === 'nervous') { // sweat drop
      const b = (Math.sin(fm.t * 6) + 1) * 0.02;
      const sx = es * 2.5, sy = -er * 1.2 + b;
      c.beginPath(); c.moveTo(sx, sy - 0.14); c.quadraticCurveTo(sx + 0.12, sy + 0.04, sx, sy + 0.1); c.quadraticCurveTo(sx - 0.12, sy + 0.04, sx, sy - 0.14);
      c.fillStyle = '#bfeaf8'; c.fill(); c.lineWidth = 0.035; c.strokeStyle = OUT; c.stroke();
    }
    c.restore();
  }

  function drawChar(c, idx, t) {
    const img = ASSETS['char' + idx];
    if (img && img.complete && img.naturalWidth) c.drawImage(img, -1, -1, 2, 2);
    else CHARS[idx](c, t || 0);
  }

  // ---------- the tile card ----------
  const PLAQUE = [
    { g: ['#6b4426', '#3b2412'], rim: 'rgba(255,230,170,.55)', ink: '#fff0cc' },
    { g: ['#c27a3e', '#7a3f15'], rim: '#ffcf8a', ink: '#fff3d6', shine: 1 },
    { g: ['#f4f8fa', '#a6b4bd'], rim: '#ffffff', ink: '#3b2412', shine: 1 },
    { g: ['#fff09a', '#e0a516'], rim: '#fff8d0', ink: '#5a2a06', shine: 1 },
  ];
  function tierOf(idx) { return idx >= 12 ? 3 : idx >= 9 ? 2 : idx >= 6 ? 1 : 0; }
  /**
   * c: ctx, (cx,cy): centre px, S: tile size px, idx: art index 0..13, v: number to show.
   * o: {sx, sy, rot, alpha, fm, t, glow, shadow, bonus}
   */
  function drawTile(c, cx, cy, S, idx, v, o) {
    o = o || {};
    const h = S / 2, r = S * 0.22, t = o.t || 0;
    c.save();
    c.translate(cx, cy);
    if (o.rot) c.rotate(o.rot);
    c.scale(o.sx || 1, o.sy || 1);
    if (o.alpha != null && o.alpha < 1) c.globalAlpha *= Math.max(0, o.alpha);
    if (o.shadow !== false) {
      c.fillStyle = 'rgba(18,8,2,.38)'; rr(c, -h + S * 0.025, -h + S * 0.075, S * 0.95, S * 0.97, r); c.fill();
    }
    if (o.glow) {
      c.save(); c.shadowColor = 'rgba(255,214,100,' + Math.min(1, o.glow) + ')'; c.shadowBlur = S * 0.35 * o.glow;
      rr(c, -h, -h, S, S, r); c.fillStyle = '#ffd96a'; c.fill(); c.restore();
    }
    // card body
    const tint = TINT[idx] || TINT[0];
    rr(c, -h, -h, S, S, r);
    c.fillStyle = lg(c, 0, -h, 0, h, [tint[0], tint[1]]); c.fill();
    // soft inner light
    c.save(); rr(c, -h, -h, S, S, r); c.clip();
    c.fillStyle = rg(c, -S * 0.15, -S * 0.3, 0, S * 0.7, ['rgba(255,255,255,.55)', 'rgba(255,255,255,0)']);
    c.fillRect(-h, -h, S, S);
    // paper grain: faint horizontal fibres
    c.strokeStyle = 'rgba(80,40,10,.07)'; c.lineWidth = Math.max(1, S * 0.012);
    for (let i = 0; i < 6; i++) { const y = -h + S * (0.12 + i * 0.16); c.beginPath(); c.moveTo(-h, y); c.quadraticCurveTo(0, y + S * 0.03 * (i % 2 ? 1 : -1), h, y); c.stroke(); }
    c.restore();
    rr(c, -h, -h, S, S, r); c.lineWidth = S * 0.05; c.strokeStyle = OUT; c.lineJoin = 'round'; c.stroke();
    const ti = tierOf(idx);
    if (!ti) { rr(c, -h + S * 0.04, -h + S * 0.04, S - S * 0.08, S - S * 0.08, r * 0.8); c.lineWidth = S * 0.014; c.strokeStyle = 'rgba(255,255,255,.55)'; c.stroke(); }
    else { // tier frame: a metal inner rim (bronze / silver / gold), so bigger tiles look grander at a glance
      const rim = [null, ['#f2c08a', '#a8642c'], ['#ffffff', '#9fb0bc'], ['#fff6b8', '#d79a12']][ti];
      rr(c, -h + S * 0.045, -h + S * 0.045, S - S * 0.09, S - S * 0.09, r * 0.78);
      c.lineWidth = S * 0.032; c.strokeStyle = lg(c, -h, -h, h, h, [rim[0], rim[1], rim[0]]); c.stroke();
      if (ti >= 2) { // twinkles in the corners
        [[-0.36, -0.36, 0], [0.36, -0.3, 2.1], [-0.33, 0.12, 4.2]].forEach(q => {
          const a = Math.max(0, Math.sin(t * 2.4 + q[2] + (o.phase || 0))); if (a < 0.05) return;
          const x = q[0] * S, y = q[1] * S, z = S * (0.035 + 0.03 * a) * (ti === 3 ? 1.3 : 1);
          c.save(); c.globalAlpha *= a; c.fillStyle = '#fffbe0'; c.beginPath(); c.moveTo(x, y - z); c.quadraticCurveTo(x, y, x + z, y); c.quadraticCurveTo(x, y, x, y + z); c.quadraticCurveTo(x, y, x - z, y); c.quadraticCurveTo(x, y, x, y - z); c.fill(); c.restore();
        });
      }
    }
    // string hole
    circ(c, 0, -h + S * 0.075, S * 0.022); c.fillStyle = 'rgba(59,36,18,.65)'; c.fill();

    // character + face
    const k = S * 0.315;
    c.save();
    c.translate(0, -S * 0.12);
    const bob = Math.sin(t * 2.2 + (o.phase || 0)) * 0.012;
    c.scale(k * (1 + bob), k * (1 - bob));
    drawChar(c, idx, t);
    drawFace(c, idx, o.fm || { mode: 'idle', t: t });
    c.restore();

    // number plaque
    const s = String(v), n = s.length;
    const pw = Math.min(S * 0.9, S * (0.34 + n * 0.165)), ph = S * 0.275, py = h - S * 0.035 - ph;
    // plaque metal by tier, so big tiles read as big at a glance: wood -> bronze (48+) -> silver (384+) -> gold (3072+)
    const tier = PLAQUE[tierOf(idx)];
    rr(c, -pw / 2, py, pw, ph, ph * 0.5);
    c.fillStyle = lg(c, 0, py, 0, py + ph, tier.g); c.fill();
    c.lineWidth = S * 0.025; c.strokeStyle = tier.rim; c.stroke();
    if (tier.shine) { c.save(); rr(c, -pw / 2, py, pw, ph, ph * 0.5); c.clip(); c.fillStyle = 'rgba(255,255,255,.35)'; rr(c, -pw / 2 + ph * 0.3, py + ph * 0.1, pw - ph * 0.6, ph * 0.24, ph * 0.12); c.fill(); c.restore(); }
    const fsz = Math.min(S * 0.245, (pw - S * 0.08) / (n * 0.56));
    c.font = fsz + 'px "Lilita One", "Baloo 2", "Arial Rounded MT Bold", system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = tier.ink; c.fillText(s, 0, py + ph * 0.56);

    if (o.bonus) { // bonus tile: golden sparkle corner
      c.fillStyle = '#fff6b0'; c.strokeStyle = OUT; c.lineWidth = S * 0.02;
      c.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + t, rr_ = i % 2 ? S * 0.04 : S * 0.13; c.lineTo(h - S * 0.12 + Math.cos(a) * rr_, -h + S * 0.12 + Math.sin(a) * rr_); }
      c.closePath(); c.fill(); c.stroke();
    }
    c.restore();
  }

  /** A little sparkle / drop colour per art index for particles. */
  function colorOf(idx) { return (TINT[idx] || TINT[0])[1]; }

  root.SSSArt = { tierOf, ASSETS, NAMES, HELLO, TINT, FACE, TRAIT, OUT, drawTile, drawChar, drawFace, colorOf, rr };
})(typeof self !== 'undefined' ? self : this);
