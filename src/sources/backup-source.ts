import type { Config, SourceConfig } from '../project/config.js';
import type { ProjectPaths } from '../project/paths.js';
import type { SecretStore } from '../project/secrets.js';

export interface Backup {
  contentDir: string;
  dumpPath: string;
  disposable: boolean;
  format: string;
  source: SourceConfig;
}

export interface SourceContext {
  paths: ProjectPaths;
  config: Config;
  secrets: SecretStore;
  repeatLastRun: boolean;
  urls?: string[];
}

export interface BackupSource {
  acquire(context: SourceContext): Promise<Backup>;
}
