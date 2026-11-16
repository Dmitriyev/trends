const dayMs = 86400000;
const day = column => `date(${column} / 1000, 'unixepoch', '+3 hours')`;
const week = column => `date(${day(column)}, 'weekday 0', '-6 days')`;
const startOfDay = date => Date.parse(date + 'T00:00:00+03:00');
const todayInMoscow = now => new Date(now + 10800000).toISOString().slice(0, 10);

const escape = value => String(value ?? '—').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const percent = (n, total) => total ? `${(100 * n / total).toFixed(1)}% (${n}/${total})` : '—';
const duration = ms => ms == null ? '—' : `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

function table(title, headers, rows) {
  return `<section><h2>${title}</h2><div class="scroll"><table><thead><tr>
    ${headers.map(label => `<th scope="col">${escape(label)}</th>`).join('')}
    </tr></thead><tbody>${rows.length ? rows.map(row => `<tr>${row.map(value =>
      `<td>${escape(value)}</td>`).join('')}</tr>`).join('') :
      `<tr><td colspan="${headers.length}">Пока нет данных</td></tr>`}</tbody></table></div></section>`;
}

async function authorized(request, password) {
  if (!password) return false;
  const authorization = request.headers.get('Authorization') || '';
  const match = /^Basic ([A-Za-z0-9+/=]{1,512})$/i.exec(authorization);
  if (!match) return false;
  const encoder = new TextEncoder();
  let credentials;
  try { credentials = Uint8Array.from(atob(match[1]), char => char.charCodeAt(0)); }
  catch { return false; }
  const expected = await crypto.subtle.digest('SHA-256', encoder.encode('analytics:' + password));
  const actual = await crypto.subtle.digest('SHA-256', credentials);
  const target = new Uint8Array(expected);
  let difference = 0;
  new Uint8Array(actual).forEach((byte, index) => { difference |= byte ^ target[index]; });
  return difference === 0;
}

export async function onRequestGet({ request, env }) {
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex',
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' };
  if (!env.ANALYTICS_PASSWORD) return new Response('Not found', { status: 404, headers });
  if (!await authorized(request, env.ANALYTICS_PASSWORD)) {
    headers['WWW-Authenticate'] = 'Basic realm="Trends analytics", charset="UTF-8"';
    return new Response('Authentication required', { status: 401, headers });
  }
  const db = env.ANALYTICS_DB;
  if (!db) return new Response('Analytics database is not configured', { status: 503, headers });

  const params = new URL(request.url).searchParams;
  const retention = params.get('view') === 'retention';
  const selectedDevice = params.get('device');
  const device = ['mobile', 'desktop', 'unknown'].includes(selectedDevice) ? selectedDevice : 'all';
  const deviceFilter = column => `(? = 'all' OR ${column} = ?)`;
  const days = [7, 30, 90].includes(Number(params.get('days'))) ? Number(params.get('days')) : 30;
  const today = todayInMoscow(Date.now());
  const cutoff = startOfDay(today) - (days - 1) * dayMs;
  let content;
  if (retention) {
    const cutoff180 = startOfDay(today) - 179 * dayMs;
    const { results } = await db.prepare(`
      WITH eligible AS (
        SELECT id, first_at, ${week('first_at')} AS cohort
        FROM visitors
        WHERE first_at >= ? AND ${deviceFilter('device')}
      ), matured AS (
        SELECT * FROM eligible
        WHERE datetime(cohort, '+20 days', '-3 hours') <= datetime('now')
      )
      SELECT cohort, count(*) AS visitors, sum(EXISTS (
        SELECT 1 FROM sessions
        WHERE visitor_id = matured.id
          AND started_at >= first_at + 7 * 86400000
          AND started_at < first_at + 14 * 86400000
      )) AS returned
      FROM matured GROUP BY cohort ORDER BY cohort DESC
    `).bind(cutoff180, device, device).all();
    content = '<p>Повторное открытие ленты в дни 7–13 после первого визита. В отчёте только недели с завершившимся окном наблюдения. Фильтр учитывает устройство первого визита.</p>' +
      table('Возврат на второй неделе', ['Неделя с', 'Новые браузеры', 'Вернулись'], results.map(row =>
        [row.cohort, row.visitors, percent(row.returned, row.visitors)]));
  } else {
    const [sessions, visitors, events] = await db.batch([
      db.prepare(`
        WITH base AS (
          SELECT ${day('started_at')} AS day, coalesce(depth_at_click, depth) AS depth,
            active_ms, more_seen, depth_at_click IS NOT NULL AS clicked
          FROM sessions WHERE started_at >= ? AND ${deviceFilter('device')}
        ), ranked AS (
          SELECT *, count(*) OVER (PARTITION BY day) AS n,
            row_number() OVER (PARTITION BY day ORDER BY depth) AS depth_rank,
            row_number() OVER (PARTITION BY day ORDER BY active_ms) AS time_rank
          FROM base
        )
        SELECT day, count(*) AS sessions, sum(more_seen) AS seen, sum(clicked) AS clicked,
          avg(CASE WHEN depth_rank IN ((n+1)/2, (n+2)/2) THEN depth END) AS depth50,
          max(CASE WHEN depth_rank = (3*n+3)/4 THEN depth END) AS depth75,
          avg(CASE WHEN time_rank IN ((n+1)/2, (n+2)/2) THEN active_ms END) AS time50,
          max(CASE WHEN time_rank = (3*n+3)/4 THEN active_ms END) AS time75
        FROM ranked GROUP BY day ORDER BY day DESC
      `).bind(cutoff, device, device),
      db.prepare(`
        SELECT ${day('first_at')} AS day, source, count(*) AS n
        FROM visitors WHERE first_at >= ? AND ${deviceFilter('device')} GROUP BY day, source ORDER BY day DESC, n DESC
      `).bind(cutoff, device, device),
      db.prepare(`
        SELECT ${day('occurred_at')} AS day, kind, domain, count(*) AS n
        FROM events JOIN sessions ON sessions.id = events.session_id
        WHERE occurred_at >= ? AND kind IN ('outbound_click', 'player_open_3s')
          AND ${deviceFilter('sessions.device')}
        GROUP BY day, kind, domain ORDER BY day DESC, n DESC
      `).bind(cutoff, device, device),
    ]);
    const daily = new Map(Array.from({ length: days }, (_, index) => [
      todayInMoscow(startOfDay(today) - index * dayMs), { visitors: 0, views: 0 },
    ]));
    for (const row of sessions.results) Object.assign(daily.get(row.day) || {}, row);
    for (const row of visitors.results) {
      if (daily.has(row.day)) daily.get(row.day).visitors += row.n;
    }
    for (const row of events.results) {
      if (row.kind === 'player_open_3s' && daily.has(row.day)) daily.get(row.day).views += row.n;
    }


    const paginationRows = await db.prepare(`
      SELECT ${day('events.occurred_at')} AS day,
        substr(events.video, 1, instr(events.video, ':') - 1) AS tab,
        sum(CASE WHEN events.kind = 'pagination_seen' THEN 1 ELSE 0 END) AS seen,
        sum(CASE WHEN events.kind = 'pagination_clicked' THEN 1 ELSE 0 END) AS clicked
      FROM events JOIN sessions ON sessions.id = events.session_id
      WHERE events.occurred_at >= ? AND events.kind IN ('pagination_seen', 'pagination_clicked')
        AND ${deviceFilter('sessions.device')}
      GROUP BY day, tab ORDER BY day DESC, tab
    `).bind(cutoff, device, device).all();
    const links = [7, 30, 90].map(n => `<a href="?days=${n}&amp;device=${device}" ${days === n ? 'aria-current="page"' : ''}>${n} дней</a>`).join('');
    content = `<div class="range">${links}</div>` +
      table('Лента по дням', ['Дата', 'Новые браузеры', 'Сессии', 'Карточек до перехода между страницами · медиана / P75',
        'Увидели пагинацию', 'Перешли из увидевших', 'Открытия плеера ≥3 с', 'Активное время · медиана / P75'],
      [...daily].map(([date, row]) => [date, row.visitors, row.sessions ?? 0,
        row.sessions ? `${row.depth50} / ${row.depth75}` : '—', percent(row.seen, row.sessions),
        percent(row.clicked, row.seen), row.views,
        row.sessions ? `${duration(row.time50)} / ${duration(row.time75)}` : '—'])) +
      '<p>Открытый плеер в видимой вкладке ≥3 секунд, один раз на ролик за сессию. Для новых пользователей и возврата используется устройство первого визита.</p>' +
      table('Пагинация по вкладкам', ['Дата', 'Вкладка', 'Дошли до пагинации', 'Перешли на другую страницу'],
        paginationRows.results.map(row => [row.day, row.tab, row.seen, row.clicked])) +
      table('Внешние переходы', ['Дата', 'Сайт', 'Клики'],
        events.results.filter(row => row.kind === 'outbound_click').map(row => [row.day, row.domain, row.n])) +
      table('Источники новых пользователей', ['Дата', 'Источник', 'Новые браузеры'],
        visitors.results.map(row => [row.day, row.source, row.n]));
  }

  const deviceLinks = Object.entries({ all: 'Все устройства', mobile: 'Мобильные',
    desktop: 'Десктопы', unknown: 'Не определено' }).map(([value, label]) =>
    `<a href="?view=${retention ? 'retention' : 'daily'}&amp;days=${days}&amp;device=${value}"
      ${device === value ? 'aria-current="page"' : ''}>${label}</a>`).join('');
  headers['Content-Type'] = 'text/html; charset=utf-8';
  headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'";
  return new Response(`<!doctype html><html lang="ru"><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Аналитика Trends</title>
    <style>
    *{box-sizing:border-box}body{font:15px/1.5 system-ui,sans-serif;margin:0;background:#f4f6fa;color:#182238}
    main{max-width:1280px;margin:auto;padding:clamp(16px,4vw,48px)}h1{font-size:32px;margin:0}h2{font-size:18px;margin:0 0 12px}
    p{color:#48556c}nav,.range{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}a{color:#254f9e;padding:6px 10px;border-radius:6px}
    a[aria-current]{background:#dfeaff;color:#172d62;font-weight:650}section{background:#fff;border:1px solid #dce2eb;border-radius:10px;padding:16px;margin:16px 0}
    .scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
    th,td{text-align:left;border-bottom:1px solid #e1e6ee;padding:9px 10px;min-width:100px}th{color:#394762;font-size:13px}
    </style>
    <main><h1>Аналитика Trends</h1><p>Часовой пояс — Москва</p>
    <nav aria-label="Отчёты"><a href="/analytics?days=${days}&amp;device=${device}" ${retention ? '' : 'aria-current="page"'}>По дням</a>
    <a href="/analytics?view=retention&amp;days=${days}&amp;device=${device}" ${retention ? 'aria-current="page"' : ''}>Возврат</a></nav>
    <nav aria-label="Устройства">${deviceLinks}</nav>
    ${content}</main></html>`, { headers });
}
