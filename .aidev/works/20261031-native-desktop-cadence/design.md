# 設計

native_rate/native_bitrateの既存Node品質制御を両helperへ接続する。元の上限を別保持し、source照合後のidentityで再入を検査する。Linuxは同worker threadでGStreamerのmutable-playing bitrate propertyだけを変更し、非対応/失敗では動画を止める。FPSは新しい取得の間隔とbuffer durationへ適用し、元capsの上限は維持する。macOSは同VT serial queueでAverageBitRateを更新し、API失敗をlatchして次encodeを非公開で失敗させる。物理encoderは継続し、許可/source/ACK期限を延ばさない。

Provider能力はlocal allowNativeVideoとnativeCadence helper proofを必要とする。共有nativeはsharedRateを交渉できるまで拒否を維持する。単独のUIに動画FPS/帯域自動調整を表示する。

参照: [GStreamer x264enc](https://gstreamer.freedesktop.org/documentation/x264/index.html)、[mutable-playing propertyの公式実装](https://github.com/GStreamer/gst-plugins-ugly/blob/master/ext/x264/gstx264enc.c)、[Apple live encoding](https://developer.apple.com/documentation/videotoolbox/encoding-video-for-live-streaming)。実装を転載していない。
