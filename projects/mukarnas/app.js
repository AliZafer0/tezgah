// Mukarnas — kat kat sarkan kubbe üreteci. WebGL ile çizilir; sürükleyerek etrafında dön,
// "Alttan bak" ile tam ortadan yukarı bak. Işık, ortada sallanan bir kandilden gelir.
import { build, SHAPES } from './geometri.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#kubbe');
const ui = {
  tiers: $('#kat'), tiersOut: $('#kat-out'), cells: [...document.querySelectorAll('input[name="hucre"]')],
  shape: [...document.querySelectorAll('input[name="bicim"]')], mat: [...document.querySelectorAll('input[name="malzeme"]')],
  depth: $('#derinlik'), depthOut: $('#derinlik-out'), spin: $('#don'),
  under: $('#alttan'), png: $('#png'), share: $('#share'), shareBox: $('#sharebox'), shareLink: $('#share-link'),
  status: $('#status'), info: $('#bilgi'),
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MATS = {
  a: { name: 'Alçı', niche: [0.94, 0.91, 0.86], fill: [0.88, 0.84, 0.77], edge: [0.78, 0.71, 0.6], cap: [0.86, 0.8, 0.7], star: [0.74, 0.62, 0.45], drum: [0.9, 0.86, 0.79], spec: 0.08, shin: 12 },
  g: { name: 'Altın', niche: [0.86, 0.66, 0.28], fill: [0.55, 0.38, 0.14], edge: [1.0, 0.88, 0.55], cap: [0.12, 0.22, 0.5], star: [0.98, 0.8, 0.4], drum: [0.36, 0.24, 0.12], spec: 0.9, shin: 40 },
  c: { name: 'Çini', niche: [0.16, 0.6, 0.6], fill: [0.1, 0.22, 0.52], edge: [0.96, 0.92, 0.8], cap: [0.1, 0.2, 0.5], star: [0.98, 0.95, 0.86], drum: [0.12, 0.3, 0.5], spec: 0.55, shin: 60 },
};
const CELL_STEPS = [8, 12, 16, 24, 32];

let state = { tiers: 6, cells: 16, shape: 'k', mat: 'g', depth: 5 };
const view = { yaw: 0.4, pitch: Math.PI / 2, dist: 2.9, spin: !reduced };

// ------------------------------------------------------------------ WebGL
const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
if (!gl) {
  document.body.classList.add('no-gl');
  $('#gl-yok').hidden = false;
}
const uintOk = gl && !!gl.getExtension('OES_element_index_uint');
const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec2 aUv; attribute float aKind;
uniform mat4 uMvp; varying vec3 vPos; varying vec3 vNor; varying vec2 vUv; varying float vKind;
void main() { vPos = aPos; vNor = aNor; vUv = aUv; vKind = aKind; gl_Position = uMvp * vec4(aPos, 1.0); }`;
const FS = `
precision highp float;
varying vec3 vPos; varying vec3 vNor; varying vec2 vUv; varying float vKind;
uniform vec3 uEye; uniform vec3 uLamp; uniform float uCells;
uniform vec3 uNiche; uniform vec3 uFill; uniform vec3 uEdge; uniform vec3 uCap; uniform vec3 uStar; uniform vec3 uDrum;
uniform float uSpec; uniform float uShin; uniform float uH;
void main() {
  vec3 N = normalize(vNor);
  vec3 base; float edge = 0.0; float ao = 1.0; float glow = 0.0;
  if (vKind < 0.5) {
    base = uNiche;
    float e = min(min(vUv.x, 1.0 - vUv.x) * 1.6, vUv.y);
    edge = 1.0 - smoothstep(0.03, 0.075, e);
    ao = 1.0 - 0.42 * sin(3.14159 * vUv.x) * smoothstep(0.1, 0.95, vUv.y); // nişin başlığı gölgede
  } else if (vKind < 1.5) {
    base = uFill;
    edge = 1.0 - smoothstep(0.02, 0.06, vUv.y);
    ao = 0.92;
  } else if (vKind < 2.5) {
    // Şemse: n kollu yıldız
    float a = atan(vPos.z, vPos.x);
    float r = length(vPos.xz) / 0.13;
    float k = abs(fract(a * uCells / 6.28318) - 0.5) * 2.0;
    float star = step(r, 0.35 + 0.6 * (1.0 - k));
    base = mix(uCap, uStar, star);
    edge = 1.0 - smoothstep(0.86, 0.94, r) * (1.0 - smoothstep(0.96, 1.0, r));
    edge = max(edge * 0.0, smoothstep(0.9, 1.0, r));
  } else {
    // Kasnak: hücre başına kemerli pencereler
    base = uDrum;
    float x = fract(vUv.x * uCells) - 0.5;
    float y = vUv.y;
    float arch = (y < 0.7) ? step(abs(x), 0.2) : step(length(vec2(x, (y - 0.7) * 1.2)), 0.2);
    float win = arch * step(0.18, y) * step(y, 0.92);
    glow = win;
    edge = (1.0 - smoothstep(0.0, 0.04, abs(abs(x) - 0.24))) * step(0.15, y) * step(y, 0.95);
  }
  vec3 col = mix(base, uEdge, edge * 0.85);
  // Kandil: noktasal ışık, uzaklıkla sönümlenir; üstten zayıf bir gök ışığı
  vec3 L = uLamp - vPos; float d = length(L); L /= d;
  float diff = max(dot(N, L), 0.0);
  float att = 1.0 / (1.0 + 0.35 * d * d);
  vec3 V = normalize(uEye - vPos);
  vec3 Hh = normalize(L + V);
  float spec = pow(max(dot(N, Hh), 0.0), uShin) * uSpec * att;
  float sky = 0.18 + 0.12 * max(dot(N, vec3(0.0, -1.0, 0.0)), 0.0);
  float height = clamp(vPos.y / uH, 0.0, 1.0);
  vec3 lit = col * (sky + 1.35 * diff * att) * ao * (1.0 - 0.18 * height) + spec * mix(vec3(1.0), uEdge, 0.5);
  lit = mix(lit, vec3(1.0, 0.86, 0.6) * 1.15, glow * 0.85);
  gl_FragColor = vec4(pow(lit, vec3(0.92)), 1.0);
}`;
let prog = null; let loc = {}; let vbo = null; let ibo = null; let count = 0; let geo = null;
function compile() {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  for (const n of ['aPos', 'aNor', 'aUv', 'aKind']) loc[n] = gl.getAttribLocation(prog, n);
  for (const n of ['uMvp', 'uEye', 'uLamp', 'uCells', 'uNiche', 'uFill', 'uEdge', 'uCap', 'uStar', 'uDrum', 'uSpec', 'uShin', 'uH']) loc[n] = gl.getUniformLocation(prog, n);
  vbo = gl.createBuffer(); ibo = gl.createBuffer();
  gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
}
let buildMs = 0;
function rebuild() {
  if (!gl) return;
  const t0 = performance.now();
  let s = { ...state };
  geo = build(s);
  if (geo.idx instanceof Uint32Array && !uintOk) { s = { ...s, cells: Math.min(s.cells, 16) }; geo = build(s); }
  buildMs = performance.now() - t0;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, geo.verts, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.idx, gl.STATIC_DRAW);
  count = geo.idx.length;
  const st = 36;
  gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, st, 0); gl.enableVertexAttribArray(loc.aPos);
  gl.vertexAttribPointer(loc.aNor, 3, gl.FLOAT, false, st, 12); gl.enableVertexAttribArray(loc.aNor);
  gl.vertexAttribPointer(loc.aUv, 2, gl.FLOAT, false, st, 24); gl.enableVertexAttribArray(loc.aUv);
  gl.vertexAttribPointer(loc.aKind, 1, gl.FLOAT, false, st, 32); gl.enableVertexAttribArray(loc.aKind);
  ui.info.textContent = `${state.tiers} kat × ${state.cells} hücre · ${Math.round(count / 3).toLocaleString('tr-TR')} üçgen`;
  request();
}

// ------------------------------------------------------------------ matris
const perspective = (fov, asp, n, f) => { const t = 1 / Math.tan(fov / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]; };
function lookAt(e, c, up) {
  let z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]]; let l = Math.hypot(...z); z = z.map((x) => x / l);
  let x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]]; l = Math.hypot(...x); x = x.map((v) => v / l);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1];
}
function mul(a, b) { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }

// ------------------------------------------------------------------ çizim
let raf = 0; let last = 0; let t = 0; let dirty = true;
function request() { dirty = true; if (!raf) raf = requestAnimationFrame(frame); }
function frame(now) {
  raf = 0;
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
  last = now;
  const moving = view.spin && !dragging;
  if (moving) { view.yaw += dt * 0.12; t += dt; }
  if (dirty || moving) draw();
  dirty = false;
  if (moving) raf = requestAnimationFrame(frame); else last = 0;
}
function draw() {
  if (!gl || !geo) return;
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.round(r.width * dpr); const h = Math.round(r.height * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  gl.viewport(0, 0, w, h);
  gl.clearColor(0.05, 0.035, 0.03, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  // Kamera: hedefin altında bir küre üstünde. pitch = 90° tam alttan bakış.
  const target = [0, geo.H * 0.45, 0];
  const cp = Math.cos(view.pitch); const sp = Math.sin(view.pitch);
  const eye = [target[0] + view.dist * cp * Math.sin(view.yaw), target[1] - view.dist * sp, target[2] + view.dist * cp * Math.cos(view.yaw)];
  const up = view.pitch > 1.45 ? [Math.sin(view.yaw), 0, Math.cos(view.yaw)] : [0, 1, 0];
  const asp = w / h;
  const fov = asp < 1 ? 1.25 : 1.0;
  const proj = perspective(fov, asp, 0.02, 20);
  // Dar ekranda panel altta: kubbe görünen alanın ortasına kaydırılır.
  const panelEl = document.querySelector('.panel');
  const pTop = panelEl.getBoundingClientRect().top;
  if (matchMedia('(max-width: 760px), (max-aspect-ratio: 4/5)').matches && pTop > 0 && pTop < r.height) proj[9] = -((r.height - pTop) / r.height);
  const mvp = mul(proj, lookAt(eye, target, up));
  gl.useProgram(prog);
  gl.uniformMatrix4fv(loc.uMvp, false, new Float32Array(mvp));
  gl.uniform3fv(loc.uEye, eye);
  // Kandil kubbenin ortasında, hafifçe sallanır
  const sw = reduced ? 0 : 0.08;
  gl.uniform3fv(loc.uLamp, [Math.sin(t * 0.9) * sw, -0.15, Math.cos(t * 0.7) * sw]);
  gl.uniform1f(loc.uCells, state.cells);
  gl.uniform1f(loc.uH, geo.H);
  const m = MATS[state.mat];
  gl.uniform3fv(loc.uNiche, m.niche); gl.uniform3fv(loc.uFill, m.fill); gl.uniform3fv(loc.uEdge, m.edge);
  gl.uniform3fv(loc.uCap, m.cap); gl.uniform3fv(loc.uStar, m.star); gl.uniform3fv(loc.uDrum, m.drum);
  gl.uniform1f(loc.uSpec, m.spec); gl.uniform1f(loc.uShin, m.shin);
  // Dışarıdan bakarken yakın duvar arka yüzü olduğu için çizilmez: kubbe kesit gibi görünür.
  gl.cullFace(gl.FRONT);
  gl.frontFace(gl.CCW);
  gl.drawElements(gl.TRIANGLES, count, geo.idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
}

// ------------------------------------------------------------------ etkileşim: sürükle, kaydır, klavye
let dragging = false; let px = 0; let py = 0; const pointers = new Map(); let pinch = 0;
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); dragging = true; px = e.clientX; py = e.clientY; if (pointers.size === 2) pinch = spread(); });
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 2) { const s = spread(); if (pinch) zoom(pinch / s); pinch = s; return; }
  const dx = e.clientX - px; const dy = e.clientY - py; px = e.clientX; py = e.clientY;
  view.yaw -= dx * 0.008; tilt(view.pitch - dy * 0.006);
  request();
});
const up_ = (e) => { pointers.delete(e.pointerId); if (!pointers.size) { dragging = false; pinch = 0; saveHash(); request(); } };
canvas.addEventListener('pointerup', up_); canvas.addEventListener('pointercancel', up_);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.001)); }, { passive: false });
function spread() { const [a, b] = [...pointers.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); }
function zoom(k) { view.dist = Math.max(0.9, Math.min(4.2, view.dist * k)); request(); }
function tilt(p) { view.pitch = Math.max(0.3, Math.min(Math.PI / 2, p)); }
canvas.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); view.yaw += (k === 'ArrowLeft' ? 1 : -1) * 0.12; }
  else if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); tilt(view.pitch + (k === 'ArrowUp' ? 1 : -1) * 0.1); say(view.pitch > 1.5 ? 'Tam alttan bakış' : `Eğim ${Math.round((view.pitch * 180) / Math.PI)}°`); }
  else if (k === '+' || k === '=') zoom(0.9);
  else if (k === '-') zoom(1.1);
  else return;
  request();
});

// ------------------------------------------------------------------ panel
ui.tiers.addEventListener('input', () => { state.tiers = +ui.tiers.value; changed(); });
ui.depth.addEventListener('input', () => { state.depth = +ui.depth.value; changed(); });
for (const r of ui.cells) r.addEventListener('change', () => { state.cells = +r.value; changed(); say(`${state.cells} hücre`); });
for (const r of ui.shape) r.addEventListener('change', () => { state.shape = r.value; changed(); say(`${SHAPES[r.value].name} hücre`); });
for (const r of ui.mat) r.addEventListener('change', () => { state.mat = r.value; syncUi(); saveHash(); request(); say(MATS[r.value].name); });
ui.spin.addEventListener('change', () => { view.spin = ui.spin.checked; request(); });
ui.under.addEventListener('click', () => { view.pitch = Math.PI / 2; view.dist = 2.9; request(); say('Tam ortadan yukarı bakıyorsun.'); });
ui.png.addEventListener('click', () => {
  draw();
  canvas.toBlob((b) => {
    if (!b) { say('Resim oluşturulamadı.', true); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `mukarnas-${encode(state)}.png`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    say('Resim indirildi.');
  }, 'image/png');
});
function changed() { syncUi(); saveHash(); rebuild(); }
function syncUi() {
  ui.tiers.value = state.tiers; ui.tiersOut.value = state.tiers;
  ui.depth.value = state.depth; ui.depthOut.value = state.depth;
  for (const r of ui.cells) r.checked = +r.value === state.cells;
  for (const r of ui.shape) r.checked = r.value === state.shape;
  for (const r of ui.mat) r.checked = r.value === state.mat;
  ui.spin.checked = view.spin;
  canvas.setAttribute('aria-label', `Mukarnas kubbe: ${state.tiers} kat, katta ${state.cells} ${SHAPES[state.shape].name.toLowerCase()} hücre, ${MATS[state.mat].name.toLowerCase()} kaplama. Sürükleyerek çevir.`);
}

ui.share.addEventListener('click', async () => {
  const url = `${location.href.split('#')[0]}#${encode(state)}`;
  ui.shareLink.value = url;
  try { await navigator.clipboard.writeText(url); ui.shareBox.hidden = true; say('Bağlantı kopyalandı. Açan kişi aynı kubbeyi görür.', true); return; } catch { /* pano kapalı */ }
  ui.shareBox.hidden = false; ui.shareLink.focus(); ui.shareLink.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  say(ok ? 'Bağlantı kopyalandı.' : 'Pano erişimi kapalı; bağlantı seçildi, elle kopyalayabilirsin.', true);
});
let sayTimer = 0;
function say(text, keep = false) {
  ui.status.textContent = text;
  clearTimeout(sayTimer);
  if (!keep) sayTimer = setTimeout(() => { if (ui.status.textContent === text) ui.status.textContent = ''; }, 4000);
}

