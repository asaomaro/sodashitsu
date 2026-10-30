# Linux system audio 検証

Linux側の設定・helper・共有・ブラウザへの配線を実装。macOS sourceは次段階に分離し、実Pulse録音/端末間再生は未実施。

- 関連6ファイル345件成功（初期配線時）。生成Linux Opus/private path＋image/audio viewer両加入順4件成功。
- Node受信/共有/PCM path/video初期88件とserver build成功。
- /usr/bin/python3の生成PCM/private peer/GStreamer audiotestsrc/停止22件成功（skipなし）。Portalの新規routing3件成功。
- 最終build/typecheck成功。c96f639dの製品ソースで全体904ファイル13,125件成功、358.00秒（/tmp/soda-native-audio-all-final.log）。
- Hosted generated-sharing: 関連349件・ブラウザ6件成功。Linux2ケースで実AudioDecoderの出力energyと初期mute/明示再生を確認し、音声graphは仮想MediaStream出力へ接続。
- Hosted Linux: Portal56件、H264 21件、audio22件が全成功（skipなし）。
- CIは9項目中8項目成功、Mac既存SDK/負例ジョブを含む最終結果はPR #338のchecks/merge記録を参照。
- ローカルDOM待ち/GstVideo不足は既存mainでも同じのため再調査しない。
- 独立最終レビューはPythonとNode/Vue/TUI/E2Eに分けて全製品差分を点検し、mustを修正後のdeltaも確認。負例証拠更新のshouldも修正・再レビュー完了、追加must/shouldなし。

## 負例（生の出力）

初回のpost-wait/callback-parent/共有owner負例はmockや未検査参照のTypeErrorを含んだため、意図した負例として**不採用**とした。fixtureのsend/selectと先行assertionを修正し、以下を再実行した。以下の採用ログはAssertionErrorを検査し、TypeErrorを含まないことを確認。

### startup

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-native-audio

 ❯ |@sodashitsu/server| src/desktop/DesktopNativeAudio.test.ts (7 tests | 2 failed | 5 skipped) 1218ms
   × enforces the original startup deadline after delayed private path creation without a timer tick 109ms
   × rejects a verified hello that arrives beyond the startup deadline without waiting for the timer 1108ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeAudio.test.ts > enforces the original startup deadline after delayed private path creation without a timer tick
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 2 times

Received:

  1st vi.fn() call:

    Array [
      Object {
        "clientPid": 776431,
        "enabled": true,
        "id": "22222222-2222-4222-8222-222222222222",
        "pipeName": "SodaDesktopAudio-6f32df28151047a4b351297a68e9ae46",
        "pipePath": "/tmp/soda-native-pcm-97vofQ/pcm.sock",
        "type": "native_audio",
      },
    ]

  2nd vi.fn() call:

    Array [
      Object {
        "enabled": false,
        "id": "22222222-2222-4222-8222-222222222222",
        "type": "native_audio",
      },
    ]


Number of calls: 2

 ❯ src/desktop/DesktopNativeAudio.test.ts:58:131


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeAudio.test.ts > rejects a verified hello that arrives beyond the startup deadline without waiting for the timer
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/DesktopNativeAudio.test.ts:67:139


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopNativeAudio.test.ts:67:68

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 5 skipped (7)
   Start at  04:44:16
   Duration  1.89s (tests 68%, transform 25%, import 7%)


```

### shared-owner

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-native-audio

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts (57 tests | 1 failed | 56 skipped) 9ms
   × keeps the physical PCM owner and nonempty quota across shared subscriber closes 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > keeps the physical PCM owner and nonempty quota across shared subscriber closes
AssertionError: expected undefined to be { …(2) } // Object.is equality

- Expected:
{
  "owner": {
    "closed": Promise {},
    "exited": [Function exited],
  },
  "paths": DesktopNativePcmPaths {
    "leases": Set {},
    "options": {
      "retryMs": 5,
    },
  },
}

+ Received:
undefined

 ❯ src/desktop/DesktopSharedCapture.test.ts:410:30
    408|  const closed=new Promise<void>(resolve=>f.child.once("close",()=>{exi…
    409|  const physicalClose=f.child.close.bind(f.child),hold=vi.spyOn(f.child…
    410|  expect(a.session.nativePcm).toBe(f.child.nativePcm);
       |                              ^
    411|  const lease=await a.session.nativePcm!.paths.create(a.session.nativeP…
    412|  try{

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 56 skipped (57)
   Start at  08:14:52
   Duration  1.10s (transform 79%, import 19%, tests 1%)


```

