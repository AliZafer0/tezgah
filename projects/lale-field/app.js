// Lale — kamera, rüzgâr esintileri, basılı tutunca açılma, renk aileleri ve uyarlanabilir kalite.
import { layoutTulips, buildField, PALETTES } from './tulip.js';
import { createRenderer, MAX_TULIPS } from './renderer.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#scene');
const ui = {
  open: $('#open'), breeze: $('#breeze'), pals: [...document.querySelectorAll('input[name="pal"]')],
  pause: $('#pause'), hint: $('#hint'), note: $('#note'), fallback: $('#fallback'), status: $('#status'),
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = Math.min(innerWidth, innerHeight) < 700 || (navigator.hardwareConcurrency || 4) <= 4;

let renderer = null;
try { renderer = createRenderer(canvas); } catch (err) { console.warn('WebGL2 başlatılamadı:', err.message); renderer = null; }
if (!renderer) {
  canvas.hidden = true; $('#controls').hidden = true; ui.hint.hidden = true; ui.note.hidden = false;
  ui.fallback.src = 'cover.jpg'; ui.fallback.hidden = false;
  window.lale = Object.freeze({ stats: () => ({ webgl: false }) });
}

if (renderer) {

// ------------------------------------------------------------------ sahne
const tulips = layoutTulips(small ? 56 : MAX_TULIPS - 6, 7);
renderer.setGeometry(buildField(tulips, small ? 0.55 : 1));
const T = new Float32Array(MAX_TULIPS * 4); const O = new Float32Array(MAX_TULIPS * 4);
const open = new Float32Array(tulips.length); const target = new Float32Array(tulips.length);
const state = { baseline: 0.45, breeze: 0.35, palette: 'istanbul', paused: false, time: 0, yaw: 0 };

function applyPalette() {
  const pal = PALETTES[state.palette];
  tulips.forEach((t, i) => {
    const [h, s] = i === 0 ? pal[0] : pal[Math.floor(t.hue * pal.length) % pal.length];
    T[i * 4] = t.x; T[i * 4 + 1] = t.z; T[i * 4 + 2] = t.scale; T[i * 4 + 3] = (h + (t.hue - 0.5) * 0.025 + 1) % 1;
    O[i * 4 + 1] = t.phase; O[i * 4 + 2] = t.height; O[i * 4 + 3] = s;
  });
}
applyPalette();

// ------------------------------------------------------------------ kamera
const FOV = 42 * Math.PI / 180;
const cam = { eye: [0, 0, 0], target: [0, 1.25, -0.4], right: [1, 0, 0], up: [0, 1, 0], fwd: [0, 0, -1] };
const view = new Float32Array(16); const proj = new Float32Array(16);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function updateCamera(aspect) {
  const dist = aspect < 0.8 ? 6.4 : 4.6; const yaw = state.yaw + (reduced ? 0 : Math.sin(state.time * 0.05) * 0.22);
  cam.eye = [Math.sin(yaw) * dist, aspect < 0.8 ? 1.9 : 1.65, Math.cos(yaw) * dist];
  const f = norm(sub(cam.target, cam.eye)); const r = norm(cross(f, [0, 1, 0])); const u = cross(r, f);
  cam.fwd = f; cam.right = r; cam.up = u;
  view.set([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, cam.eye), -dot(u, cam.eye), dot(f, cam.eye), 1]);
  const t = 1 / Math.tan(FOV / 2); const n = 0.05; const fa = 60;
  proj.set([t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, (2 * fa * n) / (n - fa), 0]);
}
// Ekran noktası → zemin (y = 0)
function groundAt(px, py) {
  const r = canvas.getBoundingClientRect(); const aspect = r.width / r.height;
  const nx = ((px - r.left) / r.width) * 2 - 1; const ny = 1 - ((py - r.top) / r.height) * 2;
  const t = Math.tan(FOV / 2);
  const d = norm([0, 1, 2].map((i) => cam.fwd[i] + cam.right[i] * nx * t * aspect + cam.up[i] * ny * t));
  if (d[1] > -0.02) {
    // Ufkun üstü: en yakın lale sırasına izdüşür
    return [cam.eye[0] + d[0] * 6, cam.eye[2] + d[2] * 6];
  }
  const k = -cam.eye[1] / d[1];
  return [cam.eye[0] + d[0] * k, cam.eye[2] + d[2] * k];
}

// ------------------------------------------------------------------ esintiler ve açılma
const gusts = new Float32Array(16); let gustSlot = 0; let lastGust = 0;
function gust(x, z, strength) {
  gusts.set([x, z, state.time, strength], gustSlot * 4); gustSlot = (gustSlot + 1) % 4; lastGust = state.time;
}
let hold = null; let lastMove = null;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const [x, z] = groundAt(e.clientX, e.clientY);
  hold = { x, z }; gust(x, z, 0.5); hideHint();
});
canvas.addEventListener('pointermove', (e) => {
  const now = performance.now();
  if (lastMove) {
    const dt = Math.max(1, now - lastMove.t); const speed = Math.hypot(e.clientX - lastMove.x, e.clientY - lastMove.y) / dt;
    if (speed > 0.6 && state.time - lastGust > 0.22) { const [x, z] = groundAt(e.clientX, e.clientY); gust(x, z, Math.min(1.4, speed * 0.6)); }
  }
  lastMove = { x: e.clientX, y: e.clientY, t: now };
  if (hold) { const [x, z] = groundAt(e.clientX, e.clientY); hold.x = x; hold.z = z; }
});
const release = () => { if (hold) say('Laleler yavaşça kapanıyor.'); hold = null; };
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerleave', () => { lastMove = null; });

