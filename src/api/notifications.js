import { isSupabaseConfigured } from '../lib/supabase.js';
import { mapSpotifyAlbumToNews } from './mappers.js';
import { isBrowserOffline } from '../utils/network.js';
import { readAllCachedNewsItems } from '../utils/newsCache.js';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
const CHECK_NEW_MUSIC_FUNCTION_NAME = 'check-new-music-notifications';
const MAX_NOTIFICATION_TEST_ARTISTS = 2;
const SPOTIFY_NEWS_CACHE_KEY = 'goyoSpotifyNewsCache';
const SPOTIFY_NOTIFICATION_COOLDOWN_KEY = 'goyoSpotifyNotificationCooldownUntil';

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');

const readRateLimitCooldown = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const cooldownUntil = Number(window.localStorage.getItem(SPOTIFY_NOTIFICATION_COOLDOWN_KEY) || 0);

  if (!Number.isFinite(cooldownUntil) || cooldownUntil <= Date.now()) {
    return null;
  }

  return {
    cooldownUntil,
    retryAfter: Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000)),
  };
};

const writeRateLimitCooldown = (retryAfter) => {
  if (typeof window === 'undefined') {
    return;
  }

  const seconds = Number(retryAfter || 60);
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 60;
  window.localStorage.setItem(
    SPOTIFY_NOTIFICATION_COOLDOWN_KEY,
    String(Date.now() + safeSeconds * 1000),
  );
};

const toPushArtistPayload = (artist) => ({
  id: normalizeText(artist?.id),
  externalId: normalizeText(artist?.externalId || artist?.external_id),
  name: normalizeText(artist?.name),
  source: artist?.source || 'spotify',
});

const readStorageArray = (key) => {
  if (typeof window === 'undefined') {
    return [];
  }

  return [window.localStorage, window.sessionStorage].flatMap((storage) => {
    try {
      const value = JSON.parse(storage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  });
};

const getArtistIdCandidates = (artist) => [
  normalizeText(artist?.id),
  normalizeText(artist?.externalId),
].filter(Boolean);

const getCachedNotificationAlbumNews = (artists) => {
  const safeArtists = Array.isArray(artists) ? artists.map(toPushArtistPayload) : [];
  const artistIds = new Set(safeArtists.flatMap(getArtistIdCandidates));
  const artistNameById = new Map();
  const externalIdByFrontendId = new Map();

  safeArtists.forEach((artist) => {
    if (artist.id && artist.name) {
      artistNameById.set(artist.id, artist.name);
    }

    if (artist.externalId && artist.name) {
      artistNameById.set(artist.externalId, artist.name);
    }

    if (artist.id && artist.externalId) {
      externalIdByFrontendId.set(artist.id, artist.externalId);
    }
  });

  const cachedItems = [
    ...readAllCachedNewsItems(),
    ...readStorageArray(SPOTIFY_NEWS_CACHE_KEY).map((item) => mapSpotifyAlbumToNews(item)).filter((item) => item?.id),
  ];
  const seenIds = new Set();

  return cachedItems
    .filter((news) => news?.type === 'album' && String(news?.id || '').startsWith('spotify_album_'))
    .map((news) => {
      const artistId = normalizeText(news.artistId || news.artist_id);
      const resolvedSpotifyArtistId = externalIdByFrontendId.get(artistId) || artistId;

      return {
        ...news,
        artistId: resolvedSpotifyArtistId,
        spotifyArtistId: resolvedSpotifyArtistId,
        externalArtistId: resolvedSpotifyArtistId,
        frontendArtistId: artistId,
        artistName: news.artistName || artistNameById.get(artistId) || artistNameById.get(resolvedSpotifyArtistId) || '',
      };
    })
    .filter((news) => {
      const ids = [
        news.artistId,
        news.spotifyArtistId,
        news.externalArtistId,
        news.frontendArtistId,
      ].map(normalizeText);

      return ids.some((id) => artistIds.has(id));
    })
    .filter((news) => {
      if (!news.id || seenIds.has(news.id)) {
        return false;
      }

      seenIds.add(news.id);
      return true;
    })
    .slice(0, 12);
};

const parseFunctionPayload = async (response) => {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      message: text,
    };
  }
};

