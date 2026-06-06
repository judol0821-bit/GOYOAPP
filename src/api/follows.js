import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase.js';
import { getSafeArtistSnapshots } from '../utils/artistSnapshots.js';
import { isBrowserOffline } from '../utils/network.js';

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');

const toFollowPayload = (anonymousUserId, artist) => ({
  anonymous_user_id: anonymousUserId,
  artist_id: normalizeText(artist.id),
  external_id: normalizeText(artist.externalId || artist.external_id),
  name: normalizeText(artist.name) || '아티스트',
  image_url: normalizeText(artist.imageUrl || artist.image_url),
  genres: Array.isArray(artist.genres) ? artist.genres.filter(Boolean) : [],
  source: normalizeText(artist.source) || 'manual',
  enabled: true,
  updated_at: new Date().toISOString(),
});

export const syncFollowedArtistSnapshots = async (anonymousUserId, snapshots) => {
  const safeAnonymousUserId = normalizeText(anonymousUserId);
  const safeSnapshots = getSafeArtistSnapshots(snapshots);

  if (!safeAnonymousUserId || !isSupabaseConfigured() || isBrowserOffline()) {
    return {
      ok: false,
      syncedCount: 0,
      message: '팔로우 동기화를 건너뛰었어요.',
    };
  }

  try {
    const client = getSupabaseClient(safeAnonymousUserId);
    const now = new Date().toISOString();
    const { error: disableError } = await client
      .from('anonymous_artist_follows')
      .update({
        enabled: false,
        updated_at: now,
      })
      .eq('anonymous_user_id', safeAnonymousUserId)
      .eq('enabled', true);

    if (disableError) {
      throw disableError;
    }

    if (safeSnapshots.length === 0) {
      return {
        ok: true,
        syncedCount: 0,
        message: '팔로우 동기화 완료',
      };
    }

    const payload = safeSnapshots.map((artist) => toFollowPayload(safeAnonymousUserId, artist));
    const { error: upsertError } = await client
      .from('anonymous_artist_follows')
      .upsert(payload, { onConflict: 'anonymous_user_id,artist_id' });

    if (upsertError) {
      throw upsertError;
    }

    return {
      ok: true,
      syncedCount: payload.length,
      message: '팔로우 동기화 완료',
    };
  } catch (error) {
    console.warn('Failed to sync followed artists for automatic notifications.', error);

    return {
      ok: false,
      syncedCount: 0,
      message: error?.message || '팔로우 동기화 실패',
      error,
    };
  }
};

export const clearRemoteFollowedArtists = async (anonymousUserId) => {
  const safeAnonymousUserId = normalizeText(anonymousUserId);

  if (!safeAnonymousUserId || !isSupabaseConfigured() || isBrowserOffline()) {
    return false;
  }

  try {
    const client = getSupabaseClient(safeAnonymousUserId);
    const { error } = await client
      .from('anonymous_artist_follows')
      .update({
        enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq('anonymous_user_id', safeAnonymousUserId)
      .eq('enabled', true);

    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    console.warn('Failed to clear remote followed artists.', error);
    return false;
  }
};
