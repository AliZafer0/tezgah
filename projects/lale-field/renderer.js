// WebGL2 çizici: gökyüzü (tam ekran üçgen) + tek çizimde bütün karakterler (toplamalı karışım).
// Lale konumu, açılma, rüzgâr ve hışırtı GPU'da hesaplanır.
import { KIND } from './tulip.js';

export const MAX_TULIPS = 96;

const SKY_VS = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUv;
void main() { vUv = P[gl_VertexID] * 0.5 + 0.5; gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }`;
const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv; uniform float uAspect; out vec4 o;
void main() {
  vec3 top = vec3(0.012, 0.010, 0.022); vec3 hor = vec3(0.075, 0.035, 0.06);
  float h = smoothstep(0.15, 0.75, vUv.y);
  vec3 c = mix(hor, top, h);
  vec2 m = vec2((vUv.x - 0.78) * uAspect, vUv.y - 0.8);
  c += vec3(0.16, 0.12, 0.10) * exp(-dot(m, m) * 9.0) + vec3(0.5, 0.45, 0.4) * exp(-dot(m, m) * 1400.0);
  o = vec4(c, 1.0);
}`;

const VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aA; // tür, lale, u, v
layout(location = 1) in vec4 aB; // açı, glif, tohum, katman
uniform mat4 uView; uniform mat4 uProj;
uniform float uTime; uniform float uPx; uniform float uBreeze; uniform float uMotion;
uniform vec4 uGust[4];
uniform vec4 uT[${MAX_TULIPS}]; // x, z, ölçek, ton
uniform vec4 uO[${MAX_TULIPS}]; // açılma, evre, boy, doygunluk
out vec3 vColor; out float vGlyph; out float vAlpha;

