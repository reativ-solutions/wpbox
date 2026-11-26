import { Compose } from '../docker/compose.js';
import { hasConfig, isInitialized, loadConfig, type InitializedConfig } from '../project/config.js';
import { projectPaths, type ProjectPaths } from '../project/paths.js';
import { UserError } from '../utils/errors.js';

export interface Project {
  paths: ProjectPaths;
  config: InitializedConfig;
  compose: Compose;
}

export function openProject(): Project {
  const paths = projectPaths();
  const config = loadConfig(paths);

  if (!hasConfig(paths) || !isInitialized(config)) {
    throw new UserError('No wpbox project in this folder. Run `wpbox init` first.');
  }
  return { paths, config, compose: new Compose(paths) };
}
