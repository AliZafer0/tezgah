#!/usr/bin/env node
// Tarayıcı doğrulaması. Çalışan bir geliştirme sunucusu ister (npm run dev).
//   CHROME_PATH=/yol/chrome npm run test:e2e              → işlev turu (WebGL kapalı)
//   CHROME_PATH=/yol/chrome npm run test:e2e -- --webgl   → yalnızca 3D sahne turu
// Ortam: BASE_URL (varsayılan http://127.0.0.1:4780), E2E_SHOTS (ekran görüntüsü klasörü),
// E2E_NO_SANDBOX=1 (yalnızca sandbox'sız Chromium çalıştırabilen ortamlar için).
// Betik projects/ altında zz-e2e-* projeleri oluşturur ve sonunda yalnızca bunları siler.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { PROJECTS_DIR, ROOT } from '../../scripts/lib/config.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4780';
const CHROME = process.env.CHROME_PATH;
const SHOTS = process.env.E2E_SHOTS;
const WEBGL = process.argv.includes('--webgl');

if (!CHROME) {
  console.error('CHROME_PATH gerekli (Chromium/Chrome çalıştırılabilir dosyası).');
  process.exit(2);
}

const results = [];
const consoleErrors = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log(`  ✗ ${name}\n      ${String(err.message).split('\n')[0]}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
async function shot(page, name) {
  if (!SHOTS) return;
  await fs.mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}
function watchConsole(page, label, ignore = []) {
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (ignore.some((re) => re.test(text) || re.test(m.location()?.url ?? ''))) return;
    consoleErrors.push(`[${label}] ${text}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`[${label}] ${e.message}`));
}

// --- Geçici projeler --------------------------------------------------------------
const created = [];
function createProject(slug, title) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/create-project.mjs'), slug, '--title', title], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  created.push(path.join(PROJECTS_DIR, slug));
}
async function patchMeta(slug, patch) {
  const file = path.join(PROJECTS_DIR, slug, 'playground.json');
  const meta = JSON.parse(await fs.readFile(file, 'utf8'));
  await fs.writeFile(file, JSON.stringify({ ...meta, ...patch }, null, 2));
}
async function cleanup() {
  for (const dir of created) {
    if (!path.basename(dir).startsWith('zz-e2e-') || path.dirname(dir) !== PROJECTS_DIR) continue;
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  chromiumSandbox: !process.env.E2E_NO_SANDBOX,
  args: WEBGL ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--disable-3d-apis'],
});

try {
  if (!WEBGL) await functionalSuite();
  else await webglSuite();
} finally {
  await browser.close();
  await cleanup();
}

