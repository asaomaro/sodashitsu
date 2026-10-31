# 検証

PR353 head a9d2086d6ec8e2fc27f1e966d581b05c882d3e94 → main 3e15586b0f0cebcc1d38b67c159837febbcffcb1。build/typecheck成功、926 files +1 skipped / 13289 tests +1 skipped。全20 CI成功。SDK資源108点/207参照/同梱bytes一致。Python偽Pulse 9例、公開header ABI確認、Mac SDK compileと216生成チェック、既存21負例+今回final authority負例成功。実Unix socket/Opus、終了失敗slot保持、初回viewer退出継続を確認。実device/実通話は未確認。

## 私有コピーによる負例と復元（生出力）

```text
permission 1 
 RUN  v5.0.1 /workspaces/sodashitsu-native-microphone

 ❯ ../../tmp/soda-mic-node-negative-4wpk7ar6/host.test.ts (4 tests | 1 failed | 3 skipped) 14ms
   × rejects absent permissions and arbitrary names before resolving commands or spawning 12ms

 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  18:11:39
   Duration  254ms (transform 62%, import 20%, tests 12%, worker 5%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  ../../tmp/soda-mic-node-negative-4wpk7ar6/host.test.ts > rejects absent permissions and arbitrary names before resolving commands or spawning
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      "linux-portal",
    ]


Number of calls: 1

 ❯ ../../tmp/soda-mic-node-negative-4wpk7ar6/host.test.ts:21:229


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


physical-slot 1 
 RUN  v5.0.1 /workspaces/sodashitsu-native-microphone

 ❯ ../../tmp/soda-mic-node-negative-4wpk7ar6/host.test.ts (4 tests | 1 failed | 3 skipped) 12ms
   × retains the physical slot when termination cannot be confirmed 11ms

 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  18:11:40
   Duration  167ms (transform 60%, import 20%, tests 16%, worker 4%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  ../../tmp/soda-mic-node-negative-4wpk7ar6/host.test.ts > retains the physical slot when termination cannot be confirmed
AssertionError: promise resolved "{ path: '/generated/pcm', …(2) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "close": [Function close],
+   "path": "/generated/pcm",
+   "verify": [Function verify],
  }

 ❯ ../../tmp/soda-mic-node-negative-4wpk7ar6/host.test.ts:40:101
     38|   const stopped=expect(lease.close()).rejects.toThrow('retirement not …
     39|   expect(child.kill).toHaveBeenCalledTimes(2);
     40|   await expect(host.open('linux-portal','virtual','SodaDesktopMicropho…
       |                                                                                                     ^
     41|  }finally{child.emit('close');vi.useRealTimers();}
     42| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


restored 0 
 RUN  v5.0.1 /workspaces/sodashitsu-native-microphone


 Test Files  1 passed (1)
      Tests  2 passed | 2 skipped (4)
   Start at  18:11:41
   Duration  190ms (transform 67%, import 20%, tests 9%, worker 5%)


virtual 1 F
======================================================================
FAIL: test_physical_target_never_started (__main__.Tests.test_physical_target_never_started)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/tmp/soda-mic-negative-281d33m8/test-linux-native-microphone.py", line 47, in test_physical_target_never_started
    with self.assertRaisesRegex(m.MicrophoneFailure,"virtual_endpoint_required"):self.start(api)
AssertionError: MicrophoneFailure not raised

----------------------------------------------------------------------
Ran 1 test in 0.001s

FAILED (failures=1)

packet 1 F
======================================================================
FAIL: test_packet (__main__.Tests.test_packet)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/tmp/soda-mic-negative-281d33m8/test-linux-native-microphone.py", line 73, in test_packet
    with self.assertRaises(m.MicrophoneFailure):m.microphone_packet(bad,0,1000)
AssertionError: MicrophoneFailure not raised

----------------------------------------------------------------------
Ran 1 test in 0.000s

FAILED (failures=1)

restored 0 .........
----------------------------------------------------------------------
Ran 9 tests in 0.002s

OK

```

## Mac CI負例（生出力）

```text
2026-10-31T09:15:41.3824380Z microphone-final-authority exit 1
2026-10-31T09:15:41.3825500Z {"generatedFailure":"NativePCMError(code: \"generated microphone: metadata query cannot extend authority\")"}
```
