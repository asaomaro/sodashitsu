# 検証

関連8ファイル125件pass（protocol境界1件追加後は再確認）。生成UI pass。最終build/typecheck/全体テストは実行待ち。実モデルの音声認識とWindows実機は未実施。

Codex実インストール0.165.0から `codex app-server generate-json-schema --experimental` のみ実行。既存daemonへは接続せず、TurnStartParams UserInputにaudio/localAudio、thread/read/loaded/listの型を確認。公式CLI reference/app-serverとClaude Code voice dictationも閲覧した。

## 回帰の負例

以下は対応guardを除去した生の失敗出力。各回元bytes一致で復元し、最終ソースでは全体検証する。

### final-guard

```text
 FAIL  |@sodashitsu/server| src/assistant/CodexAudio.test.ts > rechecks expires when the final target guard changes the budget
AssertionError: promise resolved "{ turnId: 'generated-turn' }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "turnId": "generated-turn",
  }

 ❯ src/assistant/CodexAudio.test.ts:69:76
     67|   }
     68|  };
     69|  await expect(sendCodexAudio(target,controller.signal,10000,guard,opti…
       |                                                                            ^
     70|  expect(f.requests.some(r=>r.method==="turn/start")).toBe(false);
     71| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

### proxy-exit

```text
 FAIL  |@sodashitsu/server| src/assistant/CodexAudio.test.ts > retains an unclosed owned proxy in its quota and does not report successful delivery
AssertionError: promise resolved "{ turnId: 'generated-turn' }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "turnId": "generated-turn",
  }

 ❯ src/assistant/CodexAudio.test.ts:77:33
     75|  try {
     76|   const sending=sendCodexAudio(target,new AbortController().signal,100…
     77|   const rejected=expect(sending).rejects.toThrow("終了を確認できません");
       |                                 ^
     78|   await vi.advanceTimersByTimeAsync(1500);await rejected;
     79|   expect(owned.has(f.child)).toBe(true);expect(f.child.kill).toHaveBee…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯

Vitest caught 1 unhandled error during the test run.
This might cause false positive tests. Resolve unhandled errors to make sure your tests are not affected.

⎯⎯⎯⎯ Unhandled Rejection ⎯⎯⎯⎯⎯
AssertionError: promise resolved "{ turnId: 'generated-turn' }" instead of rejecting
 ❯ _Assertion.__VITEST_REJECTS__ node_modules/.pnpm/vitest@5.0.1_@types+node@24.13.5_happy-dom@20.14.5_vite@8.3.0_@types+node@24.13.5_jiti@2.7.0_/node_modules/vitest/dist/chunks/index.m3L2HgmY.js:2453:33
 ❯ _Assertion.propertyGetter node_modules/.pnpm/chai@6.2.2/node_modules/chai/index.js:1570:27
 ❯ Object.proxyGetter [as get] node_modules/.pnpm/chai@6.2.2/node_modules/chai/index.js:1659:22
 ❯ packages/server/src/assistant/CodexAudio.test.ts:77:33
 ❯ node_modules/.pnpm/vitest@5.0.1_@types+node@24.13.5_happy-dom@20.14.5_vite@8.3.0_@types+node@24.13.5_jiti@2.7.0_/node_modules/vitest/dist/chunks/run.C5UmxDPh.js:1628:35
 ❯ node_modules/.pnpm/vitest@5.0.1_@types+node@24.13.5_happy-dom@20.14.5_vite@8.3.0_@types+node@24.13.5_jiti@2.7.0_/node_modules/vitest/dist/chunks/run.C5UmxDPh.js:2783:26
 ❯ node_modules/.pnpm/vitest@5.0.1_@types+node@24.13.5_happy-dom@20.14.5_vite@8.3.0_@types+node@24.13.5_jiti@2.7.0_/node_modules/vitest/dist/chunks/run.C5UmxDPh.js:3319:20
 ❯ runWithCancel node_modules/.pnpm/vitest@5.0.1_@types+node@24.13.5_happy-dom@20.14.5_vite@8.3.0_@types+node@24.13.5_jiti@2.7.0_/node_modules/vitest/dist/chunks/run.C5UmxDPh.js:3314:10

This error originated in "packages/server/src/assistant/CodexAudio.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
The last test to run before this error was "retains an unclosed owned proxy in its quota and does not report successful delivery". This means either:
- the error was thrown while Vitest was running this test, or
- the error was thrown after the test completed, and this was the most recent test at that point.
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯


```

### exclusive-owner

```text
 FAIL  |@sodashitsu/server| src/assistant/AssistantAudioUploads.test.ts > never deletes an existing file when exclusive creation fails
AssertionError: promise rejected "Error: ENOENT: no such file or directory,… { …(4) }" instead of resolving
 ❯ src/assistant/AssistantAudioUploads.test.ts:85:38
     83|   const directory=join(f.dir,"assistant-audio");await mkdir(directory)…
     84|   await expect(f.uploads.commit("owner",id)).rejects.toThrow();
     85|   await expect(readFile(path,"utf8")).resolves.toBe("existing-user-fil…
       |                                      ^
     86|  }finally{await f.close();}
     87| });

Caused by: Error: ENOENT: no such file or directory, open '/tmp/soda-assistant-audio-K8w1Zt/assistant-audio/7c05161a-8c88-4a21-898f-eca43d45afd8.wav'
 ❯ src/assistant/AssistantAudioUploads.test.ts:85:3

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Serialized Error: { errno: -2, code: 'ENOENT', syscall: 'open', path: '/tmp/soda-assistant-audio-K8w1Zt/assistant-audio/7c05161a-8c88-4a21-898f-eca43d45afd8.wav' }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

