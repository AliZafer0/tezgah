// Saf WebGL2 çizici: ortografik kamera, yumuşak gölge haritası, mat yüzeyler.
// Sahne sabitken yalnızca istendiğinde çizilir.
import { bounds, viewDir } from './levels.js';

const BG = [0.949, 0.929, 0.894]; // sıcak kırık beyaz
const LIGHT_DIR = norm([-0.42, -1, -0.32]); // ışığın gittiği yön

const MAIN_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aColor;
layout(location = 3) in vec2 aSpan; // parçanın alt ve üst y'si (AO)
uniform mat4 uVP;
uniform mat4 uLightVP;
out vec3 vNormal;
out vec3 vColor;
out vec4 vLight;
out float vAO;
void main() {
  vNormal = aNormal;
  vColor = aColor;
  vLight = uLightVP * vec4(aPos, 1.0);
  // Maket hissi: dikey yüzler tabana doğru hafifçe koyulaşır, alt yüzler gölgede
  float h = clamp((aPos.y - aSpan.x) / max(0.6, (aSpan.y - aSpan.x) * 0.35), 0.0, 1.0);
  vAO = aNormal.y < -0.5 ? 0.72 : mix(0.8, 1.0, smoothstep(0.0, 1.0, h));
  gl_Position = uVP * vec4(aPos, 1.0);
}`;

const SHADOW_FN = /* glsl */ `
uniform highp sampler2DShadow uShadow;
uniform vec2 uShadowTexel;
float shadowAt(vec4 lp, float bias) {
  vec3 p = lp.xyz / lp.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float sum = 0.0;
  for (int x = -2; x <= 2; x++) {
    for (int y = -2; y <= 2; y++) {
      sum += texture(uShadow, vec3(p.xy + vec2(x, y) * uShadowTexel * 1.25, p.z - bias));
    }
  }
  return sum / 25.0;
}`;

const MAIN_FS = /* glsl */ `#version 300 es
precision highp float;
uniform vec3 uLightDir;
uniform float uFlat;   // 1: düz lacivert siluet (ipucu)
uniform float uGlow;   // başarı vurgusu 0–1
in vec3 vNormal;
in vec3 vColor;
in vec4 vLight;
in float vAO;
out vec4 frag;
${SHADOW_FN}
void main() {
  if (uFlat > 0.5) { frag = vec4(0.13, 0.17, 0.29, 1.0); return; }
  vec3 n = normalize(vNormal);
  float ndl = max(dot(n, -uLightDir), 0.0);
  float sh = ndl > 0.0 ? shadowAt(vLight, 0.0015 + 0.002 * (1.0 - ndl)) : 0.0;
  float hemi = mix(0.52, 0.74, n.y * 0.5 + 0.5);
  // Parçalar üzerindeki gölge zemindekinden yumuşak: maket hissi, sert lekeler yok
  vec3 col = vColor * (hemi + 0.34 * ndl * mix(0.55, 1.0, sh)) * vAO;
  col = mix(col, vec3(0.92, 0.88, 0.8), 0.04); // havadan gelen ılık yansıma
  col += uGlow * 0.08 * vec3(1.0, 0.82, 0.7);
  frag = vec4(col, 1.0);
}`;

const FLOOR_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec3 aPos;
uniform mat4 uVP;
uniform mat4 uLightVP;
out vec4 vLight;
out vec3 vWorld;
void main() {
  vLight = uLightVP * vec4(aPos, 1.0);
  vWorld = aPos;
  gl_Position = uVP * vec4(aPos, 1.0);
}`;

const FLOOR_FS = /* glsl */ `#version 300 es
precision highp float;
uniform vec3 uBg;
uniform vec3 uCenter;
uniform float uRadius;
in vec4 vLight;
in vec3 vWorld;
out vec4 frag;
${SHADOW_FN}
void main() {
  float sh = shadowAt(vLight, 0.002);
  float fade = 1.0 - smoothstep(uRadius * 0.8, uRadius * 2.2, length(vWorld.xz - uCenter.xz));
  frag = vec4(uBg * (1.0 - 0.2 * (1.0 - sh) * fade), 1.0);
}`;

