// Mangala — tahta, taşlar, hamle önizlemesi, yapay rakip ve paylaşım.
// Oyun hamle listesinden yeniden kurulur: adres yalnız hamleleri taşır, açan aynı konumu görür.
import { newBoard, play, legal, choose, pitIndex, store, side, winner, searchStats, PITS } from './kurallar.js';

const $ = (s) => document.querySelector(s);
const boardEl = $('#tahta');
const ui = {
  mode: [...document.querySelectorAll('input[name="mod"]')],
  level: [...document.querySelectorAll('input[name="zorluk"]')],
  levelBox: $('#zorluk-kutu'),
  starter: $('#rakip-baslar'),
  sound: $('#ses'),
  fresh: $('#yeni'), undo: $('#geri'), rules: $('#kurallar'), dialog: $('#kural-penceresi'),
  share: $('#share'), shareBox: $('#sharebox'), shareLink: $('#share-link'),
  turn: $('#sira'), hint: $('#onizleme'), status: $('#status'),
  name0: $('#ad-0'), name1: $('#ad-1'), score0: $('#skor-0'), score1: $('#skor-1'),
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLORS = 6; // cam taş renkleri (style.css'te .c0–.c5)

let state = { mode: 'b', level: 'o', starter: 0, moves: [] };
let board = newBoard();
let colors = [];
let movers = [];
let turn = 0;
let over = false;
let busy = false; // animasyon ya da rakip düşünürken giriş kapalı
let aiTimer = 0;

const names = () => (state.mode === 'b' ? ['Sen', 'Rakip'] : ['1. oyuncu', '2. oyuncu']);
const isHuman = (p) => state.mode === 'i' || p === 0;

// ------------------------------------------------------------------ tahta
const cells = [];
function buildBoard() {
  for (let i = 0; i < 14; i++) {
    const isStore = i === 6 || i === 13;
    const el = document.createElement(isStore ? 'div' : 'button');
    el.className = isStore ? `hazine h${i === 6 ? 0 : 1}` : 'kuyu';
    if (!isStore) el.type = 'button';
    el.dataset.i = i;
    // Geniş ekranda yatay, dar ekranda dikey yerleşim (style.css'te --c/--r ve --pc/--pr)
    let c, r, pc, pr;
    if (i === 13) { c = '1'; r = '1 / 3'; pc = '1 / 3'; pr = '8'; }
    else if (i === 6) { c = '8'; r = '1 / 3'; pc = '1 / 3'; pr = '1'; }
    else if (i < 6) { c = String(2 + i); r = '2'; pc = '2'; pr = String(7 - i); }
    else { c = String(2 + (12 - i)); r = '1'; pc = '1'; pr = String(2 + (i - 7)); }
    el.style.cssText = `--c:${c};--r:${r};--pc:${pc};--pr:${pr}`;
    el.innerHTML = '<span class="taslar" aria-hidden="true"></span><b class="sayi" aria-hidden="true"></b><i class="arti" aria-hidden="true"></i>';
    boardEl.appendChild(el);
    cells.push({ el, stones: el.firstChild, count: el.children[1], plus: el.children[2], key: '' });
  }
}

// Taşların kuyu içindeki yerleri: ayçiçeği dizilimi, her taş biraz kendi açısında.
function spot(j, isStore, wide) {
  const a = j * 2.39996;
  if (isStore) {
    const r = Math.min(1, Math.sqrt((j + 0.5) / 40));
    const [rx, ry] = wide ? [40, 30] : [30, 40];
    return [50 + Math.cos(a) * rx * r, 50 + Math.sin(a) * ry * r];
  }
  const r = Math.min(1, Math.sqrt((j + 0.5) / 12));
  return [50 + Math.cos(a) * 32 * r, 50 + Math.sin(a) * 32 * r];
}
function renderCell(i) {
  const c = cells[i];
  const list = colors[i];
  const isStore = i === 6 || i === 13;
  const wide = isStore && c.el.offsetWidth > c.el.offsetHeight;
  const key = list.join('') + (wide ? 'w' : '');
  if (key !== c.key) {
    const max = isStore ? 48 : 24;
    let html = '';
    for (let j = 0; j < Math.min(list.length, max); j++) {
      const [x, y] = spot(j, isStore, wide);
      html += `<i class="tas c${list[j]}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;--r:${(j * 47) % 360}deg"></i>`;
    }
    c.stones.innerHTML = html;
    c.key = key;
  }
  c.count.textContent = list.length;
}
function render() {
  for (let i = 0; i < 14; i++) renderCell(i);
  const [n0, n1] = names();
  ui.name0.textContent = n0; ui.name1.textContent = n1;
  ui.score0.textContent = board[6]; ui.score1.textContent = board[13];
  for (let i = 0; i < 14; i++) {
    if (i === 6 || i === 13) continue;
    const p = side(i);
    const k = p === 0 ? i : i - 7;
    const can = !over && !busy && p === turn && isHuman(p) && board[i] > 0;
    const el = cells[i].el;
    el.disabled = !can;
    el.classList.toggle('sirada', !over && p === turn);
    el.setAttribute('aria-label', `${names()[p]}, ${k + 1}. kuyu: ${board[i]} taş${can ? '' : ''}`);
  }
  boardEl.dataset.sira = over ? '' : String(turn);
  if (over) {
    const w = winner(board);
    const [a, b] = [board[6], board[13]];
    ui.turn.textContent = w < 0 ? `Berabere: ${a}–${b}` : state.mode === 'b' ? (w === 0 ? `Kazandın: ${a}–${b}` : `Rakip kazandı: ${b}–${a}`) : `${names()[w]} kazandı: ${Math.max(a, b)}–${Math.min(a, b)}`;
  } else if (busy && !isHuman(turn)) ui.turn.textContent = 'Rakip düşünüyor…';
  else ui.turn.textContent = state.mode === 'b' ? (turn === 0 ? 'Sıra sende' : 'Sıra rakipte') : `Sıra: ${names()[turn]}`;
  ui.undo.disabled = busy || !state.moves.length;
  for (const r of ui.mode) r.checked = r.value === state.mode;
  for (const r of ui.level) r.checked = r.value === state.level;
  ui.levelBox.disabled = state.mode !== 'b';
  ui.starter.checked = state.starter === 1;
}

// ------------------------------------------------------------------ oyun kurma
function initColors() {
  colors = Array.from({ length: 14 }, () => []);
  let s = 7;
  for (let i = 0; i < 14; i++) {
    if (i === 6 || i === 13) continue;
    for (let j = 0; j < 4; j++) colors[i].push((s = (s * 5 + i + j * 3) % 97) % COLORS);
  }
}
// Hamle kaydını renkli taşlara uygular: taşlar gerçekten bir kuyudan ötekine taşınır.
function applyColors(start, r) {
  const hand = colors[start].splice(0);
  r.path.forEach((cell, m) => colors[cell].push(hand[m]));
  for (const f of r.from) colors[store(side(start))].push(...colors[f].splice(0));
  if (r.sweep) for (const cell of r.sweep.cells) colors[store(r.sweep.to)].push(...colors[cell].splice(0));
}
function rebuild() {
  board = newBoard(); initColors(); movers = []; turn = state.starter; over = false;
  const ok = [];
  for (const k of state.moves) {
    if (over || board[pitIndex(turn, k)] <= 0) break;
    const start = pitIndex(turn, k);
    const r = play(board, turn, k);
    applyColors(start, r);
    movers.push(turn); ok.push(k);
    over = r.over;
    if (!r.again) turn = 1 - turn;
  }
  const dropped = ok.length !== state.moves.length;
  state.moves = ok;
  return dropped;
}

// ------------------------------------------------------------------ hamle ve animasyon
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function move(k) {
  if (busy || over) return;
  const p = turn;
  const start = pitIndex(p, k);
  if (board[start] <= 0) return;
  busy = true; clearPreview();
  const before = Int8Array.from(board);
  const r = play(board, p, k);
  state.moves.push(k); movers.push(p);
  saveHash();
  // Görüntü eski tahtadan başlayıp taş taş ilerler.
  const shown = Array.from(before);
  const hand = colors[start].splice(0);
  shown[start] = 0;
  setCounts(shown); renderCell(start);
  const gap = reduced ? 0 : Math.max(70, Math.min(170, 1400 / r.path.length));
  for (let m = 0; m < r.path.length; m++) {
    const cell = r.path[m];
    colors[cell].push(hand[m]); shown[cell]++;
    renderCell(cell); drop(cell); clack(0.6 + Math.random() * 0.3);
    if (gap) await wait(gap);
  }
  if (r.rule) {
    const msg = { hazine: 'Hazineye düştü: bir daha oynanır.', cift: `Çift yaptı: ${r.took} taş hazineye.`, bos: `Boş kuyu: ${r.took} taş hazineye.` }[r.rule];
    say(`${names()[p]}: ${msg}`);
    for (const f of r.from) cells[f].el.classList.add('alinan');
    if (!reduced) await wait(420);
    for (const f of r.from) { colors[store(p)].push(...colors[f].splice(0)); cells[f].el.classList.remove('alinan'); renderCell(f); }
    renderCell(store(p)); if (r.from.length) clack(1, 3);
  }
  if (r.sweep) {
    if (!reduced) await wait(400);
    for (const cell of r.sweep.cells) { colors[store(r.sweep.to)].push(...colors[cell].splice(0)); renderCell(cell); }
    renderCell(store(r.sweep.to)); clack(1, 4);
  }
  over = r.over;
  if (!r.again) turn = 1 - turn;
  busy = false;
  render();
  if (over) {
    const w = winner(board);
    say(ui.turn.textContent + (r.sweep && r.sweep.total ? `. Taşları biten taraf kalan ${r.sweep.total} taşı aldı.` : '.'), true);
    return;
  }
  if (!r.rule && isHuman(turn)) say(`${names()[p]} oynadı. ${ui.turn.textContent}.`);
  if (!isHuman(turn)) thinkSoon();
  else focusTurn();
}
function setCounts(shown) { for (let i = 0; i < 14; i++) cells[i].count.textContent = shown[i]; }
function drop(cell) {
  const el = cells[cell].el;
  el.classList.remove('dus'); void el.offsetWidth; el.classList.add('dus');
}
function thinkSoon() {
  busy = true; render();
  clearTimeout(aiTimer);
  aiTimer = setTimeout(() => {
    const k = choose(board, turn, state.level);
    busy = false;
    if (k >= 0) move(k);
  }, reduced ? 200 : state.level === 'z' ? 380 : 650);
}
function focusTurn() {
  const active = document.activeElement;
  if (active && active.classList?.contains('kuyu') && !active.disabled) return;
  if (active && active.closest?.('.tahta')) {
    const first = cells.find((c) => !c.el.disabled && c.el.tagName === 'BUTTON');
    first?.el.focus();
  }
}

// ------------------------------------------------------------------ önizleme
function preview(i) {
  clearPreview();
  if (busy || over) return;
  const p = side(i);
  if (p !== turn || !isHuman(p) || board[i] <= 0) return;
  const k = p === 0 ? i : i - 7;
  const c = Int8Array.from(board);
  const r = play(c, p, k);
  const counts = new Map();
  for (const cell of r.path) counts.set(cell, (counts.get(cell) || 0) + 1);
  for (const [cell, n] of counts) { cells[cell].el.classList.add('yol'); cells[cell].plus.textContent = `+${n}`; }
  cells[r.last].el.classList.add('son');
  cells[i].el.classList.add('secili');
  const opp = names()[1 - p].toLowerCase();
  const text = r.over ? 'Bu hamleyle bir taraf boşalır, oyun biter.'
    : r.rule === 'hazine' ? 'Son taş hazineye düşer: bir daha oynarsın.'
    : r.rule === 'cift' ? `Son taş ${state.mode === 'b' ? 'rakibin' : opp + 'nun'} kuyusunu çift yapar: ${r.took} taş senin.`
    : r.rule === 'bos' ? `Son taş boş kuyuna düşer, karşısı dolu: ${r.took} taş senin.`
    : `${board[i]} taş ${counts.size} kuyuya dağılır.`;
  ui.hint.textContent = text;
  ui.hint.classList.toggle('iyi', !!r.rule);
}
function clearPreview() {
  for (const c of cells) { c.el.classList.remove('yol', 'son', 'secili'); c.plus.textContent = ''; }
  ui.hint.textContent = ' '; ui.hint.classList.remove('iyi');
}

// ------------------------------------------------------------------ ses: tahta üstünde taş tıkırtısı
let ac = null;
function audio() {
  if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A(); }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function clack(v = 1, n = 1) {
  if (!ui.sound.checked) return;
  const a = audio(); if (!a) return;
  for (let k = 0; k < n; k++) {
    const t = a.currentTime + k * 0.05 + Math.random() * 0.02;
    const len = Math.floor(a.sampleRate * 0.05);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.12));
    const src = a.createBufferSource(); src.buffer = buf;
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200 + Math.random() * 1400; bp.Q.value = 3;
    const g = a.createGain(); g.gain.value = 0.35 * v;
    const o = a.createOscillator(); o.frequency.value = 900 + Math.random() * 500;
    const og = a.createGain(); og.gain.setValueAtTime(0.08 * v, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    src.connect(bp).connect(g).connect(a.destination); o.connect(og).connect(a.destination);
    src.start(t); o.start(t); o.stop(t + 0.07);
  }
}

