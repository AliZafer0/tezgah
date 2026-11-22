// Telkari: gümüş tel işçiliği üreteci.
// Biçimin yarım dilimi spirallerle doldurulur (en büyük boşluğa en büyük kıvrım), sonra dilim aynalanıp
// kol sayısı kadar döndürülür. Tel; gölge, maden geçişli gövde ve tek yönlü ışıkla parlatılır.
const NS = 'http://www.w3.org/2000/svg';
const R = 430;
const $ = (s) => document.querySelector(s);
const svg = $('#eser');
const status = $('#status');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

const MADEN = {
  g: { ad: 'gümüş', stops: ['#fbfcfd', '#9aa5b0', '#eef2f5', '#6c7782', '#dfe6ec', '#8b96a1'], bead: ['#ffffff', '#b9c3cc', '#5d6872'] },
  a: { ad: 'altın', stops: ['#fff3c9', '#c08b2a', '#f8dc80', '#82580f', '#f1cf68', '#a87a22'], bead: ['#fff6d6', '#d9a93f', '#6d4a0c'] },
  b: { ad: 'bakır', stops: ['#ffe0cc', '#b5603a', '#f2ab86', '#73361e', '#e7976f', '#9a4e2e'], bead: ['#fff0e6', '#cf7a52', '#5e2a16'] },
};
const BICIM = { m: 'madalyon', c: 'çiçek', y: 'yıldız', d: 'damla' };

// Tohumlu rastgele (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const state = { seed: (Math.random() * 2 ** 31) | 0, bicim: 'm', maden: 'g', kol: 6, sik: 5 };
function readHash() {
  const p = location.hash.slice(1).split('.');
  if (p.length < 5) return;
  const seed = parseInt(p[0], 36);
  if (Number.isFinite(seed)) state.seed = seed;
  if (BICIM[p[1]]) state.bicim = p[1];
  if (MADEN[p[2]]) state.maden = p[2];
  const k = +p[3], s = +p[4];
  if (k >= 3 && k <= 12) state.kol = k;
  if (s >= 1 && s <= 9) state.sik = s;
}
const writeHash = () => history.replaceState(null, '', `#${state.seed.toString(36)}.${state.bicim}.${state.maden}.${state.kol}.${state.sik}`);

// Biçimin sınırı: kapalı çokgen (ekran koordinatı, yukarı = -y)
function outline(bicim, n) {
  const pts = [];
  const N = 360;
  if (bicim === 'd') {
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2;
      const x = 0.78 * Math.sin(t) * Math.pow(Math.sin(t / 2), 1.25);
      const y = -Math.cos(t);
      pts.push([x * R, (y * 1.0 + 0.08) * R]);
    }
    return pts;
  }
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    let rho = 1;
    if (bicim === 'c') rho = 0.84 + 0.16 * Math.cos(n * th);
    if (bicim === 'y') rho = 0.6 + 0.4 * Math.pow(Math.abs(Math.cos((n * th) / 2)), 2.2);
    pts.push([Math.sin(th) * rho * R, -Math.cos(th) * rho * R]);
  }
  return pts;
}
function inPoly(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function polyDist(p, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segDist(p, poly[j], poly[i]));
  return d;
}

const pathOf = (pts) => 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');
const lenOf = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

// Spiral: çemberin kenarından içe doğru kıvrılır.
function spiral(cx, cy, r, a0, dir, turns, inner = 0.14) {
  const pts = [];
  const steps = Math.max(24, Math.round(turns * r * 0.55));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const rr = r * (1 - (1 - inner) * Math.pow(t, 0.85));
    const a = a0 + dir * t * turns * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}

