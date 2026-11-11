// Makam Klavyesi — makam seçimi, 53 komalık halka, perde tuşları, seyir üreteci, dem ve Batı akordu karşılaştırması.
import { MAKAMS, OCTAVE, INTERVAL, INTERVAL_NAME, degrees, freq, perdeName, western, byKey } from './makams.js';
import * as audio from './audio.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#halka');
const ctx = canvas.getContext('2d');
const ui = {
  makams: $('#makams'), keys: $('#keys'), status: $('#status'),
  name: $('#m-name'), parts: $('#m-parts'), karar: $('#m-karar'), guclu: $('#m-guclu'), seyir: $('#m-seyir'), steps: $('#m-steps'), note: $('#m-note'),
  voices: [...document.querySelectorAll('input[name="voice"]')], drone: $('#drone'), west: $('#west'), play: $('#seyir'),
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLOR = { T: '#d6a756', K: '#7fb3a5', S: '#c7765a', B: '#9b87c9', A: '#e35d5d' };
// Türkçe Q klavyede alt sıra: A S D F G H J K L Ş İ ,
const CODES = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Backslash'];
const LABELS = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ş', 'İ', ','];

const state = { makam: MAKAMS[0], voice: 'ney', drone: false, west: false, seyir: null };
let notes = []; // perdeler (koma, Rast'tan)
const held = new Map(); // tuş indeksi → ses
const glow = new Float32Array(16); // halkadaki parlama (0..1)

// ------------------------------------------------------------------ makam seçimi
for (const m of MAKAMS) {
  const b = document.createElement('button');
  b.type = 'button'; b.setAttribute('role', 'radio'); b.textContent = m.name; b.dataset.key = m.key;
  b.addEventListener('click', () => selectMakam(m, true));
  ui.makams.append(b);
}

function selectMakam(m, announce = false) {
  stopSeyir();
  for (const [, v] of held) v?.stop(); held.clear();
  state.makam = m; notes = degrees(m);
  for (const b of ui.makams.children) {
    const on = b.dataset.key === m.key;
    b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1;
    if (on && announce) b.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }
  ui.name.textContent = m.name;
  ui.parts.textContent = m.parts;
  ui.karar.textContent = perdeName(m.karar);
  ui.guclu.textContent = perdeName(notes[m.guclu]);
  ui.seyir.textContent = m.seyir;
  ui.steps.replaceChildren(...m.steps.map((s) => {
    const sp = document.createElement('span'); const L = INTERVAL[s];
    sp.textContent = `${L} ${s}`; sp.style.background = COLOR[L]; sp.title = `${INTERVAL_NAME[L]}: ${s} koma`;
    return sp;
  }));
  ui.note.textContent = m.note;
  buildKeys();
  if (state.drone) audio.setDrone(freq(m.karar, state.west));
  saveHash();
  if (announce) say(`${m.name} makamı. Karar ${perdeName(m.karar)}, güçlü ${perdeName(notes[m.guclu])}.`);
  draw();
}

// ------------------------------------------------------------------ tuşlar
function buildKeys() {
  const m = state.makam;
  ui.keys.replaceChildren(...notes.map((k, i) => {
    const el = document.createElement('div');
    const w = western(k);
    const isKarar = (k - m.karar) % OCTAVE === 0; const isGuclu = i === m.guclu;
    el.className = `key${isKarar ? ' karar' : ''}${isGuclu ? ' guclu' : ''}`;
    el.dataset.i = i;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `${perdeName(k)}${isKarar ? ', karar' : ''}${isGuclu ? ', güçlü' : ''}`);
    const cents = w.cents === 0 ? '' : ` ${w.cents > 0 ? '+' : '−'}${Math.abs(w.cents)}¢`;
    el.innerHTML = `<span class="k">${LABELS[i] ?? ''}</span>${isKarar ? '<span class="tag">karar</span>' : isGuclu ? '<span class="tag">güçlü</span>' : ''}<span class="p">${perdeName(k)}</span><span class="w">${w.note}${cents}</span>`;
    return el;
  }));
}

function noteOn(i, vel = 1) {
  if (i < 0 || i >= notes.length || held.has(i)) return;
  const v = audio.play(freq(notes[i], state.west), { voice: state.voice, vel });
  held.set(i, v); glow[i] = 1;
  ui.keys.children[i]?.classList.add('on');
  kick();
}
function noteOff(i) {
  if (!held.has(i)) return;
  held.get(i)?.stop(); held.delete(i);
  ui.keys.children[i]?.classList.remove('on');
  kick();
}

