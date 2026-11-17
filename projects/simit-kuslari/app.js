// Simit Kuşları — vapurun peşindeki martılar.
// Vapur yerinde süzülür, şehir ve su arkada akar; atılan simit havada ya da suda olsun sürüyü çeker.
import { createFlock, resize, step } from './suru.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#deniz');
const ctx = canvas.getContext('2d');
const panel = $('.panel');
const ui = {
  n: $('#suru'), nOut: $('#suru-out'), wind: $('#ruzgar'), windOut: $('#ruzgar-out'),
  unity: $('#tavir'), unityOut: $('#tavir-out'), vakit: [...document.querySelectorAll('input[name="vakit"]')],
  throwBtn: $('#at'), share: $('#share'), shareBox: $('#sharebox'), shareLink: $('#share-link'),
  tally: $('#tally'), status: $('#status'),
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = () => matchMedia('(max-width: 760px), (max-aspect-ratio: 4/5)').matches;

const VAKIT = {
  s: { name: 'Sabah', sky: ['#7fb6dd', '#bfdcec', '#f4e6cb'], sea: ['#5d93b0', '#2c5a75', '#1b3d52'], city: '#94a8b8', haze: '#d9e6ee', sun: { x: 0.2, y: 0.2, r: 26, c: '#fff8df', glow: 'rgba(255,248,220,0.55)' }, gull: '#ffffff', wing: '#d5dce2', tip: '#2b3036', hull: '#203247', lights: false },
  i: { name: 'İkindi', sky: ['#3f86c2', '#86bde0', '#f2cf95'], sea: ['#3e7ea1', '#1e4f6b', '#123247'], city: '#62778b', haze: '#e9d7b4', sun: { x: 0.8, y: 0.17, r: 30, c: '#fff1c2', glow: 'rgba(255,226,150,0.6)' }, gull: '#fffaf1', wing: '#d6d9db', tip: '#2a2c30', hull: '#1c2c40', lights: false },
  a: { name: 'Akşam', sky: ['#2a2b5c', '#a2546a', '#f2945a', '#f8c46e'], sea: ['#5a4566', '#2c2340', '#17142a'], city: '#2b2239', haze: '#f2a467', sun: { x: 0.72, y: -1, r: 40, c: '#ffb25a', glow: 'rgba(255,140,60,0.7)' }, gull: '#ffe9d6', wing: '#e3c9bd', tip: '#2a2027', hull: '#191a2c', lights: true },
};

let state = { n: phone() ? 90 : 140, wind: 1, vakit: 'i', unity: 5 };
const flock = createFlock(500);
const simits = Array.from({ length: 10 }, () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, inWater: false, bites: 0, age: 0, spin: 0, land: 0, born: 0 }));
const crumbs = [];
const tally = { thrown: 0, eaten: 0, bites: 0 };
let aim = null; // klavye nişangâhı

// ------------------------------------------------------------------ yerleşim
let W = 0, H = 0, dpr = 1, waterY = 0, sceneL = 0, sceneR = 0, sceneB = 0;
const ferry = { x: 0, y: 0, L: 300, bob: 0 };
function layout() {
  const r = canvas.getBoundingClientRect();
  dpr = Math.min(devicePixelRatio || 1, 2);
  W = r.width; H = r.height;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const pr = panel.getBoundingClientRect();
  if (phone()) { sceneL = 0; sceneR = W; sceneB = Math.max(H * 0.45, pr.top); }
  else { sceneL = pr.right; sceneR = W; sceneB = H; }
  waterY = Math.round(sceneB * 0.64);
  ferry.L = Math.max(200, Math.min(500, (sceneR - sceneL) * 0.36));
  ferry.y = waterY + ferry.L * 0.02;
  sky = null; city = null;
}

