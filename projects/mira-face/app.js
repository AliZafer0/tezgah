// Mira — merkezi yüz durumu, ifade karışımı, bakış, kırpma ve tek çizim döngüsü.
import { createFaceRenderer } from './face-renderer.js';

const $ = (s) => document.querySelector(s);
const ui = {
  canvas: $('#face'),
  area: $('.face-area'),
  fallback: $('#fallback'),
  note: $('#note'),
  exprs: [...document.querySelectorAll('input[name="expr"]')],
  intensity: $('#intensity'),
  intensityOut: $('#intensity-out'),
  track: $('#track'),
  pause: $('#pause'),
  quality: $('#quality'),
  reset: $('#reset'),
  announce: $('#announce'),
};

const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const coarse = window.matchMedia('(pointer: coarse)').matches;

// ------------------------------------------------------------------ rig
// Ortak parametreler ve güvenli aralıkları: hiçbir kombinasyon yüzü bozmasın
const PARAMS = ['jaw', 'smile', 'narrow', 'browL', 'browR', 'browIn', 'cheek', 'lidU', 'lidL', 'roll', 'pitchX'];
const LIMITS = {
  jaw: [0, 0.6], smile: [0, 0.9], narrow: [0, 0.5], browL: [-0.2, 1], browR: [-0.2, 1], browIn: [0, 0.6],
  cheek: [0, 0.6], lidU: [0.55, 1.22], lidL: [0, 0.45], roll: [-0.09, 0.09], pitchX: [-0.06, 0.06],
};
const NEUTRAL = { jaw: 0, smile: 0, narrow: 0, browL: 0, browR: 0, browIn: 0, cheek: 0, lidU: 1, lidL: 0.05, roll: 0, pitchX: 0 };
const EXPRESSIONS = {
  neutral: { label: 'Nötr', p: {} },
  smile: { label: 'Hafif tebessüm', p: { smile: 0.72, cheek: 0.42, lidU: 0.9, lidL: 0.3, browL: 0.04, browR: 0.04, jaw: 0.02 } },
  curious: { label: 'Merak', p: { browL: 0.55, browR: 0.12, browIn: 0.08, lidU: 1.12, roll: -0.065, pitchX: 0.02, smile: 0.1, narrow: 0.08 } },
  surprise: { label: 'Şaşkınlık', p: { browL: 0.9, browR: 0.9, lidU: 1.2, lidL: 0, jaw: 0.55, narrow: 0.5 } },
};

const clampP = (k, v) => Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], v));

// İkinci dereceden kritik sönümlü yay: %90'a ≈ 0,65 sn, tam yerleşme ≈ 1 sn; aşmaz
const OMEGA = 6;
const cur = {}; const vel = {}; const target = {};
for (const k of PARAMS) { cur[k] = NEUTRAL[k]; vel[k] = 0; target[k] = NEUTRAL[k]; }

const state = {
  expr: 'neutral',
  intensity: 0.7,
  locked: false,
  paused: false,
  quality: 'balanced',
  reduced: reducedQuery.matches,
};

function setTargets() {
  const preset = EXPRESSIONS[state.expr].p;
  for (const k of PARAMS) {
    const full = preset[k] ?? NEUTRAL[k];
    target[k] = clampP(k, NEUTRAL[k] + (full - NEUTRAL[k]) * state.intensity);
  }
}

// ------------------------------------------------------------------ bakış, baş, kırpma
const gaze = {
  tx: 0, ty: 0.15,        // hedef (yüz birimi, izleyici düzleminde)
  x: 0, y: 0.15,          // gözlerin şu anki odak noktası
  hx: 0, hy: 0,           // başın izlediği yumuşatılmış nokta
  pointer: false, lastPointer: 0,
  nextAuto: 0,
};
const blink = { value: 0, t: -1, next: 2.5, double: false };
let simTime = 0;

const rand = (a, b) => a + Math.random() * (b - a);

function scheduleBlink() { blink.next = simTime + rand(2.8, 6.5); }

