# Native shared desktop checks

## Source negatives

### member-floor

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-native-sharing

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts (56 tests | 1 failed | 55 skipped) 16ms
   × maps native capture input evidence to each viewer across exclusive handover 15ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > maps native capture input evidence to each viewer across exclusive handover
AssertionError: expected 1 to be 7 // Object.is equality

- Expected
+ Received

- 7
+ 1

 ❯ src/desktop/DesktopSharedCapture.test.ts:351:49
    349|   await vi.waitFor(()=>expect(a.messages.at(-1)).toEqual({type:"input_…
    350|   f.child.send(native(2,1));await vi.waitFor(()=>expect(b.messages.at(…
    351|   expect(a.messages.at(-1).info.sourceInputSeq).toBe(7);expect(b.messa…
       |                                                 ^
    352|   a.send({type:"ack",seq:2});b.send({type:"ack",seq:2});a.session.requ…
    353|   b.send({type:"input",seq:3,input:{kind:"key",code:"KeyA",down:false}…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 55 skipped (56)
   Start at  20:51:53
   Duration  1.09s (transform 79%, import 20%, tests 2%)


```

### idle-owner-ack

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-native-sharing

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts (56 tests | 1 failed | 55 skipped) 16ms
   × routes native idle only to viewers who acknowledged that exact image and forwards source invalidation 15ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > routes native idle only to viewers who acknowledged that exact image and forwards source invalidation
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopSharedCapture.test.ts:364:132
    362|   await vi.waitFor(()=>expect(b.messages).toHaveLength(2));b.send({typ…
    363|   f.child.send({type:"platform_idle",backend:"linux-portal",seq:1,coun…
    364|   await vi.waitFor(()=>expect(b.messages.at(-1)?.type).toBe("platform_…
       |                                                                                                                                    ^
    365|   f.child.send({type:"platform_failure",backend:"linux-portal",code:"s…
    366|   await vi.waitFor(()=>expect(a.session.exitCode).toBe(0));expect(b.se…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 55 skipped (56)
   Start at  20:51:55
   Duration  1.10s (transform 78%, import 20%, tests 2%)


```

### startup-cause

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-native-sharing

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts (56 tests | 2 failed | 54 skipped) 13ms
   × preserves typed linux-portal startup permission failure for every configured member 10ms
   × preserves typed macos-sck startup permission failure for every configured member 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > preserves typed linux-portal startup permission failure for every configured member
AssertionError: expected [] to deeply equal [ { type: 'platform_failure', …(2) } ]

- Expected
+ Received

- [
-   {
-     "backend": "linux-portal",
-     "code": "permission_cancelled",
-     "type": "platform_failure",
-   },
- ]
+ []

 ❯ src/desktop/DesktopSharedCapture.test.ts:398:57
    396|  try{
    397|   f.child.send({type:"platform_failure",backend,code:"permission_cance…
    398|   expect(b.session.exitCode).toBe(0);expect(a.messages).toEqual([{type…
       |                                                         ^
    399|  }finally{f.pool.dispose();}
    400| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > preserves typed macos-sck startup permission failure for every configured member
AssertionError: expected [] to deeply equal [ { type: 'platform_failure', …(2) } ]

- Expected
+ Received

- [
-   {
-     "backend": "macos-sck",
-     "code": "permission_cancelled",
-     "type": "platform_failure",
-   },
- ]
+ []

 ❯ src/desktop/DesktopSharedCapture.test.ts:398:57
    396|  try{
    397|   f.child.send({type:"platform_failure",backend,code:"permission_cance…
    398|   expect(b.session.exitCode).toBe(0);expect(a.messages).toEqual([{type…
       |                                                         ^
    399|  }finally{f.pool.dispose();}
    400| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 54 skipped (56)
   Start at  20:51:56
   Duration  1.19s (transform 79%, import 20%, tests 1%)


```

### source-future-floor

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-native-sharing

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts (56 tests | 1 failed | 55 skipped) 1021ms
   × rejects future shared native source input evidence 1019ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > rejects future shared native source input evidence
AssertionError: expected null to be +0 // Object.is equality

- Expected:
0

+ Received:
null

 ❯ src/desktop/DesktopSharedCapture.test.ts:380:51
    378|   }
    379|   f.child.send({...frame(3),info:{...frame(3).info,timing:"measured",s…
    380|   await vi.waitFor(()=>expect(a.session.exitCode).toBe(0));
       |                                                   ^
    381|  }finally{f.pool.dispose();}
    382| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 55 skipped (56)
   Start at  20:51:58
   Duration  2.27s (tests 47%, transform 42%, import 11%)


```

### fresh-native-control

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-native-sharing

 ❯ |@sodashitsu/web| src/components/RemoteDesktopNativeSharing.test.ts (2 tests | 1 failed | 1 skipped) 51ms
   × lets a fresh linux-portal viewer opt in to shared desktop and reconnect 49ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/RemoteDesktopNativeSharing.test.ts > lets a fresh linux-portal viewer opt in to shared desktop and reconnect
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/components/RemoteDesktopNativeSharing.test.ts:12:70


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  20:52:01
   Duration  1.74s (transform 72%, import 14%, environment 11%, tests 3%)


```

## Local browser limit

One local browser attempt stopped at machine-online visibility before the desktop feature path. Not a successful E2E or negative. Same environment precondition recorded in previous desktop slices; no repeated attempts. CI runs both generated OS cases.

```text

Running 1 test using 1 worker

(node:3452360) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-30T11:48:47.179Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-30T11:48:47.180Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-30T11:48:47.180Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-30T11:48:47.185Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-g2yOEO/commands.json","count":0}
{"ts":"2026-10-30T11:48:47.618Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-30T11:48:47.619Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-30T11:48:47.619Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-30T11:48:47.620Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-maDKyc/commands.json","count":0}
{"ts":"2026-10-30T11:49:32.081Z","level":"info","msg":"machine link closed","machine":"fbcdd6754a47156069ac14b49325327e","kind":"transient","reason":"接続を閉じました"}
  ✘  1 src/specs/remote-desktop-native-sharing.spec.ts:7:1 › fresh linux-portal browser explicitly enables native shared desktop (1.3m)


  1) src/specs/remote-desktop-native-sharing.spec.ts:7:1 › fresh linux-portal browser explicitly enables native shared desktop 

    Test timeout of 45000ms exceeded.

    Error: expect(locator).toBeVisible() failed

    Locator: locator('[data-machine-id="fbcdd6754a47156069ac14b49325327e"]').locator('[data-state="online"]')
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" locator('[data-machine-id="fbcdd6754a47156069ac14b49325327e"]').locator('[data-state="online"]') with timeout 5000ms
      - waiting for locator('[data-machine-id="fbcdd6754a47156069ac14b49325327e"]').locator('[data-state="online"]')


      13 |  try{
      14 |   const a=await appServer.openClient(),b=await provider.openClient(),invite=await a.request("machine.invite",{label:`Generated shared ${backend}`});await b.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});
    > 15 |   await page.goto(`${appServer.origin}/#token=${appServer.token}`);const header=page.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible();await openNativeTab(page,"desktop",header);
         |                                                                                                                                                                                               ^
      16 |   const view=page.locator("[data-remote-desktop]"),canvas=view.getByLabel("共有画面"),shared=view.locator("[data-shared-desktop-option] input");
      17 |   await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9]/);await expect(view.locator("[data-native-platform]")).toContainText(backend==="linux-portal"?"Linux / Portal":"macOS / ScreenCaptureKit");
      18 |   await expect(shared).toBeVisible();await expect(shared).not.toBeChecked();await shared.check();
        at /workspaces/sodashitsu-desktop-native-sharing/packages/e2e/src/specs/remote-desktop-native-sharing.spec.ts:15:191

    Error Context: test-results/remote-desktop-native-shar-c4ce5-ables-native-shared-desktop/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-native-shar-c4ce5-ables-native-shared-desktop/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-native-shar-c4ce5-ables-native-shared-desktop/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-native-sharing.spec.ts:7:1 › fresh linux-portal browser explicitly enables native shared desktop 
undefined
/workspaces/sodashitsu-desktop-native-sharing/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-native-sharing.spec.ts --grep fresh linux-portal

```

## Final checks/delivery

- Full build/typecheck PASS;895 files/12,992 tests PASS,350.34s.
- Tested head0f6acbc1b92a4af487bd99957463e3b0ca7f68a0: all3 CI PASS. Browser workflow41051336200/job124047856418 uses actual generated sources and2fresh Chromium OS cases; request sharedDesktop:true, reconnect and decoded canvas pixels all pass. No real OS sources.
- PR326 main e95204aeb5115c9c67a6eda3f105e726ba6ac521; tree c7e50cff91f031cc50800112bb5240ac07af1ce7 equals tested branch. Negative controls and bytes restoration above. Independent reviews/delta have no remaining findings.
- Local browser precondition failure above is preserved and not called success; CI provides the positive browser result. No live sessions/agents/models/OS devices/permission/service/driver changes.
