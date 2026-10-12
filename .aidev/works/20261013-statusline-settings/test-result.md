# 回帰検証

最終検証はすべて成功。

- `pnpm build`、`pnpm typecheck`、`pnpm smoke` 成功。
- 全体 Vitest: 632ファイル、10,687テスト成功（320.99秒）。
- Playwright `statusline.spec.ts`: 11テスト成功（24.2秒）。設定メニュー、即時反映、再読み込み後の保存、別クライアントの変更、390pxの設定画面と既存ビュー操作を検証。
- 端末設定メニューの保存、PTYへ入力を流さないこと、グラフの色分けを検証。
- 独立レビュー指摘の修正を再レビュー済み。`git diff --check` 成功。

表示項目・グラフ設定、端末のカラー表示、リモート設定反映、期間ラベル分類の製品処理4ファイルだけを修正前の挙動へ戻し、4テスト失敗を確認。修正済みコードをバイト一致で復元。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/protocol| src/statusline.test.ts (2 tests | 1 failed) 10ms
   × separates weekly, five-hour and other windows by duration or label 5ms
 ❯ |@sodashitsu/tui| src/modes/UsageColors.test.ts (1 test | 1 failed) 9ms
   × colors only the graph and percent green/yellow/red, with muted stale and unknown data 8ms
 ❯ |@sodashitsu/server| src/workspace/BuiltinViews.test.ts (1 test | 1 failed) 117ms
   × statusline follows the active pane for a tab and keeps a pane-scoped line pinned, using the colored HTML surface 115ms
 ❯ |@sodashitsu/web| src/store/prefsApply.test.ts (6 tests | 1 failed) 34ms
   ❯ applyPrefsToStores (5)
     × applies remote statusline changes and resets removed settings 13ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/protocol| src/statusline.test.ts > separates weekly, five-hour and other windows by duration or label
AssertionError: expected 'fiveHour' to be 'otherLimits' // Object.is equality

Expected: "otherLimits"
Received: "fiveHour"

 ❯ src/statusline.test.ts:21:54
     19|   expect(statuslineLimitKind({ label: "5h" })).toBe("fiveHour");
     20|   expect(statuslineLimitKind({ label: "枠", windowMinutes: 300 })).toBe…
     21|   expect(statuslineLimitKind({ label: "15 hours" })).toBe("otherLimits…
       |                                                      ^
     22|   expect(statuslineLimitKind({ label: "17 days" })).toBe("otherLimits"…
     23|   expect(statuslineLimitKind({ label: "5h", windowMinutes: 900 })).toB…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  |@sodashitsu/web| src/store/prefsApply.test.ts > applyPrefsToStores > applies remote statusline changes and resets removed settings
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/store/prefsApply.test.ts:65:53
     63|       },
     64|     });
     65|     expect(settings.statuslineSettings.fields.pane).toBe(false);
       |                                                     ^
     66|     expect(settings.statuslineSettings.fields.model).toBe(false);
     67|     expect(settings.statuslineSettings.graphs.weekly).toEqual({ visibl…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯

 FAIL  |@sodashitsu/server| src/workspace/BuiltinViews.test.ts > statusline follows the active pane for a tab and keeps a pane-scoped line pinned, using the colored HTML surface
AssertionError: expected '<style>body{margin:0;background:var(-…' not to contain 'Alpha'

Expected: "Alpha"
Received: "<style>body{margin:0;background:var(--soda-bg);color:var(--soda-fg);font:13px ui-monospace,monospace}.statusline{white-space:pre-wrap;overflow-wrap:anywhere;padding:2px 4px}.statusline [data-soda-color=name],.statusline [data-soda-color=active]{color:var(--soda-state-working,#8be9fd)}.statusline [data-soda-color=model]{color:var(--soda-accent,#bd93f9)}.statusline [data-soda-color=good]{color:var(--soda-state-done,#50fa7b)}.statusline [data-soda-color=warning]{color:var(--soda-warn-fg,#f1fa8c)}.statusline [data-soda-color=danger]{color:var(--soda-state-blocked,#ff5555)}.statusline [data-soda-color=muted]{color:var(--soda-state-idle,#888)}html,body{height:100%;overflow:hidden}#soda-display-root{box-sizing:border-box;height:100%;max-height:24px;padding:0;display:flex;align-items:center;overflow:hidden}.statusline{box-sizing:border-box;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:20px;padding:0 4px}</style><div class="statusline" data-soda-statusline><span data-soda-color="name">Alpha</span><span data-soda-color="muted"> · </span><span data-soda-color="name">codex</span><span data-soda-color="muted"> · </span><span data-soda-color="active">working</span><span data-soda-color="muted"> · </span><span data-soda-color="model">test-model</span><span data-soda-color="muted"> · </span><span data-soda-color="good">Context ▰▰▰▰▱▱▱▱▱▱ 42%</span><span data-soda-color="muted"> · </span><span data-soda-color="name">Tokens 100</span><span data-soda-color="muted"> · </span><span data-soda-color="good">codex 5h ▰▰▰▱▱▱▱▱▱▱ 25%</span><span data-soda-color="muted"> · </span><span data-soda-color="warning">codex 週 ▰▰▰▰▰▰▰▰▱▱ 75%</span></div>"

 ❯ src/workspace/BuiltinViews.test.ts:105:28
    103|     await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(2));
    104|     const configured = set.mock.calls.find((c) => c[1].name === "statu…
    105|     expect(configured).not.toContain("Alpha");
       |                            ^
    106|     expect(configured).not.toContain("test-model");
    107|     expect(configured).toContain("Context 42%");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯

 FAIL  |@sodashitsu/tui| src/modes/UsageColors.test.ts > colors only the graph and percent green/yellow/red, with muted stale and unknown data
AssertionError: expected 49871090 to be 38861435 // Object.is equality

- Expected
+ Received

- 38861435
+ 49871090

 ❯ src/modes/UsageColors.test.ts:17:34
     15|     paintUsageLine(grid, 1, row, "週 " + usageGauge(percent), theme, fg…
     16|     expect(grid.cell(1, row).fg).toBe(fg);
     17|     expect(grid.cell(4, row).fg).toBe(theme.ui(color));
       |                                  ^
     18|     expect(grid.rowText(row)).toContain(percent.toFixed(1) + "%");
     19|   }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯


 Test Files  4 failed (4)
      Tests  4 failed | 6 passed (10)
   Start at  08:30:11
   Duration  1.96s (transform 80%, import 13%, environment 4%, tests 3%)


```