// İşaretçi: basılı tutup kaydırınca perdeden perdeye geçilir
const pointers = new Map();
const keyAt = (x, y) => { const el = document.elementFromPoint(x, y)?.closest('.key'); return el && ui.keys.contains(el) ? +el.dataset.i : -1; };
ui.keys.addEventListener('pointerdown', (e) => {
  const i = keyAt(e.clientX, e.clientY); if (i < 0) return;
  e.preventDefault(); ui.keys.setPointerCapture(e.pointerId);
  stopSeyir(); pointers.set(e.pointerId, i); noteOn(i);
});
ui.keys.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const i = keyAt(e.clientX, e.clientY); const prev = pointers.get(e.pointerId);
  if (i === prev || i < 0) return;
  pointers.set(e.pointerId, i); noteOff(prev); noteOn(i, 0.85);
});
const release = (e) => { if (!pointers.has(e.pointerId)) return; noteOff(pointers.get(e.pointerId)); pointers.delete(e.pointerId); };
ui.keys.addEventListener('pointerup', release);
ui.keys.addEventListener('pointercancel', release);

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input[type="text"]')) return;
  const i = CODES.indexOf(e.code);
  if (i >= 0) { e.preventDefault(); if (!e.repeat) { stopSeyir(); noteOn(i); } return; }
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    if (e.target.closest?.('.seg')) return;
    e.preventDefault();
    const j = (MAKAMS.indexOf(state.makam) + (e.key === 'ArrowRight' ? 1 : -1) + MAKAMS.length) % MAKAMS.length;
    selectMakam(MAKAMS[j], true);
    if (e.target.closest?.('.makams')) ui.makams.children[j].focus();
  } else if (e.key === ' ' && !e.target.closest?.('button, input')) { e.preventDefault(); toggleSeyir(); }
});
window.addEventListener('keyup', (e) => { const i = CODES.indexOf(e.code); if (i >= 0) noteOff(i); });
window.addEventListener('blur', () => { for (const i of [...held.keys()]) noteOff(i); });

// ------------------------------------------------------------------ seyir üreteci
// Makamın karakterini taşıyan kısa bir ezgi: karardan (ya da güçlüden) başlar, güçlüde durak yapar,
// tize uzanır ve adım adım inerek kararda biter.
function composeSeyir(m) {
  const g = m.guclu; const top = Math.min(notes.length - 1, 7 + (Math.random() < 0.5 ? 1 : 2));
  const anchors = m.seyir === 'çıkıcı' ? [0, g, top, g, 0] : [g, top, g, 0];
  const seq = [];
  const add = (i, d) => seq.push({ i, d });
  add(anchors[0], 0.7);
  for (let a = 1; a < anchors.length; a++) {
    let cur = anchors[a - 1]; const to = anchors[a]; const dir = Math.sign(to - cur);
    while (cur !== to) {
      // Süsleme: bazen bir adım geri dönüp yeniden ilerle
      if (Math.random() < 0.22 && cur - dir >= 0 && cur - dir < notes.length && seq.length > 1) add(cur - dir, 0.22);
      cur += dir; add(cur, cur === to ? 0.75 : Math.random() < 0.3 ? 0.5 : 0.3);
    }
  }
  // Karar çeşnisi: güçlüden kararın bir üstüne, oradan karara uzun bitiş
  seq.splice(-1, 1, { i: 1, d: 0.45 }, { i: 0, d: 1.6 });
  return seq;
}

let seyirTimer = 0;
function toggleSeyir() { if (state.seyir) stopSeyir(); else startSeyir(); }
function startSeyir() {
  if (!audio.ensure()) { say('Bu tarayıcı Web Audio desteklemiyor.'); return; }
  stopSeyir();
  const seq = composeSeyir(state.makam);
  const tempo = state.voice === 'kanun' ? 0.9 : 1.05;
  let t = audio.now() + 0.08; const t0 = t;
  const events = [];
  for (const { i, d } of seq) {
    const dur = d * tempo;
    const v = audio.play(freq(notes[i], state.west), { voice: state.voice, at: t, vel: 0.9 });
    if (state.voice === 'ney') v?.stop(t + dur * 0.96);
    events.push({ i, at: t - t0, dur, v });
    t += dur;
  }
  state.seyir = { events, start: performance.now() + 80, end: (t - t0) * 1000 };
  ui.play.textContent = 'Durdur'; ui.play.setAttribute('aria-pressed', 'true');
  say(`${state.makam.name} seyri çalıyor.`);
  const tick = () => {
    if (!state.seyir) return;
    const el = (performance.now() - state.seyir.start) / 1000;
    for (const k of ui.keys.children) k.classList.remove('on');
    const cur = state.seyir.events.find((ev) => el >= ev.at && el < ev.at + ev.dur);
    if (cur) { ui.keys.children[cur.i]?.classList.add('on'); glow[cur.i] = Math.max(glow[cur.i], 0.9); }
    kick();
    if (el * 1000 > state.seyir.end + 200) { stopSeyir(false); return; }
    seyirTimer = setTimeout(tick, 40);
  };
  tick();
}
function stopSeyir(cut = true) {
  if (!state.seyir) return;
  clearTimeout(seyirTimer);
  if (cut) { const at = audio.now(); for (const ev of state.seyir.events) ev.v?.stop(at); }
  state.seyir = null;
  for (const k of ui.keys.children) k.classList.remove('on');
  ui.play.textContent = 'Seyir çal'; ui.play.setAttribute('aria-pressed', 'false');
}
ui.play.addEventListener('click', toggleSeyir);

