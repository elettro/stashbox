'use strict';

const CACHE = 'stashbox-v2-offline-shell-20260821-1';
const OFFLINE_URL = '/radio/attempt2/offline/';
const SHELL = [
  OFFLINE_URL,
  '/radio/attempt2/offline/offline.js?v=20260821-offlineaudio1',
  '/radio/attempt2/offline/manifest.webmanifest?v=20260821-offlineaudio1',
  '/radio/attempt2/desktop/browser-audio-map.js?v=20260818-stream320-80',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map(async url => {
      const response = await fetch(url, { cache: 'reload' });
      if (response.ok) await cache.put(url, response.clone());
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('stashbox-v2-offline-shell-') && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function cachedOfflineShell() {
  const cache = await caches.open(CACHE);
  return (await cache.match(OFFLINE_URL)) || (await fetch(OFFLINE_URL));
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (request.mode === 'navigate' && url.origin === self.location.origin && url.pathname.startsWith('/radio/attempt2/')) {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch (_) {
        return cachedOfflineShell();
      }
    })());
    return;
  }

  if (url.origin === self.location.origin && (
    url.pathname.startsWith('/radio/attempt2/offline/') ||
    url.pathname === '/radio/attempt2/desktop/browser-audio-map.js'
  )) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request, { ignoreSearch: false }) || await cache.match(url.pathname);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        if (url.pathname.endsWith('.html') || url.pathname.endsWith('/offline/')) return cachedOfflineShell();
        throw error;
      }
    })());
  }
});
