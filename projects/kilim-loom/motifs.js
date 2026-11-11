// Kilim motifleri ve tohumlu desen üreteci.
// Motif bitmap'lerinde: X = ana renk, o = ikinci renk, . = boş (zemin görünür).

export const COLS = 41;
export const ROWS = 61;

// Kök boya paleti: kökboya kırmızısı, çivit, ceviz, cehri sarısı, ham yün, sütlüğen yeşili, kiraz, kına turuncusu
export const PALETTE = [
  { key: 'kokboya', name: 'Kökboya kırmızısı', hex: '#9b2a22' },
  { key: 'civit', name: 'Çivit', hex: '#263b5e' },
  { key: 'ceviz', name: 'Ceviz kahvesi', hex: '#4a3326' },
  { key: 'cehri', name: 'Cehri sarısı', hex: '#d3a23b' },
  { key: 'yun', name: 'Ham yün', hex: '#efe4cc' },
  { key: 'yesil', name: 'Sütlüğen yeşili', hex: '#55703f' },
  { key: 'kiraz', name: 'Kiraz', hex: '#6b1f2a' },
  { key: 'kina', name: 'Kına turuncusu', hex: '#c2622d' },
];
// Motifin "o" hücreleri için her renge yakışan eş renk
export const PAIR = [3, 4, 3, 2, 0, 3, 3, 1];

const bitmap = (rows) => rows.map((r) => [...r]);

export const MOTIFS = [
  {
    key: 'elibelinde', name: 'Elibelinde', meaning: 'Annelik, bereket',
    cells: bitmap([
      '.....X.....',
      '....XoX....',
      '.....X.....',
      '.XXXXXXXXX.',
      'X.X..X..X.X',
      'X..X.X.X..X',
      '.XXXXXXXXX.',
      '....XoX....',
      '...XXoXX...',
      '..XXXoXXX..',
      '.XXXXXXXXX.',
    ]),
  },
  {
    key: 'kocboynuzu', name: 'Koçboynuzu', meaning: 'Güç, erkeklik',
    cells: bitmap([
      'XXX.....XXX',
      'X..X...X..X',
      'X.o.X.X.o.X',
      '.X..XXX..X.',
      '..XX.X.XX..',
      '.....X.....',
      '....XXX....',
      '...X.o.X...',
      '....XXX....',
    ]),
  },
  {
    key: 'yildiz', name: 'Yıldız', meaning: 'Mutluluk',
    cells: bitmap([
      '....X....',
      '...XXX...',
      'X.XXoXX.X',
      '.XXoooXX.',
      'XXoooooXX',
      '.XXoooXX.',
      'X.XXoXX.X',
      '...XXX...',
      '....X....',
    ]),
  },
  {
    key: 'goz', name: 'Göz', meaning: 'Nazardan korunma',
    cells: bitmap([
      '....X....',
      '...XoX...',
      '..XoXoX..',
      '.XoX.XoX.',
      'XoX.o.XoX',
      '.XoX.XoX.',
      '..XoXoX..',
      '...XoX...',
      '....X....',
    ]),
  },
  {
    key: 'muska', name: 'Muska', meaning: 'Koruma',
    cells: bitmap([
      'XXXXXXXXX',
      '.XoooooX.',
      '..XoooX..',
      '...XoX...',
      '....X....',
      '....X....',
      '...X.X...',
      '..X...X..',
    ]),
  },
  {
    key: 'pitrak', name: 'Pıtrak', meaning: 'Kötülüğe karşı',
    cells: bitmap([
      'X..XXX..X',
      '.X..X..X.',
      '..X.X.X..',
      'X..XoX..X',
      'XXXXoXXXX',
      'X..XoX..X',
      '..X.X.X..',
      '.X..X..X.',
      'X..XXX..X',
    ]),
  },
  {
    key: 'kurtizi', name: 'Kurt izi', meaning: 'Sürüyü korumak',
    cells: bitmap([
      '.X.....X.',
      'XX.....XX',
      '..X...X..',
      '...XoX...',
      '...oXo...',
      '...XoX...',
      '..X...X..',
      'XX.....XX',
      '.X.....X.',
    ]),
  },
  {
    key: 'suyolu', name: 'Su yolu', meaning: 'Hayatın akışı', band: true,
    // Bant motifi: tıklanan satırda tezgâh boyunca tekrar eder
    cells: bitmap([
      'X...',
      '.X.X',
      '..X.',
    ]),
  },
];

