// Simit Kuşları — martı sürüsü.
// Komşular sabit boyutlu bir ızgarada, hücre başına bağlı listeyle aranır: her martı yalnız kendi
// hücresine ve çevresindeki sekiz hücreye bakar. Böylece 400 martıda bile kare başına birkaç bin
// mesafe ölçümü yeter (herkesi herkesle karşılaştırmak 160 bin ölçüm olurdu).

export const CELL = 56; // görüş yarıçapından biraz büyük
const SEP = 20; // bu yakınlıktaki komşudan uzaklaşır
const VIS = 54; // bu yakınlıktaki komşuyla hizalanır ve toplanır
const MAX_N = 18; // bir martı en çok bu kadar komşuya bakar (kalabalıkta işi sınırlar)

export function createFlock(max = 600) {
  return {
    n: 0,
    max,
    x: new Float32Array(max),
    y: new Float32Array(max),
    vx: new Float32Array(max),
    vy: new Float32Array(max),
    z: new Float32Array(max), // 0 uzak, 1 yakın: boyut ve renk sisi
    ph: new Float32Array(max), // kanat çırpma evresi
    flap: new Float32Array(max), // çırpma şiddeti (süzülürken düşer)
    orb: new Float32Array(max), // vapurun üstünde dönerken kendi yörünge evresi
    tgt: new Int16Array(max).fill(-1), // kovaladığı simit yuvası
    full: new Float32Array(max), // bir ısırık aldıktan sonra kısa süre tok
    head: new Int32Array(1),
    next: new Int32Array(max),
    frame: 0,
    checks: 0,
  };
}

// Sürüyü n martıya getirir; yeniler vapurun üstünde, yukarıdan süzülerek gelir.
export function resize(f, n, around, rnd = Math.random) {
  n = Math.max(0, Math.min(f.max, n | 0));
  for (let i = f.n; i < n; i++) {
    f.x[i] = around.x + (rnd() - 0.5) * 360;
    f.y[i] = around.y - 60 - rnd() * 160;
    const a = rnd() * Math.PI * 2;
    f.vx[i] = Math.cos(a) * 90;
    f.vy[i] = Math.sin(a) * 40;
    f.z[i] = rnd() ** 1.4; // çoğu uzakta, azı yakında
    f.ph[i] = rnd() * Math.PI * 2;
    f.flap[i] = 0.5;
    f.orb[i] = rnd() * Math.PI * 2;
    f.tgt[i] = -1;
    f.full[i] = 0;
  }
  f.n = n;
}

const hyp = Math.hypot;

