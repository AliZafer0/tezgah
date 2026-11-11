import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { discoverProjects, validateMetadata, validateSlug } from '../scripts/lib/projects.mjs';

async function project(dir, meta, files = { 'index.html': '<!doctype html><p>ok' }) {
  await fs.mkdir(dir, { recursive: true });
  if (meta !== undefined) await fs.writeFile(path.join(dir, 'playground.json'), typeof meta === 'string' ? meta : JSON.stringify(meta));
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await fs.writeFile(path.join(dir, name), content);
  }
}

const base = (slug, extra = {}) => ({ title: slug, slug, description: 'Açıklama', status: 'ready', ...extra });

test('validateSlug', () => {
  assert.equal(validateSlug('binary-rose'), null);
  assert.equal(validateSlug('a1'), null);
  for (const bad of ['', 'a', 'Binary', 'binary_rose', '-a', 'a-', 'a--b', '../x', 'a/b', 'ç', 'x'.repeat(65)]) {
    assert.ok(validateSlug(bad), bad);
  }
});

test('validateMetadata zorunlu alanları ve türleri denetler', () => {
  assert.ok(validateMetadata(base('ok')).data);
  const missing = validateMetadata({ slug: 'x-y' });
  assert.equal(missing.data, null);
  assert.ok(missing.errors.some((e) => e.includes('"title"')));
  assert.ok(missing.errors.some((e) => e.includes('"description"')));
  assert.ok(missing.errors.some((e) => e.includes('"status"')));
  assert.ok(validateMetadata(base('ok', { status: 'done' })).errors.length);
  assert.ok(validateMetadata(base('ok', { entry: '../x.html' })).errors.length);
  assert.ok(validateMetadata(base('ok', { entry: 'script.js' })).errors.length);
  assert.ok(validateMetadata(base('ok', { type: 'build' })).errors.length);
  assert.ok(validateMetadata(base('ok', { permissions: ['usb'] })).errors.length);
  const tags = validateMetadata(base('ok', { tags: ['CSS', 'css', ' 3D '] }));
  assert.deepEqual(tags.data.tags, ['css', '3d']);
  const warn = validateMetadata(base('ok', { accent: 'blue', extra: 1 }));
  assert.ok(warn.data);
  assert.equal(warn.warnings.length, 2);
});

test('discoverProjects: hatalı projeler galeriyi bozmaz', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pg-projects-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  await project(path.join(dir, 'good'), base('good', { tags: ['css'], cover: 'cover.png' }), { 'index.html': 'x', 'cover.png': 'png' });
  await project(path.join(dir, 'draft-one'), base('draft-one', { status: 'draft', cover: 'yok.png' }));
  await project(path.join(dir, 'broken-json'), '{ "title": ');
  await project(path.join(dir, 'no-meta'), undefined);
  await project(path.join(dir, 'no-entry'), base('no-entry'), {});
  await project(path.join(dir, 'dup-a'), base('same'));
  await project(path.join(dir, 'dup-b'), base('same'));
  await project(path.join(dir, '_template'), base('{{slug}}'));
  await project(path.join(dir, 'scratch.tmp'), base('scratch'));
  await project(path.join(dir, '.hidden'), base('hidden'));
  await fs.symlink(path.join(dir, 'good'), path.join(dir, 'linked'));

  const { projects, issues } = await discoverProjects(dir);
  assert.deepEqual(projects.map((p) => p.slug).sort(), ['draft-one', 'good']);
  assert.equal(projects.find((p) => p.slug === 'good').cover, 'cover.png');
  assert.equal(projects.find((p) => p.slug === 'draft-one').cover, null, 'eksik kapak varsayılana düşer');

  const byDir = Object.fromEntries(issues.map((i) => [path.basename(i.dir), i]));
  assert.equal(byDir['broken-json'].level, 'error');
  assert.match(byDir['broken-json'].messages[0], /geçerli JSON değil/);
  assert.match(byDir['no-meta'].messages[0], /bulunamadı/);
  assert.match(byDir['no-entry'].messages[0], /Giriş dosyası/);
  assert.match(byDir['dup-a'].messages[0], /birden fazla/);
  assert.match(byDir['dup-b'].messages[0], /birden fazla/);
  assert.match(byDir.linked.messages[0], /Sembolik/);
  assert.equal(byDir['draft-one'].level, 'warning');
  for (const ignored of ['_template', 'scratch.tmp', '.hidden']) assert.equal(byDir[ignored], undefined, ignored);
});
