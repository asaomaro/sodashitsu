# 独立最終レビュー

2026-10-17。実装担当とは別コンテキストで、origin/main `72d486a5` からの全未コミット差分と新規コード・テストを点検した。製品コードの変更、コミット、PR、handoff は行っていない。

## 結果

修正を要求する実不具合は見つからなかった。統合検証は実装担当の結果待ちであり、この点検を build/typecheck/test/E2E 成功の代わりにはしない。

## 確認した経路

- requirements/design/research/taskcheck/bob-copilot-audit と実装を照合した。公式 statusline と hooks の原文を再取得し、設定先、named hook の SessionStart、camelCase conversationId、statusline の公開メタデータ項目を確認した。
- 検出・起動・SessionStart・UUID 制限付き再開・argv による会話参照・前面 PID の帰属・利用報告の保留/再判定・pane/session 一致を追跡した。Antigravity の会話閲覧と fork を追加する変更は無く、既存の能力制限を維持する。
- statusline の設定を Claude と分離し、利用者の明示操作時に導入すること、元の command/設定を保持すること、無い command の場合の stack_with_default、解除時の元の値の復元と別項目の後続編集保持を確認した。壊れた設定と Windows の扱い、sidecar と引数の復元元も点検した。
- wrapper の送信フィールド選別、数値/長さ上限、元の stdin/stdout/終了コード/信号処理、IPC 受信境界を確認した。メール・認証情報・会話本文は送信フィールドに含まれない。利用状況は文脈内という数え方を保ち、未取得コスト/effort とアカウント枠を捏造しない。
- Web/モバイル/TUI の共有 usage 経路、pane 情報、設定、標準 statusline を確認した。Bob の表示名と Copilot premiumRequests の修正は未取得値を表示しない条件を保つ。追加 E2E はブラウザの DOM/描画で結果を判定する。
- T2/T3 の指摘に対する agentMonitor 名の修正、報告状態の 10 秒 TTL、state 欠損報告による明示 clear をコードで確認した。

## 検証の限界

全体テストは実装担当が実行中のため重複実行しない。実 CLI の課金する呼び出し、利用者の設定/認証の変更、Windows/macOS の実機検証は行っていない。実 CLI statusline payload の受信と会話再開の実証は research の未検証事項のまま。追加の AgentMonitor テストは TTL を検証するが、state 欠損による clear 自体を直接は検証していない（コードは確認済み）。

公式原文: [Status line customization](https://antigravity.google/docs/cli/statusline/)、[Lifecycle hooks](https://antigravity.google/docs/hooks)。

## 初回レビュー後の修正差分の再レビュー

2026-10-17。同じ独立レビュー担当が、wrapper の contextTokens 算出、TUI UsageView の既知内訳表示/並べ替え、追加回帰テスト、設定画面テスト、AgentIntegrationService の種別分離テスト、製品文書の追記を再点検した。

- wrapper は入力・キャッシュ作成・キャッシュ読取の3カウンタがすべて有効な場合だけ contextTokens を送る。欠損を0として完全なコンテキスト合計を作らず、既知の個別カウンタはそのまま送る。回帰テストは欠損キャッシュと contextTokens の非送信を確認する。
- UsageView の totalTokens は明示の total を優先し、無ければ既知の内訳の和を使う。既存 Web ダッシュボードと同じ規則で、詳細・ダッシュボード行・トークン順の3か所に適用する。0 と未取得を区別し、全項目未取得なら「—」を保つ。これは表示用の既知内訳の和であり、wrapper の contextTokens を補完する処理ではない。
- 追加テストは agy/Bob の表示と並べ替え、明示 total 優先、0/未取得を確認する。TUI 担当から、修正前3件失敗・修正後10テスト成功と、再ビルド後の偽 agy の実PTY表示 `85,000` の確認報告を受けた（本レビュー担当は重複実行していない）。
- 設定画面の行数11への変更、agy statusline 導入要求の kind 検証、Claude と agy の操作分離テストは実装に対応する。製品文書は取得経路と未検証の実CLI操作を区別する。

この修正差分にも、追加の修正を要求する実不具合は見つからなかった。最終全体テストの結果は実装担当の記録に委ねる。

## 標準 statusline の最終小修正の再レビュー

2026-10-17。`protocol/src/statusline.ts` の tokens 表示と対応回帰テストを再点検した。明示の有限な total を優先し、無ければ有限な入力/出力/キャッシュ読取/作成の既知内訳を合算する。すべて未取得なら表示を足さず、取得済み0は表示する。既存の pane と usage の kind 一致条件と設定の tokens 有効/無効条件を維持する。context basis は `Context tokens` と表示し、累計と混同しない。

Bob/agy の内訳のみの表示と全欠損の非表示を確認する回帰テスト、および `test-results.md` の修正前失敗ログを確認した。本体コードに追加の修正要求はない。既存の `statusline.test.ts:67` は context basis の旧期待 `Tokens 1k` が残り、新表示 `Context tokens 1k` への期待更新が必要なことを実装担当へ連絡した。テスト実行は最終統合検証と重複させていない。

再確認: 上記期待は `Context tokens 1k` に修正済み。コードを再読し、実装担当から同ファイル全11テスト成功の報告を受けた。この小修正について残る修正要求はない。

## 最終 E2E の固定期待の同期

2026-10-17。`packages/e2e/src/specs/statusline.spec.ts` の order 配列に `otherLimitsReset` を追加する1行差分を確認した。製品の既定フィールド順（fiveHourReset → otherLimitsReset → weeklyReset）に期待を同期する変更で、実際のブラウザ観測の判定を緩める変更ではない。追加の修正要求はない。実装担当から、この同期後の該当ブラウザテスト1件成功（7.6秒）、他9件も同じ最終buildで成功との報告を受けた。重複実行はしていない。