function generate() {
  const rand = rng(state.seed);
  const mirrorOnly = state.bicim === 'd';
  const n = mirrorOnly ? 1 : state.kol;
  const half = mirrorOnly ? Math.PI : Math.PI / n; // yarım dilimin açısı (yukarı ekseninden saat yönüne)
  const poly = outline(state.bicim, n);
  const inner = poly.map(([x, y]) => [x * 0.93, y * 0.93 + (mirrorOnly ? 0.005 * R : 0)]);
  const hub = mirrorOnly ? 0 : R * (0.13 + 0.02 * (n > 8));
  const rmax = R * (0.21 - state.sik * 0.0135);
  const rmin = Math.max(6, rmax * 0.11);
  const gap = 3.2;
  // Dilim sınırları: yukarı ekseni (x=0) ve "half" açısındaki ışın
  const edgeB = [Math.sin(half), -Math.cos(half)];
  const distEdges = (p) => {
    const d0 = p[0]; // yukarı eksenine uzaklık (x>=0 yarısı)
    if (mirrorOnly) return d0;
    const d1 = Math.abs(p[0] * edgeB[1] - p[1] * edgeB[0]); // ışına dik uzaklık
    return Math.min(d0, d1);
  };
  const inWedge = (p) => {
    if (p[0] < 0) return false;
    if (mirrorOnly) return true;
    const ang = Math.atan2(p[0], -p[1]); // yukarıdan saat yönüne
    return ang >= 0 && ang <= half;
  };
  const circles = [];
  const maxC = 80;
  for (let k = 0; k < maxC; k++) {
    let best = null;
    for (let s = 0; s < 90; s++) {
      // Dilimin içinde kutupsal örnekleme (alan eşit dağılsın diye karekök)
      const ang = mirrorOnly ? rand() * Math.PI : rand() * half;
      const rad = Math.sqrt(rand()) * R * 1.02;
      const p = [Math.sin(ang) * rad, -Math.cos(ang) * rad + (mirrorOnly ? 0.08 * R : 0)];
      if (!inWedge(p) || !inPoly(p, inner)) continue;
      let r = Math.min(polyDist(p, inner) - gap, distEdges(p) - gap, rmax);
      if (hub) r = Math.min(r, Math.hypot(p[0], p[1]) - hub - gap);
      for (const c of circles) r = Math.min(r, Math.hypot(p[0] - c.x, p[1] - c.y) - c.r - gap);
      if (r > (best?.r ?? 0)) best = { x: p[0], y: p[1], r };
    }
    if (!best || best.r < rmin) break;
    circles.push(best);
  }

  // Motifler (yarım dilim için)
  const wires = []; // { pts, w }
  const beads = []; // { x, y, r }
  for (const c of circles) {
    const big = c.r > rmax * 0.45;
    const a0 = rand() * Math.PI * 2;
    const dir = rand() < 0.5 ? 1 : -1;
    if (!big && c.r < rmin * 1.9) {
      beads.push({ x: c.x, y: c.y, r: Math.min(c.r * 0.8, 9) });
      continue;
    }
    if (big && rand() < 0.35) {
      // S kıvrımı: iki küçük spiral, ortadan birleşir
      const ax = Math.cos(a0), ay = Math.sin(a0);
      const rr = c.r * 0.5;
      const s1 = spiral(c.x + ax * rr, c.y + ay * rr, rr, a0 + Math.PI, dir, 1.7);
      const s2 = spiral(c.x - ax * rr, c.y - ay * rr, rr, a0, dir, 1.7);
      wires.push({ pts: [...s1.reverse(), ...s2], w: 3.2 });
    } else {
      const turns = 1.8 + rand() * 1.6 + (c.r > rmax * 0.6 ? 0.8 : 0);
      wires.push({ pts: spiral(c.x, c.y, c.r, a0, dir, turns, 0.1 + rand() * 0.08), w: 3.2 });
      // Büyük kıvrımın çevresine ince bir çerçeve teli
      if (c.r > rmax * 0.55) {
        const ring = [];
        for (let i = 0; i <= 64; i++) ring.push([c.x + Math.cos((i / 64) * Math.PI * 2) * (c.r + 1.6), c.y + Math.sin((i / 64) * Math.PI * 2) * (c.r + 1.6)]);
        wires.push({ pts: ring, w: 2.2 });
      }
    }
    if (rand() < 0.5) beads.push({ x: c.x, y: c.y, r: Math.min(4.5, c.r * 0.16) });
  }

  // İskelet: dış çerçeve (çift tel ve burgu), dilim telleri, göbek
  const frame = [];
  const close = (p) => [...p, p[0]];
  frame.push({ pts: close(poly), w: 6.5 });
  frame.push({ pts: close(poly.map(([x, y]) => [x * 0.955, y * 0.955 + (mirrorOnly ? 0.0035 * R : 0)])), w: 3.4 });
  // Burgu tel: iki tel arasında dalgalı
  const tw = [];
  for (let i = 0; i <= poly.length; i++) {
    const [x, y] = poly[i % poly.length];
    const s = 0.977 + 0.011 * Math.sin(i * 1.9);
    tw.push([x * s, y * s + (mirrorOnly ? 0.002 * R : 0)]);
  }
  frame.push({ pts: tw, w: 2 });
  const spokes = [];
  if (!mirrorOnly) {
    for (let k = 0; k < n; k++) {
      const a = (k * 2 * Math.PI) / n + half; // dilim sınırları
      const dir = [Math.sin(a), -Math.cos(a)];
      let far = hub;
      while (far < R * 1.1 && inPoly([dir[0] * far, dir[1] * far], inner)) far += 2;
      spokes.push({ pts: [[dir[0] * hub, dir[1] * hub], [dir[0] * far, dir[1] * far]], w: 3.2 });
    }
    const ring = (rr) => close(Array.from({ length: 72 }, (_, i) => [Math.sin((i / 72) * Math.PI * 2) * rr, -Math.cos((i / 72) * Math.PI * 2) * rr]));
    frame.push({ pts: ring(hub), w: 4.2 });
    frame.push({ pts: spiral(0, 0, hub * 0.78, 0, 1, 3.2, 0.12), w: 3 });
  } else {
    frame.push({ pts: [[0, -R * 0.86], [0, R * 1.0]], w: 3 });
  }
  return { n, mirrorOnly, wires, beads, frame, spokes, count: wires.length, poly };
}

