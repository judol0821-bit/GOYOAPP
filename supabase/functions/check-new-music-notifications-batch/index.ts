// GOYO scheduled new music notification batch runner.
//
// This function intentionally reuses check-new-music-notifications for the
// per-user notification logic. Keep this batch thin: select users, load their
// server-synced followed artists, apply limits, and invoke the single-user
// engine sequentially.
//
// Deploy:
// npx.cmd supabase functions deploy check-new-music-notifications-batch --project-ref skspszkqmkeekhnerfss

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type FollowRow = {
  artist_id?: string;
  external_id?: string;
  name?: string;
  image_url?: string;
  genres?: string[];
  source?: string;
};

type BatchResult = {
  anonymousUserId: string;
  status: 'sent' | 'skipped' | 'rate_limited' | 'failed' | 'dry_run';
  artistCount: number;
  reason?: string;
  message?: string;
  responseStatus?: number;
  sent?: boolean;
  retryAfter?: string;
  usedServerAlbumCache?: boolean;
  usedStaleServerAlbumCache?: boolean;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-goyo-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(parsedValue), min), max);
};

const getEnvNumber = (key: string, fallback: number, min: number, max: number) => {
  return clampNumber(Deno.env.get(key), fallback, min, max);
};

const getUniqueUserIds = (rows: Array<{ anonymous_user_id?: string }>, limit: number) => {
  const userIds: string[] = [];
  const seenUserIds = new Set<string>();

  rows.forEach((row) => {
    const anonymousUserId = normalizeText(row.anonymous_user_id);

    if (!anonymousUserId || seenUserIds.has(anonymousUserId) || userIds.length >= limit) {
      return;
    }

    seenUserIds.add(anonymousUserId);
    userIds.push(anonymousUserId);
  });

  return userIds;
};

const mapFollowRowToArtist = (row: FollowRow) => ({
  id: normalizeText(row.artist_id),
  externalId: normalizeText(row.external_id),
  external_id: normalizeText(row.external_id),
  name: normalizeText(row.name),
  imageUrl: normalizeText(row.image_url),
  genres: Array.isArray(row.genres) ? row.genres.filter(Boolean) : [],
  source: normalizeText(row.source) || 'spotify',
});

