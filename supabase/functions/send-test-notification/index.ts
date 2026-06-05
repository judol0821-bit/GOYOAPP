// Server-side Web Push test function for GOYO.
//
// Required secrets:
// - VAPID_PUBLIC_KEY
// - VAPID_PRIVATE_KEY
// - VAPID_SUBJECT
// - SUPABASE_SERVICE_ROLE_KEY
//
// Deploy:
// supabase functions deploy send-test-notification --project-ref skspszkqmkeekhnerfss

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

const getErrorDetails = (error: unknown) => {
  if (error instanceof Error) {
    const value = error as Error & {
      statusCode?: number;
      body?: unknown;
    };

    return {
      name: error.name,
      message: error.message,
      statusCode: value.statusCode || null,
      body: value.body || null,
      stack: error.stack || '',
    };
  }

  if (typeof error === 'object' && error !== null) {
    const value = error as Record<string, unknown>;

    return {
      name: String(value.name || 'Error'),
      message: String(value.message || value.error || 'Unknown object error'),
      statusCode: value.statusCode || null,
      body: value.body || null,
      stack: String(value.stack || ''),
    };
  }

  return {
    name: 'UnknownError',
    message: String(error),
    statusCode: null,
    body: null,
    stack: '',
  };
};

const logStep = (step: string, details: Record<string, unknown> = {}) => {
  console.log(`[send-test-notification] ${step}`, details);
};

const logError = (step: string, error: unknown, details: Record<string, unknown> = {}) => {
  const errorDetails = getErrorDetails(error);
  console.error(`[send-test-notification] ${step}`, {
    ...details,
    ...errorDetails,
  });
};

const getEndpointHost = (endpoint: string) => {
  try {
    return endpoint ? new URL(endpoint).hostname : '';
  } catch {
    return 'invalid_endpoint_url';
  }
};

const getEndpointPrefix = (endpoint: string) => (endpoint || '').slice(0, 40);

