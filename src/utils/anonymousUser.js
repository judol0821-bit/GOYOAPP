const ANONYMOUS_USER_ID_KEY = 'anonymousUserId';

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const getAnonymousUserId = () => {
  if (typeof window === 'undefined') {
    return createId();
  }

  const existingId = window.localStorage.getItem(ANONYMOUS_USER_ID_KEY)?.trim();

  if (existingId) {
    window.localStorage.setItem(ANONYMOUS_USER_ID_KEY, existingId);
    return existingId;
  }

  const nextId = createId();
  window.localStorage.setItem(ANONYMOUS_USER_ID_KEY, nextId);

  return nextId;
};
