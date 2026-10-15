# 検証

- `pnpm build`: 通過。最後のWeb差分は負の対照後に復元・再ビルド。
- `pnpm typecheck`: 通過。exactOptionalPropertyTypesに合わせテストの省略値はdeleteで取り除いた。
- 関連362ファイル5,758テスト: 5,757通過、既存GraphView.test.tsの上限表示1件が5秒の時間切れ。単独再実行は同ファイル79件すべて通過。GraphViewとそのテストは差分なし。生出力抜粋は下記。
- 追加機能に絞った12ファイル144テスト通過。最終復元後3ファイル19テスト通過。
- Chromium4ケース通過: 実際の`stty size`結果をアプリの表示DOMで確認、CSS幅変更時のPTY追従、閉じた後の通常ペインへの復元、別タブ・再接続、ユーザー操作後の入力・モバイル、statuslineの新項目選択・保存。
- 最初のE2EではInputGate経由のregistryに独立接続factoryが届いていないことを発見し、mainから認証済みの本体接続のfactoryを渡すよう修正。
- 再接続試験が最後に開いた1本のWSだけを閉じていたため、独立接続の追加後は対象の全WSを閉じる試験へ更新。
- 作業フォルダ外からのsmoke: PASS。
- 負の対照: (1) mainのサイズ接続factoryだけ無効にしWebをビルドし直すと、要求した小さいPTY行数にならず35行のままでE2E失敗。(2) 解放イベント処理だけ無効にすると再取得・応答競合の2テスト失敗。(3) 週コスト注入と解除日時整形を無効にすると2テスト失敗。それぞれ元のバイト列へ復元して一致を確認し、通過を確認。
- 本件と無関係な作業フォルダの未コミット変更は含めない。

## embed-fit-size-negative.log

```text

Running 1 test using 1 worker

(node:1200808) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-15T03:47:12.027Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-15T03:47:12.028Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-2V8J8l/commands.json","count":0}
{"ts":"2026-10-15T03:47:12.749Z","level":"info","msg":"display script enabled","byClientId":"d305e4c3-2a7e-4510-aaa0-7d63b4247771","byKind":"desktop"}
{"ts":"2026-10-15T03:47:14.811Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"974eeae6-f82e-446f-b23c-7fac43209e0b","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-15T03:47:14.814Z","level":"info","msg":"display set","paneId":"974eeae6-f82e-446f-b23c-7fac43209e0b","name":"embedded","kind":"panel","format":"script-html","bytes":1002,"rev":1}
{"ts":"2026-10-15T03:47:14.815Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"974eeae6-f82e-446f-b23c-7fac43209e0b","connId":"pane-socket:2","code":"ok"}
  ✘  1 src/specs/plugin-components.spec.ts:11:1 › native terminal embedded in a plugin: live output, own textarea, clipping, mobile and cleanup (8.6s)


  1) src/specs/plugin-components.spec.ts:11:1 › native terminal embedded in a plugin: live output, own textarea, clipping, mobile and cleanup

    Error: expect(received).toBeLessThan(expected)

    Expected: < 12
    Received:   35

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      39 |       (p) => p.id === paneId,
      40 |     )!;
    > 41 |   await expect.poll(async () => (await appPane()).rows).toBeLessThan(12);
         |                                                         ^
      42 |   const initialCols = (await appPane()).cols;
      43 |   const appFrame = page.frameLocator("iframe[data-display-script]");
      44 |   await appFrame.locator("#terminal").evaluate((el) => {
        at /workspaces/sodashitsu-system-footer/packages/e2e/src/specs/plugin-components.spec.ts:41:57

    Error Context: test-results/plugin-components-native-t-211b8-clipping-mobile-and-cleanup/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/plugin-components-native-t-211b8-clipping-mobile-and-cleanup/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/plugin-components-native-t-211b8-clipping-mobile-and-cleanup/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/plugin-components.spec.ts:11:1 › native terminal embedded in a plugin: live output, own textarea, clipping, mobile and cleanup
undefined
/workspaces/sodashitsu-system-footer/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test plugin-components.spec.ts --grep native terminal embedded

```

