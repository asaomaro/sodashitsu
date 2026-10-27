# 暗号化した人操作の製品経路: 検証

対象source cca7bd2a。既存dirty rootではなく独立worktreeで検証。build/typecheck通過。生成画像・生成tone・仮想mic/render・private tempファイル・memory clipboardのみ。

ブラウザ6件: actual pairing/指紋違い拒否・helper未起動/PNG canvas/生CtrlSpace/文字送信/再接続/非抽出鍵/LS部分喪失/失効、WSSとUDPのH264+Opus/明示音声再生/仮想マイクPCM到達・停止/ファイル120000byte往復/HTML clipboard往復、quality autosave、private backplane、wire反復rekey。公開WSのtext/binaryに入力・画像・転送本文やprivate ticketが出ないことを検査。

Service/管理RPC関連13件。負例4件は修正箇所だけ戻すと各回帰が失敗、finallyで元sourceとbyte一致を確認。保存完了回帰の初版はstore.settled()取得が保存開始前と競合して負例が通ったため採用せず、originalSaveの完了を通知するdurable gateへ改めて失敗を確認した。

ブラウザ負例は独立check worktreeでIDBのrequired判定だけ除きwebを再buildし、LS部分喪失後の閲覧中期待が終了になって失敗。sourceをbyte一致で復元しwebを再build、同一試験を再実行。

## 修正前コードの生出力


### status-completion

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-session

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointService.test.ts (10 tests | 1 failed | 9 skipped) 98ms
   × invalidates an old status snapshot that finishes after durable policy enable 97ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointService.test.ts > invalidates an old status snapshot that finishes after durable policy enable
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopEndpointService.test.ts:72:163


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  16:47:48
   Duration  1.14s (transform 73%, import 17%, tests 9%)


```

### missing-vault

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-session

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointService.test.ts (10 tests | 1 failed | 9 skipped) 79ms
   × fails closed when a previously initialized directory survives missing vault and marker 78ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointService.test.ts > fails closed when a previously initialized directory survives missing vault and marker
AssertionError: expected { available: true, …(3) } to match object { available: false, …(2) }
(1 matching property omitted from actual)

- Expected
+ Received

  {
-   "available": false,
+   "available": true,
    "initialized": false,
-   "required": true,
+   "required": false,
  }

 ❯ src/desktop/DesktopEndpointService.test.ts:33:56


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  16:47:50
   Duration  1.14s (transform 70%, import 22%, tests 7%)


```

### pending-policy

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-session

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointService.test.ts (10 tests | 1 failed | 9 skipped) 95ms
   × does not let a concurrent status read reopen plaintext before policy persistence starts 94ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointService.test.ts > does not let a concurrent status read reopen plaintext before policy persistence starts
AssertionError: expected { available: true, …(4) } to match object { required: true }
(4 matching properties omitted from actual)

- Expected
+ Received

  {
-   "required": true,
+   "required": false,
  }

 ❯ src/desktop/DesktopEndpointService.test.ts:37:100


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  16:47:52
   Duration  1.08s (transform 72%, import 18%, tests 10%)


```

### late-initialize

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-e2e-session

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointService.test.ts (10 tests | 1 failed | 9 skipped) 44ms
   × does not admit a delayed initialization after suspend and rollback changed the owner epoch 43ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointService.test.ts > does not admit a delayed initialization after suspend and rollback changed the owner epoch
AssertionError: expected "initialize" to not be called at all, but actually been called 1 times

Received:

  1st initialize call:

    Array []


Number of calls: 1

 ❯ src/desktop/DesktopEndpointService.test.ts:57:181


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  16:47:54
   Duration  1.16s (transform 76%, import 20%, tests 4%)


```

### Browser downgrade

