// F Daktilo — Türkçe F klavyeli daktilo.
// Kâğıt ayrı bir tuvalde tutulur; her vuruş harfi mürekkep dokusuyla oraya basar. Görünümde baskı
// noktası sabittir, kâğıt (şaryo) sola kayar; satır başında sağa döner, satır atlayınca yukarı çıkar.
import { ROWS, CODE_MAP, KEY_OF } from './klavye.js';
import * as ses from './ses.js';

const $ = (s) => document.querySelector(s);
const view = $('#kagit');
const vctx = view.getContext('2d');
const ui = {
  keys: $('#tuslar'), ribbon: [...document.querySelectorAll('input[name="serit"]')], spacing: [...document.querySelectorAll('input[name="aralik"]')],
  fmap: $('#fmap'), sound: $('#ses'), ink: $('#murekkep'), inkOut: $('#murekkep-out'), newRibbon: $('#serit-degistir'),
  pull: $('#cek'), copy: $('#kopyala'), share: $('#share'), shareBox: $('#sharebox'), shareLink: $('#share-link'),
  pos: $('#konum'), status: $('#status'),
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------ kâğıt (birim: kâğıt pikseli)
const COLS = 64; const CW = 12; const LH = 22; const ML = 60; const MT = 70; const LINES = 40;
const PW = ML * 2 + COLS * CW; const PH = MT * 2 + LINES * LH;
const RES = 2; // kâğıt tuvalinin birim başına pikseli
const MAX_H = LINES * 2; // yarım satır cinsinden son konum
const FS = 19.5;
const FONT = `600 ${FS}px "Courier New", Courier, "Nimbus Mono PS", "Liberation Mono", monospace`;
const paper = document.createElement('canvas'); paper.width = PW * RES; paper.height = PH * RES;
const pctx = paper.getContext('2d');
const glyph = document.createElement('canvas'); const GW = CW * 2.4; const GH = LH * 1.7; glyph.width = Math.ceil(GW * RES); glyph.height = Math.ceil(GH * RES);
const gctx = glyph.getContext('2d');

function freshPaper() {
  pctx.globalCompositeOperation = 'source-over'; pctx.globalAlpha = 1;
  pctx.fillStyle = '#f7f2e6'; pctx.fillRect(0, 0, paper.width, paper.height);
  // Lif dokusu: birkaç bin kısa, soluk çizgi
  const r = rng(7);
  for (let i = 0; i < 2600; i++) {
    pctx.strokeStyle = `rgba(${r() < 0.5 ? '120,100,70' : '255,255,255'},${0.04 + r() * 0.05})`;
    pctx.lineWidth = 0.6;
    const x = r() * paper.width; const y = r() * paper.height; const a = r() * 6.28; const l = 2 + r() * 8;
    pctx.beginPath(); pctx.moveTo(x, y); pctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); pctx.stroke();
  }
}
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
// Her harfin kendi kusuru: hep biraz yukarıda, aşağıda ya da yatık basar (gerçek daktilolardaki gibi).
const wearCache = new Map();
function wear(ch) {
  if (!wearCache.has(ch)) { const r = rng(ch.codePointAt(0) * 2654435761); wearCache.set(ch, { dx: (r() - 0.5) * 0.9, dy: (r() - 0.5) * 1.3, rot: (r() - 0.5) * 0.035, weak: r() < 0.25 ? 0.75 : 1 }); }
  return wearCache.get(ch);
}
const INK = { s: '#17151a', r: '#a32218' };
function inkChar(ch, col, yh, color, ink, seed) {
  const r = rng(seed * 9973 + 17);
  const w = wear(ch);
  gctx.setTransform(1, 0, 0, 1, 0, 0); gctx.globalCompositeOperation = 'source-over'; gctx.globalAlpha = 1;
  gctx.clearRect(0, 0, glyph.width, glyph.height);
  gctx.setTransform(RES, 0, 0, RES, 0, 0);
  gctx.translate(GW / 2 + w.dx + (r() - 0.5) * 0.7, GH * 0.68 + w.dy + (r() - 0.5) * 0.8);
  gctx.rotate(w.rot + (r() - 0.5) * 0.02);
  gctx.font = FONT; gctx.textAlign = 'center'; gctx.fillStyle = color;
  gctx.fillText(ch, 0, 0);
  // Mürekkep boşlukları ve eşit olmayan vuruş
  gctx.setTransform(1, 0, 0, 1, 0, 0);
  gctx.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 18; k++) { gctx.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.6})`; gctx.fillRect(r() * glyph.width, r() * glyph.height, 1 + r() * 2.2, 1 + r() * 2.2); }
  const a = r() * Math.PI * 2;
  const gr = gctx.createLinearGradient(glyph.width / 2 - Math.cos(a) * 20, glyph.height / 2 - Math.sin(a) * 20, glyph.width / 2 + Math.cos(a) * 20, glyph.height / 2 + Math.sin(a) * 20);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${0.12 + r() * 0.4})`);
  gctx.fillStyle = gr; gctx.fillRect(0, 0, glyph.width, glyph.height);
  // Kâğıda bas: çarpma kipiyle, üst üste basınca koyulaşır
  const x = ML + col * CW + CW / 2 - GW / 2; const y = MT + (yh / 2) * LH + LH * 0.78 - GH * 0.68;
  pctx.globalCompositeOperation = 'multiply';
  pctx.globalAlpha = Math.max(0.2, ink * w.weak * (0.72 + r() * 0.28));
  pctx.drawImage(glyph, x * RES, y * RES);
  // Hafif dağılma: aynı harf yarım piksel kayık, çok soluk
  pctx.globalAlpha *= 0.18;
  pctx.drawImage(glyph, x * RES + 1, y * RES + 0.6);
  pctx.globalAlpha = 1; pctx.globalCompositeOperation = 'source-over';
}

