/* 家計簿アプリ v2.8 — js/sync.js（8/10）
 * Firebase（ログイン・クラウド同期・差分同期・自動復帰）
 * index.html で core → storage → ui → input → history → stats → settings → sync → keyboard → main の順に読み込む。
 * 関数や変数はファイルをまたいで共有する（読み込み時にすぐ実行する処理は、それより前のファイルの関数だけを使う）。
 */
/* ==================== Firebase クラウド同期 ==================== */
// ※ Firestore 上の場所（users/{uid}/{コレクション名}/{id}）は旧バージョンと同じです。
//   [v2.6] 各ドキュメントに _updatedAt（更新日時）と、削除時の _deleted（削除済みの印）が加わります。
//   v2.5 以前の端末とは同期できません（全端末を v2.6 にそろえてください）。
// [v2.4] ログイン処理のドメイン（authDomain）をアプリと同じドメインにする（Safari・iPhone のホーム画面版対策）
//   Safari はドメインをまたぐ保存領域を分離するため、アプリ（例: xxx.web.app）と authDomain（xxx.firebaseapp.com）が
//   違うと、リダイレクト方式のログインが失敗しやすい。Firebase Hosting で公開している場合は、
//   アプリ自身のドメインの /__/auth/handler をログイン処理に使えるため、同じドメインに揃える。
//   ・既定の2つのドメイン（web.app / firebaseapp.com）は自動で判定します。
//   ・Firebase Hosting に独自ドメインをつないでいる場合は、下の配列にそのドメインを追加してください（例: 'kakeibo.example.com'）。
//   ・Firebase Hosting 以外（GitHub Pages など）で公開している場合は、従来どおり firebaseapp.com を使います。
const FIREBASE_PROJECT_ID = "expense-tracker-5e542";
const DEFAULT_AUTH_DOMAIN = FIREBASE_PROJECT_ID + ".firebaseapp.com";
const SAME_ORIGIN_AUTH_HOSTS = [
    FIREBASE_PROJECT_ID + ".web.app",
    FIREBASE_PROJECT_ID + ".firebaseapp.com"
    // , 'kakeibo.example.com'   ← 独自ドメインを Firebase Hosting で使う場合はここに追加
];
const AUTH_ON_SAME_ORIGIN = (location.protocol === 'https:' && SAME_ORIGIN_AUTH_HOSTS.includes(location.hostname));
const firebaseConfig = {
    apiKey: "AIzaSyD9pqm3qVbxf9gGxl9us-xq_Vuqpjx_8As",
    authDomain: AUTH_ON_SAME_ORIGIN ? location.host : DEFAULT_AUTH_DOMAIN,
    projectId: FIREBASE_PROJECT_ID,
    storageBucket: "expense-tracker-5e542.firebasestorage.app",
    messagingSenderId: "555839306793",
    appId: "1:555839306793:web:fe23d6717fa5ae6ceff038"
};

let firebaseAvailable = (typeof firebase !== 'undefined');
let auth = null, db = null;
if (firebaseAvailable) {
    try {
        firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        // [修正] enablePersistence は Promise を返すため try/catch では失敗を捕まえられない
        try {
            const p = db.enablePersistence({ synchronizeTabs: true });
            if (p && typeof p.catch === 'function') p.catch(e => console.warn('Firestore persistence not available', e));
        } catch (e) { console.warn('Firestore persistence not available', e); }
    } catch (e) {
        console.error('Firebase初期化失敗', e);
        firebaseAvailable = false;
    }
}

const SYNCED_COLLECTIONS = ['transactions', 'timeSlots', 'quickTimes', 'shopClasses', 'categories', 'paymentMethods', 'shops', 'shortcuts', 'fixedExpenses'];
const ORDERED_COLLECTIONS = new Set(['timeSlots', 'quickTimes', 'shopClasses', 'categories', 'paymentMethods', 'shops', 'shortcuts', 'fixedExpenses']);
const DEFAULTABLE_COLLECTIONS = ['timeSlots', 'quickTimes', 'shopClasses', 'categories', 'paymentMethods', 'shops'];
// [修正] Firestore の1バッチは最大500操作。余裕を持って400件ずつに分割してコミットする
const MAX_BATCH_OPS = 400;

/* ---------- [v2.6] 差分同期 ----------
 * 起動のたびに全件を読むのをやめ、「前回以降に変わったドキュメントだけ」を読む。
 *  ・各ドキュメントに更新日時 _updatedAt（サーバー時刻）を付ける
 *  ・削除はドキュメントを消さず、「削除済みの印」（_deleted: true）を付けて残す
 *    → 他の端末は「前回以降に変わった分」を読むだけで削除も受け取れる
 *  ・端末ごとに「どこまで読んだか」（コレクションごとの最終 _updatedAt）を秒・ナノ秒のまま正確に記録する
 *    （Firestore の監視結果は一貫しているため、記録した時刻より新しいものだけを読めば取りこぼさない）
 *  ・次の場合だけ全件を読む：この端末で初めて v2.6 を使うとき／アカウントが変わったとき／
 *    前回の全件読み込みから30日以上たったとき（取りこぼしがあっても自然に直る安全網）
 *  ・全件を読んだとき、_updatedAt の無い旧形式のドキュメントは新形式で書き直す（移行）
 */
