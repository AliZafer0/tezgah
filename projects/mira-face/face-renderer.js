// Mira çizicisi — WebGL2, iki geçiş, sabit kaynaklar başlangıçta hazırlanır.
// 1) Yüz geçişi: karakter hücresi başına bir piksel. Ekran noktası poz → çene → ifade
//    sırasıyla ters eşlenerek dinlenme yüzeyine (önceden pişirilmiş doku) bağlanır.
//    Gözler kapak eğrileriyle kesilen kürelerdir; ağız açıklığı gerçek bir boşluktur.
// 2) Karakter geçişi: her hücreye atlastan bir 0 ya da 1; parlak yerler sık ve kalın,
//    gölgeler seyrek. Karakter başına çizim çağrısı ya da DOM düğümü yoktur.
import { DOMAIN, bakeSurface } from './face-surface.js';

const QUAD_VS = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FACE_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uSurf;
uniform vec4 uDomain;   // x0, y0, 1/(x1-x0), 1/(y1-y0)
uniform vec2 uCellPx;
uniform vec2 uCenter;   // baş merkezi (cihaz pikseli, y yukarı)
uniform float uScale;   // yüz birimi başına piksel
uniform vec3 uPose;     // yaw, pitch, roll
uniform vec4 uMouth;    // çene, köşe yükselmesi, daralma, yanak
uniform vec4 uBrow;     // sol kaş, sağ kaş, içe yaklaşma
uniform vec4 uLids;     // üst kapak açıklığı, alt kapak yükselmesi, kırpma
uniform vec4 uGaze;     // sol göz yaw/pitch, sağ göz yaw/pitch
uniform float uTime;
out vec4 frag;

const vec3 LIGHT = vec3(-0.62, 0.5, 0.6);
const float LIP_Y = -0.672;

float G(vec2 d, vec2 s) { return exp(-dot(d * d, 1.0 / (s * s))); }
vec4 surf(vec2 p) { return texture(uSurf, (p - uDomain.xy) * uDomain.zw); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

// Dinlenme → ifade kayması (kaşlar, gülümseme köşeleri, yanaklar, dudak daralması)
vec2 dExpr(vec2 p) {
  vec2 d = vec2(0.0);
  float browMask = smoothstep(0.15, 0.27, p.y);
  for (int k = 0; k < 2; k++) {
    float s = k == 0 ? -1.0 : 1.0;
    float b = k == 0 ? uBrow.x : uBrow.y;
    d.y += 0.075 * b * G(p - vec2(s * 0.36, 0.36), vec2(0.3, 0.2)) * browMask;
    d += vec2(-s * 0.03, -0.028) * uBrow.z * G(p - vec2(s * 0.2, 0.33), vec2(0.13, 0.12)) * browMask;
    d += vec2(s * 0.03, 0.12) * uMouth.y * G(p - vec2(s * 0.28, -0.665), vec2(0.1, 0.09));
    d.y += 0.02 * uMouth.y * G(p - vec2(s * 0.16, -0.7), vec2(0.07, 0.06));
    d.y += 0.03 * (0.6 * uMouth.y + uMouth.w) * G(p - vec2(s * 0.42, -0.25), vec2(0.22, 0.2));
  }
  d.x -= 0.3 * uMouth.z * p.x * G(p - vec2(0.0, -0.67), vec2(0.32, 0.13));
  return d;
}

// İfadenin derinliğe katkısı ve eğimi (yanak dolgunluğu, öne gelen dudaklar)
vec3 dzExpr(vec2 p) {
  vec3 r = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    float s = k == 0 ? -1.0 : 1.0;
    vec2 d = p - vec2(s * 0.43, -0.2); vec2 sg = vec2(0.17, 0.15);
    float a = 0.05 * (0.6 * uMouth.y + uMouth.w) * G(d, sg);
    r += vec3(-2.0 * d / (sg * sg) * a, a);
  }
  vec2 d = p - vec2(0.0, -0.68); vec2 sg = vec2(0.17, 0.08);
  float a = 0.045 * uMouth.z * G(d, sg);
  r += vec3(-2.0 * d / (sg * sg) * a, a);
  return r;
}