function updateBlink(dt) {
  if (blink.t < 0) {
    if (simTime >= blink.next) { blink.t = 0; blink.double = Math.random() < 0.12; }
    return;
  }
  blink.t += dt;
  const t = blink.t;
  // kapanma 70 ms, kısa bekleme, açılma 130 ms
  blink.value = t < 0.07 ? t / 0.07 : t < 0.1 ? 1 : t < 0.23 ? 1 - (t - 0.1) / 0.13 : 0;
  if (t >= 0.23) {
    blink.t = -1; blink.value = 0;
    if (blink.double) { blink.double = false; blink.next = simTime + 0.18; } else scheduleBlink();
  }
}

function updateGazeTarget() {
  if (!state.locked && gaze.pointer) return;
  // Kilitli ya da işaretçi yokken: birkaç saniyede bir yeni, sakin bir hedef
  if (simTime < gaze.nextAuto) return;
  const toViewer = Math.random() < 0.4;
  gaze.tx = toViewer ? rand(-0.1, 0.1) : rand(-1.3, 1.3);
  gaze.ty = toViewer ? rand(0.05, 0.2) : rand(-0.55, 0.75);
  gaze.nextAuto = simTime + rand(2.6, 5.4);
}

const VIEW_D = 3.4; // izleyici düzlemine uzaklık (yüz birimi)
const frame = {
  cx: 0, cy: 0, scale: 1, yaw: 0, pitch: 0, roll: 0,
  jaw: 0, smile: 0, narrow: 0, cheek: 0, browL: 0, browR: 0, browIn: 0,
  lidU: 1, lidL: 0, blink: 0, gLx: 0, gLy: 0, gRx: 0, gRy: 0, time: 0, glow: 0, flicker: 0,
};

let settled = false;

function step(dt) {
  simTime += dt;
  const instant = state.reduced;
  let moving = 0;
  for (const k of PARAMS) {
    if (instant) { cur[k] = target[k]; vel[k] = 0; continue; }
    const a = OMEGA * OMEGA * (target[k] - cur[k]) - 2 * OMEGA * vel[k];
    vel[k] += a * dt;
    cur[k] = clampP(k, cur[k] + vel[k] * dt);
    moving = Math.max(moving, Math.abs(vel[k]), Math.abs(target[k] - cur[k]) * 4);
  }

  if (!instant) {
    updateBlink(dt);
    updateGazeTarget();
    // Gözler hızlı (sakkad), baş çok daha yavaş ve küçük açıyla izler
    const ke = 1 - Math.exp(-dt / 0.06);
    const kh = 1 - Math.exp(-dt / 0.7);
    gaze.x += (gaze.tx - gaze.x) * ke; gaze.y += (gaze.ty - gaze.y) * ke;
    gaze.hx += (gaze.tx - gaze.hx) * kh; gaze.hy += (gaze.ty - gaze.hy) * kh;
    // Hızlı hareket: göz sıçraması. Başın yavaş kayması 15 FPS'te de akıcı görünür
    moving = Math.max(moving, Math.abs(gaze.tx - gaze.x) * 3, Math.abs(gaze.ty - gaze.y) * 3);
    if (gaze.pointer && !state.locked && simTime - gaze.lastPointer > 4) { gaze.pointer = false; gaze.nextAuto = simTime + 1.2; }
  } else {
    gaze.x = gaze.hx = 0; gaze.y = gaze.hy = 0.15; blink.value = 0;
  }
  settled = moving < 0.03 && blink.t < 0;

  // Çok düşük genlikli canlılık
  const micro = instant ? 0 : 1;
  const t = simTime;
  const mYaw = micro * 0.006 * Math.sin(t * 0.37 + 1.1);
  const mPitch = micro * 0.005 * Math.sin(t * 0.29);

  frame.yaw = Math.max(-0.12, Math.min(0.12, Math.atan2(gaze.hx, VIEW_D) * 0.28)) + mYaw;
  frame.pitch = Math.max(-0.08, Math.min(0.08, Math.atan2(gaze.hy - 0.1, VIEW_D) * 0.22)) + cur.pitchX + mPitch;
  frame.roll = cur.roll + micro * 0.004 * Math.sin(t * 0.21);

  aimEyes();

  frame.jaw = cur.jaw; frame.smile = cur.smile; frame.narrow = cur.narrow; frame.cheek = cur.cheek;
  frame.browL = cur.browL; frame.browR = cur.browR; frame.browIn = cur.browIn;
  frame.lidU = cur.lidU; frame.lidL = cur.lidL; frame.blink = blink.value;
  frame.time = simTime;
}

