# GOYO Deployment

GOYO is a Vite PWA. Frontend environment variables must be present at build time, so Vercel must rebuild after any environment variable change.

## Vercel Environment Variables

Add these in Vercel:

`Project Settings` -> `Environment Variables`

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_VAPID_PUBLIC_KEY=
```

Recommended environment scope:

- `Production`: required for the live app
- `Preview`: recommended for PR/preview deployments
- `Development`: optional for Vercel local workflows

After saving or editing these values, run a new deployment. Existing Vercel builds will not receive new `VITE_` values retroactively.

## Expected App Status

If Vercel variables are missing, MyPage can show:

- `Supabase 미설정, mock data 사용 중`
- `Spotify 비활성화 (Supabase 미설정)`
- `VAPID 공개키 없음 (VITE_VAPID_PUBLIC_KEY 미설정)`

These messages mean the deployed bundle was built without the required public frontend variables.

## Do Not Expose These Secrets

Never add these values as frontend `VITE_` variables:

- `SPOTIFY_CLIENT_SECRET`
- `VAPID_PRIVATE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

These must stay server-side only:

- Spotify secrets belong in Supabase Edge Function secrets.
- VAPID private key belongs in Supabase Edge Function secrets.
- Supabase service role key belongs only in trusted server or Edge Function environments.

## Supabase Edge Function Secrets

Set server-only values with Supabase CLI, not Vercel frontend variables:

```powershell
npx.cmd supabase secrets set SPOTIFY_CLIENT_ID="..." --project-ref skspszkqmkeekhnerfss
npx.cmd supabase secrets set SPOTIFY_CLIENT_SECRET="..." --project-ref skspszkqmkeekhnerfss
npx.cmd supabase secrets set VAPID_PUBLIC_KEY="..." --project-ref skspszkqmkeekhnerfss
npx.cmd supabase secrets set VAPID_PRIVATE_KEY="..." --project-ref skspszkqmkeekhnerfss
npx.cmd supabase secrets set VAPID_SUBJECT="mailto:your-email@example.com" --project-ref skspszkqmkeekhnerfss
```

## Rebuild Checklist

1. Add `VITE_SUPABASE_URL` in Vercel.
2. Add `VITE_SUPABASE_ANON_KEY` in Vercel.
3. Add `VITE_VAPID_PUBLIC_KEY` in Vercel.
4. Save environment variables for the target environment.
5. Trigger a fresh Vercel deployment.
6. Open the deployed MyPage and confirm:
   - `Supabase 연결됨`
   - `Spotify 연결됨`
   - `Push 준비됨`

If the old status remains, clear the PWA/service worker cache or open a fresh browser session after redeploy.