// ------------------------------------------------------------------ önceden çizilen katmanlar
let sky = null; // gök, güneş: durağan
let city = null; // uzak siluet şeridi: periyodik, kayarak tekrar eder
const CITY_P = 2200;
function seeded(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function buildSky(v) {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = Math.ceil((waterY + 2) * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const grad = g.createLinearGradient(0, 0, 0, waterY);
  v.sky.forEach((col, i) => grad.addColorStop(i / (v.sky.length - 1), col));
  g.fillStyle = grad; g.fillRect(0, 0, W, waterY + 2);
  const sx = sceneL + (sceneR - sceneL) * v.sun.x;
  const sy = v.sun.y < 0 ? waterY - 26 : waterY * v.sun.y + 20;
  const glow = g.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 0.5);
  glow.addColorStop(0, v.sun.glow); glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, waterY + 2);
  g.fillStyle = v.sun.c; g.beginPath(); g.arc(sx, sy, v.sun.r, 0, 7); g.fill();
  return { c, sx, sy };
}

// Kubbeler ve minareler: tohumlu, CITY_P piksellik periyotla kendini tekrar eder.
function buildCity(v) {
  const h = Math.ceil(waterY * 0.42);
  const c = document.createElement('canvas');
  c.width = Math.ceil(CITY_P * dpr); c.height = Math.ceil(h * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const rnd = seeded(1453);
  const base = h;
  // Tepeler
  g.fillStyle = v.city; g.globalAlpha = 0.55;
  g.beginPath(); g.moveTo(0, base);
  for (let x = 0; x <= CITY_P; x += 20) g.lineTo(x, base - 18 - 14 * Math.sin((x / CITY_P) * Math.PI * 6) - 8 * Math.sin((x / CITY_P) * Math.PI * 14));
  g.lineTo(CITY_P, base); g.fill();
  g.globalAlpha = 1;
  // Evler ve camiler
  const unit = Math.max(0.7, Math.min(1.3, waterY / 420));
  let x = 0;
  while (x < CITY_P - 60) {
    const kind = rnd();
    if (kind < 0.12) {
      // Selatin camisi: kasnaklı ana kubbe, yarım kubbeler, dört minare
      const w = (150 + rnd() * 60) * unit; const cx = x + w / 2; const top = base - 70 * unit;
      g.fillStyle = v.city;
      g.fillRect(x + 8, base - 40 * unit, w - 16, 40 * unit);
      for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * w * 0.22, base - 40 * unit, w * 0.16, Math.PI, 0); g.fill(); }
      g.fillRect(cx - w * 0.2, top + 4, w * 0.4, 30 * unit);
      g.beginPath(); g.arc(cx, top + 6, w * 0.22, Math.PI, 0); g.fill();
      g.fillRect(cx - 1, top - w * 0.22 - 10, 2, 10);
      for (const mx of [x + 4, x + w - 8, x + w * 0.22, x + w * 0.74].slice(0, rnd() < 0.5 ? 2 : 4)) {
        const mh = (95 + rnd() * 25) * unit;
        g.fillRect(mx, base - mh, 4, mh);
        g.fillRect(mx - 1.5, base - mh * 0.72, 7, 2.5); g.fillRect(mx - 1.5, base - mh * 0.86, 7, 2.5);
        g.beginPath(); g.moveTo(mx - 0.5, base - mh); g.lineTo(mx + 2, base - mh - 16 * unit); g.lineTo(mx + 4.5, base - mh); g.fill();
      }
      x += w + 20;
    } else if (kind < 0.2) {
      // Kule
      const w = 18 * unit; const th = (60 + rnd() * 30) * unit;
      g.fillStyle = v.city; g.fillRect(x, base - th, w, th);
      g.beginPath(); g.moveTo(x - 3, base - th); g.lineTo(x + w / 2, base - th - 24 * unit); g.lineTo(x + w + 3, base - th); g.fill();
      x += w + 14;
    } else {
      // Ev kümesi
      const w = (12 + rnd() * 22) * unit; const bh = (14 + rnd() * 26) * unit;
      g.fillStyle = v.city; g.fillRect(x, base - bh, w, bh);
      if (v.lights) {
        g.fillStyle = 'rgba(255,214,140,0.85)';
        for (let k = 0; k < 3; k++) if (rnd() < 0.5) g.fillRect(x + 2 + rnd() * (w - 5), base - bh + 3 + rnd() * (bh - 7), 1.6, 1.6);
        g.fillStyle = v.city;
      }
      x += w + rnd() * 3;
    }
  }
  // Pus: ufka yakın kısım havanın rengine karışır.
  const haze = g.createLinearGradient(0, 0, 0, h);
  haze.addColorStop(0, 'rgba(0,0,0,0)'); haze.addColorStop(1, hexA(v.haze, 0.35));
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = haze; g.fillRect(0, 0, CITY_P, h);
  return { c, h };
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

