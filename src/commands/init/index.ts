import fs from 'node:fs';
import { Compose } from '../../docker/compose.js';
import { writeComposeProject } from '../../docker/compose-file.js';
import { ensureDocker } from '../../docker/environment.js';
import { loadConfig, saveConfig, type Config, type InitializedConfig } from '../../project/config.js';
import { ensureGitignore } from '../../project/gitignore.js';
import { projectPaths, type ProjectPaths } from '../../project/paths.js';
import { SecretStore } from '../../project/secrets.js';
import { chooseSourceType, createSource, type Backup } from '../../sources/index.js';
import { intro, log, note, outro, pc, task } from '../../ui/output.js';
import { useDefaultAnswers } from '../../ui/prompts.js';
import { UserError } from '../../utils/errors.js';
import { placeContent } from '../../wordpress/content.js';
import { importDump, localizeSite } from '../../wordpress/database.js';
import { loginUrl, renderSummary } from '../../wordpress/summary.js';
import { analyzeSite } from './analyze.js';
import { askDevCode, askLocalSite } from './questions.js';

export interface InitOptions {
  yes?: boolean;
  force?: boolean;
  source?: string;
  urls?: string[];
  repeatLastRun?: boolean;
}

export async function init(options: InitOptions = {}): Promise<void> {
  const paths = projectPaths();
  const repeatLastRun = Boolean(options.repeatLastRun);
  useDefaultAnswers(Boolean(options.yes) || repeatLastRun);
  intro(`${pc.bgCyan(pc.black(' wpbox '))} ${repeatLastRun ? 'pull' : 'init'}`);

  await ensureDocker();
  const config = loadConfig(paths);
  if (repeatLastRun && !config.source) throw new UserError('Nothing to pull from yet. Run `wpbox init` first.');
  fs.mkdirSync(paths.import, { recursive: true });

  const backup = await acquireBackup(paths, config, options);
  const site = await analyzeSite(backup.dumpPath, config.production?.tablePrefix);
  const ready: InitializedConfig = {
    ...config,
    local: await askLocalSite(config.local),
    devCode: await askDevCode(backup.contentDir, config.devCode),
    production: site.production,
    source: backup.source,
  };

  saveConfig(paths, ready);
  ensureGitignore(paths);
  writeComposeProject(paths, ready);

  const compose = new Compose(paths);
  await buildSite(compose, paths, ready, backup, site.productionUrls, Boolean(options.force));

  note(renderSummary(ready, await loginUrl(compose, ready)), 'Your site is ready 🎉');
  outro(`Run ${pc.cyan('wpbox open')} to open it in the browser.`);
}

async function acquireBackup(paths: ProjectPaths, config: Config, options: InitOptions): Promise<Backup> {
  const requestedSource = options.urls?.length ? 'url' : options.source;
  const type = options.repeatLastRun && config.source ? config.source.type : await chooseSourceType(paths, config, requestedSource);

  return createSource(type).acquire({
    paths,
    config,
    secrets: new SecretStore(paths.secrets),
    repeatLastRun: Boolean(options.repeatLastRun),
    urls: options.urls,
  });
}

async function buildSite(
  compose: Compose,
  paths: ProjectPaths,
  config: InitializedConfig,
  backup: Backup,
  productionUrls: string[],
  overwrite: boolean,
): Promise<void> {
  await task('Starting containers (the first run builds the image)', () => compose.up());
  await task('Importing database', () => importDump(compose));

  log.step('Copying files');
  await placeContent({
    paths,
    compose,
    devCode: config.devCode,
    contentDir: backup.contentDir,
    disposable: backup.disposable,
    overwrite,
  });

  const { deactivatedPlugins } = await task('Preparing WordPress for local use', () =>
    localizeSite(compose, config, productionUrls),
  );
  if (deactivatedPlugins.length) log.info(`Deactivated locally: ${deactivatedPlugins.join(', ')}`);
  if (backup.disposable) fs.rmSync(paths.stagedContent, { recursive: true, force: true });
}
