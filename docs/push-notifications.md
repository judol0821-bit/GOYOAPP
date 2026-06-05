# GOYO Push Notifications MVP

GOYO currently supports local notifications while the app is open. This document prepares the next step: server-triggered Web Push notifications for followed-artist news.

## Current Local Notification Flow

- Settings live in `localStorage.notificationSettings`.
- Already-notified news IDs live in `localStorage.notifiedNewsIds`.
- `src/utils/notifications.js` requests browser Notification permission and shows local notifications.
- Home checks merged news items and sends at most one local notification per app run.

## Web Push Flow

1. User turns on notifications in MyPage.
2. GOYO requests Notification permission.
3. GOYO checks the production service worker registration.
4. GOYO subscribes through `registration.pushManager.subscribe()`.
5. The browser subscription is saved in Supabase `push_subscriptions`.
6. A future Edge Function or scheduled job sends push payloads to saved subscriptions.
7. `public/sw-push-listener.js` receives `push` events and displays notifications.

If `VITE_VAPID_PUBLIC_KEY` is missing, GOYO keeps local notifications enabled but skips Web Push subscription.

## Supabase SQL

Run `supabase/push_subscriptions.sql`.

The table stores:

- `anonymous_user_id`
- `endpoint`
- `p256dh`
- `auth`
- `user_agent`
- `enabled`

RLS allows anon users to access only rows matching the `x-goyo-anonymous-id` request header.

## Environment Variables

Frontend:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_VAPID_PUBLIC_KEY=
```

Supabase Edge Function secrets:

```powershell
npx.cmd supabase secrets set VAPID_PUBLIC_KEY="..." --project-ref skspszkqmkeekhnerfss
npx.cmd supabase secrets set VAPID_PRIVATE_KEY="..." --project-ref skspszkqmkeekhnerfss
npx.cmd supabase secrets set VAPID_SUBJECT="mailto:your-email@example.com" --project-ref skspszkqmkeekhnerfss
```

`send-test-notification` also needs access to `SUPABASE_SERVICE_ROLE_KEY`.

## VAPID Key Generation

GOYO includes `web-push` as a dev dependency. Generate a key pair with:

```powershell
npm.cmd run vapid:generate
```

The command prints a `Public Key` and `Private Key`.

- Put the public key in `VITE_VAPID_PUBLIC_KEY`.
- Store the same public key in Supabase as `VAPID_PUBLIC_KEY`.
- Store the private key only in Supabase as `VAPID_PRIVATE_KEY`.
- Never put `VAPID_PRIVATE_KEY` in `.env.local`, `.env.example`, React code, or any `VITE_` variable.

Equivalent direct CLI command:

```powershell
npx.cmd web-push generate-vapid-keys
```

## Browser Support Notes

- Chrome, Edge, and Android Chrome support PWA Web Push.
- iOS Web Push requires an installed PWA and supported iOS/Safari versions.
- Some browsers block push in insecure contexts. Use HTTPS in production.
- Notification permission can be permanently denied until the user changes browser settings.

## Test Order

1. Run `supabase/push_subscriptions.sql`.
2. Add `VITE_VAPID_PUBLIC_KEY` to local/prod frontend env.
3. Set Edge Function VAPID secrets.
4. Build and deploy the PWA.
5. Open MyPage and turn on notifications.
6. Confirm a row appears in `push_subscriptions`.
7. Deploy `send-test-notification`.
8. Invoke it with an `anonymousUserId`.
9. Confirm the notification opens GOYO when clicked.

PowerShell deploy and invoke:

```powershell
npx.cmd supabase functions deploy send-test-notification --project-ref skspszkqmkeekhnerfss
npx.cmd supabase functions invoke send-test-notification --project-ref skspszkqmkeekhnerfss --body '{"anonymousUserId":"YOUR_ANONYMOUS_USER_ID"}'
```

Default test payload:

```json
{
  "title": "GOYO",
  "body": "새 소식을 받을 준비가 되었어요."
}
```

## Future Server Push

The MVP test function sends manual notifications. The production version should add a scheduled Supabase Edge Function that:

- reads followed artists per anonymous user,
- fetches new Supabase and Spotify news,
- filters by `notificationSettings`,
- skips already-notified news,
- sends Web Push,
- records sent notifications server-side.
