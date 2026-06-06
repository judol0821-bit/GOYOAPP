// GOYO automatic new music push MVP.
//
// Required secrets:
// - SPOTIFY_CLIENT_ID
// - SPOTIFY_CLIENT_SECRET
// - VAPID_PUBLIC_KEY
// - VAPID_PRIVATE_KEY
// - VAPID_SUBJECT
// - SUPABASE_SERVICE_ROLE_KEY
//
// Deploy:
// npx.cmd supabase functions deploy check-new-music-notifications --no-verify-jwt --project-ref skspszkqmkeekhnerfss

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

type RequestArtist = {
  id?: string;
  externalId?: string;
  external_id?: string;
  name?: string;
  source?: string;
};

type RequestCachedNewsItem = Partial<MusicNewsItem> & {
  artist_id?: string;
  artist_name?: string;
  image_url?: string;
  source_url?: string;
  start_time?: string;
  created_at?: string;
  spotifyArtistId?: string;
  externalArtistId?: string;
  frontendArtistId?: string;
};

type ResolvedSpotifyArtist = RequestArtist & {
  externalId: string;
  resolvedSpotifyArtistId: string;
  resolveMethod: 'external_id' | 'id' | 'alias_search';
  query?: string;
};

type SpotifyAlbum = {
  id?: string;
  name?: string;
  album_type?: string;
  release_date?: string;
  images?: Array<{ url?: string; width?: number; height?: number }>;
  external_urls?: { spotify?: string };
  artists?: Array<{ id?: string; name?: string }>;
};

type MusicNewsItem = {
  id: string;
  artistId: string;
  artistName: string;
  type: 'album';
  title: string;
  description: string;
  imageUrl: string;
  image_url: string;
  date: string;
  startTime: string;
  location: string;
  sourceUrl: string;
  createdAt: string;
};

type SpotifyAlbumFetchResult = {
  artist: RequestArtist;
  newsItems: MusicNewsItem[];
  status: number | null;
  itemCount: number;
  marketItemCount: number;
  noMarketItemCount: number;
  retriedWithoutMarket: boolean;
  error: ReturnType<typeof getErrorDetails> | null;
  retryAfter: string;
};

type SpotifyAlbumPageResult = {
  ok: boolean;
  status: number;
  url: string;
  payload: Record<string, unknown>;
  items: SpotifyAlbum[];
  retryAfter: string;
};

const MAX_TEST_ARTISTS = 2;
const MAX_CACHED_NEWS_ITEMS = 40;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-goyo-anonymous-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      ...headers,
      'Content-Type': 'application/json',
    },
  });

const getErrorDetails = (error: unknown) => {
  if (error instanceof Error) {
    const value = error as Error & { statusCode?: number; body?: unknown };

    return {
      name: error.name,
      message: error.message,
      statusCode: value.statusCode || null,
      body: value.body || null,
      stack: error.stack || '',
    };
  }

  if (typeof error === 'object' && error !== null) {
    const value = error as Record<string, unknown>;

    return {
      name: String(value.name || 'Error'),
      message: String(value.message || value.error || 'Unknown object error'),
      statusCode: value.statusCode || null,
      body: value.body || null,
      stack: String(value.stack || ''),
    };
  }

  return {
    name: 'UnknownError',
    message: String(error),
    statusCode: null,
    body: null,
    stack: '',
  };
};

const logStep = (step: string, details: Record<string, unknown> = {}) => {
  console.log(`[check-new-music-notifications] ${step}`, details);
};

const logError = (step: string, error: unknown, details: Record<string, unknown> = {}) => {
  console.error(`[check-new-music-notifications] ${step}`, {
    ...details,
    ...getErrorDetails(error),
  });
};

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const normalizeReleaseDate = (releaseDate: unknown) => {
  const value = normalizeText(releaseDate);

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  if (/^\d{4}-\d{2}$/.test(value)) {
    return `${value}-01`;
  }

  if (/^\d{4}$/.test(value)) {
    return `${value}-01-01`;
  }

  return new Date().toISOString().slice(0, 10);
};

const getFirstImageUrl = (images: SpotifyAlbum['images']) => {
  if (!Array.isArray(images)) {
    return '';
  }

  return images.find((image) => image?.url)?.url || '';
};

const getSpotifyErrorMessage = (payload: Record<string, unknown>) => {
  const error = payload?.error;

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    const value = error as Record<string, unknown>;
    return normalizeText(value.message) || normalizeText(value.reason) || normalizeText(value.status);
  }

  return normalizeText(payload?.error_description) || normalizeText(payload?.message);
};

const getSpotifyErrorReason = (status: number, payload: Record<string, unknown>) => {
  const message = getSpotifyErrorMessage(payload);
  const loweredMessage = message.toLowerCase();

  if (status === 401 || /invalid token|invalid access token|expired/i.test(message)) {
    return 'invalid_token';
  }

  if (status === 403 && /premium/i.test(message)) {
    return 'premium_required';
  }

  if (status === 403) {
    return 'forbidden';
  }

  if (status === 429) {
    return 'rate_limited';
  }

  if (/market|country|territory/.test(loweredMessage)) {
    return 'market_restricted';
  }

  return 'spotify_api_failed';
};

