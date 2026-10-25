# 検証結果

## 利用者の観測と切り分け

1920x1200、9.9fps、取得25.6ms、色変換37.8ms、圧縮待ち10.7ms、描画ACK227ms、入力ACK117ms。ブラウザ画像にある色変換はBitmapからの取り出しとCPU変換の合計であり、色計算だけとは区別した。

sr-pcの生成配列を使った現行scalar変換は1920x1200で約6.45ms、コンパイル最適化を明示しても5.99msで、compiler flagだけでは解消しないため変更しなかった。guardと画面mode照合は平均0.0268/0.0071ms。Bから同じA desktop WSS endpointへのping/pong 8件はmin6.91/median9.03/max55.63ms。provider ticket・共有・入力は要求していない。入力ACKとの差は回線単独では説明できず、今回のGPU化で入力117msまで解消したとは主張しない。

## Native・GPU確認

- ローカルWindows: 実helper entrypoint結合compile、既存unlock/pipe/display lease/入力/画像準備/入力優先の回帰検証成功。
- ローカルWindows / sr-pc: 生成画素のscalar referenceとCPU fallbackのbyte一致、source不変、寸法制限、実wrapperの例外→fail latchを確認。
- ローカルWindows / sr-pc: 生成GPU textureの非整数縮小比・各pixelのRGB変化、BT.709色、chroma、幅6のpadding、カーソルと端・反転、source保持、例外後の通常render継続、二重Dispose成功。
- hardware MFTはBitmapとprepared NV12を交互に4枚encodeし、初回SPS/IDR・timestamp・packet上限を確認。
- 独立レビュー: shader・ABI・resource・fallback・入力guardに必須指摘なし。最終追加差分も再レビュー通過。
- 実画面検証: ローカルWindowsはnormal desktop guardで停止、sr-pcはdesktop source coverでskip。ロック解除・OS入力・表示mode変更は行わない。初回の実desktop未確定frameからの新入口は未検証。既存AcquireFrameを共通利用し、生成GPU testと明示CaptureDesktop手順を用意した。

## sr-pcの定常時比較

GPU shaderとresourceの初期化を済ませてから、生成textureの縮小・固定cursor・NV12変換・readbackを各40回、順を交互に実行。既存CPU経路はGPU BGRA readback→Bitmap描画→BGR取り出し→scalar NV12。画面取得、encoder、通信、ブラウザを含まない。ロック状態で外れ値が出ており、原因は未確定。平均とp95を併記する。最初の予備計測は故障テスト直後のresource再初期化が混入したため比較値から除外し、ハーネスを修正して取り直した。

| pixels | CPU mean ms | GPU mean ms | CPU p95 ms | GPU p95 ms |
|---|---:|---:|---:|---:|
| 1280x800 | 23.079 | 5.229 | 25.969 | 5.483 |
| 1920x1200 | 64.810 | 22.297 | 60.801 | 11.151 |

この値を利用者のFPS・入力→表示の改善値として扱わない。未対応時はCPU経路を維持する。CPU fallback自体の1920x1200変換は平均5.720→4.593ms、byte一致。

## Negative control

GPU shaderのsamplingだけをnearestへ戻して、非整数縮小を検査する回帰試験が実行時に落ちることを確認した。Host sourceはtry/finallyでbyte一致に復元し、最終CPU/GPU/native checksを再実行した。

```text
desktop_nv12_checks_passed: byte-exact BT.709 reference, black/white/random, chroma rounding, row edges, source preserved, invalid dimensions, GPU failure latch

"1" 個の引数を指定して "Gpu" を呼び出し中に例外が発生しました: "GPU NV12/color/cursor mismatch 2x2 byte 0 actual 38 exp
ected 30"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-input\scripts\remote-desktop\validate-nv12.ps1:8 文字:13
+ if ($Gpu) { [SodaDesktopTests.Nv12Checks]::Gpu([bool]$Benchmark) }
+             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 

```

## 最終確認

- 関連の実ブラウザ native-video/input/cover: 11 passed / 明示指定の実画面benchmark 1 skipped。ブラウザ描画、キー/全ボタン、fallbackを確認。新GPU pixel処理そのものは上記Windows checksで確認し、模擬helperのブラウザ試験と混同しない。
- clean feature worktreeのpnpm smoke: PASS。
- TypeScript/JavaScript/protocolの差分は0で、直前mainのbuild/typecheck/全11339件試験は成功済み。今回はC#の実コンパイル・native/GPU回帰と関係E2Eを実施し、全体unitを重複実行しない。
- root作業フォルダへ3-way反映し既存変更を保持。rootのGPU色変換とhelper結合コンパイル・既存native回帰も成功。
