// Kilim — tezgâh, dokuma animasyonu, motif damgası, simetri, geri alma, adreste saklama ve PNG.
// Çizim yalnızca bir şey değiştiğinde yapılır; dokuma animasyonu dışında döngü çalışmaz.
import { COLS, ROWS, PALETTE, PAIR, MOTIFS, idx, inside, mirrors, setCell, stamp, flood, generate, encode, decode } from './motifs.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#tezgah');
const ctx = canvas.getContext('2d', { alpha: false });
const panel = $('.panel');
const ui = {
  tools: [...document.querySelectorAll('input[name="tool"]')],
  syms: [...document.querySelectorAll('input[name="sym"]')],
  motifs: $('#motifs'), motifSet: $('#motif-set'), swatches: $('#swatches'), hint: $('#hint'),
  undo: $('#undo'), fresh: $('#new'), weave: $('#weave'), share: $('#share'), png: $('#png'),
  shareBox: $('#sharebox'), shareLink: $('#share-link'), status: $('#status'),
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const HEX = PALETTE.map((p) => p.hex);
const WARP = '#e9dcc0';

const state = { tool: 'motif', motif: 0, color: 4, sym: 2 };
let grid = new Uint8Array(COLS * ROWS);
const history = [];

// ------------------------------------------------------------------ yerleşim (cihaz pikseli)
let dpr = 1; let L = null; // { S, CH, x0, y0, F, beam }
function layout() {
  const r = canvas.getBoundingClientRect();
  dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
  const pr = panel.getBoundingClientRect();
  const mobile = pr.top > r.height * 0.3;
  let ax = 24; let ay = 64; let aw = r.width - 48; let ah = r.height - 88;
  if (!mobile) { ax = pr.right + 24; aw = r.width - ax - 24; } else { ay = 40; ah = pr.top - ay - 12; }
  // Hücre en/boy oranı: atkı sıraları çözgüden sıktır, hücre enine biraz geniş görünür
  const ratio = 0.78;
  const sCss = Math.max(3, Math.min(aw / (COLS + 2), ah / (ROWS * ratio + 9)));
  const S = Math.max(3, Math.floor(sCss * dpr)); const CH = Math.max(2, Math.round(S * ratio));
  const F = Math.round(S * 2.6); const beam = Math.max(6, Math.round(S * 1.3));
  const kw = COLS * S; const kh = ROWS * CH;
  const x0 = Math.round((ax + aw / 2) * dpr - kw / 2);
  const y0 = Math.round((ay + ah / 2) * dpr - kh / 2);
  L = { S, CH, x0, y0, F, beam, kw, kh };
  makeTile();
}

// Atkı dokusu: bir hücrelik karo, tüm dokunmuş alana desen olarak bindirilir
let tile = null;
function makeTile() {
  const c = document.createElement('canvas'); c.width = L.S; c.height = L.CH;
  const t = c.getContext('2d');
  const step = Math.max(2, Math.round(L.CH / 4));
  for (let y = 0; y < L.CH; y += step) {
    t.fillStyle = (y / step) % 2 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.07)';
    t.fillRect(0, y, L.S, Math.max(1, step >> 1));
  }
  t.fillStyle = 'rgba(0,0,0,0.13)'; t.fillRect(0, L.CH - 1, L.S, 1);
  t.fillStyle = 'rgba(255,255,255,0.05)'; t.fillRect(Math.round(L.S * 0.25), 0, 1, L.CH); t.fillRect(Math.round(L.S * 0.75), 0, 1, L.CH);
  tile = ctx.createPattern(c, 'repeat');
}

// ------------------------------------------------------------------ çizim
function drawWall(g, w, h) {
  g.fillStyle = '#231c18'; g.fillRect(0, 0, w, h);
  const grad = g.createRadialGradient(L.x0 + L.kw / 2, L.y0 + L.kh / 2, 10, L.x0 + L.kw / 2, L.y0 + L.kh / 2, Math.max(w, h) * 0.7);
  grad.addColorStop(0, 'rgba(120,86,60,0.35)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
}

function drawBeam(g, x, y, w, h) {
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, '#8a6342'); grad.addColorStop(0.45, '#6b4a30'); grad.addColorStop(1, '#3a281a');
  g.fillStyle = grad; g.beginPath(); g.roundRect(x, y, w, h, h / 2); g.fill();
}

