// Girih — döşeme seçimi, Hankin açısı, şerit çizimi, temalar, nefes animasyonu, adres ve SVG dışa aktarma.
import { TILINGS, THEMES, tile, hankin } from './girih.js';

const $ = (s) => document.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
const svg = $('#desen');
const panel = $('.panel');
const ui = {
  tilings: $('#tilings'), themes: $('#themes'), hint: $('#hint'),
  angle: $('#angle'), angleOut: $('#angle-out'), delta: $('#delta'), deltaOut: $('#delta-out'),
  scale: $('#scale'), scaleOut: $('#scale-out'), width: $('#width'), widthOut: $('#width-out'),
  skeleton: $('#skeleton'), breathe: $('#breathe'), random: $('#random'), share: $('#share'), svg: $('#svg'),
  shareBox: $('#sharebox'), shareLink: $('#share-link'), status: $('#status'),
};
const DEFAULT = { t: '4.8.8', a: 67.5, d: 0, s: 64, w: 5, p: 'iznik', k: false };
const state = { ...DEFAULT };
let W = 0; let H = 0; let cx = 0; let cy = 0;
const f1 = (v) => Math.round(v * 10) / 10;

// ------------------------------------------------------------------ çizim
const el = (name, attrs = {}) => { const n = document.createElementNS(NS, name); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
const fmt = (v) => Math.round(v * 1000) / 1000;
const ptsPath = (pts) => `M${pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L')}Z`;

// Görünür alanın desen birimindeki karşılığı (deseni merkezleyen nokta: cx, cy)
function build(theta, opts = state, view = { W, H, cx, cy }) {
  const s = opts.s;
  const minX = -view.cx / s; const minY = -view.cy / s; const maxX = (view.W - view.cx) / s; const maxY = (view.H - view.cy) / s;
  const polys = tile(opts.t, minX, minY, maxX, maxY);
  const fills = {}; let lines = ''; let skel = '';
  for (const p of polys) {
    const { segs, star, sides } = hankin(p, theta, opts.d);
    if (star) fills[sides] = (fills[sides] || '') + ptsPath(star);
    for (const [a, b] of segs) lines += `M${fmt(a[0])} ${fmt(a[1])}L${fmt(b[0])} ${fmt(b[1])}`;
    if (opts.k) skel += ptsPath(p);
  }
  return { fills, lines, skel, count: polys.length };
}

function render(target, theta, opts = state, view = { W, H, cx, cy }) {
  const th = THEMES[opts.p];
  const { fills, lines, skel, count } = build(theta, opts, view);
  const s = opts.s;
  target.replaceChildren();
  target.append(el('rect', { width: view.W, height: view.H, fill: th.bg }));
  const g = el('g', { transform: `translate(${fmt(view.cx)} ${fmt(view.cy)}) scale(${s})` });
  for (const n of Object.keys(fills)) g.append(el('path', { d: fills[n], fill: th.fills[n] || th.fills[6], 'fill-rule': 'evenodd' }));
  if (skel) g.append(el('path', { d: skel, fill: 'none', stroke: th.outer, 'stroke-width': 1 / s, 'stroke-dasharray': `${4 / s} ${4 / s}`, opacity: 0.55 }));
  const w = opts.w / s;
  g.append(el('path', { d: lines, fill: 'none', stroke: th.outer, 'stroke-width': w + 2.4 / s, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  g.append(el('path', { d: lines, fill: 'none', stroke: th.inner, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  target.append(g);
  return count;
}

let raf = 0; let breatheT0 = 0;
function draw() { if (!raf) raf = requestAnimationFrame(frame); }
function frame(now) {
  raf = 0;
  let theta = state.a;
  if (state.breathing) {
    // Nefes: açı yavaşça salınır, desen kendi içinde dönüşür
    theta = Math.min(84, Math.max(12, state.a + 14 * Math.sin((now - breatheT0) / 1800)));
  }
  render(svg, theta);
  if (state.breathing && !document.hidden) raf = requestAnimationFrame(frame);
}

function resize() {
  const r = svg.getBoundingClientRect();
  W = Math.round(r.width); H = Math.round(r.height);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const pr = panel.getBoundingClientRect();
  const mobile = pr.top > H * 0.3;
  // Desen merkezi panelin dışında kalan alanın ortası
  cx = mobile || !pr.width ? W / 2 : (pr.right + W) / 2; cy = mobile ? pr.top / 2 : H / 2;
  draw();
}

// ------------------------------------------------------------------ arayüz
function tilingIcon(key) {
  // Döşemenin küçük bir parçası: tek renk çizgi simgesi
  const box = el('svg', { viewBox: '-1.6 -1.6 3.2 3.2', 'aria-hidden': 'true' });
  const sc = key === '3.12.12' ? 0.42 : key === '4.8.8' ? 0.62 : 0.95;
  const polys = tile(key, -1.6 / sc, -1.6 / sc, 1.6 / sc, 1.6 / sc);
  let d = ''; for (const p of polys) d += ptsPath(p.map(([x, y]) => [x * sc, y * sc]));
  box.append(el('path', { d, fill: 'none', stroke: '#1d2533', 'stroke-width': 0.09, 'stroke-linejoin': 'round' }));
  return box;
}
for (const [key, t] of Object.entries(TILINGS)) {
  const label = document.createElement('label'); label.title = t.note;
  label.innerHTML = `<input type="radio" name="tiling" value="${key}"><span></span>`;
  label.querySelector('span').append(tilingIcon(key), document.createTextNode(t.name));
  ui.tilings.append(label);
  label.querySelector('input').addEventListener('change', () => {
    state.t = key; state.a = t.angle; sync(); changed(`${t.name} döşeme: ${t.note}`);
  });
}
for (const [key, th] of Object.entries(THEMES)) {
  const label = document.createElement('label'); label.title = th.name;
  label.innerHTML = `<input type="radio" name="theme" value="${key}"><span style="--a:${th.bg};--b:${th.fills[8]};--c:${th.inner}"></span><b class="sr-only">${th.name}</b>`;
  ui.themes.append(label);
  label.querySelector('input').addEventListener('change', () => { state.p = key; document.body.style.background = th.bg; changed(`${th.name} renkleri.`); });
}

function sync() {
  for (const i of ui.tilings.querySelectorAll('input')) i.checked = i.value === state.t;
  for (const i of ui.themes.querySelectorAll('input')) i.checked = i.value === state.p;
  ui.angle.value = state.a; ui.angleOut.textContent = `${f1(state.a)}°`;
  ui.delta.value = state.d; ui.deltaOut.textContent = state.d === 0 ? 'bitişik' : `%${Math.round(state.d * 100)}`;
  ui.scale.value = state.s; ui.scaleOut.textContent = `${state.s} px`;
  ui.width.value = state.w; ui.widthOut.textContent = `${state.w} px`;
  ui.skeleton.setAttribute('aria-pressed', String(state.k));
  ui.breathe.setAttribute('aria-pressed', String(!!state.breathing));
  ui.hint.textContent = TILINGS[state.t].note;
  document.body.style.background = THEMES[state.p].bg;
}
function changed(msg) { sync(); draw(); saveHash(); if (msg) say(msg); }

ui.angle.addEventListener('input', () => { state.a = +ui.angle.value; changed(); });
ui.delta.addEventListener('input', () => { state.d = +ui.delta.value; changed(); });
ui.scale.addEventListener('input', () => { state.s = +ui.scale.value; changed(); });
ui.width.addEventListener('input', () => { state.w = +ui.width.value; changed(); });
ui.angle.addEventListener('change', () => say(`Temas açısı ${f1(state.a)} derece.`));
ui.skeleton.addEventListener('click', () => { state.k = !state.k; changed(state.k ? 'Döşeme iskeleti görünüyor: yıldızlar bu çokgenlerin içinden doğar.' : 'İskelet gizlendi.'); });
ui.breathe.addEventListener('click', () => {
  state.breathing = !state.breathing; breatheT0 = performance.now();
  sync(); draw(); say(state.breathing ? 'Nefes: açı yavaşça salınıyor.' : 'Nefes durdu.');
});
ui.random.addEventListener('click', () => {
  const keys = Object.keys(TILINGS); const t = keys[Math.floor(Math.random() * keys.length)];
  const base = TILINGS[t].angle;
  state.t = t;
  state.a = f1(Math.min(82, Math.max(18, base + (Math.random() - 0.5) * 36)));
  state.d = Math.random() < 0.55 ? 0 : Math.round(Math.random() * 30) / 200;
  state.s = Math.round(40 + Math.random() * 70);
  state.w = Math.round((2 + Math.random() * 6) * 2) / 2;
  const th = Object.keys(THEMES); state.p = th[Math.floor(Math.random() * th.length)];
  changed(`${TILINGS[t].name} döşeme, ${f1(state.a)} derece, ${THEMES[state.p].name}.`);
});

// Sürükleme: yatay açı, dikey kol aralığı
let drag = null;
svg.addEventListener('pointerdown', (e) => { svg.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, a: state.a, d: state.d }; });
svg.addEventListener('pointermove', (e) => {
  if (!drag) return;
  state.a = f1(Math.min(84, Math.max(12, drag.a + (e.clientX - drag.x) * 0.15)));
  state.d = Math.round(Math.min(0.3, Math.max(0, drag.d - (e.clientY - drag.y) * 0.0012)) * 200) / 200;
  changed();
});
const endDrag = () => { if (drag) { drag = null; say(`Temas açısı ${f1(state.a)} derece, kol aralığı ${Math.round(state.d * 100)}.`); } };
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);
svg.addEventListener('keydown', (e) => {
  const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
  if (!k) return;
  e.preventDefault();
  const step = e.shiftKey ? 5 : 0.5;
  state.a = f1(Math.min(84, Math.max(12, state.a + k[0] * step)));
  state.d = Math.round(Math.min(0.3, Math.max(0, state.d + k[1] * (e.shiftKey ? 0.05 : 0.01))) * 200) / 200;
  changed(`Temas açısı ${f1(state.a)} derece, kol aralığı ${Math.round(state.d * 100)}.`);
});

// ------------------------------------------------------------------ paylaşım ve dışa aktarma
function toHash() {
  const q = new URLSearchParams({ t: state.t, a: state.a, d: state.d, s: state.s, w: state.w, p: state.p });
  if (state.k) q.set('k', '1');
  return `#${q}`;
}
function fromHash(h) {
  const q = new URLSearchParams(h.replace(/^#/, ''));
  const num = (k, lo, hi) => { const v = Number(q.get(k)); return q.has(k) && Number.isFinite(v) && v >= lo && v <= hi ? v : null; };
  const out = {};
  if (q.has('t')) { if (!TILINGS[q.get('t')]) return null; out.t = q.get('t'); }
  if (q.has('p')) { if (!THEMES[q.get('p')]) return null; out.p = q.get('p'); }
  for (const [k, lo, hi] of [['a', 12, 84], ['d', 0, 0.3], ['s', 24, 160], ['w', 1, 12]]) {
    if (!q.has(k)) continue; const v = num(k, lo, hi); if (v === null) return null; out[k] = v;
  }
  out.k = q.get('k') === '1';
  return out;
}
let hashTimer = 0;
function saveHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const h = toHash(); if (location.hash === h) return;
    try { history.replaceState(null, '', h); } catch { try { location.replace(h); } catch { /* adres değiştirilemiyor */ } }
  }, 250);
}
ui.share.addEventListener('click', async () => {
  const url = `${location.href.split('#')[0]}${toHash()}`;
  ui.shareLink.value = url;
  try { await navigator.clipboard.writeText(url); ui.shareBox.hidden = true; say('Bağlantı kopyalandı. Açan kişi aynı deseni görür.', true); return; } catch { /* pano kapalı */ }
  ui.shareBox.hidden = false; ui.shareLink.focus(); ui.shareLink.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  say(ok ? 'Bağlantı kopyalandı.' : 'Pano erişimi kapalı; bağlantı seçildi, elle kopyalayabilirsin.', true);
});
ui.svg.addEventListener('click', () => {
  // Paneli dışarıda bırakan, 1600×1600 karelik bağımsız bir SVG
  const size = 1600;
  const out = el('svg', { xmlns: NS, width: size, height: size, viewBox: `0 0 ${size} ${size}` });
  out.append(el('title'));
  out.firstChild.textContent = `Girih — ${TILINGS[state.t].name}, ${f1(state.a)}°`;
  const body = el('g'); out.append(body);
  render(body, state.a, { ...state, s: state.s * 1.6, w: state.w * 1.6 }, { W: size, H: size, cx: size / 2, cy: size / 2 });
  const text = new XMLSerializer().serializeToString(out);
  const blob = new Blob([text], { type: 'image/svg+xml' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = href; a.download = `girih-${state.t}-${Math.round(state.a)}.svg`; a.hidden = true;
  document.body.append(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(href); }, 30000);
  say('Desen SVG olarak indirildi; her ölçekte keskin kalır.');
});

let sayTimer = 0;
function say(text, keep = false) {
  ui.status.textContent = text; clearTimeout(sayTimer);
  if (!keep) sayTimer = setTimeout(() => { if (ui.status.textContent === text) ui.status.textContent = ''; }, 4000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.breathing) draw(); });

// ------------------------------------------------------------------ başlangıç
const initial = location.hash.length > 1 ? fromHash(decodeURIComponent(location.hash)) : {};
if (initial) Object.assign(state, initial);
else say('Bağlantıdaki desen okunamadı; varsayılan desen açıldı.', true);
sync();
new ResizeObserver(resize).observe(svg);
resize();

// Test ve ölçüm için salt okunur durum
window.girih = Object.freeze({
  stats: () => ({ ...state, polygons: build(state.a).count, nodes: svg.querySelectorAll('*').length, animating: !!raf }),
  hash: toHash,
});
