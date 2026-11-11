// İki geçişli WebGL2 çizici.
// 1) Göz geçişi: her karakter hücresi için bir piksel; göz prosedürel hesaplanır
//    (kapaklar, göz küresi, bakış dönüşü, iris dokusu, kornea yansımaları).
// 2) Karakter geçişi: her hücreye o hücrenin rengi ve parlaklığıyla bir 0 ya da 1
//    çizilir; karanlık hücreler seyrekleşir. Altında çok hafif bir ışık katmanı vardır.

const QUAD_VS = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const EYE_FS = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uCellPx;   // hücre boyutu (cihaz pikseli)
uniform vec2 uCenter;   // göz merkezi (cihaz pikseli, y yukarı)
uniform float uScale;   // göz birimi başına piksel
uniform vec2 uGaze;     // yaw, pitch (radyan)
uniform float uOpen;    // kapak açıklığı 0–1
uniform float uPupil;   // pupilla / iris oranı
uniform float uTime;    // yavaş canlılık zamanı
out vec4 frag;

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * noise3(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}

const float BALL = 1.05;          // göz küresi yarıçapı (göz birimi)
const float IRIS_ANGLE = 0.36;    // iris açısal yarıçapı (radyan)
const vec3 LIGHT = vec3(-0.45, 0.55, 0.9);

// Kapak eğrileri: x ∈ [-1, 1]; iç köşe solda. Kapanınca iki kapak aynı çizgide buluşur.
void lids(float x, out float yU, out float yL) {
  float t = clamp(x, -1.0, 1.0);
  float b = max(1.0 - t * t, 0.0);
  float upperOpen = 0.40 * pow(b, 0.72) * (1.0 + 0.14 * t) - 0.02;
  float lowerOpen = -0.25 * pow(b, 0.9) * (1.0 - 0.1 * t) - 0.02;
  float closed = -0.085 * pow(b, 0.9) - 0.02;
  yU = mix(closed, upperOpen, uOpen);
  yL = mix(closed, lowerOpen, smoothstep(0.0, 0.35, uOpen)); // alt kapak az hareket eder
}

vec3 irisColor(float r, float phi, float lum) {
  vec2 ang = vec2(cos(phi), sin(phi));
  // Organik, çok katmanlı lifler: açısal yönde sık, radyal yönde gergin
  // Radyal yönde gerilmiş gürültü: lifler merkezden dışa uzanır, aralarında ince boşluklar
  float f1 = fbm3(vec3(ang * 9.0, r * 1.1));
  float f2 = fbm3(vec3(ang * 26.0, r * 1.6 + 3.0));
  float f3 = noise3(vec3(ang * 60.0, r * 2.4 + uTime * 0.02));
  float fib = f1 * 0.45 + f2 * 0.4 + f3 * 0.25;
  float rc = 0.42 + 0.035 * sin(phi * 7.0 + 1.3) + 0.03 * (fbm3(vec3(ang * 3.0, 1.7)) - 0.5);

  vec3 gold = vec3(0.86, 0.62, 0.27);
  vec3 amber = vec3(0.70, 0.40, 0.15);
  vec3 chestnut = vec3(0.42, 0.20, 0.08);
  vec3 umber = vec3(0.16, 0.08, 0.035);

  vec3 inner = mix(amber, gold, smoothstep(0.35, 0.8, fib));
  vec3 outer = mix(umber, chestnut, smoothstep(0.3, 0.75, fib));
  outer = mix(outer, amber * 0.85, smoothstep(0.72, 0.9, f2) * 0.6); // açık lifler
  vec3 col = mix(inner, outer, smoothstep(rc - 0.03, rc + 0.05, r));
  col += gold * 0.28 * exp(-pow((r - rc) / 0.022, 2.0)); // kolaret sırtı

  // Kriptler: orta bölgede düzensiz koyu boşluklar
  float crypt = smoothstep(0.6, 0.7, fbm3(vec3(ang * 4.5, r * 5.0 + 9.0)));
  col *= 1.0 - 0.55 * crypt * smoothstep(0.45, 0.55, r) * smoothstep(0.88, 0.75, r);
  col *= 0.62 + 0.75 * smoothstep(0.25, 0.75, f2 * 0.6 + f3 * 0.4); // lif parlaklığı
  // Altın benekler
  float fleck = smoothstep(0.8, 0.86, noise3(vec3(ang * 30.0, r * 12.0)));
  col = mix(col, gold * 1.1, fleck * 0.5 * smoothstep(0.35, 0.6, r));
  // Pupilla kenarı ve koyu limbal halka
  col *= mix(0.35, 1.0, smoothstep(uPupil, uPupil + 0.05, r));
  col *= mix(1.0, 0.22, smoothstep(0.8, 1.0, r));
  return col * lum;
}

