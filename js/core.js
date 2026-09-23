/* 家計簿アプリ v2.9 — js/core.js（1/10）
 * 共通の関数・初期値・アプリの状態（state）・お店の参照
 * index.html で core → storage → ui → input → history → stats → settings → sync → keyboard → main の順に読み込む。
 * 関数や変数はファイルをまたいで共有する（読み込み時にすぐ実行する処理は、それより前のファイルの関数だけを使う）。
 */
const generateId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'uid_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 11);
};

function escapeHTML(str) {
    if (!str && str !== 0) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Firestore のドキュメントIDとして安全に使えるか（"/" を含まない等）
function isValidDocId(id) {
    return typeof id === 'string' && id.length > 0 && id.length <= 200 && !id.includes('/') && id !== '.' && id !== '..' && !/^__.*__$/.test(id);
}

// Dateオブジェクトを "YYYY-MM-DD" 文字列に変換（t.date と同じ形式）
function toDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// [修正] 月送りで日付があふれて月が飛ぶ問題（8/31 → 9/31 = 10/1）を防ぐ。月末日に丸める
function addMonthsClamped(date, months) {
    const y = date.getFullYear(), m = date.getMonth() + months, d = date.getDate();
    const lastDay = new Date(y, m + 1, 0).getDate();
    const r = new Date(y, m, Math.min(d, lastDay));
    r.setHours(0, 0, 0, 0);
    return r;
}

// ==================== 時刻ユーティリティ ====================
function formatExactTime(date = new Date()) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatTimeFromTs(ts) {
    if (!ts) return "12:00";
    const d = new Date(ts);
    return isNaN(d.getTime()) ? "12:00" : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function generateDefaultQuickTimes() {
    const list = [];
    for (let h = 5; h <= 23; h++) {
        const timeStr = `${String(h).padStart(2, '0')}:00`;
        list.push({ id: `qt_${h}`, time: timeStr });
    }
    return list;
}

const DEFAULT_STATE = {
  "transactions": [],
  "timeSlots": [
    { "id": "ts_morn", "name": "朝", "time": "09:00" },
    { "id": "ts_noon", "name": "昼", "time": "12:00" },
    { "id": "ts_night", "name": "夜", "time": "19:00" }
  ],
  "quickTimes": generateDefaultQuickTimes(),
  "shopClasses": [
    { "id": "sc1", "name": "コンビニ", "icon": "🏪" },
    { "id": "sc2", "name": "スーパー", "icon": "🛒" },
    { "id": "bo51k509e", "name": "100均", "icon": "📦" },
    { "id": "sc5", "name": "ドラッグ", "icon": "💊" },
    { "id": "sc6", "name": "交通費", "icon": "🚆" },
    { "id": "ugyl4om13", "name": "ネットストア", "icon": "🏬" },
    { "id": "txn4paqk8", "name": "ファッション", "icon": "🕶️" },
    { "id": "tepva9u9i", "name": "雑貨", "icon": "✏️" },
    { "id": "c473fmfzt", "name": "本", "icon": "📕" },
    { "id": "sc4", "name": "カフェ", "icon": "☕️" },
    { "id": "sc3", "name": "食事", "icon": "🍽️" },
    { "id": "88fs5b3a7", "name": "牛丼", "icon": "🍲" },
    { "id": "mqc5yr49y", "name": "ハンバーガー", "icon": "🍔" },
    { "id": "yi5f0kofc", "name": "ラーメン", "icon": "🍜" },
    { "id": "t09mpgvy6", "name": "カレー", "icon": "🍛" },
    { "id": "m9itdyszu", "name": "パン", "icon": "🍞" },
    { "id": "t06j4ukgf", "name": "ケーキ", "icon": "🍓" },
    { "id": "izkobylo2", "name": "サブスク", "icon": "📺" },
    { "id": "nkf2cjrrn", "name": "通信費", "icon": "📱" }
  ],
  "categories": [
    { "id": "c1", "name": "食費" },
    { "id": "c2", "name": "日用品" },
    { "id": "vn8xngnmn", "name": "衣服費" },
    { "id": "mloyff5ts", "name": "美容費" },
    { "id": "39768x9s9", "name": "娯楽費" },
    { "id": "ldasjl0bv", "name": "医療費" },
    { "id": "c3", "name": "交通費" },
    { "id": "09335b2oc", "name": "通信費" },
    { "id": "yxg69g4mq", "name": "光熱費" },
    { "id": "t4gj08aw3", "name": "住居費" }
  ],
  "paymentMethods": [
    { "id": "uj853b324", "name": "Olive" },
    { "id": "p3", "name": "PayPay" },
    { "id": "p1", "name": "現金" },
    { "id": "grn0xefc2", "name": "ICOCA" },
    { "id": "p2", "name": "PayPayカード" },
    { "id": "vu94so1p1", "name": "ファミペイ" }
  ],
  "shops": [
    { "id": "sh1", "name": "セブンイレブン", "classId": "sc1", "categoryId": "c1", "paymentId": "p3", "memo": "" },
    { "id": "2az6hi3f4", "name": "ローソン", "classId": "sc1", "categoryId": "c1", "paymentId": "uj853b324", "memo": "" },
    { "id": "t3cn1owep", "name": "ファミリーマート", "classId": "sc1", "categoryId": "c1", "paymentId": "vu94so1p1", "memo": "" },
    { "id": "9vddiv43h", "name": "平和堂", "classId": "sc2", "categoryId": "c1", "paymentId": "uj853b324", "memo": "" },
    { "id": "4ewlxigip", "name": "関西スーパー", "classId": "sc2", "categoryId": "c1", "paymentId": "uj853b324", "memo": "" },
    { "id": "cngj642y3", "name": "スターバックス", "classId": "sc4", "categoryId": "c1", "paymentId": "uj853b324", "memo": "" },
    { "id": "kigzdhmtq", "name": "コメダ珈琲", "classId": "sc4", "categoryId": "c1", "paymentId": "uj853b324", "memo": "" },
    { "id": "a6j1vpget", "name": "カフェドクリエ", "classId": "sc4", "categoryId": "c1", "paymentId": "uj853b324", "memo": "" },
    { "id": "vju3kc0e2", "name": "タリーズ", "classId": "sc4", "categoryId": "c1", "paymentId": "uj853b324", "memo": "" },
    { "id": "0xhwzdmpz", "name": "からふね屋珈琲", "classId": "sc4", "categoryId": "c1", "paymentId": "uj853b324", "memo": "" },
    { "id": "og75ymzt0", "name": "スシロー", "classId": "sc3", "categoryId": "c1", "paymentId": "uj853b324", "memo": "" },
    { "id": "9hs13x7l7", "name": "びっくりドンキー", "classId": "sc3", "categoryId": "c1", "paymentId": "uj853b324", "memo": "" },
    { "id": "ca3a18hre", "name": "マクドナルド", "classId": "mqc5yr49y", "categoryId": "c1", "paymentId": "uj853b324", "memo": "" },
    { "id": "q7qynmrjk", "name": "ゼッテリア", "classId": "mqc5yr49y", "categoryId": "c1", "paymentId": "uj853b324", "memo": "" },
    { "id": "81g55z0ga", "name": "バーガーキング", "classId": "mqc5yr49y", "categoryId": "c1", "paymentId": "uj853b324", "memo": "" },
    { "id": "ok6dtyrev", "name": "すき家", "classId": "88fs5b3a7", "categoryId": "c1", "paymentId": "uj853b324", "memo": "" },
    { "id": "4x806xdhu", "name": "松屋", "classId": "88fs5b3a7", "categoryId": "c1", "paymentId": "uj853b324", "memo": "" },
    { "id": "f4ykd4nlc", "name": "吉野家", "classId": "88fs5b3a7", "categoryId": "c1", "paymentId": "uj853b324", "memo": "" },
    { "id": "miw6a3pxq", "name": "スギ薬局", "classId": "sc5", "categoryId": "ldasjl0bv", "paymentId": "uj853b324", "memo": "" },
    { "id": "43fz3nly0", "name": "マツモトキヨシ", "classId": "sc5", "categoryId": "ldasjl0bv", "paymentId": "uj853b324", "memo": "" },
    { "id": "cxa4836zc", "name": "ダイコクドラッグ", "classId": "sc5", "categoryId": "ldasjl0bv", "paymentId": "uj853b324", "memo": "" },
    { "id": "4px2whxm8", "name": "サンドラッグ", "classId": "sc5", "categoryId": "ldasjl0bv", "paymentId": "uj853b324", "memo": "" },
    { "id": "xj45zx3s1", "name": "JR西日本", "classId": "sc6", "categoryId": "c3", "paymentId": "grn0xefc2", "memo": "" },
    { "id": "m1kmm5nm9", "name": "京都市バス", "classId": "sc6", "categoryId": "c3", "paymentId": "grn0xefc2", "memo": "" },
    { "id": "cnm93inec", "name": "天下一品", "classId": "yi5f0kofc", "categoryId": "c1", "paymentId": "uj853b324", "memo": "" },
    { "id": "4b39rok8k", "name": "Amazon", "classId": "ugyl4om13", "categoryId": "c2", "paymentId": "uj853b324", "memo": "" },
    { "id": "mcvj8dv0f", "name": "ヨドバシ", "classId": "ugyl4om13", "categoryId": "c2", "paymentId": "uj853b324", "memo": "" },
    { "id": "wkw7jmg5a", "name": "メルカリ", "classId": "ugyl4om13", "categoryId": "c2", "paymentId": "uj853b324", "memo": "" },
    { "id": "eu7uexvr0", "name": "ソフトバンク", "classId": "nkf2cjrrn", "categoryId": "09335b2oc", "paymentId": "p2", "memo": "" },
    { "id": "yogl479ms", "name": "Netflix", "classId": "izkobylo2", "categoryId": "39768x9s9", "paymentId": "uj853b324", "memo": "" },
    { "id": "t9m3wtmn3", "name": "Apple", "classId": "izkobylo2", "categoryId": "39768x9s9", "paymentId": "uj853b324", "memo": "" },
    { "id": "07xgregsy", "name": "ドンク", "classId": "m9itdyszu", "categoryId": "c1", "paymentId": "uj853b324", "memo": "" },
    { "id": "0hfclpl29", "name": "ダイソー", "classId": "bo51k509e", "categoryId": "c2", "paymentId": "uj853b324", "memo": "" },
    { "id": "3wo5h00ht", "name": "セリア", "classId": "bo51k509e", "categoryId": "c2", "paymentId": "uj853b324", "memo": "" },
    { "id": "6npgtm4w9", "name": "CanDo", "classId": "bo51k509e", "categoryId": "c2", "paymentId": "uj853b324", "memo": "" },
    { "id": "bog5zwdpb", "name": "Standard Products", "classId": "bo51k509e", "categoryId": "c2", "paymentId": "uj853b324", "memo": "" },
    { "id": "1u0w14chh", "name": "無印良品", "classId": "tepva9u9i", "categoryId": "c2", "paymentId": "uj853b324", "memo": "" },
    { "id": "uocu6mw1p", "name": "ユニクロ", "classId": "txn4paqk8", "categoryId": "vn8xngnmn", "paymentId": "uj853b324", "memo": "" },
    { "id": "wx1zxga0y", "name": "ニトリ", "classId": "tepva9u9i", "categoryId": "c2", "paymentId": "uj853b324", "memo": "" },
    { "id": "7f4wwdz3x", "name": "BookOff", "classId": "c473fmfzt", "categoryId": "c2", "paymentId": "uj853b324", "memo": "" }
  ],
  "shortcuts": [],
  "fixedExpenses": [],
  "lastRunDate": "",
  "autoUpdateShopPayment": false
};

let state = JSON.parse(JSON.stringify(DEFAULT_STATE));
let currentAmount = "0";
let activeClassId = null;
let editingTxnId = null;
let currentDetailIsFixed = false;
let currentFixedEditorIsFixed = true;
let currentShortcutIsFixed = false;

// [v2.8] 「変動費／固定費」の切り替えボタンの見た目（入力・クイック入力・定期支出の3か所で共通）
function renderFixedToggle(varBtnId, fixBtnId, isFixed) {
    const base = 'px-4 py-1.5 rounded-full text-[13px] font-bold transition-colors ';
    document.getElementById(varBtnId).className = base + (!isFixed ? 'bg-[#007AFF] text-white' : 'bg-gray-100 text-gray-400');
    document.getElementById(fixBtnId).className = base + (isFixed ? 'bg-[#007AFF] text-white' : 'bg-gray-100 text-gray-400');
}
function setShortcutIsFixed(val) {
    currentShortcutIsFixed = val;
    renderFixedToggle('btn-sh-variable', 'btn-sh-fixed', val);
}
window.setShortcutIsFixed = setShortcutIsFixed;
let editingShopId = null;
let editingShortcutId = null;
let editingFixedId = null;
let editingTimeSlotId = null;
let editingQuickTimeId = null;

let calTab = 'daily';
let calCurrentDate = new Date(); calCurrentDate.setHours(0,0,0,0);

let calSearchQuery = '';
let calSelectedCatId = null;
let calSelectedPayId = null;
let calSelectedFixedType = null; // null(すべて) | 'variable' | 'fixed'
let calSortType = 'date_desc';
let currentSheetType = null;

let statsTab = 'trend';
let trendChartMode = 'week';
let statsCurrentDate = new Date(); statsCurrentDate.setHours(0,0,0,0);
let statsSelectedShopKey = '';
let statsFixedFilter = 'all'; // 'all' | 'variable'

function isFixedTxn(t) { return Boolean(t.isFixed || String(t.id).startsWith('fx_')); }

function getStatsTxns() {
    return statsFixedFilter === 'variable' ? state.transactions.filter(t => !isFixedTxn(t)) : state.transactions;
}

function setStatsFixedFilter(mode) {
    statsFixedFilter = mode;
    updateStatsFixedFilterUI();
    renderStats();
}

function updateStatsFixedFilterUI() {
    const btnAll = document.getElementById('btn-filter-all');
    const btnVar = document.getElementById('btn-filter-variable');
    if (!btnAll || !btnVar) return;
    const activeCls = 'px-3 py-1 text-[11px] font-semibold rounded-[5px] transition-colors bg-white text-black shadow';
    const inactiveCls = 'px-3 py-1 text-[11px] font-semibold rounded-[5px] transition-colors text-gray-500';
    btnAll.className = statsFixedFilter === 'all' ? activeCls : inactiveCls;
    btnVar.className = statsFixedFilter === 'variable' ? activeCls : inactiveCls;
}

let promptCallback = null;
let confirmCallback = null;
let datePromptCallback = null;
let shopSortables = [];
let isFlowFromInput = false;
let settingsTab = 'general';

/* ==================== 設定画面（タブ切り替え） ==================== */
function setSettingsTab(tab, idx) {
    settingsTab = tab;
    document.getElementById('settings-seg-indicator').style.transform = `translateX(${idx * 100}%)`;
    document.querySelectorAll('.settings-seg-btn').forEach((b, i) => {
        b.classList.toggle('text-gray-500', i !== idx);
        b.classList.toggle('text-black', i === idx);
    });
    document.getElementById('settings-tab-general').classList.toggle('hidden', tab !== 'general');
    document.getElementById('settings-tab-shop').classList.toggle('hidden', tab !== 'shop');
    document.getElementById('settings-tab-data').classList.toggle('hidden', tab !== 'data');
    if (tab === 'shop') updateAutoUpdateShopPaymentUI();
}

function updateAutoUpdateShopPaymentUI() {
    const toggle = document.getElementById('toggle-auto-update-shop-payment');
    if (toggle) toggle.checked = Boolean(state.autoUpdateShopPayment);
}

function setAutoUpdateShopPayment(checked) {
    state.autoUpdateShopPayment = checked;
    saveData();
}

// そのお店を実際に利用した際の支払い方法が、登録済みの既定の支払い方法と異なる場合、
// 「最後に使った支払い方法を既定にする」がオンなら、お店の詳細設定を自動的に書き換える
/* ==================== お店の参照（v2.3: shopId 方式） ====================
 * 記録・定期支出・クイック入力は shopId（お店のID）でお店を参照する。
 * 表示用・互換用に shopName（お店の名前）も引き続き保存する。
 */
function findShopById(id) { return id ? (state.shops.find(s => s.id === id) || null) : null; }
// 名前（＋分類）からお店IDを探す。同名のお店が複数あって分類でも絞れない場合は '' を返す
//   strict: [v2.7] 分類が分かっている記録は、同じ分類のお店にだけ紐付ける
//   （記録のお店が削除済みで、別の分類に同じ名前のお店が1件だけある場合に、誤って紐付けないため）
function resolveShopIdByName(name, classId, strict = false) {
    if (!name) return '';
    let shop = state.shops.find(x => x.name === name && x.classId === classId);
    if (!shop && !(strict && classId)) { const cands = state.shops.filter(x => x.name === name); if (cands.length === 1) shop = cands[0]; }
    return shop ? shop.id : '';
}
// 画面に出すお店の名前（お店が残っていれば最新の名前、削除済みなら記録時の名前）
function shopDisplayName(obj) {
    if (!obj) return '';
    const shop = findShopById(obj.shopId);
    return shop ? shop.name : (obj.shopName || '');
}
// 分析で同じお店をまとめるためのキー
function shopKeyOf(obj) {
    if (!obj) return '';
    if (obj.shopId) return 'id:' + obj.shopId;
    return obj.shopName ? 'name:' + obj.shopName : '';
}
function shopKeyInfo(key) {
    if (!key) return { name: '', icon: '🏪', className: '未分類', shop: null };
    let shop = null, name = '';
    if (key.startsWith('id:')) {
        shop = findShopById(key.slice(3));
        if (shop) name = shop.name;
        else { const t = state.transactions.find(x => x.shopId === key.slice(3) && x.shopName); name = t ? t.shopName : '(削除されたお店)'; }
    } else {
        name = key.slice(5);
    }
    const cls = shop ? state.shopClasses.find(c => c.id === shop.classId) : null;
    return { name, icon: (cls && cls.icon) || '🏪', className: cls ? cls.name : '未分類', shop };
}
// 既存データへの shopId 自動付与（起動時・同期の読み込み後に実行。何度実行しても結果は同じ）
function backfillShopIds() {
    let changed = 0;
    ['transactions', 'fixedExpenses', 'shortcuts'].forEach(key => {
        (state[key] || []).forEach(x => {
            if (!x || !x.shopName) return;
            if (x.shopId) {
                const shop = findShopById(x.shopId);
                if (shop && shop.name !== x.shopName) { x.shopName = shop.name; changed++; }
                return; // お店が削除済みの場合は、記録時の名前とIDをそのまま残す
            }
            const id = resolveShopIdByName(x.shopName, x.classId, true);
            if (id) { x.shopId = id; changed++; }
        });
    });
    if (changed > 0) saveData();
    return changed;
}

function maybeAutoUpdateShopPayment(shopId, paymentId) {
    if (!state.autoUpdateShopPayment) return;
    if (!shopId || !paymentId) return;
    const shop = findShopById(shopId);
    if (!shop || shop.paymentId === paymentId) return;
    shop.paymentId = paymentId;
}

function updateUnsetBadge() {
    const unsetCount = state.transactions.filter(t => (!t.classId && !t.categoryId) || t.isPending || t.amount === 0).length;
    const badge = document.getElementById('nav-badge-calendar');
    if (!badge) return;
    if (unsetCount > 0) {
        badge.textContent = unsetCount > 99 ? '99+' : unsetCount;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}
