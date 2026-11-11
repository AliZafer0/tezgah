// Kamış Kalem — kâğıt, kalem, mürekkep hazinesi, satır rehberi, yazılışı izleme, ısınma örneği ve PNG.
// Vuruşlar dünya biriminde saklanır (görünür yükseklik = 1000 birim); boyut değişince yeniden çizilir.
import { nibVector, segment, nokta, steps } from './pen.js';

const $ = (s) => document.querySelector(s);
const paperCv = $('#paper'); const inkCv = $('#ink');
const pg = paperCv.getContext('2d'); const ig = inkCv.getContext('2d');
const panel = $('.panel');
const ui = {
  inks: $('#inks'), papers: [...document.querySelectorAll('input[name="paper"]')],
  width: $('#width'), widthOut: $('#width-out'), angle: $('#angle'), angleOut: $('#angle-out'), nib: $('#nib'),
  meter: $('#meter'), meterFill: $('#meter-fill'), dip: $('#dip'), autodip: $('#autodip'),
  guides: $('#guides'), replay: $('#replay'), warmup: $('#warmup'), undo: $('#undo'), clear: $('#clear'), png: $('#png'),
  status: $('#status'),
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const INKS = {
  is: { name: 'İs', hex: '#1b1714' }, lal: { name: 'Lal', hex: '#9b1b1b' },
  lacivert: { name: 'Lacivert', hex: '#1e2f5c' }, altin: { name: 'Altın', hex: '#c9a14a' },
};
const PAPERS = {
  ahar: { base: '#efe3c6', edge: '#d8c39a', fiber: 'rgba(120,90,50,', dark: false, ink: 'is' },
  kahve: { base: '#ddc79b', edge: '#b79a66', fiber: 'rgba(90,60,30,', dark: false, ink: 'is' },
  lacivert: { base: '#1d2a44', edge: '#0f1728', fiber: 'rgba(200,190,160,', dark: true, ink: 'altin' },
};
const state = { ink: 'is', paper: 'ahar', width: 24, angle: 38, guides: true, autodip: true, level: 1 };
const strokes = []; let current = null;

// ------------------------------------------------------------------ ölçek
let W = 0; let H = 0; let dpr = 1; let k = 1; // k: CSS pikseli / dünya birimi
function resize() {
  const r = paperCv.getBoundingClientRect();
  W = r.width; H = r.height; dpr = Math.min(devicePixelRatio || 1, 2); k = H / 1000;
  for (const c of [paperCv, inkCv]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  drawPaper(pg, W, H, dpr, state.guides);
  redraw();
}
// Kalem dünya biriminde; ekranda k ile ölçeklenir
const nibFor = (s, scale) => nibVector(s.width * scale, s.angle);

// ------------------------------------------------------------------ kâğıt
function drawPaper(g, w, h, scale, guides) {
  const p = PAPERS[state.paper];
  g.setTransform(scale, 0, 0, scale, 0, 0);
  const grad = g.createRadialGradient(w * 0.55, h * 0.45, Math.min(w, h) * 0.2, w * 0.55, h * 0.45, Math.max(w, h) * 0.85);
  grad.addColorStop(0, p.base); grad.addColorStop(1, p.edge);
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  // Lifler: kısa, rastgele yönlü, çok soluk çizgiler (belirlenimli)
  let s = 9; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  g.lineWidth = 0.6;
  const n = Math.round((w * h) / 2600);
  for (let i = 0; i < n; i++) {
    const x = rnd() * w; const y = rnd() * h; const a = rnd() * Math.PI; const L = 3 + rnd() * 9;
    g.strokeStyle = `${p.fiber}${0.04 + rnd() * 0.06})`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
  }
  // Ahar parlaklığı: üstten hafif bir ışık
  const sheen = g.createLinearGradient(0, 0, w, h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,0.04)');
  g.fillStyle = sheen; g.fillRect(0, 0, w, h);
  if (guides) drawGuides(g, w, h);
}

// Satır rehberi: kalem genişliğine göre satır aralığı ve satır başında beş noktalık ölçü
function drawGuides(g, w, h) {
  const p = PAPERS[state.paper];
  const unit = state.width * k; const lineH = unit * 7.5;
  const left = panelRightEdge() + 30; const top = Math.max(110, h * 0.16);
  g.strokeStyle = p.dark ? 'rgba(217,189,122,0.22)' : 'rgba(110,80,50,0.20)'; g.lineWidth = 1;
  for (let y = top + lineH; y < h - (isMobile() ? panelHeight() : 20); y += lineH) {
    g.beginPath(); g.moveTo(left, y); g.lineTo(w - 30, y); g.stroke();
    g.setLineDash([2, 5]); g.beginPath(); g.moveTo(left, y - unit * 5); g.lineTo(w - 30, y - unit * 5); g.stroke(); g.setLineDash([]);
  }
  // Nokta cetveli: ilk satırın başında, satır çizgisinden yukarı doğru beş nokta (elif boyu)
  const nib = nibVector(unit, state.angle); const base = top + lineH; const x = left + unit * 1.2;
  for (let i = 0; i < 5; i++) {
    nokta(g, x + (i % 2 ? unit * 0.7 : 0), base - (i + 1) * unit * 0.98, nib, p.dark ? '#d9bd7a' : '#6d4c2f', 0.2);
  }
}
const isMobile = () => panel.getBoundingClientRect().top > H * 0.3;
const panelRightEdge = () => (isMobile() ? 0 : panel.getBoundingClientRect().right);
const panelHeight = () => H - panel.getBoundingClientRect().top;

// ------------------------------------------------------------------ mürekkep çizimi
function renderStroke(g, st, scale, upto = Infinity) {
  const nibBase = nibFor(st, scale);
  let ink = st.ink0; let seed = st.seed;
  const pts = st.pts; const color = INKS[st.color].hex;
  if (pts.length === 1 || (pts.length && upto <= 1)) {
    // Tek dokunuş: kalemin kendi izi (kısa bir baklava)
    const [x, y] = pts[0]; nokta(g, x * scale, y * scale, nibBase, color, 0.92);
    return [ink, seed];
  }
  const n = Math.min(pts.length, upto);
  g.beginPath(); g.fillStyle = color;
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1]; const b = pts[i];
    const f = b[3] ?? 1;
    const nib = [nibBase[0] * f, nibBase[1] * f];
    for (const [p0, p1] of steps([a[0] * scale, a[1] * scale], [b[0] * scale, b[1] * scale], Math.max(0.8, st.width * scale * 0.08))) {
      segment(g, p0, p1, nib, ink, seed++);
      ink = Math.max(0, ink - Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / scale / (st.width * 55));
    }
  }
  g.fill();
  return [ink, seed];
}
function redraw(upto = null) {
  ig.setTransform(dpr, 0, 0, dpr, 0, 0); ig.clearRect(0, 0, W, H);
  strokes.forEach((st, i) => { if (upto && i > upto.stroke) return; renderStroke(ig, st, k, upto && i === upto.stroke ? upto.point : Infinity); });
}

