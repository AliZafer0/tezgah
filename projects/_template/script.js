// 0 ve 1'lerden bir alan; işaretçinin yakınındaki karakterler parlar.
const field = document.querySelector('.field');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const pointer = { x: -99, y: -99 };
let cols = 0;
let rows = 0;
let cells = [];

function measure() {
  const probe = document.createElement('span');
  probe.textContent = '0';
  field.append(probe);
  const { width } = probe.getBoundingClientRect();
  const height = parseFloat(getComputedStyle(field).lineHeight);
  probe.remove();
  cols = Math.ceil(field.clientWidth / width);
  rows = Math.ceil(field.clientHeight / height);
  cells = Array.from({ length: cols * rows }, () => (Math.random() < 0.5 ? '0' : '1'));
  return { width, height };
}

let cell = measure();

function draw() {
  let out = '';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = cells[y * cols + x];
      const near = Math.hypot(x - pointer.x, y - pointer.y) < 4;
      out += near ? `<b>${c}</b>` : c;
    }
    out += '\n';
  }
  field.innerHTML = out;
}

function tick() {
  for (let i = 0; i < cells.length / 40; i++) {
    const k = (Math.random() * cells.length) | 0;
    cells[k] = cells[k] === '0' ? '1' : '0';
  }
  draw();
}

addEventListener('pointermove', (e) => {
  pointer.x = Math.floor(e.clientX / cell.width);
  pointer.y = Math.floor(e.clientY / cell.height);
  if (reduceMotion) draw();
});
addEventListener('resize', () => { cell = measure(); draw(); });

draw();
if (!reduceMotion) setInterval(tick, 120);
