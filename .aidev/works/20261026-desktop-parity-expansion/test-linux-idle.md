# Linux damage-only continuity — verification
## Scope

Generated source/input only. No Portal picker, actual desktop capture, OS input, clipboard, driver/service/ACL/trust changes or A/B handoff. User confirms WSL availability but no Linux/macOS desktop devices; these tests do not establish real platform behavior. Experimental local opt-in remains.
## Positive evidence

- Python22 generated tests passed0.188s, including quiet source without capture time/sequence/input-floor renewal, final ACK/frame/revision/scope/pipeline/owner fencing, query crossing8s, zero-byte queued-writer refusal and PAUSED source termination.
- SourceIdle4 +real relay/input3 +existing pre-input proof regression passed focused9 tests5.53s. Private human marker is required by B, marker forgery is rejected, expiry refuses input, agent input retains real-frame2s and human ACK advances its post-input floor.
- Real Relay uses distinct main/image WebSockets: hold idle1, deliver/ACK image2 first, then old idle/replay; connection remains open, image time unchanged, no stale proof.
- Chromium initial5 native cases passed38.8s: existing Linux/Mac, actual built Vue Linux plain and sealed quiet for at least14 source notices with unchanged image counter, then real keyboard input. Additional actual Vue plain case holds main idle1 while a different physical image socket delivers image2, releases old notices and stays connected (PASS11.9s).
- Final source/root build/forced server emit/typecheck passed. Broad Chromium15:14 PASS and1 failure in the existing plaintext agent human-takeover test (expected操作中, actual閲覧中). The source rerun reproduced the same failure, and clean fixed b93bb96a (same tree as main5047699f) also reproduced it. This is not attributed to Linux idle changes; no product regression is hidden by marking that case green. Next work will fix the existing takeover failure separately. Integrated-root verification excludes this one known failure explicitly and retains the other14 cases.
- Integrated-root related browser14/14 PASS1.8m, explicitly excluding the single baseline human-takeover failure. Source native5 and broad other14 cases passed; no existing E2E is disabled in code. Final whole/root/CI/clean receipts follow.
## Independent review

Pointer and transfer reviewers completed separate design/taskcheck/whole/delta checks. Fixed private human marker, final writer recheck after native query, stale notices overtaken across sockets, heartbeat expiry and clock recovery. Final correction review clear. No implementation code copied from other products; primary references are in design-linux-idle.md.
## Actual product-source negative controls

Twelve actual production mutations, intended runtime assertion failures, exact byte restoration, then positive reruns. No compile/import/blanket harness timeout failures counted. The first query-deadline negative unexpectedly passed because a second writer gate still rejected the old notice; the test was strengthened to assert the final predicate itself and actual writer0bytes. The repeated negative then failed at that predicate assertion. Local raw runner log: `/tmp/soda-linux-idle-negatives.log`; case logs below correspond to final strengthened tests.

### negative-agent-real-frame

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > keeps quiet Linux human input live without refreshing agent images or unmarked B input
AssertionError: expected [Function] to throw error including 'Desktop control unavailable' but got 'Input acknowledgement timed out; obse…'

Expected: "Desktop control unavailable"
Received: "Input acknowledgement timed out; observe before retrying"

 ❯ src/desktop/DesktopRelay.test.ts:1194:64


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 225 skipped (226)
   Start at  05:15:54
   Duration  3.20s (tests 58%, transform 34%, import 8%)

```

### negative-clock-recovery

```text
 FAIL  |@sodashitsu/client-core| src/desktop/DesktopSourceIdle.test.ts > does not revive proof after a clock exception recovers
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopSourceIdle.test.ts:8:305


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
```

### negative-cross-socket

```text
 FAIL  |@sodashitsu/client-core| src/desktop/DesktopSourceIdle.test.ts > rejects unknown fields/non-Linux mode, but discards notices overtaken by images or ACKs
AssertionError: expected [Function] to not throw an error but 'Error: stale notice' was thrown

- Expected:
undefined

+ Received:
"Error: stale notice"

 ❯ src/desktop/DesktopSourceIdle.test.ts:6:435


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
```

### negative-expiry

```text
 FAIL  |@sodashitsu/client-core| src/desktop/DesktopSourceIdle.test.ts > expires human liveness exactly1000ms after receipt without producing a new frame
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopSourceIdle.test.ts:5:300


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
```

### negative-human-input-floor

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > keeps quiet Linux human input live without refreshing agent images or unmarked B input
AssertionError: expected { …(3) } to be undefined

- Expected:
undefined

+ Received:
{
  "at": -5366.857104,
  "image": Uint8Array [
    137,
    80,
    78,
    71,
    13,
    10,
    26,
```

### negative-old-static-stop

