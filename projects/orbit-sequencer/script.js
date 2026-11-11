// Orbit — durum, kontroller, kayıt/paylaşım ve ses yaşam döngüsü.
import { Engine, Sequencer } from './audio.js';
import { createOrbitView } from './orbit-view.js';
import {
  BPM_MAX, BPM_MIN, DEFAULT_PRESET, PRESETS, RINGS, STEPS,
  cloneNotes, countNotes, decode, emptyNotes, encode, inspire,
} from './patterns.js';

const STORE_KEY = 'orbit-sequencer';
const STORE_VERSION = 1;
const $ = (sel) => document.querySelector(sel);

const ui = {
  play: $('[data-action="play"]'),
  playLabel: $('[data-play-label]'),
  bpm: $('[data-bpm]'),
  bpmOut: $('[data-bpm-out]'),
  volume: $('[data-volume]'),
  mute: $('[data-action="mute"]'),
  presets: $('[data-presets]'),
  status: $('[data-status]'),
  hint: $('[data-hint]'),
  shareBox: $('[data-share-fallback]'),
  shareLink: $('[data-share-link]'),
};

const state = {
  notes: cloneNotes(PRESETS[DEFAULT_PRESET].notes),
  bpm: PRESETS[DEFAULT_PRESET].bpm,
  volume: 55,
  muted: false,
  playing: false,
  pausedAt: 0, // duraklatıldığı konum (adım)
};

let audio = null; // { ctx, engine, seq }
let audioUnavailable = false;
let storageOk = false;
let raf = 0;
let scheduledSteps = 0;
let playToken = 0;
let starting = false; // ses bağlamı açılırken düğme "çalıyor" sayılır
const cleanups = [];
const on = (target, type, fn, opts) => {
  target.addEventListener(type, fn, opts);
  cleanups.push(() => target.removeEventListener(type, fn, opts));
};

// ---------- Durum mesajı (adımlar duyurulmaz; yalnızca eylem sonuçları) ----------
let statusTimer = 0;
function say(text, { sticky = false } = {}) {
  ui.status.textContent = text;
  clearTimeout(statusTimer);
  if (!sticky) statusTimer = setTimeout(() => { ui.status.textContent = ''; }, 4500);
}

// ---------- Kayıt ----------
function probeStorage() {
  try {
    const k = `${STORE_KEY}:probe`;
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/** Sürümlü kayıt; bozuk veya eski kayıtta null döner (uygulama varsayılana döner). */
function readStore() {
  if (!storageOk) return null;
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (!data || data.v !== STORE_VERSION) return null;
    const pattern = decode(data.pattern);
    if (!pattern) return null;
    const volume = Number.isFinite(data.volume) ? Math.min(100, Math.max(0, Math.round(data.volume))) : state.volume;
    return { ...pattern, volume, muted: data.muted === true };
  } catch {
    return null;
  }
}

function writeHash() {
  const hash = `#${encode(state.notes, state.bpm)}`;
  if (location.hash === hash) return;
  try {
    history.replaceState(null, '', hash);
  } catch {
    try { location.replace(hash); } catch { /* adres değiştirilemiyor */ }
  }
}

let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    // Adres her zaman güncel besteyi taşır: yenileme ve paylaşım aynı düzeni açar.
    writeHash();
    if (!storageOk) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        v: STORE_VERSION, pattern: encode(state.notes, state.bpm), volume: state.volume, muted: state.muted,
      }));
    } catch {
      storageOk = false;
      say('Tarayıcı kaydı kullanılamıyor; beste sayfa adresinde saklanıyor.', { sticky: true });
    }
  }, 250);
}

function load() {
  storageOk = probeStorage();
  const stored = readStore();
  if (stored) {
    state.volume = stored.volume;
    state.muted = stored.muted;
  }
  const fromHash = location.hash.length > 1 ? decode(decodeURIComponent(location.hash.slice(1))) : null;
  const source = fromHash ?? stored;
  if (source) {
    state.notes = source.notes;
    state.bpm = source.bpm;
  }
  if (location.hash.length > 1 && !fromHash) say('Bağlantıdaki beste okunamadı; varsayılan düzen açıldı.');
  else if (fromHash) say('Bağlantıdaki beste yüklendi. Dinlemek için Başlat’a bas.');
  if (!storageOk) {
    say(window.top === window
      ? 'Bu sayfada tarayıcı kaydı kapalı; beste adres çubuğunda saklanıyor.'
      : 'Önizlemede kayıt kapalı; besteni saklamak için “Bağlantıyı kopyala”yı kullan.', { sticky: !fromHash && window.top !== window });
  }
}

