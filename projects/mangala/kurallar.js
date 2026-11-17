// Mangala — kurallar ve yapay rakip.
// Tahta 14 hücre: 0–5 birinci oyuncunun kuyuları (soldan sağa), 6 onun hazinesi,
// 7–12 ikinci oyuncunun kuyuları (sağdan sola, yani karşıdan bakınca soldan sağa), 13 onun hazinesi.
// Taşlar saatin tersi yönünde dağıtılır: 0 → 1 → … → 6 → 7 → … → 13 → 0.

export const PITS = 6;
export const START = 4;
export const store = (p) => (p === 0 ? 6 : 13);
export const pitIndex = (p, k) => (p === 0 ? k : 7 + k);
export const side = (i) => (i >= 0 && i <= 5 ? 0 : i >= 7 && i <= 12 ? 1 : -1);
export const opposite = (i) => 12 - i; // 0↔12, 1↔11, … 5↔7

export function newBoard() {
  const b = new Int8Array(14);
  for (let i = 0; i < 14; i++) if (i !== 6 && i !== 13) b[i] = START;
  return b;
}

function next(i, p) {
  let j = (i + 1) % 14;
  if (j === store(1 - p)) j = (j + 1) % 14; // rakibin hazinesine taş konmaz
  return j;
}

export const legal = (b, p) => {
  const out = [];
  for (let k = 0; k < PITS; k++) if (b[pitIndex(p, k)] > 0) out.push(k);
  return out;
};

const sideSum = (b, p) => {
  let s = 0;
  for (let k = 0; k < PITS; k++) s += b[pitIndex(p, k)];
  return s;
};

// Bir hamleyi uygular. b yerinde değişir. Dönen kayıt animasyon ve önizleme içindir:
//   path: taşların sırayla bırakıldığı hücreler
//   rule: 'hazine' | 'cift' | 'bos' | null — son taşın doğurduğu kural
//   took: kuralla hazineye giden taş sayısı, from: taşların alındığı hücreler
//   again: aynı oyuncu bir daha oynar mı, over: oyun bitti mi, sweep: bitişte süpürülen taşlar
export function play(b, p, k) {
  const start = pitIndex(p, k);
  let n = b[start];
  if (n <= 0) return null;
  const path = [];
  b[start] = 0;
  let i = start;
  if (n === 1) {
    // Tek taş kendi kuyusunda kalmaz, bir sonrakine geçer.
    i = next(start, p);
    b[i]++;
    path.push(i);
  } else {
    // İlk taş alındığı kuyuya geri bırakılır.
    b[start]++;
    path.push(start);
    n--;
    while (n-- > 0) {
      i = next(i, p);
      b[i]++;
      path.push(i);
    }
  }
  const own = store(p);
  let rule = null;
  let took = 0;
  const from = [];
  let again = false;
  if (i === own) {
    rule = 'hazine';
    again = true;
  } else if (side(i) === 1 - p && b[i] % 2 === 0) {
    // Son taş rakibin kuyusundaki sayıyı çift yaptı: o kuyu senin.
    rule = 'cift';
    took = b[i];
    from.push(i);
    b[own] += b[i];
    b[i] = 0;
  } else if (side(i) === p && b[i] === 1 && b[opposite(i)] > 0) {
    // Son taş kendi boş kuyuna düştü, karşısı dolu: ikisi de senin.
    rule = 'bos';
    took = b[opposite(i)] + 1;
    from.push(i, opposite(i));
    b[own] += took;
    b[i] = 0;
    b[opposite(i)] = 0;
  }
  // Bir tarafın kuyuları boşaldıysa oyun biter: taşı biten, karşı taraftaki taşları alır.
  let over = false;
  let sweep = null;
  for (const q of [p, 1 - p]) {
    if (sideSum(b, q) === 0) {
      over = true;
      const other = 1 - q;
      const cells = [];
      let total = 0;
      for (let k2 = 0; k2 < PITS; k2++) {
        const j = pitIndex(other, k2);
        if (b[j]) cells.push(j);
        total += b[j];
        b[j] = 0;
      }
      b[store(q)] += total;
      sweep = { to: q, total, cells };
      break;
    }
  }
  return { path, rule, took, from, again: again && !over, over, sweep, last: i };
}

export function winner(b) {
  if (b[6] > b[13]) return 0;
  if (b[13] > b[6]) return 1;
  return -1;
}

