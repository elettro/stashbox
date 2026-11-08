/* Stashbox Radio: YouTube-sourced songs (controlled experiment, 2 songs only).
 *
 * For the songs in YT_SONGS the radio plays the song's YouTube video (picture AND sound) instead of
 * the radio audio file and the dynamic VEC. Every other song is untouched.
 *
 * Design notes
 *  - One persistent YouTube player is created the first time it is needed and re-used (loadVideoById),
 *    so on iPhone a single tap on YouTube's own play button "unlocks" it for later YouTube songs.
 *  - If the browser blocks autoplay, the frame is raised above the radio controls and a hint asks for a tap
 *    (a phone only lets a tap on YouTube's own player start a video with sound).
 *  - If nothing is playing after NEEDTAP_FALLBACK_MS the song plays the normal way (radio audio + VEC)
 *    so the queue never sits in silence. A song that fell back is not retried until selected again.
 *  - End of song: YouTube ENDED (trusted only if the playhead is within 2 s of the end) plus a backup
 *    watcher, then the radio's own next-song handler runs (queue, shuffle, commercials work as before).
 *  - No play-tracker call is made for these plays (by design).
 */
(function () {
  'use strict';
  // vertical:true = the YouTube video is a 9:16 picture inside a 16:9 frame; on a portrait screen it is scaled to fill the screen
  var YT_SONGS = {
    'gazing-shoe-jam-03b-dean-jam-stashbox': { id: 'cTAlf89ivtA', vertical: true }
  };
  var NEEDTAP_AFTER_MS = 1500;     // not playing yet: show the tap hint and make the frame tappable
  var NEEDTAP_FALLBACK_MS = 10000; // still not playing: use the normal radio audio + VEC

  var PLAY_SVG = '<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7Z"></path></svg>';
  var PAUSE_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';

  var css = document.createElement('style');
  css.textContent =
    '.v2-player[data-yt-song] [data-mobile-vec-stage],.v2-player[data-yt-song] .v2-mobile-vec-stage,' +
    '.v2-player[data-yt-song] .desktop-vec2-stage,.v2-player[data-yt-song] .desktop-vec2-layer,' +
    '.v2-player[data-yt-song] [data-guest-vec-gate],.v2-player[data-yt-song] .v2-player-shade{display:none!important}' +
    '.v2-player[data-yt-song]:not([data-yt-dim]) .v2-player-backdrop{background-image:none!important;background:#000!important}' +
    /* video not playing (paused / ended / waiting): hide YouTube's own overlay screens, show the normal artwork */
    '.v2-player[data-yt-dim] .sb-yt-layer:not(.sb-needtap){opacity:0;visibility:hidden}' +
    '.sb-yt-layer{position:absolute;inset:0;z-index:-2;background:#000;display:flex;align-items:center;justify-content:center;pointer-events:none}' +
    '.sb-yt-layer[hidden]{display:none!important}' +
    '.sb-yt-frame{position:relative;width:100%;max-height:100%;aspect-ratio:16/9}' +
    '.sb-yt-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none}' +
    /* autoplay blocked: lift the frame above the radio controls so YouTube\'s own play button is visible and tappable */
    '.sb-yt-layer.sb-needtap{z-index:50;pointer-events:auto}' +
    '.sb-yt-layer.sb-needtap .sb-yt-frame iframe{pointer-events:auto}' +
    '@media (orientation:portrait){' +
      '.sb-yt-layer.sb-vertical{display:block;overflow:hidden}' +
      '.sb-yt-layer.sb-vertical .sb-yt-frame{position:absolute;top:0;bottom:0;left:50%;height:100%;width:auto;max-height:none;aspect-ratio:16/9;transform:translateX(-50%)}' +
    '}' +
    '.sb-yt-hint{display:none;position:absolute;left:50%;top:10px;transform:translateX(-50%);padding:7px 14px;border-radius:999px;background:rgba(0,0,0,.72);color:#fff;font:700 14px/1.2 system-ui,sans-serif;letter-spacing:.02em;white-space:nowrap;pointer-events:none}' +
    '.sb-yt-layer.sb-needtap .sb-yt-hint{display:block}' +
    /* same top/bottom darkening the radio's own VEC video gets, so the labels stay readable */
    '.sb-yt-layer::after{content:"";position:absolute;inset:0;z-index:3;pointer-events:none;background:linear-gradient(to bottom,rgba(2,3,4,.44) 0%,rgba(2,3,4,.04) 24%,rgba(2,3,4,.05) 56%,rgba(2,3,4,.72) 82%,#050607 100%)}' +
    '.sb-yt-layer.sb-needtap::after{display:none}';
  document.head.appendChild(css);

  /* ---- YouTube API loader ---- */
  var apiLoading = false, apiWaiters = [];
  function loadApi(cb) {
    if (window.YT && YT.Player) return cb();
    apiWaiters.push(cb);
    if (apiLoading) return;
    apiLoading = true;
    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof prev === 'function') try { prev(); } catch (_) {}
      apiWaiters.splice(0).forEach(function (f) { try { f(); } catch (_) {} });
    };
    var s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = function () { apiWaiters.splice(0).forEach(function (f) { f(true); }); };
    document.head.appendChild(s);
  }

  /* ---- state ---- */
  var yp = null;        // persistent: { player, ready, layer, pendingId }
  var cur = null;       // current YouTube song: { key, id, started, timers... }
  var fellBack = null;  // song key that fell back to radio audio; not retried until selected again

  function pl() { return document.querySelector('[data-player]'); }
  function audioEl() { return document.querySelector('[data-audio]'); }
  function fmt(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  function setIcon(playing) {
    var b = document.querySelector('[data-play]');
    if (!b) return;
    var want = playing ? PAUSE_SVG : PLAY_SVG;
    if (b.getAttribute('data-sb-icon') !== (playing ? 'p' : 'l')) { b.innerHTML = want; b.setAttribute('data-sb-icon', playing ? 'p' : 'l'); }
  }

  function dim(on) { var p = pl(); if (!p) return; if (on) p.setAttribute('data-yt-dim', '1'); else p.removeAttribute('data-yt-dim'); }

  function needTap(on) { if (yp && yp.layer) yp.layer.classList.toggle('sb-needtap', !!on); }

  function ensurePlayer(done) {
    var p = pl();
    if (yp && yp.layer && yp.layer.isConnected && yp.ready) return done(false);
    if (yp && yp.layer && !yp.layer.isConnected) { try { yp.player && yp.player.destroy(); } catch (_) {} yp = null; } // radio re-rendered the player
    if (yp && !yp.ready) { yp.waiters.push(done); return; }
    if (!p) return done(true);
    var layer = document.createElement('div');
    layer.className = 'sb-yt-layer';
    layer.innerHTML = '<div class="sb-yt-frame"><div id="sbYtHost"></div><div class="sb-yt-hint">Tap the video to start</div></div>';
    p.insertBefore(layer, p.querySelector('.v2-player-header') || p.firstChild);
    yp = { player: null, ready: false, layer: layer, waiters: [done] };
    var me = yp;
    loadApi(function (failed) {
      if (yp !== me) return;
      if (failed || !(window.YT && YT.Player)) { yp = null; if (layer.parentNode) layer.parentNode.removeChild(layer); me.waiters.splice(0).forEach(function (f) { f(true); }); return; }
      me.player = new YT.Player('sbYtHost', {
        width: '100%', height: '100%',
        playerVars: { controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, iv_load_policy: 3, playsinline: 1, enablejsapi: 1, origin: location.origin },
        events: {
          onReady: function () { me.ready = true; me.waiters.splice(0).forEach(function (f) { f(false); }); },
          onStateChange: onState,
          onError: onError
        }
      });
    });
  }

  function clearTimers() { if (cur) { clearTimeout(cur.tapTimer); clearTimeout(cur.fallbackTimer); clearInterval(cur.watch); } }

  /* stop showing YouTube; keep the player alive for the next YouTube song */
  function deactivate(restoreRadio) {
    var c = cur; cur = null;
    if (c) clearTimers();
    if (yp && yp.player && yp.ready) { try { yp.player.pauseVideo(); } catch (_) {} }
    needTap(false);
    if (yp && yp.layer) yp.layer.hidden = true;
    var p = pl(); if (p) { p.removeAttribute('data-yt-song'); p.removeAttribute('data-yt-dim'); }
    var b = document.querySelector('[data-play]'); if (b) b.removeAttribute('data-sb-icon');
    if (restoreRadio) { var a = audioEl(); if (a) { try { a.play().catch(function () {}); } catch (_) {} } }
  }

  function fallBack(why) {
    if (!cur) return;
    console.warn('[yt-songs] ' + why + ', using radio audio');
    fellBack = cur.key;
    deactivate(true);
  }

  function advance() {
    var a = audioEl();
    deactivate(false);
    if (a) a.dispatchEvent(new Event('ended')); // the radio's own next-song handler
  }

  function activate(key) {
    var cfg = YT_SONGS[key], p = pl();
    if (!cfg || !p) return;
    var a = audioEl();
    if (a) { try { a.pause(); } catch (_) {} } // radio audio stays silent: YouTube is the sound for this song
    cur = { key: key, id: cfg.id, started: false, lastT: 0, lastMove: Date.now(), scrubbing: false };
    var me = cur;
    p.setAttribute('data-yt-song', key);
    setIcon(false); dim(true);
    ensurePlayer(function (failed) {
      if (cur !== me) return;
      if (failed) { fallBack('YouTube API failed'); return; }
      yp.layer.hidden = false; yp.layer.classList.toggle('sb-vertical', !!cfg.vertical);
      try { yp.player.unMute(); yp.player.setVolume(100); yp.player.loadVideoById(me.id); } catch (_) { fallBack('YouTube load failed'); return; }
      me.tapTimer = setTimeout(function () { if (cur === me && !me.started) needTap(true); }, NEEDTAP_AFTER_MS);
      me.fallbackTimer = setTimeout(function () { if (cur === me && !me.started) fallBack('nobody started the video'); }, NEEDTAP_FALLBACK_MS);
      me.watch = setInterval(function () { tick(me); }, 500);
    });
  }

  function onState(e) {
    if (!cur || !yp) return;
    var me = cur, s = e.data;
    if (s === 1) { me.started = true; clearTimeout(me.tapTimer); clearTimeout(me.fallbackTimer); needTap(false); dim(false); setIcon(true); }
    else if (s === 2) { dim(true); setIcon(false); }
    else if (s === 0) {
      dim(true);
      var ct = 0, du = 0; try { ct = yp.player.getCurrentTime(); du = yp.player.getDuration(); } catch (_) {}
      if (du > 0 && ct >= du - 2) advance(); // an ad's ENDED is ignored
    }
  }
  function onError() { if (cur) fallBack('YouTube error'); }

  function tick(me) {
    if (cur !== me || !yp || !yp.player || !yp.player.getPlayerState) return;
    var st, ct, du;
    try { st = yp.player.getPlayerState(); ct = yp.player.getCurrentTime(); du = yp.player.getDuration(); } catch (_) { return; }
    var scrub = document.querySelector('[data-scrub]');
    if (scrub && du > 0 && !me.scrubbing) { scrub.max = du; scrub.value = ct; }
    var n = document.querySelector('[data-now]'), t = document.querySelector('[data-total]');
    if (n) n.textContent = fmt(ct);
    if (t && du > 0) t.textContent = fmt(du);
    setIcon(st === 1 || st === 3);
    dim(!(st === 1 || st === 3));
    var a = audioEl(); if (a && !a.paused) { try { a.pause(); } catch (_) {} } // keep the radio audio silent
    if (Math.abs(ct - me.lastT) > 0.05) { me.lastT = ct; me.lastMove = Date.now(); }
    if (st === 1 && du > 5) {
      var still = (Date.now() - me.lastMove) / 1000;
      if (ct >= du - 0.4 || (ct >= du - 4 && still > 3)) advance(); // backup end detector
    }
  }

  /* ---- wiring ---- */
  window.addEventListener('stashbox:v2-current-song', function (e) {
    var key = e && e.detail && e.detail.songKey;
    if (cur && cur.key === key) return;
    fellBack = null; // a fresh selection gets a fresh try
    if (cur) deactivate(false);
    if (key && YT_SONGS[key]) setTimeout(function () { activate(key); }, 0); // the radio calls audio.play() right after this event
  });

  // a song opened by the page URL fires its event before this script runs: catch up
  function catchUp() {
    var p = pl(); if (!p || p.hidden) return;
    var key = p.dataset.currentSongKey || p.dataset.songKey;
    if (key && YT_SONGS[key] && fellBack !== key && (!cur || cur.key !== key)) { if (cur) deactivate(false); activate(key); }
  }
  var tries = 0, catchTimer = setInterval(function () { catchUp(); if (++tries > 20) clearInterval(catchTimer); }, 500);

  // radio play / pause drives YouTube while a YouTube song is up
  document.addEventListener('click', function (ev) {
    if (!cur || !yp || !yp.ready) return;
    var b = ev.target.closest && ev.target.closest('[data-play]');
    if (!b) return;
    ev.stopImmediatePropagation(); ev.preventDefault();
    try { yp.player.getPlayerState() === 1 ? yp.player.pauseVideo() : yp.player.playVideo(); } catch (_) {}
  }, true);

  // scrub bar seeks YouTube
  document.addEventListener('input', function (ev) {
    if (!cur || !yp || !yp.ready || !ev.target.matches || !ev.target.matches('[data-scrub]')) return;
    ev.stopImmediatePropagation();
    try { yp.player.seekTo(Number(ev.target.value) || 0, true); } catch (_) {}
  }, true);

  // closing the player stops the video
  document.addEventListener('click', function (ev) {
    if (cur && ev.target.closest && ev.target.closest('[data-close]')) deactivate(false);
  }, true);
})();