```text
FAIL: test_damage_only_producer_preserves_image_time_sequence_and_input_floor (__main__.Guards.test_damage_only_producer_preserves_image_time_sequence_and_input_floor)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-desktop-linux-idle/scripts/remote-desktop/test-linux-portal-helper.py", line 73, in test_damage_only_producer_preserves_image_time_sequence_and_input_floor
    helper,a=self.idle_helper();sample=helper.last_sample;self.assertTrue(helper.pump());self.assertEqual(helper.failure_codes,[]);self.assertEqual(helper.seq,7);self.assertEqual(helper.last_sample,sample);self.assertEqual(helper.guard.seq,0)
                                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: False is not true

----------------------------------------------------------------------
Ran 21 tests in 0.200s

FAILED (failures=1)
```

### negative-paused-pipeline

```text
FAIL: test_quiet_but_paused_pipeline_ends_instead_of_holding_a_live_input_session (__main__.Guards.test_quiet_but_paused_pipeline_ends_instead_of_holding_a_live_input_session)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-desktop-linux-idle/scripts/remote-desktop/test-linux-portal-helper.py", line 76, in test_quiet_but_paused_pipeline_ends_instead_of_holding_a_live_input_session
    helper,a=self.idle_helper();helper.pipeline=SimpleNamespace(get_state=lambda timeout:(0,3,0));self.assertFalse(helper.pump());self.assertEqual(helper.failure_codes,["source_changed"]);self.assertTrue(helper.output_queue.empty())
                                                                                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: True is not false

----------------------------------------------------------------------
Ran 22 tests in 0.212s

FAILED (failures=1)
```

### negative-private-human-marker

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > keeps quiet Linux human input live without refreshing agent images or unmarked B input
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopRelay.test.ts:1195:304


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 225 skipped (226)
```

### negative-query-deadline

```text
FAIL: test_writer_refuses_owner_expiry_during_the_native_pipeline_query (__main__.Guards.test_writer_refuses_owner_expiry_during_the_native_pipeline_query)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-desktop-linux-idle/scripts/remote-desktop/test-linux-portal-helper.py", line 107, in test_writer_refuses_owner_expiry_during_the_native_pipeline_query
    start=clock[0];self.assertFalse(helper.idle_valid(helper.seq,helper.guard.revision));clock[0]=start
                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: True is not false

----------------------------------------------------------------------
Ran 21 tests in 0.180s

FAILED (failures=1)
```

### negative-relay-human-marker

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > keeps quiet Linux human input live without refreshing agent images or unmarked B input
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/DesktopRelay.test.ts:1193:168


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.ts:1193:88

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

```

### negative-replay

```text
 FAIL  |@sodashitsu/client-core| src/desktop/DesktopSourceIdle.test.ts > never renews from replay, a replacement frame, or a backwards clock
AssertionError: expected { type: 'platform_idle', …(3) } to be undefined

- Expected:
undefined

+ Received:
{
  "backend": "linux-portal",
  "counter": 1,
  "seq": 1,
  "type": "platform_idle",
}

 ❯ src/desktop/DesktopSourceIdle.test.ts:7:211


```

### negative-writer-gate

```text
FAIL: test_writer_drops_a_queued_idle_notice_invalidated_before_publication (__main__.Guards.test_writer_drops_a_queued_idle_notice_invalidated_before_publication)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-desktop-linux-idle/scripts/remote-desktop/test-linux-portal-helper.py", line 99, in test_writer_drops_a_queued_idle_notice_invalidated_before_publication
    self.assertEqual(chunks,[],mode)
AssertionError: Lists differ: [b'{"type":"platform_idle","backend":"linux-portal","seq":7,"counter":1}\n'] != []

First list contains 1 additional elements.
First extra element 0:
b'{"type":"platform_idle","backend":"linux-portal","seq":7,"counter":1}\n'

- [b'{"type":"platform_idle","backend":"linux-portal","seq":7,"counter":1}\n']
+ [] : ack

======================================================================
FAIL: test_writer_refuses_owner_expiry_during_the_native_pipeline_query (__main__.Guards.test_writer_refuses_owner_expiry_during_the_native_pipeline_query)
----------------------------------------------------------------------
```

## Existing baseline failure

The failing original E2E and one targeted rerun on the new source, then the first fixed-baseline run, all failed at remote-desktop-agent.spec.ts:112. No more baseline repetitions are needed.

```text
Expected: "操作中"
Received: "閲覧中"
Timeout: 5000ms
111 | await view.getByRole("button", { name: "操作を引き取る", exact: true }).click();
112 | await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");
```

Local logs: `/tmp/soda-linux-idle-final-browser.log`, `/tmp/soda-linux-idle-agent-rerun.log`, `/tmp/soda-linux-idle-agent-baseline.log`. Baseline source is b93bb96a, actual main merge5047699f has the same tree. The other agent encrypted/NDJSON/MCP cases passed. No existing E2E is disabled in the repository.
