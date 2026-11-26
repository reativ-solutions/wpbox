import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { WpressReader } from '../dist/backup/readers/index.js';

function header(name, size, prefix) {
  const buffer = Buffer.alloc(4377);
  buffer.write(name, 0);
  buffer.write(String(size), 255);
  buffer.write('1700000000', 269);
  buffer.write(prefix, 281);
  return buffer;
}

function writeWpress(file, entries) {
  const parts = entries.flatMap(([prefix, name, content]) => [header(name, content.length, prefix), Buffer.from(content)]);
  fs.writeFileSync(file, Buffer.concat([...parts, Buffer.alloc(4377)]));
}

test('WpressReader lists, extracts and reads entries', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpbox-'));
  const file = path.join(dir, 'site.wpress');
  writeWpress(file, [
    ['.', 'database.sql', 'SELECT 1;'],
    ['themes/acme', 'style.css', '/* Theme Name: Acme */'],
    ['uploads', 'empty.txt', ''],
  ]);

  const reader = new WpressReader(file);
  assert.deepEqual(await reader.list(), [
    { name: 'database.sql', size: 9 },
    { name: 'themes/acme/style.css', size: 22 },
    { name: 'uploads/empty.txt', size: 0 },
  ]);

  const output = path.join(dir, 'out');
  await reader.extract((name) => path.join(output, name));
  assert.equal(fs.readFileSync(path.join(output, 'themes/acme/style.css'), 'utf8'), '/* Theme Name: Acme */');
  assert.equal(fs.readFileSync(path.join(output, 'uploads/empty.txt'), 'utf8'), '');
  assert.equal(await reader.readText('database.sql'), 'SELECT 1;');
});