const LEGACY_SYNC_META_KEY = 'premium_tracker_syncmeta_v1';
const FULL_RESYNC_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30日

function withOrder(arr, name) {
    if (!ORDERED_COLLECTIONS.has(name)) return arr;
    return (arr || []).map((item, idx) => Object.assign({}, item, { _order: idx }));
}
function sortByOrder(arr) {
    return arr.slice().sort((a, b) => (a._order ?? 0) - (b._order ?? 0));
}
// キーの並び順に左右されない比較用 JSON（Firestore から返るオブジェクトはキー順が変わることがあるため）
function stableStringify(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(x => (x === undefined ? 'null' : stableStringify(x))).join(',') + ']';
    return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}
// [v2.6] 内容の指紋（53ビットのハッシュ）。端末内に「送信済みの内容」を小さく記録するために使う
function hashString(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
function itemHash(item) { return hashString(stableStringify(item)); }
function buildHashMap(arr) {
    return new Map((arr || []).filter(x => x && x.id).map(item => [item.id, itemHash(item)]));
}
function serverTimestamp() { return firebase.firestore.FieldValue.serverTimestamp(); }
// Firestore へ送る形（undefined を除き、更新日時を付ける）
function toFirestoreData(item) {
    const d = JSON.parse(JSON.stringify(item));
    delete d._deleted;
    d._updatedAt = serverTimestamp();
    return d;
}
function tombstoneData(id) { return { id: id, _deleted: true, _updatedAt: serverTimestamp() }; }
// Firestore から来たデータから同期用の欄を取り除く（画面・端末内保存・JSON 書き出しには含めない）
function stripMeta(data) {
    const o = Object.assign({}, data);
    delete o._updatedAt; delete o._deleted;
    return o;
}
// 更新日時を [秒, ナノ秒] で取り出す（無ければ null）
function docStamp(d) {
    try {
        const v = (typeof d.get === 'function') ? d.get('_updatedAt') : (d.data() || {})._updatedAt;
        if (v && typeof v.seconds === 'number' && typeof v.nanoseconds === 'number') return [v.seconds, v.nanoseconds];
    } catch (e) {}
    return null;
}
function stampGreater(a, b) { return a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]); }
function isStamp(v) { return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number'; }
function docHasPendingWrites(d) { return Boolean(d && d.metadata && d.metadata.hasPendingWrites); }

let collRefs = {};
// lastSyncedMaps[name]: id → サーバーと一致していると確認できた内容の指紋
//   ローカルの内容の指紋がこれと違う項目 ＝ まだ送っていない変更
let lastSyncedMaps = {};
SYNCED_COLLECTIONS.forEach(name => { lastSyncedMaps[name] = new Map(); });
let syncCursors = {};        // name → どこまで読んだか（_updatedAt の [秒, ナノ秒]）
let lastFullSyncAt = 0;      // 最後に全件を読んだ時刻
let syncMode = 'full';       // 'full'（全件） または 'delta'（差分）
let syncDebounceTimer = null;
let cloudReady = false;
let currentUid = null;
let snapshotUnsubs = [];
let localDirty = false;      // saveData 後、まだクラウドへ送る処理を始めていない変更がある
let syncInFlight = 0;        // 送信中のコミット数
let bootstrapToken = 0;      // ログイン切り替え時に古い初期化処理を無効化するための番号
// [v2.4] 同期の自動復帰（初期化・送信・監視のどれかが失敗したら、時間をおいて再試行する）
let pendingBootstrapUid = null;  // 初期化に失敗して、やり直しが必要なアカウント
let bootstrapInFlight = 0;       // 実行中の初期化の数
let recoveryTimer = null;
let recoveryAttempt = 0;
const RECOVERY_BASE_MS = 5000;        // 5秒 → 10秒 → 20秒 … と間隔を広げる
const RECOVERY_MAX_MS = 5 * 60 * 1000; // 最長5分
let syncFailed = false;          // 直前の送信が失敗した
// [v2.4] サーバーの最新状態を確認できたコレクション（オフライン起動時の定期支出の保留に使う）
let serverConfirmed = new Set();

// 端末内の同期記録（v2.6 形式）：{ uid, maps: {name: {id: 指紋}}, cursors: {name: [秒, ナノ秒]}, lastFull: ミリ秒 }
function loadSyncMeta() {
    // [v2.8] 起動時に端末内の保存場所から読み込んだものを使う
    const m = cachedSyncMeta;
    if (!m || typeof m.uid !== 'string' || !m.maps || typeof m.maps !== 'object') return null;
    return m;
}
// v2.5 以前の同期記録（IDの一覧だけ）。初回の全件読み込みで「他の端末で削除された項目」の判定に使う
function loadLegacySyncMeta() {
    try {
        const raw = localStorage.getItem(LEGACY_SYNC_META_KEY);
        if (!raw) return null;
        const m = JSON.parse(raw);
        if (!m || typeof m.uid !== 'string' || !m.ids || typeof m.ids !== 'object') return null;
        return m;
    } catch (e) { return null; }
}
function persistSyncMeta() {
    if (!currentUid) return;
    try {
        const maps = {};
        SYNCED_COLLECTIONS.forEach(name => {
            const o = {};
            lastSyncedMaps[name].forEach((h, id) => { o[id] = h; });
            maps[name] = o;
        });
        cachedSyncMeta = { uid: currentUid, maps, cursors: Object.assign({}, syncCursors), lastFull: lastFullSyncAt };
        Store.put('syncmeta', cachedSyncMeta).catch(() => {});
    } catch (e) { console.warn('sync meta save failed', e); }
}
function saveLocalOnly() {
    Store.put('state', state).catch(() => {});
}

function setSyncBadge(mode, errText = "") {
    const detail = document.getElementById('lbl-sync-detail');
    const statusLbl = document.getElementById('lbl-sync-status');
    if (!detail) return;
    if (mode === 'syncing') {
        detail.textContent = '同期中…';
    } else if (mode === 'offline') {
        // [v2.4] サーバー未確認の間は定期支出の自動追加を保留していることも伝える
        detail.textContent = '保存待機中 (オフライン)' + ((currentUid && !fixedProcessingAllowed) ? '・定期支出は接続後に追加します' : '');
        if (statusLbl) statusLbl.textContent = '保留中';
    } else if (mode === 'error') {
        detail.textContent = (errText ? `エラー: ${errText}` : '同期に失敗しました') + (recoveryTimer ? '（自動で再試行します）' : '');
        if (statusLbl) statusLbl.textContent = 'エラー';
    } else {
        detail.textContent = '正常に同期されています';
        if (statusLbl) statusLbl.textContent = 'オン';
    }
}

function syncToCloud() {
    if (!firebaseAvailable || !cloudReady) return;
    localDirty = true;
    // [v2.4] 電波がない・サーバー未確認のときは「同期中」ではなく「保存待機中」と表示する
    const offlineNow = (typeof navigator !== 'undefined' && navigator.onLine === false) || !isServerConfirmed();
    setSyncBadge(offlineNow ? 'offline' : 'syncing');
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(doSyncNow, 350);
}

// ローカルの内容と「送信済みの指紋」を比べて、送るべき変更を集める
//   追加・変更 → 内容を送る／削除 → 削除済みの印を送る
function diffCollectionOps(name, ops) {
    const localArr = withOrder(state[name] || [], name).filter(x => x && x.id);
    const lastMap = lastSyncedMaps[name];
    const seen = new Set();
    localArr.forEach(item => {
        seen.add(item.id);
        const h = itemHash(item);
        if (lastMap.get(item.id) !== h) ops.push({ type: 'set', coll: name, id: item.id, hash: h, ref: collRefs[name].doc(item.id), data: toFirestoreData(item) });
    });
    lastMap.forEach((h, id) => {
        if (!seen.has(id)) ops.push({ type: 'tombstone', coll: name, id: id, ref: collRefs[name].doc(id), data: tombstoneData(id) });
    });
}

async function commitOpsInChunks(ops) {
    for (let i = 0; i < ops.length; i += MAX_BATCH_OPS) {
        const batch = db.batch();
        ops.slice(i, i + MAX_BATCH_OPS).forEach(op => { batch.set(op.ref, op.data); });
        await batch.commit();
    }
}
// 送信できた変更を「送信済み」として記録する（送った項目だけを更新する）
function markOpsSynced(ops) {
    ops.forEach(op => {
        const m = lastSyncedMaps[op.coll];
        if (!m) return;
        if (op.type === 'set') m.set(op.id, op.hash); else m.delete(op.id);
    });
}

async function doSyncNow() {
    clearTimeout(syncDebounceTimer); syncDebounceTimer = null;
    if (!cloudReady || !collRefs.transactions) return;
    const myToken = bootstrapToken;
    localDirty = false;
    syncInFlight++;
    try {
        const ops = [];
        SYNCED_COLLECTIONS.forEach(name => diffCollectionOps(name, ops));
        if (ops.length > 0) await commitOpsInChunks(ops);
        if (myToken !== bootstrapToken) return;
        markOpsSynced(ops);
        persistSyncMeta();
        syncFailed = false;
        if (!pendingBootstrapUid) { recoveryAttempt = 0; clearTimeout(recoveryTimer); recoveryTimer = null; }
        setSyncBadge(isServerConfirmed() ? 'ok' : 'offline');
    } catch (e) {
        console.error('クラウド同期エラー:', e);
        if (myToken !== bootstrapToken) return;
        // [v2.4] 送れなかった変更は「未送信」に戻し、あとで自動的に送り直す
        localDirty = true;
        syncFailed = true;
        if (isPermissionError(e)) { handlePermissionDenied(); return; }
        scheduleSyncRecovery();
        setSyncBadge('error', e.message);
    } finally {
        syncInFlight--;
    }
}
// 未送信の変更を今すぐ送る（復元直後のリロード前や、アプリを閉じる直前など）
async function flushSync() {
    if (!cloudReady) return;
    if (localDirty || syncDebounceTimer) await doSyncNow();
}

let refreshScheduled = false;
function refreshCurrentView() {
    // [改善] スナップショットが連続で届いても再描画は1フレームに1回にまとめる
    if (refreshScheduled) return;
    refreshScheduled = true;
    const run = () => {
        refreshScheduled = false;
        updateUnsetBadge();
        const views = [renderShortcuts, updateFilterButtonsUI, renderCalendar, renderStats, renderFixedExpenses];
        views.forEach(fn => {
            try { fn(); } catch (e) { console.warn("View re-render warning:", e); }
        });
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 0);
}

// [v2.6] 他の端末からの変更を1件ずつ反映する
//   changes: [{ id, data }]（data が null なら削除）
//   ・ローカルでまだ送っていない変更がある項目 → ローカルを優先（あとで送る）
//   ・それ以外 → リモートの内容を採用
//   戻り値: ローカルを優先した項目があれば true（送信が必要）
function applyRemoteChanges(name, changes) {
    if (!changes.length) return false;
    const ordered = ORDERED_COLLECTIONS.has(name);
    // 並び順のあるコレクションは、今の並び（配列の順番）を _order に書き込んでから統合する
    const working = (ordered ? withOrder(state[name] || [], name) : (state[name] || [])).filter(x => x && x.id);
    const map = lastSyncedMaps[name];
    const byId = new Map(working.map(i => [i.id, i]));
    // 変わった項目だけ指紋を計算する（件数が多くても1件の変更は軽く済む）
    const localHash = new Map();
    changes.forEach(({ id }) => { if (byId.has(id)) localHash.set(id, itemHash(byId.get(id))); });
    let applied = false, keptLocal = false;
    changes.forEach(({ id, data }) => {
        const locallyChanged = localHash.get(id) !== map.get(id);
        if (data) map.set(id, itemHash(data)); else map.delete(id);
        if (locallyChanged) { keptLocal = true; return; }
        if (data) byId.set(id, data); else byId.delete(id);
        applied = true;
    });
    if (applied) {
        const seen = new Set();
        let next = [];
        working.forEach(i => { if (byId.has(i.id)) { next.push(byId.get(i.id)); seen.add(i.id); } });
        byId.forEach((item, id) => { if (!seen.has(id)) next.push(item); });
        if (ordered) next = sortByOrder(next);
        state[name] = next;
    }
    return keptLocal;
}

// 監視の結果から「変わった項目」を取り出す
//   全件モードの 'removed' ＝ サーバーで完全に消された（旧版の端末が消した）→ 削除として扱う
//   差分モードの 'removed' は、送信中の更新日時が一時的に条件から外れただけなので無視する
function snapshotChanges(snap, mode) {
    const out = [];
    snap.docChanges().forEach(ch => {
        const id = ch.doc.id;
        if (ch.type === 'removed') { if (mode === 'full') out.push({ id, data: null }); return; }
        const raw = ch.doc.data();
        if (!raw) return;
        out.push({ id, data: raw._deleted ? null : stripMeta(raw) });
    });
    return out;
}

// サーバーの結果から「どこまで読んだか」を進める（端末内のコピーの結果では進めない）
function advanceCursor(name, snap) {
    if (snap.metadata && snap.metadata.fromCache) return;
    let max = isStamp(syncCursors[name]) ? syncCursors[name] : null;
    snap.docs.forEach(d => {
        if (docHasPendingWrites(d)) return;
        const st = docStamp(d);
        if (st !== null && (max === null || stampGreater(st, max))) max = st;
    });
    syncCursors[name] = (max === null) ? [0, 0] : max;
}

function detachRealtimeListeners() {
    snapshotUnsubs.forEach(unsub => { try { unsub(); } catch (e) {} });
    snapshotUnsubs = [];
}

// リアルタイム監視（コレクションごと）
//   差分モード：_updatedAt が「前回読んだところ」より新しいドキュメントだけを監視する
//   全件モード：コレクション全体を監視する（初回・アカウント変更・30日ごと）
let listenerState = {};   // name -> { mode, merged, queue, latest }
let bootWaiter = null;    // 初期化が最初の結果を待っている間だけ存在する
const INITIAL_SERVER_WAIT_MS = 10000; // サーバーの応答を待つ最長時間（超えたら端末内のコピーで始める）

function attachRealtimeListeners(myToken, mode) {
    detachRealtimeListeners();
    listenerState = {};
    SYNCED_COLLECTIONS.forEach(name => {
        const ls = listenerState[name] = { mode, merged: mode !== 'full', queue: [], latest: null };
        let query = collRefs[name];
        if (mode === 'delta') {
            const c = isStamp(syncCursors[name]) ? syncCursors[name] : [0, 0];
            query = collRefs[name].where('_updatedAt', '>', new firebase.firestore.Timestamp(c[0], c[1]));
        }
        // includeMetadataChanges: オフライン起動後に電波が戻ったとき、
        //   データに変化がなくても「サーバーで確認できた」ことを受け取るため（読み取り回数は増えない）
        const unsub = query.onSnapshot({ includeMetadataChanges: true }, snap => {
            if (myToken !== bootstrapToken) return;
            ls.latest = snap;
            if (!ls.merged) {
                // 全件モードの初期化中は結果を溜めておき、初期化の統合処理でまとめて使う
                ls.queue.push(snap);
            } else {
                handleSnapshot(name, snap, ls.mode);
            }
            if (!cloudReady && bootWaiter) bootWaiter.check();
        }, err => {
            console.error(`${name} のリアルタイム同期監視でエラー:`, err);
            if (myToken !== bootstrapToken) return;
            if (!cloudReady && bootWaiter) { bootWaiter.fail(err); return; }
            if (isPermissionError(err)) { handlePermissionDenied(); return; }
            // [v2.4] 監視はエラーで止まるため、初期化からやり直す
            if (currentUid && cloudReady) {
                pendingBootstrapUid = currentUid;
                cloudReady = false;
                detachRealtimeListeners();
                scheduleSyncRecovery();
            }
            setSyncBadge('error', err.message);
        });
        snapshotUnsubs.push(unsub);
    });
}

// 監視の結果を1回分反映する
function handleSnapshot(name, snap, mode) {
    const fromCache = Boolean(snap.metadata && snap.metadata.fromCache);
    const changes = snapshotChanges(snap, mode);
    if (changes.length > 0) {
        const keptLocal = applyRemoteChanges(name, changes);
        ensureMinimumSettings();
        saveLocalOnly();
        refreshCurrentView();
        if (keptLocal && cloudReady && !syncDebounceTimer && syncInFlight === 0) syncToCloud();
    }
    // state を保存した「後」で、どこまで読んだかを進めて記録する
    advanceCursor(name, snap);
    if (changes.length > 0 || !fromCache) persistSyncMeta();
    // [v2.4] サーバーの内容を state に反映した「後」で確認済みにする
    //   （先に確認済みにすると、古い定期支出のまま自動追加が走ってしまう）
    if (!fromCache && !serverConfirmed.has(name)) {
        serverConfirmed.add(name);
        onServerConfirmationProgress();
    }
}

// 全コレクションの「最初の結果」がそろうのを待つ
//   ・サーバーの結果がそろえば、すぐに進む
//   ・電波がないとき、または一定時間サーバーが応答しないときは、端末内のコピー（キャッシュ）で進む
//     （このときは削除の判定と定期支出の自動追加を行わない ＝ 安全側の扱い）
function waitForInitialSnapshots(myToken) {
    return new Promise((resolve, reject) => {
        let done = false, timedOut = false, timer = null;
        const latestOf = n => listenerState[n] && listenerState[n].latest;
        const allArrived = () => SYNCED_COLLECTIONS.every(n => latestOf(n));
        const allFromServer = () => SYNCED_COLLECTIONS.every(n => { const sn = latestOf(n); return sn && !(sn.metadata && sn.metadata.fromCache); });
        const finish = err => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            window.removeEventListener('offline', check);
            if (bootWaiter && bootWaiter.check === check) bootWaiter = null;
            if (err) reject(err); else resolve();
        };
        function check() {
            if (myToken !== bootstrapToken) return finish(); // 新しい初期化・ログアウトに置き換わった
            if (allFromServer()) return finish();
            const offline = (typeof navigator !== 'undefined' && navigator.onLine === false);
            if ((offline || timedOut) && allArrived()) return finish();
            if (timedOut) {
                const e = new Error('同期データを読み込めませんでした（通信がタイムアウトしました）');
                e.code = 'unavailable';
                return finish(e);
            }
        }
        bootWaiter = { check, fail: finish };
        timer = setTimeout(() => { timedOut = true; check(); }, INITIAL_SERVER_WAIT_MS);
        window.addEventListener('offline', check);
        check();
    });
}

