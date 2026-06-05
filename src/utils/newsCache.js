export const HOME_NEWS_CACHE_KEY = 'cachedNewsItems';
export const PREVIEW_NEWS_CACHE_KEY = 'cachedPreviewNews';

const NEWS_CACHE_LIMIT = 180;
const SPOTIFY_REFRESH_FALLBACK_TEXT = 'Spotify 연결이 안정되면';

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');

const getCachedDescription = (news, artistName) => {
  const description = normalizeText(news?.description);

  if (description.includes(SPOTIFY_REFRESH_FALLBACK_TEXT)) {
    return `${artistName || '아티스트'}의 새 음악이 Spotify에 공개됐어요.`;
  }

  return description;
};

export const normalizeCachedNewsItem = (news) => {
  const id = normalizeText(news?.id);
  const artistName = normalizeText(news?.artistName || news?.artist_name);

  if (!id) {
    return null;
  }

  return {
    id,
    artistId: normalizeText(news?.artistId || news?.artist_id),
    artistName,
    type: normalizeText(news?.type) || 'concert',
    title: normalizeText(news?.title) || '제목 없는 소식',
    description: getCachedDescription(news, artistName),
    imageUrl: normalizeText(news?.imageUrl || news?.image_url),
    image_url: normalizeText(news?.imageUrl || news?.image_url),
    date: normalizeText(news?.date),
    startTime: normalizeText(news?.startTime || news?.start_time),
    location: normalizeText(news?.location),
    sourceUrl: normalizeText(news?.sourceUrl || news?.source_url),
    createdAt: normalizeText(news?.createdAt || news?.created_at),
  };
};

export const getSafeCachedNewsItems = (newsItems) => {
  const seenIds = new Set();
  const safeNewsItems = Array.isArray(newsItems) ? newsItems : [];

  return safeNewsItems
    .map(normalizeCachedNewsItem)
    .filter((news) => {
      if (!news || seenIds.has(news.id)) {
        return false;
      }

      seenIds.add(news.id);
      return true;
    });
};

export const readCachedNewsItems = (key) => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    return getSafeCachedNewsItems(JSON.parse(window.localStorage.getItem(key) || '[]'));
  } catch {
    return [];
  }
};

export const readAllCachedNewsItems = () => {
  return getSafeCachedNewsItems([
    ...readCachedNewsItems(HOME_NEWS_CACHE_KEY),
    ...readCachedNewsItems(PREVIEW_NEWS_CACHE_KEY),
    ...readCalendarEventNewsItems(),
  ]);
};

export const writeCachedNewsItems = (key, newsItems) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    key,
    JSON.stringify(getSafeCachedNewsItems(newsItems).slice(0, NEWS_CACHE_LIMIT)),
  );
};

export const mergeCachedNewsItems = (key, newsItems) => {
  if (typeof window === 'undefined') {
    return;
  }

  writeCachedNewsItems(key, [...readCachedNewsItems(key), ...(Array.isArray(newsItems) ? newsItems : [])]);
};

const readCalendarEvents = () => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const events = JSON.parse(window.localStorage.getItem('calendarEvents') || '[]');
    return Array.isArray(events) ? events : [];
  } catch {
    return [];
  }
};

const readCalendarEventNewsItems = () => {
  return readCalendarEvents()
    .flatMap((event) => {
      const snapshot = event?.newsItem || event?.newsSnapshot;

      if (snapshot) {
        return [snapshot];
      }

      if (!event?.newsId) {
        return [];
      }

      return [
        {
          id: event.newsId,
          artistId: '',
          artistName: event.artistName || '',
          type: event.type || 'concert',
          title: event.title || '',
          description: '',
          imageUrl: '',
          date: event.date || '',
          startTime: event.time || '',
          location: event.location || '',
          sourceUrl: '',
          createdAt: `${event.date || ''}T00:00:00.000Z`,
        },
      ];
    })
    .map(normalizeCachedNewsItem)
    .filter(Boolean);
};

export const filterCachedNewsByArtistIds = (newsItems, artistIds) => {
  const ids = new Set((Array.isArray(artistIds) ? artistIds : []).filter(Boolean));

  if (ids.size === 0) {
    return [];
  }

  return getSafeCachedNewsItems(newsItems).filter((news) => ids.has(news.artistId));
};

export const findCachedNewsById = (newsId) => {
  const id = normalizeText(newsId);

  if (!id) {
    return null;
  }

  return readAllCachedNewsItems().find((news) => news.id === id) || null;
};
