import type { Compose } from '../docker/compose.js';
import type { AdminUser, InitializedConfig } from '../project/config.js';
import { UserError } from '../utils/errors.js';
import { buildUrlReplacements } from './url-replacements.js';

const WP_ROOT = '/var/www/html';
const CORE_READY_TIMEOUT_SECONDS = 120;

const IMPORT_SCRIPT = `
set -e
mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS \\\`$MARIADB_DATABASE\\\`;
  CREATE DATABASE \\\`$MARIADB_DATABASE\\\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  GRANT ALL PRIVILEGES ON \\\`$MARIADB_DATABASE\\\`.* TO '$MARIADB_USER'@'%';"
sed -E \\
  -e '/^(CREATE DATABASE|USE) /d' \\
  -e 's/utf8mb4_0900_[a-z_]+/utf8mb4_unicode_520_ci/g' \\
  /wpbox/stage/database.sql \\
  | mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" --max-allowed-packet=1G "$MARIADB_DATABASE"
`;

const DUMP_SCRIPT =
  'mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" --single-transaction --default-character-set=utf8mb4 "$MARIADB_DATABASE" > "/dumps/$1"';

export interface LocalizeResult {
  deactivatedPlugins: string[];
}

export async function importDump(compose: Compose): Promise<void> {
  await compose.shell('database', IMPORT_SCRIPT);
}

export async function dumpDatabase(compose: Compose, fileName: string): Promise<void> {
  await compose.shell('database', DUMP_SCRIPT, [fileName]);
}

export async function localizeSite(compose: Compose, config: InitializedConfig, productionUrls: string[]): Promise<LocalizeResult> {
  await waitForWordPress(compose);
  await assertWordPressDatabase(compose, config.production.tablePrefix);

  await replaceUrls(compose, [config.production.url, ...productionUrls], config.local.url);
  await ensureAdmin(compose, config.admin);
  const deactivatedPlugins = await deactivatePlugins(compose, config.disablePlugins);
  await applyLocalSettings(compose);

  return { deactivatedPlugins };
}

export async function waitForWordPress(compose: Compose): Promise<void> {
  const coreFiles = `test -f ${WP_ROOT}/wp-includes/version.php && test -f ${WP_ROOT}/wp-config.php`;

  for (let attempt = 0; attempt < CORE_READY_TIMEOUT_SECONDS; attempt++) {
    const result = await compose.shell('wordpress', coreFiles, [], { allowFail: true });
    if (result.code === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new UserError('WordPress core did not show up in the container. Check `wpbox logs wordpress`.');
}

async function assertWordPressDatabase(compose: Compose, tablePrefix: string): Promise<void> {
  if (!(await compose.wpSucceeds(['core', 'is-installed']))) {
    throw new UserError(`The imported database doesn't look like WordPress (table prefix "${tablePrefix}"?).`);
  }
}

async function replaceUrls(compose: Compose, productionUrls: string[], localUrl: string): Promise<void> {
  for (const [from, to] of buildUrlReplacements(productionUrls, localUrl)) {
    await compose.wp(['search-replace', from, to, '--all-tables-with-prefix', '--report-changed-only', '--quiet']);
  }
  await compose.wp(['option', 'update', 'home', localUrl, '--quiet']);
  await compose.wp(['option', 'update', 'siteurl', localUrl, '--quiet']);
}

async function ensureAdmin(compose: Compose, admin: AdminUser): Promise<void> {
  const credentials = [`--user_pass=${admin.password}`, '--role=administrator', '--quiet'];

  if (await compose.wpSucceeds(['user', 'get', admin.user, '--field=ID'])) {
    await compose.wp(['user', 'update', admin.user, ...credentials, '--skip-email']);
    return;
  }

  const created = await compose.wpSucceeds(['user', 'create', admin.user, admin.email, ...credentials]);
  if (!created) await compose.wp(['user', 'create', admin.user, `wpbox-${Date.now()}@local.test`, ...credentials]);
}

async function deactivatePlugins(compose: Compose, plugins: string[]): Promise<string[]> {
  const deactivated: string[] = [];
  for (const plugin of plugins) {
    if (!(await compose.wpSucceeds(['plugin', 'is-active', plugin]))) continue;
    await compose.wp(['plugin', 'deactivate', plugin, '--quiet']);
    deactivated.push(plugin);
  }
  return deactivated;
}

async function applyLocalSettings(compose: Compose): Promise<void> {
  await compose.wp(['option', 'update', 'blog_public', '0', '--quiet']);
  await compose.wp(['option', 'delete', 'rewrite_rules', '--quiet'], { allowFail: true });
  await compose.wp(['transient', 'delete', '--all', '--quiet'], { allowFail: true });
}