void main() {
  vec2 px = (floor(gl_FragCoord.xy) + 0.5) * uCellPx;
  vec2 p = (px - uCenter) / uScale;
  float yU;
  float yL;
  lids(p.x, yU, yL);
  float edge = 0.006;
  float corner = smoothstep(1.0, 0.95, abs(p.x));
  float inside = smoothstep(-edge, edge, yU - p.y) * smoothstep(-edge, edge, p.y - yL) * corner;

  // Göz çevresi: obsidyen siyahına karışan sıcak koyu deri, kapak kenarı ve kıvrımı
  float distOut = max(p.y - yU, yL - p.y);
  float around = exp(-max(distOut, 0.0) / 0.13) * smoothstep(1.25, 0.75, abs(p.x));
  vec3 skin = vec3(0.24, 0.16, 0.12) * around * 0.55;
  float crease = exp(-pow((p.y - (yU + 0.13 + 0.05 * (1.0 - p.x * p.x))) / 0.018, 2.0)) * smoothstep(1.1, 0.4, abs(p.x));
  skin *= 1.0 - 0.45 * crease;
  float lashLine = exp(-pow((p.y - yU - 0.012) / 0.014, 2.0)) * corner;
  skin *= 1.0 - 0.9 * lashLine;
  skin += vec3(0.30, 0.22, 0.18) * 0.18 * exp(-pow((p.y - yL + 0.02) / 0.015, 2.0)) * corner; // alt kapak kenarı

  // Göz küresi ve bakış dönüşü
  vec2 q = p - vec2(0.0, -0.03);
  float zz = BALL * BALL - dot(q, q);
  vec3 n = vec3(q, sqrt(max(zz, 0.0))) / BALL;
  vec3 g = vec3(sin(uGaze.x) * cos(uGaze.y), sin(uGaze.y), cos(uGaze.x) * cos(uGaze.y));
  vec3 right = normalize(cross(vec3(0, 1, 0), g));
  vec3 up = cross(g, right);
  float theta = acos(clamp(dot(n, g), -1.0, 1.0));
  float r = theta / IRIS_ANGLE;
  float phi = atan(dot(n, up), dot(n, right));

  // Gölgeler: üst kapağın düşürdüğü gölge, küresel ışık
  float lidShadow = mix(0.45, 1.0, smoothstep(0.0, 0.14, yU - p.y)) * mix(0.75, 1.0, smoothstep(0.0, 0.05, p.y - yL));
  float sphere = 0.55 + 0.45 * max(dot(n, normalize(LIGHT)), 0.0);

  vec3 sclera = vec3(0.80, 0.76, 0.70) * sphere * lidShadow;
  sclera *= mix(0.62, 1.0, smoothstep(1.0, 0.55, abs(p.x)));     // köşelere doğru gri
  sclera = mix(sclera, vec3(0.55, 0.38, 0.33) * lidShadow, smoothstep(0.86, 0.97, -p.x) * 0.6); // iç köşe

  vec3 col = sclera;
  float limbus = smoothstep(1.06, 0.97, r);
  vec3 iris = irisColor(r, phi, 1.45 * lidShadow * mix(0.85, 1.0, sphere));
  col = mix(col, iris, limbus);
  float pupil = smoothstep(uPupil + 0.012, uPupil - 0.012, r);
  col = mix(col, vec3(0.015, 0.012, 0.01), pupil);

  // Kornea yansımaları: kornea küresi bakışla döner, ışık sabit kalır
  vec3 corneaC = vec3(0.0, -0.03, 0.0) + g * (BALL - 0.36);
  vec3 h = normalize(normalize(LIGHT) + vec3(0, 0, 1));
  vec2 spot = (corneaC + h * 0.3).xy;
  vec2 d = (p - spot) / vec2(0.055, 0.04);
  float window = exp(-pow(dot(d * d, d * d), 0.5) * 1.6);
  vec2 spot2 = (corneaC + normalize(vec3(0.55, -0.25, 1.0)) * 0.42).xy;
  float dot2 = exp(-dot(p - spot2, p - spot2) / 0.0004) * 0.35;
  float onCornea = smoothstep(1.25, 1.0, r);
  col += vec3(0.95, 0.93, 0.88) * (window * 1.1 + dot2) * onCornea * lidShadow;
  col += vec3(0.6, 0.55, 0.5) * 0.12 * exp(-pow((p.y - yL - 0.014) / 0.006, 2.0)) * corner; // ıslak çizgi

  vec3 outCol = mix(skin, col, inside);
  float lum = dot(outCol, vec3(0.3, 0.55, 0.15));
  // Yoğunluk: iriste karakterler hep yerinde dursun, doku renk ve parlaklıkla okunsun
  float density = max(lum, inside * limbus * (1.0 - pupil) * 0.32);
  frag = vec4(outCol, density);
}`;

const GLYPH_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uEye;
uniform sampler2D uAtlas;
uniform vec2 uCellPx;
uniform vec2 uCells;
uniform float uTime;
out vec4 frag;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 cellF = gl_FragCoord.xy / uCellPx;
  vec2 cell = floor(cellF);
  vec2 local = fract(cellF);
  vec4 e = texelFetch(uEye, ivec2(cell), 0);
  float h = hash(cell);
  // Karanlıkta seyrek, aydınlıkta yoğun
  float keep = step(h, smoothstep(0.035, 0.22, e.a));
  // Karakter kimliği hücreye bağlı; yalnızca %0.6'sı yavaşça ve yerel olarak değişir
  float g = step(0.5, hash(cell + 7.13));
  g = mod(g + step(0.994, hash(cell + 3.31)) * floor(uTime * 0.12 + h * 40.0), 2.0);
  float a = texture(uAtlas, vec2((g + local.x) * 0.5, 1.0 - local.y)).r;
  vec3 glyph = e.rgb * 1.8 * a * keep;
  // Okunurluğa yardımcı çok hafif ışık katmanı
  vec3 under = texture(uEye, cellF / uCells).rgb * 0.09;
  frag = vec4(glyph + under, 1.0);
}`;

