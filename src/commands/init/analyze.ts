import { analyzeDump, findTablePrefixes, isMultisite, productionUrls } from '../../backup/dump-analysis.js';
import type { ProductionSite } from '../../project/config.js';
import { log, pc, task } from '../../ui/output.js';
import { select } from '../../ui/prompts.js';
import { UserError } from '../../utils/errors.js';

export interface SiteAnalysis {
  production: ProductionSite;
  productionUrls: string[];
}

export async function analyzeSite(dumpPath: string, previousPrefix?: string): Promise<SiteAnalysis> {
  const dump = await task('Analyzing database dump', () => analyzeDump(dumpPath));

  const tablePrefix = await chooseTablePrefix(findTablePrefixes(dump.tables), previousPrefix);
  if (isMultisite(dump.tables, tablePrefix)) {
    log.warn('This is a multisite install. Multisite is not supported yet: expect rough edges.');
  }

  const urls = productionUrls(dump);
  if (urls.length === 0) throw new UserError("Couldn't find the site URL (home / siteurl) in the database dump.");

  log.info(`Production site ${pc.cyan(urls[0])}  ·  table prefix ${pc.cyan(tablePrefix)}`);
  return { production: { url: urls[0], tablePrefix }, productionUrls: urls };
}

async function chooseTablePrefix(prefixes: string[], previous?: string): Promise<string> {
  if (prefixes.length === 0) {
    throw new UserError("The database dump doesn't contain WordPress tables (no *options, *posts and *users).");
  }
  if (prefixes.length === 1) return prefixes[0];

  return select(
    'The dump has more than one WordPress install. Which table prefix is this site?',
    prefixes.map((prefix) => ({ value: prefix, label: prefix })),
    previous && prefixes.includes(previous) ? previous : prefixes[0],
  );
}
