// Kahve Falı: telvenin fincan duvarından akıp donmasını benzetir, donan lekelerden şekil bulur, fal yazar.
// Akış: fincan ters dönünce telve dipten kenara doğru kayar. Parçacıklar dışa doğru, gürültü alanının
// girdabıyla kıvrılarak ilerler; yolda yapışırlar (komşu telve çoksa ve kurudukça daha kolay).
// Şekiller: eşiklenmiş yoğunluk ızgarasında bağlı bileşenler; uzama, eğrilik, delik ve kütle dağılımına göre sınıflanır.
const $ = (s) => document.querySelector(s);
const cv = $('#masa');
const ctx = cv.getContext('2d');
const status = $('#status');
const falBox = $('#fal');
const btn = $('#ileri');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

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
// Tohumlu değer gürültüsü (yumuşak, iki oktav)
function noise2(seed) {
  const r = rng(seed ^ 0x9e3779b9);
  const P = 256, tab = new Float32Array(P * P);
  for (let i = 0; i < tab.length; i++) tab[i] = r();
  const at = (x, y) => tab[((y & 255) << 8) | (x & 255)];
  const sm = (t) => t * t * (3 - 2 * t);
  const one = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  return (x, y) => one(x, y) * 0.7 + one(x * 2.3 + 17, y * 2.3 + 5) * 0.3;
}

