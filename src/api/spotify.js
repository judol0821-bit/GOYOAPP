import { getSupabaseClient } from '../lib/supabase.js';
import { mapSpotifyAlbumToNews, mapSpotifyArtist } from './mappers.js';

export const SPOTIFY_STATUS = {
  enabled: true,
  message: 'Spotify 연결됨',
  reason: 'enabled',
};

const SPOTIFY_ARTIST_CACHE_KEY = 'goyoSpotifyArtistCache';
const SPOTIFY_NEWS_CACHE_KEY = 'goyoSpotifyNewsCache';

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');

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

  try {
    const value = JSON.parse(window.sessionStorage.getItem(SPOTIFY_ARTIST_CACHE_KEY) || '[]');
    return Array.isArray(value) ? value.map(mapSpotifyArtist).filter((artist) => artist?.id) : [];
  } catch {
    return [];
  }
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

  window.sessionStorage.setItem(SPOTIFY_ARTIST_CACHE_KEY, JSON.stringify(Array.from(artistById.values()).slice(0, 80)));
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

  try {
    const value = JSON.parse(window.sessionStorage.getItem(SPOTIFY_NEWS_CACHE_KEY) || '[]');
    return Array.isArray(value) ? value.map(mapSpotifyAlbumToNews).filter((news) => news?.id) : [];
  } catch {
    return [];
  }
};

const writeCachedSpotifyNews = (newsItems) => {
  if (typeof window === 'undefined') {
    return;
  }

  const newsById = new Map();

  [...readCachedSpotifyNews(), ...newsItems].forEach((news) => {
    if (news?.id) {
      newsById.set(news.id, news);
    }
  });

  window.sessionStorage.setItem(SPOTIFY_NEWS_CACHE_KEY, JSON.stringify(Array.from(newsById.values()).slice(0, 120)));
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

  if (!client || !normalizedQuery) {
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
  const spotifyArtistId = normalizeText(artistId);
  const client = getSupabaseClient();

  if (!client || !spotifyArtistId) {
    return [];
  }

  try {
    const { data, error } = await client.functions.invoke('spotify-artist-albums', {
      body: { artistId: spotifyArtistId },
    });
    const functionError = getFunctionError(data, error);

    if (functionError) {
      warnSpotifyFallback('Spotify artist albums', functionError);
      return [];
    }

    const newsItems = unwrapList(data, 'news')
      .map((album) =>
        mapSpotifyAlbumToNews(album, {
          artistId: spotifyArtistId,
          artistName: album?.artistName || album?.artist_name,
        }),
      )
      .filter((news) => news.id);

    writeCachedSpotifyNews(newsItems);

    return newsItems;
  } catch (error) {
    warnSpotifyFallback('Spotify artist albums', error);
    return [];
  }
}

export async function testSpotifyConnection() {
  const client = getSupabaseClient();

  if (!client) {
    return {
      enabled: false,
      ok: false,
      status: 'disabled',
      message: 'Spotify 비활성화',
      reason: 'supabase_not_configured',
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
