import { fail, ok, type Result } from '../utils/result.js';

export interface SiteAddress {
  url: string;
  host: string;
  port: number;
  https: boolean;
}

export function parseSiteUrl(input: string): Result<SiteAddress> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return fail('Not a valid URL (e.g. http://localhost:8090)');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return fail('Must start with http:// or https://');
  if (url.pathname !== '/' || url.search || url.hash) return fail("Can't contain a path (e.g. http://localhost:8090)");

  const https = url.protocol === 'https:';
  return ok({
    url: `${url.protocol}//${url.host}`,
    host: url.hostname,
    port: url.port ? Number(url.port) : https ? 443 : 80,
    https,
  });
}

export function hostOf(siteUrl: string): string {
  return new URL(siteUrl).hostname;
}

export function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
}
