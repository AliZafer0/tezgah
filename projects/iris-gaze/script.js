// Iris — bakış davranışı, göz kırpma, kontroller ve tek çizim döngüsü.
import { createEyeRenderer } from './eye-renderer.js';

// Bakış birimi: x, y ∈ [-1, 1] → anatomik açı sınırları (radyan)
const YAW_MAX = 0.4;
const PITCH_MAX = 0.24;
const LEAVE_DELAY = 0.8; // imleç çıkınca merkeze dönmeden önce bekleme (sn)
const KEYBOARD_HOLD = 6; // klavyeyle yönlendirmeden sonra otomatik bakışın beklemesi (sn)

const root = document.documentElement;
const $ = (s) => document.querySelector(s);
const ui = {
  canvas: $('[data-canvas]'),
  lock: $('[data-action="lock"]'),
  pause: $('[data-action="pause"]'),
  pauseLabel: $('[data-pause-label]'),
  restart: $('[data-action="restart"]'),
  modeText: $('[data-mode-text]'),
  pausedText: $('[data-paused-text]'),
  hint: $('[data-hint]'),
  announce: $('[data-announce]'),
};
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
const still = new URLSearchParams(location.search).has('kapak');

// Rastgelelik: kontrollü, tekrar edilebilir değil ama sınırlı
const rand = (a, b) => a + Math.random() * (b - a);

const state = {
  mode: 'follow', // 'follow' | 'free'
  paused: false,
  t: 0, // etkin zaman (duraklatma ve gizli sekmede ilerlemez)
  gaze: { x: 0, y: 0 },
  vel: { x: 0, y: 0 },
  target: { x: 0, y: 0 },
  smoothTime: 0.16,
  maxSpeed: 5,
  pointer: { inside: false, leftAt: 0, x: 0, y: 0, fresh: false },
  keyboardUntil: -1,
  free: { phase: 'hold', until: 0, prev: { x: 0, y: 0 } },
  blink: { next: 0, start: -1, double: false },
  open: 1,
  frames: 0,
};

let renderer = null;
let raf = 0;
let last = 0;
let hintTimer = 0;
const cleanups = [];
const on = (t, type, fn, opts) => {
  t.addEventListener(type, fn, opts);
  cleanups.push(() => t.removeEventListener(type, fn, opts));
};

function announce(text) {
  ui.announce.textContent = '';
  requestAnimationFrame(() => { ui.announce.textContent = text; });
}

// ---------- Kare hızından bağımsız yumuşatma (kritik sönümlü yay) ----------
function smoothDamp(cur, target, vel, smoothTime, dt, maxSpeed) {
  const omega = 2 / Math.max(0.0001, smoothTime);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = cur - target;
  const maxChange = maxSpeed * smoothTime;
  change = Math.max(-maxChange, Math.min(maxChange, change));
  const t = cur - change;
  const temp = (vel + omega * change) * dt;
  let nv = (vel - omega * temp) * exp;
  let out = t + (change + temp) * exp;
  if ((target - cur > 0) === (out > target)) { out = target; nv = (out - target) / dt; }
  return [out, nv];
}

const clampToEllipse = (p) => {
  const len = Math.hypot(p.x, p.y);
  return len > 1 ? { x: p.x / len, y: p.y / len } : p;
};

// ---------- Serbest bakış: bekle → yeni hedef → yumuşak geçiş ----------
function pickFreeTarget(from) {
  for (let i = 0; i < 12; i++) {
    let c;
    if (Math.random() < 0.3) c = { x: rand(-0.22, 0.22), y: rand(-0.15, 0.15) }; // merkez yakını
    else c = { x: (Math.random() < 0.5 ? -1 : 1) * rand(0.35, 0.92), y: rand(-0.55, 0.5) };
    c = clampToEllipse(c);
    if (Math.hypot(c.x - from.x, c.y - from.y) >= 0.32) return c; // aynı noktaya yakın tekrar yok
  }
  return { x: -from.x * 0.6, y: rand(-0.3, 0.3) };
}

function updateFree() {
  const f = state.free;
  if (state.t < state.keyboardUntil) return; // klavye kullanılırken otomatikle yarışma
  if (f.phase === 'hold' && state.t >= f.until) {
    const next = pickFreeTarget(state.gaze);
    const duration = rand(1, 2.5);
    state.target = next;
    state.smoothTime = duration / 4; // kritik sönümlü yay ≈ 4τ'da yerleşir
    state.maxSpeed = 1.6;
    f.prev = next;
    f.phase = 'move';
    f.until = state.t + duration;
  } else if (f.phase === 'move' && state.t >= f.until) {
    f.phase = 'hold';
    f.until = state.t + rand(2, 5);
  }
}

function updateFollow() {
  const p = state.pointer;
  if (state.t < state.keyboardUntil && !p.fresh) return;
  if (p.inside) {
    state.target = { x: p.x, y: p.y };
  } else if (state.t - p.leftAt > LEAVE_DELAY) {
    state.target = { x: 0, y: 0 };
  }
  state.smoothTime = 0.16;
  state.maxSpeed = 4.5; // ani imleç sıçramalarında göz sertçe atlamaz
}

