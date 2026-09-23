// v2.8 端末内の保存（IndexedDB）の確認
const { boot, sleep, createServer } = require('./mock-firestore');
const { IDBFactory } = require('fake-indexeddb');
const assert = require('assert');
const results = [];
async function t(name, fn) {
  const opened = [];
  try { await fn(x => { opened.push(x); return x; }); results.push('PASS ' + name); }
  catch (e) { results.push('FAIL ' + name + ' :: ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' | ')); }
  finally { opened.forEach(o => { try { o.close(); } catch (e) {} }); }
}
const ds = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = ds(new Date());
const COLLS = ['transactions', 'timeSlots', 'quickTimes', 'shopClasses', 'categories', 'paymentMethods', 'shops', 'shortcuts', 'fixedExpenses'];
function base(extra = {}) {
  return Object.assign({ transactions: [], timeSlots: [{ id: 'ts1', label: '朝', time: '08:00' }], quickTimes: [{ id: 'q1', time: '09:00' }], shopClasses: [{ id: 'c1', name: '外食', icon: '🍽️' }], categories: [{ id: 'cat1', name: '食費' }], paymentMethods: [{ id: 'p1', name: '現金' }], shops: [{ id: 's1', name: '店A', classId: 'c1' }], shortcuts: [], fixedExpenses: [], lastRunDate: TODAY }, extra);
}
const tx = (id, amount) => ({ id, amount, date: TODAY, time: '12:00', classId: 'c1', categoryId: 'cat1', paymentId: 'p1', ts: 1 });
const txs = n => Array.from({ length: n }, (_, i) => tx('tx' + i, 100 + i));

(async () => {
  await t('IDB: 初回起動で localStorage のデータを IndexedDB へ移し、元データはバックアップ名で残す', async open => {
    const idb = new IDBFactory();
    const a = open(boot({ server: null, localState: base({ transactions: txs(30) }), idb }));
    await a.w.__t.storageReady; await sleep(50);
    assert.strictEqual(a.w.__t.Store.mode, 'idb');
    assert.strictEqual(a.w.__t.state.transactions.length, 30);
    const saved = await a.w.__t.Store.get('state');
    assert.strictEqual(saved.transactions.length, 30, 'in IDB');
    const ls = a.dump();
    assert(!ls['premium_tracker_v18'], 'LS original removed');
    assert(ls['premium_tracker_backup_before_idb'], 'backup kept');
  });

  await t('IDB: 保存した内容が、次の起動（localStorage は空）でも残っている', async open => {
    const idb = new IDBFactory();
    const a = open(boot({ server: null, localState: base({ transactions: txs(3) }), idb }));
    await a.w.__t.storageReady; await sleep(30);
    a.w.__t.state.transactions.push(tx('new1', 999));
    a.w.__t.saveData();
    await a.w.__t.Store.whenIdle();
    a.close();
    const b = open(boot({ server: null, idb }));
    await b.w.__t.storageReady; await sleep(30);
    assert.strictEqual(b.w.__t.state.transactions.length, 4);
    assert(b.w.__t.state.transactions.some(x => x.id === 'new1'));
  });

  await t('IDB: 画面の表示は、データを読み終えてから始まる（空の状態が一瞬出ない）', async open => {
    const idb = new IDBFactory();
    const st = base({ shortcuts: [{ id: 'sc1', name: 'モーニング', amount: 480, classId: 'c1', categoryId: 'cat1', paymentId: 'p1' }] });
    const a = open(boot({ server: null, localState: st, idb }));
    await a.w.__t.storageReady; await sleep(50);
    assert(a.w.document.getElementById('grid-shortcuts').textContent.includes('モーニング'));
  });

  await t('IDB: IndexedDB が使えない環境では localStorage で従来どおり動く', async open => {
    const broken = { open: () => { throw new Error('SecurityError'); } };
    const a = open(boot({ server: null, localState: base({ transactions: txs(2) }), idb: broken }));
    await a.w.__t.storageReady; await sleep(30);
    assert.strictEqual(a.w.__t.Store.mode, 'local');
    a.w.__t.state.transactions.push(tx('x', 1)); a.w.__t.saveData();
    assert.strictEqual(JSON.parse(a.dump()['premium_tracker_v18']).transactions.length, 3);
  });

  await t('IDB: 容量不足で保存に失敗したら、画面に知らせる', async open => {
    const idb = new IDBFactory();
    const a = open(boot({ server: null, localState: base(), idb }));
    await a.w.__t.storageReady; await sleep(30);
    const proto = Object.getPrototypeOf(a.w.indexedDB.open('probe'));
    void proto;
    const FI = require('fake-indexeddb');
    const orig = FI.IDBObjectStore.prototype.put;
    FI.IDBObjectStore.prototype.put = function () { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; };
    try {
      a.w.__t.saveData();
      await sleep(50);
      assert(a.w.__t.alertMsg().includes('保存容量がいっぱい'), a.w.__t.alertMsg());
    } finally { FI.IDBObjectStore.prototype.put = orig; }
  });

  // ---- 同期と組み合わせ ----
  function legacyServer(local) {
    const s = createServer();
    COLLS.forEach(c => (local[c] || []).forEach((x, i) => s.coll(c).set(x.id, Object.assign({}, x, c === 'transactions' ? {} : { _order: i }))));
    return s;
  }
  async function settle(a, server) {
    for (let i = 0; i < 100; i++) {
      const ok = COLLS.every(c => Array.from(server.coll(c).values()).every(x => typeof x._updatedAt === 'number'));
      const meta = await a.w.__t.Store.get('syncmeta');
      const max = Math.max(0, ...Array.from(server.coll('transactions').values()).map(x => x._updatedAt || 0));
      const c = meta && meta.cursors && meta.cursors.transactions;
      if (ok && c && c[0] * 1000 + c[1] / 1e6 >= max) return;
      await sleep(100);
    }
  }
  await t('IDB + 同期: 同期の記録も IndexedDB に保存され、次の起動は差分だけ読む（読み取り0回）', async open => {
    const local = base({ transactions: txs(100) });
    const server = legacyServer(local);
    const idb = new IDBFactory();
    const a = open(boot({ server, localState: local, idb }));
    await sleep(400); await settle(a, server);
    assert.strictEqual(a.w.__t.mode, 'full');
    assert(!a.dump()['premium_tracker_syncmeta_v2'], 'sync meta not in LS');
    a.close();
    server.advance(600000); server.reads = 0;
    const b = open(boot({ server, idb }));
    await sleep(600);
    assert.strictEqual(b.w.__t.mode, 'delta');
    assert.strictEqual(server.reads, 0, 'reads=' + server.reads);
    assert.strictEqual(b.w.__t.state.transactions.length, 100);
  });

  await t('IDB + 同期: v2.7（localStorage）でログインしていた端末は、更新後も差分モードのまま（全件を読み直さない）', async open => {
    const local = base({ transactions: txs(50) });
    const server = legacyServer(local);
    // v2.7 相当：localStorage だけで同期を済ませる
    const a = open(boot({ server, localState: local }));
    await sleep(400);
    for (let i = 0; i < 50; i++) { const m = a.dump()['premium_tracker_syncmeta_v2']; if (m && COLLS.every(c => Array.from(server.coll(c).values()).every(x => typeof x._updatedAt === 'number')) && JSON.parse(m).cursors.transactions[0] > 0) break; await sleep(100); }
    await sleep(300);
    const lsDump = a.dump();
    a.close();
    server.advance(600000); server.reads = 0;
    const b = open(boot({ server, storage: lsDump, idb: new IDBFactory() }));
    await sleep(700);
    assert.strictEqual(b.w.__t.Store.mode, 'idb');
    assert.strictEqual(b.w.__t.mode, 'delta', 'kept delta mode after migration');
    assert.strictEqual(server.reads, 0, 'reads=' + server.reads);
    assert.strictEqual(b.w.__t.state.transactions.length, 50);
    const meta = await b.w.__t.Store.get('syncmeta');
    assert(meta && meta.uid === 'u1', 'meta migrated to IDB');
  });

  await t('IDB + 同期: ログイン状態の通知が読み込みより先に来ても、読み込んだデータで同期する', async open => {
    const local = base({ transactions: txs(10) });
    const server = legacyServer(local);
    const idb = new IDBFactory();
    // IndexedDB の準備を遅らせる
    const slow = { open: (...args) => { const req = idb.open(...args); const handlers = {}; const proxy = new Proxy(req, { set(tg, k, v) { if (k === 'onsuccess') { handlers.s = v; tg.onsuccess = (...x) => setTimeout(() => handlers.s(...x), 300); return true; } tg[k] = v; return true; }, get(tg, k) { const v = tg[k]; return typeof v === 'function' ? v.bind(tg) : v; } }); return proxy; } };
    const a = open(boot({ server, localState: local, idb: slow }));
    await sleep(900);
    assert.strictEqual(a.w.__t.state.transactions.length, 10);
    assert.strictEqual(Array.from(server.coll('transactions').values()).filter(x => !x._deleted).length, 10, 'nothing lost on server');
  });

  console.log(results.join('\n'));
  const failed = results.filter(r => r.startsWith('FAIL')).length;
  console.log(`\n${results.filter(r => r.startsWith('PASS')).length} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
