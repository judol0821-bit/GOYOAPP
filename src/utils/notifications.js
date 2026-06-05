export const isNotificationSupported = () => {
  return typeof window !== 'undefined' && 'Notification' in window;
};

export const isNotificationSecureContext = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  const hostname = window.location?.hostname || '';
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

  return Boolean(window.isSecureContext || isLocalhost);
};

export const getNotificationPermission = () => {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }

  return window.Notification.permission;
};

export const requestNotificationPermission = async () => {
  if (!isNotificationSupported()) {
    console.error('Notification permission request failed: Notification API is not supported.');
    return 'unsupported';
  }

  if (!isNotificationSecureContext()) {
    console.error('Notification permission request failed: HTTPS or localhost is required.', {
      href: window.location?.href,
      isSecureContext: window.isSecureContext,
    });
    return window.Notification.permission;
  }

  if (window.Notification.permission === 'denied') {
    console.error('Notification permission request skipped: permission is already denied.');
    return 'denied';
  }

  if (window.Notification.permission === 'granted') {
    return 'granted';
  }

  try {
    return await new Promise((resolve) => {
      const permissionRequest = window.Notification.requestPermission((permission) => {
        resolve(permission);
      });

      if (permissionRequest?.then) {
        permissionRequest.then(resolve).catch((error) => {
          console.error('Notification permission promise rejected.', error);
          resolve(window.Notification.permission);
        });
      }
    });
  } catch (error) {
    console.error('Notification permission request failed.', error);
    return window.Notification.permission;
  }
};

export const showLocalNotification = async (title, options = {}) => {
  if (!isNotificationSupported() || getNotificationPermission() !== 'granted') {
    return false;
  }

  const notificationOptions = {
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    ...options,
  };

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready.catch(() => null);

      if (registration?.showNotification) {
        await registration.showNotification(title, notificationOptions);
        return true;
      }
    }

    new window.Notification(title, notificationOptions);
    return true;
  } catch (error) {
    console.warn('Local notification failed.', error);
    return false;
  }
};
