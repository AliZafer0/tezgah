// Usul Makinesi — usul çemberi, vuruş düzenleme, tempo ve paylaşım.
// Ses ses.js'teki ileri zamanlayıcıyla çalınır; çember yalnızca çalarken ya da bir şey değişince çizilir.
import { USULLER, STROKES, STROKE_NAMES, SESLER, BPM_MIN, BPM_MAX, byKey, encode, decode } from './usuller.js';
import { createSequencer, audio, hit } from './ses.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#cember');
const ctx = canvas.getContext('2d');
const panel = $('.panel');
const ui = {
  usuller: $('#usuller'), about: $('#about'), cells: $('#cells'), restore: $('#restore'),
  tempo: $('#tempo'), tempoOut: $('#tempo-out'), nefes: $('#nefes'), nefesOut: $('#nefes-out'),
  ses: [...document.querySelectorAll('input[name="ses"]')], zil: $('#zil'),
  play: $('#play'), share: $('#share'), shareBox: $('#sharebox'), shareLink: $('#share-link'), status: $('#status'),
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LABEL = { D: 'Düm', T: 'Tek', K: 'ke', '-': '·' };

let state = { usul: 'duyek', bpm: 184, pattern: 'DT-TD-T-', ses: 'k', zil: false, nefes: 3 };
let sel = 0; // klavyeyle seçili vuruş
const usul = () => byKey(state.usul);
const seq = createSequencer(() => state, null);
const pulses = new Float64Array(16).fill(-1e9);
let lastStep = -1;

// ------------------------------------------------------------------ yerleşim
let dpr = 1; let L = { cx: 0, cy: 0, R: 100 };
function layout() {
  const r = canvas.getBoundingClientRect();
  dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
  const pr = panel.getBoundingClientRect();
  const mobile = pr.top > r.height * 0.3;
  let ax = 24; let ay = 64; let aw = r.width - 48; let ah = r.height - 88;
  if (!mobile) { ax = pr.right + 24; aw = r.width - ax - 24; } else { ay = 40; ah = pr.top - ay - 8; }
  const R = Math.max(50, Math.min(aw, ah) / 2 / 1.24);
  L = { cx: ax + aw / 2, cy: ay + ah / 2, R };
}

// ------------------------------------------------------------------ çizim
const angleOf = (i, n) => -Math.PI / 2 + (i / n) * Math.PI * 2;
function cellRadius(s, n) {
  const chord = 2 * L.R * 0.74 * Math.sin(Math.PI / n);
  const base = { D: 0.12, T: 0.088, K: 0.06, '-': 0.016 }[s] * L.R;
  return Math.min(base, chord * (s === 'D' ? 0.44 : s === 'T' ? 0.36 : 0.28));
}
let raf = 0;
function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
function frame(now) {
  raf = 0;
  const pos = seq.position();
  if (pos && pos.step !== lastStep) {
    lastStep = pos.step;
    pulses[pos.step] = now - pos.since * 1000;
    markNow(pos.step);
  }
  draw(now, pos);
  if (seq.running) requestDraw();
}
function draw(now, pos) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = canvas.width / dpr; const H = canvas.height / dpr;
  const { cx, cy, R } = L; const u = usul(); const n = state.pattern.length;
  const bg = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, Math.max(W, H) * 0.8);
  bg.addColorStop(0, '#3a2219'); bg.addColorStop(1, '#170e0b');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // gruplar: dış halkada 2 + 2 + 2 + 3 gibi
  let start = 0;
  ctx.lineCap = 'butt';
  u.groups.forEach((g, gi) => {
    const a0 = angleOf(start - 0.5, n) + 0.035; const a1 = angleOf(start + g - 0.5, n) - 0.035;
    ctx.strokeStyle = gi % 2 ? 'rgba(224,163,92,0.55)' : 'rgba(224,163,92,0.85)';
    ctx.lineWidth = Math.max(3, R * 0.025);
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.1, a0, a1); ctx.stroke();
    const am = (a0 + a1) / 2;
    ctx.fillStyle = '#e8c79c'; ctx.font = `600 ${Math.max(11, R * 0.07)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(g), cx + Math.cos(am) * R * 1.2, cy + Math.sin(am) * R * 1.2);
    start += g;
  });

  // deri ve gövde
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 30 * dpr; ctx.shadowOffsetY = 8 * dpr;
  ctx.fillStyle = '#5a2f1a'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  const skin = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.1, cx, cy, R * 0.95);
  skin.addColorStop(0, '#f3e5c8'); skin.addColorStop(0.7, '#e2cba3'); skin.addColorStop(1, '#c9a77b');
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(cx, cy, R * 0.93, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c99a4f';
  for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 0.965, cy + Math.sin(a) * R * 0.965, Math.max(1.2, R * 0.011), 0, Math.PI * 2); ctx.fill(); }

  // ibre: son vuruştan bu yana geçen kesirle akar
  if (pos) {
    const a = angleOf(pos.step + pos.frac, n);
    const trail = ctx.createConicGradient ? ctx.createConicGradient(a - (Math.PI * 2) / n, cx, cy) : null;
    if (trail) {
      trail.addColorStop(0, 'rgba(181,101,44,0)'); trail.addColorStop(1 / n, 'rgba(181,101,44,0.28)'); trail.addColorStop(1 / n + 0.001, 'rgba(181,101,44,0)');
      ctx.fillStyle = trail; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R * 0.9, a - (Math.PI * 2) / n, a); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = '#7a3f18'; ctx.lineWidth = Math.max(2, R * 0.012); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.36, cy + Math.sin(a) * R * 0.36); ctx.lineTo(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9); ctx.stroke();
  }

  // vuruşlar
  for (let i = 0; i < n; i++) {
    const s = state.pattern[i]; const a = angleOf(i, n);
    const x = cx + Math.cos(a) * R * 0.74; const y = cy + Math.sin(a) * R * 0.74;
    const age = (now - pulses[i]) / 1000;
    const k = reduced || s === '-' ? 0 : Math.max(0, 1 - age / 0.35);
    let r = cellRadius(s, n) * (1 + 0.22 * k);
    if (k > 0 && !reduced) {
      ctx.strokeStyle = `rgba(122,63,24,${0.5 * k})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r + (1 - k) * R * 0.12, 0, Math.PI * 2); ctx.stroke();
    }
    if (s === '-') {
      ctx.fillStyle = '#8d6b4f'; ctx.beginPath(); ctx.arc(x, y, Math.max(2, r), 0, Math.PI * 2); ctx.fill();
      r = Math.max(r, R * 0.04);
    } else {
      const fill = { D: '#3a1d12', T: '#c27a3a', K: '#e0b07c' }[s];
      ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (k > 0) { ctx.fillStyle = `rgba(255,214,150,${0.45 * k})`; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = s === 'K' ? '#5a3318' : '#fbf0dc';
      ctx.font = `600 ${Math.max(9, r * (s === 'D' ? 0.62 : 0.6))}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(LABEL[s], x, y + 0.5);
    }
    if (i === sel && document.activeElement === canvas) {
      ctx.strokeStyle = '#7a3f18'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(x, y, r + 6, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // göbek: usulün adı, ölçüsü, temposu
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#3a1d12';
  ctx.font = `400 ${Math.max(16, R * 0.15)}px 'Iowan Old Style', Palatino, Georgia, serif`;
  ctx.fillText(u.name, cx, cy - R * 0.08);
  ctx.fillStyle = '#7a5a40';
  ctx.font = `600 ${Math.max(11, R * 0.075)}px ui-monospace, Menlo, monospace`;
  ctx.fillText(`${u.meter}  ·  ${u.unit === 4 ? '♩' : '♪'} = ${state.bpm}`, cx, cy + R * 0.09);
  ctx.font = `${Math.max(10, R * 0.055)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(90,51,24,0.7)';
  ctx.fillText(seq.running ? 'durdurmak için dokun' : 'çalmak için dokun', cx, cy + R * 0.22);
}

// ------------------------------------------------------------------ panel
USULLER.forEach((u) => {
  const label = document.createElement('label');
  label.innerHTML = `<input type="radio" name="usul" value="${u.key}"><span>${u.name}<small>${u.meter}</small></span>`;
  ui.usuller.append(label);
  label.querySelector('input').addEventListener('change', () => setUsul(u.key, true));
});
function setUsul(key, announce) {
  const u = byKey(key);
  state.usul = key; state.pattern = u.pattern; state.bpm = u.bpm; sel = 0;
  seq.resetStep(); pulses.fill(-1e9); lastStep = -1;
  buildCells(); syncUi(); saveHash(); requestDraw();
  if (announce) say(`${u.name}, ${u.meter}: ${spoken()}.`);
}
const spoken = () => [...state.pattern].filter((s) => s !== '-').map((s) => STROKE_NAMES[s]).join(' ');
function buildCells() {
  ui.cells.textContent = '';
  let i = 0;
  for (const g of usul().groups) {
    const group = document.createElement('div'); group.className = 'group'; group.style.flexGrow = g;
    for (let k = 0; k < g; k++, i++) {
      const idx = i;
      const b = document.createElement('button'); b.type = 'button';
      b.addEventListener('click', () => cycle(idx));
      group.append(b);
    }
    ui.cells.append(group);
  }
  syncCells();
}
const cellButtons = () => ui.cells.querySelectorAll('button');
const SHORT = { D: 'D', T: 'T', K: 'k', '-': '·' };
function syncCells() {
  const dense = state.pattern.length >= 9;
  cellButtons().forEach((b, i) => {
    const s = state.pattern[i];
    b.dataset.s = s; b.textContent = (dense ? SHORT : LABEL)[s];
    b.setAttribute('aria-label', `${i + 1}. zaman: ${STROKE_NAMES[s]}`);
  });
}
let nowCell = -1;
function markNow(step) {
  if (nowCell >= 0) cellButtons()[nowCell]?.classList.remove('now');
  nowCell = step; cellButtons()[step]?.classList.add('now');
}
function cycle(i) {
  const s = state.pattern[i]; const nx = STROKES[(STROKES.indexOf(s) + 1) % STROKES.length];
  state.pattern = state.pattern.slice(0, i) + nx + state.pattern.slice(i + 1);
  sel = i;
  syncCells(); syncUi(); saveHash(); requestDraw();
  if (!seq.running && nx !== '-') { if (audio()) hit(nx, audio().currentTime + 0.01, state.ses); }
  say(`${i + 1}. zaman: ${STROKE_NAMES[nx]}`);
}
ui.restore.addEventListener('click', () => { state.pattern = usul().pattern; syncCells(); syncUi(); saveHash(); requestDraw(); say('Usul aslına döndü.'); });
ui.tempo.addEventListener('input', () => { setTempo(+ui.tempo.value); });
function setTempo(v) { state.bpm = Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(v))); syncUi(); saveHash(); requestDraw(); }
ui.nefes.addEventListener('input', () => { state.nefes = +ui.nefes.value; syncUi(); saveHash(); });
for (const r of ui.ses) r.addEventListener('change', () => { state.ses = r.value; saveHash(); if (!seq.running && audio()) hit('D', audio().currentTime + 0.01, state.ses); say(SESLER[r.value]); });
ui.zil.addEventListener('change', () => { state.zil = ui.zil.checked; saveHash(); });

