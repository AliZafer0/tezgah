// Ebru — arayüz, araçlar, desenler, geri alma, kâğıda basma ve isteğe bağlı su sesi.
// Çizim yalnızca bir şey değiştiğinde yapılır; boşta döngü çalışmaz.
import { Marble } from './marbling.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#tekne');
const ctx = canvas.getContext('2d', { alpha: false });
const ui = {
  tools: [...document.querySelectorAll('input[name="tool"]')],
  colors: [...document.querySelectorAll('input[name="renk"]')],
  size: $('#size'), sizeOut: $('#size-out'),
  undo: $('#undo'), clear: $('#clear'), print: $('#print'), sound: $('#sound'),
  presets: [...document.querySelectorAll('[data-desen]')], status: $('#status'), hint: $('#hint'),
};
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Geleneksel ebru boyalarını çağrıştıran palet (toprak boyalar ve çivit)
export const PALETTE = {
  civit: '#2f4a7a', lahor: '#4f6fa3', toprak: '#c99a3c', al: '#9e3b2e', gul: '#c48b86', zeytin: '#6f7a3e', is: '#2b2724', ustubec: '#f2ece0',
};
const WATER = '#ece2cc';

const state = { tool: 'damla', color: 'civit', size: 40, sound: false, busy: false };
let W = 0; let H = 0; let dpr = 1;
const marble = new Marble(1, 1);
const history = [];

// ------------------------------------------------------------------ çizim
let paper = null; // suyun/kâğıdın dokusu: bir kez üretilir
function makePaper() {
  paper = document.createElement('canvas'); paper.width = Math.max(1, Math.round(W * dpr)); paper.height = Math.max(1, Math.round(H * dpr));
  const p = paper.getContext('2d'); p.fillStyle = WATER; p.fillRect(0, 0, paper.width, paper.height);
  const img = p.getImageData(0, 0, paper.width, paper.height); const d = img.data;
  let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 9; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.8; }
  p.putImageData(img, 0, 0);
}
function vary(hex, seed) {
  // Aynı renkteki damlalar arasında çok hafif ton farkı (boyanın doğal değişkenliği)
  const c = parseInt(hex.slice(1), 16); const k = 1 + ((seed * 9301 + 49297) % 233280 / 233280 - 0.5) * 0.08;
  const r = Math.min(255, ((c >> 16) & 255) * k) | 0; const g = Math.min(255, ((c >> 8) & 255) * k) | 0; const b = Math.min(255, (c & 255) * k) | 0;
  return `rgb(${r},${g},${b})`;
}
let dirty = true; let raf = 0;
function requestDraw() { dirty = true; if (!raf) raf = requestAnimationFrame(frame); }
function draw(target = ctx, scale = dpr) {
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.drawImage(paper, 0, 0, target.canvas.width, target.canvas.height);
  target.setTransform(scale, 0, 0, scale, 0, 0);
  target.lineJoin = 'round';
  for (const ink of marble.inks) {
    const p = ink.pts;
    target.beginPath(); target.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) target.lineTo(p[i], p[i + 1]);
    target.closePath();
    target.fillStyle = ink.fill; target.fill();
    // Boyanın kenarında ince koyu halka (gerçek ebrudaki kenar çizgisi)
    target.strokeStyle = 'rgba(40,28,20,0.22)'; target.lineWidth = 0.7; target.stroke();
  }
}
function drawCursor() {
  if (!kbd.on) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = 'rgba(30,30,30,0.7)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(kbd.x, kbd.y, Math.max(6, state.size * 0.5), 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(kbd.x - 8, kbd.y); ctx.lineTo(kbd.x + 8, kbd.y); ctx.moveTo(kbd.x, kbd.y - 8); ctx.lineTo(kbd.x, kbd.y + 8); ctx.stroke();
}

// Tek döngü: yalnızca bekleyen animasyon adımı ya da çizim varsa çalışır
const queue = []; // animasyon adımları: () => void
function frame() {
  raf = 0;
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < 10) queue.shift()();
  if (queue.length) { marble.tidy(); budget(); dirty = true; }
  if (dirty) { draw(); drawCursor(); dirty = false; }
  if (queue.length) raf = requestAnimationFrame(frame);
  else { state.busy = false; describe(); }
}
// Nokta bütçesi: çok sayıda damlada kenar çözünürlüğü kademeli düşer
function budget() {
  const n = marble.pointCount();
  marble.maxLen = n > 140000 ? 6 : n > 90000 ? 4.5 : 3.2;
}

