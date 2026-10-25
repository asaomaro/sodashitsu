# 独立レビュー

実装と別コンテキストのreview_transferがproduction差分を読み、指摘なし。

- v2ブラウザ要求、B capability、options/configure、helper readyが全て一致する場合だけwindow3。旧peerへ追加フィールドを送らない。
- C#/B/A/ブラウザの上限、先頭ACK・重複無視・最古pending期限を確認。
- H264参照フレームを破棄せず、停止時は画像へ復帰。WebCodecs初期化queueも上限内で、VideoFrameを解放。
- statsは純codec/network値ではなく各区間の待ちも含む。利用者文書と検証記録へ反映。

独立レビューは読み取り中心。全体テスト、Windows検証、ブラウザ試験は実装側で実行する。
