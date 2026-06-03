import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

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
        'x-goyo-anonymous-id': anonymousUserId,
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
    const { error } = await supabase
      .from('artists')
      .select('id')
      .limit(1);

    if (error) {
      throw error;
    }

    return {
      configured: true,
      ok: true,
      status: 'connected',
      message: 'Supabase 연결됨',
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
