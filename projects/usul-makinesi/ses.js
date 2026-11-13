// Usul Makinesi — örneksiz davul sentezi ve ses saatine bağlı ileri zamanlayıcı.
// Her vuruş, çalınacağı andan ~0,12 sn önce AudioContext saatine yerleştirilir; setTimeout sarsıntısı ritme yansımaz.

let ac = null; let out = null; let noise = null;

export function audio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return ac; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ac = new AC({ latencyHint: 'interactive' });
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
  out = ac.createGain(); out.gain.value = 0.85;
  out.connect(comp).connect(ac.destination);
  noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}

// Çalgı ön ayarları: düm = perdesi düşen gövde, tek = deri tokadı (süzülmüş gürültü + kısa ton)
const PRESET = {
  k: { // kudüm: iki küçük bakır kase, sert tokmak; tek tiz ve çınlamalı
    dum: { f0: 132, f1: 82, dec: 0.5, bodyGain: 1.0, click: 0.35, clickF: 900 },
    tek: { tone: 520, toneDec: 0.22, toneGain: 0.45, nf: 2600, nq: 3, ndec: 0.06, ngain: 0.55 },
  },
  d: { // darbuka: derin düm, kuru ve parlak tek
    dum: { f0: 150, f1: 62, dec: 0.38, bodyGain: 1.0, click: 0.5, clickF: 1600 },
    tek: { tone: 820, toneDec: 0.05, toneGain: 0.3, nf: 4200, nq: 1.4, ndec: 0.055, ngain: 0.8 },
  },
  b: { // bendir: geniş çerçeve, uzun ve vızıltılı düm
    dum: { f0: 84, f1: 50, dec: 0.95, bodyGain: 1.0, click: 0.2, clickF: 500, buzz: 0.22 },
    tek: { tone: 310, toneDec: 0.12, toneGain: 0.35, nf: 1700, nq: 1.2, ndec: 0.12, ngain: 0.6, buzz: 0.12 },
  },
};

function env(g, t, peak, dec, attack = 0.002) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dec);
}
function noiseHit(t, type, f, q, peak, dec) {
  const src = ac.createBufferSource(); src.buffer = noise;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const filt = ac.createBiquadFilter(); filt.type = type; filt.frequency.value = f; filt.Q.value = q;
  const g = ac.createGain(); env(g, t, peak, dec);
  src.connect(filt).connect(g).connect(out);
  src.start(t, Math.random() * 0.5, dec + 0.05);
}
function toneHit(t, type, f0, f1, peak, dec) {
  const o = ac.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dec * 0.6);
  const g = ac.createGain(); env(g, t, peak, dec);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + dec + 0.05);
}

export function hit(stroke, t, ses = 'k', vel = 1) {
  if (!ac || stroke === '-') return;
  const p = PRESET[ses];
  if (stroke === 'D') {
    const d = p.dum;
    toneHit(t, 'sine', d.f0, d.f1, 0.95 * vel * d.bodyGain, d.dec);
    toneHit(t, 'triangle', d.f0 * 2.02, d.f1 * 1.6, 0.12 * vel, d.dec * 0.35);
    noiseHit(t, 'lowpass', d.clickF, 0.7, d.click * vel, 0.03);
    if (d.buzz) noiseHit(t + 0.004, 'bandpass', 1400, 0.8, d.buzz * vel, d.dec * 0.6);
  } else {
    const k = p.tek; const v = stroke === 'K' ? 0.5 * vel : vel; const lift = stroke === 'K' ? 1.08 : 1;
    toneHit(t, 'sine', k.tone * lift, k.tone * lift * 0.94, k.toneGain * v, k.toneDec);
    noiseHit(t, 'bandpass', k.nf * lift, k.nq, k.ngain * v, k.ndec);
    if (k.buzz) noiseHit(t + 0.003, 'bandpass', 1200, 0.8, k.buzz * v, k.ndec * 2);
  }
}
// devir başında halile/zil: uyumsuz kısmi tonlar + yüksek geçiren gürültü
export function zil(t, vel = 1) {
  if (!ac) return;
  for (const [f, a] of [[2960, 0.05], [4180, 0.04], [5370, 0.03], [7020, 0.02]]) toneHit(t, 'sine', f, f * 0.998, a * vel, 0.9);
  noiseHit(t, 'highpass', 7000, 0.7, 0.08 * vel, 0.25);
}

// ------------------------------------------------------------------ zamanlayıcı
export function createSequencer(getState, onStep) {
  let timer = 0; let step = 0; let next = 0; let running = false; let cycles = 0; let scheduled = 0;
  const queue = []; // { step, time, dur }
  function tick() {
    const s = getState();
    const dur = 60 / s.bpm;
    while (next < ac.currentTime + 0.12) {
      step %= s.pattern.length;
      const st = s.pattern[step];
      const human = s.nefes / 9;
      const jitter = human ? (Math.random() * 2 - 1) * human * 0.014 : 0;
      const vel = (human ? 1 - Math.random() * human * 0.35 : 1) * (step === 0 ? 1 : 0.92);
      const t = Math.max(ac.currentTime, next + jitter);
      hit(st, t, s.ses, vel);
      if (step === 0 && s.zil) zil(t);
      if (st !== '-') scheduled++;
      queue.push({ step, time: next, dur, stroke: st });
      onStep?.(step, next);
      next += dur;
      step = (step + 1) % s.pattern.length;
      if (step === 0) cycles++;
    }
    while (queue.length > 64) queue.shift();
  }
  return {
    start() {
      if (!audio()) return false;
      running = true; step = 0; cycles = 0; queue.length = 0;
      next = ac.currentTime + 0.06;
      tick(); timer = setInterval(tick, 25);
      return true;
    },
    stop() { running = false; clearInterval(timer); queue.length = 0; },
    get running() { return running; },
    // ekranda gösterilecek konum: son çalınmış vuruş ve ondan sonraki kesir
    position() {
      if (!running || !ac) return null;
      const now = ac.currentTime - (ac.outputLatency || 0);
      let cur = null;
      for (const q of queue) { if (q.time <= now) cur = q; else break; }
      if (!cur) return null;
      return { step: cur.step, frac: Math.min(1, (now - cur.time) / cur.dur), since: now - cur.time };
    },
    stats: () => ({ cycles, scheduled, contextState: ac?.state ?? 'yok' }),
    resetStep() { step = 0; },
  };
}
