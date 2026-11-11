#!/usr/bin/env node
// Üretim derlemesi:
//   1. "type": "build" olan projelerin kendi derleme betiklerini çalıştırır
//   2. Galeriyi Vite ile dist/ içine derler
//   3. Geçerli projelerin yalnızca yayınlanabilir dosyalarını dist/projects/<slug>/ içine kopyalar
//   4. dist/projects.json manifestini yazar
// --projects-only: yalnızca 1. adım.  --strict: metadata hatasında çıkış kodu 1.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DIST_DIR, HUB_DIR, PROJECTS_DIR, ROOT } from './lib/config.mjs';
import { METADATA_FILE, buildManifest, discoverProjects, isIgnoredDir } from './lib/projects.mjs';
import { isInside, isPublishable } from './lib/safe-path.mjs';

const args = new Set(process.argv.slice(2));
const projectsOnly = args.has('--projects-only');
const strict = args.has('--strict');

async function buildProjects() {
  const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true }).catch(() => []);
  let failed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || isIgnoredDir(entry.name)) continue;
    const dir = path.join(PROJECTS_DIR, entry.name);
    let meta;
    try {
      meta = JSON.parse(await fs.readFile(path.join(dir, METADATA_FILE), 'utf8'));
    } catch {
      continue; // metadata hataları keşif adımında raporlanır
    }
    if (meta?.type !== 'build') continue;
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8').catch(() => '{}'));
    const rel = path.relative(ROOT, dir);
    if (!pkg.scripts?.build) {
      console.warn(`! ${rel}: "type": "build" ama package.json içinde "build" betiği yok; atlandı.`);
      failed++;
      continue;
    }
    console.log(`→ ${rel}: npm run build`);
    const r = spawnSync('npm', ['run', 'build', '--workspace', rel], { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) {
      console.warn(`! ${rel}: derleme başarısız (çıkış kodu ${r.status}).`);
      failed++;
    }
  }
  return failed;
}

/** Yayınlanabilir dosyaları kopyalar; kökten çıkan sembolik bağlantıları atlar. */
async function copyPublishable(srcRoot, destRoot) {
  const rootReal = await fs.realpath(srcRoot);
  let copied = 0;
  const skipped = [];
  async function walk(dirReal, rel) {
    for (const entry of await fs.readdir(dirReal, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const childPath = path.join(dirReal, entry.name);
      let real = childPath;
      if (entry.isSymbolicLink()) {
        real = await fs.realpath(childPath).catch(() => null);
        if (!real || !isInside(rootReal, real)) { skipped.push(`${childRel} (kök dışına bağlantı)`); continue; }
      }
      const st = await fs.stat(real);
      if (st.isDirectory()) {
        await walk(real, childRel);
      } else if (st.isFile() && isPublishable(childRel)) {
        const dest = path.join(destRoot, ...childRel.split('/'));
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(real, dest);
        copied++;
      }
    }
  }
  await walk(rootReal, '');
  return { copied, skipped };
}

const buildFailures = await buildProjects();
if (projectsOnly) process.exit(buildFailures ? 1 : 0);

const { build } = await import('vite');
await build({ configFile: path.join(HUB_DIR, 'vite.config.js'), logLevel: 'warn' });

const discovery = await discoverProjects(PROJECTS_DIR);
await fs.mkdir(path.join(DIST_DIR, 'projects'), { recursive: true });
for (const project of discovery.projects) {
  const { copied, skipped } = await copyPublishable(project.servedRoot, path.join(DIST_DIR, 'projects', project.slug));
  console.log(`✓ ${project.slug}: ${copied} dosya`);
  for (const s of skipped) console.warn(`  atlandı: ${s}`);
}
await fs.writeFile(
  path.join(DIST_DIR, 'projects.json'),
  JSON.stringify(buildManifest(discovery, { includeIssues: false }), null, 2),
);

const errors = discovery.issues.filter((i) => i.level === 'error');
for (const issue of discovery.issues) {
  console.warn(`${issue.level === 'error' ? '✗' : '!'} ${issue.dir}`);
  for (const m of issue.messages) console.warn(`    ${m}`);
}
console.log(`\ndist/ hazır: ${discovery.projects.length} proje${errors.length ? `, ${errors.length} proje hatalı olduğu için dışarıda bırakıldı` : ''}.`);
if (strict && (errors.length || buildFailures)) process.exit(1);
