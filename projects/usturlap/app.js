// Usturlap: İstanbul (41.01° K, 28.98° D) için düzlemsel usturlap.
// Gök küresi güney kutbundan ekvator düzlemine stereografik izdüşümle düşürülür: dik açıklığı δ olan nokta
// merkezden r = R·tan((90°−δ)/2) uzaklığa, saat açısı H kadar dönük olarak düşer (H=0 yukarı, saat yönü batı).
// Levha (ufuk, yükseklik ve yön çizgileri) sabittir; örümcek (yıldız uçları ve tutulum çemberi) yıldız zamanı kadar döner.
const $ = (s) => document.querySelector(s);
const cv = $('#alet');
const ctx = cv.getContext('2d');
const status = $('#status');
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const LAT = 41.01, LON = 28.98, TZ = 3; // TSİ = UTC+3
const PHI = LAT * D2R;
const EDGE_DEC = -27.5; // levhanın kenarı (Oğlak dönencesinin biraz altı; Akrep'in kalbi sığsın)

// Parlak yıldızlar (J2000). Usturlapçıların kullandığı adlarıyla.
const STARS = [
  ['Ayyûk', 'Capella', 79.17, 45.99],
  ['Debarân', 'Aldebaran', 68.98, 16.51],
  ['Ricl', 'Rigel', 78.63, -8.2],
  ['Yed-i Cevzâ', 'Betelgeuse', 88.79, 7.41],
  ['Şi\'râ-i Yemânî', 'Sirius', 101.29, -16.72],
  ['Şi\'râ-i Şâmî', 'Procyon', 114.83, 5.22],
  ['Re\'s-i Tev\'em', 'Pollux', 116.33, 28.03],
  ['Kalbü\'l-Esed', 'Regulus', 152.09, 11.97],
  ['Simâk-ı A\'zel', 'Spica', 201.3, -11.16],
  ['Simâk-ı Râmih', 'Arcturus', 213.92, 19.18],
  ['Kalbü\'l-Akreb', 'Antares', 247.35, -26.43],
  ['Vâkı\'', 'Vega', 279.23, 38.78],
  ['Tâir', 'Altair', 297.7, 8.87],
  ['Zenebü\'d-Decâce', 'Deneb', 310.36, 45.28],
  ['Sürre', 'Alpheratz', 2.1, 29.09],
  ['Kayd', 'Alkaid', 206.89, 49.31],
].map(([ad, bati, ra, dec]) => ({ ad, bati, ra, dec }));
const BURC = ['Koç', 'Boğa', 'İkizler', 'Yengeç', 'Aslan', 'Başak', 'Terazi', 'Akrep', 'Yay', 'Oğlak', 'Kova', 'Balık'];

/* ------------------------------------------------------------ gök hesabı */
const jd = (ms) => ms / 86400000 + 2440587.5;
const norm = (d) => ((d % 360) + 360) % 360;
function lst(ms) {
  const d = jd(ms) - 2451545;
  return norm(280.46061837 + 360.98564736629 * d + LON);
}
function sun(ms) {
  const n = jd(ms) - 2451545;
  const L = 280.46 + 0.9856474 * n, g = (357.528 + 0.9856003 * n) * D2R;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R;
  const eps = (23.439 - 4e-7 * n) * D2R;
  return { ra: norm(Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) * R2D), dec: Math.asin(Math.sin(eps) * Math.sin(lam)) * R2D, lam: norm(lam * R2D), eps };
}
// Dik açıklık ve saat açısından yükseklik ve yön (kuzeyden doğuya)
function altaz(dec, H) {
  const d = dec * D2R, h = H * D2R;
  const sa = Math.sin(PHI) * Math.sin(d) + Math.cos(PHI) * Math.cos(d) * Math.cos(h);
  const a = Math.asin(sa);
  const az = Math.atan2(-Math.cos(d) * Math.sin(h), Math.sin(d) * Math.cos(PHI) - Math.cos(d) * Math.sin(PHI) * Math.cos(h));
  return { alt: a * R2D, az: norm(az * R2D) };
}
// Ufuk koordinatından ekvatora (levha çizgileri için)
function eq(alt, az) {
  const a = alt * D2R, A = az * D2R;
  const sd = Math.sin(PHI) * Math.sin(a) + Math.cos(PHI) * Math.cos(a) * Math.cos(A);
  const H = Math.atan2(-Math.sin(A) * Math.cos(a), Math.cos(PHI) * Math.sin(a) - Math.sin(PHI) * Math.cos(a) * Math.cos(A));
  return { dec: Math.asin(sd) * R2D, H: H * R2D };
}
const YON = ['K', 'KKD', 'KD', 'DKD', 'D', 'DGD', 'GD', 'GGD', 'G', 'GGB', 'GB', 'BGB', 'B', 'BKB', 'KB', 'KKB'];
const yon = (az) => YON[Math.round(az / 22.5) % 16];