// ------------------------------------------------------------------ tohumlu rastgelelik
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ ızgara yardımcıları
export const idx = (c, r) => r * COLS + c;
export const inside = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS;

// Simetri: 0 = yok, 1 = dikey eksende ayna, 2 = dörtlü (iki eksen)
export function mirrors(c, r, sym) {
  const out = [[c, r]];
  if (sym >= 1) out.push([COLS - 1 - c, r]);
  if (sym >= 2) out.push([c, ROWS - 1 - r], [COLS - 1 - c, ROWS - 1 - r]);
  return out;
}

export function setCell(grid, c, r, v, sym = 0) {
  for (const [x, y] of mirrors(c, r, sym)) if (inside(x, y)) grid[idx(x, y)] = v;
}

export function stamp(grid, motif, cc, cr, color, sym = 0) {
  const second = PAIR[color];
  const h = motif.cells.length; const w = motif.cells[0].length;
  if (motif.band) {
    for (let y = 0; y < h; y++) for (let x = 0; x < COLS; x++) {
      const ch = motif.cells[y][x % w];
      if (ch !== '.') setCell(grid, x, cr - (h >> 1) + y, ch === 'X' ? color : second, sym);
    }
    return;
  }
  const ox = cc - (w >> 1); const oy = cr - (h >> 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = motif.cells[y][x];
    if (ch !== '.') setCell(grid, ox + x, oy + y, ch === 'X' ? color : second, sym);
  }
}

