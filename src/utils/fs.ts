import fs from 'node:fs';
import path from 'node:path';

const IGNORED_FILES = new Set(['.DS_Store', 'Thumbs.db']);

export function isDirEmpty(dir: string): boolean {
  try {
    return fs.readdirSync(dir).every((name) => IGNORED_FILES.has(name));
  } catch {
    return true;
  }
}

export function listDirectories(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export function clearDirectory(dir: string): void {
  for (const name of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
}

export function safeJoin(root: string, relativePath: string): string | null {
  const target = path.resolve(root, ...relativePath.split('/'));
  const insideRoot = target === root || target.startsWith(root + path.sep);
  return insideRoot ? target : null;
}

export function* walkFiles(root: string, relativeDir = ''): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(path.join(root, ...splitPosix(relativeDir)), { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) yield* walkFiles(root, relativePath);
    else yield relativePath;
  }
}

export function toLocalPath(root: string, posixPath: string): string {
  return path.join(root, ...splitPosix(posixPath));
}

export interface MergeOptions {
  move: boolean;
  overwrite: boolean;
}

export function mergeDirectory(from: string, to: string, options: MergeOptions): void {
  fs.mkdirSync(to, { recursive: true });

  for (const name of fs.readdirSync(from)) {
    const source = path.join(from, name);
    const target = path.join(to, name);

    if (fs.existsSync(target)) {
      if (!options.overwrite) {
        if (bothDirectories(source, target)) mergeDirectory(source, target, options);
        continue;
      }
      fs.rmSync(target, { recursive: true, force: true });
    }

    transfer(source, target, options.move);
  }
}

function transfer(source: string, target: string, move: boolean): void {
  if (move && tryRename(source, target)) return;
  fs.cpSync(source, target, { recursive: true, preserveTimestamps: true });
}

function tryRename(source: string, target: string): boolean {
  try {
    fs.renameSync(source, target);
    return true;
  } catch {
    return false;
  }
}

function bothDirectories(a: string, b: string): boolean {
  return fs.statSync(a).isDirectory() && fs.statSync(b).isDirectory();
}

function splitPosix(posixPath: string): string[] {
  return posixPath.split('/').filter(Boolean);
}