// 時間帯・クイック時刻が空にならないようにする（旧 initData と同じ保証）
function ensureMinimumSettings() {
    if (!state.timeSlots || state.timeSlots.length === 0) state.timeSlots = JSON.parse(JSON.stringify(DEFAULT_STATE.timeSlots));
    if (!state.quickTimes || state.quickTimes.length === 0) state.quickTimes = JSON.parse(JSON.stringify(DEFAULT_STATE.quickTimes));
}

// 差分モードで始められるか（この端末に、同じアカウントの完全な同期記録があり、全件読み込みから30日以内）
function canUseDeltaSync(meta, uid) {
    if (!meta || meta.uid !== uid || !meta.cursors || typeof meta.lastFull !== 'number' || meta.lastFull <= 0) return false;
    if (Date.now() - meta.lastFull >= FULL_RESYNC_INTERVAL_MS) return false;
    return SYNCED_COLLECTIONS.every(n => isStamp(meta.cursors[n]) && meta.maps[n] && typeof meta.maps[n] === 'object');
}

async function bootstrapCloudSync(uid) {
    const myToken = ++bootstrapToken;
    if (bootWaiter) bootWaiter.check(); // 前の初期化の待機を終わらせる
    detachRealtimeListeners();
    cloudReady = false;
    currentUid = uid;
    serverConfirmed = new Set();
    collRefs = {};
    SYNCED_COLLECTIONS.forEach(name => { collRefs[name] = db.collection('users').doc(uid).collection(name); });

    const meta = loadSyncMeta();
    syncMode = canUseDeltaSync(meta, uid) ? 'delta' : 'full';
    if (syncMode === 'delta') {
        // 前回までの同期記録をそのまま使う（ローカルで変えた項目は、指紋の違いで分かる）
        SYNCED_COLLECTIONS.forEach(name => { lastSyncedMaps[name] = new Map(Object.entries(meta.maps[name])); });
        syncCursors = Object.assign({}, meta.cursors);
        lastFullSyncAt = meta.lastFull;
    } else {
        syncCursors = {};
    }

    attachRealtimeListeners(myToken, syncMode);
    try {
        await waitForInitialSnapshots(myToken);
    } catch (e) {
        if (myToken === bootstrapToken) detachRealtimeListeners();
        throw e;
    }
    if (myToken !== bootstrapToken) return;

    if (syncMode === 'full') mergeFullSnapshots(uid, meta);

    saveLocalOnly();
    persistSyncMeta();
    try { localStorage.removeItem(LEGACY_SYNC_META_KEY); } catch (e) {}
    cloudReady = true;
    pendingBootstrapUid = null;
    refreshCurrentView();
    setSyncBadge(isServerConfirmed() ? 'ok' : 'offline');
    // ローカルの未送信の変更（オフライン中の入力・移行の書き直しなど）を送る
    syncToCloud();
    // サーバーから読めていれば、定期支出の自動追加を許可する（キャッシュだけのときは保留）
    onServerConfirmationProgress();
}

