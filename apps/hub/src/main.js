import '@fontsource-variable/bricolage-grotesque/standard.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import './styles/base.css';
import './styles/hub.css';
import './styles/chamber.css';

import { fetchManifest } from './data.js';
import { createGallery } from './gallery.js';
import { createPreview } from './preview.js';
import { createStage } from './stage.js';

const PREVIEW_HASH = '#/onizleme/';

const params = new URLSearchParams(location.search);
const stage = createStage(document.querySelector('[data-stage]'), { forceStatic: params.has('static') });

let loaded = false;
let pushedHash = false;
let closingFromHistory = false;

const gallery = createGallery(document.querySelector('#galeri'), {
  onOpen: (slug, card) => openPreview(slug, card),
  onFocusProject: (project) => {
    if (!preview.current) stage.focus(project);
  },
});

const preview = createPreview(document.querySelector('[data-chamber]'), {
  getOrigin: () => location.origin,
  onClose() {
    stage.mode('gallery');
    if (closingFromHistory) return;
    if (pushedHash) {
      pushedHash = false;
      history.back();
    } else if (location.hash.startsWith(PREVIEW_HASH)) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  },
});

function openPreview(slug, card) {
  const project = gallery.project(slug);
  if (!project) return false;
  const hash = PREVIEW_HASH + encodeURIComponent(slug);
  if (location.hash !== hash) {
    // Önizlemeden önizlemeye geçişte geçmişi şişirme.
    if (preview.current) history.replaceState(null, '', hash);
    else {
      history.pushState(null, '', hash);
      pushedHash = true;
    }
  }
  stage.focus(project);
  stage.mode('preview');
  preview.open(project, card);
  return true;
}

function slugFromHash() {
  return location.hash.startsWith(PREVIEW_HASH) ? decodeURIComponent(location.hash.slice(PREVIEW_HASH.length)) : null;
}

async function syncFromHash() {
  const slug = slugFromHash();
  if (slug && loaded) {
    if (preview.current?.slug === slug) return;
    if (!openPreview(slug, gallery.cardFor(slug))) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  } else if (!slug && preview.current) {
    closingFromHistory = true;
    pushedHash = false;
    await preview.close();
    closingFromHistory = false;
  }
}

async function load() {
  try {
    const data = await fetchManifest();
    gallery.setData(data);
    loaded = true;
    // Açık önizlemedeki proje metadata'sı değiştiyse başlığı tazele.
    if (preview.current) {
      const fresh = gallery.project(preview.current.slug);
      if (fresh) preview.update(fresh);
    }
    syncFromHash();
  } catch {
    gallery.showLoadError();
  }
}

addEventListener('popstate', syncFromHash);

document.addEventListener('click', async (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'focus-search') {
    document.querySelector('#galeri').scrollIntoView({ block: 'start' });
    gallery.focusSearch();
  } else if (action === 'clear-filters') {
    gallery.clearFilters();
  } else if (action === 'retry') {
    load();
  } else if (action === 'copy-command') {
    const button = e.target.closest('button');
    const code = document.querySelector('[data-command]');
    try {
      await navigator.clipboard.writeText(code.textContent);
      button.textContent = 'Kopyalandı';
      setTimeout(() => { button.textContent = 'Kopyala'; }, 1600);
    } catch {
      getSelection().selectAllChildren(code);
    }
  }
});

// "/" ile arama
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || preview.current) return;
  const t = e.target;
  if (t.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  const search = document.querySelector('#search');
  if (!search || search.closest('[hidden]')) return;
  e.preventDefault();
  document.querySelector('#galeri').scrollIntoView({ block: 'start' });
  gallery.focusSearch();
});

// İmza: galeride klavyeden yazılan küçük bir sözcük
let typed = '';
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || preview.current || e.key.length !== 1) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  typed = (typed + e.key.toLocaleLowerCase('tr')).slice(-4);
  if (typed === 'saye') { typed = ''; stage.spell('SAYE'); }
});

addEventListener('pagehide', (e) => {
  if (!e.persisted) {
    stage.destroy();
    gallery.destroy();
  }
});

load();

// Geliştirmede: projects/ değişince listeyi tazele, açık önizlemeyi yeniden yükle.
if (import.meta.hot) {
  let timer = 0;
  const changed = new Set();
  import.meta.hot.on('playground:changed', ({ slug }) => {
    changed.add(slug);
    clearTimeout(timer);
    timer = setTimeout(() => {
      const slugs = [...changed];
      changed.clear();
      load();
      for (const s of slugs) if (s) preview.reloadIf(s);
    }, 180);
  });
}