// woven: alttan kaç sıra dokundu (ROWS = tamamı)
function drawKilim(g, o, woven, { loom = true } = {}) {
  const { S, CH, x0, y0, F, beam, kw, kh } = o;
  const top = y0 - F; const bottom = y0 + kh + F;
  if (loom) {
    drawBeam(g, x0 - S * 2, top - beam, kw + S * 4, beam);
    drawBeam(g, x0 - S * 2, bottom, kw + S * 4, beam);
    // Çözgü ipleri: dokunmamış kısımda görünür
    g.strokeStyle = 'rgba(233,220,192,0.55)'; g.lineWidth = Math.max(1, S * 0.08);
    g.beginPath();
    for (let c = 0; c < COLS; c++) for (const f of [0.3, 0.7]) { const x = x0 + c * S + S * f; g.moveTo(x, top); g.lineTo(x, bottom); }
    g.stroke();
  }
  const firstRow = ROWS - woven;
  if (woven > 0) {
    for (let r = firstRow; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      g.fillStyle = HEX[grid[idx(c, r)]]; g.fillRect(x0 + c * S, y0 + r * CH, S, CH);
    }
    const pat = g === ctx ? tile : g.createPattern(tileFor(S, CH), 'repeat');
    pat.setTransform(new DOMMatrix().translate(x0, y0));
    g.fillStyle = pat; g.fillRect(x0, y0 + firstRow * CH, kw, woven * CH);
    // Kilim yırtmacı: yan yana iki farklı renk arasında ince boşluk
    g.fillStyle = 'rgba(20,12,8,0.42)';
    const sw = Math.max(1, Math.round(S * 0.07));
    for (let r = firstRow; r < ROWS; r++) for (let c = 0; c < COLS - 1; c++) {
      if (grid[idx(c, r)] !== grid[idx(c + 1, r)]) g.fillRect(x0 + (c + 1) * S - (sw >> 1), y0 + r * CH + 1, sw, CH - 2);
    }
    // Kenar örgüsü (yan kenarlar biraz koyu)
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(x0, y0 + firstRow * CH, Math.max(1, S * 0.12), woven * CH);
    g.fillRect(x0 + kw - Math.max(1, S * 0.12), y0 + firstRow * CH, Math.max(1, S * 0.12), woven * CH);
  }
  if (woven === ROWS) drawFringe(g, o, top, bottom, loom);
}

function drawFringe(g, o, top, bottom, loom) {
  const { S, x0, y0, kh } = o;
  // Saçak: dörderli çözgü demetleri düğümlenir
  g.strokeStyle = WARP; g.fillStyle = '#d8c8a6'; g.lineWidth = Math.max(1, S * 0.12);
  const groups = Math.floor(COLS / 2);
  for (const side of [0, 1]) {
    const yk = side ? y0 + kh + S * 0.9 : y0 - S * 0.9;
    const yEnd = side ? (loom ? bottom : y0 + kh + S * 2.4) : (loom ? top : y0 - S * 2.4);
    for (let k = 0; k < groups; k++) {
      const cx = x0 + (k * 2 + 1) * S + S * 0.5;
      const xs = [cx - S * 0.7, cx - S * 0.3, cx + S * 0.3, cx + S * 0.7];
      g.beginPath();
      for (const x of xs) { g.moveTo(x, side ? y0 + kh : y0); g.lineTo(cx, yk); }
      if (!loom) for (const x of xs) { g.moveTo(cx, yk); g.lineTo(cx + (x - cx) * 0.6, yEnd); }
      g.stroke();
      g.beginPath(); g.arc(cx, yk, Math.max(1.5, S * 0.22), 0, Math.PI * 2); g.fill();
    }
  }
}
const tileCache = new Map();
function tileFor(S, CH) {
  const key = `${S}x${CH}`;
  if (tileCache.has(key)) return tileCache.get(key);
  const keep = L; L = { ...L, S, CH }; const prev = tile; makeTile();
  const c = document.createElement('canvas'); c.width = S; c.height = CH;
  const t = c.getContext('2d'); t.fillStyle = tile; t.fillRect(0, 0, S, CH);
  tile = prev; L = keep; tileCache.set(key, c); return c;
}

