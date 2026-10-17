# Bob Shell / GitHub Copilot CLI コード監査

2026-10-17、Antigravity CLI 対応に合わせ、文書の記載だけでなく次の経路を確認した。新たな認証・課金する呼び出し・利用者設定の変更は行っていない。

| 経路 | 追跡箇所と結果 |
| --- | --- |
| プロセス検出 | `server/src/agent/agents.ts` の両 kind/alias、`ProcessMatcher.ts` の runtime 包みと親子 PID 判定が共通経路を通る。既存 ProcessMatcher テストが Bob の node 包みを検証する。 |
| working / idle / blocked | `assets/agent-detection/bob.toml`、`github-copilot-extra.toml` と herdr Copilot manifest を ManifestStore が読み込む。Bob のロケール非依存 spinner/承認、Copilot の送信直後 Working の追加ルールと既存 manifest テストを確認。 |
| 会話 ID / 再開 | `AgentIntegrationInstaller.ts` の Bob SessionStart / Copilot sessionStart、`assets/agent-hook-report.cjs` の snake/camel session ID、`protocol/src/messages.ts` の AgentIntegrationKind、`resumeCommand.ts` の両種別分岐を確認。 |
| 利用状況収集 | `usage/bobAdapter.ts` は readOnly SQLite の costs/env/updated_at、`usage/copilotEvents.ts` / `copilotAdapter.ts` は usage_record/checkpoint を読む。`composeServer.ts` が両アダプタを UsageService に登録済み。Bobcoin/AIC は credits、USD への変換なし。 |
| RPC / 配信 | `UsageService.ts` は adapter.kind の Map で引き当てる。`UsageFeed.ts` は kind の許容リストを持たず全種類を差分配信。`protocol/src/messages.ts` の agent.usage / agent.usage_watch と使用型も string kind を通す。 |
| Web / モバイル | `store/usage.ts` と `StoreAdapter.ts` が差分を受け、`DashboardView.vue` / `dashboardModel.ts` は全 agent pane を列挙。モバイルは同じ DashboardView と PaneInfoView を使用。Bob の表示名と Copilot の取得済み premiumRequests の表示に漏れを発見、修正した。 |
| TUI | `model/UsageModel.ts` / `SessionModel.ts` → `modes/UsageView.ts` の Dashboard/usageLines が全 kind を扱い、credits の単位と premiumRequests を表示する。コストソートは USD のみで Bobcoin と AIC は比較しない。 |
| ペイン標準 statusline | `protocol/src/statusline.ts` の statuslineSegments は kind 一致を確認し、credits / model / context / tokens / premiumRequests を共通整形。Bob/Copilot の既存回帰テストあり。Claude 専用 statusLine 包みは Claude 固有の入力を扱うため、Bob/Copilot には導入しない。 |
| アカウント枠 | 両アダプタに accounts() はない。ログに枠情報がないため、架空の枠・ゼロ・解除時刻は出さない。Web accountsByKind / PaneInfoView と TUI は提供された account.kind を汎用表示。 |
| 設定画面 | `web/src/components/SettingsDialog.vue` と `tui/src/settings/sections.ts` の連携種別に Bob/Copilot が存在。標準 statusline 設定は共通。会話本文/履歴の Claude/Codex 限定と Bob の fork 非対応は既存の能力制限であり、usage 表示を妨げない。 |

## 修正

- Web のダッシュボード種別フィルタ・pane 情報が Bob Shell を内部キー bob と表示していたので、表示名を追加。
- Web の pane 情報が Copilot の premiumRequests を表示していなかったので、取得できた場合のみ表示。0 は取得値として表示、undefined は行ごと非表示。ポップオーバーとモバイルダイアログ双方が同じ部品を使う。

## 文書と限界

`docs/bob-shell.md`、`docs/agent-usage.md` を参照した。これらが挙げる `.aidev/works/20261016-bob-shell` と `20261016-agent-usage-bob-copilot` は今回の latest main の worktree に存在しなかったため、過去 work の原記録は再確認できない。文書に示された既存 Linux 実機検証を今回の再実行と混同しない。Windows/macOS・Bob/Copilot の課金する実セッションは今回実行していない。

## 検証

11 ファイル 136 テスト成功。修正した 2 件は実装修正前にそれぞれ失敗することを確認した。生出力は `test-results-bob-copilot.md` に記録。全体 build/typecheck/test・最終独立レビュー・実ブラウザは本 work の統合検証に委ねる。

## 実 TUI で見つかった追加漏れと修正

実PTY検証により、Bob のように tokens.total を持たず tokens.input だけを返すアダプタでは、TUIダッシュボードとpane利用状況の合計が「—」、トークン並べ替えも未取得扱いになる既存漏れが見つかった。Antigravity の内訳だけの利用量にも同じ影響があった。UsageView.ts で既知の input/output/cacheRead/cacheWrite の和を fallback とし、表示2か所と並べ替えを修正。basis を維持し、none を0にしない。Web と同じ規則。

回帰テストは修正前3件失敗→修正後10件成功。再ビルドした実TUIで偽agyの85,000と、専用HOMEの合成Bob DBを使う偽bobの19,700/0.1180 Bobcoin/文脈7.3%を確認。detailsと負の対照生出力は `test-results-tui.md`。実CLI/API呼び出し・利用者設定/認証の変更は行っていない。