const createSpotifyAlbumsError = ({
  message,
  status,
  artistName,
  artistId,
  url,
  payload,
  retryUrl = '',
  retryPayload = null,
  retryAfter = '',
}: {
  message: string;
  status: number | null;
  artistName: string;
  artistId: string;
  url: string;
  payload: Record<string, unknown> | null;
  retryUrl?: string;
  retryPayload?: Record<string, unknown> | null;
  retryAfter?: string;
}) => ({
  name: 'SpotifyAlbumsError',
  message,
  statusCode: status,
  body: {
    reason: status ? getSpotifyErrorReason(status, payload || {}) : 'spotify_api_failed',
    artistName,
    artistId,
    url,
    payload,
    retryUrl,
    retryPayload,
    retryAfter,
  },
  stack: '',
});

const getEndpointPrefix = (endpoint: string) => endpoint.slice(0, 40);

const ARTIST_ALIAS_QUERIES: Record<string, string[]> = {
  아이유: ['IU'],
  백예린: ['Yerin Baek'],
  혁오: ['HYUKOH'],
  검정치마: ['The Black Skirts'],
  실리카겔: ['Silica Gel'],
  잔나비: ['Jannabi'],
  뉴진스: ['NewJeans'],
  'wave to earth': ['wave to earth'],
};

const normalizeName = (value: unknown) =>
  normalizeText(value)
    .toLowerCase()
    .replace(/[._\-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const isMockArtistId = (value: string) => value.toLowerCase().startsWith('mock:');

const isLikelySpotifyArtistId = (value: string) =>
  /^[A-Za-z0-9]{18,28}$/.test(value) && !isUuid(value) && !isMockArtistId(value);

const getRawSpotifyArtistId = (artist: RequestArtist) => {
  const externalId = normalizeText(artist.externalId || artist.external_id);
  const id = normalizeText(artist.id);

  if (isLikelySpotifyArtistId(externalId)) {
    return {
      id: externalId,
      method: 'external_id' as const,
    };
  }

  if (artist.source === 'spotify' && isLikelySpotifyArtistId(id)) {
    return {
      id,
      method: 'id' as const,
    };
  }

  return {
    id: '',
    method: null,
  };
};

const getArtistSearchQueries = (artist: RequestArtist) => {
  const name = normalizeText(artist.name);
  const normalizedName = normalizeName(name);
  const queries = new Set<string>();

  if (name) {
    queries.add(name);
  }

  Object.entries(ARTIST_ALIAS_QUERIES).forEach(([alias, aliasQueries]) => {
    if (normalizeName(alias) === normalizedName || aliasQueries.some((query) => normalizeName(query) === normalizedName)) {
      aliasQueries.forEach((query) => queries.add(query));
    }
  });

  return Array.from(queries).filter(Boolean);
};

const resolveSpotifyArtistBySearch = async (
  accessToken: string,
  artist: RequestArtist,
): Promise<ResolvedSpotifyArtist | null> => {
  const queries = getArtistSearchQueries(artist);

  for (const query of queries) {
    const url = new URL('https://api.spotify.com/v1/search');
    url.searchParams.set('q', query);
    url.searchParams.set('type', 'artist');
    url.searchParams.set('market', 'KR');
    url.searchParams.set('limit', '5');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      logError('spotify_artist_search_failed', {
        name: 'SpotifyArtistSearchError',
        message: payload?.error?.message || 'Spotify artist search failed.',
        statusCode: response.status,
        body: payload,
      }, {
        artistName: artist.name,
        query,
      });
      continue;
    }

    const items = Array.isArray(payload?.artists?.items) ? payload.artists.items : [];
    const normalizedQuery = normalizeName(query);
    const sortedItems = [...items].sort((a, b) => {
      const aName = normalizeName(a?.name);
      const bName = normalizeName(b?.name);
      const aExact = aName === normalizedQuery ? 1 : 0;
      const bExact = bName === normalizedQuery ? 1 : 0;

      if (aExact !== bExact) {
        return bExact - aExact;
      }

      return Number(b?.popularity || 0) - Number(a?.popularity || 0);
    });
    const matchedArtist = sortedItems.find((item) => isLikelySpotifyArtistId(normalizeText(item?.id)));

    if (matchedArtist?.id) {
      return {
        ...artist,
        externalId: normalizeText(matchedArtist.id),
        external_id: normalizeText(matchedArtist.id),
        name: normalizeText(artist.name) || normalizeText(matchedArtist.name),
        source: 'spotify',
        resolvedSpotifyArtistId: normalizeText(matchedArtist.id),
        resolveMethod: 'alias_search',
        query,
      };
    }
  }

  return null;
};

const resolveSpotifyArtist = async (
  accessToken: string,
  artist: RequestArtist,
): Promise<ResolvedSpotifyArtist | null> => {
  const rawSpotifyArtistId = getRawSpotifyArtistId(artist);

  logStep('spotify_artist_id_candidate', {
    id: artist.id,
    externalId: artist.externalId,
    external_id: artist.external_id,
    name: artist.name,
    source: artist.source,
    resolvedSpotifyArtistId: rawSpotifyArtistId.id,
    resolveMethod: rawSpotifyArtistId.method,
    skippedBecauseMock: isMockArtistId(normalizeText(artist.externalId || artist.external_id || artist.id)),
    skippedBecauseUuid: isUuid(normalizeText(artist.externalId || artist.external_id || artist.id)),
  });

  if (rawSpotifyArtistId.id && rawSpotifyArtistId.method) {
    return {
      ...artist,
      externalId: rawSpotifyArtistId.id,
      external_id: rawSpotifyArtistId.id,
      source: 'spotify',
      resolvedSpotifyArtistId: rawSpotifyArtistId.id,
      resolveMethod: rawSpotifyArtistId.method,
    };
  }

  return resolveSpotifyArtistBySearch(accessToken, artist);
};

const getSpotifyArtistId = (artist: RequestArtist) => normalizeText(artist.externalId || artist.external_id);

const getSpotifyAccessToken = async (clientId: string, clientSecret: string) => {
  logStep('spotify_token_request_started', {
    hasClientId: Boolean(clientId),
    hasClientSecret: Boolean(clientSecret),
  });

  const credentials = btoa(`${clientId}:${clientSecret}`);
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload?.access_token) {
    throw {
      name: 'SpotifyTokenError',
      message: payload?.error_description || payload?.error || 'Spotify token endpoint failed.',
      statusCode: response.status,
      body: payload,
    };
  }

  logStep('spotify_token_ready', {
    status: response.status,
    hasAccessToken: Boolean(payload.access_token),
    tokenType: payload?.token_type || '',
    expiresIn: payload?.expires_in || null,
  });

  return String(payload.access_token);
};