// ------------------------------------------------------------------ durum
let state = { text: '', fmap: false };
let col = 0; let yh = 0; let ribbon = 's'; let spacing = 2; let ink = 1; let strikes = 0; let shift = 0; // shift: 0 kapalı, 1 tek, 2 kilit
const grid = new Map(); // yarım satır → karakter dizisi (metni kopyalamak için)
let belled = false;

// Bir olay: harf, boşluk, '\n' satır başı, '\b' geri, '\t' sekme, '\x01' siyah, '\x02' kırmızı, '\x03'–'\x05' satır aralığı
function apply(ev, live) {
  if (ev === '\x01' || ev === '\x02') { ribbon = ev === '\x01' ? 's' : 'r'; return true; }
  if (ev >= '\x03' && ev <= '\x05') { spacing = ev.charCodeAt(0) - 1; return true; }
  if (ev === '\n') {
    if (yh + spacing > MAX_H) { if (live) { ses.clunk(); say('Sayfa doldu. Kâğıdı çek.', true); } return false; }
    const back = col; col = 0; yh += spacing; belled = false;
    if (live) { const d = ses.carriage(back); anim.returnFor = d; }
    return true;
  }
  if (ev === '\b') { if (col > 0) { col--; if (live) ses.space(); } return true; }
  if (ev === '\t') { const n = Math.min(COLS, (Math.floor(col / 5) + 1) * 5); if (n === col) return false; col = n; if (live) ses.space(); return true; }
  if (col >= COLS) { if (live) { ses.clunk(); say('Satır sonu: satır başı yap (Enter).'); } return false; }
  if (ev !== ' ') {
    inkChar(ev, col, yh, INK[ribbon], ink, strikes + 1);
    strikes++;
    ink = Math.max(0.32, ink - 0.00012);
    const row = grid.get(yh) || []; row[col] = ev; grid.set(yh, row);
    if (live) { ses.strike(0.85 + Math.random() * 0.3); anim.bar = 1; anim.barKey = ev; }
  } else if (live) ses.space();
  col++;
  // Sağ kenara altı harf kala zil
  if (col === COLS - 6 && !belled) { belled = true; if (live) { ses.bell(); anim.bellT = 1; } }
  return true;
}
function type(ev) {
  if (anim.pulling) return;
  if (!apply(ev, true)) return;
  state.text += ev;
  pressKey(ev);
  syncInfo(); saveHash(); request();
}

