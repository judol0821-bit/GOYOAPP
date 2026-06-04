import { mockNews } from '../data/mockNews.js';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { apiFetch, hasApiBaseUrl } from './client.js';
import { dedupeNewsItems, isUuid, mapNewsFromSupabase } from './mappers.js';
import { getCachedSpotifyNewsById, getSpotifyArtistAlbums } from './spotify.js';

const MOCK_ARTIST_IDS = new Set(mockNews.map((news) => news.artistId).filter(Boolean));

const getUniqueNews = (newsItems) => {
  return dedupeNewsItems(newsItems);
};

const getNewsSortValue = (news) => news.createdAt || `${news.date || ''}T${news.startTime || '00:00'}:00`;

const sortByCreatedAtDesc = (a, b) => getNewsSortValue(b).localeCompare(getNewsSortValue(a));

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
      .select('id, external_id, source')
      .in('id', uuidIds);

    if (error) {
      throw error;
    }

    (data || []).forEach((artist) => {
      if (artist.source === 'spotify' && artist.external_id) {
        spotifyArtistIdByFrontendId.set(artist.external_id, artist.id);
      }
    });
  }

  if (legacyIds.length > 0) {
    const externalIds = legacyIds.flatMap((artistId) => [artistId, `mock:${artistId}`]);
    const { data, error } = await supabase
      .from('artists')
      .select('id, external_id, source')
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

        if (artist.source === 'spotify' && artist.external_id) {
          spotifyArtistIdByFrontendId.set(artist.external_id, matchedLegacyId);
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
  const entries = Array.from(spotifyArtistIdByFrontendId.entries()).filter(([spotifyArtistId]) => spotifyArtistId);

  if (entries.length === 0) {
    return [];
  }

  const newsGroups = await Promise.all(
    entries.map(async ([spotifyArtistId, frontendArtistId]) => {
      const albums = await getSpotifyArtistAlbums(spotifyArtistId);

      return albums.map((news) => ({
        ...news,
        artistId: frontendArtistId || news.artistId || spotifyArtistId,
      }));
    }),
  );

  return getUniqueNews(newsGroups.flat()).sort(sortByCreatedAtDesc);
};

export async function getNewsByFollowedArtists(artistIds) {
  const safeArtistIds = Array.isArray(artistIds) ? artistIds.filter(Boolean) : [];

  if (safeArtistIds.length === 0) {
    return [];
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

      const spotifyNews = await loadSpotifyAlbumNews(spotifyArtistIdByFrontendId);
      const mergedNews = getUniqueNews([...supabaseNews, ...spotifyNews]).sort(sortByCreatedAtDesc);

      return filterByArtistIds(mergedNews, safeArtistIds);
    } catch (error) {
      console.error('Failed to load Supabase news.', error);
      return filterByArtistIds(mockNews, safeArtistIds);
    }
  }

  if (hasApiBaseUrl()) {
    try {
      const query = safeArtistIds.map((artistId) => encodeURIComponent(artistId)).join(',');
      const payload = await apiFetch(`/news?artistIds=${query}`);
      return filterByArtistIds(unwrapNewsList(payload), safeArtistIds);
    } catch {
      console.error('Failed to load REST news.');
      return filterByArtistIds(mockNews, safeArtistIds);
    }
  }

  return filterByArtistIds(mockNews, safeArtistIds);
}

export async function getNewsById(id) {
  if (!id) {
    return null;
  }

  const cachedSpotifyNews = getCachedSpotifyNewsById(id);

  if (cachedSpotifyNews) {
    return cachedSpotifyNews;
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
