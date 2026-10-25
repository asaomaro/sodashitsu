# GPU画像のエンコーダ直接入力

利用者が安定を確認し、一般的なremote desktopと同等へ実装を進める指示。残るフルフレームCPU readback/uploadを省く。まずこのGPU基盤を小さなPRとして仕上げ、その後に映像と入力のbulk通信待ちを分離する。60fps、native UDP、独立cursorはこのPRへ混在させない。

通常desktopの確定済みDXGI sourceに対し、既存のBT.709縮小/cursor shaderをNV12のY(R8)/UV(R8G8) planeへ描く。D3D11-aware hardware MFTへDXGI device managerを渡し、MFCreateDXGISurfaceBufferでsampleへattachする。出力のH264だけCPUへ戻す。GPU内部copyの不存在は保証せず、主張は『フルフレームCPU読み戻しなし』とする。画像snapshotは既存経路。

GPU surfaceは4枚の固定pool。IMFTrackedSample allocator callbackでMFTの最後の参照が解放された後にだけ再利用する。ProcessOutputが終わってもsampleが解放済みとはみなさない。caller DisposeでMF所有のframeを返却せず、再submit/二重releaseも拒否/冪等化。pool待ちは1秒で有界。MFT shutdown後にpool/device/contextを順に解放し、遅いcallbackはmanaged状態のみ触る。

共有するimmediate contextはmultithread protectedにする。helperのrenderは専用deferred contextへ記録し、ExecuteCommandList(restore state=true)でMFTの描画状態を保存する。旧Bitmap/NV12 readbackも同様にrender状態を保護する。

未確定DXGI source・NV12 plane/driver/MFT非対応は開始時に従来のhardware memory-input経路を使う。最初のpacketを公開する前のGPU encoder障害では、旧encoderを閉じてmemory-inputの新encoderへ切り替え、新SPS/IDRから開始できる。公開後の障害は既存どおり動画停止/画像へ戻し、GPU経路をその共有内で無効にする。送出済みH264参照を勝手に差し替えない。

native APIはWindows SDK 10.0.19041のABIとMicrosoft API資料を照合。生成texture→実MFT→実ブラウザの色、保持中4枚poolとtimeout、遅延解放/二重submit/caller Dispose、初期化/停止/fallback、既存native回帰を検証し、差分全体を独立レビューする。

参考: https://learn.microsoft.com/en-us/windows/win32/api/mfapi/nf-mfapi-mfcreatedxgisurfacebuffer / https://learn.microsoft.com/en-us/windows/win32/api/mfidl/nf-mfidl-mfcreatetrackedsample / https://learn.microsoft.com/en-us/windows/win32/api/mfidl/nf-mfidl-imftrackedsample-setallocator