// env: { W, H, waterY, wind, home:{x,y}, simits:[{x,y,alive,inWater}], unity 0–9, t, onBite(slot, i) }
export function step(f, dt, env) {
  const { W, H, waterY, wind, home, simits, unity, t } = env;
  const n = f.n;
  f.frame++;
  // 1. Izgara: her hücrenin ilk martısı head'de, sonrakiler next zincirinde.
  const pad = 4; // ekran dışındaki martılar da ızgaraya girsin
  const cols = Math.ceil(W / CELL) + pad * 2;
  const rows = Math.ceil(H / CELL) + pad * 2;
  if (f.head.length < cols * rows) f.head = new Int32Array(cols * rows);
  f.head.fill(-1, 0, cols * rows);
  const cellOf = (x, y) => {
    const cx = Math.min(cols - 1, Math.max(0, Math.floor(x / CELL) + pad));
    const cy = Math.min(rows - 1, Math.max(0, Math.floor(y / CELL) + pad));
    return cy * cols + cx;
  };
  for (let i = 0; i < n; i++) {
    const c = cellOf(f.x[i], f.y[i]);
    f.next[i] = f.head[c];
    f.head[c] = i;
  }

  const wAlign = 0.7 + unity * 0.14;
  const wCoh = 0.25 + unity * 0.16;
  const wSep = 560;
  let checks = 0;
  const live = simits.some((s) => s.alive);

  for (let i = 0; i < n; i++) {
    const xi = f.x[i];
    const yi = f.y[i];
    const vxi = f.vx[i];
    const vyi = f.vy[i];
    let ax = 0;
    let ay = 0;

    // 2. Komşular: ayrılma, hizalanma, toplanma
    let cnt = 0;
    let sx = 0;
    let sy = 0;
    let mvx = 0;
    let mvy = 0;
    let mx = 0;
    let my = 0;
    const gx = Math.min(cols - 1, Math.max(0, Math.floor(xi / CELL) + pad));
    const gy = Math.min(rows - 1, Math.max(0, Math.floor(yi / CELL) + pad));
    scan: for (let oy = -1; oy <= 1; oy++) {
      const cy = gy + oy;
      if (cy < 0 || cy >= rows) continue;
      for (let ox = -1; ox <= 1; ox++) {
        const cx = gx + ox;
        if (cx < 0 || cx >= cols) continue;
        for (let j = f.head[cy * cols + cx]; j >= 0; j = f.next[j]) {
          if (j === i) continue;
          checks++;
          const dx = f.x[j] - xi;
          const dy = f.y[j] - yi;
          // Derinlikleri çok farklı olanlar aynı katmanda uçmuyor sayılır.
          if (Math.abs(f.z[j] - f.z[i]) > 0.45) continue;
          const d = hyp(dx, dy);
          if (d > VIS) continue;
          mvx += f.vx[j];
          mvy += f.vy[j];
          mx += dx;
          my += dy;
          if (d < SEP && d > 0.001) {
            const k = (SEP - d) / (SEP * d);
            sx -= dx * k;
            sy -= dy * k;
          }
          if (++cnt >= MAX_N) break scan;
        }
      }
    }
    if (cnt) {
      ax += (mvx / cnt - vxi) * wAlign;
      ay += (mvy / cnt - vyi) * wAlign;
      ax += (mx / cnt) * wCoh;
      ay += (my / cnt) * wCoh;
      ax += sx * wSep;
      ay += sy * wSep;
    }

    // 3. Hedef: kovaladığı simit ya da vapurun kıç tarafının üstü
    if (f.full[i] > 0) f.full[i] -= dt;
    let tg = f.tgt[i];
    if (tg >= 0 && !simits[tg]?.alive) tg = f.tgt[i] = -1;
    // Hedef seçimi kademeli: her karede martıların yalnız bir dilimi yeniden bakar.
    if (live && f.full[i] <= 0 && (i + f.frame) % 14 === 0) {
      let best = -1;
      let bd = 520 * (0.6 + f.z[i] * 0.6);
      for (let s = 0; s < simits.length; s++) {
        const sm = simits[s];
        if (!sm.alive) continue;
        const d = hyp(sm.x - xi, sm.y - yi);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      tg = f.tgt[i] = best;
    }
    let chasing = false;
    let tx;
    let ty;
    let pull;
    if (tg >= 0) {
      const sm = simits[tg];
      tx = sm.x;
      ty = sm.inWater ? sm.y - 5 : sm.y;
      pull = 3.4;
      chasing = true;
      if (hyp(tx - xi, ty - yi) < 10 + f.z[i] * 8) {
        env.onBite?.(tg, i);
        f.full[i] = 1.4 + Math.random() * 1.4;
        f.tgt[i] = -1;
        f.vy[i] -= 120;
        chasing = false;
      }
    } else {
      // Vapurun üstünde gevşek bir sekiz çizerek beklerler; her martının kendi evresi var.
      const o = f.orb[i];
      tx = home.x - 30 + Math.cos(o + t * 0.35) * (110 + f.z[i] * 140);
      ty = home.y - 90 - f.z[i] * 40 + Math.sin(o * 1.7 + t * 0.6) * 55;
      pull = 0.9;
    }
    const dx = tx - xi;
    const dy = ty - yi;
    const dl = hyp(dx, dy) || 1;
    const want = chasing ? 230 : 140;
    ax += ((dx / dl) * want - vxi) * pull;
    ay += ((dy / dl) * want - vyi) * pull;

    // 4. Su ve gök sınırı; rüzgâr
    // Suda yüzen simidi kovalayan martı su yüzeyine (simidin hizasına) kadar iner.
    const floor = chasing ? Math.max(waterY - 3, ty + 4) : waterY - 34 - f.z[i] * 30;
    if (yi > floor) ay -= (yi - floor) * 14;
    if (yi < 24) ay += (24 - yi) * 8;
    ax += wind * 12;

    // 5. İvme ve hız sınırları
    const al = hyp(ax, ay);
    const amax = chasing ? 1300 : 900;
    if (al > amax) {
      ax *= amax / al;
      ay *= amax / al;
    }
    let nvx = vxi + ax * dt;
    let nvy = vyi + ay * dt;
    const sp = hyp(nvx, nvy) || 1;
    const vmax = chasing ? 250 : 175;
    const vmin = 55;
    if (sp > vmax) {
      nvx *= vmax / sp;
      nvy *= vmax / sp;
    } else if (sp < vmin) {
      nvx *= vmin / sp;
      nvy *= vmin / sp;
    }
    f.vx[i] = nvx;
    f.vy[i] = nvy;
    f.x[i] = xi + nvx * dt;
    f.y[i] = yi + nvy * dt;

    // Kanat: yükselirken ve kovalarken çırpar, alçalırken süzülür.
    const climb = Math.max(0, -nvy) / 120;
    const target = Math.min(1, (chasing ? 0.8 : 0.25) + climb);
    f.flap[i] += (target - f.flap[i]) * Math.min(1, dt * 3);
    f.ph[i] += dt * (4 + f.flap[i] * 9);
  }
  f.checks = checks;
}
