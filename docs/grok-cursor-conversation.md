# Grok Build / Cursor CLI の会話記録

会話の読み取りと過去セッション一覧は、各 CLI が保存する JSONL の UUID に対応します。Grok は `GROK_HOME`（省略時はホームの `.grok`）の `sessions/<作業フォルダ符号化>/<UUID>/chat_history.jsonl`、Cursor は `CURSOR_DATA_DIR`（省略時はホームの `.cursor`）の `projects/<作業フォルダ符号化>/agent-transcripts/<UUID>/<UUID>.jsonl` を使います。Cursor の同じ作業フォルダにある旧形式 `<UUID>.jsonl` は、現形式がないときだけ使います。子の transcript は親の過去セッションとして列挙しません。

Grok は human の user content/text と assistant content、Cursor は user/assistant の message/content/text を読みます。個別の tool/system/reasoning レコードは会話へ出しません。Cursor 自身の serializer が thinking と通常本文を一つの text block に結合した場合、保存後にその出自を分離することはできません。Grok の保存仕様には旧版で synthetic prefix に human の印が付く制約もあります。CLI が本文に結合した情報を完全に分類できる保証はありません。

走査には時間・件数の上限を設け、リンク・ハードリンク・途中フォルダの差し替えを拒否します。同じ UUID が別の作業フォルダに複数あれば新しい方を推測せず取得不能にします。会話の読み取りは既存の最大 1 MiB の窓、100 メッセージ、本文 8192 文字の制限を引き継ぎます。新規起動・要約の対応状況は別途検証するため、種類が選べることだけで接続成功を意味しません。

根拠: Grok は公式 [grok-build 2bdd1d6](https://github.com/xai-org/grok-build/tree/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8) の session_jsonl / ConversationItem、Cursor は導入済み 2026.11.05-86047df の正式 writer とパス定義を確認しました。Grok の導入済み 1.0.77 と公開ソースの厳密な一致は未確認です。自作の保存形式 fixture で確認しており、実利用者の会話本文は検証資料へ保存していません。