// ------------------------------------------------------------------ görünüm
let W = 0; let H = 0; let dpr = 1; let z = 1; let px = 0; let py = 0;
const anim = { col: 0, yh: 0, bar: 0, barKey: '', bellT: 0, returnFor: 0, pulling: 0, pullY: 0, insertY: 0 };
function layout() {
  const r = view.getBoundingClientRect();
  dpr = Math.min(devicePixelRatio || 1, 2);
  W = r.width; H = r.height;
  view.width = Math.round(W * dpr); view.height = Math.round(H * dpr);
  z = Math.max(0.78, Math.min(1.35, W / 760));
  px = W / 2; py = H * 0.66;
  request();
}
let raf = 0; let last = 0;
function request() { if (!raf) raf = requestAnimationFrame(frame); }
function frame(now) {
  raf = 0;
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
  last = now;
  // Şaryo: harfte bir diş hızla ilerler, satır başında daha yavaş geri döner.
  const k = reduced ? 1 : Math.min(1, dt * (anim.returnFor ? 9 : 34));
  anim.col += (col - anim.col) * k;
  anim.yh += (yh - anim.yh) * (reduced ? 1 : Math.min(1, dt * 14));
  if (Math.abs(col - anim.col) < 0.01) { anim.col = col; anim.returnFor = 0; }
  if (Math.abs(yh - anim.yh) < 0.01) anim.yh = yh;
  anim.bar = Math.max(0, anim.bar - dt * 14);
  anim.bellT = Math.max(0, anim.bellT - dt * 2);
  if (anim.pulling) {
    anim.pulling = Math.max(0, anim.pulling - dt * 1.6);
    anim.pullY = (1 - anim.pulling) ** 2 * (PH * z + H);
    if (!anim.pulling) finishPull();
  }
  if (anim.insertY > 0) anim.insertY = reduced ? 0 : Math.max(0, anim.insertY - dt * H * 2.2);
  draw();
  const busy = anim.col !== col || anim.yh !== yh || anim.bar > 0 || anim.bellT > 0 || anim.pulling || anim.insertY > 0;
  if (busy) raf = requestAnimationFrame(frame); else last = 0;
}
function draw() {
  const c = vctx;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  // Kâğıdın sol üst köşesi: baskı noktası (px, py) şimdiki hücrenin taban çizgisine denk gelir.
  const ox = px - (ML + anim.col * CW + CW / 2) * z;
  const oy = py - (MT + (anim.yh / 2) * LH + LH * 0.78) * z - anim.pullY + anim.insertY;
  const platenTop = py + 7 * z;
  // Kâğıt (merdanenin üstünde kalan kısmı)
  c.save();
  c.beginPath(); c.rect(0, 0, W, platenTop); c.clip();
  c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 18 * z; c.shadowOffsetY = 4;
  c.fillStyle = '#f7f2e6'; c.fillRect(ox, oy, PW * z, PH * z);
  c.shadowColor = 'transparent';
  c.drawImage(paper, ox, oy, PW * z, PH * z);
  c.restore();
  // Kâğıt tutucu çubuk ve küçük lastik makaralar
  const carL = ox - 46 * z; const carR = ox + PW * z + 46 * z;
  const bailY = py - LH * 1.35 * z;
  c.fillStyle = 'rgba(210,214,218,0.85)'; c.fillRect(carL + 20 * z, bailY - 1.5 * z, carR - carL - 40 * z, 3 * z);
  c.fillStyle = '#1b1b1d';
  for (const f of [0.28, 0.72]) { const rx = ox + PW * z * f; c.beginPath(); c.roundRect(rx - 7 * z, bailY - 4 * z, 14 * z, 8 * z, 3 * z); c.fill(); }
  // Merdane: siyah lastik silindir, iki ucunda topuz
  const ph = 46 * z;
  const g = c.createLinearGradient(0, platenTop, 0, platenTop + ph);
  g.addColorStop(0, '#3a3a3e'); g.addColorStop(0.18, '#1a1a1d'); g.addColorStop(0.55, '#0d0d0f'); g.addColorStop(1, '#2a2a2e');
  c.fillStyle = g; c.fillRect(carL, platenTop, carR - carL, ph);
  for (const kx of [carL - 18 * z, carR]) {
    const kg = c.createLinearGradient(kx, 0, kx + 18 * z, 0);
    kg.addColorStop(0, '#2c2c30'); kg.addColorStop(0.5, '#5c5c62'); kg.addColorStop(1, '#202024');
    c.fillStyle = kg; c.beginPath(); c.roundRect(kx, platenTop - 4 * z, 18 * z, ph + 8 * z, 6 * z); c.fill();
  }
  // Cetvel: her sütunda çentik, onlarda rakam; şaryoyla kayar
  const ry = platenTop + 4 * z;
  c.fillStyle = 'rgba(232,226,210,0.92)'; c.fillRect(ox + (ML - 12) * z, ry, (COLS * CW + 24) * z, 13 * z);
  c.fillStyle = '#2a261f'; c.font = `${8 * z}px ui-monospace, Menlo, monospace`; c.textAlign = 'center';
  for (let i = 0; i <= COLS; i++) {
    const x = ox + (ML + i * CW) * z;
    const tall = i % 10 === 0 ? 5 : i % 5 === 0 ? 3.5 : 2;
    c.fillRect(x - 0.4, ry, 0.8, tall * z);
    if (i % 10 === 0 && i) c.fillText(String(i), x, ry + 12 * z);
  }
  // Sağ kenar işareti
  c.fillStyle = '#a32218'; c.fillRect(ox + (ML + (COLS - 6) * CW) * z - 1, ry, 2, 13 * z);
  // Şerit: vuruşta kalkar, renk seçiliyse kırmızı yarısı yukarıda
  const lift = anim.bar > 0 ? 1 : 0;
  const rw = 34 * z; const rTop = py - (lift ? 16 : -2) * z; const rH = (lift ? 22 : 9) * z;
  c.fillStyle = ribbon === 'r' ? '#8f1d15' : '#141317';
  c.fillRect(px - rw / 2, rTop, rw, rH / 2);
  c.fillStyle = ribbon === 'r' ? '#141317' : '#8f1d15';
  c.fillRect(px - rw / 2, rTop + rH / 2, rw, rH / 2);
  // Kart tutucu: baskı noktasını gösteren şeffaf parça
  c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(px - 16 * z, py + 3 * z); c.lineTo(px - 6 * z, py + 3 * z); c.moveTo(px + 6 * z, py + 3 * z); c.lineTo(px + 16 * z, py + 3 * z); c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.beginPath(); c.moveTo(px - 4 * z, py + 6 * z); c.lineTo(px + 4 * z, py + 6 * z); c.lineTo(px, py + 2 * z); c.fill();
  // Harf kolu: tuşun yerinden baskı noktasına uzanan metal çubuk
  if (anim.bar > 0) {
    const key = KEY_OF.get(anim.barKey) || '2-5';
    const [r_, c_] = key.split('-').map(Number);
    const frac = (c_ + 0.5) / ROWS[r_].length;
    const bx = px + (frac - 0.5) * W * 0.55;
    const bg = c.createLinearGradient(bx, H, px, py);
    bg.addColorStop(0, 'rgba(70,72,78,0)'); bg.addColorStop(0.5, 'rgba(150,154,162,0.9)'); bg.addColorStop(1, 'rgba(220,224,230,1)');
    c.strokeStyle = bg; c.lineWidth = 4 * z; c.lineCap = 'round';
    c.globalAlpha = Math.min(1, anim.bar * 1.4);
    c.beginPath(); c.moveTo(bx, H + 10); c.lineTo(px, py - 4 * z); c.stroke();
    c.globalAlpha = 1;
  }
  // Zil anında küçük bir parıltı
  if (anim.bellT > 0) {
    c.fillStyle = `rgba(255,214,120,${anim.bellT * 0.6})`;
    c.beginPath(); c.arc(carR + 9 * z, platenTop - 14 * z, 6 * z + (1 - anim.bellT) * 10 * z, 0, 7); c.fill();
  }
}

