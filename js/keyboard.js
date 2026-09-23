/* 家計簿アプリ v2.9 — js/keyboard.js（9/10）
 * キーボード操作（Tab・Enter・Esc・数字キー）
 * index.html で core → storage → ui → input → history → stats → settings → sync → keyboard → main の順に読み込む。
 * 関数や変数はファイルをまたいで共有する（読み込み時にすぐ実行する処理は、それより前のファイルの関数だけを使う）。
 */
/* ==================== キーボード操作（v2.8） ====================
 * Mac などキーボードで使うときのための対応。タッチ操作の動きは変えない。
 *  ・div で作られた押せる部品（下部メニュー、分類、クイック入力、一覧の行など）を Tab で選べるようにし、
 *    Enter / スペースで押せるようにする
 *  ・開いていない画面（右から出る設定画面・下から出る入力画面など）には Tab で入らないようにする。
 *    入力画面やダイアログが開いている間は、その中だけを Tab で移動する
 *  ・Esc で一番手前の画面・ダイアログを閉じる
 *  ・金額入力の画面では、数字キー・Backspace・C・Enter（お店を選ぶ）で入力できる
 */
const KB_CLICKABLE = '.kb-clickable, .nav-link, .class-btn, .shortcut-card, .ios-item.clickable, .shop-picker-card, .filter-pill, .time-pill, .time-grid-btn, .sort-icon-btn, .today-icon-btn, [onclick]';
const KB_NATIVE = 'button, a[href], input, select, textarea, label, summary';
const KB_LAYERS = '.slide-panel, .modal-sheet, .action-sheet, .overlay';
let kbUsingKeyboard = false;
const kbReturnFocus = new Map();

function kbEnhance(root) {
    (root || document).querySelectorAll(KB_CLICKABLE).forEach(el => {
        if (el.matches(KB_NATIVE) || el.matches('.action-sheet-backdrop, .overlay, .modal-sheet, .slide-panel')) return;
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
        if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    });
}
function kbZ(el) { const z = parseInt(getComputedStyle(el).zIndex, 10); return isNaN(z) ? 0 : z; }
function kbActiveLayers() {
    return Array.from(document.querySelectorAll(KB_LAYERS)).filter(el => el.classList.contains('active'));
}
// 一番手前の画面（z-index が大きい順、同じなら後に書かれたもの）
function kbTopLayer(filterFn) {
    const layers = kbActiveLayers().filter(filterFn || (() => true));
    let top = null;
    layers.forEach(el => { if (!top || kbZ(el) >= kbZ(top)) top = el; });
    return top;
}
// 開いていない画面・手前の画面の後ろにある部分には、Tab で入らないようにする（inert）
function kbSyncInert() {
    const container = document.querySelector('.app-container');
    if (!container) return;
    const layers = Array.from(document.querySelectorAll(KB_LAYERS));
    const modalTop = kbTopLayer(el => !el.classList.contains('slide-panel'));
    layers.forEach(el => { el.inert = !el.classList.contains('active') || Boolean(modalTop && el !== modalTop); });
    Array.from(container.children).forEach(ch => {
        if (ch.matches(KB_LAYERS) || ch.classList.contains('action-sheet-backdrop') || ch.id === 'undo-toast') return;
        ch.inert = Boolean(modalTop);
    });
    // 「元に戻す」は表示されている間だけ選べる
    const toast = document.getElementById('undo-toast');
    if (toast) toast.inert = !toast.classList.contains('active');
}
function kbFocusFirst(layer) {
    const cand = layer.querySelector('[autofocus], input:not([type=hidden]):not([disabled]), select, textarea, button, [tabindex="0"]');
    if (cand && typeof cand.focus === 'function') cand.focus({ preventScroll: true });
}
function kbOnLayerChange(el) {
    const nowActive = el.classList.contains('active');
    if (nowActive && !kbReturnFocus.has(el)) {
        kbReturnFocus.set(el, document.activeElement);
        if (kbUsingKeyboard) setTimeout(() => { if (el.classList.contains('active')) kbFocusFirst(el); }, 60);
    } else if (!nowActive && kbReturnFocus.has(el)) {
        const back = kbReturnFocus.get(el);
        kbReturnFocus.delete(el);
        if (kbUsingKeyboard && back && document.contains(back) && typeof back.focus === 'function') setTimeout(() => { try { back.focus({ preventScroll: true }); } catch (e) {} }, 60);
    }
}
function kbCloseTop() {
    const top = kbTopLayer();
    if (!top) return false;
    if (top.id === 'custom-alert') { top.classList.remove('active'); return true; }
    if (top.id === 'custom-confirm') { closeCustomConfirm(false); return true; }
    if (top.id === 'custom-prompt') { closeCustomPrompt(false); return true; }
    if (top.id === 'custom-date-prompt') { closeDatePrompt(false); return true; }
    if (top.classList.contains('action-sheet')) {
        const backdrop = top.previousElementSibling;
        if (backdrop && backdrop.classList.contains('action-sheet-backdrop')) backdrop.click(); else top.classList.remove('active');
        return true;
    }
    // 入力画面・設定画面は「キャンセル」「戻る」と同じ操作で閉じる
    const cancel = Array.from(top.querySelectorAll('button, [role=button]')).find(b => /^(キャンセル|閉じる)$/.test((b.textContent || '').trim()) || /^(戻る|閉じる)$/.test(b.getAttribute('aria-label') || ''));
    if (cancel) { cancel.click(); return true; }
    if (top.classList.contains('slide-panel')) { closePanel(top.id); return true; }
    closeModal(top.id);
    return true;
}
function kbNumpadActive() {
    const main = document.getElementById('view-main');
    if (!main || !main.classList.contains('active') || currentTranslate !== 0) return false;
    return kbActiveLayers().length === 0;
}

document.addEventListener('pointerdown', () => { kbUsingKeyboard = false; }, true);
document.addEventListener('keydown', e => {
    if (e.key === 'Tab') kbUsingKeyboard = true;
    if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    const inField = t && t.matches && t.matches('input, select, textarea, [contenteditable="true"]');
    // div で作った部品を Enter / スペースで押す
    if ((e.key === 'Enter' || e.key === ' ') && t && t.getAttribute && t.getAttribute('role') === 'button' && !t.matches(KB_NATIVE)) {
        e.preventDefault(); kbUsingKeyboard = true; t.click(); return;
    }
    if (e.key === 'Escape') { if (kbCloseTop()) { e.preventDefault(); kbUsingKeyboard = true; } return; }
    // 金額入力（テンキー・数字キー）
    if (!inField && kbNumpadActive()) {
        if (/^[0-9]$/.test(e.key)) { e.preventDefault(); handleNumInput(e.key); return; }
        if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); handleNumInput('BACK'); return; }
        if (e.key === 'c' || e.key === 'C') { e.preventDefault(); handleNumInput('C'); return; }
        if (e.key === 'Enter' && !(t && t.matches && t.matches(KB_NATIVE + ', [role=button]'))) { e.preventDefault(); proceedToClassSelect(); return; }
    }
});

(function kbInit() {
    kbEnhance(document);
    kbSyncInert();
    let pending = false;
    const mo = new MutationObserver(records => {
        records.forEach(r => { if (r.type === 'attributes' && r.target.matches && r.target.matches(KB_LAYERS)) kbOnLayerChange(r.target); });
        if (pending) return;
        pending = true;
        const run = () => { pending = false; kbEnhance(document); kbSyncInert(); };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 0);
    });
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
})();
