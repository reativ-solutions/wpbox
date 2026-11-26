import fs from 'node:fs';

export interface DumpAnalysis {
  tables: string[];
  options: Partial<Record<TrackedOption, string[]>>;
}

type TrackedOption = 'home' | 'siteurl' | 'whl_page';

const CHUNK_SIZE = 1024 * 1024;
const CHUNK_OVERLAP = 64 * 1024;
const CREATE_TABLE = /CREATE TABLE (?:IF NOT EXISTS )?`([^`]+)`/g;
const OPTION_ROW = /\(\s*'?\d+'?\s*,\s*'(home|siteurl|whl_page)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*,\s*'[^']*'\s*\)/g;
const SQL_ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', '0': '\0' };

export async function analyzeDump(file: string): Promise<DumpAnalysis> {
  const tables = new Set<string>();
  const options: DumpAnalysis['options'] = {};
  let carry = '';

  for await (const chunk of fs.createReadStream(file, { encoding: 'utf8', highWaterMark: CHUNK_SIZE })) {
    const text = carry + String(chunk);
    for (const [, table] of text.matchAll(CREATE_TABLE)) tables.add(table);
    for (const [, name, value] of text.matchAll(OPTION_ROW)) addOption(options, name as TrackedOption, unescapeSql(value));
    carry = text.slice(-CHUNK_OVERLAP);
  }

  return { tables: [...tables].sort(), options };
}

export function findTablePrefixes(tables: string[]): string[] {
  const known = new Set(tables);
  return tables
    .filter((table) => table.endsWith('options'))
    .map((table) => table.slice(0, -'options'.length))
    .filter((prefix) => known.has(`${prefix}posts`) && known.has(`${prefix}users`));
}

export function isMultisite(tables: string[], prefix: string): boolean {
  return tables.includes(`${prefix}blogs`) && tables.includes(`${prefix}site`);
}

export function productionUrls(analysis: DumpAnalysis): string[] {
  const urls = [...(analysis.options.home ?? []), ...(analysis.options.siteurl ?? [])]
    .map((url) => url.replace(/\/+$/, ''))
    .filter((url) => /^https?:\/\//.test(url));
  return [...new Set(urls)];
}

export function unescapeSql(value: string): string {
  return value.replace(/\\(.)/g, (_, character: string) => SQL_ESCAPES[character] ?? character);
}

function addOption(options: DumpAnalysis['options'], name: TrackedOption, value: string): void {
  const values = (options[name] ??= []);
  if (!values.includes(value)) values.push(value);
}
