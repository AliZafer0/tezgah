// Impossible Room — bulmaca akışı, kamera etkileşimi, çözüm algılama ve kayıt.
import { LEVELS, angleToTarget, bounds, jointError } from './levels.js';
import { createRenderer } from './renderer.js';

// Çözüm toleransı ve histerezis (derece): içeri girerken sıkı, çıkarken gevşek.
const ENTER_DEG = 2.0;
const EXIT_DEG = 3.2;
const JOINT_TOLERANCE = 0.07; // birleşim çiftlerinin ekran uzayındaki sapması (yarıçapa oranla)
const HOLD_MS = 450;
const HOLD_FRAMES = 6; // yavaş cihazda tek uzun kare tutmayı tamamlamasın
const PITCH_MIN = 4;
const PITCH_MAX = 80;
const STORE_KEY = 'impossible-room';
const STORE_VERSION = 1;

const $ = (s) => document.querySelector(s);
const ui = {
  canvas: $('[data-canvas]'),
  rooms: $('[data-rooms]'),
  intro: $('[data-intro]'),
  ghost: $('[data-ghost]'),
  ghostImage: $('[data-ghost-image]'),
  solved: $('[data-solved]'),
  fallback: $('[data-fallback]'),
  finale: $('[data-finale]'),
  thumbs: $('[data-thumbs]'),
  controls: $('[data-controls]'),
  meter: $('[data-meter]'),
  meterFill: $('[data-meter-fill]'),
  next: $('[data-action="next"]'),
  hint: $('[data-action="hint"]'),
  reset: $('[data-action="reset"]'),
  saveNote: $('[data-save-note]'),
  announce: $('[data-announce]'),
};
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');

const state = {
  index: 0,
  yaw: 0,
  pitch: 0,
  solved: LEVELS.map(() => false), // kalıcı ilerleme
  solvedNow: false, // bu ziyarette çözüldü mü
  inZone: false,
  zoneSince: 0,
  zoneFrames: 0,
  tween: null, // { from, to, start, ms }
  glowStart: 0,
  interacted: false,
};

let renderer = null;
let raf = 0;
let storageOk = false;
let ghostTimer = 0;
const cleanups = [];
const on = (t, type, fn, opts) => {
  t.addEventListener(type, fn, opts);
  cleanups.push(() => t.removeEventListener(type, fn, opts));
};
const level = () => LEVELS[state.index];

function announce(text) {
  ui.announce.textContent = '';
  // Aynı metin tekrarlandığında da duyurulsun
  requestAnimationFrame(() => { ui.announce.textContent = text; });
}

// ---------- Kayıt ----------
function probeStorage() {
  try {
    localStorage.setItem(`${STORE_KEY}:probe`, '1');
    localStorage.removeItem(`${STORE_KEY}:probe`);
    return true;
  } catch {
    return false;
  }
}

function parseProgress(value) {
  if (!Array.isArray(value) || value.length !== LEVELS.length) return null;
  return value.map((v) => v === true);
}

function loadProgress() {
  storageOk = probeStorage();
  if (storageOk) {
    try {
      const data = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
      if (data?.v === STORE_VERSION) return parseProgress(data.solved);
    } catch { /* bozuk kayıt: varsayılan */ }
    return null;
  }
  // Depolama kapalıysa (playground'un yalıtılmış projeleri) ilerleme adreste tutulur.
  const m = /^#odalar=([01]{3})$/.exec(location.hash);
  return m ? [...m[1]].map((c) => c === '1') : null;
}

function saveProgress() {
  if (storageOk) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ v: STORE_VERSION, solved: state.solved }));
      return;
    } catch {
      storageOk = false;
    }
  }
  const any = state.solved.some(Boolean);
  const hash = any ? `#odalar=${state.solved.map((s) => (s ? 1 : 0)).join('')}` : '';
  try { history.replaceState(null, '', location.pathname + location.search + hash); } catch { /* adres değişmiyor */ }
  updateSaveNote();
}

