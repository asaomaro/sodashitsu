# 設計（実装前）

既存DesktopNativeVideoのnative_video/ack/keyframe/bitrate→native_frame/ native_video_stopped契約を使う。H.264 AnnexB、codec avc1.<SPS profile/compat/level>、timestamp microseconds、連続seq、最大3未ACK、512KiB AUを守る。初期画像のsourceと同じ取得範囲・generationに固定する。

- macOS: 現在のSCScreenshotManagerが返すCGImageを有効な要求時だけCVPixelBufferへ変換し、低遅延VideoToolboxへ渡す。処理中1枚、原本期限/source ownerを公開直前にも検査する。取消後のcallbackは破棄し、予測frameの公開が欠けた場合は動画を有限停止して画像へ戻す。VT create/encode/invalidateは専用serial queueで行いsource gate保持中には待たない。
- Linux: 同じPortal PipeWire sourceの既存BGR buffer probeから、有効時だけ有限のowned encoderへ渡す。probeはoutput_gateの取得でblockしない。専用GStreamer appsrc→convert→低遅延H264→appsinkを要求時にだけ生成し、停止している旧workerのslotを終了前に再利用しない。生成画像だけでencoder/decoder roundtripを確認。optional encoderが利用できなければ明示unavailableで画像を継続する。
- 既存画像ACKは動画ACKと分離。encoderを有効にしてもagent snapshot/領域proofを動画の絵で代用しない。
- 設定/Provider/native option guard/ready/browserの能力交渉を実経路で検証する。clipboardで見つかったSettingsの実配線不足を繰り返さない。

資料: https://developer.apple.com/documentation/videotoolbox/vtcompressionsession-api-collection 、https://gstreamer.freedesktop.org/documentation/x264/index.html 、https://gstreamer.freedesktop.org/documentation/videoparsersbad/h264parse.html 。一次資料参照、自製実装。他製品のコードはコピーしない。

この段階では音声・マイク・OS解像度・複数monitorは広告しない。別機能の許可を借りたり、別capture sourceへ暗黙に切り替えたりしない。

動画は人向けの表示経路であり、agent snapshot/入力revisionの証明には使わない。通常のキー操作ごとに動画を破棄することはせず、画像/region proof側の既存input revision fenceを維持する。

物理終了を確認できないGStreamer pipelineは、そのworkerに保持してslotを解放しない。候補encoderの初期化失敗時もNULL確認なしで別候補へ進めない。同UUIDの再startは禁止する。global inflight jobは取消/stream交替で解放せず、物理complete/retireでのみ解放。画像のvideorateと動画の独立creditでJPEG再圧縮頻度を制御する。
