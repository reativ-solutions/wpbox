import type { ArchiveKind } from '../import-files.js';
import type { ArchiveReader } from './archive-reader.js';
import { TarReader } from './tar-reader.js';
import { WpressReader } from './wpress-reader.js';
import { ZipReader } from './zip-reader.js';

export type { ArchiveEntry, ArchiveReader } from './archive-reader.js';
export { TarReader, WpressReader, ZipReader };

export function openArchive(file: string, kind: ArchiveKind): ArchiveReader {
  switch (kind) {
    case 'zip':
      return new ZipReader(file);
    case 'tar':
      return new TarReader(file);
    case 'wpress':
      return new WpressReader(file);
  }
}
