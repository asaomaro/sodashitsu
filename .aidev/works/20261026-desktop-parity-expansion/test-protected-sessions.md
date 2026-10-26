# 7A: 昇格アプリ/UACの明示共有（実機検証待ち）

対象はログオン済みownerのactive console。7B signin、署名済みIDD配布、task8〜10を完了とはしない。実サービス更新・SYSTEM worker生成・実UAC/画面取得/入力は行わない。

## 実装と点検

- Local allowElevatedはInput/Unlock/Virtualと分離して保存し、変更時に既存共有をrevoke。専用lease purpose4〜7と旧1/2/3のrouteを検査。
- Installed exeにscope/epoch/native/handshake/workerを同梱。固定role/nonce CLIとSystem-only nonce別pipe、broker/self PID+start/owner/logon/sessionの固定scopeとACKを通してからconfigureを転送。
- Native process handleを明示保持し、source generation/nonce/client lifetimeを確認。cleanupはold generationで新workerを閉じず、pipe EOF→750ms graceful wait→job close→worker handle Dispose/null化。
- New WS protocol/caps/options/B local permission/helper actual protectedDesktopの積。A/B双方でmissing/unrequested proofをready/画像公開前に拒否。virtual/monitor/display併用、native/audio/file/clipboard/agentを拒否。
- SASはUI/A/B/worker/serviceで禁止。Hostの実SAS predicateをproductionとgenerated input試験で共有する。
- source changeの固定通知で終了し、画面/入力をclear。接続し直してhuman controlを再取得し、選択をlocalStorageへ保存しない。
- helper sourceの配置をフォルダー全体に訂正し、mandatory sourceが欠けていれば同梱commandを返さない。Program Filesの既存exeは自動更新しない。

## 検証の範囲

Windowsはhelper/broker compile-only、generated facts/scope/Process・fake input・実private pipe・自分のWinEvent markerに限定する。Native collectorのSYSTEM constructorや実workerは実行しない。Browserはgenerated pixelsとfake helperを使い、DOM/canvas・ブラウザ送受信WSを観測する。

関連123件と新browser4件（初回local-settings試験も成功）を確認。初回browser2件は保護画面では解像度操作の項目自体が非表示であるため、試験の期待をdisabledから不存在へ訂正した。製品側の禁止機能は維持。source固定後の全体結果と両端/CIは後段へ追記する。

review_transferがscope/private IPC/worker lifetime、review_pointerがNode/protocol/UIを独立点検。worker HandleのDispose指摘を修正し、shared guardのSAS試験・pipe EOF後のbounded teardownを追加。最終修正再点検を依頼する。

## 負例（各guardだけを変更し同じ試験でruntime失敗、元bytesへ復元）

NodeのA protocol、B permission、A/B actual ready proof、A/B SASを別々に外し、片側の防御で他方の試験が通ってしまわないようfake provider/relayやprivate handlerの注入で独立検査。C#はpurpose bit、SAS flag、Disposeを外してgenerated checksで検出。正例復元後123件とC# checksが成功。以下はUTF8・元改行の生出力。

### a-protocol

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-elevated-handshake

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (104 tests | 1 failed | 103 skipped) 1033ms
   × rejects protected sharing before desktop.start when protocol is missing 1031ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > rejects protected sharing before desktop.start when protocol is missing
AssertionError: expected 1 to be 3 // Object.is equality

- Expected
+ Received

- 3
+ 1

 ❯ src/desktop/DesktopRelay.test.ts:831:47


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.ts:831:3

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 103 skipped (104)
   Start at  01:29:10
   Duration  2.06s (tests 53%, transform 38%, import 9%)

```

### b-permission

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-elevated-handshake

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (104 tests | 1 failed | 103 skipped) 33ms
   × enforces the local elevated ceiling on direct provider RPC before opening a connection 31ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > enforces the local elevated ceiling on direct provider RPC before opening a connection
AssertionError: expected RpcError: 共有用の接続を開始できませんでした { …(1) } to match object { code: 'unauthorized' }
(1 matching property omitted from actual)

- Expected
+ Received

- {
-   "code": "unauthorized",
+ RpcError {
+   "code": "spawn_failed",
  }

 ❯ src/desktop/DesktopRelay.test.ts:851:143
    849| it("enforces the local elevated ceiling on direct provider RPC before …
    850|  const f=await protectedFixture({allowed:false});
    851|  await expect(f.provider.start("direct",{url:f.endpoint,ticket:"a".rep…
       |                                                                                                                                               ^
    852|  expect((f.provider as unknown as {active?:unknown}).active).toBeUndef…
    853| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 103 skipped (104)
   Start at  01:29:13
   Duration  962ms (transform 76%, import 20%, tests 4%)

```

