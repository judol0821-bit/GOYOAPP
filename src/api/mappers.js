export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);

const normalizeText = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const getFirstImageUrl = (value) => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.find((image) => typeof image?.url === 'string' && image.url)?.url || '';
  }

  return '';
};

const SPOTIFY_REFRESH_FALLBACK_TEXT = 'Spotify 연결이 안정되면';

const getSpotifyAlbumDescription = (album, artistName) => {
  const description = album?.description || '';

  if (typeof description === 'string' && description.includes(SPOTIFY_REFRESH_FALLBACK_TEXT)) {
    return `${artistName || '아티스트'}의 새 음악이 Spotify에 공개됐어요.`;
  }

  return description || `${artistName || '아티스트'}의 새 음악이 Spotify에 공개됐어요.`;
};

export const mapArtistFromSupabase = (artist) => ({
  id: artist.id,
  name: artist.name,
  imageUrl: artist.image_url || '',
  genres: Array.isArray(artist.genres) ? artist.genres : [],
  externalId: artist.external_id || '',
  source: artist.source || 'manual',
});

export const mapNewsFromSupabase = (news, options = {}) => ({
  id: news.id,
  artistId: options.artistId || news.artist_id,
  artistName: news.artist_name,
  type: news.type,
  title: news.title,
  description: news.description || '',
  imageUrl: news.image_url || '',
  date: news.date,
  startTime: news.start_time || '',
  location: news.location || '',
  sourceUrl: news.source_url || '',
  createdAt: news.created_at,
});

export const mapCalendarEventFromSupabase = (event) => ({
  id: event.id,
  newsId: event.news_id,
  title: event.title,
  date: event.date,
  time: event.time || '',
  location: event.location || '',
  artistName: event.artist_name,
  type: event.type,
  anonymousUserId: event.anonymous_user_id,
});

export const toSupabaseCalendarPayload = (anonymousUserId, newsItem) => ({
  anonymous_user_id: anonymousUserId,
  news_id: newsItem.id,
  title: newsItem.title || '제목 없는 소식',
  date: newsItem.date,
  time: newsItem.startTime || newsItem.time || '',
  location: newsItem.location || '',
  artist_name: newsItem.artistName || '',
  type: newsItem.type || 'concert',
});

export const mapHiddenNewsFromSupabase = (item) => ({
  id: item.id,
  newsId: item.news_id,
  anonymousUserId: item.anonymous_user_id,
  createdAt: item.created_at,
});

export const normalizeSpotifyReleaseDate = (releaseDate) => {
  if (typeof releaseDate !== 'string') {
    return new Date().toISOString().slice(0, 10);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
    return releaseDate;
  }

  if (/^\d{4}-\d{2}$/.test(releaseDate)) {
    return `${releaseDate}-01`;
  }

  if (/^\d{4}$/.test(releaseDate)) {
    return `${releaseDate}-01-01`;
  }

  return new Date().toISOString().slice(0, 10);
};

export const mapSpotifyArtist = (artist) => {
  const spotifyId = artist?.externalId || artist?.external_id || artist?.id || '';

  return {
    id: spotifyId,
    externalId: spotifyId,
    name: artist?.name || '이름 없는 아티스트',
    imageUrl: artist?.imageUrl || artist?.image_url || getFirstImageUrl(artist?.images),
    genres: Array.isArray(artist?.genres) ? artist.genres : [],
    source: 'spotify',
    spotifyUrl: artist?.spotifyUrl || artist?.spotify_url || artist?.external_urls?.spotify || '',
    popularity: Number.isFinite(Number(artist?.popularity)) ? Number(artist.popularity) : undefined,
  };
};

export const mapSpotifyAlbumToNews = (album, options = {}) => {
  const albumId = album?.id ? String(album.id).replace(/^spotify_album_/, '') : '';
  const artistId = options.artistId || album?.artistId || album?.artist_id || album?.artists?.[0]?.id || '';
  const artistName = options.artistName || album?.artistName || album?.artist_name || album?.artists?.[0]?.name || '';
  const date = normalizeSpotifyReleaseDate(album?.date || album?.releaseDate || album?.release_date);
  const albumTitle = album?.title || album?.name || '새 앨범';
  const sourceUrl = album?.sourceUrl || album?.source_url || album?.spotifyUrl || album?.external_urls?.spotify || '';
  const imageUrl = album?.imageUrl || album?.image_url || getFirstImageUrl(album?.images);

  return {
    id: album?.id?.startsWith?.('spotify_album_') ? album.id : `spotify_album_${albumId || albumTitle}`,
    artistId,
    artistName,
    type: 'album',
    title: albumTitle,
    description: getSpotifyAlbumDescription(album, artistName),
    imageUrl,
    image_url: imageUrl,
    date,
    startTime: album?.startTime || album?.start_time || '',
    location: album?.location || 'Spotify',
    sourceUrl,
    createdAt: album?.createdAt || album?.created_at || `${date}T00:00:00.000Z`,
  };
};

export const getArtistDedupeKey = (artist) => {
  const externalId = normalizeText(artist?.externalId || artist?.external_id);

  if (externalId) {
    return `external:${externalId}`;
  }

  return `name:${normalizeText(artist?.name)}`;
};

export const dedupeArtists = (artists) => {
  const seenIds = new Set();
  const seenExternalIds = new Set();
  const seenNames = new Set();
  const safeArtists = Array.isArray(artists) ? artists : [];

  return safeArtists.filter((artist) => {
    if (!artist?.id) {
      return false;
    }

    const id = String(artist.id);
    const externalId = normalizeText(artist.externalId || artist.external_id);
    const name = normalizeText(artist.name);

    if (seenIds.has(id) || (externalId && seenExternalIds.has(externalId)) || (name && seenNames.has(name))) {
      return false;
    }

    seenIds.add(id);

    if (externalId) {
      seenExternalIds.add(externalId);
    }

    if (name) {
      seenNames.add(name);
    }

    return true;
  });
};

export const dedupeNewsItems = (newsItems) => {
  const seenIds = new Set();
  const seenFingerprints = new Set();
  const safeNews = Array.isArray(newsItems) ? newsItems : [];

  return safeNews.filter((news) => {
    if (!news?.id) {
      return false;
    }

    const id = String(news.id);
    const fingerprint = [news.artistId, news.type, news.title, news.date, news.sourceUrl].map(normalizeText).join('|');

    if (seenIds.has(id) || (fingerprint && seenFingerprints.has(fingerprint))) {
      return false;
    }

    seenIds.add(id);

    if (fingerprint) {
      seenFingerprints.add(fingerprint);
    }

    return true;
  });
};
