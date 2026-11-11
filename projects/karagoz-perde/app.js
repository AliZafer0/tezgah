// Karagöz Perdesi — arkadan aydınlanan perde, eklemli tasvirler (sarkaç fiziği), kandil titremesi,
// perdeden uzaklaşınca bulanıklaşan gölge, göstermelik ve yürütme.
import { FIGURES, TREE, GOSTERMELIK, OUT } from './figures.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#perde');
const ctx = canvas.getContext('2d');
const ui = {
  gost: $('#gost'), walkK: $('#walk-k'), walkH: $('#walk-h'), flipK: $('#flip-k'), flipH: $('#flip-h'),
  depth: $('#depth'), lamp: $('#lamp'), status: $('#status'), hint: $('#hint'),
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const G = 2600; // yerçekimi (px/s², figür ölçeği 1 için)

// ------------------------------------------------------------------ geometri yardımcıları
const rot = (x, y, b) => [x * Math.cos(b) - y * Math.sin(b), x * Math.sin(b) + y * Math.cos(b)];
function centroid(pts) { let x = 0; let y = 0; for (const p of pts) { x += p[0]; y += p[1]; } return [x / pts.length, y / pts.length]; }
// Delik işçiliği: kenar boyunca, biraz içeride sıralı küçük delikler
function perforate(pts, step = 4.2, inset = 2.6) {
  const c = centroid(pts); const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]; const b = pts[(i + 1) % pts.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.floor(L / step);
    for (let j = 1; j < n; j++) {
      const t = j / n; const x = a[0] + (b[0] - a[0]) * t; const y = a[1] + (b[1] - a[1]) * t;
      const dx = c[0] - x; const dy = c[1] - y; const d = Math.hypot(dx, dy) || 1;
      if (d < inset * 2.2) continue;
      out.push([x + (dx / d) * inset, y + (dy / d) * inset]);
    }
  }
  return out;
}
const holeCache = new WeakMap();
const holesOf = (pts) => { if (!holeCache.has(pts)) holeCache.set(pts, perforate(pts)); return holeCache.get(pts); };

function drawShape(g, sh) {
  if (sh.type === 'hole') { g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(sh.x, sh.y, sh.r, 0, Math.PI * 2); g.fill(); return; }
  g.fillStyle = sh.color; g.beginPath();
  if (sh.type === 'circle') g.arc(sh.x, sh.y, sh.r, 0, Math.PI * 2);
  else { sh.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }
  g.fill(); g.stroke();
}
function drawPart(g, poly, color, extras) {
  g.lineWidth = 1.1; g.strokeStyle = OUT; g.lineJoin = 'round';
  drawShape(g, { type: 'poly', pts: poly, color });
  g.fillStyle = 'rgba(255,248,232,0.9)';
  for (const [x, y] of holesOf(poly)) { g.beginPath(); g.arc(x, y, 0.85, 0, Math.PI * 2); g.fill(); }
  for (const e of extras || []) drawShape(g, e);
}

// ------------------------------------------------------------------ tasvir (fizik)
function makeNode(def) { return { def, a: def.rest || 0, w: 0, P: null, P1: null, P2: null, acc: [0, 0], children: (def.children || []).map(makeNode) }; }
function makeFigure(key, x, facing) {
  const d = FIGURES[key];
  return {
    key, name: d.name, def: d, s: facing, pos: [x, 0], target: [x, 0], prev: [x, 0], vel: [0, 0], tilt: 0,
    depth: 0, grabbed: false, walk: null,
    arm: makeNode(d.arm), hips: makeNode(d.hips),
  };
}

let S = 1; // figür birimi → CSS pikseli
function torsoToWorld(f, x, y) { const [rx, ry] = rot(f.s * S * x, S * y, f.tilt); return [f.pos[0] + rx, f.pos[1] + ry]; }
function nodeToWorld(n, f, x, y) { const [rx, ry] = rot(f.s * S * x, S * y, -n.a); return [n.P[0] + rx, n.P[1] + ry]; }