// ---------- Arayüz ----------
function presetMatch() {
  return Object.keys(PRESETS).find((key) => PRESETS[key].notes.every((row, r) => row.every((on, s) => on === state.notes[r][s]))) ?? null;
}

function syncControls() {
  ui.bpm.value = String(state.bpm);
  ui.bpm.style.setProperty('--fill', `${((state.bpm - BPM_MIN) / (BPM_MAX - BPM_MIN)) * 100}%`);
  ui.bpmOut.textContent = `${state.bpm} BPM`;
  ui.volume.value = String(state.volume);
  ui.volume.style.setProperty('--fill', `${state.volume}%`);
  ui.volume.setAttribute('aria-valuetext', `%${state.volume}${state.muted ? ', sessizde' : ''}`);
  ui.mute.setAttribute('aria-pressed', String(state.muted));
  const match = presetMatch();
  for (const b of ui.presets.querySelectorAll('[data-preset]')) b.setAttribute('aria-pressed', String(b.dataset.preset === match));
  const active = state.playing || starting;
  ui.playLabel.textContent = active ? 'Duraklat' : 'Başlat';
  ui.play.querySelector('[data-icon="play"]').toggleAttribute('hidden', active);
  ui.play.querySelector('[data-icon="pause"]').toggleAttribute('hidden', !active);
}

const view = createOrbitView($('.stage'), {
  onToggle(ring, step) {
    state.notes[ring][step] = !state.notes[ring][step];
    view.setNotes(state.notes);
    ui.hint.classList.add('is-gone');
    syncControls();
    save();
  },
  onResize: () => frame(performance.now(), true),
});

function setPattern(notes, bpm, message) {
  state.notes = notes;
  if (bpm) {
    state.bpm = bpm;
    audio?.seq.setBpm(bpm);
  }
  view.setNotes(state.notes);
  syncControls();
  save();
  say(message);
}

// ---------- Ses ----------
function ensureAudio() {
  if (audio) return audio;
  if (audioUnavailable) return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  try {
    if (!Ctx) throw new Error('unsupported');
    const ctx = new Ctx({ latencyHint: 'interactive' });
    const engine = new Engine(ctx);
    const seq = new Sequencer(engine, () => state.notes, (entry) => {
      scheduledSteps++;
      const at = performance.now() + (entry.time - ctx.currentTime) * 1000;
      for (const r of entry.rings) view.pulse(r, entry.step, at);
    });
    seq.setBpm(state.bpm);
    engine.setVolume(state.volume / 100, state.muted);
    audio = { ctx, engine, seq };
    return audio;
  } catch {
    audioUnavailable = true;
    ui.play.disabled = true;
    say('Bu tarayıcıda ses başlatılamadı. Besteyi düzenleyebilir ve paylaşabilirsin; çalma kullanılamıyor.', { sticky: true });
    return null;
  }
}

async function play() {
  const token = ++playToken;
  const a = ensureAudio();
  if (!a) return;
  starting = true;
  syncControls();
  if (a.ctx.state !== 'running') {
    // Bazı gömülü bağlamlarda tarayıcı sesi engeller; resume hiç sonuçlanmayabilir.
    const resumed = await Promise.race([
      a.ctx.resume().then(() => true, () => false),
      new Promise((resolve) => { setTimeout(() => resolve(false), 1500); }),
    ]);
    if (token !== playToken) return; // bu arada duraklatıldı
    if (!resumed || a.ctx.state !== 'running') {
      say(window.top === window
        ? 'Tarayıcı sesi başlatmaya izin vermedi. Sayfayla etkileşip yeniden dene.'
        : 'Bu önizleme sesi engelliyor. Projeyi yeni sekmede açarak çalabilirsin.', { sticky: true });
      starting = false;
      syncControls();
      return;
    }
  }
  if (token !== playToken) return; // bu arada duraklatıldı
  starting = false;
  a.seq.setBpm(state.bpm);
  a.seq.start(Math.ceil(state.pausedAt - 1e-6) % STEPS);
  state.playing = true;
  ui.hint.classList.add('is-gone');
  syncControls();
  kick();
}

function pause({ suspend = false } = {}) {
  playToken++;
  if (starting) {
    starting = false;
    syncControls();
  }
  if (!audio || !state.playing) return;
  const pos = audio.seq.position();
  if (pos !== null) state.pausedAt = pos % STEPS;
  audio.seq.stop();
  state.playing = false;
  if (suspend) audio.ctx.suspend().catch(() => {});
  syncControls();
  kick();
}