async function functionalSuite() {
  createProject('zz-e2e-birinci', 'E2E Birinci');
  await patchMeta('zz-e2e-birinci', { tags: ['css', 'deney'], status: 'ready', description: 'Göreli asset ve sandbox denemesi.' });
  const broken = path.join(PROJECTS_DIR, 'zz-e2e-bozuk');
  await fs.mkdir(broken);
  created.push(broken);
  await fs.writeFile(path.join(broken, 'playground.json'), '{ "title": "Bozuk", ');

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  watchConsole(page, 'masaüstü', [/zz-e2e-ikinci/]);
  console.log('Masaüstü (WebGL kapalı)');

  await check('galeri açılıyor, geçici proje kartı görünüyor', async () => {
    const res = await page.goto(BASE + '/');
    assert(res.status() === 200, `durum ${res.status()}`);
    await page.locator('.card-item[data-slug="zz-e2e-birinci"]').waitFor({ timeout: 10000 });
    const title = await page.locator('.card-item[data-slug="zz-e2e-birinci"] .card-title').innerText();
    assert(title.includes('E2E Birinci'), title);
  });

  await check('WebGL yokken statik sahne gösteriliyor', async () => {
    await page.waitForFunction(() => document.documentElement.dataset.scene === 'fallback', null, { timeout: 5000 });
    assert(await page.locator('.stage-fallback svg').isVisible(), 'fallback görünmüyor');
  });

  await check('hatalı metadata galeriyi bozmuyor, sorun listeleniyor', async () => {
    const issues = page.locator('[data-issues]');
    await issues.waitFor({ state: 'visible' });
    await issues.locator('summary').click();
    const text = await issues.innerText();
    assert(text.includes('zz-e2e-bozuk') && text.includes('JSON'), text);
    assert(await page.locator('.card-item').count() >= 1, 'kart yok');
  });

  await check('taslak durumu kartta açıkça belirtiliyor', async () => {
    await patchMeta('zz-e2e-birinci', { status: 'draft' });
    const badge = page.locator('.card-item[data-slug="zz-e2e-birinci"] .status-badge');
    await page.waitForFunction(() => document.querySelector('.card-item[data-slug="zz-e2e-birinci"] .status-badge')?.dataset.status === 'draft', null, { timeout: 8000 });
    assert((await badge.innerText()).includes('Taslak'), await badge.innerText());
    await patchMeta('zz-e2e-birinci', { status: 'ready' });
  });

  await check('yeni proje sayfa yenilenmeden keşfediliyor', async () => {
    createProject('zz-e2e-ikinci', 'E2E İkinci');
    await page.locator('.card-item[data-slug="zz-e2e-ikinci"]').waitFor({ timeout: 10000 });
  });

  await check('arama başlık ve açıklamada çalışıyor (Türkçe karakter duyarsız)', async () => {
    await page.fill('#search', 'IKINCI');
    await page.waitForFunction(() => {
      const visible = [...document.querySelectorAll('.card-item')].filter((li) => !li.hidden).map((li) => li.dataset.slug);
      return visible.length === 1 && visible[0] === 'zz-e2e-ikinci';
    }, null, { timeout: 3000 });
    await page.fill('#search', 'sandbox denemesi');
    await page.waitForFunction(() => [...document.querySelectorAll('.card-item')].filter((li) => !li.hidden).map((li) => li.dataset.slug).join() === 'zz-e2e-birinci');
  });

  await check('boş sonuçta filtreleri temizleme düğmesi çalışıyor', async () => {
    await page.fill('#search', 'kesinlikle-olmayan-bir-sey');
    await page.locator('[data-no-results]').waitFor({ state: 'visible' });
    await page.click('[data-action="clear-filters"]');
    await page.locator('[data-no-results]').waitFor({ state: 'hidden' });
    assert(await page.inputValue('#search') === '', 'arama temizlenmedi');
    assert(await page.locator('.card-item:not([hidden])').count() >= 2, 'kartlar dönmedi');
  });

  await check('etiket filtresi', async () => {
    const tag = page.locator('.tag[data-tag="css"]');
    await tag.click();
    assert(await tag.getAttribute('aria-pressed') === 'true', 'aria-pressed');
    const visible = await page.$$eval('.card-item', (els) => els.filter((e) => !e.hidden).map((e) => e.dataset.slug));
    assert(visible.length === 1 && visible[0] === 'zz-e2e-birinci', visible.join());
    await tag.click();
  });
  await shot(page, 'masaustu-galeri');

  await check('"/" kısayolu aramaya odaklanıyor', async () => {
    await page.locator('body').click({ position: { x: 5, y: 600 } });
    await page.keyboard.press('/');
    assert(await page.evaluate(() => document.activeElement?.id) === 'search', 'odak aramada değil');
  });

  await check('klavyeyle önizleme açılıyor; göreli CSS/JS sandbox içinde çalışıyor', async () => {
    await page.locator('.card-item[data-slug="zz-e2e-birinci"] .card-open').focus();
    const focusVisible = await page.evaluate(() => getComputedStyle(document.activeElement.closest('.card')).boxShadow);
    assert(focusVisible && focusVisible !== 'none', 'görünür odak yok');
    await page.keyboard.press('Enter');
    await page.locator('[data-chamber]').waitFor({ state: 'visible' });
    assert(page.url().endsWith('#/onizleme/zz-e2e-birinci'), page.url());
    const iframe = page.locator('[data-frame] iframe');
    assert(await iframe.getAttribute('sandbox') === 'allow-scripts', await iframe.getAttribute('sandbox'));
    await page.locator('[data-frame-state]').waitFor({ state: 'hidden', timeout: 10000 });
    const frame = page.frameLocator('[data-frame] iframe');
    await frame.locator('.field').waitFor();
    const probe = await frame.locator('body').evaluate((b) => ({
      bg: getComputedStyle(b).backgroundColor,
      glyphs: document.querySelector('.field').textContent.length,
      origin: self.origin,
      storage: (() => { try { localStorage.length; return 'açık'; } catch { return 'kapalı'; } })(),
    }));
    assert(probe.bg === 'rgb(5, 6, 8)', `style.css uygulanmadı: ${probe.bg}`);
    assert(probe.glyphs > 100, 'script.js çalışmadı');
    assert(probe.origin === 'null', `origin opak değil: ${probe.origin}`);
    assert(probe.storage === 'kapalı', 'galeri depolamasına erişim var');
    assert(await page.evaluate(() => document.activeElement?.dataset.action) === 'close-preview', 'odak geri düğmesinde değil');
  });
  await page.waitForTimeout(900);
  await shot(page, 'masaustu-onizleme');

  await check('mobil genişlik seçeneği iframe\'i 390 px yapıyor', async () => {
    await page.click('[data-viewport="mobile"]');
    await page.waitForTimeout(700);
    const box = await page.locator('[data-frame]').boundingBox();
    assert(Math.abs(box.width - 390) <= 2, `genişlik ${box.width}`);
    assert(await page.locator('[data-viewport="mobile"]').getAttribute('aria-checked') === 'true', 'aria-checked');
    assert((await page.locator('[data-viewport-note]').innerText()).includes('taklit edilmez'), 'not yok');
    await page.keyboard.press('ArrowRight');
    assert(await page.locator('[data-viewport="full"]').getAttribute('aria-checked') === 'true', 'ok tuşu');
  });
  await shot(page, 'masaustu-onizleme-mobil');

  await check('yeniden yükle iframe\'i yeniliyor; yeni sekme bağlantısı doğru', async () => {
    const before = await page.locator('[data-frame] iframe').elementHandle();
    await page.click('[data-action="reload-preview"]');
    await page.locator('[data-frame-state]').waitFor({ state: 'hidden', timeout: 10000 });
    const same = await page.evaluate((el) => el.isConnected, before);
    assert(!same, 'iframe yenilenmedi');
    const href = await page.locator('[data-chamber-open]').getAttribute('href');
    assert(href === `${BASE}/projects/zz-e2e-birinci/`, href);
    assert(await page.locator('[data-chamber-open]').getAttribute('target') === '_blank', 'target');
  });

  await check('Escape galeriye dönüyor, odak karta geri geliyor', async () => {
    await page.keyboard.press('Escape');
    await page.locator('[data-chamber]').waitFor({ state: 'hidden' });
    assert(!page.url().includes('#/onizleme'), page.url());
    const slug = await page.evaluate(() => document.activeElement?.closest('.card-item')?.dataset.slug);
    assert(slug === 'zz-e2e-birinci', `odak: ${slug}`);
  });

  await check('tarayıcı geri tuşu önizlemeyi kapatıyor; adres önizlemeyi açıyor', async () => {
    await page.click('.card-item[data-slug="zz-e2e-ikinci"] .card-open');
    await page.locator('[data-chamber]').waitFor({ state: 'visible' });
    await page.goBack();
    await page.locator('[data-chamber]').waitFor({ state: 'hidden' });
    await page.goto(BASE + '/#/onizleme/zz-e2e-ikinci');
    await page.locator('[data-chamber]').waitFor({ state: 'visible' });
    assert((await page.locator('[data-chamber-title]').innerText()) === 'E2E İkinci', 'başlık');
    await page.click('[data-action="close-preview"]');
    await page.locator('[data-chamber]').waitFor({ state: 'hidden' });
  });

  await check('önizleme yüklenemezse hata durumu gösteriliyor', async () => {
    await page.route('**/projects/zz-e2e-ikinci/', (route) => route.fulfill({ status: 404, body: 'yok' }));
    await page.click('.card-item[data-slug="zz-e2e-ikinci"] .card-open');
    const err = page.locator('[data-frame-error]');
    await err.waitFor({ state: 'visible' });
    assert((await err.innerText()).includes('bulunamadı'), await err.innerText());
    await page.unroute('**/projects/zz-e2e-ikinci/');
    await page.click('[data-frame-error] [data-action="reload-preview"]');
    await page.locator('[data-frame-state]').waitFor({ state: 'hidden', timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.locator('[data-chamber]').waitFor({ state: 'hidden' });
  });

  await check('doğrudan adres: proje kendi sayfasında, sandbox başlığıyla açılıyor', async () => {
    const p2 = await ctx.newPage();
    watchConsole(p2, 'doğrudan');
    const res = await p2.goto(BASE + '/projects/zz-e2e-birinci');
    assert(res.status() === 200 && p2.url().endsWith('/projects/zz-e2e-birinci/'), `${res.status()} ${p2.url()}`);
    assert((res.headers()['content-security-policy'] ?? '').startsWith('sandbox allow-scripts'), 'CSP sandbox yok');
    const info = await p2.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, origin: self.origin, len: document.querySelector('.field').textContent.length }));
    assert(info.bg === 'rgb(5, 6, 8)' && info.len > 100 && info.origin === 'null', JSON.stringify(info));
    for (const [url, code] of [['/projects/zz-e2e-birinci/playground.json', 404], ['/projects/zz-e2e-bozuk/', 404], ['/projects/_template/', 404], ['/package.json', 404], ['/.git/config', 404]]) {
      const r = await p2.request.get(BASE + url);
      assert(r.status() === code, `${url} → ${r.status()}`);
    }
    await p2.close();
  });

  await check('azaltılmış hareket: statik sahne animasyonu duruyor', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.stage-fallback svg')).animationName);
    assert(anim === 'none', anim);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  await check('statik görünüm parametresi (?static)', async () => {
    const p3 = await ctx.newPage();
    await p3.goto(BASE + '/?static');
    await p3.waitForFunction(() => document.documentElement.dataset.scene === 'fallback');
    await p3.close();
  });
  await ctx.close();

  // --- Mobil ---
  console.log('Mobil 390×844 (dokunmatik)');
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const m = await mctx.newPage();
  watchConsole(m, 'mobil');
  await check('mobilde yatay taşma yok, kartlar ve arama görünür', async () => {
    await m.goto(BASE + '/');
    await m.locator('.card-item').first().waitFor();
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert(overflow <= 0, `yatay taşma ${overflow}px`);
    assert(await m.locator('#search').isVisible(), 'arama görünmüyor');
  });
  await shot(m, 'mobil-galeri');
  await check('mobilde dokunarak önizleme; genişlik seçici gizli', async () => {
    await m.locator('.card-item[data-slug="zz-e2e-birinci"] .card-open').tap();
    await m.locator('[data-chamber]').waitFor({ state: 'visible' });
    assert(!(await m.locator('.viewport-switch').isVisible()), 'genişlik seçici görünür');
    await m.locator('[data-frame-state]').waitFor({ state: 'hidden', timeout: 10000 });
  });
  await shot(m, 'mobil-onizleme');
  await mctx.close();

  // Boş durum: geçici proje klasörleri kaldırıldıktan sonra yalnızca bozuk klasör kalırsa
  // galeri hâlâ çalışmalı. (Gerçek projeler varsa bu adım boş durumu göremez.)
  await check('tüm geçerli projeler kaldırılsa da sayfa çökmüyor', async () => {
    const ectx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const e = await ectx.newPage();
    watchConsole(e, 'boş');
    for (const slug of ['zz-e2e-birinci', 'zz-e2e-ikinci']) await fs.rm(path.join(PROJECTS_DIR, slug), { recursive: true, force: true });
    await e.goto(BASE + '/');
    await e.waitForFunction(() => document.querySelector('[data-cards]')?.getAttribute('aria-busy') === 'false');
    const real = await e.locator('.card-item').count();
    if (real === 0) {
      assert(await e.locator('[data-empty]').isVisible(), 'boş durum görünmüyor');
      await shot(e, 'bos-durum');
    }
    assert(await e.locator('[data-issues]').isVisible(), 'sorun paneli görünmüyor');
    await ectx.close();
  });
}

