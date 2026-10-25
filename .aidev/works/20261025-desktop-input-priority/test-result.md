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

## sr-pc事前検証

既存のリポジトリ作業ツリーは変えず、branchから一時フォルダへCS/PSを展開して実helper結合compile、pure競合テスト、模擬benchmark、生成GPU回帰を実行。

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
{"source":"fake input; synthetic 100ms video work; no OS input, capture, network or browser","trials":5,"serialMeanMs":105.83488,"priorityMeanMs":0.051019999999999989}
desktop_h264_checks_passed: hardware-only MFT, NV12 conversion, four generated frames, initial SPS/IDR, timestamps, packet limits
{"sourceRef":"888bd0469316b387209fd1f81cb4b9f93362eb75","trackedStatus":[],"repoHead":"1a66a3b54381dfa898f54ed2a5aadf9d278c7281"}
```

sr-pcの100ms模擬work停止では105.83→0.051ms。ネットワーク、OS入力、実画面・ブラウザは含まない。

## 最終のbuildとブラウザ検証

- build / typecheck: 成功。
- 全体vitest --maxWorkers=4: 736 files passed / 3 failed、11310 tests passed / 5 timeout、486.57秒。失敗はSettingsDialog/Sidebar/GraphViewの5件で、いずれも5000msまたは15000msの時間切れ。今回のpackages配下の差分は0。
- 当該3ファイルをmaxWorkers=1で再実行: 419 tests passed / 3 files passed、52.49秒。タイムアウト値と製品コードは変更していない。
- 関連E2E（native video/input/cover）: 11 passed / 明示指定の実画面benchmark 1 skipped。
- clean worktreeのpnpm smoke: PASS。
- 利用者の差分を保持して元のdirtyフォルダへ3-way反映し、build成功。
- C#補助プログラムだけなのでhandoffは不要。現在の共有を利用者が開き直すと新しい入力処理になる。

### 全体試験の時間切れの生出力抜粋

```text
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/SettingsDialog.test.ts > SettingsDialog — 端末の節 — 新しく開く場所（AC4・AC10・AC-I1・AC-I2） > 開き直すと、入力欄は保存した値から始まる
Error: Test timed out in 15000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/components/SettingsDialog.test.ts:980:3
    978|   });
    979|
    980|   it("開き直すと、入力欄は保存した値から始まる", async () => {
       |   ^
    981|     useSettingsStore(pinia).setNewCwdPolicy("path");
    982|     const { wrapper, view } = await openDialog();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  |@sodashitsu/web| src/components/Sidebar.test.ts > Sidebar — サブエージェントの件数のボタン > 1 件以上のときだけ出る（分からない・0 件では出さない）
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/components/Sidebar.test.ts:624:3
    622|   const btn = (w: ReturnType<typeof mountSidebar>) => w.find(".sidebar…
    623|
    624|   it("1 件以上のときだけ出る（分からない・0 件では出さない）", () => {
       |   ^
    625|     setup(makeAgent());
    626|     expect(btn(mountSidebar(makeConnection())).exists()).toBe(false);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯

 FAIL  |@sodashitsu/web| src/components/Sidebar.test.ts > Sidebar — サブエージェントの件数のボタン > 古いサーバ（subagents の項目が無い）のエージェントの行は、ボタンが無いだけで、ほかは変わらない
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/components/Sidebar.test.ts:678:3
    676|   });
    677|
    678|   it("古いサーバ（subagents の項目が無い）のエージェントの行は、ボタンが無いだけで、ほかは変わらない", () => {
       |   ^
    679|     setup(makeAgent());
    680|     const w = mountSidebar(makeConnection());

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯

 FAIL  |@sodashitsu/web| src/components/graph/GraphView.test.ts > GraphView（Esc の段階・割り当て・履歴の戻り先。g03 点検） > パネルから開いた履歴を Esc で閉じると、フォーカスはパネルの「履歴」へ戻る（ツールバーへ行かない）
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/components/graph/GraphView.test.ts:1485:3
    1483|     new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: …
    1484|
    1485|   it("パネルから開いた履歴を Esc で閉じると、フォーカスはパネルの「履歴」へ戻る（ツールバーへ行かない）", async () =…
       |   ^
    1486|     const { wrapper } = await openWithGraph();
    1487|     await wrapper.find('[data-link-chip="l1"]').trigger("click");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/5]⎯

 FAIL  |@sodashitsu/web| src/components/graph/GraphView.test.ts > GraphView（Esc の段階・割り当て・履歴の戻り先。g03 点検） > open_graph の割り当てを変えれば新しいキーで閉じ（古いキーでは閉じない）、直接のキーの割り当てでも閉じる
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/components/graph/GraphView.test.ts:1525:3
    1523|   });
    1524|
    1525|   it("open_graph の割り当てを変えれば新しいキーで閉じ（古いキーでは閉じない）、直接のキーの割り当てでも閉じる", asyn…
       |   ^
    1526|     const settings = useSettingsStore(pinia);
    1527|     settings.setKeyBindings("open_graph", ["prefix+g"]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/5]⎯


```

### 対象ファイルの再実行

```text
Test Files  3 passed (3)
      Tests  419 passed (419)
   Start at  19:57:02
   Duration  52.49s (tests 81%, transform 14%, import 4%, environment 2%)
```