// ------------------------------------------------------------------ ekran klavyesi
const keyEls = new Map();
function buildKeys() {
  ROWS.forEach((row, r) => {
    const el = document.createElement('div'); el.className = `sira s${r}`;
    row.forEach(([lo, up], c) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tus'; b.tabIndex = -1;
      b.dataset.lo = lo; b.dataset.up = up;
      b.innerHTML = /[a-zçğıöşü]/.test(lo) ? `<span>${up}</span>` : `<small>${up}</small><span>${lo}</span>`;
      b.setAttribute('aria-label', lo === up ? lo : `${lo}, üst karakter ${up}`);
      keyEls.set(`${r}-${c}`, b);
      el.appendChild(b);
    });
    // Geri ve satır başı geniş ekranda sıraların sonunda, telefonda alt sırada (style.css'te gizlenir)
    if (r === 0) el.appendChild(special('geri genis', '⌫', 'Geri', () => type('\b')));
    if (r === 2) el.appendChild(special('donus genis', '↵', 'Satır başı', () => type('\n')));
    ui.keys.appendChild(el);
  });
  const bottom = document.createElement('div'); bottom.className = 'sira alt';
  bottom.appendChild(special('buyuk', 'Büyük', 'Büyük harf (iki kez: kilit)', toggleShift));
  bottom.appendChild(special('renk', 'Renk', 'Şerit rengini değiştir', () => setRibbon(ribbon === 's' ? 'r' : 's')));
  bottom.appendChild(special('bosluk', '', 'Boşluk', () => type(' ')));
  bottom.appendChild(special('geri dar', '⌫', 'Geri', () => type('\b')));
  bottom.appendChild(special('donus dar', '↵', 'Satır başı', () => type('\n')));
  ui.keys.appendChild(bottom);
}
function special(cls, label, aria, fn) {
  const b = document.createElement('button'); b.type = 'button'; b.className = `tus ozel ${cls}`; b.tabIndex = -1;
  b.textContent = label; b.setAttribute('aria-label', aria);
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); ses.audio(); fn(); flash(b); });
  return b;
}
ui.keys.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.tus:not(.ozel)');
  if (!b) return;
  e.preventDefault(); ses.audio();
  type(shift ? b.dataset.up : b.dataset.lo);
  if (shift === 1) { shift = 0; syncShift(); }
});
function flash(b) { b.classList.add('bas'); setTimeout(() => b.classList.remove('bas'), 110); }
function pressKey(ch) { const k = KEY_OF.get(ch); const b = k && keyEls.get(k); if (b) flash(b); if (ch === ' ') flash($('.tus.bosluk')); if (ch === '\n') document.querySelectorAll('.tus.donus').forEach(flash); if (ch === '\b') document.querySelectorAll('.tus.geri').forEach(flash); }
function toggleShift() { shift = shift === 0 ? 1 : shift === 1 ? 2 : 0; syncShift(); say(shift === 2 ? 'Büyük harf kilitli.' : shift === 1 ? 'Büyük harf.' : 'Küçük harf.'); }
function syncShift() { ui.keys.classList.toggle('ust', shift > 0); $('.tus.buyuk').classList.toggle('kilit', shift === 2); $('.tus.buyuk').setAttribute('aria-pressed', String(shift > 0)); }