function stepNode(n, f, P, parentDown, dt, frameDt) {
  // Pivot ivmesi: kare geçmişinden, yumuşatılarak
  if (!n.P) { n.P = P; n.P1 = P; n.P2 = P; n.a = parentDown + (n.def.rest || 0) * f.s; }
  n.P2 = n.P1; n.P1 = n.P; n.P = P;
  const ax = (n.P[0] - 2 * n.P1[0] + n.P2[0]) / (frameDt * frameDt); const ay = (n.P[1] - 2 * n.P1[1] + n.P2[1]) / (frameDt * frameDt);
  const cl = (v) => Math.max(-30000, Math.min(30000, v));
  n.acc[0] += (cl(ax) - n.acc[0]) * 0.5; n.acc[1] += (cl(ay) - n.acc[1]) * 0.5;
  const L = n.def.L * S; const sub = 4; const h = dt / sub;
  const rest = (n.def.rest || 0) * f.s;
  const lo = f.s > 0 ? n.def.lim[0] : -n.def.lim[1]; const hi = f.s > 0 ? n.def.lim[1] : -n.def.lim[0];
  for (let i = 0; i < sub; i++) {
    const rel = n.a - parentDown;
    const acc = -(G * (S / 1)) / L * Math.sin(n.a) * 0.6
      - (n.acc[0] * Math.cos(n.a) - n.acc[1] * Math.sin(n.a)) / L
      - n.def.k * (rel - rest) - n.def.c * n.w;
    n.w += acc * h; n.a += n.w * h;
    const r2 = n.a - parentDown;
    if (r2 < lo) { n.a = parentDown + lo; if (n.w < 0) n.w *= -0.2; }
    if (r2 > hi) { n.a = parentDown + hi; if (n.w > 0) n.w *= -0.2; }
  }
  for (const c of n.children) stepNode(c, f, nodeToWorld(n, f, ...c.def.pivot), n.a, dt, frameDt);
}

function stepFigure(f, dt) {
  if (f.walk) {
    const w = f.walk; w.t += dt;
    const u = Math.min(1, w.t / w.dur); const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    f.target[0] = w.from + (w.to - w.from) * e;
    // Adım sekmesi: kısa, düzenli yükselip alçalma
    f.target[1] = w.y - Math.abs(Math.sin(w.t * 7.5)) * 6 * S * (1 - Math.abs(u - 0.5) * 0.6);
    if (u >= 1) { f.walk = null; f.target[1] = w.y; say(`${f.name} durdu.`); }
  }
  f.prev = [...f.pos];
  const ease = Math.min(1, dt * (f.grabbed ? 22 : 12));
  f.pos[0] += (f.target[0] - f.pos[0]) * ease; f.pos[1] += (f.target[1] - f.pos[1]) * ease;
  f.vel = [(f.pos[0] - f.prev[0]) / dt, (f.pos[1] - f.prev[1]) / dt];
  const tiltTarget = Math.max(-0.3, Math.min(0.3, f.vel[0] * 0.00045));
  f.tilt += (tiltTarget - f.tilt) * Math.min(1, dt * 7);
  f.depth += ((f.grabbed ? 0.35 : 0) - f.depth) * Math.min(1, dt * 6);
  stepNode(f.arm, f, torsoToWorld(f, ...f.def.arm.pivot), -f.tilt, dt, dt);
  stepNode(f.hips, f, torsoToWorld(f, ...f.def.hips.pivot), -f.tilt, dt, dt);
}

// ------------------------------------------------------------------ çizim
let W = 0; let H = 0; let dpr = 1; let screen = { x: 0, y: 0, w: 0, h: 0 };
const figs = [];
let gostAlpha = 1; let gostOn = true;

