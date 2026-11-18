export const sections = {
  trends: { slug: '', en: 'Short-Form Video Trends', ru: 'Тренды коротких видео' },
  tiktok: { slug: 'tiktok', en: 'Explore Trends on TikTok', ru: 'Популярные тренды в TikTok' },
  reels: { slug: 'instagram', en: 'Explore Reels Trends on Instagram', ru: 'Популярные Reels в Instagram' },
  shorts: { slug: 'youtube', en: 'Explore Shorts Trends on YouTube', ru: 'Популярные Shorts на YouTube' },
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

