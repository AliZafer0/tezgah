// F Daktilo — Türkçe F klavye düzeni ve Q klavyeden F'ye tuş eşlemesi.
// Her tuş: [küçük, büyük/üst karakter]. Harflerin büyüğü Türkçe kurala göre (i → İ, ı → I).

export const ROWS = [
  [['+', '*'], ['1', '!'], ['2', '"'], ['3', '^'], ['4', '$'], ['5', '%'], ['6', '&'], ['7', "'"], ['8', '('], ['9', ')'], ['0', '='], ['/', '?'], ['-', '_']],
  [['f', 'F'], ['g', 'G'], ['ğ', 'Ğ'], ['ı', 'I'], ['o', 'O'], ['d', 'D'], ['r', 'R'], ['n', 'N'], ['h', 'H'], ['p', 'P'], ['q', 'Q'], ['w', 'W']],
  [['u', 'U'], ['i', 'İ'], ['e', 'E'], ['a', 'A'], ['ü', 'Ü'], ['t', 'T'], ['k', 'K'], ['m', 'M'], ['l', 'L'], ['y', 'Y'], ['ş', 'Ş'], ['x', 'X']],
  [['j', 'J'], ['ö', 'Ö'], ['v', 'V'], ['c', 'C'], ['ç', 'Ç'], ['z', 'Z'], ['s', 'S'], ['b', 'B'], ['.', ':'], [',', ';']],
];

// Fiziksel tuş konumu (event.code) → F düzenindeki tuş. Q klavyede F öğrenmek için.
const CODES = [
  ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'],
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Backslash'],
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'],
];
export const CODE_MAP = new Map();
CODES.forEach((row, r) => row.forEach((code, c) => CODE_MAP.set(code, ROWS[r][c])));

// Bir karakterin hangi tuşta olduğu (ekrandaki tuşu bastırmak için)
export const KEY_OF = new Map();
ROWS.forEach((row, r) => row.forEach(([lo, up], c) => { KEY_OF.set(lo, `${r}-${c}`); if (!KEY_OF.has(up)) KEY_OF.set(up, `${r}-${c}`); }));

// Daktilonun basabildiği karakterler: F düzenindekiler, boşluk ve sık kullanılan birkaç işaret.
const EXTRA = ' @#<>[]{}|~`\\';
export const PRINTABLE = new Set([...ROWS.flat().flat(), ...EXTRA]);
