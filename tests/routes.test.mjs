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

test('sitemap lists every canonical locale URL exactly once', () => {
  const source = readFileSync(new URL('../site/sitemap.xml', import.meta.url), 'utf8');
  const urls = Array.from(source.matchAll(/<loc>([^<]+)<\/loc>/g), match => match[1]);
  const expected = Object.keys(sections).flatMap(section =>
    ['en', 'ru'].map(language => 'https://trendscanner.app' + pagePath(section, language)),
  );
  assert.deepEqual(urls.sort(), expected.sort());
});

test('static crawler files stay outside Functions; Pages has a 404 fallback', () => {
  const robots = readFileSync(new URL('../site/robots.txt', import.meta.url), 'utf8');
  assert.match(robots, /^Sitemap: https:\/\/trendscanner\.app\/sitemap\.xml$/m);
  const routes = JSON.parse(readFileSync(new URL('../site/_routes.json', import.meta.url), 'utf8'));
  for (const path of ['/robots.txt', '/sitemap.xml']) {
    assert.equal(routes.include.some(pattern => pattern.endsWith('*') ?
      path.startsWith(pattern.slice(0, -1)) : path === pattern), false);
  }
  assert.match(readFileSync(new URL('../site/404.html', import.meta.url), 'utf8'), /<h1>Page not found<\/h1>/);
});
