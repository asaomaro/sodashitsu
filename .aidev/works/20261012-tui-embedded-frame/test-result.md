TUI型検査・ビルド成功。embeddedの1行Statusline、2行ファイル一覧の本文、クリック座標、floatの枠継続を確認。修正箇所を戻した負の対照で回帰テスト失敗し、復元cmp一致。
```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu


 Test Files  3 passed (3)
      Tests  15 passed (15)
   Start at  13:45:51
   Duration  2.57s (transform 55%, tests 32%, import 13%)

  Transform  |@sodashitsu/tui| transforming modules took 2.51s · 55% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```
```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/modes/DisplayDialog.test.ts (4 tests | 1 failed | 3 skipped) 1011ms
   × embedded one-row bands use every cell for content while floating dialogs retain their frame 1010ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/modes/DisplayDialog.test.ts > embedded one-row bands use every cell for content while floating dialogs retain their frame
AssertionError: expected '└─ Statusline ───────────────────────…' to contain 'Context 30%'

Expected: "Context 30%"
Received: "└─ Statusline ─────────────────────────┘"

 ❯ src/modes/DisplayDialog.test.ts:212:65
    210|     return grid;
    211|   };
    212|   await vi.waitFor(() => expect(render(true, 40, 1).rowText(0)).toCont…
       |                                                                 ^
    213|   expect(render(true, 40, 1).rowText(0)).not.toContain("┌");
    214|   const floating = render(false, 60, 12);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  13:43:36
   Duration  2.13s (tests 50%, transform 41%, import 9%)


```
```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/modes/WorkspaceDialog.test.ts (4 tests | 1 failed | 3 skipped) 19ms
   × embedded two-row file lists retain both rows and clicking the first opens that file 18ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/modes/WorkspaceDialog.test.ts > embedded two-row file lists retain both rows and clicking the first opens that file
AssertionError: expected "vi.fn()" to be called with arguments: [ 'workspace.tools', …(1) ]

Received:

  1st vi.fn() call:

  [
    "workspace.tools",
-   ObjectContaining {
-     "operation": "read",
-     "path": "first",
+   {
+     "operation": "list",
+     "path": "",
+     "workspaceId": "w",
    },
  ]


Number of calls: 1

 ❯ src/modes/WorkspaceDialog.test.ts:170:19
    168|   dialog.handleMouse({ action: "down", button: 0, x: 2, y: 0 });
    169|   await tick();
    170|   expect(request).toHaveBeenCalledWith(
       |                   ^
    171|     "workspace.tools",
    172|     expect.objectContaining({ operation: "read", path: "first" }),

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  13:45:18
   Duration  944ms (transform 81%, import 16%, tests 2%)


```
