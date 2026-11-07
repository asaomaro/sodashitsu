# AGY / Muse 子履歴

base c096。Codex既存read APIを維持してAGY/Museをdispatcherへ追加。AGYはnative invoke/descriptor二重proof、KILLEDは履歴の所属のみとして許可、missing/unknown拒否。Museはfold済み正式child_session_boundだけが内部serviceから子UUIDを渡せる。subagent idとsession idを混同せず、nestedsession path、file regular/nofollow/owner、exact child stream、fd/path前後revision、fresh parent instance/session、既存TTL/limitを維持。hasTranscriptも安全な子recordの材料がある場合のみ反映。

公開内容の境界: AGY一般planner contentやsystem本文を丸ごと会話扱いしない。正式native send_message(args.Message/Recipient JSONencoded strings)の親宛要求だけを、送信要求と明示して表示。送信完了や一般assistant発言全量の取得は主張しない。Museの内部run.started.promptは公開objectiveと一致せず（48字対3882字、自作実記録の長さ比較のみ）表示禁止。親の正式objectiveだけを公開入力、子workflow_child_result_submitted.payload.text等だけを公開出力として扱う。公開入力は内部bounded Mapのみ、snapshot/永続化/logへ新規に載せない。

最終12repo suites162cases＋既存自作Muse recordのみを読むprivate test1case＝13suite163pass。private caseも新model/CLI/ログインなし、元の自作子recordを新mapperへ通しsay1件・内部prompt0件のみをassert。本文・ID・認証情報の出力/fixtureコピー無し。NativeReader内部binding/public inputとAPI facadeまで生成結合。server test含むnoEmit型検査exit0。protocolローカルbuild/型paths、main dist変更なし。

回帰負例: 旧HEADのCodex限定routerへ戻し、AGY planner content/内部Muse started.promptを通す旧prototype境界へ戻すと9件が失敗。3file cmp byte exact復元後、163pass。初回prototypeではprivate境界を広くしすぎていた点をroot指示と実自作recordの比較から絞った。以下は負例と復元後の生出力。

## negative

