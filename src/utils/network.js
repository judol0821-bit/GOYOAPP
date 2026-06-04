export const isBrowserOffline = () => {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return navigator.onLine === false;
};
