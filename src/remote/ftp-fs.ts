import { Readable } from 'node:stream';
import * as ftp from 'basic-ftp';
import type { ConnectionOptions, RemoteEntry, RemoteFileSystem } from './remote-fs.js';

const TIMEOUT_MS = 30_000;

export class FtpFileSystem implements RemoteFileSystem {
  private constructor(
    private readonly client: ftp.Client,
    readonly encrypted: boolean,
  ) {}

  static async connect(options: ConnectionOptions): Promise<FtpFileSystem> {
    const access: ftp.AccessOptions = {
      host: options.host,
      port: options.port,
      user: options.user,
      password: options.password,
    };

    const secureClient = new ftp.Client(TIMEOUT_MS);
    try {
      await secureClient.access({ ...access, secure: true, secureOptions: { rejectUnauthorized: false } });
      return new FtpFileSystem(secureClient, true);
    } catch {
      secureClient.close();
    }

    const plainClient = new ftp.Client(TIMEOUT_MS);
    await plainClient.access({ ...access, secure: false });
    return new FtpFileSystem(plainClient, false);
  }

  async list(dir: string): Promise<RemoteEntry[]> {
    const items = await this.client.list(dir);
    return items
      .filter((item) => item.name !== '.' && item.name !== '..' && (item.isFile || item.isDirectory))
      .map((item) => ({
        name: item.name,
        isDirectory: item.isDirectory,
        size: item.size,
        modifiedAt: item.modifiedAt?.getTime() ?? null,
      }));
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    await this.client.downloadTo(localPath, remotePath);
  }

  async upload(content: string, remotePath: string): Promise<void> {
    await this.client.uploadFrom(Readable.from([Buffer.from(content)]), remotePath);
  }

  async remove(remotePath: string): Promise<void> {
    await this.client.remove(remotePath);
  }

  workingDirectory(): Promise<string> {
    return this.client.pwd();
  }

  async close(): Promise<void> {
    this.client.close();
  }
}