function layout() {
  const r = canvas.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2);
  const oldS = S; const old = { ...screen };
  W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const bar = $('.controls').getBoundingClientRect();
  const bottom = Math.min(H, bar.top) - 14; const m = Math.max(12, W * 0.035);
  screen = { x: m, y: Math.max(12, H * 0.03), w: W - 2 * m, h: bottom - Math.max(12, H * 0.03) };
  S = Math.max(1.2, Math.min(screen.h / 215, screen.w / 150));
  const groundY = screen.y + screen.h - 52 * S;
  if (!figs.length) {
    figs.push(makeFigure('karagoz', screen.x + screen.w * 0.3, 1), makeFigure('hacivat', screen.x + screen.w * (W < 600 ? 0.72 : 0.62), -1));
    for (const f of figs) { f.pos[1] = f.target[1] = groundY; f.prev = [...f.pos]; }
  } else {
    // Boyut değişince figürler perdeye göre aynı yerde kalsın
    for (const f of figs) {
      const fx = (f.pos[0] - old.x) / old.w; f.pos = [screen.x + fx * screen.w, groundY]; f.target = [...f.pos]; f.prev = [...f.pos]; f.walk = null;
      for (const n of [f.arm, f.hips]) reset(n);
    }
  }
  if (oldS !== S) makeWeave();
}
function reset(n) { n.P = null; n.w = 0; for (const c of n.children) reset(c); }

let weave = null;
function makeWeave() {
  const c = document.createElement('canvas'); c.width = 6; c.height = 6; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 6, 6);
  g.fillStyle = 'rgba(120,90,50,0.10)'; g.fillRect(0, 0, 6, 1); g.fillRect(0, 0, 1, 6);
  g.fillStyle = 'rgba(120,90,50,0.05)'; g.fillRect(3, 0, 1, 6); g.fillRect(0, 3, 6, 1);
  weave = ctx.createPattern(c, 'repeat');
}

// Her tasvir kendi küçük katmanına beyaz zemin üstüne çizilir, sonra perdeye "çarpma" (multiply) ile basılır:
// arkadan ışık alan renkli derinin perdede bıraktığı iz.
const layers = new Map();
function layerFor(key, w, h) {
  let c = layers.get(key);
  if (!c) { c = document.createElement('canvas'); layers.set(key, c); }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return c;
}
function drawNode(g, n, f, order) {
  const d = n.def;
  const self = () => {
    g.save(); g.translate(n.P[0], n.P[1]); g.rotate(-n.a); g.scale(f.s * S, S);
    drawPart(g, d.poly, d.color, d.extras); g.restore();
  };
  const seq = d.drawOrder || ['self', ...n.children.map((_, i) => i)];
  for (const s of seq) { if (s === 'self') self(); else drawNode(g, n.children[s], f, order); }
}
function drawFigure(g, f) {
  drawNode(g, f.hips, f);
  g.save(); g.translate(f.pos[0], f.pos[1]); g.rotate(f.tilt); g.scale(f.s * S, S);
  drawPart(g, f.def.torso.poly, f.def.torso.color, f.def.torso.extras); g.restore();
  drawNode(g, f.arm, f);
  // Çubuk (değnek): perdeye dik tutulduğu için yalnızca bağlandığı noktada küçük bir gölge
  const [cx, cy] = torsoToWorld(f, 0, -30);
  g.fillStyle = 'rgba(40,25,15,0.55)'; g.beginPath(); g.arc(cx, cy, 2.2 * S, 0, Math.PI * 2); g.fill();
}
function stamp(key, box, drawFn, depth, alpha = 1) {
  // box: perdedeki CSS koordinatları (x, y, w, h)
  const pad = 20; const w = Math.ceil((box.w + pad * 2) * dpr); const h = Math.ceil((box.h + pad * 2) * dpr);
  const c = layerFor(key, w, h); const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  g.setTransform(dpr, 0, 0, dpr, (pad - box.x) * dpr, (pad - box.y) * dpr);
  drawFn(g);
  // Perdeden uzaklaştıkça: gölge büyür, bulanıklaşır, renk solar
  const grow = 1 + depth * 0.14; const blur = depth * 9 * S / 2;
  const cx = box.x + box.w / 2; const cy = box.y + box.h / 2;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.beginPath(); ctx.rect(screen.x, screen.y, screen.w, screen.h); ctx.clip();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = alpha * (1 - depth * 0.45);
  if (blur > 0.3) ctx.filter = `blur(${blur.toFixed(1)}px)`;
  const dw = (box.w + pad * 2) * grow; const dh = (box.h + pad * 2) * grow;
  ctx.drawImage(c, cx - dw / 2, cy - dh / 2, dw, dh);
  ctx.restore();
}
function figBox(f) {
  // Kol yukarı savrulsa da sığacak kadar geniş kutu
  return { x: f.pos[0] - 70 * S, y: f.pos[1] - 112 * S, w: 140 * S, h: 175 * S };
}

