# テスト結果: 04-remote（別のマシンのノード）

## 実行したもの
- 6c5cd1d の上で `pnpm build` — exit 0 / `pnpm typecheck` — exit 0
- `pnpm test` — 352 files / 6265 passed・exit 0（load average 8.0）
- レビューのラウンド 1 の修正（694eb63）の後（実装者の検証）: build・typecheck exit 0。`pnpm test` は 1 回目 exit 1（この work で触っていない `WsGateway.integration.test.ts` の 1 件が 20 秒の時間切れ。load average 14.9）、再実行で 352 files / 6270 passed・exit 0。そのファイル単独でも 18 件 pass。
- E2E・負荷試験は依頼が無いので回していない。

## 受け入れ基準ごとの判定（04 の担う範囲）
- AC14: pass（実物のサーバ 2 台の結合試験: 手元→リモート・リモート→手元の線が 1 回だけ動く・切断中は machine_unavailable で見送り理由が履歴に残る・再接続後に切れている間の完了で動かない・監督役がリモート。単体: hello と同じ塊のイベント・4401・繋ぎ直しの間隔・遅い SNAPSHOT）
- AC1（別のマシンの呼び名・マシンの表示・未接続の印）: pass（web の部品の試験）
- AC6・AC7〜AC9 のリモート版: pass（tail は SNAPSHOT の末尾・500 行・5 秒、監督の知らせのマシンの呼び名、切断後の知らせ直し）
- 実機の ssh 越しの 2 台での確認は未検証（試験は同じ機械の 2 つのサーバ）。

## 失敗の証跡

### 負の確認（修正前に落ちる生の出力・変異の網羅）

