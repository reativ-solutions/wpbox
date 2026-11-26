import * as clack from '@clack/prompts';
import { UserError } from '../utils/errors.js';

export interface Choice<T> {
  value: T;
  label: string;
  hint?: string;
}

export interface TextOptions {
  initial?: string;
  placeholder?: string;
  validate?: (value: string) => string | undefined;
}

let assumeDefaults = false;

export function useDefaultAnswers(enabled: boolean): void {
  assumeDefaults = enabled;
}

export function isInteractive(): boolean {
  return !assumeDefaults && hasTerminal();
}

export async function text(message: string, options: TextOptions = {}): Promise<string> {
  const { initial, placeholder, validate } = options;

  if (!isInteractive()) {
    if (!initial) throw needsAnswer(message);
    const error = validate?.(initial);
    if (error) throw new UserError(`${message}: ${error}`);
    return initial;
  }

  const answer = await clack.text({
    message,
    placeholder,
    initialValue: initial,
    validate: (value) => {
      const trimmed = (value ?? '').trim();
      return trimmed ? validate?.(trimmed) : 'This value is required';
    },
  });
  return unwrap(answer).trim();
}

export async function password(message: string, environmentVariable?: string): Promise<string> {
  const fromEnvironment = environmentVariable ? process.env[environmentVariable] : undefined;
  if (fromEnvironment) return fromEnvironment;

  if (!hasTerminal()) {
    throw needsAnswer(environmentVariable ? `${message} (or set ${environmentVariable})` : message);
  }
  return unwrap(await clack.password({ message }));
}

export async function confirm(message: string, initial: boolean): Promise<boolean> {
  if (!isInteractive()) return initial;
  return unwrap(await clack.confirm({ message, initialValue: initial }));
}

export async function select<T>(message: string, choices: Choice<T>[], initial?: T): Promise<T> {
  if (!isInteractive()) {
    const fallback = initial ?? choices[0]?.value;
    if (fallback === undefined) throw needsAnswer(message);
    return fallback;
  }
  return unwrap(await clack.select<T>({ message, options: asClackOptions(choices), initialValue: initial }));
}

export async function multiselect<T>(message: string, choices: Choice<T>[], initial: T[]): Promise<T[]> {
  if (!isInteractive() || choices.length === 0) return initial;

  const answer = await clack.multiselect<T>({
    message,
    options: asClackOptions(choices),
    initialValues: initial,
    required: false,
  });
  return unwrap(answer);
}

function hasTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY) && !process.env.CI;
}

function unwrap<T>(answer: T): Exclude<T, symbol> {
  if (clack.isCancel(answer)) {
    clack.cancel('Cancelled.');
    process.exit(130);
  }
  return answer as Exclude<T, symbol>;
}

function needsAnswer(message: string): UserError {
  return new UserError(`"${message}" needs an answer, but wpbox is running without questions (no terminal or --yes).`);
}

function asClackOptions<T>(choices: Choice<T>[]): clack.Option<T>[] {
  return choices as clack.Option<T>[];
}
