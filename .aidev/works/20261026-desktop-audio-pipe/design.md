# Nativeシステム音声の取得・圧縮部品

残対応を小さい差分に分け、まず未接続の取得/PCM/Opus部品を追加する。このPRだけでは接続先の音声を取得・送信しない。次の統合で新viewer/A/B/helperのcapabilityと明示的なシステム音声依頼にだけ接続する。

SodaDesktopAudioは通常ユーザーのMTA workerでWASAPI render endpointのshared loopbackのみを使用。マイクAPIなし。音声は映像stdout/入力ACK stderrを使わず、NETWORK SIDを明示拒否しowner SIDだけを許可するACLを持つランダム名のlocal pipeへ送る。GetNamedPipeClientProcessIdがprivate configureのNode PIDと一致した後にだけsource factoryを呼ぶ。pipeはPID照会のためduplex handle、application dataはPCMの片方向だけ。clock/allowed predicateを呼出元が渡し、停止/desktop失効で解放。1秒以内にjoinできない場合はDisposeがthrowし、統合側がwatchdog有効のままhelperをfail-closedで終了できる。

PCMは48kHz/stereo/16bit/20ms。16byte format hello、16byte frame header(length/seq/pts LE)+3840bytes。C#はdevice packetのsilence/discontinuity/QPC timestampを処理し、pipe書込みを50msで期限切れにする。実deviceの取得は任意source factoryの既定実装だけで、試験は常に生成sourceを注入する。録音ファイルを作らない。

Nodeは明示的なstart後だけOpusScript0.1.1をdynamic import。絶対2.5秒でhelloを待ち、固定buffer parserでサイズ/seq/安全なtimestampを検査。保持は最新2枚、圧縮をsetImmediateに分け、100ms以上のqueueや映像より150ms古い音声を破棄。Opus128kbps/960sampleに圧縮する。active predicateをimport/接続/encode前に確認し、停止後に捕捉を開始しない。stopでpipe/encoder/timer/PCMを解放する。古いchunkで画面や入力の鮮度は更新しない。

送信wireは24byte SDAU header(generation/seq/timestamp)+Opus<=8KiB。既存映像/カーソルwireと区別する。NativeAudioStatus/停止だけのControl schemaを定義するが、まだネットワーク受口に登録しない。

Windows generated checksは実SID ACL・一致/不一致PID・source activation順・PCM frame・stop/revoke/期限超過を確認する。WASAPI sourceを一度も生成しない。Node testsは生成toneのOpus roundtrip、最新2枚、停止中のimport、parser boundsを確認する。runtime negativeと独立レビューを実施する。

参照: Microsoft Loopback Recording https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording 、OpusScript https://github.com/abalabahaha/opusscript （MIT）。ブラウザ統合ではraw Opus/descriptionなしを使う（W3C Opus WebCodecs登録）。
