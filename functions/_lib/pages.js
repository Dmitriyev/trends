export const sections = {
  trends: { slug: '', en: 'Short Video Trends', ru: 'Тренды коротких видео' },
  tiktok: { slug: 'tiktok', en: 'TikTok Trends', ru: 'Тренды TikTok' },
  reels: { slug: 'instagram', en: 'Instagram Reels Trends', ru: 'Тренды Instagram Reels' },
  shorts: { slug: 'youtube', en: 'YouTube Shorts Trends', ru: 'Тренды YouTube Shorts' },
};
export function pagePath(section, language) {
  return (language === 'ru' ? '/ru/' : '/') + (sections[section].slug ? sections[section].slug + '/' : '');
}
export function resolvePage(path) {
  if (path === '/index.html') return { section: 'trends', language: 'en', path: '/' };
  for (const section of Object.keys(sections)) {
    for (const language of ['en', 'ru']) {
      const canonical = pagePath(section, language);
      if (path === canonical || (canonical !== '/' && path === canonical.slice(0, -1))) {
        return { section, language, path: canonical };
      }
    }
  }
  return null;
}

