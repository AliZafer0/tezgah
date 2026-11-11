// Önizleme odası: projeyi sandbox'lı bir iframe içinde açar.
import { hexToRgb, signature } from './data.js';
import { statusLabel } from './gallery.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const LOAD_TIMEOUT = 15000;

// Metadata izinleri → iframe sandbox belirteçleri ve Permissions Policy.
// allow-same-origin hiçbir durumda verilmez (bkz. README, "Önizleme ve güven sınırı").
const SANDBOX_FOR = { 'pointer-lock': 'allow-pointer-lock' };
const ALLOW_FOR = {
  fullscreen: 'fullscreen', autoplay: 'autoplay', camera: 'camera', microphone: 'microphone',
  accelerometer: 'accelerometer', gyroscope: 'gyroscope', 'clipboard-write': 'clipboard-write',
};

export function frameAttributes(permissions = []) {
  const sandbox = ['allow-scripts'];
  const allow = [];
  for (const p of permissions) {
    if (SANDBOX_FOR[p]) sandbox.push(SANDBOX_FOR[p]);
    if (ALLOW_FOR[p]) allow.push(ALLOW_FOR[p]);
  }
  return { sandbox: sandbox.join(' '), allow: allow.join('; ') };
}

export function createPreview(dialog, { onClose, getOrigin }) {
  const title = dialog.querySelector('[data-chamber-title]');
  const status = dialog.querySelector('[data-chamber-status]');
  const openLink = dialog.querySelector('[data-chamber-open]');
  const frame = dialog.querySelector('[data-frame]');
  const stateBox = dialog.querySelector('[data-frame-state]');
  const loading = dialog.querySelector('[data-frame-loading]');
  const errorBox = dialog.querySelector('[data-frame-error]');
  const errorTitle = dialog.querySelector('[data-frame-error-title]');
  const errorText = dialog.querySelector('[data-frame-error-text]');
  const errorOpen = dialog.querySelector('[data-frame-error-open]');
  const radios = [...dialog.querySelectorAll('[role="radio"][data-viewport]')];
  let iframe = dialog.querySelector('[data-iframe]');

  let current = null;
  let loadToken = 0;
  let timeout = 0;
  let closing = null;

  function showState(kind, { heading, text } = {}) {
    stateBox.hidden = kind === 'none';
    loading.hidden = kind !== 'loading';
    errorBox.hidden = kind !== 'error';
    if (kind === 'error') {
      errorTitle.textContent = heading;
      errorText.textContent = text;
    }
  }

  function freshIframe(project) {
    // Her yüklemede yeni iframe: önceki projenin betikleri ve döngüleri tamamen kapanır.
    const next = document.createElement('iframe');
    const { sandbox, allow } = frameAttributes(project.permissions);
    next.setAttribute('sandbox', sandbox);
    if (allow) next.setAttribute('allow', allow);
    next.setAttribute('referrerpolicy', 'no-referrer');
    next.setAttribute('title', `${project.title} önizlemesi`);
    next.dataset.iframe = '';
    iframe.replaceWith(next);
    iframe = next;
    return next;
  }

  async function load() {
    if (!current) return;
    const project = current;
    const token = ++loadToken;
    clearTimeout(timeout);
    showState('loading');
    const target = freshIframe(project);

    try {
      const res = await fetch(project.url, { method: 'HEAD', cache: 'no-store' });
      if (token !== loadToken) return;
      if (!res.ok) {
        showState('error', {
          heading: 'Önizleme açılamadı.',
          text: res.status === 404
            ? 'Projenin giriş dosyası bulunamadı. Dosya taşınmış ya da silinmiş olabilir.'
            : `Sunucu ${res.status} yanıtı verdi.`,
        });
        return;
      }
    } catch {
      if (token !== loadToken) return;
      showState('error', { heading: 'Sunucuya ulaşılamadı.', text: 'Geliştirme sunucusunun çalıştığından emin ol.' });
      return;
    }

    target.addEventListener('load', () => {
      if (token !== loadToken) return;
      clearTimeout(timeout);
      showState('none');
    }, { once: true });
    timeout = setTimeout(() => {
      if (token !== loadToken) return;
      showState('error', {
        heading: 'Önizleme yanıt vermiyor.',
        text: 'Sayfa 15 saniyede yüklenmedi. Yeniden dene ya da yeni sekmede aç.',
      });
    }, LOAD_TIMEOUT);
    target.src = project.url;
  }

  function setViewport(value, { focus = false } = {}) {
    frame.dataset.width = value;
    for (const r of radios) {
      const on = r.dataset.viewport === value;
      r.setAttribute('aria-checked', String(on));
      r.tabIndex = on ? 0 : -1;
      if (on && focus) r.focus();
    }
  }

  function flipFrom(rect, { reverse = false } = {}) {
    if (!rect || reducedMotion.matches) return null;
    const to = frame.getBoundingClientRect();
    if (!to.width || !to.height) return null;
    const from = {
      transform: `translate(${rect.left - to.left}px, ${rect.top - to.top}px) scale(${rect.width / to.width}, ${rect.height / to.height})`,
      opacity: 0.4,
    };
    const end = { transform: 'none', opacity: 1 };
    return frame.animate(reverse ? [end, from] : [from, end], {
      duration: reverse ? 380 : 560,
      easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
      fill: reverse ? 'forwards' : 'none',
    });
  }

  function visibleRect(card) {
    if (!card) return null;
    const r = card.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight && r.width > 0 ? r : null;
  }

  function open(project, card) {
    closing?.cancel();
    closing = null;
    const sameProject = current?.slug === project.slug && dialog.open;
    current = project;
    const sig = signature(project);
    const [r, g, b] = hexToRgb(sig.accent);
    dialog.style.setProperty('--accent', sig.accent);
    dialog.style.setProperty('--accent-glow', `rgb(${r} ${g} ${b} / 0.4)`);
    title.textContent = project.title;
    status.textContent = statusLabel(project.status);
    status.dataset.status = project.status;
    const absolute = new URL(project.url, getOrigin()).href;
    openLink.href = absolute;
    errorOpen.href = absolute;
    if (sameProject) return;

    if (!dialog.open) {
      setViewport(frame.dataset.width || 'full');
      dialog.showModal();
      flipFrom(visibleRect(card));
    }
    load();
  }

  async function close({ returnFocus = true } = {}) {
    if (!dialog.open || closing) return;
    const project = current;
    const card = project ? document.querySelector(`.card-item[data-slug="${CSS.escape(project.slug)}"] .card`) : null;
    closing = flipFrom(visibleRect(card), { reverse: true });
    if (closing) {
      try { await closing.finished; } catch { /* yeni bir açılış iptal etti */ return; }
    }
    closing?.cancel();
    closing = null;
    loadToken++;
    clearTimeout(timeout);
    dialog.close();
    // iframe'i boşalt: proje animasyonları ve sesleri arka planda çalışmaya devam etmesin.
    freshIframe({ title: 'Proje', permissions: [] });
    current = null;
    if (returnFocus) card?.querySelector('.card-open')?.focus({ preventScroll: false });
    onClose(project);
  }

  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });

  dialog.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'close-preview') close();
    else if (action === 'reload-preview') load();
    const vp = e.target.closest('[data-viewport]');
    if (vp && vp.getAttribute('role') === 'radio') setViewport(vp.dataset.viewport);
  });

  // Radyo grubunda ok tuşlarıyla gezinme
  dialog.querySelector('.viewport-switch').addEventListener('keydown', (e) => {
    const i = radios.findIndex((r) => r.getAttribute('aria-checked') === 'true');
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = radios[(i + 1) % radios.length];
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = radios[(i - 1 + radios.length) % radios.length];
    if (next) {
      e.preventDefault();
      setViewport(next.dataset.viewport, { focus: true });
    }
  });

  setViewport('full');

  return {
    open,
    close,
    get current() { return current; },
    reloadIf(slug) {
      if (current && (!slug || current.slug === slug)) load();
    },
    update(project) {
      if (current?.slug === project.slug) {
        current = project;
        title.textContent = project.title;
      }
    },
  };
}
