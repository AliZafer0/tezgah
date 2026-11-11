// Makam kuramı (Arel–Ezgi–Uzdilek): oktav 53 komaya bölünür.
// Aralıklar: F = koma (1), B = bakiye (4), S = küçük mücenneb (5), K = büyük mücenneb (8), T = tanini (9), A = artık ikili (12–13)

export const OCTAVE = 53;
const RAST_HZ = 196; // Rast perdesi = Sol3 (konser akordu)

// Rast'tan (0) itibaren koma konumu → perde adı (bir oktav)
const PERDE = {
  0: 'Rast', 4: 'Nim Zirgüle', 5: 'Zirgüle', 9: 'Dügâh', 13: 'Kürdî', 14: 'Dik Kürdî', 17: 'Segâh', 18: 'Bûselik',
  22: 'Çârgâh', 26: 'Nim Hicaz', 27: 'Hicaz', 30: 'Dik Hicaz', 31: 'Nevâ', 35: 'Nim Hisar', 36: 'Hisar', 40: 'Hüseynî',
  44: 'Acem', 48: 'Eviç', 49: 'Mâhur',
};
const UPPER = { 53: 'Gerdaniye', 62: 'Muhayyer', 66: 'Sünbüle', 70: 'Tiz Segâh', 71: 'Tiz Bûselik', 75: 'Tiz Çârgâh', 84: 'Tiz Nevâ', 93: 'Tiz Hüseynî', 97: 'Tiz Acem', 101: 'Tiz Eviç', 102: 'Tiz Mâhur' };
export function perdeName(k) {
  if (UPPER[k]) return UPPER[k];
  if (k < OCTAVE) return PERDE[k] ?? `${k}. koma`;
  return `Tiz ${perdeName(k - OCTAVE)}`;
}

export const INTERVAL = { 4: 'B', 5: 'S', 8: 'K', 9: 'T', 12: 'A', 13: 'A' };
export const INTERVAL_NAME = { B: 'bakiye', S: 'küçük mücenneb', K: 'büyük mücenneb', T: 'tanini', A: 'artık ikili' };

// Her makam: karar perdesi (Rast'tan koma), güçlü (karardan derece indeksi), aralık dizisi (oktav = 53)
export const MAKAMS = [
  {
    key: 'rast', name: 'Rast', karar: 0, guclu: 4, steps: [9, 8, 5, 9, 9, 8, 5],
    parts: 'Rast beşlisi + Rast dörtlüsü', seyir: 'çıkıcı',
    note: 'Türk müziğinin ana makamı. Segâh perdesi Batı\'daki si bemolden de sidan da farklıdır: tam arada, kendine özgü bir renk.',
  },
  {
    key: 'ussak', name: 'Uşşak', karar: 9, guclu: 3, steps: [8, 5, 9, 9, 4, 9, 9],
    parts: 'Uşşak dörtlüsü + Bûselik beşlisi', seyir: 'çıkıcı',
    note: 'Âşıkların makamı: içli, sıcak ve konuşur gibi. Segâh perdesi dizinin ruhunu taşır.',
  },
  {
    key: 'hicaz', name: 'Hicaz', karar: 9, guclu: 3, steps: [5, 12, 5, 9, 8, 5, 9],
    parts: 'Hicaz dörtlüsü + Rast beşlisi', seyir: 'inici-çıkıcı',
    note: 'Dik Kürdî ile Nim Hicaz arasındaki artık ikili aralığı, Hicaz\'a doğulu ve hüzünlü kimliğini verir.',
  },
  {
    key: 'huseyni', name: 'Hüseynî', karar: 9, guclu: 4, steps: [8, 5, 9, 9, 8, 5, 9],
    parts: 'Hüseynî beşlisi + Uşşak dörtlüsü', seyir: 'inici-çıkıcı',
    note: 'Hüseynî perdesinde güçlenir; türkülerin ve uzun havaların sık uğrağı.',
  },
  {
    key: 'nihavend', name: 'Nihâvend', karar: 0, guclu: 4, steps: [9, 4, 9, 9, 4, 9, 9],
    parts: 'Bûselik beşlisi + Kürdî dörtlüsü', seyir: 'inici-çıkıcı',
    note: 'Batı\'daki minöre en yakın makam; bu yüzden 12 tonlu akorda geçince farkı en az duyulan dizi.',
  },
  {
    key: 'kurdi', name: 'Kürdî', karar: 9, guclu: 3, steps: [4, 9, 9, 9, 4, 9, 9],
    parts: 'Kürdî dörtlüsü + Bûselik beşlisi', seyir: 'çıkıcı',
    note: 'Dügâh ile Kürdî arasındaki bakiye aralığı, dizinin hemen başında karanlık bir renk açar.',
  },
  {
    key: 'saba', name: 'Sabâ', karar: 9, guclu: 2, steps: [8, 5, 5, 13, 4, 9, 9],
    parts: 'Sabâ dörtlüsü + Hicaz dörtlüsü', seyir: 'çıkıcı',
    note: 'Oktavı tamamlamayan, dörtlüsü daralan, en yaslı makamlardan biri. Güçlüsü Çârgâh\'tır.',
  },
  {
    key: 'buselik', name: 'Bûselik', karar: 9, guclu: 4, steps: [9, 4, 9, 9, 4, 9, 9],
    parts: 'Bûselik beşlisi + Kürdî dörtlüsü', seyir: 'çıkıcı',
    note: 'Dügâh\'ta karar veren, sade ve oturaklı bir dizi.',
  },
  {
    key: 'cargah', name: 'Çârgâh', karar: 22, guclu: 4, steps: [9, 9, 4, 9, 9, 9, 4],
    parts: 'Çârgâh beşlisi + Çârgâh dörtlüsü', seyir: 'çıkıcı',
    note: 'Batı\'daki majöre karşılık gelen dizi; Türk müziğinde nadir, parlak ve açık.',
  },
];

// Makamın karar'dan başlayan perdeleri (koma, Rast'tan); bir oktav + bir dörtlü
export function degrees(m, extra = 4) {
  const out = [m.karar]; let k = m.karar;
  for (let i = 0; i < m.steps.length + extra; i++) { k += m.steps[i % m.steps.length]; out.push(k); }
  return out;
}

// 53 komalı perde → frekans. western: 12 eşit sese en yakın değere yuvarla
export function freq(k, western = false) {
  if (western) {
    const semis = Math.round((k / OCTAVE) * 12);
    return RAST_HZ * 2 ** (semis / 12);
  }
  return RAST_HZ * 2 ** (k / OCTAVE);
}

// 12 eşit sesten sapma (sent) ve en yakın Batı notası
const NOTE = ['Sol', 'Sol♯', 'La', 'Si♭', 'Si', 'Do', 'Do♯', 'Re', 'Mi♭', 'Mi', 'Fa', 'Fa♯'];
export function western(k) {
  const cents = (k / OCTAVE) * 1200; const semi = Math.round(cents / 100);
  return { note: NOTE[((semi % 12) + 12) % 12], cents: Math.round(cents - semi * 100) };
}

export const byKey = (key) => MAKAMS.find((m) => m.key === key);
