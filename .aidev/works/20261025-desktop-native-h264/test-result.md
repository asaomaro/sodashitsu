# 検証結果

## 結果

- `pnpm build` / `pnpm typecheck` 通過。
- 全体unit: **739 files / 11308 tests passed**、394.67s。ハードウェア依存のC#修正は別途両実機で再コンパイルして検証した。
- `pnpm smoke`: PASS。
- 関係E2E: native video・既存RTC/relay・入力・unlock・cover・差分の **12 passed / 1 skipped**。nativeに2機種目のfixtureを加えた後、そのspecを再実行し **3 passed / 1 skipped**。異なるケースは合計13件。skipは明示起動専用の実画面性能測定。E2Eの追加後のtypecheckも通過。
- native E2Eでは製品canvasの4色と中央グレー、描画ACK、動画中のCtrl+Space/Esc、停止後の画像復帰、decoder非対応時の画像継続をブラウザDOM/画素/送信frameから確認。画像は生成fixtureのみ。
- ローカルWindowsとsr-pcのhardware-only Media Foundationで、生成NV12/Bitmapから640×360と1280×800の出力を確認。sr-pcは稼働中のmainを変えず、branchのC#/validatorを一時フォルダへ取り出して実行した。
- 追加SDK/FFmpeg/DLL、管理者操作、実OS入力、画面mode変更、unlock serviceの再導入なし。

## 実画面性能の未検証範囲

実画面JPEG対H.264の比較は実施できていない。ローカルWindowsではWTS source選択はnormalだったが、既存DefaultDesktop guardがfalseで取得を拒否した（物理解像度3200×2000）。ガードは変更・迂回せず、ユーザーに画面状態の確認を依頼した。guard拒否後のbenchmark失敗からfps/CPU/帯域の数値を採用しない。sr-pcも通常画面のcapture/実入力/長時間/実WANは未測定。GPU利用率やCPU削減、zero-copyの達成を主張しない。nativeはCPU NV12変換と、別途画像1fpsを含む。

## 発見した不具合とnegative control

1. 色設定を省くと、生成H.264を実Chromiumで描いた値が期待から26ずれた。NV12変換をBT.709 limited rangeへ揃え、MFT media typeとWebCodecsのcolor spaceを明示。送信側・受信側・旧生成fixtureだけ元へ戻し、再buildして同E2Eが色で落ちることを確認。byte-exact復元し再build後、色とグレーが通過。fixtureはdesktop録画を含まない。
2. 実helper entrypointはC# usingを結合するため、`TimeoutException`がServiceProcess側と衝突した。`System.TimeoutException`へ修正し、既存native validatorで本物の`windows-helper.ps1 -ValidateOnly`を別processでコンパイルする検証を追加。修正だけ外すと実entrypoint compileが落ち、byte-exact復元後に通過。
3. sr-pcのencoderは初回に`MF_E_TRANSFORM_STREAM_CHANGE`を返した。output sample/event/buffer解放後のtype再交渉を追加したが、新しいHaveOutputを待たない版は`E_UNEXPECTED`となった。**最終のWait追加だけを外したa153503dのHost.cs**をsr-pcの一時フォルダで再実行し、そのruntime失敗を再現した。`Wait(true)`とcredit消費を戻すと640×360/1280×800の生成frameが通過。a153503dのHost.csにその1行を適用したバイト列が最終Host.csと一致することを確認。再交渉後のtype/SPSから得たsr-pcのfixtureもChromiumで4色/グレーを確認。

以下はnegativeの生出力。Windowsの個人名を含む一時フォルダのprefixだけ`<TEMP>`へ置換し、エラー文・値・stackと行は保持する（改行はLF、行末空白は除去）。


### 色設定を戻したE2E

