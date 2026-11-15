# Trends

Лента трендов коротких видео для TikTok, Instagram Reels и YouTube Shorts.

## Структура

- `site/` — готовые статические файлы сайта; точка входа — `site/index.html`.

## Публикация в Cloudflare Pages

Подключите репозиторий и укажите:

- Production branch: `main`
- Build command: оставить пустой (сборка не требуется)
- Build output directory: `site`
- Root directory: `/` (корень репозитория)

Изменения в `main` будут публиковаться автоматически после подключения. Для локального просмотра запустите `python3 -m http.server 8000 --directory site` и откройте `http://localhost:8000`.

Данные ленты публикуются статическим снимком.

## Аналитика

События принимаются на `POST /api/analytics`. Дашборд доступен по `/analytics` после настройки доступа.

1. Создайте базу D1 и примените к ней `migrations/0001_analytics.sql` (например, `npx wrangler d1 execute ИМЯ_БАЗЫ --remote --file=migrations/0001_analytics.sql`).
2. В настройках проекта Cloudflare Pages подключите базу D1 с именем привязки `ANALYTICS_DB`. Для preview можно использовать отдельную базу.
3. В настройках Pages добавьте секрет `ANALYTICS_PASSWORD` с длинным случайным паролем. Вход в дашборд с логином `analytics`. Если секрет отсутствует, дашборд закрыт.
4. Перезапустите деплой. После визита в ленту проверьте, что `POST /api/analytics` отвечает `204`, а новая сессия появилась в дашборде.

Для локальной проверки выполните один раз `npx wrangler d1 execute ANALYTICS_DB --config wrangler.local.jsonc --local --file=migrations/0001_analytics.sql`, задайте `ANALYTICS_PASSWORD` в локальном `.dev.vars` и запустите `npx wrangler pages dev site --d1 ANALYTICS_DB=00000000-0000-4000-8000-000000000001` из корня репозитория. Файл `.dev.vars` храните локально.

YouTube и TikTok учитываются после трёх секунд измеренного воспроизведения. Для Instagram доступны переходы на оригинал. Уникальность посетителя определяется по браузеру.