const SHADOW_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec3 aPos;
uniform mat4 uLightVP;
void main() { gl_Position = uLightVP * vec4(aPos, 1.0); }`;

const SHADOW_FS = /* glsl */ `#version 300 es
precision mediump float;
out vec4 frag;
void main() { frag = vec4(1.0); }`;

// ---------- Matris yardımcıları (sütun öncelikli) ----------
function norm(a) { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function lookAt(eye, target, up = [0, 1, 0]) {
  const z = norm([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  let x = cross(up, z);
  if (Math.hypot(...x) < 1e-6) x = cross([0, 0, 1], z);
  x = norm(x);
  const y = cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
}

function ortho(l, r, b, t, n, f) {
  return [2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1];
}

function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return new Float32Array(o);
}

/** Kutu → 36 köşe; her köşe: konum, normal, renk, AO aralığı. */
function boxVertices(p, out) {
  const [x0, y0, z0] = p.min;
  const [x1, y1, z1] = p.max;
  const faces = [
    [[1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]],
    [[-1, 0, 0], [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]]],
    [[0, 1, 0], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]],
    [[0, -1, 0], [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]]],
    [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
    [[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]],
  ];
  for (const [n, q] of faces) {
    for (const i of [0, 1, 2, 0, 2, 3]) out.push(...q[i], ...n, ...p.color, y0, y1);
  }
}

function compile(gl, vs, fs) {
  const prog = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
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
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const { name } = gl.getActiveUniform(prog, i);
    u[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, u };
}

export function createRenderer(canvas, { dprCap = 2, shadowSize = 2048, onLost } = {}) {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: false });
  if (!gl) throw new Error('WebGL2 kullanılamıyor');

  const mainProg = compile(gl, MAIN_VS, MAIN_FS);
  const floorProg = compile(gl, FLOOR_VS, FLOOR_FS);
  const shadowProg = compile(gl, SHADOW_VS, SHADOW_FS);
  const live = { buffers: 0, vaos: 0, textures: 0, framebuffers: 0 }; // birikim denetimi

  // Gölge haritası
  const shadowTex = gl.createTexture();
  live.textures++;
  gl.bindTexture(gl.TEXTURE_2D, shadowTex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, shadowSize, shadowSize);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const shadowFbo = gl.createFramebuffer();
  live.framebuffers++;
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  let scene = null; // { vao, vbo, count, floorVao, floorVbo, b, lightVP }
  let width = 0;
  let height = 0;

  function buildScene(level) {
    const verts = [];
    for (const p of level.pieces) boxVertices(p, verts);
    const b = bounds(level);
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    live.vaos++; live.buffers++;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const stride = 11 * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);

    const F = b.radius * 6;
    const [cx, , cz] = b.center;
    const fy = b.floorY;
    const floor = new Float32Array([cx - F, fy, cz - F, cx - F, fy, cz + F, cx + F, fy, cz + F, cx - F, fy, cz - F, cx + F, fy, cz + F, cx + F, fy, cz - F]);
    const floorVao = gl.createVertexArray();
    const floorVbo = gl.createBuffer();
    live.vaos++; live.buffers++;
    gl.bindVertexArray(floorVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, floorVbo);
    gl.bufferData(gl.ARRAY_BUFFER, floor, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);

    // Işık kamerası: sahneyi ve gölgenin düştüğü zemini kapsar
    const r = b.radius * 1.6;
    const eye = b.center.map((c, i) => c - LIGHT_DIR[i] * r * 2);
    const lightVP = mul(ortho(-r, r, -r, r, 0.1, r * 5), lookAt(eye, b.center));
    return { vao, vbo, count: verts.length / 11, floorVao, floorVbo, b, lightVP };
  }

  function freeScene(s) {
    if (!s) return;
    gl.deleteBuffer(s.vbo); gl.deleteBuffer(s.floorVbo);
    gl.deleteVertexArray(s.vao); gl.deleteVertexArray(s.floorVao);
    live.vaos -= 2; live.buffers -= 2;
  }

  function renderShadow(s) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
    gl.viewport(0, 0, shadowSize, shadowSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2, 4);
    gl.useProgram(shadowProg.prog);
    gl.uniformMatrix4fv(shadowProg.u.uLightVP, false, s.lightVP);
    gl.bindVertexArray(s.vao);
    gl.drawArrays(gl.TRIANGLES, 0, s.count);
    gl.disable(gl.POLYGON_OFFSET_FILL);
  }

  /** Bakış: hedef sahnenin merkezi, kadraj sınır küresine göre (görüntü oranından bağımsız sığdırma). */
  function cameraVP(s, yaw, pitch, aspect, frame = 1, { composition = false } = {}) {
    const d = viewDir(yaw, pitch);
    const R = s.b.radius;
    const target = s.b.focus;
    const eye = target.map((c, i) => c + d[i] * R * 4);
    // Odak kayması kadar pay: başka açılarda da hiçbir parça kadrajdan çıkmaz.
    // Küçük görseller yalnızca çözülmüş kompozisyona sığdırılır.
    const [ew, eh] = s.b.extent;
    const halfH = composition
      ? Math.max(eh / 2, ew / 2 / aspect) * 1.18 * frame
      : (R * 0.8 + s.b.focusShift) * frame * Math.max(1, 1 / aspect);
    const halfW = halfH * aspect;
    const up = Math.abs(d[1]) > 0.999 ? [0, 0, -1] : [0, 1, 0];
    return mul(ortho(-halfW, halfW, -halfH, halfH, 0.1, R * 8), lookAt(eye, target, up));
  }

  function drawScene(s, vp, { flat = false, glow = 0 } = {}) {
    gl.enable(gl.DEPTH_TEST);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    if (!flat) {
      gl.useProgram(floorProg.prog);
      gl.uniformMatrix4fv(floorProg.u.uVP, false, vp);
      gl.uniformMatrix4fv(floorProg.u.uLightVP, false, s.lightVP);
      gl.uniform1i(floorProg.u.uShadow, 0);
      gl.uniform2f(floorProg.u.uShadowTexel, 1 / shadowSize, 1 / shadowSize);
      gl.uniform3fv(floorProg.u.uBg, BG);
      gl.uniform3fv(floorProg.u.uCenter, s.b.center);
      gl.uniform1f(floorProg.u.uRadius, s.b.radius);
      gl.bindVertexArray(s.floorVao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    gl.useProgram(mainProg.prog);
    gl.uniformMatrix4fv(mainProg.u.uVP, false, vp);
    gl.uniformMatrix4fv(mainProg.u.uLightVP, false, s.lightVP);
    gl.uniform3fv(mainProg.u.uLightDir, LIGHT_DIR);
    gl.uniform1i(mainProg.u.uShadow, 0);
    gl.uniform2f(mainProg.u.uShadowTexel, 1 / shadowSize, 1 / shadowSize);
    gl.uniform1f(mainProg.u.uFlat, flat ? 1 : 0);
    gl.uniform1f(mainProg.u.uGlow, glow);
    gl.bindVertexArray(s.vao);
    gl.drawArrays(gl.TRIANGLES, 0, s.count);
    gl.bindVertexArray(null);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (w === width && h === height) return false;
    width = canvas.width = w;
    height = canvas.height = h;
    return true;
  }

  /** Ekran dışı çizim → 2D tuval (ipucu silueti ve küçük görseller). */
  function snapshot(level, w, h, { flat = false } = {}) {
    const own = !scene || scene.levelId !== level.id;
    const s = own ? buildScene(level) : scene;
    renderShadow(s);
    const tex = gl.createTexture();
    const rb = gl.createRenderbuffer();
    const fbo = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    gl.viewport(0, 0, w, h);
    if (flat) gl.clearColor(0, 0, 0, 0);
    else gl.clearColor(...BG, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    drawScene(s, cameraVP(s, level.target.yaw, level.target.pitch, w / h, 1, { composition: true }), { flat });
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteRenderbuffer(rb);
    gl.deleteTexture(tex);
    if (own) freeScene(s);
    else renderShadow(scene);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const c2 = out.getContext('2d');
    const img = c2.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    c2.putImageData(img, 0, 0);
    return out;
  }

  const handleLost = (e) => {
    e.preventDefault();
    onLost?.();
  };
  canvas.addEventListener('webglcontextlost', handleLost);
  resize();

  return {
    setLevel(level) {
      freeScene(scene);
      scene = buildScene(level);
      scene.levelId = level.id;
      renderShadow(scene);
    },
    resize,
    draw(yaw, pitch, glow = 0) {
      if (!scene) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.clearColor(...BG, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      drawScene(scene, cameraVP(scene, yaw, pitch, width / height), { glow });
    },
    snapshot,
    stats: () => ({ ...live, width, height }),
    dispose() {
      canvas.removeEventListener('webglcontextlost', handleLost);
      freeScene(scene);
      scene = null;
      gl.deleteFramebuffer(shadowFbo);
      gl.deleteTexture(shadowTex);
      for (const p of [mainProg, floorProg, shadowProg]) gl.deleteProgram(p.prog);
    },
  };
}
