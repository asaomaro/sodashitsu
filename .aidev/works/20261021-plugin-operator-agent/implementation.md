# プラグインから操作元のエージェントを使う

接続先Bのプラグインから、操作元AのClaude/Codexへ制作を依頼する。Bのファイル・スキル・コマンド・メモ・アプリ操作を固定したMCPで扱い、質問はAに表示する。

- `task.start` に `execution:operator`。BのCLI導入判定や端末作成を通さず、A利用者の起動確認を待つ。
- 初期指示はBのPJ内の64KiB以下のファイル。Aの専用ネイティブCLIへ初期プロンプトとして渡す。
- `task.status` と3秒間隔の状態通知、`task.prompt` と一意ファイルの受付・送信結果。idle/同instance/leaseを入力待ち行列内と書込直前に確認する。受信不明は再送しない。
- `remote_work` のplugin操作は、依頼元アプリ・プロセス世代・PJに固定。新 `work.agent_tool` はB側lease検証と実処理をまとめ、file/memoryの保存直前・exec開始直前にもguardする。既存schema検証も維持。
- ガイド: docs/plugin-agents.md。外部public_docsのaidevアプリは別PRで実装する。

## 点検

状態・プロトコル・失効の競合があるため差分全体の独立レビューを実施。idle確認の待ち行列競合、別RPC間の失効競合、同一ファイル再送競合、TTLのawait越え、memory名スキーマの迂回を修正。修正差分も再点検しAPPROVE。

レビュー記録: /workspaces/sodashitsu-check-logs/20261021-plugin-operator-agent/review.md
