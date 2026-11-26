import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { slugify } from '../dist/project/config.js';
import { parseSiteUrl } from '../dist/project/site-url.js';
import { directDownloadUrl } from '../dist/remote/download.js';
import { parseDbHost } from '../dist/remote/remote-database.js';
import { parseWpConfig } from '../dist/remote/wordpress-locator.js';
import { safeJoin } from '../dist/utils/fs.js';

test('parseSiteUrl', () => {
  assert.deepEqual(parseSiteUrl('http://localhost:8090'), {
    ok: true,
    value: { url: 'http://localhost:8090', host: 'localhost', port: 8090, https: false },
  });
  assert.equal(parseSiteUrl('http://mysite.test').ok && parseSiteUrl('http://mysite.test').value.port, 80);
  for (const invalid of ['http://localhost:8090/blog', 'ftp://x', 'nope']) {
    assert.equal(parseSiteUrl(invalid).ok, false, invalid);
  }
});

test('slugify', () => {
  assert.equal(slugify('My Site (copy)'), 'my-site-copy');
});

test('parseWpConfig', () => {
  const php = `<?php
define( 'DB_NAME', 'shop_db' );
define("DB_USER", "shop");
define('DB_PASSWORD', 'p@ss');
define('DB_HOST', 'localhost:3307');
$table_prefix = 'xyz_';`;
  assert.deepEqual(parseWpConfig(php), {
    dbName: 'shop_db',
    dbUser: 'shop',
    dbPassword: 'p@ss',
    dbHost: 'localhost:3307',
    tablePrefix: 'xyz_',
  });
});

test('parseDbHost', () => {
  assert.deepEqual(parseDbHost('localhost', 'ftp.example.com'), { host: 'ftp.example.com', port: 3306 });
  assert.deepEqual(parseDbHost('db.example.com:3307', 'x'), { host: 'db.example.com', port: 3307 });
  assert.deepEqual(parseDbHost('localhost:/tmp/mysql.sock', 'h'), { host: 'h', port: 3306 });
});

test('directDownloadUrl', () => {
  assert.equal(directDownloadUrl('https://www.dropbox.com/s/abc/site.zip?dl=0'), 'https://www.dropbox.com/s/abc/site.zip?dl=1');
  assert.match(directDownloadUrl('https://drive.google.com/file/d/FILEID/view?usp=sharing'), /id=FILEID/);
  assert.equal(directDownloadUrl('https://example.com/a.zip'), 'https://example.com/a.zip');
});

test('safeJoin blocks path traversal', () => {
  const root = path.resolve('/tmp/root');
  assert.equal(safeJoin(root, 'a/b.txt'), path.join(root, 'a', 'b.txt'));
  assert.equal(safeJoin(root, '../evil'), null);
});