// ------------------------------------------------------------------ bulutlar, su
const cloudRnd = seeded(77);
const clouds = Array.from({ length: 7 }, () => { const r = cloudRnd; return { x: r(), y: 0.08 + r() * 0.28, s: 0.6 + r() * 0.9, puffs: Array.from({ length: 6 }, () => [r() * 2 - 1, r() * 0.5 - 0.25, 0.4 + r() * 0.6]) }; });
const shimRnd = seeded(900);
const shimmer = Array.from({ length: 160 }, () => { const r = shimRnd; return { x: r(), y: r() ** 1.6, w: 6 + r() * 26, p: r() * 6.28 }; });

// ------------------------------------------------------------------ simit
const G = 560;
function throwSimit(tx, ty, quiet = false) {
  let s = simits.find((q) => !q.alive);
  if (!s) s = simits.reduce((a, b) => (a.born < b.born ? a : b));
  const sx = ferry.x - ferry.L * 0.4; const sy = ferry.y - ferry.L * 0.12;
  ty = Math.min(ty, sceneB - 4);
  const T = Math.max(0.45, Math.min(1.15, Math.hypot(tx - sx, ty - sy) / 520));
  Object.assign(s, { alive: true, x: sx, y: sy, vx: (tx - sx) / T, vy: (ty - sy) / T - 0.5 * G * T, inWater: false, bites: 0, age: 0, spin: Math.random() * 6, land: waterY + 6 + Math.random() * Math.max(10, (sceneB - waterY) * 0.5), born: performance.now() });
  tally.thrown++;
  syncTally();
  if (!quiet) {
    const chasers = Math.min(flock.n, Math.round(flock.n * 0.6));
    say(`Simit havada. Martılar fark etti${chasers ? '' : ''}.`);
  }
}
function bite(slot, i) {
  const s = simits[slot];
  if (!s.alive) return;
  s.bites++; tally.bites++;
  for (let k = 0; k < 4; k++) crumbs.push({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 60, life: 0.9, water: s.inWater });
  // Isırılan simit martının çekişiyle biraz savrulur.
  s.vx += flock.vx[i] * 0.15; if (!s.inWater) s.vy += flock.vy[i] * 0.1;
  if (s.bites >= 6) { s.alive = false; tally.eaten++; say(`Simit bitti. Toplam ${tally.eaten} simit yendi.`); }
  syncTally();
}

