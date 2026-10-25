# 検証結果

## 対象

実機sr-pcの接続は故意に切断せず、作業用の隔離A/Bサーバーとprivate IPCで検証。新コードを動かすには両側のサーバー/CLI更新とエージェントの一度の起動し直しが必要。B再起動によるclaim消失とA handoff跨ぎの復旧は対象外。

## 動作試験

- controller: 同時復旧の集約、60秒の猶予、scope拒否、送信済みwrite無再送、通常拒否の維持、live authority失効、candidateの即時解放、固定timeout cause。
- launcher実IPC: 同じsocketで復帰、元claimとfolder/root/identity照合、write無再送、異なるscope拒否、nonplugin/exec authority失効、通常plugin report拒否の継続。
- CLI実IPC: fake clockで320秒経過→cancelを1回送信、同じsocketで新しいinspectが成功、遅い元replyを無視。終了reasonの保持。
- B request: pendingの10分制限と、起動済みnonpluginの24時間の権限確認/満了。
- 既存CLI A/B integrationを拡張し、5.5秒以上の実transport断から同じIPCで復帰。execがrun-once.txtへxを書いた直後に断ち、復帰後もxは1個のみ。PC/PJ変更後は理由付き拒否、別の場所への書き込みなし。

## 修正を戻す検証

下記はsourceを直接読むunit/IPC fixture。各修正箇所だけを戻し、実行時に失敗することを確認。コンパイル失敗をnegativeとして採用しない。各回終了後に保存positiveとのbyte一致を確認。最後に正のソースへ戻し、その後の固定cause追加も含めて再buildと全体確認を行う。

### grace

```text
 FAIL  |@sodashitsu/server| src/work/WorkAgentLauncher.reconnect.test.ts > reuses the same local IPC after loss and validates the original claim and scope before a NEW read
AssertionError: promise rejected "Error: reconnect_expired" instead of resolving
 ❯ src/work/WorkAgentLauncher.reconnect.test.ts:202:6
    200|     await expect(
    201|       f.call("tool", { operation: "file", action: "read", path: "READM…
    202|     ).resolves.toMatchObject({ content: "remote result" });
       |      ^
    203|     expect(f.replacement.request.mock.calls.map(([m]) => m)).toEqual([
    204|       "work.agent_check",

Caused by: Error: reconnect_expired
 ❯ Socket.<anonymous> src/work/WorkAgentLauncher.reconnect.test.ts:118:54

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

```

### scope

```text
 FAIL  |@sodashitsu/server| src/work/WorkAgentLauncher.reconnect.test.ts > refuses a different project identity and delivers a fixed terminal reason
AssertionError: promise resolved "{ content: 'remote result', …(1) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "content": "remote result",
+   "version": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  }

 ❯ src/work/WorkAgentLauncher.reconnect.test.ts:254:59
    252|     f.disconnect();
    253|     f.changeIdentity();
    254|     await expect(f.call("tool", { operation: "inspect" })).rejects.toT…
       |                                                           ^
    255|       "target_validation_failed",
    256|     );

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

```

### timeout

```text
 FAIL  |@sodashitsu/cli| src/workAgentIo.test.ts > keeps IPC usable after one 320s operation timeout, cancels once and ignores its late reply
AssertionError: promise rejected "Error: 作業先proxyが終了しました。ローカルでは代行しません" instead of resolving
 ❯ src/workAgentIo.test.ts:79:69
     77|     await vi.advanceTimersByTimeAsync(320000);
     78|     await failed;
     79|     await expect(f.client.request("tool", { operation: "inspect" })).r…
       |                                                                     ^
     80|     await f.cancel;
     81|     f.late();

Caused by: Error: 作業先proxyが終了しました。ローカルでは代行しません
 ❯ WorkAgentClient.request src/workAgentIo.ts:57:44
 ❯ src/workAgentIo.test.ts:79:27

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

```

### ttl

