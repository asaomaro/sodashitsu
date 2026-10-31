# 検証

初回build成功・関連30件成功。独立指摘修正後のLazyAudio合成11件成功。初回typecheckはtest mockfactory型不一致を検出・修正。最終全体typecheck成功、focused3ファイル33件成功、main341の製品ソースと統合した全体試験911ファイル・13,168件がすべて成功（352.79秒）。統合build/全体typecheckも成功。最後に取り込んだmain6336/b738との差分はDashboard結果記録だけでproduct/testの差分はないため再実行しない。PR/CIは次段階。

## 隔離copyの正常例

```text

 RUN  v5.0.1 /workspaces/sodashitsu-lazy-assistant-audio


 Test Files  1 passed (1)
      Tests  3 passed | 8 skipped (11)
   Start at  10:08:04
   Duration  819ms (transform 71%, import 20%, tests 9%)


```

## await後のsingle-runtime検査を除く負例

```text

 RUN  v5.0.1 /workspaces/sodashitsu-lazy-assistant-audio

 ❯ ../../tmp/soda-lazy-audio-negative-8834r5qh/assistant/LazyAssistantAudio.test.ts (11 tests | 1 failed | 8 skipped) 62ms
   × simultaneous admitted callers share one runtime and retain the original deadline 60ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  ../../tmp/soda-lazy-audio-negative-8834r5qh/assistant/LazyAssistantAudio.test.ts > simultaneous admitted callers share one runtime and retain the original deadline
AssertionError: expected "vi.fn()" to be called once, but got 2 times
 ❯ ../../tmp/soda-lazy-audio-negative-8834r5qh/assistant/LazyAssistantAudio.test.ts:21:17
     19|  await expect(audio.begin("c",input,()=>target)).rejects.toThrow();
     20|  now=100;release(create);await Promise.all([first,second]);
     21|  expect(create).toHaveBeenCalledOnce();expect(host.begin).toHaveBeenCa…
       |                 ^
     22|  expect(host.begin.mock.calls[0]![1]).toMatchObject({ttlMs:900});await…
     23| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 passed | 8 skipped (11)
   Start at  10:08:05
   Duration  750ms (transform 70%, import 21%, tests 9%)


```

## 初回proveをgeneration/reservation前へ戻す負例

```text

 RUN  v5.0.1 /workspaces/sodashitsu-lazy-assistant-audio

 ❯ ../../tmp/soda-lazy-audio-negative-8834r5qh/assistant/LazyAssistantAudio.test.ts (11 tests | 2 failed | 8 skipped) 65ms
   × does not adopt an old request after initial proof reenters suspend 6ms
   × does not adopt an old request after initial proof reenters disconnect 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  ../../tmp/soda-lazy-audio-negative-8834r5qh/assistant/LazyAssistantAudio.test.ts > does not adopt an old request after initial proof reenters suspend
 FAIL  ../../tmp/soda-lazy-audio-negative-8834r5qh/assistant/LazyAssistantAudio.test.ts > does not adopt an old request after initial proof reenters disconnect
AssertionError: promise resolved "{ uploadId: '00000000-0000-4000-8000…' }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "uploadId": "00000000-0000-4000-8000-000000000001",
  }

 ❯ ../../tmp/soda-lazy-audio-negative-8834r5qh/assistant/LazyAssistantAudio.test.ts:52:5
     50|   if(first){first=false;if(mode==="suspend"){void audio.suspend();audi…
     51|   return target;
     52|  })).rejects.toThrow();
       |     ^
     53|  expect(load).not.toHaveBeenCalled();await audio.close();
     54| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 1 passed | 8 skipped (11)
   Start at  10:08:07
   Duration  908ms (transform 72%, import 20%, tests 8%)


```

## composeの音声eager importとconstructorだけ元へ戻してrebuildする負例

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-lazy-assistant-audio

 ❯ |@sodashitsu/cli| src/entryLoading.test.ts (8 tests | 1 failed | 7 skipped) 1189ms
   × handoff preflight still validates the actual server module before reporting readiness 1187ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/cli| src/entryLoading.test.ts > handoff preflight still validates the actual server module before reporting readiness
AssertionError: expected [ …(2) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "file:///workspaces/sodashitsu-lazy-assistant-audio/packages/server/dist/assistant/AssistantAudioUploads.js",
+   "file:///workspaces/sodashitsu-lazy-assistant-audio/packages/server/dist/assistant/CodexAudio.js",
+ ]

 ❯ src/entryLoading.test.ts:43:105
     41|  const result=await execute("packages/server/dist/main.js",["__handoff…
     42|  expect(JSON.parse(result.output).ok).toBe(false);expect(result.module…
     43|  expect(result.modules.filter(url=>/\/assistant\/(?:AssistantAudioUplo…
       |                                                                                                         ^
     44| });
     45|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 7 skipped (8)
   Start at  10:08:49
   Duration  1.34s (tests 96%, transform 2%, import 1%)


```

隔離copyの正常3件成功、factory負例は期待1回に対して2回のAssertionError、epoch負例は取消要求がresolveしたAssertionError。copy作成元のLazyAssistantAudio SHA256 f487d653b9e6a88818de281599082d7b09fc790986409466d7a2c4c5bcb5de60が終了後一致。compose負例はAudioUploads/CodexAudioの不要評価を検出し、そのsourceもbyte一致で復元してrebuild済み。実録音・モデル・OS入力は起動していない。
