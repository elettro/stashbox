(() => {
  // DEV-only compatibility bridge. Artist CMS app.js historically requests the
  // heavyweight /admin/stats/songs?limit=500 endpoint. Intercept only that exact
  // request, call the lightweight artist aggregate endpoint, then adapt the tiny
  // response to the existing app.js shape. If the new route fails, fall back to
  // the untouched legacy request so the CMS remains usable during verification.
  const LEGACY_PATH = '/admin/stats/songs?limit=500';
  const AGGREGATE_PATH = '/radio/admin/artists/performance';
  const originalFetch = window.fetch.bind(window);

  function requestUrl(input) {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    return String(input?.url || '');
  }

  function isLegacyArtistStatsRequest(url) {
    try {
      const parsed = new URL(url, window.location.href);
      return `${parsed.pathname}${parsed.search}`.endsWith(LEGACY_PATH);
    } catch (_) {
      return false;
    }
  }

  async function legacyFetch(input, init) {
    return originalFetch(input, init);
  }

  window.fetch = async function artistPerformanceFetch(input, init) {
    const url = requestUrl(input);
    if (!isLegacyArtistStatsRequest(url)) return originalFetch(input, init);

    try {
      const parsed = new URL(url, window.location.href);
      parsed.pathname = AGGREGATE_PATH;
      parsed.search = '';

      const response = await originalFetch(parsed.toString(), init);
      if (!response.ok) return legacyFetch(input, init);

      const data = await response.json();
      if (!Array.isArray(data.performance)) return legacyFetch(input, init);

      const songs = data.performance.map(row => ({
        artist: row.name || row.artist_key || '',
        likes: Number(row.total_likes || 0),
        shares: Number(row.total_shares || 0),
        total_seconds_played: Number(row.total_listening_seconds || 0),
        total_seconds: Number(row.total_listening_seconds || 0)
      }));

      const headers = new Headers(response.headers);
      headers.set('Content-Type', 'application/json');
      headers.set('X-Stashbox-Stats-Source', 'artist-performance-aggregate');

      return new Response(JSON.stringify({
        success: true,
        count: songs.length,
        songs,
        generated_at: data.generated_at,
        source: 'artist-performance-aggregate'
      }), {
        status: 200,
        statusText: 'OK',
        headers
      });
    } catch (error) {
      console.warn('[Artist CMS] aggregate performance route unavailable; using legacy song stats fallback', error);
      return legacyFetch(input, init);
    }
  };
})();