```text

Running 1 test using 1 worker

(node:2574052) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-25T07:18:30.877Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-25T07:18:30.878Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-25T07:18:30.878Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-25T07:18:30.882Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-9H3zFZ/commands.json","count":0}
{"ts":"2026-10-25T07:18:31.307Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-25T07:18:31.308Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-25T07:18:31.308Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-25T07:18:31.309Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-a6nwVo/commands.json","count":0}
{"ts":"2026-10-25T07:18:34.195Z","level":"info","msg":"machine link closed","machine":"2e3a52c62004f69e607039a0d8e16111","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-native-video.spec.ts:16:3 › hardware-produced H264 pixels reach the canvas with draw ACK and stop (3.7s)


  1) src/specs/remote-desktop-native-video.spec.ts:16:3 › hardware-produced H264 pixels reach the canvas with draw ACK and stop

    Error: expect(received).toBeLessThan(expected)

    Expected: < 20
    Received:   26

      103 |         for (let i = 0; i < 4; i++)
      104 |           for (let channel = 0; channel < 3; channel++)
    > 105 |             expect(Math.abs(samples[i]![channel]! - expected[i]![channel]!)).toBeLessThan(20);
          |                                                                              ^
      106 |         expect(sent.filter((m) => m.type === "native_video_ack").length).toBeGreaterThanOrEqual(8);
      107 |         expect(sent.filter((m) => m.type === "control" && m.enabled)).toHaveLength(0);
      108 |         await view.getByRole("button", { name: "動画・音声を停止", exact: true }).click();
        at /workspaces/sodashitsu-desktop-input/packages/e2e/src/specs/remote-desktop-native-video.spec.ts:105:78

    Error Context: test-results/remote-desktop-native-vide-9eddd-nvas-with-draw-ACK-and-stop/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-native-vide-9eddd-nvas-with-draw-ACK-and-stop/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-native-vide-9eddd-nvas-with-draw-ACK-and-stop/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-native-video.spec.ts:16:3 › hardware-produced H264 pixels reach the canvas with draw ACK and stop
undefined
/workspaces/sodashitsu-desktop-input/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-native-video.spec.ts -g pixels reach
```

### entrypointの名前衝突

```text
Add-Type : <TEMP>
System.ServiceProcess.TimeoutException'' 間のあいまいな参照です。
<TEMP>
<TEMP>
eoutException("Hardware encoder stalled");
<TEMP>
Generator,3)(eventGenerator,1,out ev);
発生場所 <TEMP>\windows-helper.ps1:11 文字:1
+ Add-Type -TypeDefinition $combined -ReferencedAssemblies System.dll,S ...
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : InvalidData: (Microsoft.Power...peCompilerError:AddTypeCompilerError) [Add-Type]、Excepti
   on
    + FullyQualifiedErrorId : SOURCE_CODE_ERROR,Microsoft.PowerShell.Commands.AddTypeCommand

Desktop helper entry-point compilation failed
発生場所 <TEMP>\validate-unlock-helper.ps1:4 文字:28
+ ... CODE -ne 0) { throw 'Desktop helper entry-point compilation failed' }
+                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : OperationStopped: (Desktop helper ...pilation failed:String) [], RuntimeException
    + FullyQualifiedErrorId : Desktop helper entry-point compilation failed
```

### 出力再交渉後のイベント待機を戻したsr-pc検証

```text
{"sourceRef":"a153503d1736a84bd6d7b2c7c0599715172df91b","trackedStatus":[],"gpuChecksExit":1,"repoHead":"18bda032bf73c250532f511ff5816c3dd78107b6"}
From https://github.com/asaomaro/sodashitsu
 * branch              feat/desktop-native-h264 -> FETCH_HEAD
Exception calling "Run" with "1" argument(s): "Catastrophic failure (Exception from HRESULT: 0x8000FFFF (E_UNEXPECTED))
"
At <TEMP>\validate-h264.ps1:5 char:73
+ ... pTests.H264Checks]::Run($(if($FixtureFile){$FixtureFile}else{$null}))
+                                                                  ~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : COMException
```

### ローカル既存native＋実entrypoint

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
desktop_unlock_checks_passed
desktop_unlock_no_console_utf8_passed
```

### ローカルhardware encoder

```text
desktop_h264_checks_passed: hardware-only MFT, NV12 conversion, four generated frames, initial SPS/IDR, timestamps, packet limits
```

### 1280×800生成frame

```text
desktop_helper_compiled
hardware_h264_1280x800_passed
```

## 再現

`validate-h264.ps1`は生成画像だけをhardware-only MFTへ渡す。`-FixtureFile <path>`を明示すると生成データの小さなfixtureを保存する（CBR filler NALだけ除去）。出力を実画像で置き換えないこと。

2機種のfixtureは `h264-generated.json`（avc1.42041e）と `h264-sr-pc-generated.json`（avc1.42401e）。sr-pcの再交渉＋新HaveOutput待ち追加後も初回SPS/IDR、timestamp、packet limitが通過した。通常のE2EではWindows/GPUを必要とせず、このhardware生成fixtureを製品経路で再生する。

実画面のbenchmarkは `SODA_DESKTOP_BENCH_COMMAND`に信頼するWindows helperコマンド配列を指定し `node scripts/remote-desktop/benchmark-native-video.mjs --width 1280 --fps 30 --frames 180 --bitrate 2500`。実行は明示指定だけ。入力要求、画像保存、trace保存なし。出力videoMbpsはJPEG画像を含まず、CPU/RSSは画像側から1fpsで採る広い区間でstartupを含む。guard拒否時は数値を出さない。