// ------------------------------------------------------------------ adres: kat.hücre.biçim.malzeme.derinlik
function encode(s) { return [s.tiers, s.cells, s.shape, s.mat, s.depth].join('.'); }
function decode(text) {
  const m = /^([3-9])\.(\d{1,2})\.([kbp])\.([agc])\.(\d)$/.exec(text);
  if (!m || !CELL_STEPS.includes(+m[2])) return null;
  return { tiers: +m[1], cells: +m[2], shape: m[3], mat: m[4], depth: +m[5] };
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
const fromHash = location.hash.length > 1 ? decode(decodeURIComponent(location.hash.slice(1))) : null;
if (fromHash) state = fromHash;
else if (location.hash.length > 1) say('Bağlantıdaki kubbe okunamadı; varsayılan açıldı.', true);
syncUi();
if (gl) { compile(); rebuild(); new ResizeObserver(request).observe(canvas); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) request(); });

// Test ve ölçüm için salt okunur durum
window.mukarnas = Object.freeze({
  stats: () => ({ ...state, gl: !!gl, triangles: Math.round(count / 3), vertices: geo ? geo.verts.length / 9 : 0, buildMs: Math.round(buildMs), view: { ...view } }),
  hash: () => encode(state),
  view: (yaw, pitch, dist) => { Object.assign(view, { yaw, pitch, dist: dist ?? view.dist, spin: false }); ui.spin.checked = false; request(); },
});
