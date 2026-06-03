import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

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

const getSpotifyToken = async () => {
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error('Spotify secrets are not configured.');
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
    throw new Error(`Spotify token request failed: ${tokenResponse.status}`);
  }

  const tokenPayload = await tokenResponse.json();
  const accessToken = tokenPayload?.access_token;

  if (!accessToken) {
    throw new Error('Spotify token response did not include access_token.');
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
    albumsUrl.searchParams.set('limit', '20');

    const spotifyResponse = await fetch(albumsUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (spotifyResponse.status === 429) {
      return jsonResponse({ news: [], message: 'Spotify rate limited this request.' }, 200);
    }

    if (!spotifyResponse.ok) {
      throw new Error(`Spotify artist albums request failed: ${spotifyResponse.status}`);
    }

    const payload = await spotifyResponse.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];

    return jsonResponse({ news: items.map((album) => mapAlbum(album, artistId)).filter((news) => news.id) });
  } catch (error) {
    console.error('spotify-artist-albums failed.', error);

    return jsonResponse(
      {
        news: [],
        message: 'Spotify album fallback should be used.',
      },
      200,
    );
  }
});