### cohort

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-native-audio

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (252 tests | 2 failed | 250 skipped) 2200ms
   × shares one Linux physical capture across image-only and audio viewers in either join order (audioFirst=false) 1133ms
   × shares one Linux physical capture across image-only and audio viewers in either join order (audioFirst=true) 1066ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > shares one Linux physical capture across image-only and audio viewers in either join order (audioFirst=false)
 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > shares one Linux physical capture across image-only and audio viewers in either join order (audioFirst=true)
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/DesktopRelay.test.ts:1760:248


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.ts:1760:183

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 250 skipped (252)
   Start at  08:13:07
   Duration  3.41s (tests 66%, transform 27%, import 6%)


```

### post-wait

```text
.....F.......FFF........
======================================================================
FAIL: test_active_query_cannot_authorize_a_replaced_parent (__main__.GeneratedPeers.test_active_query_cannot_authorize_a_replaced_parent)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/tmp/soda-audio-negative-rkb1xy1b/test-linux-native-audio.py", line 186, in test_active_query_cannot_authorize_a_replaced_parent
    with self.assertRaises(audio.AudioFailure):
AssertionError: AudioFailure not raised

======================================================================
FAIL: test_wait_cannot_outlive_source_deadline_or_parent (__main__.GeneratedPeers.test_wait_cannot_outlive_source_deadline_or_parent) (cause='active')
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/tmp/soda-audio-negative-rkb1xy1b/test-linux-native-audio.py", line 213, in test_wait_cannot_outlive_source_deadline_or_parent
    with self.assertRaises(audio.AudioFailure):
AssertionError: AudioFailure not raised

======================================================================
FAIL: test_wait_cannot_outlive_source_deadline_or_parent (__main__.GeneratedPeers.test_wait_cannot_outlive_source_deadline_or_parent) (cause='deadline')
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/tmp/soda-audio-negative-rkb1xy1b/test-linux-native-audio.py", line 213, in test_wait_cannot_outlive_source_deadline_or_parent
    with self.assertRaises(audio.AudioFailure):
AssertionError: AudioFailure not raised

======================================================================
FAIL: test_wait_cannot_outlive_source_deadline_or_parent (__main__.GeneratedPeers.test_wait_cannot_outlive_source_deadline_or_parent) (cause='parent')
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/tmp/soda-audio-negative-rkb1xy1b/test-linux-native-audio.py", line 213, in test_wait_cannot_outlive_source_deadline_or_parent
    with self.assertRaises(audio.AudioFailure):
AssertionError: AudioFailure not raised

----------------------------------------------------------------------
Ran 22 tests in 0.090s

FAILED (failures=4)

```

### buffer-time

```text
.FF....................
======================================================================
FAIL: test_buffer_end_and_every_frame_timestamp_are_observed_not_future (__main__.GeneratedPcm.test_buffer_end_and_every_frame_timestamp_are_observed_not_future) (count=1)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/tmp/soda-audio-negative-wp2953y1/test-linux-native-audio.py", line 44, in test_buffer_end_and_every_frame_timestamp_are_observed_not_future
    with self.assertRaises(audio.AudioFailure):
AssertionError: AudioFailure not raised

======================================================================
FAIL: test_buffer_end_and_every_frame_timestamp_are_observed_not_future (__main__.GeneratedPcm.test_buffer_end_and_every_frame_timestamp_are_observed_not_future) (count=5)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/tmp/soda-audio-negative-wp2953y1/test-linux-native-audio.py", line 44, in test_buffer_end_and_every_frame_timestamp_are_observed_not_future
    with self.assertRaises(audio.AudioFailure):
