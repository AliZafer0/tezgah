// Yörünge görünümü: notalar gerçek düğmelerdir (erişilebilir grid), halkalar,
// tarama çizgisi ve ışık tepkileri tek bir Canvas 2D üzerinde çizilir.
import { RINGS, STEPS, noteName, pitchFor } from './patterns.js';

export const RADII = [0.4, 0.56, 0.72, 0.88]; // iç → dış, yarıçapa oranla
const COLORS = ['#e8873a', '#ffd59a', '#9fd8ff', '#dfe8f1'];
const PULSE_MS = 520;

export const stepAngle = (step) => -Math.PI / 2 + (step / STEPS) * Math.PI * 2;

export function createOrbitView(stage, { onToggle, onResize }) {
  const canvas = stage.querySelector('[data-orbit-canvas]');
  const grid = stage.querySelector('[data-grid]');
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const buttons = RINGS.map(() => []);
  const pulses = []; // { ring, step, start }
  let size = 0;
  let dpr = 1;
  let focus = { ring: 0, step: 0 };

  // ---------- Erişilebilir grid ----------
  RINGS.forEach((ring, r) => {
    const row = document.createElement('div');
    row.setAttribute('role', 'row');
    row.setAttribute('aria-label', `${ring.name} halkası`);
    row.className = 'ring-row';
    for (let s = 0; s < STEPS; s++) {
      const cell = document.createElement('div');
      cell.setAttribute('role', 'gridcell');
      cell.className = 'cell';
      const a = stepAngle(s);
      cell.style.left = `${50 + Math.cos(a) * RADII[r] * 50}%`;
      cell.style.top = `${50 + Math.sin(a) * RADII[r] * 50}%`;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'note';
      b.dataset.ring = String(r);
      b.dataset.step = String(s);
      b.style.setProperty('--c', COLORS[r]);
      const pitch = pitchFor(r, s);
      b.setAttribute('aria-label', `${ring.name}, adım ${s + 1}${pitch ? `, ${noteName(pitch)}` : ''}`);
      b.setAttribute('aria-pressed', 'false');
      b.tabIndex = r === 0 && s === 0 ? 0 : -1;
      cell.append(b);
      row.append(cell);
      buttons[r].push(b);
    }
    grid.append(row);
  });

  const moveFocus = (ring, step) => {
    buttons[focus.ring][focus.step].tabIndex = -1;
    focus = { ring: (ring + RINGS.length) % RINGS.length, step: (step + STEPS) % STEPS };
    const b = buttons[focus.ring][focus.step];
    b.tabIndex = 0;
    b.focus();
  };

  const onKey = (e) => {
    const b = e.target.closest('.note');
    if (!b) return;
    const r = Number(b.dataset.ring);
    const s = Number(b.dataset.step);
    const moves = {
      ArrowRight: [r, s + 1], ArrowLeft: [r, s - 1],
      ArrowUp: [r + 1, s], ArrowDown: [r - 1, s], // yukarı: dış halka
      Home: [r, 0], End: [r, STEPS - 1],
    };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    if ((e.key === 'ArrowUp' && r === RINGS.length - 1) || (e.key === 'ArrowDown' && r === 0)) return;
    moveFocus(m[0], m[1]);
  };
  const onClick = (e) => {
    const b = e.target.closest('.note');
    if (!b) return;
    const r = Number(b.dataset.ring);
    const s = Number(b.dataset.step);
    if (focus.ring !== r || focus.step !== s) {
      buttons[focus.ring][focus.step].tabIndex = -1;
      focus = { ring: r, step: s };
      b.tabIndex = 0;
    }
    onToggle(r, s);
  };
  grid.addEventListener('keydown', onKey);
  grid.addEventListener('click', onClick);

  function setNotes(notes) {
    for (let r = 0; r < RINGS.length; r++) {
      for (let s = 0; s < STEPS; s++) {
        const on = notes[r][s];
        const b = buttons[r][s];
        if ((b.getAttribute('aria-pressed') === 'true') !== on) b.setAttribute('aria-pressed', String(on));
      }
    }
  }

  // ---------- Canvas ----------
  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    size = rect.width;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }

  function pulse(ring, step, start) {
    if (pulses.length > 96) pulses.shift();
    pulses.push({ ring, step, start });
  }

  /** @param position null (durmuş) veya 0–16 arası sürekli konum */
  function draw(position, now) {
    if (!size) resize();
    const R = size / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(R, R);

    // Katmanlı derinlik: merkezde soluk ışık, dışta ince bir kadran
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    glow.addColorStop(0, 'rgba(160, 200, 235, 0.07)');
    glow.addColorStop(0.55, 'rgba(240, 170, 90, 0.025)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();

    for (let s = 0; s < STEPS; s++) {
      const a = stepAngle(s);
      const beat = s % 4 === 0;
      const r1 = R * 0.95;
      const r2 = R * (beat ? 0.99 : 0.97);
      ctx.strokeStyle = beat ? 'rgba(220, 228, 236, 0.45)' : 'rgba(220, 228, 236, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      ctx.stroke();
    }

    RADII.forEach((f) => {
      ctx.strokeStyle = 'rgba(214, 222, 230, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, R * f, 0, Math.PI * 2);
      ctx.stroke();
    });

    const calm = reduced.matches;
    // Halka yay tepkisi ve nota ışık darbesi
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      const age = (now - p.start) / (calm ? 260 : PULSE_MS);
      if (age < 0) continue;
      if (age >= 1) { pulses.splice(i, 1); continue; }
      const fade = (1 - age) ** 2;
      const a = stepAngle(p.step);
      const rr = R * RADII[p.ring];
      ctx.strokeStyle = COLORS[p.ring];
      ctx.globalAlpha = 0.55 * fade;
      ctx.lineWidth = 2;
      const span = (Math.PI * 2) / STEPS;
      ctx.beginPath();
      ctx.arc(0, 0, rr, a - span * 0.9, a + span * 0.9);
      ctx.stroke();
      if (!calm) {
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        const radius = 8 + 18 * age;
        const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
        g.addColorStop(0, COLORS[p.ring]);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.7 * fade;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Tarama çizgisi: azaltılmış harekette adım adım ve izsiz
    if (position !== null) {
      const pos = calm ? Math.floor(position) : position;
      const a = stepAngle(pos);
      if (!calm) {
        ctx.fillStyle = 'rgba(159, 216, 255, 0.05)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R * 0.95, a - (Math.PI * 2) / STEPS, a);
        ctx.closePath();
        ctx.fill();
      }
      const grad = ctx.createLinearGradient(0, 0, Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95);
      grad.addColorStop(0, 'rgba(159, 216, 255, 0)');
      grad.addColorStop(0.25, 'rgba(159, 216, 255, 0.35)');
      grad.addColorStop(1, 'rgba(230, 244, 255, 0.85)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * R * 0.08, Math.sin(a) * R * 0.08);
      ctx.lineTo(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95);
      ctx.stroke();
    }

    // Merkez
    ctx.fillStyle = 'rgba(230, 236, 242, 0.85)';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(230, 236, 242, 0.2)';
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.08, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const ro = new ResizeObserver(() => {
    resize();
    onResize?.();
  });
  ro.observe(canvas);

  return {
    setNotes,
    draw,
    pulse,
    hasPulses: () => pulses.length > 0,
    clearPulses: () => { pulses.length = 0; },
    dispose() {
      ro.disconnect();
      grid.removeEventListener('keydown', onKey);
      grid.removeEventListener('click', onClick);
    },
  };
}
