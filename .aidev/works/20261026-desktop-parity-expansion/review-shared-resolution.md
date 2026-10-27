# 共有解像度の独立レビュー

実装セッションと別コンテキスト2件で全差分を点検し、以下の修正ごとに再レビューした。最終crossで製品の追加mustなし。対象source bc1e4941。

- C#のresumeは保持IDRを送るまでprofileを保持する。次profile/rateを即送ると衝突・無視されるため、保持IDR受信とsource ACKまで保留し、未送信のrateで内部値を更新しない。
- 途中参加者へ保持IDRを配ると入力鮮度が更新される。seq0へは配らず、その人の希望寸法を満たすfuture keyframeを待つ。
- 実2browserのlate-fixedで、次profileが初描画より先に届いてUnexpected video barrierとなった。保持IDRの実描画ACKまで次resizeを保留し、draw waitも2秒で限定。
- UDP drop ACKを描画と扱っていた。private ACKへsharedResolution時だけdroppedを保存し、creditとdrawing commitを分離。future key実描画まで待ち、100msで集約する有限key request timerで回復を保証する。
- 追加watchdogテストのsettleケースは既にresumeを1回送るため、期待値0を1へ訂正し32件を再実行で通過。最終全体も通過した。
- 文書の『共有動画の解像度変更は未対応』を更新。

生成helperもC#のprofile寿命、rate無視、保持capture timestampを再現する。browserのcodec gateは回復decoderを二度止めないよう一度だけにし、UDP損失を含む成功試験を最終結果とした。
