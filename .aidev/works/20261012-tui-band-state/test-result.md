# 検証

対象5ファイル36テスト成功。端末版typecheck成功。30/100行の上下帯1行下限、通常パネル3行下限、D&Dで下端まで縮小、記号・配色・設定変更、状況のcompact/full表示を確認。

修正前に戻して5件失敗、修正を復元してcmp一致を確認。詳細文字欠けの修正も元に戻して1件失敗を確認しcmp一致で復元。

## negative control 生出力

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/layout/computeLayout.test.ts (14 tests | 2 failed) 12ms
   × bands can shrink to one row at either edge on a 30-row terminal 4ms
   × bands can shrink to one row at either edge on a 100-row terminal 1ms
 ❯ |@sodashitsu/tui| src/modes/UsageView.test.ts (4 tests | 1 failed) 24ms
   × dashboard shows live colored sidebar symbols in compact and full rows 4ms
 ❯ |@sodashitsu/tui| src/modes/GraphView.test.ts (4 tests | 1 failed) 1020ms
   × graph uses live sidebar state symbols and dot preferences 1005ms
 ❯ |@sodashitsu/tui| src/app/TuiApp.dockedViews.test.ts (11 tests | 1 failed) 1632ms
   × bottom band grows from its upper boundary and Escape restores its height 112ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/app/TuiApp.dockedViews.test.ts > bottom band grows from its upper boundary and Escape restores its height
AssertionError: expected 3 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 3

 ❯ src/app/TuiApp.dockedViews.test.ts:358:19
    356|   m("down", grown.y);
    357|   m("move", 49);
    358|   expect(box().h).toBe(1);
       |                   ^
    359|   expect(box().y).toBe(49);
    360|   m("up", 49);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  |@sodashitsu/tui| src/layout/computeLayout.test.ts > bands can shrink to one row at either edge on a 30-row terminal
 FAIL  |@sodashitsu/tui| src/layout/computeLayout.test.ts > bands can shrink to one row at either edge on a 100-row terminal
AssertionError: expected 3 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 3

 ❯ src/layout/computeLayout.test.ts:161:20
    159|     });
    160|     const band = r.panes.find((p) => p.paneId === "band")!.frame;
    161|     expect(band.h).toBe(1);
       |                    ^
    162|     expect(top ? band.y : band.y + band.h).toBe(top ? r.paneArea.y : r…
    163|   }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯

 FAIL  |@sodashitsu/tui| src/modes/GraphView.test.ts > graph uses live sidebar state symbols and dot preferences
AssertionError: expected ' ││Worker                ││          …' to contain '◐ Worker'

Expected: "◐ Worker"
Received: " ││Worker                ││                                                                         "

 ❯ src/modes/GraphView.test.ts:184:56
    182|   };
    183|   try {
    184|     await vi.waitFor(() => expect(render().rowText(5)).toContain("◐ Wo…
       |                                                        ^
    185|     const grid = render(),
    186|       x = grid.rowText(5).indexOf("◐");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯

 FAIL  |@sodashitsu/tui| src/modes/UsageView.test.ts > dashboard shows live colored sidebar symbols in compact and full rows
AssertionError: expected -1 to be greater than or equal to 0
 ❯ src/modes/UsageView.test.ts:108:15
    106|       s.includes("◐ Worker"),
    107|     );
    108|     expect(y).toBeGreaterThanOrEqual(0);
       |               ^
    109|     expect(grid.cell(1, y)?.fg).toBe(theme.ui("--soda-state-working"));
    110|   }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/5]⎯


 Test Files  4 failed (4)
      Tests  5 failed | 28 passed (33)
   Start at  17:13:52
   Duration  3.13s (tests 45%, transform 45%, import 10%)

  Transform  |@sodashitsu/tui| transforming modules took 2.66s · 45% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## 詳細文字欠け 生出力

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/modes/UsageView.test.ts (4 tests | 1 failed) 44ms
   × dashboard shows live colored sidebar symbols in compact and full rows 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/modes/UsageView.test.ts > dashboard shows live colored sidebar symbols in compact and full rows
AssertionError: expected ' ◐odex · — · 累計 10 · $—              …' to contain ' codex ·'

Expected: " codex ·"
Received: " ◐odex · — · 累計 10 · $—                                                                           "

 ❯ src/modes/UsageView.test.ts:125:52
    123|     expect(y).toBeGreaterThanOrEqual(0);
    124|     expect(grid.cell(1, y)?.fg).toBe(theme.ui("--soda-state-working"));
    125|     if (height === 24) expect(grid.rowText(y + 1)).toContain(" codex ·…
       |                                                    ^
    126|   }
    127|   symbols = false;

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
   Start at  17:15:04
   Duration  1.40s (transform 80%, import 16%, tests 3%)


```

## 最終検証

TUI全体672件成功・3件skip。TLS接続テストはsandboxのlisten制限でEPERMだったため権限付き再実行し3件成功。TUI force build成功。実PTY起動テスト1件成功。git diff --check成功。
