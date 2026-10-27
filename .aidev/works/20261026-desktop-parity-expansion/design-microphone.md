# 音声受信・マイク転送

2026-10-27の追加依頼。接続先→手元の音声は既存WASAPI loopback/Opusを使い、ローカルの独立allowSystemAudioをWeb/TUIに追加。nativeとbrowser companionの双方で検査する。接続元→接続先はマイク専用の新protocol/capability/helper-ready積と、role/session/originに束縛した一回ticketの独立laneを使う。

マイクのgetUserMediaは明示開始だけ。48kHz/mono/s16le/960sample、PCM1920bytes、20ms/枚。形式/送信先/codecの任意指定を許可しない。ブラウザworkletの未消費メッセージはcredit1、Aの未ACKは最大12枚。累積ACKでネットワークRTTを吸収し、最古500msで停止。Bは50fps/token burst12、pipe1inflight+最新1待機だけ保持。上書き/停止でPCMをzero化。ACKはpipeへ書き渡したこと（破棄も含む）を表し、アプリでの録音完了は意味しない。

BのNodeがランダムなprivate pipe名、接続PID、期限100msを付与する。helperはowner ACLとclient PID認証後だけローカル設定のrender endpointを開く。default speakerへのfallbackはない。通常desktop/source/heartbeatのguardianをsink write直前にも検査し、buffer待機中に期限を過ぎたPCMも拒否する。音声パスは入力操作のcontrol grantと独立するが、接続切断・設定変更・共有停止で全て破棄する。停止後の非同期getUserMedia/resume、旧socketのdataは現世代を復帰/停止できない。

接続先アプリから見えるマイクには、利用者が別途導入した署名済み仮想オーディオケーブルを使う。ローカルでrender側IDを設定し、アプリで対応するcapture側を選ぶ。導入・OS既定デバイス変更は自動化しない。Windows Nodeの通常単独共有に限定し、WSL/Linux Node/共有source/virtual/protected/lock画面には公開しない。マイクOpus圧縮・独自仮想driver配布・Linux/macOS・shared音声は残件。relayからもpayloadを隠すE2Eは既存task10に含め、現TLS/authenticated laneと混同しない。

一次資料: [AnyDesk audio](https://support.anydesk.com/Audio)、[Microsoft MS-RDPEAI](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpeai/d04ffa42-5a0f-4f80-abb1-cc26f71c9452)。構成の参考とし、他製品のコードは移植していない。

検証はfake getUserMedia/生成oscillator、hardware出力から切り離したブラウザgraph、synthetic helper、in-memory native sink、private pipe、metadataとcompileだけ。実mic録音・speaker再生・OS入力・画面取得・driver導入は行わない。
