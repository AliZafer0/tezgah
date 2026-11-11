// Örüntüler, perde haritası ve kodlama. Halka sırası içten dışa: bas, synth, zil, perküsyon.

export const STEPS = 16;
export const RINGS = [
  { id: 'bass', name: 'Bas', role: 'Yumuşak bas darbesi' },
  { id: 'synth', name: 'Synth', role: 'Sıcak kısa ton' },
  { id: 'bell', name: 'Zil', role: 'Berrak çan tonu' },
  { id: 'perc', name: 'Perküsyon', role: 'Hafif vuruş' },
];
export const BPM_MIN = 60;
export const BPM_MAX = 140;

// La minör pentatonik (La Do Re Mi Sol). Her adımın perdesi sabittir; bu yüzden
// hangi noktalar açılırsa açılsın sonuç uyumlu kalır.
const NOTE_NAMES = { 0: 'Do', 2: 'Re', 4: 'Mi', 7: 'Sol', 9: 'La' };
export const noteName = (midi) => NOTE_NAMES[((midi % 12) + 12) % 12] ?? '';

// Dört vuruşluk akor yürüyüşü: La – Do – Sol – Mi (her biri 4 adım)
const BASS_ROOTS = [33, 36, 31, 40];
const SYNTH_CHORDS = [
  [57, 60, 64, 67],
  [60, 64, 67, 69],
  [55, 57, 62, 64],
  [52, 55, 57, 62],
];
const BELL_SCALE = [69, 72, 74, 76, 79, 81, 84];
const BELL_CONTOUR = [4, 2, 0, 3, 5, 3, 1, 4, 2, 4, 6, 3, 1, 3, 0, 2];

/** Halka ve adım için MIDI perdesi (perküsyonda null). */
export function pitchFor(ring, step) {
  const q = Math.floor(step / 4);
  if (ring === 0) return BASS_ROOTS[q];
  if (ring === 1) return SYNTH_CHORDS[q][step % 4];
  if (ring === 2) return BELL_SCALE[BELL_CONTOUR[step]];
  return null;
}

const fromBits = (s) => [...s].map((c) => c === '1');

export const PRESETS = {
  sakin: {
    name: 'Sakin',
    bpm: 72,
    notes: [
      '1000000010000000',
      '0000100000000010',
      '0010000000100100',
      '0000100000001000',
    ].map(fromBits),
  },
  akis: {
    name: 'Akış',
    bpm: 100,
    notes: [
      '1000001010000010',
      '0010000100100000',
      '0001001000010010',
      '1010101010101010',
    ].map(fromBits),
  },
  gece: {
    name: 'Gece',
    bpm: 84,
    notes: [
      '1000000100100000',
      '0000010000000101',
      '0100000001000010',
      '0010001000100010',
    ].map(fromBits),
  },
};
export const DEFAULT_PRESET = 'akis';

export const emptyNotes = () => RINGS.map(() => Array(STEPS).fill(false));
export const cloneNotes = (notes) => notes.map((row) => row.slice());
export const countNotes = (notes) => notes.flat().filter(Boolean).length;

/**
 * "İlham ver": rastgele gürültü yerine kurallı, seyrek bir düzen.
 * Bas vuruşu birinci zamanda, perküsyon bir stilden, ezgi halkaları senkoplu
 * ve birbirine çarpmadan.
 */
export function inspire(rand = Math.random) {
  const notes = emptyNotes();
  const pick = (list, n) => {
    const pool = list.slice();
    const out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    return out;
  };

  notes[0][0] = true;
  for (const s of pick([6, 8, 10, 11, 14], 1 + Math.floor(rand() * 2))) notes[0][s] = true;

  const percStyles = [
    () => [0, 2, 4, 6, 8, 10, 12, 14].filter(() => rand() > 0.2),
    () => [2, 6, 10, 14],
    () => [0, 4, 8, 12, ...pick([3, 7, 11, 15], 2)],
    () => [0, 3, 6, 8, 11, 14],
  ];
  for (const s of percStyles[Math.floor(rand() * percStyles.length)]()) notes[3][s] = true;

  const synth = pick([2, 3, 5, 7, 10, 11, 13, 15], 2 + Math.floor(rand() * 3));
  for (const s of synth) notes[1][s] = true;

  // Zil: synth ile aynı adıma düşmesin, aralar en az iki adım olsun
  const bellCandidates = [1, 3, 4, 6, 9, 11, 12, 14].filter((s) => !notes[1][s]);
  const bell = [];
  for (const s of pick(bellCandidates, bellCandidates.length)) {
    if (bell.length >= 2 + Math.floor(rand() * 2)) break;
    if (bell.every((b) => Math.min(Math.abs(b - s), STEPS - Math.abs(b - s)) >= 2)) bell.push(s);
  }
  for (const s of bell) notes[2][s] = true;
  return notes;
}

// ---------- Kodlama: o1.<4×hex16>.<bpm> ----------
const ROW_HEX = /^[0-9a-f]{4}$/;
export const SHARE_MAX_LENGTH = 40;

const rowToHex = (row) => row.reduce((n, on, i) => n | (on ? 1 << (15 - i) : 0), 0).toString(16).padStart(4, '0');
const hexToRow = (hex) => {
  const n = parseInt(hex, 16);
  return Array.from({ length: STEPS }, (_, i) => Boolean(n & (1 << (15 - i))));
};

export function encode(notes, bpm) {
  return `o1.${notes.map(rowToHex).join('.')}.${Math.round(bpm)}`;
}

/** Doğrulanmış çözümleme; geçersiz girdide null. */
export function decode(text) {
  if (typeof text !== 'string' || text.length > SHARE_MAX_LENGTH) return null;
  const parts = text.trim().toLowerCase().split('.');
  if (parts.length !== 6 || parts[0] !== 'o1') return null;
  const rows = parts.slice(1, 5);
  if (!rows.every((h) => ROW_HEX.test(h))) return null;
  if (!/^\d{2,3}$/.test(parts[5])) return null;
  const bpm = Number(parts[5]);
  if (bpm < BPM_MIN || bpm > BPM_MAX) return null;
  return { notes: rows.map(hexToRow), bpm };
}
