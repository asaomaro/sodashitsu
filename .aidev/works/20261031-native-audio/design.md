# 設計（実装前）

- 既存DesktopNativeAudioの48kHz stereo S16LE・960 samples/20ms・16byte PCM hello/headerとOpus encoderを使う。H264 sourceの同じid/許可/heartbeatに結び、viewerの音声要求時だけ開始する。
- Linux: 同じログイン/Portal sourceが生きている間、明示許可されたPCシステム音声をGStreamer Pulse/PipeWireのdefault monitorから取得。Portalのvideo FDをaudio許可と扱わず、設定allowSystemAudioを独立上限にする。マイクsourceは使わない。
- macOS: 選択したSCK filter/displayを使うaudio-only SCStream。実画面の記録を別経路で始めず、source/session/display stamp失効で終了。受信PCMは48k stereoへ有限変換する。
- PCMはネットワークへ流さず、所有するローカルUnix socketから既存Opusへ接続。helperは親NodeのUID/PIDを検査。Node生成のprivate0700 directory内だけに0600 socketをbindし、既存pathをunlink/overwriteしない。cleanupもdev/inoを確認し、自分のsocketと空のdirectoryだけを消す。
- ゲートを持ったままnative API/worker終了を待たず、old capture/socket/PCM bufferが終了する前に物理slotを再利用しない。保持は最大2chunks、遅いものは破棄し、元sourceと停止/期限を送信直前に検査。
- NativeAudioのUnix対応は明示したnative backend proofとpolicyでのみ有効化する。Settings→Provider→helper ready→shared cohort→browserの実配線を生成E2Eで確認。
- microphoneは別方向のOS再生・virtual endpoint・排他resource fenceを要するため、同じ許可で代用せず別段階に分ける。仮想デバイス/driverを勝手に導入しない。

まず一次資料と既存PCM schemaを確認し、nativeの生成tone→PCM parser/Opus→decoderまで検証する。実OSの録音・再生・マイク取得を自動試験では行わない。

## 確認した一次資料

- GStreamer pulsesrc の server/device を明示指定する API: https://gstreamer.freedesktop.org/documentation/pulseaudio/pulsesrc.html
- PulseAudio 自身の `@DEFAULT_MONITOR@` 解決は default_sink.monitor_source。default_source とは別: https://raw.githubusercontent.com/pulseaudio/pulseaudio/master/src/pulsecore/namereg.c

## 現在の実装境界

Node private PCM lease/物理ownerの転送、Unix peer認証、有限PCM分割、Linux monitor actor・helper command/ready・Settings/Web/TUI・共有cohortまで接続した。レビュー対象を数十ファイル以内に抑えるため、まずLinuxのsystem audioを着地し、macOS sourceは次の独立した変更に分ける。両OSの対応完了や実音声確認とは扱わない。
