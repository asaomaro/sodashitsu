# タスク: エージェントの利用状況（PR1: Claude Code の記録まで）

★ = 独立点検（`aidev taskcheck`。この環境では使えない見込み。差分全体の独立レビューで代える）を掛けるもの。

- [x] T1 ★ 読み口の共通化（`agent/safeFile.ts`。`SubagentTranscript.ts` を差し替え。窓の動きは変えない）。AC2
- [x] T2 protocol: `AgentUsage`・`AccountUsage`・`AgentUsageResult`・`agent.usage`。AC1・AC5
- [x] T3 ★ Claude の集計（`usage/claudeScan.ts`。重複・サブエージェント・増分・`cost-state`・壊れた行・大きな行・末尾だけ）。AC3
- [x] T4 ★ 記録の場所（`usage/claudeSource.ts`。根の下・名前・リンク・ハードリンク・FIFO・探索）。AC2
- [x] T5 ★ 方式（`usage/UsageService.ts`・`claudeAdapter.ts`・`methods/agent.ts`・`composeServer.ts`）。`pane.sock` に載せない。AC1・AC5・AC7
- [x] T6 フックのスクリプトと受け口（`transcriptPath`）。AC2
- [x] T7 `sodactl agent usage`。AC6
- [x] T8 試験（集計・場所・安全の結合・否定の対照 2 つ）。AC8
- [x] T9 文書（`docs/agent-usage.md`・`docs/sodactl.md`・`AGENTS.md`）。AC9
- [ ] T10 Codex の集計（AC4）。**次の PR**（`fix/codex-multi-pane` の取り込みの後）

---

# タスク: PR3 ダッシュボード（`feature/agent-usage-3`）

★ = 独立点検（差分全体の独立レビューで代える）を掛けるもの。

- [ ] T11 ★ 配信（protocol: `agent.usage_watch`・`agent.usage_changed`。server: `UsageFeed`・`ClientRecord.watchingUsage`・`WsGateway` の絞り・`composeServer` の配線・接続切れ・終了）。AC2
- [ ] T12 ★ 画面の一般化（`isAllowedOnNonBaseScreen`・`ActionDispatcher` の `openGraph`・`view.ts` のダッシュボードの開閉）。AC3
- [ ] T13 web の状態と配信の購読（`store/usage.ts`・`usage/UsageController.ts`・`StoreAdapter`・`main.ts`）。AC1・AC2
- [ ] T14 画面（`DashboardScreen`・アカウントの枠・一覧・並べ替え・絞り込み・行から pane へ・様式・キーボード）。AC1・AC5
- [ ] T15 モバイル（`DashboardDialog`・`PanePicker`・全体のメニュー）。AC4
- [ ] T16 試験（単体・E2E `dashboard.spec.ts`・否定の対照）。AC6
- [ ] T17 文書と絵。AC7
