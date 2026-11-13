// Usul Makinesi — usuller, düm-tek yazımı ve adres kodlaması.
// Kalıplar ölçü biriminde yazılır: D düm, T tek, K ke (hafif tek), - sus.
// Yazımlar yaygın meşk yazımlarıdır; icrada bölgeye ve hocaya göre süslemeler değişir.

export const STROKES = ['D', 'T', 'K', '-'];
export const STROKE_NAMES = { D: 'düm', T: 'tek', K: 'ke', '-': 'sus' };

export const USULLER = [
  { key: 'nimsofyan', name: 'Nim Sofyan', meter: '2/4', unit: 4, bpm: 100, pattern: 'DT', groups: [1, 1], about: 'En kısa usul: iki vuruşluk düz bir yürüyüş.' },
  { key: 'semai', name: 'Semai', meter: '3/4', unit: 4, bpm: 104, pattern: 'DTT', groups: [3], about: 'Üç vuruş; şarkılarda ve ilahilerde, vals gibi dönen bir usul.' },
  { key: 'sofyan', name: 'Sofyan', meter: '4/4', unit: 8, bpm: 168, pattern: 'D---TKT-', groups: [4, 4], about: 'Dört vuruş: Düm… te-ke tek. İlahilerin ve şarkıların en yaygın usullerinden.' },
  { key: 'turkaksagi', name: 'Türk Aksağı', meter: '5/8', unit: 8, bpm: 220, pattern: 'D-TT-', groups: [2, 3], about: 'Beş zamanlı aksak: 2 + 3. Bir adım kısa, bir adım uzun.' },
  { key: 'yuruksemai', name: 'Yürük Semai', meter: '6/8', unit: 8, bpm: 216, pattern: 'DTKDT-', groups: [3, 3], about: 'Altı zamanlı, çabuk semai; şarkılarda ve saz semailerinin son hanesinde.' },
  { key: 'devrihindi', name: 'Devr-i Hindi', meter: '7/8', unit: 8, bpm: 200, pattern: 'D-TD-T-', groups: [3, 4], about: 'Yedi zamanlı: 3 + 4. Şarkılarda sık duyulur.' },
  { key: 'mandira', name: 'Mandıra', meter: '7/8', unit: 8, bpm: 230, pattern: 'D-T-DT-', groups: [2, 2, 3], about: 'Yedi zamanlı: 2 + 2 + 3. Rumeli ve Ege oyun havalarında.' },
  { key: 'duyek', name: 'Düyek', meter: '8/8', unit: 8, bpm: 184, pattern: 'DT-TD-T-', groups: [4, 4], about: 'Sekiz zamanlı: Düm tek-tek düm tek. Şarkıların ve peşrevlerin temel usullerinden.' },
  { key: 'aksak', name: 'Aksak', meter: '9/8', unit: 8, bpm: 224, pattern: 'D-T-DDT--', groups: [2, 2, 2, 3], about: 'Dokuz zamanlı "topal" yürüyüş: 2 + 2 + 2 + 3. Şarkıların ve oyun havalarının sevilen usulü.' },
  { key: 'curcuna', name: 'Curcuna', meter: '10/8', unit: 8, bpm: 236, pattern: 'D-TT-D-T--', groups: [3, 2, 2, 3], about: 'On zamanlı: 3 + 2 + 2 + 3. Kıvrak, oynak, bir an tökezler gibi.' },
  { key: 'aksaksemai', name: 'Aksak Semai', meter: '10/8', unit: 8, bpm: 200, pattern: 'D--T-DDT--', groups: [3, 2, 2, 3], about: 'On zamanlı: 3 + 2 + 2 + 3. Saz semailerinin ilk üç hanesinin usulü.' },
];
export const byKey = (k) => USULLER.find((u) => u.key === k);

export const SESLER = { k: 'Kudüm', d: 'Darbuka', b: 'Bendir' };
export const BPM_MIN = 40;
export const BPM_MAX = 320;

// adres: <usul>.<tempo>.<kalıp>.<ses>.<zil 0|1>.<nefes 0–9>
export function encode(s) {
  return [s.usul, s.bpm, s.pattern, s.ses, s.zil ? 1 : 0, s.nefes].join('.');
}
export function decode(text) {
  const m = /^([a-z]+)\.(\d{2,3})\.([DTK-]{1,16})\.([kdb])\.([01])\.(\d)$/.exec(text);
  if (!m) return null;
  const u = byKey(m[1]);
  if (!u || m[3].length !== u.pattern.length) return null;
  const bpm = Math.max(BPM_MIN, Math.min(BPM_MAX, +m[2]));
  return { usul: u.key, bpm, pattern: m[3], ses: m[4], zil: m[5] === '1', nefes: +m[6] };
}