// ------------------------------------------------------------------ işlemler
let seedCounter = 1;
function pushHistory() { history.push(marble.snapshot()); if (history.length > 15) history.shift(); ui.undo.disabled = false; }

function dropAt(x, y, r, colorKey, steps = reduced ? 1 : 8) {
  const ink = marble.addDrop(x, y, null);
  ink.fill = vary(PALETTE[colorKey], seedCounter++); ink.color = colorKey;
  const r2 = r * r; const per = r2 / steps;
  for (let i = 0; i < steps; i++) queue.push(() => { marble.drop(x, y, per); });
  queue.push(() => marble.tidy());
  sound.drop(r);
}
function sprinkle(x, y, spread, n, colorKey) {
  // Serpme: fırçadan silkelenen küçük damlalar (dağınık, farklı boyda)
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2; const d = Math.sqrt(Math.random()) * spread;
    const r = 3 + Math.random() * (state.size * 0.22);
    const cx = x + Math.cos(a) * d; const cy = y + Math.sin(a) * d;
    queue.push(() => { const ink = marble.addDrop(cx, cy, null); ink.fill = vary(PALETTE[colorKey], seedCounter++); ink.color = colorKey; marble.drop(cx, cy, r * r); });
  }
  queue.push(() => marble.tidy());
  sound.sprinkle();
}
function finish(label) { state.busy = true; state.last = label; requestDraw(); }

function apply(tool, x, y) {
  pushHistory();
  if (tool === 'damla') dropAt(x, y, state.size, state.color);
  else if (tool === 'serpme') sprinkle(x, y, state.size * 2.2, 14, state.color);
  else if (tool === 'girdap') { queue.push(() => { marble.vortex(x, y, state.size * 1.4, state.size * 2.6, state.size * 0.6); marble.tidy(); }); sound.swirl(); }
  else if (tool === 'tarak') { queue.push(() => { marble.comb('v', Math.max(14, state.size * 0.7), state.size * 1.4, 7); marble.tidy(); }); sound.swirl(); }
  else if (tool === 'gelgit') { queue.push(() => { marble.comb('v', Math.max(18, state.size), state.size * 2.2, Math.max(8, state.size * 0.45), x % 40, true); marble.tidy(); }); sound.swirl(); }
  finish(tool);
}

// Biz: sürükleme yolu boyunca boyayı çeker
let drag = null;
function stylusMove(x, y) {
  if (!drag) return;
  const dx = x - drag.x; const dy = y - drag.y; const L = Math.hypot(dx, dy);
  if (L < 2) return;
  marble.stylus(drag.x, drag.y, x, y, L, Math.max(4, state.size * 0.18));
  drag.x = x; drag.y = y; drag.moved += L;
  if (drag.moved > 60) { marble.tidy(); budget(); drag.moved = 0; }
  sound.drag(L);
  requestDraw();
}

