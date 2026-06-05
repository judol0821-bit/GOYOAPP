import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase.js';
import { getServiceWorkerRegistration } from '../utils/webPush.js';

const arrayBufferToBase64Url = (buffer) => {
  if (!buffer) {
    return '';
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const serializeSubscription = (subscription) => {
  if (!subscription) {
    return null;
  }

  const json = typeof subscription.toJSON === 'function' ? subscription.toJSON() : {};
  const endpoint = json.endpoint || subscription.endpoint || '';
  const p256dh = json.keys?.p256dh || arrayBufferToBase64Url(subscription.getKey?.('p256dh'));
  const auth = json.keys?.auth || arrayBufferToBase64Url(subscription.getKey?.('auth'));

  if (!endpoint || !p256dh || !auth) {
    return null;
  }

  return { endpoint, p256dh, auth };
};

export const getPushSubscription = async () => {
  if (typeof window === 'undefined' || !('PushManager' in window)) {
    return null;
  }

  try {
    const registration = await getServiceWorkerRegistration();
    return registration?.pushManager?.getSubscription?.() || null;
  } catch (error) {
    console.error('Failed to read current push subscription.', error);
    return null;
  }
};

export const savePushSubscription = async (subscription, anonymousUserId) => {
  const serializedSubscription = serializeSubscription(subscription);

  if (!serializedSubscription || !anonymousUserId || !isSupabaseConfigured()) {
    console.error('Push subscription save skipped: missing subscription, anonymous user id, or Supabase config.', {
      hasSerializedSubscription: Boolean(serializedSubscription),
      hasAnonymousUserId: Boolean(anonymousUserId),
      isSupabaseConfigured: isSupabaseConfigured(),
    });
    return null;
  }

  try {
    const client = getSupabaseClient(anonymousUserId);
    const now = new Date().toISOString();
    const payload = {
      anonymous_user_id: anonymousUserId,
      endpoint: serializedSubscription.endpoint,
      p256dh: serializedSubscription.p256dh,
      auth: serializedSubscription.auth,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      enabled: true,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await client
      .from('push_subscriptions')
      .upsert(payload, { onConflict: 'endpoint' })
      .select('id, anonymous_user_id, endpoint, enabled, created_at, updated_at')
      .maybeSingle();

    if (error) {
      throw error;
    }

    const { error: disableOldError } = await client
      .from('push_subscriptions')
      .update({
        enabled: false,
        updated_at: now,
      })
      .eq('anonymous_user_id', anonymousUserId)
      .neq('endpoint', serializedSubscription.endpoint);

    if (disableOldError) {
      console.error('Failed to disable old push subscriptions.', disableOldError);
    }

    return data;
  } catch (error) {
    console.error('Failed to save push subscription.', error);
    return null;
  }
};

export const disablePushSubscription = async (endpoint, anonymousUserId) => {
  if (!endpoint || !anonymousUserId || !isSupabaseConfigured()) {
    return false;
  }

  try {
    const client = getSupabaseClient(anonymousUserId);
    const { error } = await client
      .from('push_subscriptions')
      .update({
        enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq('endpoint', endpoint)
      .eq('anonymous_user_id', anonymousUserId);

    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    console.error('Failed to disable push subscription.', error);
    return false;
  }
};
