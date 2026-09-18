function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}

function serverUrl(value: string) {
  const raw = String(value || '').trim()
  if (!raw) throw new Error('Server URL wajib diisi.')
  const u = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`)
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Server URL tidak valid.')
  u.pathname = u.pathname.replace(/\/+$/, '')
  u.search = ''; u.hash = ''
  return u.toString().replace(/\/$/, '')
}

async function xtFetch(base: string, params: Record<string, string>) {
  const url = new URL('/player_api.php', base)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const r = await fetch(url.toString(), { headers: { accept: 'application/json' } })
  if (!r.ok) throw new Error(`Xtream HTTP ${r.status}`)
  return r.json()
}

function authPayload(body: any) {
  if (!body?.server || !body?.username || !body?.password) throw new Error('Server, username, dan password wajib diisi.')
  return { base: serverUrl(body.server), username: String(body.username), password: String(body.password) }
}

function streamUrl(base: string, username: string, password: string, id: string | number) {
  return `${base}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${encodeURIComponent(String(id))}.m3u8`
}

export const onRequestPost: PagesFunction = async ({ request }) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const body = await request.json()
    const { base, username, password } = authPayload(body)
    const action = body.action || 'channels'
    const auth = await xtFetch(base, { username, password })
    if (!auth || auth.user_info?.auth === 0) return json({ error: 'Login Xtream gagal.' }, 401)

    if (action === 'categories') {
      const data = await xtFetch(base, { username, password, action: 'get_live_categories' })
      return json({ categories: Array.isArray(data) ? data : [] })
    }

    if (action === 'epg') {
      if (!body.stream_id) throw new Error('stream_id wajib untuk EPG.')
      const data = await xtFetch(base, { username, password, action: 'get_short_epg', stream_id: String(body.stream_id), limit: String(Math.min(Number(body.limit) || 8, 30)) })
      const list = Array.isArray(data?.epg_listings) ? data.epg_listings : Array.isArray(data) ? data : []
      return json({ epg: list.map((x: any) => ({
        id: x.id, title: x.title, description: x.description,
        start: x.start, end: x.end, start_timestamp: x.start_timestamp, stop_timestamp: x.stop_timestamp,
        now_playing: x.now_playing
      })) })
    }

    const categories = await xtFetch(base, { username, password, action: 'get_live_categories' })
    const streams = await xtFetch(base, { username, password, action: 'get_live_streams' })
    const catMap = new Map((Array.isArray(categories) ? categories : []).map((c: any) => [String(c.category_id), c.category_name || 'Umum']))
    const channels = (Array.isArray(streams) ? streams : []).map((s: any) => ({
      id: String(s.stream_id), name: s.name || 'Channel', group: catMap.get(String(s.category_id)) || 'Umum', logo: s.stream_icon || '',
      url: streamUrl(base, username, password, s.stream_id), tvgId: s.epg_channel_id || '', categoryId: String(s.category_id || '')
    }))
    return json({
      user: { username: auth.user_info?.username || username, status: auth.user_info?.status || '', exp_date: auth.user_info?.exp_date || null },
      categories: Array.isArray(categories) ? categories.map((c: any) => ({ id: String(c.category_id), name: c.category_name || 'Umum' })) : [],
      channels
    })
  } catch (e: any) {
    return json({ error: e?.message || 'Xtream request gagal.' }, 400)
  }
}
