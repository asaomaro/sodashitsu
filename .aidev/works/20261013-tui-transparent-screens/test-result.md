# 検証

3画面の実 Grid を描画し、透過 OFF→ON→OFF の背景、タイトル、グラフの操作ボタンの強調、利用状況ダイアログの不透過を確認。

## 負の対照

製品修正3箇所だけを戻して実行。3ケースとも失敗。終了後に元のバイト列に戻し、一致を assert で確認。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /tmp/sodashitsu-plugin-components

 ❯ |@sodashitsu/tui| src/modes/ScreenTransparency.test.ts (3 tests | 3 failed) 32ms
   × graph uses the terminal default background when transparency is toggled, preserving highlights 21ms
   × usage uses the terminal default background when transparency is toggled, preserving highlights 4ms
   × schedules uses the terminal default background when transparency is toggled, preserving highlights 4ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/modes/ScreenTransparency.test.ts > graph uses the terminal default background when transparency is toggled, preserving highlights
 FAIL  |@sodashitsu/tui| src/modes/ScreenTransparency.test.ts > usage uses the terminal default background when transparency is toggled, preserving highlights
 FAIL  |@sodashitsu/tui| src/modes/ScreenTransparency.test.ts > schedules uses the terminal default background when transparency is toggled, preserving highlights
AssertionError: expected 36186678 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 36186678

 ❯ src/modes/ScreenTransparency.test.ts:38:35
     36|       const bg = transparent ? DEFAULT_COLOR : theme.ui("--soda-menu-b…
     37|       // Both blank space and the screen title must use the setting.
     38|       expect(grid.cell(2, 25).bg).toBe(bg);
       |                                   ^
     39|       expect(grid.cell(3, 2).bg).toBe(bg);
     40|       if (screen === "graph") {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯


 Test Files  1 failed (1)
      Tests  3 failed (3)
   Start at  21:51:26
   Duration  2.37s (transform 82%, import 16%, tests 1%)

```

## 最終確認

- TUI build / typecheck: PASS
- TUI全テスト: 73 files / 721 tests PASS
- git diff --check: PASS