// İmleç ve önizleme gölgesi
let hover = null; const kbd = { on: false, c: COLS >> 1, r: ROWS >> 1 };
function drawGhost() {
  const at = kbd.on ? kbd : hover;
  if (!at || weaving) return;
  const { S, CH, x0, y0 } = L;
  const cells = ghostCells(at.c, at.r);
  ctx.globalAlpha = 0.55;
  for (const [c, r, v] of cells) { ctx.fillStyle = HEX[v]; ctx.fillRect(x0 + c * S, y0 + r * CH, S, CH); }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(255,248,230,0.9)'; ctx.lineWidth = Math.max(1, dpr);
  for (const [c, r] of mirrors(at.c, at.r, state.sym)) ctx.strokeRect(x0 + c * S + 0.5, y0 + r * CH + 0.5, S - 1, CH - 1);
}
function ghostCells(c, r) {
  if (state.tool === 'zemin') return [];
  const g = new Uint8Array(COLS * ROWS).fill(255);
  if (state.tool === 'ilmek') setCell(g, c, r, state.color, state.sym);
  else stamp(g, MOTIFS[state.motif], c, r, state.color, state.sym);
  const out = [];
  for (let i = 0; i < g.length; i++) if (g[i] !== 255) out.push([i % COLS, (i / COLS) | 0, g[i]]);
  return out;
}

let raf = 0; let weaving = false; let weaveStart = 0; let woven = ROWS;
const MS_PER_ROW = 42;
function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
function frame(now) {
  raf = 0;
  if (weaving) {
    const t = now - weaveStart;
    woven = Math.min(ROWS, Math.floor(t / MS_PER_ROW));
    if (woven >= ROWS) { weaving = false; woven = ROWS; say('Kilim dokundu.'); }
  }
  drawWall(ctx, canvas.width, canvas.height);
  drawKilim(ctx, L, woven);
  if (weaving) drawShuttle(now);
  drawGhost();
  if (weaving) raf = requestAnimationFrame(frame);
}
function drawShuttle(now) {
  const { S, CH, x0, y0, kw } = L;
  const r = ROWS - woven - 1; if (r < 0) return;
  const f = ((now - weaveStart) % MS_PER_ROW) / MS_PER_ROW;
  const dir = r % 2 ? f : 1 - f;
  const x = x0 - S + dir * (kw + S * 2); const y = y0 + r * CH + CH / 2;
  // Atkı ipi: kenardan mekiğe
  ctx.strokeStyle = HEX[grid[idx(Math.min(COLS - 1, Math.max(0, Math.floor((x - x0) / S))), r)]];
  ctx.lineWidth = Math.max(1, CH * 0.5);
  ctx.beginPath(); ctx.moveTo(r % 2 ? x0 : x0 + kw, y); ctx.lineTo(x, y); ctx.stroke();
  ctx.fillStyle = '#a0764c'; ctx.strokeStyle = '#3a281a'; ctx.lineWidth = Math.max(1, dpr);
  ctx.beginPath(); ctx.ellipse(x, y, S * 2.2, CH * 0.75, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}
function startWeave() {
  if (reduced) { woven = ROWS; weaving = false; requestDraw(); return; }
  weaving = true; woven = 0; weaveStart = performance.now(); requestDraw();
}
function finishWeave() { if (weaving) { weaving = false; woven = ROWS; } }

// ------------------------------------------------------------------ işlemler
function pushHistory() { history.push(grid.slice()); if (history.length > 40) history.shift(); ui.undo.disabled = false; }
function changed(msg) { finishWeave(); requestDraw(); saveHash(); if (msg) say(msg); }

function cellAt(px, py) {
  const { S, CH, x0, y0 } = L;
  const c = Math.floor((px * dpr - x0) / S); const r = Math.floor((py * dpr - y0) / CH);
  return inside(c, r) ? { c, r } : null;
}
function apply(c, r) {
  pushHistory();
  if (state.tool === 'motif') {
    const m = MOTIFS[state.motif];
    stamp(grid, m, c, r, state.color, state.sym);
    changed(`${m.name} motifi ${PALETTE[state.color].name.toLocaleLowerCase('tr')} iple dokundu.`);
  } else if (state.tool === 'ilmek') {
    setCell(grid, c, r, state.color, state.sym); changed();
  } else {
    let n = 0; for (const [x, y] of mirrors(c, r, state.sym)) n += flood(grid, x, y, state.color);
    if (!n) { history.pop(); ui.undo.disabled = !history.length; return; }
    changed(`${n} ilmek ${PALETTE[state.color].name.toLocaleLowerCase('tr')} oldu.`);
  }
}

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  const at = cellAt(e.offsetX, e.offsetY);
  kbd.on = false;
  if (!at) return;
  canvas.setPointerCapture(e.pointerId);
  apply(at.c, at.r);
  if (state.tool === 'ilmek') drag = { last: `${at.c},${at.r}` };
});
canvas.addEventListener('pointermove', (e) => {
  const at = cellAt(e.offsetX, e.offsetY);
  if (drag && at) {
    const k = `${at.c},${at.r}`;
    if (k !== drag.last) { drag.last = k; setCell(grid, at.c, at.r, state.color, state.sym); changed(); }
  }
  const same = hover && at && hover.c === at.c && hover.r === at.r;
  if (!same) { hover = e.pointerType === 'mouse' ? at : null; requestDraw(); }
});
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', () => { hover = null; requestDraw(); });

