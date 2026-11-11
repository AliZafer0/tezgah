import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isPublishable, resolveInside, splitRelative } from '../scripts/lib/safe-path.mjs';

test('splitRelative kökten çıkan ve gizli yolları reddeder', () => {
  assert.deepEqual(splitRelative('a/b/c.js'), ['a', 'b', 'c.js']);
  assert.deepEqual(splitRelative('./a//b.css'), ['a', 'b.css']);
  for (const bad of ['../x', 'a/../../x', '/etc/passwd', 'a\\..\\b', '.env', 'a/.git/config', 'node_modules/x.js', 'a\0b', 'C:/x']) {
    assert.equal(splitRelative(bad), null, bad);
  }
});

test('isPublishable yalnızca izinli dosyaları yayınlar', () => {
  for (const ok of ['index.html', 'style.css', 'js/app.mjs', 'img/a.webp', 'models/x.glb', 'data.json', 'environment.js', 'envelope.png']) {
    assert.equal(isPublishable(ok), true, ok);
  }
  for (const bad of ['playground.json', 'package.json', 'package-lock.json', 'vite.config.js', 'tsconfig.app.json',
    'env.json', 'server.php', 'deploy.sh', 'key.pem', '.env', '.env.local', 'node_modules/a.js', 'src/', 'noext']) {
    assert.equal(isPublishable(bad), false, bad);
  }
});

test('resolveInside sembolik bağlantıyla kök dışına çıkmaz', async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pg-safe-'));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  const root = path.join(tmp, 'proj');
  await fs.mkdir(path.join(root, 'assets'), { recursive: true });
  await fs.writeFile(path.join(root, 'index.html'), '<p>ok');
  await fs.writeFile(path.join(root, 'assets', 'a.css'), 'a{}');
  await fs.writeFile(path.join(tmp, 'secret.txt'), 'secret');
  await fs.symlink(path.join(tmp, 'secret.txt'), path.join(root, 'leak.txt'));
  await fs.symlink(tmp, path.join(root, 'up'));
  await fs.symlink(path.join(root, 'assets', 'a.css'), path.join(root, 'alias.css'));
  await fs.writeFile(path.join(root, '.env'), 'X=1');
  await fs.symlink(path.join(root, '.env'), path.join(root, 'env-link.txt'));

  assert.ok(await resolveInside(root, 'index.html'));
  assert.ok(await resolveInside(root, 'assets/a.css'));
  assert.ok(await resolveInside(root, 'alias.css'), 'kök içindeki bağlantı izinli');
  assert.equal(await resolveInside(root, 'leak.txt'), null);
  assert.equal(await resolveInside(root, 'up/secret.txt'), null);
  assert.equal(await resolveInside(root, '../secret.txt'), null);
  assert.equal(await resolveInside(root, '.env'), null);
  assert.equal(await resolveInside(root, 'env-link.txt'), null, 'gizli dosyaya giden bağlantı');
  assert.equal(await resolveInside(root, 'assets'), null, 'klasör dosya değildir');
  assert.equal(await resolveInside(root, 'missing.js'), null);
});
