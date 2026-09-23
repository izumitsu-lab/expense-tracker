/* 家計簿アプリ v2.8 — js/storage.js（2/10）
 * 端末内の保存（IndexedDB。使えないときは localStorage）・定期支出の自動追加
 * index.html で core → storage → ui → input → history → stats → settings → sync → keyboard → main の順に読み込む。
 * 関数や変数はファイルをまたいで共有する（読み込み時にすぐ実行する処理は、それより前のファイルの関数だけを使う）。
 */
/* ==================== 端末内の保存（v2.8: IndexedDB） ====================
 * 以前は localStorage（上限 約5MB）に保存していた。IndexedDB は端末の空き容量に応じて大きく使える。
 *  ・初回起動時に localStorage の内容を IndexedDB へ移す（元のデータは別名で残す）
 *  ・IndexedDB が使えない環境（一部のプライベートブラウズなど）では、従来どおり localStorage を使う
 *  ・書き込みは呼び出した順に行う。put の時点で内容を複製するので、その後に state を変えても影響しない
 */
const LS_STATE_KEY = 'premium_tracker_v18';
const LS_OLD_STATE_KEYS = ['premium_tracker_v17', 'premium_tracker_v16', 'premium_tracker_v15'];
const LS_BACKUP_KEY = 'premium_tracker_backup_before_idb';
const LS_SYNC_META_KEY = 'premium_tracker_syncmeta_v2';
const Store = (() => {
    const DB_NAME = 'kakeibo-app', OBJ = 'kv', DB_VERSION = 1, OPEN_TIMEOUT_MS = 4000;
    const LS_KEYS = { state: LS_STATE_KEY, syncmeta: LS_SYNC_META_KEY };
    let db = null;
    let mode = 'local';            // 'idb' または 'local'
    let chain = Promise.resolve(); // 書き込み待ちの列
    let errorHandler = null;

    function openDb() {
        return new Promise((resolve, reject) => {
            let req;
            try {
                if (typeof indexedDB === 'undefined' || !indexedDB) throw new Error('IndexedDB が使えません');
                req = indexedDB.open(DB_NAME, DB_VERSION);
            } catch (e) { reject(e); return; }
            const timer = setTimeout(() => reject(new Error('IndexedDB の準備が時間内に終わりませんでした')), OPEN_TIMEOUT_MS);
            req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains(OBJ)) d.createObjectStore(OBJ); };
            req.onsuccess = () => { clearTimeout(timer); resolve(req.result); };
            req.onerror = () => { clearTimeout(timer); reject(req.error || new Error('IndexedDB を開けませんでした')); };
            req.onblocked = () => { clearTimeout(timer); reject(new Error('IndexedDB が他のタブで使用中です')); };
        });
    }
    function idbGet(key) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(OBJ, 'readonly');
            const r = tx.objectStore(OBJ).get(key);
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
        });
    }
    function idbPut(key, value) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(OBJ, 'readwrite');
            tx.objectStore(OBJ).put(value, key); // ここで内容が複製される
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('書き込みに失敗しました'));
            tx.onabort = () => reject(tx.error || new Error('書き込みが中断されました'));
        });
    }
    async function init() {
        try {
            db = await openDb();
            db.onversionchange = () => { try { db.close(); } catch (e) {} };
            mode = 'idb';
        } catch (e) {
            console.warn('IndexedDB を使えないため localStorage に保存します:', e && e.message);
            db = null; mode = 'local';
        }
        return mode;
    }
    async function get(key) {
        if (mode === 'idb') return idbGet(key);
        const raw = localStorage.getItem(LS_KEYS[key]);
        return raw ? JSON.parse(raw) : undefined;
    }
    // 保存する（IndexedDB では完了を待たずに戻る。失敗したら errorHandler に知らせる）
    function put(key, value) {
        if (mode === 'idb') {
            let p;
            try { p = idbPut(key, value); } catch (e) { p = Promise.reject(e); }
            const done = p.catch(err => { if (errorHandler) errorHandler(err); });
            chain = chain.then(() => done);
            return p;
        }
        try { localStorage.setItem(LS_KEYS[key], JSON.stringify(value)); return Promise.resolve(); }
        catch (err) { if (errorHandler) errorHandler(err); return Promise.reject(err); }
    }
    return {
        init, get, put,
        get mode() { return mode; },
        whenIdle: () => chain,                   // それまでの書き込みがすべて終わるのを待つ
        onError: fn => { errorHandler = fn; }
    };
})();