/* ------------------------------------------------------------ telve akışı */
const G = 300; // yoğunluk ızgarası [-1,1]²
// Telve iki yoldan iz bırakır: dipten kenara kıvrılarak akan dereler (yolda topak bırakır, ara ara dallanır)
// ve fincan ters dönerken duvara sıçrayan lekeler. Kenarlar gürültüyle düzensizleşir.
function simulate(seed) {
  const rand = rng(seed);
  const nz = noise2(seed);
  const D = new Float32Array(G * G);
  const edge = (x, y) => 0.65 + 0.7 * nz(x * 9 + 31, y * 9 + 7);
  function disc(x, y, rad, amt) {
    const i0 = Math.max(1, Math.floor(((x - rad + 1) / 2) * (G - 1))), i1 = Math.min(G - 2, Math.ceil(((x + rad + 1) / 2) * (G - 1)));
    const j0 = Math.max(1, Math.floor(((y - rad + 1) / 2) * (G - 1))), j1 = Math.min(G - 2, Math.ceil(((y + rad + 1) / 2) * (G - 1)));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const px = (i / (G - 1)) * 2 - 1, py = (j / (G - 1)) * 2 - 1;
        if (px * px + py * py > 0.97 * 0.97) continue;
        const d = Math.hypot(px - x, py - y) / rad;
        if (d >= 1) continue;
        const v = amt * Math.sqrt(1 - d * d) * edge(px, py);
        D[j * G + i] = Math.max(D[j * G + i], D[j * G + i] * 0.6 + v);
      }
  }
  // dipteki çamur, düzensiz kenarlı
  const heapR = 0.3 + rand() * 0.1;
  for (let k = 0; k < 90; k++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * heapR;
    disc(Math.cos(a) * d, Math.sin(a) * d, 0.05 + rand() * 0.08, 2.4 + rand() * 2);
  }
  const sc = 1.6 + rand() * 1.4, ox = rand() * 40, oy = rand() * 40;
  const psi = (x, y) => nz(x * sc + ox, y * sc + oy);
  const streams = [];
  const K = 5 + Math.floor(rand() * 8);
  for (let k = 0; k < K; k++) {
    const a = rand() * Math.PI * 2;
    streams.push({ x: Math.cos(a) * heapR * 0.9, y: Math.sin(a) * heapR * 0.9, m: 0.6 + rand() * 0.9, dx: Math.cos(a), dy: Math.sin(a), gen: 0 });
  }
  let guard = 0;
  while (streams.length && guard++ < 60) {
    const st = streams.pop();
    let { x, y, m, dx, dy } = st;
    const wig = 0.6 + rand() * 1.6;
    for (let s = 0; s < 400 && m > 0.04; s++) {
      const r = Math.hypot(x, y) || 1e-6;
      const e = 0.003;
      const cx = (psi(x, y + e) - psi(x, y - e)) / (2 * e), cy = -(psi(x + e, y) - psi(x - e, y)) / (2 * e);
      // yön: dışa doğru + girdap; ataletle yumuşar
      let nx = x / r + cx * 0.35 * wig, ny = y / r + cy * 0.35 * wig;
      const nl = Math.hypot(nx, ny);
      dx = dx * 0.8 + (nx / nl) * 0.2; dy = dy * 0.8 + (ny / nl) * 0.2;
      const dl = Math.hypot(dx, dy);
      dx /= dl; dy /= dl;
      x += dx * 0.007; y += dy * 0.007;
      if (Math.hypot(x, y) > 0.95) break;
      const w = 0.008 + 0.026 * m * (0.6 + 0.8 * nz(x * 5 + 3, y * 5 + 9));
      disc(x, y, w, 1.4 + m * 1.6);
      m -= 0.006 + rand() * 0.004;
      if (rand() < 0.022) {
        // topak: birkaç diskten düzensiz bir leke
        const big = 0.03 + rand() * 0.05 * (0.5 + m);
        const n = 2 + Math.floor(rand() * 4);
        for (let q = 0; q < n; q++) disc(x + (rand() - 0.5) * big * 1.6, y + (rand() - 0.5) * big * 1.6, big * (0.5 + rand() * 0.6), 2.5);
        m -= 0.08;
      }
      if (st.gen < 2 && rand() < 0.012) {
        const side = rand() < 0.5 ? 1 : -1, ang = 0.5 + rand() * 0.6;
        const ca = Math.cos(ang * side), sa = Math.sin(ang * side);
        streams.push({ x, y, m: m * 0.55, dx: dx * ca - dy * sa, dy: dx * sa + dy * ca, gen: st.gen + 1 });
        m *= 0.7;
      }
    }
  }
  // duvara sıçrayan lekeler: 1–5 diskten oluşan, bazen bir doğru boyunca dizili kümeler
  const splats = 6 + Math.floor(rand() * 12);
  for (let k = 0; k < splats; k++) {
    const a = rand() * Math.PI * 2, d = 0.5 + rand() * 0.42;
    let x = Math.cos(a) * d, y = Math.sin(a) * d;
    const n = 1 + Math.floor(rand() * 5), sz = 0.018 + rand() * 0.045;
    const ta = rand() * Math.PI * 2;
    for (let q = 0; q < n; q++) {
      disc(x, y, sz * (0.6 + rand() * 0.7), 2.2);
      x += Math.cos(ta + (rand() - 0.5)) * sz * 1.3;
      y += Math.sin(ta + (rand() - 0.5)) * sz * 1.3;
    }
  }
  // tane tane telve
  const grains = 400 + Math.floor(rand() * 1400);
  for (let k = 0; k < grains; k++) {
    const a = rand() * Math.PI * 2, d = 0.42 + Math.sqrt(rand()) * 0.54;
    disc(Math.cos(a) * d, Math.sin(a) * d, 0.006 + rand() * 0.006, 1.8);
  }
  return D;
}