// 全件モードの統合（初回・アカウント変更・30日ごと）
function mergeFullSnapshots(uid, meta) {
    const snaps = {};
    SYNCED_COLLECTIONS.forEach(name => {
        const ls = listenerState[name];
        snaps[name] = ls.queue[ls.queue.length - 1];
        ls.queue = [];
        ls.merged = true; // これ以降に届く結果は、1件ずつの反映（handleSnapshot）で処理する
    });

    // この端末の同期記録（前回どのアカウントで、どのIDがクラウドにあったか）
    const legacy = loadLegacySyncMeta();
    const metaUid = meta ? meta.uid : (legacy ? legacy.uid : null);
    const sameAccount = metaUid === uid;
    const otherAccount = Boolean(metaUid) && metaUid !== uid;
    const knownIdsOf = name => {
        if (meta && meta.maps && meta.maps[name]) return new Set(Object.keys(meta.maps[name]));
        if (legacy && legacy.ids && Array.isArray(legacy.ids[name])) return new Set(legacy.ids[name]);
        return new Set();
    };
    const anyFromCache = SYNCED_COLLECTIONS.some(name => snaps[name].metadata && snaps[name].metadata.fromCache);
    const remoteTotallyEmpty = SYNCED_COLLECTIONS.every(name => snaps[name].empty);
    // キャッシュからの読み込み（オフライン）や、クラウドが丸ごと空の場合は「リモートで削除された」と判断しない（安全側）
    const canPrune = sameAccount && !anyFromCache && !remoteTotallyEmpty;

    SYNCED_COLLECTIONS.forEach(name => {
        const liveDocs = [];
        const tombIds = new Set();
        const legacyIds = new Set(); // _updatedAt の無い旧形式のドキュメント → 新形式で書き直す
        snaps[name].docs.forEach(d => {
            const raw = d.data();
            if (!raw) return;
            if (raw._deleted) { tombIds.add(d.id); return; }
            liveDocs.push(stripMeta(raw));
            if (docStamp(d) === null && !docHasPendingWrites(d)) legacyIds.add(d.id);
        });
        let remoteItems = ORDERED_COLLECTIONS.has(name) ? sortByOrder(liveDocs) : liveDocs;
        const remoteIds = new Set(remoteItems.map(x => x.id));
        const knownIds = knownIdsOf(name);

        // ローカルにだけある項目（ただし他の端末で削除済みの印があるものは除く）
        let localOnly = (state[name] || []).filter(x => x && x.id && !remoteIds.has(x.id) && !tombIds.has(x.id));
        if (sameAccount && canPrune) {
            // [修正] 以前クラウドにあったのに今は無い = 他の端末で削除された → 復活させない
            localOnly = localOnly.filter(x => !knownIds.has(x.id));
        } else if (otherAccount) {
            // [修正] 別アカウントのデータを混ぜない。ログアウト中に新しく作った分だけ引き継ぐ
            localOnly = localOnly.filter(x => !knownIds.has(x.id));
        }

        let merged = remoteItems.concat(localOnly);
        if (otherAccount && merged.length === 0 && DEFAULTABLE_COLLECTIONS.includes(name)) {
            // 新しいアカウントで設定が空になる場合は初期設定を入れる
            merged = JSON.parse(JSON.stringify(DEFAULT_STATE[name]));
        }
        if (ORDERED_COLLECTIONS.has(name)) merged = withOrder(merged, name);

        state[name] = merged;
        // 「送信済み」として記録するのはサーバーにある新形式の項目だけ。
        //   ローカルにだけある項目・旧形式の項目・並び順が変わった項目は、指紋が合わないので次の送信で送られる
        const map = new Map();
        remoteItems.forEach(item => { if (!legacyIds.has(item.id)) map.set(item.id, itemHash(item)); });
        lastSyncedMaps[name] = map;
        advanceCursor(name, snaps[name]);
        if (!(snaps[name].metadata && snaps[name].metadata.fromCache)) serverConfirmed.add(name);
    });
    ensureMinimumSettings();
    if (!anyFromCache) lastFullSyncAt = Date.now();
    else syncCursors = {}; // キャッシュだけで始めた場合は、次回も全件を読む
}

