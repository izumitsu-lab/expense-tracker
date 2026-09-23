/* 家計簿アプリ v2.9 — js/history.js（5/10）
 * 履歴（カレンダー）・検索・絞り込み・並び替え
 * index.html で core → storage → ui → input → history → stats → settings → sync → keyboard → main の順に読み込む。
 * 関数や変数はファイルをまたいで共有する（読み込み時にすぐ実行する処理は、それより前のファイルの関数だけを使う）。
 */
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
        const dateStr = toDateStr(new Date(y, m, d));
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
