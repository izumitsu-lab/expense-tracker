/* 家計簿アプリ v2.9 — js/input.js（4/10）
 * 金額入力・分類とお店の選択・時間の選択・詳細の入力と保存・削除の取り消し（Undo）
 * index.html で core → storage → ui → input → history → stats → settings → sync → keyboard → main の順に読み込む。
 * 関数や変数はファイルをまたいで共有する（読み込み時にすぐ実行する処理は、それより前のファイルの関数だけを使う）。
 */
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
    const todayDate = toDateStr(now);
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
    renderFixedToggle('btn-detail-variable', 'btn-detail-fixed', val);
}
window.setDetailIsFixed = setDetailIsFixed;

function openDetailModal(shopObj = null, txnToEdit = null, shortcutObj = null) {
    closeModal('modal-shops'); closeModal('modal-class-select'); editingTxnId = txnToEdit ? txnToEdit.id : null; const title = document.getElementById('title-detail'); const delBox = document.getElementById('btn-delete-header');
    
    populateSelect('inp-class', state.shopClasses, null); 
    populateSelect('inp-cat', state.categories, null); 
    populateSelect('inp-payment', state.paymentMethods, null);
    
    const now = new Date(); 
    const todayDate = toDateStr(now);
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
        shopName: shopNameVal,
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
    // [v2.7] 既定の支払い方法を更新するのは「新しく入力したとき」だけ（過去の記録の修正では変えない）
    if (!editingTxnId) maybeAutoUpdateShopPayment(newTxn.shopId, newTxn.paymentId);
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
    if (!shopName) return '';
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
const UNDO_MAX_GROUPS = 20;
// [v2.7] 表示中に続けて削除した分は積み重ね、「元に戻す」でまとめて戻す（以前は直前の1件だけ）
let undoEntry = null;   // { groups: [[{ key, item, index }], ...], label }
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
    if (undoEntry && undoEntry.groups.length < UNDO_MAX_GROUPS) {
        undoEntry.groups.push(entries);
    } else {
        undoEntry = { groups: [entries], label };
    }
    clearTimeout(undoTimer);
    const toast = document.getElementById('undo-toast');
    const msg = document.getElementById('undo-msg');
    if (!toast || !msg) return;
    const count = undoEntry.groups.reduce((n, g) => n + g.length, 0);
    msg.textContent = count > 1 ? `${count}件を削除しました` : label;
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
    const keys = new Set();
    // 後に削除したものから順に戻す（それぞれ削除した時点の位置に戻るため、元の並びが再現される）
    undoEntry.groups.slice().reverse().forEach(group => {
        group.slice().sort((a, b) => a.index - b.index).forEach(({ key, item, index }) => {
            const arr = state[key] || (state[key] = []);
            if (arr.some(x => x && x.id === item.id)) return; // 既に戻っている（他端末で再作成など）
            arr.splice(Math.min(index, arr.length), 0, item);
            keys.add(key);
        });
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
