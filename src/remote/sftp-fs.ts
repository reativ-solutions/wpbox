import fs from 'node:fs';
import os from 'node:os';
import SftpClient from 'ssh2-sftp-client';
import type { ConnectionOptions, RemoteEntry, RemoteFileSystem } from './remote-fs.js';

const TIMEOUT_MS = 30_000;

export class SftpFileSystem implements RemoteFileSystem {
  readonly encrypted = true;

  private constructor(private readonly client: SftpClient) {}

  static async connect(options: ConnectionOptions): Promise<SftpFileSystem> {
    const client = new SftpClient();
    await client.connect({
      host: options.host,
      port: options.port,
      username: options.user,
      readyTimeout: TIMEOUT_MS,
      ...credentials(options),
    });
    return new SftpFileSystem(client);
  }

  async list(dir: string): Promise<RemoteEntry[]> {
    const items = await this.client.list(dir);
    return items
      .filter((item) => item.type === 'd' || item.type === '-')
      .map((item) => ({
        name: item.name,
        isDirectory: item.type === 'd',
        size: item.size,
        modifiedAt: item.modifyTime || null,
      }));
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    await this.client.fastGet(remotePath, localPath);
  }

  async upload(content: string, remotePath: string): Promise<void> {
    await this.client.put(Buffer.from(content), remotePath);
  }

  async remove(remotePath: string): Promise<void> {
    await this.client.delete(remotePath);
  }

  workingDirectory(): Promise<string> {
    return this.client.cwd();
  }

  async close(): Promise<void> {
    await this.client.end();
  }
}

function credentials(options: ConnectionOptions): { password: string } | { privateKey: Buffer; passphrase?: string } {
  if (!options.privateKey) return { password: options.password ?? '' };

  const keyPath = options.privateKey.replace(/^~(?=$|[/\\])/, os.homedir());
  return { privateKey: fs.readFileSync(keyPath), passphrase: options.password || undefined };
}
