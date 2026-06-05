import { isSupabaseConfigured } from '../lib/supabase.js';
import { isBrowserOffline } from '../utils/network.js';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
const CHECK_NEW_MUSIC_FUNCTION_NAME = 'check-new-music-notifications';

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');

const toPushArtistPayload = (artist) => ({
  id: normalizeText(artist?.id),
  externalId: normalizeText(artist?.externalId || artist?.external_id),
  name: normalizeText(artist?.name),
  source: artist?.source || 'spotify',
});

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

  const artistCount = debug.resolvedSpotifyArtistCount ?? debug.spotifyArtistCount ?? 0;
  const successfulAlbumArtistCount = debug.successfulAlbumArtistCount ?? 0;
  const failedAlbumArtistCount = debug.failedAlbumArtistCount ?? 0;
  const albumCount = debug.albumNewsCount ?? 0;
  const candidateCount = debug.candidateCount ?? 0;
  const firstFailure = debug.firstAlbumFailureReason ? `, 첫 실패 ${debug.firstAlbumFailureReason}` : '';

  return `전체 ${debug.inputArtistCount ?? 0}명, Spotify ID ${artistCount}명, 조회 성공 ${successfulAlbumArtistCount}명, 조회 실패 ${failedAlbumArtistCount}명, 앨범 ${albumCount}개, 후보 ${candidateCount}개${firstFailure}`;
};

export async function checkNewMusicNotifications(anonymousUserId, artists, options = {}) {
  const safeAnonymousUserId = normalizeText(anonymousUserId);
  const requestedArtists = Array.isArray(artists) ? artists.map(toPushArtistPayload) : [];
  const artistsWithExternalId = requestedArtists.filter((artist) => artist.externalId);

  if (import.meta.env?.DEV) {
    console.log('[GOYO push test] artists payload', {
      requestedArtistCount: requestedArtists.length,
      spotifyExternalIdArtistCount: artistsWithExternalId.length,
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
        testMode: Boolean(options.testMode),
      }),
    });
    const payload = await parseFunctionPayload(response);

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
