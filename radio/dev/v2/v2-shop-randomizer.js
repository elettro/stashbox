(() => {
  'use strict';

  const originalFetch = window.fetch.bind(window);

  const shuffle = items => {
    const list = [...items];
    for (let index = list.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [list[index], list[randomIndex]] = [list[randomIndex], list[index]];
    }
    return list;
  };

  window.fetch = async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input?.url;
    if (!rawUrl || !rawUrl.includes('stashbox.ai/products.json')) {
      return originalFetch(input, init);
    }

    const requestUrl = new URL(rawUrl, window.location.href);
    requestUrl.searchParams.set('limit', '250');
    requestUrl.searchParams.set('_v2random', `${Date.now()}-${Math.random()}`);

    const response = await originalFetch(requestUrl.toString(), {
      ...init,
      cache: 'no-store'
    });

    if (!response.ok) return response;

    try {
      const data = await response.json();
      if (Array.isArray(data?.products)) {
        data.products = shuffle(data.products).slice(0, 50);
      }

      return new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (_) {
      return response;
    }
  };
})();
