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