float mouthHalf() { return 0.27 * (1.0 - 0.55 * uMouth.z + 0.08 * uMouth.y); }
// Çene açıklığı: dudak çizgisinin altındaki her şey aşağı iner; genişlik çeneye doğru artar
float jawShift(float x, float y, float ll, float mw) {
  float w = mw + 1.1 * max(ll - y, 0.0);
  float prof = sqrt(max(1.0 - (x * x) / (w * w), 0.0));
  return uMouth.x * 0.26 * prof * smoothstep(-1.75, -1.3, y);
}

// Kapak eğrileri: x ∈ [-1,1], -1 iç köşe; birimler göz yarı genişliği cinsinden
void lids(float x, out float yU, out float yL) {
  float t = clamp(x, -1.0, 1.0);
  float b = max(1.0 - t * t, 0.0);
  float tilt = 0.07 * t;
  float open = clamp(uLids.x * (1.0 - uLids.z), 0.0, 1.25);
  float lower = clamp(uLids.y + 0.12 * uLids.z, 0.0, 0.7);
  float up = 0.52 * pow(b, 0.68) * (1.0 - 0.12 * t);
  float lo = -0.32 * pow(b, 0.8) * (1.0 + 0.1 * t);
  float closed = -0.1 * pow(b, 0.9);
  yU = mix(closed, up, open) + tilt;
  yL = min(mix(lo, closed, lower) + tilt, yU);
}

// Göz küresi: bakış yönüyle dönen iris ve pupilla; kapak gölgesi ve küçük bir ışık
vec4 eyeball(vec2 q, vec2 gaze, float lidShade) {
  vec2 b = (q - vec2(0.0, -0.01)) / 0.205;
  vec3 n = vec3(b, sqrt(max(1.0 - dot(b, b), 0.0)));
  vec3 g = vec3(sin(gaze.x) * cos(gaze.y), sin(gaze.y), cos(gaze.x) * cos(gaze.y));
  float th = acos(clamp(dot(n, g), -1.0, 1.0));
  float r = th / 0.4;
  vec3 right = normalize(cross(vec3(0, 1, 0), g));
  vec3 up = cross(g, right);
  float phi = atan(dot(n, up), dot(n, right));
  float shade = (0.6 + 0.4 * n.z) * lidShade;
  vec3 col; float lum;
  if (r < 1.0) {
    float fib = 0.6 * vnoise(vec2(phi * 7.0, r * 3.0)) + 0.4 * vnoise(vec2(phi * 19.0, r * 6.0 + 4.0));
    vec3 inner = mix(vec3(0.62, 0.38, 0.17), vec3(0.78, 0.55, 0.26), fib);
    vec3 outer = mix(vec3(0.24, 0.13, 0.07), vec3(0.42, 0.24, 0.12), fib);
    col = mix(inner, outer, smoothstep(0.35, 0.85, r));
    lum = mix(0.56, 0.3, smoothstep(0.3, 0.95, r)) * (0.75 + 0.5 * fib);
    float pupil = smoothstep(0.4, 0.34, r);
    lum *= 1.0 - 0.94 * pupil;
    lum *= mix(1.0, 0.45, smoothstep(0.86, 1.0, r));
  } else {
    col = vec3(0.9, 0.84, 0.76);
    lum = 0.5 * smoothstep(1.0, 1.1, r) + 0.2;
  }
  lum *= shade;
  vec3 hv = normalize(normalize(LIGHT) + vec3(0, 0, 1));
  float spec = pow(max(dot(n, hv), 0.0), 140.0);
  col = mix(col, vec3(1.0, 0.86, 0.62), min(spec * 2.0, 1.0));
  lum += spec * 0.85 * lidShade;
  return vec4(col, lum);
}

// Kaş: dinlenme koordinatında yay; ifade kayması onu birlikte taşır
float brow(vec2 r) {
  float m = 0.0;
  for (int k = 0; k < 2; k++) {
    float s = k == 0 ? -1.0 : 1.0;
    float t = (s * r.x - 0.12) / 0.5;
    float yb = 0.3 + 0.075 * sin(clamp(t, 0.0, 1.0) * 2.6) - 0.035 * t;
    float th = mix(0.028, 0.01, clamp(t, 0.0, 1.0));
    float body = smoothstep(th, th * 0.35, abs(r.y - yb));
    m = max(m, body * smoothstep(-0.06, 0.06, t) * smoothstep(1.05, 0.88, t));
  }
  return m;
}