function clearProgress() {
  if (storageOk) {
    try { localStorage.removeItem(STORE_KEY); } catch { /* yok say */ }
  }
  state.solved = LEVELS.map(() => false);
  saveProgress();
  ui.finale.hidden = true;
  goTo(0);
  announce('Kayıt temizlendi. Oda 1: Eşik.');
}

function updateSaveNote() {
  if (storageOk) ui.saveNote.textContent = '';
  else if (window.top === window) ui.saveNote.textContent = 'İlerleme adres çubuğunda saklanıyor.';
  else ui.saveNote.textContent = 'Önizlemede ilerleme kaydedilmez.';
}

// ---------- Oda gezinmesi ----------
function renderRooms() {
  const furthest = Math.max(state.index, state.solved.lastIndexOf(true) + 1);
  ui.rooms.replaceChildren(...LEVELS.map((l, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'room';
    b.dataset.room = String(i);
    b.dataset.done = String(state.solved[i]);
    b.disabled = i > Math.min(furthest, LEVELS.length - 1);
    if (i === state.index) b.setAttribute('aria-current', 'step');
    b.setAttribute('aria-label', `Oda ${i + 1} / ${LEVELS.length}: ${l.name}${state.solved[i] ? ', çözüldü' : ''}`);
    const mark = document.createElement('span');
    mark.className = 'room-mark';
    mark.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'room-name';
    name.textContent = `${i + 1}. ${l.name}`;
    b.append(mark, name);
    return b;
  }));
}

function goTo(index) {
  ui.controls.classList.remove('is-finale');
  state.index = index;
  state.solvedNow = false;
  state.inZone = false;
  state.tween = null;
  state.glowStart = 0;
  state.yaw = level().start.yaw;
  state.pitch = level().start.pitch;
  hideGhost();
  ui.solved.hidden = true;
  ui.next.hidden = true;
  renderer?.setLevel(level());
  renderRooms();
  updateMeter();
  requestRender();
}

// ---------- Çözüm algılama ----------
function wrapDeg(a) {
  return ((((a + 180) % 360) + 360) % 360) - 180;
}

function evaluate(now) {
  const l = level();
  const angle = angleToTarget(l, state.yaw, state.pitch);
  updateMeter(angle);
  if (state.solvedNow || state.tween) return;
  const joints = jointError(l, state.yaw, state.pitch, bounds(l).radius);
  if (!state.inZone && angle < ENTER_DEG && joints < JOINT_TOLERANCE) {
    state.inZone = true;
    state.zoneSince = now;
    state.zoneFrames = 0;
  } else if (state.inZone && angle > EXIT_DEG) {
    state.inZone = false;
  }
  if (state.inZone) state.zoneFrames++;
  if (state.inZone && state.zoneFrames >= HOLD_FRAMES && now - state.zoneSince >= HOLD_MS) solve(now);
}

function updateMeter(angle = angleToTarget(level(), state.yaw, state.pitch)) {
  // Yalnızca kabaca yakınlığı gösterir; yön vermez.
  const fill = state.solvedNow ? 1 : Math.max(0, 1 - angle / 55) ** 1.6;
  ui.meterFill.style.transform = `scaleX(${fill.toFixed(3)})`;
  ui.meter.setAttribute('aria-valuenow', String(Math.round(fill * 100)));
}

function solve(now) {
  state.solvedNow = true;
  state.inZone = false;
  state.solved[state.index] = true;
  saveProgress();
  const t = level().target;
  if (reducedQuery.matches) {
    state.yaw = t.yaw;
    state.pitch = t.pitch;
  } else {
    // Kısa ve yumuşak yerleşme: en kısa yaw yolundan
    state.tween = { from: { yaw: state.yaw, pitch: state.pitch }, to: { yaw: state.yaw + wrapDeg(t.yaw - state.yaw), pitch: t.pitch }, start: now, ms: 360 };
    state.glowStart = now;
  }
  hideGhost();
  ui.solved.hidden = false;
  const last = state.index === LEVELS.length - 1;
  ui.next.textContent = last ? 'Turu tamamla' : 'Sonraki oda';
  ui.next.hidden = false;
  renderRooms();
  updateMeter();
  announce('Perspektif tamamlandı.');
}

