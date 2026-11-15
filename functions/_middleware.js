export async function onRequest({ request, next, env }) {
  const response = await next();
  const path = new URL(request.url).pathname;
  if (!env.ANALYTICS_DB || request.method !== 'GET' ||
      !['/', '/index.html'].includes(path) ||
      !response.headers.get('Content-Type')?.includes('text/html')) {
    return response;
  }

  return new HTMLRewriter().on('body', {
    element(body) {
      body.append('<script defer src="/analytics.js"></script>', { html: true });
    },
  }).transform(response);
}
