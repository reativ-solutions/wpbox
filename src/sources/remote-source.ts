import fs from 'node:fs';
import path from 'node:path';
import { EXCLUDED_CONTENT } from '../backup/layout.js';
import { scanImportFolder } from '../backup/import-files.js';
import { stageBackup } from '../backup/stage.js';
import type { RemoteConnection, RemoteDatabaseSource, RemoteSourceConfig } from '../project/config.js';
import type { ProjectPaths } from '../project/paths.js';
import { connect } from '../remote/connect.js';
import { mirror, type MirrorProgress } from '../remote/mirror.js';
import { dumpRemoteMysql, exportWithTemporaryScript } from '../remote/remote-database.js';
import type { ConnectionOptions, Protocol, RemoteFileSystem } from '../remote/remote-fs.js';
import { findWordPressInstalls, parseWpConfig, readRemoteFile, type WpConfig } from '../remote/wordpress-locator.js';
import { log, task } from '../ui/output.js';
import { confirm, password } from '../ui/prompts.js';
import { UserError } from '../utils/errors.js';
import { formatBytes } from '../utils/format.js';
import type { Backup, BackupSource, SourceContext } from './backup-source.js';
import {
  askConnection,
  askDatabaseSource,
  askIncludeUploads,
  chooseInstall,
  previousRemoteConfig,
} from './remote-questions.js';

export class RemoteSource implements BackupSource {
  constructor(private readonly protocol: Protocol) {}

  async acquire(context: SourceContext): Promise<Backup> {
    const previous = previousRemoteConfig(context.config.source, this.protocol);
    const reuse = context.repeatLastRun && previous !== undefined;

    const connection = reuse ? previous.connection : await askConnection(this.protocol, previous?.connection);
    const secret = await this.secretFor(connection, context);
    const options: ConnectionOptions = { ...connection, protocol: this.protocol, password: secret };

    const client = await task(`Connecting to ${connection.host}`, () => connect(options));
    try {
      if (!client.encrypted) log.warn('The FTP server does not support TLS: the connection is not encrypted.');

      const install = reuse
        ? { root: previous.wordpressRoot, wpConfigPath: previous.wpConfigPath }
        : await chooseInstall(await task('Looking for WordPress', () => findWordPressInstalls(client)), previous?.wordpressRoot);
      const wpConfig = parseWpConfig(await readRemoteFile(client, install.wpConfigPath).catch(() => ''));
      const includeUploads = reuse ? previous.includeUploads : await askIncludeUploads(previous?.includeUploads);

      await this.syncContent(options, client, install.root, includeUploads, context.paths);

      const database = reuse ? previous.database : await askDatabaseSource(connection, wpConfig, previous?.database);
      const dumpPath = await this.fetchDatabase(database, { client, install: install.root, wpConfig, context });

      await this.offerToSaveSecret(connection, secret, context);

      const source: RemoteSourceConfig = {
        type: this.protocol,
        connection,
        wordpressRoot: install.root,
        wpConfigPath: install.wpConfigPath,
        includeUploads,
        database,
      };
      return {
        contentDir: context.paths.mirror,
        dumpPath,
        disposable: false,
        format: `${this.protocol.toUpperCase()} (${connection.host})`,
        source,
      };
    } finally {
      await client.close();
    }
  }

  private async syncContent(
    connection: ConnectionOptions,
    client: RemoteFileSystem,
    wordpressRoot: string,
    includeUploads: boolean,
    paths: ProjectPaths,
  ): Promise<void> {
    const exclude = (relativePath: string) => {
      const topLevel = relativePath.split('/')[0];
      return EXCLUDED_CONTENT.has(topLevel) || (!includeUploads && topLevel === 'uploads');
    };

    const result = await task('Syncing wp-content', (report) =>
      mirror({
        connection,
        client,
        remoteRoot: path.posix.join(wordpressRoot, 'wp-content'),
        localRoot: paths.mirror,
        exclude,
        onProgress: (progress) => report(describeMirrorProgress(progress)),
      }),
    );
    log.success(`wp-content synced: ${result.files} files, ${result.downloaded} downloaded, ${result.removed} removed locally`);
  }

  private async fetchDatabase(database: RemoteDatabaseSource, remote: DatabaseFetchContext): Promise<string> {
    const { paths } = remote.context;
    fs.rmSync(paths.stage, { recursive: true, force: true });

    switch (database.method) {
      case 'exporter':
        return task('Exporting the database through a temporary script', (report) =>
          exportWithTemporaryScript(remote.client, remote.install, database.siteUrl, paths.stage, (bytes) =>
            report(`Exporting the database… ${formatBytes(bytes)}`),
          ),
        );

      case 'mysql': {
        const secretKey = `mysql://${database.user}@${database.host}`;
        const dbPassword =
          remote.context.secrets.get(secretKey) ??
          remote.wpConfig.dbPassword ??
          (await password('Database password', 'WPBOX_DB_PASSWORD'));
        return task(`Dumping the database from ${database.host}`, () =>
          dumpRemoteMysql({ ...database, password: dbPassword }, paths.stage),
        );
      }

      case 'file': {
        const staged = await stageBackup(scanImportFolder(paths.import), paths, { includeContent: false });
        if (!staged.dumpPath) throw new UserError('No .sql file found in import/.');
        return staged.dumpPath;
      }
    }
  }

  private async secretFor(connection: RemoteConnection, context: SourceContext): Promise<string> {
    const saved = context.secrets.get(secretKey(this.protocol, connection));
    if (saved !== undefined) return saved;
    if (connection.privateKey) return process.env.WPBOX_KEY_PASSPHRASE ?? '';
    return password(`${this.protocol.toUpperCase()} password`, 'WPBOX_FTP_PASSWORD');
  }

  private async offerToSaveSecret(connection: RemoteConnection, secret: string, context: SourceContext): Promise<void> {
    const key = secretKey(this.protocol, connection);
    if (!secret || context.repeatLastRun || context.secrets.has(key)) return;

    if (await confirm('Save the password for `wpbox pull`? (stored in .wpbox/secrets.json)', false)) {
      context.secrets.set(key, secret);
    }
  }
}

interface DatabaseFetchContext {
  client: RemoteFileSystem;
  install: string;
  wpConfig: WpConfig;
  context: SourceContext;
}

function secretKey(protocol: Protocol, connection: RemoteConnection): string {
  return `${protocol}://${connection.user}@${connection.host}`;
}

function describeMirrorProgress(progress: MirrorProgress): string {
  return progress.phase === 'scan'
    ? `Scanning remote files… ${progress.files} files in ${progress.folders} folders`
    : `Downloading ${progress.done}/${progress.total} files  (${formatBytes(progress.bytes)} / ${formatBytes(progress.totalBytes)})`;
}
