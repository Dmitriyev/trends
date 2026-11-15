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

Текущая лента — статический снимок: автоматического обновления данных и серверной части пока нет.