### b-proof

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-elevated-handshake

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (104 tests | 2 failed | 102 skipped) 2067ms
   × provider independently refuses normal/legacy secure ready for elevated requests (secure=false) 1045ms
   × provider independently refuses normal/legacy secure ready for elevated requests (secure=true) 1021ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > provider independently refuses normal/legacy secure ready for elevated requests (secure=false)
 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > provider independently refuses normal/legacy secure ready for elevated requests (secure=true)
AssertionError: expected undefined to match object { code: 'service_incompatible' }

- Expected:
{
  "code": "service_incompatible",
}

+ Received:
undefined

 ❯ src/desktop/DesktopRelay.test.ts:867:80


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.ts:867:2

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 102 skipped (104)
   Start at  01:29:15
   Duration  3.17s (tests 67%, transform 27%, import 6%)

```

### a-proof

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-elevated-handshake

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (104 tests | 2 failed | 102 skipped) 146ms
   × relay independently refuses normal/legacy secure ready from a provider (secure=false) 89ms
   × relay independently refuses normal/legacy secure ready from a provider (secure=true) 55ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > relay independently refuses normal/legacy secure ready from a provider (secure=false)
 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > relay independently refuses normal/legacy secure ready from a provider (secure=true)
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopRelay.test.ts:879:119
    877|  cleanup.push(async()=>{socket?.terminate();mocked.mockRestore();});
    878|  const viewer=await f.viewer("protected");viewer.send(protectedStart);
    879|  await expect.poll(()=>viewer.ws.readyState).toBe(WebSocket.CLOSED);ex…
       |                                                                                                                       ^
    880| });
    881|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 102 skipped (104)
   Start at  01:29:19
   Duration  1.14s (transform 68%, import 18%, tests 14%)

```

### a-sas

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-elevated-handshake

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (104 tests | 2 failed | 102 skipped) 427ms
   × requires the actual elevated-default helper proof and keeps protected input human-only 258ms
   × requires the actual elevated-uac helper proof and keeps protected input human-only 167ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > requires the actual elevated-default helper proof and keeps protected input human-only
 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > requires the actual elevated-uac helper proof and keeps protected input human-only
