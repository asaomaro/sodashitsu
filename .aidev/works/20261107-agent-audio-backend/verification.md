# 音声入力の能力照会

担当サーバー4ファイル44テスト成功。protocol能力表7テスト成功。Node24のtsc -b packages/server/tsconfig.json成功。

negative.logは能力照会handlerをHEAD版へ戻した負例（8件失敗）。source-restored.jsonは修正版をbyte exactに復元したSHA256証明。positive.logは修正版の担当サーバーテストの生ログ。

能力照会はLazyAssistantAudioをロードせず、audioTargetやモデルターンを要求しない。接続の事前・事後検証を実施。未選択・未知の種類・任意コマンド指定・失効接続を検証した。

## AGY実CLIでのnative入力調査

導入済みAntigravity CLI 1.4.12。`AgentIsolation.isolatedAntigravity`を用いてprivate HOMEへ必要な認証情報のみをコピーし、SODA/SODACTL/CODEX環境変数を除去。独立fixtureディレクトリで起動。利用者pane/既存会話は使用せず、モデルターンも開始していない。node-ptyでEnterはonboarding/trustのみに使用し、添付の試験中はEnterを送っていない。

- 正例: 生成1px PNGの絶対パスをbracketed pasteすると`1 media attached (file, 68 B, image/png)`。
- 反例: Python waveで検証した生成WAV（mono 16kHz/16bit/1秒）と生成MP3はパスが本文に残る。
- WAVの@path/引用付きpathも音声添付badgeなし。Unicode/空白パスと既存会話への配送・cancel・保持は、その前段の音声添付入力が成立しないため未実証。
- native=falseを維持。AGY音声のupstream非提供という判定ではなく、導入CLIへのnative添付入力形式と受理ackが未確定という制約。

`agy-attachment-stage.txt`はPNG正例とWAV形式差の入力後端末生出力、`agy-wav-baseline-stage.txt`は画像を一度も添付していないWAV単独例、`agy-audio-stage.txt`はPython wave標準WAV/生成MP3の入力後出力。起動時のアカウント/認証表示は切り出して保存対象外とした。これらに実音声・キーは含まれない。

再現用の`agy-probe.mjs`は新規隔離HOMEと生成PNG/WAVを自動で用意し、起動時設定だけを通過して本文には一度もEnterを送らない。添付段階の出力のみJSONLにし、終了時に認証情報を含むprivate HOMEを削除する。Node24で実行成功。`agy-repro.jsonl`ではWAV/@WAV/引用WAVはbadgeなし、最後のPNGはbadgeあり。
