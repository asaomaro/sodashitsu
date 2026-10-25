# 独立レビュー

2026-10-26、実装とは別のコンテキストでDesktopVideoLanes、A/Bの送受信、ブラウザ、protocol追加と関連テストを点検した。

## 初回指摘と修正確認

1. video packetの検査失敗でmain providerと共有全体を閉じる経路を指摘した。lane時はpair.failだけで画像へ戻る修正を確認した。
2. main readyがlane readyより先に届くとnative選択がautoへ変わる問題を指摘した。nativeSupportedとlaneのavailabilityを分離する修正を確認した。
3. nativeからbrowser mediaへ切り替えた後、旧nativeの停止metadataが新mediaを破棄する問題を指摘した。AのretiredMedia、要求経路とbinary laneの照合、A/browserの停止ID照合を確認した。
4. idle native laneの切断でbrowser mediaまで停止する問題を指摘した。Aがnative mediaだけを停止する修正を確認した。

## 再レビュー指摘と修正確認

ブラウザのvideo socket close/video_closed処理が、現在実行中の経路ではなく、次回要求用の選択値mediaTransportでstopVideoを判断する問題を指摘した。WebRTC再生中に選択だけnativeへ替えると、idle native laneの切断がbrowser mediaまで止めていた。

修正後はlane終了でnative availabilityだけを落とし、active streamの停止はAからのID付きimages通知へ任せる。実WebRTC再生中にdropdownだけnativeへ変更してidle laneを閉じ、canvasがさらに5枚以上進みWebRTC状態を維持するブラウザ回帰が追加された。修正差分を再点検し、指摘を解消した。

## その他の確認

roleごとの一回券、session/origin照合、TTL、pending上限、親終了時の破棄は整合している。入力・許可・release・agent・描画ACKはmain FIFOを維持する。source/viewerの輻輳と不正videoだけを止めた後にmain入力ACKを確認する回帰、旧peer、遅延停止metadataのテストが追加されている。

最終の製品差分・テスト追加に修正必須の指摘はない。git diff --checkは成功した。この記録時点で全体unitと最終10件のブラウザ検証が進行中であり、完了結果は実装側がtest-result.mdへ記録する。
