import { mockArtists } from '../data/mockArtists.js';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { apiFetch, hasApiBaseUrl } from './client.js';
import { dedupeArtists, isUuid, mapArtistFromSupabase } from './mappers.js';
import { getCachedSpotifyArtistById, searchSpotifyArtists } from './spotify.js';

const normalizeText = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const getUniqueArtists = (artists) => dedupeArtists(artists);

const unwrapArtistList = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.artists)) {
    return payload.artists;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  return [];
};

const unwrapArtist = (payload) => payload?.artist || payload?.item || payload;

const searchMockArtists = (query, { includeAllWhenEmpty = false } = {}) => {
  const normalizedQuery = normalizeText(query);
  const artists = getUniqueArtists(mockArtists);

  if (!normalizedQuery) {
    return includeAllWhenEmpty ? artists : [];
  }

  return artists.filter((artist) => {
    const genres = Array.isArray(artist.genres) ? artist.genres : [];
    const searchableText = `${artist.name || ''} ${genres.join(' ')}`.toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
};

const fetchSupabaseArtists = async (query) => {
  const normalizedQuery = normalizeText(query);
  let request = supabase
    .from('artists')
    .select('id, external_id, name, image_url, genres, source')
    .order('name', { ascending: true })
    .limit(20);

  if (normalizedQuery) {
    request = request.ilike('name', `%${normalizedQuery}%`);
  }

  const { data, error } = await request;

  if (error) {
    throw error;
  }

  return getUniqueArtists((data || []).map(mapArtistFromSupabase));
};

export async function searchArtists(query, options = {}) {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery && !options.includeAllWhenEmpty) {
    return [];
  }

  if (isSupabaseConfigured()) {
    try {
      const artists = await fetchSupabaseArtists(normalizedQuery);

      if (!normalizedQuery) {
        return options.includeAllWhenEmpty ? artists : [];
      }

      const spotifyArtists = await searchSpotifyArtists(normalizedQuery);
      return getUniqueArtists([...artists, ...spotifyArtists]);
    } catch (error) {
      console.error('Failed to search Supabase artists.', error);
      const fallbackArtists = searchMockArtists(query, options);
      const spotifyArtists = normalizedQuery ? await searchSpotifyArtists(normalizedQuery) : [];

      return getUniqueArtists([...fallbackArtists, ...spotifyArtists]);
    }
  }

  if (hasApiBaseUrl()) {
    try {
      const path = normalizedQuery
        ? `/artists/search?q=${encodeURIComponent(normalizedQuery)}`
        : '/artists';
      const payload = await apiFetch(path);
      return getUniqueArtists(unwrapArtistList(payload));
    } catch {
      console.error('Failed to search REST artists.');
      return searchMockArtists(query, options);
    }
  }

  return searchMockArtists(query, options);
}

export async function getArtistById(id) {
  if (!id) {
    return null;
  }

  if (isSupabaseConfigured()) {
    try {
      let query = supabase
        .from('artists')
        .select('id, external_id, name, image_url, genres, source');

      if (isUuid(id)) {
        query = query.eq('id', id);
      } else {
        query = query.in('external_id', [id, `mock:${id}`]);
      }

      const { data, error } = await query.limit(1).maybeSingle();

      if (error) {
        throw error;
      }

      if (data?.id) {
        const artist = mapArtistFromSupabase(data);
        return isUuid(id) ? artist : { ...artist, id };
      }
    } catch (error) {
      console.error('Failed to load Supabase artist.', error);
    }
  }

  if (hasApiBaseUrl()) {
    try {
      const payload = await apiFetch(`/artists/${encodeURIComponent(id)}`);
      const artist = unwrapArtist(payload);

      if (artist?.id) {
        return artist;
      }
    } catch (error) {
      console.error('Failed to load REST artist.', error);
    }
  }

  const cachedSpotifyArtist = getCachedSpotifyArtistById(id);

  if (cachedSpotifyArtist) {
    return cachedSpotifyArtist;
  }

  return getUniqueArtists(mockArtists).find((artist) => artist.id === id) || null;
}

export async function ensureArtistSaved(artist) {
  if (!artist) {
    return null;
  }

  if (!isSupabaseConfigured() || artist.source !== 'spotify') {
    return artist;
  }

  const spotifyArtistId = artist.externalId || artist.id;

  if (!spotifyArtistId) {
    return artist;
  }

  try {
    const selectFields = 'id, external_id, name, image_url, genres, source';
    const { data: existingArtist, error: existingError } = await supabase
      .from('artists')
      .select(selectFields)
      .eq('source', 'spotify')
      .eq('external_id', spotifyArtistId)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existingArtist?.id) {
      return mapArtistFromSupabase(existingArtist);
    }

    const { data, error } = await supabase
      .from('artists')
      .insert({
        external_id: spotifyArtistId,
        name: artist.name || '이름 없는 아티스트',
        image_url: artist.imageUrl || '',
        genres: Array.isArray(artist.genres) ? artist.genres : [],
        source: 'spotify',
      })
      .select(selectFields)
      .maybeSingle();

    if (error) {
      const { data: retryArtist, error: retryError } = await supabase
        .from('artists')
        .select(selectFields)
        .eq('source', 'spotify')
        .eq('external_id', spotifyArtistId)
        .maybeSingle();

      if (!retryError && retryArtist?.id) {
        return mapArtistFromSupabase(retryArtist);
      }

      throw error;
    }

    return data?.id ? mapArtistFromSupabase(data) : artist;
  } catch (error) {
    console.error('Failed to save Spotify artist to Supabase.', error);
    return artist;
  }
}
