const requiredStringFields = ['id', 'newsId', 'title', 'date', 'location', 'artistName', 'type'];

export const createCalendarEvent = (news) => ({
  id: `calendar-${news.id}`,
  newsId: news.id,
  title: news.title || '제목 없는 소식',
  date: news.date || '',
  time: news.startTime || '',
  location: news.location || '',
  artistName: news.artistName || '',
  type: news.type || 'concert',
  imageUrl: news.imageUrl || news.image_url || '',
  newsItem: {
    id: news.id,
    artistId: news.artistId || '',
    artistName: news.artistName || '',
    type: news.type || 'concert',
    title: news.title || '제목 없는 소식',
    description: news.description || '',
    imageUrl: news.imageUrl || news.image_url || '',
    image_url: news.imageUrl || news.image_url || '',
    date: news.date || '',
    startTime: news.startTime || news.time || '',
    location: news.location || '',
    sourceUrl: news.sourceUrl || '',
    createdAt: news.createdAt || `${news.date || ''}T00:00:00.000Z`,
  },
});

export const isCalendarEvent = (event) => {
  if (!event || typeof event !== 'object') {
    return false;
  }

  return (
    requiredStringFields.every((field) => typeof event[field] === 'string' && event[field].trim()) &&
    typeof event.time === 'string'
  );
};

export const getSafeCalendarEvents = (events) => {
  const seenNewsIds = new Set();
  const safeEvents = Array.isArray(events) ? events : [];

  return safeEvents.filter((event) => {
    if (!isCalendarEvent(event) || seenNewsIds.has(event.newsId)) {
      return false;
    }

    seenNewsIds.add(event.newsId);
    return true;
  });
};

export const hasCalendarEvent = (events, newsId) => {
  return getSafeCalendarEvents(events).some((event) => event.newsId === newsId);
};
