# Antigravity CLI

対象は単独の対話CLI `agy`（Linux x86-64、1.4.0で無入力起動・検出を確認）。IDEを開くランチャーの導入確認を、CLIの導入確認には使いません。起動一覧の表示名は Antigravity CLI、内部の種類は `agy` です。

## 設定

Web・端末版とも「エージェント連携」の Antigravity CLI からセッション報告フックを導入できます。`~/.gemini/config/hooks.json` の `sodashitsu.SessionStart` に本製品のエントリだけを追加します。他の名前のフックは保ちます。これはAntigravity App/IDEと共有される公式のグローバルフック置き場です。本製品のpane外では報告せず終了します。既存の `sodashitsu` 定義が無効化されている場合は有効化の判断を利用者が行ってください。

利用状況は別の「Antigravity CLI 利用状況（ステータスライン）」から導入します。`~/.gemini/antigravity-cli/settings.json` の `statusLine` を包み、元のコマンドへ同じ入力を渡し、表示と終了コードを保ちます。元の設定は控え、外すと戻します。元のstatuslineが無いときは `stack_with_default: true` で組み込み表示を保ちます。`enabled: false` はそのままなので、情報の収集も停止します。後から利用者が別のstatuslineに替えた場合は、その設定を上書きせず「外れています」と表示します。Windowsではこの包みは使えません。

CLIを起動し直すと反映されます。自動では利用者の設定を書き換えません。フックだけでは利用状況は取得できません。逆にstatuslineだけでも会話IDは報告されます。

## 表示と取得範囲

公式のstatusline入力から、モデル・現在の文脈内の入力/出力/キャッシュトークン・コンテキスト容量/使用率・モデル別の制限枠と解除時刻を取得します。Web/モバイルと端末版のダッシュボード、paneの利用状況、pane標準statuslineで共通の値を使います。アカウント枠の名前は Antigravity CLI、枠の名前は公式のbucket名です。同じ設定ルートからの報告を1つのアカウント枠としてまとめます。

- `current_usage` は文脈内として扱い、課金対象の累計とはしません。`total_input_tokens` / `total_output_tokens` の課金・累計の意味は未検証なので使いません。
- コスト金額・クレジット・effortは、この経路では取得していません。ゼロやモデル名からの推測値を表示せず、コスト欄は未取得です。単価の掛け算やUSD換算はしません。
- quotaの残り割合を使用割合に直し、明示の解除時刻、無ければ報告時点の解除までの秒数から日時を作ります。過ぎた枠は古い値になります。数字がない枠は表示しません。
- `agent_state` と `tool_confirmation_pending` の検証済み報告は状態判定に10秒使い、その後は画面の判定へ戻ります。信頼ダイアログは独自manifestでblockedと判定します。通常のworking/permissionルールはherdr由来です。
- メール・認証・会話本文・記録のパスはstatuslineの報告に載せません。ローカルIPCでプロセスと会話を照合します。Linux以外でpidが取れない場合の照合には、既存フックと同じ制約があります。

## 会話と連携

SessionStartの `conversationId`、statuslineの `conversation_id`（互換 `session_id`）をpaneに結びます。UUIDを指定した手動の `agy --conversation <id>` も前面プロセスの引数から追います。サーバの保存・復元は同じコマンドを使います。`--continue` の最新会話を推測で紐付けません。

ヘッダーから `/usage` と `/permissions` を開けます。通常のpaneへの送信・キー入力・状態変化の通知は共通経路です。Sodashitsuの別pane/worktreeへのfork、会話本文閲覧・過去会話一覧・要約・ToDo・サブエージェント一覧は未対応で、能力判定から表示しません。CLI自身の `/fork` の存在は、Sodashitsuのfork対応を意味しません。

## 検証と限界

Linux実CLIの無入力起動・プロセス名・信頼画面・終了を確認しました。モデル呼び出し、実会話の再開、実アカウントのquota受信、working/ツール承認画面は未検証です。ブラウザE2Eは隔離した偽CLIと作ったデータで検出→IPC→DOMを確認します。Windows/macOSの実機検証は行っていません。

根拠: [公式statusline仕様](https://antigravity.google/docs/cli/statusline/)、[公式hooks仕様](https://antigravity.google/docs/hooks)。調査・検証・Bob/Copilot監査は `.aidev/works/20261017-antigravity-cli/` にあります。