/* ------------------------------------------------------------ durum */
const S = { ms: Date.now(), sel: 9, play: false, drag: null };
function readHash() {
  const [t, s] = location.hash.slice(1).split('.');
  const m = parseInt(t, 36);
  if (Number.isFinite(m) && m > 0) S.ms = m * 60000;
  const k = +s;
  if (k >= 0 && k < STARS.length) S.sel = k;
}
let hashT;
const writeHash = () => {
  clearTimeout(hashT);
  hashT = setTimeout(() => history.replaceState(null, '', `#${Math.round(S.ms / 60000).toString(36)}.${S.sel}`), 300);
};

/* ------------------------------------------------------------ çizim */
let W = 0, Hh = 0, dpr = 1, cx = 0, cy = 0, Req = 100, Rl = 160;
const rOf = (dec) => Req * Math.tan(((90 - dec) / 2) * D2R);
const at = (dec, H) => {
  const r = rOf(dec);
  return [cx + r * Math.sin(H * D2R), cy - r * Math.cos(H * D2R)];
};
function layout() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  W = cv.clientWidth; Hh = cv.clientHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
  const narrow = W < 760 || W / Hh < 0.8;
  const panelH = narrow ? Math.min(Hh * 0.44, 330) : 0;
  const left = narrow ? 0 : 320;
  const avail = Math.min(W - left, Hh - panelH);
  cx = (left + (W - left) / 2) * dpr;
  cy = ((Hh - panelH) / 2 + avail * 0.05) * dpr;
  const outer = avail * 0.42 * dpr; // dış bilezik
  Rl = outer * 0.86; // levha kenarı
  Req = Rl / Math.tan(((90 - EDGE_DEC) / 2) * D2R);
}
const inside = (p) => Math.hypot(p[0] - cx, p[1] - cy) <= Rl;

