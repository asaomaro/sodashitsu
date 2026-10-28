# 7B2c 検証記録

Base c08dd7712d955afc5d5c9a7c217e40b2cb4390df。常駐service/実SYSTEM起動/実vault/実画面取得・入力を追加しない専用dispatcher。

- 関連unit43件通過。taskcheckでhost active callback内の再入abort後の確認漏れと送信buffer合算を指摘され修正、再点検にmust/shouldなし。
- 最初のtypecheckはoversize生成fixtureの余分なmessage fieldで型エラー。Object.assignで意図した余分なdiagnosticを生成するfixtureへ修正。製品の型を緩めていない。
- Source7負例（allowlist/peer/deadline/reentrant/buffer/replay/cleanup）は別WTの製品TSを直接変更、意図したAssertionErrorを確認し、各finallyで元bytes復元。復元後の関連43件通過。protocolだけ先にbuildし、製品TSはvitestが直接読む。生成済みserver distに負例を適用したとは主張しない。
- 再入abortの負例は最初completion地点を選ぶと後段の送信直前確認で停止し、テストが成功した。元bytesを復元し、既存serialization地点のテストを選び直したところ、実際の送信直前の欠落をAssertionErrorで検出した。検査の重複を誤って負例成功扱いにしない。
- source/root全体、独立check build/smoke/crossの結果は完了後に追記。7B全体/7全体の完了ではない。

## Source負例の生ログ

```text

## allowlist
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-dispatch-negative

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninDispatch.test.ts (43 tests | 1 failed | 42 skipped) 21ms
   × closes unknown method exec without forwarding 18ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninDispatch.test.ts > closes unknown method exec without forwarding
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/desktop/DesktopSigninDispatch.test.ts:45:24


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 42 skipped (43)
   Start at  10:08:19
   Duration  1.25s (transform 73%, import 24%, tests 2%)


## peer
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-dispatch-negative

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninDispatch.test.ts (43 tests | 1 failed | 42 skipped) 27ms
   × rejects unregistered-key at the channel boundary 25ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninDispatch.test.ts > rejects unregistered-key at the channel boundary
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/desktop/DesktopSigninDispatch.test.ts:57:38


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 42 skipped (43)
   Start at  10:08:22
   Duration  1.21s (transform 74%, import 23%, tests 3%)


## deadline
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-dispatch-negative

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninDispatch.test.ts (43 tests | 1 failed | 42 skipped) 18ms
   × cancels pending start on deadline and discards its late completion 16ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninDispatch.test.ts > cancels pending start on deadline and discards its late completion
AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times
 ❯ src/desktop/DesktopSigninDispatch.test.ts:67:27
     65|   if(mode==="parallel")f.request("next","desktop.capabilities");
     66|   finish({started:true});await flush();
     67|   expect(f.conn.sendText).toHaveBeenCalledTimes(1);expect(scope.active…
       |                           ^
     68| });
     69| it("bounds a stalled request with a timer, even without further messag…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 42 skipped (43)
   Start at  10:08:24
   Duration  1.29s (transform 74%, import 24%, tests 2%, worker 1%)


## reentrant
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-dispatch-negative

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninDispatch.test.ts (43 tests | 1 failed | 42 skipped) 22ms
   × rejects synchronous abort from the host active callback at serialization 20ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninDispatch.test.ts > rejects synchronous abort from the host active callback at serialization
AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times
 ❯ src/desktop/DesktopSigninDispatch.test.ts:89:27
     87|   f.request("caps","desktop.capabilities");await flush();
     88|   if(mode==="entry")expect(f.handlers.capabilities).not.toHaveBeenCall…
     89|   expect(f.conn.sendText).toHaveBeenCalledTimes(1);expect(f.conn.close…
       |                           ^
     90| });
     91| it("counts the next response against the remaining send buffer budget"…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 42 skipped (43)
   Start at  10:08:27
   Duration  1.08s (transform 71%, import 26%, tests 2%)


## buffer
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-dispatch-negative

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninDispatch.test.ts (43 tests | 1 failed | 42 skipped) 21ms
   × counts the next response against the remaining send buffer budget 19ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninDispatch.test.ts > counts the next response against the remaining send buffer budget
AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times
 ❯ src/desktop/DesktopSigninDispatch.test.ts:93:82
     91| it("counts the next response against the remaining send buffer budget"…
     92|   const f=fixture();await f.hello();Object.defineProperty(f.conn,"buff…
     93|   f.request("caps","desktop.capabilities");await flush();expect(f.conn…
       |                                                                                  ^
     94| });
     95| it("caps concurrent channels and reclaims a closed channel",()=>{

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 42 skipped (43)
   Start at  10:08:29
   Duration  1.15s (transform 72%, import 25%, tests 2%)


## replay
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-dispatch-negative

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninDispatch.test.ts (43 tests | 1 failed | 42 skipped) 38ms
   × rejects duplicate-id at the channel boundary 35ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninDispatch.test.ts > rejects duplicate-id at the channel boundary
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/desktop/DesktopSigninDispatch.test.ts:57:38


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 42 skipped (43)
   Start at  10:08:31
   Duration  1.15s (transform 72%, import 24%, tests 4%, worker 1%)


## cleanup
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-signin-dispatch-negative

 ❯ |@sodashitsu/server| src/desktop/DesktopSigninDispatch.test.ts (43 tests | 1 failed | 42 skipped) 31ms
   × dispatches only the four requests with a private owner and fixed policy 29ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninDispatch.test.ts > dispatches only the four requests with a private owner and fixed policy
AssertionError: expected "vi.fn()" to be called once with arguments: [ Array(1) ]

Number of calls: 0

 ❯ src/desktop/DesktopSigninDispatch.test.ts:40:123
     38|   expect(owner).toMatch(/^[a-f0-9-]{36}$/);expect(owner).not.toBe(owne…
     39|   expect(scope).toMatchObject({revision:session,provider:"2".repeat(64…
     40|   f.disconnect();expect(scope.active()).toBe(false);expect(scope.signa…
       |                                                                                                                           ^
     41|   f.dispatch.close();f.disconnect();expect(f.handlers.clientGone).toHa…
     42| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 42 skipped (43)
   Start at  10:08:34
   Duration  1.29s (transform 76%, import 21%, tests 3%, worker 1%)


```

