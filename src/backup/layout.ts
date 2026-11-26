import path from 'node:path';

const WP_CONTENT_FOLDERS = new Set(['themes', 'plugins', 'uploads', 'mu-plugins', 'languages']);

export const EXCLUDED_CONTENT = new Set([
  'cache',
  'upgrade',
  'upgrade-temp-backup',
  'wflogs',
  'ai1wm-backups',
  'updraft',
  'backups-dup-lite',
  'backups-dup-pro',
  'backup-guard',
  'wpvividbackups',
  'backwpup',
  'et-cache',
  'litespeed',
  'debug.log',
  'advanced-cache.php',
  'object-cache.php',
  'db.php',
]);

export type ContentBaseHint = 'content-at-root';

export function normalizeEntry(name: string): string {
  return name.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

export function isOperatingSystemJunk(entry: string): boolean {
  return entry.startsWith('__MACOSX/') || entry.split('/').some((segment) => segment.startsWith('._') || segment === '.DS_Store');
}

export function findContentBase(entries: string[], hint?: ContentBaseHint): string | null {
  const files = entries.filter((entry) => !isOperatingSystemJunk(entry));

  return (
    shortest(files.map(prefixUpToWpContent)) ??
    shortest(files.map(prefixBeforeThemesOrPlugins)) ??
    (hint === 'content-at-root' || files.some(startsWithContentFolder) ? '' : null)
  );
}

export function contentPath(entry: string, base: string | null): string | null {
  if (base === null || !entry.startsWith(base) || isOperatingSystemJunk(entry)) return null;

  const relative = entry.slice(base.length);
  const segments = relative.split('/');
  if (!relative || relative.endsWith('/')) return null;
  if (EXCLUDED_CONTENT.has(segments[0]) || segments.includes('..')) return null;
  return relative;
}

export function isDumpName(name: string): boolean {
  return /\.sql(\.gz)?$/i.test(name);
}

export function findDumpEntries(entries: string[], base: string | null): string[] {
  return entries.filter(
    (entry) =>
      isDumpName(entry) &&
      !isOperatingSystemJunk(entry) &&
      !isInsideContent(entry, base) &&
      !/(^|\/)wp-(includes|admin)\//.test(entry),
  );
}

export function dumpLikelihood(name: string, size: number): number {
  const lower = name.toLowerCase();
  let score = 0;
  if (/dup-database|database\.sql|(^|\/)mysql\//.test(lower)) score += 10;
  if (/-db\d*\.gz$|backup.*db/.test(lower)) score += 5;
  if (/wordpress|wp/.test(path.basename(lower))) score += 2;
  return score * 1e12 + size;
}

function isInsideContent(entry: string, base: string | null): boolean {
  if (base === null) return false;
  if (base === '') return entry.includes('/') && startsWithContentFolder(entry);
  return entry.startsWith(base);
}

function prefixUpToWpContent(entry: string): string | null {
  const segments = entry.split('/');
  const index = segments.indexOf('wp-content');
  return index >= 0 && index < segments.length - 1 ? `${segments.slice(0, index + 1).join('/')}/` : null;
}

function prefixBeforeThemesOrPlugins(entry: string): string | null {
  const segments = entry.split('/');
  const index = segments.findIndex((segment, i) => i < segments.length - 1 && (segment === 'themes' || segment === 'plugins'));
  if (index < 0) return null;
  return index === 0 ? '' : `${segments.slice(0, index).join('/')}/`;
}

function startsWithContentFolder(entry: string): boolean {
  return entry.includes('/') && WP_CONTENT_FOLDERS.has(entry.split('/')[0]);
}

function shortest(candidates: (string | null)[]): string | null {
  return candidates.reduce<string | null>(
    (best, candidate) => (candidate !== null && (best === null || candidate.length < best.length) ? candidate : best),
    null,
  );
}
