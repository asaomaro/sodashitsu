# Grok Build / Cursor CLI の会話記録

会話の読み取りと過去セッション一覧は、各 CLI が保存する JSONL の UUID に対応します。Grok は `GROK_HOME`（省略時はホームの `.grok`）の `sessions/<作業フォルダ符号化>/<UUID>/chat_history.jsonl`、Cursor は `CURSOR_DATA_DIR`（省略時はホームの `.cursor`）の `projects/<作業フォルダ符号化>/agent-transcripts/<UUID>/<UUID>.jsonl` を使います。Cursor の同じ作業フォルダにある旧形式 `<UUID>.jsonl` は、現形式がないときだけ使います。子の transcript は親の過去セッションとして列挙しません。

Grok は human の user content/text と assistant content、Cursor は user/assistant の message/content/text を読みます。個別の tool/system/reasoning レコードは会話へ出しません。Cursor 自身の serializer が thinking と通常本文を一つの text block に結合した場合、保存後にその出自を分離することはできません。Grok の保存仕様には旧版で synthetic prefix に human の印が付く制約もあります。CLI が本文に結合した情報を完全に分類できる保証はありません。

走査には時間・件数の上限を設け、リンク・ハードリンク・途中フォルダの差し替えを拒否します。同じ UUID が別の作業フォルダに複数あれば新しい方を推測せず取得不能にします。会話の読み取りは既存の最大 1 MiB の窓、100 メッセージ、本文 8192 文字の制限を引き継ぎます。新規起動・要約の対応状況は別途検証するため、種類が選べることだけで接続成功を意味しません。

根拠: Grok は公式 [grok-build 2bdd1d6](https://github.com/xai-org/grok-build/tree/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8) の session_jsonl / ConversationItem、Cursor は導入済み 2026.11.05-86047df の正式 writer とパス定義を確認しました。Grok の導入済み 1.0.77 と公開ソースの厳密な一致は未確認です。自作の保存形式 fixture で確認しており、実利用者の会話本文は検証資料へ保存していません。

## 起動・再開と要約

新規専用端末は既存の CLI 起動経路を使います。初回フックが検出より早く到着しても、PID と前面プロセスを照合し、対応するインスタンスの確定後に紐付けます。PID が取れない早期通知は、その後の検出だけで検証済みにしません。再開は実際の前面プロセスの `--resume <UUID>` を読み、保存済み参照・会話タイトル・latest・子プロセスの引数から推測しません。

Grok の要約は毎回独立した一時フォルダで行い、認証用 `auth.json` だけを引き継ぎ、通常の設定・作業フォルダ・拡張を複製しません。主リクエストの OS/MCP ツールを除外し、`allow_managed_hooks_only = true` でユーザー・プロジェクト・プラグイン・互換フックを除外します。OS 管理者や署名付きポリシーが強制するフックは、CLI の正式ポリシーに従います。操舵室がその制約を迂回したり、あらゆるフックを禁止できるという意味ではありません。導入済み Grok 1.0.77 を外部通信不能な隔離ネットワークで自作 HTTP 応答へ向け、主リクエストにツール項目がないことと、ユーザーフックの正負を確認しました。タイトル生成の補助要求は残ります。実モデルの要約品質をこの検証で確認したわけではありません。

Cursor の要約は現在明示的に利用不可を返します。導入済み CLI には主ツールの空 allowlist を指定する経路がありますが、任意のアカウントで有効になり得るプラグインや起動フックを、要約専用実行で無効にする正式な方法を確認できていません。これは会話の読み取り・履歴・通常起動・UUID 再開への対応とは別の制限です。別の種類の CLI へ渡したり、ask モードだけで代用しません。
