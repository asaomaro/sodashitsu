# 通常共有sourceのファイル転送

生成ファイルとprivate一時フォルダだけで検証。物理desktop入力/clipboard/実音声は操作しない。

- build/typecheck成功。
- 新focused5件成功。画像only先行加入と1helper、旧Bcap/未対応viewer/fileRoot無し、grant/id混用拒否、先頭退出時の未完成ファイル掃除と残る転送完了を検査。
- browser7件成功（新plain/暗号化2、既存転送5）。実UIで窓ごとのgrant、解除と退出の独立、upload/download生成byte一致を検証。
- 独立worktreeで旧peer gate除去/Providerの旧共有files拒否を戻す負例を実行。各1件失敗し、finallyで元byte一致を確認。生出力を以下へ保存。

## 負例 old-peer

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-files-check

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (163 tests | 1 failed | 159 skipped) 432ms
   × negotiates shared files with existing file protocol and B capability: provider 72ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > negotiates shared files with existing file protocol and B capability: provider
AssertionError: expected true to be undefined // Object.is equality

- Expected:
undefined

+ Received:
true

 ❯ src/desktop/DesktopRelay.test.ts:1272:59
    1270|   v.send({...start, options:{...start.options, features:true, sharedDe…
    1271|   await expect.poll(() => v.messages.some(m => m.type === "ready")).to…
    1272|   expect(v.messages.find(m => m.type === "ready")?.files).toBe(missing…
       |                                                           ^
    1273|   expect(f.startRequests.at(-1)!.options.files).toBe(missing === "none…
    1274|   if (image) {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 passed | 159 skipped (163)
   Start at  22:04:19
   Duration  1.74s (transform 58%, tests 27%, import 15%)


```

## 負例 provider-rejection

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-files-check

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (163 tests | 1 failed | 159 skipped) 1372ms
   × negotiates shared files with existing file protocol and B capability: none 1140ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > negotiates shared files with existing file protocol and B capability: none
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/DesktopRelay.test.ts:1271:69
    1269|   const v = await f.viewer(missing === "viewer" ? "shared" : "shared-f…
    1270|   v.send({...start, options:{...start.options, features:true, sharedDe…
    1271|   await expect.poll(() => v.messages.some(m => m.type === "ready")).to…
       |                                                                     ^
    1272|   expect(v.messages.find(m => m.type === "ready")?.files).toBe(missing…
    1273|   expect(f.startRequests.at(-1)!.options.files).toBe(missing === "none…

Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.ts:1271:3

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 passed | 159 skipped (163)
   Start at  22:04:21
   Duration  2.61s (tests 55%, transform 36%, import 9%)


```


## 全体と起動

全体790files/11846tests成功。製品sourceを凍結して実行し、review追加はtest-onlyのfocused5件を別途再実行した。typecheck成功、独立worktreeで復元後のbuild/smoke成功。rootへは3way mirrorし、既存fixtureのviewer既定trueを維持。root browser2件・typecheck成功。root全体と反映は継続して別途記録する。
