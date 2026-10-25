# ネイティブのハードウェアH.264

## 範囲

既存DXGI/GDI通常画面をMedia Foundationのhardware-only H.264 MFTで圧縮し、ブラウザWebCodecsで描く。追加SDK/DLL/FFmpeg不要。動画は認証済みviewerの明示操作で開始し、音声は含めない。既存JPEG/PNG配信を既定として維持する。共有元の入力・認証・unlock serviceは維持する。上限は既存の30fps。60fps、GPU上のNV12変換とGPU textureの直接encoder入力、ネイティブ音声、動画の動的bitrate/FPS適応は範囲外。

## Encoder

SodaDesktopH264はMFTEnumEx(HARDWARE|SORTANDFILTER)のNV12→H264だけを列挙する。CPUのinbox encoderへ暗黙fallbackしない。async unlock、ICodecAPIの低遅延BOOL、B picture数0、GOP=fps、出力type→入力type、BEGIN/START_STREAMINGを設定する。初回MF_E_TRANSFORM_STREAM_CHANGEを要求するencoderでは、出力sample/event/bufferを解放後にoutput typeを最大16候補で再設定し、新しいHaveOutputを待って同じ出力を最大4回再試行する。入力は再送しない。type側のSPS/PPSは最大64KiBを保持して初回keyに必要なら前置する。NeedInput/HaveOutputイベントをNO_WAITで読み、イベント待ちは各1秒、入力・出力は一枚ずつ。MFTのsample/buffer/event/activationをfinally/Disposeで解放しIMFShutdown/MFShutdownを呼ぶ。

現在はDXGIでGPU縮小後にCPUへ読み戻し、既存BitmapをBT.709 limited-range NV12へCPU変換してhardware encoderへ渡す。zero-copyとは主張しない。NV12の正のstrideを明示し、偶数寸法のみ。初回Annex-B SPS/IDRを確認し、codec文字列をSPSから読む。1packetは512KiB-9以下。ドライバーが未対応/エラー/イベント待ち超過ならその動画を停止し画像へ戻す。ネイティブAPIそのものが応答しない場合は既存helperの8秒watchdogにより共有自体が終了することがある。

## 経路・互換・権限

viewerがWebSocket subprotocolでnative-video-v1を提示し、新A relayとB RPC capabilityが揃うとだけ内部DesktopOptions.nativeVideoを付ける。新helperが内部allowNativeVideoを許可された通常画面でだけready.nativeVideoを返す。旧A、旧B、旧helperには機能を出さず既存画像共有を維持する。secure desktop/lock coverはNativeVideo不可。通常画面の取得guardを変更しない。同梱helperは既存のデスクトップ共有許可の内でこの映像圧縮を許可する。独自legacy commandは従来のallowMediaが必要。

動画は既存のviewer所有media websocketを使い、media_stream(video/h264, SPS codec, dimensions)とSDM1 chunk内のtimestamp/key/AnnexB access unitで送る。Helper/provider/relay/browserの各段で一枚だけをdecode/draw ACK待ちにする。順番・世代・寸法・timestamp・サイズを検査し、混雑時に参照deltaを間引かず動画全体を停止する。画像ACKとは独立し、動画中もJPEG/PNGを1fpsで更新してagent snapshot/入力鮮度を維持する。動画停止時は画像fps復元・keyframe・保持入力の解放を行う。decoder失敗・古い世代・stopped後のVideoFrameは必ずcloseし画像へ戻す。

## 検証

生成画素のNV12とhardware MFT、hardware生成fixture→実Chromium canvasの色/グレー・ACK・動画中Ctrl+Space/Esc・停止・decoder非対応fallback、旧peer交渉、snapshot独立、キュー/タイムアウト/世代/解放を検証する。実画面の性能測定は通常画面取得が許可される場合のみ明示実行し、入力/画面保存/traceを禁止する。独立点検と最終全体レビューを行う。

参照: [MFTEnumEx](https://learn.microsoft.com/en-us/windows/win32/api/mfapi/nf-mfapi-mftenumex)、[Async MFT](https://learn.microsoft.com/en-us/windows/win32/medfound/asynchronous-mfts)、[低遅延encoderのVT_BOOL](https://learn.microsoft.com/en-us/windows/win32/medfound/codecapi-avlowlatencymode)。外部アプリの実装はコピーしない。