/* ------------------------------------------------------------ şekil bulma */
const H = 100;
function detect(D, seed) {
  const rand = rng(seed * 7 + 3);
  const M = new Uint8Array(H * H);
  const val = (i, j) => {
    let s = 0;
    for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) s += D[(3 * j + b) * G + 3 * i + a];
    return s / 9;
  };
  let dipMass = 0, dipArea = 0;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < H; i++) {
      const x = (i + 0.5) / H * 2 - 1, y = (j + 0.5) / H * 2 - 1, r = Math.hypot(x, y);
      const v = val(i, j);
      if (r < 0.42) { dipArea++; dipMass += Math.min(1, v / 2.2); continue; }
      if (r < 0.96 && v > 1.25) M[j * H + i] = 1;
    }
  const seen = new Uint8Array(H * H);
  const comps = [];
  let tiny = 0;
  for (let k = 0; k < H * H; k++) {
    if (!M[k] || seen[k]) continue;
    const px = [];
    const st = [k];
    seen[k] = 1;
    while (st.length) {
      const c = st.pop();
      px.push(c);
      const i = c % H, j = (c / H) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj, q = jj * H + ii;
        if (ii >= 0 && jj >= 0 && ii < H && jj < H && M[q] && !seen[q]) { seen[q] = 1; st.push(q); }
      }
    }
    if (px.length < 7) { if (px.length >= 2) tiny++; continue; }
    if (px.length > 1400) continue;
    comps.push(measure(px, M));
  }
  return { comps: classify(comps, rand), tiny, dip: dipMass / dipArea };
}
function measure(px, M) {
  let sx = 0, sy = 0, i0 = H, i1 = 0, j0 = H, j1 = 0;
  for (const c of px) {
    const i = c % H, j = (c / H) | 0;
    sx += i; sy += j;
    i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
  }
  const n = px.length, mx = sx / n, my = sy / n;
  let xx = 0, yy = 0, xy = 0;
  for (const c of px) {
    const dx = (c % H) - mx, dy = ((c / H) | 0) - my;
    xx += dx * dx; yy += dy * dy; xy += dx * dy;
  }
  xx /= n; yy /= n; xy /= n;
  const tr = xx + yy, det = xx * yy - xy * xy, disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc, l2 = Math.max(0.05, tr / 2 - disc);
  const ang = 0.5 * Math.atan2(2 * xy, xx - yy);
  const ax = Math.cos(ang), ay = Math.sin(ang);
  // eksen boyunca kütle profili ve eksenden sapma (eğrilik)
  const L = 4 * Math.sqrt(l1);
  const bins = new Array(6).fill(0), off = new Array(6).fill(0), cnt = new Array(6).fill(0);
  for (const c of px) {
    const dx = (c % H) - mx, dy = ((c / H) | 0) - my;
    const t = dx * ax + dy * ay, s = -dx * ay + dy * ax;
    const b = Math.max(0, Math.min(5, Math.floor(((t / L) + 0.5) * 6)));
    bins[b]++; off[b] += s; cnt[b]++;
  }
  const means = off.map((o, b) => (cnt[b] ? o / cnt[b] : 0));
  const avg = means.reduce((a, b) => a + b, 0) / 6;
  const curve = Math.sqrt(means.reduce((a, m) => a + (m - avg) ** 2, 0) / 6) / Math.max(1, L);
  // delik: kutunun dışından ulaşılamayan boşluklar
  const w = i1 - i0 + 3, h = j1 - j0 + 3;
  const own = new Set(px);
  const reach = new Uint8Array(w * h);
  const st = [0];
  reach[0] = 1;
  while (st.length) {
    const c = st.pop(), i = c % w, j = (c / w) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
      const q = jj * w + ii;
      if (reach[q]) continue;
      const gi = ii + i0 - 1, gj = jj + j0 - 1;
      if (own.has(gj * H + gi)) continue;
      reach[q] = 1;
      st.push(q);
    }
  }
  let hole = 0;
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) if (!reach[j * w + i] && !own.has((j + j0 - 1) * H + (i + i0 - 1))) hole++;
  return { n, mx, my, elong: Math.sqrt(l1 / l2), L, bins, curve, hole, box: n / ((i1 - i0 + 1) * (j1 - j0 + 1)), ang };
}
function classify(comps, rand) {
  for (const c of comps) {
    const ends = (c.bins[0] + c.bins[1] + c.bins[4] + c.bins[5]) / 4, mid = (c.bins[2] + c.bins[3]) / 2;
    const lop = Math.abs(c.bins[0] + c.bins[1] - c.bins[4] - c.bins[5]) / Math.max(1, c.bins[0] + c.bins[1] + c.bins[4] + c.bins[5]);
    if (c.hole >= 3 && c.elong < 2.6) c.type = 'yuzuk';
    else if (c.elong > 3.1) c.type = c.curve > 0.07 ? 'yilan' : 'yol';
    else if (c.elong > 1.5 && mid < ends * 0.62) c.type = 'kus';
    else if (c.elong > 1.5 && lop > 0.42) c.type = 'balik';
    else if (c.n > 110) c.type = 'dag';
    else if (c.box > 0.6) c.type = 'ev';
    else c.type = 'agac';
  }
  // En belirgin şekiller: büyükten küçüğe, aynı türden en çok iki
  const out = [], per = {};
  for (const c of comps.sort((a, b) => b.n - a.n)) {
    if ((per[c.type] = (per[c.type] || 0) + 1) > 2) continue;
    out.push(c);
    if (out.length >= 5) break;
  }
  return out;
}

