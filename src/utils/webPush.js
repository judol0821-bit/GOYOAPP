const VAPID_PUBLIC_KEY_STORAGE_KEY = 'goyoPushVapidPublicKey';

export const getVapidPublicKey = () => (import.meta.env.VITE_VAPID_PUBLIC_KEY || '').trim();

const hasServiceWorkerSupport = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

const hasPushManagerSupport = () => typeof window !== 'undefined' && 'PushManager' in window;

const isLocalDevelopmentHost = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  const hostname = window.location?.hostname || '';
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
};

export const hasVapidPublicKey = () => Boolean(getVapidPublicKey());

export const isPushSecureContext = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return Boolean(window.isSecureContext || isLocalDevelopmentHost());
};

export const getPushSupportDetails = () => ({
  hasServiceWorkerSupport: hasServiceWorkerSupport(),
  hasPushManagerSupport: hasPushManagerSupport(),
  hasVapidPublicKey: hasVapidPublicKey(),
  isSecureContext: isPushSecureContext(),
});

export const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
};

const arrayBufferToBase64Url = (buffer) => {
  if (!buffer) {
    return '';
  }

  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const readStoredVapidPublicKey = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(VAPID_PUBLIC_KEY_STORAGE_KEY) || '';
};

const writeStoredVapidPublicKey = (publicKey) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (publicKey) {
    window.localStorage.setItem(VAPID_PUBLIC_KEY_STORAGE_KEY, publicKey);
    return;
  }

  window.localStorage.removeItem(VAPID_PUBLIC_KEY_STORAGE_KEY);
};

const getSubscriptionApplicationServerKey = (subscription) => {
  const applicationServerKey = subscription?.options?.applicationServerKey;
  return applicationServerKey ? arrayBufferToBase64Url(applicationServerKey) : '';
};

const shouldReplaceSubscriptionForVapidKey = (subscription, currentPublicKey) => {
  const storedPublicKey = readStoredVapidPublicKey();
  const subscriptionPublicKey = getSubscriptionApplicationServerKey(subscription);

  if (subscriptionPublicKey && subscriptionPublicKey !== currentPublicKey) {
    return true;
  }

  if (storedPublicKey && storedPublicKey !== currentPublicKey) {
    return true;
  }

  if (!storedPublicKey && !subscriptionPublicKey) {
    return true;
  }

  return false;
};

export const isPushSupported = () =>
  hasServiceWorkerSupport() && hasPushManagerSupport() && hasVapidPublicKey() && isPushSecureContext();

export const getServiceWorkerRegistration = async () => {
  if (!hasServiceWorkerSupport()) {
    return null;
  }

  try {
    const existingRegistration = await navigator.serviceWorker.getRegistration();

    if (existingRegistration) {
      return existingRegistration;
    }

    if (import.meta.env.DEV && hasVapidPublicKey()) {
      return await navigator.serviceWorker.register('/sw-push-listener.js', { scope: '/' });
    }

    const readyRegistration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => {
        window.setTimeout(() => resolve(null), 2500);
      }),
    ]);

    return readyRegistration || null;
  } catch (error) {
    console.warn('Failed to get service worker registration for push.', error);
    return null;
  }
};

export const subscribeToPush = async ({ forceRefresh = false } = {}) => {
  if (!isPushSupported()) {
    console.error('Web Push subscribe skipped: required support is missing.', getPushSupportDetails());
    return null;
  }

  try {
    const registration = await getServiceWorkerRegistration();

    if (!registration?.pushManager) {
      console.error('Web Push subscribe failed: service worker registration or PushManager is missing.', {
        hasRegistration: Boolean(registration),
        hasPushManager: Boolean(registration?.pushManager),
      });
      return null;
    }

    const currentPublicKey = getVapidPublicKey();
    const existingSubscription = await registration.pushManager.getSubscription();

    if (existingSubscription) {
      const shouldReplace = forceRefresh || shouldReplaceSubscriptionForVapidKey(existingSubscription, currentPublicKey);

      if (!shouldReplace) {
        writeStoredVapidPublicKey(currentPublicKey);
        return existingSubscription;
      }

      console.warn('Replacing existing Web Push subscription because VAPID key changed or refresh was requested.', {
        forceRefresh,
        hasStoredVapidPublicKey: Boolean(readStoredVapidPublicKey()),
        hasSubscriptionApplicationServerKey: Boolean(getSubscriptionApplicationServerKey(existingSubscription)),
      });

      await existingSubscription.unsubscribe();
      writeStoredVapidPublicKey('');
    }

    const nextSubscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(currentPublicKey),
    });

    writeStoredVapidPublicKey(currentPublicKey);

    return nextSubscription;
  } catch (error) {
    console.error('Failed to subscribe to Web Push.', error);
    return null;
  }
};

