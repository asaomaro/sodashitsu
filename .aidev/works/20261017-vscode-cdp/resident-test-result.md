# 登録済み共有元・常駐bridgeの検証

ユーザー承認: 初回の紐付け後、Sodaログイン済み画面の接続だけで共有を始め、毎回CLI/tokenを要求しない。Windows起動/終了・デバッグ接続口公開・本番auth設定・外部公開は変更しない。

## 実装

- 初回 --remember 明示、サーバregistryは限定device secretのSHA256のみを0600 atomic保存。clientはuser AppData profileへSoda origin/device資格/CDPendpoint/選択target/ローカル許可をatomic保存。Windows ACL保証/DPAPIには未対応、保存はユーザー領域ACLに依存することをREADMEへ明記。
- 保存資格resume→idle。Soda authenticatedviewerの一覧connectでshareUUID開始、各shareIdにframe/input/ACK/control/viewport/stopを束縛。stopped ACKまでbusy。CLI・ブラウザ再起動後も共有/操作/fitを自動再開しない。
- forgetは永続削除後close4403、offline資格も次resumeで4403。duplicate onlineは奪わず拒否。
- stopはcleanup promiseを共有し、再入もサイズ復元/キー解放/画面停止完了まで待つ。
- 接続/停止/解除でボタンがdisabled/unmountになってもnative面へfocusを保持する。

## 通過した検証

- root pnpm build /tmp/vscode-cdp-resident-build.log。server最終build /tmp/vscode-cdp-resident-server-final-build.log、web復元後build/typecheck /tmp/vscode-cdp-resident-restored-web-build.log。
- root pnpm typecheck /tmp/vscode-cdp-resident-typecheck.log、最終E2E typecheck /tmp/vscode-cdp-resident-final-e2e-typecheck.log。
- 対象68件（server21+capture/resident38+components9） /tmp/vscode-cdp-resident-final-unit.log。
- 実CLI＋実Chromium CDP＋実Soda app E2E: 初回register→共有stop→同CLIからbutton接続→browser reload→button接続→fit→Soda server restart→button接続→CLI停止→--profile only起動→button接続→forget、canvas画素とsource input保持を確認。positive /tmp/vscode-cdp-resident-focus-e2e.log 8.5s。
- 独立reviewはresident-review.md。P1 cleanup再入barrierとP2 offline失効retryは修正・独立再確認済。
- devlauncher --state-root の別port17948復元試験: sameToken=true/sameTab=true/login204 /tmp/vscode-cdp-dev-reuse-check.log。
- Windowsコピー3ファイルsource一致、Windows Node --check全0。OS起動設定/VSCode操作/既存AppDataへの資格登録は実行していない。
- smoke PASS /tmp/vscode-cdp-resident-smoke.log。同時実行時に既存processInspectorの2s timeoutログあり、smoke結果自体は通過。

## 初回E2E失敗

/tmp/vscode-cdp-resident-first-e2e.log: 90秒timeout。原因は接続buttonがdisabledになりfocusがbodyへ落ち、direct appのguardが離脱して操作するbuttonもdisabled化。surface.focusをexplicit connect/stop/forget/inviteに追加して修正。待機timeoutを伸ばして隠さず、toBeEnabled assertionを追加。テストの子process終了待ちにも3秒後SIGKILL fallbackを追加（テスト所有だけ）。

## 修正前negative（生出力）

### resident shareId guard

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-vscode-cdp

 ❯ |scripts| vscode-cdp-resident.test.ts (7 tests | 1 failed | 6 skipped) 10ms
   × waits for registration persistence before capture and scopes every input and frame to the active share 9ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |scripts| vscode-cdp-resident.test.ts > waits for registration persistence before capture and scopes every input and frame to the active share
AssertionError: expected [ 'save', 'connect', 'start', …(4) ] to deeply equal [ 'save', 'connect', 'start', …(4) ]

