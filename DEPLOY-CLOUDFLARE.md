# iBor IPTV Player — Cloudflare Pages

## Build
- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`

## Environment variables
Set these in Cloudflare Pages → Settings → Environment variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Use the Supabase publishable key only. Never put a `service_role`/secret key in Vite variables.

## Functions
Pages Functions live under `functions/`.
The Xtream and EPG endpoints are designed to run server-side.

## First production test
1. Open the deployed site.
2. Create an account / sign in.
3. Import a small M3U playlist.
4. Confirm the playlist appears after refresh.
5. Test a channel.
6. Test Favorite.
7. Test History.
8. Test Settings.
9. Test Xtream credentials.
10. Test EPG on a channel that provides EPG data.

## Important security note
Xtream credentials are not persisted in the Supabase playlist table by the frontend. However, an Xtream playback URL can itself contain the username/password depending on the provider's URL format. A full media-stream proxy would be needed to hide those credentials from the browser/network layer.
