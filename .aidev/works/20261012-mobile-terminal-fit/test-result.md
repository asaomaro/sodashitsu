# 検証結果

- `pnpm build`、`pnpm typecheck`: PASS。
- 全体unit/integration: 586 files / 10524 tests PASS（`/tmp/mobile-fit-all.log`）。
- 対象unit: 3 files / 38 tests PASS。
- モバイル関連E2E（通常WebGL経路を含む）: 17 PASS / 2 skipped（任意の見た目保存ケース）。ask-form、表示パネル、ダッシュボードも含む。
- 新規DOM描画E2E: 3 PASS。320px/390px縦表示、750px横表示、追加キー、共有PTYのサイズ権限移動、PC表示→モバイル表示→PC表示を確認。
- `stty size`をブラウザから実行し、ブラウザの申告cols/rows・サーバのPTYサイズ・ブラウザが表示する出力が一致。320pxで28行35列、750px横表示＋追加キーで11行83列。
- 縦・横画像の端末文字とカーソル、上部バーの収まりを目視確認。画像 `/tmp/sodashitsu-mobile-320.png`、`/tmp/sodashitsu-mobile-landscape.png`。
- 本環境のChromium WebGLスクリーンショットは端末文字が空白。描画確認はE2EだけWebGLを無効化してDOM fallbackで行った。製品のWebGL設定は変更していない。実機スマートフォン・OSソフトキーボードは未確認。
- 独立レビュー `/root/review_summary_cache`: 初期fit・既存接続の送信順・所有権・縮小・header確認、コメント修正後とDOM描画検証後の再レビューで指摘なし。

## Negative control（修正部分だけ旧動作へ戻して検出、各ファイルをbyte単位で復元確認）

### 初期fitをfalseに戻す

```
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/web| src/mobile/MobileShell.test.ts (13 tests | 4 failed) 366ms
   ❯ MobileShell — ピッカー・キーボードの開閉 (3)
     × 「この端末に合わせる」で client.fit を送り、押した状態を表示する（T6） 36ms
   ❯ MobileShell — 表示領域で測る・繋ぎ直した後の fit（D108） (4)
     × 表示領域の大きさが変わったら 100ms に 1 回まで client.view を送り直す。PTY の大きさ（縮小の枠）が変わっても申告は変わらない（循環しない） 12ms
     × 「この端末に合わせる」を有効にしたまま繋ぎ直したら、client.view → client.fit → pane.subscribe の順に送り直す。押した表示のまま 16ms
     × 切断中に押しても送らず、次の接続の最初の client.view の直後に送る（hello の前には送らない。D107） 17ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/mobile/MobileShell.test.ts > MobileShell — ピッカー・キーボードの開閉 > 「この端末に合わせる」で client.fit を送り、押した状態を表示する（T6）
AssertionError: expected 'false' to be 'true' // Object.is equality

Expected: "true"
Received: "false"

 ❯ src/mobile/MobileShell.test.ts:201:44
    199|     view.onConnectionState("open"); // hello の通った接続がある（D108：無い間は送らない）
    200|     const btn = wrapper.get(".mobile-shell-fit-btn");
    201|     expect(btn.attributes("aria-pressed")).toBe("true");
       |                                            ^
    202|     await btn.trigger("click");
    203|     expect(conn.requests).toEqual([["client.fit", { enabled: false }]]…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  |@sodashitsu/web| src/mobile/MobileShell.test.ts > MobileShell — 表示領域で測る・繋ぎ直した後の fit（D108） > 表示領域の大きさが変わったら 100ms に 1 回まで client.view を送り直す。PTY の大きさ（縮小の枠）が変わっても申告は変わらない（循環しない）
AssertionError: expected 'false' to be 'true' // Object.is equality

Expected: "true"
Received: "false"

 ❯ src/mobile/MobileShell.test.ts:317:77
    315|       { width: 390, height: 175 },
    316|     );
    317|     expect(wrapper.get(".mobile-shell-fit-btn").attributes("aria-press…
       |                                                                             ^
    318|     const area = wrapper.get(".mobile-shell-pane").element;
    319|     /** 表示領域の大きさの変化を、それを見ている全ての ResizeObserver に知らせる（実物と同じ）。 */

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯

 FAIL  |@sodashitsu/web| src/mobile/MobileShell.test.ts > MobileShell — 表示領域で測る・繋ぎ直した後の fit（D108） > 「この端末に合わせる」を有効にしたまま繋ぎ直したら、client.view → client.fit → pane.subscribe の順に送り直す。押した表示のまま
AssertionError: expected [ 'client.view', 'pane.subscribe' ] to deeply equal [ 'client.view', 'client.fit', …(1) ]

- Expected
+ Received

  [
    "client.view",
-   "client.fit",
    "pane.subscribe",
  ]

 ❯ src/mobile/MobileShell.test.ts:353:43
    351|       { width: 390, height: 175 },
    352|     );
    353|     expect(conn.requests.map(([m]) => m)).toEqual(["client.view", "cli…
       |                                           ^
    354|
    355|     conn.requests.length = 0;

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯

 FAIL  |@sodashitsu/web| src/mobile/MobileShell.test.ts > MobileShell — 表示領域で測る・繋ぎ直した後の fit（D108） > 切断中に押しても送らず、次の接続の最初の client.view の直後に送る（hello の前には送らない。D107）
AssertionError: expected 'false' to be 'true' // Object.is equality

Expected: "true"
Received: "false"

 ❯ src/mobile/MobileShell.test.ts:384:77
    382|     await wrapper.get(".mobile-shell-fit-btn").trigger("click"); // 無効
    383|     await wrapper.get(".mobile-shell-fit-btn").trigger("click"); // 切断…
    384|     expect(wrapper.get(".mobile-shell-fit-btn").attributes("aria-press…
       |                                                                             ^
    385|     expect(conn.requests).toEqual([]);
    386|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯


 Test Files  1 failed (1)
      Tests  4 failed | 9 passed (13)
   Start at  07:36:14
   Duration  2.84s (transform 67%, tests 13%, import 13%, environment 6%)


```

### 既存接続での初回通知を無効化

```
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/web| src/term/ViewSync.test.ts (16 tests | 1 failed) 47ms
   × new mobile listener on an existing connection runs after a fresh view and before subscription 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/term/ViewSync.test.ts > new mobile listener on an existing connection runs after a fresh view and before subscription
AssertionError: expected [ 'pane.subscribe' ] to deeply equal [ 'client.view', 'client.fit', …(1) ]

- Expected
+ Received

  [
-   "client.view",
-   "client.fit",
    "pane.subscribe",
  ]

 ❯ src/term/ViewSync.test.ts:525:41
    523|   registry.markAllUnsubscribed();
    524|   sync.commit(mobileView(["p1"]));
    525|   expect(conn.requests.map(([m]) => m)).toEqual(["client.view", "clien…
       |                                         ^
    526|   conn.requests.length = 0;
    527|   sync.commit(mobileView(["p1"]));

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 15 passed (16)
   Start at  07:36:18
   Duration  694ms (transform 49%, environment 25%, import 18%, tests 8%)


```