// ------------------------------------------------------------------ yazma
function toWorld(e) { const r = inkCv.getBoundingClientRect(); return [(e.clientX - r.left) / k, (e.clientY - r.top) / k]; }
let lastInk = 1; let lastSeed = 0; let drawnTo = 0;
inkCv.addEventListener('pointerdown', (e) => {
  if (replaying) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  inkCv.setPointerCapture(e.pointerId);
  const [x, y] = toWorld(e);
  current = { color: state.ink, width: state.width, angle: state.angle, ink0: state.level, seed: (Math.random() * 1e6) | 0, pts: [[x, y, 0, 1]], t0: performance.now() };
  strokes.push(current); drawnTo = 1; lastInk = state.level; lastSeed = current.seed;
  ui.undo.disabled = false;
});
inkCv.addEventListener('pointermove', (e) => {
  if (!current) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of evs.length ? evs : [e]) {
    const [x, y] = toWorld(ev); const prev = current.pts[current.pts.length - 1];
    const d = Math.hypot(x - prev[0], y - prev[1]); if (d < 0.6) continue;
    const t = performance.now() - current.t0; const speed = d / Math.max(1, t - prev[2]);
    // Kalem basıncı (kalem/stylus) ya da hız: yavaş çekilen çizgi biraz daha dolgun
    const f = ev.pointerType === 'pen' && ev.pressure > 0 ? 0.7 + ev.pressure * 0.5 : 1.08 - Math.min(0.16, speed * 0.12);
    current.pts.push([x, y, t, f]);
  }
  // Yalnızca yeni parçaları çiz (kare başına bir kez): başlangıç mürekkebi önceki parçalardan devralınır
  if (!incRaf) incRaf = requestAnimationFrame(() => { incRaf = 0; if (current) drawIncrement(); });
});
let incRaf = 0;
function drawIncrement() {
  const st = current; const n = st.pts.length;
  if (n < 2) return;
  ig.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (n <= drawnTo) return;
  const part = { ...st, pts: st.pts.slice(drawnTo - 1), ink0: lastInk, seed: lastSeed };
  [lastInk, lastSeed] = renderStroke(ig, part, k);
  drawnTo = n;
  setLevel(lastInk);
}
function endStroke() {
  if (!current) return;
  // Tek dokunuş: kalemin baklava izi (nokta). Artımlı çizim, yeniden çizimle aynı tohum ve mürekkebi kullanır.
  // Bitmiş vuruş tek parça olarak bir kez daha boyanır: artımlı parçaların birleşim dikişleri kapanır
  cancelAnimationFrame(incRaf); incRaf = 0;
  ig.setTransform(dpr, 0, 0, dpr, 0, 0);
  const [endInk] = renderStroke(ig, current, k);
  if (current.pts.length > 1) setLevel(endInk);
  current = null;
  if (state.autodip) setLevel(1);
  else if (state.level < 0.3) say('Kalem kurudu: hokkaya bandır.');
}
inkCv.addEventListener('pointerup', endStroke);
inkCv.addEventListener('pointercancel', endStroke);

