import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const ANONYMOUS_ID_HEADER = 'x-goyo-anonymous-id';

export const isSupabaseConfigured = () => Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const getSupabaseClient = (anonymousUserId) => {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!anonymousUserId) {
    return supabase;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        [ANONYMOUS_ID_HEADER]: anonymousUserId,
      },
    },
  });
};

export const testSupabaseConnection = async () => {
  if (!isSupabaseConfigured()) {
    return {
      configured: false,
      ok: false,
      status: 'not_configured',
      message: 'Supabase 미설정, mock data 사용 중',
    };
  }

  try {
    const { count: artistCount, error: artistError } = await supabase
      .from('artists')
      .select('id', { count: 'exact', head: true })
      .limit(1);

    if (artistError) {
      throw artistError;
    }

    const { count: newsCount, error: newsError } = await supabase
      .from('news_items')
      .select('id', { count: 'exact', head: true })
      .limit(1);

    if (newsError) {
      throw newsError;
    }

    return {
      configured: true,
      ok: true,
      status: 'connected',
      message: 'Supabase 연결됨',
      counts: {
        artists: artistCount ?? 0,
        newsItems: newsCount ?? 0,
      },
    };
  } catch (error) {
    console.error('Supabase connection test failed.', error);

    return {
      configured: true,
      ok: false,
      status: 'error',
      message: 'Supabase 오류, fallback 사용 중',
      error,
    };
  }
};
