# 第2段階 検証記録

生成ファイル・private TEMP folderのみ。実OSの画面/入力/clipboardは触れない。

事前単体: 7 suites / 38 tests通過（設定保存/範囲/通常ファイル/同名拒否/SHA256/abort/最後のfd.stat中取消/idle/一覧race/control queue/TUI設定）。browser: roundtrip/pause-resume/cancel/no-overwriteの4件通過、追加multi-pauseも単独で通過（5pausedを21秒進めてstatus5件と解除後temporary削除をDOM/browser framesで確認）。multi-pause初回はclock導入がtimer生成より遅くstatus0で失敗、clockをgoto前へ移動してtimerを実際に進める検証へ訂正した。

最終build/typecheck/full/unit/E2E/独立worktree smoke/Windows generated file testsは実行前。

## 取消の仕様

hashとfd.stat中の取り消しを実FileTransferに注入し、OS公開前に拒否する。公開のOS呼出し開始後の取り消し/失敗は元へ戻せると保証しない。commit開始後は取消ボタンを出さず、結果が不明なら保存先の確認を促す。自動再送しない。

## 負例と復元

修正だけを外し、期待失敗後に元のbytesへ復元、一致をassertした。以下は失敗時の生出力。

### sticky-abort

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-files

 ❯ |@sodashitsu/server| src/desktop/DesktopFiles.test.ts (8 tests | 1 failed | 7 skipped) 53ms
   × an abort received during final hash verification prevents publication 52ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopFiles.test.ts > an abort received during final hash verification prevents publication
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopFiles.test.ts:146:21
    144|   });
    145|   expect(checks).toBe(4);
    146|   expect(result.ok).toBe(false);
       |                     ^
    147|   await abort;
    148|   expect(await readdir(f.root)).toEqual([]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 7 skipped (8)
   Start at  13:50:51
   Duration  758ms (transform 72%, import 19%, tests 8%)

```

### final-fence

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-files

 ❯ |@sodashitsu/server| src/desktop/DesktopFiles.test.ts (8 tests | 1 failed | 7 skipped) 38ms
   × an abort during the final fd stat is fenced before the OS publish call 33ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopFiles.test.ts > an abort during the final fd stat is fenced before the OS publish call
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopFiles.test.ts:173:21
    171|   });
    172|   expect(stats).toBe(2);
    173|   expect(result.ok).toBe(false);
       |                     ^
    174|   await abort;
    175|   expect(await readdir(f.root)).toEqual([]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 7 skipped (8)
   Start at  13:50:52
   Duration  798ms (transform 73%, import 21%, tests 5%)

```

### expiry

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-files

 ❯ |@sodashitsu/server| src/desktop/DesktopFiles.test.ts (8 tests | 1 failed | 7 skipped) 59ms
   × expires its viewer metadata together with abandoned file handles 58ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopFiles.test.ts > expires its viewer metadata together with abandoned file handles
AssertionError: expected 1 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 1

 ❯ src/desktop/DesktopFiles.test.ts:188:45
    186|     await (f.files as any).transfer.queue;
    187|     await Promise.resolve();
    188|     expect((f.files as any).activeIds.size).toBe(0);
       |                                             ^
    189|     expect((f.files as any).expirations.size).toBe(0);
    190|     expect(await readdir(f.root)).toEqual([]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 7 skipped (8)
   Start at  13:50:54
   Duration  663ms (transform 68%, import 21%, tests 10%)

```

### listed-folder

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-files

 ❯ |@sodashitsu/web| src/components/DesktopFiles.test.ts (2 tests | 1 failed | 1 skipped) 28ms
   × keeps displayed entry operations bound to the listed folder even if the input changes 27ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/DesktopFiles.test.ts > keeps displayed entry operations bound to the listed folder even if the input changes
AssertionError: expected "vi.fn()" to be called with arguments: [ { action: 'read_start', …(1) } ]

Received:

  1st vi.fn() call:

  [
    {
-     "action": "read_start",
-     "path": "same.bin",
+     "action": "grant",
+     "enabled": true,
    },
  ]

  2nd vi.fn() call:

  [
    {
-     "action": "read_start",
-     "path": "same.bin",
+     "action": "list",
+     "path": "",
    },
  ]

  3rd vi.fn() call:

  [
    {
      "action": "read_start",
-     "path": "same.bin",
+     "path": "another-folder/same.bin",
    },
  ]


Number of calls: 3

 ❯ src/components/DesktopFiles.test.ts:24:19
     22|     .trigger("click");
     23|   await flushPromises();
     24|   expect(request).toHaveBeenCalledWith({ action: "read_start", path: "…
       |                   ^
     25|   expect(request).not.toHaveBeenCalledWith({
     26|     action: "read_start",

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  13:50:55
   Duration  1.09s (transform 58%, environment 21%, import 14%, worker 3%, tests 3%)

```

### stale-list

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-files

 ❯ |@sodashitsu/web| src/components/DesktopFiles.test.ts (2 tests | 1 failed | 1 skipped) 26ms
   × ignores an older list response after another folder has been listed 25ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/DesktopFiles.test.ts > ignores an older list response after another folder has been listed
AssertionError: expected 'ファイル転送ファイル転送を解除共有フォルダ: /generated（1ファ…' to contain 'new.bin'

Expected: "new.bin"
Received: "ファイル転送ファイル転送を解除共有フォルダ: /generated（1ファイル100MiB、上書きなし）共有フォルダ内の場所一覧を更新このデスクトップ窓にファイルをドロップして送信できます。フォルダは送信できません。stale.bin（1 bytes） ダウンロード  一時停止した転送はこの窓を開いている間に再開できます。接続終了・再読込後は再送してください。完了表示は接続先保存の確認後です。受信はブラウザの保存先を確認してください。"

 ❯ src/components/DesktopFiles.test.ts:56:26
     54|   older({ entries: [{ ...entry, name: "stale.bin" }] });
     55|   await flushPromises();
     56|   expect(wrapper.text()).toContain("new.bin");
       |                          ^
     57|   expect(wrapper.text()).not.toContain("stale.bin");
     58|   wrapper.unmount();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  13:50:57
   Duration  1.12s (transform 59%, environment 22%, import 14%, tests 3%, worker 2%)

```

### control-admission

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-files

 ❯ |@sodashitsu/web| src/desktop/fileClient.test.ts (5 tests | 1 failed | 4 skipped) 7ms
   × accepts revoke even when the normal queue is full 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/fileClient.test.ts > accepts revoke even when the normal queue is full
AssertionError: expected [ 'status' ] to deeply equal [ 'status', 'grant' ]

- Expected
+ Received

  [
    "status",
-   "grant",
  ]

 ❯ src/desktop/fileClient.test.ts:90:45
     88|     settled = Promise.allSettled(waiting);
     89|   const revoked = client.request({ action: "grant", enabled: false });
     90|   expect(sent.map((v) => v.request.action)).toEqual(["status", "grant"…
       |                                             ^
     91|   client.receive({
     92|     type: "desktop_file_result",

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯

Vitest caught 1 unhandled error during the test run.
This might cause false positive tests. Resolve unhandled errors to make sure your tests are not affected.

⎯⎯⎯⎯ Unhandled Rejection ⎯⎯⎯⎯⎯
Error: ファイル転送の接続が終了したか処理上限です
 ❯ DesktopFileClient.request packages/web/src/desktop/fileClient.ts:31:29
 ❯ packages/web/src/desktop/fileClient.test.ts:89:26
 ❯ node_modules/.pnpm/vitest@5.0.1_@types+node@24.13.5_happy-dom@20.14.5_vite@8.3.0_@types+node@24.13.5_/node_modules/vitest/dist/chunks/run.C5UmxDPh.js:1628:35
 ❯ node_modules/.pnpm/vitest@5.0.1_@types+node@24.13.5_happy-dom@20.14.5_vite@8.3.0_@types+node@24.13.5_/node_modules/vitest/dist/chunks/run.C5UmxDPh.js:2783:26
 ❯ node_modules/.pnpm/vitest@5.0.1_@types+node@24.13.5_happy-dom@20.14.5_vite@8.3.0_@types+node@24.13.5_/node_modules/vitest/dist/chunks/run.C5UmxDPh.js:3319:20
 ❯ runWithCancel node_modules/.pnpm/vitest@5.0.1_@types+node@24.13.5_happy-dom@20.14.5_vite@8.3.0_@types+node@24.13.5_/node_modules/vitest/dist/chunks/run.C5UmxDPh.js:3314:10
 ❯ node_modules/.pnpm/vitest@5.0.1_@types+node@24.13.5_happy-dom@20.14.5_vite@8.3.0_@types+node@24.13.5_/node_modules/vitest/dist/chunks/run.C5UmxDPh.js:3299:20
 ❯ runWithTimeout node_modules/.pnpm/vitest@5.0.1_@types+node@24.13.5_happy-dom@20.14.5_vite@8.3.0_@types+node@24.13.5_/node_modules/vitest/dist/chunks/run.C5UmxDPh.js:3257:10

This error originated in "packages/web/src/desktop/fileClient.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯


 Test Files  1 failed (1)
      Tests  1 failed | 4 skipped (5)
     Errors  1 error
   Start at  13:50:59
   Duration  766ms (transform 58%, environment 22%, import 18%, tests 1%)

```

### control-full-close

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-files

 ❯ |@sodashitsu/web| src/desktop/fileClient.test.ts (5 tests | 1 failed | 4 skipped) 6ms
   × closes the dedicated lane if even the control queue is full 5ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/fileClient.test.ts > closes the dedicated lane if even the control queue is full
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/desktop/fileClient.test.ts:109:15
    107|     settled = Promise.allSettled(waiting);
    108|   await expect(client.request({ action: "grant", enabled: false })).re…
    109|   expect(end).toHaveBeenCalledOnce();
       |               ^
    110|   await settled;
    111| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 4 skipped (5)
   Start at  13:51:00
   Duration  823ms (transform 55%, import 22%, environment 21%, tests 1%, worker 1%)

```
