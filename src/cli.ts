import { createRequire } from 'node:module';
import { Command } from 'commander';
import * as database from './commands/database.js';
import { init } from './commands/init/index.js';
import * as site from './commands/site.js';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

export async function main(argv: string[]): Promise<void> {
  const program = new Command()
    .name('wpbox')
    .description('Turn any WordPress backup into a local Docker development environment.')
    .version(version)
    .enablePositionalOptions()
    .showHelpAfterError();

  program
    .command('init')
    .description('create the local site from a backup (files in import/, a URL, or a live site over FTP/SFTP)')
    .option('-y, --yes', "don't ask: use detected values and the ones saved in .wpbox/config.json")
    .option('-f, --force', 'overwrite your themes/plugins in src/ and existing uploads with the backup version')
    .option('-s, --source <type>', 'backup source: local, url, ftp or sftp')
    .option('-u, --url <urls...>', 'download the backup from these URLs')
    .action((options: { yes?: boolean; force?: boolean; source?: string; url?: string[] }) =>
      init({ ...options, urls: options.url }),
    );

  program
    .command('pull')
    .description('refresh from the same source as last time (your code in src/ is kept)')
    .option('-f, --force', 'overwrite your themes/plugins in src/ with the backup version')
    .action((options: { force?: boolean }) => init({ ...options, repeatLastRun: true }));

  program.command('up').description('start the containers').action(site.up);
  program.command('down').description('stop the containers (data is kept)').action(site.down);
  program.command('info').description('show URLs, credentials and folders').action(site.info);

  program
    .command('open')
    .description('open the site in your browser')
    .option('-a, --admin', 'open the admin dashboard')
    .option('-m, --mail', 'open Mailpit (caught emails)')
    .action(site.open);

  program
    .command('logs')
    .description('follow container logs')
    .argument('[service]', 'wordpress, database or mailpit')
    .action(site.logs);

  program
    .command('wp')
    .description('run WP-CLI in the container (e.g. wpbox wp plugin list)')
    .argument('[args...]')
    .allowUnknownOption()
    .passThroughOptions()
    .helpOption(false)
    .action(site.wpCli);

  program.command('shell').description('open a shell in the WordPress container').action(site.shell);

  program.command('db:dump').description('dump the local database to dumps/').action(database.dump);
  program
    .command('db:reimport')
    .description('restore the database from the backup (discards database changes)')
    .action(database.reimport);

  program
    .command('destroy')
    .description('remove containers and volumes (src/, import/ and dumps/ are kept)')
    .option('-y, --yes', "don't ask for confirmation")
    .action(site.destroy);

  await program.parseAsync(argv);
}
