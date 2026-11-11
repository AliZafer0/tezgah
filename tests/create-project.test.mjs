import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/create-project.mjs', import.meta.url));

function create(dir, ...args) {
  return spawnSync(process.execPath, [script, ...args], {
    env: { ...process.env, PLAYGROUND_PROJECTS_DIR: dir },
    encoding: 'utf8',
  });
}

test('create:project şablondan çalışan bir proje üretir', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pg-create-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const r = create(dir, 'binary-rose', '--title', 'İkili "Gül" <deneme>');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\/projects\/binary-rose\//);
  const files = (await fs.readdir(path.join(dir, 'binary-rose'))).sort();
  assert.deepEqual(files, ['index.html', 'playground.json', 'script.js', 'style.css']);
  const meta = JSON.parse(await fs.readFile(path.join(dir, 'binary-rose', 'playground.json'), 'utf8'));
  assert.equal(meta.slug, 'binary-rose');
  assert.equal(meta.title, 'İkili "Gül" <deneme>');
  assert.equal(meta.status, 'draft');
  const html = await fs.readFile(path.join(dir, 'binary-rose', 'index.html'), 'utf8');
  assert.match(html, /İkili &quot;Gül&quot; &lt;deneme&gt;/);
  assert.doesNotMatch(html, /\{\{/);
});

test('create:project mevcut klasörün üzerine yazmaz', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pg-create-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.mkdir(path.join(dir, 'taken'));
  await fs.writeFile(path.join(dir, 'taken', 'index.html'), 'ORIGINAL');

  const r = create(dir, 'taken');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /zaten var/);
  assert.equal(await fs.readFile(path.join(dir, 'taken', 'index.html'), 'utf8'), 'ORIGINAL');
  assert.deepEqual(await fs.readdir(path.join(dir, 'taken')), ['index.html']);
});

test('create:project başka klasördeki aynı slug\'ı reddeder', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pg-create-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  assert.equal(create(dir, 'first').status, 0);
  await fs.rename(path.join(dir, 'first'), path.join(dir, '2026-first'));
  const r = create(dir, 'first');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /zaten 2026-first/);
});

test('create:project geçersiz ve dizin dışına çıkan adları reddeder', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pg-create-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  for (const bad of ['../escape', 'a/b', 'Büyük', '_template', '.git', '-x', '']) {
    const r = create(dir, bad);
    assert.equal(r.status, 1, bad);
  }
  assert.equal(create(dir).status, 1);
  assert.deepEqual(await fs.readdir(dir), []);
  await assert.rejects(fs.access(path.join(path.dirname(dir), 'escape')));
});
