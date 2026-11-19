/* 앱 화면 파일을 저장해 두어 인터넷이 없어도 테스트할 수 있게 합니다. 사전 검색은 인터넷이 필요해요. */
const VERSION = 'bwc-v9';
const SHELL = ['./', 'index.html', 'style.css', 'js/data.js', 'js/avatar.js', 'js/dict.js', 'js/app.js', 'js/ai.js', 'js/sets.js', 'js/speak.js', 'js/main.js', 'js/vendor/qrcode.js', 'js/vendor/jsQR.js', 'data/hanja.json', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameOrigin = url.origin === self.location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return; // 사전 API는 그대로 인터넷으로
  // 저장본을 먼저 보여 주고, 뒤에서 새 버전을 받아 둡니다.
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: sameOrigin });
    const net = fetch(e.request).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(e.request, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
