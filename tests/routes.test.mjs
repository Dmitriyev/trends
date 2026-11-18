import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sections, pagePath, resolvePage } from '../functions/_lib/pages.js';
import translations from '../functions/_lib/translations.js';

for (const section of Object.keys(sections)) {
  for (const language of ['en', 'ru']) {
    test(`${language}: ${section} round trip and slash normalization`, () => {
      const path = pagePath(section, language);
      const expected = { section, language, path };
      assert.deepEqual(resolvePage(path), expected);
      if (path !== '/') assert.deepEqual(resolvePage(path.slice(0, -1)), expected);
    });
  }
}
test('unrelated routes pass through; legacy index redirects to English home', () => {
  for (const path of ['/analytics', '/api/analytics', '/ru/missing/', '/tiktok/missing/', '/i18n.js']) {
    assert.equal(resolvePage(path), null);
  }
  assert.deepEqual(resolvePage('/index.html'), { section: 'trends', language: 'en', path: '/' });
});
test('server and browser translation dictionaries stay identical', () => {
  const source = readFileSync(new URL('../site/i18n.js', import.meta.url), 'utf8');
  const dictionary = source.match(/const translations = (\{[\s\S]*?\n\});/)[1];
  assert.deepEqual(JSON.parse(dictionary), translations);
});
