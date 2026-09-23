// 実際のブラウザ（Chromium）で22画面を撮り、文字のコントラストを確かめる（ライト・ダーク両方）
// 使い方： node screens.browser.js [出力フォルダ]   （画像は出力フォルダに保存。既定は tests/screenshots）
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const appDir = path.resolve(path.join(__dirname, '..'));
const outRoot = path.resolve(process.argv[2] || path.join(__dirname, 'screenshots'));

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(appDir, p);
  if (!f.startsWith(appDir) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

function demoState() {
  const pad = n => String(n).padStart(2, '0');
  const d = (y, m, dd) => `${y}-${pad(m)}-${pad(dd)}`;
  const tx = [];
  let n = 0;
  const add = (date, amount, classId, catId, shopId, shopName, payId, time, isFixed = false, memo = '') =>
    tx.push({ id: 'd' + (n++), amount, isPending: false, date, time, timeUnset: false, classId, categoryId: catId, shopName, shopId, paymentId: payId, memo, isFixed, ts: new Date(`${date}T${time}:00`).getTime() });
  for (let day = 1; day <= 23; day++) {
    add(d(2026, 9, day), 480 + (day % 5) * 120, 'cl1', 'c1', 'sh1', 'カフェ・ブルー', 'p2', '08:30');
    if (day % 2) add(d(2026, 9, day), 1200 + day * 37, 'cl2', 'c1', 'sh2', 'まるやまスーパー', 'p1', '18:40');
    if (day % 7 === 0) add(d(2026, 9, day), 3300, 'cl3', 'c3', 'sh3', 'ドラッグ中央', 'p2', '20:10', false, '日用品まとめ買い');
  }
  for (let day = 1; day <= 30; day += 3) add(d(2026, 8, day), 900 + day * 50, 'cl2', 'c1', 'sh2', 'まるやまスーパー', 'p1', '19:00');
  add(d(2026, 9, 1), 85000, 'cl4', 'c2', '', '家賃', 'p3', '09:00', true, '定期支出');
  add(d(2026, 8, 1), 85000, 'cl4', 'c2', '', '家賃', 'p3', '09:00', true, '定期支出');
  tx.push({ id: 'pend1', amount: 0, isPending: true, date: d(2026, 9, 22), time: '12:00', classId: 'cl1', categoryId: 'c1', shopName: 'カフェ・ブルー', shopId: 'sh1', paymentId: 'p2', memo: '', isFixed: false, ts: 1 });
  return {
    transactions: tx,
    timeSlots: [{ id: 'ts1', label: '朝', time: '08:00' }, { id: 'ts2', label: '昼', time: '12:00' }, { id: 'ts3', label: '夜', time: '19:00' }],
    quickTimes: [9, 12, 15, 18, 21].map(h => ({ id: 'qt' + h, time: pad(h) + ':00' })),
    shopClasses: [{ id: 'cl1', name: 'カフェ', icon: '☕️' }, { id: 'cl2', name: 'スーパー', icon: '🛒' }, { id: 'cl3', name: 'ドラッグストア', icon: '💊' }, { id: 'cl4', name: '住まい', icon: '🏠' }],
    categories: [{ id: 'c1', name: '食費' }, { id: 'c2', name: '住居費' }, { id: 'c3', name: '日用品' }],
    paymentMethods: [{ id: 'p1', name: '現金' }, { id: 'p2', name: 'クレジットカード' }, { id: 'p3', name: '口座振替' }],
    shops: [{ id: 'sh1', name: 'カフェ・ブルー', classId: 'cl1', categoryId: 'c1', paymentId: 'p2', memo: '' }, { id: 'sh2', name: 'まるやまスーパー', classId: 'cl2', categoryId: 'c1', paymentId: 'p1', memo: '' }, { id: 'sh3', name: 'ドラッグ中央', classId: 'cl3', categoryId: 'c3', paymentId: 'p2', memo: '' }],
    shortcuts: [{ id: 'sc1', name: 'モーニング', amount: 480, classId: 'cl1', categoryId: 'c1', shopName: 'カフェ・ブルー', shopId: 'sh1', paymentId: 'p2', memo: '', isFixed: false }, { id: 'sc2', name: '夕飯の買い物', amount: null, classId: 'cl2', categoryId: 'c1', shopName: 'まるやまスーパー', shopId: 'sh2', paymentId: 'p1', memo: '', isFixed: false }],
    fixedExpenses: [{ id: 'fe1', name: '家賃', amount: 85000, day: 1, classId: 'cl4', categoryId: 'c2', shopName: '家賃', paymentId: 'p3', memo: '', isFixed: true, lastRunDate: '2026-09-23' }],
    lastRunDate: '2026-09-23', autoUpdateShopPayment: false
  };
}

const SCREENS = [
  ['01-input', `switchView('main','input')`],
  ['02-calendar-daily', `switchView('calendar'); setCalTab('daily',0)`],
  ['03-calendar-monthly', `setCalTab('monthly',2)`],
  ['04-stats-trend', `switchView('stats'); setStatsTab('trend',0)`],
  ['05-stats-monthly', `setStatsTab('monthly',1)`],
  ['06-stats-shop', `setStatsTab('shop',3)`],
  ['07-fixed', `switchView('fixed')`],
  ['08-settings', `switchView('settings'); setSettingsTab('general',0)`],
  ['09-settings-shop', `setSettingsTab('shop',1)`],
  ['10-panel-shops', `openPanel('panel-shops')`],
  ['11-detail-edit', `switchView('calendar'); openDetailModal(null, state.transactions[3])`],
  ['12-shop-editor', `closeAllModals(); switchView('settings'); openShopEditor('sh1')`],
  ['13-class-select', `closeAllModals(); switchView('main','input'); currentAmount='1280'; updateAmount(); proceedToClassSelect()`],
  ['14-shops-modal', `openShopSelect('cl1')`],
  ['15-filter-sheet', `closeAllModals(); switchView('calendar'); openFilterSheet('cat')`],
  ['16-time-sheet', `closeFilterSheet(); openDetailModal(null, state.transactions[3]); openTimePickerSheet()`],
  ['17-alert', `closeAllModals(); showAlert('テストのお知らせです。')`],
  ['18-confirm', `document.getElementById('custom-alert').classList.remove('active'); showConfirm('この記録を削除しますか？', () => {})`],
  ['19-sync-panel', `closeCustomConfirm(false); switchView('settings'); openPanel('panel-sync')`],
  ['20-undo-toast', `closePanel('panel-sync'); switchView('calendar'); removeWithUndo('transactions', state.transactions[state.transactions.length-3].id, '記録を削除しました')`],
  ['21-fixed-editor', `switchView('fixed'); openFixedEditor('fe1')`],
  ['22-stats-yearly', `closeAllModals(); switchView('stats'); setStatsTab('yearly',2)`],
];

async function runScheme(scheme, port, browser) {
  const outDir = path.join(outRoot, scheme);
  fs.mkdirSync(outDir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: scheme, serviceWorkers: 'block', locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-09-23T12:00:00+09:00'));
  await page.route(/gstatic\.com|googleapis\.com/, r => r.abort());
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const state = demoState();
  await page.addInitScript(s => { try { if (!localStorage.getItem('premium_tracker_v18')) localStorage.setItem('premium_tracker_v18', s); } catch (e) {} }, JSON.stringify(state));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForTimeout(800);
  let axeLoaded = false; process.env.AXE = process.env.AXE || 'color-contrast'; const axeReport = {};
  for (const [name, code] of SCREENS) {
    try { await page.evaluate(code); } catch (e) { errors.push(name + ': ' + e.message); }
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(outDir, name + '.png') });
    if (process.env.AXE) {
      if (!axeLoaded) { await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') }); axeLoaded = true; }
      const r = await page.evaluate(async (rules) => { const res = await axe.run(document, { runOnly: { type: 'rule', values: rules } }); return res.violations.map(v => ({ id: v.id, n: v.nodes.length, sample: v.nodes.slice(0, 3).map(x => x.target.join(' ') + ' :: ' + (x.any[0] && x.any[0].message || '').slice(0, 90)) })); }, process.env.AXE.split(','));
      axeReport[name] = r;
    }
  }
  await ctx.close();
  let fails = 0;
  for (const [name, v] of Object.entries(axeReport)) for (const x of v) { fails += x.n; console.log(`FAIL ${scheme} ${name}: ${x.id} ${x.n}件`, x.sample.join(' / ')); }
  for (const e of errors) console.log(`FAIL ${scheme} ページのエラー: ${e}`);
  console.log(`${scheme}: 22画面、コントラスト不足 ${fails}件、ページのエラー ${errors.length}件（画像: ${outDir}）`);
  return fails + errors.length;
}
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  let bad = 0;
  for (const scheme of ['light', 'dark']) bad += await runScheme(scheme, server.address().port, browser);
  await browser.close(); server.close();
  process.exit(bad ? 1 : 0);
})();