const parseJsonResponse = async (response: Response) => {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed', message: 'POST only' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const cronSecret = Deno.env.get('GOYO_CRON_SECRET') || '';
  const providedCronSecret = request.headers.get('x-goyo-cron-secret') || '';

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      {
        error: 'missing_secret',
        message: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.',
      },
      500,
    );
  }

  if (cronSecret && providedCronSecret !== cronSecret) {
    return jsonResponse(
      {
        error: 'unauthorized_cron',
        message: 'x-goyo-cron-secret does not match GOYO_CRON_SECRET.',
      },
      401,
    );
  }

  let body: Record<string, unknown> = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const userLimit = clampNumber(body.limit, getEnvNumber('GOYO_BATCH_USER_LIMIT', 20, 1, 100), 1, 100);
  const artistLimit = clampNumber(body.artistLimit, getEnvNumber('GOYO_BATCH_ARTIST_LIMIT', 2, 1, 5), 1, 5);
  const sendLimit = clampNumber(body.sendLimit, getEnvNumber('GOYO_BATCH_SEND_LIMIT', 5, 1, 50), 1, 50);
  const dryRun = body.dryRun === true;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: subscriptionRows, error: subscriptionError } = await supabase
    .from('push_subscriptions')
    .select('anonymous_user_id, created_at')
    .eq('enabled', true)
    .order('created_at', { ascending: false })
    .limit(userLimit * 4);

  if (subscriptionError) {
    return jsonResponse(
      {
        error: 'subscription_query_failed',
        message: subscriptionError.message,
      },
      500,
    );
  }

  const userIds = getUniqueUserIds(subscriptionRows || [], userLimit);
  const results: BatchResult[] = [];
  let sentCount = 0;
  let rateLimited = false;
  let retryAfter = '';

  for (const anonymousUserId of userIds) {
    if (sentCount >= sendLimit || rateLimited) {
      break;
    }

    const { data: followRows, error: followError } = await supabase
      .from('anonymous_artist_follows')
      .select('artist_id, external_id, name, image_url, genres, source, updated_at')
      .eq('anonymous_user_id', anonymousUserId)
      .eq('enabled', true)
      .eq('source', 'spotify')
      .neq('external_id', '')
      .order('updated_at', { ascending: false })
      .limit(artistLimit);

    if (followError) {
      results.push({
        anonymousUserId,
        status: 'failed',
        artistCount: 0,
        reason: 'follow_query_failed',
        message: followError.message,
      });
      continue;
    }

    const artists = (followRows || []).map(mapFollowRowToArtist).filter((artist) => artist.externalId);

    if (artists.length === 0) {
      results.push({
        anonymousUserId,
        status: 'skipped',
        artistCount: 0,
        reason: 'no_spotify_follows',
      });
      continue;
    }

    if (dryRun) {
      results.push({
        anonymousUserId,
        status: 'dry_run',
        artistCount: artists.length,
        reason: 'dry_run',
      });
      continue;
    }

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/check-new-music-notifications`, {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          anonymousUserId,
          artists,
          testMode: false,
        }),
      });
      const payload = await parseJsonResponse(response);
      const reason = normalizeText(payload?.reason || payload?.error);

      if (reason === 'spotify_rate_limited') {
        rateLimited = true;
        retryAfter = normalizeText(payload?.retryAfter || payload?.debug?.retryAfter);
        results.push({
          anonymousUserId,
          status: 'rate_limited',
          artistCount: artists.length,
          reason,
          message: normalizeText(payload?.message) || 'Spotify 요청이 많아 잠시 후 다시 시도해주세요.',
          responseStatus: response.status,
          sent: false,
          retryAfter,
          usedServerAlbumCache: Boolean(payload?.debug?.usedServerAlbumCache),
          usedStaleServerAlbumCache: Boolean(payload?.debug?.usedStaleServerAlbumCache),
        });
        break;
      }

      if (!response.ok) {
        results.push({
          anonymousUserId,
          status: 'failed',
          artistCount: artists.length,
          reason: reason || 'function_error',
          message: normalizeText(payload?.message) || `Function returned ${response.status}.`,
          responseStatus: response.status,
        });
        continue;
      }

      if (payload?.sent) {
        sentCount += 1;
      }

      results.push({
        anonymousUserId,
        status: payload?.sent ? 'sent' : 'skipped',
        artistCount: artists.length,
        reason: normalizeText(payload?.reason) || (payload?.sent ? 'sent' : 'no_notification_sent'),
        message: normalizeText(payload?.message),
        responseStatus: response.status,
        sent: Boolean(payload?.sent),
        retryAfter: normalizeText(payload?.retryAfter || payload?.debug?.retryAfter),
        usedServerAlbumCache: Boolean(payload?.debug?.usedServerAlbumCache),
        usedStaleServerAlbumCache: Boolean(payload?.debug?.usedStaleServerAlbumCache),
      });
    } catch (error) {
      results.push({
        anonymousUserId,
        status: 'failed',
        artistCount: artists.length,
        reason: 'function_call_failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return jsonResponse({
    ok: true,
    dryRun,
    rateLimited,
    retryAfter,
    scannedUserCount: userIds.length,
    processedUserCount: results.length,
    sentCount,
    skippedCount: results.filter((result) => result.status === 'skipped').length,
    failedCount: results.filter((result) => result.status === 'failed').length,
    rateLimitedCount: results.filter((result) => result.status === 'rate_limited').length,
    serverCacheUsedCount: results.filter((result) => result.usedServerAlbumCache).length,
    staleServerCacheUsedCount: results.filter((result) => result.usedStaleServerAlbumCache).length,
    limits: {
      userLimit,
      artistLimit,
      sendLimit,
    },
    results,
  });
});
