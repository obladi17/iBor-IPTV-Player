import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Hls from 'hls.js'
import { supabase } from './lib/supabase'
import './styles.css'

const DEMO_M3U = `#EXTM3U\n#EXTINF:-1 tvg-id="demo-1" group-title="Demo",Demo Channel\nhttps://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`
const emptyXtream = { server: '', username: '', password: '' }

function parseM3U(text) {
  const lines = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean), out = []
  for (let i=0;i<lines.length;i++) if (lines[i].startsWith('#EXTINF')) {
    const info=lines[i], url=lines[i+1]||'', name=info.match(/#EXTINF:[^,]*,(.*)$/)?.[1]?.trim()||'Unknown'
    const group=(info.match(/group-title="([^"]*)"/i)?.[1]||'Umum').trim(), logo=info.match(/tvg-logo="([^"]*)"/i)?.[1]||'', tvgId=info.match(/tvg-id="([^"]*)"/i)?.[1]||''
    if(/^https?:\/\//i.test(url)) out.push({id:tvgId||`${name}-${out.length}`,name,group,logo,url})
  }
  return out
}

function App(){
  const [session,setSession]=useState(null), [email,setEmail]=useState(''), [password,setPassword]=useState(''), [authMode,setAuthMode]=useState('login'), [authBusy,setAuthBusy]=useState(false)
  const [message,setMessage]=useState(''), [playlists,setPlaylists]=useState([]), [activePlaylist,setActivePlaylist]=useState(null), [channels,setChannels]=useState([]), [query,setQuery]=useState(''), [group,setGroup]=useState('Semua'), [current,setCurrent]=useState(null), [favorites,setFavorites]=useState(new Set()), [history,setHistory]=useState([])
  const [settings,setSettings]=useState({autoplay:true,low_latency:true,pip:true}), [m3u,setM3u]=useState(''), [showImport,setShowImport]=useState(false), [showXtream,setShowXtream]=useState(false), [showPlaylists,setShowPlaylists]=useState(false), [showSettings,setShowSettings]=useState(false)
  const [xtream,setXtream]=useState(emptyXtream), [xtBusy,setXtBusy]=useState(false), [epg,setEpg]=useState([])
  const videoRef=useRef(null), hlsRef=useRef(null), focusReturn=useRef(null)

  useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session)); const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s)); return()=>l.subscription.unsubscribe()},[])
  useEffect(()=>{if(session) loadData()},[session])
  useEffect(()=>()=>hlsRef.current?.destroy(),[])
  useEffect(()=>{if(message){const t=setTimeout(()=>setMessage(''),3500);return()=>clearTimeout(t)}},[message])

  async function loadData(){
    const {data:pls,error}=await supabase.from('playlists').select('*').order('updated_at',{ascending:false}); if(error){setMessage(error.message);return}
    setPlaylists(pls||[]); const active=(pls||[]).find(p=>p.is_active)||(pls||[])[0]; if(active) await selectPlaylist(active)
    const {data:s}=await supabase.from('user_settings').select('*').maybeSingle(); if(s) setSettings({autoplay:s.autoplay,low_latency:s.low_latency,pip:s.pip})
    const {data:h}=await supabase.from('watch_history').select('*').order('watched_at',{ascending:false}).limit(30); setHistory(h||[])
  }
  async function selectPlaylist(pl){
    setActivePlaylist(pl); setGroup('Semua'); setCurrent(null); setEpg([])
    if(pl.source_type==='m3u'){setChannels(parseM3U(pl.content||''))} else setChannels([])
    const {data:f}=await supabase.from('playlist_favorites').select('channel_key').eq('playlist_id',pl.id); setFavorites(new Set((f||[]).map(x=>x.channel_key)))
  }
  async function activatePlaylist(pl){
    await supabase.from('playlists').update({is_active:false}).eq('user_id',session.user.id); const {error}=await supabase.from('playlists').update({is_active:true}).eq('id',pl.id); if(error)setMessage(error.message); else {await loadData();setShowPlaylists(false)}}
  async function removePlaylist(pl){if(!confirm(`Hapus playlist "${pl.name}"?`))return; const {error}=await supabase.from('playlists').delete().eq('id',pl.id); if(error)setMessage(error.message); else await loadData()}
  async function renamePlaylist(pl){const name=prompt('Nama playlist baru',pl.name)?.trim();if(!name)return;const {error}=await supabase.from('playlists').update({name}).eq('id',pl.id);if(error)setMessage(error.message);else await loadData()}
  async function importM3U(){const parsed=parseM3U(m3u);if(!parsed.length){setMessage('Playlist M3U tidak berisi channel valid.');return}const {error}=await supabase.from('playlists').insert({user_id:session.user.id,name:`M3U ${new Date().toLocaleDateString('id-ID')}`,source_type:'m3u',content:m3u,is_active:playlists.length===0});if(error)setMessage(error.message);else{setMessage(`${parsed.length} channel berhasil diimpor.`);setM3u('');setShowImport(false);await loadData()}}
  async function connectXtream(){setXtBusy(true);try{const r=await fetch('/api/xtream',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...xtream,action:'channels'})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Xtream gagal');const content=JSON.stringify({kind:'xtream',server:xtream.server,username:xtream.username});const {data,error}=await supabase.from('playlists').insert({user_id:session.user.id,name:`Xtream ${xtream.username}`,source_type:'xtream',content,is_active:playlists.length===0}).select().single();if(error)throw error;setShowXtream(false);setMessage(`${d.channels.length} channel Xtream dimuat.`);setChannels(d.channels);await loadData();if(data) await selectPlaylist({...data,_channels:d.channels});}catch(e){setMessage(e.message)}finally{setXtBusy(false)}}
  async function loadXtreamChannels(pl){try{const cfg=JSON.parse(pl.content||'{}');const r=await fetch('/api/xtream',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...cfg,action:'channels'})});const d=await r.json();if(!r.ok)throw new Error(d.error);setChannels(d.channels||[])}catch(e){setMessage(e.message)}}
  async function toggleFavorite(ch){if(!activePlaylist)return;const next=new Set(favorites);if(next.has(ch.id)){next.delete(ch.id);await supabase.from('playlist_favorites').delete().eq('playlist_id',activePlaylist.id).eq('channel_key',ch.id)}else{next.add(ch.id);await supabase.from('playlist_favorites').upsert({playlist_id:activePlaylist.id,channel_key:ch.id})}setFavorites(next)}
  async function saveSettings(next){setSettings(next);if(session)await supabase.from('user_settings').upsert({user_id:session.user.id,...next,updated_at:new Date().toISOString()})}
  async function play(ch){
    setCurrent(ch);setEpg([]);if(hlsRef.current){hlsRef.current.destroy();hlsRef.current=null};const v=videoRef.current;if(!v)return
    if(v.canPlayType('application/vnd.apple.mpegurl')){v.src=ch.url;settings.autoplay&&v.play().catch(()=>{})}else if(Hls.isSupported()){const h=new Hls({lowLatencyMode:settings.low_latency,enableWorker:true});h.loadSource(ch.url);h.attachMedia(v);h.on(Hls.Events.MANIFEST_PARSED,()=>settings.autoplay&&v.play().catch(()=>{}));hlsRef.current=h}else setMessage('Browser tidak mendukung HLS.')
    if(session){await supabase.from('watch_history').insert({user_id:session.user.id,channel_key:ch.id,channel_name:ch.name,stream_url:ch.url,position_seconds:0})}
    if(activePlaylist?.source_type==='xtream'){try{const cfg=JSON.parse(activePlaylist.content||'{}');const r=await fetch('/api/xtream',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...cfg,action:'epg',stream_id:ch.id,limit:8})});const d=await r.json();if(r.ok)setEpg(d.epg||[])}catch{}}
  }
  function onKey(e,idx){if(e.key==='Enter'||e.key===' '){e.preventDefault();play(filtered[idx])} if(e.key==='ArrowDown'){e.preventDefault();document.querySelectorAll('.channel')[idx+1]?.focus()}if(e.key==='ArrowUp'){e.preventDefault();document.querySelectorAll('.channel')[idx-1]?.focus()}if(e.key==='Escape')setShowImport(false)}
  const groups=useMemo(()=>['Semua',...new Set(channels.map(c=>c.group).filter(Boolean))],[channels]), filtered=useMemo(()=>channels.filter(c=>(group==='Semua'||c.group===group)&&c.name.toLowerCase().includes(query.toLowerCase())),[channels,group,query])

  if(!session)return <div className="auth-shell"><div className="auth-card"><div className="brand">iBor <span>IPTV Player</span></div><p className="muted">Live TV player untuk web & Android TV.</p><input autoFocus placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/><input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)}/><button className="primary focusable" disabled={authBusy} onClick={async()=>{setAuthBusy(true);const r=authMode==='login'?await supabase.auth.signInWithPassword({email,password}):await supabase.auth.signUp({email,password});setMessage(r.error?.message|| (authMode==='login'?'Login berhasil.':'Akun dibuat, cek email jika konfirmasi aktif.'));setAuthBusy(false)}}>{authBusy?'Memproses…':authMode==='login'?'Masuk':'Daftar'}</button><button className="link focusable" onClick={()=>setAuthMode(authMode==='login'?'signup':'login')}>{authMode==='login'?'Belum punya akun? Daftar':'Sudah punya akun? Masuk'}</button>{message&&<div className="notice">{message}</div>}</div></div>

  return <div className="app">
    <header className="topbar"><div className="brand">iBor <span>IPTV Player</span></div><div className="top-actions"><button className="focusable" onClick={()=>setShowPlaylists(true)}>Playlist</button><button className="focusable" onClick={()=>{focusReturn.current='import';setShowImport(true)}}>＋ M3U</button><button className="focusable" onClick={()=>setShowXtream(true)}>Xtream</button><button className="focusable" onClick={()=>setShowSettings(true)}>⚙</button><button className="focusable" onClick={()=>saveSettings({...settings,low_latency:!settings.low_latency})}>LL: {settings.low_latency?'ON':'OFF'}</button><button className="focusable" onClick={()=>supabase.auth.signOut()}>Keluar</button></div></header>
    <main className="layout">
      <section className="player-panel"><div className="video-wrap"><video ref={videoRef} controls playsInline poster="/poster.svg"/><>{!current&&<div className="empty-player"><b>Belum ada channel</b><span>Impor M3U atau hubungkan Xtream.</span></div>}</></div><div className="now-playing"><div><small>NOW PLAYING</small><h2>{current?.name||activePlaylist?.name||'iBor IPTV Player'}</h2>{epg[0]&&<p className="epg-now">{epg[0].title}</p>}</div>{current&&<button className="focusable" onClick={()=>settings.pip&&videoRef.current?.requestPictureInPicture?.()}>PiP</button>}</div>{epg.length>0&&<div className="epg-strip">{epg.map((x,i)=><div className={i===0?'epg-item live':'epg-item'} key={x.id||i}><small>{x.start||''}</small><b>{x.title||'Program'}</b></div>)}</div>}</section>
      <aside className="sidebar"><input className="search focusable" autoComplete="off" placeholder="Cari channel…" value={query} onChange={e=>setQuery(e.target.value)}/><div className="groups">{groups.map(g=><button className={`focusable ${group===g?'active':''}`} key={g} onClick={()=>setGroup(g)}>{g}</button>)}</div><div className="channel-list">{filtered.map((ch,i)=><div className={`channel focusable ${current?.id===ch.id?'selected':''}`} key={ch.id} tabIndex={0} onClick={()=>play(ch)} onKeyDown={e=>onKey(e,i)}><div className="logo">{ch.logo?<img src={ch.logo} alt=""/>:'TV'}</div><div className="channel-info"><b>{ch.name}</b><small>{ch.group}</small></div><button className="star" onClick={e=>{e.stopPropagation();toggleFavorite(ch)}}>{favorites.has(ch.id)?'★':'☆'}</button></div>)}</div></aside>
    </main>
    {showImport&&<div className="modal" onMouseDown={e=>e.target===e.currentTarget&&setShowImport(false)}><div className="modal-card"><h2>Import M3U</h2><textarea autoFocus value={m3u} onChange={e=>setM3u(e.target.value)} placeholder={DEMO_M3U}/><div className="modal-actions"><button className="focusable" onClick={()=>setM3u(DEMO_M3U)}>Contoh</button><button className="focusable" onClick={()=>setShowImport(false)}>Batal</button><button className="primary focusable" onClick={importM3U}>Import</button></div></div></div>}
    {showXtream&&<div className="modal"><div className="modal-card"><h2>Xtream Codes</h2><input autoFocus placeholder="Server URL" value={xtream.server} onChange={e=>setXtream({...xtream,server:e.target.value})}/><input placeholder="Username" value={xtream.username} onChange={e=>setXtream({...xtream,username:e.target.value})}/><input placeholder="Password" type="password" value={xtream.password} onChange={e=>setXtream({...xtream,password:e.target.value})}/><p className="muted">Kredensial hanya dikirim saat koneksi. Tidak disimpan sebagai password di Supabase.</p><div className="modal-actions"><button className="focusable" onClick={()=>setShowXtream(false)}>Batal</button><button className="primary focusable" disabled={xtBusy} onClick={connectXtream}>{xtBusy?'Menghubungkan…':'Hubungkan'}</button></div></div></div>}
    {showPlaylists&&<div className="modal"><div className="modal-card"><h2>Playlist</h2><div className="playlist-list">{playlists.map(pl=><div className="playlist-row" key={pl.id}><div><b>{pl.name}</b><small>{pl.source_type.toUpperCase()} {pl.is_active?'• AKTIF':''}</small></div><div className="row-actions"><button className="focusable" onClick={async()=>{await activatePlaylist(pl);if(pl.source_type==='xtream')await loadXtreamChannels(pl)}}>Pakai</button><button className="focusable" onClick={()=>renamePlaylist(pl)}>Rename</button><button className="danger focusable" onClick={()=>removePlaylist(pl)}>Hapus</button></div></div>)}</div><div className="modal-actions"><button className="focusable" onClick={()=>setShowPlaylists(false)}>Tutup</button></div></div></div>}
    {showSettings&&<div className="modal"><div className="modal-card"><h2>Settings</h2>{[['autoplay','Autoplay'],['low_latency','Low latency'],['pip','Picture-in-picture']].map(([k,l])=><label className="setting" key={k}><span>{l}</span><input type="checkbox" checked={settings[k]} onChange={e=>saveSettings({...settings,[k]:e.target.checked})}/></label>)}<h3>Riwayat</h3><div className="history-list">{history.slice(0,8).map(h=><div key={h.id}><b>{h.channel_name}</b><small>{new Date(h.watched_at).toLocaleString('id-ID')}</small></div>)}</div><div className="modal-actions"><button className="focusable" onClick={()=>setShowSettings(false)}>Tutup</button></div></div></div>}
    {message&&<div className="toast">{message}</div>}
  </div>
}
createRoot(document.getElementById('root')).render(<App/>)
