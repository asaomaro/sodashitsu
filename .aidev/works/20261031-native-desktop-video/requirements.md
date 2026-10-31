# 要件

Linux/macOS nativeのUDP/WSS復帰、対応codec交渉、動的fps/bitrate/転送解像度に対応する。無効な機能は起動しない。実OS capture/input/audioを生成試験に使わず、各backendは実encoderの存在と元のsource/epochを確認する。

最初の差分はUDP/WSS復帰と旧encoder/audio actorの退役競合を対象とする。codec・自動調整・転送解像度は次の差分で継続し、このPRで全要件完了とはしない。
