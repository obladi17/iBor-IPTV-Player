# iBor IPTV Player — React + Supabase + Cloudflare Pages

## Stack
- React + Vite
- Supabase Auth + PostgreSQL + RLS
- HLS.js
- Cloudflare Pages Functions for Xtream/EPG proxy

Cloudflare Pages uses `npm run build` and `dist` for a React/Vite project. The `functions/` directory stays at the project root so `/api/xtream` is deployed as a Pages Function.

## Environment
Copy `.env.example` to `.env.local`:
- `VITE_SUPABASE_URL=https://hzzhreqyaibqwswkndvi.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=...`

Use only the Supabase publishable key in the browser. Never put a Supabase secret/service-role key in Vite env variables.

## Local
```bash
npm install
npm run dev
```

For Cloudflare Pages:
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: project root

## Xtream security note
Xtream username/password are submitted to the server-side Pages Function per request and are not persisted as passwords in Supabase. The returned playback URL still contains the Xtream credentials because standard Xtream live-stream URLs require them; a full media-stream proxy would be needed to hide them from the browser/network.
j
