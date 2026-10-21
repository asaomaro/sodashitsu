# 検証記録

2026-10-21。独立worktree docs/remote-work-memory-guidance で既存の未コミット変更を混ぜずに実装。5ファイルの説明変更のみ。

- CLI typecheck / build: PASS。
- skill.test.ts / workAgent.test.ts / WorkContext.test.ts: 3ファイル25件PASS。
- docs/skill/MCP説明のJSON例12件を既存WorkAgentTool schemaで検証。versionプレースホルダーだけを64桁に置換。すべてPASS。
- 一時フォルダの実WorkContextで、一覧→decisions.md作成（versionなし）→read→最新versionで更新→readbackのtext/version一致を確認。
- 古いversionの更新拒否後も、同じcontextでinspect/list/readが成功し、保存内容が変わらないことを確認。
- git diff --check: PASS。
- 元の作業フォルダにはこの5ファイルの差分だけを適用し、CLIを再ビルド。稼働中のサーバやエージェントを再起動せず、実環境のメモも変更しない。

詳しい出力は /workspaces/sodashitsu-check-logs/20261021-memory-guidance/。実行挙動を変えないため、新しい文字列一致テストや全体テストの再実行は追加しない。
