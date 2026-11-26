import fs from 'node:fs';
import path from 'node:path';
import type { ProjectPaths } from './paths.js';

const IGNORED_PATHS = ['.wpbox/', 'import/', 'dumps/', 'src/uploads/'];
const SECTION_HEADER = '# wpbox';

export function ensureGitignore(paths: ProjectPaths): void {
  const file = path.join(paths.root, '.gitignore');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const existing = new Set(current.split(/\r?\n/).map((line) => line.trim()));
  const missing = IGNORED_PATHS.filter((entry) => !existing.has(entry));
  if (missing.length === 0) return;

  const separator = current && !current.endsWith('\n') ? '\n' : '';
  const header = existing.has(SECTION_HEADER) ? '' : `${SECTION_HEADER}\n`;
  fs.writeFileSync(file, `${current}${separator}${header}${missing.join('\n')}\n`);
}