// ------------------------------------------------------------------ kalite
// rows: yüz birimi başına karakter satırı. Hücre boyutu yüz ölçeğinden türetilir; böylece
// her ekranda yüz aynı oranda ve okunur kalır, toplam karakter sayısı ekranla ölçeklenir.
const QUALITY = {
  eco: { label: 'Ekonomik', rows: 26, dpr: 0.75, mobileDpr: 0.85, fps: 24, idleFps: 12, glow: 0, flicker: 0 },
  balanced: { label: 'Dengeli', rows: 33, dpr: 1.25, mobileDpr: 1.5, fps: 30, idleFps: 15, glow: 0, flicker: 1 },
  high: { label: 'Yüksek', rows: 41, dpr: 2, mobileDpr: 2, fps: 30, idleFps: 15, glow: 0.09, flicker: 1 },
};
const CELL_ASPECT = 0.7;
// Çalışma anı uyarlaması: sistem zorlanırsa seçilen düzey içinde kademeli hafifler.
// Ölçüt, rAF aralığının ekran yenileme aralığına oranıdır (yük arttıkça rAF gecikir).
// Kademeler: 1–2 çözünürlük ve hücre, 3 kare hızı yarıya.
const ADAPT = [
  { dpr: 1, cell: 1, fps: 1 },
  { dpr: 0.85, cell: 1.15, fps: 1 },
  { dpr: 0.72, cell: 1.3, fps: 1 },
  { dpr: 0.72, cell: 1.3, fps: 0.5 },
];
const adapt = { step: 0, rafR: 1, frameR: 1, badFor: 0, goodFor: 0, lastChange: 0, lastUp: -1e9, goodNeed: 15, display: 16.7, lastRaf: 0 };

// ------------------------------------------------------------------ yerleşim
let renderer = null;
let layoutDirty = true;
// Yazılımsal WebGL'de her kare CPU'da çizilir: varsayılan Ekonomik, kare hızları ⅔
let softwareGL = false;

function layout() {
  layoutDirty = false;
  if (!renderer) return;
  const q = QUALITY[state.quality];
  const small = coarse || window.innerWidth < 700;
  const dpr = Math.min(window.devicePixelRatio || 1, small ? q.mobileDpr : q.dpr) * ADAPT[adapt.step].dpr;
  const rect = ui.canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));

  // Yüz, kontrollerin dışında kalan alana sığar: saç tepesi 1,5 … boyun −1,6 yüz birimi
  const a = ui.area.getBoundingClientRect();
  const scale = Math.min(a.height / 3.1, a.width / 2.55);
  // Karakter satırı yüz ölçeğinden; çok küçük ya da iri glif olmasın diye CSS pikselde sınırlanır
  const cellCssH = Math.min(12, Math.max(4.2, scale / q.rows)) * ADAPT[adapt.step].cell;
  const cellH = Math.max(4, Math.round(cellCssH * dpr));
  const cellW = Math.max(3, Math.round(cellCssH * CELL_ASPECT * dpr));
  renderer.resize(w, h, cellW, cellH);
  frame.scale = scale * dpr;
  frame.cx = (a.left + a.width / 2 - rect.left) * dpr;
  frame.cy = (rect.bottom - (a.top + a.height / 2)) * dpr + 0.05 * scale * dpr;
  frame.glow = q.glow;
  frame.flicker = q.flicker;
}

// ------------------------------------------------------------------ döngü
let raf = 0;
let lastFrame = 0;
let lastSim = 0;
let visible = document.visibilityState === 'visible';
let inView = true;
let frames = 0;
let needsDraw = true;

const animating = () => !state.paused && !state.reduced && visible && inView && renderer;

function draw() {
  if (layoutDirty) layout();
  renderer.render(frame);
  frames++;
  needsDraw = false;
}