// ---------- Göz kırpma: değişken aralık, hızlı kapanış, yavaş açılış ----------
function scheduleBlink(from) {
  state.blink.next = from + (Math.random() < 0.15 ? rand(0.35, 0.6) : rand(3.2, 8.5));
}

function updateBlink() {
  const b = state.blink;
  if (b.start < 0 && state.t >= b.next) b.start = state.t;
  if (b.start >= 0) {
    const k = state.t - b.start;
    const close = 0.09;
    const hold = 0.04;
    const openDur = 0.2;
    if (k < close) state.open = 1 - (k / close) ** 2;
    else if (k < close + hold) state.open = 0;
    else if (k < close + hold + openDur) state.open = 1 - (1 - (k - close - hold) / openDur) ** 2;
    else {
      state.open = 1;
      b.start = -1;
      scheduleBlink(state.t);
    }
  }
}

function update(dt) {
  state.t += dt;
  if (state.mode === 'free') updateFree();
  else updateFollow();
  const [x, vx] = smoothDamp(state.gaze.x, state.target.x, state.vel.x, state.smoothTime, dt, state.maxSpeed);
  const [y, vy] = smoothDamp(state.gaze.y, state.target.y, state.vel.y, state.smoothTime, dt, state.maxSpeed);
  state.gaze = { x, y };
  state.vel = { x: vx, y: vy };
  updateBlink();
}

function draw() {
  renderer.draw({
    gaze: [state.gaze.x * YAW_MAX, state.gaze.y * PITCH_MAX],
    open: state.open,
    pupil: 0.31 + 0.012 * Math.sin(state.t * 0.21) + 0.006 * Math.sin(state.t * 0.13 + 1.7),
    time: state.t,
  });
}

function frame(now) {
  raf = 0;
  if (!renderer) return;
  // Gizli sekmeden dönüşte geçen süre sıçrama olarak uygulanmaz
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
  last = now;
  if (!state.paused) update(dt);
  draw();
  state.frames++;
  if (!state.paused && document.visibilityState === 'visible') raf = requestAnimationFrame(frame);
}

/** Tek döngü: zaten çalışıyorsa yeni döngü açılmaz. */
function kick() {
  if (raf || !renderer || document.visibilityState !== 'visible') return;
  last = 0;
  raf = requestAnimationFrame(frame);
}

// ---------- Kontroller ----------
function syncUI() {
  const locked = state.mode === 'free';
  ui.lock.setAttribute('aria-pressed', String(locked));
  root.dataset.gaze = state.mode;
  ui.modeText.textContent = locked ? 'Serbest bakış' : 'İmleç takibi';
  ui.pausedText.hidden = !state.paused;
  ui.pauseLabel.textContent = state.paused ? 'Sürdür' : 'Hareketi duraklat';
  ui.pause.querySelector('[data-icon="pause"]').toggleAttribute('hidden', state.paused);
  ui.pause.querySelector('[data-icon="play"]').toggleAttribute('hidden', !state.paused);
}

function hideHint() {
  clearTimeout(hintTimer);
  ui.hint.classList.add('is-gone');
}

function setMode(mode) {
  state.mode = mode;
  if (mode === 'free') {
    // Mevcut bakıştan devam: önce kısa bir bekleme, sonra yeni hedef
    state.target = { ...state.gaze };
    state.free = { phase: 'hold', until: state.t + rand(0.8, 1.6), prev: { ...state.gaze } };
  } else {
    // İmlece yumuşak dönüş: hız korunur, hedef imleç (ya da merkez)
    state.pointer.fresh = true;
    state.smoothTime = 0.3;
  }
  syncUI();
  announce(mode === 'free' ? 'Serbest bakış' : 'İmleç takibi');
  kick();
}

function setPaused(paused) {
  state.paused = paused;
  syncUI();
  announce(paused ? 'Hareket duraklatıldı' : 'Hareket sürüyor');
  if (paused) {
    cancelAnimationFrame(raf);
    raf = 0;
    draw();
  } else kick();
}

function restart() {
  state.mode = 'follow';
  state.paused = reducedQuery.matches; // varsayılan: hareket azaltma tercihinde durağan
  state.gaze = { x: 0, y: 0 };
  state.vel = { x: 0, y: 0 };
  state.target = { x: 0, y: 0 };
  state.keyboardUntil = -1;
  state.open = 1;
  state.blink = { next: 0, start: -1, double: false };
  scheduleBlink(state.t);
  syncUI();
  announce('Baştan başlatıldı: imleç takibi');
  if (state.paused) draw();
  else kick();
}

