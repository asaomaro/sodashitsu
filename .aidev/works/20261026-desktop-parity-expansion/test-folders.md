# フォルダ送信・ZIP受信の検証

生成フォルダ・private tempだけで検証。実desktop入力/clipboard/録音や実driver/service設定変更はしない。

- build成功。focused39件（protocol portable/limits、B upload/ZIP/empty/latecancel/partialcleanup/symlink/source file-dir race、既存DesktopFiles、browser source walker）とgate5件成功。
- fileClient7件成功（両folder開始は30,001/119,999msで未決、120,001msでtimeout。cancel枠と通常期限は維持）。
- browser21件成功: 新plain/encrypted/shared/drop/cancel/pause/collision7＋既存file5/shared2/checkpoint7。私有領域に生成した階層/empty/zero/binaryを、実UI/WS/暗号化から送信し、実download ZIPを展開してbytesを確認。dropのfixture修正後は21全て成功。
- ZIPを独立したPython zipfileでも検証。UTF8 paths/empty dirs/CRC/contents成功（python_zipfile_interop_pass）。
- initial fullはupload開始timeoutの未反映が見つかったためSIGINT(exit130)で中止し、最終sourceで改めて一度実行。中止した試験を成功として数えない。
- 独立worktreeでcancel fence/old B gate/source final snapshotを1つずつ外す負例は全て意図した失敗。finallyでsource byte一致へ復元、復元後smoke PASS。

## 負例 cancel

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-folder-transfer-check

 ❯ |@sodashitsu/server| src/desktop/DesktopFolders.test.ts (12 tests | 1 failed | 11 skipped) 48ms
   × takes a late cancellation before atomic file publication 47ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopFolders.test.ts > takes a late cancellation before atomic file publication
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopFolders.test.ts:209:32
    207|   const cancel = f.run({ action: "folder_abort", id });
    208|   release();
    209|   expect((await finishing).ok).toBe(false);
       |                                ^
    210|   await cancel;
    211|   await expect.poll(() => readdir(f.root)).toEqual([]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 11 skipped (12)
   Start at  23:45:32
   Duration  751ms (transform 72%, import 21%, tests 7%)


```

## 負例 legacy

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-folder-transfer-check

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (173 tests | 1 failed | 168 skipped) 362ms
   × gates folder transfer options and readiness: old-provider 64ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > gates folder transfer options and readiness: old-provider
AssertionError: expected true to be undefined // Object.is equality

- Expected:
undefined

+ Received:
true

 ❯ src/desktop/DesktopRelay.test.ts:1342:121


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 4 passed | 168 skipped (173)
   Start at  23:45:34
   Duration  1.38s (transform 57%, tests 28%, import 15%)


```

## 負例 snapshot

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-folder-transfer-check

 ❯ |@sodashitsu/server| src/desktop/DesktopFolders.test.ts (12 tests | 1 failed | 10 skipped) 65ms
   × rejects a file changed after it was already packed 41ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopFolders.test.ts > rejects a file changed after it was already packed
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopFolders.test.ts:285:21
    283|   const result = await f.run({ action: "folder_download_start", id: ra…
    284|   expect(changed).toBe(true);
    285|   expect(result.ok).toBe(false);
       |                     ^
    286|   expect(result.message).toContain("変更");
    287|   expect((f.files as any).folders.jobs.size).toBe(0);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 10 skipped (12)
   Start at  23:45:36
   Duration  728ms (transform 67%, import 22%, tests 10%, worker 1%)


```


## 最終sourceの全体確認

source bd339a1aで全体794files/11898tests成功、typecheck成功。21browser成功後にupload開始のtimeout変更を追加したため、最終sourceのfileClient7件とroot browser7件で差分を再検証。rootは24filesのguard付き3way mirrorとfrozen install/build/typecheck成功、既存変更とviewer既定trueを維持。root全体と両端反映は結果確認中。
