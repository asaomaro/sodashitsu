# 検証

型検査・ビルド成功。帯の高さ・リロード後の保持・帯からfloatへのD&DをブラウザDOMの寸法と可視性で確認。スクリーンショット /tmp/view-controls-band-height.png を確認。

負の対照はWindowOverlayのmoved判定、bottom帯のresize hitを修正前に戻し、各回帰テストの失敗を確認。復元後cmp一致。高さの式だけを旧式に戻す対照では新しい上端hitなら同じ結果になり通過したため、実際の不具合箇所であるhit位置の対照に変更した。

## /tmp/view-controls-band-test.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu


 Test Files  2 passed (2)
      Tests  11 passed (11)
   Start at  13:22:44
   Duration  3.17s (transform 58%, tests 27%, import 15%)

  Transform  |@sodashitsu/tui| transforming modules took 2.42s · 58% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## /tmp/view-controls-latest.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu


 Test Files  3 passed (3)
      Tests  14 passed (14)
   Start at  13:25:27
   Duration  3.56s (transform 65%, tests 17%, import 13%, environment 5%)

  Transform  |@sodashitsu/tui| transforming modules took 2.97s · 63% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## /tmp/view-controls-band-e2e.log

```text

Running 3 tests using 1 worker

(node:3811279) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-12T04:28:16.005Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-12T04:28:16.007Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-sypGpx/commands.json","count":0}
{"ts":"2026-10-12T04:28:16.985Z","level":"info","msg":"display set","paneId":"16a5e532-39af-4fa0-869f-1b779355cfbe","name":"view-03461fc14c97421a90bcdcc3f77","kind":"band","format":"text","bytes":62,"rev":1}
{"ts":"2026-10-12T04:28:17.118Z","level":"info","msg":"display set","paneId":"16a5e532-39af-4fa0-869f-1b779355cfbe","name":"view-03461fc14c97421a90bcdcc3f77","kind":"band","format":"text","bytes":62,"rev":2}
{"ts":"2026-10-12T04:28:18.359Z","level":"info","msg":"display set","paneId":"16a5e532-39af-4fa0-869f-1b779355cfbe","name":"view-03461fc14c97421a90bcdcc3f77","kind":"band","format":"text","bytes":61,"rev":3}
{"ts":"2026-10-12T04:28:18.577Z","level":"info","msg":"display closed","paneId":"16a5e532-39af-4fa0-869f-1b779355cfbe","name":"view-03461fc14c97421a90bcdcc3f77","reason":"dismissed"}
  ✓  1 src/specs/statusline.spec.ts:2:1 › statusline follows pane focus and closing it removes the saved view (2.8s)
{"ts":"2026-10-12T04:28:18.782Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-12T04:28:18.783Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-ZStiFO/commands.json","count":0}
{"ts":"2026-10-12T04:28:19.223Z","level":"info","msg":"display set","paneId":"4d9ca884-0c76-4197-941a-946133c61bd4","name":"view-1efc5697a25c40d09900cf9fec6","kind":"band","format":"text","bytes":64,"rev":1}
{"ts":"2026-10-12T04:28:19.343Z","level":"info","msg":"display set","paneId":"4d9ca884-0c76-4197-941a-946133c61bd4","name":"view-1efc5697a25c40d09900cf9fec6","kind":"band","format":"text","bytes":106,"rev":2}
  ✓  2 src/specs/statusline.spec.ts:35:1 › band heights resize at the inner boundary and persist after reload (2.5s)
{"ts":"2026-10-12T04:28:21.289Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-12T04:28:21.289Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-vNMwDj/commands.json","count":0}
{"ts":"2026-10-12T04:28:21.709Z","level":"info","msg":"display set","paneId":"20f53932-0590-40ae-af2b-0c533992021d","name":"view-ea8e45d4fad94be1af49d59e7cf","kind":"band","format":"text","bytes":64,"rev":1}
{"ts":"2026-10-12T04:28:21.823Z","level":"info","msg":"display set","paneId":"20f53932-0590-40ae-af2b-0c533992021d","name":"view-ea8e45d4fad94be1af49d59e7cf","kind":"band","format":"text","bytes":106,"rev":2}
{"ts":"2026-10-12T04:28:22.833Z","level":"info","msg":"display set","paneId":"20f53932-0590-40ae-af2b-0c533992021d","name":"view-ea8e45d4fad94be1af49d59e7cf","kind":"panel","format":"text","bytes":106,"rev":3}
  ✓  3 src/specs/statusline.spec.ts:70:1 › band grip moves a tab view into a visible floating window (1.7s)

  3 passed (8.4s)

```

