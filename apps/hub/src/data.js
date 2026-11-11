// Manifest okuma ve projeye özgü görsel imza.

export async function fetchManifest() {
  const res = await fetch('/projects.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return {
    projects: Array.isArray(data.projects) ? data.projects : [],
    issues: Array.isArray(data.issues) ? data.issues : [],
  };
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export const FORMATION_COUNT = 6;

/**
 * Proje imzası: renk ve sahnedeki biçim. Metadata'da accent yoksa renk,
 * paletin dışına taşmaması için nane–buz–leylak aralığından seçilir.
 */
export function signature(project) {
  const h = hash(project.slug);
  const accent = project.accent ?? hslToHex(165 + (h % 120), 0.82, 0.76);
  return {
    accent,
    formation: 1 + ((h >>> 8) % FORMATION_COUNT),
    seed: h,
  };
}

/** Türkçe karakterlere ve aksanlara duyarsız arama metni. */
export function normalize(text) {
  return text
    .toLocaleLowerCase('tr')
    .replaceAll('ı', 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Varsayılan kapak için slug'dan türetilmiş, kararlı bir 0/1 dokusu. */
export function glyphTexture(seed, lines = 12, width = 48) {
  let s = seed || 1;
  const rand = () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  const extra = '{}<>/;*+=';
  let out = '';
  for (let y = 0; y < lines; y++) {
    for (let x = 0; x < width; x++) {
      const r = rand();
      out += r < 0.06 ? extra[(r * 1000 | 0) % extra.length] : r < 0.53 ? '0' : '1';
    }
    out += '\n';
  }
  return out;
}

export function monogram(title) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : words[0]?.slice(0, 2) ?? '';
  return letters.toLocaleUpperCase('tr');
}
