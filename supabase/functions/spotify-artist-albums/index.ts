import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const knownArtistNamesById: Record<string, string> = {
  '3HqSLMAZ3g3d5poNaI7GOU': 'IU',
  '6HvZYsbFfjnjFrWF950C9d': 'NewJeans',
  '57okaLdCtv3nVBSn5otJkp': 'HYUKOH',
  '2SY6OktZyMLdOnscX3DCyS': 'JANNABI',
  '6dhfy4ByARPJdPtMyrUYJK': 'Yerin Baek',
  '6WeDO4GynFmK4OxwkBzMW8': 'The Black Skirts',
  '2kxVxKOgoefmgkwoHipHsn': 'Silica Gel',
  '5069JTmv5ZDyPeZaCCXiCg': 'wave to earth',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

class SpotifyFunctionError extends Error {
  stage: string;
  status?: number;

  constructor(message: string, stage: string, status?: number) {
    super(message);
    this.name = 'SpotifyFunctionError';
    this.stage = stage;
    this.status = status;
  }
}

const getErrorMessage = async (response: Response) => {
  try {
    const text = await response.text();

    if (!text) {
      return '';
    }

    try {
      const payload = JSON.parse(text);
      return payload?.error_description || payload?.error?.message || payload?.error || text;
    } catch {
      return text;
    }
  } catch {
    return '';
  }
};

const readArtistId = async (request: Request) => {
  const url = new URL(request.url);
  const artistIdFromUrl = url.searchParams.get('artistId');

  if (artistIdFromUrl) {
    return artistIdFromUrl.trim();
  }

  try {
    const body = await request.json();
    return typeof body?.artistId === 'string' ? body.artistId.trim() : '';
  } catch {
    return '';
  }
};

const normalizeReleaseDate = (releaseDate: unknown) => {
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

const normalizeText = (value: unknown) =>
  typeof value === 'string' ? value.toLowerCase().replace(/\s+/g, ' ').trim() : '';

const getSpotifyToken = async () => {
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new SpotifyFunctionError('Spotify secrets are not configured.', 'secrets');
  }

  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!tokenResponse.ok) {
    const spotifyMessage = (await getErrorMessage(tokenResponse)) || 'Spotify token request failed.';
    throw new SpotifyFunctionError(spotifyMessage, 'token', tokenResponse.status);
  }

  const tokenPayload = await tokenResponse.json();
  const accessToken = tokenPayload?.access_token;

  if (!accessToken) {
    throw new SpotifyFunctionError('Spotify token response did not include access_token.', 'token');
  }

  return accessToken as string;
};

const mapAlbum = (album: any, fallbackArtistId: string) => {
  const spotifyAlbumId = album?.id || '';
  const artist = Array.isArray(album?.artists) ? album.artists[0] : null;
  const date = normalizeReleaseDate(album?.release_date);
  const imageUrl = Array.isArray(album?.images) ? album.images[0]?.url || '' : '';
  const title = album?.name || '새 앨범';
  const artistName = artist?.name || '';

  return {
    id: `spotify_album_${spotifyAlbumId}`,
    artistId: artist?.id || fallbackArtistId,
    artistName,
    type: 'album',
    title,
    description: artistName ? `${artistName}의 새 음악이 Spotify에 공개됐어요.` : '새 음악이 Spotify에 공개됐어요.',
    imageUrl,
    date,
    startTime: '',
    location: 'Spotify',
    sourceUrl: album?.external_urls?.spotify || '',
    createdAt: `${date}T00:00:00.000Z`,
  };
};

const dedupeAlbums = (albums: any[]) => {
  const seenIds = new Set<string>();

  return albums.filter((album) => {
    const id = typeof album?.id === 'string' ? album.id : '';

    if (!id || seenIds.has(id)) {
      return false;
    }

    seenIds.add(id);
    return true;
  });
};

const getKnownArtistName = (artistId: string) => knownArtistNamesById[artistId] || '';

const fetchArtistName = async (accessToken: string, artistId: string) => {
  const knownName = getKnownArtistName(artistId);

  if (knownName) {
    return knownName;
  }

  const artistResponse = await fetch(`https://api.spotify.com/v1/artists/${encodeURIComponent(artistId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!artistResponse.ok) {
    return '';
  }

  const artist = await artistResponse.json();
  return typeof artist?.name === 'string' ? artist.name : '';
};

const fetchAlbumsBySearch = async (accessToken: string, artistId: string) => {
  const artistName = await fetchArtistName(accessToken, artistId);

  if (!artistName) {
    return [];
  }

  const searchUrl = new URL('https://api.spotify.com/v1/search');
  searchUrl.searchParams.set('q', `artist:"${artistName}"`);
  searchUrl.searchParams.set('type', 'album');
  searchUrl.searchParams.set('market', 'KR');
  searchUrl.searchParams.set('limit', '10');

  const searchResponse = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!searchResponse.ok) {
    return [];
  }

  const payload = await searchResponse.json();
  const items = Array.isArray(payload?.albums?.items) ? payload.albums.items : [];
  const normalizedArtistName = normalizeText(artistName);

  return dedupeAlbums(
    items.filter((album: any) => {
      const artists = Array.isArray(album?.artists) ? album.artists : [];

      return artists.some((artist: any) => {
        return artist?.id === artistId || normalizeText(artist?.name) === normalizedArtistName;
      });
    }),
  );
};

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const artistId = await readArtistId(request);

    if (!artistId) {
      return jsonResponse({ news: [] });
    }

    const accessToken = await getSpotifyToken();
    const albumsUrl = new URL(`https://api.spotify.com/v1/artists/${encodeURIComponent(artistId)}/albums`);
    albumsUrl.searchParams.set('include_groups', 'album,single');
    albumsUrl.searchParams.set('market', 'KR');

    const spotifyResponse = await fetch(albumsUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (spotifyResponse.status === 429) {
      const fallbackAlbums = await fetchAlbumsBySearch(accessToken, artistId);
      const fallbackNews = fallbackAlbums.map((album) => mapAlbum(album, artistId)).filter((news) => news.id);

      return jsonResponse({
        news: fallbackNews,
        message: fallbackNews.length > 0
          ? 'Spotify albums endpoint was rate limited. Search fallback was used.'
          : 'Spotify rate limited this request.',
      }, 200);
    }

    if (!spotifyResponse.ok) {
      const spotifyMessage = (await getErrorMessage(spotifyResponse)) || 'Spotify artist albums request failed.';
      throw new SpotifyFunctionError(spotifyMessage, 'albums', spotifyResponse.status);
    }

    const payload = await spotifyResponse.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const albums = items.length > 0 ? dedupeAlbums(items) : await fetchAlbumsBySearch(accessToken, artistId);

    return jsonResponse({ news: albums.map((album) => mapAlbum(album, artistId)).filter((news) => news.id) });
  } catch (error) {
    console.error('spotify-artist-albums failed.', error);
    const functionError = error instanceof SpotifyFunctionError ? error : null;

    return jsonResponse(
      {
        news: [],
        message: 'Spotify album fallback should be used.',
        error: {
          stage: functionError?.stage || 'unknown',
          status: functionError?.status || null,
          message: error instanceof Error ? error.message : 'Unknown Spotify function error.',
        },
      },
      200,
    );
  }
});
