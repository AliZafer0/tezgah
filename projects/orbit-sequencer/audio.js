// Web Audio: prosedürel sesler ve ses saatine dayalı ileri zamanlayıcı.
// Sesler herhangi bir BaseAudioContext ile çalışır (OfflineAudioContext ile test edilebilir).
import { RINGS, STEPS, pitchFor } from './patterns.js';

const LOOKAHEAD = 0.12; // saniye: bu kadar ilerisi önceden planlanır
const TICK_MS = 25; // planlayıcının uyanma aralığı (yalnızca tetik; zaman ses saatinden)

const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

/** Ana zincir: oturum yolu → ana ses → sınırlayıcı → çıkış. */
export class Engine {
  constructor(ctx) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    // Çok sesli anlarda tepe kırpılmasın: yumuşak bir sınırlayıcı
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -9;
    this.limiter.knee.value = 4;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.18;
    this.master.connect(this.limiter).connect(ctx.destination);
    this.noise = this.makeNoise();
    this.liveVoices = 0;
  }

  makeNoise() {
    const len = Math.floor(this.ctx.sampleRate * 0.5);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 22222;
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }
    return buf;
  }

  /** Ses seviyesi 0–1 (algısal eğri) */
  setVolume(volume, muted, at = this.ctx.currentTime) {
    const target = muted ? 0 : volume * volume * 0.9;
    this.master.gain.cancelScheduledValues(at);
    this.master.gain.setTargetAtTime(target, at, 0.03);
  }

  /** Klik oluşmasın diye her ses sıfırdan başlayıp sıfıra iner. */
  envelope(gain, t, peak, attack, decay) {
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    gain.gain.linearRampToValueAtTime(0, t + attack + decay + 0.02);
    return t + attack + decay + 0.04;
  }

  track(nodes, sources, end, sessionVoices) {
    this.liveVoices++;
    const voice = { sources, end };
    sessionVoices?.add(voice);
    sources[0].onended = () => {
      this.liveVoices--;
      sessionVoices?.delete(voice);
      for (const n of nodes) n.disconnect();
    };
    for (const s of sources) s.stop(end);
  }

  play(ring, step, t, dest, sessionVoices) {
    const ctx = this.ctx;
    const midi = pitchFor(ring, step);
    const g = ctx.createGain();
    g.connect(dest);

    if (ring === 0) {
      // Yumuşak bas darbesi: perdesi kısa sürede yerine oturan sinüs + hafif üçgen
      const f = midiToHz(midi);
      const o = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o.type = 'sine';
      o2.type = 'triangle';
      o.frequency.setValueAtTime(f * 2.2, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
      o2.frequency.setValueAtTime(f * 2, t);
      g2.gain.value = 0.18;
      o.connect(g);
      o2.connect(g2).connect(g);
      const end = this.envelope(g, t, 0.55, 0.005, 0.42);
      o.start(t);
      o2.start(t);
      this.track([o, o2, g2, g], [o, o2], end, sessionVoices);
    } else if (ring === 1) {
      // Sıcak synth: iki hafif ayrık testere → kapanan alçak geçiren süzgeç
      const f = midiToHz(midi);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 2;
      lp.frequency.setValueAtTime(2400, t);
      lp.frequency.exponentialRampToValueAtTime(520, t + 0.28);
      const oscs = [-6, 6].map((cents) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = cents;
        o.connect(lp);
        o.start(t);
        return o;
      });
      lp.connect(g);
      const end = this.envelope(g, t, 0.16, 0.012, 0.32);
      this.track([...oscs, lp, g], oscs, end, sessionVoices);
    } else if (ring === 2) {
      // Berrak çan: FM sinüs, modülasyon derinliği hızla söner
      const f = midiToHz(midi);
      const car = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      car.frequency.value = f;
      mod.frequency.value = f * 3.5;
      modGain.gain.setValueAtTime(f * 1.6, t);
      modGain.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.5);
      mod.connect(modGain).connect(car.frequency);
      car.connect(g);
      const end = this.envelope(g, t, 0.16, 0.003, 1.1);
      car.start(t);
      mod.start(t);
      this.track([car, mod, modGain, g], [car, mod], end, sessionVoices);
    } else {
      // Hafif perküsyon: vuruş başlarında tok, aralarda ince
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      const onBeat = step % 4 === 0;
      filter.type = onBeat ? 'bandpass' : 'highpass';
      filter.frequency.value = onBeat ? 1700 : 7200;
      filter.Q.value = onBeat ? 1.2 : 0.7;
      src.connect(filter).connect(g);
      const end = this.envelope(g, t, onBeat ? 0.2 : step % 2 ? 0.07 : 0.1, 0.002, onBeat ? 0.09 : 0.05);
      src.start(t, Math.random() * 0.3);
      this.track([src, filter, g], [src], end, sessionVoices);
    }
  }
}