// ---------- Girdi ----------
function pointerToGaze(e) {
  const rect = ui.canvas.getBoundingClientRect();
  const box = renderer.eyeBox();
  const x = (e.clientX - rect.left - box.cx) / (box.unit * 1.1);
  const y = -(e.clientY - rect.top - box.cy) / (box.unit * 0.75);
  // Uçlara doğru yumuşak doyum: imleç ne kadar uzakta olursa olsun sınır aşılmaz
  return clampToEllipse({ x: Math.tanh(x * 1.2), y: Math.tanh(y * 1.2) });
}

function bind() {
  on(ui.canvas, 'pointermove', (e) => {
    const g = pointerToGaze(e);
    Object.assign(state.pointer, { inside: true, x: g.x, y: g.y, fresh: true });
    if (e.pointerType !== 'touch' || e.buttons) hideHint();
  });
  on(ui.canvas, 'pointerdown', (e) => {
    const g = pointerToGaze(e);
    Object.assign(state.pointer, { inside: true, x: g.x, y: g.y, fresh: true });
    hideHint();
    try { ui.canvas.setPointerCapture(e.pointerId); } catch { /* sentetik */ }
  });
  const leave = (e) => {
    if (e.type === 'pointerup' && e.pointerType === 'mouse') return;
    state.pointer.inside = false;
    state.pointer.leftAt = state.t;
  };
  on(ui.canvas, 'pointerleave', leave);
  on(ui.canvas, 'pointercancel', leave);
  on(ui.canvas, 'pointerup', leave);

  on(ui.canvas, 'keydown', (e) => {
    const step = 0.18;
    const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const m = map[e.key];
    if (!m) return;
    e.preventDefault();
    hideHint();
    const base = state.t < state.keyboardUntil ? state.target : state.gaze;
    state.target = clampToEllipse({ x: base.x + m[0], y: base.y + m[1] });
    state.smoothTime = 0.25;
    state.maxSpeed = 3;
    state.keyboardUntil = state.t + KEYBOARD_HOLD;
    state.pointer.fresh = false;
    if (state.mode === 'free') state.free = { phase: 'hold', until: state.keyboardUntil + rand(1, 2), prev: state.target };
    if (state.paused) {
      // Duraklatılmışken klavye bakışı doğrudan yerleştirir (otomatik hareket yok)
      state.gaze = { ...state.target };
      draw();
    } else kick();
  });

  on(ui.lock, 'click', () => setMode(state.mode === 'follow' ? 'free' : 'follow'));
  on(ui.pause, 'click', () => setPaused(!state.paused));
  on(ui.restart, 'click', restart);
  // Kontroller sahnenin parçası değildir: üzerlerindeki işaretçi hareketi bakış hedefi üretmez
  on($('[data-controls]'), 'pointermove', (e) => e.stopPropagation());

  on(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') kick();
    else {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  });
  on(reducedQuery, 'change', () => {
    if (reducedQuery.matches && !state.paused) setPaused(true);
  });
  const ro = new ResizeObserver(() => {
    if (renderer?.resize()) {
      if (state.paused || !raf) draw();
    }
  });
  ro.observe(ui.canvas);
  cleanups.push(() => ro.disconnect());
  on(window, 'orientationchange', () => { if (renderer?.resize()) draw(); });
  on(window, 'pagehide', (e) => { if (!e.persisted) dispose(); });
}

function dispose() {
  cancelAnimationFrame(raf);
  raf = 0;
  clearTimeout(hintTimer);
  for (const c of cleanups.splice(0)) c();
  renderer?.dispose();
  renderer = null;
}

function showFallback() {
  root.dataset.mode = 'fallback';
  const pic = $('[data-fallback]');
  for (const el of pic.querySelectorAll('[data-srcset]')) el.srcset = el.dataset.srcset;
  for (const el of pic.querySelectorAll('[data-src]')) el.src = el.dataset.src;
  pic.hidden = false;
  $('[data-fallback-note]').hidden = still;
}

function start() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 600;
  try {
    renderer = createEyeRenderer(ui.canvas, {
      dprCap: coarse || small ? 1.5 : 2,
      cellCss: small ? [5.2, 8.4] : [5.6, 9],
      onLost() {
        dispose();
        showFallback();
      },
    });
  } catch (err) {
    console.info('Iris: WebGL2 başlatılamadı, durağan görüntü gösteriliyor.', err.message);
    showFallback();
    return;
  }
  root.dataset.mode = 'webgl';
  scheduleBlink(0);
  if (still) {
    root.dataset.still = '';
    state.paused = true;
    state.t = 4.2;
  } else {
    state.paused = reducedQuery.matches; // hareket azaltma: sabit göz, kullanıcı açarsa hareket
    hintTimer = setTimeout(hideHint, 9000);
  }
  syncUI();
  bind();
  if (state.paused) draw();
  else kick();

  // Testler ve hata ayıklama için salt okunur durum
  window.iris = {
    state: () => ({
      mode: state.mode, paused: state.paused, t: state.t, gaze: { ...state.gaze }, target: { ...state.target },
      open: state.open, frames: state.frames, loop: raf ? 'running' : 'idle', freePhase: state.free.phase,
      ...renderer?.stats(),
    }),
  };
}

start();