## embed-fit-release-negative.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-system-footer

 ❯ |@sodashitsu/web| src/term/EmbeddedTerminalSize.test.ts (4 tests | 2 failed) 2196ms
   × acquires the latest size when a competing attachment releases, without polling 1069ms
   × reattaches when ownership is released before an in-flight attach response 1003ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/term/EmbeddedTerminalSize.test.ts > acquires the latest size when a competing attachment releases, without polling
AssertionError: expected last "vi.fn()" call to have been called with [ false ]

- Expected
+ Received

  [
-   false,
+   true,
  ]

 ❯ src/term/EmbeddedTerminalSize.test.ts:87:41
     85|   expect(request).toHaveBeenCalledTimes(1);
     86|   event({ event: "pane.attach_changed", data: { paneId: "p", clientId:…
     87|   await vi.waitFor(() => expect(failed).toHaveBeenLastCalledWith(false…
       |                                         ^
     88|   expect(request.mock.calls[1]).toEqual(["pane.attach", { paneId: "p",…
     89|   size.dispose();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/web| src/term/EmbeddedTerminalSize.test.ts > reattaches when ownership is released before an in-flight attach response
AssertionError: expected "vi.fn()" to be called 2 times, but got 1 times
 ❯ src/term/EmbeddedTerminalSize.test.ts:120:42
    118|   event({ event: "pane.attach_changed", data: { paneId: "p", clientId:…
    119|   resolve();
    120|   await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
       |                                          ^
    121|   expect(request.mock.calls[1]![0]).toBe("pane.attach");
    122|   size.dispose();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 2 passed (4)
   Start at  12:46:39
   Duration  2.91s (tests 80%, environment 16%, transform 3%, import 1%)


```

## embed-usage-cost-reset-negative.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-system-footer

 ❯ |@sodashitsu/protocol| src/statusline.test.ts (9 tests | 1 failed) 14ms
   × independently selects cross-session weekly cost and exact rate-limit reset dates 5ms
 ❯ |@sodashitsu/server| src/usage/claudeAdapter.test.ts (6 tests | 1 failed) 864ms
   × includes weekly costs from the verified transcript's config root across sessions 5ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/protocol| src/statusline.test.ts > independently selects cross-session weekly cost and exact rate-limit reset dates
AssertionError: expected undefined to be 'Claude 5h解除 2026/10/16 03:04' // Object.is equality

- Expected:
"Claude 5h解除 2026/10/16 03:04"

+ Received:
undefined

 ❯ src/statusline.test.ts:172:65
    170|   expect(result.find((s) => s.field === "weeklyCost")?.text).toBe("今週 …
    171|   expect(result.find((s) => s.field === "cost")?.text).toBe("$1.000");
    172|   expect(result.find((s) => s.field === "fiveHourReset")?.text).toBe(
       |                                                                 ^
    173|     "Claude 5h解除 2026/10/16 03:04",
    174|   );

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/usage/claudeAdapter.test.ts > includes weekly costs from the verified transcript's config root across sessions
AssertionError: expected undefined to be 5 // Object.is equality

- Expected:
5

+ Received:
undefined

 ❯ src/usage/claudeAdapter.test.ts:130:126


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed (2)
      Tests  2 failed | 13 passed (15)
   Start at  12:48:52
   Duration  1.17s (tests 80%, transform 16%, import 3%, worker 1%)


```

## embed-usage-restored-unit.log

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-system-footer


 Test Files  3 passed (3)
      Tests  19 passed (19)
   Start at  12:48:54
   Duration  1.18s (tests 70%, environment 13%, transform 11%, import 4%, worker 1%)


```

## embed-usage-e2e-final.log

```text

Running 4 tests using 1 worker

(node:1203154) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-15T03:47:55.053Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-15T03:47:55.054Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-ufRcZV/commands.json","count":0}
{"ts":"2026-10-15T03:47:55.813Z","level":"info","msg":"display script enabled","byClientId":"59276cb5-1ed9-4fa0-8953-905482b70bb8","byKind":"desktop"}
{"ts":"2026-10-15T03:47:57.701Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"bafd743b-4151-4961-81d6-8bbb2b0c36bf","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-15T03:47:57.708Z","level":"info","msg":"display set","paneId":"bafd743b-4151-4961-81d6-8bbb2b0c36bf","name":"embedded","kind":"panel","format":"script-html","bytes":1002,"rev":1}
{"ts":"2026-10-15T03:47:57.709Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"bafd743b-4151-4961-81d6-8bbb2b0c36bf","connId":"pane-socket:2","code":"ok"}
  ✓  1 src/specs/plugin-components.spec.ts:11:1 › native terminal embedded in a plugin: live output, own textarea, clipping, mobile and cleanup (8.5s)
{"ts":"2026-10-15T03:48:03.427Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-15T03:48:03.428Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-itF8Zh/commands.json","count":0}
{"ts":"2026-10-15T03:48:03.976Z","level":"info","msg":"display script enabled","byClientId":"4dd29eb9-5aa9-4b1b-99ee-c76c00b467d4","byKind":"desktop"}
{"ts":"2026-10-15T03:48:05.410Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"706723c2-640e-4a13-87a5-5a6f86f188f8","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-15T03:48:05.417Z","level":"info","msg":"display set","paneId":"706723c2-640e-4a13-87a5-5a6f86f188f8","name":"background","kind":"panel","format":"script-html","bytes":170,"rev":1}
{"ts":"2026-10-15T03:48:05.418Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"706723c2-640e-4a13-87a5-5a6f86f188f8","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-15T03:48:10.604Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:1b98f063-073d-40f3-8008-a1d28f7f75ac"]}
  ✓  2 src/specs/plugin-components.spec.ts:94:1 › a background terminal in another tab is visible, survives reconnect, and is removed when closed (7.5s)
{"ts":"2026-10-15T03:48:10.905Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-15T03:48:10.906Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-VqUHbs/commands.json","count":0}
{"ts":"2026-10-15T03:48:11.354Z","level":"info","msg":"display script enabled","byClientId":"a7d4ff24-bfe0-4d80-affa-f6adc64d2581","byKind":"desktop"}
{"ts":"2026-10-15T03:48:12.869Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"9206c022-0dc6-40d0-882c-b32c66002296","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-15T03:48:12.876Z","level":"info","msg":"display set","paneId":"9206c022-0dc6-40d0-882c-b32c66002296","name":"input-terminal","kind":"panel","format":"script-html","bytes":336,"rev":1}
{"ts":"2026-10-15T03:48:12.876Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"9206c022-0dc6-40d0-882c-b32c66002296","connId":"pane-socket:2","code":"ok"}
  ✓  3 src/specs/plugin-components.spec.ts:139:1 › embedded input terminal sends to its background pane in Web and mobile, after user engagement (6.3s)
{"ts":"2026-10-15T03:48:17.225Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-15T03:48:17.226Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-JyUmPQ/commands.json","count":0}
  ✓  4 src/specs/statusline.spec.ts:326:1 › native statusline settings, order, row bounds and mobile layout persist (7.1s)

  4 passed (31.0s)

```

## グラフ試験の時間切れ（生出力抜粋）

```text
 FAIL  |@sodashitsu/web| src/components/graph/GraphView.test.ts > GraphView（上限のため出ていない pane。20261008-graph-first） > 手元のノードが上限の手前に達していて、ノードの無い手元の pane があれば、その数を知らせる。そうでなければ出さない
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/components/graph/GraphView.test.ts:183:3
    181|
    182| describe("GraphView（上限のため出ていない pane。20261008-graph-first）", () => {
    183|   it("手元のノードが上限の手前に達していて、ノードの無い手元の pane があれば、その数を知らせる。そうでなければ出さない", as…
       |   ^
    184|     const { wrapper } = await openWithGraph();
    185|     expect(wrapper.find('[data-testid="graph-hidden-panes"]').exists()…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 361 passed (362)
      Tests  1 failed | 5757 passed (5758)
   Start at  12:44:29
   Duration  73.97s (tests 33%, transform 27%, environment 21%, import 19%, worker 1%)
```

## 単独再実行

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-system-footer


 Test Files  1 passed (1)
      Tests  79 passed (79)
   Start at  12:45:52
   Duration  10.02s (tests 57%, transform 35%, import 5%, environment 3%)

  Transform  |@sodashitsu/web| transforming modules took 3.44s · 35% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```
