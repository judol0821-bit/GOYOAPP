import { mockArtists } from '../data/mockArtists.js';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { findArtistSnapshot, readArtistSnapshots } from '../utils/artistSnapshots.js';
import { isBrowserOffline } from '../utils/network.js';
import { apiFetch, hasApiBaseUrl } from './client.js';
import { dedupeArtists, isUuid, mapArtistFromSupabase } from './mappers.js';
import { getCachedSpotifyArtistById, searchSpotifyArtists } from './spotify.js';

const normalizeText = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const getUniqueArtists = (artists) => dedupeArtists(artists);

const ARTIST_ALIAS_GROUPS = [
  ['iu', '아이유'],
  ['yerin baek', 'baek yerin', '백예린'],
  ['hyukoh', '혁오'],
  ['the black skirts', '검정치마'],
  ['silica gel', '실리카겔'],
  ['jannabi', '잔나비'],
  ['newjeans', 'new jeans', '뉴진스'],
  ['wave to earth'],
];

const normalizeArtistName = (value) =>
  normalizeText(value)
    .replace(/[._\-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const artistAliasMap = ARTIST_ALIAS_GROUPS.reduce((aliasMap, aliases) => {
  const canonicalName = normalizeArtistName(aliases[0]);

  aliases.forEach((alias) => {
    aliasMap.set(normalizeArtistName(alias), canonicalName);
  });

  return aliasMap;
}, new Map());

const getCanonicalArtistName = (value) => {
  const normalizedName = normalizeArtistName(value);
  return artistAliasMap.get(normalizedName) || normalizedName;
};

const getArtistGenres = (artist) => (Array.isArray(artist?.genres) ? artist.genres : []);

const hasArtistImage = (artist) => Boolean(artist?.imageUrl || artist?.image_url);

const getArtistPopularity = (artist) => {
  const popularity = Number(artist?.popularity);
  return Number.isFinite(popularity) ? popularity : 0;
};

const getArtistSearchScore = (artist, query) => {
  const normalizedQuery = normalizeArtistName(query);
  const canonicalQuery = getCanonicalArtistName(query);
  const normalizedName = normalizeArtistName(artist?.name);
  const canonicalName = getCanonicalArtistName(artist?.name);
  let score = 0;

  if (canonicalQuery && canonicalName === canonicalQuery) {
    score += 500;
  }

  if (normalizedQuery && normalizedName === normalizedQuery) {
    score += 180;
  }

  if (artist?.source === 'spotify') {
    score += 90;
  }

  if (hasArtistImage(artist)) {
    score += 40;
  }

  if (normalizedQuery && normalizedName.includes(normalizedQuery)) {
    score += 20;
  }

  score += getArtistPopularity(artist) * 0.25;

  return score;
};

const mergeArtistDetails = (baseArtist, nextArtist, query) => {
  const preferredArtist =
    getArtistSearchScore(nextArtist, query) > getArtistSearchScore(baseArtist, query) ? nextArtist : baseArtist;
  const secondaryArtist = preferredArtist === baseArtist ? nextArtist : baseArtist;
  const preferredGenres = getArtistGenres(preferredArtist);
  const secondaryGenres = getArtistGenres(secondaryArtist);

  return {
    ...preferredArtist,
    externalId: preferredArtist.externalId || preferredArtist.external_id || secondaryArtist.externalId || secondaryArtist.external_id || '',
    imageUrl: preferredArtist.imageUrl || preferredArtist.image_url || secondaryArtist.imageUrl || secondaryArtist.image_url || '',
    genres: preferredGenres.length > 0 ? preferredGenres : secondaryGenres,
    spotifyUrl: preferredArtist.spotifyUrl || preferredArtist.spotify_url || secondaryArtist.spotifyUrl || secondaryArtist.spotify_url || '',
    popularity: getArtistPopularity(preferredArtist) || getArtistPopularity(secondaryArtist) || undefined,
  };
};

const getArtistDedupeKeys = (artist) => [
  artist?.id ? `id:${artist.id}` : '',
  artist?.externalId || artist?.external_id ? `external:${normalizeText(artist.externalId || artist.external_id)}` : '',
  artist?.name ? `name:${getCanonicalArtistName(artist.name)}` : '',
].filter(Boolean);

const mergeArtistSearchResults = (query, ...artistGroups) => {
  const artists = artistGroups.flat().filter((artist) => artist?.id);
  const mergedArtists = [];
  const artistIndexByKey = new Map();

  artists.forEach((artist) => {
    const keys = getArtistDedupeKeys(artist);
    const existingIndex = keys.map((key) => artistIndexByKey.get(key)).find((index) => index !== undefined);

    if (existingIndex === undefined) {
      const nextIndex = mergedArtists.length;
      mergedArtists.push(artist);
      keys.forEach((key) => artistIndexByKey.set(key, nextIndex));
      return;
    }

    const mergedArtist = mergeArtistDetails(mergedArtists[existingIndex], artist, query);
    mergedArtists[existingIndex] = mergedArtist;

    [...new Set([...keys, ...getArtistDedupeKeys(mergedArtist)])].forEach((key) =>
      artistIndexByKey.set(key, existingIndex),
    );
  });

  return mergedArtists.sort((a, b) => getArtistSearchScore(b, query) - getArtistSearchScore(a, query));
};

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

const searchSnapshotArtists = (query, { includeAllWhenEmpty = false } = {}) => {
  const normalizedQuery = normalizeText(query);
  const snapshots = readArtistSnapshots();

  if (!normalizedQuery) {
    return includeAllWhenEmpty ? snapshots : [];
  }

  return snapshots.filter((artist) => {
    const genres = Array.isArray(artist.genres) ? artist.genres : [];
    const searchableText = `${artist.name || ''} ${genres.join(' ')}`.toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
};

const searchFallbackArtists = (query, options = {}) => {
  return getUniqueArtists([...searchSnapshotArtists(query, options), ...searchMockArtists(query, options)]);
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

const hydrateSavedSpotifyArtists = async (artists) => {
  const safeArtists = Array.isArray(artists) ? artists : [];
  const spotifyExternalIds = [
    ...new Set(
      safeArtists
        .map((artist) => artist?.externalId || artist?.id)
        .filter(Boolean),
    ),
  ];

  if (!isSupabaseConfigured() || spotifyExternalIds.length === 0) {
    return safeArtists;
  }

  try {
    const { data, error } = await supabase
      .from('artists')
      .select('id, external_id, name, image_url, genres, source')
      .eq('source', 'spotify')
      .in('external_id', spotifyExternalIds);

    if (error) {
      throw error;
    }

    const savedArtistByExternalId = new Map(
      (data || []).map((artist) => {
        const mappedArtist = mapArtistFromSupabase(artist);
        return [mappedArtist.externalId, mappedArtist];
      }),
    );

    return safeArtists.map((artist) => {
      const spotifyExternalId = artist.externalId || artist.id;
      const savedArtist = savedArtistByExternalId.get(spotifyExternalId);

      if (!savedArtist) {
        return artist;
      }

      return {
        ...artist,
        id: savedArtist.id,
        externalId: spotifyExternalId,
        imageUrl: artist.imageUrl || savedArtist.imageUrl,
        genres: Array.isArray(artist.genres) && artist.genres.length > 0 ? artist.genres : savedArtist.genres,
        source: 'spotify',
      };
    });
  } catch (error) {
    console.warn('Failed to hydrate saved Spotify artists.', error);
    return safeArtists;
  }
};

const mergeSavedSpotifyArtist = (savedArtist, sourceArtist) => {
  if (!savedArtist?.id) {
    return sourceArtist;
  }

  const sourceGenres = getArtistGenres(sourceArtist);
  const savedGenres = getArtistGenres(savedArtist);

  return {
    ...savedArtist,
    externalId: sourceArtist?.externalId || sourceArtist?.id || savedArtist.externalId || '',
    imageUrl: sourceArtist?.imageUrl || savedArtist.imageUrl || '',
    genres: sourceGenres.length > 0 ? sourceGenres : savedGenres,
    source: 'spotify',
    spotifyUrl: sourceArtist?.spotifyUrl || savedArtist.spotifyUrl || '',
    popularity: getArtistPopularity(sourceArtist) || getArtistPopularity(savedArtist) || undefined,
  };
};

export async function searchArtists(query, options = {}) {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery && !options.includeAllWhenEmpty) {
    return [];
  }

  if (isBrowserOffline()) {
    return searchFallbackArtists(query, options);
  }

  if (isSupabaseConfigured()) {
    try {
      const [artists, spotifyArtists] = await Promise.all([
        fetchSupabaseArtists(normalizedQuery),
        normalizedQuery ? searchSpotifyArtists(normalizedQuery) : Promise.resolve([]),
      ]);

      if (!normalizedQuery) {
        return options.includeAllWhenEmpty ? artists : [];
      }

      const hydratedSpotifyArtists = await hydrateSavedSpotifyArtists(spotifyArtists);
      return mergeArtistSearchResults(normalizedQuery, hydratedSpotifyArtists, artists);
    } catch (error) {
      console.error('Failed to search Supabase artists.', error);
      const fallbackArtists = searchFallbackArtists(query, options);
      const spotifyArtists = normalizedQuery
        ? await hydrateSavedSpotifyArtists(await searchSpotifyArtists(normalizedQuery))
        : [];

      return mergeArtistSearchResults(normalizedQuery, spotifyArtists, fallbackArtists);
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
      return searchFallbackArtists(query, options);
    }
  }

  return searchFallbackArtists(query, options);
}

export async function getArtistById(id) {
  if (!id) {
    return null;
  }

  if (isBrowserOffline()) {
    const snapshotArtist = findArtistSnapshot(id);
    const cachedSpotifyArtist = getCachedSpotifyArtistById(id);

    return snapshotArtist || cachedSpotifyArtist || getUniqueArtists(mockArtists).find((artist) => artist.id === id) || null;
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

  const snapshotArtist = findArtistSnapshot(id);

  if (snapshotArtist) {
    return snapshotArtist;
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

  if (isBrowserOffline() || !isSupabaseConfigured() || artist.source !== 'spotify') {
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
      return mergeSavedSpotifyArtist(mapArtistFromSupabase(existingArtist), artist);
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
        return mergeSavedSpotifyArtist(mapArtistFromSupabase(retryArtist), artist);
      }

      throw error;
    }

    return data?.id ? mergeSavedSpotifyArtist(mapArtistFromSupabase(data), artist) : artist;
  } catch (error) {
    console.error('Failed to save Spotify artist to Supabase.', error);
    return artist;
  }
}
