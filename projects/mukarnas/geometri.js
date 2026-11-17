// Mukarnas — kubbe geometrisi.
// Kubbe kat kat halkalara bölünür. Her katta n hücre (niş) var; komşu katlar yarım hücre kaydırılır.
// Bir nişin tabanı alt halkada, sivri ucu üst halkada durur; iki komşu niş arasında kalan ters üçgen
// bir "dolgu" yüzüyle kapanır. Dolguların üst kenarı, bir üst katın nişlerinin tabanıyla birebir
// çakışır: yüzey dikişsiz. Nişler kubbenin dışına doğru oyulur; alttan bakınca kovuk görünür.
//
// Köşe biçimi (9 sayı): konum 3, normal 3, uv 2, tür 1 (0 niş, 1 dolgu, 2 tepe göbeği, 3 kasnak)

export const SHAPES = {
  k: { name: 'Kemer', hw: (v) => 0.5 * (1 - v ** 1.5) * (1 - 0.25 * v) }, // sivri kemer
  b: { name: 'Badem', hw: (v) => 0.5 * Math.sqrt(Math.max(0, 1 - v * v)) }, // yuvarlak
  p: { name: 'Petek', hw: (v) => (v < 0.5 ? 0.5 : 0.5 * (1 - (v - 0.5) / 0.5)) }, // altıgen
};

const H = 1.15; // kubbe yüksekliği (taban yarıçapı 1)
const RC = 0.13; // tepe göbeğinin yarıçapı
const DRUM = 0.55; // kasnak yüksekliği
const prof = (t) => [RC + (1 - RC) * Math.cos((t * Math.PI) / 2), H * Math.sin((t * Math.PI) / 2)];

export function build({ tiers, cells, shape, depth }) {
  const hw = SHAPES[shape].hw;
  const D = 0.03 + depth * 0.018; // oyuk derinliği
  const dTheta = (Math.PI * 2) / cells;
  const res = cells > 20 ? 6 : 8; // yama çözünürlüğü
  const verts = [];
  const idx = [];
  const target = [0, H * 0.25, 0]; // içeri bakan normaller bu noktaya döner

  // Parametrik bir yamayı ızgaraya örer; normaller sonlu farklarla, içeri dönük.
  function patch(nu, nv, fn, kind) {
    const base = verts.length / 9;
    const P = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) P.push(fn(i / nu, j / nv));
    const at = (i, j) => P[Math.min(nv, Math.max(0, j)) * (nu + 1) + Math.min(nu, Math.max(0, i))];
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const p = at(i, j);
        const a = at(i + 1, j); const b = at(i - 1, j); const c = at(i, j + 1); const d = at(i, j - 1);
        const du = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
        const dv = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
        let n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
        let l = Math.hypot(n[0], n[1], n[2]);
        if (l < 1e-9) { n = [-p[0], -1, -p[2]]; l = Math.hypot(n[0], n[1], n[2]); }
        n = n.map((x) => x / l);
        const to = [target[0] - p[0], target[1] - p[1], target[2] - p[2]];
        if (n[0] * to[0] + n[1] * to[1] + n[2] * to[2] < 0) n = n.map((x) => -x);
        verts.push(p[0], p[1], p[2], n[0], n[1], n[2], i / nu, j / nv, kind);
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i;
        const b = a + 1; const c = a + nu + 1; const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
  }
  const point = (theta, t, push) => {
    const [r, h] = prof(t);
    const c = Math.cos(theta); const s = Math.sin(theta);
    // Oyuk yönü: dışarı ve biraz yukarı (kubbenin içinden bakana göre geriye)
    return [c * (r + push), h + push * 0.55, s * (r + push)];
  };

  for (let k = 0; k < tiers; k++) {
    const t0 = k / tiers;
    const t1 = (k + 1) / tiers;
    const off = (k % 2) * 0.5;
    const scale = 1 - 0.35 * t0; // üst katlarda oyuklar küçülür
    for (let c = 0; c < cells; c++) {
      const tm = (c + off + 0.5) * dTheta; // nişin sivri ucunun açısı
      // Niş
      patch(res, res, (u, v) => {
        const theta = tm + (u - 0.5) * 2 * hw(v) * dTheta;
        const push = D * scale * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 1.1)) ** 0.7;
        return point(theta, t0 + v * (t1 - t0), push);
      }, 0);
      // Dolgu: bu nişin sağ kenarı ile sonraki nişin sol kenarı arası
      const tn = tm + dTheta;
      patch(4, res, (u, v) => {
        const left = tm + hw(v) * dTheta;
        const right = tn - hw(v) * dTheta;
        const theta = left + (right - left) * u;
        const push = -D * 0.12 * scale * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
        return point(theta, t0 + v * (t1 - t0), push);
      }, 1);
    }
  }
  // Tepe göbeği (şemse): düz bir disk; yıldız deseni boyama aşamasında çizilir.
  const capY = prof(1)[1];
  patch(cells, 4, (u, v) => {
    const theta = u * Math.PI * 2;
    const r = RC * (1 - v) + 1e-4;
    return [Math.cos(theta) * r, capY + v * 0.02, Math.sin(theta) * r];
  }, 2);
  // Kasnak: kubbenin altındaki silindir, pencereler boyamada.
  patch(cells * 2, 3, (u, v) => {
    const theta = u * Math.PI * 2;
    return [Math.cos(theta), -DRUM + v * DRUM, Math.sin(theta)];
  }, 3);

  return { verts: new Float32Array(verts), idx: verts.length / 9 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), H, DRUM, RC };
}
