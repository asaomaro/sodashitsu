# 設計

Nodeの既存codec/UDP/fallbackをnative platformへ交渉し、local allowNativeVideoとhelper nativeCodecs proofを維持する。codecNameは交渉した場合だけ送る。

Linuxは固定GStreamer factory表とparser存在で候補を提示する。実NAL/OBUからcodec/profile/tier/level/depth/keyを取り出し、H264-444はprofile244/chroma3を要求する。128units・64KiB parameter/sequence・512KiB未満packetに制限し、複数picture/AUと未対応layerを拒否する。parameter cacheはstream別。候補失敗時は同familyの旧pipelineを実NULL退役してから次候補へ進み、元capture期限/sourceを再検査する。動画ID変更時はcache/sequenceを引き継がない。

macOSは同じserial VT sessionでHEVCを選び、実CoreMedia subtype/VPS/SPS/PPSとNAL長からAnnexBとcodecを生成する。HEVC hardware encode対応時だけ候補に出す。公開VT encoderがないAV1/H264-444は出さない。H264 codecは既存protocolに一致するlowercaseへcanonical化する。

元のWindows bitstream処理を参照し、GStreamer/Appleの公開APIを確認した。[av1enc](https://gstreamer.freedesktop.org/documentation/aom/av1enc.html)、[av1parse](https://gstreamer.freedesktop.org/documentation/videoparsersbad/av1parse.html)、[x265enc](https://gstreamer.freedesktop.org/documentation/x265/index.html)、[Apple HEVC parameter sets](https://developer.apple.com/documentation/coremedia/cmvideoformatdescriptiongethevcparametersetatindex(_:parametersetindex:parametersetpointerout:parametersetsizeout:parametersetcountout:nalunitheaderlengthout:))。
