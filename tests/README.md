# 家計簿アプリの自動テスト

アプリ本体（`../index.html` と `../js/`）を実際に起動して確かめます。本物の Firebase には接続しません。料金もかかりません。

## 使い方

1. Node.js 18 以上を入れます。
2. このフォルダ（`tests`）で、次のコマンドを実行します。

```
npm install
npm test
```

それぞれ最後に `N passed, 0 failed` と出れば成功です（約1分半）。

### 実際のブラウザでのテスト（任意）

キーボード操作、Service Worker、22画面のコントラスト（ライト・ダーク）を、実際の Chromium で確かめます。

```
npx playwright install chromium   （初回だけ。ブラウザを取り込みます）
npm run test:browser
```

- 画面の画像は `tests/screenshots/light` と `tests/screenshots/dark` に保存されます。
- 手元の Chrome を使う場合は、`CHROMIUM` に Chrome の場所を指定します（例：`CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:browser`）。

## 中身

| ファイル | 件数 | 内容 |
|---|---|---|
| `fixes.test.js` | 13 | 点検 #6〜#10 の修正：支払い方法の自動更新、お店の紐付け、同じ名前のチェック、複数件の取り消し、着地予測 |
| `storage.test.js` | 8 | 端末内の保存（IndexedDB）：localStorage からの移行、再起動後もデータが残ること、使えない環境での localStorage への切り替え、容量不足の表示、同期の記録 |
| `sync.test.js` | 20 | 同期：差分同期・読み取り回数・削除済みの印・移行・オフライン・自動復帰・スクリプト注入対策・authDomain |
| `keyboard.browser.js` | 16 | キーボード操作：数字キー、Enter、Esc、Tab の移動範囲、フォーカスの枠 |
| `sw.browser.js` | 7 | Service Worker：正常な応答だけを保存すること、分割した js の保存、オフラインでの起動 |
| `screens.browser.js` | 22画面×2 | ライト・ダークの両方で画面を撮り、文字のコントラスト（WCAG AA）とページのエラーを確かめます |
| `mock-firestore.js` | — | 模擬 Firebase（`_updatedAt` による絞り込み、サーバー時刻、変更の差分、端末内キャッシュ、オフライン、読み取り回数）と、jsdom 上でアプリを起動する仕組み |

- 1つのテストだけを動かす：テスト名の一部を指定します（例：`ONLY=削除 node sync.test.js`）。
- 古い版（1つの app.js）と比べる：`APP=../old/app.js HTML=../old/index.html node fixes.test.js`

## 注意

- テストは、アプリの中の変数（`state` など）を直接見ています。関数名や変数名を変えたときは、テスト側も合わせてください。
- このフォルダは、公開する Web サーバーに置く必要はありません（置いても害はありません）。
