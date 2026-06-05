const TYPE_PRIORITY = {
  ticket: 4,
  concert: 3,
  festival: 2,
  album: 1,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const PREVIEW_ALBUM_WINDOW_DAYS = 90;
const HOME_ALBUM_WINDOW_DAYS = 180;
const PREVIEW_EVENT_WINDOW_DAYS = 180;
const PREVIEW_TICKET_WINDOW_DAYS = 90;
const PREVIEW_RECENT_TICKET_DAYS = 7;
const PREVIEW_MAX_ITEMS = 20;

const normalizeText = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const getToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const parseDateValue = (date) => {
  if (typeof date !== 'string' || !date.trim()) {
    return null;
  }

  const [year, month, day] = date.split('-').map(Number);

  if (!year || !month || !day) {
    return null;
  }

  const parsedDate = new Date(year, month - 1, day);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const getDaysFromToday = (date, today = getToday()) => {
  const parsedDate = parseDateValue(date);

  if (!parsedDate) {
    return null;
  }

  return Math.round((parsedDate.getTime() - today.getTime()) / DAY_MS);
};

const getCreatedAtValue = (news) => {
  const createdAt = Date.parse(news?.createdAt || news?.created_at || '');

  if (Number.isFinite(createdAt)) {
    return createdAt;
  }

  const dateValue = parseDateValue(news?.date)?.getTime();
  return Number.isFinite(dateValue) ? dateValue : 0;
};

const getDateRank = (news) => {
  const daysFromToday = getDaysFromToday(news?.date);

  if (daysFromToday === null) {
    return { bucket: 4, distance: Number.MAX_SAFE_INTEGER };
  }

  if (daysFromToday >= 0 && daysFromToday <= 90) {
    return { bucket: 0, distance: daysFromToday };
  }

  if (daysFromToday < 0 && daysFromToday >= -90) {
    return { bucket: 1, distance: Math.abs(daysFromToday) };
  }

  if (daysFromToday > 90) {
    return { bucket: 2, distance: daysFromToday };
  }

  return { bucket: 3, distance: Math.abs(daysFromToday) };
};

const getNewsDedupeKeys = (news) => {
  const id = normalizeText(news?.id);
  const sourceUrl = normalizeText(news?.sourceUrl || news?.source_url);
  const artistName = normalizeText(news?.artistName || news?.artist_name);
  const title = normalizeText(news?.title);
  const date = normalizeText(news?.date);
  const keys = [];

  if (id) {
    keys.push(`id:${id}`);

    if (id.startsWith('spotify_album_')) {
      keys.push(`spotify:${id.replace(/^spotify_album_/, '')}`);
    }
  }

  if (sourceUrl) {
    keys.push(`source:${sourceUrl}`);
  }

  if (artistName && title && date) {
    keys.push(`content:${artistName}|${title}|${date}`);
  }

  return keys;
};

const mergeNewsItems = (baseNews, nextNews) => {
  if (!baseNews) {
    return nextNews;
  }

  const baseImageUrl = baseNews.imageUrl || baseNews.image_url || '';
  const nextImageUrl = nextNews.imageUrl || nextNews.image_url || '';
  const getMergeQuality = (news) => {
    const id = String(news?.id || '');
    let score = 0;

    if (id.startsWith('spotify_album_')) {
      score += 40;
    }

    if (news?.sourceUrl || news?.source_url) {
      score += 12;
    }

    if (news?.imageUrl || news?.image_url) {
      score += 10;
    }

    if (news?.description) {
      score += Math.min(String(news.description).length, 120) / 120;
    }

    score += getCreatedAtValue(news) / 100000000000000;

    return score;
  };
  const primaryNews = getMergeQuality(nextNews) > getMergeQuality(baseNews) ? nextNews : baseNews;
  const secondaryNews = primaryNews === nextNews ? baseNews : nextNews;
  const imageUrl = nextImageUrl || baseImageUrl;

  return {
    ...secondaryNews,
    ...primaryNews,
    description: primaryNews.description || secondaryNews.description || '',
    imageUrl,
    image_url: imageUrl,
    sourceUrl: primaryNews.sourceUrl || primaryNews.source_url || secondaryNews.sourceUrl || secondaryNews.source_url || '',
  };
};

export const getNewsPriority = (newsItem) => TYPE_PRIORITY[newsItem?.type] || 0;

export const dedupeNewsItems = (newsItems) => {
  const safeNewsItems = Array.isArray(newsItems) ? newsItems.filter(Boolean) : [];
  const dedupedNews = [];
  const newsIndexByKey = new Map();

  safeNewsItems.forEach((news) => {
    const keys = getNewsDedupeKeys(news);

    if (!news?.id || keys.length === 0) {
      return;
    }

    const existingIndex = keys.map((key) => newsIndexByKey.get(key)).find((index) => index !== undefined);

    if (existingIndex === undefined) {
      const nextIndex = dedupedNews.length;
      dedupedNews.push(news);
      keys.forEach((key) => newsIndexByKey.set(key, nextIndex));
      return;
    }

    const mergedNews = mergeNewsItems(dedupedNews[existingIndex], news);
    dedupedNews[existingIndex] = mergedNews;

    [...new Set([...keys, ...getNewsDedupeKeys(mergedNews)])].forEach((key) => {
      newsIndexByKey.set(key, existingIndex);
    });
  });

  return dedupedNews;
};

export const sortNewsItems = (newsItems) => {
  return dedupeNewsItems(newsItems).sort((a, b) => {
    const aDateRank = getDateRank(a);
    const bDateRank = getDateRank(b);

    if (aDateRank.bucket !== bDateRank.bucket) {
      return aDateRank.bucket - bDateRank.bucket;
    }

    if (aDateRank.distance !== bDateRank.distance) {
      return aDateRank.distance - bDateRank.distance;
    }

    const createdAtCompare = getCreatedAtValue(b) - getCreatedAtValue(a);

    if (createdAtCompare !== 0) {
      return createdAtCompare;
    }

    return getNewsPriority(b) - getNewsPriority(a);
  });
};

const isSpotifyAlbum = (news) => {
  return news?.type === 'album' && String(news?.id || '').startsWith('spotify_album_');
};

const isAlbumAllowed = (news, windowDays) => {
  const daysFromToday = getDaysFromToday(news?.date);

  if (daysFromToday === null) {
    return false;
  }

  return daysFromToday >= 0 || Math.abs(daysFromToday) <= windowDays;
};

const isPreviewEligible = (news) => {
  const daysFromToday = getDaysFromToday(news?.date);

  if (daysFromToday === null) {
    return false;
  }

  if (news?.type === 'album') {
    return isAlbumAllowed(news, PREVIEW_ALBUM_WINDOW_DAYS);
  }

  if (news?.type === 'ticket') {
    return daysFromToday >= -PREVIEW_RECENT_TICKET_DAYS && daysFromToday <= PREVIEW_TICKET_WINDOW_DAYS;
  }

  if (news?.type === 'concert' || news?.type === 'festival') {
    return daysFromToday >= 0 && daysFromToday <= PREVIEW_EVENT_WINDOW_DAYS;
  }

  return daysFromToday >= -PREVIEW_ALBUM_WINDOW_DAYS && daysFromToday <= PREVIEW_EVENT_WINDOW_DAYS;
};

export const filterPreviewNews = (newsItems) => {
  return sortNewsItems(newsItems).filter(isPreviewEligible).slice(0, PREVIEW_MAX_ITEMS);
};

export const filterHomeNews = (newsItems) => {
  return sortNewsItems(newsItems).filter((news) => {
    if (isSpotifyAlbum(news)) {
      return isAlbumAllowed(news, HOME_ALBUM_WINDOW_DAYS);
    }

    if (news?.type === 'album') {
      return isAlbumAllowed(news, HOME_ALBUM_WINDOW_DAYS);
    }

    return true;
  });
};