function setLevel(v) {
  state.level = Math.max(0, Math.min(1, v));
  ui.meterFill.style.width = `${Math.round(state.level * 100)}%`;
  ui.meter.setAttribute('aria-valuenow', String(Math.round(state.level * 100)));
  ui.dip.classList.toggle('low', state.level < 0.3);
}

// ------------------------------------------------------------------ yazılışı izle
let replaying = false; let replayRaf = 0;
function replay() {
  if (replaying) { stopReplay(); redraw(); return; }
  if (!strokes.length) { say('İzlenecek yazı yok; önce kâğıda bir şeyler yaz.'); return; }
  if (reduced) { redraw(); say('Hareket azaltma açık: yazı tek seferde gösterildi.'); return; }
  replaying = true; ui.replay.textContent = 'Durdur'; ui.replay.setAttribute('aria-pressed', 'true');
  // Vuruşlar arası boşluklar kısaltılır; yazı gerçek hızın 1,4 katıyla akar
  const timeline = []; let t = 0;
  strokes.forEach((st, si) => { st.pts.forEach((p, pi) => timeline.push({ si, pi, t: t + p[2] / 1.4 })); t += (st.pts.at(-1)[2] || 0) / 1.4 + 260; });
  const start = performance.now(); let idx = 0;
  const step = (now) => {
    const el = now - start;
    while (idx < timeline.length - 1 && timeline[idx + 1].t <= el) idx++;
    redraw({ stroke: timeline[idx].si, point: timeline[idx].pi + 1 });
    if (idx >= timeline.length - 1) { stopReplay(); say('Yazılış bitti.'); return; }
    replayRaf = requestAnimationFrame(step);
  };
  say('Yazı, yazıldığı sırayla yeniden akıyor.');
  replayRaf = requestAnimationFrame(step);
}
function stopReplay() {
  cancelAnimationFrame(replayRaf); replaying = false;
  ui.replay.textContent = 'Yazılışı izle'; ui.replay.setAttribute('aria-pressed', 'false');
}