function loop(now) {
  raf = 0;
  if (!animating()) { if (needsDraw && renderer && visible) draw(); return; }
  const q = QUALITY[state.quality];
  const budget = 1000 / ((settled ? q.idleFps : q.fps) * ADAPT[adapt.step].fps * (softwareGL ? 0.67 : 1));
  const rafGap = now - adapt.lastRaf;
  adapt.lastRaf = now;
  if (rafGap > 0 && rafGap < 500) adapt.display = Math.max(6, Math.min(adapt.display * 1.0005, rafGap));
  if (rafGap > 0 && rafGap < 500) { adapt.rafR += (rafGap / adapt.display - adapt.rafR) * 0.08; watchLoad(now, rafGap / 1000); }
  if (now - lastFrame >= budget - 4) {
    // İstenen kare hızı tutturulamıyorsa bu da yük sayılır (durgunken 1'e doğru söner)
    const delivered = now - lastFrame < 500 ? (now - lastFrame) / budget : 1;
    adapt.frameR += ((settled ? 1 : delivered) - adapt.frameR) * 0.1;
    const dt = Math.min(0.1, (now - lastSim) / 1000);
    lastSim = now;
    step(dt);
    draw();
    lastFrame = now;
  }
  raf = requestAnimationFrame(loop);
}

// rAF aralığı ekran aralığını sürekli aşıyorsa hafifle; histerezisle (3 sn kötü / 15 sn iyi,
// değişimler arası en az 6 sn) geri yükselt. Ekran aralığı gözlenen en kısa aralıktan öğrenilir.
function watchLoad(now, dt) {
  const r = Math.max(adapt.rafR, adapt.frameR);
  if (r > 1.45) { adapt.badFor += dt; adapt.goodFor = 0; } else if (r < 1.15) { adapt.goodFor += dt; adapt.badFor = 0; }
  if (now - adapt.lastChange < 6000) return;
  if (adapt.badFor > 3 && adapt.step < ADAPT.length - 1) changed(1);
  else if (adapt.goodFor > adapt.goodNeed && adapt.step > 0) changed(-1);
  function changed(d) {
    // Yükseltmeden kısa süre sonra yine düşmek gerekiyorsa bir sonraki yükseltme daha geç gelir
    if (d > 0 && now - adapt.lastUp < 30000) adapt.goodNeed = Math.min(120, adapt.goodNeed * 2);
    if (d < 0) adapt.lastUp = now;
    adapt.step += d; adapt.lastChange = now; adapt.badFor = 0; adapt.goodFor = 0; adapt.rafR = 1; adapt.frameR = 1;
    if (ADAPT[adapt.step].dpr !== ADAPT[adapt.step - d].dpr || ADAPT[adapt.step].cell !== ADAPT[adapt.step - d].cell) layoutDirty = true;
  }
}

function kick() {
  if (raf || !renderer) return;
  adapt.lastRaf = 0; adapt.badFor = 0;
  lastFrame = performance.now() - 1000;
  lastSim = performance.now();
  raf = requestAnimationFrame(loop);
}

/** Durağan durumlarda (duraklatma, azaltılmış hareket) yalnızca gereken kareyi çiz. */
function requestDraw() {
  needsDraw = true;
  if (!animating()) {
    if (!state.paused) step(0);
    else snapParamsWhilePaused();
  }
  kick();
}

// Duraklatılmışken ifade değişirse yeni ifade anında uygulanır; bakış ve kırpma donuk kalır
function snapParamsWhilePaused() {
  for (const k of PARAMS) { cur[k] = target[k]; vel[k] = 0; }
  const keepTime = simTime;
  const keepBlink = blink.value;
  const saved = state.reduced;
  state.reduced = true;
  const gx = gaze.x; const gy = gaze.y; const hx = gaze.hx; const hy = gaze.hy;
  step(0);
  gaze.x = gx; gaze.y = gy; gaze.hx = hx; gaze.hy = hy;
  state.reduced = saved;
  simTime = keepTime;
  blink.value = keepBlink;
  frame.blink = keepBlink;
  frame.time = keepTime;
  recomputeGaze();
}

function recomputeGaze() {
  frame.yaw = Math.max(-0.12, Math.min(0.12, Math.atan2(gaze.hx, VIEW_D) * 0.28));
  frame.pitch = Math.max(-0.08, Math.min(0.08, Math.atan2(gaze.hy - 0.1, VIEW_D) * 0.22)) + cur.pitchX;
  frame.roll = cur.roll;
  aimEyes();
}

