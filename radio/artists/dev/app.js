(() => {
  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const FALLBACK = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const params = new URLSearchParams(location.search);
  const identifier = params.get('artist') || params.get('slug') || 'stashbox';
  const root = document.getElementById('app');
  let artist = null;

  function tokens(){try{return JSON.parse(localStorage.getItem(TOKEN_KEY)||'null')||{}}catch(_){return{}}}
  function headers(){const t=tokens(),h={};if(t.accessToken)h.Authorization=`Bearer ${t.accessToken}`;if(t.idToken)h['X-Cognito-Id-Token']=t.idToken;return h}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
  async function api(url,options={}){const response=await fetch(url,{cache:'no-store',...options,headers:{...headers(),...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||`HTTP ${response.status}`);return body}
  function songArtwork(song){return song.song_artwork_url||song.artwork_url||song.cover_art_url||FALLBACK}
  function render(data){artist=data.artist;document.title=`${artist.name} · Stashbox Radio`;const links=[['Website',artist.website_url],['Spotify',artist.spotify_url],['Apple Music',artist.apple_music_url],['YouTube',artist.youtube_url],['Instagram',artist.instagram_url],['X / Twitter',artist.x_url],['Facebook',artist.facebook_url],['Merch',artist.merch_url]].filter(([,url])=>url);root.innerHTML=`
    <section class="hero"><div class="banner" style="background-image:url('${esc(artist.banner_image_url||artist.profile_image_url||'')}')"></div><div class="identity">
      <img class="avatar" src="${esc(artist.profile_image_url||FALLBACK)}" alt="${esc(artist.name)}" onerror="this.src='${FALLBACK}'">
      <div><h1>${esc(artist.name)} ${artist.verified?'<span class="verified">✓ Verified</span>':''}</h1><p class="location">${esc(artist.location||'')}</p><p class="followers"><strong id="followerCount">${Number(artist.follower_count||0).toLocaleString()}</strong> followers · ${Number(artist.song_count||0)} songs</p></div>
      <div class="actions"><button id="followButton" class="button ${artist.is_following?'following':''}" type="button">${artist.is_following?'Following':'Follow'}</button><a class="button following" href="/radio/dev/?artist=${encodeURIComponent(artist.artist_key)}">Open Radio</a></div>
    </div></section>
    <div class="content"><section class="card"><h2>Music</h2><div class="song-list">${(data.songs||[]).map(song=>`<article class="song" data-song="${esc(song.song_key)}"><img src="${esc(songArtwork(song))}" alt="" onerror="this.src='${FALLBACK}'"><div><strong>${esc(song.display_title||song.song_name||song.song_key)}</strong><span>${esc(song.artist||artist.name)}${song.album_name?` · ${esc(song.album_name)}`:''}</span></div><span class="play">▶ Play</span></article>`).join('')||'<p class="bio">No songs assigned yet.</p>'}</div></section><aside class="card"><h2>About</h2><p class="bio">${esc(artist.bio||'Artist biography coming soon.')}</p><div class="links">${links.map(([name,url])=>`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(name)}</a>`).join('')}</div></aside></div>`;
    document.getElementById('followButton').addEventListener('click',toggleFollow);
    root.querySelectorAll('[data-song]').forEach(row=>row.addEventListener('click',()=>{location.href=`/radio/dev/?song=${encodeURIComponent(row.dataset.song)}`}));
  }
  async function toggleFollow(){if(!tokens().accessToken){sessionStorage.setItem('stashbox_radio_dev_pending_artist_follow',artist.artist_key);location.href='/radio/dev/?follow_artist='+encodeURIComponent(artist.artist_key);return}const method=artist.is_following?'DELETE':'POST';const data=await api(`${API_ROOT}/radio/me/follows/${encodeURIComponent(artist.artist_key)}`,{method,body:method==='POST'?JSON.stringify({notifications_enabled:true}):undefined});artist=data.artist;const button=document.getElementById('followButton');button.textContent=artist.is_following?'Following':'Follow';button.classList.toggle('following',artist.is_following);document.getElementById('followerCount').textContent=Number(artist.follower_count||0).toLocaleString()}
  api(`${API_ROOT}/radio/artists/${encodeURIComponent(identifier)}`).then(render).catch(error=>{root.innerHTML=`<div class="error">${esc(error.message)}</div>`});
})();
