import { getSupabaseClient } from '../lib/supabase.js';
import { isBrowserOffline } from '../utils/network.js';
import { mapSpotifyAlbumToNews, mapSpotifyArtist } from './mappers.js';

export const SPOTIFY_STATUS = {
  enabled: true,
  message: 'Spotify 연결됨',
  reason: 'enabled',
};

const SPOTIFY_ARTIST_CACHE_KEY = 'goyoSpotifyArtistCache';
const SPOTIFY_NEWS_CACHE_KEY = 'goyoSpotifyNewsCache';

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');
const normalizeArtistId = (value) => (typeof value === 'string' ? value.trim() : '');
const SPOTIFY_REFRESH_FALLBACK_TEXT = 'Spotify 연결이 안정되면';

const readStorageArray = (key) => {
  if (typeof window === 'undefined') {
    return [];
  }

  const storageValues = [window.localStorage, window.sessionStorage].flatMap((storage) => {
    try {
      const value = JSON.parse(storage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  });

  return storageValues;
};

const writeStorageArray = (key, items) => {
  if (typeof window === 'undefined') {
    return;
  }

  const value = JSON.stringify(items);
  window.localStorage.setItem(key, value);
  window.sessionStorage.setItem(key, value);
};

const unwrapList = (payload, key) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.[key])) {
    return payload[key];
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  return [];
};

const describeSpotifyError = (error, fallbackMessage) => {
  const status = error?.status ?? error?.context?.status ?? null;
  const stage = error?.stage || error?.context?.stage || 'unknown';
  const message = error?.message || fallbackMessage;

  if (status === 403 || /premium/i.test(message)) {
    return {
      reason: 'premium_required',
      message: 'Spotify Premium required. Edge Function returned 403.',
      status,
      stage,
    };
  }

  if (status === 401 || /invalid client|invalid_client/i.test(message)) {
    return {
      reason: 'invalid_client',
      message: 'Spotify invalid client. Check Supabase Edge Function secrets.',
      status,
      stage,
    };
  }

  return {
    reason: 'spotify_error',
    message,
    status,
    stage,
  };
};

const warnSpotifyFallback = (label, error) => {
  const details = describeSpotifyError(error, `${label} failed.`);
  console.warn(`${label} fallback: ${details.message}`, details);
};

const readCachedSpotifyArtists = () => {
  if (typeof window === 'undefined') {
    return [];
  }

  return readStorageArray(SPOTIFY_ARTIST_CACHE_KEY)
    .map(mapSpotifyArtist)
    .filter((artist) => artist?.id);
};

const writeCachedSpotifyArtists = (artists) => {
  if (typeof window === 'undefined') {
    return;
  }

  const artistById = new Map();

  [...readCachedSpotifyArtists(), ...artists].forEach((artist) => {
    if (artist?.id) {
      artistById.set(artist.id, artist);
    }
  });

  writeStorageArray(SPOTIFY_ARTIST_CACHE_KEY, Array.from(artistById.values()).slice(0, 80));
};

export const getCachedSpotifyArtistById = (artistId) => {
  const normalizedArtistId = typeof artistId === 'string' ? artistId.trim() : '';

  if (!normalizedArtistId) {
    return null;
  }

  return (
    readCachedSpotifyArtists().find(
      (artist) => artist.id === normalizedArtistId || artist.externalId === normalizedArtistId,
    ) || null
  );
};

const readCachedSpotifyNews = () => {
  if (typeof window === 'undefined') {
    return [];
  }

  return readStorageArray(SPOTIFY_NEWS_CACHE_KEY)
    .map(mapSpotifyAlbumToNews)
    .filter((news) => news?.id);
};

const hasNewsImage = (news) => Boolean(news?.imageUrl || news?.image_url);

const isSpotifyFallbackNews = (news) => {
  return (
    String(news?.id || '').startsWith('spotify_album_') &&
    typeof news?.description === 'string' &&
    news.description.includes(SPOTIFY_REFRESH_FALLBACK_TEXT)
  );
};

const mergeSpotifyNewsItem = (baseNews, nextNews) => {
  if (!baseNews) {
    return nextNews;
  }

  if (!nextNews) {
    return baseNews;
  }

  const baseImageUrl = baseNews.imageUrl || baseNews.image_url || '';
  const nextImageUrl = nextNews.imageUrl || nextNews.image_url || '';
  const shouldKeepBaseDescription = isSpotifyFallbackNews(nextNews) && !isSpotifyFallbackNews(baseNews);

  return {
    ...baseNews,
    ...nextNews,
    description: shouldKeepBaseDescription ? baseNews.description : nextNews.description,
    imageUrl: nextImageUrl || baseImageUrl,
    image_url: nextImageUrl || baseImageUrl,
  };
};

const writeCachedSpotifyNews = (newsItems) => {
  if (typeof window === 'undefined') {
    return;
  }

  const newsById = new Map();

  [...readCachedSpotifyNews(), ...newsItems.map(mapSpotifyAlbumToNews)].forEach((news) => {
    if (news?.id) {
      newsById.set(news.id, mergeSpotifyNewsItem(newsById.get(news.id), news));
    }
  });

  writeStorageArray(SPOTIFY_NEWS_CACHE_KEY, Array.from(newsById.values()).slice(0, 160));
};