AssertionError: AudioFailure not raised

----------------------------------------------------------------------
Ran 22 tests in 0.084s

FAILED (failures=2)

```

### terminal

```text
.........F............
======================================================================
FAIL: test_partial_io_error_is_terminal_and_cannot_splice_another_record (__main__.GeneratedPeers.test_partial_io_error_is_terminal_and_cannot_splice_another_record)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/tmp/soda-audio-negative-ortx63me/test-linux-native-audio.py", line 165, in test_partial_io_error_is_terminal_and_cannot_splice_another_record
    self.assertIsNone(self.pipe.peer)
AssertionError: <Mock id='133607697434864'> is not None

----------------------------------------------------------------------
Ran 22 tests in 0.088s

FAILED (failures=1)

```

### capture-admission

```text
...............FF......
======================================================================
FAIL: test_configuration_cannot_outlive_capture_admission_or_startup_deadline (__main__.GeneratedSourceLifetime.test_configuration_cannot_outlive_capture_admission_or_startup_deadline) (cause='cancel')
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/tmp/soda-audio-negative-cung5d59/test-linux-native-audio.py", line 339, in test_configuration_cannot_outlive_capture_admission_or_startup_deadline
    with self.assertRaises(audio.AudioFailure):
AssertionError: AudioFailure not raised

======================================================================
FAIL: test_configuration_cannot_outlive_capture_admission_or_startup_deadline (__main__.GeneratedSourceLifetime.test_configuration_cannot_outlive_capture_admission_or_startup_deadline) (cause='deadline')
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/tmp/soda-audio-negative-cung5d59/test-linux-native-audio.py", line 339, in test_configuration_cannot_outlive_capture_admission_or_startup_deadline
    with self.assertRaises(audio.AudioFailure):
AssertionError: AudioFailure not raised

----------------------------------------------------------------------
Ran 22 tests in 0.082s

FAILED (failures=2)

```

### callback-parent

```text
.....F................
======================================================================
FAIL: test_active_query_cannot_authorize_a_replaced_parent (__main__.GeneratedPeers.test_active_query_cannot_authorize_a_replaced_parent)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/tmp/soda-audio-negative-qemncml9/test-linux-native-audio.py", line 186, in test_active_query_cannot_authorize_a_replaced_parent
    with self.assertRaises(audio.AudioFailure):
AssertionError: AudioFailure not raised

----------------------------------------------------------------------
Ran 22 tests in 0.085s

FAILED (failures=1)

```

### silent-eof

```text
....................F.
======================================================================
FAIL: test_silent_source_retires_when_receiver_disconnects_without_an_audio_frame (__main__.GeneratedSourceLifetime.test_silent_source_retires_when_receiver_disconnects_without_an_audio_frame)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/tmp/soda-audio-negative-ery9ap16/test-linux-native-audio.py", line 298, in test_silent_source_retires_when_receiver_disconnects_without_an_audio_frame
    self.assertFalse(actor.thread.is_alive())
AssertionError: True is not false

----------------------------------------------------------------------
Ran 22 tests in 1.105s

FAILED (failures=1)

```

Node負例は実行終了後に元のファイルとbyte一致で復元確認。Python負例は一時copyのみ変更し、元ファイルのbyte一致を確認。

## 全体試験の初回と再実行

初回はbuild/typecheck/testを同時に開始したため、CLI build完了前の4試験が未生成のdist/main.jsに当たり失敗した（13,121成功/4失敗、362.56秒）。この結果を全成功と扱わない。型検査もテスト用Helperのoptional indexed typeにundefinedが含まれる1宣言で失敗し、NonNullableへ修正した。build完了後、凍結したソースでtypecheckと全体試験を再実行し、13,125件すべて成功した。実行順序の問題として記録し、製品変更や失敗の抑制で回避しない。
