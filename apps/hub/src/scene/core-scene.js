// Glif Çekirdeği: iridesan bir çekirdek, çevresinde kod karakterlerinden oluşan
// parçacıklar ve ince yörüngeler. Seçilen proje rengi ve biçimi belirler.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, IcosahedronGeometry,
  LineBasicMaterial, LineLoop, Mesh, PerspectiveCamera, PlaneGeometry, Points, Scene,
  ShaderMaterial, Vector3, WebGLRenderer,
} from 'three';
import { signature } from '../data.js';
import { ATLAS_COLUMNS, GLYPHS, createGlyphAtlas } from './glyph-atlas.js';
import { RING_TILTS, formation, scatter, textFormation } from './formations.js';

const IDLE_ACCENT = '#a9dcff';
const FIT_RADIUS = 2.75; // kadrajda tutulacak yarıçap
const MORPH_SECONDS = 1.5;
const INTRO_SECONDS = 1.2;

// Yönetilen renk dönüşümü olmadan sRGB değerleri doğrudan shader'a gider.
function srgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return new Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const easeInOut = (t) => t * t * (3 - 2 * t);
const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));

const PARTICLE_VERTEX = /* glsl */ `
  attribute vec3 aFrom;
  attribute vec3 aTo;
  attribute float aGlyph;
  attribute float aSeed;
  uniform float uMix;
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uShimmer;
  varying float vGlyph;
  varying float vSeed;
  varying float vDepth;
  void main() {
    // Her parçacık biraz gecikmeyle yola çıkar (JS tarafındaki snapshot ile aynı formül).
    float t = clamp(uMix * 1.4 - aSeed * 0.4, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);
    vec3 p = mix(aFrom, aTo, t);
    // Birikmeyen, düşük genlikli titreşim
    p += normalize(p + 0.0001) * sin(uTime * 0.8 + aSeed * 40.0) * 0.035 * uShimmer;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (0.55 + aSeed * 0.9) / -mv.z;
    // %8'lik bir kısım zaman zaman karakter değiştirir: 0 ↔ 1
    float flip = step(0.92, aSeed) * floor(uTime * 0.45 + aSeed * 13.0);
    vGlyph = mod(aGlyph + flip, ${GLYPHS.length}.0);
    vSeed = aSeed;
    vDepth = -mv.z;
  }
`;

const PARTICLE_FRAGMENT = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec3 uAccent;
  uniform vec3 uIce;
  uniform float uOpacity;
  uniform float uDistance;
  varying float vGlyph;
  varying float vSeed;
  varying float vDepth;
  void main() {
    float cols = ${ATLAS_COLUMNS}.0;
    vec2 cell = vec2(mod(vGlyph, cols), floor(vGlyph / cols));
    vec2 uv = vec2((cell.x + gl_PointCoord.x) / cols, 1.0 - (cell.y + gl_PointCoord.y) / cols);
    float a = texture2D(uAtlas, uv).r;
    float depth = smoothstep(uDistance + 3.2, uDistance - 2.2, vDepth);
    float alpha = a * uOpacity * mix(0.18, 1.0, depth);
    if (alpha < 0.01) discard;
    vec3 col = mix(uIce, uAccent, smoothstep(0.25, 0.85, fract(vSeed * 7.31)));
    col = mix(col, vec3(1.0), step(0.97, vSeed) * 0.6);
    gl_FragColor = vec4(col * alpha, 1.0);
  }
`;

const CORE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uEnergy;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vDisp;
  float field(vec3 p) {
    return sin(p.x * 1.9 + uTime * 0.5) * sin(p.y * 1.6 + uTime * 0.37) * sin(p.z * 2.1 + uTime * 0.43);
  }
  void main() {
    float d = field(normal * 1.4) * 0.035 * uEnergy;
    vec3 pos = position + normal * d;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    vDisp = d;
    gl_Position = projectionMatrix * mv;
  }
`;

