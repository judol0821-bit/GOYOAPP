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

const knownArtistProfiles = [
  {
    spotifyId: '3HqSLMAZ3g3d5poNaI7GOU',
    aliases: ['아이유', 'iu'],
    genres: ['K-Pop', 'Ballad', 'Singer-songwriter'],
  },
  {
    spotifyId: '6dhfy4ByARPJdPtMyrUYJK',
    aliases: ['백예린', 'yerin baek', 'baek yerin'],
    genres: ['R&B', 'Soul', 'Indie Pop'],
  },
  {
    spotifyId: '57okaLdCtv3nVBSn5otJkp',
    aliases: ['혁오', 'hyukoh'],
    genres: ['Indie Rock', 'Alternative', 'Band'],
  },
  {
    spotifyId: '6WeDO4GynFmK4OxwkBzMW8',
    aliases: ['검정치마', 'the black skirts'],
    genres: ['Indie Rock', 'Singer-songwriter'],
  },
  {
    spotifyId: '2kxVxKOgoefmgkwoHipHsn',
    aliases: ['실리카겔', 'silica gel'],
    genres: ['Indie Rock', 'Alternative', 'Band'],
  },
  {
    spotifyId: '5069JTmv5ZDyPeZaCCXiCg',
    aliases: ['wave to earth'],
    genres: ['Indie Rock', 'R&B', 'Band'],
  },
];

const normalizeText = (value: unknown) =>
  typeof value === 'string' ? value.toLowerCase().replace(/\s+/g, ' ').trim() : '';

const getProfileByQuery = (query: string) => {
  const normalizedQuery = normalizeText(query);
  return knownArtistProfiles.find((profile) =>
    profile.aliases.some((alias) => normalizeText(alias) === normalizedQuery),
  );
};

const getProfileByArtist = (artist: any) => {
  const normalizedName = normalizeText(artist?.name);
  return knownArtistProfiles.find(
    (profile) =>
      profile.spotifyId === artist?.id ||
      profile.aliases.some((alias) => normalizeText(alias) === normalizedName),
  );
};

const getSearchQueries = (query: string) => {
  const profile = getProfileByQuery(query);
  const normalizedSeen = new Set<string>();
  const candidates = [query, ...(profile?.aliases || [])];

  return candidates
    .map((candidate) => candidate.trim())
    .filter((candidate) => {
      const normalizedCandidate = normalizeText(candidate);

      if (!normalizedCandidate || normalizedSeen.has(normalizedCandidate)) {
        return false;
      }

      normalizedSeen.add(normalizedCandidate);
      return true;
    })
    .slice(0, 3);
};

const scoreArtist = (artist: any, query: string, queryProfile: any, queryIndex: number, itemIndex: number) => {
  const artistProfile = getProfileByArtist(artist);
  const normalizedQuery = normalizeText(query);
  const normalizedName = normalizeText(artist?.name);
  let score = 0;

  if (queryProfile?.spotifyId && artist?.id === queryProfile.spotifyId) {
    score += 240;
  }

  if (artistProfile?.aliases.some((alias: string) => normalizeText(alias) === normalizedQuery)) {
    score += 160;
  }

  if (normalizedName === normalizedQuery) {
    score += 120;
  }

  if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)) {
    score += 40;
  }

  if (Array.isArray(artist?.images) && artist.images.length > 0) {
    score += 8;
  }

  if (Array.isArray(artist?.genres) && artist.genres.length > 0) {
    score += 4;
  }

  return score - queryIndex * 3 - itemIndex * 0.1;
};

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

const mapArtist = (artist: any) => {
  const imageUrl = Array.isArray(artist?.images) ? artist.images[0]?.url || '' : '';
  const profile = getProfileByArtist(artist);
  const genres = Array.isArray(artist?.genres) && artist.genres.length > 0
    ? artist.genres
    : profile?.genres || [];

  return {
    id: artist?.id || '',
    externalId: artist?.id || '',
    name: artist?.name || '이름 없는 아티스트',
    imageUrl,
    genres,
    source: 'spotify',
    spotifyUrl: artist?.external_urls?.spotify || '',
  };
};

const fetchSpotifyArtists = async (accessToken: string, query: string) => {
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

  if (!spotifyResponse.ok) {
    const spotifyMessage = (await getErrorMessage(spotifyResponse)) || 'Spotify artist search failed.';
    throw new SpotifyFunctionError(spotifyMessage, 'search', spotifyResponse.status);
  }

  const payload = await spotifyResponse.json();
  return Array.isArray(payload?.artists?.items) ? payload.artists.items : [];
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
    const queryProfile = getProfileByQuery(query);
    const artistById = new Map<string, { artist: any; score: number }>();
    const searchQueries = getSearchQueries(query);

    const artistGroups = await Promise.all(
      searchQueries.map((searchQuery) => fetchSpotifyArtists(accessToken, searchQuery)),
    );

    artistGroups.forEach((artists, queryIndex) => {
      artists.forEach((artist, itemIndex) => {
        if (!artist?.id) {
          return;
        }

        const score = scoreArtist(artist, query, queryProfile, queryIndex, itemIndex);
        const existing = artistById.get(artist.id);

        if (!existing || score > existing.score) {
          artistById.set(artist.id, { artist, score });
        }
      });
    });

    const artists = Array.from(artistById.values())
      .sort((a, b) => b.score - a.score)
      .map(({ artist }) => mapArtist(artist))
      .filter((artist) => artist.id)
      .filter((artist, index, mappedArtists) => {
        const normalizedName = normalizeText(artist.name);

        if (!normalizedName) {
          return true;
        }

        return mappedArtists.findIndex((candidate) => normalizeText(candidate.name) === normalizedName) === index;
      })
      .slice(0, 10);

    return jsonResponse({ artists });
  } catch (error) {
    console.error('spotify-search-artists failed.', error);
    const functionError = error instanceof SpotifyFunctionError ? error : null;

    return jsonResponse(
      {
        artists: [],
        message: 'Spotify artist search fallback should be used.',
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
