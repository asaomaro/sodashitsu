# 通常デスクトップのDXGI取得

## 要件と範囲

通常画面の取得・縮小p95を改善する。既存の認証、入力、ロック解除、画像ACK/鮮度、JPEG/PNG経路は維持する。GPU動画圧縮、CopyRect、カーソル形状転送は後続作業。

## 実装

WindowsDesktopHost.cs内の独立したSodaDesktopDxgiがWindows標準のDXGI/D3D11 COM ABIとHLSL compilerを使用する。追加ネイティブDLL、SDK、NuGet依存なし。対象出力と同じadapterからdeviceを作成する。取得GPU textureを保持し、GPU上で送信寸法へ縮小し、縮小画像だけstaging textureから読み戻す。無更新時は保持sourceを再描画し、cursorを含んだ前回CPU bitmapを使い回さない。初回Acquire待機は16ms、その後は0ms。初回pointer-only（LastPresentTime=0）または初回timeoutはfalseを返し、そのフレームだけGDIを使う。未確定の黒画像を配信せず、desktop presentが来たらDXGIへ移る。初期化後pointer-only/timeoutは保持した有効sourceを使う。取得frameはfinallyでReleaseFrame、mapped stagingはfinallyでUnmap、COMとbitmapはDisposeで解放する。サイズ/format/row pitchを検証する。

Secureはこのクラスを初期化しない。x86、回転出力、API/GPU未対応、初期化・取得失敗は接続中GDIへ戻す。表示の座標・サイズが変わる場合は既存Matchesガードで共有を終了する。

新provider→helper内部configureにだけcaptureBackendsを追加し、旧providerでは新helperもGDI。新helperのwindows-dxgi readyをproviderで従来のwindows-gdiへ写し、旧viewerに新しいbackend値を送らない。旧helperは新しいconfigureのトップ項目を無視する。ローカル-CaptureBackend gdiまたは環境変数で強制GDIが可能。

## 検証

生成GPU画像の縮小/色/向き/奇数幅/再描画/解放、helper交渉と旧viewer ready互換、Windows実画面でのGDI比較、ブラウザcanvasを含む比較、独立レビュー。既存native checks、build/typecheck/全unit/smoke、関係E2E。native benchmarkはスクリーンショット/traceを保存せず入力を許可しない。

API仕様: https://learn.microsoft.com/en-us/windows/win32/direct3ddxgi/desktop-dup-api
独自実装。外部アプリのGPL/AGPL実装は取り込まない。
