import { getSupabaseClient } from '../lib/supabase.js';
import { mapSpotifyAlbumToNews, mapSpotifyArtist } from './mappers.js';

const SPOTIFY_ARTIST_CACHE_KEY = 'goyoSpotifyArtistCache';

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

const readCachedSpotifyArtists = () => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const value = JSON.parse(window.sessionStorage.getItem(SPOTIFY_ARTIST_CACHE_KEY) || '[]');
    return Array.isArray(value) ? value.map(mapSpotifyArtist).filter((artist) => artist.id) : [];
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

export async function searchSpotifyArtists(query) {
  const normalizedQuery = typeof query === 'string' ? query.trim() : '';
  const client = getSupabaseClient();

  if (!client || !normalizedQuery) {
    return [];
  }

  try {
    const { data, error } = await client.functions.invoke('spotify-search-artists', {
      body: { q: normalizedQuery },
    });

    if (error) {
      throw error;
    }

    const artists = unwrapList(data, 'artists').map(mapSpotifyArtist).filter((artist) => artist.id);
    writeCachedSpotifyArtists(artists);

    return artists;
  } catch (error) {
    console.error('Failed to search Spotify artists.', error);
    return [];
  }
}

export async function getSpotifyArtistAlbums(artistId) {
  const spotifyArtistId = typeof artistId === 'string' ? artistId.trim() : '';
  const client = getSupabaseClient();

  if (!client || !spotifyArtistId) {
    return [];
  }

  try {
    const { data, error } = await client.functions.invoke('spotify-artist-albums', {
      body: { artistId: spotifyArtistId },
    });

    if (error) {
      throw error;
    }

    return unwrapList(data, 'news').map((album) =>
      mapSpotifyAlbumToNews(album, {
        artistId: spotifyArtistId,
        artistName: album?.artistName || album?.artist_name,
      }),
    );
  } catch (error) {
    console.error('Failed to load Spotify artist albums.', error);
    return [];
  }
}
