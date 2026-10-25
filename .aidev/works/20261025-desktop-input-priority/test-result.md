# 検証

## 利用者の観測と読み取り専用の調査

1280×800、18.7fps、入力ACK118ms、映像ACK121ms。入力ACKはOSへの適用の確認でアプリの画面反映は含まない。

既存machine channelへのdesktop.capabilitiesは中央値12.58ms（最大488.81ms）。同desktop-share WSS endpointのping/pongは中央値11.43ms（7.73..44.87ms、8 samples）。ticket・共有・入力は要求しない。公開HTTPは42..340msだったがWebSocketと異なるため原因の根拠に採用しない。

Aは1.5秒のサンプルでserver CPUが1コア換算約103%、他PJの動画制作Chromeが約1165%。別のサンプルではserver main thread79%とlibuv worker各約8%。これらの処理は止めずに調査。Bはguard平均0.02759ms、display mode平均0.0071575ms（40回、読み取りのみ）。

## 模擬入力の比較

実画面、OS入力、通信、ブラウザを含まない。100msの映像worker停止、各5 trials。


### benchmark

```text
{"source":"fake input; synthetic 100ms video work; no OS input, capture, network or browser","trials":5,"serialMeanMs":107.66279999999999,"priorityMeanMs":0.14664000000000002}
```

### negative-input

```text
desktop_helper_compiled
desktop_unlock_pipe_cancelled
desktop_unlock_utf8_pipe_passed
desktop_unlock_duplex_pipe_passed
display_lease_checks_passed: DEVMODE220, supported-mode-only, guardian-before-apply, restore/disarm, preserve-local-change, partial-failure rollback; fake driver only; no OS mode changes
desktop_unlock_process_query_passed
desktop_lock_cover_checks_passed
desktop_input_checks_passed
desktop_frame_preparation_checks_passed
frame_preparation_model: duration=5000ms capture_encode=65ms ack=100ms fps_limit=30 serial_frames=31 overlapped_frames=50; deterministic model, not a desktop benchmark
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Native input waited for frame worker"
発生場所 <TEMP>\validate-unlock-helper.ps1:16 文字:1
+ [SodaDesktopTests.InputPriorityChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException

```

### negative-bookkeeping

```text
desktop_helper_compiled
desktop_unlock_pipe_cancelled
desktop_unlock_utf8_pipe_passed
desktop_unlock_duplex_pipe_passed
display_lease_checks_passed: DEVMODE220, supported-mode-only, guardian-before-apply, restore/disarm, preserve-local-change, partial-failure rollback; fake driver only; no OS mode changes
desktop_unlock_process_query_passed
desktop_lock_cover_checks_passed
desktop_input_checks_passed
desktop_frame_preparation_checks_passed
frame_preparation_model: duration=5000ms capture_encode=65ms ack=100ms fps_limit=30 serial_frames=31 overlapped_frames=50; deterministic model, not a desktop benchmark
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Bookkeeping ACK stalled native input"
発生場所 <TEMP>\validate-unlock-helper.ps1:16 文字:1
+ [SodaDesktopTests.InputPriorityChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException

```

### negative-commit

```text
desktop_helper_compiled
desktop_unlock_pipe_cancelled
desktop_unlock_utf8_pipe_passed
desktop_unlock_duplex_pipe_passed
display_lease_checks_passed: DEVMODE220, supported-mode-only, guardian-before-apply, restore/disarm, preserve-local-change, partial-failure rollback; fake driver only; no OS mode changes
desktop_unlock_process_query_passed
desktop_lock_cover_checks_passed
desktop_input_checks_passed
desktop_frame_preparation_checks_passed
frame_preparation_model: duration=5000ms capture_encode=65ms ack=100ms fps_limit=30 serial_frames=31 overlapped_frames=50; deterministic model, not a desktop benchmark
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Input ACK overtook unfinished frame commit"
発生場所 <TEMP>\validate-unlock-helper.ps1:16 文字:1
+ [SodaDesktopTests.InputPriorityChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException

```

### final-native

```text
desktop_helper_compiled
desktop_unlock_pipe_cancelled
desktop_unlock_utf8_pipe_passed
desktop_unlock_duplex_pipe_passed
display_lease_checks_passed: DEVMODE220, supported-mode-only, guardian-before-apply, restore/disarm, preserve-local-change, partial-failure rollback; fake driver only; no OS mode changes
desktop_unlock_process_query_passed
desktop_lock_cover_checks_passed
desktop_input_checks_passed
desktop_frame_preparation_checks_passed
frame_preparation_model: duration=5000ms capture_encode=65ms ack=100ms fps_limit=30 serial_frames=31 overlapped_frames=50; deterministic model, not a desktop benchmark
desktop_input_priority_checks_passed: native input during blocked video work; bounded queue; control/release FIFO; in-progress control and snapshot commit serialization; legacy fallback; fake input only
desktop_unlock_checks_passed
desktop_unlock_no_console_utf8_passed
```

### gpu

```text
desktop_h264_checks_passed: hardware-only MFT, NV12 conversion, four generated frames, initial SPS/IDR, timestamps, packet limits
```

negativeはfast適用条件、ACK追越し条件、commit gateの各修正だけを個別に戻し、実helper結合コンパイル後の実行時に失敗することを確認。production Hostを保存したpositiveとbyte一致で復元し、最終Windows検証/生成GPU回帰検証に成功。
