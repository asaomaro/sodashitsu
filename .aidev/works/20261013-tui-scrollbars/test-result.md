# 検証

端末版66ファイル711テスト成功。端末版typecheck/build成功。別作業のserver/web変更は本作業の対象外。表示面に限定した確認で、実Windows Terminalの目視は行っていない。

修正前へ製品側20ファイルだけ戻し、5テスト失敗を確認。固定コードをバイト一致で全ファイル復元。最終8回帰テスト成功。全体テストは再実行せず、復元確認と関連テストで確認。

対象: Spaces/Agents各独立ドラッグ、溝クリック、つまみ内位置の維持、範囲外へのドラッグと解放、Help窓のサイズ維持、ドック済み右パネル/上帯のサイズ維持と領域外release、別窓割込みを想定したrelease、Plugin一覧の先頭/末尾復帰。

## 修正前

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/modes/ScrollBar.test.ts (3 tests | 1 failed) 14ms
   × scrolls the visible help window without resizing or closing it, including outside-window release 8ms
 ❯ |@sodashitsu/tui| src/modes/PluginPackages.test.ts (2 tests | 1 failed) 79ms
   × scrollbar returns the candidate list to its first row without opening a review 63ms
 ❯ |@sodashitsu/tui| src/app/TuiApp.scrollbars.test.ts (3 tests | 3 failed) 338ms
   × scrolls Spaces and Agents independently by thumb drag without switching workspace or resizing sidebar 81ms
   × docked right scrollbar keeps capture outside the view and releases without resizing 124ms
   × docked band-top scrollbar keeps capture outside the view and releases without resizing 131ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/app/TuiApp.scrollbars.test.ts > scrolls Spaces and Agents independently by thumb drag without switching workspace or resizing sidebar
