import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getArtistById } from '../api/artists.js';
import { clearCalendarEvents as clearRemoteCalendarEvents, getCalendarEvents } from '../api/calendar.js';
import { checkNewMusicNotifications } from '../api/notifications.js';
import { clearHiddenNews as clearRemoteHiddenNews, getHiddenNews } from '../api/preferences.js';
import { disablePushSubscription, savePushSubscription } from '../api/push.js';
import { testSpotifyConnection } from '../api/spotify.js';
import ArtistAvatar from '../components/ArtistAvatar.jsx';
import { GOYO_VERSION } from '../config/brand.js';
import useLocalStorage from '../hooks/useLocalStorage.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { testSupabaseConnection } from '../lib/supabase.js';
import { getAnonymousUserId } from '../utils/anonymousUser.js';
import { getSafeArtistSnapshots } from '../utils/artistSnapshots.js';
import { getSafeCalendarEvents } from '../utils/calendarEvents.js';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  getSafeNotificationSettings,
} from '../utils/notificationRules.js';
import {
  getNotificationPermission,
  isNotificationSecureContext,
  isNotificationSupported,
  requestNotificationPermission,
} from '../utils/notifications.js';
import {
  getPushSupportDetails,
  getServiceWorkerRegistration,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from '../utils/webPush.js';

export default function MyPage() {
  const navigate = useNavigate();
  const [artistItems, setArtistItems] = useState([]);
  const [calendarItems, setCalendarItems] = useState(null);
  const [hiddenNewsItems, setHiddenNewsItems] = useState(null);
  const [isLoadingArtists, setIsLoadingArtists] = useState(true);
  const [supabaseStatus, setSupabaseStatus] = useState({
    message: 'Supabase 상태 확인 중',
    status: 'checking',
  });
  const [spotifyStatus, setSpotifyStatus] = useState({
    message: 'Spotify 상태 확인 중',
    status: 'checking',
  });
  const [isStandalone, setIsStandalone] = useState(false);
  const [followedArtistIds, , clearFollowedArtistIds] = useLocalStorage('followedArtistIds', []);
  const [followedArtistSnapshots, , clearFollowedArtistSnapshots] = useLocalStorage('followedArtistSnapshots', []);
  const [hiddenNewsIds, , clearHiddenNewsIds] = useLocalStorage('hiddenNewsIds', []);
  const [calendarEvents, , clearCalendarEvents] = useLocalStorage('calendarEvents', []);
  const [notificationSettings, setNotificationSettings] = useLocalStorage(
    'notificationSettings',
    DEFAULT_NOTIFICATION_SETTINGS,
  );
  const [, , clearCachedNewsItems] = useLocalStorage('cachedNewsItems', []);
  const [, , clearCachedPreviewNews] = useLocalStorage('cachedPreviewNews', []);
  const [, , clearNotifiedNewsIds] = useLocalStorage('notifiedNewsIds', []);

  const anonymousUserId = useMemo(() => getAnonymousUserId(), []);
  const isOnline = useOnlineStatus();
  const safeNotificationSettings = getSafeNotificationSettings(notificationSettings);
  const [notificationPermission, setNotificationPermission] = useState(() => getNotificationPermission());
  const [pushStatusMessage, setPushStatusMessage] = useState('');
  const [newMusicTestState, setNewMusicTestState] = useState({
    isLoading: false,
    message: '',
    status: 'idle',
  });
  const [pushReadiness, setPushReadiness] = useState(() => ({
    ...getPushSupportDetails(),
    hasServiceWorkerRegistration: false,
  }));
  const safeFollowedArtistIds = Array.isArray(followedArtistIds) ? followedArtistIds : [];
  const safeArtistSnapshots = getSafeArtistSnapshots(followedArtistSnapshots);
  const safeHiddenNewsIds = Array.isArray(hiddenNewsItems ?? hiddenNewsIds) ? hiddenNewsItems ?? hiddenNewsIds : [];
  const safeCalendarEvents = getSafeCalendarEvents(calendarItems ?? calendarEvents);
  const followedArtistIdsKey = safeFollowedArtistIds.join('|');
  const followedArtistSnapshotsKey = safeArtistSnapshots
    .map((artist) => `${artist.id}:${artist.externalId}`)
    .join('|');

  useEffect(() => {
    if (!window.matchMedia) {
      setIsStandalone(Boolean(window.navigator.standalone));
      return undefined;
    }

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const updateStandaloneMode = () => {
      setIsStandalone(Boolean(mediaQuery.matches || window.navigator.standalone));
    };

    updateStandaloneMode();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', updateStandaloneMode);
    } else {
      mediaQuery.addListener?.(updateStandaloneMode);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', updateStandaloneMode);
      } else {
        mediaQuery.removeListener?.(updateStandaloneMode);
      }
    };
  }, []);

  useEffect(() => {
    const syncNotificationPermission = () => {
      setNotificationPermission(getNotificationPermission());
    };

    window.addEventListener('focus', syncNotificationPermission);
    document.addEventListener('visibilitychange', syncNotificationPermission);

    return () => {
      window.removeEventListener('focus', syncNotificationPermission);
      document.removeEventListener('visibilitychange', syncNotificationPermission);
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    setPushReadiness({
      ...getPushSupportDetails(),
      hasServiceWorkerRegistration: false,
    });

    getServiceWorkerRegistration().then((registration) => {
      if (!isCancelled) {
        setPushReadiness({
          ...getPushSupportDetails(),
          hasServiceWorkerRegistration: Boolean(registration),
        });
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [pushStatusMessage]);

  useEffect(() => {
    let isCancelled = false;

    if (!isOnline) {
      setSupabaseStatus({
        message: '오프라인 모드',
        status: 'offline',
      });
      setSpotifyStatus({
        message: 'cached 데이터 사용 중',
        status: 'offline',
      });
      return undefined;
    }

    testSupabaseConnection().then((status) => {
      if (!isCancelled) {
        setSupabaseStatus(status);
      }
    });

    testSpotifyConnection().then((status) => {
      if (!isCancelled) {
        setSpotifyStatus(status);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [isOnline]);

  useEffect(() => {
    let isCancelled = false;

    getCalendarEvents(anonymousUserId).then((events) => {
      if (!isCancelled) {
        setCalendarItems(events);
      }
    });

    getHiddenNews(anonymousUserId).then((newsIds) => {
      if (!isCancelled) {
        setHiddenNewsItems(newsIds);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [anonymousUserId, calendarEvents, hiddenNewsIds]);

  useEffect(() => {
    let isCancelled = false;

    if (safeFollowedArtistIds.length === 0) {
      setArtistItems([]);
      setIsLoadingArtists(false);
      return undefined;
    }

    const cachedArtists = safeArtistSnapshots.filter(
      (artist) => safeFollowedArtistIds.includes(artist.id) || safeFollowedArtistIds.includes(artist.externalId),
    );

    if (cachedArtists.length > 0) {
      setArtistItems(cachedArtists);
    }

    if (!isOnline) {
      setIsLoadingArtists(false);
      return undefined;
    }

    setIsLoadingArtists(cachedArtists.length === 0);

    Promise.all(safeFollowedArtistIds.map((artistId) => getArtistById(artistId)))
      .then((artists) => {
        if (!isCancelled) {
          const nextArtists = artists.filter(Boolean);
          setArtistItems(nextArtists.length > 0 ? nextArtists : cachedArtists);
          setIsLoadingArtists(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setArtistItems([]);
          setIsLoadingArtists(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [followedArtistIdsKey, followedArtistSnapshotsKey, isOnline]);

  const followedArtists = useMemo(() => {
    const seenIds = new Set();

    return artistItems.filter((artist) => {
      const isFollowed = safeFollowedArtistIds.includes(artist.id) || safeFollowedArtistIds.includes(artist.externalId);

      if (!artist?.id || seenIds.has(artist.id) || !isFollowed) {
        return false;
      }

      seenIds.add(artist.id);
      return true;
    });
  }, [artistItems, safeFollowedArtistIds]);

  const followedArtistsWithSpotifyId = useMemo(
    () => followedArtists.filter((artist) => artist?.externalId || artist?.external_id),
    [followedArtists],
  );

  const notificationPermissionLabel = {
    granted: '허용됨',
    default: '대기 중',
    denied: '차단됨',
    unsupported: '미지원',
  }[notificationPermission] || notificationPermission;

  const pushReadinessLabel = (() => {
    if (!pushReadiness.hasVapidPublicKey) {
      return 'VAPID 공개키 없음';
    }

    if (!pushReadiness.isSecureContext) {
      return 'HTTPS 또는 localhost 필요';
    }

    if (!pushReadiness.hasServiceWorkerSupport || !pushReadiness.hasPushManagerSupport) {
      return 'Push 미지원';
    }

    if (!pushReadiness.hasServiceWorkerRegistration) {
      return '서비스 워커 대기 중';
    }

    return 'Push 준비됨';
  })();

  const requestAndEnableNotifications = async () => {
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);

    if (permission !== 'granted') {
      const nextMessage =
        permission === 'denied'
          ? '브라우저 설정에서 알림 차단을 해제해주세요.'
          : permission === 'unsupported'
            ? '이 브라우저에서는 알림을 지원하지 않아요.'
            : '알림 권한을 허용해야 푸시를 준비할 수 있어요.';

      setPushStatusMessage(nextMessage);
      setNotificationSettings((currentSettings) => ({
        ...getSafeNotificationSettings(currentSettings),
        enabled: false,
      }));
      return;
    }

    let nextPushStatusMessage = '로컬 알림이 켜졌어요.';

    if (isPushSupported()) {
      const subscription = await subscribeToPush({ forceRefresh: true });
      const savedSubscription = await savePushSubscription(subscription, anonymousUserId);

      if (savedSubscription) {
        nextPushStatusMessage = 'Web Push 구독이 저장됐어요.';
      } else if (subscription) {
        nextPushStatusMessage = '구독 저장 실패, 로컬 알림만 사용해요.';
      } else {
        nextPushStatusMessage = 'Web Push 구독을 만들 수 없어 로컬 알림만 사용해요.';
      }
    } else {
      nextPushStatusMessage = 'Web Push 준비 조건이 부족해 로컬 알림만 사용해요.';
      console.error('Web Push support check failed.', getPushSupportDetails());
    }

    setPushStatusMessage(nextPushStatusMessage);
    setNotificationSettings((currentSettings) => ({
      ...getSafeNotificationSettings(currentSettings),
      enabled: true,
    }));
  };

  const disableNotifications = async () => {
    const unsubscribedSubscription = await unsubscribeFromPush();

    if (unsubscribedSubscription?.endpoint) {
      await disablePushSubscription(unsubscribedSubscription.endpoint, anonymousUserId);
    }

    setPushStatusMessage('알림이 꺼졌어요.');
    setNotificationSettings((currentSettings) => ({
      ...getSafeNotificationSettings(currentSettings),
      enabled: false,
    }));
  };

  const handleNotificationEnabledClick = (event) => {
    event.preventDefault();

    if (safeNotificationSettings.enabled) {
      disableNotifications();
      return;
    }

    requestAndEnableNotifications();
  };

  const updateNotificationSetting = async (key, value) => {
    if (key === 'enabled') {
      if (value) {
        await requestAndEnableNotifications();
      } else {
        await disableNotifications();
      }

      return;
    }

    setNotificationSettings((currentSettings) => ({
      ...getSafeNotificationSettings(currentSettings),
      [key]: value,
    }));
  };

  const getNotificationDebugText = (result) => {
    const debug = result?.debug;

    if (!debug) {
      return '';
    }

    const inputArtistCount = debug.inputArtistCount ?? 0;
    const spotifyArtistCount = debug.resolvedSpotifyArtistCount ?? debug.spotifyArtistCount ?? 0;
    const successfulAlbumArtistCount = debug.successfulAlbumArtistCount ?? 0;
    const failedAlbumArtistCount = debug.failedAlbumArtistCount ?? 0;
    const albumNewsCount = debug.albumNewsCount ?? 0;
    const candidateCount = debug.candidateCount ?? 0;
    const firstAlbumFailureReason = debug.firstAlbumFailureReason || '';
    const failureText = firstAlbumFailureReason ? ` · 첫 실패 ${firstAlbumFailureReason}` : '';

    return `전체 ${inputArtistCount}명 · Spotify ID ${spotifyArtistCount}명 · 조회 성공 ${successfulAlbumArtistCount}명 · 조회 실패 ${failedAlbumArtistCount}명 · 앨범 ${albumNewsCount}개 · 후보 ${candidateCount}개${failureText}`;
  };

  const handleNewMusicNotificationTest = async () => {
    if (followedArtists.length === 0) {
      setNewMusicTestState({
        isLoading: false,
        message: 'Spotify 아티스트를 먼저 팔로우해주세요.',
        status: 'warning',
      });
      return;
    }

    if (import.meta.env?.DEV) {
      console.log('[GOYO push test] followed artists', {
        followedArtistCount: followedArtists.length,
        spotifyExternalIdArtistCount: followedArtistsWithSpotifyId.length,
        artists: followedArtists.map((artist) => ({
          id: artist.id,
          externalId: artist.externalId || artist.external_id,
          name: artist.name,
          source: artist.source,
        })),
      });
    }

    setNewMusicTestState({
      isLoading: true,
      message: '새 음악 알림을 확인하고 있어요.',
      status: 'loading',
    });

    const result = await checkNewMusicNotifications(anonymousUserId, followedArtists, {
      testMode: true,
    });
    const debugText = getNotificationDebugText(result);

    if (result?.sent && result?.newsItem) {
      setNewMusicTestState({
        isLoading: false,
        message: `${result.newsItem.artistName} - ${result.newsItem.title} 알림을 보냈어요.${debugText ? ` (${debugText})` : ''}`,
        status: 'success',
      });
      return;
    }

    if (result?.ok && !result?.sent) {
      const message =
        result.reason === 'already_notified'
          ? '이미 알림을 보낸 새 음악이에요. 중복 발송하지 않았어요.'
          : result.reason === 'no_recent_music'
            ? '앨범을 조회했지만 알림 후보가 없어요.'
            : '지금 새로 보낼 음악 알림이 없어요.';

      setNewMusicTestState({
        isLoading: false,
        message: `${message}${debugText ? ` (${debugText})` : ''}`,
        status: 'info',
      });
      return;
    }

    setNewMusicTestState({
      isLoading: false,
      message: `${result?.message || result?.error || '새 음악 알림 테스트에 실패했어요.'}${debugText ? ` (${debugText})` : ''}`,
      status: 'error',
    });
  };

  const handleReset = async () => {
    const confirmed = window.confirm('팔로우, 관심없음, 캘린더 데이터를 모두 초기화할까요?');

    if (!confirmed) {
      return;
    }

    try {
      await Promise.all([clearRemoteCalendarEvents(anonymousUserId), clearRemoteHiddenNews(anonymousUserId)]);
    } catch (error) {
      console.warn('Remote reset failed. Local data will still be cleared.', error);
    }

    clearFollowedArtistIds();
    clearFollowedArtistSnapshots();
    clearHiddenNewsIds();
    clearCalendarEvents();
    clearCachedNewsItems();
    clearCachedPreviewNews();
    clearNotifiedNewsIds();

    try {
      window.localStorage.removeItem('goyoSpotifyArtistCache');
      window.localStorage.removeItem('goyoSpotifyNewsCache');
      window.sessionStorage.removeItem('processedPreviewNewsIds');
      Object.keys(window.sessionStorage)
        .filter((key) => key.startsWith('processedPreviewNewsIds:'))
        .forEach((key) => window.sessionStorage.removeItem(key));
      window.sessionStorage.removeItem('goyoSplashSeen');
      window.sessionStorage.removeItem('goyoSpotifyArtistCache');
      window.sessionStorage.removeItem('goyoSpotifyNewsCache');
    } catch {
      // Cache cleanup is best-effort.
    }

    setArtistItems([]);
    setCalendarItems([]);
    setHiddenNewsItems([]);
    navigate('/onboarding', { replace: true });
  };

  return (
    <main className="page page-my" aria-label="my">
      <header className="my-header">
        <p className="app-kicker">MY</p>
        <h1>마이</h1>
        <p>관심 아티스트와 저장한 음악 일정을 한눈에 확인해요.</p>
      </header>

      <section className="my-stat-grid" aria-label="my summary">
        <article>
          <strong>{followedArtists.length}</strong>
          <span>팔로우</span>
        </article>
        <article>
          <strong>{safeCalendarEvents.length}</strong>
          <span>캘린더 일정</span>
        </article>
        <article>
          <strong>{safeHiddenNewsIds.length}</strong>
          <span>관심없음</span>
        </article>
      </section>

      <section className="my-section my-notification-section" aria-label="notification settings">
        <div className="my-section-header">
          <h2>알림 설정</h2>
          <span>{safeNotificationSettings.enabled ? '켜짐' : '꺼짐'}</span>
        </div>

        <div className="notification-setting-list">
          <label className="notification-setting-item">
            <span>
              <strong>알림 받기</strong>
              <small>
                {isNotificationSupported()
                  ? notificationPermission === 'denied'
                    ? '브라우저 설정에서 알림 차단을 해제해주세요.'
                    : '새 음악과 일정 소식을 조용히 알려드려요.'
                  : '이 브라우저는 알림을 지원하지 않아요.'}
              </small>
            </span>
            <input
              type="checkbox"
              checked={safeNotificationSettings.enabled}
              disabled={!isNotificationSupported() || notificationPermission === 'denied'}
              onClick={handleNotificationEnabledClick}
              onChange={() => {}}
            />
          </label>

          {[
            ['album', '앨범 발매 알림'],
            ['concert', '공연 소식 알림'],
            ['ticket', '티켓 오픈 알림'],
            ['festival', '페스티벌 알림'],
          ].map(([key, label]) => (
            <label className="notification-setting-item compact" key={key}>
              <span>{label}</span>
              <input
                type="checkbox"
                checked={Boolean(safeNotificationSettings[key])}
                disabled={!safeNotificationSettings.enabled}
                onChange={(event) => updateNotificationSetting(key, event.target.checked)}
              />
            </label>
          ))}
        </div>

        <div className="notification-permission-status" aria-label="notification permission status">
          <span>알림 권한: {notificationPermissionLabel}</span>
          <span>{isNotificationSecureContext() ? 'HTTPS/localhost 확인됨' : 'HTTPS 또는 localhost 필요'}</span>
          <span>{pushReadinessLabel}</span>
          <span>VAPID 오류가 보이면 알림을 OFF 후 ON 해주세요.</span>
        </div>

        {pushStatusMessage && <p className="notification-push-status">{pushStatusMessage}</p>}

        <div className="notification-dev-test">
          <button
            className="my-primary-button"
            type="button"
            disabled={newMusicTestState.isLoading}
            onClick={handleNewMusicNotificationTest}
          >
            {newMusicTestState.isLoading ? '확인 중...' : '새 음악 알림 테스트'}
          </button>
          <small>개발용 버튼이에요. 출시 전 숨길 수 있도록 분리해두었어요.</small>
          {newMusicTestState.message && (
            <p className={`notification-test-status is-${newMusicTestState.status}`}>
              {newMusicTestState.message}
            </p>
          )}
        </div>
      </section>

      <section className="my-section" aria-label="followed artists">
        <div className="my-section-header">
          <h2>팔로우 중인 아티스트</h2>
          <span>{followedArtists.length}명</span>
        </div>

        {isLoadingArtists ? (
          <div className="my-empty-card">
            <strong>아티스트를 불러오는 중이에요.</strong>
            <p>팔로우 중인 아티스트를 확인하고 있어요.</p>
          </div>
        ) : followedArtists.length > 0 ? (
          <div className="my-artist-list">
            {followedArtists.map((artist) => (
              <article className="my-artist-item" key={artist.id}>
                <ArtistAvatar artist={artist} />
                <div>
                  <strong>{artist.name}</strong>
                  <p>{(Array.isArray(artist.genres) ? artist.genres : []).join(' · ')}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="my-empty-card">
            <strong>아직 팔로우한 아티스트가 없어요.</strong>
            <p>관심 아티스트를 선택하면 홈과 캘린더가 더 조용히 정리돼요.</p>
          </div>
        )}
      </section>

      <section className="my-action-panel" aria-label="my actions">
        <button className="my-primary-button" type="button" onClick={() => navigate('/onboarding')}>
          관심 아티스트 수정
        </button>
        <button className="my-danger-button" type="button" onClick={handleReset}>
          전체 데이터 초기화
        </button>
      </section>

      {!isStandalone && (
        <p className="my-install-hint">홈 화면에 추가해 더 편하게 사용하세요.</p>
      )}

      <p className="my-version-label">GOYO v{GOYO_VERSION}</p>

      <p className={`my-supabase-status is-${isOnline ? supabaseStatus.status : 'offline'}`}>
        {isOnline ? `${supabaseStatus.message} / ${spotifyStatus.message}` : '오프라인 모드'}
      </p>
    </main>
  );
}
