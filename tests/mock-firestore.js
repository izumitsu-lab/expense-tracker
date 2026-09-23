// 家計簿アプリのテスト用：模擬 Firebase（Auth / Firestore）と、jsdom 上でアプリを起動する仕組み
// 模擬 Firestore（差分同期の検証用）
//  - where('_updatedAt','>',ts) の絞り込み、serverTimestamp、監視ごとの変更差分（added/modified/removed）
//  - 端末内キャッシュ（cacheFirst / offline）、オフライン中は送信が完了しない
//  - 読み取り回数：サーバーから届いた added/modified の件数（Firestore の課金と同じ数え方）
const fs = require('fs');
const { JSDOM } = require('jsdom');
const path = require('path');
// アプリの場所（index.html と js/ があるフォルダ）。APP を指定すると、その1ファイル（v2.7 以前の app.js）を使う
const APP_DIR = process.env.APP_DIR || path.join(__dirname, '..');
const RAW_HTML = fs.readFileSync(process.env.HTML || path.join(APP_DIR, 'index.html'), 'utf8');
const APP_SOURCES = process.env.APP
  ? [{ name: path.basename(process.env.APP), code: fs.readFileSync(process.env.APP, 'utf8') }]
  : Array.from(RAW_HTML.matchAll(/<script\s+src="(js\/[^"]+)"/g)).map(m => ({ name: m[1], code: fs.readFileSync(path.join(APP_DIR, m[1]), 'utf8') }));
const HTML = RAW_HTML.replace(/<script[\s\S]*?<\/script>/g, '');
class Timestamp {
  constructor(seconds, nanoseconds) { this.seconds = seconds; this.nanoseconds = nanoseconds; this.ms = seconds * 1000 + nanoseconds / 1e6; }
  toMillis() { return this.ms; }
  static fromMillis(ms) { return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); }
}
const ST = { __serverTimestamp: true };

function createServer() {
  const server = { data: {}, cache: {}, offline: false, hang: false, failGets: 0, failCommits: 0, reads: 0, listeners: [], clock: Date.now(), writes: [] };
  server.now = () => { server.clock += 1; return server.clock; };
  server.advance = ms => { server.clock += ms; };
  server.coll = name => (server.data[name] = server.data[name] || new Map());
  server.notifyAll = () => server.listeners.filter(l => l.active).forEach(l => emit(server, l, false));
  // 他の端末（v2.6）からの書き込み
  server.externalSet = (coll, doc) => { server.coll(coll).set(doc.id, Object.assign(JSON.parse(JSON.stringify(doc)), { _updatedAt: server.now() })); setTimeout(() => server.notifyAll(), 0); };
  server.externalDelete = (coll, id) => server.externalSet(coll, { id, _deleted: true });
  server.goOnline = () => { server.offline = false; server.hang = false; server.notifyAll(); };
  server.snapshotCache = () => { server.cache = {}; Object.keys(server.data).forEach(c => server.cache[c] = new Map(Array.from(server.data[c]).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]))); };
  return server;
}

function toApi(raw) {
  if (!raw) return raw;
  const o = JSON.parse(JSON.stringify(raw));
  if (typeof raw._updatedAt === 'number') o._updatedAt = Timestamp.fromMillis(raw._updatedAt); else delete o._updatedAt;
  return o;
}
function matches(q, raw) {
  if (!q.filter) return true;
  return typeof raw._updatedAt === 'number' && raw._updatedAt > q.filter.value.ms;
}
function emit(server, l, fromCache) {
  if (!l.active) return;
  const src = fromCache ? (server.cache[l.q.coll] || new Map()) : server.coll(l.q.coll);
  const result = new Map();
  src.forEach((raw, id) => { if (matches(l.q, raw)) result.set(id, JSON.stringify(raw)); });
  const changes = [];
  result.forEach((json, id) => {
    if (!l.last.has(id)) changes.push({ type: 'added', id });
    else if (l.last.get(id) !== json) changes.push({ type: 'modified', id });
  });
  l.last.forEach((_, id) => { if (!result.has(id)) changes.push({ type: 'removed', id, raw: JSON.parse(l.last.get(id)) }); });
  const metaFlip = l.lastFromCache !== fromCache;
  if (!changes.length && !(metaFlip && l.opts.includeMetadataChanges) && l.emitted) return;
  if (!fromCache) server.reads += changes.filter(c => c.type !== 'removed').length;
  const mkDoc = (id, raw) => ({ id, data: () => toApi(raw), get: f => toApi(raw)[f], metadata: { hasPendingWrites: false } });
  const docs = Array.from(result.keys()).map(id => mkDoc(id, JSON.parse(result.get(id))));
  const docById = new Map(docs.map(d => [d.id, d]));
  const snap = {
    docs, empty: docs.length === 0, metadata: { fromCache, hasPendingWrites: false },
    forEach: f => docs.forEach(f),
    docChanges: () => changes.map(c => ({ type: c.type, doc: c.type === 'removed' ? mkDoc(c.id, c.raw) : docById.get(c.id) }))
  };
  l.last = result; l.lastFromCache = fromCache; l.emitted = true;
  l.cb(snap);
}