// ---------- Döngü (yalnızca gerektiğinde) ----------
const ease = (t) => 1 - (1 - t) ** 3;

function frame(now) {
  raf = 0;
  if (!renderer) return;
  let busy = false;
  if (state.tween) {
    const k = Math.min(1, (now - state.tween.start) / state.tween.ms);
    const e = ease(k);
    state.yaw = state.tween.from.yaw + (state.tween.to.yaw - state.tween.from.yaw) * e;
    state.pitch = state.tween.from.pitch + (state.tween.to.pitch - state.tween.from.pitch) * e;
    if (k >= 1) state.tween = null;
    else busy = true;
  }
  evaluate(now);
  let glow = 0;
  if (state.glowStart) {
    const g = (now - state.glowStart) / 900;
    if (g < 1) { glow = Math.sin(Math.PI * g); busy = true; } else state.glowStart = 0;
  }
  renderer.draw(state.yaw, state.pitch, glow);
  if (state.inZone && !state.solvedNow) busy = true; // tutma süresini tamamla
  if (busy && document.visibilityState === 'visible') raf = requestAnimationFrame(frame);
}

function requestRender() {
  if (!raf && renderer && document.visibilityState === 'visible') raf = requestAnimationFrame(frame);
}

// ---------- Etkileşim ----------
function rotate(dYaw, dPitch) {
  if (state.tween) state.tween = null;
  state.yaw = wrapDeg(state.yaw + dYaw);
  state.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, state.pitch + dPitch));
  if (!state.interacted) {
    state.interacted = true;
    ui.intro.classList.add('is-gone');
  }
  requestRender();
}

function resetView() {
  const s = level().start;
  hideGhost();
  if (reducedQuery.matches) {
    state.yaw = s.yaw;
    state.pitch = s.pitch;
  } else {
    state.tween = { from: { yaw: state.yaw, pitch: state.pitch }, to: { yaw: state.yaw + wrapDeg(s.yaw - state.yaw), pitch: s.pitch }, start: performance.now(), ms: 420 };
  }
  state.inZone = false;
  requestRender();
}

function hideGhost() {
  clearTimeout(ghostTimer);
  ui.ghost.hidden = true;
  ui.ghost.classList.remove('is-fading');
  ui.ghostImage.replaceChildren();
}

/** İpucu: hedef silueti kısa süre gösterir; kamerayı hareket ettirmez, çözümü tetiklemez. */
function showHint() {
  if (!renderer || state.solvedNow) return;
  hideGhost();
  const img = renderer.snapshot(level(), 320, 240, { flat: true });
  img.setAttribute('role', 'img');
  img.setAttribute('aria-label', 'Hedef görünümün silueti');
  ui.ghostImage.append(img);
  ui.ghost.hidden = false;
  announce('Hedef siluet birkaç saniye gösteriliyor.');
  ghostTimer = setTimeout(() => {
    ui.ghost.classList.add('is-fading');
    ghostTimer = setTimeout(hideGhost, reducedQuery.matches ? 0 : 420);
  }, 3200);
  requestRender();
}

function showFinale() {
  ui.thumbs.replaceChildren(...LEVELS.map((l, i) => {
    const li = document.createElement('li');
    const c = renderer.snapshot(l, 420, 300);
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', `${l.name}: çözülmüş görünüm`);
    const label = document.createElement('span');
    label.textContent = `${i + 1}. ${l.name}`;
    li.append(c, label);
    return li;
  }));
  ui.finale.hidden = false;
  ui.controls.classList.add('is-finale');
  $('#finale-title').focus();
  announce('Üç oda tamamlandı.');
}

