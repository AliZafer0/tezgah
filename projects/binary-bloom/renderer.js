// WebGL2 çizici. Bütün karakterler tek bir nokta çiziminde çizilir.
// 1) Taç yaprakların görünmez yüzeyi yalnızca derinliğe yazılır: arkadaki karakterler
//    öndeki yaprakların içinden görünmez, gül gerçek bir hacim gibi okunur.
// 2) Karakterler HDR bir hedefte toplanır; yumuşak bir bloom eklenir ve rengi koruyan
//    tonlamayla ekrana yazılır. Atlasta keskin glif ve hale ayrı kanallardadır.
import { buildRose } from './rose.js';

// Taç yaprak biçimi; hem karakterler hem derinlik yüzeyi aynı formülü kullanır.
const SHAPE = /* glsl */ `
uniform float uOpen;
uniform float uTime;
uniform float uMotion;
uniform float uScatter;

// Dış yapraklar önce, iç yapraklar daha geç ve daha az açılır.
float petalOpen(float k) {
  float d = (1.0 - k) * 0.42;
  return smoothstep(d, d + 0.58, uOpen);
}

// (r, y) düzleminde sabit eğrilikli bir orta damar; genişlik boyunca içe kıvrılma
// (cup) ve merkeze sarılma (wrap). Dış yaprakların uçları açıldıkça geri kıvrılır.
vec3 petalShape(float k, float phi, float u, float v, float o, float flutter) {
  float R0 = 0.03 + 0.30 * k;
  float y0 = -0.10 * k;
  float L = 0.42 + 0.9 * k;
  float W = 0.2 + 0.5 * k;
  float a0 = mix(0.06 + 0.30 * k, 0.12 + 0.95 * pow(k, 1.35), o) + flutter;
  float bend = mix(-2.6 * (1.0 - k) - 0.4, mix(-2.6, 0.55, smoothstep(0.3, 1.0, k)), o);
  float kap = bend / L;
  if (abs(kap) < 0.001) kap = 0.001;
  float a1 = a0 + kap * u * L;
  float r = R0 + (cos(a0) - cos(a1)) / kap;
  float y = y0 + (sin(a1) - sin(a0)) / kap;
  vec2 n = vec2(-cos(a1), sin(a1)); // eksene doğru yüzey normali (r, y)

  float w = W * pow(sin(1.5707963 * min(u / 0.55, 1.0)), 0.7);
  float x = v * w;
  float wrap = mix(0.95, 0.12, smoothstep(0.0, 0.7, k)) * (1.0 - 0.35 * o * k);
  float cup = mix(0.9, 0.45, k) - o * smoothstep(0.55, 1.0, k) * 1.1 * u * u * u;
  float c = cup * x * x / W;
  float rr = r + c * n.x;
  float yy = y + c * n.y;
  float ang = phi + wrap * x / (rr + 0.12);
  float t = (1.0 - wrap) * x;
  return vec3(cos(ang) * rr - sin(ang) * t, yy, sin(ang) * rr + cos(ang) * t);
}

float flutterFor(float phi, float o) {
  return 0.02 * sin(uTime * 0.7 + phi * 2.3) * uMotion * (0.3 + o);
}

// Nefes (yalnızca çiçek başı) ve düşük genlikli salınım (sapın dibi sabit).
vec3 living(vec3 pos, float swayWeight, float isPetal) {
  pos *= 1.0 + 0.012 * sin(uTime * 0.8) * uMotion * isPetal;
  pos.x += 0.035 * sin(uTime * 0.45) * swayWeight * uMotion;
  pos.z += 0.02 * sin(uTime * 0.33 + 1.0) * swayWeight * uMotion;
  return pos;
}
`;

const POINT_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec4 aA; // kind, k (ton), phi (salınım ağırlığı), u
layout(location = 1) in vec4 aB; // v, glyph, seed, size
layout(location = 2) in vec3 aS; // sabit parça konumu
layout(location = 3) in vec3 aT; // dağılma hedefi
uniform mat4 uView;
uniform mat4 uProj;
uniform vec3 uEye;
uniform float uPxScale;
uniform float uMaxSize;
uniform float uCamDist;
out vec3 vColor;
out float vGlyph;
out float vAlpha;
${SHAPE}
const vec3 BORDO = vec3(0.24, 0.01, 0.04);
const vec3 RUBY = vec3(0.86, 0.035, 0.11);
const vec3 PINK = vec3(1.0, 0.45, 0.6);

