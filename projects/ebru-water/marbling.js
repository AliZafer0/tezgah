// Ebru motoru — "Mathematical Marbling" (A. Jaffer, S. Lu; IEEE CG&A 2012) dönüşümleri.
// Her boya lekesi kapalı bir çokgendir. İşlemler suyun yüzeyindeki boyayı alan koruyarak iter:
//  - damla: P' = C + (P − C) · √(1 + r² / |P − C|²)   (art arda damlalar r² olarak toplanır)
//  - biz/tarak çizgisi: P' = P + z · u^d · M           (d: çizgiye uzaklık, u = 2^(−1/c))
//  - girdap: P, C etrafında z · u^|‖P−C‖−R| / R açıyla döner
// Koordinatlar CSS pikselidir; çizim ve DPR'den bağımsızdır.

export class Marble {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.inks = []; // { color, pts: number[] (x0,y0,x1,y1,…) }
    this.maxLen = 3.2; this.minLen = 0.9;
  }

  resize(w, h) { this.w = w; this.h = h; }

  /** Yeni bir damla: önce mevcut boyayı iter, sonra merkeze küçük bir halka ekler. */
  addDrop(cx, cy, color, r0 = 0.6) {
    const n = 28; const pts = new Array(n * 2);
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts[i * 2] = cx + Math.cos(a) * r0; pts[i * 2 + 1] = cy + Math.sin(a) * r0; }
    const ink = { color, pts };
    this.inks.push(ink);
    return ink;
  }

  /** Alan koruyan damla itişi (r2: eklenen yarıçapın karesi). Yeni halkayı da büyütür. */
  drop(cx, cy, r2) {
    for (const ink of this.inks) {
      const p = ink.pts;
      for (let i = 0; i < p.length; i += 2) {
        const dx = p[i] - cx; const dy = p[i + 1] - cy;
        const d2 = dx * dx + dy * dy || 1e-9;
        const k = Math.sqrt(1 + r2 / d2);
        p[i] = cx + dx * k; p[i + 1] = cy + dy * k;
      }
    }
  }

  /** Sonlu biz çizgisi: A'dan B'ye; d = parçaya uzaklık. z: kayma (px), c: keskinlik (px). */
  stylus(ax, ay, bx, by, z, c) {
    const mx = bx - ax; const my = by - ay; const L = Math.hypot(mx, my);
    if (L < 1e-3) return;
    const ux = mx / L; const uy = my / L;
    const lu = Math.log(0.5) / c;
    for (const ink of this.inks) {
      const p = ink.pts;
      for (let i = 0; i < p.length; i += 2) {
        const px = p[i] - ax; const py = p[i + 1] - ay;
        const t = Math.max(0, Math.min(L, px * ux + py * uy));
        const d = Math.hypot(px - ux * t, py - uy * t);
        const s = z * Math.exp(lu * d);
        if (s < 0.01) continue;
        p[i] += ux * s; p[i + 1] += uy * s;
      }
    }
  }

  /** Sonsuz düz çizgi (tarak dişi): çizgi B'den geçer, M yönünde z kadar iter. */
  tine(bx, by, mx, my, z, c) {
    const L = Math.hypot(mx, my); const ux = mx / L; const uy = my / L;
    const nx = -uy; const ny = ux; const lu = Math.log(0.5) / c;
    for (const ink of this.inks) {
      const p = ink.pts;
      for (let i = 0; i < p.length; i += 2) {
        const d = Math.abs((p[i] - bx) * nx + (p[i + 1] - by) * ny);
        const s = z * Math.exp(lu * d);
        if (s < 0.01) continue;
        p[i] += ux * s; p[i + 1] += uy * s;
      }
    }
  }

  /** Tarak: aralıklı paralel dişler. dir: 'v' dikey dişler (aşağı/yukarı iter), 'h' yatay. alternate: gelgit. */
  comb(dir, spacing, z, c, phase = 0, alternate = false) {
    const across = dir === 'v' ? this.w : this.h;
    let k = 0;
    for (let x = phase; x < across + spacing; x += spacing, k++) {
      const sgn = alternate && k % 2 ? -1 : 1;
      if (dir === 'v') this.tine(x, 0, 0, 1, z * sgn, c); else this.tine(0, x, 1, 0, z * sgn, c);
    }
  }

  /** Girdap: R yarıçaplı halka çevresinde en güçlü dönüş. */
  vortex(cx, cy, R, z, c) {
    const lu = Math.log(0.5) / c;
    for (const ink of this.inks) {
      const p = ink.pts;
      for (let i = 0; i < p.length; i += 2) {
        const dx = p[i] - cx; const dy = p[i + 1] - cy; const d = Math.hypot(dx, dy);
        const a = (z / Math.max(R, 1)) * Math.exp(lu * Math.abs(d - R));
        if (Math.abs(a) < 1e-4) continue;
        const ca = Math.cos(a); const sa = Math.sin(a);
        p[i] = cx + dx * ca - dy * sa; p[i + 1] = cy + dx * sa + dy * ca;
      }
    }
  }

  /** Uzayan kenarlara nokta ekle, sıkışanları ayıkla; tümüyle görünüm dışına itilenleri at. */
  tidy() {
    const maxL2 = this.maxLen * this.maxLen; const minL2 = this.minLen * this.minLen;
    const pad = 80; const W = this.w + pad; const H = this.h + pad;
    const keep = [];
    for (const ink of this.inks) {
      const p = ink.pts; const n = p.length / 2; const out = [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < n; i++) {
        const x0 = p[i * 2]; const y0 = p[i * 2 + 1];
        const j = (i + 1) % n; const x1 = p[j * 2]; const y1 = p[j * 2 + 1];
        const dx = x1 - x0; const dy = y1 - y0; const l2 = dx * dx + dy * dy;
        if (out.length >= 2) {
          const lx = out[out.length - 2]; const ly = out[out.length - 1];
          const ex = x0 - lx; const ey = y0 - ly;
          if (ex * ex + ey * ey < minL2) continue;
        }
        out.push(x0, y0);
        if (l2 > maxL2) {
          const k = Math.min(64, Math.ceil(Math.sqrt(l2 / maxL2)));
          for (let s = 1; s < k; s++) out.push(x0 + (dx * s) / k, y0 + (dy * s) / k);
        }
        if (x0 < minX) minX = x0; if (x0 > maxX) maxX = x0; if (y0 < minY) minY = y0; if (y0 > maxY) maxY = y0;
      }
      if (out.length < 6) continue;
      if (maxX < -pad || minX > W || maxY < -pad || minY > H) continue;
      ink.pts = out; keep.push(ink);
    }
    this.inks = keep;
  }

  pointCount() { let n = 0; for (const ink of this.inks) n += ink.pts.length / 2; return n; }

  snapshot() { return this.inks.map((k) => ({ ...k, pts: k.pts.slice() })); }
  restore(s) { this.inks = s.map((k) => ({ ...k, pts: k.pts.slice() })); }
}
