import net from 'node:net';
import { UserError } from '../utils/errors.js';
import { run } from '../utils/exec.js';

const DOCKER_DOWNLOAD_URL = 'https://www.docker.com/products/docker-desktop/';

export async function ensureDocker(): Promise<void> {
  try {
    await run('docker', ['version', '--format', '{{.Server.Version}}']);
  } catch (error) {
    if (error instanceof UserError) throw new UserError(`Docker is not installed. Get Docker Desktop: ${DOCKER_DOWNLOAD_URL}`);
    throw new UserError('Docker is not running. Start Docker Desktop and try again.');
  }

  try {
    await run('docker', ['compose', 'version']);
  } catch {
    throw new UserError('Docker Compose v2 is required (`docker compose`). Update Docker Desktop.');
  }
}

export async function findFreePort(start: number, exclude: number[] = []): Promise<number> {
  for (let port = start; port < start + 200; port++) {
    if (!exclude.includes(port) && (await isPortFree(port))) return port;
  }
  throw new UserError(`No free port found near ${start}.`);
}

export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}