// ------------------------------------------------------------------ yapay rakip
// Kolay: çoğunlukla rastgele, arada bir hazineye düşen hamleyi görür.
// Orta: bir hamle ileriye bakar (ek hamleleri zincirleyerek), açgözlü.
// Zor: alfa-beta budamalı arama; ek hamlede sıra değişmez, süre dolana kadar derinleşir.
export function choose(b, p, level, rnd = Math.random) {
  const moves = legal(b, p);
  if (moves.length <= 1) return moves[0] ?? -1;
  if (level === 'k') {
    if (rnd() < 0.35) {
      const again = moves.filter((k) => play(Int8Array.from(b), p, k).again);
      if (again.length) return again[0];
    }
    return moves[Math.floor(rnd() * moves.length)];
  }
  if (level === 'o') {
    let best = -1e9;
    let pick = moves[0];
    for (const k of moves) {
      const c = Int8Array.from(b);
      const r = play(c, p, k);
      let v = c[store(p)] - c[store(1 - p)];
      if (r.again && !r.over) v += greedyAgain(c, p) + 0.5;
      // Rakibin hemen alabileceğini kabaca düş.
      if (!r.again && !r.over) v -= bestImmediate(c, 1 - p) * 0.6;
      v += rnd() * 0.8;
      if (v > best) {
        best = v;
        pick = k;
      }
    }
    return pick;
  }
  return deep(b, p, 380);
}

function greedyAgain(b, p) {
  let best = 0;
  for (const k of legal(b, p)) {
    const c = Int8Array.from(b);
    const before = c[store(p)];
    play(c, p, k);
    best = Math.max(best, c[store(p)] - before);
  }
  return best;
}
function bestImmediate(b, p) {
  let best = 0;
  for (const k of legal(b, p)) {
    const c = Int8Array.from(b);
    const before = c[store(p)];
    play(c, p, k);
    best = Math.max(best, c[store(p)] - before);
  }
  return best;
}

let nodes = 0;
export const searchStats = { depth: 0, nodes: 0, ms: 0 };
function evaluate(b, p) {
  // Hazine farkı esas; kendi tarafında tutulan taşlar küçük bir avantaj.
  return (b[store(p)] - b[store(1 - p)]) * 4 + (sideSum(b, p) - sideSum(b, 1 - p));
}
function negamax(b, p, depth, alpha, beta, deadline) {
  nodes++;
  if (depth === 0) return evaluate(b, p);
  if ((nodes & 1023) === 0 && performance.now() > deadline) throw TIMEOUT;
  const moves = order(b, p);
  let best = -1e9;
  for (const k of moves) {
    const c = Int8Array.from(b);
    const r = play(c, p, k);
    let v;
    if (r.over) v = (c[store(p)] - c[store(1 - p)]) * 1000;
    else if (r.again) v = negamax(c, p, depth - 1, alpha, beta, deadline);
    else v = -negamax(c, 1 - p, depth - 1, -beta, -alpha, deadline);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}
// Hamle sıralaması budamayı hızlandırır: önce hazineye düşenler, sonra taş alanlar.
function order(b, p) {
  const scored = legal(b, p).map((k) => {
    const c = Int8Array.from(b);
    const r = play(c, p, k);
    return [k, (r.again ? 100 : 0) + r.took * 3];
  });
  scored.sort((a, z) => z[1] - a[1]);
  return scored.map((x) => x[0]);
}
const TIMEOUT = new Error('timeout');
function deep(b, p, ms) {
  const t0 = performance.now();
  const deadline = t0 + ms;
  const root = order(b, p);
  let pick = root[0];
  nodes = 0;
  let depth = 1;
  try {
    for (; depth <= 16; depth++) {
      let best = -1e9;
      let bestK = root[0];
      for (const k of root) {
        const c = Int8Array.from(b);
        const r = play(c, p, k);
        let v;
        if (r.over) v = (c[store(p)] - c[store(1 - p)]) * 1000;
        else if (r.again) v = negamax(c, p, depth - 1, -1e9, 1e9, deadline);
        else v = -negamax(c, 1 - p, depth - 1, -1e9, 1e9, deadline);
        if (v > best) {
          best = v;
          bestK = k;
        }
      }
      pick = bestK;
      // En iyi hamleyi bir sonraki derinlikte ilk dene.
      root.sort((a, z) => (a === pick ? -1 : z === pick ? 1 : 0));
    }
  } catch (e) {
    if (e !== TIMEOUT) throw e;
  }
  Object.assign(searchStats, { depth: depth - 1, nodes, ms: Math.round(performance.now() - t0) });
  return pick;
}
