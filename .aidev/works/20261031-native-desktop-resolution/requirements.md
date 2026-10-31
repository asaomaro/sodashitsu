# 要件

Linux/macOS nativeの単独動画で、OS画面を変更せず、同じsource/動画ID/入力許可/音声を維持して転送解像度を自動調整する。元の上限と既存native_profile/format ACK protocolを守り、重複encoderや未準備decoderへの新形式frameを作らない。共有native resolution/rateは別段階へ残す。
