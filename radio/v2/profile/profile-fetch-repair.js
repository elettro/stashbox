(() => {
  'use strict';

  if (window.StashboxProfileFetchRepair) return;

  const API_ROOT = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const nativeFetch = window.StashboxProfileNativeFetch;
  const sessionFetch = window.fetch.bind(window);

  if (typeof nativeFetch !== 'function') return;

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

  function buildRequest(input, init, headers) {
    if (input instanceof Request) {
      return [new Request(input.clone(), { ...init, headers }), undefined];
    }
    return [input, { ...init, headers }];
  }

  async function protectedProfileFetch(input, init = {}) {
    const headers = requestHeaders(input, init);
    headers.delete('X-Cognito-Id-Token');
    const [target, targetInit] = buildRequest(input, init, headers);

    try {
      return await nativeFetch(target, targetInit);
    } catch (firstError) {
      if (requestMethod(input, init) !== 'GET') throw firstError;
      await new Promise(resolve => window.setTimeout(resolve, 250));
      const retryHeaders = requestHeaders(input, init);
      retryHeaders.delete('X-Cognito-Id-Token');
      const [retryTarget, retryInit] = buildRequest(input, init, retryHeaders);
      return nativeFetch(retryTarget, retryInit);
    }
  }

  window.fetch = function profileSafeFetch(input, init = {}) {
    const url = requestUrl(input);
    const headers = requestHeaders(input, init);
    const protectedApiRequest = url.startsWith(API_ROOT)
      && /^Bearer\s+/i.test(headers.get('Authorization') || '');

    if (protectedApiRequest) return protectedProfileFetch(input, init);
    return sessionFetch(input, init);
  };

  window.StashboxProfileFetchRepair = Object.freeze({
    active: true,
    apiRoot: API_ROOT
  });
})();