export function flood(grid, c, r, v) {
  const from = grid[idx(c, r)];
  if (from === v) return 0;
  const stack = [[c, r]]; let n = 0;
  while (stack.length) {
    const [x, y] = stack.pop();
    if (!inside(x, y) || grid[idx(x, y)] !== from) continue;
    grid[idx(x, y)] = v; n++;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return n;
}

// ------------------------------------------------------------------ üreteç
// Gerçek kilimlerin düzeni: dış kenar şeritleri, su yolu ya da kurt izi bordürü,
// ortada eksen boyunca dizilen çengelli göl (madalyon) ve köşelerde küçük motifler.
const GROUNDS = [0, 1, 6, 2, 0, 6];

export function generate(seed) {
  const R = rng(seed);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const grid = new Uint8Array(COLS * ROWS);

  const ground = pick(GROUNDS);
  const others = [0, 1, 2, 3, 4, 5, 6, 7].filter((c) => c !== ground);
  const shuffle = others.sort(() => R() - 0.5);
  const [edge, borderBg, borderFg, med1, med2, med3, accent] = [
    ground === 2 ? 4 : 2, shuffle[0] === 2 ? shuffle[1] : shuffle[0], 4, shuffle[2], shuffle[3], shuffle[4], shuffle[5],
  ];
  grid.fill(ground);

  // Dış şerit (1), bordür zemini (5 hücre), iç şerit (1)
  const B = 7;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const d = Math.min(c, r, COLS - 1 - c, ROWS - 1 - r);
    if (d === 0 || d === B - 1) grid[idx(c, r)] = edge;
    else if (d < B - 1) grid[idx(c, r)] = borderBg;
  }
  // Bordür deseni: su yolu zikzağı ya da tekrar eden küçük baklavalar
  const borderKind = R() < 0.5 ? 'zigzag' : 'diamond';
  const fg = borderFg === borderBg ? accent : borderFg;
  const ring = (c, r) => Math.min(c, r, COLS - 1 - c, ROWS - 1 - r);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const d = ring(c, r);
    if (d < 1 || d > B - 2) continue;
    // Bordür boyunca konum (t) ve bordür içi derinlik (u = 0..4)
    const u = d - 1;
    const onSide = d === c || d === COLS - 1 - c;
    const t = onSide ? r : c;
    if (borderKind === 'zigzag') {
      const p = t % 8; const z = p < 4 ? p : 8 - p;
      if (u === z || (u === 4 && p === 4)) grid[idx(c, r)] = fg;
    } else {
      const p = (t + 3) % 6; const m = Math.abs(p - 3) + Math.abs(u - 2);
      if (m === 2) grid[idx(c, r)] = fg;
      else if (m === 0) grid[idx(c, r)] = accent;
    }
  }

  // Göller: 1, 2 ya da 3 madalyon, merkez satıra göre simetrik
  const fieldW = COLS - 2 * B; const fieldH = ROWS - 2 * B;
  const n = pick([1, 2, 3, 3]);
  const cx = COLS >> 1; const cy = ROWS >> 1;
  const rad = Math.min((fieldW >> 1) - 2, Math.floor(fieldH / (n * 2)) - 1);
  const centers = n === 1 ? [cy] : n === 2 ? [cy - rad - 1, cy + rad + 1] : [cy - 2 * rad - 2, cy, cy + 2 * rad + 2];
  const rings = [med1, med2, med3 === ground ? accent : med3];
  const hookStep = pick([3, 4]);
  for (const my of centers) {
    for (let r = my - rad - 3; r <= my + rad + 3; r++) for (let c = cx - rad - 3; c <= cx + rad + 3; c++) {
      if (!inside(c, r) || ring(c, r) < B) continue;
      const dx = Math.abs(c - cx); const dy = Math.abs(r - my); const d = dx + dy;
      if (d <= rad) {
        const k = rad - d;
        grid[idx(c, r)] = k === 0 ? edge : rings[Math.floor((k - 1) / 2) % rings.length];
      } else if (d <= rad + 2 && dx > 0 && dy > 0 && dx % hookStep === 0) {
        // Çengeller: madalyonun kenarından dışarı uzanan kısa dişler
        grid[idx(c, r)] = edge;
      }
    }
    const small = MOTIFS[pick([2, 3, 5])];
    if (rad >= 6) stamp(grid, small, cx, my, accent === ground ? 4 : accent, 0);
  }

  // Köşelerde ve madalyon aralarında dörtlü simetriyle küçük motifler: yalnızca boş zemine sığarsa
  const inMedallion = (c, r) => centers.some((my) => Math.abs(c - cx) + Math.abs(r - my) <= rad + 3);
  const fits = (m, x0, y0) => {
    const h = m.cells.length; const w = m.cells[0].length;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (m.cells[y][x] === '.') continue;
      const c = x0 - (w >> 1) + x; const r = y0 - (h >> 1) + y;
      if (!inside(c, r) || ring(c, r) < B + 1 || inMedallion(c, r)) return false;
    }
    return true;
  };
  const smallColor = pick([3, 4, 5, 7].filter((x) => x !== ground && x !== borderBg));
  const candidates = [MOTIFS[pick([0, 1, 4, 5, 6])], MOTIFS[pick([2, 3, 6])]];
  const spots = [];
  for (let y = B + 5; y <= cy; y += 2) for (let x = B + 5; x <= cx - 4; x += 2) spots.push([x, y]);
  const used = new Uint8Array(COLS * ROWS);
  for (const m of candidates) {
    const h = m.cells.length; const w = m.cells[0].length;
    for (const [x, y] of spots) {
      if (!fits(m, x, y)) continue;
      let clash = false;
      for (let yy = -1; yy <= h; yy++) for (let xx = -1; xx <= w; xx++) {
        const c = x - (w >> 1) + xx; const r = y - (h >> 1) + yy;
        if (inside(c, r) && used[idx(c, r)]) clash = true;
      }
      if (clash) continue;
      stamp(grid, m, x, y, smallColor, 2);
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        for (const [c, r] of mirrors(x - (w >> 1) + xx, y - (h >> 1) + yy, 2)) if (inside(c, r)) used[idx(c, r)] = 1;
      }
      break;
    }
  }
  return grid;
}

// ------------------------------------------------------------------ adres kodlaması
// Satır uzunluk kodlaması: her bayt = renk (3 bit) + tekrar-1 (5 bit), sonra base64url
export function encode(grid) {
  const bytes = [];
  for (let i = 0; i < grid.length;) {
    const v = grid[i]; let n = 1;
    while (i + n < grid.length && grid[i + n] === v && n < 32) n++;
    bytes.push((v << 5) | (n - 1)); i += n;
  }
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return 'k1' + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decode(text) {
  if (!/^k1[A-Za-z0-9_-]+$/.test(text)) return null;
  let raw;
  try { raw = atob(text.slice(2).replace(/-/g, '+').replace(/_/g, '/')); } catch { return null; }
  const grid = new Uint8Array(COLS * ROWS); let i = 0;
  for (let k = 0; k < raw.length; k++) {
    const b = raw.charCodeAt(k); const v = b >> 5; const n = (b & 31) + 1;
    if (v >= PALETTE.length || i + n > grid.length) return null;
    grid.fill(v, i, i + n); i += n;
  }
  return i === grid.length ? grid : null;
}