// Levha sabit olduğu için bir kez çizilir.
let plate = null;
function drawPlate() {
  plate = document.createElement('canvas');
  plate.width = cv.width; plate.height = cv.height;
  const c = plate.getContext('2d');
  const ENG = 'rgba(60,38,12,0.85)', FAINT = 'rgba(60,38,12,0.45)';
  c.save();
  // ana gövde (mater) ve bilezik
  const outer = Rl / 0.86;
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 40 * dpr; c.shadowOffsetY = 16 * dpr;
  // taht (kürsî) ve halka
  c.fillStyle = brassOn(c, outer * 1.2);
  c.beginPath();
  c.moveTo(cx - outer * 0.26, cy - outer * 0.93);
  c.quadraticCurveTo(cx - outer * 0.22, cy - outer * 1.12, cx, cy - outer * 1.16);
  c.quadraticCurveTo(cx + outer * 0.22, cy - outer * 1.12, cx + outer * 0.26, cy - outer * 0.93);
  c.fill();
  c.beginPath(); c.arc(cx, cy - outer * 1.22, outer * 0.07, 0, Math.PI * 2); c.lineWidth = outer * 0.025; c.strokeStyle = '#b48a3e'; c.stroke();
  c.beginPath(); c.arc(cx, cy, outer, 0, Math.PI * 2); c.fill();
  c.restore();
  // bilezik: 24 saat ölçeği
  c.beginPath(); c.arc(cx, cy, Rl * 1.005, 0, Math.PI * 2); c.lineWidth = 2 * dpr; c.strokeStyle = 'rgba(50,30,8,0.7)'; c.stroke();
  for (let m = 0; m < 24 * 12; m++) {
    const a = (m / (24 * 12)) * Math.PI * 2;
    const big = m % 12 === 0, mid = m % 6 === 0;
    const r0 = Rl * 1.01, r1 = r0 + (big ? 0.075 : mid ? 0.045 : 0.025) * Rl;
    c.beginPath();
    c.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0);
    c.lineTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
    c.lineWidth = (big ? 1.6 : 0.8) * dpr; c.strokeStyle = ENG; c.stroke();
  }
  c.fillStyle = 'rgba(45,28,8,0.92)';
  c.font = `600 ${Math.max(10, Rl * 0.052)}px 'Iowan Old Style', Palatino, Georgia, serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let h = 0; h < 24; h++) {
    const a = (h / 24) * Math.PI * 2, r = Rl * 1.12;
    const label = String((h + 12) % 24 || 24);
    c.fillText(label, cx + Math.sin(a) * r, cy - Math.cos(a) * r);
  }
  // levha
  c.save();
  c.beginPath(); c.arc(cx, cy, Rl, 0, Math.PI * 2); c.clip();
  const pg = c.createRadialGradient(cx - Rl * 0.3, cy - Rl * 0.35, Rl * 0.05, cx, cy, Rl);
  pg.addColorStop(0, '#f3dca0'); pg.addColorStop(0.6, '#d6b36c'); pg.addColorStop(1, '#a98543');
  c.fillStyle = pg; c.fillRect(cx - Rl, cy - Rl, Rl * 2, Rl * 2);
  const P = (pts, st, w, dash) => {
    c.beginPath();
    let pen = false;
    for (const p of pts) {
      if (!p) { pen = false; continue; }
      if (!pen) { c.moveTo(p[0], p[1]); pen = true; } else c.lineTo(p[0], p[1]);
    }
    c.setLineDash(dash || []); c.strokeStyle = st; c.lineWidth = w * dpr; c.stroke(); c.setLineDash([]);
  };
  const C = (r, st, w, dash) => { c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.setLineDash(dash || []); c.strokeStyle = st; c.lineWidth = w * dpr; c.stroke(); c.setLineDash([]); };
  // dönenceler ve ekvator
  C(rOf(23.44), ENG, 1.2); C(rOf(0), ENG, 1.4); C(rOf(-23.44), ENG, 1.2);
  // yükseklik çemberleri (mukantarat)
  const altLine = (alt) => {
    const pts = [];
    for (let A = 0; A <= 360; A += 1.5) { const e = eq(alt, A); pts.push(at(e.dec, e.H)); }
    return pts;
  };
  P(altLine(-18), FAINT, 1, [5 * dpr, 4 * dpr]); // tan vakti (astronomik alacakaranlık)
  P(altLine(0), 'rgba(40,22,4,0.95)', 2.2);
  for (let a = 10; a < 90; a += 10) P(altLine(a), a % 30 ? FAINT : ENG, a % 30 ? 0.8 : 1.1);
  // yön çizgileri (semt)
  for (let A = 0; A < 360; A += 30) {
    const pts = [];
    for (let a = 0; a <= 90; a += 1) { const e = eq(a, A); pts.push(at(e.dec, e.H)); }
    P(pts, FAINT, 0.8);
  }
  // meridyen ve doğu-batı çizgisi
  P([[cx, cy - Rl], [cx, cy + Rl]], ENG, 1);
  P([[cx - Rl, cy], [cx + Rl, cy]], FAINT, 0.8);
  // başucu
  const z = at(LAT, 0);
  c.fillStyle = 'rgba(40,22,4,0.9)'; c.beginPath(); c.arc(z[0], z[1], 2.6 * dpr, 0, Math.PI * 2); c.fill();
  // ufuktaki yönler
  c.font = `700 ${Math.max(10, Rl * 0.045)}px system-ui, sans-serif`;
  c.fillStyle = 'rgba(40,22,4,0.85)';
  for (const [A, t] of [[0, 'Kuzey'], [90, 'Doğu'], [270, 'Batı']]) {
    const e = eq(1.8, A);
    const p = at(e.dec, e.H);
    if (inside(p)) c.fillText(t, p[0], p[1] - (A === 0 ? 0 : 10 * dpr));
  }
  c.font = `italic ${Math.max(10, Rl * 0.04)}px Georgia, serif`;
  c.fillText('İstanbul · arz 41°', cx, cy + Rl * 0.82);
  c.restore();
}
function brassOn(c, r) {
  const g = c.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.05, cx, cy, r);
  g.addColorStop(0, '#f0d28a'); g.addColorStop(0.5, '#b88b3d'); g.addColorStop(1, '#6a4716');
  return g;
}

let starPos = [];
function drawRete(L, sn) {
  const rot = (ra) => L - ra; // saat açısı
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 8 * dpr; ctx.shadowOffsetX = 3 * dpr; ctx.shadowOffsetY = 4 * dpr;
  const RETE = '#c99a45', EDGE = '#5b3d10';
  ctx.lineCap = 'round';
  // dış halka (Oğlak dönencesi) ve çapraz kollar
  ctx.strokeStyle = RETE; ctx.lineWidth = Rl * 0.035;
  ctx.beginPath(); ctx.arc(cx, cy, rOf(-23.44) * 1.0, 0, Math.PI * 2); ctx.stroke();
  // ekvator halkası (örümceği tutulumla birleştirir)
  ctx.lineWidth = Rl * 0.014;
  ctx.beginPath(); ctx.arc(cx, cy, rOf(0), 0, Math.PI * 2); ctx.stroke();
  // tutulum çemberi: bir bant
  const ecl = [];
  for (let l = 0; l <= 360; l += 2) {
    const lam = l * D2R;
    const ra = norm(Math.atan2(Math.cos(sn.eps) * Math.sin(lam), Math.cos(lam)) * R2D), dec = Math.asin(Math.sin(sn.eps) * Math.sin(lam)) * R2D;
    ecl.push({ p: at(dec, rot(ra)), l });
  }
  ctx.lineWidth = Rl * 0.07;
  ctx.beginPath(); ecl.forEach((e, i) => (i ? ctx.lineTo(e.p[0], e.p[1]) : ctx.moveTo(e.p[0], e.p[1]))); ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,236,180,0.35)'; ctx.lineWidth = Rl * 0.012;
  ctx.beginPath(); ecl.forEach((e, i) => (i ? ctx.lineTo(e.p[0], e.p[1]) : ctx.moveTo(e.p[0], e.p[1]))); ctx.stroke();
  // burç bölmeleri ve adları
  const ex = (e) => [e.p[0] - cx, e.p[1] - cy];
  ctx.font = `600 ${Math.max(8, Rl * 0.034)}px 'Iowan Old Style', Palatino, Georgia, serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let k = 0; k < 12; k++) {
    const e0 = ecl[k * 15];
    const [vx, vy] = ex(e0); const vl = Math.hypot(vx, vy) || 1;
    // eksene dik kısa çentik: bandın iki kenarı arası
    const nx = vx / vl, ny = vy / vl;
    ctx.strokeStyle = EDGE; ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath();
    ctx.moveTo(e0.p[0] - nx * Rl * 0.035, e0.p[1] - ny * Rl * 0.035);
    ctx.lineTo(e0.p[0] + nx * Rl * 0.035, e0.p[1] + ny * Rl * 0.035);
    ctx.stroke();
    const em = ecl[k * 15 + 7];
    ctx.save();
    ctx.translate(em.p[0], em.p[1]);
    const ang = Math.atan2(em.p[1] - cy, em.p[0] - cx) + Math.PI / 2;
    ctx.rotate(ang > Math.PI / 2 && ang < (3 * Math.PI) / 2 ? ang + Math.PI : ang);
    ctx.fillStyle = '#3d2606';
    ctx.fillText(BURC[k], 0, 0);
    ctx.restore();
  }
  // yıldız uçları: kıvrık kollar, sivri dil
  starPos = [];
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 6 * dpr; ctx.shadowOffsetX = 2 * dpr; ctx.shadowOffsetY = 3 * dpr;
  // her yıldızın dili en yakın örümcek parçasına (Oğlak halkası, ekvator halkası, tutulum) kısa bir kolla bağlanır
  STARS.forEach((s, i) => {
    const H = rot(s.ra);
    const tip = at(s.dec, H);
    const cands = [at(-23.44, H), at(0, H), ...ecl.map((e) => e.p)];
    let anchor = cands[0], bd = Infinity;
    for (const c of cands) {
      const d = Math.hypot(c[0] - tip[0], c[1] - tip[1]);
      if (d < bd && d > Rl * 0.03) { bd = d; anchor = c; }
    }
    const ux = anchor[0] - tip[0], uy = anchor[1] - tip[1], ul = Math.hypot(ux, uy) || 1;
    const len = Math.min(Rl * 0.075, ul * 0.6);
    const base = [tip[0] + (ux / ul) * len, tip[1] + (uy / ul) * len];
    const px = -uy / ul, py = ux / ul;
    const wdt = Rl * 0.016;
    ctx.fillStyle = i === S.sel ? '#f4d27e' : RETE;
    // alev biçimli dil
    ctx.beginPath();
    ctx.moveTo(tip[0], tip[1]);
    ctx.quadraticCurveTo(tip[0] + (ux / ul) * len * 0.5 + px * wdt * 1.6, tip[1] + (uy / ul) * len * 0.5 + py * wdt * 1.6, base[0] + px * wdt * 0.5, base[1] + py * wdt * 0.5);
    ctx.lineTo(base[0] - px * wdt * 0.5, base[1] - py * wdt * 0.5);
    ctx.quadraticCurveTo(tip[0] + (ux / ul) * len * 0.5 - px * wdt * 0.5, tip[1] + (uy / ul) * len * 0.5 - py * wdt * 0.5, tip[0], tip[1]);
    ctx.fill();
    if (ul > len + 2) {
      const bend = (i % 2 ? 1 : -1) * Rl * 0.03;
      ctx.strokeStyle = RETE; ctx.lineWidth = Rl * 0.009;
      ctx.beginPath(); ctx.moveTo(base[0], base[1]);
      ctx.quadraticCurveTo((base[0] + anchor[0]) / 2 + px * bend, (base[1] + anchor[1]) / 2 + py * bend, anchor[0], anchor[1]);
      ctx.stroke();
    }
    starPos.push(tip);
  });
  ctx.shadowColor = 'transparent';
  // yıldız adları
  ctx.font = `${Math.max(9, Rl * 0.034)}px 'Iowan Old Style', Palatino, Georgia, serif`;
  STARS.forEach((s, i) => {
    const t = starPos[i];
    ctx.fillStyle = i === S.sel ? '#fff4d6' : 'rgba(255,240,205,0.82)';
    ctx.strokeStyle = 'rgba(30,18,4,0.6)'; ctx.lineWidth = 2.2 * dpr; ctx.lineJoin = 'round';
    const off = (t[1] < cy ? -1 : 1) * Rl * 0.04;
    ctx.strokeText(s.ad, t[0], t[1] + off);
    ctx.fillText(s.ad, t[0], t[1] + off);
    ctx.beginPath(); ctx.arc(t[0], t[1], (i === S.sel ? 3.2 : 2) * dpr, 0, Math.PI * 2);
    ctx.fillStyle = i === S.sel ? '#fff' : '#ffeebf'; ctx.fill();
  });
  // Güneş tutulum üzerinde
  const sp = at(sn.dec, rot(sn.ra));
  const sg = ctx.createRadialGradient(sp[0], sp[1], 0, sp[0], sp[1], Rl * 0.05);
  sg.addColorStop(0, '#fff7d0'); sg.addColorStop(0.4, '#ffcf4a'); sg.addColorStop(1, 'rgba(255,170,40,0)');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sp[0], sp[1], Rl * 0.05, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  return sp;
}
function drawRule(sp) {
  // cetvel (alidat) Güneş'ten geçer ve bilezikte güneş saatini gösterir
  const a = Math.atan2(sp[0] - cx, -(sp[1] - cy));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8 * dpr; ctx.shadowOffsetY = 4 * dpr;
  const w = Rl * 0.03;
  ctx.fillStyle = 'rgba(214,174,96,0.92)';
  ctx.beginPath();
  ctx.moveTo(0, -Rl * 1.06); ctx.lineTo(w, -Rl * 0.95); ctx.lineTo(w * 0.7, Rl * 0.95); ctx.lineTo(0, Rl * 1.06);
  ctx.lineTo(-w * 0.7, Rl * 0.95); ctx.lineTo(-w, -Rl * 0.95); ctx.closePath();
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(70,40,8,0.9)'; ctx.lineWidth = 1 * dpr;
  ctx.beginPath(); ctx.moveTo(0, -Rl * 1.06); ctx.lineTo(0, Rl * 1.06); ctx.stroke();
  ctx.restore();
  // merkez pimi (at)
  const pg = ctx.createRadialGradient(cx - 3 * dpr, cy - 3 * dpr, 0, cx, cy, Rl * 0.05);
  pg.addColorStop(0, '#fff0c0'); pg.addColorStop(1, '#7a5418');
  ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(cx, cy, Rl * 0.045, 0, Math.PI * 2); ctx.fill();
}

