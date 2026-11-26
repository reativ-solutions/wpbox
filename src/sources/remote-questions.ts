import path from 'node:path';
import type {
  DatabaseMethod,
  RemoteConnection,
  RemoteDatabaseSource,
  RemoteSourceConfig,
  SourceConfig,
} from '../project/config.js';
import type { Protocol } from '../remote/remote-fs.js';
import { parseDbHost } from '../remote/remote-database.js';
import type { WordPressInstall, WpConfig } from '../remote/wordpress-locator.js';
import { log } from '../ui/output.js';
import { confirm, select, text } from '../ui/prompts.js';

const DEFAULT_PORTS: Record<Protocol, number> = { ftp: 21, sftp: 22 };

export async function askConnection(protocol: Protocol, previous?: RemoteConnection): Promise<RemoteConnection> {
  const host = await text('Host', { initial: previous?.host, placeholder: 'ftp.example.com' });
  const port = Number(await text('Port', { initial: String(previous?.port ?? DEFAULT_PORTS[protocol]) }));
  const user = await text('Username', { initial: previous?.user });
  const privateKey = protocol === 'sftp' ? await askPrivateKey(previous?.privateKey) : undefined;
  return { host, port, user, privateKey };
}

async function askPrivateKey(previous?: string): Promise<string | undefined> {
  const method = await select(
    'Authentication',
    [
      { value: 'password', label: 'Password' },
      { value: 'key', label: 'SSH private key' },
    ],
    previous ? 'key' : 'password',
  );
  return method === 'key' ? text('Private key file', { initial: previous ?? '~/.ssh/id_ed25519' }) : undefined;
}

export async function chooseInstall(installs: WordPressInstall[], previousRoot?: string): Promise<WordPressInstall> {
  if (installs.length === 1) {
    log.success(`WordPress found in ${installs[0].root}`);
    return installs[0];
  }

  if (installs.length > 1) {
    return select(
      'More than one WordPress found. Which one?',
      installs.map((install) => ({ value: install, label: install.root })),
      installs.find((install) => install.root === previousRoot) ?? installs[0],
    );
  }

  const root = await text('WordPress folder on the server (the one with wp-content)', { initial: previousRoot ?? '/public_html' });
  return { root, wpConfigPath: path.posix.join(root, 'wp-config.php') };
}

export function askIncludeUploads(previous?: boolean): Promise<boolean> {
  return confirm('Download uploads (images, media)? It can be large.', previous ?? true);
}

export async function askDatabaseSource(
  connection: RemoteConnection,
  wpConfig: WpConfig,
  previous?: RemoteDatabaseSource,
): Promise<RemoteDatabaseSource> {
  const method = await select<DatabaseMethod>(
    'How should wpbox get the database?',
    [
      {
        value: 'exporter',
        label: 'Temporary export script',
        hint: 'uploads a one-time PHP file, downloads the dump, deletes it. Works on most hosting',
      },
      { value: 'mysql', label: 'Direct MySQL connection', hint: 'needs remote MySQL access, often blocked on shared hosting' },
      { value: 'file', label: 'A .sql file I put in import/' },
    ],
    previous?.method ?? 'exporter',
  );

  switch (method) {
    case 'exporter':
      return { method, siteUrl: await askPublicSiteUrl(connection, previous) };
    case 'mysql':
      return { method, ...(await askMysql(connection, wpConfig, previous)) };
    case 'file':
      return { method };
  }
}

async function askPublicSiteUrl(connection: RemoteConnection, previous?: RemoteDatabaseSource): Promise<string> {
  const guess = `https://${connection.host.replace(/^(s?ftp|ssh)\./, '')}`;
  return text('Public site URL', { initial: previous?.method === 'exporter' ? previous.siteUrl : guess });
}

async function askMysql(connection: RemoteConnection, wpConfig: WpConfig, previous?: RemoteDatabaseSource) {
  const saved = previous?.method === 'mysql' ? previous : undefined;
  const guess = parseDbHost(wpConfig.dbHost, connection.host);

  return {
    host: await text('MySQL host', { initial: saved?.host ?? guess.host }),
    port: Number(await text('MySQL port', { initial: String(saved?.port ?? guess.port) })),
    name: await text('Database name', { initial: saved?.name ?? wpConfig.dbName }),
    user: await text('Database user', { initial: saved?.user ?? wpConfig.dbUser }),
    tablePrefix: await text('Table prefix', { initial: saved?.tablePrefix ?? wpConfig.tablePrefix ?? 'wp_' }),
  };
}

export function previousRemoteConfig(source: SourceConfig | undefined, protocol: Protocol): RemoteSourceConfig | undefined {
  const isRemote = source?.type === 'ftp' || source?.type === 'sftp';
  return isRemote && source.type === protocol ? source : undefined;
}
