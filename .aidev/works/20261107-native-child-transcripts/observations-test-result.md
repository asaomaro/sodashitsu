# 最新Codex child turn観測・第2段

Codex safe openerを再利用、最後の同一turn_contextからcoherentなmodel/effortを観測しlatest行の欠落はclear。startedAtより古いrowを拒否。hasTranscriptは二重親子照合済みfileがある時のみ。countBasis/state/usageの意味は不変。parent EOF revisionは観測後にも同じguardで検証。

4同時/64子/全体2秒/各末尾256KiB。失敗・窓外はmetadata未知、creation fallback無し。実モデル/実本文/Windows操作なし。生成4ケース＋readerへの実結合1件を含め76関連pass、source固定後server tests含む型0。型はこのworktreeのprotocolをローカルbuildし一時pathsで参照、共有mainのdistを変更していない。

旧NativeSubagentReaderへ戻し、最新turnのmissing effortを古い行へfallbackする負例を併用→2件失敗。2file cmp exact復元→76件成功。生出力:

## negative

```text

 RUN  v5.0.1 /workspaces/sodashitsu-native-child-transcripts

 ❯ packages/server/src/agent/CodexChildObservations.test.ts (4 tests | 1 failed) 31ms
   × tracks coherent latest child turn and clears omitted fields, never mixes old effort 8ms
 ❯ packages/server/src/agent/NativeSubagentReader.test.ts (30 tests | 1 failed) 1339ms
   × publishes verified Codex child transcript and latest-turn metadata without creation fallback 21ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  packages/server/src/agent/CodexChildObservations.test.ts > tracks coherent latest child turn and clears omitted fields, never mixes old effort
AssertionError: expected { model: 'model-old', …(3) } to deeply equal { model: 'model-new', …(1) }

- Expected
+ Received

  {
-   "model": "model-new",
+   "model": "model-old",
    "modelBasis": "turn",
+   "reasoningEffort": "low",
+   "reasoningEffortBasis": "turn",
  }

 ❯ packages/server/src/agent/CodexChildObservations.test.ts:11:74
      9|  const base=turn("model-old","low");
     10|  expect(codexChildTurn(Buffer.from(base+turn("model-new","high")),0)).…
     11|  expect(codexChildTurn(Buffer.from(base+turn("model-new",undefined)),0…
       |                                                                          ^
     12|  expect(codexChildTurn(Buffer.from(base+turn(undefined,"high")),0)).to…
     13| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  packages/server/src/agent/NativeSubagentReader.test.ts > publishes verified Codex child transcript and latest-turn metadata without creation fallback
AssertionError: expected { …(8) } to match object { hasTranscript: true, …(4) }
(6 matching properties omitted from actual)

- Expected
+ Received

  {
-   "hasTranscript": true,
-   "model": "changed-model",
-   "modelBasis": "turn",
-   "reasoningEffort": "high",
-   "reasoningEffortBasis": "turn",
+   "reasoningEffort": "low",
+   "reasoningEffortBasis": "creation",
  }

 ❯ packages/server/src/agent/NativeSubagentReader.test.ts:225:53
    223|  const reader=new NativeSubagentReader({codexHome:f.home},async()=>new…
    224|  try{
    225|   expect((await reader.read(f.source))?.items?.[0]).toMatchObject({has…
       |                                                     ^
    226|   await appendFile(file,context("newer-model"));
    227|   const item=(await reader.read(f.source))?.items?.[0];expect(item?.mo…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed | 2 passed (4)
      Tests  2 failed | 74 passed (76)
   Start at  22:55:46
   Duration  2.29s (transform 49%, tests 35%, import 16%)

  Transform  transforming modules took 2.60s · 49% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

```

## restored

```text

 RUN  v5.0.1 /workspaces/sodashitsu-native-child-transcripts


 Test Files  4 passed (4)
      Tests  76 passed (76)
   Start at  22:55:49
   Duration  2.26s (transform 48%, tests 36%, import 15%)

  Transform  transforming modules took 2.41s · 48% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

```
