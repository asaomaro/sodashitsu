# 専用signin bridge/connector 検証

Base mainac32198397d7c86bc5139faf8e4837dc42f86f2c。専用SYSTEM hostへのentry/mainやWinlogon workerはまだ接続せず、本差分で実サービス/実画面/入力/実鍵/信頼登録を実行しない。Rootへの実socketは生成enrollmentのloopbackだけ、TLS fixtureは一時的な未信頼証明書でtrustを変更しない。

- 関連117件成功（新規36、既存dispatch43/identity38）、source負例の元bytes復元後36件成功。server build/typecheck成功。Agent.protocolというtestの型参照はinstance検査へ直した。
- taskcheckでbudget callback内同期abort後送信、timer前の遅延pong/messageによる45秒期限復活、socket生成中取消後のCONNECTING error未捕捉、host callback中期限到達を指摘。5つの回帰caseが修正前に狙ったAssertionErrorになるのを確認してから修正。最終cleanup時の二重terminateも既存3caseが検出し、attempt固有の終了latchへ修正。117件成功後の全体crossはmust/shouldなし。
- 実WebSocket loopback delegation/RPC、生成未信頼TLSのupgrade前拒否、実CONNECTING socket取消を検証。handshake5秒/PONG45秒をcallback順序に依存せず検査し、Agent/attempt/channelを回収する。
- 7製品source負例（header cap/ID再利用/同時channel cap/budget同期取消/pong期限/handshake期限/TLS検証）はexit1/意図したAssertionErrorで、timeout/unhandled errorではない。各回finallyで元bytesを復元・同一確認。
- Node/WSS再接続はold channelを同期失効し新transportだけ再開。入力/画面許可は再送しない。main/bundle/sealed viewer/worker/controller/installer/UIは後続で7B全体は未完了。