## /tmp/view-controls-negative.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/modes/WindowOverlay.test.ts (4 tests | 1 failed) 16ms
   × only drops moved windows and Escape restores the drag origin 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/modes/WindowOverlay.test.ts > only drops moved windows and Escape restores the drag origin
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      30,
      11,
      [Function anonymous],
    ]


Number of calls: 1

 ❯ src/modes/WindowOverlay.test.ts:86:29
     84|   win.handleMouse({ action: "down", button: 0, x: 30, y: 11 });
     85|   win.handleMouse({ action: "up", button: 0, x: 30, y: 11 });
     86|   expect(controls.drop).not.toHaveBeenCalled();
       |                             ^
     87|   win.handleMouse({ action: "down", button: 0, x: 30, y: 11 });
     88|   win.handleMouse({ action: "move", button: 32, x: 35, y: 15 });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
   Start at  13:25:37
   Duration  1.16s (transform 82%, import 16%, tests 2%)


```

## /tmp/view-controls-band-negative.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/app/TuiApp.dockedViews.test.ts (7 tests | 1 failed | 6 skipped) 85ms
   × bottom band grows from its upper boundary and Escape restores its height 83ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/app/TuiApp.dockedViews.test.ts > bottom band grows from its upper boundary and Escape restores its height
AssertionError: expected 7 to be greater than 7
 ❯ src/app/TuiApp.dockedViews.test.ts:327:19
    325|   m("move", before.y - 3);
    326|   m("up", before.y - 3);
    327|   expect(box().h).toBeGreaterThan(before.h);
       |                   ^
    328|   const grown = { ...box() };
    329|   m("down", grown.y);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  13:28:52
   Duration  2.02s (transform 80%, import 16%, tests 4%)


```


全体実行: 613ファイル、10594テスト。10592成功、ContextMenuの追加高さ項目とPanePanelの新DOM属性に追従していない2テスト失敗。製品コードは変更せず期待値・fixtureを更新して再実行し、対象29件+46件成功。全体再実行は重複回避。
```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu


 Test Files  3 passed (3)
      Tests  29 passed (29)
   Start at  13:29:39
   Duration  4.25s (transform 68%, tests 17%, import 11%, environment 4%)

  Transform  |@sodashitsu/web| transforming modules took 2.36s · 70% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

  Transform  |@sodashitsu/tui| transforming modules took 3.61s · 67% of tracked time, re-done on every run
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


 Test Files  1 passed (1)
      Tests  46 passed (46)
   Start at  13:30:07
   Duration  1.80s (transform 54%, tests 25%, import 12%, environment 9%)


```
```text

> sodashitsu-workspace@0.1.0 build /workspaces/sodashitsu
> node scripts/run-quiet.mjs "pnpm -r --filter=./packages/* run build"

Scope: 7 of 8 workspace projects
packages/protocol build$ tsc -b
packages/protocol build: Done
packages/client-core build$ tsc -b
packages/client-core build: Done
packages/tui build$ tsc -b
packages/web build$ vue-tsc --noEmit -p tsconfig.typecheck.json && vite build
packages/tui build: Done
packages/web build: transforming...
packages/web build: ✓ 660 modules transformed.
packages/web build: rendering chunks...
packages/web build: computing gzip size...
packages/web build: Done
packages/server build$ tsc -b
packages/server build: Done
packages/cli build$ tsc -b
packages/cli build: Done

```

稼働反映: handoff complete: 9 pane(s) kept running。反映前後ともpaneCount=12、graphNodes=12、プラグイン検出・予約・PJ一覧の応答確認。
