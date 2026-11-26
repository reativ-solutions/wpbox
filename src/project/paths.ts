import path from 'node:path';

export interface ProjectPaths {
  readonly root: string;
  readonly import: string;
  readonly srcThemes: string;
  readonly srcPlugins: string;
  readonly srcUploads: string;
  readonly dumps: string;
  readonly box: string;
  readonly config: string;
  readonly secrets: string;
  readonly compose: string;
  readonly dockerContext: string;
  readonly stage: string;
  readonly stagedContent: string;
  readonly stagedDump: string;
  readonly mirror: string;
}

export function projectPaths(root: string = process.cwd()): ProjectPaths {
  const box = path.join(root, '.wpbox');
  const stage = path.join(box, 'stage');

  return {
    root,
    import: path.join(root, 'import'),
    srcThemes: path.join(root, 'src', 'themes'),
    srcPlugins: path.join(root, 'src', 'plugins'),
    srcUploads: path.join(root, 'src', 'uploads'),
    dumps: path.join(root, 'dumps'),
    box,
    config: path.join(box, 'config.json'),
    secrets: path.join(box, 'secrets.json'),
    compose: path.join(box, 'compose.yaml'),
    dockerContext: path.join(box, 'docker'),
    stage,
    stagedContent: path.join(stage, 'wp-content'),
    stagedDump: path.join(stage, 'database.sql'),
    mirror: path.join(box, 'mirror', 'wp-content'),
  };
}
