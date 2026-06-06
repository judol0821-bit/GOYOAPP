import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getArtistById } from '../api/artists.js';
import { clearCalendarEvents as clearRemoteCalendarEvents, getCalendarEvents } from '../api/calendar.js';
import { checkNewMusicNotifications } from '../api/notifications.js';
import { clearHiddenNews as clearRemoteHiddenNews, getHiddenNews } from '../api/preferences.js';
import {
  disableAllPushSubscriptions,
  disablePushSubscription,
  savePushSubscriptionWithResult,
} from '../api/push.js';
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
  getVapidPublicKey,
  getPushSupportDetails,
  getServiceWorkerRegistration,
  isPushSupported,
  refreshPushSubscription,
  unsubscribeFromPush,
  urlBase64ToUint8Array,
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
  const [isRefreshingPush, setIsRefreshingPush] = useState(false);
  const [webPushDebug, setWebPushDebug] = useState({
    isLoading: false,
    title: '아직 확인하지 않았어요.',
    status: 'idle',
    items: [],
  });
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
      return 'VAPID 공개키 없음 (VITE_VAPID_PUBLIC_KEY 미설정)';
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

  const getPermissionBlockedMessage = (permission) => {
    if (permission === 'denied') {
      return '브라우저 설정에서 알림 차단을 해제해주세요.';
    }

    if (permission === 'unsupported') {
      return '이 브라우저에서는 알림을 지원하지 않아요.';
    }

    return '알림 권한을 허용해야 푸시를 준비할 수 있어요.';
  };

  const createDebugRecorder = () => {
    const debugMap = new Map();

    const record = (label, value) => {
      const displayValue =
        value === undefined || value === null || value === ''
          ? '-'
          : typeof value === 'boolean'
            ? value
              ? '예'
              : '아니오'
            : String(value);

      debugMap.set(label, displayValue);
      console.log('[GOYO Web Push Debug]', label, value);
      return displayValue;
    };

    const toItems = () => Array.from(debugMap.entries()).map(([label, value]) => ({ label, value }));

    return { record, toItems };
  };

  const readSubscriptionDebug = (subscription) => {
    const json = typeof subscription?.toJSON === 'function' ? subscription.toJSON() : null;

    return {
      hasSubscription: Boolean(subscription),
      endpointPrefix: subscription?.endpoint ? subscription.endpoint.slice(0, 50) : '',
      hasP256dh: Boolean(json?.keys?.p256dh || subscription?.getKey?.('p256dh')),
      hasAuth: Boolean(json?.keys?.auth || subscription?.getKey?.('auth')),
    };
  };

  const collectWebPushDebug = async ({ title = '구독 상태 확인 완료' } = {}) => {
    const { record, toItems } = createDebugRecorder();
    const supportDetails = getPushSupportDetails();
    const vapidPublicKey = getVapidPublicKey();

    record('현재 URL', window.location.href);
    record('isSecureContext', window.isSecureContext);
    record('Notification 지원 여부', isNotificationSupported());
    record('Notification.permission', getNotificationPermission());
    record('Service Worker 지원 여부', supportDetails.hasServiceWorkerSupport);
    record('PushManager 지원 여부', supportDetails.hasPushManagerSupport);
    record('VITE_VAPID_PUBLIC_KEY 존재 여부', Boolean(vapidPublicKey));
    record('VAPID public key 길이', vapidPublicKey.length);
    record('anonymousUserId', anonymousUserId);
    record('x-goyo-anonymous-id 준비 여부', Boolean(anonymousUserId));
    record('pushManager.subscribe() 성공 여부', '아직 호출 안 함');
    record('savePushSubscription() 호출 여부', '아직 호출 안 함');
    record('Supabase insert/upsert 성공 여부', '아직 호출 안 함');
    record('Supabase error message', '-');

    try {
      const registration = await getServiceWorkerRegistration();
      record('Service Worker registration 성공 여부', Boolean(registration));
      record('Service Worker scope', registration?.scope || '-');

      if (!registration?.pushManager) {
        record('pushManager.getSubscription() 결과', 'registration 또는 pushManager 없음');
        record('subscription.endpoint 앞 50자', '-');

        return {
          title,
          status: 'warning',
          items: toItems(),
        };
      }

      const subscription = await registration.pushManager.getSubscription();
      const subscriptionDebug = readSubscriptionDebug(subscription);

      record('pushManager.getSubscription() 결과', subscriptionDebug.hasSubscription ? '구독 있음' : '구독 없음');
      record('subscription.endpoint 앞 50자', subscriptionDebug.endpointPrefix || '-');
      record('subscription p256dh 존재 여부', subscriptionDebug.hasP256dh);
      record('subscription auth 존재 여부', subscriptionDebug.hasAuth);

      return {
        title,
        status: 'success',
        items: toItems(),
      };
    } catch (error) {
      console.error('[GOYO Web Push Debug] status check failed', error);
      record('Service Worker registration 성공 여부', false);
      record('실패 원인', error?.message || error);

      return {
        title: '구독 상태 확인 실패',
        status: 'error',
        items: toItems(),
      };
    }
  };

  const handleCheckWebPushDebug = async () => {
    setWebPushDebug((current) => ({
      ...current,
      isLoading: true,
      title: '구독 상태 확인 중',
      status: 'loading',
    }));

    const result = await collectWebPushDebug();

    setWebPushDebug({
      ...result,
      isLoading: false,
    });
  };

  const handleForceWebPushResubscribe = async () => {
    const { record, toItems } = createDebugRecorder();

    setWebPushDebug({
      isLoading: true,
      title: '강제 재구독 중',
      status: 'loading',
      items: [],
    });

    try {
      const vapidPublicKey = getVapidPublicKey();

      record('현재 URL', window.location.href);
      record('isSecureContext', window.isSecureContext);
      record('Notification 지원 여부', isNotificationSupported());
      record('Notification.permission', getNotificationPermission());
      record('Service Worker 지원 여부', 'serviceWorker' in navigator);
      record('PushManager 지원 여부', 'PushManager' in window);
      record('VITE_VAPID_PUBLIC_KEY 존재 여부', Boolean(vapidPublicKey));
      record('VAPID public key 길이', vapidPublicKey.length);
      record('anonymousUserId', anonymousUserId);
      record('x-goyo-anonymous-id 준비 여부', Boolean(anonymousUserId));
      record('pushManager.subscribe() 성공 여부', '아직 호출 안 함');
      record('savePushSubscription() 호출 여부', '아직 호출 안 함');
      record('Supabase insert/upsert 성공 여부', '아직 호출 안 함');
      record('Supabase error message', '-');

      let permission = getNotificationPermission();

      if (permission !== 'granted') {
        permission = await requestNotificationPermission();
        setNotificationPermission(permission);
        record('Notification.permission 요청 후', permission);
      }

      if (permission !== 'granted') {
        throw new Error(getPermissionBlockedMessage(permission));
      }

      if (!vapidPublicKey) {
        throw new Error('VITE_VAPID_PUBLIC_KEY가 비어 있어요.');
      }

      const registration = await getServiceWorkerRegistration();
      record('Service Worker registration 성공 여부', Boolean(registration));
      record('Service Worker scope', registration?.scope || '-');

      if (!registration?.pushManager) {
        throw new Error('Service Worker registration 또는 PushManager를 찾을 수 없어요.');
      }

      const existingSubscription = await registration.pushManager.getSubscription();
      const existingDebug = readSubscriptionDebug(existingSubscription);

      record('pushManager.getSubscription() 결과', existingDebug.hasSubscription ? '기존 구독 있음' : '기존 구독 없음');
      record('기존 subscription.endpoint 앞 50자', existingDebug.endpointPrefix || '-');

      if (existingSubscription) {
        const unsubscribeResult = await existingSubscription.unsubscribe();
        record('기존 subscription.unsubscribe() 성공 여부', unsubscribeResult);
      } else {
        record('기존 subscription.unsubscribe() 성공 여부', '구독 없음');
      }

      const disableAllResult = await disableAllPushSubscriptions(anonymousUserId);
      record('Supabase 기존 enabled=false 성공 여부', disableAllResult.ok);

      if (!disableAllResult.ok) {
        record('Supabase error message', disableAllResult.message);
        throw new Error(`Supabase 기존 구독 비활성화 실패: ${disableAllResult.message}`);
      }

      const nextSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const nextDebug = readSubscriptionDebug(nextSubscription);

      record('pushManager.subscribe() 성공 여부', true);
      record('subscription.endpoint 앞 50자', nextDebug.endpointPrefix || '-');
      record('subscription p256dh 존재 여부', nextDebug.hasP256dh);
      record('subscription auth 존재 여부', nextDebug.hasAuth);
      record('savePushSubscription() 호출 여부', '예');

      const saveResult = await savePushSubscriptionWithResult(nextSubscription, anonymousUserId);
      record('Supabase insert/upsert 성공 여부', saveResult.ok);
      record('Supabase error message', saveResult.ok ? '-' : saveResult.message);
      record('Supabase subscription id', saveResult.data?.id || '-');

      if (!saveResult.ok) {
        throw new Error(`Supabase 저장 실패: ${saveResult.message}`);
      }

      setNotificationSettings((currentSettings) => ({
        ...getSafeNotificationSettings(currentSettings),
        enabled: true,
      }));
      setPushStatusMessage('강제 재구독 완료');
      setWebPushDebug({
        isLoading: false,
        title: '강제 재구독 완료',
        status: 'success',
        items: toItems(),
      });
    } catch (error) {
      console.error('[GOYO Web Push Debug] force resubscribe failed', error);
      record('실패 원인', error?.message || error);
      setPushStatusMessage(`강제 재구독 실패: ${error?.message || error}`);
      setWebPushDebug({
        isLoading: false,
        title: '강제 재구독 실패',
        status: 'error',
        items: toItems(),
      });
    }
  };

  const renewPushSubscription = async ({ successMessage = '구독 갱신 완료' } = {}) => {
    if (!isPushSupported()) {
      const supportDetails = getPushSupportDetails();
      console.error('Web Push support check failed.', supportDetails);

      return {
        ok: false,
        message: !supportDetails.hasVapidPublicKey
          ? '구독 생성 실패: VITE_VAPID_PUBLIC_KEY가 없어요.'
          : !supportDetails.isSecureContext
            ? '구독 생성 실패: HTTPS 환경이 필요해요.'
            : '구독 생성 실패: 이 브라우저는 Web Push를 지원하지 않아요.',
      };
    }

    setIsRefreshingPush(true);

    try {
      const refreshResult = await refreshPushSubscription({
        beforeSubscribe: async ({ previousEndpoint }) => {
          const disableAllResult = await disableAllPushSubscriptions(anonymousUserId);

          if (!disableAllResult.ok) {
            throw new Error(`Supabase 기존 구독 비활성화 실패: ${disableAllResult.message}`);
          }

          if (previousEndpoint) {
            await disablePushSubscription(previousEndpoint, anonymousUserId);
          }
        },
      });

      if (!refreshResult.ok || !refreshResult.subscription) {
        return {
          ok: false,
          message: `구독 생성 실패: ${refreshResult.message}`,
        };
      }

      const saveResult = await savePushSubscriptionWithResult(refreshResult.subscription, anonymousUserId);

      if (!saveResult.ok) {
        return {
          ok: false,
          message: `Supabase 저장 실패: ${saveResult.message}`,
        };
      }

      return {
        ok: true,
        message: successMessage,
        previousEndpoint: refreshResult.previousEndpoint,
        endpoint: saveResult.endpoint,
      };
    } catch (error) {
      console.error('Push subscription renewal failed.', error);

      return {
        ok: false,
        message: error?.message || '구독 갱신에 실패했어요.',
      };
    } finally {
      setIsRefreshingPush(false);
    }
  };

  const requestAndEnableNotifications = async () => {
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);

    if (permission !== 'granted') {
      setPushStatusMessage(getPermissionBlockedMessage(permission));
      setNotificationSettings((currentSettings) => ({
        ...getSafeNotificationSettings(currentSettings),
        enabled: false,
      }));
      return;
    }

    const renewResult = await renewPushSubscription({
      successMessage: 'Web Push 구독이 저장됐어요.',
    });

    setPushStatusMessage(renewResult.message);
    setNotificationSettings((currentSettings) => ({
      ...getSafeNotificationSettings(currentSettings),
      enabled: renewResult.ok,
    }));
  };

  const disableNotifications = async () => {
    const unsubscribedSubscription = await unsubscribeFromPush();
    const disableAllResult = await disableAllPushSubscriptions(anonymousUserId);

    if (unsubscribedSubscription?.endpoint) {
      await disablePushSubscription(unsubscribedSubscription.endpoint, anonymousUserId);
    }

    setPushStatusMessage(
      disableAllResult.ok
        ? '알림이 꺼졌어요. 브라우저 구독과 서버 구독을 정리했어요.'
        : `알림은 꺼졌지만 서버 구독 정리에 실패했어요: ${disableAllResult.message}`,
    );
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

  const handleRefreshPushSubscription = async () => {
    let permission = getNotificationPermission();

    if (permission !== 'granted') {
      permission = await requestNotificationPermission();
      setNotificationPermission(permission);
    }

    if (permission !== 'granted') {
      setPushStatusMessage(getPermissionBlockedMessage(permission));
      return;
    }

    const renewResult = await renewPushSubscription({
      successMessage: '구독 갱신 완료',
    });

    setPushStatusMessage(renewResult.message);

    if (renewResult.ok) {
      setNotificationSettings((currentSettings) => ({
        ...getSafeNotificationSettings(currentSettings),
        enabled: true,
      }));
    }
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

        <div className="notification-refresh-actions">
          <button
            className="notification-refresh-button"
            type="button"
            disabled={isRefreshingPush || notificationPermission === 'denied'}
            onClick={handleRefreshPushSubscription}
          >
            {isRefreshingPush ? '갱신 중...' : '구독 갱신'}
          </button>
          <small>만료된 푸시 구독은 갱신하면 새 구독으로 다시 저장돼요.</small>
        </div>

        {/* Development-only Web Push diagnostics. Hide this block before a public launch if needed. */}
        <div className={`web-push-debug-panel is-${webPushDebug.status}`}>
          <div className="web-push-debug-header">
            <div>
              <strong>Web Push Debug</strong>
              <small>{webPushDebug.title}</small>
            </div>
            <span>{webPushDebug.isLoading ? '확인 중' : 'DEV'}</span>
          </div>

          <div className="web-push-debug-actions">
            <button type="button" disabled={webPushDebug.isLoading} onClick={handleCheckWebPushDebug}>
              구독 상태 확인
            </button>
            <button type="button" disabled={webPushDebug.isLoading} onClick={handleForceWebPushResubscribe}>
              강제 재구독
            </button>
          </div>

          {webPushDebug.items.length > 0 && (
            <dl className="web-push-debug-list">
              {webPushDebug.items.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

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