// ------------------------------------------------------------------ döngü
let last = 0, t = 0, raf = 0;
function frame(now) {
  raf = requestAnimationFrame(frame);
  let dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
  last = now;
  if (reduced) dt *= 0.5;
  t += dt;
  update(dt);
  draw();
}
function update(dt) {
  const v = VAKIT[state.vakit];
  // Vapur sahnenin ortasında hafifçe ileri geri süzülür.
  const mid = (sceneL + sceneR) / 2;
  ferry.x = mid + Math.sin(t * 0.07) * (sceneR - sceneL) * 0.06;
  ferry.bob = reduced ? 0 : Math.sin(t * 1.3) * 1.6;
  const home = { x: ferry.x - ferry.L * 0.25, y: ferry.y - ferry.L * 0.14 };
  const wind = state.wind;
  for (const s of simits) {
    if (!s.alive) continue;
    s.age += dt;
    if (!s.inWater) {
      s.vy += G * dt; s.vx += wind * 10 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.spin += dt * 6;
      if (s.y >= s.land && s.vy > 0) { s.inWater = true; s.y = s.land; s.vy = 0; s.vx = -34 - wind * 3; s.age = 0; splash(s.x, s.y); }
    } else {
      s.vx += (-34 - wind * 3 - s.vx) * Math.min(1, dt * 2);
      s.x += s.vx * dt;
      s.y = s.land + (reduced ? 0 : Math.sin(t * 2 + s.land) * 1.5);
      if (s.age > 28 || s.x < -60) s.alive = false;
    }
    if (s.x > W + 200 || s.y > H + 40) s.alive = false;
  }
  step(flock, dt, { W, H, waterY, wind, home, simits, unity: state.unity, t, onBite: bite });
  for (let k = crumbs.length - 1; k >= 0; k--) {
    const c = crumbs[k];
    c.life -= dt; c.vy += 300 * dt; c.x += c.vx * dt; c.y += c.vy * dt;
    if (c.life <= 0 || c.y > waterY + 40) crumbs.splice(k, 1);
  }
  for (let k = splashes.length - 1; k >= 0; k--) { splashes[k].life -= dt; if (splashes[k].life <= 0) splashes.splice(k, 1); }
  void v;
}
const splashes = [];
function splash(x, y) { splashes.push({ x, y, life: 0.8 }); }