void main() {
  float kind = aA.x;
  float k = aA.y;
  float u = aA.w;
  float v = aB.x;
  float seed = aB.z;
  vec3 pos;
  vec3 color;
  float alpha;

  if (kind < 0.5) {
    float phi = aA.z;
    float o = petalOpen(k);
    float fl = flutterFor(phi, o);
    pos = petalShape(k, phi, u, v, o, fl);
    vec3 pu = petalShape(k, phi, u + 0.02, v, o, fl);
    vec3 pv = petalShape(k, phi, u, v + 0.04, o, fl);
    vec3 nrm = cross(pu - pos, pv - pos);
    float len = length(nrm);
    float facing = len > 1e-7 ? abs(dot(nrm / len, normalize(uEye - pos))) : 0.5;
    pos = living(pos, 1.0, 1.0);

    // Kenarlar biçimi taşır: parlak yakut, uçlarda kontrollü pembe ışık.
    float tipness = u / (1.0 - 0.16 * v * v);
    float rim = max(smoothstep(0.86, 1.0, abs(v)), smoothstep(0.9, 1.0, tipness));
    color = mix(BORDO, RUBY, clamp(0.15 + 0.6 * facing + 0.35 * rim - 0.2 * (1.0 - k), 0.0, 1.0));
    float tip = smoothstep(0.88, 1.0, tipness) * o * smoothstep(0.35, 0.95, k);
    color = mix(color, PINK, tip * 0.55);
    alpha = (0.35 + 0.65 * pow(facing, 1.2)) * mix(0.75, 1.35, rim) * mix(0.55, 1.0, smoothstep(0.0, 0.7, k));
  } else {
    pos = living(aS, aA.z, 0.0);
    color = mix(vec3(0.16, 0.008, 0.03), BORDO * 1.3, k);
    alpha = 0.9;
  }

  // Dağılma: her karakterin hedefi sabittir, geri dönüş aynı güle olur.
  float e = clamp(uScatter * 1.35 - seed * 0.35, 0.0, 1.0);
  e = e * e * (3.0 - 2.0 * e);
  if (e > 0.0) {
    vec3 mid = mix(pos, aT, e);
    float sw = (seed - 0.5) * 1.4 * e;
    mid.xz = mat2(cos(sw), sin(sw), -sin(sw), cos(sw)) * mid.xz;
    mid.y += sin(3.14159 * e) * 0.25;
    pos = mid;
  }

  vec4 mv = uView * vec4(pos, 1.0);
  mv.z += 0.03; // derinlik yüzeyinin hemen önünde dur
  gl_Position = uProj * mv;
  float depth = max(-mv.z, 0.1);
  gl_PointSize = clamp(aB.w * uPxScale / depth * 1.7, 1.5, uMaxSize);
  float near = smoothstep(uCamDist + 2.4, uCamDist - 1.4, depth);
  vAlpha = alpha * mix(0.4, 1.0, near) * 0.85;
  vColor = color;

  // Karakterlerin %3'ü birkaç saniyede bir 0 ↔ 1 değişir (parlaklık değişmez).
  float flip = step(0.97, fract(seed * 7.13)) * floor(uTime / (5.0 + seed * 6.0) + seed * 10.0);
  vGlyph = mod(aB.y + flip, 2.0);
}`;

const POINT_FS = /* glsl */ `#version 300 es
precision mediump float;
uniform sampler2D uAtlas;
uniform float uHalo;
in vec3 vColor;
in float vGlyph;
in float vAlpha;
out vec4 frag;
void main() {
  vec2 uv = vec2((floor(vGlyph + 0.5) + gl_PointCoord.x) * 0.5, gl_PointCoord.y);
  vec4 t = texture(uAtlas, uv);
  float a = t.r + t.g * uHalo;
  if (a < 0.004) discard;
  frag = vec4(vColor * a * vAlpha, 1.0);
}`;

const MESH_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec4 aM; // k, phi, u, v
uniform mat4 uView;
uniform mat4 uProj;
${SHAPE}
void main() {
  float o = petalOpen(aM.x);
  vec3 pos = living(petalShape(aM.x, aM.y, aM.z, aM.w, o, flutterFor(aM.y, o)), 1.0, 1.0);
  // Dağılırken yüzey merkeze çekilir; karakterler serbest kalır.
  pos *= 1.0 - 0.97 * smoothstep(0.0, 0.45, uScatter);
  gl_Position = uProj * uView * vec4(pos, 1.0);
}`;