const readCachedSpotifyNewsByArtistId = (artistId) => {
  const normalizedArtistId = normalizeArtistId(artistId);

  if (!normalizedArtistId) {
    return [];
  }

  return readCachedSpotifyNews().filter((news) => news.artistId === normalizedArtistId);
};

export const getCachedSpotifyNewsById = (newsId) => {
  const normalizedNewsId = typeof newsId === 'string' ? newsId.trim() : '';

  if (!normalizedNewsId) {
    return null;
  }

  return readCachedSpotifyNews().find((news) => news.id === normalizedNewsId) || null;
};

const getFunctionError = (data, error) => {
  if (error) {
    return {
      message: error.message || 'Supabase function invoke failed.',
      status: error.status || null,
      stage: 'invoke',
    };
  }

  if (data?.error) {
    return data.error;
  }

  return null;
};

export async function searchSpotifyArtists(query) {
  const normalizedQuery = normalizeText(query);
  const client = getSupabaseClient();

  if (!client || !normalizedQuery || isBrowserOffline()) {
    return [];
  }

  try {
    const { data, error } = await client.functions.invoke('spotify-search-artists', {
      body: { q: normalizedQuery },
    });
    const functionError = getFunctionError(data, error);

    if (functionError) {
      warnSpotifyFallback('Spotify artist search', functionError);
      return [];
    }

    const artists = unwrapList(data, 'artists').map(mapSpotifyArtist).filter((artist) => artist.id);
    writeCachedSpotifyArtists(artists);

    return artists;
  } catch (error) {
    warnSpotifyFallback('Spotify artist search', error);
    return [];
  }
}

export async function getSpotifyArtistAlbums(artistId) {
  const spotifyArtistId = normalizeArtistId(artistId);
  const client = getSupabaseClient();
  const cachedNews = readCachedSpotifyNewsByArtistId(spotifyArtistId);

  if (!client || !spotifyArtistId) {
    return [];
  }

  if (isBrowserOffline()) {
    return cachedNews;
  }

  try {
    const { data, error } = await client.functions.invoke('spotify-artist-albums', {
      body: { artistId: spotifyArtistId },
    });
    const functionError = getFunctionError(data, error);

    if (functionError) {
      warnSpotifyFallback('Spotify artist albums', functionError);
      return cachedNews;
    }

    const rawAlbums = unwrapList(data, 'news');

    if (/rate limited/i.test(data?.message || '') && rawAlbums.length === 0) {
      warnSpotifyFallback('Spotify artist albums', {
        message: data.message,
        status: 429,
        stage: 'albums',
      });
      return cachedNews;
    }

    const newsItems = rawAlbums
      .map((album) =>
        mapSpotifyAlbumToNews(album, {
          artistId: spotifyArtistId,
          artistName: album?.artistName || album?.artist_name,
        }),
      )
      .filter((news) => news.id);

    if (newsItems.length > 0) {
      writeCachedSpotifyNews(newsItems);
    }

    if (import.meta.env?.DEV) {
      console.log('[GOYO spotify] artist albums', {
        artistId: spotifyArtistId,
        message: data?.message || '',
        albumNewsCount: newsItems.length,
        albumNewsWithImages: newsItems.filter(hasNewsImage).length,
        cachedNewsCount: cachedNews.length,
      });
    }

    return newsItems.length > 0 ? newsItems : cachedNews;
  } catch (error) {
    warnSpotifyFallback('Spotify artist albums', error);
    return cachedNews;
  }
}

export async function testSpotifyConnection() {
  const client = getSupabaseClient();

  if (!client) {
    return {
      enabled: false,
      ok: false,
      status: 'disabled',
      message: 'Spotify 비활성화 (Supabase 미설정)',
      reason: 'supabase_not_configured',
    };
  }

  if (isBrowserOffline()) {
    return {
      enabled: true,
      ok: false,
      status: 'offline',
      message: '오프라인 모드',
      reason: 'offline',
    };
  }

  try {
    const { data, error } = await client.functions.invoke('spotify-search-artists', {
      body: { q: '아이유' },
    });
    const functionError = getFunctionError(data, error);

    if (functionError) {
      const details = describeSpotifyError(functionError, 'Spotify connection failed.');
      warnSpotifyFallback('Spotify connection test', functionError);

      return {
        enabled: true,
        ok: false,
        status: details.reason === 'premium_required' ? 'disabled' : 'error',
        message: details.reason === 'premium_required' ? 'Spotify 비활성화' : 'Spotify 오류',
        reason: details.reason,
      };
    }

    return {
      enabled: true,
      ok: true,
      status: 'connected',
      message: 'Spotify 연결됨',
      reason: 'ok',
      count: unwrapList(data, 'artists').length,
    };
  } catch (error) {
    warnSpotifyFallback('Spotify connection test', error);

    return {
      enabled: true,
      ok: false,
      status: 'error',
      message: 'Spotify 오류',
      reason: 'invoke_failed',
    };
  }
}
