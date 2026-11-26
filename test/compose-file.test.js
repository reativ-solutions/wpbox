import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildComposeFile } from '../dist/docker/compose-file.js';
import { defaultConfig } from '../dist/project/config.js';

function config(overrides = {}) {
  return {
    ...defaultConfig('/tmp/My Site'),
    local: { url: 'http://localhost:8090', port: 8090, mailpitPort: 8025 },
    production: { url: 'https://shop.example', tablePrefix: 'shop_' },
    source: { type: 'local' },
    devCode: { themes: ['shop-theme'], plugins: ['shop-core'] },
    ...overrides,
  };
}

test('names the project and wires the services', () => {
  const compose = buildComposeFile(config());
  assert.equal(compose.name, 'wpbox-my-site');
  assert.deepEqual(Object.keys(compose.services), ['wordpress', 'database', 'mailpit']);
  assert.deepEqual(compose.services.wordpress.ports, ['127.0.0.1:8090:80']);
  assert.deepEqual(compose.services.mailpit.ports, ['127.0.0.1:8025:8025']);
  assert.equal(compose.services.wordpress.environment.WORDPRESS_TABLE_PREFIX, 'shop_');
});

test('mounts the developer code and uploads from src/', () => {
  const { volumes } = buildComposeFile(config()).services.wordpress;
  assert.ok(volumes.includes('../src/themes/shop-theme:/var/www/html/wp-content/themes/shop-theme'));
  assert.ok(volumes.includes('../src/plugins/shop-core:/var/www/html/wp-content/plugins/shop-core'));
  assert.ok(volumes.includes('../src/uploads:/var/www/html/wp-content/uploads'));
});

test('maps custom local domains to the container itself', () => {
  const custom = config({ local: { url: 'http://shop.test:8090', port: 8090, mailpitPort: 8025 } });
  assert.deepEqual(buildComposeFile(custom).services.wordpress.extra_hosts, ['shop.test:127.0.0.1']);
  assert.equal(buildComposeFile(config()).services.wordpress.extra_hosts, undefined);
});