```
==================================================================
## M1 再接続の基準: 切れたときに元の基準を捨てない（繋がったときだけ元の値を流す）
変異: src/graph/GraphEngine.ts に sed '372s/if (rt.from.port === port)$/if (rt.from.port === port \&\& up)/'
--- diff ---
372c372
<       if (rt.from.port === port)
---
>       if (rt.from.port === port && up)
--- vitest run src/graph/GraphEngine.remote.test.ts src/graph/remote.integration.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/graph/GraphEngine.remote.test.ts (13 tests | 2 failed) 67ms
   ❯ GraphEngine — 別のマシン（04） (10)
     × 繋ぎ直した値は基準: 切れている間の完了では動かず、その後の完了で 1 回だけ動く 11ms
     × 承認待ちのまま切れて繋ぎ直しても、その回は動かない（基準） 4ms
{"ts":"2026-09-28T16:06:19.088Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-09-28T16:06:19.090Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-remote-M8kbkK/commands.json","count":0}
{"ts":"2026-09-28T16:06:19.572Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-09-28T16:06:19.573Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-local-znyzZF/commands.json","count":0}
{"ts":"2026-09-28T16:06:22.603Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-09-28T16:06:22.639Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-09-28T16:06:22.640Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-remote-uumXjc/commands.json","count":0}
{"ts":"2026-09-28T16:06:23.043Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-09-28T16:06:23.044Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-local-0GUqsA/commands.json","count":0}
{"ts":"2026-09-28T16:06:24.961Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-09-28T16:06:26.523Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-09-28T16:06:26.551Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-09-28T16:06:26.552Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-remote-C2BlOt/commands.json","count":0}
{"ts":"2026-09-28T16:06:26.969Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-09-28T16:06:26.970Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-local-V7kbEQ/commands.json","count":0}
{"ts":"2026-09-28T16:06:31.659Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続を閉じました"}
 ❯ src/graph/remote.integration.test.ts (3 tests | 1 failed) 12636ms
   ❯ 連携の別のマシンのノード（2 つの composeServer。04 T5） (3)
     × 切れている間の発火は machine_unavailable で見送り、繋ぎ直した後は切れている間の完了で動かない（次の完了で 1 回だけ） 3914ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/graph/GraphEngine.remote.test.ts > GraphEngine — 別のマシン（04） > 繋ぎ直した値は基準: 切れている間の完了では動かず、その後の完了で 1 回だけ動く
AssertionError: expected [ [ 'p1', '見て: 末尾' ] ] to deeply equal []

- Expected
+ Received

- []
+ [
+   [
+     "p1",
+     "見て: 末尾",
+   ],
+ ]

 ❯ src/graph/GraphEngine.remote.test.ts:244:29
    242|     t.remote.setUp(true);
    243|     await flush();
    244|     expect(t.local.prompts).toEqual([]);
       |                             ^
    245|     expect(t.runs()).toEqual([]);
    246|     t.remote.set("p1", agent("ra", 4));

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  src/graph/GraphEngine.remote.test.ts > GraphEngine — 別のマシン（04） > 承認待ちのまま切れて繋ぎ直しても、その回は動かない（基準）
AssertionError: expected [ [ 'p1', …(1) ] ] to deeply equal []

- Expected
+ Received

- []
+ [
+   [
+     "p1",
+     "配下 r-p1（p1・マシン box）が承認待ちです。画面の末尾（5 行）:
+
+ 末尾
+
+ `sodactl --machine box agent send-keys p1 <キー>` で答えてください。",
+   ],
+ ]

 ❯ src/graph/GraphEngine.remote.test.ts:281:29
    279|     t.advance(BLOCKED_HOLD_MS * 2);
    280|     await flush();
    281|     expect(t.local.prompts).toEqual([]);
       |                             ^
    282|   });
    283|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  src/graph/remote.integration.test.ts > 連携の別のマシンのノード（2 つの composeServer。04 T5） > 切れている間の発火は machine_unavailable で見送り、繋ぎ直した後は切れている間の完了で動かない（次の完了で 1 回だけ）
AssertionError: expected [ { linkId: 'l2', …(3) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "at": 1790611586266,
+     "linkId": "l2",
+     "result": "sent",
+     "text": "GO_LOCAL",
+   },
+ ]

 ❯ src/graph/remote.integration.test.ts:326:42
    324|       await waitFor("remote link up again", () => t.local.graphRemoteA…
    325|       await new Promise((r) => setTimeout(r, 500));
    326|       expect(t.local.graphHistory("l2")).toEqual([]); // 切れている間の完了では動か…
       |                                          ^
    327|       expect(sentOf(t, "l1")).toBe(0);
    328|       expect(screen(t.remote, r2!)).not.toContain("GO_REMOTE");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


 Test Files  2 failed (2)
      Tests  3 failed | 13 passed (16)
   Start at  01:06:16
   Duration  14.69s (tests 81%, transform 15%, import 4%)

exit code: 1
==================================================================
## M2 切断中: 端のマシンが切れていても抑止しない（口が無いときだけ machine_unavailable）
変異: src/graph/GraphEngine.ts に sed '288s/to.port?.available() !== true || from.port?.available() !== true/to.port === null/'
--- diff ---
288c288
<           : to.port?.available() !== true || from.port?.available() !== true
---
>           : to.port === null
--- vitest run src/graph/GraphEngine.remote.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/graph/GraphEngine.remote.test.ts (13 tests | 1 failed) 59ms
   ❯ GraphEngine — 別のマシン（04） (10)
     × 切れている間の発火は machine_unavailable で見送る。待っていた発火も切れたら machine_unavailable で取り消す 13ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/graph/GraphEngine.remote.test.ts > GraphEngine — 別のマシン（04） > 切れている間の発火は machine_unavailable で見送る。待っていた発火も切れたら machine_unavailable で取り消す
AssertionError: expected [ 'l2:waiting', …(2) ] to deeply equal [ 'l2:waiting', …(2) ]

- Expected
+ Received

  [
    "l2:waiting",
-   "l2:skipped/machine_unavailable",
-   "l1:skipped/machine_unavailable",
+   "l2:skipped/target_absent",
+   "l1:skipped/target_absent",
  ]

 ❯ src/graph/GraphEngine.remote.test.ts:231:25
    229|     await flush();
    230|     expect(t.remote.prompts).toEqual([]);
    231|     expect(t.reasons()).toEqual([
       |                         ^
    232|       "l2:waiting",
    233|       "l2:skipped/machine_unavailable",

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 12 passed (13)
   Start at  01:06:32
   Duration  1.04s (transform 74%, import 19%, tests 7%)

exit code: 1
==================================================================
## M3 1 回だけ: 完了の鍵を「増えた」でなく「同じか増えた」で判定する
変異: src/graph/TriggerState.ts に sed '109s/agent.completionSeq > this.baseline.completionSeq/agent.completionSeq >= this.baseline.completionSeq/'
--- diff ---
109c109
<     const completed = agent.completionSeq > this.baseline.completionSeq;
---
>     const completed = agent.completionSeq >= this.baseline.completionSeq;
--- vitest run src/graph/GraphEngine.remote.test.ts src/graph/remote.integration.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/graph/GraphEngine.remote.test.ts (13 tests | 1 failed) 66ms
   ❯ GraphEngine — 別のマシン（04） (10)
     × 手元 → 別のマシン: 元が完了したら別のマシンの先へ 1 回だけ送る 14ms
{"ts":"2026-09-28T16:06:36.048Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-09-28T16:06:36.050Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-remote-CzoJ81/commands.json","count":0}
{"ts":"2026-09-28T16:06:36.496Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-09-28T16:06:36.497Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-local-C8NlmU/commands.json","count":0}
{"ts":"2026-09-28T16:06:40.005Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-09-28T16:06:40.052Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-09-28T16:06:40.053Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-remote-cyp1vL/commands.json","count":0}
{"ts":"2026-09-28T16:06:40.507Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-09-28T16:06:40.507Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-local-HMuGDb/commands.json","count":0}
{"ts":"2026-09-28T16:06:43.008Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-09-28T16:06:45.120Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-09-28T16:06:45.155Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-09-28T16:06:45.156Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-remote-ideI6z/commands.json","count":0}
{"ts":"2026-09-28T16:06:45.585Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-09-28T16:06:45.586Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-local-WWjpC2/commands.json","count":0}
{"ts":"2026-09-28T16:06:50.332Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続を閉じました"}

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/graph/GraphEngine.remote.test.ts > GraphEngine — 別のマシン（04） > 手元 → 別のマシン: 元が完了したら別のマシンの先へ 1 回だけ送る
AssertionError: expected [ 'l1:sent', 'l1:waiting' ] to deeply equal [ 'l1:sent' ]

- Expected
+ Received

  [
    "l1:sent",
+   "l1:waiting",
  ]

 ❯ src/graph/GraphEngine.remote.test.ts:208:25
    206|     await flush();
    207|     expect(t.remote.prompts).toHaveLength(1);
    208|     expect(t.reasons()).toEqual(["l1:sent"]);
       |                         ^
    209|   });
    210|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 15 passed (16)
   Start at  01:06:34
   Duration  16.33s (tests 83%, transform 14%, import 3%)

exit code: 1
==================================================================
## M4 再接続の基準（口）: 切れている間も最後の status を返す
変異: src/graph/RemoteAgentPort.ts に sed '85s/if (!this.link.available()) return null;/\/\/ (mutated)/'
--- diff ---
85c85
<     if (!this.link.available()) return null;
---
>     // (mutated)
--- vitest run src/graph/RemoteAgentPort.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/graph/RemoteAgentPort.test.ts (8 tests | 1 failed) 69ms
   ❯ RemoteAgentPort (7)
     × 切れたら使えなくなり status は null（呼び名は残る）。繋ぎ直しの snapshot を基準として知らせる（切れている間の完了のイベントは来ない） 11ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/graph/RemoteAgentPort.test.ts > RemoteAgentPort > 切れたら使えなくなり status は null（呼び名は残る）。繋ぎ直しの snapshot を基準として知らせる（切れている間の完了のイベントは来ない）
AssertionError: expected { instanceId: 'i1', …(7) } to be null

- Expected:
null

+ Received:
{
  "completionSeq": 3,
  "instanceId": "i1",
  "kind": "claude",
  "label": "Claude",
  "serverSeenSeq": 0,
  "since": 0,
  "state": "idle",
  "verified": true,
}

 ❯ src/graph/RemoteAgentPort.test.ts:120:31
    118|     await tick();
    119|     expect(port.available()).toBe(false);
    120|     expect(port.status("p1")).toBeNull();
       |                               ^
    121|     expect(port.paneName("p1")).toBe("impl");
    122|     await expect(port.prompt("p1", "x")).rejects.toMatchObject({ code:…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 7 passed (8)
   Start at  01:06:51
   Duration  1.23s (transform 77%, import 16%, tests 6%)

exit code: 1

==================================================================
# g04 点検の修正（サーバ）: 修正前に回帰テストが落ちること（生の出力）

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/graph/RemoteAgentPort.test.ts (9 tests | 1 failed) 87ms
   ❯ RemoteAgentPort（g04 点検） (1)
     × 時間切れの読み取りの購読を外し終えるまで次の読み取りを始めず、遅れて届いた古い SNAPSHOT を次の読み取りに使わない 13ms
 ❯ src/graph/RemoteLinks.test.ts (10 tests | 3 failed) 97ms
   ❯ RemoteLinks（g04 点検） (3)
     × hello の応答と同じ塊で後ろに来たイベントを落とさず、snapshot の後に順に当てる。応答より前のイベント（snapshot が含む）は当て直さない 11ms
     × リモートの CLOSE の code は素通しせず（4401 等は 1011）、繋ぎ直しを止めない 4ms
     × hello を断り続けるリモートへは、繋ぎ直しの間隔が伸びる（チャネルが開いただけでは間隔を戻さない）。同じ online の知らせでは待ちを飛ばさない 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/graph/RemoteAgentPort.test.ts > RemoteAgentPort（g04 点検） > 時間切れの読み取りの購読を外し終えるまで次の読み取りを始めず、遅れて届いた古い SNAPSHOT を次の読み取りに使わない
AssertionError: expected [ Array(2) ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ src/graph/RemoteAgentPort.test.ts:235:72
    233|     const second = port.tail("p1", 3);
    234|     await tick();
    235|     expect(ch.requests().filter((r) => r.method === "pane.subscribe"))…
       |                                                                        ^
    236|     ch.snapshotFrame("p1", "OLD"); // 前の購読の遅れた画面
    237|     ch.reply(ch.lastRequest("pane.unsubscribe")!.id, {});

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  src/graph/RemoteLinks.test.ts > RemoteLinks（g04 点検） > hello の応答と同じ塊で後ろに来たイベントを落とさず、snapshot の後に順に当てる。応答より前のイベント（snapshot が含む）は当て直さない
AssertionError: expected { kind: 'claude', …(7) } to match object { state: 'idle', completionSeq: 2 }
(6 matching properties omitted from actual)

- Expected
+ Received

  {
-   "completionSeq": 2,
-   "state": "idle",
+   "completionSeq": 1,
+   "state": "working",
  }

 ❯ src/graph/RemoteLinks.test.ts:239:31
    237|     await settle();
    238|     expect(port.available()).toBe(true);
    239|     expect(port.status("p1")).toMatchObject({ state: "idle", completio…
       |                               ^
    240|     expect(seen).toEqual(["p1:2"]);
    241|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯

 FAIL  src/graph/RemoteLinks.test.ts > RemoteLinks（g04 点検） > リモートの CLOSE の code は素通しせず（4401 等は 1011）、繋ぎ直しを止めない
AssertionError: expected 1 to be greater than 1
 ❯ src/graph/RemoteLinks.test.ts:252:38
    250|     machines.last().remoteClose(4401);
    251|     await vi.advanceTimersByTimeAsync(5_000);
    252|     expect(machines.channels.length).toBeGreaterThan(1);
       |                                      ^
    253|   });
    254|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯

 FAIL  src/graph/RemoteLinks.test.ts > RemoteLinks（g04 点検） > hello を断り続けるリモートへは、繋ぎ直しの間隔が伸びる（チャネルが開いただけでは間隔を戻さない）。同じ online の知らせでは待ちを飛ばさない
AssertionError: expected [ +0, +0, +0 ] to deeply equal [ 1, 2, 4 ]

- Expected
+ Received

  [
-   1,
-   2,
-   4,
+   0,
+   0,
+   0,
  ]

 ❯ src/graph/RemoteLinks.test.ts:280:63
    278|     const gaps = opened.slice(1).map((v, i) => v - opened[i]!);
    279|     expect(gaps.length).toBeGreaterThanOrEqual(3);
    280|     expect(gaps.slice(0, 3).map((g) => Math.round(g / 1000))).toEqual(…
       |                                                               ^
    281|   });
    282| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯


 Test Files  2 failed (2)
      Tests  4 failed | 15 passed (19)
   Start at  01:19:50
   Duration  1.07s (transform 68%, import 21%, tests 10%, worker 1%)


 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/graph/GraphEngine.remote.test.ts (14 tests | 1 failed) 57ms
   ❯ GraphEngine — 別のマシンの監督役（04） (4)
     × 知らせの途中で接続が切れた（connection_closed。届いたか分からない）なら、失敗を残さず繋がった後に知らせ直す（g04 点検） 10ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/graph/GraphEngine.remote.test.ts > GraphEngine — 別のマシンの監督役（04） > 知らせの途中で接続が切れた（connection_closed。届いたか分からない）なら、失敗を残さず繋がった後に知らせ直す（g04 点検）
AssertionError: expected [ { linkId: 'l1', at: 3000, …(3) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "at": 3000,
+     "linkId": "l1",
+     "reason": "error",
+     "result": "failed",
+     "text": "connection closed",
+   },
+ ]

 ❯ src/graph/GraphEngine.remote.test.ts:398:22
    396|     t.advance(SUPERVISOR_DEBOUNCE_MS);
    397|     await flush();
    398|     expect(t.runs()).toEqual([]);
       |                      ^
    399|     t.remote.failWith = null;
    400|     t.remote.setUp(false);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 13 passed (14)
   Start at  01:20:00
   Duration  984ms (transform 74%, import 19%, tests 7%, worker 1%)


==================================================================
# g04 点検の修正（web）: 修正前の本体（HEAD の store/graph.ts・GraphView.vue・PaneChecklist.vue・RekeyPicker.vue、main.ts の確かめ無しの焦点）で新しい試験が落ちること

 RUN  v5.0.1 /workspaces/sodashitsu/packages/web

 ❯ src/components/graph/PaneChecklist.test.ts (10 tests | 1 failed | 8 skipped) 74ms
   ❯ PaneChecklist（別のマシンを見ている間・未接続。g04 点検） (2)
     × 画面が向いているマシンが切れたら節に（未接続）。切り替えの途中（session が空）は無効と出さず、繋がっていないと書く。手元の要約が一度も繋がっていなければそう書く 19ms
 ❯ src/components/graph/GraphView.test.ts (72 tests | 1 failed | 71 skipped) 91ms
   ❯ GraphView（繋がっていないマシンのノード。g04 点検） (1)
     × 切れたマシンのノードは未接続の印で最後の状態を出さず、Enter は画面を閉じずに知らせる 88ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/components/graph/GraphView.test.ts > GraphView（繋がっていないマシンのノード。g04 点検） > 切れたマシンのノードは未接続の印で最後の状態を出さず、Enter は画面を閉じずに知らせる
Error: Cannot call text on an empty DOMWrapper.
 ❯ Object.get ../../node_modules/.pnpm/@vue+test-utils@2.5.1_@vue+compiler-dom@3.5.43_@vue+server-renderer@3.5.43_vue@3.5.43_typescript@5.9.3_/node_modules/@vue/test-utils/dist/vue-test-utils.cjs.js:1488:27
 ❯ src/components/graph/GraphView.test.ts:1829:38
    1827|     await flush();
    1828|     const n = t.wrapper.find(`[data-node-key="${M}:p7"]`);
    1829|     expect(n.find(".graph-node-warn").text()).toBe("未接続");
       |                                      ^
    1830|     expect(n.attributes("aria-label")).toContain("マシンに未接続");
    1831|     expect(n.attributes("aria-label")).not.toContain("作業中");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/components/graph/PaneChecklist.test.ts > PaneChecklist（別のマシンを見ている間・未接続。g04 点検） > 画面が向いているマシンが切れたら節に（未接続）。切り替えの途中（session が空）は無効と出さず、繋がっていないと書く。手元の要約が一度も繋がっていなければそう書く
AssertionError: expected 'api' to be 'api（未接続）' // Object.is equality

Expected: "api（未接続）"
Received: "api"

 ❯ src/components/graph/PaneChecklist.test.ts:273:57
    271|     const w = mount(PaneChecklist, { attachTo: document.body });
    272|     await nextTick();
    273|     expect(w.findAll("legend").map((l) => l.text())[0]).toBe("api（未接続）…
       |                                                         ^
    274|     w.unmount();
    275|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed | 2 skipped (4)
      Tests  2 failed | 1 passed | 83 skipped (86)
   Start at  01:24:46
   Duration  3.26s (transform 55%, environment 26%, import 16%, tests 2%, worker 1%)

  Transform  transforming modules took 4.93s · 55% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

exit code: 1

--- 修正前の RekeyPicker.vue（HEAD）と確かめ無しの焦点で、RekeyPicker.test・paneFocus.test ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/web

 ❯ src/actions/paneFocus.test.ts (2 tests | 1 failed) 21ms
   ❯ focusPaneIfShown (2)
     × 閉じた pane・別の tab へ移った pane・表示が無いときは何もしない 11ms
 ❯ src/components/graph/RekeyPicker.test.ts (2 tests | 1 failed) 66ms
   ❯ RekeyPicker (2)
     × 繋がっていないマシンの候補は選べない（最後の要約の pane を印なしに出さない） 14ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/actions/paneFocus.test.ts > focusPaneIfShown > 閉じた pane・別の tab へ移った pane・表示が無いときは何もしない
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/actions/paneFocus.test.ts:22:45
     20|   it("閉じた pane・別の tab へ移った pane・表示が無いときは何もしない", () => {
     21|     const b = make({ p1: "t2" }, "t1");
     22|     expect(focusPaneIfShown(b.ports, "p1")).toBe(false);
       |                                             ^
     23|     expect(focusPaneIfShown(b.ports, "p9")).toBe(false);
     24|     const c = make({ p1: "t1" }, null);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/components/graph/RekeyPicker.test.ts > RekeyPicker > 繋がっていないマシンの候補は選べない（最後の要約の pane を印なしに出さない）
AssertionError: expected [ false, false ] to deeply equal [ true, true ]

- Expected
+ Received

  [
-   true,
-   true,
+   false,
+   false,
  ]

 ❯ src/components/graph/RekeyPicker.test.ts:73:51
     71|     await nextTick();
     72|     const inputs = w.findAll<HTMLInputElement>("[data-rekey-key]");
     73|     expect(inputs.map((i) => i.element.disabled)).toEqual([true, true]…
       |                                                   ^
     74|     expect(w.text()).toContain("未接続");
     75|     expect(w.text()).toContain("繋がっていないので選べません");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed (2)
      Tests  2 failed | 2 passed (4)
   Start at  01:24:59
   Duration  2.20s (transform 50%, environment 33%, import 12%, tests 3%, worker 1%)

exit code: 1

==================================================================
# g04 点検の修正: 修正箇所の変異（壊すと試験が落ちること）

## S1 同じ塊のイベント: hello の応答の後・open の前のイベントを溜めない
変異: packages/server/src/graph/RemoteLinks.ts
--- 元 ---
        else if (this.helloAnswered) this.early.push(e);
--- 変異後 ---
        // (mutated)
--- vitest run src/graph/RemoteLinks.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/graph/RemoteLinks.test.ts (10 tests | 1 failed) 79ms
   ❯ RemoteLinks（g04 点検） (3)
     × hello の応答と同じ塊で後ろに来たイベントを落とさず、snapshot の後に順に当てる。応答より前のイベント（snapshot が含む）は当て直さない 9ms

 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
   Start at  01:25:28
   Duration  1.13s (transform 73%, import 19%, tests 8%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/graph/RemoteLinks.test.ts > RemoteLinks（g04 点検） > hello の応答と同じ塊で後ろに来たイベントを落とさず、snapshot の後に順に当てる。応答より前のイベント（snapshot が含む）は当て直さない
AssertionError: expected { kind: 'claude', …(7) } to match object { state: 'idle', completionSeq: 2 }
(6 matching properties omitted from actual)

- Expected
+ Received

  {
-   "completionSeq": 2,
-   "state": "idle",
+   "completionSeq": 1,
+   "state": "working",
  }

 ❯ src/graph/RemoteLinks.test.ts:239:31
    237|     await settle();
    238|     expect(port.available()).toBe(true);
    239|     expect(port.status("p1")).toMatchObject({ state: "idle", completio…
       |                               ^
    240|     expect(seen).toEqual(["p1:2"]);
    241|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1

## S2 4401: リモートの CLOSE の code を絞らない
変異: packages/server/src/graph/linkChannelSocket.ts
--- 元 ---
this.finish(sanitizeRemoteCloseCode(code))
--- 変異後 ---
this.finish(code)
--- vitest run src/graph/RemoteLinks.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/graph/RemoteLinks.test.ts (10 tests | 1 failed) 71ms
   ❯ RemoteLinks（g04 点検） (3)
     × リモートの CLOSE の code は素通しせず（4401 等は 1011）、繋ぎ直しを止めない 4ms

 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
   Start at  01:25:29
   Duration  981ms (transform 71%, import 20%, tests 8%, worker 1%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/graph/RemoteLinks.test.ts > RemoteLinks（g04 点検） > リモートの CLOSE の code は素通しせず（4401 等は 1011）、繋ぎ直しを止めない
AssertionError: expected 1 to be greater than 1
 ❯ src/graph/RemoteLinks.test.ts:252:38
    250|     machines.last().remoteClose(4401);
    251|     await vi.advanceTimersByTimeAsync(5_000);
    252|     expect(machines.channels.length).toBeGreaterThan(1);
       |                                      ^
    253|   });
    254|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1

## S3 繋ぎ直しの嵐: 開いたときに間隔を戻す（resetBackoffOnHello を外す）
変異: packages/server/src/graph/RemoteLinks.ts
--- 元 ---
      resetBackoffOnHello: true,
--- 変異後 ---
      resetBackoffOnHello: false,
--- vitest run src/graph/RemoteLinks.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/graph/RemoteLinks.test.ts (10 tests | 1 failed) 89ms
   ❯ RemoteLinks（g04 点検） (3)
     × hello を断り続けるリモートへは、繋ぎ直しの間隔が伸びる（チャネルが開いただけでは間隔を戻さない）。同じ online の知らせでは待ちを飛ばさない 13ms

 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
   Start at  01:25:31
   Duration  1.13s (transform 73%, import 17%, tests 9%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/graph/RemoteLinks.test.ts > RemoteLinks（g04 点検） > hello を断り続けるリモートへは、繋ぎ直しの間隔が伸びる（チャネルが開いただけでは間隔を戻さない）。同じ online の知らせでは待ちを飛ばさない
AssertionError: expected [ 1, 1, 1 ] to deeply equal [ 1, 2, 4 ]

- Expected
+ Received

  [
    1,
-   2,
-   4,
+   1,
+   1,
  ]

 ❯ src/graph/RemoteLinks.test.ts:280:63
    278|     const gaps = opened.slice(1).map((v, i) => v - opened[i]!);
    279|     expect(gaps.length).toBeGreaterThanOrEqual(3);
    280|     expect(gaps.slice(0, 3).map((g) => Math.round(g / 1000))).toEqual(…
       |                                                               ^
    281|   });
    282| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1

## S4 繋ぎ直しの嵐: online のままの知らせでも待ちを飛ばす
変異: packages/server/src/graph/RemoteLinks.ts
--- 元 ---
if (online && !was) this.links
--- 変異後 ---
if (online) this.links
--- vitest run src/graph/RemoteLinks.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server


 Test Files  1 passed (1)
      Tests  10 passed (10)
   Start at  01:25:33
   Duration  1.06s (transform 74%, import 18%, tests 7%)

exit code: 0

## S5 遅い SNAPSHOT: 購読を外し終えるのを待たずに次の読み取り
変異: packages/server/src/graph/RemoteAgentPort.ts
--- 元 ---
const tracked = read.then((r) => r.released).catch(() => undefined);
--- 変異後 ---
const tracked = read.then(() => undefined).catch(() => undefined);
--- vitest run src/graph/RemoteAgentPort.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/graph/RemoteAgentPort.test.ts (9 tests | 2 failed) 74ms
   ❯ RemoteAgentPort (7)
     × tail は 5 秒で打ち切り（tail_timeout）、購読を外す。同じ pane の読み取りは 1 本ずつ。途中で切れたら machine_unavailable 11ms
   ❯ RemoteAgentPort（g04 点検） (1)
     × 時間切れの読み取りの購読を外し終えるまで次の読み取りを始めず、遅れて届いた古い SNAPSHOT を次の読み取りに使わない 4ms

 Test Files  1 failed (1)
      Tests  2 failed | 7 passed (9)
     Errors  1 error
   Start at  01:25:35
   Duration  1.03s (transform 72%, import 18%, tests 8%, worker 1%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/graph/RemoteAgentPort.test.ts > RemoteAgentPort > tail は 5 秒で打ち切り（tail_timeout）、購読を外す。同じ pane の読み取りは 1 本ずつ。途中で切れたら machine_unavailable
AssertionError: expected [ Array(2) ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ src/graph/RemoteAgentPort.test.ts:187:7
    185|         .requests()
    186|         .filter((r) => r.method === "pane.subscribe"),
    187|     ).toHaveLength(1);
       |       ^
    188|     await vi.advanceTimersByTimeAsync(4999);
    189|     expect(ch().lastRequest("pane.unsubscribe")).toBeUndefined();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/graph/RemoteAgentPort.test.ts > RemoteAgentPort（g04 点検） > 時間切れの読み取りの購読を外し終えるまで次の読み取りを始めず、遅れて届いた古い SNAPSHOT を次の読み取りに使わない
AssertionError: expected [ Array(2) ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ src/graph/RemoteAgentPort.test.ts:237:72
    235|     const second = port.tail("p1", 3);
    236|     await tick();
    237|     expect(ch.requests().filter((r) => r.method === "pane.subscribe"))…
       |                                                                        ^
    238|     ch.snapshotFrame("p1", "OLD"); // 前の購読の遅れた画面
    239|     ch.reply(ch.lastRequest("pane.unsubscribe")!.id, {});

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯

Vitest caught 1 unhandled error during the test run.
This might cause false positive tests. Resolve unhandled errors to make sure your tests are not affected.

⎯⎯⎯⎯ Unhandled Rejection ⎯⎯⎯⎯⎯
AgentPortError: machine aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa is not connected
 ❯ unavailable src/graph/RemoteAgentPort.ts:209:10
    207|
    208| function unavailable(machine: string): AgentPortError {
    209|   return new AgentPortError("machine_unavailable", `machine ${machine}…
       |          ^
    210| }
    211|
 ❯ src/graph/RemoteAgentPort.ts:163:54
 ❯ finish src/graph/RemoteAgentPort.ts:144:9
 ❯ src/graph/RemoteAgentPort.ts:163:34
 ❯ src/graph/RemoteLinks.ts:168:48
 ❯ RemoteLink.emit src/graph/RemoteLinks.ts:180:9
 ❯ RemoteLink.setUp src/graph/RemoteLinks.ts:168:19
 ❯ RemoteLink.onState src/graph/RemoteLinks.ts:162:10
 ❯ Object.onConnectionState src/graph/RemoteLinks.ts:80:38
 ❯ Connection.handleClose ../client-core/src/net/Connection.ts:405:18

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Serialized Error: { code: 'machine_unavailable' }
This error originated in "src/graph/RemoteAgentPort.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
The last test to run before this error was "購読が断られたら（pane が無い）その code で失敗する". This means either:
- the error was thrown while Vitest was running this test, or
- the error was thrown after the test completed, and this was the most recent test at that point.
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

