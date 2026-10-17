# T2/T3 独立 taskcheck

担当: 実装担当と別コンテキストの Bob/Copilot 監査エージェント。2026-10-17。実装は変更せず指摘と再点検のみ。

## 対象

- agent core: protocol session kind、SessionStart hook installer/asset、resumeCommand、AgentMonitor、composeServer の配線
- AntigravityStatusLineWrapper と statusLine asset、AntigravityUsageAdapter、AgentReportSocket の型/数値/状態受信
- 設定の原文復元、利用者の後続編集の保持、元 command/stdin/stdout/exit/signal の扱い、秘密・会話の送信除外
- 現在の pane/session/PID 帰属、終了/会話変更時の扱い、既存 Claude/Bob/Copilot の共通経路への影響

## 指摘と対応

1. **must / P1**: composeServer の agyUsageIntake sink が未定義の `monitor.noteReportedState` を呼んでいた。宣言は `agentMonitor`。型検査で失敗し、未検査実行では accepted report の callback が ReferenceError になる。実装担当が `agentMonitor` に修正。コード再点検で確認済み。
2. **should / P2**: AgentMonitor の報告状態に時刻/失効が無く、同一 instance/session では last working/blocked が manifest を永久上書きした。包みの解除・送信失敗後に状態が固定される。実装担当が at と 10 秒 TTL を追加。コード再点検で TTL 超過後は override せず manifest 判定へ戻ることを確認。state 欄の無い新報告による明示 clear も指摘し、実装担当が修正予定。

## 確認結果・制約

- metadata の公開数値だけを送るフィールド選別と受信側境界検査、UUID 限定、quota 単位維持、取得不能コスト省略は妥当。
- 通常の statusline 設定の原文復元と利用者の別設定の後続編集保持は既存 Claude wrapper と同じ方式。元の command がある場合は同じ stdin を受け元 stdout/exit を保持する構造。
- usage は UsageReportIntake の既存帰属判定を通り、種別の切り替えは明示分岐。新しい metadata が Claude の既存表示へ混入する配線は見つからなかった。
- 単体 server typecheck を実施したが protocol 旧 dist と TUI 未ビルドによるエラーがあり、統合型検査の証拠には使用しない（`/tmp/agy-taskcheck-typecheck.log`）。全体 build 後の typecheck と追加 AgentMonitor テストは実装担当が実行する。
- 時点の確認: P1 と TTL の修正はコード確認済み。欠損 state の clear、AgentMonitor テストの成功、最終全体独立レビューは引き続き必要。
- 実 CLI への model 呼び出し・認証変更・設定変更は本点検では行っていない。最終全体レビューの代替にはしない。

## 統合後の確認

state欠損clear実装済み。AgentMonitor の実行テストは誤session無視、working/blocked、state欠損clear、10秒TTL fallbackまで成功（/tmp/antigravity-monitor-final.log）。全体build/typecheck成功、独立全体レビューと修正差分の再レビューはreview.mdに記録済み。
