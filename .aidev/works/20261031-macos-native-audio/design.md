# 次段階: macOS system audio

Linux phaseのブランチから専用worktreeを作り、LinuxのCI待ち中に独立したSwift変換処理を進める。Linux merge後にmainを取り込み、最終差分をmacOS対応へ限定する。Node NativePcmCapability/lease/Opusは流用し、macOSのpeer auth/getpeereid+LOCAL_PEERPID・pinned directory cleanupとSCK audioだけを追加する。

一次資料:
- https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/capturesaudio
- https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/samplerate
- https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/channelcount
- https://developer.apple.com/documentation/screencapturekit/scstreamoutputtype/audio

同じ選択filter/display/stampとsourceActive/heartbeat/native video IDを使う。明示audio許可+要求だけでSCStreamを作る。capturesAudio=true/sampleRate=48000/channelCount=2、screen出力なし。音声callbackは有限Float32 planar/interleavedからS16LE stereoへコピーし、残り最大1frame+送信待ち2frames。無音のNone/無callback中もreceiver EOF/heartbeatを検査する。

startCapture直前と全await/callback後に元開始期限・取消・所有・peerを再検査する。stopCapture完了＋delegate/IO退役＋pipe閉鎖を確認するまでは同じ物理slotを保持する。失敗や時間切れだけでslotを解放しない。古いdisable/遅れたstart/stop完了がreplacementへ作用しない。

自動試験は生成PCM/偽SCK/専用Unix peerに限定。実screen/audio入力・再生・OS許可・driver/serviceを触らない。Mac CIで実SDK compile、生成sampleBuffer/codec、元sourceを一時copyしたassertion負例を行う。

DarwinのTMPDIRは長くsockaddr_unに収まらないことがある。Node private0700 directoryはDarwinで短い/tmpの下へ作る（existing pathは上書きしない）。
