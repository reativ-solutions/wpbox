import type { Readable } from 'node:stream';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import { normalizeEntry } from '../layout.js';
import { writeEntry, type ArchiveEntry, type ArchiveReader, type BytesListener, type EntryDestination } from './archive-reader.js';

export class ZipReader implements ArchiveReader {
  constructor(private readonly file: string) {}

  async list(): Promise<ArchiveEntry[]> {
    const entries: ArchiveEntry[] = [];
    await this.forEachFile(async (entry) => {
      entries.push({ name: normalizeEntry(entry.fileName), size: entry.uncompressedSize });
    });
    return entries;
  }

  async extract(destination: EntryDestination, onBytes?: BytesListener): Promise<void> {
    await this.forEachFile(async (entry, zip) => {
      const target = destination(normalizeEntry(entry.fileName));
      if (target) await writeEntry(await openEntry(zip, entry), target, onBytes);
    });
  }

  private async forEachFile(visit: (entry: Entry, zip: ZipFile) => Promise<void>): Promise<void> {
    const zip = await openZip(this.file);
    try {
      await new Promise<void>((resolve, reject) => {
        zip.on('error', reject);
        zip.on('end', resolve);
        zip.on('entry', (entry: Entry) => {
          const isDirectory = entry.fileName.endsWith('/');
          const visited = isDirectory ? Promise.resolve() : visit(entry, zip);
          visited.then(() => zip.readEntry(), reject);
        });
        zip.readEntry();
      });
    } finally {
      zip.close();
    }
  }
}

function openZip(file: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: false }, (error, zip) => (error ? reject(error) : resolve(zip)));
  });
}

function openEntry(zip: ZipFile, entry: Entry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => (error ? reject(error) : resolve(stream)));
  });
}
