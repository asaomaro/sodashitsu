# 音声入力の能力照会

担当サーバー4ファイル44テスト成功。protocol能力表7テスト成功。Node24のtsc -b packages/server/tsconfig.json成功。

negative.logは能力照会handlerをHEAD版へ戻した負例（8件失敗）。source-restored.jsonは修正版をbyte exactに復元したSHA256証明。positive.logは修正版の担当サーバーテストの生ログ。

能力照会はLazyAssistantAudioをロードせず、audioTargetやモデルターンを要求しない。接続の事前・事後検証を実施。未選択・未知の種類・任意コマンド指定・失効接続を検証した。
