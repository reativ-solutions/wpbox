import fs from 'node:fs';
import path from 'node:path';
import { isDumpName } from './layout.js';

export type ArchiveKind = 'zip' | 'tar' | 'wpress';

export interface ArchiveFile {
  path: string;
  name: string;
  size: number;
  kind: ArchiveKind;
}

export interface DumpFile {
  path: string;
  name: string;
  size: number;
}

export interface ImportFiles {
  archives: ArchiveFile[];
  dumps: DumpFile[];
}

const UPDRAFT_FILE = /^backup_\d{4}-\d{2}-\d{2}-\d{4}_.+_[0-9a-f]{12}-(plugins|themes|uploads|others|mu-plugins|more|db)\d*\.(zip|gz)$/i;
const UPDRAFT_CONTENT_PART = /-(others|uploads|mu-plugins|more)\d*\.zip$/i;

export function isUpdraftFile(name: string): boolean {
  return UPDRAFT_FILE.test(path.basename(name));
}

export function isUpdraftContentPart(name: string): boolean {
  return isUpdraftFile(name) && UPDRAFT_CONTENT_PART.test(name);
}

export function archiveKind(name: string): ArchiveKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.wpress')) return 'wpress';
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.tar')) return 'tar';
  if (lower.endsWith('.zip')) return 'zip';
  return null;
}

export function isDumpFile(name: string): boolean {
  return isDumpName(name) || (isUpdraftFile(name) && name.toLowerCase().endsWith('.gz'));
}

export function scanImportFolder(dir: string): ImportFiles {
  const found: ImportFiles = { archives: [], dumps: [] };
  if (!fs.existsSync(dir)) return found;

  for (const name of fs.readdirSync(dir).sort()) {
    const filePath = path.join(dir, name);
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || name.endsWith('.part')) continue;

    const kind = archiveKind(name);
    if (kind) found.archives.push({ path: filePath, name, size: stat.size, kind });
    else if (isDumpFile(name)) found.dumps.push({ path: filePath, name, size: stat.size });
  }
  return found;
}

export function onlyNamed(files: ImportFiles, names: string[]): ImportFiles {
  return {
    archives: files.archives.filter((archive) => names.includes(archive.name)),
    dumps: files.dumps.filter((dump) => names.includes(dump.name)),
  };
}

export function countFiles(files: ImportFiles): number {
  return files.archives.length + files.dumps.length;
}