function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

function render() {
  const g = generate();
  const m = MADEN[state.maden];
  svg.textContent = '';
  el('title', { id: 'eser-baslik' }, svg).textContent = `Telkari ${BICIM[state.bicim]}, ${m.ad}`;
  const defs = el('defs', {}, svg);
  const grad = el('linearGradient', { id: 'maden', gradientUnits: 'userSpaceOnUse', x1: -R, y1: -R, x2: R, y2: R }, defs);
  m.stops.forEach((c, i) => el('stop', { offset: (i / (m.stops.length - 1)).toFixed(2), 'stop-color': c }, grad));
  const rg = el('radialGradient', { id: 'granul', cx: '35%', cy: '30%', r: '70%' }, defs);
  m.bead.forEach((c, i) => el('stop', { offset: ['0', '0.45', '1'][i], 'stop-color': c }, rg));
  // Parlatma: tel kalınlığından kabartma ve tek yönlü ışık (her kopyada aynı yön), altında yumuşak gölge
  const f = el('filter', { id: 'parlat', x: '-10%', y: '-10%', width: '120%', height: '120%' }, defs);
  el('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: '1.6', result: 'b' }, f);
  const spec = el('feSpecularLighting', { in: 'b', surfaceScale: '3.2', specularConstant: '1.05', specularExponent: '22', 'lighting-color': '#ffffff', result: 's' }, f);
  el('feDistantLight', { azimuth: '225', elevation: '42' }, spec);
  el('feComposite', { in: 's', in2: 'SourceAlpha', operator: 'in', result: 'si' }, f);
  el('feComposite', { in: 'SourceGraphic', in2: 'si', operator: 'arithmetic', k1: '0', k2: '1', k3: '0.75', k4: '0', result: 'lit' }, f);
  el('feDropShadow', { in: 'lit', dx: '3', dy: '5', stdDeviation: '4', 'flood-color': '#000', 'flood-opacity': '0.55' }, f);

  // Yarım dilim bir kez tanımlanır, kopyalar <use> ile döner ve aynalanır.
  const unit = el('g', { id: 'dilim' }, defs);
  let delay = 0;
  const wire = (w, parent, stroke = 'url(#maden)') => {
    const len = Math.ceil(lenOf(w.pts)) + 2;
    el('path', { d: pathOf(w.pts), class: 'wire', fill: 'none', stroke, 'stroke-width': w.w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: `--len:${len};--d:${(delay += 0.012).toFixed(3)}s` }, parent);
  };
  g.wires.forEach((w) => wire(w, unit));
  g.beads.forEach((b) => el('circle', { cx: b.x.toFixed(1), cy: b.y.toFixed(1), r: b.r.toFixed(1), fill: 'url(#granul)', class: 'bead', style: `--d:${(1 + Math.random() * 0.6).toFixed(2)}s` }, unit));

  const art = el('g', { id: 'broş', class: reduce ? '' : 'draw' }, svg);
  const body = el('g', {}, art);
  for (let k = 0; k < g.n; k++) {
    const rot = ((k * 360) / g.n).toFixed(3);
    el('use', { href: '#dilim', transform: `rotate(${rot})` }, body);
    el('use', { href: '#dilim', transform: `rotate(${rot}) scale(-1 1)` }, body);
  }
  delay = 0;
  g.spokes.forEach((w) => wire(w, body));
  g.frame.forEach((w) => wire(w, body));
  // Asma halkası ya da küpe kancası
  const ty = Math.min(...g.poly.map((p) => p[1]));
  const loop = [];
  for (let i = 0; i <= 48; i++) loop.push([Math.sin((i / 48) * Math.PI * 2) * 22, ty - 24 - Math.cos((i / 48) * Math.PI * 2) * 22]);
  wire({ pts: loop, w: 5 }, body);
  if (g.mirrorOnly) {
    // Küpe kancası: halkadan çıkan kübik eğri
    const hook = [];
    const P = [[0, ty - 46], [0, ty - 150], [92, ty - 150], [84, ty - 52]];
    for (let i = 0; i <= 50; i++) {
      const u = i / 50, v = 1 - u;
      hook.push([0, 1].map((k) => v ** 3 * P[0][k] + 3 * v * v * u * P[1][k] + 3 * v * u * u * P[2][k] + u ** 3 * P[3][k]));
    }
    wire({ pts: hook, w: 4 }, body);
  }
  const finish = () => art.setAttribute('filter', 'url(#parlat)');
  if (reduce) finish();
  else setTimeout(finish, 1900);
  status.textContent = `${g.mirrorOnly ? 'Aynalı' : g.n + ' kollu'} ${m.ad} ${BICIM[state.bicim]}: dilim başına ${g.count} kıvrım, ${g.beads.length} granül.`;
  writeHash();
}

// Denetimler
const sync = () => {
  document.querySelector(`input[name=bicim][value=${state.bicim}]`).checked = true;
  document.querySelector(`input[name=maden][value=${state.maden}]`).checked = true;
  $('#kol').value = state.kol;
  $('#kol-out').value = state.kol;
  $('#sik').value = state.sik;
  $('#sik-out').value = state.sik;
  $('#kol').disabled = state.bicim === 'd';
};
document.querySelectorAll('input[name=bicim]').forEach((i) => i.addEventListener('change', () => { state.bicim = i.value; sync(); render(); }));
document.querySelectorAll('input[name=maden]').forEach((i) => i.addEventListener('change', () => { state.maden = i.value; render(); }));
let t;
for (const id of ['kol', 'sik']) {
  $('#' + id).addEventListener('input', (e) => {
    state[id] = +e.target.value;
    $('#' + id + '-out').value = state[id];
    clearTimeout(t);
    t = setTimeout(render, 140);
  });
}
$('#yeni').addEventListener('click', () => {
  state.seed = (Math.random() * 2 ** 31) | 0;
  render();
});

function serialized() {
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', NS);
  clone.querySelectorAll('.wire').forEach((p) => p.removeAttribute('style'));
  clone.querySelectorAll('.bead').forEach((p) => p.removeAttribute('style'));
  clone.querySelector('#broş')?.removeAttribute('class');
  clone.querySelector('#broş')?.setAttribute('filter', 'url(#parlat)');
  const bg = document.createElementNS(NS, 'rect');
  Object.entries({ x: -520, y: -520, width: 1040, height: 1040, fill: '#1b1f24' }).forEach(([k, v]) => bg.setAttribute(k, v));
  clone.insertBefore(bg, clone.querySelector('#broş'));
  return new XMLSerializer().serializeToString(clone);
}
const save = (blob, name) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
const fname = () => `telkari-${BICIM[state.bicim]}-${state.seed.toString(36)}`;
$('#svg').addEventListener('click', () => {
  save(new Blob([serialized()], { type: 'image/svg+xml' }), fname() + '.svg');
  status.textContent = 'SVG indirildi.';
});
$('#png').addEventListener('click', () => {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([serialized()], { type: 'image/svg+xml' }));
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = c.height = 1600;
    c.getContext('2d').drawImage(img, 0, 0, 1600, 1600);
    URL.revokeObjectURL(url);
    c.toBlob((b) => b && (save(b, fname() + '.png'), (status.textContent = 'Resim indirildi.')), 'image/png');
  };
  img.src = url;
});
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input,button')) return;
  if (e.key === 'n' || e.key === 'N' || e.key === ' ') {
    e.preventDefault();
    $('#yeni').click();
  }
});

readHash();
sync();
render();
