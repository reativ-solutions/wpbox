import { countFiles, scanImportFolder } from '../backup/import-files.js';
import type { Config, SourceType } from '../project/config.js';
import type { ProjectPaths } from '../project/paths.js';
import { select } from '../ui/prompts.js';
import { UserError } from '../utils/errors.js';
import type { BackupSource } from './backup-source.js';
import { LocalSource } from './local-source.js';
import { RemoteSource } from './remote-source.js';
import { UrlSource } from './url-source.js';

export type { Backup, SourceContext } from './backup-source.js';

const SOURCE_TYPES: SourceType[] = ['local', 'url', 'ftp', 'sftp'];

export function isSourceType(value: string): value is SourceType {
  return (SOURCE_TYPES as string[]).includes(value);
}

export function createSource(type: SourceType): BackupSource {
  switch (type) {
    case 'local':
      return new LocalSource();
    case 'url':
      return new UrlSource();
    case 'ftp':
    case 'sftp':
      return new RemoteSource(type);
  }
}

export async function chooseSourceType(paths: ProjectPaths, config: Config, requested?: string): Promise<SourceType> {
  if (requested) {
    if (!isSourceType(requested)) throw new UserError(`Unknown source "${requested}". Use ${SOURCE_TYPES.join(', ')}.`);
    return requested;
  }

  const filesInImport = countFiles(scanImportFolder(paths.import));
  const importHint = filesInImport ? `${filesInImport} file(s) found` : 'empty: drop your backup files there first';

  return select<SourceType>(
    'Where is the backup?',
    [
      { value: 'local', label: '📁 Files in import/', hint: importHint },
      { value: 'url', label: '🌍 Download from a URL', hint: 'zip, tar.gz, wpress, sql, Dropbox / Google Drive links' },
      { value: 'ftp', label: '📡 Live site over FTP / FTPS' },
      { value: 'sftp', label: '🔐 Live site over SFTP (SSH)' },
    ],
    filesInImport ? 'local' : (config.source?.type ?? 'local'),
  );
}