function isServerConfirmed() {
    return SYNCED_COLLECTIONS.every(name => serverConfirmed.has(name));
}
// [v2.4] オフライン起動（キャッシュの古いデータ）で定期支出を自動追加すると、
//   他の端末で削除済みの記録が同じIDで作り直され、次の同期で復活してしまう。
//   そこで、全コレクションをサーバーで確認できるまで自動追加を保留する。
function onServerConfirmationProgress() {
    if (!cloudReady || !isServerConfirmed()) return;
    if (!fixedProcessingAllowed) allowFixedProcessing();
    if (!syncFailed && !localDirty && syncInFlight === 0 && !syncDebounceTimer) setSyncBadge('ok');
}

function isPermissionError(e) { return Boolean(e && e.code === 'permission-denied'); }
let permissionHandled = false;
async function handlePermissionDenied() {
    if (permissionHandled) return;
    permissionHandled = true;
    resetCloudState();
    try { await auth.signOut(); } catch (e) {}
    showAlert('このアカウントにはFirestoreへのアクセス権限がありません。Firebaseコンソールのセキュリティルールをご確認ください。');
    setTimeout(() => { permissionHandled = false; }, 3000);
}

// [v2.4] 同期の自動復帰
//   ・初期化の失敗 → 初期化をやり直す
//   ・送信の失敗   → 未送信の変更を送り直す
//   時間の間隔を広げながら再試行し、電波が戻ったとき・アプリを開き直したときはすぐに試す
function scheduleSyncRecovery() {
    clearTimeout(recoveryTimer);
    const delay = Math.min(RECOVERY_BASE_MS * Math.pow(2, recoveryAttempt), RECOVERY_MAX_MS);
    recoveryAttempt++;
    recoveryTimer = setTimeout(() => { recoveryTimer = null; attemptSyncRecovery(); }, delay);
}
async function runBootstrap(uid) {
    bootstrapInFlight++;
    try {
        await bootstrapCloudSync(uid);
        if (currentUid === uid && cloudReady) {
            recoveryAttempt = 0;
            clearTimeout(recoveryTimer); recoveryTimer = null;
        }
    } catch (e) {
        console.error('クラウド同期の初期化失敗:', e);
        if (isPermissionError(e)) { handlePermissionDenied(); return; }
        const user = auth && auth.currentUser;
        if (!user || user.uid !== uid) return; // 途中でログアウト・切り替えがあった
        pendingBootstrapUid = uid;
        scheduleSyncRecovery();
        setSyncBadge('error', e && e.message);
    } finally {
        bootstrapInFlight--;
    }
}
function attemptSyncRecovery() {
    if (!firebaseAvailable || !auth) return;
    const user = auth.currentUser;
    if (!user) { pendingBootstrapUid = null; return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        // 電波がないときは待つ（'online' イベントで再開）
        setSyncBadge('offline');
        return;
    }
    if (pendingBootstrapUid === user.uid && !cloudReady) {
        if (bootstrapInFlight > 0) return;
        setSyncBadge('syncing');
        runBootstrap(user.uid);
    } else if (cloudReady && (syncFailed || localDirty) && syncInFlight === 0) {
        doSyncNow();
    }
}

