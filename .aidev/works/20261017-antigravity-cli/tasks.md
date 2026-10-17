# タスク

- [x] T1 導入済みCLIと公式資料の確認、安全起動
- [x] T2 kind/session/hook/resume/manifest と能力定義（壊れやすい: taskcheck対象）
- [x] T3 statusline wrapper・安全な受信・usage/account adapter（壊れやすい: taskcheck対象）
- [x] T4 Web/TUI設定・利用状況/statusline表示、Bob/Copilot監査（cross）
- [x] T5 回帰負の対照、build/typecheck/全体test、ブラウザ/TUI/smoke
- [x] T6 実装と別コンテキストで独立レビュー、修正差分の再レビュー

全体testは10,936成功・mainと同じ既知1失敗。pane-info E2E既知3失敗もmainで再現。詳細はtest-results.md。
