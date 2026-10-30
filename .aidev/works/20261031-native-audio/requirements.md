# 要件

残件実装を停止せず進める指示。native H264(PR337)の次にLinux/macOSのシステム音声を追加する。Windowsの既存音声と同じ明示許可/要求/再生の境界を使い、無効時は音声取得やencoderを開始しない。現在の実機はWSL/sr-pcのみなので、生成音・fake OS・CIと実機確認を区別する。

続く別段階: native microphone（仮想endpoint/リソース解放fence含む）、native monitor/解像度、動画のUDP/codec/adaptiveと保護/仮想画面の併用拡大。最後にsr-pc接続不具合を解消する。
