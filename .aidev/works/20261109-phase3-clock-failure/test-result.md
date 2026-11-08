# A12後の生成clock失敗診断

A12はRoot実測でnative protected source/mic lane/running/actor/baselineへ到達しtone_cadenceで失敗。旧AbsolutePcmは固定Errorをrejectするがrun-a外側catchはotherに分類し、measurement無しなので旧receiptからworker遅延/配送順/送信callback等のどれかを復元できない。今回も実原因は未確定で、次のRoot新jobが必要。author Windows/接続/実audio/model0。

変更は生成fixtureのabsolute-pcm.mjsとrun-a.mjsのみ。ClockはWeakMapに由来を保持したimmutable fixed enum＋receivedFrames/maxWorkerLatenessMs/maxDeliveryLatenessMs/maxCallbackMsを失敗時にsnapshotし、Aのtone_cadence catchだけがfailureEvidence.cadenceへ保存。任意Errorから推測しない。raw exception/cause/message/stack/packet/PCM/device/ID/pathはreceiptへ入れない。callbackだけ既存完全一致microphone-send-not-live / microphone-ui-budgetを区別し、他はcallback_other。frame数0..300、時間0..60000ms/0.001ms丸め、非有限値は省略。この上限は診断projectionのみで測定/timeout/合否を変更しない。receivedFramesは生成frameのcallback試行数で、送信/ACK/受音数ではない。

Worker>=20ms/配送>=20ms/callback>=20ms、frames*20+2000ms全体timeout、300frames×20ms、ACK500ms/12pending、受信RMS/6秒wall等は不変。成功clock応答shapeは不変。Worker failed時に既測定lateness scalarだけを追加し、callback例外でもfinallyで時間とゼロ化を維持。失敗後late eventは再判定せず最初のsnapshotを保持。BCは同じ生成clockをimportするためrejectがsanitizedになるがBC source/実行は変更していない。

## 限定検査

- 新14生成回帰は実clock sourceをVMでWorker/hrtime/timerだけfakeし、12失敗コード・値・zeroize・immutable・foreign-error拒否・実A catch接続を検査。
- cf659の旧absoluteのみへ戻した新13回帰は13FAIL（negative-old-clock.log）。旧run-aのみへ戻した実catch接続1回帰は1FAIL（negative-old-intake.log）。単なる欠落exportによる失敗を避け、旧clock自体を同VMで動かして失敗metadata未取得を検査した。
- git-common-dir recoveryへ自身2source bytes/SHAを事前永続退避。finallyで2sourceをbyteExact復元、restoration.jsonの2SHA一致。
- 復元後A/shared/BC接続parityを含む関連73PASS（positive-restored.log）。28MJS syntax0（syntax.json）。A8C# sourceはcf659と全byte一致（source-sha256.json）。C#再compile/package全build/型全体/Windows校正は不要・未実施。
- 初回のtest-only fallback文字列escapingにSyntaxErrorがあり、修正後に旧負例と最終73を実行し直した。構文失敗は負例の合格証跡にしていない。runtimeはその前後不変。

独立source review（/root/review_audio_integration）完了、阻害指摘なし。reviewerが3source/test SHA・2復元SHA・A8C# base不変を再計算し、旧13+1FAIL→73PASS/28syntax0を照合。追加実行/Windows操作0。Root統合時にはrun-aとabsolute-pcmの新SHAをsealed fixture/source manifestへ反映し、新jobを作る必要がある。旧承認/clock/source sealは再利用しない。C#8/3の既存sealはsource不変を再確認して再利用可能。実Windowsでの原因/性能/受音成功は未証明。