// ------------------------------------------------------------------ etkileşim
boardEl.addEventListener('click', (e) => {
  const el = e.target.closest('.kuyu');
  if (!el || el.disabled) return;
  audio();
  const i = +el.dataset.i;
  move(side(i) === 0 ? i : i - 7);
});
boardEl.addEventListener('pointerover', (e) => { const el = e.target.closest('.kuyu'); if (el) preview(+el.dataset.i); });
boardEl.addEventListener('pointerleave', clearPreview);
boardEl.addEventListener('focusin', (e) => { const el = e.target.closest('.kuyu'); if (el) preview(+el.dataset.i); });
boardEl.addEventListener('focusout', (e) => { if (!boardEl.contains(e.relatedTarget)) clearPreview(); });
// Oklar sıradaki oyuncunun kuyuları arasında gezdirir; 1–6 doğrudan oynar.
boardEl.addEventListener('keydown', (e) => {
  const el = e.target.closest('.kuyu');
  if (!el) return;
  const i = +el.dataset.i;
  const p = side(i);
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault();
    const forward = e.key === 'ArrowRight' || e.key === 'ArrowUp';
    const k = (p === 0 ? i : i - 7);
    for (let s = 1; s <= PITS; s++) {
      const nk = (k + (forward ? s : PITS - s)) % PITS;
      const t = cells[pitIndex(p, nk)].el;
      if (!t.disabled) { t.focus(); break; }
    }
  }
});
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || ui.dialog.open) return;
  const t = e.target;
  if (t instanceof HTMLInputElement && t.type === 'text') return;
  if (/^[1-6]$/.test(e.key) && isHuman(turn) && !busy && !over) {
    const k = +e.key - 1;
    if (board[pitIndex(turn, k)] > 0) { e.preventDefault(); audio(); move(k); }
  }
});