canvas.addEventListener('keydown', (e) => {
  const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (mv) {
    e.preventDefault(); kbd.on = true;
    const step = e.shiftKey ? 5 : 1;
    kbd.c = Math.max(0, Math.min(COLS - 1, kbd.c + mv[0] * step)); kbd.r = Math.max(0, Math.min(ROWS - 1, kbd.r + mv[1] * step));
    say(`Sütun ${kbd.c + 1}, sıra ${kbd.r + 1}: ${PALETTE[grid[idx(kbd.c, kbd.r)]].name}.`);
    requestDraw();
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault(); kbd.on = true; apply(kbd.c, kbd.r);
  } else if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undo(); }
});
canvas.addEventListener('blur', () => { kbd.on = false; requestDraw(); });

function undo() {
  if (!history.length) return;
  grid = history.pop(); ui.undo.disabled = !history.length; changed('Son işlem geri alındı.');
}

// ------------------------------------------------------------------ arayüz
function hintText() {
  if (state.tool === 'ilmek') return 'Sürükleyerek tek tek ilmek at; simetri açıksa aynası da dokunur.';
  if (state.tool === 'zemin') return 'Dokunduğun renk alanının tamamı seçili iple yeniden dokunur.';
  const m = MOTIFS[state.motif];
  return m.band ? `${m.name} — ${m.meaning}. Dokunduğun sıraya bant olarak işlenir.` : `${m.name} — ${m.meaning}.`;
}
function syncUi() {
  ui.hint.textContent = hintText();
  ui.motifSet.disabled = state.tool !== 'motif';
  drawMotifPreviews();
}

const previews = [];
MOTIFS.forEach((m, i) => {
  const label = document.createElement('label');
  label.innerHTML = `<input type="radio" name="motif" value="${i}"${i === 0 ? ' checked' : ''}><span><canvas width="40" height="34" aria-hidden="true"></canvas><b class="sr-only">${m.name}</b></span>`;
  label.title = `${m.name} — ${m.meaning}`;
  ui.motifs.append(label);
  previews.push(label.querySelector('canvas'));
  label.querySelector('input').addEventListener('change', () => { state.motif = i; if (state.tool !== 'motif') { state.tool = 'motif'; ui.tools[0].checked = true; } syncUi(); requestDraw(); });
});
function drawMotifPreviews() {
  MOTIFS.forEach((m, i) => {
    const cv = previews[i]; const g = cv.getContext('2d');
    g.fillStyle = '#efe4cc'; g.fillRect(0, 0, cv.width, cv.height);
    const rows = m.band ? [...m.cells.map((r) => [...r, ...r, ...r])] : m.cells;
    const h = rows.length; const w = rows[0].length;
    const s = Math.floor(Math.min(cv.width / w, cv.height / h)); const ox = (cv.width - w * s) >> 1; const oy = (cv.height - h * s) >> 1;
    const main = state.color === 4 ? 1 : state.color;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = rows[y][x]; if (ch === '.') continue;
      g.fillStyle = HEX[ch === 'X' ? main : PAIR[main] === 4 ? 3 : PAIR[main]]; g.fillRect(ox + x * s, oy + y * s, s, s);
    }
  });
}

