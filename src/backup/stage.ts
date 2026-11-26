import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import type { ProjectPaths } from '../project/paths.js';
import { log, task } from '../ui/output.js';
import { select } from '../ui/prompts.js';
import { UserError } from '../utils/errors.js';
import { formatBytes, formatProgress } from '../utils/format.js';
import { safeJoin } from '../utils/fs.js';
import { isUpdraftContentPart, isUpdraftFile, type ArchiveFile, type ImportFiles } from './import-files.js';
import { contentPath, dumpLikelihood, findContentBase, findDumpEntries } from './layout.js';
import { openArchive, WpressReader } from './readers/index.js';

export interface StagedBackup {
  contentDir: string | null;
  dumpPath: string | null;
  format: string;
}

interface DumpCandidate {
  label: string;
  path: string;
  name: string;
  size: number;
}

interface StagedArchive {
  hasContent: boolean;
  isDuplicator: boolean;
  dumps: DumpCandidate[];
}

const WPRESS_METADATA = /^(package|multisite|blogs)\.json$|^database\.sql$/;

export async function stageBackup(files: ImportFiles, paths: ProjectPaths, { includeContent = true } = {}): Promise<StagedBackup> {
  resetStage(paths);
  const candidatesDir = path.join(paths.stage, 'dump-candidates');
  const candidates: DumpCandidate[] = files.dumps.map((dump) => ({ ...dump, label: dump.name }));
  const staged: StagedArchive[] = [];

  for (const archive of files.archives) {
    const result = await stageArchive(archive, { paths, candidatesDir, includeContent });
    staged.push(result);
    candidates.push(...result.dumps);
  }

  if (includeContent && files.archives.length > 0 && !staged.some((archive) => archive.hasContent)) {
    throw new UserError('None of the archives contains a wp-content folder (themes/, plugins/ or uploads/).');
  }

  const dumpPath = candidates.length ? await stageDump(candidates, paths.stagedDump) : null;
  fs.rmSync(candidatesDir, { recursive: true, force: true });

  return {
    contentDir: includeContent ? paths.stagedContent : null,
    dumpPath,
    format: describeFormat(files.archives, staged),
  };
}

function resetStage(paths: ProjectPaths): void {
  fs.rmSync(paths.stage, { recursive: true, force: true });
  fs.mkdirSync(paths.stagedContent, { recursive: true });
}

interface StageContext {
  paths: ProjectPaths;
  candidatesDir: string;
  includeContent: boolean;
}

async function stageArchive(archive: ArchiveFile, context: StageContext): Promise<StagedArchive> {
  const reader = openArchive(archive.path, archive.kind);
  const entries = await task(`Reading ${archive.name}`, () => reader.list());
  if (reader instanceof WpressReader) await assertReadableWpress(reader, archive.name);

  const names = entries.map((entry) => entry.name);
  const sizes = new Map(entries.map((entry) => [entry.name, entry.size]));
  const contentAtRoot = archive.kind === 'wpress' || isUpdraftContentPart(archive.name);
  const base = findContentBase(names, contentAtRoot ? 'content-at-root' : undefined);

  const dumpTargets = new Map(
    findDumpEntries(names, base)
      .filter((name) => archive.kind !== 'wpress' || name === 'database.sql')
      .map((name, index) => [name, path.join(context.candidatesDir, `${archive.name}-${index}-${path.basename(name)}`)]),
  );

  const destination = (name: string): string | null => {
    const dumpTarget = dumpTargets.get(name);
    if (dumpTarget) return dumpTarget;
    if (!context.includeContent) return null;

    const relative = contentPath(name, base);
    if (!relative || (archive.kind === 'wpress' && WPRESS_METADATA.test(relative))) return null;
    return safeJoin(context.paths.stagedContent, relative);
  };

  const totalBytes = names.reduce((sum, name) => sum + (destination(name) ? (sizes.get(name) ?? 0) : 0), 0);
  const dumps = [...dumpTargets].map(([name, target]) => ({
    label: `${archive.name} → ${name}`,
    path: target,
    name,
    size: sizes.get(name) ?? 0,
  }));
  const result = {
    hasContent: context.includeContent && base !== null,
    isDuplicator: names.some((name) => name.startsWith('dup-installer/')),
    dumps,
  };

  if (totalBytes === 0 && dumps.length === 0) {
    log.warn(`${archive.name}: nothing usable inside (no wp-content files or database dump).`);
    return { ...result, hasContent: false };
  }

  let extractedBytes = 0;
  await task(`Extracting ${archive.name}`, (report) =>
    reader.extract(destination, (bytes) => {
      extractedBytes += bytes;
      report(`Extracting ${archive.name}  ${formatProgress(extractedBytes, totalBytes)}`);
    }),
  );
  return result;
}

async function stageDump(candidates: DumpCandidate[], target: string): Promise<string> {
  const ranked = [...candidates].sort((a, b) => dumpLikelihood(b.name, b.size) - dumpLikelihood(a.name, a.size));
  const chosen =
    ranked.length === 1
      ? ranked[0]
      : await select(
          'More than one database dump found. Which one is the WordPress database?',
          ranked.map((candidate) => ({ value: candidate, label: candidate.label, hint: formatBytes(candidate.size) })),
          ranked[0],
        );

  await task('Preparing database dump', async () => {
    if (/\.gz$/i.test(chosen.name)) {
      await pipeline(fs.createReadStream(chosen.path), zlib.createGunzip(), fs.createWriteStream(target));
    } else {
      await fs.promises.copyFile(chosen.path, target);
    }
  });
  return target;
}

interface WpressPackage {
  Encrypted?: boolean;
  Encryption?: { Enabled?: boolean };
  Compression?: { Enabled?: boolean };
}

async function assertReadableWpress(reader: WpressReader, name: string): Promise<void> {
  const raw = await reader.readText('package.json');
  if (!raw) return;

  let metadata: WpressPackage;
  try {
    metadata = JSON.parse(raw) as WpressPackage;
  } catch {
    return;
  }

  if (metadata.Encrypted || metadata.Encryption?.Enabled) {
    throw new UserError(`${name} is encrypted. Export it again from All-in-One WP Migration without a password.`);
  }
  if (metadata.Compression?.Enabled) {
    throw new UserError(`${name} is compressed, which wpbox can't read yet. Export it again with compression disabled.`);
  }
}

function describeFormat(archives: ArchiveFile[], staged: StagedArchive[]): string {
  if (archives.some((archive) => archive.kind === 'wpress')) return 'All-in-One WP Migration (.wpress)';
  if (archives.some((archive) => isUpdraftFile(archive.name))) return 'UpdraftPlus';
  if (staged.some((archive) => archive.isDuplicator)) return 'Duplicator';
  if (archives.some((archive) => archive.kind === 'tar')) return 'tar archive (cPanel / Plesk / generic)';
  return archives.length ? 'zip' : 'database dump only';
}