- Expected
+ Received

  [
    "save",
    "connect",
    "start",
    "control:true",
-   "input:correct",
-   "ack:1",
-   "viewport:900",
+   "input:wrong",
+   "ack:9",
+   "viewport:999",
+   "cleanup-began",
+   "cleanup-done",
+   "cdp-close",
  ]

 ❯ vscode-cdp-resident.test.ts:63:19
     61|   h.session.message({type:'viewport',shareId:share,size:{width:900}});
     62|   h.captures[0].options.frame({type:'frame',seq:1});
     63|   expect(h.calls).toEqual(['save','connect','start','control:true','in…
       |                   ^
     64|   expect(h.sent).toEqual([{type:'frame',seq:1,shareId:share}]);await h…
     65| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  16:21:29
   Duration  193ms (transform 66%, import 19%, tests 10%, worker 5%)


```

### stop cleanup barrier

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-vscode-cdp

 ❯ |scripts| vscode-cdp-resident.test.ts (12 tests | 1 failed | 11 skipped) 15ms
   × waits for real capture cleanup before resident stop acknowledgement or CDP close after an internal stop 14ms
 ❯ |scripts| vscode-cdp.test.ts (26 tests | 2 failed | 24 skipped) 13ms
   × waits for the same cleanup when stop reenters during release 9ms
   × waits for the same cleanup when stop reenters during clear 3ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |scripts| vscode-cdp-resident.test.ts > waits for real capture cleanup before resident stop acknowledgement or CDP close after an internal stop
AssertionError: expected [ 'clear-began', 'cdp-close', …(1) ] to deeply equal [ 'clear-began' ]

- Expected
+ Received

  [
    "clear-began",
+   "cdp-close",
+   "stopped",
+   "clear-done",
+   "screencast-stop",
  ]

 ❯ vscode-cdp-resident.test.ts:155:36
    153|   await capture.setViewport({width:900,height:600});events.length=0;
    154|   const internal=capture.stop();await clearing.promise;session.message…
    155|   try {await tick();expect(events).toEqual(['clear-began']);}
       |                                    ^
    156|   finally {gate.resolve();await internal;await tick();await session.sh…
    157|   expect(events).toEqual(['clear-began','clear-done','screencast-stop'…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  |scripts| vscode-cdp.test.ts > waits for the same cleanup when stop reenters during release
 FAIL  |scripts| vscode-cdp.test.ts > waits for the same cleanup when stop reenters during clear
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ vscode-cdp.test.ts:509:77
    507|   const first=capture.stop();await began.promise;
    508|   let secondDone=false;const second=capture.stop().then(()=>{secondDon…
    509|   try {await new Promise(resolve=>setTimeout(resolve,0));expect(second…
       |                                                                             ^
    510|   finally {gate.resolve();await Promise.all([first,second]);}
    511|   expect(calls.at(-1)?.method).toBe('Page.stopScreencast');

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯


 Test Files  2 failed (2)
      Tests  3 failed | 35 skipped (38)
   Start at  16:23:46
   Duration  370ms (transform 60%, import 21%, tests 16%, worker 3%)


```

### offline forget

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-vscode-cdp

 ❯ |@sodashitsu/server| src/desktop/DesktopCdpRelay.test.ts (18 tests | 1 failed | 17 skipped) 258ms
   × returns permanent revocation for an offline forgotten device, unlike a duplicate live device 256ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopCdpRelay.test.ts > returns permanent revocation for an offline forgotten device, unlike a duplicate live device
AssertionError: expected 1008 to be 4403 // Object.is equality

- Expected
+ Received

- 4403
+ 1008

 ❯ src/desktop/DesktopCdpRelay.test.ts:316:31
    314|   const retry=await f.connect('bridge'),rejected=once(retry.ws,'close'…
    315|   retry.send({type:'resume',deviceId:registered.deviceId,secret:regist…
    316|   expect((await rejected)[0]).toBe(4403);
       |                               ^
    317| });
    318|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 17 skipped (18)
   Start at  16:23:19
   Duration  1.06s (transform 55%, tests 27%, import 18%)


```

### UI connect focus

```text

Running 1 test using 1 worker

(node:374534) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-17T07:27:39.839Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T07:27:39.839Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T07:27:39.840Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-FhJBZx/commands.json","count":0}
{"ts":"2026-10-17T07:27:40.313Z","level":"info","msg":"display script enabled","byClientId":"260e81fe-0e49-4e17-980f-34a94cfaa386","byKind":"desktop"}
{"ts":"2026-10-17T07:27:41.039Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T07:27:41.039Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T07:27:41.040Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-FhJBZx/commands.json","count":0}
{"ts":"2026-10-17T07:27:41.358Z","level":"info","msg":"agent resume skipped","paneId":"8f674638-d361-4a1b-bb8c-118a74c7b80b","reason":"no-session-ref"}
{"ts":"2026-10-17T07:27:41.394Z","level":"info","msg":"extension started","extension":"user:vscode-desktop","run":"a0339eee-6f32-4983-a872-5037ca2a3628","state":"running"}
{"ts":"2026-10-17T07:27:41.836Z","level":"info","msg":"display set","paneId":"bccce74f-f65b-4ff7-8e4f-6eedb257bf9e","name":"vscode-desktop","kind":"panel","format":"script-html","bytes":362,"rev":1}
{"ts":"2026-10-17T07:27:48.982Z","level":"info","msg":"display closed","paneId":"bccce74f-f65b-4ff7-8e4f-6eedb257bf9e","name":"vscode-desktop","reason":"closed"}
  ✘  1 src/specs/vscode-cdp-resident.spec.ts:12:1 › registered Windows bridge stays resident across stop, reload and server restart (9.6s)


  1) src/specs/vscode-cdp-resident.spec.ts:12:1 › registered Windows bridge stays resident across stop, reload and server restart 

    Error: expect(locator).toBeEnabled() failed

    Locator:  locator('[data-plugin-view] [data-desktop-cdp]').getByRole('button', { name: '操作する', exact: true })
    Expected: enabled
    Received: disabled
    Timeout:  5000ms

    Call log:
      - Expect "toBeEnabled" locator('[data-plugin-view] [data-desktop-cdp]').getByRole('button', { name: '操作する', exact: true }) with timeout 5000ms
      - waiting for locator('[data-plugin-view] [data-desktop-cdp]').getByRole('button', { name: '操作する', exact: true })
        14 × locator resolved to <button disabled data-v-c0fad06b="">操作する</button>
           - unexpected value "disabled"


      114 |     await expect(view.getByRole("status")).toHaveText("共有元が接続されていません");
      115 |     await attach();
    > 116 |     await expect(view.getByRole("button", { name: "操作する", exact: true })).toBeEnabled();
          |                                                                           ^
      117 |     await view.getByRole("button", { name: "操作する", exact: true }).click();
      118 |     await view.getByRole("checkbox", { name: "表示領域に合わせる", exact: true }).check();
      119 |     await expect.poll(() => source.evaluate(() => innerWidth)).not.toBe(800);
        at /workspaces/sodashitsu-vscode-cdp/packages/e2e/src/specs/vscode-cdp-resident.spec.ts:116:75

    Error Context: ../../../../tmp/vscode-cdp-resident-ui-negative-results/vscode-cdp-resident-regist-5f381-p-reload-and-server-restart/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    ../../../../tmp/vscode-cdp-resident-ui-negative-results/vscode-cdp-resident-regist-5f381-p-reload-and-server-restart/trace.zip
    Usage:

        pnpm exec playwright show-trace ../../../../tmp/vscode-cdp-resident-ui-negative-results/vscode-cdp-resident-regist-5f381-p-reload-and-server-restart/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/vscode-cdp-resident.spec.ts:12:1 › registered Windows bridge stays resident across stop, reload and server restart 
undefined
/workspaces/sodashitsu-vscode-cdp/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test vscode-cdp-resident.spec.ts --output /tmp/vscode-cdp-resident-ui-negative-results

```

各修正箇所のみ戻して対象試験が失敗することを確認。保存byte列完全一致へ復元し、UIは再buildした。

## 最終まとめ・検証サーバー反映

- 最終まとめE2Eは15/16件通過（3.3m） /tmp/vscode-cdp-resident-final-e2e.log。既存app-view-direct Aだけ30s timeout（iframe内button待ち）。同時実行したsmokeにも既存processInspector2s timeoutログが複数あったがsmokeはPASS。
- 該当Aだけを単独再実行し1件PASS（8.4s） /tmp/vscode-cdp-resident-recheck-app2.log。最初のrecheck-app.logはgrep先頭anchor不一致のNo tests foundであり試験として数えない。実装/テスト内容の変更やtimeout延長で隠していない。まとめ15件＋該当1件単独合格の組み合わせで全16件を確認（同一実行で16件全PASSとは区別する）。
- 新resident E2Eはまとめ9.4sで通過、旧CDP実画像/入力/fit/wheelとmobile隔離も通過。
- Windows temporary folderへbridge3ファイルをsource byte一致更新。Windows Node --checkは3件とも0。初回本物Windows登録/共有は利用者操作待ちで、こちらからAppData資格保存や対象VSCode開始終了は行っていない。
- 検証用17883のown launcher PID62368をcmdline/cwd/state照合の後SIGTERM。--state-root /tmp/soda-cdp-live-rqEGSDで再起動しsameToken=true/sameTab=trueを確認。現在PID408537/session73390。最新asset index-Cv5iqc4E.jsはHTTP200/dist一致。ログイン情報・既存アプリタブ保持、Windows login-url更新済。
- 独立レビュー最終通過、resident-review.md参照。

明示CLI停止後にchild.signalCodeがSIGKILLでないことをassertし、テストcleanup fallbackが正常停止の失敗を隠さないよう追加。resident E2Eを再実行して13.1s PASS（/tmp/vscode-cdp-resident-graceful.log）、当該1行の独立再レビューも通過。実装変更なし。
