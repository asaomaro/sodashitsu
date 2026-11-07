# 子モデル/effort追跡の種類別取得段

確定前にroot予備reviewで見つかった2件を修正。Claudeの補足がtracker進行/上限等でundefinedでも、親scope/freshが同じならno updateとして新hook件数・状態を維持。scope/fresh失効の従来clearは維持。Museはdurable file modelを先に候補保持し、optional viewは独立1秒deadline（実querycloseまで1physical slot維持）、全体待ち2秒後も候補file identityを再検証して返す。queryがdeadlineを無視する生成fixtureでmodel保持を確認。

Claude: exact hook child path+現在parent instance/session/freshの二重確認、最新assistant.message.modelを公開SubagentInfoへ反映しモデル変更を追う。未確認effortは省略。既存NativeSubagentService pollへ追加、新timer/CLIなし、読取中tracker進行は補足だけ捨てる。

Muse: subagent_id≠child_session_idのnested_session_v1 binding/schemaを厳密に保持、exact nested child streamのrun.model.configured.model_idを実行設定として反映。view/pageのexact child session/reasoningEffortChangedだけをbasis:session（standing default）で取得。turn overrideとは混同しない。64 cache/30秒、file identity変更/parent scope変更で旧値を持ち越さず、cache期限後のview失敗はdefault effort未知としdurable modelを残す。parent EOF revision前後照合、4 file reads同時/64子/2秒、256KiB末尾。Model/effortから本文を保持せず、ログにも本文や実idを出していない。

7種類の取得根拠/未実装binding/未観測fieldをdocs/subagent-record-observations.mdへまとめた。AGY/Copilot/Grok/CursorでAPI不存在とは断定しない。開始model/type/親effortを子に転用していない。AGY/Museの履歴追加は次段、今回の動作範囲に含めない。

既存の自作Muse隔離probeの子に対し、正式read-only MSP echo/empty view/pageを1回実行。exit0/外部model0/login0、6種類のturn/item/tokenイベントのみでmodel/effort設定イベントは0だった。Tierが最初から必ず取れるとは主張しない。結果の匿名metadataをmuse-read-only-result.jsonへ保存。

Node24、最終runtime固定後10関連suite/152件成功、server testを含むnoEmit型検査exit0。protocolは専用tree内だけbuildし型の一時pathsで参照、main distは未変更。新しい検査途中のsource変更なし。全体test/Windows操作/実model/ユーザーpane入力なし。

回帰負例を2段で保存: 取得配線2fileを既存HEADへ戻すとClaude/Museの実service/reader結合2件が失敗。root予備P2の旧挙動へ戻すとhook進行値消去/query-timeout model消失の2件が失敗。それぞれ修正版cmp byte exact復元、最終152件成功。以下生出力。

## negative

```text

 RUN  v5.0.1 /workspaces/sodashitsu-native-child-transcripts

 ❯ packages/server/src/agent/NativeSubagentService.test.ts (16 tests | 1 failed) 25ms
   × publishes verified Claude child metadata through the shared poll and drops late instance changes 5ms
 ❯ packages/server/src/agent/MuseChildObservations.test.ts (5 tests | 1 failed) 75ms
   × publishes bound Muse child settings through the actual native reader without altering activity 31ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  packages/server/src/agent/MuseChildObservations.test.ts > publishes bound Muse child settings through the actual native reader without altering activity
AssertionError: expected { count: 1, items: [ { …(5) } ] } to match object { count: 1, items: [ { …(4) } ] }
(4 matching properties omitted from actual)

- Expected
+ Received

  {
    "count": 1,
    "items": [
      {
        "id": "01a1b40b-a06a-7d31-b41b-e2b731d3874a",
-       "model": "observed-child",
-       "reasoningEffort": "high",
-       "reasoningEffortBasis": "session",
      },
    ],
  }

 ❯ packages/server/src/agent/MuseChildObservations.test.ts:46:97


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  packages/server/src/agent/NativeSubagentService.test.ts > publishes verified Claude child metadata through the shared poll and drops late instance changes
AssertionError: expected "vi.fn()" to be called with arguments: [ 'pane', …(1) ]

Number of calls: 0

 ❯ packages/server/src/agent/NativeSubagentService.test.ts:91:43


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed | 8 passed (10)
      Tests  2 failed | 148 passed (150)
   Start at  23:19:56
   Duration  3.01s (transform 54%, tests 24%, import 21%)

  Transform  transforming modules took 8.82s · 54% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

```

## p2-negative

```text

 RUN  v5.0.1 /workspaces/sodashitsu-native-child-transcripts

 ❯ packages/server/src/agent/NativeSubagentService.test.ts (17 tests | 1 failed) 35ms
   × does not erase progressed Claude hook membership when metadata is rejected, but still clears expired scope 11ms
 ❯ packages/server/src/agent/MuseChildObservations.test.ts (6 tests | 1 failed) 2164ms
   × preserves durable model when optional view ignores its deadline longer than the total budget 2044ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  packages/server/src/agent/MuseChildObservations.test.ts > preserves durable model when optional view ignores its deadline longer than the total budget
AssertionError: expected undefined to deeply equal { model: 'durable-model', …(1) }

- Expected:
{
  "model": "durable-model",
  "modelBasis": "turn",
}

+ Received:
undefined

 ❯ packages/server/src/agent/MuseChildObservations.test.ts:54:68
     52|  const query=vi.fn(()=>new Promise<any>(()=>{}));const observer=new Mu…
     53|  const result=await observer.readMany(parent,[{id:subagent,startedAt:0…
     54|  expect(query).toHaveBeenCalledOnce();expect(result.get(subagent)).toE…
       |                                                                    ^
     55| });
     56|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  packages/server/src/agent/NativeSubagentService.test.ts > does not erase progressed Claude hook membership when metadata is rejected, but still clears expired scope
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      "pane",
      undefined,
    ]


Number of calls: 1

 ❯ packages/server/src/agent/NativeSubagentService.test.ts:100:103


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed | 8 passed (10)
      Tests  2 failed | 150 passed (152)
   Start at  23:24:57
   Duration  5.16s (transform 49%, tests 33%, import 18%)

  Transform  transforming modules took 12.54s · 49% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

```

## p2-restored

```text

 RUN  v5.0.1 /workspaces/sodashitsu-native-child-transcripts


 Test Files  10 passed (10)
      Tests  152 passed (152)
   Start at  23:25:02
   Duration  5.34s (transform 50%, tests 28%, import 21%)

  Transform  transforming modules took 13.32s · 50% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

```
