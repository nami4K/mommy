/* 앱 화면 파일을 저장해 두어 인터넷이 없어도 열리게 합니다. 가족 저장 공간(supabase.co)은 늘 인터넷으로. */
const VERSION = 'dasibom-v5';
const SHELL = ['./', 'index.html', 'style.css', 'config.js', 'js/util.js', 'js/store.js', 'js/logic.js', 'js/photo.js', 'js/app.js', 'js/vendor/qrcode.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('dasibom-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const mine = url.origin === self.location.origin && url.pathname.startsWith(new URL(self.registration.scope).pathname);
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!mine && !isFont) return;
  // 저장본을 먼저 보여 주고, 뒤에서 새 파일을 받아 둡니다(다음에 열 때 반영).
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: mine });
    const net = fetch(e.request).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(e.request, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