// ---------- Çizim döngüsü ----------
function frame(now, once = false) {
  if (!once) raf = 0;
  const position = state.playing && audio ? audio.seq.position() : state.pausedAt;
  view.draw(position ?? state.pausedAt, now);
  if (!once && (state.playing || view.hasPulses())) raf = requestAnimationFrame(frame);
}

function kick() {
  if (!raf) raf = requestAnimationFrame(frame);
}

// ---------- Paylaşım ----------
async function share() {
  const url = `${location.href.split('#')[0]}#${encode(state.notes, state.bpm)}`;
  ui.shareLink.value = url;
  try {
    await navigator.clipboard.writeText(url);
    ui.shareBox.hidden = true;
    say('Bağlantı kopyalandı. Açan kişi besteyi duraklatılmış olarak görür.');
    return;
  } catch { /* izin yok: elle kopyalama */ }
  ui.shareBox.hidden = false;
  ui.shareLink.focus();
  ui.shareLink.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { copied = false; }
  say(copied ? 'Bağlantı kopyalandı.' : 'Pano erişimi kapalı; bağlantı seçildi, elle kopyalayabilirsin.', { sticky: !copied });
}

// ---------- Olaylar ----------
function bind() {
  on(ui.play, 'click', () => (state.playing || starting ? pause() : play()));
  on(ui.bpm, 'input', () => {
    state.bpm = Math.min(BPM_MAX, Math.max(BPM_MIN, Number(ui.bpm.value)));
    audio?.seq.setBpm(state.bpm);
    syncControls();
    save();
  });
  on(ui.volume, 'input', () => {
    state.volume = Number(ui.volume.value);
    if (state.muted && state.volume > 0) state.muted = false;
    audio?.engine.setVolume(state.volume / 100, state.muted);
    syncControls();
    save();
  });
  on(ui.mute, 'click', () => {
    state.muted = !state.muted;
    audio?.engine.setVolume(state.volume / 100, state.muted);
    syncControls();
    save();
    say(state.muted ? 'Ses kapatıldı.' : 'Ses açıldı.');
  });
  on(ui.presets, 'click', (e) => {
    const key = e.target.closest('[data-preset]')?.dataset.preset;
    if (!key) return;
    setPattern(cloneNotes(PRESETS[key].notes), PRESETS[key].bpm, `${PRESETS[key].name} yüklendi.`);
  });
  on($('[data-action="clear"]'), 'click', () => setPattern(emptyNotes(), null, 'Yörünge temizlendi.'));
  on($('[data-action="inspire"]'), 'click', () => {
    const notes = inspire();
    setPattern(notes, null, `Yeni bir ritim: ${countNotes(notes)} nota.`);
  });
  on($('[data-action="share"]'), 'click', share);
  on(ui.shareLink, 'focus', () => ui.shareLink.select());

  // Sekme arka plana geçince dur; dönüşte kendiliğinden çalma.
  on(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden' && state.playing) {
      pause({ suspend: true });
      say('Sekme arka plana geçti; çalma duraklatıldı.', { sticky: true });
    }
  });
  on(matchMedia('(prefers-reduced-motion: reduce)'), 'change', () => frame(performance.now(), true));
  on(window, 'pagehide', (e) => {
    if (e.persisted) return pause({ suspend: true });
    dispose();
  });
}

function dispose() {
  pause();
  cancelAnimationFrame(raf);
  clearTimeout(saveTimer);
  for (const c of cleanups.splice(0)) c();
  view.dispose();
  audio?.ctx.close().catch(() => {});
  audio = null;
}

load();
view.setNotes(state.notes);
syncControls();
bind();
frame(performance.now(), true);

// Testler ve hata ayıklama için salt okunur durum
window.orbit = {
  state: () => ({
    playing: state.playing,
    bpm: state.bpm,
    volume: state.volume,
    muted: state.muted,
    pattern: encode(state.notes, state.bpm),
    notes: countNotes(state.notes),
    storage: storageOk,
    audio: audio ? audio.ctx.state : audioUnavailable ? 'unavailable' : 'none',
    schedulerActive: Boolean(audio?.seq.playing),
    liveVoices: audio?.engine.liveVoices ?? 0,
    scheduledSteps,
    timeline: audio?.seq.timeline.length ?? 0,
    loop: raf ? 'running' : 'idle',
    rings: RINGS.length,
  }),
};