let flick = 1; let lampLevel = 0.8; let baseDepth = 0;
function drawScene(t) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; ctx.globalAlpha = 1;
  ctx.fillStyle = '#0e0907'; ctx.fillRect(0, 0, W, H);
  // Kandil: perdenin arkasında, aşağıda; ışık titrer
  if (!reduced) flick = 0.93 + 0.05 * Math.sin(t * 7.3) + 0.03 * Math.sin(t * 13.1 + 1) + 0.02 * Math.sin(t * 2.1);
  const L = lampLevel * flick;
  const { x, y, w, h } = screen;
  const grad = ctx.createRadialGradient(x + w * 0.5, y + h * 1.05, h * 0.1, x + w * 0.5, y + h * 0.75, Math.max(w, h) * 0.85);
  const c0 = `rgb(${Math.round(255 * Math.min(1, 0.55 + L * 0.5))},${Math.round(236 * Math.min(1, 0.45 + L * 0.55))},${Math.round(180 * Math.min(1, 0.3 + L * 0.6))})`;
  grad.addColorStop(0, c0); grad.addColorStop(0.55, `rgba(${Math.round(225 * L)},${Math.round(180 * L)},${Math.round(110 * L)},1)`); grad.addColorStop(1, `rgb(${Math.round(90 * L)},${Math.round(55 * L)},${Math.round(30 * L)})`);
  ctx.fillStyle = grad; ctx.fillRect(x, y, w, h);
  // Dekor ve göstermelik
  // Dar perdede ağaç küçülür ki tasvirlerin üstüne binmesin
  const ts = S * Math.min(1, screen.w / 900);
  const treeBox = { x: x + w - 70 * ts, y: y + h - 160 * ts, w: 80 * ts, h: 160 * ts };
  stamp('tree', treeBox, (g) => { g.save(); g.translate(x + w - 34 * ts, y + h); g.scale(ts, ts); g.lineWidth = 1.1; g.strokeStyle = OUT; for (const sh of TREE) drawShape(g, sh); for (const sh of TREE) if (sh.type === 'circle') for (const [hx, hy] of perfCircle(sh)) { g.fillStyle = 'rgba(255,248,232,0.9)'; g.beginPath(); g.arc(hx, hy, 0.9, 0, Math.PI * 2); g.fill(); } g.restore(); }, 0.05);
  if (gostAlpha > 0.01) {
    const gs = S * 1.05; const gb = { x: x + w / 2 - 50 * gs, y: y + h * 0.5 - 100 * gs, w: 100 * gs, h: 190 * gs };
    stamp('gost', gb, (g) => { g.save(); g.translate(x + w / 2, y + h * 0.5 + 85 * gs); g.scale(gs, gs); g.lineWidth = 1.1; g.strokeStyle = OUT; for (const sh of GOSTERMELIK) drawShape(g, sh); for (const sh of GOSTERMELIK) if (sh.type === 'poly' && sh.pts.length > 6) for (const [hx, hy] of holesOf(sh.pts)) { g.fillStyle = 'rgba(255,248,232,0.9)'; g.beginPath(); g.arc(hx, hy, 0.9, 0, Math.PI * 2); g.fill(); } g.restore(); }, 0, gostAlpha);
  }
  // Göstermelik perdedeyken tasvirler sahnede değildir; kalkınca belirirler
  const figAlpha = 1 - gostAlpha;
  if (figAlpha > 0.01) for (const f of figs) stamp(f.key, figBox(f), (g) => drawFigure(g, f), Math.min(1, f.depth + baseDepth), figAlpha);
  // Bez dokusu
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = weave; ctx.fillRect(x, y, w, h); ctx.restore();
  // Çerçeve
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const fw = Math.max(8, S * 6);
  ctx.lineWidth = fw; ctx.strokeStyle = '#3b2415'; ctx.strokeRect(x - fw / 2, y - fw / 2, w + fw, h + fw);
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(214,160,90,0.35)'; ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
  const vig = ctx.createLinearGradient(0, y, 0, y + h); vig.addColorStop(0, 'rgba(0,0,0,0.22)'); vig.addColorStop(0.2, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = vig; ctx.fillRect(x, y, w, h);
}
const circCache = new WeakMap();
function perfCircle(sh) {
  if (!circCache.has(sh)) { const out = []; const n = Math.floor((Math.PI * 2 * (sh.r - 3)) / 4.4); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push([sh.x + Math.cos(a) * (sh.r - 3), sh.y + Math.sin(a) * (sh.r - 3)]); } circCache.set(sh, out); }
  return circCache.get(sh);
}

