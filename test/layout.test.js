import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { archiveKind, isDumpFile, isUpdraftFile } from '../dist/backup/import-files.js';
import { contentPath, dumpLikelihood, findContentBase, findDumpEntries, isOperatingSystemJunk } from '../dist/backup/layout.js';

describe('findContentBase', () => {
  test('wp-content zip', () => {
    assert.equal(findContentBase(['wp-content/themes/x/style.css', 'wp-content/index.php']), 'wp-content/');
  });

  test('full site with TinyMCE "themes" and "plugins" folders', () => {
    const entries = [
      'public_html/wp-includes/js/tinymce/themes/inlite/theme.js',
      'public_html/wp-includes/js/tinymce/plugins/lists/plugin.js',
      'public_html/wp-content/plugins/akismet/akismet.php',
    ];
    assert.equal(findContentBase(entries), 'public_html/wp-content/');
  });

  test('content at the root (wpress, UpdraftPlus)', () => {
    assert.equal(findContentBase(['themes/x/style.css', 'plugins/y/y.php']), '');
    assert.equal(findContentBase(['uploads/2024/01/a.jpg']), '');
    assert.equal(findContentBase(['random/thing.txt'], 'content-at-root'), '');
  });

  test('database-only archive', () => {
    assert.equal(findContentBase(['backup.sql']), null);
  });

  test('ignores macOS metadata', () => {
    assert.equal(findContentBase(['__MACOSX/wp-content/._x', 'site/wp-content/themes/a/style.css']), 'site/wp-content/');
  });
});

describe('contentPath', () => {
  test('maps entries relative to wp-content', () => {
    assert.equal(contentPath('wp-content/themes/x/style.css', 'wp-content/'), 'themes/x/style.css');
    assert.equal(contentPath('wp-config.php', 'wp-content/'), null);
  });

  test('skips caches, backups, drop-ins, junk and path traversal', () => {
    for (const entry of [
      'wp-content/cache/page.html',
      'wp-content/ai1wm-backups/a.wpress',
      'wp-content/object-cache.php',
      'wp-content/../evil.php',
      'wp-content/themes/._style.css',
    ]) {
      assert.equal(contentPath(entry, 'wp-content/'), null, entry);
    }
  });
});

describe('database dumps', () => {
  test('findDumpEntries ignores .sql files shipped inside plugins', () => {
    const entries = ['dup-installer/dup-database__abc.sql', 'wp-content/plugins/foo/schema.sql', 'backup.sql.gz', 'wp-includes/x.sql'];
    assert.deepEqual(findDumpEntries(entries, 'wp-content/'), ['dup-installer/dup-database__abc.sql', 'backup.sql.gz']);
  });

  test('dumpLikelihood prefers WordPress dumps over bigger files', () => {
    assert.ok(dumpLikelihood('mysql/site_wp.sql', 10) > dumpLikelihood('random.sql', 1e9));
    assert.ok(dumpLikelihood('mysql/big.sql', 2000) > dumpLikelihood('mysql/small.sql', 10));
  });
});

describe('import files', () => {
  test('archiveKind', () => {
    assert.equal(archiveKind('site.wpress'), 'wpress');
    assert.equal(archiveKind('backup.tar.gz'), 'tar');
    assert.equal(archiveKind('backup.tgz'), 'tar');
    assert.equal(archiveKind('wp-content.zip'), 'zip');
    assert.equal(archiveKind('db.sql'), null);
  });

  test('isDumpFile', () => {
    assert.ok(isDumpFile('db.sql'));
    assert.ok(isDumpFile('db.sql.gz'));
    assert.ok(isDumpFile('backup_2024-01-02-0304_My_Site_0123456789ab-db.gz'));
    assert.ok(!isDumpFile('notes.txt'));
  });

  test('isUpdraftFile', () => {
    assert.ok(isUpdraftFile('backup_2024-01-02-0304_My_Site_0123456789ab-plugins.zip'));
    assert.ok(isUpdraftFile('backup_2024-01-02-0304_My_Site_0123456789ab-uploads2.zip'));
    assert.ok(!isUpdraftFile('backup.zip'));
  });

  test('isOperatingSystemJunk', () => {
    assert.ok(isOperatingSystemJunk('__MACOSX/a'));
    assert.ok(isOperatingSystemJunk('a/._b'));
    assert.ok(!isOperatingSystemJunk('a/.htaccess'));
  });
});
