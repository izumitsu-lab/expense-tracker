// Service Worker の確認（実際の Chromium。gstatic への通信は差し替える）
// Service Worker の通信も差し替えられるようにする（Playwright の設定）
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const dir = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/') p = '/index.html'; const f = path.join(dir, decodeURIComponent(p)); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
const results = []; const check = (n, ok, info = '') => results.push((ok ? 'PASS ' : 'FAIL ') + n + (info ? '  [' + info + ']' : ''));
(async () => {
  await new Promise(r => srv.listen(0, r));
  const base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await browser.newContext({ serviceWorkers: 'allow' });
  let failAuth = true; // 1回目は auth の SDK だけ 500 を返す
  await ctx.route(/gstatic\.com/, async route => {
    const url = route.request().url();
    if (url.includes('auth-compat') && failAuth) return route.fulfill({ status: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'server error' });
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/javascript', 'Access-Control-Allow-Origin': '*' }, body: '/* stand-in sdk: ' + url + ' */' });
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(base);
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, null, { timeout: 15000 }).catch(() => {});
  await p.reload(); await p.waitForTimeout(1500);
  const info = await p.evaluate(async () => {
    const keys = await caches.keys(); const c = await caches.open(keys.find(k => k.startsWith('kakeibo-cache-')));
    const get = async u => { const r = await c.match(u); return r ? { type: r.type, status: r.status } : null; };
    const G = 'https://www.gstatic.com/firebasejs/10.14.1/';
    return { keys, app: await get(G + 'firebase-app-compat.js'), auth: await get(G + 'firebase-auth-compat.js'), fs: await get(G + 'firebase-firestore-compat.js'),
             js: await Promise.all(['js/core.js', 'js/main.js', 'icon-512.png', 'index.html'].map(u => c.match(u).then(r => r ? r.status : null))) };
  });
  check('キャッシュの名前が v2.8', info.keys.includes('kakeibo-cache-v2.8.0'), info.keys.join(','));
  check('Firebase SDK を中身の確認できる形（cors・200）で保存', info.app && info.app.type === 'cors' && info.app.status === 200, JSON.stringify(info.app));
  check('エラー（500）の応答は保存しない', info.auth === null, JSON.stringify(info.auth));
  check('分割した js と新しいアイコンも保存', info.js.every(s => s === 200), JSON.stringify(info.js));
  // 次に正常に取れたら保存される
  failAuth = false;
  await p.reload(); await p.waitForTimeout(1200);
  const auth2 = await p.evaluate(async () => { const c = await caches.open('kakeibo-cache-v2.8.0'); const r = await c.match('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js'); return r ? { type: r.type, status: r.status } : null; });
  check('あとで正常に取れたときに保存される', auth2 && auth2.status === 200 && auth2.type === 'cors', JSON.stringify(auth2));
  // オフラインで起動できる
  await ctx.setOffline(true);
  await p.reload(); await p.waitForTimeout(1500);
  const off = await p.evaluate(() => ({ main: document.getElementById('view-main').classList.contains('active'), mode: typeof Store !== 'undefined' && Store.mode }));
  check('オフラインでも起動できる（保存済みのファイルで表示）', off.main === true, JSON.stringify(off));
  check('ページのエラーなし', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(results.join('\n'));
  const failed = results.filter(r => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  await browser.close(); srv.close();
  process.exit(failed ? 1 : 0);
})();