vec3 skinTone(float lum) {
  vec3 shadow = vec3(0.4, 0.32, 0.3);
  vec3 mid = vec3(0.8, 0.62, 0.5);
  vec3 high = vec3(0.96, 0.9, 0.8);
  return mix(mix(shadow, mid, smoothstep(0.05, 0.4, lum)), high, smoothstep(0.4, 0.85, lum));
}

// Saç: yüzü çerçeveleyen koyu siluet, seyrek parlak teller
vec4 hair(vec2 p, out float mask) {
  float top = length((p - vec2(0.0, 0.12)) / vec2(1.07, 1.4));
  float side = 1.07 + 0.24 * smoothstep(0.1, -1.9, p.y);
  float inSide = smoothstep(side, side - 0.05, abs(p.x)) * smoothstep(-2.0, -1.8, p.y + 0.05 * sin(p.x * 9.0));
  float shape = p.y > 0.12 ? smoothstep(1.0, 0.97, top) : inSide;
  mask = shape;
  float strand = (p.x - 0.07) / (0.3 + max(1.3 - p.y, 0.0) * 0.45);
  float n = vnoise(vec2(strand * 26.0, p.y * 1.2 + uTime * 0.015));
  float glint = pow(n, 4.0);
  float lit = 0.55 + 0.45 * smoothstep(0.6, -0.8, p.x - p.y * 0.6);
  float lum = (0.07 + 0.3 * glint) * lit;
  lum *= 1.0 - 0.6 * exp(-pow((p.x - 0.07) / 0.02, 2.0)) * step(0.7, p.y); // ayrım çizgisi
  vec3 col = mix(vec3(0.36, 0.24, 0.17), vec3(0.74, 0.47, 0.28), glint);
  return vec4(col, lum * shape);
}

