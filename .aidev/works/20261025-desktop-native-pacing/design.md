# Native動画の待機精度

利用者のsr-pcで1920×1200、30fps上限、17.7fps。取得11.7ms・変換6.3ms・圧縮と待ち14.1ms、ACK53ms、decode0.8ms。前回の3枚windowは有効。

読み取り専用のWindows probeではThread.Sleep(1)平均15.80444ms、Sleep(2)平均15.86095ms。MFGetEvent非同期完了のポーリングと主ループでこの待機を使っている。

encoder専有のHIGH_RESOLUTION waitable timerを使用する。one-shot、相対負の100ns時刻、権限はSYNCHRONIZE|TIMER_MODIFY_STATE。待ちは要求+100msで有界。作成失敗・未対応・Set/Wait失敗はSleepへ戻す。constructor失敗とencoder停止でSafeWaitHandleを解放。timeBeginPeriodやspin loopは使わない。

MF pollingは1ms。動画主ループは次フレームがdueなら待機0、未dueなら残り時刻まで最大10ms、window満杯では2ms待つ。画像・認証画面・入力権限・desktop/display/heartbeatガードは維持。protocol変更なし。

生成画像のbenchmarkを同じソースで旧Hostと新Hostに適用する。実画面取得・通信・ACK・ブラウザを含む実fpsとは区別する。
