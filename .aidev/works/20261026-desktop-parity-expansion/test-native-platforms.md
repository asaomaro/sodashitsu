# Task9A generated checks

実Portal・実画面・実入力は試験しない。Linux静止producer互換性とmacOSは未完了、明示opt-inの部分実装。

Python18件、real-WS native proof/input/旧peer gate、16秒OS選択待ち、agent input ACK後の旧画像拒否、browser描画/raw Ctrl+Space/未対応キー拒否を検証。

修正部分を一つずつ外し、実行時の失敗を確認して正確なbyte列へ復元した負例の生出力:

## wheel

```text
F
======================================================================
FAIL: test_wheel_wire_positive_up_is_portal_negative_dy (__main__.Guards.test_wheel_wire_positive_up_is_portal_negative_dy)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-desktop-native-platforms/scripts/remote-desktop/test-linux-portal-helper.py", line 35, in test_wheel_wire_positive_up_is_portal_negative_dy
    self.assertTrue(g.input(self.command(1,{"kind":"wheel","delta":120})));self.assertEqual(c[-1],("NotifyPointerAxis",(0.0,-15.0)))
                                                                           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: Tuples differ: ('NotifyPointerAxis', (0.0, 15.0)) != ('NotifyPointerAxis', (0.0, -15.0))

First differing element 1:
(0.0, 15.0)
(0.0, -15.0)

- ('NotifyPointerAxis', (0.0, 15.0))
+ ('NotifyPointerAxis', (0.0, -15.0))
?                             +


----------------------------------------------------------------------
Ran 1 test in 0.001s

FAILED (failures=1)
```

## release

```text
F
======================================================================
FAIL: test_release_invalidates_queued_frame_and_records_post_release_time (__main__.Guards.test_release_invalidates_queued_frame_and_records_post_release_time)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-desktop-native-platforms/scripts/remote-desktop/test-linux-portal-helper.py", line 39, in test_release_invalidates_queued_frame_and_records_post_release_time
    self.assertIsNone(helper.mutate_input(guard.release));self.assertGreater(guard.revision,old);self.assertIsNone(helper.queued);self.assertFalse(helper.commit(old,lambda:self.fail("Old release frame was published")))
                                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: 0 not greater than 0

----------------------------------------------------------------------
Ran 1 test in 0.000s

FAILED (failures=1)
```

## record-gate

```text
F
======================================================================
FAIL: test_chunked_record_keeps_ordinary_input_outside_the_complete_json (__main__.Guards.test_chunked_record_keeps_ordinary_input_outside_the_complete_json)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-desktop-native-platforms/scripts/remote-desktop/test-linux-portal-helper.py", line 64, in test_chunked_record_keeps_ordinary_input_outside_the_complete_json
    with patch.object(module,"os",fakeos),patch.object(module.select,"select",lambda *args:([],[1],[])),patch.object(module.sys,"stdout",SimpleNamespace(fileno=lambda:1)):helper.writer()
                                                                                                                                                                           ^^^^^^^^^^^^^^^
  File "/workspaces/sodashitsu-desktop-native-platforms/scripts/remote-desktop/linux-portal-helper.py", line 169, in writer
    if not record() and seq:self.GLib.idle_add(self.discard_pending,seq)
           ^^^^^^^^
  File "/workspaces/sodashitsu-desktop-native-platforms/scripts/remote-desktop/linux-portal-helper.py", line 166, in record
    offset+=os.write(fd,line[offset:offset+16384])
            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/workspaces/sodashitsu-desktop-native-platforms/scripts/remote-desktop/test-linux-portal-helper.py", line 60, in write
    self.assertFalse(input_done.wait(0.02))
AssertionError: True is not false

----------------------------------------------------------------------
Ran 1 test in 0.018s

FAILED (failures=1)
```

## scope-filter

```text
F
======================================================================
FAIL: test_pins_logind_owner_user_and_graphical_session_and_never_resumes (__main__.LoginScopeTests.test_pins_logind_owner_user_and_graphical_session_and_never_resumes)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-desktop-native-platforms/scripts/remote-desktop/test-linux-portal-helper.py", line 166, in test_pins_logind_owner_user_and_graphical_session_and_never_resumes
    self.assertIs(filters[0](scope.connection,message,True,None),message);self.assertFalse(scope.alive());self.assertFalse(state["locked"]);scope.close();self.assertFalse(filters)
                                                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: True is not false

----------------------------------------------------------------------
Ran 1 test in 0.012s

FAILED (failures=1)
```

