# Grok profile/model/UI (1)

Grok1.0.77 read-only probe: `agent --no-leader --leader-socket <private-temp>/isolated.sock stdio` を専用tmp cwdで起動し、ACP initialize→`_x.ai/models/list`のみ送信。モデル1件と各モデル_meta.reasoningEffortsを実取得、session/new/promptなし、プロセス群停止/一時dir削除。論理API名x.ai/models/listはACP wireでは先頭_が必要（無しは-32601）。installed同梱 ~/.grok/docs/user-guide と公式公開sourceの根拠はdesign.md参照。実アカウント情報/会話は記録していない。

モデル照会実装は10s/2MiB上限・固定2要求・no-leader、modelId安全検査/最大128・effort canonical valueのみ・supportsReasoningEffort=false除外。失敗時は固定モデルへfallbackせず空候補と理由。既存5種経路を変更せず、Grok候補の取得元/5分servercache/画面保持をmessageへ明示。

Web/TUI要約kind、desktop船長kind/モデル/effort保存IPC、通知会話詳細対象へ追加。Grok native audioは対応と主張せずローカルWhisper→確認編集→下書きの既存共通経路。6種類main回帰がdraft/no prompt/audio_begin/context失効・録音cancelを検証。

関連: protocol14、model7、desktop110、Web7テスト成功。desktop/Web/TUI typecheck0。server typecheckは契約293bの未統合担当(2)で4件（conversationResume exhaustive/ConversationService ExtraKind）、backend/rootへ通知し後続統合待ち。製品5ファイルの旧版負例ではmodel/desktop/Web/実browser全失敗、byteexact復元後全成功。実browserはGrok種類・モデル・effort選択保存→reload復元/no autosendを確認。ブラウザのモデル値は生成fixtureであり実ASR/新モデルturnは実行しない。
