# GOYO Auto Notifications MVP

GOYO now has the first server-side structure for automatic new-music push notifications.

## Current Scope

- The app already supports local notification settings and Web Push subscriptions.
- `send-test-notification` remains available for direct push delivery tests.
- `check-new-music-notifications` is the MVP engine for followed Spotify artists.
- MyPage includes a small development-only button that manually invokes the engine.

This is not a full scheduled production system yet. It is a safe manual test path that can become a scheduled job later.

## Data Model

Run `supabase/notified_news.sql`.

`notified_news` stores one row per user/news notification:

- `anonymous_user_id`
- `news_id`
- `news_title`
- `artist_name`
- `type`
- `notified_at`

The unique key `(anonymous_user_id, news_id)` prevents repeat notifications for the same news item.

## Edge Function Flow

`check-new-music-notifications`:

1. Receives `anonymousUserId` and Spotify artists from the client.
2. Loads the latest enabled `push_subscriptions` row for that anonymous user.
3. Uses Spotify Client Credentials secrets to fetch album/single data.
4. Converts Spotify albums to GOYO news-like items with IDs such as `spotify_album_...`.
5. Checks `notified_news` for duplicates.
6. Sends one notification for the newest unnotified music item.
7. Writes the sent item to `notified_news`.
8. Disables expired subscriptions when Web Push returns `404` or `410`.

Payload example:

```json
{
  "title": "GOYO",
  "body": "wave to earth의 새 음악이 도착했어요: wave 0.01",
  "data": {
    "url": "/detail/spotify_album_..."
  }
}
```

## Manual Test Flow

1. Apply `supabase/notified_news.sql`.
2. Deploy the function:

```powershell
npx.cmd supabase functions deploy check-new-music-notifications --no-verify-jwt --project-ref skspszkqmkeekhnerfss
```

3. Open GOYO MyPage.
4. Turn on notifications and confirm a row exists in `push_subscriptions`.
5. Follow at least one Spotify source artist.
6. Click `새 음악 알림 테스트`.
7. Confirm one push notification is received.
8. Confirm a row is created in `notified_news`.
9. Click the button again and confirm no duplicate notification is sent for the same item.

## Required Secrets

Supabase Edge Function secrets:

```powershell
npx.cmd supabase secrets set SPOTIFY_CLIENT_ID="..." --project-ref skspszkqmkeekhnerfss
npx.cmd supabase secrets set SPOTIFY_CLIENT_SECRET="..." --project-ref skspszkqmkeekhnerfss
npx.cmd supabase secrets set VAPID_PUBLIC_KEY="..." --project-ref skspszkqmkeekhnerfss
npx.cmd supabase secrets set VAPID_PRIVATE_KEY="..." --project-ref skspszkqmkeekhnerfss
npx.cmd supabase secrets set VAPID_SUBJECT="mailto:your-email@example.com" --project-ref skspszkqmkeekhnerfss
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase Edge Functions.

## Future Automation

For production automatic delivery, add:

- a server-side followed artists table,
- saved notification settings per anonymous user,
- a Supabase Scheduled Function or cron trigger,
- batching/rate limiting,
- retry and expired-subscription cleanup reporting.

The current MVP intentionally keeps artist follow state client-provided so the existing app data model does not need a large migration yet.