// ------------------------------------------------------------------ denetimler
for (const r of ui.voices) r.addEventListener('change', () => { state.voice = r.value; saveHash(); say(r.value === 'ney' ? 'Ney sesi.' : 'Kanun sesi.'); });
ui.drone.addEventListener('click', () => {
  state.drone = !state.drone; ui.drone.setAttribute('aria-pressed', String(state.drone));
  if (state.drone) { audio.setDrone(freq(state.makam.karar, state.west)); say(`Dem açık: ${perdeName(state.makam.karar)} perdesinde sürekli taban sesi.`); } else { audio.stopDrone(); say('Dem kapandı.'); }
});
ui.west.addEventListener('click', () => {
  state.west = !state.west; ui.west.setAttribute('aria-pressed', String(state.west));
  if (state.drone) audio.setDrone(freq(state.makam.karar, state.west));
  saveHash(); draw();
  say(state.west ? 'Batı akordu: perdeler 12 eşit sese yuvarlandı. Farkı duymak için aynı perdeleri yeniden çal.' : 'Makam akoru: 53 komalı perdeler.');
});

// ------------------------------------------------------------------ halka
let W = 0; let H = 0; let dpr = 1;
function resize() {
  const r = canvas.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2);
  W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  draw();
}
let raf = 0;
function kick() { if (!raf) raf = requestAnimationFrame(frame); }
function frame() {
  raf = 0;
  let active = false;
  for (let i = 0; i < glow.length; i++) {
    const target = held.has(i) ? 1 : 0;
    glow[i] = reduced ? target : glow[i] + (target - glow[i]) * (target > glow[i] ? 0.5 : 0.08);
    if (Math.abs(glow[i] - target) > 0.01) active = true;
  }
  draw();
  if (active || held.size || state.seyir) raf = requestAnimationFrame(frame);
}

