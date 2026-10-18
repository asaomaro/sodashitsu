# 検証

- 関係7ファイル26件PASS（`/tmp/preview-auto-related-final.log`）。CLIの既存gateway/transportも同じNode部品経由で検証。
- 全体build: PASS（`/tmp/preview-auto-build-final.log`）。全体typecheck: PASS（`/tmp/preview-auto-typecheck-final.log`）、最終service差分はserver build/typecheck再実行。
- 実ブラウザE2E: 外部CLIhelper・そのログイン・token・pane起動を一切用意せず、Bの外向き委譲から自動helperでHTTP/module/API/SSE/upload/WS/redirectを表示。タブ/workspace移動・画面登録も確認。viewerの配置を含む2件PASS（`/tmp/preview-auto-e2e-final.log`）。
- WebPreview単体: controller経由start/stop、targetBへ起動しない、非localhost/旧版時のmanual fallbackを確認。
- service単体: 開始中離脱、owner制限、重複開始、失敗後retry、上限、Scope/Work検証、同じjobを繰り返しても実リスナー1個だけ起動・回収。
- Windows/WSLの実機でのlocalhost転送は今回追加で検証していない。ブラウザが別PCの場合、自動helperはそのPCで起動できないため手動を維持する。

## 負対照: 長いread待機

35s指定を無視する10s固定の箇所だけを一時的に戻した。以下の失敗を確認後、元のbytesへ復元して一致を確認し、関係26件PASS。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/desktop/bridgeRpc.preview.test.ts (2 tests | 1 failed) 21ms
   × keeps an idle preview read alive past ten seconds and honors its 35s timeout 16ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/bridgeRpc.preview.test.ts > keeps an idle preview read alive past ten seconds and honors its 35s timeout
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/bridgeRpc.preview.test.ts:18:19
     16|   void reading.then(()=>{settled=true;},()=>{settled=true;});
     17|   await vi.advanceTimersByTimeAsync(12000);
     18|   expect(settled).toBe(false); expect(channel.close).not.toHaveBeenCal…
       |                   ^
     19|   reply({kind:"wait"}); expect(await reading).toEqual({kind:"wait"}); …
     20| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
   Start at  11:04:26
   Duration  643ms (transform 72%, import 24%, tests 4%, worker 1%)


```

## 負対照: 重複jobの回収

重複排除前に回帰テストを実行し、実リスナーが複数開く失敗を確認。finallyで開いた全リスナーを回収するので、負対照でもリソースを残さない。重複排除後に関係26件PASS。生出力:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/preview/ManagedPreviewHelpers.test.ts (4 tests | 1 failed | 3 skipped) 518ms
   × deduplicates repeated jobs across batches and closes the actual listener on stop 517ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/preview/ManagedPreviewHelpers.test.ts > deduplicates repeated jobs across batches and closes the actual listener on stop
AssertionError: expected "listen" to be called 1 times, but got 4 times
 ❯ src/preview/ManagedPreviewHelpers.test.ts:57:20
     55|     await helpers.start("browser","B","viewer");
     56|     await vi.waitFor(()=>expect(polls).toBeGreaterThanOrEqual(2));
     57|     expect(listen).toHaveBeenCalledTimes(1);
       |                    ^
     58|     await helpers.stop("browser","viewer");
     59|     expect(close).toHaveBeenCalledTimes(1);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  11:04:13
   Duration  1.18s (tests 48%, transform 37%, import 14%)


```

## VSCode設定変更通知の負対照

修正前のcancelLaunchedで追加回帰を実行。statusが来ず失敗。修正後はbroadcastする。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/desktop/DesktopCdpRelay.test.ts (25 tests | 1 failed | 24 skipped) 1041ms
   × publishes auto-launch permission changes to an already-open viewer without revoking a manual share 1039ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopCdpRelay.test.ts > publishes auto-launch permission changes to an already-open viewer without revoking a manual share
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/DesktopCdpRelay.test.ts:60:76
     58|     await once(ws, "open");
     59|     const wait = async (type: string) => {
     60|       await vi.waitFor(() => expect(messages.some((m) => m.type === ty…
       |                                                                            ^
     61|       return messages.splice(
     62|         messages.findIndex((m) => m.type === type),

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 24 skipped (25)
   Start at  11:19:57
   Duration  2.34s (tests 48%, transform 42%, import 9%)


```

## 最終確認（2026-10-18）

- `pnpm build`: PASS。
- `pnpm typecheck`: PASS（全packageとscripts）。
- `pnpm test`: 713 files / 11,134 tests PASS（198.52s）。VSCode設定の永続化・不正保存の無効化・localhost以外の変更拒否・起動中取消・手動共有を保持した状態配信、Web画面を含む。
- real browser E2E: desktop-sharing-settings / remote-web-preview / vscode-cdp-remote の3件 PASS。VSCodeはBの設定をoff→onにした際の開いているA画面の起動ボタン出現、実Chromiumのcanvas画素・入力・fit・停止まで確認。
- `pnpm smoke`: PASS（ログイン、端末描画、キー入力往復）。
- `git diff --check`: PASS。
- 独立レビュー review_vscode_auto による指摘修正後の再レビュー: 追加の必須指摘なし。

全出力はリポジトリ外 `/workspaces/sodashitsu-check-logs/20261018-vscode/` の build-fixed.log / typecheck-fixed.log / full-test.log / e2e.log / smoke.log に保存。途中の設定画面fixture失敗は新しい節の追加に追従して修正し、settings-dialog.logで146件通過後、全体テストも通過。

Windows版VSCodeの実起動・画面操作はこの最終確認では行っていない。パス探索はモック、接続E2Eは実Chromiumを使用。既存の稼働サーバー・Windows設定・通常のVSCodeは変更していない。別PC/モバイルのブラウザPCへのhelper自動導入は対象外で手動導線を維持する。
