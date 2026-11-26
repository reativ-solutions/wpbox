import { spawn } from 'node:child_process';
import { UserError } from './errors.js';

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  inherit?: boolean;
  allowFail?: boolean;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export class CommandError extends Error {
  constructor(
    readonly command: string,
    readonly result: RunResult,
  ) {
    super(`${command} failed (exit ${result.code})\n${lastLines(result.stderr || result.stdout, 15)}`.trim());
    this.name = 'CommandError';
  }
}

export function run(command: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  const { cwd, env, input, inherit = false, allowFail = false } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: inherit ? 'inherit' : 'pipe',
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk));
    child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk));
    child.stdin?.end(input);

    child.on('error', (error: NodeJS.ErrnoException) => {
      reject(error.code === 'ENOENT' ? new UserError(`Command not found: ${command}`) : error);
    });

    child.on('close', (exitCode) => {
      const result = { code: exitCode ?? 1, stdout, stderr };
      if (result.code === 0 || allowFail) resolve(result);
      else reject(new CommandError(describe(command, args), result));
    });
  });
}

function describe(command: string, args: string[]): string {
  const shown = args.slice(0, 6).join(' ');
  return args.length > 6 ? `${command} ${shown} …` : `${command} ${shown}`;
}

function lastLines(text: string, count: number): string {
  return text.trim().split('\n').slice(-count).join('\n');
}