vec3 hsv(float h, float s, float v) {
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}
vec2 wind(vec2 p) {
  vec2 w = vec2(sin(uTime * 0.9 + p.x * 0.55 + p.y * 0.3), 0.35 * cos(uTime * 0.67 + p.y * 0.6 + p.x * 0.2)) * uBreeze;
  for (int i = 0; i < 4; i++) {
    vec4 g = uGust[i]; float age = uTime - g.z;
    if (age < 0.0 || g.w <= 0.0) continue;
    vec2 d = p - g.xy; float dist = length(d);
    float front = dist - age * 3.4;
    w += (d / max(dist, 0.05)) * g.w * exp(-front * front * 1.2) * exp(-age * 0.55);
  }
  return w * uMotion;
}
// İstanbul lalesi: kapalıyken badem biçimli tomurcuk, açıldıkça hançer uçlu, dışa kıvrılan yapraklar
vec3 petal(float u, float v, float phi, float layer, float o) {
  float rc = 0.20 * pow(sin(3.14159 * min(u * 0.92, 1.0)), 0.85) + 0.012;
  float yc = 0.8 * u;
  float ro = 0.035 + 0.6 * pow(u, 1.2);
  float yo = 0.62 * u - 0.1 * u * u;
  float inner = layer > 0.5 ? 0.86 : 1.0;
  float r = mix(rc, ro, o) * inner;
  float y = mix(yc, yo, o) * (layer > 0.5 ? 0.95 : 1.0);
  float span = 0.6 * pow(sin(3.14159 * pow(u, 0.75)), 0.55) * pow(1.0 - u, 0.38) * (1.0 + 0.3 * o);
  float a = phi + v * span;
  // Hafif kaşık: yaprak ortası dışa, kenarları içe
  r += (1.0 - v * v) * 0.018 * sin(3.14159 * u);
  return vec3(cos(a) * r, y, sin(a) * r);
}
void main() {
  float kind = aA.x; int ti = int(aA.y); float u = aA.z; float v = aA.w;
  float phi = aB.x; float seed = aB.z; float layer = aB.w;
  vec3 pos; vec3 col; float size; float alpha;
  if (kind > 2.5) {
    // Zemin otları
    pos = vec3(u, 0.0, v) + vec3(0.0, phi * 0.6, 0.0);
    pos.xz += wind(pos.xz) * 0.03 * phi * 8.0;
    col = hsv(0.31, 0.55, 0.14 + seed * 0.14); size = 0.03; alpha = 0.6;
  } else {
    vec4 T = uT[ti]; vec4 O = uO[ti];
    float H = 1.0 * O.z; float o = O.x; float s = T.z;
    vec3 lp;
    if (kind < 0.5) {
      lp = petal(u, v, phi, layer, o) + vec3(0.0, H, 0.0);
      float lum = 0.42 + 0.58 * pow(u, 0.7) - layer * 0.08;
      col = hsv(T.w, O.w * (1.0 - 0.22 * u * u), lum);
      size = 0.02; alpha = ti == 0 ? 0.42 : 0.62;
    } else if (kind < 1.5) {
      lp = vec3(cos(v) * 0.011, u * H, sin(v) * 0.011);
      col = hsv(0.29, 0.6, 0.3); size = 0.018; alpha = 0.6;
    } else {
      float L = 0.62 * H;
      float w = 0.075 * pow(sin(3.14159 * u), 0.7) * (1.0 - 0.3 * u);
      vec2 dir = vec2(cos(phi), sin(phi)); vec2 side = vec2(-dir.y, dir.x);
      float r = L * 0.5 * u + 0.012; float y = 0.03 + L * (1.05 * u - 0.6 * u * u) - abs(v) * w * 0.4;
      lp = vec3(dir.x * r + side.x * v * w, y, dir.y * r + side.y * v * w);
      col = hsv(0.3, 0.55, 0.2 + 0.25 * u); size = 0.022; alpha = 0.7;
    }
    // Rüzgâr: sapın dibi sabit, yukarı çıktıkça eğilir
    float hh = lp.y / (H + 0.7);
    vec2 wv = wind(T.xy) * 0.28 * hh * hh;
    lp.xz += wv * (H + 0.7); lp.y -= dot(wv, wv) * 0.6 * (H + 0.7);
    // Yaprak ucunda küçük titreşim
    lp.xz += 0.006 * sin(uTime * 2.3 + seed * 40.0 + O.y) * uMotion * hh;
    pos = vec3(T.x, 0.0, T.y) + lp * s;
    size *= s;
  }
  vec4 vp = uView * vec4(pos, 1.0);
  gl_Position = uProj * vp;
  float depth = -vp.z;
  gl_PointSize = clamp(size * uPx / max(depth, 0.1), 1.2, 18.0);
  // Yaşayan kod: karakterler arada bir 0↔1 döner
  float g = aB.y;
  float tick = floor(uTime * 1.4 + seed * 9.0);
  bool fixedGlyph = kind > 0.5 && kind < 1.5 && aB.w > 0.5;
  if (!fixedGlyph && uMotion > 0.0 && fract(sin(tick * 12.9898 + seed * 78.233) * 43758.5453) < 0.06) g = 1.0 - g;
  vGlyph = g;
  vColor = col;
  vAlpha = alpha * exp(-max(0.0, depth - 4.0) * 0.12);
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vColor; in float vGlyph; in float vAlpha;
uniform sampler2D uAtlas; uniform float uExposure;
out vec4 o;
void main() {
  vec2 a = texture(uAtlas, vec2((gl_PointCoord.x + vGlyph) * 0.5, gl_PointCoord.y)).rg;
  // r: keskin glif, g: yumuşak hale
  vec3 c = vColor * (a.r * 1.0 + a.g * 0.45) * vAlpha * uExposure;
  o = vec4(c, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

function atlas(gl) {
  // İki hücre: "0" ve "1". Kırmızı kanal keskin glif, yeşil kanal bulanık hale.
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const glyphs = ['0', '1'];
  const layer = (blur, color) => {
    const t = document.createElement('canvas'); t.width = 128; t.height = 64; const tg = t.getContext('2d');
    tg.textAlign = 'center'; tg.textBaseline = 'middle'; tg.font = '600 42px ui-monospace, Menlo, Consolas, monospace';
    tg.filter = blur ? `blur(${blur}px)` : 'none'; tg.fillStyle = color;
    glyphs.forEach((ch, i) => tg.fillText(ch, 32 + i * 64, 34));
    return t;
  };
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 64);
  g.globalCompositeOperation = 'lighter';
  g.drawImage(layer(0, '#ff0000'), 0, 0);
  g.drawImage(layer(7, '#00ff00'), 0, 0);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  const sky = program(gl, SKY_VS, SKY_FS);
  const prog = program(gl, VS, FS);
  const U = {};
  for (const n of ['uView', 'uProj', 'uTime', 'uPx', 'uBreeze', 'uMotion', 'uGust', 'uT', 'uO', 'uAtlas', 'uExposure']) U[n] = gl.getUniformLocation(prog, n);
  const uAspect = gl.getUniformLocation(sky, 'uAspect');
  const tex = atlas(gl);
  const vao = gl.createVertexArray(); const skyVao = gl.createVertexArray();
  const bufA = gl.createBuffer(); const bufB = gl.createBuffer();
  let count = 0;

  return {
    gl,
    setGeometry(geo) {
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufA); gl.bufferData(gl.ARRAY_BUFFER, geo.a, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufB); gl.bufferData(gl.ARRAY_BUFFER, geo.b, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      count = geo.count;
    },
    draw({ view, proj, time, px, breeze, motion, gusts, T, O, aspect, exposure }) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.useProgram(sky); gl.uniform1f(uAspect, aspect); gl.bindVertexArray(skyVao); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(prog);
      gl.uniformMatrix4fv(U.uView, false, view); gl.uniformMatrix4fv(U.uProj, false, proj);
      gl.uniform1f(U.uTime, time); gl.uniform1f(U.uPx, px); gl.uniform1f(U.uBreeze, breeze); gl.uniform1f(U.uMotion, motion);
      gl.uniform1f(U.uExposure, exposure);
      gl.uniform4fv(U.uGust, gusts); gl.uniform4fv(U.uT, T); gl.uniform4fv(U.uO, O);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(U.uAtlas, 0);
      gl.bindVertexArray(vao); gl.drawArrays(gl.POINTS, 0, count);
      gl.bindVertexArray(null);
    },
    get count() { return count; },
  };
}

export { KIND };
