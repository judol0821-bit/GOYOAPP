# GOYO Auto Notifications

GOYO automatic new-music notifications are split into two Edge Functions.

- `check-new-music-notifications`: single-user engine. It sends at most one new-music push for one `anonymousUserId`.
- `check-new-music-notifications-batch`: scheduled batch runner. It finds users with enabled push subscriptions, loads their server-synced followed artists, and invokes the single-user engine sequentially.

The MyPage `새 음악 알림 테스트` button remains available for development. Hide that button before public launch if the release should not expose manual push testing.

## Required SQL

Apply these SQL files in Supabase:

```powershell
# Duplicate notification prevention
supabase/notified_news.sql

# Web Push subscriptions
supabase/push_subscriptions.sql

# Server-side copy of anonymous followed artists
supabase/anonymous_artist_follows.sql

# Spotify album cache and rate-limit state
supabase/album_cache.sql
```

`anonymous_artist_follows` exists because the app still keeps `followedArtistIds` and `followedArtistSnapshots` in localStorage. The frontend now syncs those snapshots to Supabase so a server-side cron job can know which Spotify artists belong to each anonymous user.

## Data Flow

1. User follows artists in onboarding.
2. The app keeps existing localStorage keys unchanged.
3. The app also syncs artist snapshots to `anonymous_artist_follows`.
4. User enables push notifications, creating `push_subscriptions`.
5. Cron invokes `check-new-music-notifications-batch`.
6. Batch loads enabled users and their Spotify follows.
7. Batch invokes `check-new-music-notifications` per user.
8. Single-user function checks `album_cache` before calling Spotify.
9. Cache misses call Spotify only when the global Spotify rate-limit window is not active.
10. Single-user function checks `notified_news` and Web Push.
11. Sent news is recorded in `notified_news` to prevent duplicates.

## Spotify Album Cache

`album_cache` stores Spotify album lookup results by artist:

- `artist_id`
- `album_id`
- `album_name`
- `release_date`
- `image_url`
- `cached_at`

`artist_album_cache_status` stores the last checked time even when Spotify returns zero albums, so GOYO does not re-query the same artist repeatedly in the same day.

Cache policy:

- cache TTL is 24 hours
- the same artist should be fetched from Spotify at most once per day
- fresh cache is used before Spotify
- if Spotify is rate limited, stale cache can still be used
- successful Spotify responses are upserted back into `album_cache`
- Spotify 429 `Retry-After` values are stored in `spotify_rate_limits`
- while the stored rate-limit window is active, Spotify calls are skipped

## Rate Limits

The batch runner is intentionally conservative:

- default user limit: `20`
- default artist limit per user: `2`
- default send limit per run: `5`
- users are processed sequentially
- if Spotify returns `429`, the current run stops immediately
- `Retry-After` is returned when Spotify provides it
- `Retry-After` is saved so the next run can skip Spotify and use cache only

Override limits with request body or Edge Function secrets:

```json
{
  "limit": 10,
  "artistLimit": 2,
  "sendLimit": 3,
  "dryRun": false
}
```

Optional Edge Function env values:

```text
GOYO_BATCH_USER_LIMIT=20
GOYO_BATCH_ARTIST_LIMIT=2
GOYO_BATCH_SEND_LIMIT=5
GOYO_CRON_SECRET=
```

If `GOYO_CRON_SECRET` is set, callers must include `x-goyo-cron-secret`.

## Deploy

Deploy with JWT verification enabled:

```powershell
npx.cmd supabase functions deploy check-new-music-notifications --project-ref skspszkqmkeekhnerfss
npx.cmd supabase functions deploy check-new-music-notifications-batch --project-ref skspszkqmkeekhnerfss
```

Required Edge Function secrets:

```powershell
npx.cmd supabase secrets set SPOTIFY_CLIENT_ID="..." --project-ref skspszkqmkeekhnerfss
npx.cmd supabase secrets set SPOTIFY_CLIENT_SECRET="..." --project-ref skspszkqmkeekhnerfss
npx.cmd supabase secrets set VAPID_PUBLIC_KEY="..." --project-ref skspszkqmkeekhnerfss
npx.cmd supabase secrets set VAPID_PRIVATE_KEY="..." --project-ref skspszkqmkeekhnerfss
npx.cmd supabase secrets set VAPID_SUBJECT="mailto:your-email@example.com" --project-ref skspszkqmkeekhnerfss
npx.cmd supabase secrets set GOYO_CRON_SECRET="replace-with-random-secret" --project-ref skspszkqmkeekhnerfss
```

## Manual Batch Test

Use a service role key only from a trusted server or local terminal. Never expose it in the frontend.

```powershell
$body = @{
  limit = 3
  artistLimit = 2
  sendLimit = 1
  dryRun = $true
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "https://skspszkqmkeekhnerfss.supabase.co/functions/v1/check-new-music-notifications-batch" `
  -Headers @{
    "Authorization" = "Bearer <SUPABASE_SERVICE_ROLE_KEY>"
    "apikey" = "<SUPABASE_SERVICE_ROLE_KEY>"
    "Content-Type" = "application/json"
    "x-goyo-cron-secret" = "<GOYO_CRON_SECRET>"
  } `
  -Body $body
```

Set `dryRun = $false` after checking the response.

## Cron Options

### External Cron

Use Vercel Cron, GitHub Actions, cron-job.org, or another trusted scheduler to POST to:

```text
https://skspszkqmkeekhnerfss.supabase.co/functions/v1/check-new-music-notifications-batch
```

Recommended cadence for MVP:

```text
0 */6 * * *
```

That means every 6 hours. Avoid short intervals while Spotify rate limits are being observed.

### Supabase Cron

If using `pg_cron` and `pg_net`, store secrets through Supabase Vault rather than hard-coding service role keys in SQL. The HTTP request should include:

- `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`
- `apikey: <SUPABASE_SERVICE_ROLE_KEY>`
- `Content-Type: application/json`
- `x-goyo-cron-secret: <GOYO_CRON_SECRET>`

Use the same JSON body shape as the manual batch test.

## Remaining Production Work

- Apply `supabase/anonymous_artist_follows.sql`.
- Apply `supabase/album_cache.sql`.
- Deploy the batch Edge Function.
- Set `GOYO_CRON_SECRET`.
- Configure an external cron or Supabase cron.
- Watch Spotify 429 frequency and tune `limit`, `artistLimit`, and schedule interval.
- Hide the MyPage development test button before public release if needed.