const fetchSpotifyAlbumPage = async (
  accessToken: string,
  spotifyArtistId: string,
  { market }: { market: string },
): Promise<SpotifyAlbumPageResult> => {
  const url = new URL(`https://api.spotify.com/v1/artists/${encodeURIComponent(spotifyArtistId)}/albums`);
  url.searchParams.set('include_groups', 'album,single');
  url.searchParams.set('limit', '20');

  if (market) {
    url.searchParams.set('market', market);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const retryAfter = response.headers.get('Retry-After') || response.headers.get('retry-after') || '';

  return {
    ok: response.ok,
    status: response.status,
    url: url.toString(),
    payload,
    items,
    retryAfter,
  };
};

const fetchSpotifyAlbums = async (accessToken: string, artist: RequestArtist): Promise<SpotifyAlbumFetchResult> => {
  const spotifyArtistId = getSpotifyArtistId(artist);

  if (!spotifyArtistId || !isLikelySpotifyArtistId(spotifyArtistId)) {
    return {
      artist,
      newsItems: [],
      status: null,
      itemCount: 0,
      marketItemCount: 0,
      noMarketItemCount: 0,
      retriedWithoutMarket: false,
      retryAfter: '',
      error: {
        name: 'InvalidSpotifyArtistId',
        message: 'Resolved artist id is not a Spotify artist id.',
        statusCode: null,
        body: null,
        stack: '',
      },
    };
  }

  const artistName = normalizeText(artist.name);
  const marketResult = await fetchSpotifyAlbumPage(accessToken, spotifyArtistId, { market: 'KR' });

  logStep('spotify_albums_fetch_result', {
    artistName,
    artistId: spotifyArtistId,
    market: 'KR',
    status: marketResult.status,
    itemCount: marketResult.items.length,
    url: marketResult.url,
    errorBody: marketResult.ok ? null : marketResult.payload,
    retryAfter: marketResult.retryAfter,
  });

  let finalItems = marketResult.ok ? marketResult.items : [];
  let noMarketItemCount = 0;
  let retriedWithoutMarket = false;
  let noMarketError: ReturnType<typeof getErrorDetails> | null = null;

  if (marketResult.status === 429) {
    return {
      artist,
      newsItems: [],
      status: marketResult.status,
      itemCount: 0,
      marketItemCount: 0,
      noMarketItemCount: 0,
      retriedWithoutMarket: false,
      retryAfter: marketResult.retryAfter,
      error: createSpotifyAlbumsError({
        message: 'Spotify 요청이 많아 잠시 후 다시 시도해주세요.',
        status: marketResult.status,
        artistName,
        artistId: spotifyArtistId,
        url: marketResult.url,
        payload: marketResult.payload,
        retryAfter: marketResult.retryAfter,
      }),
    };
  }

  if (!marketResult.ok || finalItems.length === 0) {
    retriedWithoutMarket = true;
    const noMarketResult = await fetchSpotifyAlbumPage(accessToken, spotifyArtistId, { market: '' });
    noMarketItemCount = noMarketResult.items.length;

    logStep('spotify_albums_fetch_result', {
      artistName,
      artistId: spotifyArtistId,
      market: '',
      status: noMarketResult.status,
      itemCount: noMarketResult.items.length,
      url: noMarketResult.url,
      errorBody: noMarketResult.ok ? null : noMarketResult.payload,
      retriedBecause: marketResult.ok ? 'empty_market_result' : 'market_request_failed',
      retryAfter: noMarketResult.retryAfter,
    });

    if (noMarketResult.ok) {
      finalItems = noMarketResult.items;
    } else {
      noMarketError = createSpotifyAlbumsError({
        message: getSpotifyErrorMessage(noMarketResult.payload) || 'Spotify artist albums retry without market failed.',
        status: noMarketResult.status,
        artistName,
        artistId: spotifyArtistId,
        url: marketResult.url,
        payload: marketResult.payload,
        retryUrl: noMarketResult.url,
        retryPayload: noMarketResult.payload,
        retryAfter: noMarketResult.retryAfter,
      });
    }

    if (noMarketResult.status === 429) {
      return {
        artist,
        newsItems: [],
        status: noMarketResult.status,
        itemCount: 0,
        marketItemCount: marketResult.items.length,
        noMarketItemCount,
        retriedWithoutMarket,
        retryAfter: noMarketResult.retryAfter,
        error: createSpotifyAlbumsError({
          message: 'Spotify 요청이 많아 잠시 후 다시 시도해주세요.',
          status: noMarketResult.status,
          artistName,
          artistId: spotifyArtistId,
          url: marketResult.url,
          payload: marketResult.payload,
          retryUrl: noMarketResult.url,
          retryPayload: noMarketResult.payload,
          retryAfter: noMarketResult.retryAfter,
        }),
      };
    }
  }

  if (!marketResult.ok && finalItems.length === 0) {
    const error = createSpotifyAlbumsError({
      message: getSpotifyErrorMessage(marketResult.payload) || 'Spotify artist albums API failed.',
      status: marketResult.status,
      artistName,
      artistId: spotifyArtistId,
      url: marketResult.url,
      payload: marketResult.payload,
      retryUrl: noMarketError?.body && typeof noMarketError.body === 'object'
        ? normalizeText((noMarketError.body as Record<string, unknown>).retryUrl)
        : '',
      retryPayload: noMarketError?.body && typeof noMarketError.body === 'object'
        ? ((noMarketError.body as Record<string, unknown>).retryPayload as Record<string, unknown> | null)
        : null,
      retryAfter: noMarketError?.body && typeof noMarketError.body === 'object'
        ? normalizeText((noMarketError.body as Record<string, unknown>).retryAfter)
        : '',
    });

    return {
      artist,
      newsItems: [],
      status: marketResult.status,
      itemCount: 0,
      marketItemCount: 0,
      noMarketItemCount,
      retriedWithoutMarket,
      retryAfter: error.body && typeof error.body === 'object'
        ? normalizeText((error.body as Record<string, unknown>).retryAfter)
        : '',
      error,
    };
  }

  const newsItems = finalItems.map((album: SpotifyAlbum) => {
    const albumId = normalizeText(album.id);
    const date = normalizeReleaseDate(album.release_date);
    const title = normalizeText(album.name) || '새 음악';
    const resolvedArtistName = artistName || normalizeText(album.artists?.[0]?.name) || '아티스트';
    const imageUrl = getFirstImageUrl(album.images);

    return {
      id: `spotify_album_${albumId || title}`,
      artistId: spotifyArtistId,
      artistName: resolvedArtistName,
      type: 'album',
      title,
      description: `${resolvedArtistName}의 ${album.album_type === 'single' ? '싱글' : '앨범'} 소식이에요.`,
      imageUrl,
      image_url: imageUrl,
      date,
      startTime: '',
      location: 'Spotify',
      sourceUrl: normalizeText(album.external_urls?.spotify),
      createdAt: `${date}T00:00:00.000Z`,
    };
  });

  return {
    artist,
    newsItems,
    status: marketResult.status,
    itemCount: newsItems.length,
    marketItemCount: marketResult.items.length,
    noMarketItemCount,
    retriedWithoutMarket,
    retryAfter: '',
    error: newsItems.length > 0 ? null : noMarketError,
  };
};

const fetchSpotifyAlbumsWithSearchFallback = async (
  accessToken: string,
  artist: RequestArtist,
): Promise<SpotifyAlbumFetchResult> => {
  const directResult = await fetchSpotifyAlbums(accessToken, artist);

  if (directResult.newsItems.length > 0) {
    return directResult;
  }

  if (directResult.error?.statusCode === 429) {
    return directResult;
  }

  const spotifyArtistId = getSpotifyArtistId(artist);
  const artistName = normalizeText(artist.name);

  if (!artistName || directResult.error?.statusCode === 401 || directResult.error?.statusCode === 403) {
    return directResult;
  }

  const searchUrl = new URL('https://api.spotify.com/v1/search');
  searchUrl.searchParams.set('q', `artist:"${artistName}"`);
  searchUrl.searchParams.set('type', 'album');
  searchUrl.searchParams.set('market', 'KR');
  searchUrl.searchParams.set('limit', '10');

  const response = await fetch(searchUrl.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const retryAfter = response.headers.get('Retry-After') || response.headers.get('retry-after') || '';
  const payload = await response.json().catch(() => ({}));
  const items = Array.isArray(payload?.albums?.items) ? payload.albums.items : [];
  const filteredItems = items.filter((album: SpotifyAlbum) => {
    const artists = Array.isArray(album?.artists) ? album.artists : [];

    return artists.some((albumArtist) => {
      return albumArtist?.id === spotifyArtistId || normalizeName(albumArtist?.name) === normalizeName(artistName);
    });
  });

  logStep('spotify_albums_search_fallback_result', {
    artistName,
    artistId: spotifyArtistId,
    status: response.status,
    itemCount: filteredItems.length,
    url: searchUrl.toString(),
    errorBody: response.ok ? null : payload,
    fallbackReason: directResult.error?.message || 'empty_albums_result',
    retryAfter,
  });

  if (!response.ok) {
    return {
      ...directResult,
      error: {
        name: 'SpotifyAlbumsSearchFallbackError',
        message: getSpotifyErrorMessage(payload) || directResult.error?.message || 'Spotify album search fallback failed.',
        statusCode: response.status,
        body: {
          directError: directResult.error,
          searchUrl: searchUrl.toString(),
          searchPayload: payload,
        },
        stack: '',
      },
    };
  }

  const newsItems = filteredItems.map((album: SpotifyAlbum) => {
    const albumId = normalizeText(album.id);
    const date = normalizeReleaseDate(album.release_date);
    const title = normalizeText(album.name) || '새 음악';
    const resolvedArtistName = artistName || normalizeText(album.artists?.[0]?.name) || '아티스트';
    const imageUrl = getFirstImageUrl(album.images);

    return {
      id: `spotify_album_${albumId || title}`,
      artistId: spotifyArtistId,
      artistName: resolvedArtistName,
      type: 'album',
      title,
      description: `${resolvedArtistName}의 ${album.album_type === 'single' ? '싱글' : '앨범'} 소식이에요.`,
      imageUrl,
      image_url: imageUrl,
      date,
      startTime: '',
      location: 'Spotify',
      sourceUrl: normalizeText(album.external_urls?.spotify),
      createdAt: `${date}T00:00:00.000Z`,
    };
  });

  if (newsItems.length > 0) {
    return {
      artist,
      newsItems,
      status: response.status,
      itemCount: newsItems.length,
      marketItemCount: 0,
      noMarketItemCount: 0,
      retriedWithoutMarket: false,
      retryAfter: '',
      error: null,
    };
  }

  return {
    ...directResult,
    error: directResult.error
      ? {
          ...directResult.error,
          body: {
            directError: directResult.error,
            searchUrl: searchUrl.toString(),
            searchStatus: response.status,
            searchItemCount: items.length,
            filteredSearchItemCount: filteredItems.length,
            retryAfter,
          },
        }
      : null,
  };
};

const dedupeNews = (newsItems: MusicNewsItem[]) => {
  const seenIds = new Set<string>();
  const seenSourceUrls = new Set<string>();

  return newsItems.filter((newsItem) => {
    if (!newsItem.id || seenIds.has(newsItem.id)) {
      return false;
    }

    if (newsItem.sourceUrl && seenSourceUrls.has(newsItem.sourceUrl)) {
      return false;
    }

    seenIds.add(newsItem.id);

    if (newsItem.sourceUrl) {
      seenSourceUrls.add(newsItem.sourceUrl);
    }

    return true;
  });
};

const sortNews = (newsItems: MusicNewsItem[]) =>
  [...newsItems].sort((a, b) => {
    const dateDiff = Date.parse(b.date) - Date.parse(a.date);

    if (dateDiff !== 0) {
      return dateDiff;
    }

    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });

const filterRecentMusic = (newsItems: MusicNewsItem[]) => {
  const now = new Date();
  const oldestAllowed = new Date(now);
  oldestAllowed.setDate(oldestAllowed.getDate() - 365);

  return newsItems.filter((newsItem) => {
    const releaseDate = new Date(`${newsItem.date}T00:00:00.000Z`);

    if (Number.isNaN(releaseDate.getTime())) {
      return false;
    }

    return releaseDate >= oldestAllowed;
  });
};

const normalizeCachedNewsItem = (news: RequestCachedNewsItem): MusicNewsItem | null => {
  const id = normalizeText(news?.id);

  if (!id || !id.startsWith('spotify_album_')) {
    return null;
  }

  const artistId = normalizeText(
    news.artistId || news.artist_id || news.spotifyArtistId || news.externalArtistId || news.frontendArtistId,
  );
  const artistName = normalizeText(news.artistName || news.artist_name);
  const date = normalizeReleaseDate(news.date);
  const imageUrl = normalizeText(news.imageUrl || news.image_url);

  return {
    id,
    artistId,
    artistName,
    type: 'album',
    title: normalizeText(news.title) || '새 음악',
    description: normalizeText(news.description) || `${artistName || '아티스트'}의 새 음악이 Spotify에 공개됐어요.`,
    imageUrl,
    image_url: imageUrl,
    date,
    startTime: normalizeText(news.startTime || news.start_time),
    location: normalizeText(news.location) || 'Spotify',
    sourceUrl: normalizeText(news.sourceUrl || news.source_url),
    createdAt: normalizeText(news.createdAt || news.created_at) || `${date}T00:00:00.000Z`,
  };
};

const getCachedAlbumCandidates = (cachedNewsItems: RequestCachedNewsItem[], spotifyArtists: ResolvedSpotifyArtist[]) => {
  const artistIds = new Set<string>();
  const artistNames = new Set<string>();

  spotifyArtists.forEach((artist) => {
    [
      artist.id,
      artist.externalId,
      artist.external_id,
      artist.resolvedSpotifyArtistId,
    ].forEach((value) => {
      const normalizedValue = normalizeText(value);

      if (normalizedValue) {
        artistIds.add(normalizedValue);
      }
    });

    const normalizedName = normalizeName(artist.name);

    if (normalizedName) {
      artistNames.add(normalizedName);
    }
  });

  return dedupeNews(
    cachedNewsItems
      .slice(0, MAX_CACHED_NEWS_ITEMS)
      .map(normalizeCachedNewsItem)
      .filter((news): news is MusicNewsItem => Boolean(news))
      .filter((news) => {
        return artistIds.has(news.artistId) || artistNames.has(normalizeName(news.artistName));
      }),
  );
};

Deno.serve(async (request) => {
  try {
    if (request.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method_not_allowed', message: 'POST only' }, 405);
    }

    let body: {
      anonymousUserId?: string;
      artists?: RequestArtist[];
      cachedNewsItems?: RequestCachedNewsItem[];
      testMode?: boolean;
    };

    try {
      const parsedBody = await request.json();

      if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
        return jsonResponse({ error: 'invalid_body', message: 'Request body must be a JSON object.' }, 400);
      }

      body = parsedBody;
    } catch (error) {
      logError('body_parse_failed', error);
      return jsonResponse({ error: 'invalid_json', message: 'Request body must be valid JSON.' }, 400);
    }

    const anonymousUserId = normalizeText(body.anonymousUserId);
    const requestedArtists = (Array.isArray(body.artists) ? body.artists : [])
      .map((artist) => ({
        id: normalizeText(artist.id),
        externalId: normalizeText(artist.externalId),
        external_id: normalizeText(artist.external_id),
        name: normalizeText(artist.name),
        source: normalizeText(artist.source) || 'manual',
      }));
    const inputArtists = requestedArtists.slice(0, MAX_TEST_ARTISTS);
    const cachedNewsItems = Array.isArray(body.cachedNewsItems)
      ? body.cachedNewsItems.slice(0, MAX_CACHED_NEWS_ITEMS)
      : [];
    const isTestMode = body.testMode === true;
    const inputArtistsWithRawSpotifyIdCount = inputArtists.filter((artist) => getRawSpotifyArtistId(artist).id).length;

    logStep('request_validated', {
      hasAnonymousUserId: Boolean(anonymousUserId),
      requestedArtistCount: requestedArtists.length,
      inputArtistCount: inputArtists.length,
      inputArtistsWithRawSpotifyIdCount,
      cachedNewsItemCount: cachedNewsItems.length,
      testMode: isTestMode,
      artists: inputArtists.map((artist) => ({
        id: artist.id,
        externalId: artist.externalId,
        external_id: artist.external_id,
        name: artist.name,
        source: artist.source,
      })),
    });

    if (!anonymousUserId) {
      return jsonResponse({ error: 'missing_anonymous_user_id', message: 'anonymousUserId is required.' }, 400);
    }

    if (inputArtists.length === 0) {
      return jsonResponse({
        ok: false,
        sent: false,
        reason: 'no_spotify_artists',
        message: 'No artists were provided.',
        debug: {
          requestedArtistCount: requestedArtists.length,
          inputArtistCount: inputArtists.length,
          inputArtistsWithRawSpotifyIdCount,
          resolvedSpotifyArtistCount: 0,
        },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const spotifyClientId = Deno.env.get('SPOTIFY_CLIENT_ID') || '';
    const spotifyClientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET') || '';
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || '';
    const missingSecrets = [
      !supabaseUrl ? 'SUPABASE_URL' : '',
      !serviceRoleKey ? 'SUPABASE_SERVICE_ROLE_KEY' : '',
      !spotifyClientId ? 'SPOTIFY_CLIENT_ID' : '',
      !spotifyClientSecret ? 'SPOTIFY_CLIENT_SECRET' : '',
      !vapidPublicKey ? 'VAPID_PUBLIC_KEY' : '',
      !vapidPrivateKey ? 'VAPID_PRIVATE_KEY' : '',
      !vapidSubject ? 'VAPID_SUBJECT' : '',
    ].filter(Boolean);

    logStep('secret_check', {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      hasSpotifyClientId: Boolean(spotifyClientId),
      hasSpotifyClientSecret: Boolean(spotifyClientSecret),
      hasVapidPublicKey: Boolean(vapidPublicKey),
      hasVapidPrivateKey: Boolean(vapidPrivateKey),
      hasVapidSubject: Boolean(vapidSubject),
    });

    if (missingSecrets.length > 0) {
      return jsonResponse(
        {
          error: 'missing_secret',
          message: 'Required Edge Function secrets are missing.',
          missing: missingSecrets,
        },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: subscriptions, error: subscriptionError } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, created_at')
      .eq('anonymous_user_id', anonymousUserId)
      .eq('enabled', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (subscriptionError) {
      logError('subscription_query_failed', subscriptionError);
      return jsonResponse({ error: 'subscription_query_failed', message: subscriptionError.message }, 500);
    }

    const latestSubscription = Array.isArray(subscriptions) ? subscriptions[0] : null;

    if (!latestSubscription?.endpoint || !latestSubscription?.p256dh || !latestSubscription?.auth) {
      return jsonResponse(
        {
          error: 'subscription_not_found',
          message: 'No enabled push subscription found for this anonymous user.',
        },
        404,
      );
    }

    const accessToken = await getSpotifyAccessToken(spotifyClientId, spotifyClientSecret);
    const resolvedArtistResults = await Promise.all(
      inputArtists.map(async (artist) => {
        try {
          const resolvedArtist = await resolveSpotifyArtist(accessToken, artist);

          return {
            inputArtist: artist,
            resolvedArtist,
            error: null,
          };
        } catch (error) {
          logError('spotify_artist_resolve_failed', error, {
            id: artist.id,
            externalId: artist.externalId,
            external_id: artist.external_id,
            name: artist.name,
            source: artist.source,
          });

          return {
            inputArtist: artist,
            resolvedArtist: null,
            error: getErrorDetails(error),
          };
        }
      }),
    );
    const spotifyArtists = resolvedArtistResults
      .map((result) => result.resolvedArtist)
      .filter((artist): artist is ResolvedSpotifyArtist => Boolean(artist?.resolvedSpotifyArtistId))
      .slice(0, 10);

    logStep('spotify_artists_resolved', {
      inputArtistCount: inputArtists.length,
      requestedArtistCount: requestedArtists.length,
      inputArtistsWithRawSpotifyIdCount,
      resolvedSpotifyArtistCount: spotifyArtists.length,
      resolvedArtists: spotifyArtists.map((artist) => ({
        id: artist.id,
        externalId: artist.externalId,
        name: artist.name,
        source: artist.source,
        resolvedSpotifyArtistId: artist.resolvedSpotifyArtistId,
        resolveMethod: artist.resolveMethod,
        query: artist.query,
      })),
      unresolvedArtists: resolvedArtistResults
        .filter((result) => !result.resolvedArtist)
        .map((result) => ({
          id: result.inputArtist.id,
          externalId: result.inputArtist.externalId,
          external_id: result.inputArtist.external_id,
          name: result.inputArtist.name,
          source: result.inputArtist.source,
          error: result.error,
        })),
    });

    if (spotifyArtists.length === 0) {
      return jsonResponse({
        ok: false,
        sent: false,
        reason: 'spotify_artist_id_not_found',
        message: 'No artists could be resolved to Spotify artist IDs.',
        debug: {
          inputArtistCount: inputArtists.length,
          requestedArtistCount: requestedArtists.length,
          inputArtistsWithRawSpotifyIdCount,
          resolvedSpotifyArtistCount: 0,
          successfulAlbumArtistCount: 0,
          albumNewsCount: 0,
          candidateCount: 0,
          resolvedArtistDetails: [],
          unresolvedArtistDetails: resolvedArtistResults.map((result) => ({
            id: result.inputArtist.id,
            externalId: result.inputArtist.externalId,
            external_id: result.inputArtist.external_id,
            name: result.inputArtist.name,
            source: result.inputArtist.source,
            error: result.error,
          })),
        },
      });
    }

    const cachedAlbumCandidates = getCachedAlbumCandidates(cachedNewsItems, spotifyArtists);
    let albumResults: SpotifyAlbumFetchResult[] = [];
    let usedCachedAlbumNews = cachedAlbumCandidates.length > 0;
    let rateLimitRetryAfter = '';

    if (usedCachedAlbumNews) {
      albumResults = [
        {
          artist: spotifyArtists[0],
          newsItems: cachedAlbumCandidates,
          status: 200,
          itemCount: cachedAlbumCandidates.length,
          marketItemCount: 0,
          noMarketItemCount: 0,
          retriedWithoutMarket: false,
          retryAfter: '',
          error: null,
        },
      ];

      logStep('cached_album_candidates_used', {
        cachedAlbumCandidateCount: cachedAlbumCandidates.length,
        candidateSample: cachedAlbumCandidates.slice(0, 3).map((news) => ({
          id: news.id,
          artistId: news.artistId,
          artistName: news.artistName,
          title: news.title,
          date: news.date,
        })),
      });
    } else {
      for (const artist of spotifyArtists.slice(0, MAX_TEST_ARTISTS)) {
        try {
          const result = await fetchSpotifyAlbumsWithSearchFallback(accessToken, artist);
          albumResults.push(result);

          if (result.error?.statusCode === 429) {
            rateLimitRetryAfter = result.retryAfter || (
              result.error.body && typeof result.error.body === 'object'
                ? normalizeText((result.error.body as Record<string, unknown>).retryAfter)
                : ''
            );

            logStep('spotify_rate_limited_stop_remaining_artists', {
              artistName: artist.name,
              artistId: artist.externalId,
              retryAfter: rateLimitRetryAfter,
              checkedArtistCount: albumResults.length,
              skippedArtistCount: Math.max(spotifyArtists.length - albumResults.length, 0),
            });
            break;
          }
        } catch (error) {
          logError('spotify_artist_albums_failed', error, {
            artistId: artist.externalId,
            artistName: artist.name,
          });

          albumResults.push({
            artist,
            newsItems: [],
            status: null,
            itemCount: 0,
            marketItemCount: 0,
            noMarketItemCount: 0,
            retriedWithoutMarket: false,
            retryAfter: '',
            error: getErrorDetails(error),
          });
        }
      }
    }
    const albumNews = albumResults.flatMap((result) => result.newsItems);
    const successfulAlbumArtistCount = albumResults.filter((result) => !result.error).length;
    const failedAlbumArtistCount = albumResults.filter((result) => result.error).length;
    const firstAlbumFailure = albumResults.find((result) => result.error)?.error || null;
    const isRateLimited = albumResults.some((result) => result.error?.statusCode === 429);
    const albumFailureDetails = albumResults
      .filter((result) => result.error)
      .map((result) => ({
        artistName: result.artist.name,
        artistId: result.artist.externalId || result.artist.external_id || result.artist.id,
        resolvedSpotifyArtistId: (result.artist as RequestArtist & { resolvedSpotifyArtistId?: string }).resolvedSpotifyArtistId,
        status: result.error?.statusCode || null,
        message: result.error?.message || '',
        body: result.error?.body || null,
        retryAfter: result.retryAfter,
      }));
    const dedupedAlbumNews = sortNews(dedupeNews(albumNews));
    const recentCandidates = sortNews(filterRecentMusic(dedupedAlbumNews));
    const candidates = isTestMode && recentCandidates.length === 0 ? dedupedAlbumNews : recentCandidates;
    const debug = {
      testMode: isTestMode,
      requestedArtistCount: requestedArtists.length,
      inputArtistCount: inputArtists.length,
      inputArtistsWithRawSpotifyIdCount,
      spotifyArtistCount: spotifyArtists.length,
      resolvedSpotifyArtistCount: spotifyArtists.length,
      checkedSpotifyArtistCount: albumResults.length,
      skippedSpotifyArtistCount: Math.max(spotifyArtists.length - albumResults.length, 0),
      successfulAlbumArtistCount,
      failedAlbumArtistCount,
      firstAlbumFailureReason: firstAlbumFailure?.message || '',
      firstAlbumFailureStatus: firstAlbumFailure?.statusCode || null,
      firstAlbumFailureBody: firstAlbumFailure?.body || null,
      isRateLimited,
      retryAfter: rateLimitRetryAfter,
      cachedNewsItemCount: cachedNewsItems.length,
      cachedAlbumCandidateCount: cachedAlbumCandidates.length,
      usedCachedAlbumNews,
      albumNewsCount: albumNews.length,
      dedupedAlbumNewsCount: dedupedAlbumNews.length,
      recentCandidateCount: recentCandidates.length,
      candidateCount: candidates.length,
      usedLatestAlbumFallback: isTestMode && recentCandidates.length === 0 && dedupedAlbumNews.length > 0,
      albumFailureDetails,
      resolvedArtistDetails: spotifyArtists.map((artist) => ({
        id: artist.id,
        externalId: artist.externalId,
        name: artist.name,
        source: artist.source,
        resolvedSpotifyArtistId: artist.resolvedSpotifyArtistId,
        resolveMethod: artist.resolveMethod,
        query: artist.query,
      })),
      albumCountByArtist: albumResults.map((result) => ({
        artistId: result.artist.externalId,
        resolvedSpotifyArtistId: (result.artist as RequestArtist & { resolvedSpotifyArtistId?: string }).resolvedSpotifyArtistId,
        resolveMethod: (result.artist as RequestArtist & { resolveMethod?: string }).resolveMethod,
        query: (result.artist as RequestArtist & { query?: string }).query,
        artistName: result.artist.name,
        status: result.status,
        albumCount: result.newsItems.length,
        itemCount: result.itemCount,
        marketItemCount: result.marketItemCount,
        noMarketItemCount: result.noMarketItemCount,
        retriedWithoutMarket: result.retriedWithoutMarket,
        retryAfter: result.retryAfter,
        error: result.error,
      })),
    };

    logStep('spotify_candidates_ready', {
      ...debug,
    });

    if (isRateLimited && candidates.length === 0) {
      return jsonResponse(
        {
          ok: true,
          sent: false,
          reason: 'spotify_rate_limited',
          message: 'Spotify 요청이 많아 잠시 후 다시 시도해주세요.',
          retryAfter: rateLimitRetryAfter,
          checkedArtists: albumResults.length,
          debug,
        },
        200,
        rateLimitRetryAfter ? { 'Retry-After': rateLimitRetryAfter } : {},
      );
    }

    if (candidates.length === 0) {
      return jsonResponse({
        ok: true,
        sent: false,
        reason: 'no_recent_music',
        checkedArtists: spotifyArtists.length,
        debug,
      });
    }

    const mostImportantCandidate = candidates[0];
    const candidateIds = [mostImportantCandidate.id];
    const { data: notifiedRows, error: notifiedQueryError } = await supabase
      .from('notified_news')
      .select('news_id')
      .eq('anonymous_user_id', anonymousUserId)
      .in('news_id', candidateIds);

    if (notifiedQueryError) {
      logError('notified_news_query_failed', notifiedQueryError);
      return jsonResponse({ error: 'notified_news_query_failed', message: notifiedQueryError.message }, 500);
    }

    const notifiedNewsIds = new Set((notifiedRows || []).map((row: { news_id?: string }) => row.news_id).filter(Boolean));
    const nextNewsItem = notifiedNewsIds.has(mostImportantCandidate.id) ? null : mostImportantCandidate;

    if (!nextNewsItem) {
      return jsonResponse({
        ok: true,
        sent: false,
        reason: 'already_notified',
        checkedNewsCount: candidates.length,
        debug: {
          ...debug,
          topCandidateId: mostImportantCandidate.id,
          topCandidateTitle: mostImportantCandidate.title,
        },
      });
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const payload = JSON.stringify({
      title: 'GOYO',
      body: `${nextNewsItem.artistName}의 새 음악이 도착했어요: ${nextNewsItem.title}`,
      icon: nextNewsItem.imageUrl || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: {
        url: `/detail/${nextNewsItem.id}`,
      },
    });

    try {
      await webpush.sendNotification(
        {
          endpoint: latestSubscription.endpoint,
          keys: {
            p256dh: latestSubscription.p256dh,
            auth: latestSubscription.auth,
          },
        },
        payload,
      );
    } catch (error) {
      const details = getErrorDetails(error);
      logError('web_push_failed', error, {
        subscriptionId: latestSubscription.id,
        endpointPrefix: getEndpointPrefix(latestSubscription.endpoint || ''),
      });

      if (details.statusCode === 404 || details.statusCode === 410) {
        await supabase
          .from('push_subscriptions')
          .update({ enabled: false, updated_at: new Date().toISOString() })
          .eq('id', latestSubscription.id);
      }

      return jsonResponse(
        {
          error: 'web_push_failed',
          ...details,
          subscription: {
            id: latestSubscription.id,
            endpointPrefix: getEndpointPrefix(latestSubscription.endpoint || ''),
          },
        },
        500,
      );
    }

    const { error: notifiedInsertError } = await supabase.from('notified_news').upsert(
      {
        anonymous_user_id: anonymousUserId,
        news_id: nextNewsItem.id,
        news_title: nextNewsItem.title,
        artist_name: nextNewsItem.artistName,
        type: nextNewsItem.type,
        notified_at: new Date().toISOString(),
      },
      { onConflict: 'anonymous_user_id,news_id' },
    );

    if (notifiedInsertError) {
      logError('notified_news_insert_failed', notifiedInsertError, { newsId: nextNewsItem.id });
      return jsonResponse(
        {
          error: 'notified_news_insert_failed',
          message: notifiedInsertError.message,
          sent: true,
          newsItem: nextNewsItem,
        },
        500,
      );
    }

    return jsonResponse({
      ok: true,
      sent: true,
      newsItem: nextNewsItem,
      checkedNewsCount: candidates.length,
      skippedAlreadyNotifiedCount: notifiedNewsIds.size,
      debug,
      subscription: {
        id: latestSubscription.id,
        endpointPrefix: getEndpointPrefix(latestSubscription.endpoint || ''),
      },
    });
  } catch (error) {
    logError('unhandled_error', error);
    return jsonResponse({ error: 'unhandled_error', ...getErrorDetails(error) }, 500);
  }
});