PALETTE.forEach((p, i) => {
  const label = document.createElement('label'); label.title = p.name;
  label.innerHTML = `<input type="radio" name="renk" value="${i}"${i === state.color ? ' checked' : ''}><span style="--c:${p.hex}"></span><b class="sr-only">${p.name}</b>`;
  ui.swatches.append(label);
  label.querySelector('input').addEventListener('change', () => { state.color = i; syncUi(); requestDraw(); });
});
for (const t of ui.tools) t.addEventListener('change', () => { state.tool = t.value; syncUi(); requestDraw(); });
for (const s of ui.syms) s.addEventListener('change', () => { state.sym = +s.value; requestDraw(); });

ui.undo.addEventListener('click', undo);
ui.fresh.addEventListener('click', () => {
  pushHistory();
  grid = generate((Math.random() * 2 ** 31) | 0);
  saveHash(); startWeave(); say('Yeni bir kilim tezgâha kuruldu, dokunuyor.');
});
ui.weave.addEventListener('click', () => { startWeave(); say('Kilim baştan dokunuyor.'); });

ui.share.addEventListener('click', async () => {
  const url = `${location.href.split('#')[0]}#${encode(grid)}`;
  ui.shareLink.value = url;
  try { await navigator.clipboard.writeText(url); ui.shareBox.hidden = true; say('Bağlantı kopyalandı. Açan kişi aynı kilimi görür.', true); return; } catch { /* pano kapalı */ }
  ui.shareBox.hidden = false; ui.shareLink.focus(); ui.shareLink.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  say(ok ? 'Bağlantı kopyalandı.' : 'Pano erişimi kapalı; bağlantı seçildi, elle kopyalayabilirsin.', true);
});

ui.png.addEventListener('click', () => {
  // Kilim tek başına, saçaklarıyla, şeffaf zeminde ve yüksek çözünürlükte
  const S = 16; const CH = Math.round(S * 0.78); const pad = S * 4;
  const o = { S, CH, x0: pad, y0: pad, F: 0, beam: 0, kw: COLS * S, kh: ROWS * CH };
  const out = document.createElement('canvas'); out.width = o.kw + pad * 2; out.height = o.kh + pad * 2;
  drawKilim(out.getContext('2d'), o, ROWS, { loom: false });
  const save = (href, revoke) => {
    const a = document.createElement('a'); a.href = href; a.download = `kilim-${Date.now()}.png`; a.hidden = true;
    document.body.append(a); a.click();
    setTimeout(() => { a.remove(); if (revoke) URL.revokeObjectURL(href); }, 30000);
    say('Kilim PNG olarak indirildi.');
  };
  out.toBlob((b) => (b ? save(URL.createObjectURL(b), true) : save(out.toDataURL('image/png'), false)), 'image/png');
});

let sayTimer = 0;
function say(text, keep = false) {
  ui.status.textContent = text;
  clearTimeout(sayTimer);
  if (!keep) sayTimer = setTimeout(() => { if (ui.status.textContent === text) ui.status.textContent = ''; }, 4000);
}

// ------------------------------------------------------------------ adres
let hashTimer = 0;
function saveHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const h = `#${encode(grid)}`;
    if (location.hash === h) return;
    try { history_.replaceState(null, '', h); } catch { try { location.replace(h); } catch { /* adres değiştirilemiyor */ } }
  }, 300);
}
const history_ = window.history;

// ------------------------------------------------------------------ başlangıç
new ResizeObserver(() => { layout(); requestDraw(); }).observe(canvas);
layout();
const fromHash = location.hash.length > 1 ? decode(decodeURIComponent(location.hash.slice(1))) : null;
if (fromHash) grid = fromHash;
else {
  grid = generate(1071);
  if (location.hash.length > 1) say('Bağlantıdaki kilim okunamadı; tezgâha yeni bir kilim kuruldu.', true);
}
syncUi();
startWeave();

// Test ve ölçüm için salt okunur durum
window.kilim = Object.freeze({
  stats: () => ({ weaving, woven, tool: state.tool, motif: MOTIFS[state.motif].key, sym: state.sym, history: history.length, colors: new Set(grid).size }),
  hash: () => encode(grid),
});
