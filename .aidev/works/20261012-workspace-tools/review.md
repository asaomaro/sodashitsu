# 独立レビュー

- backend/状態/履歴: review_summary_cache。ファイルの範囲・保存競合・Git subfolder/pathspec・PJ変更と非同期応答を点検。指摘を修正し再レビュー通過。
- Web/TUI: review_history_usage。追加先固定・検索行への移動・未保存状態・古い差分応答・モバイル配置・狭いペインの操作収納を点検。指摘修正後の差分も再レビュー通過。
- 選択履歴の未適用入口（mainのマシン移動、GotoPicker）を共通selectWorkspace/preferredPaneへ統一。無効な対象のfallback・Web/TUIの往復テストを再点検し追加指摘なし。
- testsの旧fixtureではpaneを登録せず存在しないidへfocusしていたため、実在paneを登録して検証を維持。ボタンのindexに依存するsplit検証はright actionの検出へ変更。
