import fs from 'node:fs';
import path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface ArchiveEntry {
  name: string;
  size: number;
}

export type EntryDestination = (entryName: string) => string | null;

export type BytesListener = (bytes: number) => void;

export interface ArchiveReader {
  list(): Promise<ArchiveEntry[]>;
  extract(destination: EntryDestination, onBytes?: BytesListener): Promise<void>;
}

export function countBytes(onBytes?: BytesListener): Transform {
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      onBytes?.(chunk.length);
      callback(null, chunk);
    },
  });
}

export async function writeEntry(source: Readable, target: string, onBytes?: BytesListener): Promise<void> {
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await pipeline(source, countBytes(onBytes), fs.createWriteStream(target));
}