## 全体検証の中断と再検証

Source/rootのbuildとtypecheckは成功後に各全体unitへ進んだが、同時実行した全体runは両方exit143で中断、最終summaryなし。sourceにはgraph.test.ts worker終了timeout、rootにはApp.test.tsのgraph表示test timeoutがあった。これらを全体PASSやunique件数へ換算しない。中断原因は断定しない。コード/条件を変えず、sourceのApp/graphを単独maxWorkers1で実行すると46件/2filesが9.03秒でPASS。その後、全体unitを順番に実行し直す。結果は完了後に追記する。

## 最終結果

- Source/root build/typecheck成功後の初回同時全体runはexit143で中断、全体PASSとして数えない。その後のsource単独全体は12107 PASS/1 FAIL、812 PASS files/1 FAIL file（合計12108件/813files）、334.15秒。失敗は変更していないAgentForkDialogの既存worktree submit testで、forkAgent呼出し回数0のassert。コード/条件を変えず単独で同fileを再実行し9件/1file PASS（2.57秒）。source unique12108件を検証したが、単一全体runのPASSではない。新規moduleは既存Web画面からimportされない。
- Root単独全体12170件/821files PASS（単一run、347.47秒）。関連43件、source7負例/元bytes復元は既述。全体を成功と偽装したり、単独再実行の9件を追加件数として足さない。
- 独立checkのinstall/build/smoke、関連43件、taskcheck/修正再点検/cross/記録差分点検に残るmust/shouldなし。独立unitの初回はbuild前のmodule未生成で試験前に停止、build後に43件通過。historical logsは/tmp/signin-dispatch-independent-{install,build,smoke,unit}.log（その後の実行環境切替で/tmpと旧実行sessionは保持されず、再開後のログはworkspace cacheへ保存）。
- この変更のpathでは既存CI workflowは起動しない（statusCheckRollup空）。CI成功と主張しない。service/installer/controller/worker/UIへの接続と実SYSTEM/実取得/入力は未実施。

### source全体の失敗（生ログ）

```text
 FAIL  |@sodashitsu/web| src/components/AgentForkDialog.test.ts > AgentForkDialog（20261009-agent-fork PR2） > 新しい worktree: ブランチ名・作成先・変更の件数の注意。既にあるブランチ名では、確定を押せない（理由）
AssertionError: expected "vi.fn()" to be called with arguments: [ 'p1', …(2) ]

Number of calls: 0

 ❯ src/components/AgentForkDialog.test.ts:75:31
     73|     expect((wrapper.get("[data-fork-submit]").element as HTMLButtonEle…
     74|     await wrapper.get("form").trigger("submit");
     75|     expect(actions.forkAgent).toHaveBeenCalledWith("p1", { kind: "work…
       |                               ^
     76|   });
     77|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 812 passed (813)
      Tests  1 failed | 12107 passed (12108)
   Start at  19:52:18
   Duration  334.15s (tests 83%, import 9%, environment 4%, transform 4%)


```
