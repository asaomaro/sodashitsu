# Native動画のGPU色変換

ユーザー観測: 1920x1200 / 9.9fps / 取得25.6ms / 色変換37.8ms / 圧縮待ち10.7ms / 描画ACK227ms / 入力ACK117ms。アイコン選択を左右キーで連続移動して測定。マウス集約だけでは解消しない。一般的なremote desktopアプリで利用する未対応の実装を取り込む指示。

RustDesk hwcodecのGPUメモリ経路とMicrosoft Desktop Duplicationを参照。現在の取得はGPUだが、GPU→32bpp Bitmap→24bpp Bitmap→BGR配列→CPU NV12→MF bufferというコピーと色変換が残る。本差分はGPUで縮小・固定カーソル合成・BT.709 limited NV12色変換を行い、NV12の1.5 bytes/pixelだけをCPUへ読み戻す。MFエンコーダへは既存メモリbufferで渡すためzero-copyとは呼ばない。DXGI NV12 surfaceのMFT直入力、UDP/WebRTC native通信、cursor独立配信は後続の別変更に分ける。

通常画面のnative動画に限定し、既存DXGI retained sourceからHLSLで4bytes/texelのBGRA targetへNV12をpackする。幅が4の倍数でない偶数幅もpaddingを除いて読み戻す。黒白背景で生成した16x24の固定cursor spriteにより透明・不透明・AND/XOR反転を合成する。sourceは変更せず、画像snapshotとカーソルなし表示へ影響させない。最初の未確定surfaceは既存AcquireFrame保護を共有する。GPU変換例外は1回だけでラッチしてCPU Bitmap経路へ戻し、通常DXGI取得を維持。認証画面・入力・権限・watchdog・表示guardは変更しない。public protocolの変更なし。

CPU fallbackは2x2演算の添字計算を展開し、既存丸めとbyte一致を維持。生成画素でscalar referenceと照合し、GPUは既存bilinear renderからの色・縮小・cursorを比較する。実画面取得は明示CaptureDesktopだけとし、ロック時に解除・入力・迂回しない。独立レビューでABI、resource、fallback、入力guardを点検する。

参照（コードのコピーなし）:
- https://github.com/rustdesk-org/hwcodec
- https://learn.microsoft.com/en-ca/windows-hardware/drivers/display/desktop-duplication-api
- https://learn.microsoft.com/en-us/windows/win32/api/mfapi/nf-mfapi-mfcreatedxgisurfacebuffer
