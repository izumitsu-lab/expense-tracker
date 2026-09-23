/* 家計簿アプリ v2.8 — js/ui.js（3/10）
 * ダイアログ・画面の切り替え・スワイプ・CSV/JSON の書き出しと復元
 * index.html で core → storage → ui → input → history → stats → settings → sync → keyboard → main の順に読み込む。
 * 関数や変数はファイルをまたいで共有する（読み込み時にすぐ実行する処理は、それより前のファイルの関数だけを使う）。
 */
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
        // 金額入力（main）は下部メニューに無いので、どれも選択状態にしない
        const isActive = target !== 'main' && btn.getAttribute('data-target') === target;
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
        switchView(e.currentTarget.getAttribute('data-target'));
    });
});

const swipeContainer = document.getElementById('swipe-container');
let startX = 0, startY = 0; let currentTranslate = 0; let isDragging = false; let isSwiping = false; let swipeDirection = null; let dragOffset = 0; let preventClick = false; 

document.addEventListener('click', (e) => { if (preventClick) { e.stopPropagation(); e.preventDefault(); } }, true);

// [v2.8] 2本指（ピンチ操作での拡大）のときは、横スワイプとして扱わない
const activePointers = new Set();
window.addEventListener('pointerup', e => activePointers.delete(e.pointerId));
window.addEventListener('pointercancel', e => activePointers.delete(e.pointerId));
function dragStart(e) {
    activePointers.add(e.pointerId);
    if (activePointers.size > 1) {
        if (isDragging) { isDragging = false; dragOffset = 0; swipeContainer.style.transition = 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)'; swipeContainer.style.transform = `translateX(${currentTranslate}%)`; }
        return;
    }
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
    const el = document.getElementById(elId); let sX = 0, sY = 0, multi = false;
    // [v2.8] 2本指（ピンチ操作での拡大）のときは、日付送りのスワイプとして扱わない
    el.addEventListener('touchstart', e => { if (e.touches.length > 1) { multi = true; return; } multi = false; sX = e.touches[0].clientX; sY = e.touches[0].clientY; }, {passive: true});
    el.addEventListener('touchend', e => { if (multi) { if (e.touches.length === 0) multi = false; return; } const diffX = e.changedTouches[0].clientX - sX; const diffY = e.changedTouches[0].clientY - sY; if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) { if (diffX > 0) onRight(); else onLeft(); } }, {passive: true});
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
        version: "2.7",
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
                // [v2.8] 端末内への保存（IndexedDB）の完了も待ってから再読み込みする
                Promise.resolve(typeof flushSync === 'function' ? flushSync() : null)
                    .catch(err => console.error(err))
                    .then(() => Store.whenIdle())
                    .finally(() => setTimeout(() => location.reload(), 1200));
            } catch(err) { 
                showAlert("復元エラー: " + err.message); 
            } 
        }; 
        reader.readAsText(file); 
    }); 
    event.target.value = ''; 
};
