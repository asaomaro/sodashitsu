# 要件

Linux/macOS nativeの追加codec交渉を実装する。OS/ライブラリの利用可能なencoderだけを提示し、codec/profile/key情報を実圧縮データから取得する。未対応・encoder/decoder失敗は既存のH264再試行へ戻す。同時encoder数・source/権限・元の取得期限を増やさず、無効な機能は起動しない。Linux H264-444/HEVC/AV1、macOS公開VideoToolboxのHEVCを対象とし、macOSのAV1/444 encoderは提示しない。
