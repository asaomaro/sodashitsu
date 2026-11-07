# Muse child公開surfaceの未実証fallbackを削除

独立reviewでassistant_message_committed.textのchild公開surface根拠を質問された。今回の実自作childで明示確認したのはworkflow_child_result_submitted.payload.textだけなので、未使用fallbackを削除。main readerの対応をchildへ広げない。既取得grantの同scope歴史継続（EOF未確定bindingundefined時）と、新規grantにはEOF binding必須という意図をdocsへ明記。

source固定後163関連pass（自作既存record reader1件含む）/server tests含む型0。1行だけ旧HEADへ戻すとprivate境界テスト1件fail、cmp byte exact復元し163件再pass。実モデル/CLI/Windows0。生出力:

```text

 RUN  v5.0.1 /workspaces/sodashitsu-extra-child-history

 ❯ packages/server/src/agent/MuseChildRecord.test.ts (4 tests | 1 failed | 3 skipped) 10ms
   × excludes internal reasoning, tool outputs, wrong child result and system instructions 9ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  packages/server/src/agent/MuseChildRecord.test.ts > excludes internal reasoning, tool outputs, wrong child result and system instructions
AssertionError: expected [ { kind: 'say', …(3) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "at": "2026-11-07T03:27:03.400Z",
+     "kind": "say",
+     "text": "unproven child surface",
+     "truncated": false,
+   },
+ ]

 ❯ packages/server/src/agent/MuseChildRecord.test.ts:35:404


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 12 skipped (13)
      Tests  1 failed | 162 skipped (163)
   Start at  23:53:40
   Duration  1.15s (transform 69%, import 30%, worker 1%)

  Transform  transforming modules took 8.55s · 69% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

```

```text

 RUN  v5.0.1 /workspaces/sodashitsu-extra-child-history


 Test Files  13 passed (13)
      Tests  163 passed (163)
   Start at  23:53:41
   Duration  2.69s (transform 50%, tests 28%, import 22%)

  Transform  transforming modules took 8.82s · 50% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

```
