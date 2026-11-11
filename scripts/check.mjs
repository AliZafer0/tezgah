#!/usr/bin/env node
// Tüm projelerin metadata'sını doğrular. Hata varsa çıkış kodu 1.
import { PROJECTS_DIR } from './lib/config.mjs';
import { discoverProjects, projectUrl } from './lib/projects.mjs';

const { projects, issues } = await discoverProjects(PROJECTS_DIR);

for (const p of projects) {
  const status = p.status === 'draft' ? 'taslak' : 'hazır';
  console.log(`✓ ${p.slug.padEnd(28)} ${status.padEnd(6)} ${projectUrl(p)}`);
}
for (const issue of issues) {
  console.log(`${issue.level === 'error' ? '✗' : '!'} ${issue.dir}`);
  for (const m of issue.messages) console.log(`    ${m}`);
}

const errors = issues.filter((i) => i.level === 'error').length;
const warnings = issues.length - errors;
console.log(`\n${projects.length} geçerli proje, ${errors} hatalı, ${warnings} uyarılı.`);
process.exit(errors ? 1 : 0);