## 修正前回帰とsource負例の生ログ抜粋

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninBridge.test.ts > never sends after synchronous abort inside the send-budget callback
AssertionError: expected "vi.fn()" to be called 2 times, but got 3 times
 ❯ src/desktop/DesktopSigninBridge.test.ts:69:71
     67|   const bridge=new DesktopSigninBridge({accept:value=>{connection=valu…
     68|   bridge.receive(frame(F.OPEN,1));expect(send).toHaveBeenCalledTimes(2…
     69|   expect(()=>connection.sendText("generated")).toThrow();expect(send).…
       |                                                                       ^
     70| });
     71|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninConnector.test.ts > does not revive a 45-second expired connection when pong precedes its timer
 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninConnector.test.ts > does not revive a 45-second expired connection when message precedes its timer
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/desktop/DesktopSigninConnector.test.ts:41:37
     39|   f.clock(45000);
     40|   if(mode==="pong")s.emit("pong");else s.message(frame(F.TEXT,1,encode…
     41|   await flush();expect(s.terminate).toHaveBeenCalledOnce();expect(f.h.…
       |                                     ^
     42| });
     43| it("pings and reconnects with fresh owners without replaying an old re…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯
```

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninConnector.test.ts > rechecks freshness after returning from the host callback
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/desktop/DesktopSigninConnector.test.ts:112:130
    110| });
    111| it("rechecks freshness after returning from the host callback",()=>{
    112|   vi.useFakeTimers();const f=fixture(),s=f.sockets[0]!;s.open();f.onCh…
       |                                                                                                                                  ^
    113| });
    114| it("installs error handling before aborting a real CONNECTING websocke…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninConnector.test.ts > installs error handling before aborting a real CONNECTING websocket
AssertionError: expected 0 to be greater than 0
 ❯ src/desktop/DesktopSigninConnector.test.ts:118:46


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯
```

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninBridge.test.ts > rejects oversize-text and revokes existing channels
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/desktop/DesktopSigninBridge.test.ts:41:41
     39|     default:throw new Error("fixture");
     40|   }
     41|   f.bridge.receive(bytes);expect(f.end).toHaveBeenCalledOnce();expect(…
       |                                         ^
     42|   const count=f.sent.length;f.open(100);expect(f.sent).toHaveLength(co…
     43| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninBridge.test.ts > never sends after synchronous abort inside the send-budget callback
AssertionError: expected "vi.fn()" to be called 2 times, but got 3 times
 ❯ src/desktop/DesktopSigninBridge.test.ts:69:71
     67|   const bridge=new DesktopSigninBridge({accept:value=>{connection=valu…
     68|   bridge.receive(frame(F.OPEN,1));expect(send).toHaveBeenCalledTimes(2…
     69|   expect(()=>connection.sendText("generated")).toThrow();expect(send).…
       |                                                                       ^
     70| });
     71|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninBridge.test.ts > bounds simultaneous channels and total channel IDs without retaining closed IDs
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/desktop/DesktopSigninBridge.test.ts:45:121
     43| });
     44| it("bounds simultaneous channels and total channel IDs without retaini…
     45|   const f=fixture();for(let id=1;id<=16;id++)f.open(id);expect(f.conne…
       |                                                                                                                         ^
     46|   const g=fixture();for(let id=1;id<=1000;id++){g.open(id);g.connectio…
     47| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninBridge.test.ts > rejects reused-id and revokes existing channels
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/desktop/DesktopSigninBridge.test.ts:41:41
     39|     default:throw new Error("fixture");
     40|   }
     41|   f.bridge.receive(bytes);expect(f.end).toHaveBeenCalledOnce();expect(…
       |                                         ^
     42|   const count=f.sent.length;f.open(100);expect(f.sent).toHaveLength(co…
     43| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninConnector.test.ts > rejects late open before the handshake timeout callback and times out a stalled socket
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/desktop/DesktopSigninConnector.test.ts:90:107
     88| });
     89| it("rejects late open before the handshake timeout callback and times …
     90|   vi.useFakeTimers();const f=fixture();f.clock(5000);f.sockets[0]!.ope…
       |                                                                                                           ^
     91|   const g=fixture();await vi.advanceTimersByTimeAsync(5000);expect(g.s…
     92| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninConnector.test.ts > does not revive a 45-second expired connection when pong precedes its timer
 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninConnector.test.ts > does not revive a 45-second expired connection when message precedes its timer
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/desktop/DesktopSigninConnector.test.ts:43:37
     41|   f.clock(45000);
     42|   if(mode==="pong")s.emit("pong");else s.message(frame(F.TEXT,1,encode…
     43|   await flush();expect(s.terminate).toHaveBeenCalledOnce();expect(f.h.…
       |                                     ^
     44| });
     45| it("pings and reconnects with fresh owners without replaying an old re…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯
```

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopSigninConnector.test.ts > rejects an untrusted TLS certificate before sending delegation credentials
AssertionError: expected 'opened' to be 'rejected' // Object.is equality

Expected: "rejected"
Received: "opened"

 ❯ src/desktop/DesktopSigninConnector.test.ts:108:25


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```


## 最終結果

製品head db0a422878ac5b1d853b268a3a39d6cd53b5f418。source全体12182件/816files単一PASS369.45s、root全体12244件/824files単一PASS351.22s。source/rootのbuild/typecheck成功。両suiteは同時実行せず順番に実行。独立check同headのfrozen install/build/smoke/関連36件成功、clean。taskcheck/crossと各修正差分再点検はmust/shouldなし。新UIなし、Windows helper入口変更なしでこの差分のE2E/Windows CIを追加実行したとは主張しない。

7新filesは全件事前bytes guardでrootへ反映、source同一を確認した。後続doc更新も事前bytes guardで反映する。通常server経路ではまだ生成/呼出しせず、service更新・handoffはしない。main/bundle、sealed viewer、Winlogon worker/controller/installer/UIは後続。
