# GPU直接入力の検証

生成textureだけを使用。実デスクトップの取得・OS入力・画面モード変更は行っていない。

Windows実GPUで、NV12 Y/UV planeと従来変換の一致（誤差1以内）、4枚固定pool・枯渇timeout・MF保持中のcaller Dispose・二重submit/retire・shutdown後の再取得・immediate context状態保持を確認。640×360 / 1280×800 / 1920×1200各90枚でhelperのフルフレームCPU readback増分0。IMFTrackedSampleの最後の参照解放でのみpoolへ返す。実画面未確定時と無効化後のmemory hardware fallbackも確認した。

生成GPU→実hardware MFTのSPS/IDR付きfixtureを製品canvasへ復号・描画し、色/グレー、描画ACK、キー、停止後の画像復帰をブラウザで確認。カーソルの画素一致はWindows側のraw NV12比較で確認。

生成90枚の時間は実行ごとにGPU平均4〜31ms、memory入力平均約31msと変動した。比較から実回線の速度向上率は主張しない。実capture・通信・ブラウザ・driver内部copyを含まない。保証できる変更は動画のhelperによるフルフレームCPU readback除去。補助画像snapshotの読み戻しは残る。

既存validate-unlock-helper / validate-nv12 -Gpu / validate-h264は成功。差分全体と修正を別コンテキストで独立レビュー済み。

## 修正を戻した反証

いずれもコンパイルではなく実行時に失敗し、その後ソースをバイト単位で復元した。

- [終了順](gpu-surface-negative-capture-order.log): MFT停止前にcaptureを破棄すると、停止callback内のdevice参照が失敗。
- [早期解放](gpu-surface-negative-caller-release.log): caller DisposeでMF保持中画像をpoolへ返すと、保持中再利用の検査が失敗。
- [状態保存](gpu-surface-negative-context-state.log): ExecuteCommandListのrestoreを外すと、保持したtopology検査が失敗。

最終確認: native-video + focused inputのブラウザ試験8件成功、明示opt-inの実画面性能試験1件skip。E2E typecheckとsmoke成功。生成fixtureは最終adapter-bound実装から再生成した。

sr-pcでも一時フォルダへ同じコミットのsourceを展開し、既存helper/hardware H264/NV12と直接入力3寸法を検証して成功。1920×1200の生成90枚はGPU平均7.81ms（p95 12.14ms）、memory入力平均13.18ms（p95 15.69ms）。同一試験内の参考値で、実画面・通信・操作遅延の測定ではない。全寸法でフルフレームCPU readback増分0。検証中のBリポジトリHEAD/変更は維持した。[生ログ](sr-pc-generated.log)。
