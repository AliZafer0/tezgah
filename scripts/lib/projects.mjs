// Proje keşfi ve metadata doğrulaması. Hatalı bir proje yalnızca kendisini
// etkiler: listeden çıkarılır ve `issues` içinde nedeniyle raporlanır.
import fs from 'node:fs/promises';
import path from 'node:path';
import { PROJECTS_DIR, ROOT } from './config.mjs';
import { extensionOf, resolveInside, splitRelative } from './safe-path.mjs';

export const METADATA_FILE = 'playground.json';
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const STATUSES = ['draft', 'ready'];
export const TYPES = ['static', 'build'];
// Önizleme iframe'inde açılabilecek izinler. Varsayılan: hiçbiri.
export const PERMISSIONS = [
  'fullscreen', 'pointer-lock', 'autoplay', 'camera', 'microphone',
  'accelerometer', 'gyroscope', 'clipboard-write',
];
const COVER_EXTENSIONS = new Set(['svg', 'png', 'jpg', 'jpeg', 'webp', 'avif', 'gif']);
const KNOWN_FIELDS = new Set([
  'title', 'slug', 'description', 'tags', 'status', 'cover', 'entry', 'type',
  'build', 'accent', 'permissions', 'created',
]);

/** Slug hatasını Türkçe döner; geçerliyse null. */
export function validateSlug(slug) {
  if (typeof slug !== 'string' || slug.length === 0) return 'Slug boş olamaz.';
  if (slug.length < 2 || slug.length > 64) return 'Slug 2–64 karakter olmalı.';
  if (!SLUG_PATTERN.test(slug)) {
    return 'Slug yalnızca küçük harf (a-z), rakam ve tek tire içerebilir; tireyle başlayıp bitemez. Örnek: binary-rose';
  }
  return null;
}

