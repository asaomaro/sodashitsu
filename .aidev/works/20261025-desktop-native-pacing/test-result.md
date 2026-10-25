# 検証結果

## 実機のSleep計測

sr-pcで新規PowerShellプロセスから各40回。実画面取得・入力なし。

```json
{"sleep2Ms":15.860949999999999,"sleep1Ms":15.80444}
```

## 生成画像の比較

1920×1200、24bpp（productionと同じ形式）、30fps要求、90枚、2500kbps。生成bitmap→production encoderとframe delay方針を測る。各1回。実画面の取得・ネットワーク・ACK・ブラウザは含まない。

手元のWindowsは全体JSテストと同時実行。sr-pcも他の処理を止めていないため負荷変動を含む。CPUは速度上昇と共に増える場合がある。動画のfps上限は30のまま。

### 手元のWindows

```text
{"source":"generated pixels only; no capture, network, ACK, browser","frames":90,"width":1920,"height":1200,"fps":16.357492786754619,"conversionMeanMs":16.915474444444449,"conversionP95Ms":21.2113,"encoderMeanMs":29.0348911111111,"encoderP95Ms":33.769800000000004,"helperCpuOneCorePercent":39.757794967806362,"deadlinePacing":false}
```

```text
{"highResolution":true,"timerRequestedMs":1,"timerActualMeanMs":1.51228}
{"source":"generated pixels only; no capture, network, ACK, browser","frames":90,"width":1920,"height":1200,"fps":22.572089045085516,"conversionMeanMs":14.148497777777775,"conversionP95Ms":16.3993,"encoderMeanMs":28.656896666666672,"encoderP95Ms":34.2579,"helperCpuOneCorePercent":40.363284229927224,"deadlinePacing":true}
```

### sr-pc

```text
variant=baseline
{"source":"generated pixels only; no capture, network, ACK, browser","frames":90,"width":1920,"height":1200,"fps":17.98744871803353,"conversionMeanMs":19.631843333333332,"conversionP95Ms":32.795500000000004,"encoderMeanMs":18.892247777777779,"encoderP95Ms":23.7071,"helperCpuOneCorePercent":41.845800837091893,"deadlinePacing":false}
variant=fixed
{"highResolution":true,"timerRequestedMs":1,"timerActualMeanMs":1.6924125}
{"source":"generated pixels only; no capture, network, ACK, browser","frames":90,"width":1920,"height":1200,"fps":27.503552083751618,"conversionMeanMs":15.799815555555554,"conversionP95Ms":32.3399,"encoderMeanMs":9.23644888888889,"encoderP95Ms":12.713000000000001,"helperCpuOneCorePercent":53.479129051739264,"deadlinePacing":true}
desktop_h264_checks_passed: hardware-only MFT, NV12 conversion, four generated frames, initial SPS/IDR, timestamps, packet limits
{"sourceRef":"a93ac9df432b2a1ead3cc7bcc50af2289c2977ff","trackedStatus":[],"repoHead":"34db79f83e8809ce4153c44f4ae9bcb9b31a2773"}
```

sr-pcは生成画像で17.99→27.50fps、encoder平均18.89→9.24ms、1ms timer実時間1.69ms。helper CPUは1コア換算41.85→53.48%。実デスクトップでの利用者の17.7fpsからの改善はまだ未測定。

## 修正を戻す検証

### negative-timer

```text
{"highResolution":true,"timerRequestedMs":1,"timerActualMeanMs":15.174270000000002}
"1" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "High-resolution 1ms timer averaged >=10ms"
発生場所 <TEMP>\benchmark-h264-generated.ps1:5 文字:1
+ [SodaDesktopTests.H264Benchmark]::Run([bool]$ValidateTimer)
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException

```

### negative-frame-delay

```text
desktop_helper_compiled
desktop_unlock_pipe_cancelled
desktop_unlock_utf8_pipe_passed
desktop_unlock_duplex_pipe_passed
display_lease_checks_passed: DEVMODE220, supported-mode-only, guardian-before-apply, restore/disarm, preserve-local-change, partial-failure rollback; fake driver only; no OS mode changes
desktop_unlock_process_query_passed
desktop_lock_cover_checks_passed
desktop_input_checks_passed
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Ready video delayed after work"
発生場所 <TEMP>\validate-unlock-helper.ps1:15 文字:1
+ [SodaDesktopTests.FramePreparationChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException

```

negativeは待機部分だけをSleepに戻す場合と、due済みの待機0を2に戻す場合の2種類。それぞれC#を再コンパイルして実行時の失敗を確認。元のHostをbyte一致で復元。

## 最終確認

- build / typecheck: 成功。
- 全体vitest --maxWorkers=4: 739 files / 11315 tests passed、444.28秒。
- 関連E2E（native、input、cover）: 11 passed / 明示指定の実画面benchmark 1 skipped。
- clean worktreeのpnpm smoke: PASS。
- negative復元後のWindows実helper結合コンパイル、scheduler/fallback/dispose検証: 成功。
- 24bppの生成画像benchmarkと-ValidateTimer: 手元とsr-pcで成功。
- sr-pcのhardware H264 / NV12 / packet / SPS-IDR回帰検証: 成功。
- 元のdirty作業フォルダは3-wayで利用者の差分を保持し、build成功。
- 独立レビュー: production指摘なし。
