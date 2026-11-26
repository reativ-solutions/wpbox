import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { analyzeDump, findTablePrefixes, isMultisite, productionUrls, unescapeSql } from '../dist/backup/dump-analysis.js';

function dumpFile(content) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wpbox-')), 'dump.sql');
  fs.writeFileSync(file, content);
  return file;
}

describe('analyzeDump', () => {
  test('phpMyAdmin style dump', async () => {
    const analysis = await analyzeDump(
      dumpFile(`
CREATE TABLE \`abc_options\` (id int);
CREATE TABLE \`abc_posts\` (id int);
CREATE TABLE \`abc_users\` (id int);
INSERT INTO \`abc_options\` (\`option_id\`, \`option_name\`, \`option_value\`, \`autoload\`) VALUES
(1, 'siteurl', 'https://example.com', 'yes'),
(2, 'home', 'https://example.com/', 'yes'),
(99, 'whl_page', 'secret-login', 'yes');
`),
    );
    assert.deepEqual(analysis.tables, ['abc_options', 'abc_posts', 'abc_users']);
    assert.deepEqual(analysis.options.whl_page, ['secret-login']);
    assert.deepEqual(productionUrls(analysis), ['https://example.com']);
  });

  test('mysqldump style with quoted ids', async () => {
    const analysis = await analyzeDump(
      dumpFile("INSERT INTO `wp_options` VALUES (1,'siteurl','http://a.test','on'),('2','home','http://b.test','on');"),
    );
    assert.deepEqual(productionUrls(analysis), ['http://b.test', 'http://a.test']);
  });

  test('ignores rows that only look like options', async () => {
    const analysis = await analyzeDump(dumpFile("INSERT INTO `wp_yoast` VALUES ('home', 'not-an-option');"));
    assert.deepEqual(productionUrls(analysis), []);
  });
});

test('findTablePrefixes', () => {
  const tables = ['wp_options', 'wp_posts', 'wp_users', 'other_options', 'shop_options', 'shop_posts', 'shop_users'];
  assert.deepEqual(findTablePrefixes(tables).sort(), ['shop_', 'wp_']);
  assert.deepEqual(findTablePrefixes(['SERVMASK_PREFIX_options', 'SERVMASK_PREFIX_posts', 'SERVMASK_PREFIX_users']), ['SERVMASK_PREFIX_']);
});

test('isMultisite', () => {
  assert.ok(isMultisite(['wp_blogs', 'wp_site', 'wp_options'], 'wp_'));
  assert.ok(!isMultisite(['wp_options'], 'wp_'));
});

test('unescapeSql', () => {
  assert.equal(unescapeSql("it\\'s\\nfine \\\\ ok"), "it's\nfine \\ ok");
});
