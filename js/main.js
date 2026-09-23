/* 家計簿アプリ v2.9 — js/main.js（10/10）
 * アプリの起動（端末内のデータを読み込んでから画面を表示する）
 * index.html で core → storage → ui → input → history → stats → settings → sync → keyboard → main の順に読み込む。
 * 関数や変数はファイルをまたいで共有する（読み込み時にすぐ実行する処理は、それより前のファイルの関数だけを使う）。
 */
// アプリ起動
startStorage();
attachSwipeForView('cal-content', () => shiftDate(1), () => shiftDate(-1));
attachSwipeForView('stats-content', () => shiftStatsDate(1), () => shiftStatsDate(-1));
storageReady.then(() => {
    if (!firebaseAvailable) allowFixedProcessing();
    updateAmount();
    updateFilterButtonsUI();
    switchView('main', 'input');
    document.documentElement.classList.add('app-ready');
});

// [追加] オフライン起動用の Service Worker と、端末内データの削除防止のお願い
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service Worker 登録失敗', err));
    });
}
if (navigator.storage && typeof navigator.storage.persist === 'function') {
    navigator.storage.persisted().then(p => { if (!p) return navigator.storage.persist(); }).catch(() => {});
}
