# マイク入力のOpus圧縮

参考構成: [FreeRDP AUDIN](https://github.com/FreeRDP/FreeRDP/blob/master/channels/audin/client/audin_main.c)の独立した入力音声経路と、[RustDesk audio service](https://github.com/rustdesk/rustdesk/blob/master/src/server/audio_service.rs)のOpus利用を確認。製品コードは独自実装し、他製品のコードを組み込まない。WebCodecsの20ms設定とraw Opus packetは[Opus codec registration](https://w3c.github.io/webcodecs/opus_codec_registration.html)で確認。

rootへsoda-desktop-microphone-opus-v1を提示し、B capabilityも対応した場合だけoptions.microphoneOpus/ticket codec/ready fieldを送る。追加物理laneは既存microphone-v1を使い、PCM旧経路は維持する。Providerからhelperへのconfigureでは新optionを除く。helper/private pipeの形式や仮想endpoint指定は変えない。

Browserは明示startでcodec supportを確認してからgetUserMediaする。非対応はPCM、停止中にprobeが返ってもcaptureしない。AudioEncoderは48kHz mono/20ms/32kbps、encoder queue2件/ACK待ち含め12件。結果鮮度100ms、encoder stall200ms、ACK期限500ms。stop時にencoder/track/context/待機を破棄しepochで遅延callbackを拒否する。復帰時の自動録音はしない。

Bは交渉許可があるstartだけdecoderを作り、1275byte上限・canonical base64・20ms相当の1920byte decode結果を検査する。PCM/Opus混在、異常packet/durationは停止。既存の50fps token bucket/最新1待機/private pipe期限100ms/所有者確認を継続する。

生成PCM/tone/仮想sinkのみで検証し、実録音/再生やdriver導入は行わない。共有source、他OSの入力backend、実通話アプリの設定・互換性は後続。
