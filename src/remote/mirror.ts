import fs from 'node:fs';
import path from 'node:path';
import { toLocalPath, walkFiles } from '../utils/fs.js';
import { processQueue } from '../utils/work-queue.js';
import { connectPool } from './connect.js';
import type { ConnectionOptions, RemoteFileSystem } from './remote-fs.js';

export type MirrorProgress =
  | { phase: 'scan'; folders: number; files: number }
  | { phase: 'download'; done: number; total: number; bytes: number; totalBytes: number };

export interface MirrorOptions {
  connection: ConnectionOptions;
  client: RemoteFileSystem;
  remoteRoot: string;
  localRoot: string;
  exclude: (relativePath: string) => boolean;
  concurrency?: number;
  onProgress?: (progress: MirrorProgress) => void;
}

export interface MirrorResult {
  files: number;
  downloaded: number;
  removed: number;
}

interface RemoteFile {
  path: string;
  size: number;
  modifiedAt: number | null;
}

const MTIME_TOLERANCE_MS = 2000;

export async function mirror(options: MirrorOptions): Promise<MirrorResult> {
  const pool = await connectPool(options.connection, options.client, options.concurrency ?? 4);
  try {
    const remoteFiles = await scanRemote(pool, options);
    const changed = remoteFiles.filter((file) => !isUpToDate(file, options.localRoot));
    await downloadAll(pool, changed, options);
    const removed = removeDeleted(remoteFiles, options);
    return { files: remoteFiles.length, downloaded: changed.length, removed };
  } finally {
    await Promise.all(pool.slice(1).map((client) => client.close()));
  }
}

async function scanRemote(pool: RemoteFileSystem[], options: MirrorOptions): Promise<RemoteFile[]> {
  const files: RemoteFile[] = [];
  const folders = [''];
  let scanned = 0;

  await processQueue(pool, folders, async (client, folder) => {
    for (const entry of await client.list(path.posix.join(options.remoteRoot, folder))) {
      const relativePath = folder ? `${folder}/${entry.name}` : entry.name;
      if (options.exclude(relativePath)) continue;

      if (entry.isDirectory) folders.push(relativePath);
      else files.push({ path: relativePath, size: entry.size, modifiedAt: entry.modifiedAt });
    }
    options.onProgress?.({ phase: 'scan', folders: ++scanned, files: files.length });
  });

  return files;
}

function isUpToDate(file: RemoteFile, localRoot: string): boolean {
  try {
    const local = fs.statSync(toLocalPath(localRoot, file.path));
    const sameTime = file.modifiedAt === null || Math.abs(local.mtimeMs - file.modifiedAt) < MTIME_TOLERANCE_MS;
    return local.size === file.size && sameTime;
  } catch {
    return false;
  }
}

async function downloadAll(pool: RemoteFileSystem[], files: RemoteFile[], options: MirrorOptions): Promise<void> {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  let done = 0;
  let bytes = 0;

  await processQueue(pool, [...files], async (client, file) => {
    const target = toLocalPath(options.localRoot, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    await client.download(path.posix.join(options.remoteRoot, file.path), target);
    if (file.modifiedAt !== null) fs.utimesSync(target, new Date(), new Date(file.modifiedAt));

    bytes += file.size;
    options.onProgress?.({ phase: 'download', done: ++done, total: files.length, bytes, totalBytes });
  });
}

function removeDeleted(remoteFiles: RemoteFile[], options: MirrorOptions): number {
  const remote = new Set(remoteFiles.map((file) => file.path));
  let removed = 0;

  for (const relativePath of walkFiles(options.localRoot)) {
    if (remote.has(relativePath) || options.exclude(relativePath)) continue;
    fs.rmSync(toLocalPath(options.localRoot, relativePath), { force: true });
    removed++;
  }
  return removed;
}
