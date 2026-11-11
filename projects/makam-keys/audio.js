// Ses motoru: ney (nefesli, vibratolu) ve kanun (telli, mızraplı) tınıları, dem (karar perdesinde sürekli ses) ve yankı.
// Bağlam yalnızca ilk kullanıcı hareketinde açılır.

let ctx = null; let master = null; let dry = null; let wet = null;

function impulse(c, seconds = 2.4) {
  // Kısa, sıcak bir oda yankısı: üstel sönümlü gürültü
  const len = Math.floor(c.sampleRate * seconds); const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2;
  }
  return buf;
}

export function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
  master = ctx.createGain(); master.gain.value = 0.8; master.connect(comp); comp.connect(ctx.destination);
  dry = ctx.createGain(); dry.gain.value = 0.85; dry.connect(master);
  const rev = ctx.createConvolver(); rev.buffer = impulse(ctx);
  wet = ctx.createGain(); wet.gain.value = 0.32; wet.connect(rev); rev.connect(master);
  return ctx;
}
export const running = () => !!ctx && ctx.state === 'running';

let noiseBuf = null;
function noise() {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
function out(node, level = 1) {
  const g = ctx.createGain(); g.gain.value = level; node.connect(g); g.connect(dry); g.connect(wet); return g;
}

// Ney: temel + yumuşak üst ses + nefes gürültüsü, geç başlayan vibrato
function ney(f, t, vel) {
  const env = ctx.createGain(); env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.32 * vel, t + 0.09); env.gain.linearRampToValueAtTime(0.26 * vel, t + 0.3);
  out(env);
  const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
  const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2;
  const g2 = ctx.createGain(); g2.gain.value = 0.1;
  const vib = ctx.createOscillator(); vib.frequency.value = 5.1;
  const vibAmt = ctx.createGain(); vibAmt.gain.setValueAtTime(0, t); vibAmt.gain.linearRampToValueAtTime(f * 0.006, t + 0.6);
  vib.connect(vibAmt); vibAmt.connect(o1.frequency); vibAmt.connect(o2.frequency);
  const n = ctx.createBufferSource(); n.buffer = noise(); n.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2.2; bp.Q.value = 1.4;
  const gn = ctx.createGain(); gn.gain.setValueAtTime(0.22, t); gn.gain.linearRampToValueAtTime(0.07, t + 0.25);
  o1.connect(env); o2.connect(g2); g2.connect(env); n.connect(bp); bp.connect(gn); gn.connect(env);
  const nodes = [o1, o2, vib, n];
  for (const x of nodes) x.start(t);
  return {
    stop(at = ctx.currentTime) {
      env.gain.cancelScheduledValues(at); env.gain.setValueAtTime(env.gain.value, at); env.gain.linearRampToValueAtTime(0, at + 0.28);
      for (const x of nodes) x.stop(at + 0.32);
    },
  };
}

// Kanun: iki hafif ayrık tel, parlak başlayıp kararan süzgeç, uzun sönüm
function kanun(f, t, vel) {
  const env = ctx.createGain(); env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.3 * vel, t + 0.004); env.gain.exponentialRampToValueAtTime(0.0008, t + 2.2);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
  lp.frequency.setValueAtTime(Math.min(16000, f * 14), t); lp.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.6);
  lp.connect(env); out(env);
  const nodes = [];
  for (const d of [-3, 3]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
    o.connect(lp); o.start(t); o.stop(t + 2.3); nodes.push(o);
  }
  // Mızrap vuruşu: çok kısa gürültü
  const n = ctx.createBufferSource(); n.buffer = noise();
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
  const gn = ctx.createGain(); gn.gain.setValueAtTime(0.12 * vel, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  n.connect(hp); hp.connect(gn); gn.connect(env); n.start(t); n.stop(t + 0.05);
  return { stop() { /* tel kendiliğinden söner */ } };
}

export function play(f, { voice = 'ney', at = 0, vel = 1 } = {}) {
  if (!ensure()) return null;
  const t = Math.max(ctx.currentTime, at || ctx.currentTime) + 0.005;
  return voice === 'kanun' ? kanun(f, t, vel) : ney(f, t, vel);
}
export const now = () => (ctx ? ctx.currentTime : 0);

// Dem: karar perdesinin bir oktav altında yumuşak, sürekli bir taban sesi (ve beşlisi)
let drone = null;
export function setDrone(f) {
  if (!ensure()) return;
  const t = ctx.currentTime;
  if (drone) {
    for (const [o, ratio] of drone.oscs) o.frequency.setTargetAtTime(f * ratio, t, 0.15);
    return;
  }
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 1.2);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
  lp.connect(g); out(g, 1);
  const oscs = [];
  for (const [ratio, type, lvl] of [[0.5, 'sawtooth', 0.5], [0.5 * 1.4983, 'sine', 0.35], [1, 'sine', 0.25]]) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * ratio;
    const og = ctx.createGain(); og.gain.value = lvl; o.connect(og); og.connect(lp); o.start(t); oscs.push([o, ratio]);
  }
  drone = { g, oscs };
}
export function stopDrone() {
  if (!drone || !ctx) return;
  const t = ctx.currentTime; const d = drone; drone = null;
  d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(d.g.gain.value, t); d.g.gain.linearRampToValueAtTime(0, t + 0.6);
  for (const [o] of d.oscs) o.stop(t + 0.7);
}
