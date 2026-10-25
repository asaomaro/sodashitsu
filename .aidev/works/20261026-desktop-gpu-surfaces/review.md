# 独立レビュー

2026-10-26、実装とは別のコンテキストで製品差分・生成GPU検証・文書を点検した。最終差分に修正必須の指摘はない。

## 点検範囲

- DXGI/D3D11/MFのABI、adapter LUIDによる同一GPUのhardware MFT列挙、device managerの所有と解放を確認。MFTEnum2の引数とLUID属性はMicrosoftのAPI資料とも照合した。
- NV12のY/UV plane、4枚固定pool、IMFTrackedSampleの最後の外部参照解放後のcallback退役を確認。caller DisposeはMF所有中に再利用させず、二重submit・二重退役を防ぐ。遅いcallbackはmanaged状態だけを操作する。
- 専用deferred context、multithread protection、ExecuteCommandListの状態保存、部分初期化時のcleanupを確認。
- 未確定source・未初期化device・非対応時は従来のmemory hardware入力を使う。最初のpacket公開前だけ新しいmemory encoderへ切り替え、公開後は画像配信へ戻す。認証画面・入力・表示guardとpublic protocolは変更しない。
- 文書はGPU内部copyや実回線の速度向上を保証せず、動画のフルフレームCPU readback除去と、残る補助画像snapshotの読み戻しを区別している。helper更新後の共有再起動で反映する手順も実装と一致する。

## 指摘と再点検

初回レビューで、補助画像のCaptureFrameが例外になったとき、GPU入力MFTより先にcapture/contextを破棄する経路を指摘した。RetireCaptureの破棄前callbackでGPU入力MFTを停止する修正を確認し、再点検を通過した。終了順のnegativeも実行時失敗を記録している。

最終追加のnull/寸法guard、保持中の二重submit検査、未初期化fallback、実際のreadback増分の出力、文書とraw negative記録を再確認した。追加指摘はない。git diff --checkは成功した。

## 検証の確認範囲

生成GPUテストの4枚pool・枯渇期限・NV12 plane/カーソル比較・context状態保持・90枚encode中のCpuReadbacks不変検査と、早期解放/状態保存/終了順を壊すnegativeの生出力を確認した。生成fixtureを製品ブラウザへ通すE2Eも追加されている。実画面・実回線の性能はこの検証の対象外。

この記録時点では、実装側による最終ブラウザ試験・E2E型検査・smokeが進行中。これらの完了結果はtest-result.mdへ記録する。
