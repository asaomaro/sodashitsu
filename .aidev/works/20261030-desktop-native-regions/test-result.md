# Native regional verification

## Regression negative: native input floor

Before the regional frame adapter checked nativeInputFloor, an acknowledged generated input left the old source proof actionable. Real loopback helper/input ACK test failed at the intended undefined-frame assertion:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-native-regions

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (233 tests | 1 failed | 232 skipped) 149ms
   × rejects native regional actions against an image from before an acknowledged input 147ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > rejects native regional actions against an image from before an acknowledged input
AssertionError: expected { info: { seq: 2, …(10) }, …(1) } to be undefined

- Expected:
undefined

+ Received:
{
  "at": 1370.91136,
  "info": {
    "captureMs": 0.5677280000000025,
    "encodeMs": 0.8362330000000071,
    "format": "image/png",
    "height": 180,
    "regions": [
      {
        "digest": "957a8d28a9f6286cf79a5b1287409e3e45b3ab1c375a296d9e24bb71cc5187fb",
        "height": 32,
        "id": "856f6890-99dc-49b2-880c-6ffd786e6411",
        "width": 32,
        "x": 0,
        "y": 0,
      },
    ],
    "seq": 2,
    "sourceCpuMs": 51.971,
    "sourceInputSeq": 0,
    "sourceMemoryBytes": 61124608,
    "timing": "unavailable",
    "width": 320,
  },
}

 ❯ src/desktop/DesktopRelay.test.ts:1613:71
    1611|  // Keep the current source image pending. Only generated input/ACK ma…
    1612|  await target.input({kind:"key",code:"ControlLeft",down:true});
    1613|  expect(target.frame()).toBeUndefined();expect(target.region.frame()).…
       |                                                                       ^
    1614|  await expect(f.relay.agents.act("native-floor",lease,observed.observa…
    1615|  f.relay.agents.release("native-floor",lease);viewer.send({type:"stop"…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 232 skipped (233)
   Start at  20:30:37
   Duration  1.41s (transform 72%, import 17%, tests 11%)


```

## Source negative region-pixels

```text
F
======================================================================
FAIL: test_raw_stride_and_offset_bind_only_requested_pixels (__main__.Regions.test_raw_stride_and_offset_bind_only_requested_pixels)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-desktop-native-regions/scripts/remote-desktop/test-linux-portal-helper.py", line 215, in test_raw_stride_and_offset_bind_only_requested_pixels
    pixels[4+16]=99;r.capture(2,pixels,4,3,16,4);self.assertEqual(a,r.take(2,4,3)[0]["digest"])
                                                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: 'd993473d256559169d19b4b317bd8072015a85001a5086e1250cc9776636a4a4' != '15532504f28be7320af0b84c34a3ac4786f3b55b21c63d502c9a1ef44b07c75e'
- d993473d256559169d19b4b317bd8072015a85001a5086e1250cc9776636a4a4
+ 15532504f28be7320af0b84c34a3ac4786f3b55b21c63d502c9a1ef44b07c75e


----------------------------------------------------------------------
Ran 1 test in 0.000s

FAILED (failures=1)

```

## Source negative region-nonce

```text
F
======================================================================
FAIL: test_source_pts_size_nonce_clear_and_bounded_cache (__main__.Regions.test_source_pts_size_nonce_clear_and_bounded_cache)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-desktop-native-regions/scripts/remote-desktop/test-linux-portal-helper.py", line 220, in test_source_pts_size_nonce_clear_and_bounded_cache
    r.configure([self.spec(id="22345678-1234-4234-8234-123456789012")],4,3);r.capture(3,p,4,3,16);self.assertNotEqual(first,r.take(3,4,3)[0]["digest"])
                                                                                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: '8246fcd837c3603567c0807375733bd1776feb696965162353dffb0ff5f0edb6' == '8246fcd837c3603567c0807375733bd1776feb696965162353dffb0ff5f0edb6'

----------------------------------------------------------------------
Ran 1 test in 0.000s

FAILED (failures=1)

```

## Source negative region-pts

```text
F
======================================================================
FAIL: test_source_pts_size_nonce_clear_and_bounded_cache (__main__.Regions.test_source_pts_size_nonce_clear_and_bounded_cache)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-desktop-native-regions/scripts/remote-desktop/test-linux-portal-helper.py", line 222, in test_source_pts_size_nonce_clear_and_bounded_cache
    self.assertEqual(len(r.frames),8);self.assertIsNone(r.take(11,4,3));self.assertIsNotNone(r.take(19,4,3));r.clear();self.assertEqual(r.frames,{});self.assertEqual(r.specs,[])
                                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: [{'id': '22345678-1234-4234-8234-123456789012', 'x': 1, 'y': 0, 'width': 2, 'height': 1, 'digest': '6f2f00bd4d276ad2974aadfeaaacb32ea9515fe16c1f944968638bd0b1dcb6da'}] is not None

----------------------------------------------------------------------
Ran 1 test in 0.001s

FAILED (failures=1)

```

## Source negative region-meta

```text
F
======================================================================
FAIL: test_real_video_meta_stride_offset_and_mismatch_through_probe (__main__.Regions.test_real_video_meta_stride_offset_and_mismatch_through_probe)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-desktop-native-regions/scripts/remote-desktop/test-linux-portal-helper.py", line 252, in test_real_video_meta_stride_offset_and_mismatch_through_probe
    wrong=buffer(5);self.assertEqual(helper.region_probe(pad,SimpleNamespace(get_buffer=lambda:wrong)),Gst.PadProbeReturn.DROP);self.assertEqual(len(failures),1)
                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: <enum GST_PAD_PROBE_OK of type Gst.PadProbeReturn> != <enum GST_PAD_PROBE_DROP of type Gst.PadProbeReturn>

----------------------------------------------------------------------
Ran 1 test in 0.015s

FAILED (failures=1)

```

## Final validation and delivery

- Linux28 generated tests PASS, including actual jpegenc-pad and VideoMeta offset/stride path.4source negatives above failed expected assertions, bytes restored. Dev GI package extracted only under /tmp; no system install.
- Full build/typecheck PASS.894 files/12,978 tests PASS,342.76s. Includes real loopback native post-input floor regression and prior Windows regional sources.
- Exact head754b72a435ba691f5aa1c337111d3b7bca58d8c4: all8 CI checks PASS. Native workflow41048993787 Linux job124040080301 and Mac job124040080015. Mac actual SDK compile, generated self-test and6compiled source negatives PASS (never enters capture/input mode).
- Independent reviews/delta completed; no remaining must/should. PR325 merged main f3ee8d9669abe1299f65d8876e5f45a2c23e7e4a; merged tree fbdf2132f21c2265ad3c104191e5ce98ce21e9f1 equals tested tree. PR body contains immutable head/CI/merge receipt.
- No real OS display/input/device/service/driver/model/agent/handoff validation claimed.
