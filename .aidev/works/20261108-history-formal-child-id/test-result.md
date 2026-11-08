# 正式子IDと履歴選択の整合

root指摘のCopilot toolCallId受理範囲不整合を修正。API作者review_audio_integrationと取得backendが、history-onlyを既存Native受理[A-Za-z0-9_:.-]{1,128}へ揃える境界に合意。installed0.0.362 SDKのtoolCallIdはstring（event envelope UUIDとは別）。実CLIが':'や'.'を含む値を実際に発火した検証ではない。

変更はprotocol history selectionと共通history readerの正規表現、および関連2testsのみ。entryId/pane UUID、strict、exact maplookup→private providerproof、current fallback禁止を維持。current APIs/UUID child opener/Native/History serverに変更なし、IDをpath/commandへ渡さない。

20関連PASS、protocol/core build0、変更4files strict型0。旧2runtimeで2fail/18pass→durablebytes保存から2SHA完全復元20PASS。rawnegative/restored/restoration.json参照。actual NativeSubagentRecords.ts純粋foldを隔離transpileした生成連結でcall:1/call.part:1を受理し、同じopaqueIDをhistory readerと2 strict selectorが保持することを確認（formal-proof.log/json）。server collector/実端末/実モデルの結合成功という主張ではない。slash/backslash/%encoding/空白/control/長すぎるIDは拒否、entry欠測も拒否。

独立レビューはreview_audio_integrationへ依頼。根本UIのkind/public current権限は広げず、この不整合のみを閉じる。実モデル/会話変更/Windows0。
