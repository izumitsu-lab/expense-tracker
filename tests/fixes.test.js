// v2.7 の修正（点検 #6〜#10）の確認
const { boot, sleep } = require('./mock-firestore');
const assert = require('assert');
const results = [];
async function t(name, fn) {
  const opened = [];
  try { await fn(x => { opened.push(x); return x; }); results.push('PASS ' + name); }
  catch (e) { results.push('FAIL ' + name + ' :: ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' | ')); }
  finally { opened.forEach(o => { try { o.close(); } catch (e) {} }); }
}
const ds = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = new Date(); const TODAY = ds(today);
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
function base(extra = {}) {
  return Object.assign({
    transactions: [], timeSlots: [{ id: 'ts1', label: '朝', time: '08:00' }], quickTimes: [{ id: 'q1', time: '09:00' }],
    shopClasses: [{ id: 'c1', name: '外食', icon: '🍽️' }, { id: 'c2', name: 'スーパー', icon: '🛒' }],
    categories: [{ id: 'cat1', name: '食費' }], paymentMethods: [{ id: 'p1', name: '現金' }, { id: 'p2', name: 'カード' }],
    shops: [{ id: 's1', name: '駅前店', classId: 'c1', categoryId: 'cat1', paymentId: 'p1' }],
    shortcuts: [], fixedExpenses: [], lastRunDate: TODAY, autoUpdateShopPayment: true
  }, extra);
}
const tx = (id, amount, extra = {}) => Object.assign({ id, amount, date: TODAY, time: '12:00', classId: 'c1', categoryId: 'cat1', paymentId: 'p1', shopName: '駅前店', shopId: 's1', ts: 1, isFixed: false }, extra);
const J = v => JSON.stringify(v);

(async () => {
  await t('#6 新しく入力したときは、お店の既定の支払い方法を更新する', async open => {
    const a = open(boot({ server: null, localState: base() }));
    await sleep(50);
    a.w.openDetailModal(a.w.__t.state.shops[0], null, null);
    a.w.document.getElementById('inp-amount').value = '500';
    a.w.document.getElementById('inp-payment').value = 'p2';
    a.w.saveTransaction();
    assert.strictEqual(a.w.__t.state.shops[0].paymentId, 'p2');
  });
  await t('#6 過去の記録を編集しても、お店の既定の支払い方法は変わらない', async open => {
    const old = tx('old1', 800, { date: ds(daysAgo(180)), paymentId: 'p2' });
    const a = open(boot({ server: null, localState: base({ transactions: [old] }) }));
    await sleep(50);
    a.w.openDetailModal(null, a.w.__t.state.transactions[0], null);
    a.w.document.getElementById('inp-amount').value = '900';
    a.w.saveTransaction();
    assert.strictEqual(a.w.__t.state.transactions[0].amount, 900, 'edit saved');
    assert.strictEqual(a.w.__t.state.shops[0].paymentId, 'p1', 'default unchanged');
  });

  await t('#7 削除済みのお店の記録を、別の分類の同じ名前のお店に紐付けない', async open => {
    // 記録は「外食の駅前店（削除済み）」、残っているのは「スーパーの駅前店」
    const st = base({ shops: [{ id: 's2', name: '駅前店', classId: 'c2', categoryId: 'cat1', paymentId: 'p1' }],
      transactions: [tx('t1', 100, { shopId: undefined, classId: 'c1' })] });
    delete st.transactions[0].shopId;
    const a = open(boot({ server: null, localState: st }));
    await sleep(50);
    assert(!a.w.__t.state.transactions[0].shopId, 'must stay unlinked: ' + a.w.__t.state.transactions[0].shopId);
    assert.strictEqual(a.w.__t.state.transactions[0].shopName, '駅前店', 'name kept');
  });
  await t('#7 分類が一致するお店には、従来どおり紐付ける', async open => {
    const st = base({ transactions: [tx('t1', 100)] });
    delete st.transactions[0].shopId;
    const a = open(boot({ server: null, localState: st }));
    await sleep(50);
    assert.strictEqual(a.w.__t.state.transactions[0].shopId, 's1');
  });
  await t('#7 分類の無い古い記録は、同じ名前のお店が1件だけなら紐付ける（従来どおり）', async open => {
    const st = base({ transactions: [tx('t1', 100, { classId: '' })] });
    delete st.transactions[0].shopId;
    const a = open(boot({ server: null, localState: st }));
    await sleep(50);
    assert.strictEqual(a.w.__t.state.transactions[0].shopId, 's1');
  });

  function fillShopEditor(w, name, classId) {
    w.document.getElementById('ed-shop-name').value = name;
    w.document.getElementById('ed-shop-class').value = classId;
  }
  await t('#8 お店の編集で、同じ分類に同じ名前があると保存しない', async open => {
    const st = base({ shops: [{ id: 's1', name: '駅前店', classId: 'c1', categoryId: 'cat1', paymentId: 'p1' }, { id: 's2', name: '本店', classId: 'c1', categoryId: 'cat1', paymentId: 'p1' }] });
    const a = open(boot({ server: null, localState: st }));
    await sleep(50);
    a.w.openShopEditor('s2');
    fillShopEditor(a.w, '駅前店', 'c1');
    a.w.saveShopEditor();
    assert.strictEqual(a.w.__t.state.shops.find(x => x.id === 's2').name, '本店', 'not renamed');
    assert(a.w.__t.alertMsg().includes('すでにあります'), a.w.__t.alertMsg());
  });
  await t('#8 新しいお店の登録でも、同じ分類の同じ名前は登録しない（前後の空白も無視）', async open => {
    const a = open(boot({ server: null, localState: base() }));
    await sleep(50);
    a.w.openShopEditor(null);
    fillShopEditor(a.w, ' 駅前店 ', 'c1');
    a.w.saveShopEditor();
    assert.strictEqual(a.w.__t.state.shops.length, 1);
  });
  await t('#8 別の分類なら同じ名前でも登録できる／自分自身の名前のままなら保存できる', async open => {
    const a = open(boot({ server: null, localState: base() }));
    await sleep(50);
    a.w.openShopEditor(null);
    fillShopEditor(a.w, '駅前店', 'c2');
    a.w.saveShopEditor();
    assert.strictEqual(a.w.__t.state.shops.length, 2);
    a.w.openShopEditor('s1');
    a.w.document.getElementById('ed-shop-memo').value = 'メモ';
    a.w.saveShopEditor();
    assert.strictEqual(a.w.__t.state.shops.find(x => x.id === 's1').memo, 'メモ');
  });

  await t('#9 続けて2件削除しても、「元に戻す」で両方が元の位置に戻る', async open => {
    const st = base({ transactions: [tx('a', 1), tx('b', 2), tx('c', 3), tx('d', 4)] });
    const a = open(boot({ server: null, localState: st }));
    await sleep(50);
    a.w.removeWithUndo('transactions', 'b', '記録を削除しました');
    a.w.removeWithUndo('transactions', 'c', '記録を削除しました');
    assert.strictEqual(a.w.document.getElementById('undo-msg').textContent, '2件を削除しました');
    assert.strictEqual(J(a.w.__t.state.transactions.map(x => x.id)), J(['a', 'd']));
    a.w.performUndo();
    assert.strictEqual(J(a.w.__t.state.transactions.map(x => x.id)), J(['a', 'b', 'c', 'd']));
  });
  await t('#9 種類の違う削除（記録と定期支出）もまとめて戻せる／1件なら従来の表示', async open => {
    const st = base({ transactions: [tx('a', 1)], fixedExpenses: [{ id: 'f1', name: '家賃', amount: 1, day: 1, classId: 'c1', categoryId: 'cat1', paymentId: 'p1', lastRunDate: TODAY }] });
    const a = open(boot({ server: null, localState: st }));
    await sleep(50);
    a.w.removeWithUndo('transactions', 'a', '記録を削除しました');
    assert.strictEqual(a.w.document.getElementById('undo-msg').textContent, '記録を削除しました');
    a.w.removeWithUndo('fixedExpenses', 'f1', '定期支出を削除しました');
    a.w.performUndo();
    assert.strictEqual(a.w.__t.state.transactions.length, 1);
    assert.strictEqual(a.w.__t.state.fixedExpenses.length, 1);
  });
  await t('#9 表示が消えた後の削除は、新しい取り消しとして扱う', async open => {
    const st = base({ transactions: [tx('a', 1), tx('b', 2)] });
    const a = open(boot({ server: null, localState: st }));
    await sleep(50);
    a.w.removeWithUndo('transactions', 'a', '記録を削除しました');
    a.w.hideUndoToast();
    a.w.removeWithUndo('transactions', 'b', '記録を削除しました');
    a.w.performUndo();
    assert.strictEqual(J(a.w.__t.state.transactions.map(x => x.id)), J(['b']));
  });

  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  await t('#10 月の途中から記録を始めた月は、始めた日を起点に着地予測を出す', async open => {
    if (today.getDate() < 3) { results.push('INFO #10 は月の3日以降でのみ確認'); return; }
    const txs = [0, 1, 2].map(n => tx('v' + n, 3000, { date: ds(daysAgo(n)) }));
    const a = open(boot({ server: null, localState: base({ transactions: txs }) }));
    await sleep(50);
    a.w.__t.renderStats();
    const text = a.w.document.getElementById('stats-content').textContent;
    const start = daysAgo(2);
    const span = daysInMonth - start.getDate() + 1;
    const expected = 3000 * span; // 1日 3,000円 × 記録開始日から月末までの日数
    const oldWay = Math.round(9000 / today.getDate() * daysInMonth);
    assert(text.includes('¥' + expected.toLocaleString()), `expected ¥${expected.toLocaleString()} (old: ¥${oldWay.toLocaleString()})`);
    assert(text.includes(`記録を始めた ${start.getMonth() + 1}/${start.getDate()} からの分で予測`), 'caption');
    results.push(`INFO #10 1日3,000円を3日間 → 予測 ¥${expected.toLocaleString()}（修正前の計算では ¥${oldWay.toLocaleString()}）`);
  });
  await t('#10 前の月から記録している場合は、従来どおり月初から日割り', async open => {
    const txs = [tx('prev', 1000, { date: ds(new Date(today.getFullYear(), today.getMonth() - 1, 10)) }), tx('v0', 2300, { date: TODAY })];
    const a = open(boot({ server: null, localState: base({ transactions: txs }) }));
    await sleep(50);
    a.w.__t.renderStats();
    const text = a.w.document.getElementById('stats-content').textContent;
    const expected = Math.round(2300 / today.getDate() * daysInMonth);
    assert(text.includes('¥' + expected.toLocaleString()), 'expected ¥' + expected.toLocaleString());
    assert(!text.includes('記録を始めた'), 'no caption');
  });

  console.log(results.join('\n'));
  const failed = results.filter(r => r.startsWith('FAIL')).length;
  console.log(`\n${results.filter(r => r.startsWith('PASS')).length} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