/* ------------------------------------------------------------ okumalar */
const two = (n) => String(n).padStart(2, '0');
const hm = (h) => { h = ((h % 24) + 24) % 24; const m = Math.round(h * 60) % 1440; return `${two(Math.floor(m / 60))}:${two(m % 60)}`; };
const deg = (x) => `${x >= 0 ? '' : '−'}${Math.abs(x).toFixed(1)}°`;
function localParts(ms) {
  const d = new Date(ms + TZ * 3600000);
  return { date: `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`, time: `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}` };
}
function fromLocal(date, time) {
  const [y, mo, da] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
  return Date.UTC(y, mo - 1, da, h - TZ, mi);
}
function readouts(L, sn) {
  const sh = altaz(sn.dec, L - sn.ra);
  $('#o-gunes').textContent = `${deg(sh.alt)} · ${yon(sh.az)}`;
  const s = STARS[S.sel];
  const st = altaz(s.dec, L - s.ra);
  $('#o-secili-ad').textContent = s.ad;
  $('#o-secili').textContent = `${deg(st.alt)} · ${yon(st.az)}`;
  $('#o-gsaat').textContent = hm(12 + (L - sn.ra) / 15);
  $('#o-lst').textContent = hm(L / 15);
  if (document.activeElement !== $('#tarih') && document.activeElement !== $('#saat')) {
    const p = localParts(S.ms);
    $('#tarih').value = p.date;
    $('#saat').value = p.time;
  }
  return { sh, st };
}
let lastSay = 0;
function announce(r) {
  const t = performance.now();
  if (t - lastSay < 900) return;
  lastSay = t;
  const s = STARS[S.sel];
  status.textContent = `${localParts(S.ms).time}: Güneş ${r.sh.alt >= 0 ? deg(r.sh.alt) + ' yüksekte' : 'ufkun altında'}; ${s.ad} (${s.bati}) ${r.st.alt >= 0 ? deg(r.st.alt) + ' yüksekte, ' + yon(r.st.az) + ' yönünde' : 'ufkun altında'}.`;
}

