const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const hostname = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/;
const idleMs = 30 * 60 * 1000;
const maxAgeMs = 7 * 86400000;

export async function onRequestPost({ request, env }) {
  if (!env.ANALYTICS_DB) return new Response(null, { status: 503 });
  if (request.headers.get('Origin') !== new URL(request.url).origin) {
    return new Response(null, { status: 403 });
  }

  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const decoder = new TextDecoder();
  let body = '';
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 16384) {
      await reader.cancel();
      return new Response(null, { status: 413 });
    }
    body += decoder.decode(value, { stream: true });
  }

  let data;
  try {
    data = JSON.parse(body + decoder.decode());
  } catch {
    return new Response(null, { status: 400 });
  }

  const now = Date.now();
  const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
  const validTime = value => integer(value, now - maxAgeMs, now + 60000);
  const validId = value => typeof value === 'string' && uuid.test(value);
  if (!data || !validId(data.visitorId) || !validId(data.sessionId) ||
      !validTime(data.startedAt) || !integer(data.depth, 0, 10000) ||
      !(data.depthAtClick === null || integer(data.depthAtClick, 0, data.depth)) ||
      typeof data.moreSeen !== 'boolean' || !integer(data.activeMs, 0, now + idleMs - data.startedAt) ||
      typeof data.source !== 'string' || data.source.length > 100 ||
      !Array.isArray(data.events) || data.events.length > 40) {
    return new Response(null, { status: 400 });
  }
  for (const event of data.events) {
    if (!event || !validId(event.id) || !integer(event.at, data.startedAt, now + 60000) ||
        !['outbound_click', 'video_view'].includes(event.kind) ||
        typeof event.domain !== 'string' || event.domain.length > 253 || !hostname.test(event.domain) ||
        typeof event.video !== 'string' || event.video.length > 160 ||
        (event.kind === 'video_view' && !/^(youtube\.com|tiktok\.com):[\w-]+$/.test(event.video))) {
      return new Response(null, { status: 400 });
    }
  }

  const db = env.ANALYTICS_DB;
  await db.batch([
    db.prepare(`
      INSERT INTO visitors VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET first_at = excluded.first_at, source = excluded.source
      WHERE excluded.first_at < visitors.first_at
    `).bind(data.visitorId, data.startedAt, data.source),
    db.prepare(`
      INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        depth = max(depth, excluded.depth),
        depth_at_click = CASE
          WHEN depth_at_click IS NULL THEN excluded.depth_at_click
          WHEN excluded.depth_at_click IS NULL THEN depth_at_click
          ELSE min(depth_at_click, excluded.depth_at_click) END,
        more_seen = max(more_seen, excluded.more_seen),
        active_ms = max(active_ms, excluded.active_ms)
      WHERE sessions.visitor_id = excluded.visitor_id
    `).bind(data.sessionId, data.visitorId, data.startedAt, data.depth,
      data.depthAtClick, Number(data.moreSeen), data.activeMs),
    ...data.events.map(event => db.prepare(`
      INSERT OR IGNORE INTO events
      SELECT ?, id, ?, ?, ?, ? FROM sessions WHERE id = ? AND visitor_id = ?
    `).bind(event.id, event.at, event.kind, event.domain, event.video,
      data.sessionId, data.visitorId)),
  ]);
  return new Response(null, { status: 204 });
}
