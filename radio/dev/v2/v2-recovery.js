(() => {
  'use strict';
  const app = document.getElementById('v2App');
  if (!app) return;
  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const SONGS = `${API}/radio/songs`;
  const TRACK = `${API}/radio/track`;
  const SHOP = 'https://stashbox.ai/products.json?limit=250';
  const FALLBACK = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const clean = v => String(v ?? '').trim();
  const esc = v => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const fix = v => clean(v).replace('www.dropbox.com','dl.dropboxusercontent.com').replace(/\?dl=[01]/,'');
  const rows = (d, keys) => {
    if (typeof d?.body === 'string') { try { d = JSON.parse(d.body); } catch (_) {} }
    if (Array.isArray(d)) return d;
    for (const k of keys) if (Array.isArray(d?.[k])) return d[k];
    return [];
  };
  const icon = {
    search:'<svg viewBox="0 0 24 24"><path d="m21 21-4.4-4.4m2.4-5.6a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"/></svg>',
    bell:'<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>',
    play:'<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7Z"/></svg>',
    pause:'<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
    back:'<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>',
    next:'<svg viewBox="0 0 24 24"><path d="M17 5v14M6 6l8 6-8 6Z"/></svg>',
    prev:'<svg viewBox="0 0 24 24"><path d="M7 5v14M18 6l-8 6 8 6Z"/></svg>',
    heart:'<svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>',
    share:'<svg viewBox="0 0 24 24"><path d="M12 3v12m0-12 4 4m-4-4L8 7M5 11v8h14v-8"/></svg>'
  };
  const state = { songs:[], products:[], visible:[], query:'', genre:'ALL', selected:null, queue:[], index:-1 };
  const song = (r,i) => ({
    key:clean(r.song_key||r.songKey||r.song_id||r.id||`song-${i}`),
    title:clean(r.display_title||r.title||r.song_name||`Song ${i+1}`),
    artist:clean(r.artist||r.artist_name||'Stashbox'),
    genre:clean(r.genre||r.primary_genre||'Other'),
    art:fix(r.resolved_artwork_url||r.song_artwork_url||r.artwork_url||r.cover_art_url||r.image_url)||FALLBACK,
    audio:fix(r.audio_url||r.audioUrl||r.mp3_url||r.stream_url),
    video:fix(r.video_link||r.video_url||r.videoUrl),
    plays:Number(r.total_plays||r.plays||0)||0,
    likes:Number(r.total_likes||r.likes||0)||0,
    raw:r
  });
  const art = s => `<img src="${esc(s.art)}" alt="${esc(s.title)} artwork" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK}'">`;
  const filter = () => {
    const q = state.query.toLowerCase();
    state.visible = state.songs.filter(s => (!q || `${s.title} ${s.artist} ${s.genre}`.toLowerCase().includes(q)) && (state.genre==='ALL'||s.genre===state.genre));
  };
  const card = s => `<article class="v2-song-card song-card" data-song="${esc(s.key)}" tabindex="0"><div class="v2-song-art">${art(s)}<button class="v2-art-play" tabindex="-1">${icon.play}</button></div><div class="v2-song-copy"><h3>${esc(s.title)}</h3><p>${esc(s.artist)}</p><span>${esc(s.genre)}</span></div></article>`;
  const featured = s => `<article class="v2-feature-card" data-song="${esc(s.key)}" tabindex="0"><div class="v2-feature-art">${art(s)}<span class="v2-feature-label">Trending Now</span><button class="v2-art-play" tabindex="-1">${icon.play}</button></div><h3>${esc(s.title)}</h3><p>${esc(s.artist)}</p><span>${esc(s.genre)}</span></article>`;
  const product = p => { const v=p.variants?.[0]; const img=p.images?.[0]?.src||''; return `<a class="v2-product-card" href="https://stashbox.ai/products/${encodeURIComponent(p.handle||'')}" target="_blank" rel="noopener"><span class="v2-product-image">${img?`<img src="${esc(img)}" alt="${esc(p.title)}">`:'<b>SB</b>'}</span><strong>${esc(p.title||'Stashbox Product')}</strong><small>${v?.price?`$${Number(v.price).toFixed(2)}`:'Shop now'}</small></a>`; };
  function render() {
    filter();
    const genres=[...new Set(state.songs.map(s=>s.genre))].filter(Boolean);
    const artists=[...new Set(state.songs.map(s=>s.artist))].slice(0,10);
    app.innerHTML=`
      <header class="v2-header"><a class="v2-wordmark" href="/radio/dev/v2/">STASH<span>BOX</span></a><div class="v2-header-actions"><button class="v2-icon-button" data-search>${icon.search}</button><button class="v2-icon-button v2-notifications-trigger">${icon.bell}<span class="v2-notification-dot"></span></button><div class="stashbox-action-row"></div></div></header>
      <main class="v2-home">
        <section class="v2-section"><div class="v2-section-heading"><h2>Featured Songs</h2><button class="v2-see-all" data-to-songs>See All</button></div><div class="v2-horizontal v2-featured-row">${state.songs.slice(0,8).map(featured).join('')}</div></section>
        <section class="v2-section"><div class="v2-section-heading"><h2>Popular Artists</h2></div><div class="v2-horizontal v2-artists-row">${artists.map(a=>{const s=state.songs.find(x=>x.artist===a);return `<button class="v2-artist-card" data-artist="${esc(a)}"><span class="v2-artist-avatar">${art(s)}</span><strong>${esc(a)}</strong><small>${state.songs.filter(x=>x.artist===a).length} tracks</small></button>`}).join('')}</div></section>
        <section class="v2-section"><div class="v2-section-heading"><h2>Genres</h2></div><div class="v2-horizontal v2-category-row">${genres.map((g,i)=>`<button class="v2-category-card tone-${i%6}" data-genre="${esc(g)}"><strong>${esc(g)}</strong><small>${state.songs.filter(x=>x.genre===g).length} tracks</small></button>`).join('')}</div></section>
        ${state.products.length?`<section class="v2-section"><div class="v2-section-heading"><h2>Shop</h2><a class="v2-see-all" href="https://stashbox.ai/collections/stashbox" target="_blank">See All</a></div><div class="v2-horizontal v2-shop-row">${state.products.slice(0,12).map(product).join('')}</div></section>`:''}
        <section class="v2-section v2-songs-section" id="v2Songs"><div class="v2-section-heading v2-songs-heading"><div><h2>Songs</h2><span data-count>${state.visible.length} of ${state.songs.length}</span></div><button class="v2-tool-button" data-search>${icon.search}<span>Search</span></button></div><div class="v2-song-grid" data-grid>${state.visible.map(card).join('')}</div></section>
      </main>
      <section class="v2-search-sheet" data-search-sheet hidden><div class="v2-sheet-bar"><label class="v2-search-field">${icon.search}<input type="search" data-input placeholder="Song, artist, or genre"></label><button class="v2-sheet-close" data-done>Done</button></div><div class="v2-search-results" data-results></div></section>
      <section class="v2-player" data-player hidden><div class="v2-player-backdrop" data-backdrop></div><div class="v2-player-shade"></div><header class="v2-player-header"><button class="v2-icon-button" data-close>${icon.back}</button><a class="v2-player-mark" href="/radio/dev/v2/">STASH<span>BOX</span></a></header><div class="v2-player-content player-info"><div class="v2-player-labels"><span data-pgenre></span><b><i></i>Now Playing</b></div><h2 data-ptitle></h2><div class="meta v2-artist-row"><span class="v2-mini-avatar" data-avatar></span><strong data-partist></strong></div><div class="v2-timeline"><input type="range" min="0" max="0" value="0" step=".1" data-scrub><div><span data-now>0:00</span><span data-total>0:00</span></div></div><div class="v2-player-controls"><button class="v2-side-action" data-like>${icon.heart}<span data-likes>0</span></button><button class="v2-transport" data-prev>${icon.prev}</button><button class="v2-main-play" data-play>${icon.play}</button><button class="v2-transport" data-next>${icon.next}</button><button class="v2-side-action" data-share>${icon.share}</button></div></div><audio data-audio preload="metadata" playsinline></audio></section>`;
    bind();
  }
  function bind(){
    app.onclick=e=>{
      const el=e.target.closest('[data-song]'); if(el)return openSong(el.dataset.song,true);
      if(e.target.closest('[data-search]'))return openSearch();
      if(e.target.closest('[data-done]'))return closeSearch();
      if(e.target.closest('[data-to-songs]'))return document.getElementById('v2Songs')?.scrollIntoView({behavior:'smooth'});
      const a=e.target.closest('[data-artist]')?.dataset.artist; if(a){state.query=a;refresh();return document.getElementById('v2Songs')?.scrollIntoView({behavior:'smooth'});}
      const g=e.target.closest('[data-genre]')?.dataset.genre; if(g){state.genre=g;refresh();return document.getElementById('v2Songs')?.scrollIntoView({behavior:'smooth'});}
      if(e.target.closest('[data-close]'))return closePlayer();
      if(e.target.closest('[data-play]'))return toggle();
      if(e.target.closest('[data-next]'))return adjacent(1);
      if(e.target.closest('[data-prev]'))return adjacent(-1);
      if(e.target.closest('[data-share]'))return share();
      if(e.target.closest('[data-like]'))return like();
      if(e.target.closest('.v2-notifications-trigger'))return document.querySelector('.sbr-notification-bell')?.click();
    };
    const input=app.querySelector('[data-input]'); if(input)input.oninput=()=>{state.query=input.value;searchResults();};
    const audio=getAudio(); if(audio){audio.ontimeupdate=timeline;audio.onloadedmetadata=timeline;audio.onplay=playIcon;audio.onpause=playIcon;audio.onended=()=>adjacent(1);}
    const scrub=app.querySelector('[data-scrub]'); if(scrub)scrub.oninput=()=>{if(audio)audio.currentTime=Number(scrub.value)||0;};
  }
  function refresh(){filter();const grid=app.querySelector('[data-grid]');if(grid)grid.innerHTML=state.visible.map(card).join('');const c=app.querySelector('[data-count]');if(c)c.textContent=`${state.visible.length} of ${state.songs.length}`;}
  function openSearch(){const s=app.querySelector('[data-search-sheet]');if(s)s.hidden=false;document.body.classList.add('v2-sheet-open');searchResults();setTimeout(()=>app.querySelector('[data-input]')?.focus(),30);}
  function closeSearch(){const s=app.querySelector('[data-search-sheet]');if(s)s.hidden=true;document.body.classList.remove('v2-sheet-open');refresh();}
  function searchResults(){filter();const r=app.querySelector('[data-results]');if(r)r.innerHTML=`<div class="v2-search-result-list">${state.visible.slice(0,30).map(s=>`<button data-song="${esc(s.key)}"><span>${art(s)}</span><div><strong>${esc(s.title)}</strong><small>${esc(s.artist)} · ${esc(s.genre)}</small></div></button>`).join('')}</div>`;}
  function openSong(key,auto){const s=state.songs.find(x=>x.key===key);if(!s)return;state.selected=s;state.queue=state.visible.length?[...state.visible]:[...state.songs];state.index=Math.max(0,state.queue.findIndex(x=>x.key===key));const p=app.querySelector('[data-player]');if(p)p.hidden=false;document.body.classList.add('v2-player-open');app.querySelector('[data-ptitle]').textContent=s.title;app.querySelector('[data-partist]').textContent=s.artist;app.querySelector('[data-pgenre]').textContent=s.genre;app.querySelector('[data-avatar]').innerHTML=art(s);app.querySelector('[data-likes]').textContent=s.likes;app.querySelector('[data-backdrop]').style.backgroundImage=`url("${s.art.replaceAll('"','%22')}")`;const a=getAudio();if(a){a.src=s.audio||'';a.load();if(auto&&s.audio)a.play().catch(()=>{});else if(!s.audio&&s.video)window.open(s.video,'_blank','noopener');}}
  function closePlayer(){const p=app.querySelector('[data-player]');if(p)p.hidden=true;document.body.classList.remove('v2-player-open');}
  function getAudio(){return app.querySelector('[data-audio]');}
  function toggle(){const a=getAudio();if(!a)return;a.paused?a.play().catch(()=>{}):a.pause();}
  function playIcon(){const b=app.querySelector('[data-play]'),a=getAudio();if(b)b.innerHTML=a&&!a.paused?icon.pause:icon.play;}
  function adjacent(d){if(!state.queue.length)return;state.index=(state.index+d+state.queue.length)%state.queue.length;openSong(state.queue[state.index].key,true);}
  function timeline(){const a=getAudio(),s=app.querySelector('[data-scrub]');if(!a||!s)return;const d=Number.isFinite(a.duration)?a.duration:0,c=Number.isFinite(a.currentTime)?a.currentTime:0;s.max=d;s.value=c;const f=x=>`${Math.floor(x/60)}:${String(Math.floor(x%60)).padStart(2,'0')}`;app.querySelector('[data-now]').textContent=f(c);app.querySelector('[data-total]').textContent=f(d);}
  function like(){if(!state.selected)return;state.selected.likes+=1;app.querySelector('[data-likes]').textContent=state.selected.likes;track('like');}
  async function share(){if(!state.selected)return;const u=new URL('/radio/dev/v2/',location.origin);u.searchParams.set('song',state.selected.key);try{if(navigator.share)await navigator.share({title:state.selected.title,url:u.toString()});else await navigator.clipboard.writeText(u.toString());track('share');}catch(_){}}
  function track(action){if(!state.selected)return;fetch(TRACK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,event_type:action,song_key:state.selected.key,display_title:state.selected.title,artist:state.selected.artist,source:'radio_dev_v2'}),keepalive:true}).catch(()=>{});}
  async function json(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}
  async function init(){try{const sd=await json(SONGS);state.songs=rows(sd,['songs','items','data']).map(song).filter(s=>s.key&&s.title);if(!state.songs.length)throw new Error('No songs returned by DEV API');try{const pd=await json(SHOP);state.products=rows(pd,['products']).slice(0,24);}catch(e){console.warn('[V2] shop unavailable',e);}render();const requested=new URLSearchParams(location.search).get('song');if(requested)openSong(requested,false);}catch(e){console.error('[V2]',e);app.innerHTML=`<section class="v2-load-error"><span>STASH<span>BOX</span></span><h1>Radio V2 could not load</h1><p>${esc(e.message||'Unknown loading error')}</p><button onclick="location.reload()">Retry</button></section>`;}}
  init();
})();