// Binary Bloom — durum, kontroller ve çizim döngüsü.
import { createRenderer } from './renderer.js';

const OPEN_SECONDS = 6.2; // tam açılma süresi
const SCATTER_SECONDS = 1.6;
const DEFAULT_VIEW = { yaw: 0.38, pitch: 0.55 };
const YAW_LIMIT = 1.25; // ±72°
const PITCH_MIN = 0.02;
const PITCH_MAX = 1.05;

const root = document.documentElement;
const canvas = document.querySelector('[data-canvas]');
const slider = document.querySelector('[data-bloom]');
const sliderValue = document.querySelector('[data-bloom-value]');
const playButton = document.querySelector('[data-action="play"]');
const scatterButton = document.querySelector('[data-action="scatter"]');
const restartButton = document.querySelector('[data-action="restart"]');
const hint = document.querySelector('[data-hint]');
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
const params = new URLSearchParams(location.search);
const still = params.has('kapak'); // kapak görüntüsü için arayüzsüz, açık ve durağan

const state = {
  open: 0,
  playing: true,
  time: 0,
  scatter: 0,
  scatterTarget: 0,
  yaw: DEFAULT_VIEW.yaw,
  pitch: DEFAULT_VIEW.pitch,
  yawTarget: DEFAULT_VIEW.yaw,
  pitchTarget: DEFAULT_VIEW.pitch,
  reduced: reducedQuery.matches,
};

let renderer = null;
let raf = 0;
let last = 0;
let hintShown = true;
const cleanups = [];
const on = (target, type, fn, opts) => {
  target.addEventListener(type, fn, opts);
  cleanups.push(() => target.removeEventListener(type, fn, opts));
};

// ---------- Arayüz eşitleme ----------
function syncUI() {
  const pct = Math.round(state.open * 100);
  if (slider.value !== String(pct)) slider.value = String(pct);
  slider.style.setProperty('--fill', `${pct}%`);
  sliderValue.textContent = `%${pct}`;
  slider.setAttribute('aria-valuetext', `%${pct} açık`);

  playButton.querySelector('[data-label]').textContent = state.playing ? 'Duraklat' : 'Oynat';
  // SVG öğelerinde .hidden özelliği yok; nitelik doğrudan ayarlanır.
  playButton.querySelector('[data-icon="pause"]').toggleAttribute('hidden', !state.playing);
  playButton.querySelector('[data-icon="play"]').toggleAttribute('hidden', state.playing);
  playButton.disabled = state.reduced;
  playButton.title = state.reduced ? 'Hareket azaltma tercihi açık' : '';

  scatterButton.querySelector('[data-label]').textContent = state.scatterTarget ? 'Toparla' : 'Dağıt';
}

function hideHint() {
  if (!hintShown) return;
  hintShown = false;
  hint.classList.add('is-gone');
}

// ---------- Döngü ----------
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

function needsFrames() {
  if (document.visibilityState !== 'visible') return false;
  if (state.playing && !state.reduced) return true; // nefes, salınım, açılma
  if (Math.abs(state.scatter - state.scatterTarget) > 1e-4) return true;
  return state.yaw !== state.yawTarget || state.pitch !== state.pitchTarget;
}

function update(dt) {
  if (state.playing && !state.reduced) {
    state.time += dt;
    if (state.open < 1) state.open = Math.min(1, state.open + dt / OPEN_SECONDS);
  }
  const step = dt / SCATTER_SECONDS;
  if (state.scatter < state.scatterTarget) state.scatter = Math.min(state.scatterTarget, state.scatter + step);
  else if (state.scatter > state.scatterTarget) state.scatter = Math.max(state.scatterTarget, state.scatter - step);
  state.yaw = damp(state.yaw, state.yawTarget, 5, dt);
  state.pitch = damp(state.pitch, state.pitchTarget, 5, dt);
  if (Math.abs(state.yaw - state.yawTarget) < 1e-3) state.yaw = state.yawTarget;
  if (Math.abs(state.pitch - state.pitchTarget) < 1e-3) state.pitch = state.pitchTarget;
}

function render() {
  renderer.draw({
    open: state.open,
    time: state.time,
    motion: state.reduced ? 0 : 1,
    scatter: state.scatter,
    yaw: state.yaw,
    pitch: state.pitch,
  });
}

// Yavaş cihaz tespiti: ilk saniyelerde kare süresi yüksekse kaliteyi düşür.
const frameSamples = [];
let degraded = false;
function watchPerformance(dt) {
  if (degraded || frameSamples.length > 120) return;
  frameSamples.push(dt);
  if (frameSamples.length === 120) {
    const sorted = frameSamples.slice(20).sort((a, b) => a - b);
    if (sorted[sorted.length >> 1] > 0.03) {
      degraded = true;
      renderer.degrade();
    }
  }
}

function frame(now) {
  raf = 0;
  const dt = Math.min(0.1, last ? (now - last) / 1000 : 1 / 60);
  last = now;
  update(dt);
  render();
  syncUI();
  watchPerformance(dt);
  if (needsFrames()) {
    root.dataset.loop = 'running';
    raf = requestAnimationFrame(frame);
  } else root.dataset.loop = 'idle';
}