AssertionError: expected [ 'sas', 'input' ] to not include 'sas'
 ❯ src/desktop/DesktopRelay.test.ts:814:21
    812|   await expect.poll(()=>viewer.messages.some(m=>m.type==="input_ack"&&…
    813|   expect(viewer.messages.some(m=>m.type==="agent_ticket")).toBe(false);
    814|   expect(fromA).not.toContain("sas");share.ws.off("message",observe);
       |                     ^
    815|   share.ws.emit("message",Buffer.from(JSON.stringify({type:"sas"})),fa…
    816|   expect(writes.mock.calls.map(([v])=>typeof v==="string"?JSON.parse(v…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 102 skipped (104)
   Start at  01:29:21
   Duration  1.56s (transform 56%, tests 29%, import 14%)

```

### b-sas

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-elevated-handshake

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (104 tests | 2 failed | 102 skipped) 431ms
   × requires the actual elevated-default helper proof and keeps protected input human-only 267ms
   × requires the actual elevated-uac helper proof and keeps protected input human-only 161ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > requires the actual elevated-default helper proof and keeps protected input human-only
 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > requires the actual elevated-uac helper proof and keeps protected input human-only
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopRelay.test.ts:816:102
    814|   expect(fromA).not.toContain("sas");share.ws.off("message",observe);
    815|   share.ws.emit("message",Buffer.from(JSON.stringify({type:"sas"})),fa…
    816|   expect(writes.mock.calls.map(([v])=>typeof v==="string"?JSON.parse(v…
       |                                                                                                      ^
    817|   await writeFile(f.endedMarker,"changed");
    818|   await expect.poll(()=>viewer.ws.readyState).toBe(WebSocket.CLOSED);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 102 skipped (104)
   Start at  01:29:23
   Duration  1.34s (transform 49%, tests 35%, import 16%)

```

### cleanup

```text
desktop_broker_purpose_checks_passed: unlock-only / virtual-only / both routes separated; no service/device creation or display/input changes
protected_broker_purpose_checks_passed: all fixed purpose bits/routes and legacy lease compatibility; no service/token/worker/input operations
"0" 個の引数を指定して "VerifyWorkerCleanup" を呼び出し中に例外が発生しました: "Current worker handle or scope was not released"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-elevated-handshake\scripts\remote-desktop\validate-protected-
worker.ps1:7 文字:1
+ [SodaDesktopUnlock]::VerifyWorkerCleanup()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 
```

### sas

```text
desktop_broker_purpose_checks_passed: unlock-only / virtual-only / both routes separated; no service/device creation or display/input changes
protected_broker_purpose_checks_passed: all fixed purpose bits/routes and legacy lease compatibility; no service/token/worker/input operations
protected_worker_cleanup_passed: stale generation cannot close current handles; matching teardown disposes once and clears scope; fake Process only
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Protected secure attention allowed"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-elevated-handshake\scripts\remote-desktop\validate-protected-
worker.ps1:8 文字:1
+ [SodaDesktopProtectedScopeChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 
```

### purpose

```text
desktop_broker_purpose_checks_passed: unlock-only / virtual-only / both routes separated; no service/device creation or display/input changes
"0" 個の引数を指定して "VerifyProtectedPurposes" を呼び出し中に例外が発生しました: "Unlock helper unavailable"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-elevated-handshake\scripts\remote-desktop\validate-protected-
worker.ps1:6 文字:1
+ [SodaDesktopUnlock]::VerifyProtectedPurposes()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 
```

## Generated Windows positive

```text
desktop_broker_purpose_checks_passed: unlock-only / virtual-only / both routes separated; no service/device creation or display/input changes
protected_broker_purpose_checks_passed: all fixed purpose bits/routes and legacy lease compatibility; no service/token/worker/input operations
protected_worker_cleanup_passed: stale generation cannot close current handles; matching teardown disposes once and clears scope; fake Process only
protected_host_boundaries_passed: queued frame discarded; key/mouse release and direct input blocked after transition; generated facts/input only
protected_output_gate_passed: generated frame blocked after scope transition while stdout gate was held
protected_scope_checks_passed: canonical v2 tuple/ack, modes/purpose, owner/logon/session/process/nonce, post-encode epoch, irreversible revocation, no keyup after scope loss; fake facts only
protected_handshake_checks_passed: same-tuple prefix before configure, legacy/wrong mode/bounds rejected, owner lifetime and silent worker deadline; generated identities + fake streams + actual private duplex pipes; no worker/service/capture/input
protected_worker_factory_passed: generated scope only; no service, worker spawn, token/desktop APIs, capture or input
```

## 最終のlegacy取消順序

前半のgraceを全workerへ適用せず、WorkerNonceを持つ完全scope v2だけに限定する。legacy RunSecureはowner/logon tupleを持たないため、既存のjob close→pipe closeを維持する。v2はpipe EOF→最大750ms→job close、待機例外でもjobを閉じ、両方でhandle Dispose/null/nonce clearを維持する。生成callbackで両順序を検証。scoped判定を常時trueに戻す負例が下記runtime assertionで失敗し、元bytes復元後に成功。

```text
desktop_broker_purpose_checks_passed: unlock-only / virtual-only / both routes separated; no service/device creation or display/input changes
protected_broker_purpose_checks_passed: all fixed purpose bits/routes and legacy lease compatibility; no service/token/worker/input operations
"0" 個の引数を指定して "VerifyWorkerCleanup" を呼び出し中に例外が発生しました: "Legacy teardown must remain job-first without grace"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-elevated-handshake\scripts\remote-desktop\validate-protected-
worker.ps1:7 文字:1
+ [SodaDesktopUnlock]::VerifyWorkerCleanup()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 
```

## 最終結果

- 前半はPR #223/13files、後半は本PR/22filesへ分割。backendの同一sourceを使用し、merge後のNode/protocol/UI sourceは2250e6b6から変更なし。最後のC#終了順序修正は7a2ff4ddd867b0517be00e2d1d9e647ae2a4975bで固定。
- 初回full79b4d19b: 772 suites / 11,562 tests成功（370.34秒）。legacy取消をv2に限定する修正が入ったため、改めて最終sourceでbuild/typecheck/fullを実行。
- 最終build / typecheck成功、772 suites / 11,562 tests成功（375.88秒）。関連123件とTUI専用設定2件も成功。
- 新protected/local settingsと既存unlock/input/virtual/monitor browser合計19件成功（1.8分）。最初のnew4件も成功。DOM/canvas alphaとブラウザ送受信を観測し、生成helperだけを使用。
- 別worktree /workspaces/sodashitsu-desktop-protected-checkで7a2ff4ddのfrozen install / build / smoke PASS。
- sr-pcは7a2ff4ddをTEMP archiveしhelper/broker compile-only、新worker/purpose/cleanup/ABI/Guard/実private pipeと既存helper/input/pipe/monitor、専用marker実配送に成功。exit0/timeout false。repoは5da512c8のまま、tracked status空。実サービスは更新していない。
- Windows CI: https://github.com/asaomaro/sodashitsu/actions/runs/40365169510 と https://github.com/asaomaro/sodashitsu/actions/runs/40366101783 成功。
- source非永続checkbox、A/B各permission/proof/SAS、TUIの独立許可、文書をreview_pointerが最終確認。C#IPC/handle/ABI、v2限定graceとlegacy job-first維持をreview_transferが修正再点検。追加must/shouldなし。
- backend/full/CI検証の重複を避け、Source更新が入った場合だけ関連検査/fullを再実行した。raw log部分の元改行/空白は保持。

7Aのコードを接続済み、既定permissionはoff。Bのサービス更新は管理者の手動操作で別途必要。実SYSTEM worker生成・実UAC/昇格画面取得/入力・実DesktopSwitchの統合動作は未確認。task7全体、7B、署名済みIDD配布とtask8〜10は完了ではない。