// ------------------------------------------------------------------ döngü
let last = performance.now(); let time = 0; let raf = 0;
function frame(now) {
  raf = 0;
  const dt = Math.min(1 / 30, Math.max(1 / 240, (now - last) / 1000)); last = now; time += dt;
  for (const f of figs) stepFigure(f, dt);
  // Doğrusal geçiş: belirli bir sürede kesin olarak biter (yaklaşık 0,7 sn)
  const goal = gostOn ? 1 : 0; gostAlpha = reduced ? goal : gostAlpha + Math.sign(goal - gostAlpha) * Math.min(Math.abs(goal - gostAlpha), dt * 1.5);
  drawScene(time);
  if (!document.hidden) raf = requestAnimationFrame(frame);
}
function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });

// ------------------------------------------------------------------ etkileşim
let selected = 0; const grabs = new Map();
function hit(px, py) {
  let best = -1; let bd = Infinity;
  figs.forEach((f, i) => {
    const dx = (px - f.pos[0]) / S; const dy = (py - f.pos[1]) / S;
    if (Math.abs(dx) < 22 && dy > -100 && dy < 50) { const d = Math.hypot(dx, dy + 30); if (d < bd) { bd = d; best = i; } }
  });
  return best;
}
canvas.addEventListener('pointerdown', (e) => {
  const r = canvas.getBoundingClientRect(); const px = e.clientX - r.left; const py = e.clientY - r.top;
  if (gostOn) { setGost(false); return; }
  const i = hit(px, py); if (i < 0) return;
  canvas.setPointerCapture(e.pointerId);
  const f = figs[i]; f.walk = null; f.grabbed = true; selected = i;
  grabs.set(e.pointerId, { f, off: [f.pos[0] - px, f.pos[1] - py] });
  ui.hint.classList.add('gone'); canvas.style.cursor = 'grabbing';
});
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect(); const px = e.clientX - r.left; const py = e.clientY - r.top;
  const gr = grabs.get(e.pointerId);
  if (!gr) { canvas.style.cursor = hit(px, py) >= 0 ? 'grab' : 'default'; return; }
  const f = gr.f;
  f.target[0] = Math.max(screen.x + 10 * S, Math.min(screen.x + screen.w - 10 * S, px + gr.off[0]));
  f.target[1] = Math.max(screen.y + 100 * S, Math.min(screen.y + screen.h + 30 * S, py + gr.off[1]));
  // Ters yöne hızlı çekilince figür döner (oynatıcının çubuğu çevirmesi gibi)
  if (Math.abs(e.movementX) > 18 && Math.sign(e.movementX) !== f.s) flip(f, false);
});
const release = (e) => { const gr = grabs.get(e.pointerId); if (!gr) return; gr.f.grabbed = false; grabs.delete(e.pointerId); canvas.style.cursor = 'grab'; };
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('dblclick', (e) => { const r = canvas.getBoundingClientRect(); const i = hit(e.clientX - r.left, e.clientY - r.top); if (i >= 0) flip(figs[i]); });

