import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { countBytes } from '../backup/readers/archive-reader.js';
import { UserError } from '../utils/errors.js';

export type DownloadProgress = (done: number, total: number, fileName: string) => void;

const DOWNLOADABLE = /\.(zip|gz|tgz|tar|wpress|sql)$/i;

export function directDownloadUrl(input: string): string {
  const url = new URL(input);

  if (/(^|\.)dropbox\.com$/.test(url.hostname)) {
    url.searchParams.set('dl', '1');
    return url.toString();
  }

  const driveFileId = url.hostname === 'drive.google.com' ? url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] : undefined;
  if (driveFileId) return `https://drive.usercontent.google.com/download?id=${driveFileId}&export=download&confirm=t`;

  return url.toString();
}

export function fileNameFromResponse(response: Response, requestedUrl: string): string {
  const disposition = response.headers.get('content-disposition') ?? '';
  const encoded = disposition.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i)?.[1];
  const plain = disposition.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1];
  const fromUrl = path.posix.basename(new URL(response.url || requestedUrl).pathname);

  const name = encoded ? decodeURIComponent(encoded.trim().replace(/^"|"$/g, '')) : (plain ?? decodeURIComponent(fromUrl));
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'download';
}

export async function download(input: string, targetDir: string, onProgress?: DownloadProgress): Promise<string> {
  const { url, headers } = withBasicAuth(new URL(directDownloadUrl(input)));
  const response = await fetchOrExplain(url, headers);

  const fileName = fileNameFromResponse(response, url.toString());
  assertIsFile(response, fileName);

  fs.mkdirSync(targetDir, { recursive: true });
  const target = path.join(targetDir, fileName);
  const partial = `${target}.part`;
  const total = Number(response.headers.get('content-length')) || 0;
  let done = 0;

  await pipeline(
    Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
    countBytes((bytes) => onProgress?.((done += bytes), total, fileName)),
    fs.createWriteStream(partial),
  );
  fs.renameSync(partial, target);
  return target;
}

function withBasicAuth(url: URL): { url: URL; headers: Record<string, string> } {
  const headers: Record<string, string> = { 'User-Agent': 'wpbox' };
  if (url.username || url.password) {
    const credentials = `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`;
    headers.Authorization = `Basic ${Buffer.from(credentials).toString('base64')}`;
    url.username = '';
    url.password = '';
  }
  return { url, headers };
}

async function fetchOrExplain(url: URL, headers: Record<string, string>): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { headers, redirect: 'follow' });
  } catch (error) {
    const reason = error instanceof Error ? ((error.cause as Error | undefined)?.message ?? error.message) : String(error);
    throw new UserError(`Could not reach ${url.host}: ${reason}`);
  }
  if (!response.ok || !response.body) {
    throw new UserError(`Download failed: HTTP ${response.status} ${response.statusText} (${url.host})`);
  }
  return response;
}

function assertIsFile(response: Response, fileName: string): void {
  const isWebPage = response.headers.get('content-type')?.includes('text/html');
  if (isWebPage && !DOWNLOADABLE.test(fileName)) {
    throw new UserError('The URL returned a web page instead of a file. Use a direct download link.');
  }
}