/** Keşifte yok sayılan klasörler: şablon, gizli ve geçici klasörler. */
export function isIgnoredDir(name) {
  return name.startsWith('_') || name.startsWith('.') || name.endsWith('~')
    || name === 'node_modules' || /\.(tmp|temp|bak|swp|old)$/i.test(name);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function relDir(dir) {
  return path.relative(ROOT, dir).split(path.sep).join('/');
}

/**
 * Ham metadata nesnesini doğrular. Dosya sistemi kontrolleri
 * (giriş dosyası, kapak) ayrıca `inspectProject` içinde yapılır.
 */
export function validateMetadata(raw) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(raw)) return { errors: ['Metadata bir JSON nesnesi olmalı.'], warnings, data: null };

  const str = (key, { required = false, max = 200 } = {}) => {
    const v = raw[key];
    if (v === undefined || v === null || v === '') {
      if (required) errors.push(`"${key}" alanı zorunlu.`);
      return undefined;
    }
    if (typeof v !== 'string') { errors.push(`"${key}" metin olmalı.`); return undefined; }
    const t = v.trim();
    if (!t) { if (required) errors.push(`"${key}" alanı boş olamaz.`); return undefined; }
    if (t.length > max) errors.push(`"${key}" en fazla ${max} karakter olmalı (şu an ${t.length}).`);
    return t;
  };

  const title = str('title', { required: true, max: 80 });
  const description = str('description', { required: true, max: 240 });

  let slug;
  if (raw.slug === undefined) errors.push('"slug" alanı zorunlu.');
  else {
    const e = validateSlug(raw.slug);
    if (e) errors.push(`"slug" geçersiz: ${e}`);
    else slug = raw.slug;
  }

  let status;
  if (raw.status === undefined) errors.push('"status" alanı zorunlu ("draft" veya "ready").');
  else if (!STATUSES.includes(raw.status)) errors.push(`"status" yalnızca "draft" (taslak) veya "ready" (hazır) olabilir; "${raw.status}" verildi.`);
  else status = raw.status;

  let tags = [];
  if (raw.tags !== undefined) {
    if (!Array.isArray(raw.tags)) errors.push('"tags" bir metin listesi olmalı.');
    else {
      const seen = new Set();
      for (const t of raw.tags) {
        if (typeof t !== 'string' || !t.trim()) { errors.push('"tags" içinde yalnızca boş olmayan metinler olabilir.'); continue; }
        const tag = t.trim().toLocaleLowerCase('tr');
        if (tag.length > 24) { errors.push(`Etiket çok uzun: "${tag}" (en fazla 24 karakter).`); continue; }
        if (!seen.has(tag)) { seen.add(tag); tags.push(tag); }
      }
      if (tags.length > 8) { warnings.push('En fazla 8 etiket gösterilir.'); tags = tags.slice(0, 8); }
    }
  }

  let type = 'static';
  if (raw.type !== undefined) {
    if (!TYPES.includes(raw.type)) errors.push(`"type" yalnızca "static" veya "build" olabilir; "${raw.type}" verildi.`);
    else type = raw.type;
  }

  let buildOutput;
  if (type === 'build') {
    const out = isPlainObject(raw.build) ? raw.build.output : undefined;
    if (typeof out !== 'string' || !out.trim()) errors.push('"type": "build" için "build": { "output": "dist" } gerekli.');
    else if (!splitRelative(out.trim())?.length) errors.push(`"build.output" proje içinde göreli bir klasör olmalı; "${out}" kullanılamaz.`);
    else buildOutput = splitRelative(out.trim()).join('/');
  } else if (raw.build !== undefined) {
    warnings.push('"build" alanı yalnızca "type": "build" ile kullanılır; yok sayıldı.');
  }

  let entry = 'index.html';
  if (raw.entry !== undefined) {
    const segs = typeof raw.entry === 'string' ? splitRelative(raw.entry.trim()) : null;
    if (!segs?.length) errors.push(`"entry" proje içinde göreli bir dosya yolu olmalı; "${raw.entry}" kullanılamaz.`);
    else if (!['html', 'htm'].includes(extensionOf(segs.at(-1)))) errors.push(`"entry" bir HTML dosyası olmalı; "${raw.entry}" verildi.`);
    else entry = segs.join('/');
  }

  let cover = null;
  if (raw.cover !== undefined && raw.cover !== null && raw.cover !== '') {
    const segs = typeof raw.cover === 'string' ? splitRelative(raw.cover.trim()) : null;
    if (!segs?.length || !COVER_EXTENSIONS.has(extensionOf(segs.at(-1)))) {
      warnings.push(`"cover" geçersiz (${JSON.stringify(raw.cover)}); varsayılan kapak kullanılacak. İzinli türler: ${[...COVER_EXTENSIONS].join(', ')}.`);
    } else cover = segs.join('/');
  }

  let accent = null;
  if (raw.accent !== undefined) {
    if (typeof raw.accent === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accent)) accent = raw.accent.toLowerCase();
    else warnings.push('"accent" #rrggbb biçiminde olmalı; projeye özgü renk otomatik seçilecek.');
  }

  let permissions = [];
  if (raw.permissions !== undefined) {
    if (!Array.isArray(raw.permissions)) errors.push('"permissions" bir liste olmalı.');
    else {
      for (const p of raw.permissions) {
        if (PERMISSIONS.includes(p)) { if (!permissions.includes(p)) permissions.push(p); }
        else errors.push(`Bilinmeyen izin: "${p}". Kullanılabilenler: ${PERMISSIONS.join(', ')}.`);
      }
    }
  }

  let created = null;
  if (raw.created !== undefined) {
    if (typeof raw.created === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.created) && !Number.isNaN(Date.parse(raw.created))) created = raw.created;
    else warnings.push('"created" YYYY-AA-GG biçiminde olmalı; yok sayıldı.');
  }

  for (const key of Object.keys(raw)) {
    if (!KNOWN_FIELDS.has(key)) warnings.push(`Bilinmeyen alan yok sayıldı: "${key}".`);
  }

  if (errors.length) return { errors, warnings, data: null };
  return {
    errors, warnings,
    data: { title, slug, description, tags, status, type, buildOutput, entry, cover, accent, permissions, created },
  };
}