// ------------------------------------------------------------------ ısınma örneği
// Hattatların meşke başlarken çektiği türden çizgiler: nokta merdiveni, elif, dalga ve halkalar, bir kâse.
function warmup() {
  const x0 = (panelRightEdge() + 40) / k; const right = (W - 40) / k; const usable = Math.max(200, right - x0);
  const w = Math.max(10, Math.min(30, state.width, usable / 24));
  const ww0 = Math.min(usable - w * 9, w * 22); const blockW = w * 7 + ww0;
  const left = x0 + Math.max(0, (usable - blockW) / 2);
  const availH = (isMobile() ? H - panelHeight() : H) / k;
  const top = Math.max(150, availH / 2 - w * 4.2);
  const pts = (arr, speed = 0.55) => {
    let t = 0; let prev = arr[0];
    return arr.map((p) => { t += Math.hypot(p[0] - prev[0], p[1] - prev[1]) / speed; prev = p; return [p[0], p[1], t, 1]; });
  };
  const add = (arr, color = state.ink, speed) => strokes.push({ color, width: w, angle: state.angle, ink0: 1, seed: (Math.random() * 1e6) | 0, pts: pts(arr, speed) });
  // Nokta merdiveni
  for (let i = 0; i < 5; i++) {
    const x = left + (i % 2 ? w * 0.9 : 0); const y = top + i * w * 1.05;
    add([[x, y], [x + w * 0.35, y + w * 0.75]]);
  }
  // Elif: yukarıdan aşağı, hafif eğik, uca doğru incelen
  const ex = left + w * 4;
  add(Array.from({ length: 24 }, (_, i) => { const t = i / 23; return [ex + t * w * 0.6 + Math.sin(t * 3) * 2, top - w * 0.2 + t * w * 5.2]; }), state.ink, 0.8);
  // Dalga
  const wx0 = left + w * 7; const wy = top + w * 1.4; const ww = Math.min(usable - w * 9, w * 22);
  add(Array.from({ length: 90 }, (_, i) => { const t = i / 89; return [wx0 + t * ww, wy + Math.sin(t * Math.PI * 4) * w * 1.1]; }), state.ink, 0.6);
  // Halkalar (uzatılmış sikloit)
  const ly = top + w * 4.4;
  add(Array.from({ length: 160 }, (_, i) => { const t = (i / 159) * Math.PI * 10; return [wx0 + (t / (Math.PI * 10)) * ww + Math.sin(t) * w * -0.9, ly + Math.cos(t) * w * 1.1]; }), state.ink, 0.7);
  // Kâse: geniş, alçak bir yay ve üstünde nokta (nûn'u andıran)
  const kx = wx0 + ww * 0.15; const ky = top + w * 7.2; const kw = Math.min(ww * 0.7, w * 12);
  add(Array.from({ length: 70 }, (_, i) => { const t = i / 69; const a = Math.PI * (0.05 + t * 0.95); return [kx + kw / 2 + Math.cos(a) * kw / 2, ky + Math.sin(a) * w * 2.6 - (1 - t) * w * 0.6]; }).reverse(), state.ink, 0.65);
  add([[kx + kw / 2 - w * 0.2, ky - w * 0.6], [kx + kw / 2 + w * 0.15, ky + w * 0.1]], state.ink === 'is' ? 'lal' : state.ink);
  ui.undo.disabled = false;
  redraw();
  say('Isınma çizgileri: nokta merdiveni, elif, dalga, halkalar ve bir kâse. Yazılışı izle ile nasıl çekildiklerini görebilirsin.');
}

