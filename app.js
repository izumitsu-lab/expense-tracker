        /* =====================================================================
         * 家計簿アプリ app.js  —  v2.5（v2.4 ＋ 起動時の読み取り量の削減 / 2026-09-23）
         * 修正内容の一覧は同梱の「修正内容.md」を参照。
         * 同期サーバー（Firestore）のデータ構造・コレクション名は旧版から変更なし。
         * ===================================================================== */
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

        function setShortcutIsFixed(val) {
            currentShortcutIsFixed = val;
            const btnVar = document.getElementById('btn-sh-variable');
            const btnFix = document.getElementById('btn-sh-fixed');
            btnVar.className = `px-4 py-1.5 rounded-full text-[13px] font-bold transition-colors ${!val ? 'bg-[#007AFF] text-white' : 'bg-gray-100 text-gray-400'}`;
            btnFix.className = `px-4 py-1.5 rounded-full text-[13px] font-bold transition-colors ${val ? 'bg-[#007AFF] text-white' : 'bg-gray-100 text-gray-400'}`;
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
        function resolveShopIdByName(name, classId) {
            if (!name) return '';
            let shop = state.shops.find(x => x.name === name && x.classId === classId);
            if (!shop) { const cands = state.shops.filter(x => x.name === name); if (cands.length === 1) shop = cands[0]; }
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
                    const id = resolveShopIdByName(x.shopName, x.classId);
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

        function initData() {
            try {
                let stored = localStorage.getItem('premium_tracker_v18');
                if (!stored) stored = localStorage.getItem('premium_tracker_v17');
                if (!stored) stored = localStorage.getItem('premium_tracker_v16');
                if (!stored) stored = localStorage.getItem('premium_tracker_v15');
                
                if (stored) {
                    const parsed = JSON.parse(stored);
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
            } catch (e) {
                console.error("Local load failed", e);
                showAlert("端末内データの読み込みでエラーが発生しました。");
            }
            if (!state.timeSlots || state.timeSlots.length === 0) {
                state.timeSlots = JSON.parse(JSON.stringify(DEFAULT_STATE.timeSlots));
            }
            if (!state.quickTimes || state.quickTimes.length === 0) {
                state.quickTimes = JSON.parse(JSON.stringify(DEFAULT_STATE.quickTimes));
            }
            updateUnsetBadge();
        }

        function saveData() { 
            try {
                localStorage.setItem('premium_tracker_v18', JSON.stringify(state)); 
            } catch (e) {
                console.error("Local storage error:", e);
                if (e.name === 'QuotaExceededError' || e.code === 22) {
                    showAlert("端末の保存容量（LocalStorage）がいっぱいです！設定からJSONバックアップを取り、古い履歴を整理してください。");
                } else {
                    showAlert("データの保存に失敗しました: " + (e.message || "ストレージ例外"));
                }
            }
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
                                shopId: fe.shopId || resolveShopIdByName(fe.shopName, fe.classId),
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

        function showPrompt(title, defaultVal, cb) { document.getElementById('prompt-title').textContent = title; const inp = document.getElementById('prompt-input'); inp.value = defaultVal || ''; document.getElementById('custom-prompt').classList.add('active'); setTimeout(() => inp.focus(), 50); promptCallback = cb; }
        function closeCustomPrompt(isOk) { document.getElementById('custom-prompt').classList.remove('active'); if (isOk && promptCallback) promptCallback(document.getElementById('prompt-input').value.trim()); }
        function showConfirm(msg, cb) { document.getElementById('confirm-msg').textContent = msg; document.getElementById('custom-confirm').classList.add('active'); confirmCallback = cb; }
        function closeCustomConfirm(isOk) { document.getElementById('custom-confirm').classList.remove('active'); if (isOk && confirmCallback) confirmCallback(); }
        function showAlert(msg) { document.getElementById('alert-msg').textContent = msg; document.getElementById('custom-alert').classList.add('active'); }
        
        function showDatePrompt(defaultDate, cb) { document.getElementById('date-prompt-input').value = defaultDate; document.getElementById('custom-date-prompt').classList.add('active'); datePromptCallback = cb; }
        function closeDatePrompt(isOk) { document.getElementById('custom-date-prompt').classList.remove('active'); if (isOk && datePromptCallback) datePromptCallback(document.getElementById('date-prompt-input').value); }

        function closeAllModals() {
            document.querySelectorAll('.modal-sheet').forEach(m => m.classList.remove('active'));
            closeFilterSheet();
            closeTimePickerSheet();
            closeStatsShopPickerSheet();
        }
        function closeModal(id) { document.getElementById(id).classList.remove('active'); }
        function openPanel(id) { document.getElementById(id).classList.add('active'); renderPanelLists(); }
        function closePanel(id) { document.getElementById(id).classList.remove('active'); }

        function updateNavColors(target, subTarget) {
            document.querySelectorAll('.nav-link').forEach(btn => {
                const t = btn.getAttribute('data-target'); const sub = btn.getAttribute('data-sub'); let isActive = false;
                if (target === 'main') { if (subTarget === 'shortcuts' && sub === 'shortcuts') isActive = true; } else { if (t === target) isActive = true; }
                const svg = btn.querySelector('svg'); const span = btn.querySelector('span');
                if(svg && span) {
                    svg.classList.toggle('text-[#007AFF]', isActive); span.classList.toggle('text-[#007AFF]', isActive);
                    svg.classList.toggle('text-gray-400', !isActive); span.classList.toggle('text-gray-400', !isActive);
                }
            });
        }

        function resetMainView() { currentAmount = "0"; updateAmount(); currentTranslate = 0; document.getElementById('swipe-container').style.transform = `translateX(0%)`; }

        function jumpToToday() {
            calCurrentDate = new Date();
            calCurrentDate.setHours(0, 0, 0, 0);
            renderCalendar();
            const calContent = document.getElementById('cal-content');
            if (calContent) calContent.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function switchView(target, subTarget) {
            const isAlreadyInCalendar = (target === 'calendar' && document.getElementById('view-calendar').classList.contains('active'));
            if (isAlreadyInCalendar) {
                jumpToToday();
                return;
            }

            closeAllModals(); 
            document.querySelectorAll('.slide-panel, .overlay').forEach(el => el.classList.remove('active')); 
            document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
            
            document.getElementById(`view-${target}`).classList.add('active'); 
            updateNavColors(target, subTarget);

            if (target === 'calendar') { 
                updateFilterButtonsUI(); 
                renderCalendar(); 
            }
            if (target === 'main') renderShortcuts();
            if (target === 'stats') renderStats();
            if (target === 'fixed') renderFixedExpenses();
            if (target === 'settings') updateAutoUpdateShopPaymentUI();
        }

        document.getElementById('btn-global-add').addEventListener('click', () => { resetMainView(); switchView('main', 'input'); });

        document.querySelectorAll('.nav-link').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget.getAttribute('data-target'); const sub = e.currentTarget.getAttribute('data-sub');
                if (target === 'main' && sub === 'shortcuts') { currentTranslate = -50; document.getElementById('swipe-container').style.transform = `translateX(-50%)`; }
                switchView(target, sub);
            });
        });

        const swipeContainer = document.getElementById('swipe-container');
        let startX = 0, startY = 0; let currentTranslate = 0; let isDragging = false; let isSwiping = false; let swipeDirection = null; let dragOffset = 0; let preventClick = false; 

        document.addEventListener('click', (e) => { if (preventClick) { e.stopPropagation(); e.preventDefault(); } }, true);

        function dragStart(e) {
            if (e.target.closest('input') || e.target.closest('select') || e.target.closest('button')) return;
            startX = e.clientX || (e.touches && e.touches[0].clientX); startY = e.clientY || (e.touches && e.touches[0].clientY);
            isDragging = true; isSwiping = false; swipeDirection = null; swipeContainer.style.transition = 'none';
        }

        function dragMove(e) {
            if (!isDragging) return;
            const clientX = e.clientX || (e.touches && e.touches[0].clientX); const clientY = e.clientY || (e.touches && e.touches[0].clientY);
            const diffX = clientX - startX; const diffY = clientY - startY;
            if (!isSwiping) { if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) { isSwiping = true; swipeDirection = Math.abs(diffX) > Math.abs(diffY) ? 'h' : 'v'; } else { return; } }
            if (swipeDirection === 'v') { isDragging = false; swipeContainer.style.transition = 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)'; swipeContainer.style.transform = `translateX(${currentTranslate}%)`; return; }
            if (e.cancelable) e.preventDefault(); 
            dragOffset = (diffX / swipeContainer.offsetWidth) * 100; let target = currentTranslate + dragOffset; if (target > 0) target = 0; if (target < -50) target = -50;
            swipeContainer.style.transform = `translateX(${target}%)`;
        }

        function dragEnd(e) {
            if (!isDragging) return; isDragging = false;
            swipeContainer.style.transition = 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)';
            if (Math.abs(dragOffset) > 2) { preventClick = true; setTimeout(() => { preventClick = false; }, 50); }
            if (currentTranslate === 0 && dragOffset < -5) { currentTranslate = -50; } else if (currentTranslate === -50 && dragOffset > 5) { currentTranslate = 0; }
            swipeContainer.style.transform = `translateX(${currentTranslate}%)`; dragOffset = 0;
            updateNavColors('main', currentTranslate === -50 ? 'shortcuts' : 'input');
        }

        swipeContainer.addEventListener('pointerdown', dragStart); window.addEventListener('pointermove', dragMove, {passive: false});
        window.addEventListener('pointerup', dragEnd); window.addEventListener('pointercancel', dragEnd);

        let wheelAccumulator = 0; let wheelTimer = null;
        swipeContainer.addEventListener('wheel', (e) => {
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                if (e.cancelable) e.preventDefault(); wheelAccumulator += e.deltaX; clearTimeout(wheelTimer);
                wheelTimer = setTimeout(() => {
                    if (currentTranslate === 0 && wheelAccumulator > 30) { currentTranslate = -50; } else if (currentTranslate === -50 && wheelAccumulator < -30) { currentTranslate = 0; }
                    swipeContainer.style.transition = 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)'; swipeContainer.style.transform = `translateX(${currentTranslate}%)`; wheelAccumulator = 0;
                    updateNavColors('main', currentTranslate === -50 ? 'shortcuts' : 'input');
                }, 40);
            }
        }, {passive: false});

        function attachSwipeForView(elId, onLeft, onRight) {
            const el = document.getElementById(elId); let sX = 0, sY = 0;
            el.addEventListener('touchstart', e => { sX = e.touches[0].clientX; sY = e.touches[0].clientY; }, {passive: true});
            el.addEventListener('touchend', e => { const diffX = e.changedTouches[0].clientX - sX; const diffY = e.changedTouches[0].clientY - sY; if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) { if (diffX > 0) onRight(); else onLeft(); } }, {passive: true});
        }

        async function shareFile(content, filename, mimeType) {
            const blob = new Blob([content], { type: mimeType });
            const file = new File([blob], filename, { type: mimeType });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try { await navigator.share({ files: [file] }); return; } catch (err) { console.log("Share API cancelled or failed:", err); }
            }
            const url = URL.createObjectURL(blob); const dl = document.createElement('a'); dl.href = url; dl.download = filename; document.body.appendChild(dl); dl.click(); document.body.removeChild(dl); URL.revokeObjectURL(url);
        }

        window.exportCSV = async () => {
            let csvContent = "\uFEFF"; csvContent += "日付,時間,分類,カテゴリー,お店,支払い方法,金額,メモ,費目タイプ\n";
            // [修正] Excel で開いたときに =, +, -, @ で始まる文字が数式として実行されないようにする
            const safeText = v => { const str = (v || '').toString(); return /^[=+\-@\t\r]/.test(str) ? "'" + str : str; };
            const sortedTxns = [...state.transactions].sort((a, b) => a.date !== b.date ? (a.date > b.date ? -1 : 1) : (b.ts || 0) - (a.ts || 0));
            sortedTxns.forEach(t => {
                const cls = state.shopClasses.find(c => c.id === t.classId) || {name: ''}; const cat = state.categories.find(c => c.id === t.categoryId) || {name: ''}; const pay = state.paymentMethods.find(p => p.id === t.paymentId) || {name: ''};
                // [修正] 時間未設定の記録を「00:00」と出力しない
                const timeStr = t.timeUnset ? '' : (t.time || formatTimeFromTs(t.ts));
                const amtStr = t.isPending || t.amount === 0 ? "未定" : t.amount;
                const typeStr = isFixedTxn(t) ? '固定費' : '変動費';
                const row = [t.date, timeStr, safeText(cls.name), safeText(cat.name), safeText(shopDisplayName(t)), safeText(pay.name), amtStr, safeText(t.memo), typeStr].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(','); csvContent += row + "\n";
            });
            await shareFile(csvContent, `家計簿データ_${toDateStr(new Date())}.csv`, "text/csv;charset=utf-8;");
        };

        window.exportData = async () => {
            const exportPayload = {
                version: "2.5",
                exportedAt: new Date().toISOString(),
                ...state
            };
            const dataStr = JSON.stringify(exportPayload, null, 2); 
            await shareFile(dataStr, `expense_tracker_backup_${toDateStr(new Date())}.json`, "application/json;charset=utf-8;");
        };

        window.importData = (event) => { 
            const file = event.target.files[0]; 
            if (!file) return; 
            showConfirm("現在のデータはすべて上書きされます。復元しますか？", () => { 
                const reader = new FileReader(); 
                reader.onload = function(e) { 
                    try { 
                        const imported = JSON.parse(e.target.result); 
                        
                        if (!imported || typeof imported !== 'object') {
                            throw new Error("データが正しいJSONオブジェクトではありません。");
                        }
                        const requiredArrays = ['transactions', 'shopClasses', 'categories', 'paymentMethods', 'shops'];
                        for (const key of requiredArrays) {
                            if (!Array.isArray(imported[key])) {
                                throw new Error(`必須項目 "${key}" の配列データが存在しません。破損ファイルの可能性があります。`);
                            }
                        }
                        
                        const invalidTxn = imported.transactions.some(t => !t || !t.id || typeof t.amount !== 'number' || isNaN(t.amount) || typeof t.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.date));
                        if (invalidTxn) {
                            throw new Error("取引データの中にID・金額・日付の形式が正しくないものが含まれています。");
                        }
                        // [修正] すべての配列の項目について ID を検証する（同期先の Firestore で使えないIDや、不正な値を防ぐ）
                        const allArrays = ['transactions', 'timeSlots', 'quickTimes', 'shopClasses', 'categories', 'paymentMethods', 'shops', 'shortcuts', 'fixedExpenses'];
                        for (const key of allArrays) {
                            if (imported[key] === undefined) continue;
                            if (!Array.isArray(imported[key])) throw new Error(`"${key}" が配列ではありません。`);
                            const seen = new Set();
                            for (const item of imported[key]) {
                                if (!item || typeof item !== 'object' || !isValidDocId(item.id)) {
                                    throw new Error(`"${key}" に不正なIDの項目が含まれています。`);
                                }
                                if (seen.has(item.id)) throw new Error(`"${key}" に重複したIDが含まれています。`);
                                seen.add(item.id);
                            }
                        }
                        const badTime = [].concat(imported.timeSlots || [], imported.quickTimes || []).some(x => typeof x.time !== 'string' || !/^\d{1,2}:\d{2}$/.test(x.time));
                        if (badTime) throw new Error("時間帯・クイック時刻の時刻形式が正しくありません。");
                        const badFixed = (imported.fixedExpenses || []).some(f => typeof f.amount !== 'number' || isNaN(f.amount));
                        if (badFixed) throw new Error("定期支出の金額の形式が正しくありません。");
                        // [v2.4] 記録の時刻は「空」または「H:MM / HH:MM」だけを許可する（画面に表示される欄のため）
                        const badTxnTime = imported.transactions.some(t => t.time !== undefined && t.time !== null && t.time !== '' && (typeof t.time !== 'string' || !/^\d{1,2}:\d{2}$/.test(t.time)));
                        if (badTxnTime) throw new Error("取引データの中に時刻の形式が正しくないものが含まれています。");
                        const badTxnTs = imported.transactions.some(t => t.ts !== undefined && t.ts !== null && (typeof t.ts !== 'number' || !Number.isFinite(t.ts)));
                        if (badTxnTs) throw new Error("取引データの中に登録日時の形式が正しくないものが含まれています。");
                        // [v2.4] クイック入力の金額は「数値」または「未指定（null）」だけを許可する
                        const badShortcutAmt = (imported.shortcuts || []).some(sc => sc.amount !== undefined && sc.amount !== null && (typeof sc.amount !== 'number' || !Number.isFinite(sc.amount) || sc.amount < 0));
                        if (badShortcutAmt) throw new Error("クイック入力の金額の形式が正しくありません。");

                        state.transactions = imported.transactions;
                        state.timeSlots = Array.isArray(imported.timeSlots) && imported.timeSlots.length > 0 ? imported.timeSlots : DEFAULT_STATE.timeSlots;
                        state.quickTimes = Array.isArray(imported.quickTimes) && imported.quickTimes.length > 0 ? imported.quickTimes : DEFAULT_STATE.quickTimes;
                        state.shopClasses = imported.shopClasses;
                        state.categories = imported.categories;
                        state.paymentMethods = imported.paymentMethods;
                        state.shops = imported.shops;
                        state.shortcuts = Array.isArray(imported.shortcuts) ? imported.shortcuts : [];
                        state.fixedExpenses = Array.isArray(imported.fixedExpenses) ? imported.fixedExpenses : [];
                        state.lastRunDate = imported.lastRunDate || "";
                        state.autoUpdateShopPayment = Boolean(imported.autoUpdateShopPayment);

                        saveData(); 
                        showAlert("データの復元が完了しました。"); 
                        // [修正] ログイン中は、クラウドへの送信が終わってから再読み込みする
                        Promise.resolve(typeof flushSync === 'function' ? flushSync() : null)
                            .catch(err => console.error(err))
                            .finally(() => setTimeout(() => location.reload(), 1200));
                    } catch(err) { 
                        showAlert("復元エラー: " + err.message); 
                    } 
                }; 
                reader.readAsText(file); 
            }); 
            event.target.value = ''; 
        };

        function updateAmount() { 
            document.getElementById('display-amount').textContent = Number(currentAmount).toLocaleString('ja-JP'); 
            const isZero = (currentAmount === "0");
            document.getElementById('btn-next').disabled = isZero; 
            const quickBtn = document.getElementById('btn-quick-save');
            if (quickBtn) quickBtn.disabled = isZero;
        }

        function quickSaveAmountOnly() {
            if (currentAmount === "0") {
                showAlert("金額を入力してください");
                return;
            }
            const amt = parseInt(currentAmount);
            if (isNaN(amt) || amt <= 0) {
                showAlert("正しい金額を入力してください");
                return;
            }
            
            const now = new Date();
            const todayDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
            const nowTime = formatExactTime(now);
            
            state.transactions.push({ 
                id: generateId(), 
                amount: amt, 
                date: todayDate, 
                time: nowTime,
                classId: "", 
                categoryId: "", 
                shopName: "", 
                paymentId: "", 
                memo: "あとで詳細を設定", 
                ts: now.getTime() 
            });
            
            saveData(); 
            resetMainView(); 
            // [修正] 保存した今日の記録が必ず見えるように、履歴を今日の日付に合わせる
            calCurrentDate = new Date(); calCurrentDate.setHours(0, 0, 0, 0);
            if (document.getElementById('view-calendar').classList.contains('active')) renderCalendar();
            else switchView('calendar'); 
        }

        function handleNumInput(val) { if (val === 'C') currentAmount = "0"; else if (val === 'BACK') { currentAmount = currentAmount.slice(0, -1); if (currentAmount === "") currentAmount = "0"; } else { if (currentAmount === "0") currentAmount = val; else if (currentAmount.length < 8) currentAmount += val; } updateAmount(); }
        document.querySelectorAll('.numpad-btn').forEach(btn => { btn.addEventListener('click', (e) => { if(preventClick) return; handleNumInput(e.currentTarget.getAttribute('data-val')); if (navigator.vibrate) navigator.vibrate(5); }); });

        window.updateShopSelect = (classSelectId, shopSelectId, selectedShopName = null) => {
            const classId = document.getElementById(classSelectId).value; const shopSel = document.getElementById(shopSelectId); shopSel.innerHTML = '';
            
            const relevantShops = state.shops.filter(s => s.classId === classId);
            if (relevantShops.length === 0) {
                const optNone = document.createElement('option'); optNone.value = ''; optNone.textContent = '(登録されているお店がありません)'; shopSel.appendChild(optNone);
            } else {
                const optNone = document.createElement('option'); optNone.value = ''; optNone.textContent = '(お店を指定しない)'; shopSel.appendChild(optNone);
                relevantShops.forEach(s => { const opt = document.createElement('option'); opt.value = s.name; opt.textContent = s.name; shopSel.appendChild(opt); });
            }

            if (selectedShopName) {
                if (!relevantShops.find(s => s.name === selectedShopName)) {
                    const opt = document.createElement('option'); opt.value = selectedShopName; opt.textContent = selectedShopName; shopSel.appendChild(opt);
                }
                shopSel.value = selectedShopName;
            } else {
                shopSel.value = '';
            }
        };

        window.promptAddNewShop = (classSelectId, shopSelectId, catSelectId, paySelectId) => {
            showPrompt('新しいお店の名前', '', (val) => {
                if(val) {
                    const classId = document.getElementById(classSelectId).value; const catId = document.getElementById(catSelectId).value; const payId = document.getElementById(paySelectId).value;
                    if (!state.shops.find(s => s.name === val && s.classId === classId)) { state.shops.push({id: generateId(), name: val, classId, categoryId: catId, paymentId: payId, memo: ''}); saveData(); }
                    updateShopSelect(classSelectId, shopSelectId, val); 
                }
            });
        };

        window.handleShopSelectChange = (shopSelectId, classSelectId, catSelectId, paySelectId) => {
            const shopName = document.getElementById(shopSelectId).value;
            if (!shopName) return;
            const classId = document.getElementById(classSelectId).value;
            const shop = state.shops.find(s => s.name === shopName && s.classId === classId);
            if (shop) {
                if (shop.categoryId) document.getElementById(catSelectId).value = shop.categoryId;
                if (shop.paymentId) document.getElementById(paySelectId).value = shop.paymentId;
            }
        };

        function populateSelect(selectId, items, selectedId) { const sel = document.getElementById(selectId); sel.innerHTML = ''; items.forEach(i => { const opt = document.createElement('option'); opt.value = i.id; opt.textContent = i.name; if (i.id === selectedId) opt.selected = true; sel.appendChild(opt); }); }

        function renderShortcuts() {
            const list = document.getElementById('grid-shortcuts'); list.innerHTML = '';
            if (state.shortcuts.length === 0) { list.innerHTML = `<div class="col-span-2 text-center text-gray-400 text-[14px] py-10 mt-10">設定からクイック入力を<br>追加してください</div>`; return; }
            state.shortcuts.forEach(sc => {
                const btn = document.createElement('div'); btn.className = "shortcut-card"; btn.onclick = () => useShortcut(sc);
                // [v2.4] 金額は数値に変換してから表示する（文字列がそのまま HTML に入らないように）
                const scAmt = shortcutAmountOf(sc);
                const displayAmt = scAmt ? `¥${scAmt.toLocaleString()}` : `<span class="text-[13px] text-gray-400 font-medium">金額未指定</span>`;
                const shopLabel = escapeHTML(sc.shopName || 'お店未指定');
                btn.innerHTML = `<span class="text-gray-900 font-bold truncate w-full text-[16px] tracking-tight text-left">${escapeHTML(sc.name)}</span><span class="text-gray-400 text-[11px] font-medium truncate w-full mb-2">${shopLabel}</span><span class="text-[#007AFF] font-extrabold text-[22px] tracking-tight flex items-center leading-none">${displayAmt}</span>`; 
                list.appendChild(btn);
            });
        }
        // クイック入力の金額を「正の整数 または null」として取り出す
        function shortcutAmountOf(sc) {
            const n = Number(sc && sc.amount);
            return (Number.isFinite(n) && n > 0) ? Math.floor(n) : null;
        }
        function useShortcut(sc) { 
            const scAmt = shortcutAmountOf(sc);
            if (scAmt) {
                currentAmount = String(scAmt); 
                updateAmount(); 
            }
            openDetailModal(null, null, sc); 
        }

        function proceedToClassSelect() { 
            if (currentAmount === "0") {
                showAlert("金額を入力してください");
                return;
            }
            const grid = document.getElementById('grid-classes'); grid.innerHTML = ''; 
            state.shopClasses.forEach(cls => { 
                const btn = document.createElement('div'); 
                btn.className = 'class-btn'; 
                btn.innerHTML = `<span class="class-btn-icon">${escapeHTML(cls.icon)}</span><span class="class-btn-text">${escapeHTML(cls.name)}</span>`; 
                btn.onclick = () => openShopSelect(cls.id); 
                grid.appendChild(btn); 
            }); 
            document.getElementById('modal-class-select').classList.add('active'); 
        }
        
        function openShopSelect(classId) {
            activeClassId = classId; const cls = state.shopClasses.find(c => c.id === classId); document.getElementById('title-shop-cat').textContent = cls ? cls.name : 'お店を選択'; const list = document.getElementById('list-shops-select'); list.innerHTML = ''; 
            const noShopDiv = document.createElement('div'); noShopDiv.className = 'ios-item clickable cursor-pointer bg-gray-50'; noShopDiv.innerHTML = `<span class="font-medium text-gray-500">お店を指定しない</span>`; noShopDiv.onclick = () => openDetailModal(null); list.appendChild(noShopDiv); 
            const relevantShops = state.shops.filter(s => s.classId === classId);
            if (relevantShops.length > 0) { 
                relevantShops.forEach(shop => { 
                    const div = document.createElement('div'); 
                    div.className = 'ios-item clickable cursor-pointer'; 
                    div.innerHTML = `<span class="font-medium text-gray-900">${escapeHTML(shop.name)}</span>`; 
                    div.onclick = () => openDetailModal(shop); 
                    list.appendChild(div); 
                }); 
            }
            document.getElementById('modal-shops').classList.add('active');
        }

        /* ==================== 朝・昼・夜 ＋ 選択ピルUI ==================== */
        let currentTimeSlotMode = 'now';

        function renderTimePills(activeTime, isSelected = true) {
            const container = document.getElementById('container-time-pills');
            if (!container) return;
            container.innerHTML = '';

            const isNowSelected = isSelected && (currentTimeSlotMode === 'now');
            const nowBtn = document.createElement('button');
            nowBtn.type = 'button';
            nowBtn.className = `time-pill ${isNowSelected ? 'active' : ''}`;
            nowBtn.innerHTML = `<span>現在</span>`;
            nowBtn.onclick = () => selectTimeSlot(formatExactTime(new Date()), 'now');
            container.appendChild(nowBtn);

            const slots = state.timeSlots && state.timeSlots.length > 0 ? state.timeSlots : DEFAULT_STATE.timeSlots;
            let matchedSlot = false;

            slots.forEach(slot => {
                const isThisSelected = isSelected && (currentTimeSlotMode === 'preset') && (slot.time === activeTime);
                if (isThisSelected) matchedSlot = true;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `time-pill ${isThisSelected ? 'active' : ''}`;
                btn.innerHTML = `<span>${escapeHTML(slot.name)}</span>`;
                btn.onclick = () => selectTimeSlot(slot.time, 'preset');
                container.appendChild(btn);
            });

            const isCustomSelected = isSelected && (currentTimeSlotMode === 'custom' || (!matchedSlot && !isNowSelected && activeTime));
            const customBtn = document.createElement('button');
            customBtn.type = 'button';
            customBtn.className = `time-pill ${isCustomSelected ? 'active' : ''}`;
            customBtn.innerHTML = `<span>選択 ⏱️</span>`;
            customBtn.onclick = () => openTimePickerSheet();
            container.appendChild(customBtn);

            const timeInp = document.getElementById('inp-time');
            const dispLbl = document.getElementById('lbl-display-time');
            const minutePicker = document.getElementById('inp-native-minute-picker');

            if (currentTimeSlotMode === 'unset') {
                timeInp.value = '';
                dispLbl.textContent = '時間未設定';
                dispLbl.className = 'text-gray-400 font-bold text-[15px] tracking-tight';
                if (minutePicker) minutePicker.value = '';
            } else if (isSelected && activeTime) {
                timeInp.value = activeTime;
                dispLbl.textContent = activeTime;
                dispLbl.className = 'text-[#007AFF] font-bold text-[18px] tracking-tight';
                if (minutePicker) minutePicker.value = activeTime;
            } else {
                timeInp.value = '';
                dispLbl.textContent = '時間を選択';
                dispLbl.className = 'text-[#FF3B30] font-bold text-[15px] tracking-tight';
            }
        }

        // 「時間を未設定にする」共通処理（選択ボトムシート・時間クリックポップアップの両方から呼ばれる）
        function unsetTime() {
            currentTimeSlotMode = 'unset';
            renderTimePills('', false);
        }

        function selectTimeSlot(timeVal, mode = 'preset') {
            currentTimeSlotMode = mode;
            renderTimePills(timeVal, true);
        }

        function onMinutePickerChanged(newTimeStr) {
            if (!newTimeStr) return;
            const matchSlot = state.timeSlots.find(s => s.time === newTimeStr);
            currentTimeSlotMode = matchSlot ? 'preset' : 'custom';
            renderTimePills(newTimeStr, true);
        }

        function triggerNativeTimePicker(e) {
            const picker = document.getElementById('inp-native-minute-picker');
            if (!picker) return;

            if (typeof picker.showPicker === 'function') {
                try {
                    picker.showPicker();
                    return;
                } catch (err) {}
            }

            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            if (!isIOS) {
                const currentVal = document.getElementById('inp-time').value || formatExactTime(new Date());
                showPrompt("時刻を1分単位で入力 (HH:mm)", currentVal, (val) => {
                    if (val && /^([01]\d|2[0-3]):([0-5]\d)$/.test(val)) {
                        onMinutePickerChanged(val);
                    } else if (val) {
                        showAlert("正しい時刻の形式 (例: 14:25) で入力してください");
                    }
                });
            }
        }

        function onDateInputChange(newDateStr) {
            if (!newDateStr) return;
            const container = document.getElementById('item-time-container');
            if (container) {
                container.classList.remove('pulse-focus');
                void container.offsetWidth;
                container.classList.add('pulse-focus');
            }
            // [修正] 既存の記録を編集中は、日付を変えても時刻を消さない（黙って「今」の時刻で上書きされるのを防ぐ）
            if (editingTxnId) return;
            currentTimeSlotMode = null;
            renderTimePills('', false);
        }

        function openTimePickerSheet() {
            const grid = document.getElementById('grid-quick-times');
            grid.innerHTML = '';
            const curVal = currentTimeSlotMode === 'unset' ? '' : (document.getElementById('inp-time').value || '12:00');

            const times = (state.quickTimes && state.quickTimes.length > 0) ? state.quickTimes : DEFAULT_STATE.quickTimes;

            times.forEach(item => {
                const timeStr = item.time;
                const isCur = (timeStr === curVal);
                const btn = document.createElement('div');
                btn.className = `time-grid-btn ${isCur ? 'active' : ''}`;
                btn.textContent = timeStr;
                btn.onclick = () => {
                    selectTimeSlot(timeStr, 'custom');
                    closeTimePickerSheet();
                };
                grid.appendChild(btn);
            });

            document.getElementById('sheet-time-backdrop').classList.add('active');
            document.getElementById('sheet-time-picker').classList.add('active');
        }

        function closeTimePickerSheet() {
            document.getElementById('sheet-time-backdrop').classList.remove('active');
            document.getElementById('sheet-time-picker').classList.remove('active');
        }

        function setDetailIsFixed(val) {
            currentDetailIsFixed = val;
            const btnVar = document.getElementById('btn-detail-variable');
            const btnFix = document.getElementById('btn-detail-fixed');
            btnVar.className = `px-4 py-1.5 rounded-full text-[13px] font-bold transition-colors ${!val ? 'bg-[#007AFF] text-white' : 'bg-gray-100 text-gray-400'}`;
            btnFix.className = `px-4 py-1.5 rounded-full text-[13px] font-bold transition-colors ${val ? 'bg-[#007AFF] text-white' : 'bg-gray-100 text-gray-400'}`;
        }
        window.setDetailIsFixed = setDetailIsFixed;

        function openDetailModal(shopObj = null, txnToEdit = null, shortcutObj = null) {
            closeModal('modal-shops'); closeModal('modal-class-select'); editingTxnId = txnToEdit ? txnToEdit.id : null; const title = document.getElementById('title-detail'); const delBox = document.getElementById('btn-delete-header');
            
            populateSelect('inp-class', state.shopClasses, null); 
            populateSelect('inp-cat', state.categories, null); 
            populateSelect('inp-payment', state.paymentMethods, null);
            
            const now = new Date(); 
            const todayDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
            let initTime = formatExactTime(now);

            if (editingTxnId) {
                title.textContent = '編集'; delBox.classList.remove('hidden'); delBox.classList.add('block');
                document.getElementById('inp-amount').value = (txnToEdit.isPending || txnToEdit.amount === 0) ? "" : txnToEdit.amount; 
                document.getElementById('inp-date').value = txnToEdit.date;
                if (txnToEdit.timeUnset) {
                    currentTimeSlotMode = 'unset';
                    renderTimePills('', false);
                } else {
                    initTime = txnToEdit.time || (txnToEdit.ts ? formatTimeFromTs(txnToEdit.ts) : formatExactTime(now));
                    const matchSlot = state.timeSlots.find(s => s.time === initTime);
                    currentTimeSlotMode = matchSlot ? 'preset' : 'custom';
                    renderTimePills(initTime, true);
                }

                document.getElementById('inp-class').value = txnToEdit.classId; updateShopSelect('inp-class', 'inp-shop', shopDisplayName(txnToEdit));
                document.getElementById('inp-cat').value = txnToEdit.categoryId; document.getElementById('inp-payment').value = txnToEdit.paymentId; document.getElementById('inp-memo').value = txnToEdit.memo;
                setDetailIsFixed(Boolean(txnToEdit.isFixed || String(txnToEdit.id).startsWith('fx_')));
            } else if (shortcutObj) {
                title.textContent = shortcutObj.name; delBox.classList.add('hidden'); delBox.classList.remove('block');
                document.getElementById('inp-amount').value = shortcutObj.amount || (currentAmount === "0" ? "" : currentAmount); 
                document.getElementById('inp-date').value = todayDate;
                initTime = formatExactTime(now);
                currentTimeSlotMode = 'now';
                renderTimePills(initTime, true);
                document.getElementById('inp-class').value = shortcutObj.classId; updateShopSelect('inp-class', 'inp-shop', shopDisplayName(shortcutObj));
                document.getElementById('inp-cat').value = shortcutObj.categoryId; document.getElementById('inp-payment').value = shortcutObj.paymentId; document.getElementById('inp-memo').value = shortcutObj.memo;
                setDetailIsFixed(Boolean(shortcutObj.isFixed));
            } else {
                title.textContent = '詳細確認'; delBox.classList.add('hidden'); delBox.classList.remove('block');
                document.getElementById('inp-amount').value = currentAmount === "0" ? "" : currentAmount; 
                document.getElementById('inp-date').value = todayDate;
                initTime = formatExactTime(now);
                currentTimeSlotMode = 'now';
                renderTimePills(initTime, true);
                if (shopObj) {
                    document.getElementById('inp-class').value = shopObj.classId; updateShopSelect('inp-class', 'inp-shop', shopObj.name);
                    document.getElementById('inp-cat').value = shopObj.categoryId; document.getElementById('inp-payment').value = shopObj.paymentId; document.getElementById('inp-memo').value = shopObj.memo;
                } else {
                    document.getElementById('inp-class').value = activeClassId; updateShopSelect('inp-class', 'inp-shop', '');
                    document.getElementById('inp-memo').value = "";
                }
                setDetailIsFixed(false);
            }
            document.getElementById('modal-detail').classList.add('active');
        }

        function saveTransaction() {
            const rawAmt = document.getElementById('inp-amount').value;
            let amt = parseInt(rawAmt, 10);
            let isPending = false;

            if (isNaN(amt) || amt <= 0) {
                if (editingTxnId) {
                    amt = 0;
                    isPending = true;
                } else {
                    showAlert("金額を1円以上で入力してください");
                    return;
                }
            }
            const dateVal = document.getElementById('inp-date').value;
            if (!dateVal) {
                showAlert("日付を入力してください");
                return;
            }
            const isTimeUnset = (currentTimeSlotMode === 'unset');
            let timeVal = document.getElementById('inp-time').value;
            if (!isTimeUnset && !timeVal) {
                timeVal = formatExactTime(new Date());
            }
            const shopNameVal = document.getElementById('inp-shop').value;

            // 時間が未設定の場合は、その日の 0:00 を仮のタイムスタンプとして使う（並び替え・CSV上は「0:00扱い」= その日の最初として扱われる）
            const combinedDate = isTimeUnset ? new Date(`${dateVal}T00:00:00`) : new Date(`${dateVal}T${timeVal}:00`);
            const calculatedTs = isNaN(combinedDate.getTime()) ? Date.now() : combinedDate.getTime();

            const newTxn = {
                id: editingTxnId || generateId(),
                amount: amt,
                isPending: isPending,
                date: dateVal,
                time: isTimeUnset ? '' : timeVal,
                timeUnset: isTimeUnset,
                classId: document.getElementById('inp-class').value,
                categoryId: document.getElementById('inp-cat').value,
                shopName: shopNameVal === 'ADD_NEW' ? '' : shopNameVal,
                shopId: pickShopIdForSave(shopNameVal, document.getElementById('inp-class').value, editingTxnId ? state.transactions.find(t => t.id === editingTxnId) : null),
                paymentId: document.getElementById('inp-payment').value,
                memo: document.getElementById('inp-memo').value.trim(),
                isFixed: currentDetailIsFixed,
                ts: calculatedTs
            };
            if (editingTxnId) {
                const idx = state.transactions.findIndex(t => t.id === editingTxnId);
                if (idx > -1) state.transactions[idx] = newTxn;
            } else {
                state.transactions.push(newTxn);
            }
            maybeAutoUpdateShopPayment(newTxn.shopId, newTxn.paymentId);
            saveData();
            closeAllModals(); 
            resetMainView(); 

            calCurrentDate = parseDateStr(dateVal);
            calCurrentDate.setHours(0,0,0,0);
            
            document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
            document.getElementById('view-calendar').classList.add('active');
            updateNavColors('calendar');
            updateFilterButtonsUI();
            renderCalendar();
        }

        // 保存時の shopId。選ばれた名前＋分類で探し、見つからない場合は（削除済みのお店など）元の値を引き継ぐ
        function pickShopIdForSave(shopName, classId, original) {
            if (!shopName || shopName === 'ADD_NEW') return '';
            const id = resolveShopIdByName(shopName, classId);
            if (id) return id;
            if (original && original.shopName === shopName && original.shopId) return original.shopId;
            return '';
        }

        /* ==================== 削除の取り消し（Undo） v2.3 ====================
         * 削除した直後、画面下に「元に戻す」を約7秒表示する。
         * 元に戻すと、削除した項目を同じIDで元の位置に戻す（クラウドにも同じIDで再保存される）。
         */
        const UNDO_DURATION_MS = 7000;
        let undoEntry = null;
        let undoTimer = null;

        function removeWithUndo(key, id, label) {
            const arr = state[key] || [];
            const index = arr.findIndex(x => x && x.id === id);
            if (index < 0) return false;
            const item = JSON.parse(JSON.stringify(arr[index]));
            state[key] = arr.filter(x => !(x && x.id === id));
            saveData();
            offerUndo(label, [{ key, item, index }]);
            return true;
        }

        function offerUndo(label, entries) {
            undoEntry = { entries };
            clearTimeout(undoTimer);
            const toast = document.getElementById('undo-toast');
            const msg = document.getElementById('undo-msg');
            if (!toast || !msg) return;
            msg.textContent = label;
            toast.classList.add('active');
            undoTimer = setTimeout(hideUndoToast, UNDO_DURATION_MS);
        }

        function hideUndoToast() {
            clearTimeout(undoTimer); undoTimer = null;
            undoEntry = null;
            const toast = document.getElementById('undo-toast');
            if (toast) toast.classList.remove('active');
        }

        function performUndo() {
            if (!undoEntry) return;
            const entries = undoEntry.entries.slice().sort((a, b) => a.index - b.index);
            const keys = new Set();
            entries.forEach(({ key, item, index }) => {
                const arr = state[key] || (state[key] = []);
                if (arr.some(x => x && x.id === item.id)) return; // 既に戻っている（他端末で再作成など）
                arr.splice(Math.min(index, arr.length), 0, item);
                keys.add(key);
            });
            hideUndoToast();
            if (keys.size === 0) return;
            saveData();
            try { renderPanelLists(); } catch (e) {}
            if (keys.has('shortcuts')) { try { renderShortcuts(); } catch (e) {} }
            if (keys.has('timeSlots')) {
                const curTime = document.getElementById('inp-time').value || '12:00';
                try { renderTimePills(curTime, true); } catch (e) {}
            }
            refreshCurrentView();
        }
        window.performUndo = performUndo;

        function deleteTransaction() { showConfirm("この記録を削除しますか？", () => { removeWithUndo('transactions', editingTxnId, '記録を削除しました'); closeAllModals(); renderCalendar(); }); }

        function setCalTab(tab, idx) { 
            calTab = tab; 
            document.getElementById('cal-seg-indicator').style.transform = `translateX(${idx * 100}%)`; 
            document.querySelectorAll('.cal-seg-btn').forEach((b, i) => { 
                b.classList.toggle('text-gray-500', i !== idx); 
                b.classList.toggle('text-black', i === idx); 
            }); 
            renderCalendar(); 
        }

        function shiftDate(offset) { 
            if (calTab === 'daily') calCurrentDate.setDate(calCurrentDate.getDate() + offset); 
            else if (calTab === 'weekly') calCurrentDate.setDate(calCurrentDate.getDate() + offset * 7); 
            else if (calTab === 'monthly') calCurrentDate = addMonthsClamped(calCurrentDate, offset); 
            else if (calTab === 'yearly') calCurrentDate = addMonthsClamped(calCurrentDate, offset * 12); 
            renderCalendar(); 
        }

        function jumpToDate(dateStr) { if(!dateStr) return; calCurrentDate = parseDateStr(dateStr); if (isNaN(calCurrentDate.getTime())) calCurrentDate = new Date(); calCurrentDate.setHours(0,0,0,0); renderCalendar(); }

        /* ==================== 履歴 検索・フィルター・並び替え ==================== */
        function onCalSearchInput(val) {
            calSearchQuery = val.trim().toLowerCase();
            const btnClear = document.getElementById('btn-clear-search');
            if (btnClear) {
                if (calSearchQuery) btnClear.classList.remove('hidden');
                else btnClear.classList.add('hidden');
            }
            updateFilterButtonsUI();
            renderCalendar();
        }

        function clearCalSearch() {
            const inp = document.getElementById('inp-cal-search');
            if (inp) inp.value = '';
            calSearchQuery = '';
            document.getElementById('btn-clear-search').classList.add('hidden');
            updateFilterButtonsUI();
            renderCalendar();
        }

        function resetAllFilters() {
            calSelectedCatId = null;
            calSelectedPayId = null;
            calSelectedFixedType = null;
            clearCalSearch();
            updateFilterButtonsUI();
            renderCalendar();
        }

        function updateFilterButtonsUI() {
            const catBtn = document.getElementById('btn-filter-cat');
            const catLbl = document.getElementById('lbl-filter-cat');
            const payBtn = document.getElementById('btn-filter-pay');
            const payLbl = document.getElementById('lbl-filter-pay');
            const fixedBtn = document.getElementById('btn-filter-fixed');
            const fixedLbl = document.getElementById('lbl-filter-fixed');
            const resetBtn = document.getElementById('btn-filter-reset');
            const sortBtn = document.getElementById('btn-sort');

            if (calSelectedFixedType) {
                fixedLbl.textContent = calSelectedFixedType === 'fixed' ? '固定費' : '変動費';
                fixedBtn.classList.add('active');
            } else {
                fixedLbl.textContent = 'すべて';
                fixedBtn.classList.remove('active');
            }

            if (calSelectedCatId) {
                const cat = state.categories.find(c => c.id === calSelectedCatId);
                catLbl.textContent = cat ? cat.name : 'カテゴリー';
                catBtn.classList.add('active');
            } else {
                catLbl.textContent = 'カテゴリー';
                catBtn.classList.remove('active');
            }

            if (calSelectedPayId) {
                const pay = state.paymentMethods.find(p => p.id === calSelectedPayId);
                payLbl.textContent = pay ? pay.name : '支払い';
                payBtn.classList.add('active');
            } else {
                payLbl.textContent = '支払い';
                payBtn.classList.remove('active');
            }

            if (sortBtn) {
                sortBtn.classList.toggle('active', calSortType !== 'date_desc');
            }

            const isFiltered = calSelectedCatId || calSelectedPayId || calSelectedFixedType || calSearchQuery;
            if (isFiltered) {
                resetBtn.classList.remove('hidden');
            } else {
                resetBtn.classList.add('hidden');
            }
        }

        function openFilterSheet(type) {
            currentSheetType = type;
            const titleEl = document.getElementById('sheet-title');
            const listEl = document.getElementById('sheet-list');
            const resetBtn = document.getElementById('sheet-reset-btn');
            resetBtn.classList.remove('hidden');
            listEl.innerHTML = '';

            if (type === 'fixed') {
                titleEl.textContent = '固定費・変動費で絞り込み';
                const fixedOptions = [
                    { id: null, label: 'すべて表示 (解除)' },
                    { id: 'variable', label: '変動費のみ' },
                    { id: 'fixed', label: '固定費のみ' },
                ];
                fixedOptions.forEach(opt => {
                    const isSelected = (calSelectedFixedType === opt.id);
                    const div = document.createElement('div');
                    div.className = 'ios-item clickable cursor-pointer';
                    div.onclick = () => applySheetFilter(opt.id);
                    div.innerHTML = `
                        <span class="font-medium ${isSelected ? 'text-[#007AFF] font-bold' : 'text-gray-900'}">${escapeHTML(opt.label)}</span>
                        ${isSelected ? '<svg class="w-5 h-5 text-[#007AFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>' : ''}
                    `;
                    listEl.appendChild(div);
                });

                document.getElementById('sheet-backdrop').classList.add('active');
                document.getElementById('filter-sheet').classList.add('active');
                return;
            }

            const isCat = (type === 'cat');
            titleEl.textContent = isCat ? 'カテゴリーで絞り込み' : '支払い方法で絞り込み';

            const items = isCat ? state.categories : state.paymentMethods;
            const selectedId = isCat ? calSelectedCatId : calSelectedPayId;

            const allDiv = document.createElement('div');
            allDiv.className = 'ios-item clickable cursor-pointer';
            allDiv.onclick = () => applySheetFilter(null);
            allDiv.innerHTML = `
                <span class="font-medium ${!selectedId ? 'text-[#007AFF] font-bold' : 'text-gray-900'}">すべて表示 (解除)</span>
                ${!selectedId ? '<svg class="w-5 h-5 text-[#007AFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>' : ''}
            `;
            listEl.appendChild(allDiv);

            items.forEach(item => {
                const isSelected = (selectedId === item.id);
                const div = document.createElement('div');
                div.className = 'ios-item clickable cursor-pointer';
                div.onclick = () => applySheetFilter(item.id);
                div.innerHTML = `
                    <span class="font-medium ${isSelected ? 'text-[#007AFF] font-bold' : 'text-gray-900'}">${escapeHTML(item.name)}</span>
                    ${isSelected ? '<svg class="w-5 h-5 text-[#007AFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>' : ''}
                `;
                listEl.appendChild(div);
            });

            document.getElementById('sheet-backdrop').classList.add('active');
            document.getElementById('filter-sheet').classList.add('active');
        }

        function openSortSheet() {
            currentSheetType = 'sort';
            const titleEl = document.getElementById('sheet-title');
            const listEl = document.getElementById('sheet-list');
            const resetBtn = document.getElementById('sheet-reset-btn');
            resetBtn.classList.add('hidden');
            listEl.innerHTML = '';

            titleEl.textContent = '履歴の並び替え';

            const sortOptions = [
                { id: 'date_desc', label: '新しい順 (標準)', icon: '↓' },
                { id: 'date_asc', label: '古い順', icon: '↑' },
                { id: 'amt_desc', label: '金額が高い順', icon: '¥↓' },
                { id: 'amt_asc', label: '金額が安い順', icon: '¥↑' }
            ];

            sortOptions.forEach(opt => {
                const isSelected = (calSortType === opt.id);
                const div = document.createElement('div');
                div.className = 'ios-item clickable cursor-pointer';
                div.onclick = () => {
                    calSortType = opt.id;
                    closeFilterSheet();
                    updateFilterButtonsUI();
                    renderCalendar();
                };
                div.innerHTML = `
                    <div class="flex items-center gap-2">
                        <span class="text-gray-400 text-xs font-mono font-bold w-6 text-center">${opt.icon}</span>
                        <span class="font-medium ${isSelected ? 'text-[#007AFF] font-bold' : 'text-gray-900'}">${opt.label}</span>
                    </div>
                    ${isSelected ? '<svg class="w-5 h-5 text-[#007AFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>' : ''}
                `;
                listEl.appendChild(div);
            });

            document.getElementById('sheet-backdrop').classList.add('active');
            document.getElementById('filter-sheet').classList.add('active');
        }

        function closeFilterSheet() {
            document.getElementById('sheet-backdrop').classList.remove('active');
            document.getElementById('filter-sheet').classList.remove('active');
            currentSheetType = null;
        }

        function applySheetFilter(id) {
            if (currentSheetType === 'cat') {
                calSelectedCatId = id;
            } else if (currentSheetType === 'pay') {
                calSelectedPayId = id;
            } else if (currentSheetType === 'fixed') {
                calSelectedFixedType = id;
            }
            closeFilterSheet();
            updateFilterButtonsUI();
            renderCalendar();
        }

        function renderCalendar() {
            const list = document.getElementById('list-expenses'); list.innerHTML = '';
            const target = new Date(calCurrentDate); const y = target.getFullYear(); const m = target.getMonth(); const d = target.getDate();
            let filtered = []; let periodLabel = ''; let periodStart = null, periodEnd = null;

            if (calTab === 'daily') {
                const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                filtered = state.transactions.filter(t => t.date === dateStr);
                const dayStr = ['日','月','火','水','木','金','土'][target.getDay()];
                periodLabel = `${y}年${m+1}月${d}日 (${dayStr})`;
            }
            else if (calTab === 'weekly') {
                const wStart = new Date(target);
                wStart.setDate(target.getDate() - target.getDay());
                const wEnd = new Date(wStart);
                wEnd.setDate(wStart.getDate() + 6);
                filtered = state.transactions.filter(t => {
                    const td = parseDateStr(t.date);
                    td.setHours(0,0,0,0);
                    return td >= wStart && td <= wEnd;
                });
                periodLabel = `${wStart.getMonth()+1}/${wStart.getDate()} 〜 ${wEnd.getMonth()+1}/${wEnd.getDate()}`;
                periodStart = wStart; periodEnd = wEnd;
            }
            else if (calTab === 'monthly') {
                const monthPrefix = `${y}-${String(m+1).padStart(2,'0')}`;
                filtered = state.transactions.filter(t => t.date.startsWith(monthPrefix));
                periodLabel = `${y}年${m+1}月`;
                periodStart = new Date(y, m, 1); periodEnd = new Date(y, m + 1, 0);
            }
            else if (calTab === 'yearly') {
                const yearPrefix = `${y}-`;
                filtered = state.transactions.filter(t => t.date.startsWith(yearPrefix));
                periodLabel = `${y}年`;
                periodStart = new Date(y, 0, 1); periodEnd = new Date(y, 11, 31);
            }

            document.getElementById('lbl-period').textContent = periodLabel;

            if (calSelectedCatId) {
                filtered = filtered.filter(t => t.categoryId === calSelectedCatId);
            }
            if (calSelectedPayId) {
                filtered = filtered.filter(t => t.paymentId === calSelectedPayId);
            }
            if (calSelectedFixedType === 'fixed') {
                filtered = filtered.filter(t => isFixedTxn(t));
            } else if (calSelectedFixedType === 'variable') {
                filtered = filtered.filter(t => !isFixedTxn(t));
            }

            if (calSearchQuery) {
                filtered = filtered.filter(t => {
                    const shop = (t.shopName || '').toLowerCase();
                    const memo = (t.memo || '').toLowerCase();
                    const catObj = state.categories.find(c => c.id === t.categoryId);
                    const catName = (catObj ? catObj.name : '').toLowerCase();
                    const payObj = state.paymentMethods.find(p => p.id === t.paymentId);
                    const payName = (payObj ? payObj.name : '').toLowerCase();
                    const classObj = state.shopClasses.find(c => c.id === t.classId);
                    const className = (classObj ? classObj.name : '').toLowerCase();
                    const amtStr = String(t.amount);

                    return shop.includes(calSearchQuery) ||
                           memo.includes(calSearchQuery) ||
                           catName.includes(calSearchQuery) ||
                           payName.includes(calSearchQuery) ||
                           className.includes(calSearchQuery) ||
                           amtStr.includes(calSearchQuery);
                });
            }

            filtered.sort((a, b) => {
                if (calSortType === 'date_asc') {
                    return a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.ts || 0) - (b.ts || 0);
                } else if (calSortType === 'amt_desc') {
                    return b.amount !== a.amount ? b.amount - a.amount : (b.ts || 0) - (a.ts || 0);
                } else if (calSortType === 'amt_asc') {
                    return a.amount !== b.amount ? a.amount - b.amount : (b.ts || 0) - (a.ts || 0);
                } else {
                    return a.date !== b.date ? (a.date > b.date ? -1 : 1) : (b.ts || 0) - (a.ts || 0);
                }
            });

            let total = 0;
            
            if (filtered.length === 0) {
                const isFiltered = calSelectedCatId || calSelectedPayId || calSelectedFixedType || calSearchQuery;
                const emptyText = isFiltered ? '条件に一致する記録がありません' : 'データがありません';
                list.innerHTML = `<div class="py-12 text-center text-gray-400 font-medium text-[14px]">${emptyText}</div>`;
            } else {
                filtered.forEach(t => {
                    total += t.amount; 
                    const dt = parseDateStr(t.date); 
                    const payObj = state.paymentMethods.find(p => p.id === t.paymentId) || {name: '不明'}; 
                    const catObj = state.categories.find(c => c.id === t.categoryId) || {name: '不明'};
                    
                    const isUnset = !t.classId && !t.categoryId;
                    const isPending = Boolean(t.isPending || t.amount === 0);

                    const displayTitle = isUnset ? '未設定' : (shopDisplayName(t) || catObj.name);
                    const titleClass = (isUnset || isPending) ? 'text-[#FF3B30]' : 'text-gray-900';

                    let badgeHtml = '';
                    if (isPending) {
                        badgeHtml = '<span class="bg-[#FF3B30] text-white text-[9px] px-1 py-[2px] rounded-[4px] font-bold mr-1 leading-none inline-flex items-center">金額未定</span>';
                    } else if (isUnset) {
                        badgeHtml = '<span class="bg-[#FF3B30] text-white text-[9px] px-1 py-[2px] rounded-[4px] font-bold mr-1 leading-none inline-flex items-center">要編集</span>';
                    }

                    const subText = `${badgeHtml}${escapeHTML(catObj.name)} ${t.memo ? '・'+escapeHTML(t.memo) : ''}`;
                    const div = document.createElement('div'); 
                    div.className = 'ios-item clickable cursor-pointer'; 
                    div.onclick = () => openDetailModal(null, t);
                    
                    const dateSubLabel = (calTab === 'yearly' || calSortType.startsWith('amt')) ? `${dt.getMonth()+1}/${dt.getDate()}` : dt.getDate();
                    const timeStr = t.timeUnset ? '未設定' : (t.time || formatTimeFromTs(t.ts));

                    const amountDisplay = isPending ? '<span class="text-[#FF3B30] font-bold text-[17px]">未定</span>' : `¥${t.amount.toLocaleString()}`;

                    div.innerHTML = `
                        <div class="flex items-center gap-3 w-2/3">
                            <div class="flex flex-col items-center justify-center w-11 shrink-0">
                                <span class="text-[9px] text-gray-400 font-bold uppercase tracking-wider leading-none mb-0.5">${dt.toLocaleDateString('en-US', {weekday: 'short'})}</span>
                                <span class="text-[15px] font-extrabold text-gray-800 leading-tight">${dateSubLabel}</span>
                                <span class="text-[10px] text-gray-400 font-semibold tracking-tighter mt-0.5 leading-none">${escapeHTML(timeStr)}</span>
                            </div>
                            <div class="flex flex-col border-l pl-3 border-[rgba(60,60,67,0.15)] overflow-hidden w-full">
                                <span class="font-bold ${titleClass} truncate tracking-tight text-[16px]">${escapeHTML(displayTitle)}</span>
                                <span class="text-[11px] text-gray-500 mt-0.5 truncate flex items-center">${subText}</span>
                            </div>
                        </div>
                        <div class="flex flex-col items-end shrink-0">
                            <span class="font-bold text-[18px] text-gray-900 tracking-tight">${amountDisplay}</span>
                            <span class="text-[10px] text-[#007AFF] mt-0.5">${escapeHTML(payObj.name)}</span>
                        </div>
                    `;
                    list.appendChild(div);
                });
            }
            document.getElementById('lbl-total').textContent = total.toLocaleString();

            // 1日あたりの金額（Weekly / Monthly / Yearly のみ表示。Dailyは1日分の合計＝そのままなので不要）
            const perDayWrap = document.getElementById('lbl-perday-wrap');
            if (calTab !== 'daily' && periodStart && periodEnd) {
                periodStart.setHours(0, 0, 0, 0); periodEnd.setHours(0, 0, 0, 0);
                const allDatesSorted = state.transactions.map(t => t.date).filter(Boolean).sort();
                let perDayText = '0';
                if (allDatesSorted.length > 0) {
                    const firstEverDate = parseDateStr(allDatesSorted[0]); firstEverDate.setHours(0, 0, 0, 0);
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    const effectiveStart = firstEverDate > periodStart ? firstEverDate : periodStart;
                    const effectiveEnd = today < periodEnd ? today : periodEnd;
                    const elapsedDays = Math.round((effectiveEnd - effectiveStart) / (1000 * 60 * 60 * 24)) + 1;
                    if (elapsedDays > 0) {
                        perDayText = Math.round(total / elapsedDays).toLocaleString();
                    }
                }
                document.getElementById('lbl-perday').textContent = perDayText;
                perDayWrap.classList.remove('hidden');
            } else {
                perDayWrap.classList.add('hidden');
            }
        }

        /* ==================== 分析 (Monthly, Yearly, Shop) ==================== */
        function setStatsTab(tab, idx) { 
            statsTab = tab; 
            document.getElementById('stats-seg-indicator').style.transform = `translateX(${idx * 100}%)`; 
            document.querySelectorAll('.stats-seg-btn').forEach((b, i) => { 
                b.classList.toggle('text-gray-500', i !== idx); 
                b.classList.toggle('text-black', i === idx); 
            }); 

            const periodHeader = document.getElementById('stats-period-header');
            const shopHeader = document.getElementById('stats-shop-header');
            const fixedFilterBar = document.getElementById('stats-fixed-filter');
            updateStatsFixedFilterUI();

            if (tab === 'shop') {
                fixedFilterBar.classList.add('hidden');
                periodHeader.classList.add('hidden');
                shopHeader.classList.remove('hidden');
                
                if (!statsSelectedShopKey) {
                    const shopCounts = {};
                    state.transactions.forEach(t => {
                        const k = shopKeyOf(t);
                        if (k) shopCounts[k] = (shopCounts[k] || 0) + 1;
                    });
                    const topShops = Object.keys(shopCounts).sort((a,b) => shopCounts[b] - shopCounts[a]);
                    statsSelectedShopKey = topShops[0] || (state.shops[0] ? 'id:' + state.shops[0].id : '');
                }
                updateStatsShopHeaderUI();
            } else if (tab === 'trend') {
                fixedFilterBar.classList.remove('hidden');
                periodHeader.classList.add('hidden');
                shopHeader.classList.add('hidden');
            } else {
                fixedFilterBar.classList.remove('hidden');
                periodHeader.classList.remove('hidden');
                shopHeader.classList.add('hidden');
            }
            renderStats();
        }

        function shiftStatsDate(offset) { 
            if (statsTab === 'monthly') statsCurrentDate = addMonthsClamped(statsCurrentDate, offset); 
            else if (statsTab === 'yearly') statsCurrentDate = addMonthsClamped(statsCurrentDate, offset * 12); 
            renderStats(); 
        }

        function updateStatsShopHeaderUI() {
            const nameEl = document.getElementById('stats-selected-shop-name');
            const iconEl = document.getElementById('stats-selected-shop-icon');
            if (!nameEl || !iconEl) return;

            if (!statsSelectedShopKey) {
                nameEl.textContent = 'お店を選択してください';
                iconEl.textContent = '🏪';
                return;
            }

            const info = shopKeyInfo(statsSelectedShopKey);
            nameEl.textContent = info.name;
            iconEl.textContent = info.icon;
        }

        function openStatsShopPickerSheet() {
            const inp = document.getElementById('inp-stats-shop-search');
            if (inp) inp.value = '';
            renderStatsShopPickerList('');
            document.getElementById('sheet-stats-shop-backdrop').classList.add('active');
            document.getElementById('sheet-stats-shop-picker').classList.add('active');
        }

        function closeStatsShopPickerSheet() {
            document.getElementById('sheet-stats-shop-backdrop').classList.remove('active');
            document.getElementById('sheet-stats-shop-picker').classList.remove('active');
        }

        function renderStatsShopPickerList(searchQuery = '') {
            const listEl = document.getElementById('list-stats-shop-picker');
            if (!listEl) return;
            listEl.innerHTML = '';

            const q = searchQuery.trim().toLowerCase();

            // v2.3: お店は ID ごとに集計（同じ名前でも分類が違えば別のお店として扱う）
            const shopStatsMap = {};
            state.transactions.forEach(t => {
                const k = shopKeyOf(t);
                if (!k) return;
                if (!shopStatsMap[k]) shopStatsMap[k] = { total: 0, count: 0 };
                shopStatsMap[k].total += t.amount;
                shopStatsMap[k].count += 1;
            });

            const shopKeySet = new Set(state.shops.map(s => 'id:' + s.id));
            Object.keys(shopStatsMap).forEach(k => shopKeySet.add(k));

            let shopArray = Array.from(shopKeySet).filter(k => {
                if (!q) return true;
                return shopKeyInfo(k).name.toLowerCase().includes(q);
            });

            shopArray.sort((a, b) => {
                const aCnt = (shopStatsMap[a] && shopStatsMap[a].count) || 0;
                const bCnt = (shopStatsMap[b] && shopStatsMap[b].count) || 0;
                return bCnt - aCnt;
            });

            if (shopArray.length === 0) {
                listEl.innerHTML = '<div class="py-10 text-center text-gray-400 text-sm font-medium">該当するお店がありません</div>';
                return;
            }

            shopArray.forEach(shopKey => {
                const info = shopKeyInfo(shopKey);
                const shopName = info.name;
                const icon = info.icon;
                const className = info.className;

                const sData = shopStatsMap[shopKey] || { total: 0, count: 0 };
                const isSelected = (statsSelectedShopKey === shopKey);

                const card = document.createElement('div');
                card.className = `shop-picker-card ${isSelected ? 'active' : ''}`;
                card.onclick = () => {
                    statsSelectedShopKey = shopKey;
                    updateStatsShopHeaderUI();
                    closeStatsShopPickerSheet();
                    renderStats();
                };

                card.innerHTML = `
                    <div class="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-2xl shrink-0">
                        ${escapeHTML(icon)}
                    </div>
                    <div class="flex flex-col min-w-0 flex-1">
                        <span class="text-[16px] font-bold text-gray-900 truncate">${escapeHTML(shopName)}</span>
                        <span class="text-[12px] text-gray-400 font-medium">${escapeHTML(className)}</span>
                    </div>
                    <div class="flex flex-col items-end shrink-0">
                        <span class="text-[15px] font-extrabold text-gray-900">¥${sData.total.toLocaleString()}</span>
                        <span class="text-[11px] text-gray-400 font-semibold">${sData.count}回 利用</span>
                    </div>
                `;
                listEl.appendChild(card);
            });
        }

        // 月別・年別の「お店別」集計用の表示名。同じ名前の別のお店は分類名を添えて区別する
        function shopLabelForStats(t) {
            const k = shopKeyOf(t);
            if (!k) return '未指定';
            const info = shopKeyInfo(k);
            const dupName = state.shops.filter(s => s.name === info.name).length > 1;
            return dupName && info.shop ? `${info.name}（${info.className}）` : info.name;
        }

        function setTrendChartMode(mode) {
            trendChartMode = mode;
            renderStats();
        }

        function renderTrendTab(container) {
            if (!state.transactions || state.transactions.length === 0) {
                container.innerHTML = `
                    <div class="py-16 text-center text-gray-400 font-medium flex flex-col items-center">
                        <span class="text-4xl mb-3">📊</span>
                        <span>データがまだありません</span>
                    </div>
                `;
                return;
            }

            const today = new Date(); today.setHours(0, 0, 0, 0);
            const todayStr = toDateStr(today);

            // 家計簿全体の初回入力日（比較期間がデータの無い過去にはみ出さないための下限）
            const allDatesSorted = state.transactions.map(t => t.date).filter(Boolean).sort();
            const firstEverDate = allDatesSorted.length > 0 ? parseDateStr(allDatesSorted[0]) : null;
            if (firstEverDate) firstEverDate.setHours(0, 0, 0, 0);

            // 表示切り替え（すべて／変動費のみ）を反映した取引一覧
            const statsTxns = getStatsTxns();

            // 指定期間 [start, end]（両端含む）の支出合計
            function sumInRange(start, end) {
                const s = toDateStr(start), e = toDateStr(end);
                let sum = 0;
                statsTxns.forEach(t => { if (t.date >= s && t.date <= e) sum += t.amount; });
                return sum;
            }

            // 期間の1日あたり平均を算出。データの無い過去にはみ出す分は firstEverDate でクランプする。
            // 有効な期間が無い場合は null。
            function periodPerDay(start, end) {
                let s = new Date(start);
                const e = new Date(end);
                if (firstEverDate && firstEverDate > s) s = new Date(firstEverDate);
                if (s > e) return null;
                const days = Math.round((e - s) / 86400000) + 1;
                const total = sumInRange(s, e);
                return { total, days, perDay: total / days };
            }

            function deltaBadge(current, baseline, captionText) {
                if (!current || !baseline || baseline.perDay <= 0) {
                    return `<div class="text-[11px] font-semibold text-gray-400 mt-1">比較データ不足</div>`;
                }
                const diffPct = Math.round(((current.perDay - baseline.perDay) / baseline.perDay) * 100);
                const isFlat = diffPct === 0;
                const isUp = diffPct > 0;
                const color = isFlat ? 'text-gray-400' : (isUp ? 'text-[#FF3B30]' : 'text-[#34C759]');
                const arrow = isFlat ? '→' : (isUp ? '↑' : '↓');
                const captionHtml = captionText ? `<span class="text-[10px] font-semibold text-gray-400">${captionText}</span>` : '';
                return `<div class="flex items-baseline gap-1 mt-1"><span class="text-[15px] font-extrabold ${color}">${arrow} ${Math.abs(diffPct)}%</span>${captionHtml}</div>`;
            }

            // ---------- ① 今週 / 今月の1日あたり vs 過去平均 ----------
            const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
            // [v2.3] 「今週」は日曜だと1日分だけで不安定なため、直近7日（今日を含む）で計算し、その前の8週間と比べる
            const last7Start = new Date(today); last7Start.setDate(today.getDate() - 6);
            const thisWeek = periodPerDay(last7Start, today);

            const prevWeeksEnd = new Date(last7Start); prevWeeksEnd.setDate(last7Start.getDate() - 1);
            const prevWeeksStart = new Date(last7Start); prevWeeksStart.setDate(last7Start.getDate() - 7 * 8);
            const prevWeeksBaseline = periodPerDay(prevWeeksStart, prevWeeksEnd);

            const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
            const monthStartStr = toDateStr(monthStart);
            const thisMonth = periodPerDay(monthStart, today);

            const prevMonthsEnd = new Date(monthStart); prevMonthsEnd.setDate(monthStart.getDate() - 1);
            const prevMonthsStart = new Date(today.getFullYear(), today.getMonth() - 6, 1);
            const prevMonthsBaseline = periodPerDay(prevMonthsStart, prevMonthsEnd);

            // ---------- ② 今月の着地予測 ----------
            const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            const daysElapsedThisMonth = Math.round((today - monthStart) / 86400000) + 1;
            const progressPct = Math.min(100, Math.round((daysElapsedThisMonth / daysInMonth) * 100));
            // [修正] 固定費（家賃など）は日数で引き伸ばさず実額で計上し、変動費だけを日割りで外挿する。
            //   さらに、今月まだ追加されていない定期支出（今日より後の日付）は予定額として加える。
            let monthFixedSoFar = 0, monthVariableSoFar = 0;
            const catFixedSoFar = {}, catVariableSoFar = {}, catUpcomingFixed = {};
            statsTxns.forEach(t => {
                if (t.date >= monthStartStr && t.date <= todayStr) {
                    if (isFixedTxn(t)) { monthFixedSoFar += t.amount; catFixedSoFar[t.categoryId] = (catFixedSoFar[t.categoryId] || 0) + t.amount; }
                    else { monthVariableSoFar += t.amount; catVariableSoFar[t.categoryId] = (catVariableSoFar[t.categoryId] || 0) + t.amount; }
                }
            });
            // [v2.3] 金額未定の記録は合計に入らないため、件数を注記する
            const pendingThisMonth = statsTxns.filter(t => t.date >= monthStartStr && t.date <= todayStr && (t.isPending || t.amount === 0)).length;
            let upcomingFixedTotal = 0;
            if (statsFixedFilter !== 'variable') {
                (state.fixedExpenses || []).forEach(fe => {
                    if (!fe || fe.isPending || !(fe.amount > 0)) return;
                    let targetDay = parseInt(fe.day, 10); if (isNaN(targetDay)) targetDay = 1;
                    if (targetDay > daysInMonth) targetDay = daysInMonth;
                    if (targetDay <= today.getDate()) return;
                    const dateStr = toDateStr(new Date(today.getFullYear(), today.getMonth(), targetDay));
                    if (state.transactions.some(t => t.id === `fx_${fe.id}_${dateStr}`)) return;
                    upcomingFixedTotal += fe.amount;
                    catUpcomingFixed[fe.categoryId] = (catUpcomingFixed[fe.categoryId] || 0) + fe.amount;
                });
            }
            const projectedTotal = thisMonth ? Math.round((monthVariableSoFar / daysElapsedThisMonth) * daysInMonth + monthFixedSoFar + upcomingFixedTotal) : 0;

            // ---------- ③ 前月比・前年同月比（1日あたり） ----------
            const lastMonthEnd = new Date(monthStart); lastMonthEnd.setDate(monthStart.getDate() - 1);
            const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
            const lastMonthStats = periodPerDay(lastMonthStart, lastMonthEnd);

            const lastYearMonthStart = new Date(today.getFullYear() - 1, today.getMonth(), 1);
            const lastYearMonthEnd = new Date(today.getFullYear() - 1, today.getMonth() + 1, 0);
            const lastYearMonthStats = periodPerDay(lastYearMonthStart, lastYearMonthEnd);

            // ---------- ④ 推移グラフ（週次 / 月次） ----------
            let trendBarsHtml = '';
            if (trendChartMode === 'week') {
                const weeks = [];
                for (let i = 7; i >= 0; i--) {
                    const wStart = new Date(weekStart); wStart.setDate(weekStart.getDate() - 7 * i);
                    const wEnd = new Date(wStart); wEnd.setDate(wStart.getDate() + 6);
                    const cappedEnd = wEnd > today ? today : wEnd;
                    const total = sumInRange(wStart, cappedEnd);
                    weeks.push({ label: `${wStart.getMonth() + 1}/${wStart.getDate()}`, total, isCurrent: i === 0 });
                }
                const maxVal = Math.max(...weeks.map(w => w.total), 1);
                weeks.forEach(w => {
                    const pct = Math.max((w.total / maxVal) * 100, w.total > 0 ? 4 : 1);
                    const barColor = w.isCurrent ? 'bg-[#007AFF]' : 'bg-[rgba(142,142,147,0.3)]';
                    trendBarsHtml += `
                        <div class="flex-1 flex flex-col items-center gap-1.5">
                            <div class="w-full bg-[rgba(60,60,67,0.06)] rounded-full h-24 flex flex-col justify-end p-0.5 overflow-hidden">
                                <div class="${barColor} w-full rounded-full transition-all duration-300" style="height: ${pct}%;"></div>
                            </div>
                            <div class="text-[9px] font-bold text-gray-400">${w.label}</div>
                        </div>
                    `;
                });
            } else {
                const months = [];
                for (let i = 11; i >= 0; i--) {
                    const mStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
                    const mEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
                    const cappedEnd = mEnd > today ? today : mEnd;
                    const total = sumInRange(mStart, cappedEnd);
                    months.push({ label: `${mStart.getMonth() + 1}月`, total, isCurrent: i === 0 });
                }
                const maxVal = Math.max(...months.map(m => m.total), 1);
                months.forEach(m => {
                    const pct = Math.max((m.total / maxVal) * 100, m.total > 0 ? 4 : 1);
                    const barColor = m.isCurrent ? 'bg-[#007AFF]' : 'bg-[rgba(142,142,147,0.3)]';
                    trendBarsHtml += `
                        <div class="flex-1 flex flex-col items-center gap-1.5">
                            <div class="w-full bg-[rgba(60,60,67,0.06)] rounded-full h-24 flex flex-col justify-end p-0.5 overflow-hidden">
                                <div class="${barColor} w-full rounded-full transition-all duration-300" style="height: ${pct}%;"></div>
                            </div>
                            <div class="text-[9px] font-bold text-gray-400">${m.label}</div>
                        </div>
                    `;
                });
            }

            // ---------- ⑤ カテゴリー別増減ランキング（対 直近数ヶ月平均） ----------
            const categoryCurrentTotal = {};
            const categoryBaselineTotal = {};
            let baselineStartForCat = prevMonthsStart;
            if (firstEverDate && firstEverDate > baselineStartForCat) baselineStartForCat = new Date(firstEverDate);
            const baselineStartForCatStr = toDateStr(baselineStartForCat);
            const prevMonthsEndStr = toDateStr(prevMonthsEnd);
            const baselineDaysForCat = Math.max(1, Math.round((prevMonthsEnd - baselineStartForCat) / 86400000) + 1);
            const baselineMonthsCountForCat = baselineDaysForCat / 30.4;
            const hasBaselineRange = baselineStartForCat <= prevMonthsEnd;

            statsTxns.forEach(t => {
                if (t.date >= monthStartStr && t.date <= todayStr) {
                    categoryCurrentTotal[t.categoryId] = (categoryCurrentTotal[t.categoryId] || 0) + t.amount;
                }
                if (hasBaselineRange && t.date >= baselineStartForCatStr && t.date <= prevMonthsEndStr) {
                    categoryBaselineTotal[t.categoryId] = (categoryBaselineTotal[t.categoryId] || 0) + t.amount;
                }
            });

            const catIds = new Set([...Object.keys(categoryCurrentTotal), ...Object.keys(categoryBaselineTotal), ...Object.keys(catUpcomingFixed)]);
            const catChanges = [];
            catIds.forEach(catId => {
                const currentTotal = categoryCurrentTotal[catId] || 0;
                const baselineTotal = categoryBaselineTotal[catId] || 0;
                // [修正] 着地予測と同じく、固定費は実額＋予定額、変動費のみ日割りで外挿
                const varPart = catVariableSoFar[catId] || 0;
                const fixedPart = (catFixedSoFar[catId] || 0) + (catUpcomingFixed[catId] || 0);
                const projectedCurrent = daysElapsedThisMonth > 0 ? (varPart / daysElapsedThisMonth) * daysInMonth + fixedPart : 0;
                if (currentTotal === 0 && fixedPart === 0 && baselineTotal === 0) return;
                const baselineMonthlyAvg = baselineTotal / baselineMonthsCountForCat;
                const diffAmount = projectedCurrent - baselineMonthlyAvg;
                if (Math.abs(diffAmount) < 1) return;
                const pct = baselineMonthlyAvg > 0 ? Math.round((diffAmount / baselineMonthlyAvg) * 100) : null;
                const catObj = state.categories.find(c => c.id === catId);
                catChanges.push({ name: catObj ? catObj.name : '未分類', diffAmount, pct });
            });
            catChanges.sort((a, b) => Math.abs(b.diffAmount) - Math.abs(a.diffAmount));
            const topCatChanges = catChanges.slice(0, 3);

            // ---------- ⑥ 平日・週末比較（直近30日・1日あたり） ----------
            let last30Start = new Date(today); last30Start.setDate(today.getDate() - 29);
            if (firstEverDate && firstEverDate > last30Start) last30Start = new Date(firstEverDate);
            const last30StartStr = toDateStr(last30Start);
            let weekdaySum = 0, weekdayDays = 0, weekendSum = 0, weekendDays = 0;
            for (let d = new Date(last30Start); d <= today; d.setDate(d.getDate() + 1)) {
                const isWeekend = (d.getDay() === 0 || d.getDay() === 6);
                if (isWeekend) weekendDays++; else weekdayDays++;
            }
            statsTxns.forEach(t => {
                if (t.date >= last30StartStr && t.date <= todayStr) {
                    const dow = parseDateStr(t.date).getDay();
                    if (dow === 0 || dow === 6) weekendSum += t.amount; else weekdaySum += t.amount;
                }
            });
            const weekdayPerDay = weekdayDays > 0 ? Math.round(weekdaySum / weekdayDays) : 0;
            const weekendPerDay = weekendDays > 0 ? Math.round(weekendSum / weekendDays) : 0;
            const maxWD = Math.max(weekdayPerDay, weekendPerDay, 1);

            // ---------- ⑦ 固定費 vs 変動費（今月） ----------
            let fixedTotal = 0, variableTotal = 0;
            state.transactions.forEach(t => {
                if (t.date >= monthStartStr && t.date <= todayStr) {
                    if (t.isFixed || String(t.id).startsWith('fx_')) fixedTotal += t.amount; else variableTotal += t.amount;
                }
            });
            const grandTotal = fixedTotal + variableTotal;
            const fixedPct = grandTotal > 0 ? Math.round((fixedTotal / grandTotal) * 100) : 0;

            const fixedRatioCardHtml = statsFixedFilter === 'variable' ? '' : `
                <!-- 固定費 vs 変動費 -->
                <div class="bg-white rounded-2xl p-4 mb-6 shadow-sm border border-[rgba(0,0,0,0.03)]">
                    <div class="flex justify-between items-center mb-3">
                        <span class="text-[13px] font-bold text-gray-900">今月の固定費比率</span>
                        <span class="text-[13px] font-extrabold text-gray-900">${fixedPct}%</span>
                    </div>
                    <div class="w-full flex h-3 rounded-full overflow-hidden bg-[rgba(60,60,67,0.08)]">
                        <div class="bg-[#007AFF]" style="width: ${fixedPct}%;"></div>
                        <div class="bg-[rgba(142,142,147,0.4)]" style="width: ${100 - fixedPct}%;"></div>
                    </div>
                    <div class="flex justify-between mt-2 text-[11px] font-semibold text-gray-500">
                        <span>固定費 ¥${fixedTotal.toLocaleString()}</span>
                        <span>変動費 ¥${variableTotal.toLocaleString()}</span>
                    </div>
                </div>
            `;

            // ---------- HTML組み立て ----------
            const catRankingHtml = topCatChanges.length === 0
                ? `<div class="text-[12px] text-gray-400 py-2">比較できるデータがまだありません</div>`
                : topCatChanges.map(c => {
                    const isUp = c.diffAmount > 0;
                    const color = isUp ? 'text-[#FF3B30]' : 'text-[#34C759]';
                    const arrow = isUp ? '↑' : '↓';
                    const pctText = c.pct === null ? '新規' : `${Math.abs(c.pct)}%`;
                    return `
                        <div class="flex justify-between items-center py-2 border-b border-[rgba(60,60,67,0.06)] last:border-b-0">
                            <span class="text-[13px] font-semibold text-gray-800 truncate w-1/2">${escapeHTML(c.name)}</span>
                            <span class="text-[13px] font-bold ${color} shrink-0">${arrow} ¥${Math.abs(Math.round(c.diffAmount)).toLocaleString()} <span class="text-[11px] text-gray-400 font-semibold">(${pctText})</span></span>
                        </div>
                    `;
                }).join('');

            container.innerHTML = `
                <div class="grid grid-cols-2 gap-3 mb-4">
                    <div class="bg-white rounded-2xl p-4 shadow-sm border border-[rgba(0,0,0,0.03)]">
                        <span class="text-[11px] font-semibold text-gray-400">直近7日の1日あたり</span>
                        <div class="text-[24px] font-black text-gray-900 tracking-tight leading-none mt-1.5">¥${Math.round(thisWeek ? thisWeek.perDay : 0).toLocaleString()}</div>
                        ${deltaBadge(thisWeek, prevWeeksBaseline, '対過去平均')}
                    </div>
                    <div class="bg-white rounded-2xl p-4 shadow-sm border border-[rgba(0,0,0,0.03)]">
                        <span class="text-[11px] font-semibold text-gray-400">今月の1日あたり</span>
                        <div class="text-[24px] font-black text-gray-900 tracking-tight leading-none mt-1.5">¥${Math.round(thisMonth ? thisMonth.perDay : 0).toLocaleString()}</div>
                        ${deltaBadge(thisMonth, prevMonthsBaseline, '対過去平均')}
                    </div>
                </div>

                <!-- 今月の着地予測 -->
                <div class="bg-white rounded-2xl p-5 mb-4 shadow-sm border border-[rgba(0,0,0,0.03)]">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-[13px] font-bold text-gray-900">今月の着地予測</span>
                        <span class="text-[11px] font-semibold text-gray-400">${daysElapsedThisMonth}/${daysInMonth}日経過</span>
                    </div>
                    <div class="w-full bg-[rgba(60,60,67,0.08)] rounded-full h-2.5 mb-3 overflow-hidden">
                        <div class="bg-[#007AFF] h-full rounded-full transition-all duration-300" style="width: ${progressPct}%;"></div>
                    </div>
                    <div class="flex items-baseline gap-1.5">
                        <span class="text-[26px] font-black text-gray-900 tracking-tight leading-none">¥${projectedTotal.toLocaleString()}</span>
                        <span class="text-[11px] font-semibold text-gray-400">予測（現在 ¥${(thisMonth ? thisMonth.total : 0).toLocaleString()}）</span>
                    </div>
                    ${pendingThisMonth > 0 ? `<div class="text-[11px] font-semibold text-[#FF3B30] mt-2">※ 金額未定の記録 ${pendingThisMonth}件 は含まれていません</div>` : ''}
                </div>

                <!-- 前月比・前年同月比 -->
                <div class="bg-white rounded-2xl p-5 mb-4 shadow-sm border border-[rgba(0,0,0,0.03)]">
                    <span class="text-[13px] font-bold text-gray-900 mb-3 block">先月・去年との比較（1日あたり）</span>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="bg-[#F2F2F7] rounded-xl p-3">
                            <div class="text-[11px] font-semibold text-gray-500">先月比</div>
                            ${deltaBadge(thisMonth, lastMonthStats, null)}
                        </div>
                        <div class="bg-[#F2F2F7] rounded-xl p-3">
                            <div class="text-[11px] font-semibold text-gray-500">前年同月比</div>
                            ${deltaBadge(thisMonth, lastYearMonthStats, null)}
                        </div>
                    </div>
                </div>

                <!-- 推移グラフ -->
                <div class="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-[rgba(0,0,0,0.03)]">
                    <div class="flex justify-between items-center mb-3">
                        <span class="text-[13px] font-bold text-gray-900">支出の推移</span>
                        <div class="flex bg-[rgba(118,118,128,0.12)] rounded-[7px] p-[2px]">
                            <button onclick="setTrendChartMode('week')" class="px-2.5 py-1 text-[11px] font-semibold rounded-[5px] transition-colors ${trendChartMode === 'week' ? 'bg-white text-black shadow' : 'text-gray-500'}">週</button>
                            <button onclick="setTrendChartMode('month')" class="px-2.5 py-1 text-[11px] font-semibold rounded-[5px] transition-colors ${trendChartMode === 'month' ? 'bg-white text-black shadow' : 'text-gray-500'}">月</button>
                        </div>
                    </div>
                    <div class="flex justify-between items-end gap-1 px-0.5">${trendBarsHtml}</div>
                </div>

                <!-- カテゴリー別増減ランキング -->
                <div class="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-[rgba(0,0,0,0.03)]">
                    <span class="text-[13px] font-bold text-gray-900 mb-2 block">カテゴリー別の変化（対 直近平均）</span>
                    ${catRankingHtml}
                </div>

                <!-- 平日・週末比較 -->
                <div class="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-[rgba(0,0,0,0.03)]">
                    <span class="text-[13px] font-bold text-gray-900 mb-3 block">平日 と 週末（直近30日・1日あたり）</span>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="flex flex-col items-center">
                            <div class="w-full bg-[rgba(60,60,67,0.06)] rounded-full h-20 flex flex-col justify-end p-0.5 overflow-hidden mb-2">
                                <div class="bg-[rgba(142,142,147,0.4)] w-full rounded-full transition-all duration-300" style="height: ${Math.max((weekdayPerDay / maxWD) * 100, weekdayPerDay > 0 ? 4 : 1)}%;"></div>
                            </div>
                            <span class="text-[11px] font-semibold text-gray-500">平日</span>
                            <span class="text-[15px] font-extrabold text-gray-900">¥${weekdayPerDay.toLocaleString()}</span>
                        </div>
                        <div class="flex flex-col items-center">
                            <div class="w-full bg-[rgba(60,60,67,0.06)] rounded-full h-20 flex flex-col justify-end p-0.5 overflow-hidden mb-2">
                                <div class="bg-[#007AFF] w-full rounded-full transition-all duration-300" style="height: ${Math.max((weekendPerDay / maxWD) * 100, weekendPerDay > 0 ? 4 : 1)}%;"></div>
                            </div>
                            <span class="text-[11px] font-semibold text-gray-500">週末</span>
                            <span class="text-[15px] font-extrabold text-gray-900">¥${weekendPerDay.toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                ${fixedRatioCardHtml}
            `;
        }

        function renderStats() {
            const container = document.getElementById('stats-content'); container.innerHTML = '';
            updateStatsFixedFilterUI();

            // ===== Trendタブのレンダリング =====
            if (statsTab === 'trend') {
                renderTrendTab(container);
                return;
            }

            // ===== Shopタブのレンダリング =====
            if (statsTab === 'shop') {
                if (!statsSelectedShopKey) {
                    container.innerHTML = `
                        <div class="py-16 text-center text-gray-400 font-medium flex flex-col items-center">
                            <span class="text-4xl mb-3">🏪</span>
                            <span>上のボタンからお店を選んでください</span>
                        </div>
                    `;
                    return;
                }

                if (statsSelectedShopKey.startsWith('name:')) {
                    // shopId が付く前に選ばれていたお店は ID のキーに切り替える
                    const id = resolveShopIdByName(statsSelectedShopKey.slice(5));
                    if (id && !state.transactions.some(t => shopKeyOf(t) === statsSelectedShopKey)) { statsSelectedShopKey = 'id:' + id; updateStatsShopHeaderUI(); }
                }
                const selectedShopLabel = shopKeyInfo(statsSelectedShopKey).name;
                const shopTxns = state.transactions.filter(t => shopKeyOf(t) === statsSelectedShopKey);
                if (shopTxns.length === 0) {
                    container.innerHTML = `
                        <div class="bg-white rounded-2xl p-6 shadow-sm border border-[rgba(0,0,0,0.03)] text-center">
                            <p class="text-gray-400 text-sm font-medium">このお店の利用履歴はまだありません</p>
                        </div>
                    `;
                    return;
                }

                const totalAmount = shopTxns.reduce((sum, t) => sum + t.amount, 0);
                const count = shopTxns.length;
                const average = Math.round(totalAmount / count);

                // 1. 時間帯集計 (24時間)
                const hourCounts = new Array(24).fill(0);
                // 2. 曜日集計 (0:日 〜 6:土)
                const dayCounts = new Array(7).fill(0);
                const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
                
                // 3. 利用月のユニーク集合（YYYY-MM）
                const uniqueMonths = new Set();

                shopTxns.forEach(t => {
                    // 時間が未設定の取引は「よく使う時間帯」の集計対象から除外する
                    if (!t.timeUnset) {
                        const timeStr = t.time || (t.ts ? formatTimeFromTs(t.ts) : '12:00');
                        const h = parseInt(timeStr.split(':')[0], 10);
                        if (!isNaN(h) && h >= 0 && h < 24) hourCounts[h]++;
                    }

                    if (t.date) {
                        const dObj = parseDateStr(t.date);
                        if (!isNaN(dObj.getTime())) {
                            dayCounts[dObj.getDay()]++;
                            // YYYY-MM を抽出
                            const ym = t.date.substring(0, 7);
                            if (ym) uniqueMonths.add(ym);
                        }
                    }
                });

                // よく使う時間帯 (3時間ブロック)
                let maxBlockCount = -1;
                let popularTimeRange = "未定";
                for (let h = 0; h < 24; h += 3) {
                    const blockCount = hourCounts[h] + (hourCounts[h+1] || 0) + (hourCounts[h+2] || 0);
                    if (blockCount > maxBlockCount && blockCount > 0) {
                        maxBlockCount = blockCount;
                        popularTimeRange = `${h}〜${h + 3}時`;
                    }
                }

                // 柔軟な曜日傾向の判定
                const weekdayCount = dayCounts[1] + dayCounts[2] + dayCounts[3] + dayCounts[4] + dayCounts[5];
                const weekendCount = dayCounts[0] + dayCounts[6];
                
                let maxDayCount = -1;
                let popularDayIndex = 0;
                dayCounts.forEach((cnt, idx) => {
                    if (cnt > maxDayCount) {
                        maxDayCount = cnt;
                        popularDayIndex = idx;
                    }
                });

                let popularDayText = "いつでも";
                if (count <= 2) {
                    popularDayText = maxDayCount > 0 ? `${dayNames[popularDayIndex]}曜日` : "いつでも";
                } else {
                    const topRatio = maxDayCount / count;
                    const weekendRatio = weekendCount / count;
                    const weekdayRatio = weekdayCount / count;

                    // 特定の1曜日が全体の35%以上を占め、突出している場合
                    if (topRatio >= 0.35) {
                        popularDayText = `${dayNames[popularDayIndex]}曜日`;
                    } else if (weekendRatio >= 0.50) {
                        // 土日率が50%以上
                        popularDayText = "土日・休日";
                    } else if (weekdayRatio >= 0.85) {
                        // 平日率が85%以上
                        popularDayText = "平日中心";
                    } else {
                        popularDayText = "いつでも";
                    }
                }

                // 月平均・日平均利用額の算出（そのお店の初回利用日からの経過日数ベース）
                const sortedDates = shopTxns.map(t => t.date).filter(Boolean).sort();
                let monthsCount = 1;
                if (sortedDates.length > 0) {
                    const firstDate = parseDateStr(sortedDates[0]);
                    firstDate.setHours(0, 0, 0, 0);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    if (!isNaN(firstDate.getTime())) {
                        const elapsedDays = Math.round((today - firstDate) / (1000 * 60 * 60 * 24));
                        monthsCount = Math.max(1, elapsedDays / 30.4);
                    }
                }
                const monthsCountText = monthsCount.toFixed(1);
                const monthlySpent = Math.round(totalAmount / monthsCount);
                const monthlySpentText = `¥${monthlySpent.toLocaleString()}`;
                // 日平均は「月平均 ÷ 30.4」で算出（月平均の値と常に整合する）
                const dailySpent = Math.round(monthlySpent / 30.4);
                const dailySpentText = `¥${dailySpent.toLocaleString()}`;
                
                let frequencyText = "";
                if (monthsCount > 1) {
                    const perMonth = (count / monthsCount).toFixed(1);
                    frequencyText = `月 ${parseFloat(perMonth)}回`;
                } else {
                    frequencyText = `計 ${count}回`;
                }

                // 曜日分布ミニバー
                const maxDayVal = Math.max(...dayCounts, 1);
                let dayBarsHtml = '';
                dayNames.forEach((dName, idx) => {
                    const cnt = dayCounts[idx];
                    const pct = Math.max((cnt / maxDayVal) * 100, cnt > 0 ? 8 : 2);
                    const isTopDay = (idx === popularDayIndex && maxDayCount > 0 && popularDayText.includes('曜日'));
                    const labelColor = (idx === 0) ? 'text-[#FF3B30]' : (idx === 6 ? 'text-[#007AFF]' : 'text-gray-500');
                    const barColor = isTopDay ? 'bg-[#007AFF]' : 'bg-[rgba(142,142,147,0.25)]';
                    
                    dayBarsHtml += `
                        <div class="flex-1 flex flex-col items-center gap-1.5">
                            <div class="text-[10px] font-bold ${labelColor}">${dName}</div>
                            <div class="w-full bg-[rgba(60,60,67,0.06)] rounded-full h-16 flex flex-col justify-end p-0.5 overflow-hidden">
                                <div class="${barColor} w-full rounded-full transition-all duration-300" style="height: ${pct}%;"></div>
                            </div>
                            <div class="text-[11px] font-extrabold text-gray-800">${cnt}</div>
                        </div>
                    `;
                });

                // 直近の利用履歴リスト
                const recentTxns = [...shopTxns].sort((a,b) => (b.date !== a.date ? (b.date > a.date ? 1 : -1) : (b.ts || 0) - (a.ts || 0))).slice(0, 4);
                let recentHistoryHtml = '';
                recentTxns.forEach(t => {
                    recentHistoryHtml += `
                        <div class="flex justify-between items-center py-2.5 border-b border-[rgba(60,60,67,0.06)] last:border-b-0 text-sm">
                            <div class="flex items-center gap-2">
                                <span class="text-xs text-gray-400 font-semibold">${escapeHTML(t.date)}</span>
                                <span class="text-xs text-gray-500">${t.timeUnset ? '時間未設定' : escapeHTML(t.time || '')}</span>
                            </div>
                            <span class="font-bold text-gray-900">¥${t.amount.toLocaleString()}</span>
                        </div>
                    `;
                });

                container.innerHTML = `
                    <!-- メインサマリーカード（月平均利用額を大きく主役に配置） -->
                    <div class="bg-white rounded-2xl p-5 mb-4 shadow-sm border border-[rgba(0,0,0,0.03)]">
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-[18px] font-extrabold text-gray-900 truncate tracking-tight">${escapeHTML(selectedShopLabel)}</span>
                            <span class="text-[12px] font-semibold text-gray-400">平均月額</span>
                        </div>

                        <!-- 月額メイン数字 -->
                        <div class="flex items-baseline gap-1.5 my-2">
                            <span class="text-[38px] font-black text-[#007AFF] tracking-tight leading-none">${monthlySpentText}</span>
                            <span class="text-[15px] font-extrabold text-gray-400">/ 月</span>
                        </div>
                        <div class="text-[13px] font-bold text-gray-400 -mt-1 mb-2">(${dailySpentText} / 日)</div>

                        <!-- 通算情報サブ行 -->
                        <div class="text-[12.5px] font-semibold text-gray-500 mb-4 flex items-center gap-1.5">
                            <span class="inline-block w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                            通算支出: <span class="font-bold text-gray-700">¥${totalAmount.toLocaleString()}</span> （全 ${count}回 / ${monthsCountText}ヶ月間）
                        </div>

                        <!-- 2×2 グリッド指標 -->
                        <div class="grid grid-cols-2 gap-2.5 pt-3 border-t border-[rgba(60,60,67,0.08)]">
                            <div class="bg-[#F2F2F7] rounded-xl p-3 flex flex-col justify-center">
                                <span class="text-[11px] font-semibold text-gray-500 tracking-wide">よく行く曜日</span>
                                <span class="text-[17px] font-extrabold text-gray-900 mt-0.5">${popularDayText}</span>
                            </div>
                            <div class="bg-[#F2F2F7] rounded-xl p-3 flex flex-col justify-center">
                                <span class="text-[11px] font-semibold text-gray-500 tracking-wide">よく使う時間</span>
                                <span class="text-[17px] font-extrabold text-gray-900 mt-0.5">${popularTimeRange}</span>
                            </div>
                            <div class="bg-[#F2F2F7] rounded-xl p-3 flex flex-col justify-center">
                                <span class="text-[11px] font-semibold text-gray-500 tracking-wide">利用ペース</span>
                                <span class="text-[17px] font-extrabold text-gray-900 mt-0.5">${frequencyText}</span>
                            </div>
                            <div class="bg-[#F2F2F7] rounded-xl p-3 flex flex-col justify-center">
                                <span class="text-[11px] font-semibold text-gray-500 tracking-wide">平均単価</span>
                                <span class="text-[17px] font-extrabold text-gray-900 mt-0.5">¥${average.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    <!-- 曜日別の利用傾向 -->
                    <div class="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-[rgba(0,0,0,0.03)]">
                        <div class="flex justify-between items-center mb-3">
                            <h3 class="text-[13px] font-bold text-gray-900 tracking-wide">曜日別の利用回数</h3>
                            <span class="text-[11px] text-[#007AFF] font-bold">${popularDayText}</span>
                        </div>
                        <div class="flex justify-between items-end gap-1 px-1">${dayBarsHtml}</div>
                    </div>

                    <!-- 直近の利用履歴 -->
                    <div class="bg-white rounded-2xl p-4 mb-6 shadow-sm border border-[rgba(0,0,0,0.03)]">
                        <h3 class="text-[13px] font-bold text-gray-900 mb-1.5 tracking-wide">直近の利用</h3>
                        <div class="flex flex-col">${recentHistoryHtml}</div>
                    </div>
                `;
                return;
            }

            // ===== Monthly / Yearly タブのレンダリング =====
            const statsTxnsForPeriod = getStatsTxns();
            const target = new Date(statsCurrentDate); const y = target.getFullYear(); const m = target.getMonth();
            let filtered = []; let periodLabel = ''; let periodStart, periodEnd;
            if (statsTab === 'monthly') {
                const monthPrefix = `${y}-${String(m+1).padStart(2,'0')}`; filtered = statsTxnsForPeriod.filter(t => t.date.startsWith(monthPrefix)); periodLabel = `${y}年${m+1}月`;
                periodStart = new Date(y, m, 1); periodEnd = new Date(y, m + 1, 0);
            } else {
                const yearPrefix = `${y}-`; filtered = statsTxnsForPeriod.filter(t => t.date.startsWith(yearPrefix)); periodLabel = `${y}年`;
                periodStart = new Date(y, 0, 1); periodEnd = new Date(y, 11, 31);
            }
            periodStart.setHours(0, 0, 0, 0); periodEnd.setHours(0, 0, 0, 0);
            document.getElementById('lbl-stats-period').textContent = periodLabel;
            let total = 0; const catMap = {}; const payMap = {}; const shopAmtMap = {}; const shopCntMap = {};
            filtered.forEach(t => {
                total += t.amount; catMap[t.categoryId] = (catMap[t.categoryId] || 0) + t.amount; payMap[t.paymentId] = (payMap[t.paymentId] || 0) + t.amount;
                const shopName = shopLabelForStats(t); shopAmtMap[shopName] = (shopAmtMap[shopName] || 0) + t.amount; shopCntMap[shopName] = (shopCntMap[shopName] || 0) + 1;
            });
            document.getElementById('lbl-stats-total').textContent = total.toLocaleString();
            const pendingEl = document.getElementById('lbl-stats-pending');
            if (pendingEl) {
                const pendingCount = filtered.filter(t => t.isPending || t.amount === 0).length;
                pendingEl.textContent = pendingCount > 0 ? `※ 金額未定の記録 ${pendingCount}件 は含まれていません` : '';
                pendingEl.classList.toggle('hidden', pendingCount === 0);
            }

            // 1日あたりの金額：表示中の期間（月 or 年）の開始日と、家計簿全体の初回入力日のうち「遅い方」を起点とし、
            // 今日と期間末のうち「早い方」までの経過日数で割る（データが存在しない期間を分母に含めないため）
            const allDatesSorted = state.transactions.map(t => t.date).filter(Boolean).sort();
            let perDayText = '0';
            let elapsedDays = null;
            if (allDatesSorted.length > 0) {
                const firstEverDate = parseDateStr(allDatesSorted[0]); firstEverDate.setHours(0, 0, 0, 0);
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const effectiveStart = firstEverDate > periodStart ? firstEverDate : periodStart;
                const effectiveEnd = today < periodEnd ? today : periodEnd;
                elapsedDays = Math.round((effectiveEnd - effectiveStart) / (1000 * 60 * 60 * 24)) + 1;
                if (elapsedDays > 0) {
                    perDayText = Math.round(total / elapsedDays).toLocaleString();
                }
            }
            document.getElementById('lbl-stats-perday').textContent = perDayText;
            // 回数の「1ヶ月あたり」換算用。分母のミニマムは30.4日（=1ヶ月）とし、それより短い期間で不当に数値が膨らむのを防ぐ
            const monthsCountForFreq = (elapsedDays && elapsedDays > 0) ? Math.max(1, elapsedDays / 30.4) : 1;

            if (total === 0) { container.innerHTML = `<div class="py-10 text-center text-gray-400 font-medium">データがありません</div>`; return; }

            function buildSection(title, mapObj, idResolver, isCount = false, perUnitDivisor = null, perUnitLabel = '') {
                const arr = Object.keys(mapObj).map(id => { let name = id; if (idResolver) { const item = idResolver.find(x => x.id === id); name = item ? item.name : '不明'; } return { name, val: mapObj[id] }; }).sort((a,b) => b.val - a.val);
                if (arr.length === 0) return ''; const maxVal = arr[0].val; const top5 = arr.slice(0, 5);
                let html = `<div class="bg-white rounded-2xl p-4 mb-5 shadow-sm border border-[rgba(0,0,0,0.03)]"><h2 class="text-[15px] font-bold text-gray-900 mb-4">${escapeHTML(title)}</h2><div class="flex flex-col gap-3">`;
                top5.forEach(item => {
                    const pct = Math.max((item.val / maxVal) * 100, 1); const displayVal = isCount ? `${item.val}回` : `¥${item.val.toLocaleString()}`;
                    let rateHtml = '';
                    if (perUnitDivisor && perUnitDivisor > 0) {
                        const rateVal = item.val / perUnitDivisor;
                        const rateText = isCount ? `${rateVal.toFixed(1)}回${perUnitLabel}` : `¥${Math.round(rateVal).toLocaleString()}${perUnitLabel}`;
                        rateHtml = `<div class="text-right text-[13px] font-bold text-gray-500 mt-0.5">${rateText}</div>`;
                    }
                    html += `<div class="flex flex-col"><div class="flex justify-between items-end mb-1"><span class="text-[14px] font-semibold text-gray-800 truncate w-3/5">${escapeHTML(item.name)}</span><span class="text-[16px] font-bold text-gray-900">${displayVal}</span></div><div class="w-full bg-[rgba(60,60,67,0.08)] rounded-full h-[6px]"><div class="bg-[#007AFF] h-[6px] rounded-full transition-all duration-500" style="width: ${pct}%"></div></div>${rateHtml}</div>`;
                });
                html += `</div>`; if (arr.length > 5) {
                    // [修正] データを onclick 文字列に埋め込まない（店名に ' が含まれると壊れる・スクリプト注入の恐れがあるため）
                    const key = statsDetailRegistry.push({ title, arr, isCount, perUnitDivisor: perUnitDivisor || null, perUnitLabel }) - 1;
                    html += `<button type="button" data-stats-detail="${key}" class="w-full mt-4 py-2.5 bg-gray-50 text-[#007AFF] font-bold text-[14px] rounded-xl active:bg-gray-100">すべて見る</button>`; }
                html += `</div>`; return html;
            }
            statsDetailRegistry = [];
            container.innerHTML = buildSection('カテゴリー別', catMap, state.categories, false, elapsedDays, '/日')
                + buildSection('支払い方法別', payMap, state.paymentMethods, false, elapsedDays, '/日')
                + buildSection('お店別 (金額)', shopAmtMap, null, false, elapsedDays, '/日')
                + buildSection('お店別 (利用回数)', shopCntMap, null, true, monthsCountForFreq, '/月');
            container.querySelectorAll('[data-stats-detail]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const entry = statsDetailRegistry[Number(btn.getAttribute('data-stats-detail'))];
                    if (entry) openStatsDetail(entry.title, entry.arr, entry.isCount, entry.perUnitDivisor, entry.perUnitLabel);
                });
            });
        }
        let statsDetailRegistry = [];

        window.openStatsDetail = (title, arrOrStr, isCount, perUnitDivisor = null, perUnitLabel = '') => {
            const arr = Array.isArray(arrOrStr) ? arrOrStr : JSON.parse(decodeURIComponent(arrOrStr)); document.getElementById('title-stats-detail').textContent = title; const list = document.getElementById('list-stats-detail'); list.innerHTML = '';
            const maxVal = arr[0].val; const totalVal = arr.reduce((sum, item) => sum + item.val, 0);
            arr.forEach(item => {
                const pct = Math.max((item.val / maxVal) * 100, 1); const share = Math.round((item.val / totalVal) * 100); const displayVal = isCount ? `${item.val}回` : `¥${item.val.toLocaleString()}`;
                let rateHtml = '';
                if (perUnitDivisor && perUnitDivisor > 0) {
                    const rateVal = item.val / perUnitDivisor;
                    const rateText = isCount ? `${rateVal.toFixed(1)}回${perUnitLabel}` : `¥${Math.round(rateVal).toLocaleString()}${perUnitLabel}`;
                    rateHtml = `<div class="text-right text-[13px] font-bold text-gray-500 mt-0.5">${rateText}</div>`;
                }
                const div = document.createElement('div'); div.className = "ios-item flex-col items-stretch py-3 px-0 border-none bg-transparent mb-1";
                div.innerHTML = `<div class="flex justify-between items-center mb-1.5"><span class="font-medium text-[15px] text-gray-900 truncate w-1/2">${escapeHTML(item.name)}</span><div class="text-right"><span class="font-bold text-[15px] text-gray-900">${displayVal}</span><span class="text-[11px] text-gray-400 ml-1 inline-block w-8 text-right">${share}%</span></div></div><div class="w-full bg-[rgba(60,60,67,0.08)] rounded-full h-[6px]"><div class="bg-[#007AFF] h-full rounded-full" style="width: ${pct}%"></div></div>${rateHtml}`;
                list.appendChild(div);
            });
            document.getElementById('modal-stats-detail').classList.add('active');
        };

        function renderFixedExpenses() {
            const list = document.getElementById('list-fixed-expenses'); list.innerHTML = '';
            if (!state.fixedExpenses || state.fixedExpenses.length === 0) { list.innerHTML = `<div class="py-10 text-center text-gray-400 font-medium text-[14px]">登録された定期支出はありません</div>`; return; }
            const sorted = [...state.fixedExpenses].sort((a,b) => a.day - b.day); const containerDiv = document.createElement('div'); containerDiv.className = 'ios-list shadow-sm';
            sorted.forEach(fe => {
                const cls = state.shopClasses.find(c => c.id === fe.classId) || { icon: '📦' }; const div = document.createElement('div'); div.className = 'ios-item clickable cursor-pointer'; div.onclick = () => openFixedEditor(fe.id);
                const isPending = Boolean(fe.isPending || fe.amount === 0);
                const amtLabel = isPending ? '<span class="text-[#FF3B30] font-bold text-[17px]">未定</span>' : `¥${Number(fe.amount).toLocaleString()}`;
                
                div.innerHTML = `<div class="flex items-center gap-3 w-2/3"><div class="flex flex-col items-center justify-center w-[46px] shrink-0 bg-[#F2F2F7] rounded-lg py-1.5"><span class="text-[10px] text-gray-500 font-bold uppercase leading-none">毎月</span><span class="text-[16px] font-bold text-gray-900 leading-none mt-1">${escapeHTML(fe.day)}日</span></div><div class="flex flex-col overflow-hidden w-full pl-1"><span class="font-bold text-gray-900 truncate tracking-tight text-[16px]">${escapeHTML(fe.name)}</span><span class="text-[11px] text-gray-500 mt-0.5 truncate">${escapeHTML(cls.icon)} ${escapeHTML(fe.shopName || 'お店未指定')}</span></div></div><div class="flex flex-col items-end shrink-0"><span class="font-bold text-[18px] text-gray-900 tracking-tight">${amtLabel}</span></div>`;
                containerDiv.appendChild(div);
            });
            list.appendChild(containerDiv);
        }

        window.openFixedEditor = (id = null) => {
            editingFixedId = id; 
            document.getElementById('title-fixed-editor').textContent = id ? '定期支出の編集' : '新しい定期支出';
            populateSelect('fx-class', state.shopClasses, null); 
            populateSelect('fx-cat', state.categories, null); 
            populateSelect('fx-pay', state.paymentMethods, null);
            const delBox = document.getElementById('box-delete-fixed');
            
            if (id && typeof id === 'string') {
                delBox.classList.remove('hidden'); delBox.classList.add('block'); const s = state.fixedExpenses.find(x => x.id === id);
                if(s) { 
                    document.getElementById('fx-name').value = s.name; 
                    const isPending = Boolean(s.isPending || s.amount === 0);
                    document.getElementById('fx-is-pending').checked = isPending;
                    toggleFixedPending(isPending);
                    document.getElementById('fx-amount').value = isPending ? "" : s.amount;
                    document.getElementById('fx-day').value = s.day;
                    document.getElementById('fx-class').value = s.classId; updateShopSelect('fx-class','fx-shop', shopDisplayName(s));
                    document.getElementById('fx-cat').value = s.categoryId; document.getElementById('fx-pay').value = s.paymentId; document.getElementById('fx-memo').value = s.memo || '';
                    setFixedEditorIsFixed(s.isFixed === false ? false : true);
                }
            } else {
                editingFixedId = null; delBox.classList.add('hidden'); delBox.classList.remove('block');
                document.getElementById('fx-name').value = "";
                document.getElementById('fx-is-pending').checked = false;
                toggleFixedPending(false);
                document.getElementById('fx-amount').value = "";
                document.getElementById('fx-day').value = "1";
                document.getElementById('fx-memo').value = "";
                setFixedEditorIsFixed(true);
                if(state.shopClasses.length > 0) document.getElementById('fx-class').value = state.shopClasses[0].id; 
                if(state.categories.length > 0) document.getElementById('fx-cat').value = state.categories[0].id; 
                if(state.paymentMethods.length > 0) document.getElementById('fx-pay').value = state.paymentMethods[0].id;
                updateShopSelect('fx-class','fx-shop', '');
            }
            document.getElementById('modal-fixed-editor').classList.add('active');
        };

        window.setFixedEditorIsFixed = (val) => {
            currentFixedEditorIsFixed = val;
            const btnVar = document.getElementById('btn-fx-variable');
            const btnFix = document.getElementById('btn-fx-fixed');
            btnVar.className = `px-4 py-1.5 rounded-full text-[13px] font-bold transition-colors ${!val ? 'bg-[#007AFF] text-white' : 'bg-gray-100 text-gray-400'}`;
            btnFix.className = `px-4 py-1.5 rounded-full text-[13px] font-bold transition-colors ${val ? 'bg-[#007AFF] text-white' : 'bg-gray-100 text-gray-400'}`;
        };

        window.toggleFixedPending = (isPending) => {
            const rowAmt = document.getElementById('row-fx-amount');
            const amtInp = document.getElementById('fx-amount');
            if (isPending) {
                rowAmt.style.opacity = '0.35';
                amtInp.disabled = true;
                amtInp.placeholder = '未定';
            } else {
                rowAmt.style.opacity = '1';
                amtInp.disabled = false;
                amtInp.placeholder = '80000';
            }
        };

        window.saveFixedEditor = () => {
            const name = document.getElementById('fx-name').value.trim(); 
            const isPending = document.getElementById('fx-is-pending').checked;
            let amt = parseInt(document.getElementById('fx-amount').value, 10); 
            const day = parseInt(document.getElementById('fx-day').value, 10);

            if (!name) { showAlert("登録名を入力してください"); return; }
            if (!isPending && (isNaN(amt) || amt <= 0)) { 
                showAlert("金額を入力するか、「金額は未定」にチェックを入れてください"); 
                return; 
            }
            if (isPending) amt = 0;
            if (isNaN(day) || day < 1 || day > 31) { showAlert("日付は1日〜31日の間で入力してください"); return; }
            
            const shopNameVal = document.getElementById('fx-shop').value;
            const newFE = { 
                id: editingFixedId || generateId(), 
                name: name, 
                amount: amt,
                isPending: isPending,
                day: day,
                classId: document.getElementById('fx-class').value,
                categoryId: document.getElementById('fx-cat').value,
                shopName: shopNameVal === 'ADD_NEW' ? '' : shopNameVal,
                shopId: pickShopIdForSave(shopNameVal, document.getElementById('fx-class').value, editingFixedId ? state.fixedExpenses.find(x => x.id === editingFixedId) : null),
                paymentId: document.getElementById('fx-pay').value,
                memo: document.getElementById('fx-memo').value.trim(),
                isFixed: currentFixedEditorIsFixed
            };
            if (editingFixedId) { 
                const idx = state.fixedExpenses.findIndex(x => x.id === editingFixedId); 
                if (idx > -1) {
                    // 最終実行日は引き継ぐ（消すと過去分が再生成される恐れがあるため）
                    if (state.fixedExpenses[idx].lastRunDate) newFE.lastRunDate = state.fixedExpenses[idx].lastRunDate;
                    state.fixedExpenses[idx] = newFE;
                }
            } else { 
                // [修正] 登録した日が「毎月の追加日」と同じ場合、今日の分も追加されるようにする
                const y = new Date(); y.setDate(y.getDate() - 1);
                newFE.lastRunDate = toDateStr(y);
                state.fixedExpenses.push(newFE); 
            }
            saveData(); closeModal('modal-fixed-editor');
            processFixedExpenses();
            renderFixedExpenses();
        };

        window.deleteFixedExpense = () => { showConfirm("この定期支出を削除しますか？", () => { removeWithUndo('fixedExpenses', editingFixedId, '定期支出を削除しました'); closeModal('modal-fixed-editor'); renderFixedExpenses(); }); };

        window.manualAddFixed = () => {
            const name = document.getElementById('fx-name').value.trim(); 
            const isPending = document.getElementById('fx-is-pending').checked;
            let amt = parseInt(document.getElementById('fx-amount').value, 10); 
            const classId = document.getElementById('fx-class').value; 
            const catId = document.getElementById('fx-cat').value; 
            const shopName = document.getElementById('fx-shop').value; 
            const paymentId = document.getElementById('fx-pay').value; 
            const memo = document.getElementById('fx-memo').value.trim();

            if (!name) { showAlert("登録名を入力してください"); return; }
            if (!isPending && (isNaN(amt) || amt <= 0)) { showAlert("金額を入力するか「金額は未定」にチェックしてください"); return; }
            if (isPending) amt = 0;

            const d = new Date(); const defaultDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            showDatePrompt(defaultDate, (selectedDate) => {
                if(!selectedDate) return;
                state.transactions.push({ 
                    id: generateId(), 
                    amount: amt, 
                    isPending: isPending,
                    date: selectedDate, 
                    time: "09:00", 
                    classId: classId, 
                    categoryId: catId, 
                    shopName: shopName === 'ADD_NEW' ? '' : shopName, 
                    shopId: pickShopIdForSave(shopName, classId, editingFixedId ? state.fixedExpenses.find(x => x.id === editingFixedId) : null),
                    paymentId: paymentId,
                    memo: memo || (isPending ? '定期支出 (金額未定)' : '定期支出'),
                    isFixed: currentFixedEditorIsFixed,
                    ts: new Date(`${selectedDate}T09:00:00`).getTime() || Date.now()
                });
                saveData(); showAlert(`${selectedDate} に追加しました`); closeModal('modal-fixed-editor'); renderFixedExpenses();
            });
        };

        /* ==================== 時間帯設定（朝・昼・夜） ==================== */
        window.openTimeSlotModal = (id = null) => {
            editingTimeSlotId = id;
            document.getElementById('title-timeslot-editor').textContent = id ? '時間帯の編集' : '新しい時間帯';
            const delBox = document.getElementById('box-delete-timeslot');

            if (id && typeof id === 'string') {
                delBox.classList.remove('hidden');
                const slot = state.timeSlots.find(x => x.id === id);
                if (slot) {
                    document.getElementById('ed-ts-name').value = slot.name;
                    document.getElementById('ed-ts-time').value = slot.time;
                }
            } else {
                editingTimeSlotId = null;
                delBox.classList.add('hidden');
                document.getElementById('ed-ts-name').value = "";
                document.getElementById('ed-ts-time').value = "12:00";
            }
            document.getElementById('modal-timeslot-editor').classList.add('active');
        };

        window.saveTimeSlotEditor = () => {
            const name = document.getElementById('ed-ts-name').value.trim();
            const time = document.getElementById('ed-ts-time').value;
            if (!name) { showAlert("時間帯の名称を入力してください (例: 朝、昼、夜)"); return; }
            if (!time) { showAlert("時刻を指定してください"); return; }

            const newSlot = { id: editingTimeSlotId || generateId(), name, time };
            if (editingTimeSlotId) {
                const idx = state.timeSlots.findIndex(x => x.id === editingTimeSlotId);
                if (idx > -1) state.timeSlots[idx] = newSlot;
            } else {
                state.timeSlots.push(newSlot);
            }
            saveData();
            closeModal('modal-timeslot-editor');
            renderPanelLists();
            const curTime = document.getElementById('inp-time').value || "12:00";
            renderTimePills(curTime, true);
        };

        window.deleteTimeSlot = () => {
            if (state.timeSlots.length <= 1) {
                showAlert("少なくとも1つの時間帯が必要です。");
                return;
            }
            showConfirm("この時間帯を削除しますか？", () => {
                removeWithUndo('timeSlots', editingTimeSlotId, '時間帯を削除しました');
                closeModal('modal-timeslot-editor');
                renderPanelLists();
                const curTime = document.getElementById('inp-time').value || "12:00";
                renderTimePills(curTime, true);
            });
        };

        /* ==================== クイック時間ピッカー設定 ==================== */
        window.openQuickTimeModal = (id = null) => {
            editingQuickTimeId = id;
            document.getElementById('title-quicktime-editor').textContent = id ? '時刻の編集' : '時刻の追加';
            const delBox = document.getElementById('box-delete-quicktime');

            if (id && typeof id === 'string') {
                delBox.classList.remove('hidden');
                const qt = state.quickTimes.find(x => x.id === id);
                if (qt) {
                    document.getElementById('ed-qt-time').value = qt.time;
                }
            } else {
                editingQuickTimeId = null;
                delBox.classList.add('hidden');
                document.getElementById('ed-qt-time').value = "12:00";
            }
            document.getElementById('modal-quicktime-editor').classList.add('active');
        };

        window.saveQuickTimeEditor = () => {
            const time = document.getElementById('ed-qt-time').value;
            if (!time) { showAlert("時刻を指定してください"); return; }

            const newQT = { id: editingQuickTimeId || generateId(), time };
            if (editingQuickTimeId) {
                const idx = state.quickTimes.findIndex(x => x.id === editingQuickTimeId);
                if (idx > -1) state.quickTimes[idx] = newQT;
            } else {
                state.quickTimes.push(newQT);
            }
            saveData();
            closeModal('modal-quicktime-editor');
            renderPanelLists();
        };

        window.deleteQuickTime = () => {
            if (state.quickTimes.length <= 1) {
                showAlert("リストには少なくとも1つの時刻が必要です。");
                return;
            }
            showConfirm("この時刻をピッカー候補から削除しますか？", () => {
                removeWithUndo('quickTimes', editingQuickTimeId, '時刻を削除しました');
                closeModal('modal-quicktime-editor');
                renderPanelLists();
            });
        };

        let sortables = {};
        const DELETE_ICON_SVG = '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>';
        const hasSortable = () => typeof Sortable !== 'undefined';

        // [修正] ID を onclick 文字列に埋め込まず、addEventListener で処理する（不正なIDによるスクリプト実行を防ぐ）
        function buildRowElement(item, innerHTML, onClick, onDelete, extraRowClass = '') {
            const div = document.createElement('div'); div.className = 'ios-item px-0'; div.setAttribute('data-id', item.id);
            div.innerHTML = `<div class="flex-1 flex items-center overflow-hidden pl-4 py-1 ${extraRowClass}"><button type="button" aria-label="削除" class="text-[#FF3B30] mr-4 shrink-0 active:opacity-50 p-1">${DELETE_ICON_SVG}</button>${innerHTML}</div><div class="drag-handle shrink-0 w-12">≡</div>`;
            const body = div.firstElementChild;
            if (onClick) body.addEventListener('click', () => onClick(item.id));
            body.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); onDelete(item.id); });
            return div;
        }

        function buildSortableList(containerId, arrayName, formatHTML, onItemClick) {
            const list = document.getElementById(containerId); list.innerHTML = '';
            state[arrayName].forEach(item => {
                list.appendChild(buildRowElement(item, formatHTML(item), onItemClick, id => deleteItem(arrayName, id), 'cursor-pointer'));
            });
            if(sortables[containerId]) { sortables[containerId].destroy(); delete sortables[containerId]; }
            if (!hasSortable()) return; // 並び替えライブラリが読めない場合も一覧自体は表示する
            sortables[containerId] = new Sortable(list, { 
                handle: '.drag-handle', 
                animation: 150, 
                ghostClass: 'opacity-50', 
                onEnd: function (evt) { 
                    if (evt.oldIndex === evt.newIndex) return;
                    const item = state[arrayName].splice(evt.oldIndex, 1)[0]; 
                    state[arrayName].splice(evt.newIndex, 0, item); 
                    saveData(); 
                    if(arrayName === 'shortcuts') renderShortcuts(); 
                    if(arrayName === 'timeSlots') { 
                        const curTime = document.getElementById('inp-time').value || '12:00'; 
                        renderTimePills(curTime, true); 
                    } 
                } 
            });
        }

        function renderGroupedShopsList() {
            const container = document.getElementById('list-set-shops-container'); container.innerHTML = ''; shopSortables.forEach(s => s.destroy()); shopSortables = [];
            // [修正] 削除された分類に属していたお店も「未分類」として表示し、編集・移動・削除できるようにする
            const classIds = new Set(state.shopClasses.map(c => c.id));
            const groups = state.shopClasses.map(cls => ({ id: cls.id, label: cls.icon + ' ' + cls.name, shops: state.shops.filter(s => s.classId === cls.id) }));
            const orphanShops = state.shops.filter(s => !classIds.has(s.classId));
            if (orphanShops.length > 0) groups.push({ id: '', label: '📦 未分類（分類が削除されたお店）', shops: orphanShops, isOrphan: true });

            groups.forEach(group => {
                const header = document.createElement('h3'); header.className = "text-[12px] font-semibold text-gray-500 mb-1 mt-6 ml-2 tracking-wider"; header.textContent = group.label; container.appendChild(header);
                const listDiv = document.createElement('div'); listDiv.className = "ios-list mb-0 pb-1 pt-1 min-h-[40px] rounded-[12px]"; listDiv.style.backgroundColor = 'var(--ios-card)'; listDiv.setAttribute('data-class-id', group.id);
                if (group.shops.length === 0) { const empty = document.createElement('div'); empty.className = 'empty-zone'; empty.textContent = 'ドラッグして追加'; listDiv.appendChild(empty); }
                group.shops.forEach(shop => {
                    listDiv.appendChild(buildRowElement(shop, `<span class="font-medium truncate text-gray-900">${escapeHTML(shop.name)}</span>`, id => openShopEditor(id), id => deleteItem('shops', id)));
                });
                container.appendChild(listDiv);
                if (!hasSortable()) return;
                const sortable = new Sortable(listDiv, {
                    group: group.isOrphan ? { name: 'sharedShops', put: false } : 'sharedShops', handle: '.drag-handle', animation: 150, ghostClass: 'opacity-50',
                    onStart: function(evt) { document.querySelectorAll('.empty-zone').forEach(el => el.style.display = 'none'); },
                    onEnd: function(evt) {
                        const shopObj = state.shops.find(s => s.id === evt.item.getAttribute('data-id'));
                        const toClassId = evt.to.getAttribute('data-class-id');
                        if (shopObj && toClassId) shopObj.classId = toClassId;
                        const newShopsOrder = []; const seenIds = new Set();
                        document.querySelectorAll('#list-set-shops-container .ios-item').forEach(el => { const sObj = state.shops.find(s => s.id === el.getAttribute('data-id')); if(sObj && !seenIds.has(sObj.id)) { newShopsOrder.push(sObj); seenIds.add(sObj.id); } });
                        state.shops.forEach(s => { if (!seenIds.has(s.id)) newShopsOrder.push(s); });
                        state.shops = newShopsOrder; saveData(); renderGroupedShopsList();
                    }
                });
                shopSortables.push(sortable);
            });
        }

        window.deleteItem = (arrayName, id) => {
            // [修正] 一覧の⊖ボタンからも「最低1つ必要」のチェックを行う
            if (arrayName === 'timeSlots' && state.timeSlots.length <= 1) { showAlert("少なくとも1つの時間帯が必要です。"); return; }
            if (arrayName === 'quickTimes' && state.quickTimes.length <= 1) { showAlert("リストには少なくとも1つの時刻が必要です。"); return; }
            // [修正] 使用中の項目を消すときは影響を伝える
            let msg = "削除しますか？";
            if (arrayName === 'shopClasses') {
                const n = state.shops.filter(s => s.classId === id).length;
                if (n > 0) msg = `この分類には ${n}件 のお店があります。削除すると、それらのお店は「未分類」に移動します（お店リストから別の分類へドラッグできます）。削除しますか？`;
            } else if (arrayName === 'categories') {
                const n = state.transactions.filter(t => t.categoryId === id).length;
                if (n > 0) msg = `このカテゴリーは ${n}件 の記録で使われています。削除すると、それらの記録のカテゴリーは「不明」と表示されます。削除しますか？`;
            } else if (arrayName === 'paymentMethods') {
                const n = state.transactions.filter(t => t.paymentId === id).length;
                if (n > 0) msg = `この支払い方法は ${n}件 の記録で使われています。削除すると、それらの記録の支払い方法は「不明」と表示されます。削除しますか？`;
            }
            const undoLabels = { shops: 'お店を削除しました', shopClasses: '分類を削除しました', categories: 'カテゴリーを削除しました', paymentMethods: '支払い方法を削除しました', shortcuts: 'クイック入力を削除しました', timeSlots: '時間帯を削除しました', quickTimes: '時刻を削除しました' };
            showConfirm(msg, () => { 
                removeWithUndo(arrayName, id, undoLabels[arrayName] || '削除しました'); 
                renderPanelLists(); 
                if(arrayName === 'shortcuts') renderShortcuts(); 
                if(arrayName === 'timeSlots') { 
                    const curTime = document.getElementById('inp-time').value || '12:00'; 
                    renderTimePills(curTime, true); 
                } 
            });
        };

        window.renameItem = (arrayName, id) => {
            const item = state[arrayName].find(i=>i.id===id); if(!item) return; showPrompt(arrayName === 'shopClasses' ? "分類とアイコン (例: 🍽️外食)" : "新しい名前", arrayName === 'shopClasses' ? (item.icon + ' ' + item.name) : item.name, val => { if(val) { if(arrayName === 'shopClasses') { let icon = '📦'; let name = val; const match = val.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(.*)$/u); if(match){ icon = match[1]; name = match[2].trim(); } else { name = val.trim(); } item.icon = icon; item.name = name; } else { item.name = val.trim(); } saveData(); renderPanelLists(); } });
        };
        window.addItem = (arrayName, promptTitle) => { showPrompt(promptTitle, "", val => { if(val) { if(arrayName === 'shopClasses') { let icon = '📦'; let name = val; const match = val.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(.*)$/u); if(match){ icon = match[1]; name = match[2].trim(); } else { name = val.trim(); } state[arrayName].push({id: generateId(), name: name, icon: icon}); } else { state[arrayName].push({id: generateId(), name: val.trim()}); } saveData(); renderPanelLists(); } }); };

        function renderPanelLists() {
            buildSortableList('list-set-time-slots', 'timeSlots', i => `<div class="flex items-center justify-between w-full pr-2"><span class="font-medium text-gray-900">${escapeHTML(i.name)}</span><span class="text-[#007AFF] font-bold text-[15px]">${escapeHTML(i.time)}</span></div>`, id => openTimeSlotModal(id));
            buildSortableList('list-set-quick-times', 'quickTimes', i => `<div class="flex items-center justify-between w-full pr-2"><span class="font-medium text-gray-900 tracking-wide">${escapeHTML(i.time)}</span><span class="text-xs text-gray-400">タップで変更</span></div>`, id => openQuickTimeModal(id));
            buildSortableList('list-set-payments', 'paymentMethods', i => `<span class="font-medium truncate text-gray-900">${escapeHTML(i.name)}</span>`, id => renameItem('paymentMethods', id));
            buildSortableList('list-set-categories', 'categories', i => `<span class="font-medium truncate text-gray-900">${escapeHTML(i.name)}</span>`, id => renameItem('categories', id));
            buildSortableList('list-set-classes', 'shopClasses', i => `<span class="font-medium truncate text-[17px] text-gray-900"><span class="text-xl mr-2">${escapeHTML(i.icon)}</span>${escapeHTML(i.name)}</span>`, id => renameItem('shopClasses', id));
            buildSortableList('list-set-shortcuts', 'shortcuts', i => `<div class="flex flex-col"><span class="font-medium text-gray-900 truncate">${escapeHTML(i.name)} <span class="text-[#007AFF] text-sm ml-1">${i.amount ? '¥'+Number(i.amount).toLocaleString() : ''}</span></span><span class="text-[11px] text-gray-500">${escapeHTML(i.shopName || 'お店指定なし')}</span></div>`, id => openShortcutEditor(id));
            renderGroupedShopsList();
        }

        window.openShopEditor = (id = null, fromFlow = false) => {
            isFlowFromInput = fromFlow; editingShopId = id; document.getElementById('title-shop-editor').textContent = id ? 'お店の編集' : '新しいお店の登録'; populateSelect('ed-shop-class', state.shopClasses, null); populateSelect('ed-shop-cat', state.categories, null); populateSelect('ed-shop-pay', state.paymentMethods, null);
            if (id && typeof id === 'string') { const s = state.shops.find(x => x.id === id); if(s) { document.getElementById('ed-shop-name').value = s.name; document.getElementById('ed-shop-class').value = s.classId; document.getElementById('ed-shop-cat').value = s.categoryId; document.getElementById('ed-shop-pay').value = s.paymentId; document.getElementById('ed-shop-memo').value = s.memo || ''; } } 
            else { editingShopId = null; document.getElementById('ed-shop-name').value = ""; document.getElementById('ed-shop-memo').value = ""; if(state.shopClasses.length > 0) document.getElementById('ed-shop-class').value = state.shopClasses[0].id; if(state.categories.length > 0) document.getElementById('ed-shop-cat').value = state.categories[0].id; if(state.paymentMethods.length > 0) document.getElementById('ed-shop-pay').value = state.paymentMethods[0].id; if (fromFlow && activeClassId) document.getElementById('ed-shop-class').value = activeClassId; }
            document.getElementById('modal-shop-editor').classList.add('active');
        };

        window.saveShopEditor = () => {
            const name = document.getElementById('ed-shop-name').value.trim(); 
            if (!name) { showAlert("店名を入力してください"); return; }
            const newShop = { id: editingShopId || generateId(), name: name, classId: document.getElementById('ed-shop-class').value, categoryId: document.getElementById('ed-shop-cat').value, paymentId: document.getElementById('ed-shop-pay').value, memo: document.getElementById('ed-shop-memo').value.trim() };
            let renamedCount = 0;
            if (editingShopId) {
                const idx = state.shops.findIndex(x => x.id === editingShopId);
                if (idx > -1) {
                    const oldShop = state.shops[idx];
                    if (oldShop.name !== newShop.name) renamedCount = propagateShopRename(oldShop, newShop.name);
                    state.shops[idx] = newShop;
                }
            } else { state.shops.push(newShop); }
            saveData(); closeModal('modal-shop-editor'); renderPanelLists();
            if (renamedCount > 0) showAlert(`過去の記録など ${renamedCount}件 のお店の名前も「${newShop.name}」に更新しました。`);
            if (isFlowFromInput) { isFlowFromInput = false; openDetailModal(newShop); }
        };

        // [修正] お店の名前を変えたとき、過去の記録・定期支出・クイック入力のお店名も追従させる
        //   （記録はお店を名前で参照しているため。同じ名前のお店が他の分類にもある場合は分類も一致するものだけ）
        function propagateShopRename(oldShop, newName) {
            const sameNameOthers = state.shops.some(s => s.id !== oldShop.id && s.name === oldShop.name);
            // v2.3: shopId で紐付いているものは確実に、ID の無い古いデータは名前（＋分類）で判定する
            const matches = x => x && (x.shopId ? x.shopId === oldShop.id : (x.shopName === oldShop.name && (!sameNameOthers || x.classId === oldShop.classId)));
            let count = 0;
            ['transactions', 'fixedExpenses', 'shortcuts'].forEach(key => {
                (state[key] || []).forEach(x => { if (matches(x)) { x.shopName = newName; x.shopId = oldShop.id; count++; } });
            });
            if (statsSelectedShopKey === 'name:' + oldShop.name) statsSelectedShopKey = 'id:' + oldShop.id;
            return count;
        }

        window.openShortcutEditor = (id = null) => {
            editingShortcutId = id; document.getElementById('title-shortcut-editor').textContent = (id && typeof id === 'string') ? 'クイック入力の編集' : '新しいクイック入力'; populateSelect('sh-class', state.shopClasses, null); populateSelect('sh-cat', state.categories, null); populateSelect('sh-pay', state.paymentMethods, null);
            if (id && typeof id === 'string') { 
                const s = state.shortcuts.find(x => x.id === id); 
                if(s) { 
                    document.getElementById('sh-name').value = s.name; 
                    document.getElementById('sh-amount').value = s.amount || ''; 
                    document.getElementById('sh-class').value = s.classId; updateShopSelect('sh-class','sh-shop', shopDisplayName(s));
                    document.getElementById('sh-cat').value = s.categoryId; document.getElementById('sh-pay').value = s.paymentId; document.getElementById('sh-memo').value = s.memo || '';
                    setShortcutIsFixed(Boolean(s.isFixed));
                }
            }
            else {
                editingShortcutId = null; document.getElementById('sh-name').value = ""; document.getElementById('sh-amount').value = ""; document.getElementById('sh-memo').value = "";
                if(state.shopClasses.length > 0) document.getElementById('sh-class').value = state.shopClasses[0].id;
                if(state.categories.length > 0) document.getElementById('sh-cat').value = state.categories[0].id;
                if(state.paymentMethods.length > 0) document.getElementById('sh-pay').value = state.paymentMethods[0].id;
                updateShopSelect('sh-class','sh-shop', '');
                setShortcutIsFixed(false);
            }
            document.getElementById('modal-shortcut-editor').classList.add('active');
        };

        window.saveShortcutEditor = () => {
            const name = document.getElementById('sh-name').value.trim();
            const amtStr = document.getElementById('sh-amount').value;
            const amt = amtStr ? parseInt(amtStr, 10) : null;

            if (!name) { showAlert("登録名を入力してください"); return; }
            if (amt !== null && (isNaN(amt) || amt <= 0)) { showAlert("金額は1円以上で入力してください"); return; }

            const shopNameVal = document.getElementById('sh-shop').value;
            const newSC = { id: editingShortcutId || generateId(), name: name, amount: amt, classId: document.getElementById('sh-class').value, categoryId: document.getElementById('sh-cat').value, shopName: shopNameVal === 'ADD_NEW' ? '' : shopNameVal, shopId: pickShopIdForSave(shopNameVal, document.getElementById('sh-class').value, editingShortcutId ? state.shortcuts.find(x => x.id === editingShortcutId) : null), paymentId: document.getElementById('sh-pay').value, memo: document.getElementById('sh-memo').value.trim(), isFixed: currentShortcutIsFixed };
            if (editingShortcutId) { const idx = state.shortcuts.findIndex(x => x.id === editingShortcutId); if(idx > -1) state.shortcuts[idx] = newSC; } else { state.shortcuts.push(newSC); } saveData(); closeModal('modal-shortcut-editor'); renderPanelLists(); renderShortcuts();
        };

        /* ==================== Firebase クラウド同期 ==================== */
        // ※ Firestore 上のデータ構造（users/{uid}/{コレクション名}/{id}）は旧バージョンと完全に同じです。
        //   新しいコレクションやフィールドは作りません（セキュリティルールの変更も不要）。
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
        // 「この端末がクラウドに存在すると確認したID」の記録（端末内のみ。サーバーには保存しない）
        const SYNC_META_KEY = 'premium_tracker_syncmeta_v1';

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
        function buildJsonMap(arr) {
            return new Map((arr || []).filter(x => x && x.id).map(item => [item.id, stableStringify(item)]));
        }
        // Firestore は undefined を含むとエラーになるため、JSON を経由して除去する
        function toFirestoreData(item) { return JSON.parse(JSON.stringify(item)); }

        let collRefs = {};
        let lastSyncedMaps = {};
        SYNCED_COLLECTIONS.forEach(name => { lastSyncedMaps[name] = new Map(); });
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

        function loadSyncMeta() {
            try {
                const raw = localStorage.getItem(SYNC_META_KEY);
                if (!raw) return null;
                const m = JSON.parse(raw);
                if (!m || typeof m.uid !== 'string' || !m.ids || typeof m.ids !== 'object') return null;
                return m;
            } catch (e) { return null; }
        }
        function persistSyncMeta() {
            if (!currentUid) return;
            try {
                const ids = {};
                SYNCED_COLLECTIONS.forEach(name => { ids[name] = Array.from(lastSyncedMaps[name].keys()); });
                localStorage.setItem(SYNC_META_KEY, JSON.stringify({ uid: currentUid, ids }));
            } catch (e) { console.warn('sync meta save failed', e); }
        }
        function saveLocalOnly() {
            try { localStorage.setItem('premium_tracker_v18', JSON.stringify(state)); }
            catch (err) { console.error("Local sync write error:", err); }
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

        function diffCollectionOps(name, ops) {
            const localArr = withOrder(state[name] || [], name).filter(x => x && x.id);
            const currentMap = new Map();
            const lastMap = lastSyncedMaps[name];
            localArr.forEach(item => {
                const json = stableStringify(item);
                currentMap.set(item.id, json);
                if (lastMap.get(item.id) !== json) ops.push({ type: 'set', ref: collRefs[name].doc(item.id), data: toFirestoreData(item) });
            });
            lastMap.forEach((json, id) => {
                if (!currentMap.has(id)) ops.push({ type: 'delete', ref: collRefs[name].doc(id) });
            });
            return currentMap;
        }

        async function commitOpsInChunks(ops) {
            for (let i = 0; i < ops.length; i += MAX_BATCH_OPS) {
                const batch = db.batch();
                ops.slice(i, i + MAX_BATCH_OPS).forEach(op => {
                    if (op.type === 'set') batch.set(op.ref, op.data); else batch.delete(op.ref);
                });
                await batch.commit();
            }
        }

        async function doSyncNow() {
            clearTimeout(syncDebounceTimer); syncDebounceTimer = null;
            if (!cloudReady || !collRefs.transactions) return;
            const myToken = bootstrapToken;
            localDirty = false;
            syncInFlight++;
            try {
                const ops = [];
                const newMaps = {};
                SYNCED_COLLECTIONS.forEach(name => { newMaps[name] = diffCollectionOps(name, ops); });
                if (ops.length > 0) await commitOpsInChunks(ops);
                if (myToken !== bootstrapToken) return;
                SYNCED_COLLECTIONS.forEach(name => { lastSyncedMaps[name] = newMaps[name]; });
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

        // [修正] 未送信のローカル変更がある間に他端末の更新が届いた場合、ローカル変更を消さずに統合する
        //  - ローカルで変更・追加・削除した項目 → ローカルを優先
        //  - ローカルで触っていない項目 → リモートの内容を採用（削除も反映）
        function mergeRemoteWithLocal(name, remoteArr, baseMap) {
            const localArr = state[name] || [];
            const localOrdered = withOrder(localArr, name);
            const localMap = new Map(localOrdered.filter(x => x && x.id).map(i => [i.id, stableStringify(i)]));
            const localChanged = id => localMap.get(id) !== baseMap.get(id);
            let anyLocalChange = false;
            localMap.forEach((_, id) => { if (localChanged(id)) anyLocalChange = true; });
            baseMap.forEach((_, id) => { if (!localMap.has(id)) anyLocalChange = true; });
            if (!anyLocalChange) return remoteArr;

            const remoteMap = new Map(remoteArr.map(i => [i.id, i]));
            const result = [];
            const seen = new Set();
            localArr.forEach(item => {
                if (!item || !item.id) return;
                seen.add(item.id);
                if (localChanged(item.id)) result.push(item);
                else if (remoteMap.has(item.id)) result.push(remoteMap.get(item.id));
                // ローカル未変更 かつ リモートで削除 → 捨てる
            });
            remoteArr.forEach(item => {
                if (seen.has(item.id)) return;
                const locallyDeleted = baseMap.has(item.id) && !localMap.has(item.id);
                if (!locallyDeleted) result.push(item);
            });
            return result;
        }

        function detachRealtimeListeners() {
            snapshotUnsubs.forEach(unsub => { try { unsub(); } catch (e) {} });
            snapshotUnsubs = [];
        }

        // [v2.5] リアルタイム監視（コレクションごと）
        //   起動時の全件読み込み（get）をやめ、この監視の最初の結果で初期化する。
        //   以前は「get で全件」＋「監視の開始でもう一度全件」と、起動のたびに全件を2回読んでいた。
        let listenerState = {};   // name -> { latest: 最新の結果, used: state に反映済みの結果 }
        let bootWaiter = null;    // 初期化が最初の結果を待っている間だけ存在する
        const INITIAL_SERVER_WAIT_MS = 10000; // サーバーの応答を待つ最長時間（超えたら端末内のコピーで始める）

        function attachRealtimeListeners(myToken) {
            detachRealtimeListeners();
            listenerState = {};
            SYNCED_COLLECTIONS.forEach(name => {
                const ls = listenerState[name] = { latest: null, used: null };
                // includeMetadataChanges: オフライン起動後に電波が戻ったとき、
                //   データに変化がなくても「サーバーで確認できた」ことを受け取るため（読み取り回数は増えない）
                const unsub = collRefs[name].onSnapshot({ includeMetadataChanges: true }, snap => {
                    if (myToken !== bootstrapToken) return;
                    ls.latest = snap;
                    // 初期化中は結果を溜めておき、初期化の統合処理に使う
                    if (!cloudReady) { if (bootWaiter) bootWaiter.check(); return; }
                    applySnapshot(name, snap, false);
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

        // 監視の結果を state に反映する（force: 差分の有無にかかわらず反映する）
        function applySnapshot(name, snap, force) {
            const ls = listenerState[name];
            const fromCache = Boolean(snap.metadata && snap.metadata.fromCache);
            // 状態情報だけの変化（送信完了・オンライン復帰など）は、データを読み直さない
            const contentChanged = force || snap.docChanges().length > 0;
            if (ls) ls.used = snap;
            if (contentChanged) {
                let arr = [];
                snap.forEach(d => arr.push(d.data()));
                if (ORDERED_COLLECTIONS.has(name)) arr = sortByOrder(arr);
                const baseMap = lastSyncedMaps[name];
                const hasPendingLocal = localDirty || syncInFlight > 0;
                const nextArr = hasPendingLocal ? mergeRemoteWithLocal(name, arr, baseMap) : arr;
                lastSyncedMaps[name] = buildJsonMap(arr);
                state[name] = nextArr;
                ensureMinimumSettings();
                saveLocalOnly();
                persistSyncMeta();
                refreshCurrentView();
                if (hasPendingLocal && !syncDebounceTimer && syncInFlight === 0) syncToCloud();
            }
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
        //     （このときは削除の判定と定期支出の自動追加を行わない ＝ 従来の get と同じ安全側の扱い）
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

        async function bootstrapCloudSync(uid) {
            const myToken = ++bootstrapToken;
            if (bootWaiter) bootWaiter.check(); // 前の初期化の待機を終わらせる
            detachRealtimeListeners();
            cloudReady = false;
            currentUid = uid;
            serverConfirmed = new Set();
            collRefs = {};
            SYNCED_COLLECTIONS.forEach(name => { collRefs[name] = db.collection('users').doc(uid).collection(name); });

            // [v2.5] get() で全件を読むのをやめ、リアルタイム監視の最初の結果を使う（読み取り回数が約半分になる）
            attachRealtimeListeners(myToken);
            try {
                await waitForInitialSnapshots(myToken);
            } catch (e) {
                if (myToken === bootstrapToken) detachRealtimeListeners();
                throw e;
            }
            if (myToken !== bootstrapToken) return;
            const snaps = {};
            SYNCED_COLLECTIONS.forEach(name => {
                snaps[name] = listenerState[name].latest;
                listenerState[name].used = snaps[name];
            });

            // この端末の同期記録（前回どのアカウントで、どのIDがクラウドにあったか）
            const meta = loadSyncMeta();
            const sameAccount = Boolean(meta && meta.uid === uid);
            const otherAccount = Boolean(meta && meta.uid !== uid);
            const anyFromCache = SYNCED_COLLECTIONS.some(name => snaps[name].metadata && snaps[name].metadata.fromCache);
            SYNCED_COLLECTIONS.forEach(name => { if (!(snaps[name].metadata && snaps[name].metadata.fromCache)) serverConfirmed.add(name); });
            const remoteTotallyEmpty = SYNCED_COLLECTIONS.every(name => snaps[name].empty);
            // キャッシュからの読み込み（オフライン）や、クラウドが丸ごと空の場合は「リモートで削除された」と判断しない（安全側）
            const canPrune = sameAccount && !anyFromCache && !remoteTotallyEmpty;

            const ops = [];
            SYNCED_COLLECTIONS.forEach(name => {
                let remoteItems = snaps[name].docs.map(d => d.data());
                if (ORDERED_COLLECTIONS.has(name)) remoteItems = sortByOrder(remoteItems);
                const remoteIds = new Set(remoteItems.map(x => x.id));
                const knownIds = new Set((meta && meta.ids && Array.isArray(meta.ids[name])) ? meta.ids[name] : []);

                let localOnly = (state[name] || []).filter(x => x && x.id && !remoteIds.has(x.id));
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
                    localOnly = merged;
                }

                if (localOnly.length > 0 && ORDERED_COLLECTIONS.has(name)) {
                    merged = withOrder(merged, name);
                    merged.forEach(item => ops.push({ type: 'set', coll: name, ref: collRefs[name].doc(item.id), data: toFirestoreData(item) }));
                } else {
                    localOnly.forEach(item => ops.push({ type: 'set', coll: name, ref: collRefs[name].doc(item.id), data: toFirestoreData(item) }));
                }

                state[name] = merged;
                lastSyncedMaps[name] = buildJsonMap(merged);
            });
            ensureMinimumSettings();

            if (ops.length > 0) {
                if (!anyFromCache) {
                    await commitOpsInChunks(ops);
                } else {
                    // [v2.5] オフライン（キャッシュ）で始めたときは、送信の完了（＝電波の回復）を待たずに使い始める。
                    //   送信は Firestore が電波の回復後に行う。失敗したら未送信に戻して送り直す。
                    commitOpsInChunks(ops).catch(e => {
                        console.error('初期化時の送信エラー:', e);
                        if (myToken !== bootstrapToken) return;
                        ops.forEach(op => { if (op.coll && lastSyncedMaps[op.coll]) lastSyncedMaps[op.coll].delete(op.ref.id); });
                        localDirty = true; syncFailed = true;
                        if (isPermissionError(e)) { handlePermissionDenied(); return; }
                        scheduleSyncRecovery();
                        setSyncBadge('error', e.message);
                    });
                }
            }
            if (myToken !== bootstrapToken) return;

            saveLocalOnly();
            persistSyncMeta();
            cloudReady = true;
            pendingBootstrapUid = null;
            // 初期化の間に届いた新しい結果（自分の送信の反映・他の端末の変更）を反映する
            SYNCED_COLLECTIONS.forEach(name => {
                const ls = listenerState[name];
                if (ls && ls.latest && ls.latest !== ls.used) applySnapshot(name, ls.latest, true);
            });
            refreshCurrentView();
            setSyncBadge(isServerConfirmed() ? 'ok' : 'offline');
            // 初期化中に入力された変更があれば送る
            syncToCloud();
            // サーバーから読めていれば、定期支出の自動追加を許可する（キャッシュだけのときは保留）
            onServerConfirmationProgress();
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

        // アプリ起動
        initData();
        if (!firebaseAvailable) allowFixedProcessing();
        updateAmount();
        updateFilterButtonsUI();

        attachSwipeForView('cal-content', () => shiftDate(1), () => shiftDate(-1));
        attachSwipeForView('stats-content', () => shiftStatsDate(1), () => shiftStatsDate(-1));

        switchView('main', 'input');

        // [追加] オフライン起動用の Service Worker と、端末内データの削除防止のお願い
        if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service Worker 登録失敗', err));
            });
        }
        if (navigator.storage && typeof navigator.storage.persist === 'function') {
            navigator.storage.persisted().then(p => { if (!p) return navigator.storage.persist(); }).catch(() => {});
        }
