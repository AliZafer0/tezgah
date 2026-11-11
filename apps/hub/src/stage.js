// Sahne katmanı: WebGL varsa 3D çekirdeği tembel yükler, yoksa statik görünüm kalır.
// Galeri bu modülü beklemez; sahne hazır olana kadar statik görünüm gösterilir.

const STORAGE_KEY = 'playground:motion';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function readPaused() {
  try { return localStorage.getItem(STORAGE_KEY) === 'paused'; } catch { return false; }
}

function writePaused(v) {
  try { localStorage.setItem(STORAGE_KEY, v ? 'paused' : 'playing'); } catch { /* depolama yoksa yalnızca bu oturum */ }
}

function supportsWebGL() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

export function createStage(stageEl, { forceStatic = false } = {}) {
  const root = document.documentElement;
  const canvas = stageEl.querySelector('[data-canvas]');
  const caption = stageEl.querySelector('[data-stage-focus]');
  const toggle = stageEl.querySelector('[data-action="toggle-motion"]');
  const toggleLabel = stageEl.querySelector('[data-motion-label]');

  let scene = null;
  let destroyed = false;
  let paused = readPaused();
  const pending = { focus: null, mode: 'gallery' };
  const cleanups = [];

  function setFallback() {
    root.dataset.scene = 'fallback';
    toggle.hidden = true;
  }

  function syncToggle() {
    toggle.hidden = !scene || reducedMotion.matches;
    toggle.setAttribute('aria-pressed', String(paused));
    toggleLabel.textContent = paused ? 'Hareketi başlat' : 'Hareketi durdur';
  }

  function showCaption(project) {
    if (!project) {
      caption.classList.remove('is-visible');
      return;
    }
    const title = document.createElement('strong');
    title.textContent = project.title;
    caption.replaceChildren(title, project.tags.slice(0, 3).join(', '));
    caption.classList.add('is-visible');
  }

  async function init() {
    if (destroyed) return;
    if (forceStatic || !supportsWebGL()) return setFallback();
    try {
      const { createCoreScene } = await import('./scene/core-scene.js');
      if (destroyed) return;
      scene = await createCoreScene(canvas, {
        reducedMotion: reducedMotion.matches,
        paused,
        onLost() {
          scene?.dispose();
          scene = null;
          setFallback();
        },
      });
      if (destroyed) return scene.dispose();
      scene.setFocus(pending.focus);
      scene.setMode(pending.mode);
      root.dataset.scene = 'ready';
      syncToggle();

      const io = new IntersectionObserver(([entry]) => scene?.setVisible(entry.isIntersecting), { threshold: 0 });
      io.observe(stageEl);
      cleanups.push(() => io.disconnect());
    } catch (err) {
      console.warn('3D sahne başlatılamadı; statik görünüm kullanılıyor.', err);
      scene?.dispose();
      scene = null;
      setFallback();
    }
  }

  const onReducedChange = () => {
    scene?.setReducedMotion(reducedMotion.matches);
    syncToggle();
  };
  reducedMotion.addEventListener('change', onReducedChange);
  cleanups.push(() => reducedMotion.removeEventListener('change', onReducedChange));

  const onToggle = () => {
    paused = !paused;
    writePaused(paused);
    scene?.setPaused(paused);
    syncToggle();
  };
  toggle.addEventListener('click', onToggle);
  cleanups.push(() => toggle.removeEventListener('click', onToggle));

  // Galeri ilk boyandıktan sonra, boşta kalınan ilk anda yükle.
  const schedule = window.requestIdleCallback ?? ((cb) => setTimeout(cb, 200));
  schedule(() => init(), { timeout: 1200 });

  return {
    focus(project) {
      pending.focus = project;
      showCaption(project);
      scene?.setFocus(project);
    },
    mode(mode) {
      pending.mode = mode;
      scene?.setMode(mode);
    },
    spell(text) {
      scene?.spell(text);
    },
    destroy() {
      destroyed = true;
      for (const c of cleanups) c();
      scene?.dispose();
      scene = null;
    },
  };
}