const MESH_FS = /* glsl */ `#version 300 es
precision mediump float;
out vec4 frag;
void main() { frag = vec4(0.0); }`;

const QUAD_VS = /* glsl */ `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const DOWN_FS = /* glsl */ `#version 300 es
precision mediump float;
uniform sampler2D uSrc;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 frag;
void main() {
  vec3 c = texture(uSrc, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture(uSrc, vUv + uTexel * vec2(0.5, -0.5)).rgb
         + texture(uSrc, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture(uSrc, vUv + uTexel * vec2(0.5, 0.5)).rgb;
  frag = vec4(max(c * 0.25 - 0.08, 0.0), 1.0);
}`;

const BLUR_FS = /* glsl */ `#version 300 es
precision mediump float;
uniform sampler2D uSrc;
uniform vec2 uDir;
in vec2 vUv;
out vec4 frag;
void main() {
  vec3 c = texture(uSrc, vUv).rgb * 0.227;
  c += (texture(uSrc, vUv + uDir * 1.385).rgb + texture(uSrc, vUv - uDir * 1.385).rgb) * 0.316;
  c += (texture(uSrc, vUv + uDir * 3.231).rgb + texture(uSrc, vUv - uDir * 3.231).rgb) * 0.07;
  frag = vec4(c, 1.0);
}`;

const COMPOSITE_FS = /* glsl */ `#version 300 es
precision mediump float;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
uniform float uExposure;
uniform float uAspect;
uniform vec2 uGlowCenter;
in vec2 vUv;
out vec4 frag;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture(uScene, vUv).rgb + texture(uBloom, vUv).rgb * uBloomStrength;
  // Rengi koruyan tonlama: en parlak kanala göre ölçeklenir, yakut beyaza dönmez.
  float peak = max(max(c.r, c.g), c.b);
  c *= peak > 1e-5 ? (1.0 - exp(-peak * uExposure)) / peak : 0.0;
  vec2 p = (vUv - uGlowCenter) * vec2(uAspect, 1.0);
  vec3 bg = vec3(0.012, 0.008, 0.01) + vec3(0.06, 0.006, 0.018) * exp(-dot(p, p) * 3.2);
  c = bg + c * (1.0 - bg);
  float vig = smoothstep(1.3, 0.35, length((vUv - 0.5) * vec2(uAspect, 1.0)));
  c *= mix(0.78, 1.0, vig);
  c += (hash(gl_FragCoord.xy) - 0.5) / 255.0; // bantlaşmayı önle
  frag = vec4(c, 1.0);
}`;

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function lookAt(eye, target) {
  const z = norm([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = norm(cross([0, 1, 0], z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}

function createAtlas(gl) {
  const cell = 128;
  const canvas = document.createElement('canvas');
  canvas.width = cell * 2;
  canvas.height = cell;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 64px ui-monospace, "SFMono-Regular", "DejaVu Sans Mono", Menlo, Consolas, monospace';
  ctx.globalCompositeOperation = 'lighter';
  ['0', '1'].forEach((g, i) => {
    const x = i * cell + cell / 2;
    const y = cell / 2 + 3;
    // G kanalı: hale (gölge bulanıklığıyla; canvas filter desteği gerekmez)
    ctx.save();
    ctx.shadowColor = 'rgb(0,255,0)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgb(0,110,0)';
    ctx.fillText(g, x, y);
    ctx.restore();
    // R kanalı: keskin glif
    ctx.fillStyle = 'rgb(255,0,0)';
    ctx.fillText(g, x, y);
  });
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/** Her taç yaprak için (k, phi, u, v) ızgarası; yüzey shader'da hesaplanır. */
function buildPetalMesh(petals, segU = 18, segV = 12) {
  const verts = [];
  const indices = [];
  for (const { k, phi } of petals) {
    const base = verts.length / 4;
    for (let i = 0; i <= segU; i++) {
      for (let j = 0; j <= segV; j++) {
        const v = (j / segV) * 2 - 1;
        const u = (0.02 + 0.98 * (i / segU)) * (1 - 0.16 * v * v);
        verts.push(k, phi, u, v);
      }
    }
    for (let i = 0; i < segU; i++) {
      for (let j = 0; j < segV; j++) {
        const a = base + i * (segV + 1) + j;
        const b = a + segV + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  return { verts: new Float32Array(verts), indices: new Uint16Array(indices) };
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
  const uniforms = {};
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const { name } = gl.getActiveUniform(prog, i);
    uniforms[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, u: uniforms };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ budget: number, dprCap: number, bloom: boolean, onLost: () => void }} options
 */
export function createRenderer(canvas, { budget, dprCap, bloom, onLost }) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL2 kullanılamıyor');
  const hdr = Boolean(gl.getExtension('EXT_color_buffer_float'));

  const pointProg = compile(gl, POINT_VS, POINT_FS);
  const meshProg = compile(gl, MESH_VS, MESH_FS);
  const downProg = compile(gl, QUAD_VS, DOWN_FS);
  const blurProg = compile(gl, QUAD_VS, BLUR_FS);
  const compProg = compile(gl, QUAD_VS, COMPOSITE_FS);
  const atlas = createAtlas(gl);

  const rose = buildRose(budget);
  const pointVao = gl.createVertexArray();
  const pointVbo = gl.createBuffer();
  gl.bindVertexArray(pointVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, pointVbo);
  gl.bufferData(gl.ARRAY_BUFFER, rose.data, gl.STATIC_DRAW);
  const bytes = rose.stride * 4;
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, bytes, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, bytes, 16);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, bytes, 32);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, bytes, 44);

  const mesh = buildPetalMesh(rose.petals);
  const meshVao = gl.createVertexArray();
  const meshVbo = gl.createBuffer();
  const meshIbo = gl.createBuffer();
  gl.bindVertexArray(meshVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, meshVbo);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshIbo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  const emptyVao = gl.createVertexArray(); // tam ekran üçgen için

  const maxPoint = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1];
  let targets = [];
  let depthBuffer = null;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let useBloom = bloom;
  let drawCalls = 0;

  function makeTarget(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo, w, h };
  }

  function freeTargets() {
    for (const t of targets) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    if (depthBuffer) gl.deleteRenderbuffer(depthBuffer);
    targets = [];
    depthBuffer = null;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (w === width && h === height && targets.length) return;
    width = w;
    height = h;
    canvas.width = w;
    canvas.height = h;
    freeTargets();
    const hw = Math.max(1, w >> 1);
    const hh = Math.max(1, h >> 1);
    targets = [makeTarget(w, h), makeTarget(hw, hh), makeTarget(hw, hh)];
    depthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[0].fbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Kadraj: çiçek ve sap sığar; dar ekranda çiçek kontrollerin üstünde kalır. */
  function camera(yaw, pitch) {
    const aspect = width / height;
    const fov = (30 * Math.PI) / 180;
    const tanHalf = Math.tan(fov / 2);
    const dist = Math.max(2.35 / tanHalf, 1.58 / (tanHalf * aspect));
    const visibleH = 2 * dist * tanHalf;
    const screenY = aspect < 0.8 ? 0.37 : 0.45; // çiçeğin ekrandaki dikey yeri (üstten)
    const target = [0, 0.15 - (0.5 - screenY) * visibleH * Math.cos(pitch), 0];
    const eye = [
      target[0] + dist * Math.cos(pitch) * Math.sin(yaw),
      target[1] + dist * Math.sin(pitch),
      target[2] + dist * Math.cos(pitch) * Math.cos(yaw),
    ];
    return {
      view: lookAt(eye, target),
      proj: perspective(fov, aspect, 0.1, 60),
      eye,
      dist,
      pxScale: height / (2 * tanHalf),
      glowCenter: [0.5, 1 - screenY],
    };
  }

  function setShapeUniforms(u, s) {
    gl.uniform1f(u.uOpen, s.open);
    gl.uniform1f(u.uTime, s.time);
    gl.uniform1f(u.uMotion, s.motion);
    gl.uniform1f(u.uScatter, s.scatter);
  }

  function draw(s) {
    if (!targets.length) resize();
    const cam = camera(s.yaw, s.pitch);
    const [scene, half1, half2] = targets;
    drawCalls = 0;

    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
    gl.viewport(0, 0, scene.w, scene.h);
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 1) Görünmez taç yaprak yüzeyi → yalnızca derinlik
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.colorMask(false, false, false, false);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.5, 2);
    gl.useProgram(meshProg.prog);
    gl.uniformMatrix4fv(meshProg.u.uView, false, cam.view);
    gl.uniformMatrix4fv(meshProg.u.uProj, false, cam.proj);
    setShapeUniforms(meshProg.u, s);
    gl.bindVertexArray(meshVao);
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    drawCalls++;
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.colorMask(true, true, true, true);

    // 2) Karakterler: derinlik testi açık, yazma kapalı, toplamalı karışım
    gl.depthMask(false);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(pointProg.prog);
    const u = pointProg.u;
    gl.uniformMatrix4fv(u.uView, false, cam.view);
    gl.uniformMatrix4fv(u.uProj, false, cam.proj);
    gl.uniform3fv(u.uEye, cam.eye);
    setShapeUniforms(u, s);
    gl.uniform1f(u.uPxScale, cam.pxScale);
    gl.uniform1f(u.uMaxSize, maxPoint);
    gl.uniform1f(u.uCamDist, cam.dist);
    gl.uniform1f(u.uHalo, hdr ? 0.5 : 0.3);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlas);
    gl.uniform1i(u.uAtlas, 0);
    gl.bindVertexArray(pointVao);
    gl.drawArrays(gl.POINTS, 0, rose.count);
    drawCalls++;
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.bindVertexArray(emptyVao);

    if (useBloom) {
      gl.useProgram(downProg.prog);
      gl.bindFramebuffer(gl.FRAMEBUFFER, half1.fbo);
      gl.viewport(0, 0, half1.w, half1.h);
      gl.bindTexture(gl.TEXTURE_2D, scene.tex);
      gl.uniform1i(downProg.u.uSrc, 0);
      gl.uniform2f(downProg.u.uTexel, 1 / scene.w, 1 / scene.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.useProgram(blurProg.prog);
      gl.uniform1i(blurProg.u.uSrc, 0);
      for (let i = 0; i < 2; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, half2.fbo);
        gl.bindTexture(gl.TEXTURE_2D, half1.tex);
        gl.uniform2f(blurProg.u.uDir, (1.6 + i) / half1.w, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, half1.fbo);
        gl.bindTexture(gl.TEXTURE_2D, half2.tex);
        gl.uniform2f(blurProg.u.uDir, 0, (1.6 + i) / half1.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      drawCalls += 5;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(compProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene.tex);
    gl.uniform1i(compProg.u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, half1.tex);
    gl.uniform1i(compProg.u.uBloom, 1);
    gl.uniform1f(compProg.u.uBloomStrength, useBloom ? 0.6 : 0);
    gl.uniform1f(compProg.u.uExposure, 1.5);
    gl.uniform1f(compProg.u.uAspect, width / height);
    gl.uniform2fv(compProg.u.uGlowCenter, cam.glowCenter);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
    drawCalls++;
  }

  const handleLost = (e) => {
    e.preventDefault();
    onLost?.();
  };
  canvas.addEventListener('webglcontextlost', handleLost);

  resize();

  return {
    draw,
    resize,
    /** Yavaş cihazda kaliteyi düşür: bloom kapanır, piksel oranı 1. */
    degrade() {
      useBloom = false;
      dprCap = 1;
      width = 0;
      resize();
    },
    stats: () => ({ points: rose.count, drawCalls, targets: targets.length, hdr, bloom: useBloom, dpr }),
    dispose() {
      canvas.removeEventListener('webglcontextlost', handleLost);
      freeTargets();
      for (const b of [pointVbo, meshVbo, meshIbo]) gl.deleteBuffer(b);
      for (const v of [pointVao, meshVao, emptyVao]) gl.deleteVertexArray(v);
      gl.deleteTexture(atlas);
      for (const p of [pointProg, meshProg, downProg, blurProg, compProg]) gl.deleteProgram(p.prog);
    },
  };
}