// ------------------------------------------------------------------ çizim
const order = [];
function draw() {
  const v = VAKIT[state.vakit];
  if (!sky) sky = buildSky(v);
  if (!city) city = buildCity(v);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(sky.c, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Bulutlar rüzgârla kayar
  ctx.fillStyle = state.vakit === 'a' ? 'rgba(255,190,170,0.22)' : 'rgba(255,255,255,0.32)';
  for (const c of clouds) {
    const span = W + 400;
    const cx = (((c.x * span + t * (6 + state.wind * 5)) % span) + span) % span - 200;
    const cy = c.y * waterY;
    for (const [px, py, pr] of c.puffs) { ctx.beginPath(); ctx.ellipse(cx + px * 70 * c.s, cy + py * 16 * c.s, pr * 46 * c.s, pr * 15 * c.s, 0, 0, 7); ctx.fill(); }
  }

  // Uzak şehir: yavaşça geri akar (vapur ilerliyor)
  const off = ((t * 9) % CITY_P + CITY_P) % CITY_P;
  const cw = CITY_P * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let x = -off * dpr; x < canvas.width; x += cw) ctx.drawImage(city.c, x, (waterY - city.h) * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Deniz
  const sea = ctx.createLinearGradient(0, waterY, 0, H);
  v.sea.forEach((col, i) => sea.addColorStop(i / (v.sea.length - 1), col));
  ctx.fillStyle = sea; ctx.fillRect(0, waterY, W, H - waterY);
  // Güneşin sudaki yansıması
  const rg = ctx.createLinearGradient(0, waterY, 0, H);
  rg.addColorStop(0, hexA(state.vakit === 'a' ? '#ffb064' : '#fff4d0', 0.5)); rg.addColorStop(1, 'rgba(255,255,255,0)');
  // Yansıma: güneşin altında titreşen kısa altın çizgiler, aşağı indikçe yayılır.
  ctx.lineCap = 'round';
  const glint = state.vakit === 'a' ? '255,170,90' : '255,244,205';
  for (let k = 0; k < 46; k++) {
    const p = k / 46;
    const y = waterY + 2 + p * p * (H - waterY);
    const spread = 14 + p * 70;
    const jx = Math.sin(k * 12.9898 + (reduced ? 0 : t * (0.8 + (k % 5) * 0.3))) * spread;
    ctx.strokeStyle = `rgba(${glint},${0.55 * (1 - p) + 0.08})`;
    ctx.lineWidth = 1 + p * 2;
    ctx.beginPath(); ctx.moveTo(sky.sx + jx - 6 - p * 14, y); ctx.lineTo(sky.sx + jx + 6 + p * 14, y); ctx.stroke();
  }
  void rg;
  // Işıltılar ve dalga çizgileri: uzaktakiler ince ve sık
  ctx.lineCap = 'round';
  for (const s of shimmer) {
    const y = waterY + 3 + s.y * (H - waterY);
    const depth = (y - waterY) / Math.max(1, H - waterY);
    const x = ((s.x * (W + 80) - t * (20 + 50 * depth)) % (W + 80) + W + 80) % (W + 80) - 40;
    const a = reduced ? 0.25 : 0.12 + 0.22 * Math.abs(Math.sin(s.p + t * 1.6));
    ctx.strokeStyle = `rgba(255,255,255,${a * (0.5 + depth)})`;
    ctx.lineWidth = 0.6 + depth * 1.6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s.w * (0.4 + depth), y); ctx.stroke();
  }

  drawFerry(v);
  // Suda yüzen simitler ve sıçramalar
  for (const sp of splashes) {
    const k = 1 - sp.life / 0.8;
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - k)})`; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(sp.x, sp.y + 3, 6 + k * 18, 2 + k * 5, 0, 0, 7); ctx.stroke();
  }
  for (const s of simits) if (s.alive && s.inWater) drawSimit(s);

  // Martılar: uzaktakiler önce
  if (order.length !== flock.n) { order.length = 0; for (let i = 0; i < flock.n; i++) order.push(i); order.sort((a, b) => flock.z[a] - flock.z[b]); }
  for (const i of order) drawGull(i, v);
  for (const s of simits) if (s.alive && !s.inWater) drawSimit(s);
  ctx.fillStyle = '#c98b45';
  for (const c of crumbs) { ctx.globalAlpha = Math.max(0, c.life); ctx.fillRect(c.x, c.y, 2, 2); }
  ctx.globalAlpha = 1;

  if (aim) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(aim.x, aim.y, 12, 0, 7); ctx.moveTo(aim.x - 18, aim.y); ctx.lineTo(aim.x - 6, aim.y); ctx.moveTo(aim.x + 6, aim.y); ctx.lineTo(aim.x + 18, aim.y); ctx.moveTo(aim.x, aim.y - 18); ctx.lineTo(aim.x, aim.y - 6); ctx.moveTo(aim.x, aim.y + 6); ctx.lineTo(aim.x, aim.y + 18); ctx.stroke();
  }
}

function drawFerry(v) {
  const L = ferry.L; const x = ferry.x; const y = ferry.y + ferry.bob; const u = L / 100;
  const stern = x - L / 2; const bow = x + L / 2;
  // Dümen suyu
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (let k = 0; k < 9; k++) {
    const wx = stern - k * 26 * u; const spread = 1 + k * 0.5;
    ctx.globalAlpha = 0.5 * (1 - k / 9);
    ctx.beginPath(); ctx.ellipse(wx, y + 2 * u, 14 * u * spread, 1.6 * u * spread, 0, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Su hattında köpük
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.ellipse(bow - 4 * u, y + 1.5 * u, 8 * u, 1.5 * u, 0, 0, 7); ctx.fill();
  // Gövde (altta koyu, üstte beyaz şerit), baş tarafı eğik
  ctx.fillStyle = v.hull;
  ctx.beginPath();
  ctx.moveTo(stern + 2 * u, y - 7 * u); ctx.lineTo(bow + 4 * u, y - 9 * u); ctx.lineTo(bow - 4 * u, y + 2 * u); ctx.lineTo(stern + 6 * u, y + 2 * u); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f2f0ea';
  ctx.beginPath();
  ctx.moveTo(stern + 2 * u, y - 7 * u); ctx.lineTo(bow + 4 * u, y - 9 * u); ctx.lineTo(bow + 3.2 * u, y - 11 * u); ctx.lineTo(stern + 1 * u, y - 10 * u); ctx.closePath(); ctx.fill();
  // Güverteler
  const deck1 = y - 10 * u; const deck2 = deck1 - 9 * u;
  ctx.fillStyle = '#f6f4ee';
  ctx.fillRect(stern + 6 * u, deck2, L * 0.8, 9 * u);
  ctx.fillRect(stern + 18 * u, deck2 - 7 * u, L * 0.52, 7 * u);
  // Pencereler
  ctx.fillStyle = state.vakit === 'a' ? '#ffd690' : '#3b4b5c';
  for (let k = 0; k < 15; k++) ctx.fillRect(stern + 10 * u + k * 5 * u, deck2 + 2.6 * u, 2.6 * u, 3 * u);
  for (let k = 0; k < 9; k++) ctx.fillRect(stern + 22 * u + k * 5.4 * u, deck2 - 5.2 * u, 2.6 * u, 2.6 * u);
  // Kıç tarafındaki açık güverte ve korkuluk
  ctx.strokeStyle = '#d9d6cc'; ctx.lineWidth = Math.max(1, 0.5 * u);
  ctx.beginPath(); ctx.moveTo(stern + 1 * u, deck2 + 3 * u); ctx.lineTo(stern + 6 * u, deck2 + 3 * u); ctx.stroke();
  // Baca
  const fx = x - 2 * u; const ft = deck2 - 7 * u - 14 * u;
  ctx.fillStyle = '#efe6cf'; ctx.beginPath(); ctx.moveTo(fx - 4 * u, deck2 - 7 * u); ctx.lineTo(fx + 4 * u, deck2 - 7 * u); ctx.lineTo(fx + 5 * u, ft); ctx.lineTo(fx - 2 * u, ft); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1d2433'; ctx.fillRect(fx - 2.2 * u, ft, 7.2 * u, 3 * u);
  // Direk ve bayrak ipi
  ctx.strokeStyle = '#3a4250'; ctx.lineWidth = Math.max(1, 0.45 * u);
  ctx.beginPath(); ctx.moveTo(bow - 18 * u, deck2); ctx.lineTo(bow - 17 * u, deck2 - 24 * u); ctx.lineTo(bow + 2 * u, y - 10 * u); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(stern + 30 * u, deck2 - 7 * u); ctx.lineTo(stern + 30 * u, deck2 - 20 * u); ctx.stroke();
  // Duman: rüzgârın yönüne yatar
  if (!reduced) {
    for (let k = 0; k < 6; k++) {
      const p = (t * 0.6 + k / 6) % 1;
      ctx.fillStyle = `rgba(230,228,224,${0.28 * (1 - p)})`;
      ctx.beginPath(); ctx.arc(fx + 1.5 * u - p * 40 * u + state.wind * p * 14 * u, ft - p * 22 * u, (2 + p * 7) * u, 0, 7); ctx.fill();
    }
  }
}

function drawSimit(s) {
  const r = 7;
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.spin);
  if (s.inWater) { ctx.scale(1, 0.55); }
  const missing = (s.bites / 6) * Math.PI * 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#8a4b1c'; ctx.lineWidth = 5.4;
  ctx.beginPath(); ctx.arc(0, 0, r, missing / 2, Math.PI * 2 - missing / 2); ctx.stroke();
  ctx.strokeStyle = '#c47a35'; ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.arc(0, -0.6, r, missing / 2, Math.PI * 2 - missing / 2); ctx.stroke();
  ctx.fillStyle = '#f6ead0';
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 + 0.2; if (a < missing / 2 || a > Math.PI * 2 - missing / 2) continue; ctx.fillRect(Math.cos(a) * r - 0.5, Math.sin(a) * r - 1.2, 1.1, 0.9); }
  ctx.restore();
}

function drawGull(i, v) {
  const z = flock.z[i];
  const s = 4.5 + z * 8.5;
  const x = flock.x[i]; const y = flock.y[i];
  if (x < -40 || x > W + 40 || y < -40 || y > H + 40) return;
  const vx = flock.vx[i]; const vy = flock.vy[i];
  const dir = vx >= 0 ? 1 : -1;
  const bank = Math.max(-0.5, Math.min(0.5, (vy / (Math.hypot(vx, vy) || 1)) * 0.5)) * dir;
  const f = 0.5 + 0.5 * Math.sin(flock.ph[i]) * flock.flap[i] + (1 - flock.flap[i]) * 0.15;
  // Uzaktakiler havanın rengine karışır.
  ctx.globalAlpha = 0.55 + z * 0.45;
  ctx.save(); ctx.translate(x, y); ctx.rotate(bank);
  const ey = -0.5 * s * (f - 0.35); // dirsek yüksekliği
  const ty = -0.15 * s + 0.55 * s * (0.6 - f); // kanat ucu
  // Kanatlar (M biçimi): üst kenar gri, uçlar koyu
  for (const side of [-1, 1]) {
    ctx.fillStyle = v.wing;
    ctx.beginPath();
    ctx.moveTo(0.12 * s * side, -0.05 * s);
    ctx.quadraticCurveTo(0.35 * s * side, ey - 0.12 * s, 0.6 * s * side, ey);
    ctx.quadraticCurveTo(0.95 * s * side, ey + 0.05 * s, 1.35 * s * side, ty);
    ctx.quadraticCurveTo(0.95 * s * side, ey + 0.22 * s, 0.6 * s * side, ey + 0.16 * s);
    ctx.quadraticCurveTo(0.35 * s * side, ey + 0.12 * s, 0.1 * s * side, 0.12 * s);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = v.tip;
    ctx.beginPath();
    ctx.moveTo(1.35 * s * side, ty);
    ctx.quadraticCurveTo(1.15 * s * side, ey + 0.08 * s, 1.02 * s * side, ey + 0.05 * s);
    ctx.quadraticCurveTo(1.12 * s * side, ey + 0.16 * s, 1.35 * s * side, ty);
    ctx.fill();
  }
  // Gövde ve baş
  ctx.fillStyle = v.gull;
  ctx.beginPath(); ctx.ellipse(0, 0.04 * s, 0.32 * s, 0.13 * s, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(0.28 * s * dir, -0.02 * s, 0.1 * s, 0, 7); ctx.fill();
  if (s > 7) { ctx.fillStyle = '#e6b23a'; ctx.fillRect(0.36 * s * dir - (dir < 0 ? 0.12 * s : 0), -0.02 * s, 0.12 * s, 0.04 * s); }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ etkileşim
function sceneHit(x, y) { return y < sceneB - 2 && x > sceneL; }
canvas.addEventListener('pointerdown', (e) => {
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left; const y = e.clientY - r.top;
  if (!sceneHit(x, y)) return;
  throwSimit(x, y);
});
canvas.addEventListener('focus', () => { if (!aim) aim = { x: ferry.x - ferry.L * 0.9, y: waterY - 60 }; });
canvas.addEventListener('blur', () => { aim = null; });
canvas.addEventListener('keydown', (e) => {
  if (!aim) aim = { x: ferry.x - ferry.L * 0.9, y: waterY - 60 };
  const step_ = e.shiftKey ? 60 : 20;
  const moves = { ArrowLeft: [-step_, 0], ArrowRight: [step_, 0], ArrowUp: [0, -step_], ArrowDown: [0, step_] };
  if (moves[e.key]) {
    e.preventDefault();
    aim.x = Math.max(sceneL + 10, Math.min(sceneR - 10, aim.x + moves[e.key][0]));
    aim.y = Math.max(20, Math.min(sceneB - 10, aim.y + moves[e.key][1]));
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault(); throwSimit(aim.x, aim.y);
  }
});
ui.throwBtn.addEventListener('click', () => {
  // Kıçın arkasına, biraz rastgele bir yere
  const tx = ferry.x - ferry.L * (0.8 + Math.random() * 0.7);
  const ty = waterY - 40 - Math.random() * 120;
  throwSimit(Math.max(sceneL + 20, tx), ty);
});
ui.n.addEventListener('input', () => { state.n = +ui.n.value; resize(flock, state.n, { x: ferry.x, y: ferry.y - 120 }); syncUi(); saveHash(); });
ui.wind.addEventListener('input', () => { state.wind = +ui.wind.value; syncUi(); saveHash(); });
ui.unity.addEventListener('input', () => { state.unity = +ui.unity.value; syncUi(); saveHash(); });
for (const r of ui.vakit) r.addEventListener('change', () => { state.vakit = r.value; sky = null; city = null; syncUi(); saveHash(); say(VAKIT[r.value].name); });

function windName(w) {
  if (w === 0) return 'Durgun';
  return `${w > 0 ? 'Lodos' : 'Poyraz'} ${Math.abs(w)}`;
}
function syncUi() {
  ui.n.value = state.n; ui.nOut.value = state.n;
  ui.wind.value = state.wind; ui.windOut.value = windName(state.wind);
  ui.unity.value = state.unity; ui.unityOut.value = state.unity;
  for (const r of ui.vakit) r.checked = r.value === state.vakit;
  canvas.setAttribute('aria-label', `${VAKIT[state.vakit].name} vakti, vapurun peşinde ${state.n} martı, rüzgâr ${windName(state.wind).toLowerCase()}. Dokunduğun yere simit atılır.`);
}
function syncTally() { ui.tally.textContent = `Atılan ${tally.thrown} · yenen ${tally.eaten}`; }

ui.share.addEventListener('click', async () => {
  const url = `${location.href.split('#')[0]}#${encode(state)}`;
  ui.shareLink.value = url;
  try { await navigator.clipboard.writeText(url); ui.shareBox.hidden = true; say('Bağlantı kopyalandı. Açan kişi aynı vakti, rüzgârı ve sürüyü görür.', true); return; } catch { /* pano kapalı */ }
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

