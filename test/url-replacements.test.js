import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildUrlReplacements } from '../dist/wordpress/url-replacements.js';

test('covers schemes, www, JSON-escaped and protocol-relative URLs', () => {
  const replacements = buildUrlReplacements(['https://www.shop.example'], 'http://localhost:8090');
  const map = new Map(replacements);

  assert.equal(map.get('https://www.shop.example'), 'http://localhost:8090');
  assert.equal(map.get('http://shop.example'), 'http://localhost:8090');
  assert.equal(map.get('https:\\/\\/www.shop.example'), 'http:\\/\\/localhost:8090');
  assert.equal(map.get('//shop.example'), '//localhost:8090');
  assert.equal(replacements.length, 10);
});

test('merges URLs that share a host', () => {
  const replacements = buildUrlReplacements(['https://shop.example', 'http://www.shop.example'], 'http://localhost:8090');
  assert.equal(replacements.length, 10);
});

test('replaces every production host', () => {
  const replacements = buildUrlReplacements(['https://a.example', 'https://b.example'], 'http://localhost:8090');
  assert.equal(replacements.length, 20);
});
