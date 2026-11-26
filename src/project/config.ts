import fs from 'node:fs';
import path from 'node:path';
import type { ProjectPaths } from './paths.js';

export interface LocalSite {
  url: string;
  port: number;
  mailpitPort: number;
}

export interface ProductionSite {
  url: string;
  tablePrefix: string;
}

export interface DevCode {
  themes: string[];
  plugins: string[];
}

export interface AdminUser {
  user: string;
  password: string;
  email: string;
}

export interface LocalDatabase {
  name: string;
  user: string;
  password: string;
  rootPassword: string;
}

export interface RemoteConnection {
  host: string;
  port: number;
  user: string;
  privateKey?: string;
}

export type RemoteDatabaseSource =
  | { method: 'exporter'; siteUrl: string }
  | { method: 'mysql'; host: string; port: number; name: string; user: string; tablePrefix: string }
  | { method: 'file' };

export type DatabaseMethod = RemoteDatabaseSource['method'];

export interface LocalSourceConfig {
  type: 'local';
}

export interface UrlSourceConfig {
  type: 'url';
  urls: string[];
}

export interface RemoteSourceConfig {
  type: 'ftp' | 'sftp';
  connection: RemoteConnection;
  wordpressRoot: string;
  wpConfigPath: string;
  includeUploads: boolean;
  database: RemoteDatabaseSource;
}

export type SourceConfig = LocalSourceConfig | UrlSourceConfig | RemoteSourceConfig;

export type SourceType = SourceConfig['type'];

export interface Config {
  project: string;
  wordpressImage: string;
  local?: LocalSite;
  production?: ProductionSite;
  devCode: DevCode;
  disablePlugins: string[];
  admin: AdminUser;
  database: LocalDatabase;
  source?: SourceConfig;
}

export type InitializedConfig = Config & Required<Pick<Config, 'local' | 'production' | 'source'>>;

export const DEFAULT_DISABLED_PLUGINS = [
  'wps-hide-login',
  'google-site-kit',
  'cmp-coming-soon-maintenance',
  'coming-soon',
  'maintenance',
  'under-construction-page',
  'wordfence',
  'better-wp-security',
  'all-in-one-wp-security-and-firewall',
  'really-simple-ssl',
  'wp-rocket',
  'w3-total-cache',
  'wp-super-cache',
  'litespeed-cache',
  'wp-fastest-cache',
  'autoptimize',
  'jetpack',
];

export function defaultConfig(root: string): Config {
  return {
    project: slugify(path.basename(root)) || 'site',
    wordpressImage: 'php8.3-apache',
    devCode: { themes: [], plugins: [] },
    disablePlugins: DEFAULT_DISABLED_PLUGINS,
    admin: { user: 'admin', password: 'admin', email: 'admin@local.test' },
    database: { name: 'wordpress', user: 'wordpress', password: 'wordpress', rootPassword: 'root' },
  };
}

export function isInitialized(config: Config): config is InitializedConfig {
  return Boolean(config.local && config.production && config.source);
}

export function hasConfig(paths: ProjectPaths): boolean {
  return fs.existsSync(paths.config);
}

export function loadConfig(paths: ProjectPaths): Config {
  const defaults = defaultConfig(paths.root);
  if (!hasConfig(paths)) return defaults;

  const saved = JSON.parse(fs.readFileSync(paths.config, 'utf8')) as Partial<Config>;
  return {
    ...defaults,
    ...saved,
    devCode: { ...defaults.devCode, ...saved.devCode },
    admin: { ...defaults.admin, ...saved.admin },
    database: { ...defaults.database, ...saved.database },
  };
}

export function saveConfig(paths: ProjectPaths, config: Config): void {
  fs.mkdirSync(paths.box, { recursive: true });
  fs.writeFileSync(paths.config, `${JSON.stringify(config, null, 2)}\n`);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