AssertionError: expected undefined to be defined
 ❯ src/app/TuiApp.scrollbars.test.ts:30:20
     28|       )!;
     29|     const spaces = bar("spaces");
     30|     expect(spaces).toBeDefined();
       |                    ^
     31|     h.io.type(mouse(0, spaces.x, spaces.y));
     32|     h.io.type(mouse(32, spaces.x, spaces.track.y + spaces.track.h - 1)…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  |@sodashitsu/tui| src/app/TuiApp.scrollbars.test.ts > docked right scrollbar keeps capture outside the view and releases without resizing
AssertionError: expected ' 端末 グラフ 状況 予約   │ t1   +             …' to contain 'FILE-79'

- Expected
+ Received

- FILE-79
+  端末 グラフ 状況 予約   │ t1   +                                                              [ビュー＋] session: work
+  ▾ Spaces     開いた順   │┌─ pane p1 ───────────────────────────────[⋮][+][│][─][□][×]┐⠿ ファイルツリー      [⋮] [-] [×]
+      w1                  ││                                                           │読込中…
+                          ││                                                           │· FILE-0
+                          ││                                                           │· FILE-1
+                          ││                                                           │· FILE-2
+                          ││                                                           │· FILE-3
+                          ││                                                           │· FILE-4
+                          ││                                                           │· FILE-5
+                          ││                                                           │· FILE-6
+                          ││                                                           │· FILE-7
+                          ││                                                           │· FILE-8
+                          ││                                                           │· FILE-9
+                          ││                                                           │· FILE-10
+                          ││                                                           │· FILE-11
+                          ││                                                           │· FILE-12
+                          ││                                                           │· FILE-13
+                          ││                                                           │· FILE-14
+                          ││                                                           │· FILE-15
+                          ││                                                           │· FILE-16
+                          ││                                                           │· FILE-17
+                          ││                                                           │· FILE-18
+                          ││                                                           │· FILE-19
+                          ││                                                           │· FILE-20
+                          ││                                                           │· FILE-21
+                          ││                                                           │· FILE-22
+                          ││                                                           │· FILE-23
+                          ││                                                           │· FILE-24
+  ＋新規 ⋯           🔔0  ││                                                           │· FILE-25
+                        « │└───────────────────────────────────────────────────────────⋯Enter 開く · / 名前検索 · Ctrl+G

 ❯ src/app/TuiApp.scrollbars.test.ts:110:22
    108|       h.app.renderNow();
    109|       const bottom = await h.screen();
    110|       expect(bottom).toContain("FILE-79");
       |                      ^
    111|       expect(app.lastLayout.panes.find((p) => p.paneId === "view:files…
    112|       // Release outside the content must end capture; a subsequent mo…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯

 FAIL  |@sodashitsu/tui| src/app/TuiApp.scrollbars.test.ts > docked band-top scrollbar keeps capture outside the view and releases without resizing
AssertionError: expected ' 端末 グラフ 状況 予約   │ t1   +             …' to contain 'FILE-79'

- Expected
+ Received

- FILE-79
+  端末 グラフ 状況 予約   │ t1   +                                                              [ビュー＋] session: work
+  ▾ Spaces     開いた順   │⠿ ファイルツリー 読込中…                                                           [⋮] [-] [×]
+      w1                  │                 · FILE-0
+                          │                 · FILE-1
+                          │                 Enter 開く · / 名前検索 · Ctrl+G Grep · p パス · e 編集 · s ステー
+                          │┌─ pane p1 ────────────────────────────────────────────────────────────────[⋮][+][│][─][□][×]┐
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+  ＋新規 ⋯           🔔0  ││                                                                                            │
+                        « │└────────────────────────────────────────────────────────────────────────────────────────────⋯

 ❯ src/app/TuiApp.scrollbars.test.ts:110:22
    108|       h.app.renderNow();
    109|       const bottom = await h.screen();
    110|       expect(bottom).toContain("FILE-79");
       |                      ^
    111|       expect(app.lastLayout.panes.find((p) => p.paneId === "view:files…
    112|       // Release outside the content must end capture; a subsequent mo…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯

 FAIL  |@sodashitsu/tui| src/modes/PluginPackages.test.ts > scrollbar returns the candidate list to its first row without opening a review
AssertionError: expected '                                     …' to contain 'Candidate-29'

- Expected
+ Received

- Candidate-29
+
+  ┌─ プラグインパッケージ ─────────────────────────────────┐
+  │                                                        │
+  │ ▶ Candidate-0 1.0.0 · ユーザー                         │
+  │   Candidate-1 1.0.0 · ユーザー                         │
+  │   Candidate-2 1.0.0 · ユーザー                         │
+  │   Candidate-3 1.0.0 · ユーザー                         │
+  │   Candidate-4 1.0.0 · ユーザー                         │
+  │   Candidate-5 1.0.0 · ユーザー                         │
+  │ ↑↓ 選択 · Enter 確認 · r 再検索 · Esc 閉じる           │
+  └────────────────────────────────────────────────────────┘
+

 ❯ src/modes/PluginPackages.test.ts:84:82
     82|     dialog.handleMouse({ action: "up", button: 0, x, y: 30 });
     83|     grid = paint();
     84|     expect(Array.from({ length: grid.h }, (_, y) => grid.rowText(y)).j…
       |                                                                                  ^
     85|       "Candidate-29",
     86|     );

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/5]⎯

 FAIL  |@sodashitsu/tui| src/modes/ScrollBar.test.ts > scrolls the visible help window without resizing or closing it, including outside-window release
AssertionError: expected undefined to be defined
 ❯ src/modes/ScrollBar.test.ts:72:15
     70|     x: Array.from({ length: grid.w }, (_, x) => grid.cell(x, y).ch).in…
     71|   })).find((p) => p.x >= 0)!;
     72|   expect(bar).toBeDefined();
       |               ^
     73|   window.handleMouse({ action: "down", button: 0, ...bar });
     74|   window.handleMouse({ action: "move", button: 32, x: 99, y: 39 });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/5]⎯


 Test Files  3 failed (3)
      Tests  5 failed | 3 passed (8)
   Start at  00:12:22
   Duration  2.58s (transform 75%, import 16%, tests 8%)

  Transform  |@sodashitsu/tui| transforming modules took 3.82s · 75% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## 修正後

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu


 Test Files  3 passed (3)
      Tests  8 passed (8)
   Start at  00:12:55
   Duration  2.67s (transform 73%, import 16%, tests 11%)

  Transform  |@sodashitsu/tui| transforming modules took 3.46s · 73% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```