const getFunctionErrorMessage = (payload, status) => {
  const errorCode = payload?.error || payload?.reason || '';
  const rawMessage = payload?.message || payload?.body || '';

  if (errorCode === 'subscription_not_found') {
    return 'Web Push 구독이 없어요. 알림 받기를 OFF 후 ON으로 다시 켜주세요.';
  }

  if (errorCode === 'notified_news_query_failed' || /notified_news|schema cache|PGRST205/i.test(rawMessage)) {
    return 'notified_news 테이블이 아직 Supabase에 적용되지 않았어요.';
  }

  if (errorCode === 'missing_secret') {
    return 'Edge Function secret 설정이 부족해요.';
  }

  if (errorCode === 'spotify_artist_id_not_found') {
    return 'Spotify ID가 있는 아티스트가 없습니다.';
  }

  if (errorCode === 'spotify_rate_limited') {
    return payload?.retryAfter
      ? `Spotify 요청이 많아 잠시 후 다시 시도해주세요. (${payload.retryAfter}초 뒤)`
      : 'Spotify 요청이 많아 잠시 후 다시 시도해주세요.';
  }

  if (errorCode === 'web_push_failed') {
    return `Web Push 발송 실패: ${rawMessage || payload?.statusCode || status}`;
  }

  if (status === 404 && /Function not found/i.test(rawMessage)) {
    return 'check-new-music-notifications 함수가 배포되지 않았어요.';
  }

  return rawMessage || errorCode || `Edge Function 오류가 발생했어요. (${status})`;
};

const getDebugSummary = (debug) => {
  if (!debug) {
    return '';
  }

  const compactBody = (() => {
    if (!debug.firstAlbumFailureBody) {
      return '';
    }

    try {
      const value =
        typeof debug.firstAlbumFailureBody === 'string'
          ? debug.firstAlbumFailureBody
          : JSON.stringify(debug.firstAlbumFailureBody);

      return value.length > 180 ? `${value.slice(0, 180)}...` : value;
    } catch {
      return String(debug.firstAlbumFailureBody);
    }
  })();
  const artistCount = debug.resolvedSpotifyArtistCount ?? debug.spotifyArtistCount ?? 0;
  const checkedArtistCount = debug.checkedSpotifyArtistCount ?? artistCount;
  const successfulAlbumArtistCount = debug.successfulAlbumArtistCount ?? 0;
  const failedAlbumArtistCount = debug.failedAlbumArtistCount ?? 0;
  const albumCount = debug.albumNewsCount ?? 0;
  const candidateCount = debug.candidateCount ?? 0;
  const cacheText = debug.usedCachedAlbumNews ? `, 캐시 ${debug.cachedAlbumCandidateCount ?? 0}개 사용` : '';
  const retryText = debug.retryAfter ? `, ${debug.retryAfter}초 뒤 재시도` : '';
  const firstFailure = debug.firstAlbumFailureReason
    ? `, 첫 실패 ${debug.firstAlbumFailureReason}${debug.firstAlbumFailureStatus ? ` (${debug.firstAlbumFailureStatus})` : ''}${compactBody ? `, body ${compactBody}` : ''}`
    : '';

  return `전체 ${debug.requestedArtistCount ?? debug.inputArtistCount ?? 0}명, 조회 대상 ${debug.inputArtistCount ?? 0}명, Spotify ID ${artistCount}명, 실제 조회 ${checkedArtistCount}명, 조회 성공 ${successfulAlbumArtistCount}명, 조회 실패 ${failedAlbumArtistCount}명, 앨범 ${albumCount}개, 후보 ${candidateCount}개${cacheText}${retryText}${firstFailure}`;
};

