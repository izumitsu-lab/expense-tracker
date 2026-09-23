// キーボード操作の確認（実際の Chromium）
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const dir = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/') p = '/index.html'; const f = path.join(dir, decodeURIComponent(p)); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
const results = [];
const check = (name, ok, info = '') => results.push((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  [' + info + ']' : ''));
(async () => {
  await new Promise(r => srv.listen(0, r));
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.route(/gstatic/, r => r.abort());
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(() => { if (!localStorage.getItem('premium_tracker_v18')) localStorage.setItem('premium_tracker_v18', JSON.stringify({ transactions: [{ id: 't1', amount: 500, date: '2026-09-23', time: '12:00', classId: 'c1', categoryId: 'k1', paymentId: 'p1', shopName: '店A', shopId: 's1' }], shopClasses: [{ id: 'c1', name: 'カフェ', icon: '☕️' }], categories: [{ id: 'k1', name: '食費' }], paymentMethods: [{ id: 'p1', name: '現金' }], shops: [{ id: 's1', name: '店A', classId: 'c1', categoryId: 'k1', paymentId: 'p1' }], shortcuts: [{ id: 'sc1', name: 'モーニング', amount: 480, classId: 'c1', categoryId: 'k1', paymentId: 'p1' }], fixedExpenses: [] })); });
  await p.goto(`http://localhost:${srv.address().port}/`);
  await p.waitForTimeout(700);

  // 1. 数字キーで金額入力
  await p.keyboard.type('1280');
  check('数字キーで金額を入力できる', (await p.textContent('#display-amount')).replace(/,/g, '') === '1280', await p.textContent('#display-amount'));
  await p.keyboard.press('Backspace');
  check('Backspace で1文字消せる', (await p.textContent('#display-amount')).replace(/,/g, '') === '128');
  // 2. Enter で「お店を選ぶ」
  await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  check('Enter で分類の選択画面が開く', await p.evaluate(() => document.getElementById('modal-class-select').classList.contains('active')));
  // 3. Tab は開いている画面の中だけを移動する
  const outside = [];
  for (let i = 0; i < 25; i++) { await p.keyboard.press('Tab'); const inside = await p.evaluate(() => { const a = document.activeElement; return !a || a === document.body || Boolean(a.closest('#modal-class-select')); }); if (!inside) outside.push(await p.evaluate(() => document.activeElement.outerHTML.slice(0, 80))); }
  check('入力画面が開いている間、Tab はその中だけを移動する', outside.length === 0, outside[0] || '');
  // 分類ボタンにフォーカスして Enter
  const classBtnFocused = await p.evaluate(() => { const el = document.querySelector('#modal-class-select .class-btn'); if (!el) return false; el.focus(); return document.activeElement === el && el.getAttribute('role') === 'button' && el.tabIndex === 0; });
  check('分類ボタンが Tab で選べる（role=button）', classBtnFocused);
  await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  check('分類ボタンを Enter で押せる', await p.evaluate(() => document.getElementById('modal-shops').classList.contains('active')));
  // 4. Esc で手前から閉じる
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  check('Esc で一番手前（お店の選択）だけが閉じる', await p.evaluate(() => !document.getElementById('modal-shops').classList.contains('active') && document.getElementById('modal-class-select').classList.contains('active')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  check('もう一度 Esc で次の画面も閉じる', await p.evaluate(() => !document.getElementById('modal-class-select').classList.contains('active')));
  // 5. 下部メニューを Tab / Enter で操作
  const reached = [];
  await p.evaluate(() => document.body.focus());
  for (let i = 0; i < 60; i++) { await p.keyboard.press('Tab'); const t = await p.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-target')); if (t === 'stats') { reached.push(t); break; } }
  check('下部メニュー「分析」に Tab で到達できる', reached.length === 1);
  await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  check('Enter で分析画面に切り替わる', await p.evaluate(() => document.getElementById('view-stats').classList.contains('active')));
  // 6. 閉じている設定画面の中には入らない
  await p.evaluate(() => switchView('settings'));
  await p.waitForTimeout(300);
  const intoHidden = [];
  for (let i = 0; i < 40; i++) { await p.keyboard.press('Tab'); const bad = await p.evaluate(() => { const a = document.activeElement; const panel = a && a.closest && a.closest('.slide-panel, .modal-sheet, .action-sheet'); return panel && !panel.classList.contains('active') ? panel.id : null; }); if (bad) intoHidden.push(bad); }
  check('閉じている画面（設定の各パネルなど）に Tab で入らない', intoHidden.length === 0, intoHidden.slice(0, 3).join(','));
  // 7. 設定の行を Enter で開き、Esc で閉じる
  const opened = await p.evaluate(() => { const row = document.querySelector('[onclick="openPanel(\'panel-categories\')"]'); row.focus(); return document.activeElement === row; });
  await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  check('設定の行を Enter で開ける', opened && await p.evaluate(() => document.getElementById('panel-categories').classList.contains('active')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  check('Esc で設定の画面を閉じる', await p.evaluate(() => !document.getElementById('panel-categories').classList.contains('active')));
  // 8. フォーカスの枠が見える
  const outline = await p.evaluate(() => { const el = document.querySelector('[onclick="openPanel(\'panel-categories\')"]'); return getComputedStyle(el).outlineStyle + ' ' + getComputedStyle(el).outlineWidth; });
  check('キーボードで選んだ部品に枠が表示される', outline.startsWith('solid'), outline);
  // 9. 入力欄の中では数字キーが金額入力にならない
  await p.evaluate(() => { switchView('calendar'); });
  await p.waitForTimeout(300);
  await p.focus('#inp-cal-search'); await p.keyboard.type('12');
  check('検索欄では数字がそのまま入力される', await p.inputValue('#inp-cal-search') === '12');
  check('ページのエラーなし', errs.length === 0, errs.join(' | '));
  console.log(results.join('\n'));
  const failed = results.filter(r => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  await b.close(); srv.close();
  process.exit(failed ? 1 : 0);
})();