void main() {
  vec2 px = (floor(gl_FragCoord.xy) + 0.5) * uCellPx;
  vec2 p0 = (px - uCenter) / uScale;
  // Saç, boyun ve omuzların dışı: hiçbir şey yok, hemen çık
  if (abs(p0.x) > 2.0 || p0.y > 1.62 || p0.y < -2.35) { frag = vec4(0.0); return; }
  float cr = cos(uPose.z); float sr = sin(uPose.z);
  vec2 p = mat2(cr, -sr, sr, cr) * p0;

  // Baş yönelimi: küçük açılarda derinliğe bağlı paralaks
  vec2 tilt = vec2(sin(uPose.x), sin(uPose.y)) * 0.92;
  vec2 hp = p;
  hp = p - tilt * surf(hp).z;
  hp = p - tilt * surf(hp).z;

  // Yüz yalnızca kafa ovalinin içinde (çene açıklığı payıyla) hesaplanır
  vec2 r = hp;
  float inHead = 0.0;
  vec3 col = vec3(0.0);
  float lum = 0.0;
  float zq = max(surf(hp).z, surf(hp + vec2(0.0, 0.27 * uMouth.x)).z);
  if (zq > 0.0) {
    // Çene: dudak çizgisinin altını ters kaydır; aradaki aralık ağız boşluğudur
    float ll = LIP_Y + dExpr(vec2(hp.x, LIP_Y)).y;
    float mw = mouthHalf();
    float cavity = 0.0;
    float cavDepth = 0.0;
    vec2 e = hp;
    if (hp.y < ll && uMouth.x > 0.001) {
      float yr = hp.y + jawShift(hp.x, hp.y, ll, mw);
      yr = hp.y + jawShift(hp.x, yr, ll, mw);
      yr = hp.y + jawShift(hp.x, yr, ll, mw);
      if (yr > ll) {
        float open = jawShift(hp.x, ll, ll, mw);
        cavity = smoothstep(0.0, 0.004, open) * step(abs(hp.x), mw);
        cavDepth = clamp((ll - hp.y) / max(open, 1e-3), 0.0, 1.0);
        e.y = ll;
      } else {
        e.y = yr;
      }
    }

    // İfade kaymasını tersine çevir → dinlenme yüzeyi koordinatı
    r = e;
    r = e - dExpr(r);
    r = e - dExpr(r);
    vec4 s = surf(r);
    inHead = smoothstep(0.0, 0.015, s.z);

    // Yüzey normali ve ışık
    vec3 dz = dzExpr(r);
    vec3 n = normalize(vec3(-(s.x + dz.x), -(s.y + dz.y), 1.0));
    n.xz = mat2(cos(uPose.x), sin(uPose.x), -sin(uPose.x), cos(uPose.x)) * n.xz;
    n.yz = mat2(cos(uPose.y), sin(uPose.y), -sin(uPose.y), cos(uPose.y)) * n.yz;
    vec3 L = normalize(LIGHT);
    float diff = clamp((dot(n, L) + 0.1) / 1.1, 0.0, 1.0);
    diff = diff * diff * (3.0 - 2.0 * diff);
    float spec = pow(max(dot(reflect(-L, n), vec3(0, 0, 1)), 0.0), 16.0) * 0.08;
    float edge = smoothstep(0.0, 0.14, s.z);
    // Sağdan zayıf dolgu ve alttan sıcak sekme: gölge tarafı ve burun altı tamamen kaybolmasın
    float fill = 0.16 * max(dot(n, normalize(vec3(0.7, 0.1, 0.7))), 0.0) + 0.1 * max(dot(n, normalize(vec3(0.0, -0.6, 0.8))), 0.0);
    lum = (0.04 + 0.86 * diff + fill) * s.w * s.w * edge + spec * edge;

    // Dudaklar: dinlenme koordinatında; yüzeye bağlı, yüzeyle birlikte kayar
    float lx = r.x;
    float upB = LIP_Y + 0.058 * pow(max(1.0 - lx * lx / 0.0676, 0.0), 0.55) - 0.012 * exp(-lx * lx / 0.0012);
    float loB = LIP_Y - 0.075 * pow(max(1.0 - lx * lx / 0.053, 0.0), 0.7);
    float lip = smoothstep(upB + 0.008, upB - 0.006, r.y) * smoothstep(loB - 0.008, loB + 0.006, r.y);
    float corner = exp(-pow((abs(lx) - 0.27) / 0.03, 2.0)) * exp(-pow((r.y - LIP_Y) / 0.03, 2.0));
    float lowerLip = lip * step(r.y, LIP_Y);
    lum *= 1.0 - 0.12 * lip - 0.35 * corner;
    lum += 0.1 * lowerLip * smoothstep(LIP_Y - 0.01, LIP_Y - 0.045, r.y) * edge;
    lum *= 1.0 - 0.5 * exp(-pow((r.y - LIP_Y) / 0.006, 2.0)) * step(abs(lx), 0.27) * (1.0 - cavity);

    col = skinTone(lum);
    col = mix(col, vec3(0.82, 0.44, 0.38) * (0.6 + 0.6 * lum), lip * 0.85);
    col = mix(col, vec3(0.86, 0.58, 0.5) * (0.6 + 0.5 * lum), 0.18 * G(r - vec2(sign(r.x) * 0.45, -0.22), vec2(0.18, 0.13)));

    // Kaşlar
    float bm = brow(r);
    lum *= 1.0 - 0.82 * bm;
    col = mix(col, vec3(0.42, 0.28, 0.2), bm * 0.8);

    // Gözler: kapak açıklığı içinde göz küresi; dışında kirpik çizgisi ve kapak kıvrımı
    for (int k = 0; k < 2; k++) {
      float sd = k == 0 ? -1.0 : 1.0;
      vec2 c = vec2(sd * 0.355, 0.105);
      vec2 q = r - c;
      float ex = sd * q.x / 0.18;
      float ey = q.y / 0.18;
      if (abs(ex) > 1.35 || abs(ey) > 1.6) continue;
      float yU; float yL;
      lids(ex, yU, yL);
      float cornerFade = smoothstep(1.0, 0.94, abs(ex));
      float inside = smoothstep(-0.02, 0.02, yU - ey) * smoothstep(-0.02, 0.02, ey - yL) * cornerFade;
      float lidShade = 0.55 + 0.45 * smoothstep(0.0, 0.35, yU - ey);
      vec2 gz = k == 0 ? uGaze.xy : uGaze.zw;
      vec4 eb = eyeball(vec2(q.x, q.y), gz, lidShade);
      float lash = exp(-pow((ey - yU - 0.05) / 0.06, 2.0)) * smoothstep(1.15, 0.75, abs(ex)) * step(yU - 0.02, ey);
      lash += 0.6 * exp(-pow((ey - yU - 0.06) / 0.05, 2.0)) * smoothstep(1.3, 0.95, abs(ex - 0.15)) * step(0.5, ex);
      float creaseY = yU + 0.3 + 0.16 * clamp(uLids.x, 0.0, 1.2);
      float crease = exp(-pow((ey - creaseY) / 0.06, 2.0)) * smoothstep(1.1, 0.5, abs(ex));
      float lowerLine = exp(-pow((ey - yL + 0.03) / 0.035, 2.0)) * smoothstep(1.05, 0.6, abs(ex)) * step(ey, yL + 0.02);
      lum *= (1.0 - 0.92 * min(lash, 1.0)) * (1.0 - 0.38 * crease) * (1.0 - 0.3 * lowerLine);
      col = mix(col, eb.rgb, inside);
      lum = mix(lum, eb.a, inside);
    }

    // Ağız boşluğu: derinleştikçe kararan, sıcak koyu iç
    if (cavity > 0.0) {
      float inner = mix(0.12, 0.02, smoothstep(0.0, 0.6, cavDepth)) * (1.0 - 0.6 * smoothstep(0.7, 1.0, abs(hp.x) / mw));
      col = mix(col, vec3(0.55, 0.22, 0.18), cavity);
      lum = mix(lum, inner, cavity);
    }
  }

  // Saç çizgisi ve şakaklar: saç yüzün üst ve yan kenarını önden örter
  float hairY = 0.8 + 0.55 * r.x * r.x - 0.025 * exp(-pow((r.x - 0.07) / 0.12, 2.0)) + 0.04 * exp(-pow((r.x + 0.25) / 0.2, 2.0));
  float hw = 0.9 - 0.36 * pow(smoothstep(-0.25, -1.2, hp.y), 2.0);
  float front = max(smoothstep(hairY - 0.03, hairY + 0.04, r.y),
                    smoothstep(hw * 0.84, hw * 0.93, abs(hp.x)) * smoothstep(-0.85, -0.45, hp.y));
  float hm;
  vec4 h = hair(p, hm);

  // Boyun ve omuzlar: yüzün arkasında, çenenin gölgesinde
  float nw = 0.31 + 0.09 * smoothstep(-1.3, -1.9, p.y);
  float neck = smoothstep(nw, nw - 0.04, abs(p.x)) * step(p.y, -0.7);
  float sh = smoothstep(0.0, 0.05, (-1.72 - 0.3 * p.x * p.x) - p.y) * smoothstep(1.9, 1.6, abs(p.x));
  float neckLum = 0.2 * sqrt(max(1.0 - pow(p.x / nw, 2.0), 0.0)) * mix(0.25, 1.0, smoothstep(-1.05, -1.5, p.y)) * (0.7 + 0.3 * smoothstep(0.2, -0.3, p.x));
  float shLum = 0.09 * (0.6 + 0.4 * smoothstep(0.8, -1.2, p.x)) * smoothstep(-2.3, -1.8, p.y);

  vec3 outC = vec3(0.0);
  float outL = 0.0;
  // arkadan öne: omuz, boyun, saç, yüz, öndeki saç
  outC = mix(outC, vec3(0.6, 0.42, 0.34), sh); outL = mix(outL, shLum, sh);
  outC = mix(outC, skinTone(neckLum), neck); outL = mix(outL, neckLum, neck);
  outC = mix(outC, h.rgb, hm); outL = mix(outL, h.a, hm);
  outC = mix(outC, col, inHead); outL = mix(outL, lum, inHead);
  float fm = front * inHead * hm;
  outC = mix(outC, h.rgb, fm); outL = mix(outL, h.a, fm);

  outL = clamp(outL, 0.0, 1.0);
  frag = vec4(outC * outL, outL);
}`;

// Karakter geçişi: tam ekran tek üçgen. Hücre kararı ucuz tamsayı karmasıyla verilir;
// karanlık hücreler atlas okunmadan döner. (Hücre başına örneklemeli dörtgen denendi:
// yazılımsal rasterleştiricide çok küçük üçgenler ~8 kat daha pahalı ölçüldü.)
const GLYPH_FS = /* glsl */ `#version 300 es
precision mediump float;
precision highp int;
uniform sampler2D uFace;
uniform sampler2D uAtlas;   // hücre boyutunda 4 glif: 0, 1, kalın 0, kalın 1
uniform ivec2 uCellPx;
uniform vec2 uCells;
uniform float uTime;
uniform float uGlow;
uniform float uFlicker;
out vec4 frag;
uint mixh(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
void main() {
  ivec2 pix = ivec2(gl_FragCoord.xy);
  ivec2 cell = pix / uCellPx;
  vec4 e = texelFetch(uFace, cell, 0);
  vec3 glow = uGlow > 0.0 ? texture(uFace, gl_FragCoord.xy / vec2(uCellPx) / uCells).rgb * uGlow : vec3(0.0);
  float lum = e.a;
  if (lum < 0.025) { frag = vec4(glow, 1.0); return; }
  uint h = mixh(uint(cell.x) * 1973u + uint(cell.y) * 9277u + 26699u);
  float r0 = float(h & 1023u) / 1023.0;
  float r1 = float((h >> 10) & 1023u) / 1023.0;
  float r2 = float((h >> 20) & 1023u) / 1023.0;
  if (r0 > smoothstep(0.025, 0.3, lum) * 1.04) { frag = vec4(glow, 1.0); return; }
  float bit = step(0.5, r1);
  if (uFlicker > 0.0) {
    uint f = mixh(h ^ uint(floor(uTime * 0.4 + r0 * 50.0)));
    bit = mod(bit + step(0.996, float(f & 4095u) / 4095.0), 2.0);
  }
  float bold = step(r2, smoothstep(0.42, 0.78, lum));
  ivec2 local = pix - cell * uCellPx;
  int idx = int(bit + 2.0 * bold);
  float ink = texelFetch(uAtlas, ivec2(idx * uCellPx.x + local.x, local.y), 0).r;
  vec3 tone = e.rgb / max(lum, 0.03);
  // Hücre arkasında parlaklığa bağlı hafif ton: yüzün kütlesi uzaktan da okunur, glif keskin kalır
  frag = vec4(tone * (lum * 0.32 + ink * (0.22 + 0.95 * lum)) + glow, 1.0);
}`;

function compile(gl, fs, vs = QUAD_VS) {
  const prog = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader');
    gl.attachShader(prog, sh);
    gl.deleteShader(sh);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
  const u = {};
  const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const name = gl.getActiveUniform(prog, i).name;
    u[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, u };
}

// 0, 1 ve kalın 0, 1: hücre boyutunda çizilen küçük atlas. Yalnızca hücre boyutu
// değişince (yeniden boyutlandırma, kalite) üretilir; karede metin çizimi yoktur.
function drawAtlas(gl, tex, cw, ch) {
  const c = document.createElement('canvas');
  c.width = cw * 4; c.height = ch;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const size = Math.max(5, Math.round(ch * 1.04));
  ['0', '1', '0', '1'].forEach((g, i) => {
    x.font = `${i < 2 ? 600 : 800} ${size}px ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace`;
    x.fillText(g, cw * i + cw / 2, ch / 2 + size * 0.04);
  });
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function createSurface(gl) {
  const w = 208; const h = 248;
  const data = bakeSurface(w, h);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ onLost: () => void }} options
 */
export function createFaceRenderer(canvas, { onLost }) {
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, stencil: false,
    powerPreference: 'low-power', preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const faceProg = compile(gl, FACE_FS);
  const glyphProg = compile(gl, GLYPH_FS);
  const vao = gl.createVertexArray();
  const surface = createSurface(gl);
  const atlas = gl.createTexture();

  // Yazılımsal WebGL (SwiftShader, llvmpipe…): GPU işi de CPU'da yapılır
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  const software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(rendererName);

  const faceTex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  const size = { w: 0, h: 0, cols: 0, rows: 0, cellW: 0, cellH: 0 };

  const onLostEvt = (e) => { e.preventDefault(); onLost(); };
  canvas.addEventListener('webglcontextlost', onLostEvt);

  /** Çizim ve hücre boyutlarını ayarlar; yalnızca değişince yeniden ayırır. */
  function resize(w, h, cellW, cellH) {
    const cols = Math.ceil(w / cellW); const rows = Math.ceil(h / cellH);
    if (w !== size.w || h !== size.h) { canvas.width = w; canvas.height = h; }
    if (cols !== size.cols || rows !== size.rows) {
      gl.bindTexture(gl.TEXTURE_2D, faceTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, faceTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    if (cellW !== size.cellW || cellH !== size.cellH) drawAtlas(gl, atlas, cellW, cellH);
    Object.assign(size, { w, h, cols, rows, cellW, cellH });
  }

  /**
   * @param {object} f  çizim durumu (her karede aynı nesne, yeni tahsis yok)
   */
  function render(f) {
    const { w, h, cols, rows, cellW, cellH } = size;
    if (!cols) return;
    gl.bindVertexArray(vao);
    // Saç, boyun ve omuzları kapsayan kutu (yüz birimi: x ±1,95, y −2,35…1,62); dışı yalnızca temizlenir
    const x0 = Math.max(0, Math.floor((f.cx - 1.95 * f.scale) / cellW));
    const x1 = Math.min(cols, Math.ceil((f.cx + 1.95 * f.scale) / cellW));
    const y0 = Math.max(0, Math.floor((f.cy - 2.35 * f.scale) / cellH));
    const y1 = Math.min(rows, Math.ceil((f.cy + 1.62 * f.scale) / cellH));
    gl.enable(gl.SCISSOR_TEST);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, cols, rows);
    gl.scissor(0, 0, cols, rows);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.scissor(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
    gl.useProgram(faceProg.prog);
    const u = faceProg.u;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, surface);
    gl.uniform1i(u.uSurf, 0);
    gl.uniform4f(u.uDomain, DOMAIN.x0, DOMAIN.y0, 1 / (DOMAIN.x1 - DOMAIN.x0), 1 / (DOMAIN.y1 - DOMAIN.y0));
    gl.uniform2f(u.uCellPx, cellW, cellH);
    gl.uniform2f(u.uCenter, f.cx, f.cy);
    gl.uniform1f(u.uScale, f.scale);
    gl.uniform3f(u.uPose, f.yaw, f.pitch, f.roll);
    gl.uniform4f(u.uMouth, f.jaw, f.smile, f.narrow, f.cheek);
    gl.uniform4f(u.uBrow, f.browL, f.browR, f.browIn, 0);
    gl.uniform4f(u.uLids, f.lidU, f.lidL, f.blink, 0);
    gl.uniform4f(u.uGaze, f.gLx, f.gLy, f.gRx, f.gRy);
    gl.uniform1f(u.uTime, f.time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.scissor(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.scissor(x0 * cellW, y0 * cellH, (x1 - x0) * cellW, (y1 - y0) * cellH);
    gl.useProgram(glyphProg.prog);
    const g = glyphProg.u;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, faceTex);
    gl.uniform1i(g.uFace, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, atlas);
    gl.uniform1i(g.uAtlas, 1);
    gl.uniform2i(g.uCellPx, cellW, cellH);
    gl.uniform2f(g.uCells, cols, rows);
    gl.uniform1f(g.uTime, f.time);
    gl.uniform1f(g.uGlow, f.glow);
    gl.uniform1f(g.uFlicker, f.flicker);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
  }

  return {
    resize,
    render,
    software,
    stats: () => ({ cols: size.cols, rows: size.rows, cells: size.cols * size.rows, w: size.w, h: size.h, software }),
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLostEvt);
      if (gl.isContextLost()) return;
      gl.deleteProgram(faceProg.prog);
      gl.deleteProgram(glyphProg.prog);
      gl.deleteTexture(surface);
      gl.deleteTexture(atlas);
      gl.deleteTexture(faceTex);
      gl.deleteFramebuffer(fbo);
      gl.deleteVertexArray(vao);
    },
  };
}
