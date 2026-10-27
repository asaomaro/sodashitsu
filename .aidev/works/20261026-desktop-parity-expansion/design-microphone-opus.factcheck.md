# マイクOpus設計のファクトチェック

確認日: 2026-10-27。設計を書いたセッションとは別の独立点検。深さ: ざっと、10件。
対象: design-microphone-opus.md 冒頭の外部参照と実装数値。コードの来歴や未実施作業の証明は対象範囲外。
結果: 確認できた10、食い違う0、言いすぎ0、確かめられない0、対象外0。修正必須箇所なし。

### C1 FreeRDP AUDINは独立した入力音声経路
- 場所: 3行目
- 種類: 外部実装
- 判定: 確認できた
- 根拠: 「Audio Input Redirection Virtual Channel」。同ファイルでAUDIN_CHANNEL_NAMEの登録も確認。音声入力専用virtual channelという範囲を支持。別の出どころでは未確認。
- 出典: https://raw.githubusercontent.com/FreeRDP/FreeRDP/master/channels/audin/client/audin_main.c （本文リンクのraw原文、確認日2026-10-27）
- 直し方: —

### C2 RustDesk audio serviceはOpusを利用
- 場所: 3行目
- 種類: 外部実装
- 判定: 確認できた
- 根拠: 「use magnum_opus::{Channels::*, Encoder};」。Encoder生成とencode_vec_float呼出しも確認。別の出どころでは未確認。
- 出典: https://raw.githubusercontent.com/rustdesk/rustdesk/master/src/server/audio_service.rs （本文リンクのraw原文、確認日2026-10-27）
- 直し方: —

### C3 WebCodecs Opusの20ms設定
- 場所: 3行目
- 種類: 外部仕様・数値
- 判定: 確認できた
- 根拠: 「unsigned long long frameDuration = 20000」。同項目の単位はmicroseconds。計算20ms×1000=20000µs。別の出どころでは未確認。
- 出典: https://w3c.github.io/webcodecs/opus_codec_registration.html （§6.1、2026-09-24 Editor’s Draft、確認日2026-10-27）
- 直し方: —。全ブラウザでの対応保証という意味には広げない。

### C4 raw Opus packetを扱える
- 場所: 3行目
- 種類: 外部仕様
- 判定: 確認できた
- 根拠: 「EncodedAudioChunk have to be Opus packets」。opus formatの場合の規定で、ogg formatも別に存在する。製品はformat省略時の既定opusを使用。別の出どころでは未確認。
- 出典: https://w3c.github.io/webcodecs/opus_codec_registration.html （§2、§6.1、確認日2026-10-27）
- 直し方: —。全formatがraw packetという意味には広げない。

### C5 AudioEncoderの48kHz・mono・20ms・32kbps
- 場所: 7行目
- 種類: 製品実装・数値
- 判定: 確認できた
- 根拠: 「sampleRate:48000,numberOfChannels:1,bitrate:32000」。同configのframeDurationは20000。計算32000bit/s÷1000=32kbps、20000µs÷1000=20ms。指定値であり実測帯域の保証ではない。
- 出典: packages/web/src/desktop/microphoneClient.ts start() のconfig（確認日2026-10-27） 一時ローカルHTTP照合: http://127.0.0.1:18750/packages/web/src/desktop/microphoneClient.ts
- 直し方: —

### C6 encoder queue2件・ACK待ち含め12件
- 場所: 7行目
- 種類: 製品実装・上限
- 判定: 確認できた
- 根拠: 「encoder.encodeQueueSize>=2」と「this.encoding.size+this.pending.size>=12」で追加投入を拒否。PCM経路もpending.size>=12で拒否する。
- 出典: packages/web/src/desktop/microphoneClient.ts node.port.onmessage（確認日2026-10-27） 一時ローカルHTTP照合: http://127.0.0.1:18750/packages/web/src/desktop/microphoneClient.ts
- 直し方: —

### C7 鮮度100ms・stall200ms・ACK期限500ms
- 場所: 7行目
- 種類: 製品実装・期限
- 判定: 確認できた
- 根拠: 「performance.now()-frame.at>100」で古いencode結果を破棄。「pending+500」「encoding.at+200」で期限を設定。frame.atはencoder投入時刻であり、全区間の実機遅延を保証する数値ではない。
- 出典: packages/web/src/desktop/microphoneClient.ts encoder output / armDeadline()（確認日2026-10-27） 一時ローカルHTTP照合: http://127.0.0.1:18750/packages/web/src/desktop/microphoneClient.ts
- 直し方: —

### C8 Bの1275byte上限とcanonical base64検査
- 場所: 9行目
- 種類: 製品実装・上限
- 判定: 確認できた
- 根拠: 「bytes.length>1275」と「bytes.toString("base64")!==m.data」で拒否。製品の受入上限として確認し、全Opus packetの仕様上限とは判定していない。
- 出典: packages/server/src/desktop/DesktopMicrophone.ts fromViewer()（確認日2026-10-27） 一時ローカルHTTP照合: http://127.0.0.1:18750/packages/server/src/desktop/DesktopMicrophone.ts
- 直し方: —

### C9 20ms分の48kHz mono s16 PCMは1920byte
- 場所: 9行目
- 種類: 計算・製品実装
- 判定: 確認できた
- 根拠: 計算48000sample/s×0.020s×1channel×16bit÷8=1920byte。「pcm.length!==DESKTOP_MICROPHONE_BYTES」で検査し、定数は「DESKTOP_MICROPHONE_BYTES = 1920」。
- 出典: packages/server/src/desktop/DesktopMicrophone.ts fromViewer()、packages/protocol/src/desktopMicrophone.ts（確認日2026-10-27） 一時ローカルHTTP照合: http://127.0.0.1:18750/packages/server/src/desktop/DesktopMicrophone.ts http://127.0.0.1:18750/packages/protocol/src/desktopMicrophone.ts
- 直し方: —

### C10 token bucket50fps・最新1待機・pipe期限100ms
- 場所: 9行目
- 種類: 製品実装・数値
- 判定: 確認できた
- 根拠: 「c.tokens=Math.min(12,c.tokens+(now-c.rateAt)/20)」。計算1000ms÷20ms=50token/s、burst容量12。「c.latest?.pcm.fill(0);c.latest=frame」で待機1件を置換。「Date.now()+100」でpipe packetの期限を付ける。50fpsは持続補充率であり瞬間burst上限ではない。
- 出典: packages/server/src/desktop/DesktopMicrophone.ts fromViewer() / flush()（確認日2026-10-27） 一時ローカルHTTP照合: http://127.0.0.1:18750/packages/server/src/desktop/DesktopMicrophone.ts
- 直し方: —

## 照合方法と限界

claims.py extract後、複合候補を分解して外部参照を補い10件へ絞った。外部引用4件はclaims.py quote/verifyで原文一致を機械確認。製品引用13件はローカルファイルに対するPython assertで一致を確認し、数値もPythonで再計算した。さらにclaims.pyはローカルパスに対応しないため、同じworktreeのコードをHTMLエスケープし127.0.0.1限定の一時HTTPで読み出して全引用をverifyした（照合後停止。上記ローカルURLは恒久公開先ではなく、保存したファイルパスを正本とする）。外部3ページは一次情報だが、独立した第二出典との照合は未実施。master/Editor’s Draftは更新されるため確認日を付記した。

文書と出典・現コードの一致を扱い、実音声・実通話アプリの品質、遅延、互換性を実証する点検ではない。
