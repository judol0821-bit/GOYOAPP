import { mockNews } from '../data/mockNews.js';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { isBrowserOffline } from '../utils/network.js';
import { filterCachedNewsByArtistIds, findCachedNewsById, readAllCachedNewsItems } from '../utils/newsCache.js';
import { apiFetch, hasApiBaseUrl } from './client.js';
import { dedupeNewsItems, isUuid, mapNewsFromSupabase } from './mappers.js';
import { getCachedSpotifyNewsById, getSpotifyArtistAlbums } from './spotify.js';

const MOCK_ARTIST_IDS = new Set(mockNews.map((news) => news.artistId).filter(Boolean));

const KNOWN_SPOTIFY_ARTIST_IDS = {
  'mock:iu': '3HqSLMAZ3g3d5poNaI7GOU',
  iu: '3HqSLMAZ3g3d5poNaI7GOU',
  '아이유': '3HqSLMAZ3g3d5poNaI7GOU',
  'mock:newjeans': '6HvZYsbFfjnjFrWF950C9d',
  newjeans: '6HvZYsbFfjnjFrWF950C9d',
  '뉴진스': '6HvZYsbFfjnjFrWF950C9d',
  'mock:hyukoh': '57okaLdCtv3nVBSn5otJkp',
  hyukoh: '57okaLdCtv3nVBSn5otJkp',
  '혁오': '57okaLdCtv3nVBSn5otJkp',
  'mock:jannabi': '2SY6OktZyMLdOnscX3DCyS',
  jannabi: '2SY6OktZyMLdOnscX3DCyS',
  '잔나비': '2SY6OktZyMLdOnscX3DCyS',
  'mock:baekyerin': '6dhfy4ByARPJdPtMyrUYJK',
  baekyerin: '6dhfy4ByARPJdPtMyrUYJK',
  '백예린': '6dhfy4ByARPJdPtMyrUYJK',
};

const getUniqueNews = (newsItems) => {
  return dedupeNewsItems(newsItems);
};

const getNewsSortValue = (news) => String(news?.createdAt || `${news?.date || ''}T${news?.startTime || '00:00'}:00`);

const sortByCreatedAtDesc = (a, b) => getNewsSortValue(b).localeCompare(getNewsSortValue(a));

const normalizeLookupText = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const getKnownSpotifyArtistId = (artist) => {
  const candidates = [artist?.external_id, artist?.externalId, artist?.id, artist?.name]
    .map(normalizeLookupText)
    .filter(Boolean);

  for (const candidate of candidates) {
    if (KNOWN_SPOTIFY_ARTIST_IDS[candidate]) {
      return KNOWN_SPOTIFY_ARTIST_IDS[candidate];
    }
  }

  return '';
};

const getSpotifyArtistIdForArtist = (artist) => {
  if (artist?.source === 'spotify' && artist.external_id) {
    return artist.external_id;
  }

  return getKnownSpotifyArtistId(artist);
};

const debugNewsFlow = (payload) => {
  if (import.meta.env?.DEV) {
    console.log('[GOYO news]', payload);
  }
};

const unwrapNewsList = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.news)) {
    return payload.news;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  return [];
};

const unwrapNews = (payload) => payload?.news || payload?.item || payload;

const filterByArtistIds = (newsItems, artistIds) => {
  const safeArtistIds = Array.isArray(artistIds) ? artistIds.filter(Boolean) : [];

  if (safeArtistIds.length === 0) {
    return [];
  }

  return getUniqueNews(newsItems)
    .filter((news) => safeArtistIds.includes(news.artistId))
    .sort(sortByCreatedAtDesc);
};

const getCachedNewsByArtistIds = (artistIds) => {
  return filterCachedNewsByArtistIds(readAllCachedNewsItems(), artistIds).sort(sortByCreatedAtDesc);
};

const getFallbackNewsByArtistIds = (artistIds) => {
  const cachedNews = getCachedNewsByArtistIds(artistIds);

  if (cachedNews.length > 0) {
    return cachedNews;
  }

  return filterByArtistIds(mockNews, artistIds);
};

const resolveSupabaseArtistIds = async (artistIds) => {
  const frontendArtistIdBySupabaseId = new Map();
  const spotifyArtistIdByFrontendId = new Map();
  const safeArtistIds = Array.isArray(artistIds) ? artistIds.filter(Boolean) : [];
  const uuidIds = safeArtistIds.filter(isUuid);
  const legacyIds = safeArtistIds.filter((artistId) => !isUuid(artistId));

  uuidIds.forEach((artistId) => {
    frontendArtistIdBySupabaseId.set(artistId, artistId);
  });

  if (uuidIds.length > 0) {
    const { data, error } = await supabase
      .from('artists')
      .select('id, external_id, name, source')
      .in('id', uuidIds);

    if (error) {
      throw error;
    }

    (data || []).forEach((artist) => {
      const spotifyArtistId = getSpotifyArtistIdForArtist(artist);

      if (spotifyArtistId) {
        spotifyArtistIdByFrontendId.set(spotifyArtistId, artist.id);
      }
    });
  }

  if (legacyIds.length > 0) {
    const externalIds = legacyIds.flatMap((artistId) => [artistId, `mock:${artistId}`]);
    const { data, error } = await supabase
      .from('artists')
      .select('id, external_id, name, source')
      .in('external_id', externalIds);

    if (error) {
      throw error;
    }

    (data || []).forEach((artist) => {
      const matchedLegacyId = legacyIds.find(
        (artistId) => artist.external_id === artistId || artist.external_id === `mock:${artistId}`,
      );

      if (matchedLegacyId) {
        frontendArtistIdBySupabaseId.set(artist.id, matchedLegacyId);
        const spotifyArtistId = getSpotifyArtistIdForArtist(artist);

        if (spotifyArtistId) {
          spotifyArtistIdByFrontendId.set(spotifyArtistId, matchedLegacyId);
        }
      }
    });
  }

  legacyIds.forEach((artistId) => {
    if (!MOCK_ARTIST_IDS.has(artistId) && !artistId.startsWith('mock:')) {
      spotifyArtistIdByFrontendId.set(artistId, artistId);
    }
  });

  return {
    frontendArtistIdBySupabaseId,
    supabaseArtistIds: [...new Set([...uuidIds, ...Array.from(frontendArtistIdBySupabaseId.keys())])],
    spotifyArtistIdByFrontendId,
  };
};