function togglePlay() {
  if (seq.running) { seq.stop(); if (nowCell >= 0) cellButtons()[nowCell]?.classList.remove('now'); nowCell = -1; lastStep = -1; say('Durdu.'); }
  else if (!seq.start()) { say('Bu tarayıcıda Web Audio yok.', true); return; }
  else say(`${usul().name} çalıyor, ${state.bpm} tempo.`);
  syncUi(); requestDraw();
}
ui.play.addEventListener('click', togglePlay);

function syncUi() {
  for (const r of ui.usuller.querySelectorAll('input')) r.checked = r.value === state.usul;
  ui.about.textContent = usul().about;
  ui.restore.disabled = state.pattern === usul().pattern;
  ui.tempo.value = state.bpm; ui.tempoOut.value = state.bpm;
  ui.nefes.value = state.nefes; ui.nefesOut.value = state.nefes;
  for (const r of ui.ses) r.checked = r.value === state.ses;
  ui.zil.checked = state.zil;
  ui.play.textContent = seq.running ? '■ Durdur' : '▶ Çal';
  ui.play.setAttribute('aria-pressed', String(seq.running));
  canvas.setAttribute('aria-label', `Usul çemberi: ${usul().name} ${usul().meter}, ${spoken()}; tempo ${state.bpm}`);
}

