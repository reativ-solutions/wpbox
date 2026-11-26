import { UserError } from '../utils/errors.js';
import { FtpFileSystem } from './ftp-fs.js';
import type { ConnectionOptions, RemoteFileSystem } from './remote-fs.js';
import { SftpFileSystem } from './sftp-fs.js';

export async function connect(options: ConnectionOptions): Promise<RemoteFileSystem> {
  try {
    return options.protocol === 'sftp' ? await SftpFileSystem.connect(options) : await FtpFileSystem.connect(options);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new UserError(`Could not connect to ${options.protocol.toUpperCase()} ${options.host}: ${reason}`);
  }
}

export async function connectPool(options: ConnectionOptions, first: RemoteFileSystem, size: number): Promise<RemoteFileSystem[]> {
  const extra = await Promise.allSettled(Array.from({ length: size - 1 }, () => connect(options)));
  const connected = extra.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  return [first, ...connected];
}