const loadSpotifyAlbumNews = async (spotifyArtistIdByFrontendId) => {
  if (!(spotifyArtistIdByFrontendId instanceof Map)) {
    return [];
  }

  const entries = Array.from(spotifyArtistIdByFrontendId.entries()).filter(([spotifyArtistId]) => spotifyArtistId);

  if (entries.length === 0) {
    return [];
  }

  const newsGroups = [];

  for (const [spotifyArtistId, frontendArtistId] of entries) {
    try {
      const albums = await getSpotifyArtistAlbums(spotifyArtistId);
      const safeAlbums = Array.isArray(albums) ? albums : [];

      newsGroups.push(
        safeAlbums
          .filter(Boolean)
          .map((news) => ({
            ...news,
            artistId: frontendArtistId || news.artistId || spotifyArtistId,
          })),
      );
    } catch (error) {
      console.warn('Failed to load Spotify album news for artist.', { spotifyArtistId, error });
      newsGroups.push([]);
    }
  }

  return getUniqueNews(newsGroups.flat()).sort(sortByCreatedAtDesc);
};

export async function getNewsByFollowedArtists(artistIds) {
  const safeArtistIds = Array.isArray(artistIds) ? artistIds.filter(Boolean) : [];

  if (safeArtistIds.length === 0) {
    return [];
  }

  if (isBrowserOffline()) {
    return getFallbackNewsByArtistIds(safeArtistIds);
  }

  if (isSupabaseConfigured()) {
    try {
      const { frontendArtistIdBySupabaseId, supabaseArtistIds, spotifyArtistIdByFrontendId } =
        await resolveSupabaseArtistIds(safeArtistIds);
      let supabaseNews = [];

      if (supabaseArtistIds.length > 0) {
        const { data, error } = await supabase
          .from('news_items')
          .select(
            'id, artist_id, artist_name, type, title, description, image_url, date, start_time, location, source_url, created_at',
          )
          .in('artist_id', supabaseArtistIds)
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        supabaseNews = (data || []).map((news) =>
          mapNewsFromSupabase(news, {
            artistId: frontendArtistIdBySupabaseId.get(news.artist_id) || news.artist_id,
          }),
        );
      }

      let spotifyNews = [];

      try {
        spotifyNews = await loadSpotifyAlbumNews(spotifyArtistIdByFrontendId);
      } catch (error) {
        console.warn('Failed to merge Spotify album news. Continuing with Supabase news.', error);
      }

      const mergedNews = getUniqueNews([...supabaseNews, ...spotifyNews]).sort(sortByCreatedAtDesc);
      const filteredNews = filterByArtistIds(mergedNews, safeArtistIds);

      debugNewsFlow({
        followedArtistIds: safeArtistIds,
        supabaseArtistIds,
        spotifyArtistIds: Array.from(spotifyArtistIdByFrontendId.keys()),
        followedArtistsWithSpotifyAlbums: Array.from(spotifyArtistIdByFrontendId.values()),
        supabaseNewsCount: supabaseNews.length,
        spotifyAlbumNewsCount: spotifyNews.length,
        mergedNewsCount: mergedNews.length,
        filteredNewsCount: filteredNews.length,
      });

      return filteredNews;
    } catch (error) {
      console.error('Failed to load Supabase news.', error);
      return getFallbackNewsByArtistIds(safeArtistIds);
    }
  }

  if (hasApiBaseUrl()) {
    try {
      const query = safeArtistIds.map((artistId) => encodeURIComponent(artistId)).join(',');
      const payload = await apiFetch(`/news?artistIds=${query}`);
      return filterByArtistIds(unwrapNewsList(payload), safeArtistIds);
    } catch {
      console.error('Failed to load REST news.');
      return getFallbackNewsByArtistIds(safeArtistIds);
    }
  }

  return getFallbackNewsByArtistIds(safeArtistIds);
}

export async function getNewsById(id) {
  if (!id) {
    return null;
  }

  const cachedSpotifyNews = getCachedSpotifyNewsById(id);

  if (cachedSpotifyNews) {
    return cachedSpotifyNews;
  }

  const cachedNews = findCachedNewsById(id);

  if (cachedNews) {
    return cachedNews;
  }

  if (isBrowserOffline()) {
    return getUniqueNews(mockNews).find((news) => news.id === id) || null;
  }

  if (isSupabaseConfigured() && isUuid(id)) {
    try {
      const { data, error } = await supabase
        .from('news_items')
        .select(
          'id, artist_id, artist_name, type, title, description, image_url, date, start_time, location, source_url, created_at',
        )
        .eq('id', id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data?.id) {
        return mapNewsFromSupabase(data);
      }
    } catch (error) {
      console.error('Failed to load Supabase news item.', error);
    }
  }

  if (hasApiBaseUrl()) {
    try {
      const payload = await apiFetch(`/news/${encodeURIComponent(id)}`);
      const news = unwrapNews(payload);

      if (news?.id) {
        return news;
      }
    } catch (error) {
      console.error('Failed to load REST news item.', error);
    }
  }

  return getUniqueNews(mockNews).find((news) => news.id === id) || null;
}
