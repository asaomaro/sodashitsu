# 接続先の作業コンテキスト

ユーザー要求: 接続先のskillsを自動検出・必要時読み込みし、実行先を統一する。メモを接続先に残し、可能なら同種エージェントでresumeする。

- 呼出元paneにmachine UUID・workspace UUID・projectDir・agent kindを保存する。CLI `work bind` は接続先を検証し、catalogと操作手順を返す。別paneへ漏らさない。
- `work skills/skill/file/exec/memory` は毎回bindingから同じ接続先を選ぶ。切断・PJ変更・pane再利用はエラー、ローカルへのフォールバックなし。
- スキルは固定のユーザー/プロジェクト/プラグインディレクトリを上限付き探索。一覧はmetadataだけ、SKILL.md・付属ファイルは必要時読む。読み込みでプログラムを実行しない。
- agentの組込みRead/Edit/Shell自体を書き換えることはできない。返す実行指示とsodactl skillで、対象PJの操作はwork経由と明記。ファイル読み書き/検索は既存workspace.toolsの安全な相対path・version照合を再利用する。
- メモは対象PJの`.soda/agent-memory/<source-pane>/`に保存。既存AGENTS.md/CLAUDE.md/グローバルメモ・認証設定を上書きしない。引継ぎ時には既知のプロジェクト固有メモもコピーする。
- Claude/Codexの主会話記録は呼出元paneの既知sessionだけから取得。小さいchunkで転送、上限32MiB、完結JSONLのみ、ハッシュ照合。接続先の既存native履歴がある場合は拒否。途中切断はnative履歴を作らない。
- native履歴は内部形式なのでバージョン差・MCP・ツール・過去の絶対pathの互換性は保証しない。resumeコマンドとメモの場所を返し、勝手にエージェントを起動しない。全履歴を移せない時もメモ保存は別操作で使える。

一次資料: https://code.claude.com/docs/en/skills 、 https://code.claude.com/docs/en/memory 、 https://code.claude.com/docs/en/how-claude-code-works 、 https://learn.chatgpt.com/docs/build-skills 、 https://learn.chatgpt.com/docs/developer-commands?surface=cli 。Codexのresumeは作業ディレクトリを-Cで明示できる。ローカルCLI helpでも確認。