let storageErrorShown = false;
Store.onError(e => {
    console.error('端末内の保存エラー:', e);
    if (storageErrorShown) return;
    storageErrorShown = true;
    setTimeout(() => { storageErrorShown = false; }, 10000);
    if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
        showAlert("端末の保存容量がいっぱいです！設定からJSONバックアップを取り、端末の空き容量を増やしてください。");
    } else {
        showAlert("データの保存に失敗しました: " + ((e && e.message) || "ストレージ例外"));
    }
});

let cachedSyncMeta = null; // 端末内の同期記録（起動時に読み込み、保存のたびに更新）

// 保存されているデータを state に読み込む（起動時に1回）
async function initData() {
    let parsed = null;
    let migratedRaw = null;
    try {
        parsed = await Store.get('state');
        if (!parsed && Store.mode === 'idb') {
            // 初回：localStorage（v2.7 以前）から移す
            let raw = localStorage.getItem(LS_STATE_KEY);
            for (const k of LS_OLD_STATE_KEYS) { if (raw) break; raw = localStorage.getItem(k); }
            if (raw) { parsed = JSON.parse(raw); migratedRaw = raw; }
        }
        if (!parsed && Store.mode === 'local') {
            for (const k of LS_OLD_STATE_KEYS) { const raw = localStorage.getItem(k); if (raw) { parsed = JSON.parse(raw); break; } }
        }
    } catch (e) {
        console.error("Local load failed", e);
        showAlert("端末内データの読み込みでエラーが発生しました。");
    }
    if (parsed && typeof parsed === 'object') {
        state.transactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];
        state.timeSlots = Array.isArray(parsed.timeSlots) && parsed.timeSlots.length > 0 ? parsed.timeSlots : DEFAULT_STATE.timeSlots;
        state.quickTimes = Array.isArray(parsed.quickTimes) && parsed.quickTimes.length > 0 ? parsed.quickTimes : DEFAULT_STATE.quickTimes;
        state.shopClasses = Array.isArray(parsed.shopClasses) ? parsed.shopClasses : DEFAULT_STATE.shopClasses;
        state.categories = Array.isArray(parsed.categories) ? parsed.categories : DEFAULT_STATE.categories;
        state.paymentMethods = Array.isArray(parsed.paymentMethods) ? parsed.paymentMethods : DEFAULT_STATE.paymentMethods;
        state.shops = Array.isArray(parsed.shops) ? parsed.shops : DEFAULT_STATE.shops;
        state.shortcuts = Array.isArray(parsed.shortcuts) ? parsed.shortcuts : DEFAULT_STATE.shortcuts;
        state.fixedExpenses = Array.isArray(parsed.fixedExpenses) ? parsed.fixedExpenses : [];
        state.lastRunDate = typeof parsed.lastRunDate === 'string' ? parsed.lastRunDate : "";
        state.autoUpdateShopPayment = Boolean(parsed.autoUpdateShopPayment);
    }
    if (!state.timeSlots || state.timeSlots.length === 0) {
        state.timeSlots = JSON.parse(JSON.stringify(DEFAULT_STATE.timeSlots));
    }
    if (!state.quickTimes || state.quickTimes.length === 0) {
        state.quickTimes = JSON.parse(JSON.stringify(DEFAULT_STATE.quickTimes));
    }

    // 同期の記録
    try {
        let meta = await Store.get('syncmeta');
        if (!meta && Store.mode === 'idb') {
            const rawMeta = localStorage.getItem(LS_SYNC_META_KEY);
            if (rawMeta) { meta = JSON.parse(rawMeta); if (migratedRaw) await Store.put('syncmeta', meta); }
        }
        cachedSyncMeta = meta || null;
    } catch (e) { cachedSyncMeta = null; }

    if (migratedRaw) {
        // IndexedDB に書けたことを確かめてから、localStorage の元データを別名（バックアップ）に移す
        try {
            await Store.put('state', state);
            const check = await Store.get('state');
            if (check && Array.isArray(check.transactions) && check.transactions.length === state.transactions.length) {
                try { localStorage.setItem(LS_BACKUP_KEY, migratedRaw); } catch (e) {}
                localStorage.removeItem(LS_STATE_KEY);
                localStorage.removeItem(LS_SYNC_META_KEY);
            }
        } catch (e) { console.error('IndexedDB への移行に失敗しました（localStorage のデータはそのまま残ります）', e); }
    }
    updateUnsetBadge();
}

// [v2.8] 端末内のデータの読み込み（起動時に1回）。同期や画面の表示はこれが終わってから始める
// 読み込みは、すべてのファイルを読み終えてから main.js で始める（startStorage）
let resolveStorageReady;
const storageReady = new Promise(resolve => { resolveStorageReady = resolve; });
function startStorage() {
    Store.init().then(() => initData()).catch(e => { console.error('起動時の読み込みエラー', e); }).then(() => resolveStorageReady());
    return storageReady;
}