```text

Running 1 test using 1 worker

(node:2450743) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-27T07:54:11.983Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T07:54:11.984Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T07:54:11.984Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T07:54:11.991Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-CVfgVg/commands.json","count":0}
{"ts":"2026-10-27T07:54:12.737Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T07:54:12.737Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T07:54:12.738Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T07:54:12.740Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-NTqH9p/commands.json","count":0}
{"ts":"2026-10-27T07:54:23.987Z","level":"info","msg":"machine link closed","machine":"5b95aab3502750abf08229021b09d532","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-encrypted.spec.ts:11:1 › product pairing encrypts dedicated image and raw input, persists keys and revokes B ownership (13.4s)


  1) src/specs/remote-desktop-encrypted.spec.ts:11:1 › product pairing encrypts dedicated image and raw input, persists keys and revokes B ownership 

    Error: expect(locator).toHaveText(expected) failed

    Locator:  locator('[data-desktop-status]')
    Expected: "閲覧中"
    Received: "終了"
    Timeout:  5000ms

    Call log:
      - Expect "toHaveText" locator('[data-desktop-status]') with timeout 5000ms
      - waiting for locator('[data-desktop-status]')
        14 × locator resolved to <span data-v-272cacfb="" data-desktop-status="">終了</span>
           - unexpected value "終了"


      176 |     await closeNativeTab(page);
      177 |     await openNativeTab(page, "desktop", header);
    > 178 |     await expect(page.locator("[data-desktop-status]")).toHaveText("閲覧中");
          |                                                         ^
      179 |     await expect(page.locator("[data-remote-desktop] [data-endpoint-encrypted]")).toHaveCount(1);
      180 |     expect(connections.slice(beforeReopen).some((url) => url.endsWith("/desktop-share"))).toBe(
      181 |       false,
        at /workspaces/sodashitsu-desktop-e2e-session-check/packages/e2e/src/specs/remote-desktop-encrypted.spec.ts:178:57

    Error Context: test-results/remote-desktop-encrypted-p-a3c17-eys-and-revokes-B-ownership/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-encrypted-p-a3c17-eys-and-revokes-B-ownership/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-encrypted-p-a3c17-eys-and-revokes-B-ownership/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-encrypted.spec.ts:11:1 › product pairing encrypts dedicated image and raw input, persists keys and revokes B ownership 
undefined
/workspaces/sodashitsu-desktop-e2e-session-check/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-encrypted.spec.ts --grep product pairing encrypts dedicated

```

## Final positive results


### Build

```text
packages/web build: computing gzip size...
packages/web build: dist/index.html                                0.82 kB │ gzip:   0.52 kB
packages/web build: dist/assets/microphoneWorklet-VenRQAVr.js      1.33 kB
packages/web build: dist/assets/index-BzPD1nKO.css               191.98 kB │ gzip:  30.14 kB
packages/web build: dist/assets/index-DcntwDLr.js              1,969.23 kB │ gzip: 594.26 kB
packages/web build: [plugin builtin:vite-reporter] 
packages/web build: (!) Some chunks are larger than 500 kB after minification. Consider:
packages/web build: - Using dynamic import() to code-split the application
packages/web build: - Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
packages/web build: - Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
packages/web build: ✓ built in 2.35s
packages/web build: Done
packages/server build$ tsc -b
packages/server build: Done
packages/cli build$ tsc -b
packages/cli build: Done

```

### Typecheck

```text

Scope: 7 of 8 workspace projects
packages/protocol typecheck$ tsc --noEmit -p tsconfig.typecheck.json
packages/protocol typecheck: Done
packages/client-core typecheck$ tsc --noEmit -p tsconfig.typecheck.json
packages/client-core typecheck: Done
packages/tui typecheck$ tsc --noEmit -p tsconfig.typecheck.json
packages/web typecheck$ vue-tsc --noEmit -p tsconfig.typecheck.json
packages/tui typecheck: Done
packages/web typecheck: Done
packages/server typecheck$ tsc --noEmit -p tsconfig.typecheck.json
packages/server typecheck: Done
packages/cli typecheck$ tsc --noEmit -p tsconfig.typecheck.json
packages/e2e typecheck$ tsc --noEmit -p tsconfig.typecheck.json
packages/cli typecheck: Done
packages/e2e typecheck: Done

```

### Full suite

```text
    at file:///workspaces/sodashitsu-desktop-e2e-session/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-e2e-session/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-e2e-session/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-e2e-session/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)

 Test Files  787 passed (787)
      Tests  11753 passed (11753)
   Start at  16:49:05
   Duration  389.01s (tests 80%, import 11%, environment 5%, transform 4%)

Environment  |@sodashitsu/web| happy-dom was created 227 times · 69.78s total, 29% of tracked time
             create it once per worker with pool: 'vmThreads' (keeps per-file isolation) or isolate: false (shares it across files)
             learn more: https://vitest.dev/guide/improving-performance#test-environments


```

### Browser lanes

```text
{"ts":"2026-10-27T07:50:51.692Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T07:50:51.693Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-IuZU2e/commands.json","count":0}
{"ts":"2026-10-27T07:51:00.886Z","level":"info","msg":"machine link closed","machine":"f8793254f1cc1ba6ef6ff85af378e211","kind":"transient","reason":"接続が切れました"}
  ✓  5 src/specs/remote-desktop-encrypted.spec.ts:231:3 › encrypted product children carry generated video/audio, microphone and files: udp (10.5s)
{"ts":"2026-10-27T07:51:01.545Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T07:51:01.546Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T07:51:01.546Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T07:51:01.556Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-0AowQz/commands.json","count":0}
{"ts":"2026-10-27T07:51:02.215Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T07:51:02.215Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T07:51:02.215Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T07:51:02.216Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-k91zfs/commands.json","count":0}
{"ts":"2026-10-27T07:51:10.144Z","level":"info","msg":"machine link closed","machine":"34e517896e91bb49521306921ef9f683","kind":"transient","reason":"接続が切れました"}
  ✓  6 src/specs/remote-desktop-quality-memory.spec.ts:5:1 › quality drafts survive browser reload without Apply, including codec, route, rate and fit (9.2s)

  6 passed (44.0s)

```