let dirty = true;
function frame(t) {
  if (S.play) { S.ms += 60000 * 4; dirty = true; } // saniyede yaklaşık 4 saat
  if (dirty) {
    dirty = false;
    const L = lst(S.ms), sn = sun(S.ms);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!plate) drawPlate();
    ctx.drawImage(plate, 0, 0);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, Rl * 1.0, 0, Math.PI * 2); ctx.clip();
    const sp = drawRete(L, sn);
    ctx.restore();
    drawRule(sp);
    announce(readouts(L, sn));
    writeHash();
  }
  requestAnimationFrame(frame);
}
const setMs = (ms) => { S.ms = ms; dirty = true; };

/* ------------------------------------------------------------ etkileşim */
const angAt = (x, y) => Math.atan2(x * dpr - cx, -(y * dpr - cy)) * R2D;
cv.addEventListener('pointerdown', (e) => {
  const r = cv.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  // yıldıza dokunuş
  const hit = starPos.findIndex((p) => Math.hypot(p[0] - x * dpr, p[1] - y * dpr) < 16 * dpr);
  if (hit >= 0) { S.sel = hit; $('#yildiz').value = hit; dirty = true; lastSay = 0; }
  if (Math.hypot(x * dpr - cx, y * dpr - cy) > Rl * 1.2) return;
  S.drag = { a: angAt(x, y), ms: S.ms };
  cv.setPointerCapture(e.pointerId);
  cv.classList.add('drag');
});
cv.addEventListener('pointermove', (e) => {
  if (!S.drag) return;
  const r = cv.getBoundingClientRect();
  let d = angAt(e.clientX - r.left, e.clientY - r.top) - S.drag.a;
  d = ((d + 540) % 360) - 180;
  // örümcek 1° döndüğünde yıldız zamanı 1° (4 yıldız dakikası) ilerler
  setMs(S.drag.ms + (d / 360.9856) * 86400000);
  S.drag.a += d; S.drag.ms = S.ms;
});
const end = () => { S.drag = null; cv.classList.remove('drag'); };
cv.addEventListener('pointerup', end);
cv.addEventListener('pointercancel', end);
cv.addEventListener('keydown', (e) => {
  const step = (e.shiftKey ? 60 : 4) * 60000;
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { setMs(S.ms + step); e.preventDefault(); }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { setMs(S.ms - step); e.preventDefault(); }
});
const sel = $('#yildiz'), cis = $('#o-cisim');
STARS.forEach((s, i) => sel.add(new Option(`${s.ad} (${s.bati})`, i)));
cis.add(new Option('Güneş', 'sun'));
STARS.forEach((s, i) => cis.add(new Option(s.ad, i)));
sel.addEventListener('change', () => { S.sel = +sel.value; dirty = true; lastSay = 0; });
const onWhen = () => { const d = $('#tarih').value, t = $('#saat').value; if (d && t) setMs(fromLocal(d, t)); };
$('#tarih').addEventListener('change', onWhen);
$('#saat').addEventListener('change', onWhen);
$('#simdi').addEventListener('click', () => setMs(Date.now()));
$('#dondur').addEventListener('click', (e) => { S.play = !S.play; e.currentTarget.setAttribute('aria-pressed', S.play); e.currentTarget.textContent = S.play ? 'Durdur' : 'Zamanı akıt'; });