/* ------------------------------------------------------------ fal metni */
const AD = { yol: 'Yol', yilan: 'Yılan', kus: 'Kuş', balik: 'Balık', dag: 'Dağ', yuzuk: 'Yüzük', ev: 'Ev', agac: 'Ağaç', para: 'Kısmet' };
function read(found, rand, niyet) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const place = (c) => {
    const x = (c.mx + 0.5) / H * 2 - 1, y = (c.my + 0.5) / H * 2 - 1;
    const r = Math.hypot(x, y), th = Math.atan2(y, x); // kulp sağda (0)
    const where = Math.abs(th) < Math.PI / 3 ? pick(['evinin içinden', 'sana çok yakın birinden', 'kapının önünden']) : Math.abs(th) > (2 * Math.PI) / 3 ? pick(['uzaklardan', 'hiç beklemediğin bir yerden', 'denizler ötesinden']) : pick(['bir dostundan', 'iş yerinden', 'eski bir tanıdıktan']);
    const when = r > 0.8 ? pick(['çok yakında', 'üç vakte kadar', 'bu hafta içinde']) : r > 0.62 ? pick(['birkaç hafta içinde', 'ay dönmeden', 'mevsim değişirken']) : pick(['biraz zaman alacak ama', 'sabrın sonunda', 'vakti gelince']);
    return { where, when };
  };
  const T = {
    yol: (p) => pick([`Önünde açık bir yol var; ${p.when} bir yolculuk görünüyor, ${p.where} gelen bir davetle.`, `Düz bir yol uzanıyor; ${p.when} işlerin yoluna girecek.`]),
    yilan: (p) => pick([`Kıvrılmış bir yılan görüyorum; ${p.where} bir dedikodu dolaşıyor ama sana dokunamaz.`, `Bir yılan kıvrılmış; ${p.when} bir kıskançlığı geride bırakacaksın.`]),
    kus: (p) => pick([`Kanatlarını açmış bir kuş var; ${p.when} ${p.where} sevindirici bir haber gelecek.`, `Bir kuş havalanıyor; ${p.where} beklediğin o mesaj ${p.when} gelir.`]),
    balik: (p) => pick([`Bir balık çıktı; kısmetin açık, ${p.when} bereket var.`, `Balık görünüyor; ${p.where} kazançlı bir iş, ${p.when}.`]),
    dag: () => pick(['Önünde bir dağ duruyor; zorlu ama aşılmaz değil, arkasında ferah bir ova var.', 'Bir dağ yükseliyor; omzundaki yük ağır, ama tepeye çıkınca manzara güzel.']),
    yuzuk: (p) => pick([`Bir halka görünüyor; ${p.where} bir söz, belki bir birliktelik.`, `Yüzük şeklinde bir halka; ${p.when} gönül işlerinde güzel bir gelişme.`]),
    ev: (p) => pick([`Bir ev şekli var; yuvana dair hayırlı bir değişiklik, ${p.when}.`, `Ev görüyorum; ${p.where} bir misafir gelecek, kapın açık olsun.`]),
    agac: () => pick(['Dallı budaklı bir ağaç: sağlık ve uzun ömür; ailen genişliyor.', 'Bir ağaç kök salmış; başladığın iş meyvesini verecek.']),
  };
  const used = new Set();
  const lines = found.comps.map((c, i) => {
    let text = T[c.type](place(c));
    for (let k = 0; k < 6 && used.has(text.slice(0, 24)); k++) text = T[c.type](place(c));
    used.add(text.slice(0, 24));
    return { n: i + 1, type: c.type, text };
  });
  if (found.tiny >= 14) lines.push({ n: lines.length + 1, type: 'para', text: 'Kenarlar tane tane telve dolu; bu kısmet demek, eline para geçecek.' });
  const giris = found.dip > 0.55 ? 'Dibin dolu; gönlünde bir ağırlık var ama paylaştıkça hafifleyecek.' : found.dip > 0.3 ? 'Dibin yarı açık; içinde bir soru var, cevabı fincanda.' : 'Dibin tertemiz; gönlün ferah, niyetin saf.';
  const good = lines.filter((l) => ['kus', 'balik', 'yuzuk', 'ev', 'agac', 'yol', 'para'].includes(l.type)).length;
  const son = niyet
    ? `Niyetin «${niyet}» için: ${good >= Math.ceil(lines.length / 2) ? 'fincan olur diyor.' : 'biraz sabır gerek, ama kapı kapanmamış.'}`
    : pick(['Fal ile değil, hal ile yaşa.', 'Gerisi sende; kahven tatlı, gönlün ferah olsun.']);
  return { giris, lines, son };
}

