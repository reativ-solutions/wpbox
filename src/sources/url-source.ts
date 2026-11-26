import path from 'node:path';
import { onlyNamed, scanImportFolder } from '../backup/import-files.js';
import { download } from '../remote/download.js';
import { task } from '../ui/output.js';
import { confirm, text } from '../ui/prompts.js';
import { formatProgress } from '../utils/format.js';
import type { Backup, BackupSource, SourceContext } from './backup-source.js';
import { LocalSource } from './local-source.js';

const validateUrl = (value: string) => (/^https?:\/\/.+/.test(value) ? undefined : 'Enter a http(s):// URL');

export class UrlSource implements BackupSource {
  async acquire(context: SourceContext): Promise<Backup> {
    const urls = await this.resolveUrls(context);
    const downloaded: string[] = [];

    for (const url of urls) {
      const file = await task(`Downloading from ${new URL(url).host}`, (report) =>
        download(url, context.paths.import, (done, total, fileName) => report(`Downloading ${fileName}  ${formatProgress(done, total)}`)),
      );
      downloaded.push(path.basename(file));
    }

    const files = onlyNamed(scanImportFolder(context.paths.import), downloaded);
    const backup = await new LocalSource(files).acquire(context);
    return { ...backup, source: { type: 'url', urls } };
  }

  private async resolveUrls({ urls, config, repeatLastRun }: SourceContext): Promise<string[]> {
    if (urls?.length) return urls;
    if (repeatLastRun && config.source?.type === 'url') return config.source.urls;

    const answers = [await text('Backup URL', { placeholder: 'https://example.com/backup.zip', validate: validateUrl })];
    while (await confirm('Add another URL? (a separate .sql, or more UpdraftPlus parts)', false)) {
      answers.push(await text('URL', { validate: validateUrl }));
    }
    return answers;
  }
}