// ------------------------------------------------------------------ arayüz
for (const [key, ink] of Object.entries(INKS)) {
  const label = document.createElement('label');
  label.innerHTML = `<input type="radio" name="ink" value="${key}"${key === state.ink ? ' checked' : ''}><span style="--c:${ink.hex}">${ink.name}</span>`;
  ui.inks.append(label);
  label.querySelector('input').addEventListener('change', () => { state.ink = key; syncUi(); say(`${ink.name} mürekkep.`); });
}
for (const r of ui.papers) r.addEventListener('change', () => {
  state.paper = r.value;
  const def = PAPERS[r.value].ink; state.ink = def;
  for (const i of ui.inks.querySelectorAll('input')) i.checked = i.value === def;
  document.body.classList.toggle('dark', PAPERS[r.value].dark);
  syncUi(); drawPaper(pg, W, H, dpr, state.guides);
  say(`${r.parentElement.textContent.trim()} kâğıt, ${INKS[def].name.toLocaleLowerCase('tr')} mürekkep.`);
});
ui.width.addEventListener('input', () => { state.width = +ui.width.value; syncUi(); if (state.guides) drawPaper(pg, W, H, dpr, true); });
ui.angle.addEventListener('input', () => { state.angle = +ui.angle.value; syncUi(); if (state.guides) drawPaper(pg, W, H, dpr, true); });
ui.dip.addEventListener('click', () => { setLevel(1); say('Kalem hokkaya bandırıldı.'); });
ui.autodip.addEventListener('change', () => { state.autodip = ui.autodip.checked; });
ui.guides.addEventListener('click', () => {
  state.guides = !state.guides; ui.guides.setAttribute('aria-pressed', String(state.guides));
  drawPaper(pg, W, H, dpr, state.guides); say(state.guides ? 'Satır rehberi açık.' : 'Satır rehberi kapalı.');
});
ui.replay.addEventListener('click', replay);
ui.warmup.addEventListener('click', () => { stopReplay(); warmup(); });
ui.undo.addEventListener('click', () => { stopReplay(); strokes.pop(); ui.undo.disabled = !strokes.length; redraw(); say('Son çizgi silindi.'); });
ui.clear.addEventListener('click', () => { stopReplay(); strokes.length = 0; ui.undo.disabled = true; redraw(); setLevel(1); say('Kâğıt temizlendi.'); });
ui.png.addEventListener('click', () => {
  // Rehbersiz kâğıt + yazı, iki kat çözünürlükte
  const s = 2; const out = document.createElement('canvas'); out.width = Math.round(W * s); out.height = Math.round(H * s);
  const g = out.getContext('2d'); drawPaper(g, W, H, s, false);
  g.setTransform(s, 0, 0, s, 0, 0);
  for (const st of strokes) renderStroke(g, st, k);
  const save = (href, revoke) => {
    const a = document.createElement('a'); a.href = href; a.download = `kamis-kalem-${Date.now()}.png`; a.hidden = true;
    document.body.append(a); a.click(); setTimeout(() => { a.remove(); if (revoke) URL.revokeObjectURL(href); }, 30000);
    say('Sayfa PNG olarak indirildi.');
  };
  out.toBlob((b) => (b ? save(URL.createObjectURL(b), true) : save(out.toDataURL('image/png'), false)), 'image/png');
});

function syncUi() {
  ui.widthOut.textContent = `${state.width}`; ui.angleOut.textContent = `${state.angle}°`;
  ui.meterFill.style.setProperty('--ink-c', INKS[state.ink].hex);
  ui.meterFill.style.background = INKS[state.ink].hex;
  // Kalem önizlemesi: uç ve bir dairenin izi (kalın-ince dağılımı görünsün)
  const g = ui.nib.getContext('2d'); const S = ui.nib.width;
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = PAPERS[state.paper].base; g.fillRect(0, 0, S, S);
  const nib = nibVector(Math.max(4, state.width * 0.22), state.angle);
  let prev = null; g.beginPath(); g.fillStyle = INKS[state.ink].hex;
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2; const p = [S / 2 + Math.cos(a) * 18, S / 2 + Math.sin(a) * 18];
    if (prev) segment(g, prev, p, nib, 1, i);
    prev = p;
  }
  g.fill();
}

let sayTimer = 0;
function say(text) { ui.status.textContent = text; clearTimeout(sayTimer); sayTimer = setTimeout(() => { if (ui.status.textContent === text) ui.status.textContent = ''; }, 5000); }

new ResizeObserver(resize).observe(paperCv);
syncUi(); setLevel(1); resize();

// Test ve ölçüm için salt okunur durum
window.kalem = Object.freeze({
  stats: () => ({ strokes: strokes.length, points: strokes.reduce((n, s) => n + s.pts.length, 0), level: state.level, ink: state.ink, paper: state.paper, replaying }),
});
