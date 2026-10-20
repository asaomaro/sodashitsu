# work agent

- [x] 接続先pane起点の要求（PC/PJ/実体を固定）。再開履歴から作業先を変更しない。
- [x] 操作元の明示起動から固定scope IPC proxyを作り、ローカルCLIに一般認証cookieを渡さない。
- [x] Claude/Codex起動・argv継承・専用MCP・remote規約/skills/memory読込。
- [x] Web要求受付、CLI受付、利用手順。
- [x] argv/認可/切断/PJ変更/実通信を検証。
- [x] 独立レビュー（安全・状態・プロトコルを対象）、修正再レビュー。

## 決定

Bで `sodactl work agent claude --resume` / `codex resume --last` を実行。BにCLI本体は不要。AのWebまたはCLIで起動要求を受け付け、Aの認証済みClaude/Codexを新paneに起こす。BからAを勝手に実行する権限を増やさないため、Aで起動ボタンを押す。メモはBの起動pane単位に残す。固定scope親proxyだけが一般認証済みmachine channelを保持し、MCP子へはそのscopeのみの能力を渡す。OS同一ユーザーへの機密隔離を保証する機能ではない。

## 検証と独立点検

状態・保存復元・プロトコル・認可・ネイティブツール境界を独立点検の対象とした。最終レビューは実装と別コンテキストで実施し、修正差分も再レビューした（review.md）。文書と表示部品は全体差分のレビューにまとめた。

既存のremote work/execは先行PR #180として分離。起動機能はmainから独立したworktreeで検証し、元の作業フォルダにあったdesktop/LAN/preview等の変更を混ぜない。

## 再開と実行先

会話履歴からPC/PJを復元する機能は作らない。Bの起動paneで作業先を毎回決める。Aのネイティブ履歴とBのメモを別に扱う。A再起動後のplain native resumeは永続マーカーで抑止し、Bから再要求して専用MCPを再構成する。