Deno.serve(async (request) => {
  try {
    logStep('request_received', {
      method: request.method,
      url: request.url,
      contentType: request.headers.get('content-type') || '',
    });

    if (request.method === 'OPTIONS') {
      logStep('options_preflight');
      return new Response('ok', { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      logStep('method_not_allowed', { method: request.method });
      return jsonResponse({ error: 'method_not_allowed', message: 'POST only' }, 405);
    }

    let body: {
      anonymousUserId?: string;
      title?: string;
      body?: string;
      url?: string;
    };

    try {
      const parsedBody = await request.json();

      if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
        logStep('invalid_body_shape', { parsedType: typeof parsedBody, isArray: Array.isArray(parsedBody) });
        return jsonResponse({ error: 'invalid_body', message: 'Request body must be a JSON object.' }, 400);
      }

      body = parsedBody;
      logStep('body_parsed', {
        hasAnonymousUserId: Boolean(body.anonymousUserId),
        anonymousUserIdLength: body.anonymousUserId?.length || 0,
        hasCustomTitle: Boolean(body.title),
        hasCustomBody: Boolean(body.body),
      });
    } catch (error) {
      logError('body_parse_failed', error);
      return jsonResponse({ error: 'invalid_json', message: 'Request body must be valid JSON.' }, 400);
    }

    const anonymousUserId = body.anonymousUserId?.trim();

    if (!anonymousUserId) {
      logStep('missing_anonymous_user_id');
      return jsonResponse({ error: 'missing_anonymous_user_id', message: 'anonymousUserId is required.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || '';
    const missingSupabaseSecrets = [
      !supabaseUrl ? 'SUPABASE_URL' : '',
      !serviceRoleKey ? 'SUPABASE_SERVICE_ROLE_KEY' : '',
    ].filter(Boolean);
    const missingVapidSecrets = [
      !vapidPublicKey ? 'VAPID_PUBLIC_KEY' : '',
      !vapidPrivateKey ? 'VAPID_PRIVATE_KEY' : '',
      !vapidSubject ? 'VAPID_SUBJECT' : '',
    ].filter(Boolean);

    logStep('secret_check', {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      hasVapidPublicKey: Boolean(vapidPublicKey),
      hasVapidPrivateKey: Boolean(vapidPrivateKey),
      hasVapidSubject: Boolean(vapidSubject),
      vapidPublicKeyLength: vapidPublicKey.length,
      vapidPrivateKeyLength: vapidPrivateKey.length,
      vapidSubject,
    });
    console.log({
      hasVapidPublicKey: Boolean(vapidPublicKey),
      hasVapidPrivateKey: Boolean(vapidPrivateKey),
      hasVapidSubject: Boolean(vapidSubject),
    });

    if (missingSupabaseSecrets.length > 0) {
      return jsonResponse(
        {
          error: 'missing_supabase_secret',
          message: 'Required Supabase Edge Function secrets are missing.',
          missing: missingSupabaseSecrets,
        },
        500,
      );
    }

    if (missingVapidSecrets.length > 0) {
      return jsonResponse(
        {
          error: 'missing_vapid_secret',
          message: 'Required VAPID secrets are missing.',
          missing: missingVapidSecrets,
        },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    logStep('subscription_query_start', { anonymousUserId });
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, created_at')
      .eq('anonymous_user_id', anonymousUserId)
      .eq('enabled', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      logError('subscription_query_failed', error, { anonymousUserId });
      return jsonResponse({ error: 'database_query_failed', message: error.message }, 500);
    }

    const safeSubscriptions = Array.isArray(subscriptions) ? subscriptions : [];
    logStep('subscription_query_success', {
      anonymousUserId,
      subscriptionCount: safeSubscriptions.length,
      subscriptions: safeSubscriptions.map((subscription) => ({
        id: subscription.id,
        createdAt: subscription.created_at,
        hasEndpoint: Boolean(subscription.endpoint),
        endpointHost: getEndpointHost(subscription.endpoint),
        hasP256dh: Boolean(subscription.p256dh),
        hasAuth: Boolean(subscription.auth),
      })),
    });

    if (safeSubscriptions.length === 0) {
      return jsonResponse(
        {
          error: 'subscription_not_found',
          message: 'No enabled push subscription found for anonymousUserId.',
          anonymousUserId,
        },
        404,
      );
    }

    const validSubscriptions = safeSubscriptions.filter(
      (subscription) => subscription.endpoint && subscription.p256dh && subscription.auth,
    );
    const invalidSubscriptionCount = safeSubscriptions.length - validSubscriptions.length;

    if (validSubscriptions.length === 0) {
      logStep('invalid_subscription', {
        anonymousUserId,
        invalidSubscriptionCount,
      });

      return jsonResponse(
        {
          error: 'invalid_subscription',
          message: 'Subscriptions exist, but endpoint, p256dh, or auth is missing.',
          invalidSubscriptionCount,
        },
        500,
      );
    }

    logStep('web_push_setup_start', {
      vapidSubject,
      validSubscriptionCount: validSubscriptions.length,
      invalidSubscriptionCount,
    });

    try {
      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    } catch (error) {
      logError('vapid_setup_failed', error);
      return jsonResponse(
        {
          error: 'missing_vapid_secret',
          message: 'VAPID details could not be configured. Check VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT.',
          details: getErrorDetails(error).message,
        },
        500,
      );
    }

    const payload = JSON.stringify({
      title: body.title || 'GOYO',
      body: body.body || '새 소식을 받을 준비가 되었어요.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: {
        url: body.url || '/home',
      },
    });

    logStep('web_push_send_start', {
      anonymousUserId,
      validSubscriptionCount: validSubscriptions.length,
      payloadLength: payload.length,
    });

    const latestSubscription = validSubscriptions[0];
    const { endpoint, p256dh, auth } = latestSubscription;

    console.log({
      endpointPrefix: getEndpointPrefix(endpoint),
      hasP256dh: Boolean(p256dh),
      hasAuth: Boolean(auth),
    });

    try {
      await webpush.sendNotification(
        {
          endpoint,
          keys: {
            p256dh,
            auth,
          },
        },
        payload,
      );
    } catch (error) {
      console.error('WebPush Error');
      console.error(error);

      const errorDetails = getErrorDetails(error);
      const webPushError = error as {
        name?: string;
        statusCode?: number;
        body?: string;
        message?: string;
        stack?: string;
      };

      if (webPushError.statusCode) {
        console.error('statusCode', webPushError.statusCode);
      }

      if (webPushError.body) {
        console.error('body', webPushError.body);
      }

      if (webPushError.message) {
        console.error('message', webPushError.message);
      }

      if (webPushError.statusCode === 404 || webPushError.statusCode === 410) {
        await supabase
          .from('push_subscriptions')
          .update({ enabled: false })
          .eq('id', latestSubscription.id);
      }

      return Response.json(
        {
          success: false,
          error: 'web_push_failed',
          name: webPushError.name || errorDetails.name,
          message: webPushError.message || errorDetails.message,
          statusCode: webPushError.statusCode || errorDetails.statusCode || null,
          body: webPushError.body || errorDetails.body || null,
          stack: webPushError.stack || errorDetails.stack || '',
          hasVapidPublicKey: Boolean(vapidPublicKey),
          hasVapidPrivateKey: Boolean(vapidPrivateKey),
          hasVapidSubject: Boolean(vapidSubject),
          subscription: {
            id: latestSubscription.id,
            createdAt: latestSubscription.created_at,
            endpointPrefix: getEndpointPrefix(endpoint),
            hasP256dh: Boolean(p256dh),
            hasAuth: Boolean(auth),
          },
        },
        {
          status: 500,
          headers: corsHeaders,
        },
      );
    }

    const disabledExpired = 0;

    if (disabledExpired > 0) {
      logStep('disable_expired_subscriptions_start', {
        expiredSubscriptionCount: disabledExpired,
      });
    }

    logStep('web_push_send_complete', {
      sent: 1,
      failed: 0,
      disabledExpired,
      invalidSubscriptionCount,
    });

    return jsonResponse({
      ok: true,
      success: true,
      sent: 1,
      failed: 0,
      subscriptionCount: safeSubscriptions.length,
      invalidSubscriptionCount,
      disabledExpired,
      subscription: {
        id: latestSubscription.id,
        createdAt: latestSubscription.created_at,
        endpointPrefix: getEndpointPrefix(endpoint),
      },
    });
  } catch (error) {
    logError('unhandled_error', error);

    return jsonResponse(
      {
        error: 'unhandled_error',
        message: getErrorDetails(error).message,
      },
      500,
    );
  }
});
