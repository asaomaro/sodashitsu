# 検証

ビルド・型チェック通過。関連8ファイル15件通過。Web E2E3件通過：statuslineの焦点追従/×削除、SVG Gitクリック差分、ファイル/Grep/編集/モバイル、追加候補。

## 負例：dismissの表示名をIDで比較する修正前条件

失敗を確認し元バイトへ完全復元：

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/surface/methods/displayViewDismiss.test.ts (1 test | 1 failed) 7ms
   × dismiss removes only the matching registered view using display names, including terminal variants 7ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/surface/methods/displayViewDismiss.test.ts > dismiss removes only the matching registered view using display names, including terminal variants
AssertionError: expected "vi.fn()" to be called once with arguments: [ 't', 'v' ]

Number of calls: 0

 ❯ src/surface/methods/displayViewDismiss.test.ts:39:18
     37|     await surface.invoke({ clientId: "c" } as never, "display.dismiss"…
     38|   ).toMatchObject({ ok: true });
     39|   expect(remove).toHaveBeenCalledExactlyOnceWith("t", "v");
       |                  ^
     40|   remove.mockClear();
     41|   await surface.invoke({ clientId: "c" } as never, "display.dismiss", …

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  12:38:04
   Duration  1.04s (transform 81%, import 18%, tests 1%)


```

## 負例：focusイベント購読を外す

失敗を確認し元バイトへ完全復元：

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/workspace/BuiltinViews.test.ts (1 test | 1 failed) 1059ms
   × statusline follows the active pane for a tab and keeps a pane-scoped line pinned, using the common text surface 1058ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/workspace/BuiltinViews.test.ts > statusline follows the active pane for a tab and keeps a pane-scoped line pinned, using the common text surface
AssertionError: expected "vi.fn()" to be called 2 times, but got 0 times
 ❯ src/workspace/BuiltinViews.test.ts:81:40
     79|     tab.focusedPaneId = "b";
     80|     bus.publish({ event: "session.focus_changed", data: {} } as never);
     81|     await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(2));
       |                                        ^
     82|     expect(set.mock.calls.find((c) => c[1].name === "status")?.[1].con…
     83|     expect(set.mock.calls.find((c) => c[1].name === "pinned")?.[1].con…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  12:38:06
   Duration  2.07s (tests 53%, transform 39%, import 8%)


```

## 負例：新規ノードの重なり回避を外す

重なりテストの失敗を確認し、元のバイトとmtimeへ復元した。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/modes/GraphView.test.ts (3 tests | 1 failed | 2 skipped) 18ms
   × new nodes avoid existing workspace nodes after the initial native layout 17ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/modes/GraphView.test.ts > new nodes avoid existing workspace nodes after the initial native layout
AssertionError: expected 3 to be greater than or equal to 5
 ❯ src/modes/GraphView.test.ts:137:27
    135|   expect(y).toBeGreaterThan(0);
    136|   const b = rows.findIndex((r) => r.includes("b") && r.includes("│"));
    137|   expect(Math.abs(y - b)).toBeGreaterThanOrEqual(5);
       |                           ^
    138|   view.dispose();
    139| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
   Start at  12:44:44
   Duration  1.22s (transform 82%, import 16%, tests 2%)


```

## 全体検証

全体613ファイル・10588件では10586件通過、候補条件の旧仕様1件失敗、実端末起動suiteは負例テストの書き戻しでsrcのmtimeがdistより新しいと判定され初期化失敗。全体の重複実行はせず、候補期待をstatuslineに合わせ、tsc -b --forceで再ビルドした。失敗対象を含む5ファイル8件が通過し、修正差分も独立レビュー通過。

最終対象の生出力：

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu


 Test Files  5 passed (5)
      Tests  8 passed (8)
   Start at  12:45:05
   Duration  4.06s (transform 63%, tests 25%, import 12%)

  Transform  |@sodashitsu/server| transforming modules took 3.63s · 59% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

E2Eは3件通過。WebスクリーンショットGit接続図とstatuslineを目視し収まりを確認。