// ------------------------------------------------------------------ adres: sürü.rüzgâr.vakit.tavır
function encode(s) { return [s.n, s.wind, s.vakit, s.unity].join('.'); }
function decode(text) {
  const m = /^(\d{1,3})\.(-?\d)\.([sia])\.(\d)$/.exec(text);
  if (!m) return null;
  const n = Math.max(20, Math.min(400, +m[1]));
  const wind = Math.max(-5, Math.min(5, +m[2]));
  return { n, wind, vakit: m[3], unity: +m[4] };
}
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
else if (location.hash.length > 1) say('Bağlantıdaki ayar okunamadı; varsayılanlar açıldı.', true);
layout();
ferry.x = (sceneL + sceneR) / 2;
resize(flock, state.n, { x: ferry.x, y: ferry.y - 120 });
syncUi(); syncTally();
new ResizeObserver(() => layout()).observe(canvas);
raf = requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
  else if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
});

// Test ve ölçüm için salt okunur durum
window.simit = Object.freeze({
  stats: () => ({ ...state, birds: flock.n, chasing: Array.from(flock.tgt.subarray(0, flock.n)).filter((x) => x >= 0).length, simits: simits.filter((s) => s.alive).length, ...tally, checks: flock.checks, waterY, ferry: { x: Math.round(ferry.x), L: Math.round(ferry.L) } }),
  hash: () => encode(state),
  throwAt: (x, y) => throwSimit(x, y, true),
});