// ------------------------------------------------------------------ çember ve klavye
canvas.addEventListener('pointerdown', (e) => {
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left - L.cx; const y = e.clientY - r.top - L.cy;
  const d = Math.hypot(x, y) / L.R;
  if (d < 0.5) { togglePlay(); return; }
  if (d > 1.05) return;
  const n = state.pattern.length;
  let a = Math.atan2(y, x) + Math.PI / 2; if (a < 0) a += Math.PI * 2;
  cycle(Math.round((a / (Math.PI * 2)) * n) % n);
});
canvas.addEventListener('focus', requestDraw);
canvas.addEventListener('blur', requestDraw);
canvas.addEventListener('keydown', (e) => {
  const n = state.pattern.length;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault(); sel = (sel + (e.key === 'ArrowRight' ? 1 : n - 1)) % n;
    say(`${sel + 1}. zaman: ${STROKE_NAMES[state.pattern[sel]]}`); requestDraw();
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault(); setTempo(state.bpm + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 4)); say(`Tempo ${state.bpm}`);
  } else if (e.key === 'Enter') { e.preventDefault(); cycle(sel); }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t instanceof HTMLButtonElement || (t instanceof HTMLInputElement && t.type !== 'range')) return;
  e.preventDefault(); togglePlay();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && seq.running) togglePlay(); });