/**
 * Ses saatine bağlı döngü. Tek bir zamanlayıcı vardır; start iki kez çağrılsa da
 * ikinci planlayıcı oluşmaz. Duraklatınca oturum yolu hızla kısılıp ayrılır,
 * o oturumda planlanmış notalar durdurulur.
 */
export class Sequencer {
  constructor(engine, getNotes, onStep) {
    this.engine = engine;
    this.ctx = engine.ctx;
    this.getNotes = getNotes;
    this.onStep = onStep; // ({ step, time, duration, rings }) her planlanan adım için
    this.timer = null;
    this.bpm = 100;
    this.nextStep = 0;
    this.nextTime = 0;
    this.session = null;
    this.timeline = []; // görsel eşleşme için planlanmış adımlar
  }

  get stepDuration() {
    return 60 / this.bpm / 4; // 16'lık nota
  }

  get playing() {
    return this.timer !== null;
  }

  setBpm(bpm) {
    this.bpm = bpm; // sıradaki adım yeni süreyle planlanır; zaman çizgisi kaymaz
  }

  start(fromStep = 0) {
    if (this.timer !== null) return;
    const bus = this.ctx.createGain();
    bus.connect(this.engine.master);
    this.session = { bus, voices: new Set() };
    this.nextStep = fromStep % STEPS;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.timeline = [];
    this.schedule();
    this.timer = setInterval(() => this.schedule(), TICK_MS);
  }

  schedule() {
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    const notes = this.getNotes();
    while (this.nextTime < horizon) {
      const step = this.nextStep;
      const time = this.nextTime;
      const duration = this.stepDuration;
      const rings = [];
      for (let r = 0; r < RINGS.length; r++) {
        if (notes[r][step]) {
          this.engine.play(r, step, time, this.session.bus, this.session.voices);
          rings.push(r);
        }
      }
      const entry = { step, time, duration, rings };
      this.timeline.push(entry);
      this.onStep?.(entry);
      this.nextTime += duration;
      this.nextStep = (step + 1) % STEPS;
    }
    // Görsel için yalnızca yakın geçmiş tutulur
    const keepFrom = this.ctx.currentTime - 1;
    while (this.timeline.length > 2 && this.timeline[1].time < keepFrom) this.timeline.shift();
  }

  /** Şu anki konum (ör. 5.4 = 5. adımın %40'ı); çalmıyorsa null. */
  position(now = this.ctx.currentTime) {
    const tl = this.timeline;
    for (let i = tl.length - 1; i >= 0; i--) {
      if (tl[i].time <= now) return tl[i].step + Math.min(1, (now - tl[i].time) / tl[i].duration);
    }
    return null;
  }

  stop() {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
    const now = this.ctx.currentTime;
    const { bus, voices } = this.session;
    bus.gain.setValueAtTime(bus.gain.value, now);
    bus.gain.linearRampToValueAtTime(0, now + 0.03);
    for (const v of voices) for (const s of v.sources) {
      try { s.stop(now + 0.04); } catch { /* zaten durmuş */ }
    }
    setTimeout(() => bus.disconnect(), 120);
    this.session = null;
  }
}
