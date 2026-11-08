/* Stashbox Radio: YouTube-sourced songs (test, 2 songs only).
 * For the songs listed in YT_SONGS the radio plays the song's YouTube video
 * (picture AND sound) instead of the radio audio file and the dynamic VEC.
 * Every other song is untouched. If YouTube fails, the song falls back to the
 * normal radio audio + VEC. No play-tracker call is made for these plays (by design).
 */
(function () {
  'use strict';
  var YT_SONGS = {
    'yoga-pants-for-days-the-ras-box': { id: '0twKQHXB7XI' },
    'help-jamaica-now-stashbox': { id: 'sdJMMhZ6cgo' }
  };
  var START_TIMEOUT_MS = 5000; // not playing by then (iPhone blocks autoplay): use the normal radio audio + VEC, never dead air

  var css = document.createElement('style');
  css.textContent =
    '.v2-player[data-yt-song] [data-mobile-vec-stage],.v2-player[data-yt-song] .v2-mobile-vec-stage,' +
    '.v2-player[data-yt-song] .desktop-vec2-stage,.v2-player[data-yt-song] .desktop-vec2-layer,' +
    '.v2-player[data-yt-song] [data-guest-vec-gate],.v2-player[data-yt-song] .v2-player-shade{display:none!important}' +
    '.v2-player[data-yt-song] .v2-player-backdrop{background-image:none!important;background:#000!important}' +
    '.sb-yt-layer{position:absolute;inset:0;z-index:1;background:#000;display:flex;align-items:center;justify-content:center;pointer-events:none}' +
    '.sb-yt-frame{position:relative;width:100%;max-height:100%;aspect-ratio:16/9}' +
    '.sb-yt-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none}' +
    '.v2-player[data-yt-song] .v2-player-header,.v2-player[data-yt-song] .v2-player-content{position:relative;z-index:2}';
  document.head.appendChild(css);

  var api = null, apiLoading = false, apiWaiters = [];
  function loadApi(cb) {
    if (window.YT && YT.Player) return cb();
    apiWaiters.push(cb);
    if (apiLoading) return;
    apiLoading = true;
    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof prev === 'function') try { prev(); } catch (_) {}
      var w = apiWaiters.splice(0); w.forEach(function (f) { try { f(); } catch (_) {} });
    };
    var s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = function () { apiWaiters.splice(0).forEach(function (f) { f(true); }); };
    document.head.appendChild(s);
  }

  var fellBack = null; // song key that fell back to radio audio; do not retry until it is selected again
  var cur = null; // { key, id, player, ready, started, timer, watch, layer, playHTML }
  var PAUSE_SVG = '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';

  function pl() { return document.querySelector('[data-player]'); }
  function audioEl() { return document.querySelector('[data-audio]'); }
  function fmt(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  function setIcon(playing) {
    var b = document.querySelector('[data-play]');
    if (!b || !cur) return;
    if (!cur.playHTML) cur.playHTML = b.innerHTML;
    b.innerHTML = playing ? PAUSE_SVG : cur.playHTML;
  }

  function teardown(restoreRadio) {
    if (!cur) return;
    var c = cur; cur = null;
    clearTimeout(c.timer); clearInterval(c.watch);
    try { c.player && c.player.destroy(); } catch (_) {}
    if (c.layer && c.layer.parentNode) c.layer.parentNode.removeChild(c.layer);
    var p = pl();
    if (p) p.removeAttribute('data-yt-song');
    if (restoreRadio) {
      var a = audioEl();
      if (a) { try { a.play().catch(function () {}); } catch (_) {} }
    }
  }

  function advance() {
    var a = audioEl();
    teardown(false);
    if (a) a.dispatchEvent(new Event('ended')); // the radio's own next-song handler
  }

  function activate(key) {
    var cfg = YT_SONGS[key], p = pl();
    if (!cfg || !p) return;
    var a = audioEl();
    var layer = document.createElement('div');
    layer.className = 'sb-yt-layer';
    layer.innerHTML = '<div class="sb-yt-frame"><div id="sbYtHost"></div></div>';
    p.insertBefore(layer, p.querySelector('.v2-player-header') || p.firstChild);
    p.setAttribute('data-yt-song', key);
    cur = { key: key, id: cfg.id, layer: layer, ready: false, started: false, lastT: 0, lastMove: Date.now() };
    var me = cur;
    // radio audio must stay silent: YouTube is the sound source for this song
    if (a) { try { a.pause(); } catch (_) {} }
    me.timer = setTimeout(function () {
      if (cur === me && !me.started) { console.warn('[yt-songs] YouTube did not start playing, using radio audio'); fellBack = me.key; teardown(true); }
    }, START_TIMEOUT_MS);
    loadApi(function (failed) {
      if (cur !== me) return;
      if (failed || !(window.YT && YT.Player)) { fellBack = me.key; teardown(true); return; }
      me.player = new YT.Player('sbYtHost', {
        width: '100%', height: '100%', videoId: me.id,
        playerVars: { controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, iv_load_policy: 3, playsinline: 1, enablejsapi: 1, autoplay: 1, origin: location.origin },
        events: {
          onReady: function () { if (cur !== me) return; me.ready = true; try { me.player.unMute(); me.player.setVolume(100); me.player.playVideo(); } catch (_) {} },
          onStateChange: function (e) {
            if (cur !== me) return;
            var s = e.data;
            if (s === 1) { me.started = true; clearTimeout(me.timer); setIcon(true); }
            else if (s === 2) setIcon(false);
            else if (s === 0) {
              var ct = 0, du = 0; try { ct = me.player.getCurrentTime(); du = me.player.getDuration(); } catch (_) {}
              if (du > 0 && ct >= du - 2) advance(); // ignore an ad's ENDED
            }
          },
          onError: function () { if (cur === me) { console.warn('[yt-songs] YouTube error, using radio audio'); fellBack = me.key; teardown(true); } }
        }
      });
      me.watch = setInterval(function () { tick(me); }, 500);
    });
  }

  function tick(me) {
    if (cur !== me || !me.player || !me.player.getPlayerState) return;
    var st, ct, du;
    try { st = me.player.getPlayerState(); ct = me.player.getCurrentTime(); du = me.player.getDuration(); } catch (_) { return; }
    // keep the radio's own timeline widgets in step with YouTube
    var scrub = document.querySelector('[data-scrub]');
    if (scrub && du > 0 && !me.scrubbing) { scrub.max = du; scrub.value = ct; }
    var n = document.querySelector('[data-now]'), t = document.querySelector('[data-total]');
    if (n) n.textContent = fmt(ct); if (t && du > 0) t.textContent = fmt(du);
    // keep the radio audio silent
    var a = audioEl(); if (a && !a.paused) { try { a.pause(); } catch (_) {} }
    if (Math.abs(ct - me.lastT) > 0.05) { me.lastT = ct; me.lastMove = Date.now(); }
    if (st === 1 && du > 5) {
      var still = (Date.now() - me.lastMove) / 1000;
      if (ct >= du - 0.4 || (ct >= du - 4 && still > 3)) advance(); // backup end detector
    }
  }

  window.addEventListener('stashbox:v2-current-song', function (e) {
    var key = e && e.detail && e.detail.songKey;
    if (cur && cur.key === key) return;
    fellBack = null; // a fresh selection gets a fresh try
    teardown(false);
    if (key && YT_SONGS[key]) {
      // the radio calls audio.play() just after this event; wait a tick, then take over
      setTimeout(function () { activate(key); }, 0);
    }
  });

  // a song opened by the page URL fires its event before this script runs: catch up
  function catchUp() {
    var p = pl(); if (!p || p.hidden) return;
    var key = p.dataset.currentSongKey || p.dataset.songKey;
    if (key && YT_SONGS[key] && fellBack !== key && (!cur || cur.key !== key)) { teardown(false); activate(key); }
  }
  var tries = 0, catchTimer = setInterval(function () { catchUp(); if (++tries > 20) clearInterval(catchTimer); }, 500);

  // play / pause button drives YouTube while a YouTube song is up
  document.addEventListener('click', function (ev) {
    if (!cur || !cur.player || !cur.ready) return;
    var b = ev.target.closest && ev.target.closest('[data-play]');
    if (!b) return;
    ev.stopImmediatePropagation(); ev.preventDefault();
    try { cur.player.getPlayerState() === 1 ? cur.player.pauseVideo() : cur.player.playVideo(); } catch (_) {}
  }, true);

  // scrub bar seeks YouTube
  document.addEventListener('input', function (ev) {
    if (!cur || !cur.player || !ev.target.matches || !ev.target.matches('[data-scrub]')) return;
    ev.stopImmediatePropagation();
    try { cur.player.seekTo(Number(ev.target.value) || 0, true); } catch (_) {}
  }, true);

  // closing the player stops the video
  document.addEventListener('click', function (ev) {
    if (cur && ev.target.closest && ev.target.closest('[data-close]')) teardown(false);
  }, true);
})();