exit code: 1

## S6 監督の知らせの途中の切断を送り直さない
変異: packages/server/src/graph/GraphEngine.ts
--- 元 ---
 ||
          err.code === "connection_closed")
--- 変異後 ---
)
--- vitest run src/graph/GraphEngine.remote.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/graph/GraphEngine.remote.test.ts (14 tests | 1 failed) 59ms
   ❯ GraphEngine — 別のマシンの監督役（04） (4)
     × 知らせの途中で接続が切れた（connection_closed。届いたか分からない）なら、失敗を残さず繋がった後に知らせ直す（g04 点検） 10ms

 Test Files  1 failed (1)
      Tests  1 failed | 13 passed (14)
   Start at  01:25:36
   Duration  944ms (transform 74%, import 18%, tests 7%, worker 1%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/graph/GraphEngine.remote.test.ts > GraphEngine — 別のマシンの監督役（04） > 知らせの途中で接続が切れた（connection_closed。届いたか分からない）なら、失敗を残さず繋がった後に知らせ直す（g04 点検）
AssertionError: expected [ { linkId: 'l1', at: 3000, …(3) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "at": 3000,
+     "linkId": "l1",
+     "reason": "error",
+     "result": "failed",
+     "text": "connection closed",
+   },
+ ]

 ❯ src/graph/GraphEngine.remote.test.ts:398:22
    396|     t.advance(SUPERVISOR_DEBOUNCE_MS);
    397|     await flush();
    398|     expect(t.runs()).toEqual([]);
       |                      ^
    399|     t.remote.failWith = null;
    400|     t.remote.setUp(false);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1

## C1 Connection: 待ちの途中の disconnect が detached を知らせない
変異: packages/client-core/src/net/Connection.ts
--- 元 ---
    else if (!ws) this.store.onConnectionState("detached");
--- 変異後 ---

--- vitest run src/net/Connection.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/client-core

 ❯ src/net/Connection.test.ts (42 tests | 1 failed) 94ms
   ❯ Connection (42)
     × 待ちの途中の disconnect も detached を知らせる。disconnect の後の retarget は新しい行き先へ繋ぐ（g04 点検） 8ms

 Test Files  1 failed (1)
      Tests  1 failed | 41 passed (42)
   Start at  01:25:38
   Duration  578ms (transform 53%, import 26%, tests 21%, worker 1%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/Connection.test.ts > Connection > 待ちの途中の disconnect も detached を知らせる。disconnect の後の retarget は新しい行き先へ繋ぐ（g04 点検）
AssertionError: expected 'reconnecting' to be 'detached' // Object.is equality

Expected: "detached"
Received: "reconnecting"

 ❯ src/net/Connection.test.ts:479:33
    477|     expect(store.states.at(-1)).toBe("reconnecting");
    478|     conn.disconnect();
    479|     expect(store.states.at(-1)).toBe("detached");
       |                                 ^
    480|     conn.retarget("ws://example.test/ws?machine=m");
    481|     await flush();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1

## C2 Connection: disconnect の後の retarget で stopped を戻さない
変異: packages/client-core/src/net/Connection.ts
--- 元 ---
    this.stopped = false; // `disconnect` の後でも
--- 変異後 ---
    // (mutated) `disconnect` の後でも
--- vitest run src/net/Connection.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/client-core

 ❯ src/net/Connection.test.ts (42 tests | 1 failed) 110ms
   ❯ Connection (42)
     × 待ちの途中の disconnect も detached を知らせる。disconnect の後の retarget は新しい行き先へ繋ぐ（g04 点検） 12ms

 Test Files  1 failed (1)
      Tests  1 failed | 41 passed (42)
   Start at  01:25:39
   Duration  607ms (transform 51%, import 25%, tests 23%, worker 1%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/Connection.test.ts > Connection > 待ちの途中の disconnect も detached を知らせる。disconnect の後の retarget は新しい行き先へ繋ぐ（g04 点検）
AssertionError: expected [ FakeWebSocket{ …(6) }, …(1) ] to have a length of 3 but got 2

- Expected
+ Received

- 3
+ 2

 ❯ src/net/Connection.test.ts:486:21
    484|     await flush();
    485|     await vi.advanceTimersByTimeAsync(1_000);
    486|     expect(sockets).toHaveLength(3);
       |                     ^
    487|   });
    488|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1

## W1 web: 切れたマシンの要約のノードを「ある」と出す
変異: packages/web/src/store/graph.ts
--- 元 ---
exists: stale ? false : connected ? true : null,
--- 変異後 ---
exists: !stale,
--- vitest run src/components/graph/GraphView.test.ts src/components/graph/PaneChecklist.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/web

 ❯ src/components/graph/GraphView.test.ts (72 tests | 1 failed) 1803ms
   ❯ GraphView（繋がっていないマシンのノード。g04 点検） (1)
     × 切れたマシンのノードは未接続の印で最後の状態を出さず、Enter は画面を閉じずに知らせる 19ms

 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 81 passed (82)
   Start at  01:25:41
   Duration  4.42s (transform 45%, tests 33%, environment 11%, import 11%)

  Transform  transforming modules took 2.73s · 45% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/components/graph/GraphView.test.ts > GraphView（繋がっていないマシンのノード。g04 点検） > 切れたマシンのノードは未接続の印で最後の状態を出さず、Enter は画面を閉じずに知らせる
Error: Cannot call text on an empty DOMWrapper.
 ❯ Object.get ../../node_modules/.pnpm/@vue+test-utils@2.5.1_@vue+compiler-dom@3.5.43_@vue+server-renderer@3.5.43_vue@3.5.43_typescript@5.9.3_/node_modules/@vue/test-utils/dist/vue-test-utils.cjs.js:1488:27
 ❯ src/components/graph/GraphView.test.ts:1829:38
    1827|     await flush();
    1828|     const n = t.wrapper.find(`[data-node-key="${M}:p7"]`);
    1829|     expect(n.find(".graph-node-warn").text()).toBe("未接続");
       |                                      ^
    1830|     expect(n.attributes("aria-label")).toContain("マシンに未接続");
    1831|     expect(n.attributes("aria-label")).not.toContain("作業中");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1

## W2 web: 繋がっていないマシンのノードの Enter で確かめずに閉じる
変異: packages/web/src/components/graph/GraphView.vue
--- 元 ---
    info.exists === null ||
    (info.machine !== machines.selectedId && !machines.isSelectable(info.machine))
--- 変異後 ---
    false
--- vitest run src/components/graph/GraphView.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/web

 ❯ src/components/graph/GraphView.test.ts (72 tests | 1 failed) 1771ms
   ❯ GraphView（繋がっていないマシンのノード。g04 点検） (1)
     × 切れたマシンのノードは未接続の印で最後の状態を出さず、Enter は画面を閉じずに知らせる 26ms

 Test Files  1 failed (1)
      Tests  1 failed | 71 passed (72)
   Start at  01:25:46
   Duration  4.10s (tests 45%, transform 42%, import 7%, environment 7%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/components/graph/GraphView.test.ts > GraphView（繋がっていないマシンのノード。g04 点検） > 切れたマシンのノードは未接続の印で最後の状態を出さず、Enter は画面を閉じずに知らせる
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      Object {
        "paneId": "p7",
        "tabId": "t9",
        "workspaceId": "w9",
      },
    ]


Number of calls: 1

 ❯ src/components/graph/GraphView.test.ts:1834:37
    1832|     await n.trigger("keydown", { key: "Enter" });
    1833|     await flush();
    1834|     expect(t.switcher.switchTo).not.toHaveBeenCalled();
       |                                     ^
    1835|     expect(t.view.graphOpen).toBe(true);
    1836|     expect(t.view.toasts.at(-1)!.message).toBe("box に繋がっていません（繋がってから移れ…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1

## W3 web: 切れたマシンの選び直しの候補を選べる
変異: packages/web/src/components/graph/RekeyPicker.vue
--- 元 ---
      disabled: !connected,
--- 変異後 ---
      disabled: false,
--- vitest run src/components/graph/RekeyPicker.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/web

 ❯ src/components/graph/RekeyPicker.test.ts (2 tests | 1 failed) 65ms
   ❯ RekeyPicker (2)
     × 繋がっていないマシンの候補は選べない（最後の要約の pane を印なしに出さない） 16ms

 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
   Start at  01:25:51
   Duration  1.72s (transform 63%, environment 17%, import 15%, tests 4%, worker 1%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/components/graph/RekeyPicker.test.ts > RekeyPicker > 繋がっていないマシンの候補は選べない（最後の要約の pane を印なしに出さない）
AssertionError: expected [ false, false ] to deeply equal [ true, true ]

- Expected
+ Received

  [
-   true,
-   true,
+   false,
+   false,
  ]

 ❯ src/components/graph/RekeyPicker.test.ts:73:51
     71|     await nextTick();
     72|     const inputs = w.findAll<HTMLInputElement>("[data-rekey-key]");
     73|     expect(inputs.map((i) => i.element.disabled)).toEqual([true, true]…
       |                                                   ^
     74|     expect(w.text()).toContain("未接続");
     75|     expect(w.text()).toContain("繋がっていないので選べません");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1

## W4 web: 手元の要約が繋がっていないことを書かない
変異: packages/web/src/components/graph/PaneChecklist.vue
--- 元 ---
  [{ id: LOCAL_MACHINE_ID, label: "ローカル" }, ...machines.machines]
--- 変異後 ---
  [...machines.machines]
--- vitest run src/components/graph/PaneChecklist.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/web

 ❯ src/components/graph/PaneChecklist.test.ts (10 tests | 1 failed) 141ms
   ❯ PaneChecklist（別のマシンを見ている間・未接続。g04 点検） (2)
     × 画面が向いているマシンが切れたら節に（未接続）。切り替えの途中（session が空）は無効と出さず、繋がっていないと書く。手元の要約が一度も繋がっていなければそう書く 15ms

 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
   Start at  01:25:54
   Duration  1.64s (transform 55%, environment 19%, import 17%, tests 9%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/components/graph/PaneChecklist.test.ts > PaneChecklist（別のマシンを見ている間・未接続。g04 点検） > 画面が向いているマシンが切れたら節に（未接続）。切り替えの途中（session が空）は無効と出さず、繋がっていないと書く。手元の要約が一度も繋がっていなければそう書く
AssertionError: expected 'グラフに載せる panebox: 繋がっていないので pane を出せませ…' to contain 'ローカル: 繋がっていないので pane を出せません。'

Expected: "ローカル: 繋がっていないので pane を出せません。"
Received: "グラフに載せる panebox: 繋がっていないので pane を出せません。 そのほか（載っているノード）pane p5box（未接続）取り消し適用"

 ❯ src/components/graph/PaneChecklist.test.ts:283:23
    281|     const w2 = mount(PaneChecklist, { attachTo: document.body });
    282|     await nextTick();
    283|     expect(w2.text()).toContain("ローカル: 繋がっていないので pane を出せません。");
       |                       ^
    284|     expect(w2.text()).toContain("box: 繋がっていないので pane を出せません。");
    285|     expect(w2.text()).toContain("box（未接続）");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1

## W5 web: 画面が向いているマシンの節の鍵のマシンを手元にする
変異: packages/web/src/components/graph/PaneChecklist.vue
--- 元 ---
          const key = nodeKey(machine, pane.id);
--- 変異後 ---
          const key = nodeKey(LOCAL_MACHINE_ID, pane.id);
--- vitest run src/components/graph/PaneChecklist.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/web

 ❯ src/components/graph/PaneChecklist.test.ts (10 tests | 1 failed) 122ms
   ❯ PaneChecklist（別のマシンを見ている間・未接続。g04 点検） (2)
     × 別のマシンを見ている間: そのマシンの節は session から、手元の節は要約から。同じ pane id でも鍵のマシンを取り違えない 13ms

 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
   Start at  01:25:56
   Duration  1.48s (transform 54%, environment 19%, import 17%, tests 9%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/components/graph/PaneChecklist.test.ts > PaneChecklist（別のマシンを見ている間・未接続。g04 点検） > 別のマシンを見ている間: そのマシンの節は session から、手元の節は要約から。同じ pane id でも鍵のマシンを取り違えない
AssertionError: expected [ 'api', 'box / infra', …(1) ] to deeply equal [ 'api', 'box / infra' ]

- Expected
+ Received

  [
    "api",
    "box / infra",
+   "そのほか（載っているノード）",
  ]

 ❯ src/components/graph/PaneChecklist.test.ts:249:54
    247|     const w = mount(PaneChecklist, { attachTo: document.body });
    248|     await nextTick();
    249|     expect(w.findAll("legend").map((l) => l.text())).toEqual(["api", "…
       |                                                      ^
    250|     const rows = w.findAll(".pane-checklist-row").map((r) => [
    251|       r.find("input").attributes("data-pane-key"),

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1

## W6 web: 別のマシンを見ている間の選び直しの候補を手元の鍵にする
変異: packages/web/src/components/graph/RekeyPicker.vue
--- 元 ---
      push(nodeKey(machine, pane.id), paneNameOf(pane), pane.agent?.label ?? null);
--- 変異後 ---
      push(nodeKey(LOCAL_MACHINE_ID, pane.id), paneNameOf(pane), pane.agent?.label ?? null);
--- vitest run src/components/graph/RekeyPicker.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/web

 ❯ src/components/graph/RekeyPicker.test.ts (2 tests | 1 failed) 62ms
   ❯ RekeyPicker (2)
     × 別のマシンを見ている間、手元のノードの候補は手元の要約から、別のマシンのノードの候補は session から（同じ pane id でもマシンを取り違えない） 52ms

 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
   Start at  01:25:59
   Duration  1.73s (transform 64%, environment 17%, import 15%, tests 4%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/components/graph/RekeyPicker.test.ts > RekeyPicker > 別のマシンを見ている間、手元のノードの候補は手元の要約から、別のマシンのノードの候補は session から（同じ pane id でもマシンを取り違えない）
AssertionError: expected [ 'local:p1', 'local:p2' ] to deeply equal [ Array(1) ]

- Expected
+ Received

  [
-   "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:p2",
+   "local:p1",
+   "local:p2",
  ]

 ❯ src/components/graph/RekeyPicker.test.ts:63:26
     61|     const remote = mount(RekeyPicker, { props: { nodeKey: `${M}:p8` },…
     62|     await nextTick();
     63|     expect(keys(remote)).toEqual([`${M}:p2`]); // M:p1 は載っている
       |                          ^
     64|     remote.unmount();
     65|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1

## W7 web: 表示中の tab を確かめずに焦点を置く
変異: packages/web/src/actions/paneFocus.ts
--- 元 ---
  if (tab === undefined || tab !== ports.shownTab()) return false;
--- 変異後 ---

--- vitest run src/actions/paneFocus.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/web

 ❯ src/actions/paneFocus.test.ts (2 tests | 1 failed) 11ms
   ❯ focusPaneIfShown (2)
     × 閉じた pane・別の tab へ移った pane・表示が無いときは何もしない 7ms

 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
   Start at  01:26:01
   Duration  490ms (environment 81%, transform 11%, import 4%, tests 3%, worker 1%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/actions/paneFocus.test.ts > focusPaneIfShown > 閉じた pane・別の tab へ移った pane・表示が無いときは何もしない
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/actions/paneFocus.test.ts:22:45
     20|   it("閉じた pane・別の tab へ移った pane・表示が無いときは何もしない", () => {
     21|     const b = make({ p1: "t2" }, "t1");
     22|     expect(focusPaneIfShown(b.ports, "p1")).toBe(false);
       |                                             ^
     23|     expect(focusPaneIfShown(b.ports, "p9")).toBe(false);
     24|     const c = make({ p1: "t1" }, null);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1

==================================================================
# g04 点検の修正: S4 の再確認（試験で「閉じて待ち始めてから」online の知らせを出すよう直した後）

## S4 繋ぎ直しの嵐: online のままの知らせでも待ちを飛ばす
変異: packages/server/src/graph/RemoteLinks.ts
--- 元 ---
if (online && !was) this.links
--- 変異後 ---
if (online) this.links
--- vitest run src/graph/RemoteLinks.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/graph/RemoteLinks.test.ts (10 tests | 1 failed) 93ms
   ❯ RemoteLinks（g04 点検） (3)
     × hello を断り続けるリモートへは、繋ぎ直しの間隔が伸びる（チャネルが開いただけでは間隔を戻さない）。同じ online の知らせでは待ちを飛ばさない 27ms

 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
   Start at  01:26:14
   Duration  1.09s (transform 71%, import 19%, tests 10%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/graph/RemoteLinks.test.ts > RemoteLinks（g04 点検） > hello を断り続けるリモートへは、繋ぎ直しの間隔が伸びる（チャネルが開いただけでは間隔を戻さない）。同じ online の知らせでは待ちを飛ばさない
AssertionError: expected [ +0, +0, +0 ] to deeply equal [ 1, 2, 4 ]

- Expected
+ Received

  [
-   1,
-   2,
-   4,
+   0,
+   0,
+   0,
  ]

 ❯ src/graph/RemoteLinks.test.ts:281:63
    279|     const gaps = opened.slice(1).map((v, i) => v - opened[i]!);
    280|     expect(gaps.length).toBeGreaterThanOrEqual(3);
    281|     expect(gaps.slice(0, 3).map((g) => Math.round(g / 1000))).toEqual(…
       |                                                               ^
    282|   });
    283| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1

==================================================================
# g04 点検の修正: S4 の再確認（試験で「閉じて待ち始めてから」online の知らせを出すよう直した後）

## S4 繋ぎ直しの嵐: online のままの知らせでも待ちを飛ばす
変異: packages/server/src/graph/RemoteLinks.ts
--- 元 ---
if (online && !was) this.links
--- 変異後 ---
if (online) this.links
--- vitest run src/graph/RemoteLinks.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/graph/RemoteLinks.test.ts (10 tests | 1 failed) 83ms
   ❯ RemoteLinks（g04 点検） (3)
     × hello を断り続けるリモートへは、繋ぎ直しの間隔が伸びる（チャネルが開いただけでは間隔を戻さない）。同じ online の知らせでは待ちを飛ばさない 23ms

 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
   Start at  01:26:48
   Duration  1.00s (transform 72%, import 18%, tests 9%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/graph/RemoteLinks.test.ts > RemoteLinks（g04 点検） > hello を断り続けるリモートへは、繋ぎ直しの間隔が伸びる（チャネルが開いただけでは間隔を戻さない）。同じ online の知らせでは待ちを飛ばさない
AssertionError: expected [ +0, +0, +0 ] to deeply equal [ 1, 2, 4 ]

- Expected
+ Received

  [
-   1,
-   2,
-   4,
+   0,
+   0,
+   0,
  ]

 ❯ src/graph/RemoteLinks.test.ts:281:63
    279|     const gaps = opened.slice(1).map((v, i) => v - opened[i]!);
    280|     expect(gaps.length).toBeGreaterThanOrEqual(3);
    281|     expect(gaps.slice(0, 3).map((g) => Math.round(g / 1000))).toEqual(…
       |                                                               ^
    282|   });
    283| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1
（注: 直前の S4 の 2 回目〔exit 1〕は、試験の側の最初の知らせの取り違え〔修正前の実装の不具合: 最初の online の知らせを変化とみなしていた〕で本体でも落ちていた回。wasOnline の初期化を直した後の 3 回目が有効な負の確認）

==================================================================
# g04 点検の修正: S3 の再確認（試験と wasOnline の初期化を直した後）（試験で「閉じて待ち始めてから」online の知らせを出すよう直した後）

## S4 繋ぎ直しの嵐: online のままの知らせでも待ちを飛ばす
変異: packages/server/src/graph/RemoteLinks.ts
--- 元 ---
if (online && !was) this.links
--- 変異後 ---
if (online) this.links
--- vitest run src/graph/RemoteLinks.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/graph/RemoteLinks.test.ts (10 tests | 1 failed) 99ms
   ❯ RemoteLinks（g04 点検） (3)
     × hello を断り続けるリモートへは、繋ぎ直しの間隔が伸びる（チャネルが開いただけでは間隔を戻さない）。同じ online の知らせでは待ちを飛ばさない 33ms

 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
   Start at  01:26:58
   Duration  1.10s (transform 71%, import 19%, tests 10%, worker 1%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/graph/RemoteLinks.test.ts > RemoteLinks（g04 点検） > hello を断り続けるリモートへは、繋ぎ直しの間隔が伸びる（チャネルが開いただけでは間隔を戻さない）。同じ online の知らせでは待ちを飛ばさない
AssertionError: expected [ +0, +0, +0 ] to deeply equal [ 1, 2, 4 ]

- Expected
+ Received

  [
-   1,
-   2,
-   4,
+   0,
+   0,
+   0,
  ]

 ❯ src/graph/RemoteLinks.test.ts:281:63
    279|     const gaps = opened.slice(1).map((v, i) => v - opened[i]!);
    280|     expect(gaps.length).toBeGreaterThanOrEqual(3);
    281|     expect(gaps.slice(0, 3).map((g) => Math.round(g / 1000))).toEqual(…
       |                                                               ^
    282|   });
    283| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1

==================================================================
# g04 点検の修正: S3 の再確認（試験・wasOnline の初期化を直した後）

## S3 繋ぎ直しの嵐: 開いたときに間隔を戻す（resetBackoffOnHello を外す）
変異: packages/server/src/graph/RemoteLinks.ts
--- 元 ---
      resetBackoffOnHello: true,
--- 変異後 ---
      resetBackoffOnHello: false,
--- vitest run src/graph/RemoteLinks.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/graph/RemoteLinks.test.ts (10 tests | 1 failed) 77ms
   ❯ RemoteLinks（g04 点検） (3)
     × hello を断り続けるリモートへは、繋ぎ直しの間隔が伸びる（チャネルが開いただけでは間隔を戻さない）。同じ online の知らせでは待ちを飛ばさない 13ms

 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
   Start at  01:27:06
   Duration  1.15s (transform 72%, import 19%, tests 8%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/graph/RemoteLinks.test.ts > RemoteLinks（g04 点検） > hello を断り続けるリモートへは、繋ぎ直しの間隔が伸びる（チャネルが開いただけでは間隔を戻さない）。同じ online の知らせでは待ちを飛ばさない
AssertionError: expected [ 1, 1, 1 ] to deeply equal [ 1, 2, 4 ]

- Expected
+ Received

  [
    1,
-   2,
-   4,
+   1,
+   1,
  ]

 ❯ src/graph/RemoteLinks.test.ts:281:63
    279|     const gaps = opened.slice(1).map((v, i) => v - opened[i]!);
    280|     expect(gaps.length).toBeGreaterThanOrEqual(3);
    281|     expect(gaps.slice(0, 3).map((g) => Math.round(g / 1000))).toEqual(…
       |                                                               ^
    282|   });
    283| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1

==================================================================
# 04 レビュー R1: 修正前（HEAD の GraphEngine.ts）で「作業中とみなすのは送り終えてから」の試験が落ちること

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/graph/GraphEngine.remote.test.ts (16 tests | 1 failed | 14 skipped) 25ms
   ❯ GraphEngine — 作業中とみなすのは送り終えてから（04 レビュー R1） (2)
     × 別のマシンの画面の読み取りが 5 秒を超えても、その間と送り終えてから 5 秒は同じ先へ 2 通目を送らない 18ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/graph/GraphEngine.remote.test.ts > GraphEngine — 作業中とみなすのは送り終えてから（04 レビュー R1） > 別のマシンの画面の読み取りが 5 秒を超えても、その間と送り終えてから 5 秒は同じ先へ 2 通目を送らない
AssertionError: expected [ [ 'p1', '見て: 末尾' ] ] to deeply equal []

- Expected
+ Received

- []
+ [
+   [
+     "p1",
+     "見て: 末尾",
+   ],
+ ]

 ❯ src/graph/GraphEngine.remote.test.ts:342:29
    340|     t.remote.set("p2", agent("rb", 1)); // l2 が発火。先はまだ作業中とみなす
    341|     await flush();
    342|     expect(t.local.prompts).toEqual([]);
       |                             ^
    343|     expect(t.reasons()).toEqual(["l2:waiting"]);
    344|     finishTail("遅い画面");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 14 skipped (16)
   Start at  01:44:40
   Duration  938ms (transform 77%, import 19%, tests 3%, worker 1%)

exit code: 1

# 04 レビュー R1: 修正前（HEAD の RemoteLinks.ts・RemoteAgentPort.ts）で「hello の応答より前のイベント」の試験が落ちること

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/graph/RemoteAgentPort.test.ts (10 tests | 1 failed | 9 skipped) 108ms
   ❯ RemoteAgentPort（hello の応答より前のイベント。04 レビュー R1） (1)
     × 閉じた pane・できた pane・同じエージェントの完了の増加は snapshot に当て、古い値に戻りうるもの（名前・回数の増えない変化）は当てない 103ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/graph/RemoteAgentPort.test.ts > RemoteAgentPort（hello の応答より前のイベント。04 レビュー R1） > 閉じた pane・できた pane・同じエージェントの完了の増加は snapshot に当て、古い値に戻りうるもの（名前・回数の増えない変化）は当てない
AssertionError: expected [ 'up:true' ] to deeply equal [ 'up:true', 'p2:null', 'p1:4' ]

- Expected
+ Received

  [
    "up:true",
-   "p2:null",
-   "p1:4",
  ]

 ❯ src/graph/RemoteAgentPort.test.ts:273:17
    271|     );
    272|     await new Promise((r) => setImmediate(r));
    273|     expect(log).toEqual(["up:true", "p2:null", "p1:4"]);
       |                 ^
    274|     expect(port.status("p2")).toBeNull();
    275|     expect(port.paneName("p3")).toBe("new");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  01:46:20
   Duration  3.16s (transform 79%, import 16%, tests 4%, worker 1%)

  Transform  transforming modules took 2.22s · 79% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

exit code: 1

# 04 レビュー R1: 修正前（HEAD の store/graph.ts・PaneChecklist.vue）で web の新しい試験が落ちること

 RUN  v5.0.1 /workspaces/sodashitsu/packages/web

 ❯ src/store/graph.test.ts (19 tests | 1 failed | 18 skipped) 113ms
   ❯ store/graph（切り替えの途中。04 レビュー R1） (1)
     × 選んだマシンを替えて session を捨てた直後（接続はまだ前のマシンへ open）のノードは無効でなく未接続 104ms
 ❯ src/components/graph/PaneChecklist.test.ts (11 tests | 1 failed | 10 skipped) 159ms
   ❯ PaneChecklist（切れたマシンの古い要約。04 レビュー R1） (1)
     × 切れたマシンの pane は載せられない（載っているものは外せる） 152ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/store/graph.test.ts > store/graph（切り替えの途中。04 レビュー R1） > 選んだマシンを替えて session を捨てた直後（接続はまだ前のマシンへ open）のノードは無効でなく未接続
AssertionError: expected false to be null

- Expected:
null

+ Received:
false

 ❯ src/store/graph.test.ts:455:42
    453|     machines.select(M);
    454|     session.clear();
    455|     expect(g.nodeInfo(`${M}:p1`).exists).toBeNull();
       |                                          ^
    456|   });
    457| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/components/graph/PaneChecklist.test.ts > PaneChecklist（切れたマシンの古い要約。04 レビュー R1） > 切れたマシンの pane は載せられない（載っているものは外せる）
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/components/graph/PaneChecklist.test.ts:315:37
    313|     const box = (k: string) => w.find<HTMLInputElement>(`[data-pane-ke…
    314|     expect(box(`${M}:p4`).disabled).toBe(false); // 載っている（外せる）
    315|     expect(box(`${M}:p5`).disabled).toBe(true);
       |                                     ^
    316|     expect(box("local:p2").disabled).toBe(false);
    317|     w.unmount();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed (2)
      Tests  2 failed | 28 skipped (30)
   Start at  01:47:46
   Duration  4.48s (transform 52%, environment 25%, import 19%, tests 4%, worker 1%)

  Transform  transforming modules took 3.95s · 52% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

exit code: 1

==================================================================
# 04 レビュー R1 の修正: 修正箇所の変異（壊すと試験が落ちること）

## R1-1 作業中とみなす: 送り終えても送り始めから 5 秒で切る
変異: packages/server/src/graph/GraphEngine.ts
--- 元 ---
    entry.until = delivered
      ? this.deps.now() + ASSUMED_BUSY_MS
      : entry.startedAt + ASSUMED_BUSY_MS;
--- 変異後 ---
    entry.until = entry.startedAt + ASSUMED_BUSY_MS;
--- vitest run src/graph/GraphEngine.remote.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/graph/GraphEngine.remote.test.ts (16 tests | 1 failed) 135ms
   ❯ GraphEngine — 作業中とみなすのは送り終えてから（04 レビュー R1） (2)
     × 別のマシンの画面の読み取りが 5 秒を超えても、その間と送り終えてから 5 秒は同じ先へ 2 通目を送らない 28ms

 Test Files  1 failed (1)
      Tests  1 failed | 15 passed (16)
   Start at  01:47:53
   Duration  2.84s (transform 75%, import 19%, tests 5%, worker 1%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/graph/GraphEngine.remote.test.ts > GraphEngine — 作業中とみなすのは送り終えてから（04 レビュー R1） > 別のマシンの画面の読み取りが 5 秒を超えても、その間と送り終えてから 5 秒は同じ先へ 2 通目を送らない
AssertionError: expected [ [ 'p1', '見て: 遅い画面' ], …(1) ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ src/graph/GraphEngine.remote.test.ts:349:29
    347|     t.advance(ASSUMED_BUSY_MS - 1); // 送り終えてから 5 秒までは待つ
    348|     await flush();
    349|     expect(t.local.prompts).toHaveLength(1);
       |                             ^
    350|     t.advance(1);
    351|     await flush();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1

## R1-1b 作業中とみなす: 送り終えるまでの間も送り始めから 5 秒
変異: packages/server/src/graph/GraphEngine.ts
--- 元 ---
const entry: BusyEntry = { end, until: Number.POSITIVE_INFINITY, agent, startedAt: at };
--- 変異後 ---
const entry: BusyEntry = { end, until: at + ASSUMED_BUSY_MS, agent, startedAt: at };
--- vitest run src/graph/GraphEngine.remote.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/graph/GraphEngine.remote.test.ts (16 tests | 1 failed) 141ms
   ❯ GraphEngine — 作業中とみなすのは送り終えてから（04 レビュー R1） (2)
     × 別のマシンの画面の読み取りが 5 秒を超えても、その間と送り終えてから 5 秒は同じ先へ 2 通目を送らない 26ms

 Test Files  1 failed (1)
      Tests  1 failed | 15 passed (16)
   Start at  01:47:57
   Duration  2.93s (transform 72%, import 22%, tests 6%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/graph/GraphEngine.remote.test.ts > GraphEngine — 作業中とみなすのは送り終えてから（04 レビュー R1） > 別のマシンの画面の読み取りが 5 秒を超えても、その間と送り終えてから 5 秒は同じ先へ 2 通目を送らない
AssertionError: expected [ [ 'p1', '見て: 末尾' ] ] to deeply equal []

- Expected
+ Received

- []
+ [
+   [
+     "p1",
+     "見て: 末尾",
+   ],
+ ]

 ❯ src/graph/GraphEngine.remote.test.ts:342:29
    340|     t.remote.set("p2", agent("rb", 1)); // l2 が発火。先はまだ作業中とみなす
    341|     await flush();
    342|     expect(t.local.prompts).toEqual([]);
       |                             ^
    343|     expect(t.reasons()).toEqual(["l2:waiting"]);
    344|     finishTail("遅い画面");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1

## R1-2 応答より前の pane.closed を当てない
変異: packages/server/src/graph/RemoteAgentPort.ts
--- 元 ---
        if (this.panes.has(e.data.paneId)) this.onEvent(e);
--- 変異後 ---
        // (mutated)
--- vitest run src/graph/RemoteAgentPort.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/graph/RemoteAgentPort.test.ts (10 tests | 1 failed) 158ms
   ❯ RemoteAgentPort（hello の応答より前のイベント。04 レビュー R1） (1)
     × 閉じた pane・できた pane・同じエージェントの完了の増加は snapshot に当て、古い値に戻りうるもの（名前・回数の増えない変化）は当てない 21ms

 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
   Start at  01:48:03
   Duration  2.43s (transform 74%, import 18%, tests 7%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/graph/RemoteAgentPort.test.ts > RemoteAgentPort（hello の応答より前のイベント。04 レビュー R1） > 閉じた pane・できた pane・同じエージェントの完了の増加は snapshot に当て、古い値に戻りうるもの（名前・回数の増えない変化）は当てない
AssertionError: expected [ 'up:true', 'p1:4' ] to deeply equal [ 'up:true', 'p2:null', 'p1:4' ]

- Expected
+ Received

  [
    "up:true",
-   "p2:null",
    "p1:4",
  ]

 ❯ src/graph/RemoteAgentPort.test.ts:273:17
    271|     );
    272|     await new Promise((r) => setImmediate(r));
    273|     expect(log).toEqual(["up:true", "p2:null", "p1:4"]);
       |                 ^
    274|     expect(port.status("p2")).toBeNull();
    275|     expect(port.paneName("p3")).toBe("new");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1

## R1-2b 応答より前の状態の変化を回数を見ずに当てる
変異: packages/server/src/graph/RemoteAgentPort.ts
--- 元 ---
          next.completionSeq > now.completionSeq
--- 変異後 ---
          true
--- vitest run src/graph/RemoteAgentPort.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/graph/RemoteAgentPort.test.ts (10 tests | 1 failed) 148ms
   ❯ RemoteAgentPort（hello の応答より前のイベント。04 レビュー R1） (1)
     × 閉じた pane・できた pane・同じエージェントの完了の増加は snapshot に当て、古い値に戻りうるもの（名前・回数の増えない変化）は当てない 22ms

 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
   Start at  01:48:07
   Duration  2.69s (transform 76%, import 17%, tests 6%, worker 1%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/graph/RemoteAgentPort.test.ts > RemoteAgentPort（hello の応答より前のイベント。04 レビュー R1） > 閉じた pane・できた pane・同じエージェントの完了の増加は snapshot に当て、古い値に戻りうるもの（名前・回数の増えない変化）は当てない
AssertionError: expected [ Array(4) ] to deeply equal [ 'up:true', 'p2:null', 'p1:4' ]

- Expected
+ Received

  [
    "up:true",
    "p2:null",
    "p1:4",
+   "p4:1",
  ]

 ❯ src/graph/RemoteAgentPort.test.ts:273:17
    271|     );
    272|     await new Promise((r) => setImmediate(r));
    273|     expect(log).toEqual(["up:true", "p2:null", "p1:4"]);
       |                 ^
    274|     expect(port.status("p2")).toBeNull();
    275|     expect(port.paneName("p3")).toBe("new");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1

## R1-3 切れたマシンの古い要約の pane を載せられる
変異: packages/web/src/components/graph/PaneChecklist.vue
--- 元 ---
        disabled: !summary.connected && !initialOnGraph.has(key),
--- 変異後 ---
        disabled: false,
--- vitest run src/components/graph/PaneChecklist.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/web

 ❯ src/components/graph/PaneChecklist.test.ts (11 tests | 1 failed) 501ms
   ❯ PaneChecklist（切れたマシンの古い要約。04 レビュー R1） (1)
     × 切れたマシンの pane は載せられない（載っているものは外せる） 34ms

 Test Files  1 failed (1)
      Tests  1 failed | 10 passed (11)
   Start at  01:48:12
   Duration  4.62s (transform 49%, environment 21%, import 18%, tests 12%)

  Transform  transforming modules took 2.08s · 49% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/components/graph/PaneChecklist.test.ts > PaneChecklist（切れたマシンの古い要約。04 レビュー R1） > 切れたマシンの pane は載せられない（載っているものは外せる）
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/components/graph/PaneChecklist.test.ts:315:37
    313|     const box = (k: string) => w.find<HTMLInputElement>(`[data-pane-ke…
    314|     expect(box(`${M}:p4`).disabled).toBe(false); // 載っている（外せる）
    315|     expect(box(`${M}:p5`).disabled).toBe(true);
       |                                     ^
    316|     expect(box("local:p2").disabled).toBe(false);
    317|     w.unmount();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1

## R1-4 切り替えの直後（open のまま session が空）を繋がっているとみなす
変異: packages/web/src/store/graph.ts
--- 元 ---
      if (state === "open") return session.clientId !== null || hasContent;
--- 変異後 ---
      if (state === "open") return true;
--- vitest run src/store/graph.test.ts ---

 RUN  v5.0.1 /workspaces/sodashitsu/packages/web

 ❯ src/store/graph.test.ts (19 tests | 1 failed) 145ms
   ❯ store/graph（切り替えの途中。04 レビュー R1） (1)
     × 選んだマシンを替えて session を捨てた直後（接続はまだ前のマシンへ open）のノードは無効でなく未接続 21ms

 Test Files  1 failed (1)
      Tests  1 failed | 18 passed (19)
   Start at  01:48:19
   Duration  3.82s (transform 52%, environment 23%, import 19%, tests 4%, worker 1%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/store/graph.test.ts > store/graph（切り替えの途中。04 レビュー R1） > 選んだマシンを替えて session を捨てた直後（接続はまだ前のマシンへ open）のノードは無効でなく未接続
AssertionError: expected false to be null

- Expected:
null

+ Received:
false

 ❯ src/store/graph.test.ts:455:42
    453|     machines.select(M);
    454|     session.clear();
    455|     expect(g.nodeInfo(`${M}:p1`).exists).toBeNull();
       |                                          ^
    456|   });
    457| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

exit code: 1
```
