(() => {
  'use strict';

  if (window.StashboxProfileFetchRepair) return;

  const API_ROOT = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const sessionFetch = window.fetch.bind(window);

  function requestUrl(input) {
    return input instanceof Request ? input.url : String(input || '');
  }

  function requestHeaders(input, init = {}) {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
    return headers;
  }

  function requestMethod(input, init = {}) {
    return String(init.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
  }

  function isNetworkFetchError(error) {
    const message = String(error?.message || '');
    return error instanceof TypeError
      || /load failed|failed to fetch|network(?:error| request failed)|internet connection appears to be offline/i.test(message);
  }

  async function protectedProfileFetch(input, init = {}) {
    try {
      // Keep authenticated profile traffic inside v2-session-manager so access
      // tokens are refreshed and Safari's X-Cognito-Id-Token recovery runs.
      return await sessionFetch(input, init);
    } catch (firstError) {
      if (requestMethod(input, init) !== 'GET' || !isNetworkFetchError(firstError)) throw firstError;
      await new Promise(resolve => window.setTimeout(resolve, 300));
      return sessionFetch(input, init);
    }
  }

  window.fetch = function profileSafeFetch(input, init = {}) {
    const url = requestUrl(input);
    const headers = requestHeaders(input, init);
    const protectedApiRequest = url.startsWith(API_ROOT)
      && (/^Bearer\s+/i.test(headers.get('Authorization') || '') || headers.has('X-Cognito-Id-Token'));

    if (protectedApiRequest) return protectedProfileFetch(input, init);
    return sessionFetch(input, init);
  };

  window.StashboxProfileFetchRepair = Object.freeze({
    active: true,
    apiRoot: API_ROOT,
    mode: 'renewable-session'
  });
})();