export async function checkNewMusicNotifications(anonymousUserId, artists, options = {}) {
  const safeAnonymousUserId = normalizeText(anonymousUserId);
  const allRequestedArtists = Array.isArray(artists) ? artists.map(toPushArtistPayload) : [];
  const requestedArtists = allRequestedArtists
    .filter((artist) => artist.externalId || artist.id)
    .slice(0, MAX_NOTIFICATION_TEST_ARTISTS);
  const artistsWithExternalId = requestedArtists.filter((artist) => artist.externalId);
  const cachedNewsItems = getCachedNotificationAlbumNews(allRequestedArtists);
  const rateLimitCooldown = readRateLimitCooldown();

  if (rateLimitCooldown && cachedNewsItems.length === 0) {
    return {
      ok: true,
      sent: false,
      reason: 'spotify_rate_limited',
      message: 'Spotify 요청이 많아 잠시 후 다시 시도해주세요.',
      retryAfter: rateLimitCooldown.retryAfter,
      debug: {
        requestedArtistCount: allRequestedArtists.length,
        inputArtistCount: requestedArtists.length,
        inputArtistsWithRawSpotifyIdCount: artistsWithExternalId.length,
        resolvedSpotifyArtistCount: requestedArtists.length,
        checkedSpotifyArtistCount: 0,
        successfulAlbumArtistCount: 0,
        failedAlbumArtistCount: 0,
        albumNewsCount: 0,
        candidateCount: 0,
        retryAfter: rateLimitCooldown.retryAfter,
        cachedNewsItemCount: cachedNewsItems.length,
      },
    };
  }

  if (import.meta.env?.DEV) {
    console.log('[GOYO push test] artists payload', {
      totalArtistCount: allRequestedArtists.length,
      requestedArtistCount: requestedArtists.length,
      spotifyExternalIdArtistCount: artistsWithExternalId.length,
      cachedNewsItemCount: cachedNewsItems.length,
      artists: requestedArtists,
    });
  }

  if (!safeAnonymousUserId || !isSupabaseConfigured() || isBrowserOffline()) {
    return {
      ok: false,
      sent: false,
      error: 'push_check_unavailable',
      message: 'Supabase 연결 또는 네트워크 상태를 확인할 수 없어요.',
    };
  }

  if (requestedArtists.length === 0) {
    return {
      ok: false,
      sent: false,
      error: 'no_spotify_artists',
      message: 'Spotify 아티스트를 먼저 팔로우해주세요.',
      debug: {
        inputArtistCount: requestedArtists.length,
        inputArtistsWithRawSpotifyIdCount: artistsWithExternalId.length,
        resolvedSpotifyArtistCount: 0,
      },
    };
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${CHECK_NEW_MUSIC_FUNCTION_NAME}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        anonymousUserId: safeAnonymousUserId,
        artists: requestedArtists,
        cachedNewsItems,
        testMode: Boolean(options.testMode),
      }),
    });
    const payload = await parseFunctionPayload(response);

    if (payload?.reason === 'spotify_rate_limited' || payload?.error === 'spotify_rate_limited') {
      writeRateLimitCooldown(payload.retryAfter || payload?.debug?.retryAfter || 60);
    }

    if (import.meta.env?.DEV) {
      console.log('[GOYO push test] function response', {
        status: response.status,
        payload,
        summary: getDebugSummary(payload?.debug),
      });
    }

    if (!response.ok) {
      console.error('New music notification function returned an error.', {
        functionName: CHECK_NEW_MUSIC_FUNCTION_NAME,
        status: response.status,
        payload,
        request: {
          anonymousUserId: safeAnonymousUserId,
          requestedArtistCount: requestedArtists.length,
          spotifyExternalIdArtistCount: artistsWithExternalId.length,
          artists: requestedArtists.map((artist) => ({
            id: artist.id,
            externalId: artist.externalId,
            name: artist.name,
            source: artist.source,
          })),
        },
      });

      return {
        ok: false,
        sent: false,
        status: response.status,
        error: payload?.error || 'function_response_failed',
        message: getFunctionErrorMessage(payload, response.status),
        details: payload,
      };
    }

    return payload || {
      ok: false,
      sent: false,
      error: 'empty_function_response',
      message: 'Edge Function 응답이 비어 있어요.',
    };
  } catch (error) {
    console.error('Failed to send a request to the new music notification Edge Function.', {
      functionName: CHECK_NEW_MUSIC_FUNCTION_NAME,
      error,
      request: {
        hasSupabaseUrl: Boolean(SUPABASE_URL),
        hasAnonKey: Boolean(SUPABASE_ANON_KEY),
        anonymousUserId: safeAnonymousUserId,
        artistCount: requestedArtists.length,
      },
    });

    return {
      ok: false,
      sent: false,
      error: 'function_call_failed',
      message:
        error?.message === 'Failed to fetch'
          ? 'Edge Function 요청이 브라우저에서 차단됐어요. 함수 배포와 CORS 설정을 확인해주세요.'
          : error?.message || '새 음악 알림 테스트 중 오류가 발생했어요.',
      debug: {
        inputArtistCount: requestedArtists.length,
        inputArtistsWithRawSpotifyIdCount: artistsWithExternalId.length,
      },
    };
  }
}