export const refreshPushSubscription = async ({ beforeSubscribe } = {}) => {
  if (!isPushSupported()) {
    const supportDetails = getPushSupportDetails();
    console.error('Web Push refresh skipped: required support is missing.', supportDetails);

    return {
      ok: false,
      subscription: null,
      previousEndpoint: '',
      hadExistingSubscription: false,
      unsubscribedExisting: false,
      message: !supportDetails.hasVapidPublicKey
        ? 'VITE_VAPID_PUBLIC_KEY가 설정되지 않았어요.'
        : !supportDetails.isSecureContext
          ? 'HTTPS 또는 localhost에서만 Web Push를 사용할 수 있어요.'
          : '이 브라우저에서는 Web Push를 사용할 수 없어요.',
      details: supportDetails,
    };
  }

  try {
    const registration = await getServiceWorkerRegistration();

    if (!registration?.pushManager) {
      return {
        ok: false,
        subscription: null,
        previousEndpoint: '',
        hadExistingSubscription: false,
        unsubscribedExisting: false,
        message: 'Service Worker 또는 PushManager를 찾을 수 없어요.',
      };
    }

    const currentPublicKey = getVapidPublicKey();
    const existingSubscription = await registration.pushManager.getSubscription();
    const previousEndpoint = existingSubscription?.endpoint || '';
    let unsubscribedExisting = false;

    if (existingSubscription) {
      console.log('Refreshing Web Push subscription: existing subscription found.', {
        endpointPrefix: previousEndpoint.slice(0, 40),
        hasStoredVapidPublicKey: Boolean(readStoredVapidPublicKey()),
        hasSubscriptionApplicationServerKey: Boolean(getSubscriptionApplicationServerKey(existingSubscription)),
      });

      unsubscribedExisting = await existingSubscription.unsubscribe();
      writeStoredVapidPublicKey('');
    }

    const remainingSubscription = await registration.pushManager.getSubscription();

    if (remainingSubscription) {
      console.error('Web Push refresh failed: existing subscription is still active after unsubscribe.', {
        endpointPrefix: remainingSubscription.endpoint?.slice(0, 40),
        unsubscribedExisting,
      });

      return {
        ok: false,
        subscription: null,
        previousEndpoint,
        hadExistingSubscription: Boolean(existingSubscription),
        unsubscribedExisting,
        message: '기존 브라우저 구독을 해제하지 못했어요.',
      };
    }

    if (typeof beforeSubscribe === 'function') {
      await beforeSubscribe({
        previousEndpoint,
        hadExistingSubscription: Boolean(existingSubscription),
        unsubscribedExisting,
      });
    }

    const nextSubscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(currentPublicKey),
    });

    writeStoredVapidPublicKey(currentPublicKey);

    console.log('Web Push subscription refreshed.', {
      previousEndpointPrefix: previousEndpoint.slice(0, 40),
      nextEndpointPrefix: nextSubscription.endpoint?.slice(0, 40),
      hadExistingSubscription: Boolean(existingSubscription),
      unsubscribedExisting,
    });

    return {
      ok: true,
      subscription: nextSubscription,
      previousEndpoint,
      hadExistingSubscription: Boolean(existingSubscription),
      unsubscribedExisting,
      message: '구독 갱신 완료',
    };
  } catch (error) {
    console.error('Failed to refresh Web Push subscription.', error);

    return {
      ok: false,
      subscription: null,
      previousEndpoint: '',
      hadExistingSubscription: false,
      unsubscribedExisting: false,
      message: error?.message || 'Web Push 구독 갱신에 실패했어요.',
      error,
    };
  }
};

export const unsubscribeFromPush = async () => {
  if (!hasServiceWorkerSupport() || !hasPushManagerSupport()) {
    return null;
  }

  try {
    const registration = await getServiceWorkerRegistration();
    const subscription = await registration?.pushManager?.getSubscription();

    if (!subscription) {
      return null;
    }

    const { endpoint } = subscription;
    await subscription.unsubscribe();
    writeStoredVapidPublicKey('');

    return { endpoint };
  } catch (error) {
    console.error('Failed to unsubscribe from Web Push.', error);
    return null;
  }
};
