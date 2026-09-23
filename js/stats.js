/* 家計簿アプリ v2.9 — js/stats.js（6/10）
 * 分析（Trend / Monthly / Yearly / Shop）
 * index.html で core → storage → ui → input → history → stats → settings → sync → keyboard → main の順に読み込む。
 * 関数や変数はファイルをまたいで共有する（読み込み時にすぐ実行する処理は、それより前のファイルの関数だけを使う）。
 */
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
    // [v2.7] 月の途中から記録を始めた月は、記録を始めた日を起点に日割りする
    //   （「今月の1日あたり」と同じ起点。月初から割ると、記録していない日の分だけ予測が低く出ていた）
    const monthEndDate = new Date(today.getFullYear(), today.getMonth(), daysInMonth);
    const forecastStart = (firstEverDate && firstEverDate > monthStart && firstEverDate <= today) ? firstEverDate : monthStart;
    const forecastElapsedDays = Math.max(1, Math.round((today - forecastStart) / 86400000) + 1);
    const forecastSpanDays = Math.max(forecastElapsedDays, Math.round((monthEndDate - forecastStart) / 86400000) + 1);
    const forecastFromMidMonth = forecastStart > monthStart;
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
    const projectedTotal = thisMonth ? Math.round((monthVariableSoFar / forecastElapsedDays) * forecastSpanDays + monthFixedSoFar + upcomingFixedTotal) : 0;

    // ---------- ③ 前月比・前年同月比（1日あたり） ----------
    const lastMonthEnd = new Date(monthStart); lastMonthEnd.setDate(monthStart.getDate() - 1);
    const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
    const lastMonthStats = periodPerDay(lastMonthStart, lastMonthEnd);

    const lastYearMonthStart = new Date(today.getFullYear() - 1, today.getMonth(), 1);
    const lastYearMonthEnd = new Date(today.getFullYear() - 1, today.getMonth() + 1, 0);
    const lastYearMonthStats = periodPerDay(lastYearMonthStart, lastYearMonthEnd);

    // ---------- ④ 推移グラフ（週次 / 月次） ----------
    // [v2.8] 週ごと・月ごとで同じだった描画コードを1つにまとめた
    const trendPeriods = [];
    if (trendChartMode === 'week') {
        for (let i = 7; i >= 0; i--) {
            const pStart = new Date(weekStart); pStart.setDate(weekStart.getDate() - 7 * i);
            const pEnd = new Date(pStart); pEnd.setDate(pStart.getDate() + 6);
            trendPeriods.push({ start: pStart, end: pEnd, label: `${pStart.getMonth() + 1}/${pStart.getDate()}`, isCurrent: i === 0 });
        }
    } else {
        for (let i = 11; i >= 0; i--) {
            const pStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const pEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
            trendPeriods.push({ start: pStart, end: pEnd, label: `${pStart.getMonth() + 1}月`, isCurrent: i === 0 });
        }
    }
    trendPeriods.forEach(p => { p.total = sumInRange(p.start, p.end > today ? today : p.end); });
    const trendMax = Math.max(...trendPeriods.map(p => p.total), 1);
    let trendBarsHtml = '';
    trendPeriods.forEach(p => {
        const pct = Math.max((p.total / trendMax) * 100, p.total > 0 ? 4 : 1);
        const barColor = p.isCurrent ? 'bg-[#007AFF]' : 'bg-[rgba(142,142,147,0.3)]';
        trendBarsHtml += `
                <div class="flex-1 flex flex-col items-center gap-1.5">
                    <div class="w-full bg-[rgba(60,60,67,0.06)] rounded-full h-24 flex flex-col justify-end p-0.5 overflow-hidden">
                        <div class="${barColor} w-full rounded-full transition-all duration-300" style="height: ${pct}%;"></div>
                    </div>
                    <div class="text-[9px] font-bold text-gray-400">${p.label}</div>
                </div>
            `;
    });

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
        const projectedCurrent = (varPart / forecastElapsedDays) * forecastSpanDays + fixedPart;
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
            ${forecastFromMidMonth ? `<div class="text-[11px] font-semibold text-gray-500 mt-2">※ 記録を始めた ${forecastStart.getMonth() + 1}/${forecastStart.getDate()} からの分で予測しています</div>` : ''}
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
    const arr = Array.isArray(arrOrStr) ? arrOrStr : []; document.getElementById('title-stats-detail').textContent = title; const list = document.getElementById('list-stats-detail'); list.innerHTML = '';
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
