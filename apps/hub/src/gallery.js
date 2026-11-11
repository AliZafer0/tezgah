// Galeri: kartlar, arama, etiket filtresi ve boş durumlar.
import { glyphTexture, hexToRgb, monogram, normalize, signature } from './data.js';

const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...children);
  return node;
}

export function statusLabel(status) {
  return status === 'draft' ? 'Taslak' : 'Hazır';
}

function setAccentVars(node, accent) {
  const [r, g, b] = hexToRgb(accent);
  node.style.setProperty('--accent', accent);
  node.style.setProperty('--accent-soft', `rgb(${r} ${g} ${b} / 0.28)`);
  node.style.setProperty('--accent-glow', `rgb(${r} ${g} ${b} / 0.4)`);
}

function coverFor(project, sig) {
  const cover = el('div', { class: 'card-cover' });
  const generated = () => el('div', { class: 'cover-gen' }, [
    el('pre', { class: 'cover-glyphs', 'aria-hidden': 'true', text: glyphTexture(sig.seed) }),
    el('span', { class: 'cover-mono', 'aria-hidden': 'true', text: monogram(project.title) }),
  ]);
  if (project.cover) {
    const img = el('img', { src: project.cover, alt: '', loading: 'lazy', decoding: 'async' });
    img.addEventListener('error', () => img.replaceWith(generated()), { once: true });
    cover.append(img);
  } else {
    cover.append(generated());
  }
  cover.append(el('span', { class: 'status-badge', dataset: { status: project.status }, text: statusLabel(project.status) }));
  return cover;
}

function renderCard(project) {
  const sig = signature(project);
  const descId = `desc-${project.slug}`;
  const open = el('button', { type: 'button', class: 'card-open', 'aria-describedby': descId, dataset: { open: project.slug } }, [
    project.title,
    el('span', { class: 'visually-hidden', text: `, ${statusLabel(project.status).toLocaleLowerCase('tr')}, önizlemeyi aç` }),
  ]);
  const tags = project.tags.length
    ? el('ul', { class: 'card-tags', 'aria-label': 'Etiketler' }, project.tags.map((t) => el('li', { text: t })))
    : el('span');
  const card = el('article', { class: 'card', dataset: { status: project.status } }, [
    coverFor(project, sig),
    el('div', { class: 'card-body' }, [
      el('h3', { class: 'card-title' }, [open]),
      el('p', { class: 'card-desc', id: descId, text: project.description }),
      el('div', { class: 'card-foot' }, [
        tags,
        el('a', { class: 'card-direct', href: project.url, target: '_blank', rel: 'noopener' }, [
          'Doğrudan aç',
          el('span', { class: 'visually-hidden', text: ' (yeni sekmede)' }),
        ]),
      ]),
    ]),
  ]);
  setAccentVars(card, sig.accent);
  const item = el('li', { class: 'card-item', dataset: { slug: project.slug } }, [card]);
  item._search = normalize(`${project.title} ${project.description}`);
  return item;
}