/* ------------------------------------------------------------ çizim */
let W = 0, Hc = 0, dpr = 1, cx = 0, cy = 0, Rr = 100;
let woodCanvas = null;
const telve = document.createElement('canvas');
telve.width = telve.height = G;
function layout() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  W = cv.clientWidth; Hc = cv.clientHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(Hc * dpr);
  const narrow = W < 760 || W / Hc < 0.8;
  const panelH = narrow ? Math.min(Hc * 0.46, 330) : 0;
  const left = narrow ? 0 : 340;
  cx = left + (W - left) / 2;
  cy = (Hc - panelH) / 2 + (narrow ? 18 : 10);
  Rr = Math.min((W - left) * 0.3, (Hc - panelH) * 0.3);
  cx *= dpr; cy *= dpr; Rr *= dpr; // çizim tuval pikseliyle yapılır
  woodCanvas = makeWood();
}
function makeWood() {
  const c = document.createElement('canvas');
  c.width = cv.width; c.height = cv.height;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, c.width, c.height);
  gr.addColorStop(0, '#4a2e1b'); gr.addColorStop(0.5, '#3a2415'); gr.addColorStop(1, '#2a190e');
  g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
  const r = rng(11);
  g.globalAlpha = 0.09;
  for (let i = 0; i < 140; i++) {
    const y = r() * c.height;
    g.strokeStyle = r() < 0.5 ? '#1a0e06' : '#6b4429';
    g.lineWidth = (0.5 + r() * 2.5) * dpr;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= c.width; x += 40) g.lineTo(x, y + Math.sin(x * 0.004 + i) * 6 * dpr);
    g.stroke();
  }
  g.globalAlpha = 1;
  const v = g.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.2, c.width / 2, c.height / 2, c.width * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = v; g.fillRect(0, 0, c.width, c.height);
  return c;
}
function paintTelve(D) {
  const g = telve.getContext('2d');
  const img = g.createImageData(G, G);
  const r = rng(5);
  for (let k = 0; k < G * G; k++) {
    const v = D[k];
    const a = 1 - Math.exp(-v * 0.55);
    const t = Math.min(1, v / 5);
    img.data[k * 4] = 120 - 92 * t;
    img.data[k * 4 + 1] = 78 - 62 * t;
    img.data[k * 4 + 2] = 48 - 40 * t;
    img.data[k * 4 + 3] = Math.min(255, a * 255 * (0.82 + r() * 0.3));
  }
  g.putImageData(img, 0, 0);
}

const S = { phase: 0, t0: 0, level: 1, flip: 0, cool: 0, reveal: 0, seed: 0, D: null, found: null, labels: 0 };
const now = () => performance.now();