### admission

```text
 FAIL  |@sodashitsu/server| src/assistant/AssistantAudioUploads.test.ts > admits concurrent stores against the combined retained bytes limit
AssertionError: expected [ { status: 'fulfilled', …(1) }, …(1) ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ src/assistant/AssistantAudioUploads.test.ts:97:53
     95|   f.uploads.chunk("a",chunk(a.uploadId));f.uploads.chunk("b",chunk(b.u…
     96|   const results=await Promise.allSettled([f.uploads.commit("a",a),f.up…
     97|   expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);ex…
       |                                                     ^
     98|  }finally{await f.close();}
     99| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

### sweep-race

```text
 FAIL  |@sodashitsu/server| src/assistant/AssistantAudioUploads.test.ts > tolerates a retention deletion between directory enumeration and stat
AssertionError: promise rejected "Error: gone { code: 'ENOENT' }" instead of resolving
 ❯ src/assistant/AssistantAudioUploads.test.ts:106:134


Caused by: Error: gone
 ❯ src/assistant/AssistantAudioUploads.test.ts:103:122

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Serialized Error: { code: 'ENOENT' }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

### delete-drain

```text
 FAIL  |@sodashitsu/server| src/assistant/AssistantAudioUploads.test.ts > drains a retention unlink before suspend can complete
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/assistant/AssistantAudioUploads.test.ts:118:63
    116|   await vi.advanceTimersByTimeAsync(300100);await started;
    117|   let paused=false;const pausing=uploads.suspend().then(()=>{paused=tr…
    118|   for(let i=0;i<10;i++)await Promise.resolve();expect(paused).toBe(fal…
       |                                                               ^
    119|   release();await pausing;expect(paused).toBe(true);
    120|  }finally{release();await uploads.close();vi.useRealTimers();await rm(…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

### proof-admission

```text
 FAIL  |@sodashitsu/server| src/assistant/AssistantAudioUploads.test.ts > does not admit a new upload if its proof synchronously suspends the service
AssertionError: expected [Function] to throw an error
 ❯ src/assistant/AssistantAudioUploads.test.ts:134:95
    132| it("does not admit a new upload if its proof synchronously suspends th…
    133|  const f=await fixture();
    134|  try{expect(()=>f.uploads.begin("owner",begin,()=>{void f.uploads.susp…
       |                                                                                               ^
    135|  finally{await f.close();}
    136| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

### cleanup-slot

```text
 FAIL  |@sodashitsu/server| src/assistant/AssistantAudioUploads.test.ts > holds the physical upload slot until unsent file cleanup settles
AssertionError: expected [Function] to throw an error
 ❯ src/assistant/AssistantAudioUploads.test.ts:147:55
    145|   path=join(dir,"assistant-audio",`${uploadId}.wav`);uploads.chunk("ow…
    146|   const sending=uploads.commit("owner",{uploadId}),rejected=expect(sen…
    147|   expect(()=>uploads.begin("owner",begin,()=>target)).toThrow();
       |                                                       ^
    148|   uploads.begin("other",begin,()=>target);expect(()=>uploads.begin("th…
    149|   release();await rejected;expect(()=>uploads.begin("owner",begin,()=>…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantAudioUploads.test.ts > holds the physical upload slot until unsent file cleanup settles
Error: Promise returned by `expect(actual).rejects.toThrow()` was not awaited. This assertion is asynchronous and must be awaited; otherwise, it is not guaranteed to complete before the test finishes:

await expect(actual).rejects.toThrow()

 ❯ src/assistant/AssistantAudioUploads.test.ts:146:76
    144|   ({uploadId}=uploads.begin("owner",begin,()=>{if(path&&existsSync(pat…
    145|   path=join(dir,"assistant-audio",`${uploadId}.wav`);uploads.chunk("ow…
    146|   const sending=uploads.commit("owner",{uploadId}),rejected=expect(sen…
       |                                                                            ^
    147|   expect(()=>uploads.begin("owner",begin,()=>target)).toThrow();
    148|   uploads.begin("other",begin,()=>target);expect(()=>uploads.begin("th…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


```

### original-budget

```text
 FAIL  |@sodashitsu/desktop-assistant| src/transcription.test.ts > does not reset the original audio budget when a read exhausts it without running the timer
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      Object {
        "bytes": Uint8Array [
          1,
        ],
        "mime": "audio/wav",
        "name": "a.wav",
      },
      AbortSignal {
        Symbol(kEvents): Map {},
        Symbol(events.maxEventTargetListeners): 0,
        Symbol(events.maxEventTargetListenersWarned): false,
        Symbol(kHandlers): Map {},
        Symbol(kAborted): false,
        Symbol(kReason): undefined,
        Symbol(kComposite): false,
      },
      300000,
    ]


Number of calls: 1

 ❯ src/transcription.test.ts:50:24


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

### file-hide

```text
 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > cancels a file audio read before model submission on hide
 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > cancels a file audio read before model submission on minimize
 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > cancels a file audio read before model submission on navigation
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/main.test.ts:1166:104
    1164|   const job=fixture.handlers.get("assistant:transcribe-file")!(local);…
    1165|   if(lifecycle==="hide")bubble.hide();else if(lifecycle==="minimize")b…
    1166|   release();await job;expect(control.request.mock.calls.some(call=>cal…
       |                                                                                                        ^
    1167|  }finally{release?.();fixture.audioRead=null;await fixture.handlers.ge…
    1168| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯


```