function saveData() { 
    Store.put('state', state).catch(() => {}); // 失敗時の知らせは Store.onError で行う
    syncToCloud(); 
    updateUnsetBadge();
}

// "YYYY-MM-DD" を端末のローカル日付として解釈する
// [修正] new Date("2026-09-23") は UTC 扱いになり、日本より西のタイムゾーンでは1日ずれるため
function parseDateStr(s) {
    if (!s || typeof s !== 'string') return new Date(NaN);
    const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return new Date(NaN);
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// 定期支出の自動追加は「クラウドの最新状態を読み込んだ後」に行う（ログインしていない場合はすぐ）
let fixedProcessingAllowed = false;
let lastFixedCheckDay = '';
function allowFixedProcessing() {
    fixedProcessingAllowed = true;
    backfillShopIds();
    processFixedExpenses();
    try { refreshCurrentView(); } catch (e) {}
}
// [修正] アプリを開いたまま日付をまたいだ場合にも処理する
function checkFixedExpensesDateChange() {
    if (!fixedProcessingAllowed) return;
    if (toDateStr(new Date()) !== lastFixedCheckDay) {
        processFixedExpenses();
        try { refreshCurrentView(); } catch (e) {}
    }
}
setInterval(checkFixedExpensesDateChange, 60 * 1000);

// [修正] 最終実行日を各定期支出ごと（fixedExpenses の lastRunDate 欄）にも記録する。
//   この欄は既存の fixedExpenses コレクションで同期されるため、他の端末で処理済みの日付を再生成しない。
//   （欄が無い古いデータは、従来どおり端末ごとの lastRunDate を使う）
function processFixedExpenses() {
    if (!fixedProcessingAllowed) return;
    const todayStr = toDateStr(new Date());
    lastFixedCheckDay = todayStr;
    const globalLast = state.lastRunDate || '';
    const today = parseDateStr(todayStr);
    let addedCount = 0;
    let changed = false;

    (state.fixedExpenses || []).forEach(fe => {
        if (!fe || !fe.id) return;
        const from = (typeof fe.lastRunDate === 'string' && fe.lastRunDate) ? fe.lastRunDate : globalLast;
        if (!from) { fe.lastRunDate = todayStr; changed = true; return; }
        if (from >= todayStr) {
            if (fe.lastRunDate !== todayStr && from === todayStr) { fe.lastRunDate = todayStr; changed = true; }
            return;
        }
        const lastRun = parseDateStr(from);
        if (isNaN(lastRun.getTime())) { fe.lastRunDate = todayStr; changed = true; return; }
        const cur = new Date(lastRun); cur.setDate(cur.getDate() + 1);
        while (cur <= today) {
            const y = cur.getFullYear(); const m = cur.getMonth() + 1; const d = cur.getDate();
            const lastDayOfMonth = new Date(y, m, 0).getDate();
            let targetDay = parseInt(fe.day, 10); if (isNaN(targetDay)) targetDay = 1;
            if (targetDay > lastDayOfMonth) targetDay = lastDayOfMonth;
            if (d === targetDay) {
                const dateStr = toDateStr(cur);
                const txnId = `fx_${fe.id}_${dateStr}`;
                if (!state.transactions.find(t => t.id === txnId)) {
                    const isPending = Boolean(fe.isPending || fe.amount === 0);
                    state.transactions.push({
                        id: txnId,
                        amount: isPending ? 0 : fe.amount,
                        isPending: isPending,
                        date: dateStr,
                        time: "09:00",
                        classId: fe.classId,
                        categoryId: fe.categoryId,
                        shopName: shopDisplayName(fe),
                        shopId: fe.shopId || resolveShopIdByName(fe.shopName, fe.classId, true),
                        paymentId: fe.paymentId,
                        memo: fe.memo || (isPending ? '定期支出 (金額未定)' : '定期支出'),
                        isFixed: fe.isFixed === false ? false : true,
                        ts: new Date(y, m - 1, d, 9, 0, 0).getTime() || Date.now()
                    });
                    addedCount++;
                }
            }
            cur.setDate(cur.getDate() + 1);
        }
        fe.lastRunDate = todayStr; changed = true;
    });

    if (state.lastRunDate !== todayStr) { state.lastRunDate = todayStr; changed = true; }
    if (changed || addedCount > 0) saveData();
    if (addedCount > 0) showAlert(`定期支出が ${addedCount}件 履歴に追加されました。`);
}
