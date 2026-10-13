# 検証

- 全体build/typecheck成功。
- 全体Vitestは639ファイル・10,702件を実行し、10,689件成功、13件失敗。新しい利用状況の自動購読に対する旧harnessの空応答、削除済みStatuslineビューを使うfixture、非表示statusline DOMによる兄弟順変更、GraphViewの一時的タイムアウトを検出。
- harnessはagent.usageの実際の契約に合う空データを既定応答にし、ビュー関連テストはfilesまたは独立したtest:bandプラグインへ移行。エージェントがいないWebペインではstatusline DOMを作らないよう修正した。
- 修正後Web/TUIの全266ファイル・4,261件成功。GraphView、帯のfold/move/resize/close、実SGRクリック、メモ/ToDo、サイドバー、数字ショートカットを含む。server/protocolの移行・formatterを含む関連40件も成功。全体のserverテストは繰り返さず、影響する全UIを再実行した。
- Playwright statusline.spec.ts 8件成功（35.8秒）。標準下部配置、設定保存/順序/k表記、live幅変更/上限、再読込、390pxモバイル、旧ビューに依存しない帯/パネル操作を確認。最後のWeb条件修正後nativeケース1件も再成功（6.8秒）。desktop/mobile screenshotを目視。
- 作業フォルダ外worktreeをcwdに今回ビルドのsmoke.jsを起動し、実サーバー・シェル・ブラウザのsmoke: PASS。
- 独立レビューと指摘修正の再レビュー完了。残る必須指摘なし。

## 修正前失敗の生出力

独立レビュー指摘に対し、修正前実装のまま追加したテストを走らせて失敗を確認し、その後修正した。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/protocol| src/statusline.test.ts (5 tests | 1 failed) 14ms
   × uses the configured agent name as the pane name 7ms
 ❯ |@sodashitsu/server| src/session/SessionModel.statusline.test.ts (2 tests | 2 failed) 7ms
   × migrates old statusline views and only removes unused virtual anchors 5ms
   × keeps the display anchor used by an app perspective when removing only its statusline 1ms
 ❯ |@sodashitsu/tui| src/app/PaneStatuslines.test.ts (2 tests | 1 failed) 12ms
   × scrolls in both directions and stops at the first full-width character that will not fit 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/protocol| src/statusline.test.ts > uses the configured agent name as the pane name
AssertionError: expected 'Codex' to be 'Writer' // Object.is equality

Expected: "Writer"
Received: "Codex"

 ❯ src/statusline.test.ts:48:94
     46| it("uses the configured agent name as the pane name", () => {
     47|  const pane = { label: null, agent: { kind: "codex", label: "Codex", n…
     48|  expect(statuslineSegments(pane, undefined, [], loadStatuslineSettings…
       |                                                                                              ^
     49| });
     50|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  |@sodashitsu/server| src/session/SessionModel.statusline.test.ts > migrates old statusline views and only removes unused virtual anchors
AssertionError: expected 'unused' to be undefined

- Expected:
undefined

+ Received:
"unused"

 ❯ src/session/SessionModel.statusline.test.ts:10:44
      8|   expect(model.getTab("t")!.views!.map((v) => v.id)).toEqual(["kept"]);
      9|   expect(model.getPane("unused")).toBeUndefined();
     10|   expect(model.getTab("t")!.displayPaneId).toBeUndefined();
       |                                            ^
     11|   expect(model.getPane("real")).toBeDefined(); expect(model.getPane("s…
     12|   expect(data.tabs[0]!.views).toHaveLength(4); // migration does not m…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯

 FAIL  |@sodashitsu/server| src/session/SessionModel.statusline.test.ts > keeps the display anchor used by an app perspective when removing only its statusline
AssertionError: expected undefined to be true // Object.is equality

- Expected:
true

+ Received:
undefined

 ❯ src/session/SessionModel.statusline.test.ts:18:40


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯

 FAIL  |@sodashitsu/tui| src/app/PaneStatuslines.test.ts > scrolls in both directions and stops at the first full-width character that will not fit
AssertionError: expected '⋮ bc · │' to be '⋮ 123日│ ' // Object.is equality

Expected: "⋮ 123日│ "
Received: "⋮ bc · │"

 ❯ src/app/PaneStatuslines.test.ts:43:19
     41|  expect(screen()).not.toBe(first);
     42|  controller.handle({ kind: "mouse", action: "wheel", button: 64, x: bo…
     43|  expect(screen()).toBe(first);
       |                   ^
     44| });
     45|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯


 Test Files  3 failed | 2 passed (5)
      Tests  4 failed | 33 passed (37)
   Start at  12:58:12
   Duration  6.40s (tests 60%, transform 34%, import 6%)

  Transform  |@sodashitsu/tui| transforming modules took 2.15s · 84% of tracked time, re-done on every run
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

 ❯ |@sodashitsu/tui| src/app/PaneStatuslines.test.ts (2 tests | 1 failed) 11ms
   × scrolls in both directions and stops at the first full-width character that will not fit 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/app/PaneStatuslines.test.ts > scrolls in both directions and stops at the first full-width character that will not fit
AssertionError: expected '⋮ 1234a│' not to contain 'a'

Expected: "a"
Received: "⋮ 1234a│"

 ❯ src/app/PaneStatuslines.test.ts:39:77
     37|  controller.adjust(layout); const box = layout.panes[0]!, y = box.cont…
     38|  const screen = () => { const grid = new Grid(100, 30); controller.ren…
     39|  const first = screen(); expect(first).toContain("1234"); expect(first…
       |                                                                             ^
     40|  controller.handle({ kind: "mouse", action: "wheel", button: 65, x: bo…
     41|  expect(screen()).not.toBe(first);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
   Start at  12:58:45
   Duration  1.18s (transform 81%, import 18%, tests 1%)

```

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/app/PaneStatuslines.test.ts (2 tests | 1 failed) 28ms
   × scrolls in both directions and stops at the first full-width character that will not fit 16ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/app/PaneStatuslines.test.ts > scrolls in both directions and stops at the first full-width character that will not fit
AssertionError: expected '⋮      │' to contain 'Hi'

Expected: "Hi"
Received: "⋮      │"

 ❯ src/app/PaneStatuslines.test.ts:48:19
     46|  prefs.apply({ statuslineSettings: loadStatuslineSettings({ columns: 8…
     47|  const short = computeLayout({ cols: 100, rows: 30, sidebarVisible: fa…
     48|  expect(screen()).toContain("Hi");
       |                   ^
     49| });
     50|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
   Start at  12:59:08
   Duration  1.89s (transform 80%, import 18%, tests 2%)

```
