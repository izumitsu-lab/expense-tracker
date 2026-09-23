const { boot, sleep, createServer } = require('./mock-firestore');
const assert = require('assert');
const results = [];
const only = process.env.ONLY;
async function t(name, fn) {
  if (only && !name.includes(only)) return;
  const opened = [];
  try { await fn(x => { opened.push(x); return x; }); results.push('PASS ' + name); }
  catch (e) { results.push('FAIL ' + name + ' :: ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' | ')); }
  finally { opened.forEach(o => { try { o.close(); } catch (e) {} }); }
}
const ds = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = new Date(); const TODAY = ds(today);
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const COLLS = ['transactions', 'timeSlots', 'quickTimes', 'shopClasses', 'categories', 'paymentMethods', 'shops', 'shortcuts', 'fixedExpenses'];
function baseLocal(extra = {}) {
  return Object.assign({ transactions: [], timeSlots: [{ id: 'ts1', label: '朝', time: '08:00' }], quickTimes: [{ id: 'q1', time: '09:00' }], shopClasses: [{ id: 'c1', name: '外食', icon: '🍽️' }], categories: [{ id: 'cat1', name: '食費' }], paymentMethods: [{ id: 'p1', name: '現金' }], shops: [{ id: 's1', name: '店A', classId: 'c1' }], shortcuts: [], fixedExpenses: [], lastRunDate: TODAY }, extra);
}
const tx = (id, amount, extra = {}) => Object.assign({ id, amount, date: TODAY, time: '12:00', classId: 'c1', categoryId: 'cat1', paymentId: 'p1', ts: 1 }, extra);
function txs(n) { const a = []; for (let i = 0; i < n; i++) a.push(tx('tx' + i, 100 + i)); return a; }
// v2.5 以前の形式でサーバーにデータを置く（_updatedAt なし）
function legacyServer(local) {
  const s = createServer();
  COLLS.forEach(c => (local[c] || []).forEach((x, i) => s.coll(c).set(x.id, Object.assign({}, x, c === 'transactions' ? {} : { _order: i }))));
  return s;
}
const legacyMeta = s => ({ uid: 'u1', ids: Object.fromEntries(COLLS.map(c => [c, Array.from(s.coll(c).keys())])) });
const live = (s, c) => Array.from(s.coll(c).values()).filter(x => !x._deleted);
const serverTxIds = s => live(s, 'transactions').map(x => x.id).sort();
const localTxIds = w => w.__t.state.transactions.map(x => x.id).sort();

// 1台目で移行（全件読み込み）まで済ませて、その端末の localStorage を返す
async function migrated(open, server, local) {
  const a = open(boot({ server, localState: local, syncMeta: legacyMeta(server) }));
  const t0 = Date.now();
  await sleep(300);
  // 移行の書き直しが自分の監視に反映され、読み取り位置がサーバーの最新まで進むまで待つ
  const serverMax = () => Math.max(0, ...Array.from(server.coll('transactions').values()).map(x => x._updatedAt || 0));
  for (let i = 0; i < 200; i++) {
    const m = a.dump()['premium_tracker_syncmeta_v2'];
    const c = m && JSON.parse(m).cursors.transactions;
    const allMigrated = COLLS.every(cn => Array.from(server.coll(cn).values()).every(x => typeof x._updatedAt === 'number'));
    if (allMigrated && (!(local.transactions || []).length || (c && c[0] * 1000 + c[1] / 1e6 >= serverMax()))) break;
    await sleep(100);
  }
  assert.strictEqual(a.w.__t.cloudReady, true, 'first boot ready');
  const st = a.dump();
  a.close();
  return st;
}

(async () => {
  // ================= #3 差分同期 =================
  await t('差分: 初回（v2.6 で初めて起動）は全件を読み、旧形式のデータを新形式に書き直す', async open => {
    const local = baseLocal({ transactions: txs(50) });
    const server = legacyServer(local);
    const a = open(boot({ server, localState: local, syncMeta: legacyMeta(server) }));
    await sleep(700);
    assert.strictEqual(a.w.__t.mode, 'full');
    assert.strictEqual(a.w.__t.cloudReady, true);
    COLLS.forEach(c => server.coll(c).forEach(d => assert(typeof d._updatedAt === 'number', `${c}/${d.id} migrated`)));
    const meta = JSON.parse(a.dump()['premium_tracker_syncmeta_v2']);
    assert(meta.lastFull > 0 && COLLS.every(c => Array.isArray(meta.cursors[c])), 'meta v2 saved');
    assert(!a.dump()['premium_tracker_syncmeta_v1'], 'legacy meta removed');
    assert.strictEqual(a.w.__t.state.transactions.length, 50);
    assert(!JSON.stringify(a.w.__t.state).includes('_updatedAt'), 'no sync fields in local state');
  });

  await t('差分: 2回目以降の起動は「変わった分だけ」を読む（3,000件で読み取り数を比較）', async open => {
    const local = baseLocal({ transactions: txs(3000) });
    const server = legacyServer(local);
    const st = await migrated(open, server, local);
    server.advance(10 * 60 * 1000); // 10分後
    // 他の端末で 追加1・変更1・削除1
    server.externalSet('transactions', tx('new1', 777));
    server.externalSet('transactions', tx('tx5', 555));
    server.externalDelete('transactions', 'tx7');
    await sleep(20);
    server.reads = 0;
    const b = open(boot({ server, storage: st }));
    await sleep(700);
    assert.strictEqual(b.w.__t.mode, 'delta');
    assert.strictEqual(b.w.__t.cloudReady, true);
    results.push(`INFO 3,006件のうち他の端末で3件変更 → 2回目の起動の読み取り ${server.reads}回`);
    assert(server.reads <= 10, 'reads=' + server.reads);
    const s = b.w.__t.state.transactions;
    assert(s.some(x => x.id === 'new1'), 'added');
    assert.strictEqual(s.find(x => x.id === 'tx5').amount, 555, 'modified');
    assert(!s.some(x => x.id === 'tx7'), 'deleted');
    assert.strictEqual(s.length, 3000);
    assert.strictEqual(JSON.stringify(localTxIds(b.w)), JSON.stringify(serverTxIds(server)));
  });

  await t('差分: 変更がなければ、2回目の起動の読み取りは0回', async open => {
    const local = baseLocal({ transactions: txs(200) });
    const server = legacyServer(local);
    const st = await migrated(open, server, local);
    server.advance(10 * 60 * 1000);
    server.reads = 0; server.writes.length = 0;
    const b = open(boot({ server, storage: st }));
    await sleep(600);
    assert.strictEqual(b.w.__t.mode, 'delta');
    assert.strictEqual(server.reads, 0, 'reads=' + server.reads);
    assert(b.w.__t.fixedAllowed, 'server confirmed even with 0 docs');
    assert(b.w.__t.detail().includes('正常'), b.w.__t.detail());
  });

  await t('差分: 削除は「削除済みの印」として送られ、もう1台に届く（削除の復活なし）', async open => {
    const local = baseLocal({ transactions: txs(5) });
    const server = legacyServer(local);
    const st = await migrated(open, server, local);
    // 端末A（st を引き継ぐ）で tx2 を削除
    const a = open(boot({ server, storage: st }));
    await sleep(500);
    a.w.__t.state.transactions = a.w.__t.state.transactions.filter(x => x.id !== 'tx2');
    a.w.__t.saveData();
    await sleep(600);
    const doc = server.coll('transactions').get('tx2');
    assert(doc && doc._deleted === true && typeof doc._updatedAt === 'number', 'tombstone on server');
    // 端末B：古い状態（tx2 あり）のまま、少し前の同期記録で起動
    const b = open(boot({ server, storage: st }));
    await sleep(500);
    assert.strictEqual(b.w.__t.mode, 'delta');
    assert(!b.w.__t.state.transactions.some(x => x.id === 'tx2'), 'deletion received');
    await sleep(500);
    assert(server.coll('transactions').get('tx2')._deleted, 'not resurrected');
  });

  await t('差分: 起動していない間のローカルの変更（削除・編集・追加）を起動時に送る', async open => {
    const local = baseLocal({ transactions: txs(5) });
    const server = legacyServer(local);
    const st = await migrated(open, server, local);
    const state = JSON.parse(st['premium_tracker_v18']);
    state.transactions = state.transactions.filter(x => x.id !== 'tx1');
    state.transactions.find(x => x.id === 'tx3').amount = 3333;
    state.transactions.push(tx('offline1', 9));
    const st2 = Object.assign({}, st, { premium_tracker_v18: JSON.stringify(state) });
    const b = open(boot({ server, storage: st2 }));
    await sleep(900);
    assert.strictEqual(b.w.__t.mode, 'delta');
    assert(server.coll('transactions').get('tx1')._deleted, 'deleted offline → tombstone');
    assert.strictEqual(server.coll('transactions').get('tx3').amount, 3333, 'edit sent');
    assert(server.coll('transactions').get('offline1'), 'add sent');
  });

  await t('差分: 同じ項目を両方で編集した場合、まだ送っていないローカルの編集を優先し、そのあと送る', async open => {
    const local = baseLocal({ transactions: txs(3) });
    const server = legacyServer(local);
    const st = await migrated(open, server, local);
    server.advance(60000 * 5);
    server.externalSet('transactions', tx('tx0', 1111)); // 他の端末の編集
    const state = JSON.parse(st['premium_tracker_v18']);
    state.transactions.find(x => x.id === 'tx0').amount = 2222; // この端末の未送信の編集
    const b = open(boot({ server, storage: Object.assign({}, st, { premium_tracker_v18: JSON.stringify(state) }) }));
    await sleep(900);
    assert.strictEqual(b.w.__t.state.transactions.find(x => x.id === 'tx0').amount, 2222);
    assert.strictEqual(server.coll('transactions').get('tx0').amount, 2222);
  });

  await t('差分: 起動中に他の端末の変更がリアルタイムに届く（追加・変更・削除）', async open => {
    const local = baseLocal({ transactions: txs(3) });
    const server = legacyServer(local);
    const st = await migrated(open, server, local);
    const b = open(boot({ server, storage: st }));
    await sleep(500);
    server.externalSet('transactions', tx('rt1', 5));
    server.externalSet('transactions', tx('tx1', 4444));
    server.externalDelete('transactions', 'tx2');
    await sleep(100);
    const s = b.w.__t.state.transactions;
    assert(s.some(x => x.id === 'rt1'));
    assert.strictEqual(s.find(x => x.id === 'tx1').amount, 4444);
    assert(!s.some(x => x.id === 'tx2'));
  });

  await t('差分: 並び順のある設定（カテゴリー）の並べ替え・追加が他の端末に反映される', async open => {
    const local = baseLocal({ categories: [{ id: 'cA', name: 'A' }, { id: 'cB', name: 'B' }, { id: 'cC', name: 'C' }] });
    const server = legacyServer(local);
    const st = await migrated(open, server, local);
    const a = open(boot({ server, storage: st }));
    await sleep(500);
    const cats = a.w.__t.state.categories;
    a.w.__t.state.categories = [cats[2], cats[0], cats[1], { id: 'cD', name: 'D' }];
    a.w.__t.saveData();
    await sleep(600);
    a.close();
    const b = open(boot({ server, storage: st }));
    await sleep(600);
    assert.strictEqual(JSON.stringify(b.w.__t.state.categories.map(x => x.id)), JSON.stringify(['cC', 'cA', 'cB', 'cD']));
  });

  await t('差分: 削除の取り消し（同じIDで元に戻す）で、削除済みの印が上書きされる', async open => {
    const local = baseLocal({ transactions: txs(3) });
    const server = legacyServer(local);
    const st = await migrated(open, server, local);
    const a = open(boot({ server, storage: st }));
    await sleep(500);
    const removed = a.w.__t.state.transactions.find(x => x.id === 'tx1');
    a.w.__t.state.transactions = a.w.__t.state.transactions.filter(x => x.id !== 'tx1');
    a.w.__t.saveData(); await sleep(500);
    assert(server.coll('transactions').get('tx1')._deleted);
    a.w.__t.state.transactions.push(removed);
    a.w.__t.saveData(); await sleep(500);
    const d = server.coll('transactions').get('tx1');
    assert(!d._deleted && d.amount === removed.amount, 'restored on server');
  });

  await t('差分: 30日たつと全件を読み直す（安全網）', async open => {
    const local = baseLocal({ transactions: txs(20) });
    const server = legacyServer(local);
    const st = await migrated(open, server, local);
    const meta = JSON.parse(st['premium_tracker_syncmeta_v2']);
    meta.lastFull = Date.now() - 31 * 24 * 3600 * 1000;
    server.reads = 0;
    const b = open(boot({ server, storage: Object.assign({}, st, { premium_tracker_syncmeta_v2: JSON.stringify(meta) }) }));
    await sleep(600);
    assert.strictEqual(b.w.__t.mode, 'full');
    assert(server.reads >= 20, 'reads=' + server.reads);
    const meta2 = JSON.parse(b.dump()['premium_tracker_syncmeta_v2']);
    assert(Date.now() - meta2.lastFull < 60000, 'lastFull refreshed');
  });

  await t('差分: 全件読み直しのとき、サーバーから完全に消えた項目（旧版の端末が削除）も反映する', async open => {
    const local = baseLocal({ transactions: txs(5) });
    const server = legacyServer(local);
    const st = await migrated(open, server, local);
    server.coll('transactions').delete('tx4'); // 旧版の端末による完全削除
    const meta = JSON.parse(st['premium_tracker_syncmeta_v2']); meta.lastFull = 1;
    const b = open(boot({ server, storage: Object.assign({}, st, { premium_tracker_syncmeta_v2: JSON.stringify(meta) }) }));
    await sleep(800);
    assert(!b.w.__t.state.transactions.some(x => x.id === 'tx4'));
    assert(!server.coll('transactions').has('tx4'), 'not resurrected');
  });

  await t('差分: 別のアカウントでログインすると全件モードになり、データが混ざらない', async open => {
    const local = baseLocal({ transactions: txs(3) });
    const server = legacyServer(local);
    const st = await migrated(open, server, local);
    const server2 = createServer(); // u2 のクラウド（空）
    const b = open(boot({ server: server2, storage: st, user: { uid: 'u2', email: 'x@y' } }));
    await sleep(700);
    assert.strictEqual(b.w.__t.mode, 'full');
    assert.strictEqual(b.w.__t.state.transactions.length, 0, 'u1 data not carried to u2');
  });

  await t('差分: オフラインで起動 → キャッシュで開始、再接続で差分を受け取り、定期支出はその後（削除済みの定期支出記録が復活しない）', async open => {
    const feToday = { id: 'fe1', name: '家賃', amount: 80000, day: today.getDate(), classId: 'c1', categoryId: 'cat1', paymentId: 'p1', isFixed: true, lastRunDate: TODAY };
    const local = baseLocal({ fixedExpenses: [feToday] });
    const server = legacyServer(local);
    const st = await migrated(open, server, local);
    // 端末B は「3日前に同期したまま」の状態：定期支出の最終実行日が3日前、読み取り位置も古い
    const feOld = Object.assign({}, feToday, { lastRunDate: ds(daysAgo(3)) });
    const state = JSON.parse(st['premium_tracker_v18']);
    state.fixedExpenses = [feOld];
    const meta = JSON.parse(st['premium_tracker_syncmeta_v2']);
    const probe = open(boot({ server: null, localState: baseLocal() }));
    meta.maps.fixedExpenses = { fe1: probe.w.__t.itemHash(Object.assign({}, feOld, { _order: 0 })) };
    Object.keys(meta.cursors).forEach(k => meta.cursors[k] = [0, 0]);
    // その間に他の端末が、今日の分を追加 → 削除済み（サーバーには削除済みの印）
    server.externalDelete('transactions', `fx_fe1_${TODAY}`);
    await sleep(10);
    // 端末B のキャッシュは古い（定期支出は3日前、削除済みの印は知らない）
    server.snapshotCache();
    const cfe = server.cache.fixedExpenses.get('fe1'); cfe.lastRunDate = feOld.lastRunDate;
    server.cache.transactions.delete(`fx_fe1_${TODAY}`);
    server.offline = true; server.navOnline = false;
    const b = open(boot({ server, storage: Object.assign({}, st, { premium_tracker_v18: JSON.stringify(state), premium_tracker_syncmeta_v2: JSON.stringify(meta) }) }));
    await sleep(500);
    assert.strictEqual(b.w.__t.mode, 'delta');
    assert.strictEqual(b.w.__t.cloudReady, true);
    assert.strictEqual(b.w.__t.fixedAllowed, false, 'held while offline');
    assert(!b.w.__t.state.transactions.some(x => x.id.startsWith('fx_')));
    server.navOnline = true; server.goOnline();
    await sleep(500);
    assert.strictEqual(b.w.__t.fixedAllowed, true);
    assert.strictEqual(b.w.__t.state.fixedExpenses[0].lastRunDate, TODAY, 'got newer fe');
    assert(!b.w.__t.state.transactions.some(x => x.id.startsWith('fx_')), 'not regenerated locally');
    assert(server.coll('transactions').get(`fx_fe1_${TODAY}`)._deleted, 'still deleted on server');
  });

  await t('差分: JSON の復元（全置き換え）で、消えた項目は削除済みの印、残りは送信される', async open => {
    const local = baseLocal({ transactions: txs(4) });
    const server = legacyServer(local);
    const st = await migrated(open, server, local);
    const a = open(boot({ server, storage: st }));
    await sleep(500);
    const backup = baseLocal({ transactions: [tx('tx0', 100), tx('bk1', 42)] });
    const file = new a.w.File([JSON.stringify(backup)], 'b.json', { type: 'application/json' });
    a.w.importData({ target: { files: [file] } });
    a.w.__t.closeCustomConfirm(true);
    await sleep(800);
    assert.deepStrictEqual(serverTxIds(server), ['bk1', 'tx0']);
    ['tx1', 'tx2', 'tx3'].forEach(id => assert(server.coll('transactions').get(id)._deleted, id + ' tombstoned'));
  });

  // ================= v2.4/v2.5 からの回帰 =================
  await t('回帰 #1: 時刻・クイック入力金額の HTML が実行されない', async open => {
    const local = baseLocal({ transactions: [tx('t1', 500, { time: '<img id="pwn1" src=x>' })], shortcuts: [{ id: 'sc1', name: 'x', amount: '<b id="pwn3">1</b>' }] });
    const a = open(boot({ server: null, localState: local }));
    await sleep(50);
    a.w.__t.renderCalendar(); a.w.__t.renderShortcuts();
    assert(!a.w.document.getElementById('pwn1') && !a.w.document.getElementById('pwn3'));
  });
  await t('回帰 #2: 監視の開始に失敗しても自動で復帰する', async open => {
    const local = baseLocal();
    const server = legacyServer(local); server.failGets = 9;
    const a = open(boot({ server, localState: local, syncMeta: legacyMeta(server) }));
    await sleep(200);
    assert.strictEqual(a.w.__t.cloudReady, false);
    assert(a.w.__t.detail().includes('再試行'), a.w.__t.detail());
    await sleep(5600);
    assert.strictEqual(a.w.__t.cloudReady, true);
  });
  await t('回帰 #2: 送信の失敗から自動で送り直す', async open => {
    const local = baseLocal({ transactions: txs(2) });
    const server = legacyServer(local);
    const st = await migrated(open, server, local);
    const a = open(boot({ server, storage: st }));
    await sleep(500);
    server.failCommits = 1;
    a.w.__t.state.transactions.push(tx('n1', 3));
    a.w.__t.saveData();
    await sleep(500);
    assert(!server.coll('transactions').has('n1'));
    await sleep(5600);
    assert(server.coll('transactions').has('n1'), 'resent');
  });
  await t('回帰 #2: 電波はあるがサーバーが応答しない → 10秒後にキャッシュで開始', async open => {
    const local = baseLocal({ transactions: txs(2) });
    const server = legacyServer(local);
    const st = await migrated(open, server, local);
    server.snapshotCache(); server.cacheFirst = true; server.hang = true;
    const b = open(boot({ server, storage: st }));
    await sleep(1000);
    assert.strictEqual(b.w.__t.cloudReady, false);
    await sleep(9600);
    assert.strictEqual(b.w.__t.cloudReady, true);
    assert.strictEqual(b.w.__t.fixedAllowed, false);
    server.goOnline(); await sleep(100);
    assert.strictEqual(b.w.__t.fixedAllowed, true);
  });
  await t('回帰 #4: web.app では authDomain が同じドメイン', async open => {
    const server = createServer();
    open(boot({ server, localState: baseLocal() }));
    assert.strictEqual(server.config.authDomain, 'expense-tracker-5e542.web.app');
  });
  await t('回帰: 未ログインでは定期支出をすぐ追加', async open => {
    const fe = { id: 'fe1', name: '家賃', amount: 80000, day: today.getDate(), classId: 'c1', categoryId: 'cat1', paymentId: 'p1', isFixed: true, lastRunDate: ds(daysAgo(3)) };
    const server = createServer();
    const a = open(boot({ server, localState: baseLocal({ fixedExpenses: [fe] }), user: null }));
    await sleep(100);
    assert(a.w.__t.state.transactions.some(x => x.id === `fx_fe1_${TODAY}`));
  });

  console.log(results.join('\n'));
  const failed = results.filter(r => r.startsWith('FAIL')).length;
  console.log(`\n${results.filter(r => r.startsWith('PASS')).length} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