function draw() {
  if (!W) return;
  const m = state.makam;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2; const cy = H / 2; const R = Math.max(40, Math.min(W / 2 - 84, H / 2 - 40));
  const ang = (k) => -Math.PI / 2 + ((k - m.karar) / OCTAVE) * Math.PI * 2;
  const pos = (k, r = R) => [cx + Math.cos(ang(k)) * r, cy + Math.sin(ang(k)) * r];
  const shown = (k) => (state.west ? m.karar + (Math.round(((k - m.karar) / OCTAVE) * 12) * OCTAVE) / 12 : k);

  // 53 koma çentiği
  ctx.strokeStyle = 'rgba(239,230,214,0.18)'; ctx.lineWidth = 1;
  for (let k = 0; k < OCTAVE; k++) {
    const a = -Math.PI / 2 + (k / OCTAVE) * Math.PI * 2; const r2 = R - (k % 9 === 0 ? 9 : 5);
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(239,230,214,0.25)'; ctx.stroke();
  // 12 eşit ses konumları (piyano tuşları): halkanın dışında küçük işaretler
  ctx.fillStyle = 'rgba(160,190,230,0.55)';
  for (let s = 0; s < 12; s++) {
    const a = -Math.PI / 2 + (s / 12) * Math.PI * 2; const x = cx + Math.cos(a) * (R + 8); const y = cy + Math.sin(a) * (R + 8);
    ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
  }

  // Aralık yayları
  const oct = notes.slice(0, 8);
  ctx.lineCap = 'butt';
  for (let i = 0; i < 7; i++) {
    const L = INTERVAL[m.steps[i]];
    const a0 = ang(shown(oct[i])); const a1 = ang(shown(oct[i + 1]));
    ctx.strokeStyle = COLOR[L]; ctx.globalAlpha = 0.9; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(cx, cy, R - 18, a0 + 0.02, a1 - 0.02); ctx.stroke(); ctx.globalAlpha = 1;
    const am = (a0 + a1) / 2;
    ctx.fillStyle = COLOR[L]; ctx.font = '600 11px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(state.west ? `${Math.round(((a1 - a0) / (Math.PI * 2)) * 1200)}¢` : `${m.steps[i]}`, cx + Math.cos(am) * (R - 34), cy + Math.sin(am) * (R - 34));
  }

  // Dizinin çokgeni
  ctx.beginPath();
  oct.slice(0, 7).forEach((k, i) => { const [x, y] = pos(shown(k), R - 50); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.closePath(); ctx.fillStyle = 'rgba(214,167,86,0.08)'; ctx.fill(); ctx.strokeStyle = 'rgba(214,167,86,0.45)'; ctx.lineWidth = 1.2; ctx.stroke();

  // Perdeler
  oct.slice(0, 7).forEach((k, i) => {
    const g = Math.max(glow[i], glow[i + 7] || 0);
    const [x, y] = pos(shown(k));
    if (state.west && shown(k) !== k) {
      // Asıl perdenin yeri: kesik çizgili hayalet
      const [gx, gy] = pos(k); ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(239,230,214,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(gx, gy, 7, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    if (g > 0.02) {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, 30 * g + 8); grad.addColorStop(0, `rgba(255,214,140,${0.7 * g})`); grad.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, 30 * g + 8, 0, Math.PI * 2); ctx.fill();
    }
    const isKarar = i === 0; const isGuclu = i === m.guclu;
    ctx.fillStyle = isKarar ? '#d6a756' : isGuclu ? '#7fb3a5' : '#efe6d6';
    ctx.beginPath(); ctx.arc(x, y, isKarar || isGuclu ? 7.5 : 6, 0, Math.PI * 2); ctx.fill();
    // Etiket
    const a = ang(shown(k)); const lx = cx + Math.cos(a) * (R + 24); const ly = cy + Math.sin(a) * (R + 24);
    ctx.font = `${isKarar || isGuclu ? 600 : 500} 13px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = Math.cos(a) > 0.25 ? 'left' : Math.cos(a) < -0.25 ? 'right' : 'center';
    ctx.textBaseline = Math.sin(a) > 0.4 ? 'top' : Math.sin(a) < -0.4 ? 'bottom' : 'middle';
    ctx.fillStyle = `rgba(239,230,214,${0.75 + g * 0.25})`;
    ctx.fillText(perdeName(k), lx, ly);
  });

  // Merkez yazısı
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(239,230,214,0.9)'; ctx.font = "400 22px 'Iowan Old Style', Palatino, Georgia, serif";
  ctx.fillText(m.name, cx, cy - 8);
  ctx.fillStyle = 'rgba(163,154,140,0.9)'; ctx.font = '11px ui-monospace, Menlo, monospace';
  ctx.fillText(state.west ? '12 eşit ses' : '53 koma', cx, cy + 14);
}

// ------------------------------------------------------------------ adres ve durum
let hashTimer = 0;
function saveHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const q = new URLSearchParams({ m: state.makam.key }); if (state.voice !== 'ney') q.set('v', state.voice); if (state.west) q.set('w', '1');
    const h = `#${q}`; if (location.hash === h) return;
    try { history.replaceState(null, '', h); } catch { try { location.replace(h); } catch { /* adres değiştirilemiyor */ } }
  }, 200);
}
let sayTimer = 0;
function say(text) {
  ui.status.textContent = text; clearTimeout(sayTimer);
  sayTimer = setTimeout(() => { if (ui.status.textContent === text) ui.status.textContent = ''; }, 5000);
}

const q = new URLSearchParams(location.hash.slice(1));
if (q.get('v') === 'kanun') { state.voice = 'kanun'; ui.voices[1].checked = true; }
if (q.get('w') === '1') { state.west = true; ui.west.setAttribute('aria-pressed', 'true'); }
new ResizeObserver(resize).observe(canvas);
selectMakam(byKey(q.get('m')) || MAKAMS[0]);
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopSeyir(); for (const i of [...held.keys()]) noteOff(i); } });

// Test ve ölçüm için salt okunur durum
window.makam = Object.freeze({
  stats: () => ({ makam: state.makam.key, voice: state.voice, west: state.west, drone: state.drone, notes: notes.slice(), held: [...held.keys()], seyir: !!state.seyir, audio: audio.running() }),
});