const CORE_FRAGMENT = /* glsl */ `
  uniform vec3 uAccent;
  uniform float uHue;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vDisp;
  // ince film yanardönerliği: buz → leylak → nane
  vec3 film(float t) {
    return 0.6 + 0.32 * cos(6.28318 * (t + vec3(0.0, 0.16, 0.34)));
  }
  void main() {
    float facing = max(dot(normalize(vNormal), normalize(vView)), 0.0);
    float rim = pow(1.0 - facing, 2.4);
    // içten gelen ışık: merkez parlak, kenara doğru iridesan film
    vec3 inner = uAccent * (0.35 + 0.65 * pow(facing, 2.0)) + vec3(0.9, 0.96, 1.0) * pow(facing, 10.0) * 0.55;
    vec3 col = mix(inner, film(rim * 0.8 + uHue + vDisp * 6.0) * (0.55 + 0.45 * uAccent), smoothstep(0.05, 0.85, rim));
    col *= 1.15;
    // yumuşak tonlama: beyaza patlamadan parlaklık
    col = 1.0 - exp(-col * 1.35);
    gl_FragColor = vec4(col * uOpacity, 1.0);
  }
`;

const HALO_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HALO_FRAGMENT = /* glsl */ `
  uniform vec3 uAccent;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float glow = exp(-r * r * 5.5) * 0.42 + exp(-r * r * 26.0) * 0.35;
    gl_FragColor = vec4(uAccent * glow * uOpacity, 1.0);
  }
`;

