import fs from 'node:fs';
import { log, pc, task } from '../ui/output.js';
import { UserError } from '../utils/errors.js';
import { dumpDatabase, importDump, localizeSite } from '../wordpress/database.js';
import { openProject } from './project.js';

export async function dump(): Promise<void> {
  const { compose } = openProject();
  const fileName = `local-${timestamp()}.sql`;
  await task('Dumping database', () => dumpDatabase(compose, fileName));
  log.success(`Saved dumps/${fileName} ${pc.dim('(with local URLs)')}`);
}

export async function reimport(): Promise<void> {
  const { paths, config, compose } = openProject();
  if (!fs.existsSync(paths.stagedDump)) throw new UserError('The original dump is gone. Run `wpbox init` again.');

  await task('Importing database', () => importDump(compose));
  await task('Preparing WordPress for local use', () => localizeSite(compose, config, [config.production.url]));
  log.success('Database restored from the backup.');
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
}