function compile(gl, fs) {
  const prog = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, QUAD_VS], [gl.FRAGMENT_SHADER, fs]]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    gl.attachShader(prog, sh);
    gl.deleteShader(sh);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const u = {};
  const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const { name } = gl.getActiveUniform(prog, i);
    u[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, u };
}

function createAtlas(gl) {
  const w = 40;
  const h = 64;
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 52px ui-monospace, "SFMono-Regular", "DejaVu Sans Mono", Menlo, Consolas, monospace';
  ctx.fillText('0', w / 2, h / 2 + 2);
  ctx.fillText('1', w * 1.5, h / 2 + 2);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ dprCap: number, cellCss: [number, number], onLost: () => void }} options
 */
export function createEyeRenderer(canvas, { dprCap, cellCss, onLost }) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false });
  if (!gl) throw new Error('WebGL2 kullanılamıyor');
  const eyeProg = compile(gl, EYE_FS);
  const glyphProg = compile(gl, GLYPH_FS);
  const atlas = createAtlas(gl);
  const vao = gl.createVertexArray();
  const eyeTex = gl.createTexture();
  const eyeFbo = gl.createFramebuffer();
  let size = { w: 0, h: 0, cols: 0, rows: 0, cellW: 0, cellH: 0, dpr: 1 };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (w === size.w && h === size.h) return false;
    canvas.width = w;
    canvas.height = h;
    const cellW = Math.max(3, Math.round(cellCss[0] * dpr));
    const cellH = Math.max(5, Math.round(cellCss[1] * dpr));
    const cols = Math.ceil(w / cellW);
    const rows = Math.ceil(h / cellH);
    gl.bindTexture(gl.TEXTURE_2D, eyeTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, eyeFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, eyeTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    size = { w, h, cols, rows, cellW, cellH, dpr };
    return true;
  }

  /** Göz yerleşimi: masaüstünde genişliğin ~%90'ı; dar ekranda iris büyük kalır, uçlar taşabilir. */
  function layout() {
    const { w, h } = size;
    const aspect = w / h;
    const fitWidth = (0.9 * w) / 2;
    const irisFrac = aspect < 1 ? 0.74 : 0.5;
    const irisFit = (irisFrac * Math.min(w, h)) / 0.74;
    const scale = Math.min(Math.max(fitWidth, irisFit), (0.82 * h) / 0.66);
    return { scale, center: [w / 2, h * (aspect < 1 ? 0.55 : 0.53)] };
  }

  function draw({ gaze, open, pupil, time }) {
    const { w, h, cols, rows, cellW, cellH } = size;
    const { scale, center } = layout();
    gl.bindVertexArray(vao);

    gl.bindFramebuffer(gl.FRAMEBUFFER, eyeFbo);
    gl.viewport(0, 0, cols, rows);
    gl.useProgram(eyeProg.prog);
    gl.uniform2f(eyeProg.u.uCellPx, cellW, cellH);
    gl.uniform2f(eyeProg.u.uCenter, center[0], center[1]);
    gl.uniform1f(eyeProg.u.uScale, scale);
    gl.uniform2f(eyeProg.u.uGaze, gaze[0], gaze[1]);
    gl.uniform1f(eyeProg.u.uOpen, open);
    gl.uniform1f(eyeProg.u.uPupil, pupil);
    gl.uniform1f(eyeProg.u.uTime, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(glyphProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, eyeTex);
    gl.uniform1i(glyphProg.u.uEye, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, atlas);
    gl.uniform1i(glyphProg.u.uAtlas, 1);
    gl.uniform2f(glyphProg.u.uCellPx, cellW, cellH);
    gl.uniform2f(glyphProg.u.uCells, cols, rows);
    gl.uniform1f(glyphProg.u.uTime, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** İmleci göz merkezine göre normalize etmek için yerleşim (CSS pikseli). */
  function eyeBox() {
    const { scale, center } = layout();
    const dpr = size.dpr || 1;
    return { cx: center[0] / dpr, cy: (size.h - center[1]) / dpr, unit: scale / dpr };
  }

  const handleLost = (e) => {
    e.preventDefault();
    onLost?.();
  };
  canvas.addEventListener('webglcontextlost', handleLost);
  resize();

  return {
    resize,
    draw,
    eyeBox,
    stats: () => ({ cols: size.cols, rows: size.rows, cells: size.cols * size.rows, dpr: size.dpr }),
    dispose() {
      canvas.removeEventListener('webglcontextlost', handleLost);
      gl.deleteFramebuffer(eyeFbo);
      gl.deleteTexture(eyeTex);
      gl.deleteTexture(atlas);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(eyeProg.prog);
      gl.deleteProgram(glyphProg.prog);
    },
  };
}
