import { sections, pagePath, resolvePage } from './_lib/pages.js';
import { englishCopy, renderEnglishCopy } from './_lib/english-copy.js';
import { russianCopy, renderRussianCopy } from './_lib/russian-copy.js';
import translations from './_lib/translations.js';

export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  const page = resolvePage(url.pathname);
  if (!page || !['GET', 'HEAD'].includes(request.method)) return next();
  if (url.pathname !== page.path) {
    url.pathname = page.path;
    return Response.redirect(url.href, 301);
  }
  // Read the shared snapshot directly, without re-entering middleware.
  const response = await env.ASSETS.fetch(new Request(new URL('/index.html', url)));
  if (!response.ok || !response.headers.get('Content-Type')?.includes('text/html')) return response;
  const title = sections[page.section][page.language];
  const alternate = language => new URL(pagePath(page.section, language), url).href;
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  const rewriter = new HTMLRewriter()
    .on('html', { element(element) { element.setAttribute('lang', page.language); } })
    .on('title', { element(element) { element.setInnerContent(title); } })
    .on('header h1', { element(element) { element.setInnerContent(title); } })
    .on('head', { element(head) {
      head.append(`<link rel="canonical" href="${escape(new URL(page.path, url).href)}">` +
        `<link rel="alternate" hreflang="en" href="${escape(alternate('en'))}">` +
        `<link rel="alternate" hreflang="ru" href="${escape(alternate('ru'))}">` +
        `<link rel="alternate" hreflang="x-default" href="${escape(alternate('en'))}">` +
        '<link rel="stylesheet" href="/mobile-card-alignment.css">', { html: true });
    } })
    .on('[data-panel]', { element(element) {
      if (element.getAttribute('data-panel') === page.section) element.removeAttribute('hidden');
      else element.setAttribute('hidden', '');
    } })
    .on('[data-filter]', { element(element) {
      const section = element.getAttribute('data-filter');
      element.setAttribute('href', pagePath(section, page.language));
      element.setAttribute('aria-pressed', String(section === page.section));
      if (section === page.section) element.setAttribute('aria-current', 'page');
      else element.removeAttribute('aria-current');
    } })
    .on('[data-language]', { element(element) {
      const language = element.getAttribute('data-language');
      element.setAttribute('href', pagePath(page.section, language));
      element.setAttribute('aria-pressed', String(language === page.language));
      if (language === page.language) element.setAttribute('aria-current', 'true');
      else element.removeAttribute('aria-current');
    } });
  {
    const source = page.language === 'ru' ? russianCopy : englishCopy;
    const copy = page.language === 'ru' ? renderRussianCopy(page.section) : renderEnglishCopy(page.section);
    rewriter.on('header', { element(header) { header.after(copy.intro, { html: true }); } });
    // Pagination is appended inside each feed panel; details follow all panels.
    rewriter.on('main', { element(main) { main.append(copy.details, { html: true }); } });
    rewriter.on('head', { element(head) {
      head.append('<link rel="stylesheet" href="/seo-content.css">' +
        `<meta name="description" content="${escape(source[page.section].intro)}">`, { html: true });
    } });
  }
  if (page.language === 'ru') {
    // Buffer chunks; preserve metric title attributes and ISO dates for ranking.
    rewriter.on('.trend > h2, .trend > p, dt .metric-label, [data-filter="trends"]', {
      text(chunk) {
        this.pending = (this.pending || '') + chunk.text;
        chunk.remove();
        if (chunk.lastInTextNode) {
          chunk.after(translations[this.pending] || this.pending);
          this.pending = '';
        }
      },
    });
  }
  if (env.ANALYTICS_DB) {
    rewriter.on('body', { element(body) {
      body.append('<script defer src="/analytics.js"></script>', { html: true });
    } });
  }
  const transformed = rewriter.transform(response);
  const headers = new Headers(transformed.headers);
  headers.delete('etag');
  headers.delete('last-modified');
  headers.set('Content-Language', page.language);
  return new Response(request.method === 'HEAD' ? null : transformed.body, { status: transformed.status, headers });
}
