#!/usr/bin/env node
// Yeni proje: npm run create:project -- <slug> [--title "Başlık"]
// projects/_template içeriğini projects/<slug>/ altına kopyalar; var olan
// hiçbir dosyanın üzerine yazmaz.
import fs from 'node:fs/promises';
import path from 'node:path';
import { PROJECTS_DIR, TEMPLATE_DIR, serverAddress } from './lib/config.mjs';
import { discoverProjects, projectUrl, validateSlug } from './lib/projects.mjs';

const TEMPLATE_FILES = ['index.html', 'style.css', 'script.js', 'playground.json'];

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { slug: undefined, title: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--title') out.title = argv[++i];
    else if (a.startsWith('--title=')) out.title = a.slice('--title='.length);
    else if (a.startsWith('-')) fail(`Bilinmeyen seçenek: ${a}`);
    else if (out.slug === undefined) out.slug = a;
    else fail('Yalnızca bir slug verin. Örnek: npm run create:project -- binary-rose');
  }
  return out;
}

function titleFromSlug(slug) {
  return slug.split('-').map((w) => w.charAt(0).toLocaleUpperCase('tr') + w.slice(1)).join(' ');
}

// JSON ve HTML içine güvenle yerleşsin diye değer kaçışlanır.
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const escapeJson = (s) => JSON.stringify(s).slice(1, -1);

const { slug, title: rawTitle } = parseArgs(process.argv.slice(2));
if (!slug) fail('Slug gerekli. Örnek: npm run create:project -- binary-rose');
const slugError = validateSlug(slug);
if (slugError) fail(slugError);
const title = (rawTitle ?? titleFromSlug(slug)).trim();
if (!title || title.length > 80) fail('Başlık 1–80 karakter olmalı.');

const target = path.resolve(PROJECTS_DIR, slug);
if (path.dirname(target) !== PROJECTS_DIR) fail('Proje yalnızca projects/ klasörünün doğrudan altında oluşturulabilir.');

const { projects } = await discoverProjects(PROJECTS_DIR);
const clash = projects.find((p) => p.slug === slug);
if (clash) fail(`"${slug}" slug'ı zaten ${path.relative(PROJECTS_DIR, clash.dir)}/ klasöründe kullanılıyor.`);

try {
  // recursive: false → klasör (veya aynı adlı dosya/bağlantı) varsa EEXIST ile durur.
  await fs.mkdir(target);
} catch (err) {
  if (err.code === 'EEXIST') fail(`projects/${slug} zaten var; hiçbir dosyaya dokunulmadı.`);
  throw err;
}

const today = new Date().toISOString().slice(0, 10);
const values = { slug, date: today };
try {
  for (const name of TEMPLATE_FILES) {
    let text = await fs.readFile(path.join(TEMPLATE_DIR, name), 'utf8');
    const titleValue = name.endsWith('.json') ? escapeJson(title) : escapeHtml(title);
    text = text.replaceAll('{{title}}', titleValue).replace(/\{\{(\w+)\}\}/g, (m, k) => values[k] ?? m);
    await fs.writeFile(path.join(target, name), text, { flag: 'wx' });
  }
} catch (err) {
  // Yalnızca bu çalıştırmada oluşturulan klasörü geri al.
  await fs.rm(target, { recursive: true, force: true });
  fail(`Şablon kopyalanamadı: ${err.message}`);
}

const after = await discoverProjects(PROJECTS_DIR);
const created = after.projects.find((p) => p.slug === slug);
if (!created) {
  const issue = after.issues.find((i) => i.dir === `projects/${slug}`);
  fail(`Proje oluşturuldu ama galeri doğrulamasından geçmedi:\n  ${issue?.messages.join('\n  ') ?? 'bilinmeyen hata'}`);
}

const { origin } = serverAddress();
console.log(`✓ ${title} oluşturuldu.`);
console.log(`  Klasör : ${target}`);
console.log(`  Adres  : ${origin}${projectUrl(created)}`);
console.log(`  Galeri : ${origin}/#/onizleme/${slug}`);
console.log('  (Adresler "npm run dev" çalışırken açılır; galeri yeni projeyi kendiliğinden gösterir.)');
