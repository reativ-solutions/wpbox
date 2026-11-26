import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';
import { normalizeEntry } from '../layout.js';
import { countBytes, type ArchiveEntry, type ArchiveReader, type BytesListener, type EntryDestination } from './archive-reader.js';

const FILE_TYPES = new Set(['File', 'OldFile']);

export class TarReader implements ArchiveReader {
  constructor(private readonly file: string) {}

  async list(): Promise<ArchiveEntry[]> {
    const entries: ArchiveEntry[] = [];
    await tar.t({
      file: this.file,
      onReadEntry: (entry) => {
        if (FILE_TYPES.has(entry.type)) entries.push({ name: normalizeEntry(entry.path), size: entry.size ?? 0 });
      },
    });
    return entries;
  }

  async extract(destination: EntryDestination, onBytes?: BytesListener): Promise<void> {
    const pendingWrites: Promise<void>[] = [];

    const parser = new tar.Parser({
      onReadEntry: (entry) => {
        const target = FILE_TYPES.has(entry.type) ? destination(normalizeEntry(entry.path)) : null;
        if (!target) {
          entry.resume();
          return;
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const output = fs.createWriteStream(target);
        pendingWrites.push(new Promise((resolve, reject) => output.on('finish', resolve).on('error', reject)));
        entry.pipe(countBytes(onBytes)).pipe(output);
      },
    });

    await pipeline(fs.createReadStream(this.file), parser);
    await Promise.all(pendingWrites);
  }
}