function drawSaucer() {
  const R = Rr * 1.55;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 30 * dpr; ctx.shadowOffsetY = 12 * dpr;
  const g = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.25, R * 0.1, cx, cy, R);
  g.addColorStop(0, '#fffdf9'); g.addColorStop(0.75, '#ece5da'); g.addColorStop(1, '#d6cdbf');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#c9a25a'; ctx.lineWidth = 2 * dpr;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.93, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(120,100,80,0.18)'; ctx.lineWidth = 6 * dpr;
  ctx.beginPath(); ctx.arc(cx, cy, Rr * 1.12, 0, Math.PI * 2); ctx.stroke();
}
function drawHandle(alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = Rr * 0.17;
  ctx.beginPath(); ctx.arc(cx + Rr * 1.16, cy + 6 * dpr, Rr * 0.26, -1.25, 1.25); ctx.stroke();
  ctx.strokeStyle = '#f7f3ec'; ctx.lineWidth = Rr * 0.14;
  ctx.beginPath(); ctx.arc(cx + Rr * 1.15, cy, Rr * 0.26, -1.25, 1.25); ctx.stroke();
  ctx.strokeStyle = '#c9a25a'; ctx.lineWidth = 1.6 * dpr;
  ctx.beginPath(); ctx.arc(cx + Rr * 1.15, cy, Rr * 0.26, -1.15, 1.15); ctx.stroke();
  ctx.restore();
}
function drawInterior(t) {
  // dış kenar
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 14 * dpr; ctx.shadowOffsetY = 6 * dpr;
  ctx.fillStyle = '#faf7f2';
  ctx.beginPath(); ctx.arc(cx, cy, Rr * 1.08, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#c9a25a'; ctx.lineWidth = 2.2 * dpr;
  ctx.beginPath(); ctx.arc(cx, cy, Rr * 1.045, 0, Math.PI * 2); ctx.stroke();
  // iç yüzey: dibe doğru aydınlık, kenara doğru gölgeli
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, Rr, 0, Math.PI * 2); ctx.clip();
  const g = ctx.createRadialGradient(cx - Rr * 0.12, cy - Rr * 0.15, Rr * 0.1, cx, cy, Rr);
  g.addColorStop(0, '#fffefb'); g.addColorStop(0.42, '#f3eee6'); g.addColorStop(0.85, '#ddd4c6'); g.addColorStop(1, '#c8bca9');
  ctx.fillStyle = g; ctx.fillRect(cx - Rr, cy - Rr, Rr * 2, Rr * 2);
  ctx.strokeStyle = 'rgba(150,130,105,0.25)'; ctx.lineWidth = 2 * dpr;
  ctx.beginPath(); ctx.arc(cx, cy, Rr * 0.42, 0, Math.PI * 2); ctx.stroke();
  if (S.phase <= 1) {
    // içilen kahvenin duvarda bıraktığı ince lekeyle birlikte yüzey
    const lv = S.level;
    ctx.fillStyle = 'rgba(110,70,40,0.16)';
    ctx.beginPath(); ctx.arc(cx, cy, Rr * 0.99, 0, Math.PI * 2); ctx.fill();
    const rs = Rr * (0.45 + 0.55 * lv);
    const cg = ctx.createRadialGradient(cx, cy, rs * 0.2, cx, cy, rs);
    cg.addColorStop(0, '#3b2112'); cg.addColorStop(0.8, '#4a2b17'); cg.addColorStop(1, lv > 0.2 ? '#a77a4c' : '#3a2212');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(cx, cy, rs, 0, Math.PI * 2); ctx.fill();
    if (lv > 0.15) {
      // köpük kabarcıkları
      const r = rng(7);
      ctx.fillStyle = `rgba(196,150,100,${0.5 * lv})`;
      for (let i = 0; i < 160; i++) {
        const a = r() * Math.PI * 2, d = rs * (0.55 + 0.45 * Math.sqrt(r()));
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, (0.8 + r() * 2.4) * dpr * (Rr / 160), 0, Math.PI * 2); ctx.fill();
      }
    }
  } else if (S.D) {
    ctx.globalAlpha = S.reveal;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(telve, cx - Rr, cy - Rr, Rr * 2, Rr * 2);
    ctx.globalAlpha = 1;
  }
  // kenarda iç gölge
  const sh = ctx.createRadialGradient(cx, cy, Rr * 0.86, cx, cy, Rr);
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(60,40,20,0.28)');
  ctx.fillStyle = sh; ctx.fillRect(cx - Rr, cy - Rr, Rr * 2, Rr * 2);
  ctx.restore();
}
function drawBottom() {
  // ters çevrilmiş fincan: dışı ve taban halkası
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 18 * dpr; ctx.shadowOffsetY = 8 * dpr;
  const g = ctx.createRadialGradient(cx - Rr * 0.3, cy - Rr * 0.35, Rr * 0.1, cx, cy, Rr * 1.08);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#efe9e0'); g.addColorStop(1, '#d9cfc0');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, Rr * 1.08, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#c9a25a'; ctx.lineWidth = 2 * dpr;
  ctx.beginPath(); ctx.arc(cx, cy, Rr * 0.5, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(140,120,100,0.35)'; ctx.lineWidth = 5 * dpr;
  ctx.beginPath(); ctx.arc(cx, cy, Rr * 0.46, 0, Math.PI * 2); ctx.stroke();
  // lale süslemesi
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#2f6f8f'; ctx.fillStyle = 'rgba(47,111,143,0.15)'; ctx.lineWidth = 1.6 * dpr;
  for (let k = 0; k < 8; k++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, -Rr * 0.62);
    ctx.quadraticCurveTo(Rr * 0.08, -Rr * 0.76, 0, -Rr * 0.92);
    ctx.quadraticCurveTo(-Rr * 0.08, -Rr * 0.76, 0, -Rr * 0.62);
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  // soğuma halkası
  if (S.phase === 2) {
    ctx.strokeStyle = 'rgba(241,194,125,0.9)'; ctx.lineWidth = 4 * dpr; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, Rr * 1.22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * S.cool); ctx.stroke();
    ctx.fillStyle = '#8a5a2a';
    ctx.font = `italic ${15 * dpr}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText(S.cool < 1 ? 'Soğuyor…' : 'Hazır', cx, cy + 5 * dpr);
  }
}
function drawLabels() {
  if (!S.found || S.labels <= 0) return;
  const k = S.labels;
  S.found.comps.forEach((c, i) => {
    const x = cx + ((c.mx + 0.5) / H * 2 - 1) * Rr, y = cy + ((c.my + 0.5) / H * 2 - 1) * Rr;
    const rad = Math.max(10 * dpr, Math.sqrt(c.n) * (Rr / H) * 1.5);
    const a = Math.max(0, Math.min(1, k * 5 - i * 0.6));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.setLineDash([5 * dpr, 4 * dpr]);
    ctx.strokeStyle = '#e0a860'; ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    const bx = x + rad * 0.72, by = y - rad * 0.72;
    ctx.fillStyle = '#e0a860';
    ctx.beginPath(); ctx.arc(bx, by, 11 * dpr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a1709';
    ctx.font = `700 ${12 * dpr}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), bx, by + 0.5 * dpr);
    ctx.restore();
  });
}
function frame() {
  const t = now();
  if (S.phase === 1 && S.level > 0) S.level = Math.max(0, 1 - (t - S.t0) / (reduce ? 1 : 2200));
  if (S.phase === 2) {
    S.flip = Math.min(1, (t - S.t0) / (reduce ? 1 : 900));
    S.cool = Math.min(1, Math.max(0, (t - S.t0 - 900) / (reduce ? 400 : 5200)));
    if (S.cool >= 1 && btn.disabled) { btn.disabled = false; btn.textContent = 'Fincanı aç'; status.textContent = 'Telve kurudu. Fincanı açabilirsin.'; }
  }
  if (S.phase === 3) { S.flip = Math.max(0, 1 - (t - S.t0) / (reduce ? 1 : 700)); S.reveal = Math.min(1, (t - S.t0 - 200) / (reduce ? 1 : 1100)); }
  if (S.phase === 4) S.labels = Math.min(2, (t - S.t0) / 1000);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(woodCanvas, 0, 0);
  ctx.save();
  ctx.scale(1, 1);
  drawSaucer();
  // ters çevirme: dikey ezilme ile dönüş hissi
  const f = S.flip;
  const sy = Math.abs(Math.cos(f * Math.PI));
  ctx.translate(cx, cy); ctx.scale(1, Math.max(0.04, sy)); ctx.translate(-cx, -cy);
  if (f < 0.5) { drawHandle(); drawInterior(t); drawLabels(); }
  else { drawHandle(0.9); drawBottom(); }
  ctx.restore();
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------ akış */
const ADIM = ['Kahveni iç', 'Fincanı kapat', 'Soğuyor…', 'Falıma bak', 'Paylaş'];
function steps() {
  document.querySelectorAll('.adimlar li').forEach((li) => li.classList.toggle('on', +li.dataset.a <= S.phase));
}
function go(phase) {
  S.phase = phase;
  S.t0 = now();
  btn.disabled = phase === 2;
  btn.textContent = ADIM[phase];
  steps();
  if (phase === 0) {
    S.level = 1; S.flip = 0; S.reveal = 0; S.labels = 0; S.D = null; S.found = null;
    falBox.textContent = '';
    status.textContent = 'Fincan dolu. Niyetini tut, kahveni iç.';
  }
  if (phase === 1) status.textContent = 'Kahve içiliyor. Telve dipte kalır.';
  if (phase === 2) {
    status.textContent = 'Fincan tabağa kapatıldı; telve kenarlara akıyor ve kuruyor.';
    setTimeout(() => {
      S.D = simulate(S.seed);
      paintTelve(S.D);
      S.found = detect(S.D, S.seed);
    }, 30);
  }
  if (phase === 3) {
    if (!S.D) { S.D = simulate(S.seed); paintTelve(S.D); S.found = detect(S.D, S.seed); }
    history.replaceState(null, '', '#' + S.seed.toString(36));
    status.textContent = `Fincan açıldı. Telvede ${S.found.comps.length} belirgin şekil var.`;
  }
  if (phase === 4) showFal();
}
function showFal() {
  const rand = rng(S.seed * 31 + 9);
  const niyet = $('#niyet').value.trim().replace(/[«»]/g, '');
  const f = read(S.found, rand, niyet);
  falBox.textContent = '';
  const p = document.createElement('p');
  p.className = 'giris';
  p.textContent = f.giris;
  falBox.append(p);
  const ol = document.createElement('ol');
  for (const l of f.lines) {
    const li = document.createElement('li');
    const b = document.createElement('b');
    b.textContent = l.type === 'para' ? '•' : String(l.n);
    const s = document.createElement('span');
    const em = document.createElement('em');
    em.textContent = AD[l.type] + '. ';
    s.append(em, l.text);
    li.append(b, s);
    ol.append(li);
  }
  if (f.lines.length) falBox.append(ol);
  const son = document.createElement('p');
  son.textContent = f.son;
  falBox.append(son);
  if (!f.lines.length) {
    const z = document.createElement('p');
    z.textContent = 'Telve pek akmamış; fincan sana bugün sus diyor. Yeni bir kahveyle yeniden bak.';
    falBox.insertBefore(z, son);
  }
}
btn.addEventListener('click', () => {
  if (S.phase === 4) {
    const url = location.href;
    navigator.clipboard?.writeText(url).then(
      () => (status.textContent = 'Fincanın bağlantısı kopyalandı.'),
      () => (status.textContent = url),
    );
    btn.textContent = 'Kopyalandı';
    setTimeout(() => S.phase === 4 && (btn.textContent = ADIM[4]), 1600);
    return;
  }
  go(S.phase + 1);
});
$('#yeni').addEventListener('click', () => {
  S.seed = (Math.random() * 2 ** 31) | 0;
  history.replaceState(null, '', location.pathname);
  go(0);
});

addEventListener('resize', layout);
layout();
const h = parseInt(location.hash.slice(1), 36);
if (Number.isFinite(h) && h > 0) {
  // Paylaşılan fincan: doğrudan açık ve yorumlanmış gelir
  S.seed = h;
  S.D = simulate(S.seed); paintTelve(S.D); S.found = detect(S.D, S.seed);
  S.level = 0; S.reveal = 1;
  go(4);
  S.reveal = 1;
} else {
  S.seed = (Math.random() * 2 ** 31) | 0;
  go(0);
}
requestAnimationFrame(frame);