### Independent smoke

```text
smoke: client.hello ok
smoke: workspace.create ok (pane f685b791-2b7e-4e83-8158-aebbabad0138)
smoke: pane.subscribe ok
smoke: echo round trip ok
{"ts":"2026-10-27T07:53:16.314Z","level":"info","msg":"custom command run","commandId":"smoke-cat","type":"popup","clientId":"d66bd69e-6674-41f4-8919-2b99df80fce1","paneId":"f685b791-2b7e-4e83-8158-aebbabad0138"}
smoke: custom command popup round trip ok
smoke(web): auto-login (#token) → connect → pane 表示 ok
smoke(web): 端末の描画用 canvas が画面内にある（xterm.css 有効。D96）
smoke(web): tab title ok ("my-notePC: smoke"。H14/AC4）
smoke(web): typed into pane f685b791-2b7e-4e83-8158-aebbabad0138
smoke(web): echo round trip ok（ブラウザでの入力が PTY まで届いた）
smoke(web): 初めてのブラウザで、はじめの案内が端末の表示のあとに開き、見出しにフォーカスがある
smoke(web): Esc で閉じると端末へフォーカスが戻り、案内済みだけが保存される
smoke(web): 開き直しても、はじめの案内は出ない
smoke(web): はじめの案内を閉じたあと、クリックせずに打った文字が PTY まで届いた
smoke: PASS

```

### Restored browser control

```text
Running 1 test using 1 worker

(node:2468755) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-27T07:55:54.800Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T07:55:54.802Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T07:55:54.802Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T07:55:54.810Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-MAlKWG/commands.json","count":0}
{"ts":"2026-10-27T07:55:55.283Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T07:55:55.284Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T07:55:55.284Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T07:55:55.285Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-WnN0nw/commands.json","count":0}
{"ts":"2026-10-27T07:56:00.481Z","level":"info","msg":"machine link closed","machine":"79c51a7c7e176e8436631a3042346bbe","kind":"transient","reason":"接続が切れました"}
  ✓  1 src/specs/remote-desktop-encrypted.spec.ts:11:1 › product pairing encrypts dedicated image and raw input, persists keys and revokes B ownership (6.5s)

  1 passed (8.8s)

```

## main統合と両端反映（2026-10-27）

PR #237 main f05e6ce38f88aef961efcb44dbf912b303ca5435。rootの既存ローカル変更を3wayで保持し、衝突解消を独立2件で再読。root build/typecheck/smoke/browser4件通過。全体11813pass/11815中2件timeoutは無関係な画面試験で、個別25件が再実行で通過。B build/helper生成/DPAPI生成試験後、B→A順でhandoff。実endpoint鍵は作成せず、必須設定も変更していない。

```text
{"id":"f933a0dd-1910-448a-b54e-2341847a35b6","status":"exited","stdout":"endpoint_key_generated_checks_passed\r\nendpoint_acl_generated_checks_passed\r\nendpoint_vault_committed\r\nendpoint_commit_generated_checks_passed\r\n","stderr":"","stdoutTruncated":false,"stderrTruncated":false,"exitCode":0,"signal":null,"timedOut":false,"cancelled":false}
{"videoLanesBuilt":true,"services":[{"Name":"SodaDesktopUnlock-68F6FB663A79FE16","Status":4}],"head":"f05e6ce38f88aef961efcb44dbf912b303ca5435","audioDistTime":"2026-10-27T07:59:44.5592860Z","richBuilt":true,"richSourceHash":"4A1E886445A2A813F06A4B6D754A9F81176EDB40A6263F8D6513E7A0320BD958","audioBuilt":true,"native60Built":true,"recoveryBuilt":true,"endpointServiceBuilt":true,"sharedAudioBuilt":true,"inputAcksBuilt":true,"audioSourceTime":"2026-10-27T03:27:16.3904652Z","endpointVault":false,"endpointRequiredMarker":false,"audioSourceHash":"F5DBE89EBE58EC5E4BE14750B7A8AE263A778C5734B341C9C7925E702386DC0F","videoLaneHash":"E0F69A178E5F992F160F13EB6A9F95B4C34EEC4818F954DC516C8179C576E03D","status":{},"filesBuilt":true,"audioPacketBuilt":true,"nativePlatformBuilt":true,"handoff":[{"ts":"2026-10-27T08:01:43.889Z","msg":"handoff: requested; running preflight"},{"ts":"2026-10-27T08:01:46.377Z","msg":"handoff: replacing this server with the version on disk"},{"ts":"2026-10-27T08:01:48.499Z","msg":"handoff: complete"}],"sharedRateBuilt":true,"endpointRelayBuilt":true}

exitCode 0
stderr 
soda: handing off 7 pane(s) of pid 21406 to the soda on disk…
soda: handoff complete: 7 pane(s) kept running

```