// İki göz aynı hedefe bakar: yön iki gözün orta noktasından hesaplanır, kırpılır ve
// yalnızca küçük sabit bir yakınsama eklenir; böylece kenarda bir göz sınıra takılıp
// diğerinden ayrışmaz (şaşılık yok). Baş dönüşü bakıştan çıkarılır.
const VERGENCE = 0.025;
function aimEyes() {
  const yaw = Math.max(-0.48, Math.min(0.48, Math.atan2(gaze.x, VIEW_D) - frame.yaw));
  const pitch = Math.max(-0.32, Math.min(0.32, Math.atan2(gaze.y - 0.105, VIEW_D) - frame.pitch));
  frame.gLx = yaw + VERGENCE; frame.gRx = yaw - VERGENCE;
  frame.gLy = pitch; frame.gRy = pitch;
}

// ------------------------------------------------------------------ arayüz
const cleanups = [];
const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); cleanups.push(() => el.removeEventListener(ev, fn, opt)); };

function announce(text) {
  ui.announce.textContent = '';
  requestAnimationFrame(() => { ui.announce.textContent = text; });
}

function syncControls() {
  ui.exprs.forEach((r) => { r.checked = r.value === state.expr; });
  ui.intensity.value = String(Math.round(state.intensity * 100));
  ui.intensityOut.textContent = `%${Math.round(state.intensity * 100)}`;
  ui.track.setAttribute('aria-pressed', String(state.locked));
  ui.track.textContent = state.locked ? 'Takibi aç' : 'Takibi kilitle';
  ui.pause.setAttribute('aria-pressed', String(state.paused));
  ui.pause.textContent = state.paused ? 'Sürdür' : 'Duraklat';
  ui.quality.value = state.quality;
}

function setExpression(name) {
  state.expr = name;
  setTargets();
  announce(`İfade: ${EXPRESSIONS[name].label}`);
  requestDraw();
}

function setPaused(p) {
  state.paused = p;
  syncControls();
  announce(p ? 'Duraklatıldı' : 'Sürüyor');
  if (!p) { lastSim = performance.now(); kick(); }
}

function setLocked(l) {
  state.locked = l;
  if (l) { gaze.pointer = false; gaze.nextAuto = simTime + 0.8; }
  syncControls();
  announce(l ? 'Takip kilitli; bakışlar kendiliğinden' : 'İmleç takibi açık');
  requestDraw();
}

function resetAll() {
  state.expr = 'neutral';
  state.intensity = 0.7;
  state.locked = state.reduced;
  state.paused = false;
  setTargets();
  gaze.tx = 0; gaze.ty = 0.15; gaze.pointer = false; gaze.nextAuto = simTime + 2;
  if (state.reduced) { gaze.x = gaze.hx = 0; gaze.y = gaze.hy = 0.15; }
  syncControls();
  announce('Sıfırlandı: nötr ifade');
  requestDraw();
}

for (const r of ui.exprs) on(r, 'change', () => { if (r.checked) setExpression(r.value); });
on(ui.intensity, 'input', () => {
  state.intensity = Number(ui.intensity.value) / 100;
  ui.intensityOut.textContent = `%${ui.intensity.value}`;
  setTargets();
  requestDraw();
});
on(ui.track, 'click', () => setLocked(!state.locked));
on(ui.pause, 'click', () => setPaused(!state.paused));
on(ui.quality, 'change', () => {
  state.quality = ui.quality.value;
  adapt.step = 0; adapt.rafR = 1; adapt.frameR = 1; adapt.badFor = 0; adapt.goodFor = 0;
  layoutDirty = true;
  announce(`Kalite: ${QUALITY[state.quality].label}`);
  requestDraw();
});
on(ui.reset, 'click', resetAll);