function makeFirebase(server) {
  function query(coll, filter) {
    return {
      where: (field, op, value) => { if (field !== '_updatedAt' || op !== '>') throw new Error('unsupported'); return query(coll, { value }); },
      doc: id => ({ _coll: coll, id }),
      onSnapshot: (opts, cb, err) => {
        if (typeof opts === 'function') { err = cb; cb = opts; opts = {}; }
        const l = { q: { coll, filter }, cb, err, opts, active: true, last: new Map(), lastFromCache: null, emitted: false };
        server.listeners.push(l);
        if (server.failGets > 0) {
          server.failGets--;
          setTimeout(() => { if (!l.active) return; l.active = false; const e = new Error('Listen failed (mock unavailable)'); e.code = 'unavailable'; err && err(e); }, 3);
          return () => { l.active = false; };
        }
        if (server.offline) setTimeout(() => emit(server, l, true), 1);
        else {
          if (server.cacheFirst && server.cache[coll]) setTimeout(() => emit(server, l, true), 1);
          if (!server.hang) setTimeout(() => emit(server, l, false), 4);
        }
        return () => { l.active = false; };
      }
    };
  }
  const db = {
    enablePersistence: () => Promise.resolve(),
    collection: () => ({ doc: () => ({ collection: name => query(name, null) }) }),
    batch: () => { const ops = []; return {
      set: (ref, data) => ops.push([ref, data]),
      delete: ref => ops.push([ref, null]),
      commit: async () => {
        while (server.offline) await new Promise(r => setTimeout(r, 20));
        await new Promise(r => setTimeout(r, 2));
        if (server.failCommits > 0) { server.failCommits--; const e = new Error('mock commit failed'); e.code = 'unavailable'; throw e; }
        const t = server.now();
        ops.forEach(([ref, data]) => {
          if (!data) { server.coll(ref._coll).delete(ref.id); return; }
          const stored = {};
          Object.keys(data).forEach(k => { const v = data[k]; stored[k] = (v === ST) ? t : (v instanceof Timestamp ? v.ms : JSON.parse(JSON.stringify(v))); });
          server.coll(ref._coll).set(ref.id, stored);
          server.writes.push([ref._coll, ref.id, stored._deleted ? 'tombstone' : 'set']);
        });
        setTimeout(() => server.notifyAll(), 0);
      } }; }
  };
  let authCb = null;
  const auth = {
    currentUser: null,
    onAuthStateChanged: cb => { authCb = cb; setTimeout(() => cb(auth.currentUser), 2); },
    getRedirectResult: () => Promise.resolve(null),
    signOut: async () => { auth.currentUser = null; authCb && authCb(null); },
    signInWithPopup: async () => {}, signInWithRedirect: async () => {}
  };
  server.auth = auth;
  const firestore = Object.assign(() => db, { FieldValue: { serverTimestamp: () => ST }, Timestamp });
  return { initializeApp: cfg => { server.config = cfg; }, auth: Object.assign(() => auth, { GoogleAuthProvider: function () {} }), firestore };
}

function boot({ server, storage = {}, localState, syncMeta, idb = null, beforeApp = null, url = 'https://expense-tracker-5e542.web.app/', user = { uid: 'u1', email: 'a@b' }, standalone = false }) {
  const { VirtualConsole } = require('jsdom');
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => errs.push('SCRIPT ERROR ' + (e && (e.detail && e.detail.message || e.message))));
  const dom = new JSDOM(HTML, { url, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  Object.entries(storage).forEach(([k, v]) => w.localStorage.setItem(k, v));
  if (localState) w.localStorage.setItem('premium_tracker_v18', JSON.stringify(localState));
  if (syncMeta) w.localStorage.setItem('premium_tracker_syncmeta_v1', JSON.stringify(syncMeta));
  Object.defineProperty(w.navigator, 'onLine', { get: () => (server && server.navOnline !== undefined) ? server.navOnline : true, configurable: true });
  w.matchMedia = q => ({ matches: standalone && q.includes('standalone'), addListener() {}, removeListener() {} });
  w.Sortable = Object.assign(function () { return { destroy() {} }; }, { create: () => ({ destroy() {} }) });
  w.firebase = server ? makeFirebase(server) : undefined;
  if (idb) {
    const FI = require('fake-indexeddb');
    w.indexedDB = idb; w.IDBKeyRange = FI.IDBKeyRange;
  }
  if (beforeApp) beforeApp(w);
  if (server) { server.listeners.forEach(l => l.active = false); server.auth.currentUser = user; }
  w.console.warn = () => {};
  w.console.error = (...a) => errs.push(a.map(String).join(' '));
  // 本物のブラウザと同じく、<script> を順番に実行する（ファイルをまたいだ変数・関数の共有も同じ）
  for (const src of APP_SOURCES) { const el = w.document.createElement('script'); el.textContent = src.code + '\n//# sourceURL=' + src.name; w.document.body.appendChild(el); }
  const hookEl = w.document.createElement('script'); hookEl.textContent = 'window.__t = { get state(){return state}, get cloudReady(){return cloudReady}, get fixedAllowed(){return fixedProcessingAllowed}, get pending(){return pendingBootstrapUid}, get recoveryTimer(){return recoveryTimer}, get mode(){ try { return syncMode } catch(e) { return "n/a" } }, get Store(){ return Store }, get storageReady(){ return storageReady }, renderCalendar, renderShortcuts, saveData, itemHash, withOrder, renderStats, closeCustomConfirm, flushSync, detail: () => document.getElementById("lbl-sync-detail").textContent, alertMsg: () => document.getElementById("alert-msg").textContent };'; w.document.body.appendChild(hookEl);
  const dump = () => { const o = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } return o; };
  const close = () => {
    try { w.eval('try { resetCloudState(); } catch (e) {}'); } catch (e) {}
    if (server) server.listeners.forEach(l => l.active = false);
    w.__closed = true; w.close();
  };
  return { dom, w, errs, server, dump, close };
}
process.on('uncaughtException', e => {
  // 閉じたテスト用ウィンドウの後始末で出る例外だけは無視する（document が消えている）
  if (/reading 'getElementById'|reading 'addEventListener'|reading '_location'/.test(String(e && e.message))) return;
  console.log('UNCAUGHT', e && e.stack); 
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
module.exports = { boot, sleep, createServer, Timestamp };