function bind() {
  let drag = null;
  on(ui.canvas, 'pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try { ui.canvas.setPointerCapture(e.pointerId); } catch { /* sentetik işaretçi */ }
  });
  on(ui.canvas, 'pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    rotate(-dx * 0.32, dy * 0.24);
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    try { ui.canvas.releasePointerCapture(e.pointerId); } catch { /* zaten bırakıldı */ }
  };
  on(ui.canvas, 'pointerup', end);
  on(ui.canvas, 'pointercancel', end);
  on(ui.canvas, 'lostpointercapture', () => { drag = null; });

  on(ui.canvas, 'keydown', (e) => {
    const step = e.shiftKey ? 0.5 : 2;
    const map = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const m = map[e.key];
    if (!m) return;
    e.preventDefault();
    rotate(m[0], m[1]);
  });

  on(ui.hint, 'click', showHint);
  on(ui.reset, 'click', resetView);
  on(ui.next, 'click', () => {
    if (state.index === LEVELS.length - 1) return showFinale();
    goTo(state.index + 1);
    ui.canvas.focus({ preventScroll: true });
    announce(`Oda ${state.index + 1}: ${level().name}`);
  });
  on(ui.rooms, 'click', (e) => {
    const b = e.target.closest('[data-room]');
    if (!b || b.disabled) return;
    ui.finale.hidden = true;
    goTo(Number(b.dataset.room));
    announce(`Oda ${state.index + 1}: ${level().name}`);
  });
  on($('[data-action="replay"]'), 'click', () => {
    ui.finale.hidden = true;
    goTo(0);
    ui.canvas.focus({ preventScroll: true });
    announce('Oda 1: Eşik');
  });
  on($('[data-action="clear-save"]'), 'click', clearProgress);

  on(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') requestRender();
    else { cancelAnimationFrame(raf); raf = 0; }
  });
  const ro = new ResizeObserver(() => {
    if (renderer?.resize()) requestRender();
  });
  ro.observe(ui.canvas);
  cleanups.push(() => ro.disconnect());
  on(window, 'pagehide', (e) => { if (!e.persisted) dispose(); });
}

function dispose() {
  cancelAnimationFrame(raf);
  clearTimeout(ghostTimer);
  for (const c of cleanups.splice(0)) c();
  renderer?.dispose();
  renderer = null;
}

function showFallback() {
  document.documentElement.dataset.mode = 'fallback';
  ui.canvas.hidden = true;
  ui.intro.hidden = true;
  ui.controls.hidden = true;
  ui.rooms.hidden = true;
  ui.fallback.hidden = false;
}

function start() {
  const progress = loadProgress();
  if (progress) state.solved = progress;
  updateSaveNote();
  const coarse = matchMedia('(pointer: coarse)').matches;
  try {
    renderer = createRenderer(ui.canvas, {
      dprCap: coarse ? 1.5 : 2,
      shadowSize: coarse ? 1024 : 2048,
      onLost() {
        dispose();
        showFallback();
      },
    });
  } catch (err) {
    console.info('Impossible Room: WebGL2 başlatılamadı.', err.message);
    showFallback();
    return;
  }
  document.documentElement.dataset.mode = 'webgl';
  const firstOpen = state.solved.indexOf(false);
  goTo(firstOpen === -1 ? 0 : firstOpen);
  bind();

  // Testler ve hata ayıklama: salt okunur durum ve doğrudan bakış ayarı
  window.room = {
    state: () => ({
      index: state.index, yaw: state.yaw, pitch: state.pitch, solved: [...state.solved],
      solvedNow: state.solvedNow, inZone: state.inZone, loop: raf ? 'running' : 'idle',
      angle: angleToTarget(level(), state.yaw, state.pitch), storage: storageOk, ...renderer?.stats(),
    }),
    view(yaw, pitch) {
      state.yaw = yaw;
      state.pitch = pitch;
      requestRender();
    },
    go(i) { goTo(i); },
  };
}

start();