/** Döngü durmuşsa başlatır; gerekmiyorsa yalnızca tek kare çizer. */
function kick() {
  if (!renderer) return;
  if (raf) return;
  last = 0;
  root.dataset.loop = needsFrames() ? 'running' : 'idle';
  raf = requestAnimationFrame(frame);
}

// ---------- Kontroller ----------
function setPlaying(playing) {
  state.playing = playing && !state.reduced;
  syncUI();
  kick();
}

function restart() {
  state.open = state.reduced ? 1 : 0;
  state.playing = !state.reduced;
  state.scatter = 0;
  state.scatterTarget = 0;
  state.yaw = state.yawTarget = DEFAULT_VIEW.yaw;
  state.pitch = state.pitchTarget = DEFAULT_VIEW.pitch;
  state.time = 0;
  syncUI();
  kick();
}

function toggleScatter() {
  state.scatterTarget = state.scatterTarget ? 0 : 1;
  if (state.reduced) state.scatter = state.scatterTarget; // hareketsiz geçiş
  syncUI();
  kick();
}

function rotate(dYaw, dPitch) {
  state.yawTarget = Math.max(-YAW_LIMIT, Math.min(YAW_LIMIT, state.yawTarget + dYaw));
  state.pitchTarget = Math.max(PITCH_MIN, Math.min(PITCH_MAX, state.pitchTarget + dPitch));
  if (state.reduced) {
    state.yaw = state.yawTarget;
    state.pitch = state.pitchTarget;
  }
  kick();
}

function bindControls() {
  on(slider, 'input', () => {
    // Kullanıcı kaydırınca otomatik açılma durur, kontrol ona geçer.
    state.open = Number(slider.value) / 100;
    state.playing = false;
    syncUI();
    kick();
  });
  on(playButton, 'click', () => setPlaying(!state.playing));
  on(scatterButton, 'click', toggleScatter);
  on(restartButton, 'click', restart);

  // Sürükleyerek sınırlı açıyla dönme (fare ve dokunmatik)
  let drag = null;
  on(canvas, 'pointerdown', (e) => {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* sentetik veya biten işaretçi */ }
  });
  on(canvas, 'pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 0) hideHint();
    rotate(-dx * 0.0055, dy * 0.004);
  });
  const end = (e) => {
    if (drag && e.pointerId === drag.id) drag = null;
  };
  on(canvas, 'pointerup', end);
  on(canvas, 'pointercancel', end);

  // Klavye: tuval odaktayken ok tuşları
  on(canvas, 'keydown', (e) => {
    const step = 0.14;
    const map = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, -step * 0.7], ArrowDown: [0, step * 0.7] };
    const d = map[e.key];
    if (!d) return;
    e.preventDefault();
    hideHint();
    rotate(d[0], d[1]);
  });

  on(document, 'visibilitychange', kick);
  on(reducedQuery, 'change', () => {
    state.reduced = reducedQuery.matches;
    applyReducedMotion();
  });

  // Yeniden boyutlanma ve ekran yönü
  const ro = new ResizeObserver(() => {
    renderer?.resize();
    kick();
  });
  ro.observe(canvas);
  cleanups.push(() => ro.disconnect());
  on(window, 'orientationchange', () => {
    renderer?.resize();
    kick();
  });
}

function applyReducedMotion() {
  if (state.reduced) {
    // Otomatik açılış, salınım ve dağılma hareketi yok: gül açık ve sabit.
    state.playing = false;
    state.open = 1;
    state.scatter = state.scatterTarget;
    state.yaw = state.yawTarget;
    state.pitch = state.pitchTarget;
  }
  syncUI();
  kick();
}

// ---------- Başlatma ----------
function showFallback() {
  root.dataset.mode = 'fallback';
  const picture = document.querySelector('[data-fallback]');
  // Görseller yalnızca gerektiğinde yüklenir.
  for (const el of picture.querySelectorAll('[data-srcset]')) el.srcset = el.dataset.srcset;
  for (const el of picture.querySelectorAll('[data-src]')) el.src = el.dataset.src;
  picture.hidden = false;
  document.querySelector('[data-fallback-note]').hidden = still;
}

function dispose() {
  cancelAnimationFrame(raf);
  raf = 0;
  for (const c of cleanups.splice(0)) c();
  renderer?.dispose();
  renderer = null;
}

function start() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 600;
  const lowEnd = coarse || small || (navigator.hardwareConcurrency || 4) <= 4;
  try {
    renderer = createRenderer(canvas, {
      budget: lowEnd ? 5400 : 9200,
      dprCap: lowEnd ? 1.5 : 2,
      bloom: !lowEnd || !coarse,
      onLost() {
        dispose();
        showFallback();
      },
    });
  } catch (err) {
    console.info('Binary Bloom: WebGL2 başlatılamadı, durağan görüntü gösteriliyor.', err.message);
    showFallback();
    return;
  }

  root.dataset.mode = 'webgl';
  if (still) {
    root.dataset.still = '';
    state.open = 1;
    state.playing = false;
    state.time = 3.2;
  }
  bindControls();
  applyReducedMotion();

  // Testler ve hata ayıklama için salt okunur durum
  window.binaryBloom = {
    state: () => ({ ...state, loop: root.dataset.loop, ...renderer?.stats() }),
  };
}

on(window, 'pagehide', (e) => {
  if (!e.persisted) dispose();
});

start();
