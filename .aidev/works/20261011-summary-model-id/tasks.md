# Codex要約のモデルID

実記録のtask_complete.errorで、GPT-6-LunaがChatGPTアカウントで未対応モデルとして400になっていることを確認。キャッシュのslugはgpt-6-luna、display_nameはGPT-6-Luna。表示名をそのままAPIへ渡していた。

- [x] CodexのGPT系モデルIDを小文字化し、独自モデル/Claudeを維持。安全な固定コードでモデル利用不可をWeb/TUI表示（独立点検対象）。
- [x] 回帰テストと負の対照、ビルド・型チェック・全体テスト。
- [x] 差分全体の独立レビュー（review_fork_multi、指摘なし）。

接続時のprefsApplyでsummarySettings/agentHeaderActionsが未反映だった別不具合も修正。回帰テスト・負の対照・ブラウザ観測を追加し再レビュー通過。

- [x] このペインの実RPCでinvalid_params「会話記録の行が読み取り上限を超えています」を確認。1MiB超行の省略と16MiB走査上限/50MiB範囲境界、Web/TUI省略表示を修正。回帰テスト・負の対照・全体テスト・実ブラウザ検証・独立レビューを実施。
