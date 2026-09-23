/* 家計簿アプリ Service Worker
 * - アプリ本体（HTML/JS/CSS）は「ネット優先・つながらなければ保存済みを使う」
 *   → 更新したファイルは次に開いたときに反映され、古い版が居座りにくい
 * - Firebase SDK（バージョン固定URL）は保存済みを優先
 *   [v2.8] 中身を確認できる形（CORS）で取得し、正常な応答（200）だけを保存する。
 *          以前は中身を確認できない形（no-cors）で保存していたため、エラーの応答でも保存・使用されることがあった。
 * - Firestore / ログインなどの通信には一切関与しない（同期の仕組みはそのまま）
 */
const CACHE_NAME = 'kakeibo-cache-v2.9.0';
const APP_SHELL = [
  './', './index.html', './styles.css', './tailwind.css',
  './js/core.js', './js/storage.js', './js/ui.js', './js/input.js', './js/history.js', './js/stats.js', './js/settings.js', './js/sync.js', './js/keyboard.js', './js/main.js',
  './vendor/Sortable.min.js', './manifest.webmanifest', './favicon-32.png', './apple-touch-icon.png',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png'
];
const CDN_ASSETS = [
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js'
];
const NETWORK_TIMEOUT_MS = 4000;

// CDN のファイルを、中身を確認できる形で取得する（正常な応答のときだけ返す）
async function fetchCdnOk(url) {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-cache' });
  if (!res || !res.ok || res.type === 'opaque') throw new Error('CDN response not ok: ' + (res && res.status));
  return res;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // 1つ取れなくてもインストール自体は失敗させない
    await Promise.all(APP_SHELL.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    await Promise.all(CDN_ASSETS.map(async url => {
      try { const res = await fetchCdnOk(url); await cache.put(url, res); } catch (e) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('kakeibo-cache-') && k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS))
    ]);
    if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = (await cache.match('./index.html')) || (await cache.match('./'));
      if (shell) return shell;
    }
    throw e;
  }
}

async function cacheFirstCdn(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request.url);
  // 以前の版が保存した「中身を確認できない応答」は使わずに取り直す
  if (cached && cached.type !== 'opaque') return cached;
  try {
    const res = await fetchCdnOk(request.url);
    cache.put(request.url, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    if (cached) return cached;
    return fetch(request); // 保存はしない（ブラウザの通常の読み込みと同じ）
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/__/')) return; // Firebase Hosting の予約パス（ログイン処理など）は触らない
    event.respondWith(networkFirst(req));
    return;
  }
  if (url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/10.14.1/')) {
    event.respondWith(cacheFirstCdn(req));
  }
  // それ以外（Firestore・Google ログイン等）は素通し
});