/** Kart eğimi: yalnızca hassas işaretçide ve hareket azaltılmamışsa. */
function attachTilt(list) {
  let frame = 0;
  let pending = null;
  const apply = () => {
    frame = 0;
    if (!pending) return;
    const { card, x, y } = pending;
    card.style.setProperty('--rx', `${(-y * 5).toFixed(2)}deg`);
    card.style.setProperty('--ry', `${(x * 6).toFixed(2)}deg`);
  };
  const onMove = (e) => {
    if (!finePointer.matches || reducedMotion.matches) return;
    const card = e.target.closest?.('.card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    pending = { card, x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 };
    frame ||= requestAnimationFrame(apply);
  };
  const reset = (e) => {
    const card = e.target.closest?.('.card');
    if (!card || card.contains(e.relatedTarget)) return;
    if (pending?.card === card) pending = null;
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
  };
  list.addEventListener('pointermove', onMove);
  list.addEventListener('pointerout', reset);
  return () => {
    list.removeEventListener('pointermove', onMove);
    list.removeEventListener('pointerout', reset);
    cancelAnimationFrame(frame);
  };
}

export function createGallery(root, { onOpen, onFocusProject }) {
  const list = root.querySelector('[data-cards]');
  const search = root.querySelector('#search');
  const tagsBox = root.querySelector('[data-tags]');
  const controls = root.querySelector('[data-controls]');
  const count = root.querySelector('[data-result-count]');
  const navCount = document.querySelector('[data-count]');
  const noResults = root.querySelector('[data-no-results]');
  const empty = root.querySelector('[data-empty]');
  const loadError = root.querySelector('[data-load-error]');
  const issuesBox = root.querySelector('[data-issues]');

  const state = { projects: [], query: '', tags: new Set(), items: new Map() };

  function renderTags() {
    const all = [...new Set(state.projects.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b, 'tr'));
    for (const t of [...state.tags]) if (!all.includes(t)) state.tags.delete(t);
    tagsBox.replaceChildren(...all.map((t) => el('button', {
      type: 'button', class: 'tag', 'aria-pressed': String(state.tags.has(t)), dataset: { tag: t }, text: t,
    })));
    tagsBox.hidden = all.length === 0;
  }

  function renderIssues(issues) {
    issuesBox.hidden = issues.length === 0;
    if (!issues.length) return;
    const errors = issues.filter((i) => i.level === 'error').length;
    const warnings = issues.length - errors;
    const parts = [];
    if (errors) parts.push(`${errors} klasör galeride gösterilemiyor`);
    if (warnings) parts.push(`${warnings} projede uyarı var`);
    issuesBox.querySelector('[data-issues-summary]').textContent = parts.join(', ');
    issuesBox.querySelector('[data-issues-list]').replaceChildren(...issues.map((i) => el('li', {}, [
      el('code', { text: `${i.dir}/` }),
      el('ul', { class: 'issue-messages' }, i.messages.map((m) => el('li', { text: m }))),
    ])));
  }

  function applyFilters({ animate = false } = {}) {
    const q = normalize(state.query.trim());
    let visible = 0;
    for (const p of state.projects) {
      const item = state.items.get(p.slug);
      const match = (!q || item._search.includes(q)) && (state.tags.size === 0 || p.tags.some((t) => state.tags.has(t)));
      const wasHidden = item.hidden;
      item.hidden = !match;
      if (match) {
        visible++;
        if (animate && wasHidden && !reducedMotion.matches) {
          item.classList.remove('is-entering');
          void item.offsetWidth; // aynı animasyonu yeniden başlatmak için
          item.classList.add('is-entering');
        }
      }
    }
    const total = state.projects.length;
    const filtered = q || state.tags.size;
    count.textContent = total === 0 ? '' : filtered ? `${visible} / ${total} deney` : `${total} deney`;
    noResults.hidden = !(total > 0 && visible === 0);
  }

  function setData({ projects, issues }) {
    state.projects = projects;
    loadError.hidden = true;
    const keep = new Map();
    const items = projects.map((p) => {
      // Aynı slug ve içerikteki kartı koru (odak ve animasyon kaybolmasın).
      const key = JSON.stringify(p);
      const old = state.items.get(p.slug);
      const item = old && old._key === key ? old : renderCard(p);
      item._key = key;
      keep.set(p.slug, item);
      return item;
    });
    const focusedSlug = document.activeElement?.closest?.('.card-item')?.dataset.slug;
    list.replaceChildren(...items);
    state.items = keep;
    if (focusedSlug && keep.has(focusedSlug)) keep.get(focusedSlug).querySelector('.card-open')?.focus({ preventScroll: true });
    list.setAttribute('aria-busy', 'false');
    controls.hidden = projects.length === 0;
    empty.hidden = projects.length > 0;
    navCount.textContent = projects.length ? String(projects.length) : '';
    document.querySelector('[data-action="focus-search"]').hidden = projects.length === 0;
    renderTags();
    renderIssues(issues);
    applyFilters();
  }

  function showLoadError() {
    list.setAttribute('aria-busy', 'false');
    loadError.hidden = false;
    count.textContent = '';
  }

  function clearFilters() {
    state.query = '';
    search.value = '';
    state.tags.clear();
    renderTags();
    applyFilters({ animate: true });
    search.focus();
  }

  search.addEventListener('input', () => {
    state.query = search.value;
    applyFilters({ animate: true });
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && search.value) {
      e.stopPropagation();
      search.value = '';
      state.query = '';
      applyFilters({ animate: true });
    }
  });

  tagsBox.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tag]');
    if (!btn) return;
    const t = btn.dataset.tag;
    if (state.tags.has(t)) state.tags.delete(t);
    else state.tags.add(t);
    btn.setAttribute('aria-pressed', String(state.tags.has(t)));
    applyFilters({ animate: true });
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open]');
    if (btn) onOpen(btn.dataset.open, btn.closest('.card'));
  });

  // Kartın üzerine gelmek veya odaklanmak sahneyi o projeye ayarlar.
  let hoverTimer = 0;
  const focusFrom = (target) => {
    const slug = target?.closest?.('.card-item')?.dataset.slug ?? null;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => onFocusProject(state.projects.find((p) => p.slug === slug) ?? null), slug ? 60 : 220);
  };
  list.addEventListener('pointerover', (e) => { if (e.pointerType !== 'touch') focusFrom(e.target); });
  list.addEventListener('pointerleave', () => focusFrom(null));
  list.addEventListener('focusin', (e) => focusFrom(e.target));
  list.addEventListener('focusout', (e) => { if (!list.contains(e.relatedTarget)) focusFrom(null); });

  const detachTilt = attachTilt(list);

  return {
    setData,
    showLoadError,
    clearFilters,
    focusSearch() {
      search.focus();
      search.select();
    },
    cardFor(slug) {
      return state.items.get(slug)?.querySelector('.card') ?? null;
    },
    project(slug) {
      return state.projects.find((p) => p.slug === slug) ?? null;
    },
    destroy() {
      detachTilt();
      clearTimeout(hoverTimer);
    },
  };
}