```text
 FAIL  |@sodashitsu/server| src/work/WorkAgentRequests.test.ts > retains a launched non-plugin claim after ten minutes but expires it at 24 hours
AssertionError: promise rejected "RpcError: 担当の接続は終了しました { code: 'not_…' }" instead of resolving
 ❯ src/work/WorkAgentRequests.test.ts:119:61
    117|   const request=await requests.create({paneId,agentKind:"claude",args:…
    118|   const {claim}=await requests.claim(request.id);requests.finish(reque…
    119|   now+=600001;await expect(requests.check(request.id,claim)).resolves.…
       |                                                             ^
    120|   now+=24*60*60*1000;await expect(requests.check(request.id,claim)).re…
    121| });

Caused by: RpcError: 担当の接続は終了しました
 ❯ WorkAgentRequests.validate src/work/WorkAgentRequests.ts:107:94
 ❯ WorkAgentRequests.check src/work/WorkAgentRequests.ts:134:55
 ❯ src/work/WorkAgentRequests.test.ts:119:37

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Serialized Error: { code: 'not_found', toProtocolError: 'Function<toProtocolError>' }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

```

### reason

```text
 FAIL  |@sodashitsu/cli| src/workAgentIo.test.ts > preserves a fixed terminal reason for pending and future requests
AssertionError: expected [Function] to throw error matching /24時間/ but got '作業先proxyが切断されました。ローカルでは代行しません'

- Expected:
/24時間/

+ Received:
"作業先proxyが切断されました。ローカルでは代行しません"

 ❯ src/workAgentIo.test.ts:97:35
     95|     const f = await fixture();
     96|     const pending = f.client.request("tool", { operation: "exec", comm…
     97|     const failed = expect(pending).rejects.toThrow(/24時間/);
       |                                   ^
     98|     await f.tool;
     99|     f.terminal("lease_expired");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

```

### authority

```text
 FAIL  |@sodashitsu/server| src/work/WorkAgentLauncher.reconnect.test.ts > closes a live non-plugin proxy after its original authority is revoked
AssertionError: expected [Function] to throw error including 'target_validation_failed' but got '接続先の操作に失敗しました。接続とPJを確認してください'

Expected: "target_validation_failed"
Received: "接続先の操作に失敗しました。接続とPJを確認してください"

 ❯ src/work/WorkAgentLauncher.reconnect.test.ts:277:6
    275|         version: "a".repeat(64),
    276|       }),
    277|     ).rejects.toThrow("target_validation_failed");
       |      ^
    278|     expect(f.writes()).toBe(0);
    279|     expect(f.initial.request.mock.calls.some(([m]) => m === "work.agen…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

```

### candidate

```text
 FAIL  |@sodashitsu/server| src/work/WorkAgentReconnect.test.ts > closes a candidate immediately when the proxy ends during target validation
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/work/WorkAgentReconnect.test.ts:202:31
    200|   await Promise.resolve();
    201|   f.connection.close();
    202|   expect(f.replacement.close).toHaveBeenCalledOnce();
       |                               ^
    203|   finish();
    204|   await expect(pending).rejects.toThrow();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

```

### report

```text
 FAIL  |@sodashitsu/server| src/work/WorkAgentLauncher.reconnect.test.ts > does not destroy a valid plugin proxy for a non-authority status-report rejection
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/work/WorkAgentLauncher.reconnect.test.ts:303:8
    301|         f.logger.info.mock.calls.some(([, fields]) => fields?.event ==…
    302|       )
    303|       .toBe(true);
       |        ^
    304|     await expect(f.call("tool", { operation: "inspect" })).resolves.to…
    305|       content: "remote result",

Caused by: Error: Matcher did not succeed in time.
 ❯ src/work/WorkAgentLauncher.reconnect.test.ts:299:5

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

```

## 最終確認

- pnpm build / pnpm typecheck: 成功。
- 関連unit/IPC: 29 tests passed。
- 実A/B integration: transportを2回切断して同じIPCで復帰、完了済みexec writeは1回のみ、PJ変更後の閉鎖を確認。
- 実ブラウザ work-agent-ask E2E: 1 passed。AのMarkdown表示、質問回答、MCP終了時のフォーム取消をDOMで観測。
- clean worktreeのpnpm smoke: PASS。
- 全体vitest --maxWorkers=2: 744 files / 11339 tests passed、837.97秒。
- 独立レビュー: 指摘を修正し、修正差分と最終追加差分の再レビュー通過。
- 元dirty作業フォルダへ3-wayで反映。既存DesktopBridgeFailureのdiagnostic method/codeをDesktopBridgeErrorの継承で維持し、local timeout/closedを明示。競合解消を別コンテキストで点検し指摘なし。元フォルダのbuild/typecheck/関連検証を行う。