// [修正] ログアウト時にリアルタイム監視を確実に解除し、同期状態をリセットする
function resetCloudState() {
    bootstrapToken++;
    if (bootWaiter) bootWaiter.check(); // 初期化の待機を終わらせる
    detachRealtimeListeners();
    clearTimeout(syncDebounceTimer); syncDebounceTimer = null;
    cloudReady = false; collRefs = {}; currentUid = null;
    localDirty = false;
    pendingBootstrapUid = null; syncFailed = false;
    clearTimeout(recoveryTimer); recoveryTimer = null; recoveryAttempt = 0;
    serverConfirmed = new Set();
    SYNCED_COLLECTIONS.forEach(name => { lastSyncedMaps[name] = new Map(); });
    syncCursors = {}; listenerState = {};
}

async function doSignOut() {
    if (!firebaseAvailable || !auth) return;
    try { await flushSync(); } catch (e) {}
    resetCloudState();
    // ※ 端末内のデータは残します（ログアウト後もこの端末で使い続けられるように）。
    //   別のアカウントでログインした場合は、そのアカウントのデータに置き換わり、混ざりません。
    auth.signOut();
}

function updateSyncPanelUI(state_) {
    const signedOutBox = document.getElementById('sync-panel-signedout');
    const signedInBox = document.getElementById('sync-panel-signedin');
    const unavailNote = document.getElementById('sync-unavailable-note');
    const statusLbl = document.getElementById('lbl-sync-status');
    const btn = document.getElementById('btn-google-signin');
    if (state_ === 'signedin') {
        signedOutBox.classList.add('hidden-gate');
        signedInBox.classList.remove('hidden-gate');
        if (statusLbl) statusLbl.textContent = 'オン';
    } else if (state_ === 'unavailable') {
        signedOutBox.classList.remove('hidden-gate');
        signedInBox.classList.add('hidden-gate');
        if (unavailNote) unavailNote.classList.remove('hidden-gate');
        if (btn) { btn.disabled = true; btn.style.opacity = '0.4'; }
        if (statusLbl) statusLbl.textContent = '利用不可';
    } else {
        signedOutBox.classList.remove('hidden-gate');
        signedInBox.classList.add('hidden-gate');
        if (statusLbl) statusLbl.textContent = 'オフ';
    }
}

