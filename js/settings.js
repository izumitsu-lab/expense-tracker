/* 家計簿アプリ v2.9 — js/settings.js（7/10）
 * 定期支出・設定の各画面（時間帯・クイック時刻・お店・分類・カテゴリー・支払い方法・クイック入力）
 * index.html で core → storage → ui → input → history → stats → settings → sync → keyboard → main の順に読み込む。
 * 関数や変数はファイルをまたいで共有する（読み込み時にすぐ実行する処理は、それより前のファイルの関数だけを使う）。
 */
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
    renderFixedToggle('btn-fx-variable', 'btn-fx-fixed', val);
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
        shopName: shopNameVal,
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

    const defaultDate = toDateStr(new Date());
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
            shopName: shopName, 
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
    if (onClick) { body.classList.add('kb-clickable'); body.addEventListener('click', () => onClick(item.id)); }
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
    // [v2.7] 同じ分類に同じ名前のお店を作らない（記録がどちらのお店か分からなくなるため）
    const classIdVal = document.getElementById('ed-shop-class').value;
    const dup = state.shops.find(x => x.id !== editingShopId && x.classId === classIdVal && (x.name || '').trim() === name);
    if (dup) {
        const cls = state.shopClasses.find(c => c.id === classIdVal);
        showAlert(`「${cls ? cls.name : 'この分類'}」には同じ名前のお店「${name}」がすでにあります。別の名前にしてください。`);
        return;
    }
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
    const newSC = { id: editingShortcutId || generateId(), name: name, amount: amt, classId: document.getElementById('sh-class').value, categoryId: document.getElementById('sh-cat').value, shopName: shopNameVal, shopId: pickShopIdForSave(shopNameVal, document.getElementById('sh-class').value, editingShortcutId ? state.shortcuts.find(x => x.id === editingShortcutId) : null), paymentId: document.getElementById('sh-pay').value, memo: document.getElementById('sh-memo').value.trim(), isFixed: currentShortcutIsFixed };
    if (editingShortcutId) { const idx = state.shortcuts.findIndex(x => x.id === editingShortcutId); if(idx > -1) state.shortcuts[idx] = newSC; } else { state.shortcuts.push(newSC); } saveData(); closeModal('modal-shortcut-editor'); renderPanelLists(); renderShortcuts();
};
