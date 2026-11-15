export async function onRequest({ request, next, env }) {
  const response = await next();
  const path = new URL(request.url).pathname;
  if (request.method !== 'GET' ||
      !['/', '/index.html'].includes(path) ||
      !response.headers.get('Content-Type')?.includes('text/html')) {
    return response;
  }

  const rewriter = new HTMLRewriter().on('head', {
    element(head) {
      head.append('<link rel="stylesheet" href="/mobile-card-alignment.css">', { html: true });
    },
  });

  if (env.ANALYTICS_DB) {
    rewriter.on('body', {
      element(body) {
        body.append('<script defer src="/analytics.js"></script>', { html: true });
      },
    });
  }

  return rewriter.transform(response);
}
