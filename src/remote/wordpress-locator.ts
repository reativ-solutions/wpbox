import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { RemoteFileSystem } from './remote-fs.js';

export interface WordPressInstall {
  root: string;
  wpConfigPath: string;
}

export interface WpConfig {
  dbName?: string;
  dbUser?: string;
  dbPassword?: string;
  dbHost?: string;
  tablePrefix?: string;
}

const WEB_ROOT_NAMES = ['', 'public_html', 'httpdocs', 'htdocs', 'www', 'html', 'web', 'public', 'wordpress', 'site'];
const SERVER_WEB_ROOTS = ['/var/www', '/var/www/html', '/var/www/public_html', '/var/www/htdocs'];

export async function findWordPressInstalls(client: RemoteFileSystem): Promise<WordPressInstall[]> {
  const home = await client.workingDirectory().catch(() => '/');
  const candidates = new Set([
    ...WEB_ROOT_NAMES.map((name) => path.posix.join(home, name)),
    ...SERVER_WEB_ROOTS,
    ...(await domainWebRoots(client, home)),
  ]);

  const installs: WordPressInstall[] = [];
  for (const dir of candidates) {
    const install = await inspectFolder(client, dir);
    if (install) installs.push(install);
  }
  return installs;
}

export async function readRemoteFile(client: RemoteFileSystem, remotePath: string): Promise<string> {
  const temporary = path.join(os.tmpdir(), `wpbox-${process.pid}-${Date.now()}`);
  try {
    await client.download(remotePath, temporary);
    return fs.readFileSync(temporary, 'utf8');
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export function parseWpConfig(php: string): WpConfig {
  const constant = (name: string) =>
    php.match(new RegExp(`define\\s*\\(\\s*['"]${name}['"]\\s*,\\s*['"]([^'"]*)['"]\\s*\\)`))?.[1];

  return {
    dbName: constant('DB_NAME'),
    dbUser: constant('DB_USER'),
    dbPassword: constant('DB_PASSWORD'),
    dbHost: constant('DB_HOST'),
    tablePrefix: php.match(/\$table_prefix\s*=\s*['"]([^'"]+)['"]/)?.[1],
  };
}

async function domainWebRoots(client: RemoteFileSystem, home: string): Promise<string[]> {
  const domainsDir = path.posix.join(home, 'domains');
  const domains = await client.list(domainsDir).catch(() => []);
  return domains.filter((entry) => entry.isDirectory).map((entry) => path.posix.join(domainsDir, entry.name, 'public_html'));
}

async function inspectFolder(client: RemoteFileSystem, dir: string): Promise<WordPressInstall | null> {
  const entries = await client.list(dir).catch(() => null);
  if (!entries?.some((entry) => entry.isDirectory && entry.name === 'wp-content')) return null;

  if (containsWpConfig(entries)) return { root: dir, wpConfigPath: path.posix.join(dir, 'wp-config.php') };

  const parent = path.posix.dirname(dir);
  const parentEntries = await client.list(parent).catch(() => []);
  return containsWpConfig(parentEntries) ? { root: dir, wpConfigPath: path.posix.join(parent, 'wp-config.php') } : null;
}

function containsWpConfig(entries: { name: string; isDirectory: boolean }[]): boolean {
  return entries.some((entry) => !entry.isDirectory && entry.name === 'wp-config.php');
}
