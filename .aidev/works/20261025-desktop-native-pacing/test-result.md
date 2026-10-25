# 検証結果

## 実機のSleep計測

sr-pcで新規PowerShellプロセスから各40回。実画面取得・入力なし。

```json
{"sleep2Ms":15.860949999999999,"sleep1Ms":15.80444}
```

## 手元のWindowsでの生成画像比較

1920×1200、30fps要求、90枚、2500kbps。生成bitmap→production encoderとframe delay方針を測る。各1回、全体JSテストと同時実行のため負荷変動あり。実画面の取得・ネットワーク・ACK・ブラウザは含まない。


### baseline-benchmark

```text
{"source":"generated pixels only; no capture, network, ACK, browser","frames":90,"width":1920,"height":1200,"fps":23.43799866783624,"conversionMeanMs":11.118756666666664,"conversionP95Ms":13.713700000000001,"encoderMeanMs":14.494463333333336,"encoderP95Ms":33.8423,"helperCpuOneCorePercent":31.738956529361573,"deadlinePacing":false}
```

### fixed-benchmark

```text
{"highResolution":true,"timerRequestedMs":1,"timerActualMeanMs":1.4618925}
{"source":"generated pixels only; no capture, network, ACK, browser","frames":90,"width":1920,"height":1200,"fps":26.600167037226694,"conversionMeanMs":11.407203333333333,"conversionP95Ms":15.655100000000001,"encoderMeanMs":17.187845555555555,"encoderP95Ms":34.0489,"helperCpuOneCorePercent":40.177335629144487,"deadlinePacing":true}
```

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