export async function createCoreScene(canvas, { reducedMotion = false, paused = false, onLost } = {}) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const lowEnd = (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 8) <= 4 || coarse;
  const COUNT = lowEnd ? 2400 : 4200;
  let dprCap = lowEnd ? 1.25 : 1.75;

  // Opak siyah tuval + CSS mix-blend-mode: screen → ışık sayfa zeminine eklenir,
  // tuvalin kenarı görünmez.
  const renderer = new WebGLRenderer({ canvas, antialias: !lowEnd, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 1);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, dprCap));

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.1, 60);
  const world = new Group();
  scene.add(world);

  const disposables = [];
  const own = (x) => { disposables.push(x); return x; };

  // --- Çekirdek ---
  const coreUniforms = {
    uTime: { value: 0 }, uEnergy: { value: 1 }, uAccent: { value: srgb(IDLE_ACCENT) },
    uHue: { value: 0 }, uOpacity: { value: 1 },
  };
  const core = new Mesh(
    own(new IcosahedronGeometry(0.62, 10)),
    own(new ShaderMaterial({ uniforms: coreUniforms, vertexShader: CORE_VERTEX, fragmentShader: CORE_FRAGMENT })),
  );
  world.add(core);

  // --- Hale (kameraya bakar, dünyanın dönüşünden bağımsız) ---
  const haloUniforms = { uAccent: { value: srgb(IDLE_ACCENT) }, uOpacity: { value: 1 } };
  const halo = new Mesh(
    own(new PlaneGeometry(5.2, 5.2)),
    own(new ShaderMaterial({
      uniforms: haloUniforms, vertexShader: HALO_VERTEX, fragmentShader: HALO_FRAGMENT,
      transparent: true, depthWrite: false, blending: AdditiveBlending,
    })),
  );
  halo.position.z = -0.6;
  scene.add(halo);

  // --- Yörüngeler ---
  const ringColors = ['#a9dcff', '#c4b8ff', '#a3f0d9'];
  const rings = [1.55, 2.0, 2.45].map((radius, i) => {
    const pts = new Float32Array(256 * 3);
    for (let k = 0; k < 256; k++) {
      const a = (k / 256) * Math.PI * 2;
      pts[k * 3] = Math.cos(a) * radius;
      pts[k * 3 + 2] = Math.sin(a) * radius;
    }
    const geo = own(new BufferGeometry());
    geo.setAttribute('position', new BufferAttribute(pts, 3));
    const mat = own(new LineBasicMaterial({
      color: new Color(ringColors[i]), transparent: true, opacity: 0.16,
      blending: AdditiveBlending, depthWrite: false,
    }));
    const ring = new LineLoop(geo, mat);
    ring.rotation.set(RING_TILTS[0][i][0], 0, RING_TILTS[0][i][1]);
    world.add(ring);
    return ring;
  });

  // --- Glif parçacıkları ---
  const atlas = own(await createGlyphAtlas());
  const seeds = new Float32Array(COUNT);
  const glyphs = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const r = Math.random();
    seeds[i] = Math.random();
    glyphs[i] = r < 0.38 ? 0 : r < 0.76 ? 1 : 2 + Math.floor(Math.random() * (GLYPHS.length - 2));
  }
  const idle = formation(0, COUNT);
  const from = reducedMotion ? idle.slice() : scatter(COUNT);
  const to = idle.slice();
  const pGeo = own(new BufferGeometry());
  pGeo.setAttribute('position', new BufferAttribute(to, 3)); // sınır kutusu için
  pGeo.setAttribute('aFrom', new BufferAttribute(from, 3));
  pGeo.setAttribute('aTo', new BufferAttribute(to, 3));
  pGeo.setAttribute('aGlyph', new BufferAttribute(glyphs, 1));
  pGeo.setAttribute('aSeed', new BufferAttribute(seeds, 1));
  pGeo.boundingSphere = null;
  pGeo.computeBoundingSphere();
  pGeo.boundingSphere.radius = 8;

  const pUniforms = {
    uAtlas: { value: atlas }, uMix: { value: reducedMotion ? 1 : 0 }, uTime: { value: 0 },
    uSize: { value: lowEnd ? 104 : 96 }, uPixelRatio: { value: renderer.getPixelRatio() },
    uShimmer: { value: reducedMotion ? 0 : 1 }, uAccent: { value: srgb(IDLE_ACCENT) },
    uIce: { value: srgb('#a9dcff') }, uOpacity: { value: 0.9 }, uDistance: { value: 9 },
  };
  const points = new Points(pGeo, own(new ShaderMaterial({
    uniforms: pUniforms, vertexShader: PARTICLE_VERTEX, fragmentShader: PARTICLE_FRAGMENT,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  })));
  world.add(points);

  // --- Durum ---
  const state = {
    reduced: reducedMotion,
    paused,
    visible: true,
    pageVisible: document.visibilityState === 'visible',
    mode: 'gallery',
    focusKey: null,
    accent: srgb(IDLE_ACCENT),
    accentTarget: srgb(IDLE_ACCENT),
    hue: 0,
    hueTarget: 0,
    tilts: RING_TILTS[0].map(([x, z]) => ({ x, z })),
    tiltTargets: RING_TILTS[0].map(([x, z]) => ({ x, z })),
    scale: 1,
    scaleTarget: 1,
    coreSize: 1,
    coreTarget: 1,
    dim: 1,
    dimTarget: 1,
    morph: reducedMotion ? 1 : 0, // 0→1 geçiş ilerlemesi
    morphSpeed: 1 / INTRO_SECONDS,
    pointer: { x: 0, y: 0 },
    rot: { x: 0, y: 0 },
    time: 0,
    settleUntil: 0,
  };
  let raf = 0;
  let last = 0;
  let destroyed = false;
  const frameTimes = [];
  let adapted = false;

  function fitCamera(width, height) {
    const aspect = width / height;
    camera.aspect = aspect;
    const halfFov = (camera.fov * Math.PI) / 360;
    const dist = FIT_RADIUS / Math.tan(halfFov) / Math.min(1, aspect);
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    pUniforms.uDistance.value = dist;
  }

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    fitCamera(w, h);
    requestRender();
  }

  /** Geçiş sürerken anlık konumları aFrom'a yazar; yeni hedef pürüzsüz başlar. */
  function snapshot() {
    const t0 = pUniforms.uMix.value;
    for (let i = 0; i < COUNT; i++) {
      let t = Math.min(1, Math.max(0, t0 * 1.4 - seeds[i] * 0.4));
      t = easeInOut(t);
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k;
        from[j] = from[j] + (to[j] - from[j]) * t;
      }
    }
  }

  let current = { index: 0, seed: 1 };
  let spellTimer = 0;
  function morphTo(index, seed, points = null) {
    if (!points) { current = { index, seed }; clearTimeout(spellTimer); state.coreTarget = 1; }
    snapshot();
    to.set(points || formation(index, COUNT, seed));
    pGeo.attributes.aFrom.needsUpdate = true;
    pGeo.attributes.aTo.needsUpdate = true;
    state.tiltTargets = RING_TILTS[index % RING_TILTS.length].map(([x, z]) => ({ x, z }));
    if (state.reduced || state.paused) {
      // Hareketsiz modda biçim anında değişir.
      from.set(to);
      pGeo.attributes.aFrom.needsUpdate = true;
      pUniforms.uMix.value = 1;
      state.morph = 1;
      state.tilts = state.tiltTargets.map((t) => ({ ...t }));
    } else {
      pUniforms.uMix.value = 0;
      state.morph = 0;
      state.morphSpeed = 1 / MORPH_SECONDS;
    }
  }

  function setFocus(project) {
    const key = project?.slug ?? null;
    if (key === state.focusKey) return;
    state.focusKey = key;
    if (project) {
      const sig = signature(project);
      state.accentTarget = srgb(sig.accent);
      state.hueTarget = ((sig.seed % 1000) / 1000) * 0.5;
      morphTo(sig.formation, sig.seed);
    } else {
      state.accentTarget = srgb(IDLE_ACCENT);
      state.hueTarget = 0;
      morphTo(0, 1);
    }
    if (state.reduced || state.paused) {
      state.accent.copy(state.accentTarget);
      state.hue = state.hueTarget;
    }
    kick();
  }

  function setMode(mode) {
    state.mode = mode;
    state.scaleTarget = mode === 'preview' ? 0.82 : 1;
    state.dimTarget = mode === 'preview' ? 0.55 : 1;
    if (state.reduced || state.paused) {
      state.scale = state.scaleTarget;
      state.dim = state.dimTarget;
    }
    // Önizleme açıkken sahne kısa bir yerleşmeden sonra durur; işlemci projeye kalsın.
    state.settleUntil = performance.now() + 900;
    kick();
  }

  function shouldRun() {
    if (destroyed || !state.visible || !state.pageVisible) return false;
    if (state.mode === 'preview' && performance.now() > state.settleUntil) return false;
    if (state.reduced || state.paused) return false;
    return true;
  }

  function update(dt) {
    state.time += dt;
    if (state.morph < 1) {
      state.morph = Math.min(1, state.morph + dt * state.morphSpeed);
      pUniforms.uMix.value = state.morph;
    }
    const a = state.accent;
    const b = state.accentTarget;
    a.set(damp(a.x, b.x, 3, dt), damp(a.y, b.y, 3, dt), damp(a.z, b.z, 3, dt));
    state.hue = damp(state.hue, state.hueTarget, 2.5, dt);
    state.scale = damp(state.scale, state.scaleTarget, 4, dt);
    state.dim = damp(state.dim, state.dimTarget, 4, dt);
    state.coreSize = damp(state.coreSize, state.coreTarget, 5, dt);
    state.tilts.forEach((t, i) => {
      t.x = damp(t.x, state.tiltTargets[i].x, 2.2, dt);
      t.z = damp(t.z, state.tiltTargets[i].z, 2.2, dt);
    });
    // İşaretçiye düşük genlikli tepki + çok yavaş tek yönlü süzülme
    state.rot.x = damp(state.rot.x, state.pointer.y * 0.14, 2.4, dt);
    state.rot.y = damp(state.rot.y, state.pointer.x * 0.22, 2.4, dt);
  }

  function apply() {
    pUniforms.uTime.value = state.time;
    coreUniforms.uTime.value = state.time;
    for (const u of [pUniforms.uAccent, coreUniforms.uAccent, haloUniforms.uAccent]) u.value.copy(state.accent);
    coreUniforms.uHue.value = state.hue;
    pUniforms.uOpacity.value = 0.9 * state.dim;
    haloUniforms.uOpacity.value = state.dim;
    coreUniforms.uOpacity.value = 0.6 + 0.4 * state.dim;
    rings.forEach((ring, i) => {
      ring.rotation.x = state.tilts[i].x;
      ring.rotation.z = state.tilts[i].z;
      ring.material.opacity = 0.16 * state.dim;
    });
    world.rotation.x = state.rot.x;
    world.rotation.y = state.rot.y + state.time * 0.02;
    world.scale.setScalar(state.scale);
    halo.scale.setScalar(state.scale * state.coreSize);
    core.scale.setScalar(Math.max(0.001, state.coreSize));
    core.visible = state.coreSize > 0.02;
  }

  function render() {
    apply();
    renderer.render(scene, camera);
  }

  function adapt(dt) {
    if (adapted) return;
    frameTimes.push(dt);
    if (frameTimes.length < 90) return;
    adapted = true;
    const sorted = frameTimes.slice(30).sort((x, y) => x - y);
    const median = sorted[sorted.length >> 1];
    if (median > 0.028) {
      // Yavaş cihaz: çözünürlüğü ve parçacık sayısını düşür.
      dprCap = 1;
      renderer.setPixelRatio(1);
      pUniforms.uPixelRatio.value = 1;
      pGeo.setDrawRange(0, Math.floor(COUNT * 0.6));
      resize();
    }
  }

  function loop(now) {
    raf = 0;
    if (!shouldRun()) {
      document.documentElement.dataset.sceneLoop = 'idle';
      return;
    }
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    update(dt);
    render();
    adapt(dt);
    raf = requestAnimationFrame(loop);
  }

  function kick() {
    if (raf || destroyed) return;
    if (shouldRun()) {
      last = 0;
      document.documentElement.dataset.sceneLoop = 'running';
      raf = requestAnimationFrame(loop);
    } else {
      requestRender();
    }
  }

  let pendingRender = 0;
  function requestRender() {
    if (pendingRender || destroyed || raf) return;
    pendingRender = requestAnimationFrame(() => {
      pendingRender = 0;
      if (!destroyed && state.visible) render();
    });
  }

  // --- Olaylar ---
  const onPointer = (e) => {
    if (state.reduced || e.pointerType === 'touch') return;
    state.pointer.x = (e.clientX / innerWidth) * 2 - 1;
    state.pointer.y = (e.clientY / innerHeight) * 2 - 1;
  };
  const onVisibility = () => {
    state.pageVisible = document.visibilityState === 'visible';
    kick();
  };
  const onLostContext = (e) => {
    e.preventDefault();
    onLost?.();
  };
  addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', onLostContext);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  resize();
  apply();
  // Shader'ları ilk karede derle; açılış sekansı takılmadan başlasın.
  renderer.compile(scene, camera);
  render();
  kick();

  /** Parçacıklar bir süre bir yazıyı oluşturur, sonra önceki biçime döner. */
  function spell(text, seconds = 4) {
    const back = { ...current };
    morphTo(back.index, back.seed, textFormation(text, COUNT));
    // Yazı okunsun diye çekirdek geri çekilir
    state.coreTarget = 0;
    if (state.reduced || state.paused) state.coreSize = 0;
    kick(); requestRender();
    clearTimeout(spellTimer);
    spellTimer = setTimeout(() => {
      if (destroyed) return;
      state.coreTarget = 1;
      if (state.reduced || state.paused) state.coreSize = 1;
      morphTo(back.index, back.seed); kick(); requestRender();
    }, seconds * 1000);
  }

  return {
    setFocus,
    setMode,
    spell,
    setVisible(v) {
      state.visible = v;
      kick();
    },
    setPaused(v) {
      state.paused = v;
      if (v) {
        // Geçişleri bitmiş haliyle dondur.
        state.morph = 1;
        pUniforms.uMix.value = 1;
        from.set(to);
        pGeo.attributes.aFrom.needsUpdate = true;
      }
      kick();
      requestRender();
    },
    setReducedMotion(v) {
      state.reduced = v;
      pUniforms.uShimmer.value = v ? 0 : 1;
      if (v) {
        state.pointer.x = state.pointer.y = 0;
        state.rot.x = state.rot.y = 0;
        this.setPaused(state.paused);
        state.morph = 1;
        pUniforms.uMix.value = 1;
        from.set(to);
        pGeo.attributes.aFrom.needsUpdate = true;
        state.accent.copy(state.accentTarget);
        state.hue = state.hueTarget;
        state.scale = state.scaleTarget;
        state.dim = state.dimTarget;
        state.tilts = state.tiltTargets.map((t) => ({ ...t }));
      }
      kick();
      requestRender();
    },
    dispose() {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(spellTimer);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(pendingRender);
      removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onLostContext);
      resizeObserver.disconnect();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      delete document.documentElement.dataset.sceneLoop;
    },
    info: () => ({ count: COUNT, pixelRatio: renderer.getPixelRatio(), calls: renderer.info.render.calls }),
  };
}
