# Antigravity CLI 調査（2026-10-17）

## 実体と安全な起動

- 導入済みコマンドは `/home/asaomaro/.local/bin/agy`。`readlink -f` は同じファイルを指し、`file` は Linux x86-64 native ELF、`agy --version` は `1.4.0` を返した。IDE 起動ランチャーではなく、単独の対話 CLI。
- `--help` の実出力で `--conversation ID`、`--continue`、`--model`、`--effort low|medium|high|xhigh|max`、`--print`、`--output-format text|json|stream-json`、`--log-file` を確認した。会話 fork を指定する起動フラグは help にない。
- PTY で `/tmp` と既存の信頼済み workspace から無入力で起動し、SIGINT で終了コード 0 を確認。実画面に Antigravity、Gemini、プロンプト `>` を観測した。未信頼ディレクトリでは信頼の画面が出た。信頼を追加せず、ユーザーの発言・モデル呼び出し・認証変更は行っていない。
- working/blocked の実画面、モデル実応答、会話再開は未検証。任意のプロンプトは送信していない。Windows/macOS の実機検証は行っていない。

## ローカル保存形式

- `~/.gemini/antigravity-cli/settings.json` は JSON。調査時点のトップキーは `trustedWorkspaces` のみ。既存設定を書き換えていない。
- `history.jsonl` のレコードキーは `display`, `timestamp`, `workspace`, `type`。入力履歴であり、利用状況の確かなソースには使わない。
- `conversation_summaries.db` は SQLite。`conversation_summaries` 表に `conversation_id`, `workspace_uris`, `status`, `source`, `agent_name`, `parent_conversation_id`, `not_fully_idle`, `killed`, `app_data_dir`, `raw_summary` などがある。調査時点では 0 行だった。タイトル・プレビュー・raw_summary の本文は出力していない。
- CLI ログは glog 形式。既存起動ログと `--log-file` による安全起動ログで、初期化・server PID・待受ポート・hook 件数などを確認した。無入力時は conversation ID が空であり、PID と会話の紐付けの根拠にはならなかった。
- `JETSKI_APP_DATA_DIR` を一時ディレクトリに向けた起動では設定ルートの切替を確認できなかった。この変数の対応を実装上の前提にしない。
- 認証ファイル・installation ID・アカウント情報の値は出力していない。会話本文も出力していない。

## 公式の statusLine 経路

出典: [Status line customization](https://antigravity.google/docs/cli/statusline/)（当日閲覧）。

設定先は `~/.gemini/antigravity-cli/settings.json`、設定は `statusLine: {type: "command", command: "..."}`。`enabled`, `padding`, `stack_with_default` が任意項目。状態変更時に JSON をコマンドの stdin に渡す。

実装で採用できる公表項目:

| 項目 | 扱い |
| --- | --- |
| `conversation_id`, `session_id` | UUID。後者は互換 alias。pane/session 紐付けに使う |
| `transcript_path` | 任意。会話ログの絶対パス |
| `model.id`, `model.display_name` | モデル表示 |
| `context_window.total_input_tokens`, `total_output_tokens` | 公表の総トークン値 |
| `context_window.context_window_size`, `used_percentage` | コンテキスト容量・使用率 |
| `context_window.current_usage` | `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` |
| `quota[bucket]` | `remaining_fraction`, `reset_time`, `reset_in_seconds` |
| `agent_state` | idle/thinking/working/tool_use/initializing |
| `tool_confirmation_pending` | ツール承認待ち |
| `plan_tier` | 任意の契約名 |

コスト金額と reasoning effort はこの公開 payload schema に記載がない。モデル名から effort を推測しない。未取得のトークンを 0 としない。quota を USD に換算しない。`email` も渡されるが、表示・保存に不要なら破棄する。実際の statusLine コマンド導入・payload 実受信はこの調査では行っていない。

## hooks と session 追跡

出典: [Lifecycle hooks](https://antigravity.google/docs/hooks)（当日閲覧）。

公式は `.agents/hooks.json`、`~/.gemini/config/hooks.json`、CLI の primary settings、plugin hooks を列挙。`hooks.json` の named-object の形は次の通り。

```json
{
  "sodashitsu": {
    "SessionStart": [{ "type": "command", "command": "..." }],
    "PreInvocation": [{ "type": "command", "command": "..." }],
    "Stop": [{ "type": "command", "command": "..." }]
  }
}
```

SessionStart は最初のモデル呼び出しの前。共通 stdin は camelCase の `conversationId`, `workspacePaths`, `transcriptPath`, `artifactDirectoryPath`, `modelName`。Stop は `fullyIdle`, `terminationReason` も渡す。

**未確定:** settings 内に埋めるときの完全な nesting は公式ページに例がない。binary に `Hooks json:"hooks,omitempty"` のタグはあるが、`hooks: {sodashitsu: ...}` が動くことの実証にはならない。設定ファイルを変更する通常利用導線は、実 CLI で別途確かめる必要がある。未信頼の一時 workspace に `.agents/hooks.json` を置いた無入力起動では `loaded 0 named hooks` だった（信頼の画面から先には進めていない）。

会話ログの場所は公式 hooks の記述で `<app_data_dir>/brain/<conversationId>/.system_generated/logs/transcript.jsonl`、CLI の app_data_dir は `~/.gemini/antigravity-cli`。statusline ページの例は別アプリのパスを含むため固定しない。

## 公開機能と制約

- [CLI reference](https://antigravity.google/docs/cli/reference/) は `/resume` と `/fork` を列挙する。CLI 内 fork の存在と、Sodashitsu の別 pane/worktree fork を実装できることは別。起動 help に fork フラグはなく、この作業では対応能力を推測しない。
- [Changelog](https://antigravity.google/docs/changelog?tab=cli) の v1.4.0 は OSC 7501 による terminal status reporting を案内する。ローカル binary に関連する環境変数名もあるが、この調査では sequence schema と実受信を確認していないため実装の前提にしない。
- [Getting started](https://antigravity.google/docs/getting-started?tab=cli) の既定インストール先は Linux/macOS で `~/.local/bin/agy`、Windows で `%LOCALAPPDATA%/agy/bin`。導入済み実体と一致した。

## 実 CLI の信頼ダイアログ・プロセス名の追加観測

未信頼の一時ディレクトリで無入力起動し、以下の固定文言を確認した。会話・メール・パスの値は記録しない。

- `Do you trust the contents of this project?`
- `Antigravity CLI requires permission to read, edit, and execute files here.`
- `Yes, I trust this folder`
- `No, exit`

同じ起動で `/proc/<pid>/comm` は `agy`、`/proc/<pid>/exe` の basename も `agy` だった。信頼の選択を確定せず SIGINT で終了した。Sodashitsu の ProcessMatcher の実装呼び出しはこの調査では行っていないため、これは Linux のプロセス観測結果に限る。
