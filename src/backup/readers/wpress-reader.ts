import fs from 'node:fs';
import { Readable } from 'node:stream';
import { normalizeEntry } from '../layout.js';
import { writeEntry, type ArchiveEntry, type ArchiveReader, type BytesListener, type EntryDestination } from './archive-reader.js';

const HEADER_SIZE = 4377;
const NAME = { offset: 0, length: 255 };
const SIZE = { offset: 255, length: 14 };
const PREFIX = { offset: 281, length: 4096 };

interface WpressEntry extends ArchiveEntry {
  offset: number;
}

export class WpressReader implements ArchiveReader {
  constructor(private readonly file: string) {}

  async list(): Promise<ArchiveEntry[]> {
    const entries: ArchiveEntry[] = [];
    for await (const { name, size } of this.entries()) entries.push({ name, size });
    return entries;
  }

  async extract(destination: EntryDestination, onBytes?: BytesListener): Promise<void> {
    for await (const entry of this.entries()) {
      const target = destination(entry.name);
      if (target) await writeEntry(this.contentStream(entry), target, onBytes);
    }
  }

  async readText(entryName: string): Promise<string | null> {
    for await (const entry of this.entries()) {
      if (entry.name !== entryName) continue;
      const buffer = Buffer.alloc(entry.size);
      const handle = await fs.promises.open(this.file, 'r');
      try {
        await handle.read(buffer, 0, entry.size, entry.offset);
      } finally {
        await handle.close();
      }
      return buffer.toString('utf8');
    }
    return null;
  }

  private contentStream(entry: WpressEntry): Readable {
    if (entry.size === 0) return Readable.from([]);
    return fs.createReadStream(this.file, { start: entry.offset, end: entry.offset + entry.size - 1 });
  }

  private async *entries(): AsyncGenerator<WpressEntry> {
    const handle = await fs.promises.open(this.file, 'r');
    const header = Buffer.alloc(HEADER_SIZE);
    let position = 0;

    try {
      while ((await handle.read(header, 0, HEADER_SIZE, position)).bytesRead === HEADER_SIZE) {
        const name = readField(header, NAME);
        if (!name) break;

        const size = Number.parseInt(readField(header, SIZE), 10);
        if (!Number.isFinite(size) || size < 0) throw new Error(`Corrupted .wpress archive near byte ${position}`);

        const prefix = readField(header, PREFIX);
        const fullName = prefix && prefix !== '.' ? `${prefix}/${name}` : name;
        position += HEADER_SIZE;
        yield { name: normalizeEntry(fullName), size, offset: position };
        position += size;
      }
    } finally {
      await handle.close();
    }
  }
}

function readField(header: Buffer, field: { offset: number; length: number }): string {
  const bytes = header.subarray(field.offset, field.offset + field.length);
  const end = bytes.indexOf(0);
  return bytes.subarray(0, end === -1 ? field.length : end).toString('utf8');
}