/** Tek bir proje klasörünü okur ve doğrular. */
export async function inspectProject(dir) {
  const errors = [];
  const warnings = [];
  const metaPath = path.join(dir, METADATA_FILE);

  let text;
  try {
    const st = await fs.lstat(metaPath);
    if (st.isSymbolicLink() || !st.isFile()) throw Object.assign(new Error('notfile'), { code: 'NOTFILE' });
    text = await fs.readFile(metaPath, 'utf8');
  } catch (err) {
    errors.push(err.code === 'ENOENT'
      ? `${METADATA_FILE} bulunamadı. Klasörü galeriye eklemek için bu dosyayı oluşturun ya da klasör adını "_" ile başlatın.`
      : `${METADATA_FILE} okunamadı (normal bir dosya olmalı).`);
    return { errors, warnings, project: null };
  }

  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    errors.push(`${METADATA_FILE} geçerli JSON değil: ${err.message}`);
    return { errors, warnings, project: null };
  }

  const v = validateMetadata(raw);
  errors.push(...v.errors);
  warnings.push(...v.warnings);
  if (!v.data) return { errors, warnings, project: null };
  const meta = v.data;

  const servedRoot = meta.type === 'build' ? path.join(dir, ...meta.buildOutput.split('/')) : dir;
  if (meta.type === 'build') {
    try {
      const st = await fs.stat(servedRoot);
      if (!st.isDirectory()) throw new Error();
    } catch {
      errors.push(`Derleme çıktısı bulunamadı: ${meta.buildOutput}/. Önce "npm run build:projects" ya da "npm run build -w ${relDir(dir)}" çalıştırın.`);
      return { errors, warnings, project: null };
    }
  }

  if (!(await resolveInside(servedRoot, meta.entry))) {
    errors.push(`Giriş dosyası bulunamadı veya yayınlanamıyor: ${meta.entry}`);
  }

  let cover = meta.cover;
  if (cover && !(await resolveInside(servedRoot, cover))) {
    warnings.push(`Kapak görseli bulunamadı: ${cover}; varsayılan kapak kullanılacak.`);
    cover = null;
  }

  if (errors.length) return { errors, warnings, project: null };
  return {
    errors, warnings,
    project: { ...meta, cover, dir, servedRoot },
  };
}

/**
 * projects/ altındaki tüm projeleri keşfeder.
 * Dönen `projects` geçerli projeler, `issues` hata veya uyarısı olan klasörlerdir.
 */
export async function discoverProjects(projectsDir = PROJECTS_DIR) {
  let entries = [];
  try {
    entries = await fs.readdir(projectsDir, { withFileTypes: true });
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const issues = [];
  const found = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (isIgnoredDir(entry.name)) continue;
    const dir = path.join(projectsDir, entry.name);
    if (entry.isSymbolicLink()) {
      issues.push({ dir: relDir(dir), level: 'error', messages: ['Sembolik bağlantı olan proje klasörleri desteklenmez; klasörü projects/ içine taşıyın.'] });
      continue;
    }
    if (!entry.isDirectory()) continue;
    const result = await inspectProject(dir);
    if (result.project) found.push(result.project);
    if (result.errors.length) issues.push({ dir: relDir(dir), level: 'error', messages: [...result.errors, ...result.warnings] });
    else if (result.warnings.length) issues.push({ dir: relDir(dir), slug: result.project.slug, level: 'warning', messages: result.warnings });
  }

  const bySlug = new Map();
  for (const p of found) bySlug.set(p.slug, [...(bySlug.get(p.slug) ?? []), p]);
  const projects = [];
  for (const [slug, list] of bySlug) {
    if (list.length === 1) { projects.push(list[0]); continue; }
    const dirs = list.map((p) => relDir(p.dir));
    for (const p of list) {
      issues.push({
        dir: relDir(p.dir), level: 'error',
        messages: [`"${slug}" slug'ı birden fazla projede kullanılıyor (${dirs.join(', ')}). Her projeye benzersiz bir slug verin.`],
      });
    }
  }

  projects.sort((a, b) => (b.created ?? '').localeCompare(a.created ?? '') || a.title.localeCompare(b.title, 'tr'));
  issues.sort((a, b) => a.dir.localeCompare(b.dir));
  return { projects, issues };
}

export function projectUrl(project) {
  const base = `/projects/${project.slug}/`;
  return project.entry === 'index.html' ? base : base + project.entry;
}

/** Tarayıcıya giden manifest alanları (dosya sistemi yolları içermez). */
export function toPublic(project) {
  return {
    slug: project.slug,
    title: project.title,
    description: project.description,
    tags: project.tags,
    status: project.status,
    type: project.type,
    url: projectUrl(project),
    cover: project.cover ? `/projects/${project.slug}/${project.cover}` : null,
    accent: project.accent,
    permissions: project.permissions,
    created: project.created,
  };
}

export function buildManifest({ projects, issues }, { includeIssues }) {
  return {
    generatedAt: new Date().toISOString(),
    projects: projects.map(toPublic),
    issues: includeIssues ? issues : [],
  };
}
