# キャラクター資料の保持とセリフ反映

## 要求と資料

ユーザー要求: yukkuri-workの設定資料を探し、各キャラクター設定を加味したセリフを出力し、操舵室にも資料を持たせる。

正本 `/workspaces/yukkuri-work/skills/video/yukkuri-kaisetsu/characters.json`（30261bytes、14人物＋関係性/公式と慣習の注記）。`packages/protocol/src/assistantCharacterProfiles.ts`へ全データ複製しsource path/SHA256/date保持。資料原本は無変更。再同期script `scripts/sync-assistant-character-profiles.mjs`はデータだけを読み、元PJコードや動画を実行しない。

14人物: zundamon/metan/tsumugi/reimu/marisa/hau/ryusei/himari/sora/whitecul/zunko/kiritan/itako/sayo。yukkuri-workのavatarIDと別衣装を元人物へ解決。他の素材・標準船長は架空の設定を補わず標準丁寧口調へ戻す。実際表示がfallback船長なら人格もfallbackへ揃える。

## 実装

- プロトコルのassistant.prompt、assistant.audio_beginへoptional characterId（従来clientは省略可）。Native Chat.configureへ現在表示人物を渡す。
- サーバが同梱資料から一人称・tone・calls・persona・signature・rules・relationsを付加。文字/画像/音声入力へ反映。原文/引用/文字起こし/コード/事実を改変しないこと、表現指定であって権限変更でないことを明記。
- 設定資料は元文の後ろに置き、8192文字までの会話表示でも元文の先頭を削らない。
- AssistantPersonaPromptsはdeviceId+元文をHMAC署名、offset付末尾envelopeだけを会話表示から除去。ユーザー本文内のmarkerやコード例は署名不一致なら維持。
- 署名鍵はstateDir/assistant-persona-key、0600 temporary→write/sync/close→hardlinkで完全inodeだけ非上書き公開。並行Audio/Surface初回生成はmodule Promiseを共有。既存鍵は32byte固定長read。
- Avatar別の挨拶・通知前置き・voice試聴。通知元title/本文は維持。設定画面に一人称/tone。catalog共通整形を通常get/import/remove全経路へ適用。
- 既存返答は書換えず、次の送信から人物指示。利用者が専用モデルを開始するまで自動起動しない。

## 点検と反映

ユーザーのテスト不要指定を継続。unit/E2E/smoke/モデル/生成/UIプローブを実行していない。

protocol、desktop build:host、server tsc -bは成功。sync scriptはnode --checkのみ（構文ビルド）。`/tmp/soda-core-parity-{protocol,host,server}-build.log`。

独立review /root/review_character_personaで次を指摘→修正→再レビュー、必須指摘なし。

1. markerだけで無条件stripしていた表示欠落→server署名済み末尾/offset/署名検証。
2. import/remove後catalogからpersonaが欠ける→共通整形。
3. 未収録人物/標準へ切替時に古い口調解除しない→明示characterIdの標準文脈。
4. 署名鍵の直接書込で途中終了時に壊れる→一時inodeからatomic非上書き公開。

レビュー側もテスト/プローブを一切実行しない。5paneを維持してsoda handoffし、アシスタントを再起動。現在のきりたん・voice108・idleFloating等の設定は保持。返答の人物口調がモデルにどこまで従われるかは生成テストしておらず、プロンプトによる指定であって完全な口調遵守保証ではない。
