TUI型検査・ビルド成功。上下帯のfold/restore/D&D/close、既存リアルタイムresize/Esc復元、PTY入力漏れなしを確認。負の対照でheader優先を外すとband-bottom foldが失敗。復元cmp一致。
```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu


 Test Files  3 passed (3)
      Tests  16 passed (16)
   Start at  14:59:22
   Duration  3.15s (transform 58%, tests 29%, import 13%)

  Transform  |@sodashitsu/tui| transforming modules took 2.86s · 58% of tracked time, re-done on every run
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

 ❯ |@sodashitsu/tui| src/app/TuiApp.dockedViews.test.ts (10 tests | 1 failed | 9 skipped) 1094ms
   × band-bottom headers fold, move and close even when sharing a resize boundary 1092ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/app/TuiApp.dockedViews.test.ts > band-bottom headers fold, move and close even when sharing a resize boundary
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/app/TuiApp.dockedViews.test.ts:431:68
    429|     mouse(0, before.x + before.w - 6, before.y, true);
    430|     await vi.waitFor(() =>
    431|       expect(layout().panes.some((p) => p.paneId === "view:band")).toB…
       |                                                                    ^
    432|     );
    433|     expect(await h.screen()).toContain("▸ Statusline");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  14:59:45
   Duration  3.00s (transform 52%, tests 38%, import 10%)


```