function restart(say_ = true) {
  clearTimeout(aiTimer); busy = false;
  state.moves = []; rebuild(); clearPreview(); render(); saveHash();
  if (say_) say(state.mode === 'b' ? (turn === 0 ? 'Yeni oyun. İlk hamle senin.' : 'Yeni oyun. Rakip başlıyor.') : 'Yeni oyun. 1. oyuncu başlar.');
  if (!isHuman(turn)) thinkSoon();
}
ui.fresh.addEventListener('click', () => restart());
ui.undo.addEventListener('click', () => {
  if (busy || !state.moves.length) return;
  clearTimeout(aiTimer);
  if (state.mode === 'b') {
    // Kendi son hamlene kadar geri al (rakibin cevapları da geri gider).
    while (state.moves.length) { state.moves.pop(); const who = movers.pop(); if (who === 0) break; }
  } else { state.moves.pop(); movers.pop(); }
  rebuild(); clearPreview(); render(); saveHash();
  say('Hamle geri alındı.');
  if (!isHuman(turn) && !over) thinkSoon();
});
for (const r of ui.mode) r.addEventListener('change', () => { state.mode = r.value; restart(); });
for (const r of ui.level) r.addEventListener('change', () => { state.level = r.value; saveHash(); render(); say({ k: 'Kolay rakip', o: 'Orta rakip', z: 'Zor rakip' }[r.value]); if (!isHuman(turn) && !busy && !over) thinkSoon(); });
ui.starter.addEventListener('change', () => { state.starter = ui.starter.checked ? 1 : 0; restart(); });
ui.rules.addEventListener('click', () => ui.dialog.showModal());
ui.dialog.addEventListener('click', (e) => { if (e.target === ui.dialog) ui.dialog.close(); });