// ------------------------------------------------------------------ fiziksel klavye
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t instanceof HTMLInputElement && t.type === 'text') return;
  if (e.metaKey || (e.ctrlKey && !e.altKey)) return;
  if (t instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return;
  ses.audio();
  if (e.key === 'Enter') { e.preventDefault(); type('\n'); return; }
  if (e.key === 'Backspace') { e.preventDefault(); type('\b'); return; }
  if (e.key === 'Tab' && !(t instanceof HTMLInputElement) && t.closest?.('.panel') === null) { e.preventDefault(); type('\t'); return; }
  let ch = null;
  if (state.fmap && CODE_MAP.has(e.code)) {
    const [lo, up] = CODE_MAP.get(e.code);
    const caps = e.getModifierState?.('CapsLock') && lo !== up && /\p{L}/u.test(lo);
    ch = e.shiftKey !== !!caps ? up : lo;
  } else if (e.key.length === 1 || [...e.key].length === 1) ch = e.key;
  if (!ch || /[\x00-\x1f]/.test(ch)) return;
  if (t instanceof HTMLInputElement && t.type === 'range') return;
  e.preventDefault();
  type(ch);
});

// ------------------------------------------------------------------ panel
function setRibbon(r) { if (r === ribbon) return; type(r === 's' ? '\x01' : '\x02'); syncUi(); say(r === 's' ? 'Siyah şerit.' : 'Kırmızı şerit.'); }
for (const r of ui.ribbon) r.addEventListener('change', () => setRibbon(r.value));
for (const r of ui.spacing) r.addEventListener('change', () => { const v = +r.value; if (v !== spacing) { type(String.fromCharCode(v + 1)); say(`Satır aralığı ${({ 2: '1', 3: '1,5', 4: '2' })[v]}`); } syncUi(); });
ui.fmap.addEventListener('change', () => { state.fmap = ui.fmap.checked; saveHash(); say(state.fmap ? 'Q klavyende tuşlar F düzenine göre basar.' : 'Klavyen kendi düzeniyle basar.'); });
ui.sound.addEventListener('change', () => { ses.setEnabled(ui.sound.checked); });
ui.newRibbon.addEventListener('click', () => { ink = 1; syncInfo(); say('Yeni şerit takıldı.'); });
ui.pull.addEventListener('click', () => {
  if (anim.pulling) return;
  ses.audio(); ses.pull();
  anim.pulling = 1; anim.pullY = 0;
  if (reduced) { anim.pulling = 0.0001; }
  request();
});
function finishPull() {
  // Çekilen sayfa indirilir, yerine boş kâğıt takılır.
  const had = strikes > 0;
  if (had) {
    paper.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `daktilo-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  }
  resetPage(); anim.pullY = 0; anim.insertY = H * 0.9;
  say(had ? 'Sayfa çekildi ve indirildi. Yeni kâğıt takıldı.' : 'Yeni kâğıt takıldı.');
  syncInfo(); saveHash(); request();
}
function resetPage() {
  freshPaper(); grid.clear(); col = 0; yh = 0; strikes = 0; belled = false; anim.col = 0; anim.yh = 0;
  state.text = (ribbon === 'r' ? '\x02' : '') + (spacing !== 2 ? String.fromCharCode(spacing + 1) : '');
}
function plainText() {
  const keys = [...grid.keys()].sort((a, b) => a - b);
  if (!keys.length) return '';
  const out = [];
  for (let y = 0; y <= keys[keys.length - 1]; y++) {
    if (!grid.has(y)) { if (y % 2 === 0) out.push(''); continue; }
    const row = grid.get(y); out.push(Array.from(row, (ch) => ch || ' ').join('').trimEnd());
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
ui.copy.addEventListener('click', async () => {
  const txt = plainText();
  if (!txt) { say('Kâğıt boş.'); return; }
  try { await navigator.clipboard.writeText(txt); say('Metin kopyalandı.'); } catch { say('Pano erişimi kapalı; metin kopyalanamadı.', true); }
});
function syncUi() {
  for (const r of ui.ribbon) r.checked = r.value === ribbon;
  for (const r of ui.spacing) r.checked = +r.value === spacing;
  ui.fmap.checked = state.fmap;
  $('.tus.renk')?.classList.toggle('kirmizi', ribbon === 'r');
}
function syncInfo() {
  ui.ink.value = ink; ui.inkOut.value = `%${Math.round(ink * 100)}`;
  ui.pos.textContent = `Satır ${Math.floor(yh / 2) + 1} · sütun ${col + 1}`;
  view.setAttribute('aria-label', `Daktilodaki kâğıt: ${strikes} harf basıldı, satır ${Math.floor(yh / 2) + 1}, sütun ${col + 1}.`);
}

ui.share.addEventListener('click', async () => {
  if (state.text.length > LIMIT) { say('Sayfa bağlantıya sığmayacak kadar uzun; "Kâğıdı çek" ile resim olarak indir.', true); return; }
  const url = `${location.href.split('#')[0]}#${encode(state)}`;
  ui.shareLink.value = url;
  try { await navigator.clipboard.writeText(url); ui.shareBox.hidden = true; say('Bağlantı kopyalandı. Açan kişi aynı sayfayı görür.', true); return; } catch { /* pano kapalı */ }
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

// ------------------------------------------------------------------ adres: F eşlemesi ve sayfanın bütün vuruşları
const LIMIT = 2400;
const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
function encode(s) { return `${s.fmap ? 1 : 0}.${b64(s.text)}`; }
function decode(text) {
  const m = /^([01])\.([A-Za-z0-9_-]*)$/.exec(text);
  if (!m) return null;
  try { return { fmap: m[1] === '1', text: unb64(m[2]).slice(0, LIMIT) }; } catch { return null; }
}
let hashTimer = 0;
const history_ = window.history;
function saveHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    if (state.text.length > LIMIT) return;
    const h = `#${encode(state)}`;
    if (location.hash === h) return;
    try { history_.replaceState(null, '', h); } catch { try { location.replace(h); } catch { /* adres değiştirilemiyor */ } }
  }, 400);
}

// ------------------------------------------------------------------ başlangıç
buildKeys();
freshPaper();
const fromHash = location.hash.length > 1 ? decode(decodeURIComponent(location.hash.slice(1))) : null;
if (fromHash) {
  state.fmap = fromHash.fmap;
  for (const ev of fromHash.text) if (apply(ev, false)) state.text += ev;
  anim.col = col; anim.yh = yh;
  if (strikes) say(`Bağlantıdaki sayfa yazıldı: ${strikes} harf.`, true);
} else if (location.hash.length > 1) say('Bağlantıdaki sayfa okunamadı; boş kâğıt takıldı.', true);
syncUi(); syncInfo();
layout();
new ResizeObserver(layout).observe(view);

// Test ve ölçüm için salt okunur durum
window.daktilo = Object.freeze({
  stats: () => ({ chars: strikes, col, line: Math.floor(yh / 2) + 1, yh, ink: +ink.toFixed(4), ribbon, spacing, fmap: state.fmap, textLength: state.text.length }),
  hash: () => encode(state),
  type: (s) => { for (const ch of s) type(ch); },
  text: () => plainText(),
});
