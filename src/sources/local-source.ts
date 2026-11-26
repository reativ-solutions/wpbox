import path from 'node:path';
import { countFiles, scanImportFolder, type ImportFiles } from '../backup/import-files.js';
import { stageBackup } from '../backup/stage.js';
import { log, pc } from '../ui/output.js';
import { UserError } from '../utils/errors.js';
import { formatBytes } from '../utils/format.js';
import type { Backup, BackupSource, SourceContext } from './backup-source.js';

export class LocalSource implements BackupSource {
  constructor(private readonly onlyFiles?: ImportFiles) {}

  async acquire({ paths }: SourceContext): Promise<Backup> {
    const files = this.onlyFiles ?? scanImportFolder(paths.import);
    if (countFiles(files) === 0) {
      const folder = path.relative(process.cwd(), paths.import) || 'import';
      throw new UserError(`No backup files in ${folder}/. Drop your backup there (zip, tar.gz, .wpress, .sql) or choose another source.`);
    }

    log.info(`Backup files:\n${[...files.archives, ...files.dumps].map((file) => `${file.name} ${pc.dim(formatBytes(file.size))}`).join('\n')}`);

    const staged = await stageBackup(files, paths);
    if (!staged.dumpPath || !staged.contentDir) {
      throw new UserError('No database dump found. Add the .sql (or .sql.gz) file to import/ and run init again.');
    }

    log.success(`Backup format: ${staged.format}`);
    return {
      contentDir: staged.contentDir,
      dumpPath: staged.dumpPath,
      disposable: true,
      format: staged.format,
      source: { type: 'local' },
    };
  }
}
