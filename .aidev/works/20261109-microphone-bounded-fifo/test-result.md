# マイクの合法burstを有界FIFOで保持

Source056b806a、base0a102。製品変更はDesktopMicrophone.tsのみ。Native C#/fixtureは0diff、Windows/実音声/利用者データ/モデル操作0。A16の実原因をこの修正だけで確定したとは主張しない。次のRoot A17はnative固定で分離する。

同一turnに6frameが届くと、元のbusy/latest上書きはnative待ちの無いNode実Writable（_writeは即done）でもseq[1,6]だけを書く。write完了ACKを累積処理するfixtureのackedは、それでも6になり得る。現修正は受信順FIFO、inflight＋pending合計12を上限にする。100ms stale・100ms write timeout・2秒idle・Date.now+100 pipe deadline・rate12・認可と停止の既存条件は維持。fullqueueでは停止して全待機/inflightを零化。期限切れは従来どおり無送信ACK退役するが後続をdrainする。ACKは再生/受音/全frame消費の証明ではない。

3関連file27 PASS。real Writable6→6、合法sub100ms jitter/backpressure、expired→fresh drain、bound12/overflow13、stop/revoke/writeerror/late callback、synchronous writeerror、既存100ms timeoutとqueued/inflight零化を検証。既存UNIX synthetic hello/Opus/protected microphone境界テストも通過。

旧0aの製品runtimeだけをdurable source backup後に置換するとsame-turn burst回帰が1 FAIL（actual[1,6]）。完全byte/SHA復元後27 PASS。negative.log/restoration.json/restored.log参照。型/build実行中の製品source変更0。

Node24.15.0でtest-inclusive focused server strict型0。固定sourceのproduction server buildはpnpm --filter @sodashitsu/server build、tsc-b（noCheck無し）→desktop-assistant内部host資源build（実行無し）→pruneをexit0で完了。全repository build/testの二重実行はせず、今回のserverと関連ケースに限定。receiptに生成DesktopMicrophone.js SHAを記録。

独立source先行点検はreviewerとbackendとも追加must/should無し。最終source/復元SHAと型/build生logの別context照合を受けてからRootが反映する。docs/remote-desktop.mdのマイクlatest1記述だけFIFOへ更新し、他video/audio latest方針は変更しない。
