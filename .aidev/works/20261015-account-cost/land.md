# 着地（2026-10-16）

利用者が指定した `/tmp/claude-1000/-workspaces-sodashitsu/7d2b2736-42c2-4015-88db-8c7048c055ba/scratchpad/account-cost-land.md` に従い、コスト一覧だけをコミットして最新mainを取り込み、PRを作成する。PRのマージ・handoffは監督が行うため、ここでは実施しない。

## コミットと統合

- ブランチ: `feature/account-cost`（元のHEAD `3f6b14f3`）。
- `3e476030`: アカウントのコスト一覧のみ。以前の独立worktreeの26ファイルとバイト一致を確認し、指定してステージした。
- `da653694`: `origin/main`（`11b055da`、#163〜#167）をmerge。
- `UsageView.ts`のimport競合は`formatUsageCredits`と`AccountCostResult`を両方残した。
- `UsageView.test.ts`の末尾競合はコスト一覧2テストと非USDクレジットのテストを両方残した。
- その他のコスト一覧ファイル（`messages.ts`・`agent-usage.md`など）は自動マージ。
- #164の直接操作・キー中継・フォーカス退避、#166のBob/Copilotアダプタ・クレジット表示を保持。コミット済みの該当本体はorigin/mainとの差分が空。UsageViewの既存costText経路も保持。
- 独立レビュー`review_account_cost`で統合後の差分を再点検し、阻害事項なし。

## コミットに含めず残したもの

以下9ファイルは別作業としてstashに退避し、main取り込み後に復元した。

- `docs/display.md`
- `docs/plugin-packages.md`
- `packages/server/src/agent/agentInput.test.ts`
- `packages/server/src/agent/agentInput.ts`
- `packages/web/public/display-view/script.html`
- `packages/web/src/components/DisplayFrame.vue`
- `packages/web/src/components/DisplayFrameScript.test.ts`
- `packages/web/src/display/frameMessages.ts`
- `packages/web/src/display/scriptHost.test.ts`

復元時の`docs/display.md`の競合は、mainの「埋め込みを拡張の面だけに限定する」説明を維持し、別作業の外部リンクの説明を追記して解消した。他の8ファイルは自動復元。`.claude/`・`.soda/`も未追跡のまま残しており、PRに含めない。

## 検証

- `pnpm build`: 別作業を復元した状態と、別作業を退避したPRの状態で成功。
- `pnpm typecheck`: 成功。
- コスト一覧の従来317件を含むserver usage/methods・TUI UsageView/UsageModel・Web dashboard/store/display/usage・DisplayFrame/Script/Direct/PluginView: **740件通過・既知の1件を除外**（62ファイル）。除外は指定されたagent.prompt「本文と Enter を 2 部分にして1000ms…」のみ。
- 別作業を戻した状態では上記が743件通過・1件失敗・1件除外。失敗は別作業のviewportMaximize feature通知と、既存DisplayFrame.test.tsのdisplay-init完全一致期待の不一致。別作業の修正は依頼外のため行わず、PRの状態では同じ既存テストも通過することを確認した。
- ブラウザE2E: アプリ直接操作・キー中継・フォーカス退避・面の埋め込み範囲・コスト一覧の計13件通過。PRの状態でも、コスト一覧のデスクトップ/モバイル往復と埋め込み範囲2件の計3件が通過。さらにPRの状態でメイン画面の直接操作・prefix+n中継の2件も通過。
- 統合後の独立レビュー: 阻害事項なし。
- コスト一覧の以前の負例と起動確認は`test-result.md`を参照。今回は稼働中サーバーへのhandoffを行わない。

PR用の検証のため再退避した別作業9ファイルは、検証完了後に復元済み。復元後の内容をstashに保存した内容と比較し、9ファイルすべてのバイト一致を確認した。
