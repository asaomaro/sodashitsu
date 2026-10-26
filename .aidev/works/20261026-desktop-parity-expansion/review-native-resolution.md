# native resolution independent review

review_transfer / review_pointerへ差分全体を独立点検依頼。source/helper/relay/protocolとviewer/audio/decoderを別コンテキストで確認。

- 保持IDRのbarrier開始時刻を送信時刻に流用すると2.8秒の正常切替でACK timeoutする指摘: transport sentAt/ACK RTTとfreshAtを分離し、2.8秒+100ms ACK回帰を追加。修正確認済み。
- native開始try外のConfigureVideoOutputが1279幅で共有全体を終了する指摘: TryCreateNativeVideoへConfigure/encoder開始を同じtryで包み、false→既存native_video_stoppedへ戻す。fake DXGI奇数寸法の純検査追加、修正再レビューで追加must/shouldなし。
- viewer側最終レビュー: current generation/baseSeq/format ACK、音声gen1の分離、formatEpoch、3秒有限の映像監視待機、nativeAdaptive確認時だけのOS等倍guard緩和について追加must/shouldなし。
- 実browserでUDP新世代だけlaneが閉じた原因はFrameNotice.generationのliteral1残り。uint化し、A/Bのcurrent gen一致を保持。protocol負例とUDP/WSS両方の実browserで検査。

最後のloss/queueの持続判定追加もreview_transferが再レビューし、追加must/shouldなし。単発lossと持続3windowの回帰、条件のみ戻して落ちる負例を確認。
