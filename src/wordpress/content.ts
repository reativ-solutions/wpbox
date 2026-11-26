import fs from 'node:fs';
import path from 'node:path';
import { EXCLUDED_CONTENT } from '../backup/layout.js';
import type { Compose } from '../docker/compose.js';
import type { DevCode } from '../project/config.js';
import type { ProjectPaths } from '../project/paths.js';
import { log, pc } from '../ui/output.js';
import { clearDirectory, isDirEmpty, listDirectories, mergeDirectory } from '../utils/fs.js';

type CodeKind = 'themes' | 'plugins';

export interface PlaceContentOptions {
  paths: ProjectPaths;
  compose: Compose;
  devCode: DevCode;
  contentDir: string;
  disposable: boolean;
  overwrite: boolean;
}

const VOLUME_BATCH_SIZE = 100;
const COPY_TO_VOLUME_SCRIPT = `
set -e
for item in "$@"; do
  target="/var/www/html/wp-content/$item"
  rm -rf "$target"
  mkdir -p "$(dirname "$target")"
  cp -a "$SOURCE/$item" "$target"
  chown -R www-data:www-data "$target"
done`;

export function listCode(contentDir: string, kind: CodeKind): string[] {
  return listDirectories(path.join(contentDir, kind));
}

export function detectCustomCode(contentDir: string, kind: CodeKind): string[] {
  return listCode(contentDir, kind).filter((name) => !hasWordPressOrgReadme(path.join(contentDir, kind, name)));
}

export async function placeContent(options: PlaceContentOptions): Promise<void> {
  placeDevCode(options, 'themes', options.devCode.themes, options.paths.srcThemes);
  placeDevCode(options, 'plugins', options.devCode.plugins, options.paths.srcPlugins);
  placeUploads(options);
  await copyEverythingElseToVolume(options);
}

function placeDevCode(options: PlaceContentOptions, kind: CodeKind, names: string[], srcRoot: string): void {
  for (const name of names) {
    const from = path.join(options.contentDir, kind, name);
    const to = path.join(srcRoot, name);

    if (!fs.existsSync(from)) {
      log.warn(`src/${kind}/${name}: not in the backup, left as is.`);
      continue;
    }
    if (!isDirEmpty(to) && !options.overwrite) {
      log.warn(`src/${kind}/${name} already has files: kept your version ${pc.dim('(use --force to overwrite)')}`);
      continue;
    }

    if (options.overwrite) clearDirectory(to);
    mergeDirectory(from, to, { move: options.disposable, overwrite: true });
  }
}

function placeUploads(options: PlaceContentOptions): void {
  const uploads = path.join(options.contentDir, 'uploads');
  if (!fs.existsSync(uploads)) return;
  mergeDirectory(uploads, options.paths.srcUploads, { move: options.disposable, overwrite: options.overwrite });
}

async function copyEverythingElseToVolume(options: PlaceContentOptions): Promise<void> {
  const items = volumeItems(options.contentDir, options.devCode);
  const sourceInContainer = `/wpbox/${path.relative(options.paths.box, options.contentDir).split(path.sep).join('/')}`;

  for (let start = 0; start < items.length; start += VOLUME_BATCH_SIZE) {
    const batch = items.slice(start, start + VOLUME_BATCH_SIZE);
    await options.compose.shell('wordpress', COPY_TO_VOLUME_SCRIPT, batch, { env: { SOURCE: sourceInContainer } });
  }
}

function volumeItems(contentDir: string, devCode: DevCode): string[] {
  const devNames: Record<CodeKind, string[]> = { themes: devCode.themes, plugins: devCode.plugins };

  return fs.readdirSync(contentDir).flatMap((topLevel) => {
    if (topLevel === 'uploads' || EXCLUDED_CONTENT.has(topLevel)) return [];
    if (topLevel !== 'themes' && topLevel !== 'plugins') return [topLevel];

    return fs
      .readdirSync(path.join(contentDir, topLevel))
      .filter((name) => !devNames[topLevel].includes(name))
      .map((name) => `${topLevel}/${name}`);
  });
}

function hasWordPressOrgReadme(dir: string): boolean {
  return fs.readdirSync(dir).some((file) => file.toLowerCase() === 'readme.txt');
}
