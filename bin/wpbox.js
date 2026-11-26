#!/usr/bin/env node
import { main } from '../dist/cli.js';
import { log } from '../dist/ui/output.js';
import { UserError } from '../dist/utils/errors.js';

main(process.argv).catch((error) => {
  log.error(error instanceof Error ? error.message : String(error));
  if (!(error instanceof UserError)) {
    console.error(process.env.DEBUG ? error.stack : 'Run with DEBUG=1 for the full stack trace.');
  }
  process.exit(1);
});
