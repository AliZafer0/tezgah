// Tasvirler: deriden kesilmiş, eklemli parçalar. Birimler figür birimi (boy ≈ 120); yerel koordinatta
// her parça pivotundan aşağı (+y) sarkar. Figürler varsayılan olarak sağa bakar.

const OUT = '#3a2414';

// Parça: poly (yerel çokgen), color, pivot (ebeveyn yerelinde), L (kütle merkezine uzaklık),
// rest (ebeveynin "aşağı"sına göre dinlenme açısı), lim [min, max], k (yay), c (sönüm), extras (çizim eki)
const arm = (color, hand) => ({
  name: 'üst kol', pivot: [7, -44], L: 11, rest: 0.25, lim: [-1.2, 2.4], k: 3, c: 1.6,
  poly: [[-3.5, -2], [3.5, -2], [3, 22], [-3, 22]], color,
  children: [{
    name: 'alt kol', pivot: [0, 21], L: 11, rest: 0.45, lim: [-0.2, 2.2], k: 4, c: 1.4,
    poly: [[-3, -1], [3, -1], [2.6, 18], [5, 20], [5.5, 24], [1, 25], [-2.5, 22]], color: hand || color,
  }],
});
const leg = (pivotX, rest, color, shoe) => ({
  name: 'bacak', pivot: [pivotX, 13], L: 16, rest, lim: [-0.7, 0.9], k: 5, c: 2,
  poly: [[-5, -1], [5, -1], [4.5, 27], [11, 29], [13, 33], [-4.5, 33]], color,
  extras: [{ type: 'poly', pts: [[-4.6, 27], [4.5, 27], [11, 29], [13, 33], [-4.5, 33]], color: shoe }],
});
const hips = (color, legColor, shoe) => ({
  name: 'kalça', pivot: [0, 0], L: 7, rest: 0, lim: [-0.3, 0.3], k: 26, c: 4,
  poly: [[-14, -1], [14, -1], [16, 15], [-16, 15]], color,
  children: [leg(5.5, 0.12, legColor, shoe), leg(-5.5, -0.1, legColor, shoe)],
  // Arka bacak önce, sonra kalça, en son ön bacak
  drawOrder: [1, 'self', 0],
});

export const FIGURES = {
  karagoz: {
    name: 'Karagöz',
    torso: {
      poly: [[-12, -50], [12, -50], [15, -22], [14, 0], [-14, 0], [-15, -22]], color: '#b8322a',
      extras: [
        { type: 'poly', pts: [[-10, -66], [-11, -75], [-7, -84], [0, -88], [6, -85], [10, -76], [10, -66]], color: '#2a2622' }, // ışkırlak
        { type: 'circle', x: 0, y: -60, r: 10, color: '#e3b27d' }, // baş
        { type: 'poly', pts: [[8, -64], [13, -61], [9, -58]], color: '#e3b27d' }, // burun
        { type: 'circle', x: 3, y: -52, r: 8, color: '#2a1a12' }, // yuvarlak sakal
        { type: 'poly', pts: [[-14, -3], [14, -3], [14.2, 1], [-14.2, 1]], color: '#d7a640' }, // kuşak
        { type: 'hole', x: 4, y: -63, r: 1.8 }, // göz
      ],
    },
    arm: arm('#b8322a', '#e3b27d'), hips: hips('#2f5d8a', '#c79a3a', '#2a1a12'),
  },
  hacivat: {
    name: 'Hacivat',
    torso: {
      poly: [[-11, -52], [11, -52], [13, -24], [13, 0], [-13, 0], [-13, -24]], color: '#3f7a4a',
      extras: [
        { type: 'poly', pts: [[-8, -67], [-6, -86], [0, -98], [5, -86], [8, -67]], color: '#7a2f2a' }, // uzun kavuk
        { type: 'circle', x: 0, y: -98, r: 2.6, color: '#d7a640' },
        { type: 'circle', x: 0, y: -61, r: 9, color: '#e8bd8a' },
        { type: 'poly', pts: [[7, -64], [12, -60], [8, -58]], color: '#e8bd8a' },
        { type: 'poly', pts: [[-4, -56], [8, -57], [7, -48], [2, -40]], color: '#2a1a12' }, // sivri sakal
        { type: 'poly', pts: [[-13, -3], [13, -3], [13, 1], [-13, 1]], color: '#c79a3a' },
        { type: 'hole', x: 4, y: -63, r: 1.6 },
      ],
    },
    arm: arm('#3f7a4a', '#e8bd8a'), hips: hips('#8a3b6a', '#c79a3a', '#2a1a12'),
  },
};

// Perdeye sabit dekorlar: sağda bir ağaç ve açılıştaki göstermelik (lale vazosu)
export const TREE = [
  { type: 'poly', pts: [[-6, 0], [6, 0], [4, -70], [12, -96], [6, -98], [0, -80], [-7, -104], [-12, -100], [-4, -72]], color: '#5a3a22' },
  { type: 'circle', x: -14, y: -112, r: 24, color: '#4f7a3a' },
  { type: 'circle', x: 16, y: -108, r: 22, color: '#5f8a3e' },
  { type: 'circle', x: 0, y: -134, r: 26, color: '#46703a' },
];
export const GOSTERMELIK = [
  { type: 'poly', pts: [[-26, 0], [26, 0], [20, -10], [30, -40], [16, -70], [10, -74], [-10, -74], [-16, -70], [-30, -40], [-20, -10]], color: '#2f5d8a' },
  { type: 'poly', pts: [[-12, -74], [12, -74], [9, -82], [-9, -82]], color: '#d7a640' },
  { type: 'poly', pts: [[-2, -82], [2, -82], [3, -150], [-3, -150]], color: '#4f7a3a' },
  { type: 'poly', pts: [[-2, -110], [-28, -138], [-32, -132], [-4, -104]], color: '#4f7a3a' },
  { type: 'poly', pts: [[2, -100], [26, -124], [30, -118], [4, -94]], color: '#4f7a3a' },
  { type: 'poly', pts: [[-8, -150], [-11, -170], [-5, -162], [0, -178], [5, -162], [11, -170], [8, -150]], color: '#b8322a' },
  { type: 'poly', pts: [[-38, -136], [-42, -152], [-36, -146], [-31, -158], [-27, -144], [-22, -150], [-24, -134]], color: '#c79a3a' },
  { type: 'poly', pts: [[22, -120], [22, -136], [27, -130], [32, -142], [36, -128], [40, -134], [38, -118]], color: '#8a3b6a' },
  { type: 'hole', x: 0, y: -40, r: 6 }, { type: 'hole', x: -14, y: -40, r: 3 }, { type: 'hole', x: 14, y: -40, r: 3 },
];
export { OUT };