function isStandaloneApp() {
    try {
        return Boolean(window.navigator.standalone) ||
            (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
    } catch (e) { return false; }
}

if (firebaseAvailable) {
    document.getElementById('btn-google-signin').addEventListener('click', async () => {
        const statusEl = document.getElementById('auth-gate-status');
        statusEl.textContent = 'ログイン中…';
        const provider = new firebase.auth.GoogleAuthProvider();
        // [v2.4] ホーム画面に追加したアプリ（standalone）ではポップアップが戻ってこないため、
        //   authDomain をアプリと同じドメインにできている場合はリダイレクト方式を使う
        if (AUTH_ON_SAME_ORIGIN && isStandaloneApp()) {
            statusEl.textContent = 'ログイン画面に移動しています…';
            try { await auth.signInWithRedirect(provider); }
            catch (err) { statusEl.textContent = 'ログインに失敗しました: ' + (err.message || '認証エラー'); }
            return;
        }
        try {
            await auth.signInWithPopup(provider);
        } catch (err) {
            if (err && err.code === 'auth/operation-not-supported-in-this-environment') {
                statusEl.textContent = 'このブラウザ環境ではGoogleログインがブロックされています。新しいタブ等で直接開いてください。';
            } else if (err && (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request')) {
                statusEl.textContent = 'ログイン画面に移動しています…';
                try {
                    await auth.signInWithRedirect(provider);
                } catch (redirectErr) {
                    statusEl.textContent = 'ログイン機能が制限された環境です。';
                }
            } else if (err && err.code !== 'auth/popup-closed-by-user') {
                statusEl.textContent = 'ログインに失敗しました: ' + (err.message || '認証エラー');
            } else {
                statusEl.textContent = '';
            }
        }
    });

    auth.getRedirectResult().catch(err => {
        const statusEl = document.getElementById('auth-gate-status');
        if (statusEl && err && err.code !== 'auth/operation-not-supported-in-this-environment') {
            statusEl.textContent = 'ログインに失敗しました: ' + (err.message || '不明なエラー');
        }
    });

    auth.onAuthStateChanged(async (user) => {
        await storageReady; // [v2.8] 端末内のデータを読み終えてから同期を始める
        if (user) {
            if (currentUid === user.uid && cloudReady) return; // 二重初期化を防ぐ
            const emailLbl = document.getElementById('lbl-account-email');
            if (emailLbl) emailLbl.textContent = user.email || user.displayName || 'ログイン中';
            updateSyncPanelUI('signedin');
            document.getElementById('lbl-sync-detail').textContent = '同期中…';
            // [v2.4] ログイン中は、サーバーの最新状態を確認できるまで定期支出の自動追加を保留する
            //   （確認できた時点で onServerConfirmationProgress から allowFixedProcessing が呼ばれる）
            fixedProcessingAllowed = false;
            await runBootstrap(user.uid);
        } else {
            resetCloudState();
            document.getElementById('auth-gate-status').textContent = '';
            updateSyncPanelUI('signedout');
            allowFixedProcessing();
        }
    });
} else {
    updateSyncPanelUI('unavailable');
    const emailLbl = document.getElementById('lbl-account-email');
    if (emailLbl) emailLbl.textContent = '同期オフ(オフライン)';
}

// アプリを閉じる・裏に回す直前に、未送信の変更を送る
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { flushSync().catch(() => {}); }
    else {
        checkFixedExpensesDateChange();
        // [v2.4] アプリを開き直したとき、止まっている同期があればすぐに再試行する
        if (pendingBootstrapUid || syncFailed) { recoveryAttempt = 0; attemptSyncRecovery(); }
    }
});
window.addEventListener('pagehide', () => { flushSync().catch(() => {}); });
// [v2.4] 電波が戻ったら、止まっている同期をすぐに再試行する
window.addEventListener('online', () => {
    if (pendingBootstrapUid || syncFailed) { recoveryAttempt = 0; attemptSyncRecovery(); }
});
window.addEventListener('offline', () => { if (cloudReady || pendingBootstrapUid) setSyncBadge('offline'); });