ui.share.addEventListener('click', async () => {
  const url = `${location.href.split('#')[0]}#${encode(state)}`;
  ui.shareLink.value = url;
  try { await navigator.clipboard.writeText(url); ui.shareBox.hidden = true; say('Bağlantı kopyalandı. Açan kişi oyunu bu konumdan sürdürür.', true); return; } catch { /* pano kapalı */ }
  ui.shareBox.hidden = false; ui.shareLink.focus(); ui.shareLink.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  say(ok ? 'Bağlantı kopyalandı.' : 'Pano erişimi kapalı; bağlantı seçildi, elle kopyalayabilirsin.', true);
});

let sayTimer = 0;
function say(text, keep = false) {
  ui.status.textContent = text;
  clearTimeout(sayTimer);
  if (!keep) sayTimer = setTimeout(() => { if (ui.status.textContent === text) ui.status.textContent = ''; }, 5000);
}

// ------------------------------------------------------------------ adres: mod, zorluk, başlayan, hamleler
// Örnek: #bo0.3416 → bilgisayara karşı, orta, ilk sen; hamleler 3, 4, 1, 6 (kuyu sırası 1–6).
function encode(s) { return `${s.mode}${s.level}${s.starter}.${s.moves.map((k) => k + 1).join('')}`; }
function decode(text) {
  const m = /^([bi])([koz])([01])\.([1-6]{0,400})$/.exec(text);
  if (!m) return null;
  return { mode: m[1], level: m[2], starter: +m[3], moves: [...m[4]].map((c) => +c - 1) };
}
let hashTimer = 0;
const history_ = window.history;
function saveHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const h = `#${encode(state)}`;
    if (location.hash === h) return;
    try { history_.replaceState(null, '', h); } catch { try { location.replace(h); } catch { /* adres değiştirilemiyor */ } }
  }, 300);
}

// ------------------------------------------------------------------ başlangıç
buildBoard();
const fromHash = location.hash.length > 1 ? decode(decodeURIComponent(location.hash.slice(1))) : null;
if (fromHash) state = fromHash;
else if (location.hash.length > 1) say('Bağlantıdaki oyun okunamadı; yeni oyun açıldı.', true);
if (rebuild()) say('Bağlantıdaki hamlelerin bir kısmı kurallara uymuyordu; geçerli kısma kadar kuruldu.', true);
clearPreview();
render();
new ResizeObserver(() => { for (let i = 0; i < 14; i++) renderCell(i); }).observe(boardEl);
if (!isHuman(turn) && !over) thinkSoon();

// Test ve ölçüm için salt okunur durum
window.mangala = Object.freeze({
  stats: () => ({ ...state, moves: state.moves.join(''), board: Array.from(board), turn, over, busy, search: { ...searchStats } }),
  hash: () => encode(state),
  play: (k) => move(k),
});
