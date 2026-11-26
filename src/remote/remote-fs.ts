import type { RemoteConnection } from '../project/config.js';

export type Protocol = 'ftp' | 'sftp';

export interface RemoteEntry {
  name: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number | null;
}

export interface ConnectionOptions extends RemoteConnection {
  protocol: Protocol;
  password?: string;
}

export interface RemoteFileSystem {
  readonly encrypted: boolean;
  list(dir: string): Promise<RemoteEntry[]>;
  download(remotePath: string, localPath: string): Promise<void>;
  upload(content: string, remotePath: string): Promise<void>;
  remove(remotePath: string): Promise<void>;
  workingDirectory(): Promise<string>;
  close(): Promise<void>;
}
