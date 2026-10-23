# remote_work ファイル転送

依頼: 操作元Aと接続先Bの間でファイルを双方向に送る。Excel等のバイナリを保ち、結果に保存先と完了/失敗を返す。

実装: remote_work operation=transfer、action=upload/download、sourcePath/destinationPath。Bは固定PJ相対、AはサーバOSの絶対パスまたは起動フォルダ相対。64KiBチャンク、100MiB上限。既存保存先を上書きせず、一時ファイルへ受信してサイズ/SHA-256/実体を照合後に公開する。失敗時は status=failed、destination、message を返す。

## 検証

- 関連テスト: 5ファイル・21件成功。FileTransfer 9件、認証/スコープ、MCP、プロトコル、2サーバ間の実結合テスト（双方向170001バイト、同名拒否、PJ外拒否、PJ変更後の拒否）。
- 全体 typecheck 成功。
- 最終 `pnpm build` 成功。
- `pnpm smoke` 成功（HTTP/WebSocket、PTY、ブラウザ描画・入力等）。
- 全体 `pnpm exec vitest run --maxWorkers=4`: 743ファイル・11318件成功。
- 画面の変更はないためブラウザE2E追加なし。

## 独立レビュー

別コンテキスト review_transfer が転送全体を点検。一時ファイルのパス差し替え/内容変更で成功と誤報告する問題を検出。実fdとパスの実体、サイズ、実データのハッシュ、更新時刻を公開前に照合し、公開後の実体も照合する修正を追加。修正差分の再レビューは指摘なし。

## 回帰テストの負対照

保存前後の実体/実データ照合だけを外し、`pnpm exec vitest run packages/server/src/work/FileTransfer.test.ts -t 'detects a staging-file'` を実行。modify/replaceの2件が失敗することを確認。修正済みソースをバイト単位で復元・照合した。

以下は実行の生出力。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/work/FileTransfer.test.ts (9 tests | 2 failed | 7 skipped) 27ms
   × detects a staging-file modify before publishing 18ms
   × detects a staging-file replace before publishing 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/work/FileTransfer.test.ts > detects a staging-file modify before publishing
AssertionError: promise resolved "{ …(3) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "bytes": 8,
+   "destination": "/tmp/work-file-transfer-cbTbqm/output.xlsx",
+   "sha256": "0682c5f2076f099c34cfdd15a9e063849ed437a49677e6fcc5b4198c76575be5",
  }

 ❯ src/work/FileTransfer.test.ts:79:110
     77|   if (mode === "replace") await rm(stage);
     78|   await writeFile(stage, "tampered");
     79|   await expect(a.run({ action: "finish", id: id!, sha256: createHash("…
       |                                                                                                              ^
     80|   expect(await readdir(a.root)).toEqual([]);
     81| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/work/FileTransfer.test.ts > detects a staging-file replace before publishing
AssertionError: promise resolved "{ …(3) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "bytes": 8,
+   "destination": "/tmp/work-file-transfer-jmi0dX/output.xlsx",
+   "sha256": "0682c5f2076f099c34cfdd15a9e063849ed437a49677e6fcc5b4198c76575be5",
  }

 ❯ src/work/FileTransfer.test.ts:79:110
     77|   if (mode === "replace") await rm(stage);
     78|   await writeFile(stage, "tampered");
     79|   await expect(a.run({ action: "finish", id: id!, sha256: createHash("…
       |                                                                                                              ^
     80|   expect(await readdir(a.root)).toEqual([]);
     81| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 7 skipped (9)
   Start at  15:02:30
   Duration  602ms (transform 73%, import 21%, tests 5%, worker 1%)


```

## PR #185 の分離後の最終検証

`origin/main`（d92caee3）を基点とする `/workspaces/sodashitsu-file-transfer` で、今回の変更とロック画面の必要な前提だけを切り出して検証した。

- `pnpm build`: 成功。
- `pnpm typecheck`: 成功。
- `pnpm exec vitest run --maxWorkers=4`: 735ファイル・11254件成功。
- `pnpm smoke`: 成功。
- `pnpm --filter @sodashitsu/e2e exec playwright test remote-desktop-cover.spec.ts remote-desktop-unlock.spec.ts`: 6件成功。
- 全体差分の独立レビュー: 指摘なし（review.md）。
- GitHub側のチェック設定なし。PRはmainと競合なし。

全体テストの生の集計:

```text
 Test Files  735 passed (735)
      Tests  11254 passed (11254)
   Duration  336.32s (tests 81%, import 10%, environment 5%, transform 4%)
```
