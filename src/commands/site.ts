import { ensureDocker } from '../docker/environment.js';
import { log, note, task } from '../ui/output.js';
import { confirm } from '../ui/prompts.js';
import { run } from '../utils/exec.js';
import { loginUrl, renderSummary } from '../wordpress/summary.js';
import { openProject } from './project.js';

export interface OpenOptions {
  admin?: boolean;
  mail?: boolean;
}

export async function up(): Promise<void> {
  const { config, compose } = openProject();
  await ensureDocker();
  await task('Starting containers', () => compose.up());
  note(renderSummary(config, await loginUrl(compose, config)), 'Running');
}

export async function down(): Promise<void> {
  const { compose } = openProject();
  await task('Stopping containers', () => compose.down());
}

export async function info(): Promise<void> {
  const { config, compose } = openProject();
  const login = await loginUrl(compose, config).catch(() => `${config.local.url}/wp-admin/`);
  note(renderSummary(config, login), 'wpbox');
}

export async function open(options: OpenOptions): Promise<void> {
  const { config, compose } = openProject();
  if (options.mail) return openInBrowser(`http://localhost:${config.local.mailpitPort}`);
  return openInBrowser(options.admin ? await loginUrl(compose, config) : config.local.url);
}

export async function logs(service?: string): Promise<void> {
  const { compose } = openProject();
  process.exitCode = await compose.attach(['logs', '-f', '--tail=100', ...(service ? [service] : [])]);
}

export async function wpCli(args: string[]): Promise<void> {
  const { compose } = openProject();
  const tty = process.stdin.isTTY && process.stdout.isTTY ? [] : ['-T'];
  process.exitCode = await compose.attach(['exec', ...tty, '--user', 'www-data', 'wordpress', 'wp', ...args]);
}

export async function shell(): Promise<void> {
  const { compose } = openProject();
  process.exitCode = await compose.attach(['exec', 'wordpress', 'bash']);
}

export async function destroy(options: { yes?: boolean }): Promise<void> {
  const { compose } = openProject();
  const confirmed = options.yes || (await confirm('Remove the containers, the database and the WordPress core volume?', false));
  if (!confirmed) {
    log.info('Cancelled.');
    return;
  }

  await task('Removing containers and volumes', () => compose.down({ removeVolumes: true }));
  log.success('Done. Your files in src/, import/ and dumps/ are untouched. `wpbox init` starts over.');
}

async function openInBrowser(url: string): Promise<void> {
  if (process.platform === 'darwin') await run('open', [url]);
  else if (process.platform === 'win32') await run('cmd', ['/c', 'start', '""', url]);
  else await run('xdg-open', [url]);
}
