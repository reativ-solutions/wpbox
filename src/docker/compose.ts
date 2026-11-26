import fs from 'node:fs';
import type { ProjectPaths } from '../project/paths.js';
import { UserError } from '../utils/errors.js';
import { run, type RunOptions, type RunResult } from '../utils/exec.js';

export type Service = 'wordpress' | 'database' | 'mailpit';

export interface ExecOptions extends Omit<RunOptions, 'env'> {
  env?: Record<string, string>;
  user?: string;
}

export class Compose {
  constructor(private readonly paths: ProjectPaths) {}

  up(): Promise<RunResult> {
    return this.run(['up', '-d', '--build', '--wait', '--remove-orphans']);
  }

  down({ removeVolumes = false } = {}): Promise<RunResult> {
    return this.run(removeVolumes ? ['down', '-v', '--remove-orphans'] : ['down']);
  }

  async attach(args: string[]): Promise<number> {
    const result = await this.run(args, { inherit: true, allowFail: true });
    return result.code;
  }

  exec(service: Service, command: string[], options: ExecOptions = {}): Promise<RunResult> {
    const { env = {}, user, ...runOptions } = options;
    const userFlags = user ? ['--user', user] : [];
    const envFlags = Object.keys(env).flatMap((name) => ['-e', name]);

    return this.run(['exec', '-T', ...userFlags, ...envFlags, service, ...command], { ...runOptions, env });
  }

  shell(service: Service, script: string, args: string[] = [], options: ExecOptions = {}): Promise<RunResult> {
    return this.exec(service, ['sh', '-c', script, 'sh', ...args], options);
  }

  wp(args: string[], options: ExecOptions = {}): Promise<RunResult> {
    return this.exec('wordpress', ['wp', '--allow-root', '--skip-plugins', '--skip-themes', ...args], options);
  }

  async wpSucceeds(args: string[]): Promise<boolean> {
    const result = await this.wp(args, { allowFail: true });
    return result.code === 0;
  }

  private run(args: string[], options: RunOptions = {}): Promise<RunResult> {
    if (!fs.existsSync(this.paths.compose)) {
      throw new UserError('No wpbox project here. Run `wpbox init` first.');
    }
    return run('docker', ['compose', '-f', this.paths.compose, ...args], { cwd: this.paths.root, ...options });
  }
}