ui.share.addEventListener('click', async () => {
  const url = `${location.href.split('#')[0]}#${encode(state)}`;
  ui.shareLink.value = url;
  try { await navigator.clipboard.writeText(url); ui.shareBox.hidden = true; say('Bağlantı kopyalandı. Açan kişi aynı usulü aynı tempoda çalar.', true); return; } catch { /* pano kapalı */ }
  ui.shareBox.hidden = false; ui.shareLink.focus(); ui.shareLink.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  say(ok ? 'Bağlantı kopyalandı.' : 'Pano erişimi kapalı; bağlantı seçildi, elle kopyalayabilirsin.', true);
});

let sayTimer = 0;
function say(text, keep = false) {
  ui.status.textContent = text;
  clearTimeout(sayTimer);
  if (!keep) sayTimer = setTimeout(() => { if (ui.status.textContent === text) ui.status.textContent = ''; }, 4000);
}

// ------------------------------------------------------------------ adres
let hashTimer = 0;
const history_ = window.history;
function saveHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const h = `#${encode(state)}`;
    if (location.hash === h) return;
    try { history_.replaceState(null, '', h); } catch { try { location.replace(h); } catch { /* adres değiştirilemiyor */ } }
  }, 300);
}

// ------------------------------------------------------------------ başlangıç
const fromHash = location.hash.length > 1 ? decode(decodeURIComponent(location.hash.slice(1))) : null;
if (fromHash) state = fromHash;
else if (location.hash.length > 1) say('Bağlantıdaki usul okunamadı; Düyek açıldı.', true);
buildCells();
syncUi();
new ResizeObserver(() => { layout(); requestDraw(); }).observe(canvas);
layout();
requestDraw();

// Test ve ölçüm için salt okunur durum
window.usul = Object.freeze({
  stats: () => ({ ...state, playing: seq.running, step: lastStep, ...seq.stats() }),
  hash: () => encode(state),
});
