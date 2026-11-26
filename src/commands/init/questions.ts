import { findFreePort, isPortFree } from '../../docker/environment.js';
import type { DevCode, LocalSite } from '../../project/config.js';
import { parseSiteUrl } from '../../project/site-url.js';
import { log, pc } from '../../ui/output.js';
import { multiselect, text } from '../../ui/prompts.js';
import { detectCustomCode, listCode } from '../../wordpress/content.js';

const FIRST_SITE_PORT = 8090;
const FIRST_MAILPIT_PORT = 8025;

export async function askLocalSite(previous?: LocalSite): Promise<LocalSite> {
  const suggestedPort = previous?.port ?? (await findFreePort(FIRST_SITE_PORT));
  const answer = await text('Local site URL', {
    initial: previous?.url ?? `http://localhost:${suggestedPort}`,
    validate: (value) => {
      const parsed = parseSiteUrl(value);
      return parsed.ok ? undefined : parsed.error;
    },
  });

  const parsed = parseSiteUrl(answer);
  if (!parsed.ok) throw new Error(parsed.error);
  const site = parsed.value;

  if (site.https) log.warn("wpbox doesn't serve HTTPS yet. Use http:// unless you put a proxy in front.");
  if (site.port !== previous?.port && !(await isPortFree(site.port))) {
    log.warn(`Port ${site.port} is already in use. Starting the site will fail unless you free it or choose another URL.`);
  }

  const mailpitPort =
    previous?.mailpitPort && previous.mailpitPort !== site.port
      ? previous.mailpitPort
      : await findFreePort(FIRST_MAILPIT_PORT, [site.port]);

  return { url: site.url, port: site.port, mailpitPort };
}

export async function askDevCode(contentDir: string, previous: DevCode): Promise<DevCode> {
  return {
    themes: await askCodeFolders(contentDir, 'themes', previous.themes),
    plugins: await askCodeFolders(contentDir, 'plugins', previous.plugins),
  };
}

async function askCodeFolders(contentDir: string, kind: 'themes' | 'plugins', previous: string[]): Promise<string[]> {
  const available = listCode(contentDir, kind);
  const custom = detectCustomCode(contentDir, kind);
  const preselected = previous.length ? previous.filter((name) => available.includes(name)) : custom;

  return multiselect(
    `Which ${kind} do you want to edit? ${pc.dim(`(mapped to src/${kind})`)}`,
    available.map((name) => ({ value: name, label: name, hint: custom.includes(name) ? 'custom code' : undefined })),
    preselected,
  );
}
