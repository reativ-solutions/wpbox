import * as clack from '@clack/prompts';
import pc from 'picocolors';

export { pc };

export const log = clack.log;

export const intro = clack.intro;

export const outro = clack.outro;

export const note = clack.note;

export type ProgressReporter = (message: string) => void;

export async function task<T>(title: string, work: (report: ProgressReporter) => Promise<T>): Promise<T> {
  if (!process.stdout.isTTY) {
    clack.log.step(title);
    return work(() => {});
  }

  const spinner = clack.spinner();
  spinner.start(title);
  try {
    const result = await work((message) => spinner.message(message));
    spinner.stop(title);
    return result;
  } catch (error) {
    spinner.error(title);
    throw error;
  }
}
