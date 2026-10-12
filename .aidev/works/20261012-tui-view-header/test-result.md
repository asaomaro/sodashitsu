TUI型検査・ビルド成功。外側端末のビュー範囲だけでghostbuttonsなし・[-][×]ありを確認し、fold/restore/contextmenu/drag/closeの実操作を確認。12テスト成功。負の対照としてheader消去を外すと回帰テスト失敗。復元cmp一致。
```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu


 Test Files  2 passed (2)
      Tests  12 passed (12)
   Start at  14:25:12
   Duration  3.83s (transform 61%, tests 24%, import 14%)

  Transform  |@sodashitsu/tui| transforming modules took 3.14s · 61% of tracked time, re-done on every run
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

 ❯ |@sodashitsu/tui| src/app/TuiApp.dockedViews.test.ts (8 tests | 1 failed | 7 skipped) 129ms
   × native headers fold into one row, reopen, show a view menu, drag and close without PTY leakage 128ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/app/TuiApp.dockedViews.test.ts > native headers fold into one row, reopen, show a view menu, drag and close without PTY leakage
AssertionError: expected 'ファイルツリー───[+][│][─][-] [×]' not to contain '[+]'

Expected: "[+]"
Received: "ファイルツリー───[+][│][─][-] [×]"

 ❯ src/app/TuiApp.dockedViews.test.ts:251:22
    249|     .getLine(box.y)!
    250|     .translateToString(false, box.x, box.x + box.w);
    251|   expect(header).not.toContain("[+]");
       |                      ^
    252|   expect(header).not.toContain("[│]");
    253|   expect(header).not.toContain("view:files");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 7 skipped (8)
   Start at  14:26:07
   Duration  2.19s (transform 79%, import 14%, tests 6%)


```
