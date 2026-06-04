import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase.js';
import { isBrowserOffline } from '../utils/network.js';
import { isUuid, mapHiddenNewsFromSupabase } from './mappers.js';

const HIDDEN_NEWS_IDS_KEY = 'hiddenNewsIds';

const readLocalHiddenNewsIds = () => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const value = JSON.parse(window.localStorage.getItem(HIDDEN_NEWS_IDS_KEY) || '[]');
    return Array.isArray(value) ? value.filter(Boolean) : [];
  } catch {
    return [];
  }
};

const writeLocalHiddenNewsIds = (newsIds) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(HIDDEN_NEWS_IDS_KEY, JSON.stringify([...new Set(newsIds.filter(Boolean))]));
};

export async function getHiddenNews(anonymousUserId) {
  if (!isBrowserOffline() && isSupabaseConfigured() && anonymousUserId) {
    try {
      const client = getSupabaseClient(anonymousUserId);
      const { data, error } = await client
        .from('hidden_news')
        .select('id, news_id, anonymous_user_id, created_at')
        .eq('anonymous_user_id', anonymousUserId);

      if (error) {
        throw error;
      }

      return [
        ...new Set([
          ...(data || []).map(mapHiddenNewsFromSupabase).map((item) => item.newsId).filter(Boolean),
          ...readLocalHiddenNewsIds(),
        ]),
      ];
    } catch (error) {
      console.error('Failed to load Supabase hidden news.', error);
    }
  }

  return readLocalHiddenNewsIds();
}

export async function hideNews(anonymousUserId, newsId) {
  if (!newsId) {
    return readLocalHiddenNewsIds();
  }

  if (!isBrowserOffline() && isSupabaseConfigured() && anonymousUserId && isUuid(newsId)) {
    try {
      const client = getSupabaseClient(anonymousUserId);
      const { error } = await client
        .from('hidden_news')
        .insert({
          anonymous_user_id: anonymousUserId,
          news_id: newsId,
        });

      if (error) {
        const currentHiddenNewsIds = await getHiddenNews(anonymousUserId);

        if (currentHiddenNewsIds.includes(newsId)) {
          return currentHiddenNewsIds;
        }

        throw error;
      }

      return getHiddenNews(anonymousUserId);
    } catch (error) {
      console.error('Failed to hide Supabase news.', error);
    }
  }

  const nextHiddenNewsIds = [...new Set([...readLocalHiddenNewsIds(), newsId])];
  writeLocalHiddenNewsIds(nextHiddenNewsIds);

  return nextHiddenNewsIds;
}

export async function removeHiddenNews(anonymousUserId, newsId) {
  if (!newsId) {
    return false;
  }

  if (!isBrowserOffline() && isSupabaseConfigured() && anonymousUserId && isUuid(newsId)) {
    try {
      const client = getSupabaseClient(anonymousUserId);
      const { error } = await client
        .from('hidden_news')
        .delete()
        .eq('anonymous_user_id', anonymousUserId)
        .eq('news_id', newsId);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Failed to remove Supabase hidden news.', error);
    }
  }

  const nextHiddenNewsIds = readLocalHiddenNewsIds().filter((currentNewsId) => currentNewsId !== newsId);
  writeLocalHiddenNewsIds(nextHiddenNewsIds);

  return true;
}

export async function clearHiddenNews(anonymousUserId) {
  if (!isBrowserOffline() && isSupabaseConfigured() && anonymousUserId) {
    try {
      const client = getSupabaseClient(anonymousUserId);
      const { error } = await client
        .from('hidden_news')
        .delete()
        .eq('anonymous_user_id', anonymousUserId);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Failed to clear Supabase hidden news.', error);
    }
  }

  writeLocalHiddenNewsIds([]);
  return [];
}
