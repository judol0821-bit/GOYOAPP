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

const readQuery = async (request: Request) => {
  const url = new URL(request.url);
  const queryFromUrl = url.searchParams.get('q');

  if (queryFromUrl) {
    return queryFromUrl.trim();
  }

  try {
    const body = await request.json();
    return typeof body?.q === 'string' ? body.q.trim() : '';
  } catch {
    return '';
  }
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

const mapArtist = (artist: any) => {
  const imageUrl = Array.isArray(artist?.images) ? artist.images[0]?.url || '' : '';

  return {
    id: artist?.id || '',
    externalId: artist?.id || '',
    name: artist?.name || '이름 없는 아티스트',
    imageUrl,
    genres: Array.isArray(artist?.genres) ? artist.genres : [],
    source: 'spotify',
    spotifyUrl: artist?.external_urls?.spotify || '',
  };
};

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const query = await readQuery(request);

    if (!query) {
      return jsonResponse({ artists: [] });
    }

    const accessToken = await getSpotifyToken();
    const searchUrl = new URL('https://api.spotify.com/v1/search');
    searchUrl.searchParams.set('q', query);
    searchUrl.searchParams.set('type', 'artist');
    searchUrl.searchParams.set('limit', '10');
    searchUrl.searchParams.set('market', 'KR');

    const spotifyResponse = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (spotifyResponse.status === 429) {
      return jsonResponse({ artists: [], message: 'Spotify rate limited this request.' }, 200);
    }

    if (!spotifyResponse.ok) {
      throw new Error(`Spotify artist search failed: ${spotifyResponse.status}`);
    }

    const payload = await spotifyResponse.json();
    const items = Array.isArray(payload?.artists?.items) ? payload.artists.items : [];

    return jsonResponse({ artists: items.map(mapArtist).filter((artist) => artist.id) });
  } catch (error) {
    console.error('spotify-search-artists failed.', error);

    return jsonResponse(
      {
        artists: [],
        message: 'Spotify artist search fallback should be used.',
      },
      200,
    );
  }
});
