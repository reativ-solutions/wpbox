import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { fileURLToPath } from 'node:url';
import { countBytes } from '../backup/readers/archive-reader.js';
import { UserError } from '../utils/errors.js';
import { CommandError, run } from '../utils/exec.js';
import type { RemoteFileSystem } from './remote-fs.js';

export interface MysqlCredentials {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  tablePrefix: string;
}

const MARIADB_IMAGE = 'mariadb:11.4';
const EXPORTER_TEMPLATE = fileURLToPath(new URL('../../templates/exporter.php', import.meta.url));
const EXPORT_COMPLETE_MARKER = '-- wpbox export complete';
const TLS_ATTEMPTS = [['--ssl', '--skip-ssl-verify-server-cert'], ['--skip-ssl']];
const LOCAL_HOSTS = new Set(['', 'localhost', '127.0.0.1', '::1']);

export function parseDbHost(value: string | undefined, fallbackHost: string): { host: string; port: number } {
  const raw = value || 'localhost';
  const withPort = raw.match(/^(.*):(\d+)$/);
  const host = withPort ? withPort[1] : raw.split(':/')[0];
  const port = withPort ? Number(withPort[2]) : 3306;
  return { host: LOCAL_HOSTS.has(host) ? fallbackHost : host, port };
}

export async function dumpRemoteMysql(credentials: MysqlCredentials, targetDir: string): Promise<string> {
  fs.mkdirSync(targetDir, { recursive: true });
  let lastError = '';

  for (const tlsFlags of TLS_ATTEMPTS) {
    try {
      await runInMariadbContainer(dumpScript(credentials, tlsFlags), credentials.password, targetDir);
      return path.join(targetDir, 'database.sql');
    } catch (error) {
      lastError = error instanceof CommandError ? error.result.stderr.trim() : String(error);
      if (!/SSL|TLS/i.test(lastError)) break;
    }
  }
  throw new UserError(`Could not dump the remote database: ${lastError.split('\n').slice(-2).join(' ')}`);
}

export async function exportWithTemporaryScript(
  client: RemoteFileSystem,
  wordpressRoot: string,
  siteUrl: string,
  targetDir: string,
  onBytes: (total: number) => void,
): Promise<string> {
  const token = crypto.randomBytes(24).toString('hex');
  const scriptName = `wpbox-export-${crypto.randomBytes(6).toString('hex')}.php`;
  const remoteScript = path.posix.join(wordpressRoot, scriptName);
  const target = path.join(targetDir, 'database.sql');
  fs.mkdirSync(targetDir, { recursive: true });

  await client.upload(fs.readFileSync(EXPORTER_TEMPLATE, 'utf8').replace('__WPBOX_TOKEN__', token), remoteScript);
  try {
    const exportUrl = `${siteUrl.replace(/\/+$/, '')}/${scriptName}?token=${token}`;
    await downloadExport(exportUrl, siteUrl, target, onBytes);
  } finally {
    await client.remove(remoteScript).catch(() => undefined);
  }

  if (!readTail(target, 200).includes(EXPORT_COMPLETE_MARKER)) {
    throw new UserError('The database export was cut short (server timeout or PHP error). Try the direct MySQL option.');
  }
  return target;
}

function dumpScript(credentials: MysqlCredentials, tlsFlags: string[]): string {
  const connection = ['-h', credentials.host, '-P', String(credentials.port), '-u', credentials.user, ...tlsFlags]
    .map(shellQuote)
    .join(' ');
  const likePrefix = `${credentials.tablePrefix.replace(/[\\_%]/g, (character) => `\\${character}`)}%`;
  const database = shellQuote(credentials.name);

  return [
    'set -e',
    `tables=$(mariadb ${connection} --connect-timeout=15 -N -B -e ${shellQuote(`SHOW TABLES LIKE '${likePrefix}'`)} ${database})`,
    '[ -n "$tables" ] || { echo "No tables with this prefix" >&2; exit 3; }',
    `mariadb-dump ${connection} --single-transaction --quick --no-tablespaces --skip-lock-tables --hex-blob --default-character-set=utf8mb4 ${database} $tables > /out/database.sql`,
  ].join('\n');
}

function runInMariadbContainer(script: string, password: string, outputDir: string) {
  return run(
    'docker',
    ['run', '--rm', '-e', 'MYSQL_PWD', '-v', `${outputDir}:/out`, '--entrypoint', 'sh', MARIADB_IMAGE, '-c', script],
    { env: { MYSQL_PWD: password } },
  );
}

async function downloadExport(url: string, siteUrl: string, target: string, onBytes: (total: number) => void): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { 'User-Agent': 'wpbox' }, redirect: 'follow' });
  } catch (error) {
    throw new UserError(`Could not reach ${siteUrl}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!response.ok || !response.body) {
    const body = (await response.text().catch(() => '')).slice(0, 300);
    const reason = body.startsWith('wpbox:') ? body : 'Is the public site URL right?';
    throw new UserError(`The export script answered HTTP ${response.status}. ${reason}`);
  }

  let total = 0;
  await pipeline(
    Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
    countBytes((bytes) => onBytes((total += bytes))),
    fs.createWriteStream(target),
  );
}

function readTail(file: string, length: number): string {
  const handle = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(handle).size;
    const buffer = Buffer.alloc(Math.min(length, size));
    fs.readSync(handle, buffer, 0, buffer.length, size - buffer.length);
    return buffer.toString('utf8');
  } finally {
    fs.closeSync(handle);
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