```text

 RUN  v5.0.1 /workspaces/sodashitsu-extra-child-history

 ❯ ../../tmp/soda-extra-child-actual.test.ts (1 test | 1 failed) 9ms
   × maps only explicit public results from an existing self-authored Muse child record 8ms
 ❯ packages/server/src/agent/MuseChildRecord.test.ts (4 tests | 4 failed) 72ms
   × reads only the formally bound nested child and exposes explicit prompt/public result 29ms
   × retains previously granted completed history but never guesses an absent binding 18ms
   × rejects changed binding during async read, child-stream mismatch and symlink 16ms
   × excludes internal reasoning, tool outputs, wrong child result and system instructions 6ms
 ❯ packages/server/src/agent/AntigravityChildRecord.test.ts (6 tests | 4 failed) 107ms
   × offers and reads AGY child history only after formal parent spawn and descriptor proof 45ms
   × keeps granted killed child history readable but rejects missing/unknown descriptors 18ms
   × refuses mismatched spawn index, child symlink, changed parent scope and records without a grant 35ms
   × never exposes generic planner text, thoughts or messages addressed to another agent 4ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 9 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  ../../tmp/soda-extra-child-actual.test.ts > maps only explicit public results from an existing self-authored Muse child record
AssertionError: expected [ 'prompt', 'say' ] to deeply equal [ 'say' ]

- Expected
+ Received

  [
+   "prompt",
    "say",
  ]

 ❯ ../../tmp/soda-extra-child-actual.test.ts:9:96
      7|   let sub:string[]=[];try{sub=await readdir(root+'/'+id+'/subagent');}…
      8|   for(const child of sub){try{rows=(await readFile(root+'/'+id+'/subag…
      9|    const entries=rows.flatMap(row=>museChildEntries(row,child));expect…
       |                                                                                                ^
     10|    const internal=rows.filter(row=>row.payload?.event?.kind==='started…
     11|    console.log(JSON.stringify({ownFixture:true,publicEntryKinds:entrie…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/9]⎯

 FAIL  packages/server/src/agent/AntigravityChildRecord.test.ts > offers and reads AGY child history only after formal parent spawn and descriptor proof
AssertionError: expected undefined to match object { status: 'ok', running: false, …(1) }

- Expected:
{
  "entries": [
    {
      "kind": "say",
      "text": "【親への送信要求】
generated response",
    },
  ],
  "running": false,
  "status": "ok",
}

+ Received:
undefined

 ❯ packages/server/src/agent/AntigravityChildRecord.test.ts:26:51
     24|  try{expect((await native.read({paneId:"p",instanceId:"instance",kind:…
     25|  finally{native.close();}
     26|  expect(await f.reader.read("p",child,undefined)).toMatchObject({statu…
       |                                                   ^
     27| });
     28| it("keeps granted killed child history readable but rejects missing/un…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/9]⎯

 FAIL  packages/server/src/agent/AntigravityChildRecord.test.ts > keeps granted killed child history readable but rejects missing/unknown descriptors
AssertionError: expected undefined to be 'ok' // Object.is equality

- Expected:
"ok"

+ Received:
undefined

 ❯ packages/server/src/agent/AntigravityChildRecord.test.ts:30:119
     28| it("keeps granted killed child history readable but rejects missing/un…
     29|  const f=await fixture();await f.reader.read("p",child,undefined);f.pa…
     30|  await writeFile(f.descriptor,await f.data("killed.json"));expect((awa…
       |                                                                                                                       ^
     31|  await rm(f.descriptor);expect(await f.reader.read("p",child,undefined…
     32| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/9]⎯

 FAIL  packages/server/src/agent/AntigravityChildRecord.test.ts > refuses mismatched spawn index, child symlink, changed parent scope and records without a grant
AssertionError: expected undefined to match object { status: 'unreadable', entries: [] }

- Expected:
{
  "entries": [],
  "status": "unreadable",
}

+ Received:
undefined

 ❯ packages/server/src/agent/AntigravityChildRecord.test.ts:37:87
     35|  expect(await openAntigravityChildRecord(parent,child,{home:f.home})).…
     36|  const other=f.file+".copy";await writeFile(other,"generated");await r…
     37|  f.pane.agentSession!.sessionId=child;await expect(f.reader.read("p",c…
       |                                                                                       ^
     38|  f.pane.agent!.subagents!.items=[];await expect(f.reader.read("p",chil…
     39| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/9]⎯

 FAIL  packages/server/src/agent/AntigravityChildRecord.test.ts > never exposes generic planner text, thoughts or messages addressed to another agent
AssertionError: expected [ { kind: 'say', …(2) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "kind": "say",
+     "text": "private plan",
+     "truncated": false,
+   },
+ ]

 ❯ packages/server/src/agent/AntigravityChildRecord.test.ts:45:120


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/9]⎯

 FAIL  packages/server/src/agent/MuseChildRecord.test.ts > reads only the formally bound nested child and exposes explicit prompt/public result
AssertionError: expected undefined to match object { status: 'ok', entries: [ …(2) ] }

- Expected:
{
  "entries": [
    {
      "kind": "prompt",
      "text": "generated instruction",
    },
    {
      "kind": "say",
      "text": "generated public result",
    },
  ],
  "status": "ok",
}

+ Received:
undefined

 ❯ packages/server/src/agent/MuseChildRecord.test.ts:21:78


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/9]⎯

 FAIL  packages/server/src/agent/MuseChildRecord.test.ts > retains previously granted completed history but never guesses an absent binding
AssertionError: promise resolved "undefined" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
undefined

 ❯ packages/server/src/agent/MuseChildRecord.test.ts:25:98
     23| });
     24| it("retains previously granted completed history but never guesses an …
     25|  const f=await fixture();f.binding(undefined);await expect(f.reader.re…
       |                                                                                                  ^
     26|  f.pane.agent!.subagents!.items=[];f.binding(undefined);expect((await …
     27|  f.verified(false);await expect(f.reader.read("p",subagent,undefined))…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/9]⎯

 FAIL  packages/server/src/agent/MuseChildRecord.test.ts > rejects changed binding during async read, child-stream mismatch and symlink
AssertionError: expected undefined to match object { status: 'unreadable', entries: [] }

- Expected:
{
  "entries": [],
  "status": "unreadable",
}

+ Received:
undefined

 ❯ packages/server/src/agent/MuseChildRecord.test.ts:30:112


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/9]⎯

 FAIL  packages/server/src/agent/MuseChildRecord.test.ts > excludes internal reasoning, tool outputs, wrong child result and system instructions
AssertionError: expected [ { kind: 'prompt', …(2) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "kind": "prompt",
+     "text": "private assembled instructions",
+     "truncated": false,
+   },
+ ]

 ❯ packages/server/src/agent/MuseChildRecord.test.ts:35:337


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/9]⎯


 Test Files  3 failed | 10 passed (13)
      Tests  9 failed | 154 passed (163)
   Start at  23:47:03
   Duration  2.80s (transform 51%, tests 27%, import 22%)

  Transform  transforming modules took 9.34s · 51% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

```

## restored

```text

 RUN  v5.0.1 /workspaces/sodashitsu-extra-child-history


 Test Files  13 passed (13)
      Tests  163 passed (163)
   Start at  23:47:07
   Duration  2.79s (transform 50%, tests 28%, import 21%)

  Transform  transforming modules took 9.17s · 50% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

```
