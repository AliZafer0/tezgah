// Kamış kalem: geniş, düz uçlu kalemin izi. Uç (kat) bir doğru parçasıdır; iz, bu parçanın yol boyunca
// süpürülmesiyle oluşur. Kalınlık yön ile uç açısı arasındaki farktan kendiliğinden doğar.
// Uç ortasındaki yarık nedeniyle mürekkep azaldıkça iz lif lif ayrışır (kuru kalem).

const STRANDS = 11;

// Belirlenimli gürültü: yeniden çizimde aynı kuru doku oluşsun
function hash(a, b) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function nibVector(widthPx, angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  return [Math.cos(a) * widthPx * 0.5, -Math.sin(a) * widthPx * 0.5];
}

// Dörtgeni geçerli yola ekle; hepsi aynı yönde dönsün ki tek dolguda birleşsinler (dikiş ve delik olmasın)
function quad(g, ax, ay, bx, by, cx, cy, dx, dy) {
  const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay) + (cx - ax) * (dy - ay) - (dx - ax) * (cy - ay);
  if (area >= 0) { g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(cx, cy); g.lineTo(dx, dy); }
  else { g.moveTo(ax, ay); g.lineTo(dx, dy); g.lineTo(cx, cy); g.lineTo(bx, by); }
  g.closePath();
}

// p0 → p1 arası tek adım; yalnızca yola ekler, boyamayı çağıran yapar. ink: 0..1 (1 dolu)
export function segment(g, p0, p1, nib, ink, seed) {
  const dry = Math.max(0, Math.min(1, (0.62 - ink) / 0.62)); // mürekkep %62'nin altına inince kurumaya başlar
  if (dry === 0) {
    quad(g, p0[0] - nib[0], p0[1] - nib[1], p0[0] + nib[0], p0[1] + nib[1], p1[0] + nib[0], p1[1] + nib[1], p1[0] - nib[0], p1[1] - nib[1]);
    return;
  }
  for (let s = 0; s < STRANDS; s++) {
    const fa = -1 + (2 * s) / STRANDS; const fb = -1 + (2 * (s + 1)) / STRANDS + 0.02;
    // Kuru lifler: ortadaki yarık önce açılır, kenarlar daha uzun dayanır
    const mid = 1 - Math.abs((fa + fb) / 2);
    const n = hash(seed * 31 + s, Math.floor(seed / 3));
    const n2 = hash(s * 97 + 7, Math.floor(seed / 11));
    if (n * 0.6 + n2 * 0.4 < dry * (0.55 + mid * 0.55)) continue;
    // Kenarlarda hafif pürüz
    const j = (hash(seed, s) - 0.5) * 0.06 * (s === 0 || s === STRANDS - 1 ? 1 : 0);
    const ax = nib[0] * (fa + j); const ay = nib[1] * (fa + j); const bx = nib[0] * fb; const by = nib[1] * fb;
    quad(g, p0[0] + ax, p0[1] + ay, p0[0] + bx, p0[1] + by, p1[0] + bx, p1[1] + by, p1[0] + ax, p1[1] + ay);
  }
}

// Hattatın "nokta"sı: kalem kendi genişliği kadar, uca dik yönde çekilince oluşan baklava
export function nokta(g, x, y, nib, color, alpha = 1) {
  const len = Math.hypot(nib[0], nib[1]) * 2;
  const a = Math.atan2(-nib[1], nib[0]) - Math.PI / 2 - 0.35; // uca yaklaşık dik, hafif eğik
  const dx = Math.cos(a) * len * 0.9; const dy = -Math.sin(a) * len * 0.9;
  g.globalAlpha = alpha; g.fillStyle = color;
  g.beginPath();
  g.moveTo(x - nib[0], y - nib[1]); g.lineTo(x + nib[0], y + nib[1]);
  g.lineTo(x + nib[0] + dx, y + nib[1] + dy); g.lineTo(x - nib[0] + dx, y - nib[1] + dy);
  g.closePath(); g.fill(); g.globalAlpha = 1;
  return [dx, dy];
}

// Yolu sık ve düzgün adımlara böl (hızlı harekette boşluk kalmasın)
export function* steps(p0, p1, maxStep) {
  const d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); const n = Math.max(1, Math.ceil(d / maxStep));
  let prev = p0;
  for (let i = 1; i <= n; i++) {
    const t = i / n; const q = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
    yield [prev, q]; prev = q;
  }
}