## serial

```text
F
======================================================================
FAIL: test_stream_serial_is_required_before_opening_a_remote_or_pipeline (__main__.PortalProtocol.test_stream_serial_is_required_before_opening_a_remote_or_pipeline)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-desktop-native-platforms/scripts/remote-desktop/test-linux-portal-helper.py", line 134, in test_stream_serial_is_required_before_opening_a_remote_or_pipeline
    with self.assertRaises(module.NativeFailure) as error:self.helper.started({"streams":[(55,{"size":(1000,600),"source_type":1})]})
AssertionError: NativeFailure not raised

----------------------------------------------------------------------
Ran 1 test in 0.013s

FAILED (failures=1)
```

## pts

```text
F
======================================================================
FAIL: test_pts_barrier_drops_pre_input_buffers (__main__.Guards.test_pts_barrier_drops_pre_input_buffers)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-desktop-native-platforms/scripts/remote-desktop/test-linux-portal-helper.py", line 78, in test_pts_barrier_drops_pre_input_buffers
    self.assertTrue(helper.pump());self.assertTrue(helper.output_queue.empty());self.assertTrue(helper.pump());line=helper.output_queue.get_nowait()[0];self.assertEqual(module.json.loads(line)["info"]["sourceInputSeq"],0);self.assertEqual(helper.seq,1)
                                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: False is not true

----------------------------------------------------------------------
Ran 1 test in 0.000s

FAILED (failures=1)
```

## stalled

```text
F
======================================================================
FAIL: test_damage_only_producer_stops_explicitly_without_refreshing_old_pixels (__main__.Guards.test_damage_only_producer_stops_explicitly_without_refreshing_old_pixels)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-desktop-native-platforms/scripts/remote-desktop/test-linux-portal-helper.py", line 69, in test_damage_only_producer_stops_explicitly_without_refreshing_old_pixels
    self.assertFalse(helper.pump());self.assertEqual(errors,["source_stalled"]);self.assertEqual(helper.seq,0);self.assertTrue(helper.output_queue.empty())
                                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: Lists differ: ['backend_failure'] != ['source_stalled']

First differing element 0:
'backend_failure'
'source_stalled'

- ['backend_failure']
+ ['source_stalled']

----------------------------------------------------------------------
Ran 1 test in 0.000s

FAILED (failures=1)
```

## protocol

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-native-platforms

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (133 tests | 1 failed | 132 skipped) 1029ms
   × refuses an old viewer before opening a native OS request or exposing an unknown backend 1027ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > refuses an old viewer before opening a native OS request or exposing an unknown backend
AssertionError: expected 1 to be 3 // Object.is equality

- Expected
+ Received

- 3
+ 1

 ❯ src/desktop/DesktopRelay.test.ts:1134:276


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.ts:1134:232

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 132 skipped (133)
   Start at  11:54:43
   Duration  2.04s (tests 53%, transform 38%, import 9%)

```

## floor

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-native-platforms

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (133 tests | 1 failed | 132 skipped) 202ms
   × does not reuse a native pre-input image as an agent observation after the input ACK 200ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > does not reuse a native pre-input image as an agent observation after the input ACK
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/DesktopRelay.test.ts:1149:298


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 132 skipped (133)
   Start at  11:56:29
   Duration  1.23s (transform 67%, tests 18%, import 15%)

```

## deadline

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-native-platforms

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (133 tests | 1 failed | 132 skipped) 22042ms
   × keeps a generated native OS permission wait alive past the Windows startup deadline 22041ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > keeps a generated native OS permission wait alive past the Windows startup deadline
AssertionError: expected undefined to be 'linux-portal' // Object.is equality

- Expected:
"linux-portal"

+ Received:
undefined

 ❯ src/desktop/DesktopRelay.test.ts:1142:161


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.ts:1142:71

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 132 skipped (133)
   Start at  11:54:48
   Duration  23.03s (tests 96%, transform 3%, import 1%)

```

## 最終結果（source9d65412b）

build/typecheck成功。全体780 suites / 11641 tests成功（369.88s）。native/既存入力browser3件成功（20.8s）。独立worktreeでbuild・smoke PASS。Python生成18件成功。Windows boundaries CI23s、Linux generated CI3m34s通過。実Portal/実入力/OSロック操作は行っていない。