function flip(f, announce = true) {
  f.s *= -1;
  for (const n of [f.arm, f.hips]) mirrorNode(n);
  if (announce) say(`${f.name} ${f.s > 0 ? 'sağa' : 'sola'} döndü.`);
}
function mirrorNode(n) { n.a = -n.a; n.w = -n.w; for (const c of n.children) mirrorNode(c); }

function walk(f) {
  const groundY = screen.y + screen.h - 52 * S;
  const left = screen.x + screen.w * 0.18; const right = screen.x + screen.w * 0.72;
  const to = f.pos[0] < screen.x + screen.w / 2 ? right : left;
  if (Math.sign(to - f.pos[0]) !== f.s) flip(f, false);
  f.walk = { from: f.pos[0], to, y: groundY, t: 0, dur: reduced ? 0.01 : Math.abs(to - f.pos[0]) / (90 * S) };
  if (gostOn) setGost(false);
  say(`${f.name} yürüyor.`);
}

canvas.addEventListener('keydown', (e) => {
  const f = figs[selected];
  if (gostOn && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setGost(false); return; }
  if (e.key === '1' || e.key === '2') { selected = +e.key - 1; say(`${figs[selected].name} seçildi.`); return; }
  const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (mv) {
    e.preventDefault(); f.walk = null;
    f.target[0] = Math.max(screen.x + 10 * S, Math.min(screen.x + screen.w - 10 * S, f.target[0] + mv[0] * 24 * S));
    f.target[1] = Math.max(screen.y + 100 * S, Math.min(screen.y + screen.h + 30 * S, f.target[1] + mv[1] * 14 * S));
    if (mv[0] && Math.sign(mv[0]) !== f.s) flip(f, false);
  } else if (e.key === ' ') { e.preventDefault(); flip(f); }
  else if (e.key === 'w' || e.key === 'W' || e.key === 'Enter') { e.preventDefault(); walk(f); }
});

let hintTimer = 0;
function setGost(on) {
  gostOn = on; ui.gost.setAttribute('aria-pressed', String(on));
  if (!on) { ui.hint.textContent = 'Tasviri tut ve sürükle: kolu, bacakları sallanır. Çift tıkla: döner.'; ui.hint.classList.remove('gone'); clearTimeout(hintTimer); hintTimer = setTimeout(() => ui.hint.classList.add('gone'), 8000); }
  say(on ? 'Göstermelik perdede; tasvirler çekildi.' : 'Göstermelik kalktı; oyun başlıyor.');
}
ui.gost.addEventListener('click', () => setGost(!gostOn));
ui.walkK.addEventListener('click', () => walk(figs[0]));
ui.walkH.addEventListener('click', () => walk(figs[1]));
ui.flipK.addEventListener('click', () => flip(figs[0]));
ui.flipH.addEventListener('click', () => flip(figs[1]));
ui.depth.addEventListener('input', () => { baseDepth = ui.depth.value / 100; });
ui.depth.addEventListener('change', () => say(baseDepth > 0.4 ? 'Tasvirler perdeden uzak: gölgeler büyük ve bulanık.' : 'Tasvirler perdeye yakın: gölgeler keskin.'));
ui.lamp.addEventListener('input', () => { lampLevel = 0.35 + (ui.lamp.value / 100) * 0.65; });

let sayTimer = 0;
function say(text) { ui.status.textContent = text; clearTimeout(sayTimer); sayTimer = setTimeout(() => { if (ui.status.textContent === text) ui.status.textContent = ''; }, 4000); }

new ResizeObserver(() => { layout(); start(); }).observe(canvas);
lampLevel = 0.35 + (ui.lamp.value / 100) * 0.65;
layout(); makeWeave(); start();

// Test ve ölçüm için salt okunur durum
window.karagoz = Object.freeze({
  stats: () => ({ figures: figs.map((f) => ({ name: f.name, x: Math.round(f.pos[0]), facing: f.s, arm: +f.arm.a.toFixed(3), walking: !!f.walk, depth: +f.depth.toFixed(2) })), gost: gostOn, S: +S.toFixed(2) }),
  shake: (i = 0) => { const f = figs[i]; f.target[0] += 120 * S; setTimeout(() => { f.target[0] -= 120 * S; }, 180); },
});
