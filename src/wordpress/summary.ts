import type { Compose } from '../docker/compose.js';
import type { InitializedConfig } from '../project/config.js';
import { hostOf, isLoopbackHost } from '../project/site-url.js';
import { pc } from '../ui/output.js';

export async function loginUrl(compose: Compose, config: InitializedConfig): Promise<string> {
  const defaultLogin = `${config.local.url}/wp-admin/`;
  if (!(await compose.wpSucceeds(['plugin', 'is-active', 'wps-hide-login']))) return defaultLogin;

  const customSlug = await compose.wp(['option', 'get', 'whl_page'], { allowFail: true });
  const slug = customSlug.stdout.trim();
  return customSlug.code === 0 && slug ? `${config.local.url}/${slug}/` : defaultLogin;
}

export function renderSummary(config: InitializedConfig, login: string): string {
  const { local, admin, devCode } = config;

  const lines = [
    `🌐 Site      ${pc.cyan(local.url)}`,
    `🔑 Admin     ${pc.cyan(login)}  ${pc.dim(`(${admin.user} / ${admin.password})`)}`,
    `📬 Emails    ${pc.cyan(`http://localhost:${local.mailpitPort}`)}  ${pc.dim('(Mailpit)')}`,
    ...devCode.themes.map((theme) => `🎨 Theme     src/themes/${theme}`),
    ...devCode.plugins.map((plugin) => `🔌 Plugin    src/plugins/${plugin}`),
    '🖼️  Uploads   src/uploads',
  ];

  const host = hostOf(local.url);
  return isLoopbackHost(host) ? lines.join('\n') : [...lines, '', ...hostsFileInstructions(host)].join('\n');
}

function hostsFileInstructions(host: string): string[] {
  return [
    `Add ${pc.bold(`127.0.0.1 ${host}`)} to your hosts file (once):`,
    `  macOS/Linux: sudo sh -c 'echo "127.0.0.1 ${host}" >> /etc/hosts'`,
    '  Windows:     C:\\Windows\\System32\\drivers\\etc\\hosts (Notepad as administrator)',
  ];
}