// Yükseklikten saat: cos H = (sin a − sin φ sin δ) / (cos φ cos δ); doğudaysa H < 0.
$('#bul').addEventListener('click', () => {
  const a = Number($('#o-yuk').value) * D2R;
  const east = document.querySelector('input[name=yari]:checked').value === 'd';
  const v = cis.value;
  const day0 = S.ms;
  // Güneş için dik açıklık gün içinde az değişir; iki adımda yakınsar.
  let best = null;
  for (let pass = 0, ms = day0; pass < 2; pass++) {
    const body = v === 'sun' ? sun(ms) : STARS[+v];
    const d = body.dec * D2R;
    const c = (Math.sin(a) - Math.sin(PHI) * Math.sin(d)) / (Math.cos(PHI) * Math.cos(d));
    if (Math.abs(c) > 1) { best = null; break; }
    const H = (east ? -1 : 1) * Math.acos(c) * R2D;
    const target = norm(body.ra + H); // istenen yıldız zamanı
    // bugünün içinde o yıldız zamanına en yakın an
    const cur = lst(ms);
    let diff = ((target - cur + 540) % 360) - 180;
    ms = ms + (diff / 360.9856) * 86400000;
    best = ms;
  }
  const out = $('#sonuc');
  if (best === null) { out.textContent = 'Bu cisim bugün bu yüksekliğe çıkmıyor.'; return; }
  setMs(best);
  const L = lst(best), sn = sun(best);
  out.textContent = `Saat ${localParts(best).time} (TSİ) · güneş saati ${hm(12 + (L - sn.ra) / 15)}. Örümcek o ana çevrildi.`;
});

addEventListener('resize', () => { layout(); plate = null; dirty = true; });
readHash();
sel.value = S.sel;
layout();
requestAnimationFrame(frame);