// ------------------------------------------------------------------ desenler
function clearAll(push = true) { if (push) pushHistory(); marble.inks = []; queue.length = 0; }
const rand = (a, b) => a + Math.random() * (b - a);
const PRESETS = {
  battal() {
    // Battal: yüzey tamamen kaplanana dek renk renk serpilir; sonraki damlalar öncekileri damarlara sıkıştırır
    clearAll();
    const k = Math.sqrt((W * H) / 1e6);
    for (const [c, n, r0, r1] of [['toprak', 70, 40, 75], ['civit', 130, 16, 38], ['al', 100, 11, 28], ['ustubec', 90, 6, 17]]) {
      for (let i = 0; i < n; i++) { const x = rand(0, W); const y = rand(0, H); const r = rand(r0, r1) * k; queue.push(() => { const d = marble.addDrop(x, y, null); d.fill = vary(PALETTE[c], seedCounter++); d.color = c; marble.drop(x, y, r * r); }); }
      queue.push(() => { marble.tidy(); budget(); });
    }
  },
  gelgit() {
    PRESETS.battal();
    queue.push(() => { marble.comb('v', 40, 95, 18, 12, true); marble.tidy(); budget(); });
  },
  tarakli() {
    PRESETS.gelgit();
    queue.push(() => { marble.comb('h', 16, 34, 5, 6); marble.tidy(); budget(); });
  },
  lale() {
    // Deneme: zemin battalı üzerine iç içe damlalar ve yukarı doğru biz çekişleriyle lale benzeri bir form
    clearAll();
    for (let i = 0; i < 90; i++) { const x = rand(0, W); const y = rand(0, H); const r = rand(5, 14); queue.push(() => { const k = marble.addDrop(x, y, null); k.fill = vary(PALETTE.toprak, seedCounter++); k.color = 'toprak'; marble.drop(x, y, r * r); }); }
    const cx = W * 0.55; const cy = H * 0.52; const R = Math.min(W, H) * 0.12;
    for (const [c, r] of [['al', R], ['gul', R * 0.62], ['ustubec', R * 0.32]]) queue.push(() => { const k = marble.addDrop(cx, cy, null); k.fill = vary(PALETTE[c], seedCounter++); k.color = c; marble.drop(cx, cy, r * r); marble.tidy(); });
    // Sap: aşağıdan yukarı yeşil damlalar dizisi ve çekiş
    for (let i = 1; i <= 5; i++) { const y = cy + R * 0.9 + i * R * 0.42; queue.push(() => { const k = marble.addDrop(cx, y, null); k.fill = vary(PALETTE.zeytin, seedCounter++); k.color = 'zeytin'; marble.drop(cx, y, (R * 0.2) ** 2); }); }
    const pull = (x0, y0, x1, y1, c) => { const n = 24; for (let i = 0; i < n; i++) { const a = i / n; const b = (i + 1) / n; queue.push(() => marble.stylus(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, x0 + (x1 - x0) * b, y0 + (y1 - y0) * b, Math.hypot(x1 - x0, y1 - y0) / n, c)); } queue.push(() => marble.tidy()); };
    pull(cx, cy + R * 3.2, cx, cy - R * 0.4, R * 0.14);            // sap ve çanağın ortası
    pull(cx - R * 0.55, cy + R * 0.6, cx - R * 0.7, cy - R * 1.3, R * 0.12); // sol taç yaprağı
    pull(cx + R * 0.55, cy + R * 0.6, cx + R * 0.7, cy - R * 1.3, R * 0.12); // sağ taç yaprağı
    pull(cx, cy + R * 0.3, cx, cy - R * 1.6, R * 0.1);              // orta uç
  },
};

// ------------------------------------------------------------------ ses (isteğe bağlı, sentez)
const sound = (() => {
  let ac = null; let lastDrag = 0;
  const ensure = () => { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; };
  function plip(freq, vol) {
    const a = ensure(); const t = a.currentTime;
    const o = a.createOscillator(); const g = a.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq * 1.6, t); o.frequency.exponentialRampToValueAtTime(freq, t + 0.09);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.3);
  }
  function hush(dur, vol, f) {
    const a = ensure(); const t = a.currentTime; const n = Math.floor(a.sampleRate * dur);
    const b = a.createBuffer(1, n, a.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / n);
    const s = a.createBufferSource(); s.buffer = b; const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 0.7;
    const g = a.createGain(); g.gain.value = vol; s.connect(bp); bp.connect(g); g.connect(a.destination); s.start(t);
  }
  return {
    drop(r) { if (state.sound) plip(900 - Math.min(500, r * 6), 0.12); },
    sprinkle() { if (!state.sound) return; for (let i = 0; i < 6; i++) setTimeout(() => plip(rand(900, 1500), 0.04), i * 45); },
    swirl() { if (state.sound) hush(0.7, 0.05, 900); },
    drag(L) { const now = performance.now(); if (state.sound && now - lastDrag > 120) { lastDrag = now; hush(0.14, Math.min(0.04, L / 600), 1200); } },
  };
})();

// ------------------------------------------------------------------ arayüz
const TOOL_HINTS = {
  damla: 'Suya dokun: boya damlası yüzeyi iter.', serpme: 'Dokun: fırçadan küçük damlalar serpilir.', biz: 'Sürükle: biz (ince çubuk) boyayı çeker.',
  tarak: 'Dokun: yukarıdan aşağı ince bir tarak geçer.', gelgit: 'Dokun: dikey dişlerle ileri-geri gelgit çekişi.', girdap: 'Dokun: o noktada boya döner.',
};
function describe() {
  const n = marble.inks.length;
  canvas.setAttribute('aria-label', n ? `Ebru teknesi: ${n} boya lekesi. Son işlem: ${state.last || '—'}.` : 'Boş ebru teknesi. Bir araç seçip suya dokunun.');
}
function say(t) { ui.status.textContent = ''; requestAnimationFrame(() => { ui.status.textContent = t; }); }
function pos(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId); kbd.on = false;
  const [x, y] = pos(e);
  if (state.tool === 'biz') { pushHistory(); drag = { x, y, moved: 0 }; state.last = 'biz'; return; }
  apply(state.tool, x, y);
});
canvas.addEventListener('pointermove', (e) => { if (drag) { const [x, y] = pos(e); stylusMove(x, y); } });
const endDrag = () => { if (drag) { drag = null; marble.tidy(); budget(); requestDraw(); describe(); } };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);