async function webglSuite() {
  createProject('zz-e2e-sahne', 'E2E Sahne');
  await patchMeta('zz-e2e-sahne', { tags: ['3d'], status: 'ready' });
  console.log('3D sahne (SwiftShader)');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  watchConsole(page, 'webgl', [/GPU stall due to ReadPixels/, /GL_CLOSE_PATH_NV/]);

  await check('3D sahne yükleniyor ve döngü çalışıyor', async () => {
    await page.goto(BASE + '/');
    await page.waitForFunction(() => document.documentElement.dataset.scene === 'ready', null, { timeout: 30000 });
    await page.waitForFunction(() => document.documentElement.dataset.sceneLoop === 'running', null, { timeout: 5000 });
  });
  await page.waitForTimeout(1500);
  await shot(page, 'webgl-galeri');

  await check('kart üzerine gelince sahne projeye ayarlanıyor', async () => {
    await page.hover('.card-item[data-slug="zz-e2e-sahne"] .card');
    await page.locator('[data-stage-focus].is-visible').waitFor({ timeout: 3000 });
    assert((await page.locator('[data-stage-focus]').innerText()).includes('E2E Sahne'), 'başlık yok');
  });
  await page.waitForTimeout(1800);
  await shot(page, 'webgl-odak');

  await check('önizleme açıkken sahne duruyor, kapanınca sürüyor', async () => {
    await page.click('.card-item[data-slug="zz-e2e-sahne"] .card-open');
    await page.waitForFunction(() => document.documentElement.dataset.sceneLoop === 'idle', null, { timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.locator('[data-chamber]').waitFor({ state: 'hidden' });
    await page.mouse.move(10, 10);
    await page.waitForFunction(() => document.documentElement.dataset.sceneLoop === 'running', null, { timeout: 5000 });
  });

  await check('hareketi durdur düğmesi döngüyü kapatıyor', async () => {
    const toggle = page.locator('[data-action="toggle-motion"]');
    await toggle.click();
    assert(await toggle.getAttribute('aria-pressed') === 'true', 'aria-pressed');
    await page.waitForFunction(() => document.documentElement.dataset.sceneLoop === 'idle', null, { timeout: 3000 });
    await toggle.click();
    await page.waitForFunction(() => document.documentElement.dataset.sceneLoop === 'running', null, { timeout: 3000 });
  });

  await check('azaltılmış hareket tercihinde sürekli döngü yok', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.documentElement.dataset.sceneLoop === 'idle', null, { timeout: 3000 });
    assert(await page.locator('[data-action="toggle-motion"]').isHidden(), 'gereksiz düğme görünür');
    await page.hover('.card-item[data-slug="zz-e2e-sahne"] .card');
    await page.waitForTimeout(400);
    assert(await page.evaluate(() => document.documentElement.dataset.sceneLoop) === 'idle', 'odakla döngü başladı');
  });

  await check('sekme gizlenince döngü duruyor', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.mouse.move(20, 20);
    await page.waitForFunction(() => document.documentElement.dataset.sceneLoop === 'running', null, { timeout: 3000 });
    const p2 = await ctx.newPage();
    await p2.goto('about:blank');
    await p2.bringToFront();
    await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
    const state = await page.evaluate(() => [document.visibilityState, document.documentElement.dataset.sceneLoop]);
    // Headless Chromium arka plan sekmesini her zaman "hidden" yapmaz; yalnızca gizliyse kontrol et.
    if (state[0] === 'hidden') assert(state[1] === 'idle', state.join());
    await p2.close();
  });
  await ctx.close();

  console.log('3D sahne, mobil');
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const m = await mctx.newPage();
  watchConsole(m, 'webgl-mobil', [/GPU stall due to ReadPixels/]);
  await check('mobilde sahne hazır; ekran dışına kayınca duruyor', async () => {
    await m.goto(BASE + '/');
    await m.waitForFunction(() => document.documentElement.dataset.scene === 'ready', null, { timeout: 30000 });
    await m.waitForTimeout(1200);
    await shot(m, 'webgl-mobil');
    await m.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await m.waitForFunction(() => document.documentElement.dataset.sceneLoop === 'idle', null, { timeout: 4000 });
  });
  await mctx.close();
}

const failed = results.filter((r) => !r.ok);
if (consoleErrors.length) {
  console.log('\nKonsol hataları:');
  for (const e of consoleErrors) console.log(`  ${e}`);
}
console.log(`\n${results.length - failed.length}/${results.length} kontrol geçti, ${consoleErrors.length} konsol hatası.`);
process.exit(failed.length || consoleErrors.length ? 1 : 0);
