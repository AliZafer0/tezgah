// F Daktilo — örneksiz daktilo sesleri: tuş vuruşu, boşluk, satır sonu zili, şaryo dönüşü, kâğıt çekme.
let ac = null; let out = null; let noise = null;
export let enabled = true;
export const setEnabled = (v) => { enabled = v; };

export function audio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return ac; }
  const A = window.AudioContext || window.webkitAudioContext;
  if (!A) return null;
  ac = new A({ latencyHint: 'interactive' });
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
  out = ac.createGain(); out.gain.value = 0.8; out.connect(comp).connect(ac.destination);
  noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}
const ready = () => enabled && ac && ac.state === 'running';

function burst(t, f, q, gain, dur, type = 'bandpass') {
  const s = ac.createBufferSource(); s.buffer = noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const flt = ac.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
  const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(flt).connect(g).connect(out); s.start(t, Math.random() * 0.5, dur + 0.02);
}
function tone(t, f, gain, dur, type = 'sine', f2 = f) {
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2 !== f) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
}

// Harf: kolun merdaneye vuruşu (tok gövde + sert tıkırtı + ince metal çınlama), ardından şaryonun bir diş ilerlemesi
export function strike(v = 1) {
  if (!ready()) return;
  const t = ac.currentTime + 0.005;
  tone(t, 150 + Math.random() * 30, 0.5 * v, 0.07, 'sine', 70);
  burst(t, 2800 + Math.random() * 900, 1.4, 0.55 * v, 0.03);
  tone(t, 2100 + Math.random() * 300, 0.04 * v, 0.05, 'triangle');
  burst(t + 0.045, 5200, 4, 0.12, 0.012);
}
export function space() {
  if (!ready()) return;
  const t = ac.currentTime + 0.005;
  tone(t, 110, 0.25, 0.05, 'sine', 60);
  burst(t + 0.02, 4800, 3, 0.18, 0.015);
}
export function clunk() {
  if (!ready()) return;
  const t = ac.currentTime + 0.005;
  tone(t, 90, 0.4, 0.09, 'sine', 50);
  burst(t, 900, 1, 0.2, 0.05);
}
export function bell() {
  if (!ready()) return;
  const t = ac.currentTime + 0.01;
  for (const [f, a, d] of [[2490, 0.22, 1.4], [3720, 0.08, 0.9], [5930, 0.04, 0.5]]) tone(t, f, a, d);
}
// Şaryo dönüşü: dişlinin hızla geri sayan tık tıkları ve kayış sesi, sonunda satır atlatma
export function carriage(cols) {
  if (!ready()) return 0;
  const t = ac.currentTime + 0.01;
  const n = Math.max(3, Math.min(18, Math.round(cols / 4)));
  const dur = 0.08 + cols * 0.006;
  for (let i = 0; i < n; i++) burst(t + (i / n) * dur, 4200 + Math.random() * 800, 5, 0.1, 0.01);
  burst(t, 1600, 0.7, 0.12, dur + 0.05, 'lowpass');
  tone(t + dur, 120, 0.5, 0.08, 'sine', 60);
  burst(t + dur, 2600, 1.2, 0.35, 0.03);
  return dur;
}
export function pull() {
  if (!ready()) return;
  const t = ac.currentTime + 0.01;
  const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
  const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(3600, t + 0.55);
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
  s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + 0.7);
}