// Klavye: oklar imleci taşır (Shift ile biz çeker), Enter/Boşluk seçili aracı uygular
const kbd = { on: false, x: 0, y: 0 };
canvas.addEventListener('keydown', (e) => {
  const step = e.altKey ? 4 : 16;
  const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (mv) {
    e.preventDefault();
    if (!kbd.on) { kbd.on = true; kbd.x = W / 2; kbd.y = H / 2; }
    const nx = Math.max(0, Math.min(W, kbd.x + mv[0])); const ny = Math.max(0, Math.min(H, kbd.y + mv[1]));
    if (e.shiftKey && state.tool === 'biz') { if (!drag) { pushHistory(); drag = { x: kbd.x, y: kbd.y, moved: 0 }; } stylusMove(nx, ny); } else endDrag();
    kbd.x = nx; kbd.y = ny; requestDraw();
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (!kbd.on) { kbd.on = true; kbd.x = W / 2; kbd.y = H / 2; }
    if (state.tool !== 'biz') apply(state.tool, kbd.x, kbd.y);
  }
});
canvas.addEventListener('keyup', (e) => { if (e.key === 'Shift') endDrag(); });
canvas.addEventListener('blur', () => { kbd.on = false; endDrag(); requestDraw(); });

for (const r of ui.tools) r.addEventListener('change', () => { if (r.checked) { state.tool = r.value; ui.hint.textContent = TOOL_HINTS[r.value]; } });
for (const r of ui.colors) r.addEventListener('change', () => { if (r.checked) state.color = r.value; });
ui.size.addEventListener('input', () => { state.size = Number(ui.size.value); ui.sizeOut.textContent = `${state.size} px`; });
ui.undo.addEventListener('click', () => {
  if (!history.length) return;
  queue.length = 0; marble.restore(history.pop()); ui.undo.disabled = !history.length; state.last = 'geri alma'; requestDraw(); describe(); say('Son işlem geri alındı.');
});
ui.clear.addEventListener('click', () => { clearAll(); state.last = 'temizleme'; requestDraw(); describe(); say('Tekne temizlendi.'); });
ui.sound.addEventListener('click', () => {
  state.sound = !state.sound; ui.sound.setAttribute('aria-pressed', String(state.sound)); ui.sound.textContent = state.sound ? 'Ses: açık' : 'Ses: kapalı';
  if (state.sound) sound.drop(20);
});
for (const b of ui.presets) b.addEventListener('click', () => {
  PRESETS[b.dataset.desen](); finish(`${b.textContent} deseni`); say(`${b.textContent} deseni hazırlanıyor.`); sound.swirl();
});
ui.print.addEventListener('click', () => {
  // Kâğıda basma: yüzeyi iki kat çözünürlükte PNG olarak indir
  const out = document.createElement('canvas'); const s = 2; out.width = Math.round(W * s); out.height = Math.round(H * s);
  draw(out.getContext('2d'), s);
  // Opak kökenli (sandbox) belgede blob bağlantısı hemen kaldırılırsa indirme iptal olabiliyor:
  // bağlantı bir süre belgede kalır; blob üretilemezse veri URL'sine düşülür.
  const save = (href, revoke) => {
    const a = document.createElement('a'); a.href = href; a.download = `ebru-${Date.now()}.png`; a.hidden = true;
    document.body.append(a); a.click();
    setTimeout(() => { a.remove(); if (revoke) URL.revokeObjectURL(href); }, 30000);
    say('Ebru kâğıda basıldı (PNG indirildi).');
  };
  out.toBlob((blob) => { if (blob) save(URL.createObjectURL(blob), true); else save(out.toDataURL('image/png'), false); }, 'image/png');
});

// ------------------------------------------------------------------ boyut
function resize() {
  const r = canvas.getBoundingClientRect();
  const nw = Math.round(r.width); const nh = Math.round(r.height);
  if (!nw || !nh) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = nw; H = nh; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  marble.resize(W, H); makePaper(); requestDraw();
}
new ResizeObserver(resize).observe(canvas);
resize();

// İlk açılış: boş tekne yerine sakin bir battal zemin
PRESETS.battal(); history.length = 0; ui.undo.disabled = true; state.last = 'battal zemin'; requestDraw();

// Test ve ölçüm için salt okunur durum
window.ebru = Object.freeze({
  stats: () => ({ inks: marble.inks.length, points: marble.pointCount(), queue: queue.length, running: !!raf, tool: state.tool, history: history.length }),
});
