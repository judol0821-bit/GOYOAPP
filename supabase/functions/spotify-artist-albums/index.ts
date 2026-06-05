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

const knownAlbumFallbacksByArtistId: Record<string, Array<{ id: string; title: string; date: string }>> = {
  '3HqSLMAZ3g3d5poNaI7GOU': [
    { id: '2bwwRhKbLeD3LvNDXauV2T', title: 'Love wins all', date: '2024-01-24' },
    { id: '01dPJcwyht77brL4JQiR8R', title: 'The Winning', date: '2024-02-20' },
  ],
  '6dhfy4ByARPJdPtMyrUYJK': [
    { id: '5a3LnwhYHFlx82Do9iuU8t', title: 'Love, Yerin', date: '2021-09-10' },
    { id: '4DMnw19QJfWwGYexM0R8V9', title: 'tellusboutyourself', date: '2020-12-10' },
  ],
  '2kxVxKOgoefmgkwoHipHsn': [
    { id: '59Hje4SbnsKpsAWRBZ6IPz', title: 'BIG VOID', date: '2025-12-11' },
    { id: '7tXqt8mp0XtokfIIQQ83wa', title: 'Tik Tak Tok', date: '2023-08-19' },
    { id: '63Z0hWI9rtD9tCik8Snh0k', title: 'NO PAIN', date: '2022-08-25' },
  ],
  '5069JTmv5ZDyPeZaCCXiCg': [
    { id: '3adXqPOM585r2bGJOjc5fb', title: 'wave 0.01', date: '2020-01-02' },
    { id: '0kT2E1yEroWvXKf2mSMtWn', title: 'summer flows 0.02', date: '2020-08-04' },
  ],
};

const getBestImageUrl = (images: unknown) => {
  if (!Array.isArray(images)) {
    return '';
  }

  return images.find((image: any) => typeof image?.url === 'string' && image.url)?.url || '';
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
  const imageUrl = getBestImageUrl(album?.images);
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
    image_url: imageUrl,
    date,
    startTime: '',
    location: 'Spotify',
    sourceUrl: album?.external_urls?.spotify || '',
    createdAt: `${date}T00:00:00.000Z`,
  };
};

const fetchSpotifyOEmbedImage = async (albumId: string) => {
  try {
    const oembedUrl = new URL('https://open.spotify.com/oembed');
    oembedUrl.searchParams.set('url', `https://open.spotify.com/album/${albumId}`);

    const response = await fetch(oembedUrl);

    if (!response.ok) {
      return '';
    }

    const payload = await response.json();
    return typeof payload?.thumbnail_url === 'string' ? payload.thumbnail_url : '';
  } catch {
    return '';
  }
};

const getKnownAlbumFallbackNews = async (artistId: string) => {
  const artistName = getKnownArtistName(artistId);
  const albums = knownAlbumFallbacksByArtistId[artistId] || [];

  if (!artistName || albums.length === 0) {
    return [];
  }

  return Promise.all(albums.map(async (album) => {
    const imageUrl = typeof (album as any)?.imageUrl === 'string' ? (album as any).imageUrl : '';
    const fallbackImageUrl = imageUrl || await fetchSpotifyOEmbedImage(album.id);

    return {
      id: `spotify_album_${album.id}`,
      artistId,
      artistName,
      type: 'album',
      title: album.title,
      description: `${artistName}의 음악 정보를 Spotify 연결이 안정되면 다시 갱신할게요.`,
      imageUrl: fallbackImageUrl,
      image_url: fallbackImageUrl,
      date: album.date,
      startTime: '',
      location: 'Spotify',
      sourceUrl: `https://open.spotify.com/album/${album.id}`,
      createdAt: `${album.date}T00:00:00.000Z`,
    };
  }));
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

const fetchAlbumsByIds = async (accessToken: string, artistId: string) => {
  const knownAlbums = knownAlbumFallbacksByArtistId[artistId] || [];

  if (knownAlbums.length === 0) {
    return [];
  }

  const albumsUrl = new URL('https://api.spotify.com/v1/albums');
  albumsUrl.searchParams.set('ids', knownAlbums.map((album) => album.id).join(','));
  albumsUrl.searchParams.set('market', 'KR');

  const albumsResponse = await fetch(albumsUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!albumsResponse.ok) {
    return [];
  }

  const payload = await albumsResponse.json();
  return Array.isArray(payload?.albums) ? payload.albums.filter(Boolean) : [];
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
      const knownAlbums = fallbackAlbums.length > 0 ? [] : await fetchAlbumsByIds(accessToken, artistId);
      const fallbackNews = [...fallbackAlbums, ...knownAlbums].map((album) => mapAlbum(album, artistId)).filter((news) => news.id);
      const knownFallbackNews = fallbackNews.length > 0 ? fallbackNews : await getKnownAlbumFallbackNews(artistId);
      const fallbackMessage = fallbackNews.length > 0
        ? 'Spotify albums endpoint was rate limited. Search fallback was used.'
        : 'Spotify albums endpoint was rate limited. Known fallback was used.';

      return jsonResponse({
        news: knownFallbackNews,
        message: knownFallbackNews.length > 0 ? fallbackMessage : 'Spotify rate limited this request.',
      }, 200);
    }

    if (!spotifyResponse.ok) {
      const spotifyMessage = (await getErrorMessage(spotifyResponse)) || 'Spotify artist albums request failed.';
      throw new SpotifyFunctionError(spotifyMessage, 'albums', spotifyResponse.status);
    }

    const payload = await spotifyResponse.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const albums = items.length > 0 ? dedupeAlbums(items) : await fetchAlbumsBySearch(accessToken, artistId);
    const news = albums.map((album) => mapAlbum(album, artistId)).filter((item) => item.id);

    return jsonResponse({ news: news.length > 0 ? news : await getKnownAlbumFallbackNews(artistId) });
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