canvas.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); state.yaw += e.key === 'ArrowLeft' ? -0.12 : 0.12; }
  else if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    if (hold) release(); else { hold = { x: 0, z: 0, all: true }; say('Bütün tarla açıyor. Kapatmak için yeniden boşluk.'); }
  } else if (e.key === 'w' || e.key === 'W') { gust(0, 2.5, 1.2); say('Bir rüzgâr esti.'); }
});

function stepOpen(dt) {
  for (let i = 0; i < tulips.length; i++) {
    let t = state.baseline;
    if (hold) {
      const d = hold.all ? 0 : Math.hypot(tulips[i].x - hold.x, tulips[i].z - hold.z);
      t = Math.max(t, 1 - Math.min(1, Math.max(0, (d - 0.6) / 1.4)));
    }
    target[i] = t;
    const rate = target[i] > open[i] ? 1.6 : 0.5;
    open[i] = reduced ? target[i] : open[i] + (target[i] - open[i]) * Math.min(1, dt * rate);
    O[i * 4] = open[i];
  }
}

// ------------------------------------------------------------------ döngü ve kalite
let dpr = Math.min(devicePixelRatio || 1, small ? 1.5 : 1.75);
function resize() {
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
}
new ResizeObserver(resize).observe(canvas); resize();

let last = performance.now(); let raf = 0; let slow = 0; let frames = 0;
function frame(now) {
  raf = 0;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!state.paused) state.time += dt;
  stepOpen(dt);
  const aspect = canvas.width / canvas.height;
  updateCamera(aspect);
  renderer.draw({
    view, proj, time: state.time, px: canvas.height / (2 * Math.tan(FOV / 2)), aspect,
    breeze: state.breeze, motion: reduced || state.paused ? 0 : 1, gusts, T, O, exposure: 1,
  });
  // Uyarlanabilir kalite: uzun süre yavaşsa piksel oranını düşür
  frames++;
  if (dt > 0.034) slow++; else slow = Math.max(0, slow - 1);
  if (slow > 40 && dpr > 0.75) { dpr = Math.max(0.75, dpr * 0.8); resize(); slow = 0; }
  if (!document.hidden) raf = requestAnimationFrame(frame);
}
function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });

// ------------------------------------------------------------------ denetimler
ui.open.addEventListener('input', () => { state.baseline = ui.open.value / 100; });
ui.open.addEventListener('change', () => say(`Açılma yüzde ${ui.open.value}.`));
ui.breeze.addEventListener('input', () => { state.breeze = (ui.breeze.value / 100) * 1.1; });
ui.breeze.addEventListener('change', () => say(`Rüzgâr yüzde ${ui.breeze.value}.`));
for (const r of ui.pals) r.addEventListener('change', () => { state.palette = r.value; applyPalette(); say(`${r.parentElement.textContent.trim()} renkleri.`); });
ui.pause.addEventListener('click', () => {
  state.paused = !state.paused; ui.pause.setAttribute('aria-pressed', String(state.paused));
  ui.pause.textContent = state.paused ? 'Sürdür' : 'Duraklat';
  say(state.paused ? 'Tarla durdu.' : 'Tarla yeniden salınıyor.');
});
function hideHint() { ui.hint.classList.add('gone'); }
setTimeout(hideHint, 9000);
let sayTimer = 0;
function say(text) { ui.status.textContent = text; clearTimeout(sayTimer); sayTimer = setTimeout(() => { if (ui.status.textContent === text) ui.status.textContent = ''; }, 4000); }

// Açılış: tomurcuklar kapalı başlar, birkaç saniyede açar
if (reduced) { state.baseline = ui.open.value / 100; } else {
  const goal = ui.open.value / 100; state.baseline = 0;
  setTimeout(() => { state.baseline = goal; }, 600);
}
start();

// Test ve ölçüm için salt okunur durum
window.lale = Object.freeze({
  stats: () => ({ webgl: true, points: renderer.count, tulips: tulips.length, dpr, open: open[0], baseline: state.baseline, paused: state.paused, palette: state.palette, frames }),
});
}