// İmleç sahnenin kendi koordinatlarına çevrilir (yüz birimi, izleyici düzlemi)
function onPointer(e) {
  if (state.locked || state.paused || state.reduced || !renderer) return;
  const rect = ui.canvas.getBoundingClientRect();
  const dpr = rect.width ? ui.canvas.width / rect.width : 1;
  const x = ((e.clientX - rect.left) * dpr - frame.cx) / frame.scale;
  const y = ((rect.bottom - e.clientY) * dpr - frame.cy) / frame.scale;
  gaze.tx = Math.max(-2.2, Math.min(2.2, x));
  gaze.ty = Math.max(-1.6, Math.min(1.8, y));
  gaze.pointer = true;
  gaze.lastPointer = simTime;
}
on(window, 'pointermove', onPointer, { passive: true });
on(window, 'pointerdown', onPointer, { passive: true });
on(document.documentElement, 'pointerleave', () => {
  if (state.locked || !gaze.pointer) return; // kilitliyken bağımsız bakış düzeni bozulmasın
  gaze.pointer = false; gaze.nextAuto = simTime + 0.6;
});

const onResize = () => { layoutDirty = true; requestDraw(); };
const ro = new ResizeObserver(() => { if (!layoutDirty) { layoutDirty = true; requestDraw(); } });
ro.observe(ui.canvas);
ro.observe(ui.area);
cleanups.push(() => ro.disconnect());
on(window, 'resize', onResize, { passive: true });

on(document, 'visibilitychange', () => {
  visible = document.visibilityState === 'visible';
  if (visible) kick();
});
// Galeri iframe'i ekran dışına kayınca çizim durur (hub'a dokunmadan, tarayıcının kendi bildirimiyle)
const io = new IntersectionObserver((entries) => {
  inView = entries.some((en) => en.isIntersecting);
  if (inView) kick();
});
io.observe(ui.canvas);
cleanups.push(() => io.disconnect());

on(reducedQuery, 'change', () => {
  state.reduced = reducedQuery.matches;
  if (state.reduced) { state.expr = 'neutral'; setTargets(); state.locked = true; }
  syncControls();
  requestDraw();
});

on(window, 'pagehide', () => {
  cancelAnimationFrame(raf);
  cleanups.forEach((fn) => fn());
  renderer?.dispose();
});

// ------------------------------------------------------------------ başlangıç
function showFallback(reason) {
  renderer?.dispose();
  renderer = null;
  ui.canvas.hidden = true;
  ui.fallback.hidden = false;
  ui.note.hidden = false;
  ui.note.textContent = reason;
  document.querySelector('.controls fieldset.live')?.setAttribute('disabled', '');
}

function start() {
  try {
    renderer = createFaceRenderer(ui.canvas, { onLost: () => showFallback('Grafik bağlamı kaybedildi; durağan portre gösteriliyor.') });
  } catch (err) {
    console.warn('Mira: WebGL başlatılamadı', err);
    renderer = null;
  }
  if (!renderer) {
    showFallback('Bu tarayıcıda WebGL2 kullanılamıyor; durağan portre gösteriliyor.');
    return;
  }
  softwareGL = renderer.software;
  if (softwareGL) state.quality = 'eco';
  if (state.reduced) state.locked = true;
  setTargets();
  scheduleBlink();
  gaze.nextAuto = 1.5;
  syncControls();
  step(0);
  requestDraw();
}

// Ölçüm için salt okunur bilgi (arayüzde gösterilmez)
window.mira = Object.freeze({
  stats: () => ({
    frames, quality: state.quality, adaptStep: adapt.step, settled,
    load: { raf: +adapt.rafR.toFixed(2), frame: +adapt.frameR.toFixed(2), display: +adapt.display.toFixed(1), bad: +adapt.badFor.toFixed(1) },
    paused: state.paused, locked: state.locked, reduced: state.reduced,
    running: !!raf, ...(renderer ? renderer.stats() : { cells: 0 }),
    // yüz yerleşimi CSS pikselinde (y aşağı): test, kontrollerin gözü/ağzı örtmediğini buradan doğrular
    face: (() => {
      const r = ui.canvas.getBoundingClientRect();
      const d = renderer && r.width ? ui.canvas.width / r.width : 1;
      return { cx: frame.cx / d + r.left, cy: r.bottom - frame.cy / d, scale: frame.scale / d };
    })(),
  }),
  state: () => ({
    expr: state.expr, intensity: state.intensity, params: { ...cur }, blink: blink.value,
    gaze: { L: [frame.gLx, frame.gLy], R: [frame.gRx, frame.gRy] }, pose: [frame.yaw, frame.pitch, frame.roll],
  }),
});

start();
