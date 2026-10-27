# Shared native rate (8E)

共有FPS/bitrateのみ。解像度適応・protected合成は別対応。max集約により一窓の低速が他窓を下げず、全consumerの希望が低下したとき共通encoderを下げる。固定/旧peerは初期上限を保持。sourceID/audio/format世代を維持。

負例は該当箇所を外して実行時失敗を確認、正確なbyte列へ復元。proofはBのmessage入口でhelper証明なしのadaptiveを無効化する防御を外す。browserは変更版をbuildし直す。

## aggregate

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-adaptive

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts (16 tests | 1 failed | 15 skipped) 10ms
   × aggregates adaptive requests without a single slow viewer lowering the other viewer 9ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts > aggregates adaptive requests without a single slow viewer lowering the other viewer
AssertionError: expected [ { type: 'native_rate', …(3) } ] to have a length of +0 but got 1

- Expected
+ Received

- 0
+ 1

 ❯ src/desktop/DesktopSharedNative.test.ts:143:79
    141|  const f=setup();f.start(f.a,f.aid,{adaptive:true});f.start(f.b,f.bid,…
    142|  const rate=(member:object,id:string,fps:number,kbps:number)=>f.native…
    143|  rate(f.a,f.aid,10,1000);expect(f.commands.filter(m=>m.type==="native_…
       |                                                                               ^
    144|  rate(f.b,f.bid,15,1500);expect(f.commands.at(-1)).toMatchObject({type…
    145|  rate(f.a,f.aid,20,2000);expect(f.commands.at(-1)).toMatchObject({fps:…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 15 skipped (16)
   Start at  12:05:57
   Duration  755ms (transform 75%, import 23%, tests 2%, worker 1%)

```

## detach

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-adaptive

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts (16 tests | 1 failed | 15 skipped) 12ms
   × aggregates adaptive requests without a single slow viewer lowering the other viewer 11ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts > aggregates adaptive requests without a single slow viewer lowering the other viewer
AssertionError: expected { type: 'native_rate', …(3) } to match object { fps: 15, kbps: 1500 }
(2 matching properties omitted from actual)

- Expected
+ Received

  {
-   "fps": 15,
-   "kbps": 1500,
+   "fps": 20,
+   "kbps": 2000,
  }

 ❯ src/desktop/DesktopSharedNative.test.ts:146:49
    144|  rate(f.b,f.bid,15,1500);expect(f.commands.at(-1)).toMatchObject({type…
    145|  rate(f.a,f.aid,20,2000);expect(f.commands.at(-1)).toMatchObject({fps:…
    146|  f.native.detach(f.a);expect(f.commands.at(-1)).toMatchObject({fps:15,…
       |                                                 ^
    147|  f.start(f.a,f.aid,{adaptive:true});expect(f.commands.at(-1)).toMatchO…
    148| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 15 skipped (16)
   Start at  12:05:58
   Duration  668ms (transform 74%, import 23%, tests 2%)

```

## limits

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-adaptive

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts (16 tests | 1 failed | 15 skipped) 9ms
   × fixed peers retain their ceiling, and rate messages cannot cross ids, generations or limits 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedNative.test.ts > fixed peers retain their ceiling, and rate messages cannot cross ids, generations or limits
AssertionError: expected [Function] to throw an error

- Expected:
null

+ Received:
undefined

 ❯ src/desktop/DesktopSharedNative.test.ts:152:83


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 15 skipped (16)
   Start at  12:06:00
   Duration  685ms (transform 75%, import 22%, tests 2%, worker 1%)

```

## relay

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-adaptive

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (136 tests | 1 failed | 133 skipped) 452ms
   × negotiates shared cadence only with the current provider and helper: missing none 181ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > negotiates shared cadence only with the current provider and helper: missing none
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/DesktopRelay.test.ts:1158:268


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 passed | 133 skipped (136)
   Start at  12:06:01
   Duration  1.41s (transform 53%, tests 34%, import 13%)

```

## proof

Bのmessage入口でhelper証明を使わずoptionsだけを見る修正前へ戻す。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-adaptive

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (136 tests | 1 failed | 135 skipped) 136ms
   × forces shared encoder adaptation off at B without helper proof even for direct provider messages 135ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > forces shared encoder adaptation off at B without helper proof even for direct provider messages
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopRelay.test.ts:1055:20
    1053|  try{
    1054|   share.ws.emit("message",Buffer.from(JSON.stringify({type:"media",ena…
    1055|   expect(adaptive).toBe(false);
       |                    ^
    1056|  }finally{spy.mockRestore();}
    1057| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 135 skipped (136)
   Start at  12:18:51
   Duration  1.18s (transform 67%, import 20%, tests 12%)

```

## browser

```text

Running 1 test using 1 worker

(node:1654936) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-27T03:07:58.560Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T03:07:58.561Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T03:07:58.562Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T03:07:58.568Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-ImogHg/commands.json","count":0}
{"ts":"2026-10-27T03:07:58.998Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T03:07:58.999Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T03:07:58.999Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T03:07:59.000Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-Auofgl/commands.json","count":0}
{"ts":"2026-10-27T03:08:04.205Z","level":"info","msg":"machine link closed","machine":"b9dfdb2deb3f1a56113e198a68d50665","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-shared-rate.spec.ts:10:1 › shared video adapts its one encoder through the browser without restarting either viewer (6.3s)


  1) src/specs/remote-desktop-shared-rate.spec.ts:10:1 › shared video adapts its one encoder through the browser without restarting either viewer 

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

      19 |    await browser.goto(`${appServer.origin}/#token=${appServer.token}`);const header=browser.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible();await openNativeTab(browser,"desktop",header);const view=browser.locator("[data-remote-desktop]");await view.getByLabel("複数viewerで同じ画面を共有",{exact:true}).check();await expect(view.getByLabel("共有画面")).toHaveAttribute("data-rendered-frames",/^[1-9]/);await view.locator("[data-desktop-media] summary").click();await expect(view.getByLabel("共有動画のFPS・帯域を自動調整",{exact:true})).toBeEnabled();await view.getByLabel("共有動画のFPS・帯域を自動調整",{exact:true}).check();await view.getByRole("button",{name:"動画共有を依頼",exact:true}).click();await expect(view.locator("[data-media-state]")).toHaveText("GPU H.264");await expect.poll(async()=>Number(await view.getByLabel("共有画面").getAttribute("data-video-frames"))).toBeGreaterThan(4);
      20 |   }
    > 21 |   for(const values of sent)expect(values.some(m=>m.type==="media"&&m.enabled&&m.settings?.adaptive===true)).toBe(true);
         |                                                                                                             ^
      22 |   await expect.poll(async()=>(await ledger()).some(m=>m.type==="native_rate"&&m.fps<30),{timeout:15000}).toBe(true);const rows=await ledger(),source=rows.find(m=>m.type==="native_start").id;expect(rows.filter(m=>m.type==="native_start")).toHaveLength(1);expect(rows.filter(m=>m.type==="native_rate").every(m=>m.id===source)).toBe(true);expect(rows.filter(m=>m.type==="native_stop")).toHaveLength(0);
      23 |   for(const browser of [page,second]){const view=browser.locator("[data-remote-desktop]"),canvas=view.getByLabel("共有画面"),before=Number(await canvas.getAttribute("data-video-frames"));await expect.poll(async()=>Number(await canvas.getAttribute("data-video-frames"))).toBeGreaterThan(before+3);await expect(view.locator("[data-shared-rate]")).toBeVisible();expect(await canvas.evaluate(el=>{const c=el as HTMLCanvasElement,p=c.getContext("2d")!.getImageData(80,60,1,1).data;return c.width===640&&p[0]!>220&&p[1]!<35;})).toBe(true);}
      24 |  }finally{await page.goto("about:blank");await second.close();await provider.close();await rm(dir,{recursive:true,force:true});}
        at /workspaces/sodashitsu-desktop-shared-adaptive/packages/e2e/src/specs/remote-desktop-shared-rate.spec.ts:21:109

    Error Context: test-results/remote-desktop-shared-rate-22512-ut-restarting-either-viewer/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-shared-rate-22512-ut-restarting-either-viewer/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-shared-rate-22512-ut-restarting-either-viewer/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-shared-rate.spec.ts:10:1 › shared video adapts its one encoder through the browser without restarting either viewer 
undefined
/workspaces/sodashitsu-desktop-shared-adaptive/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-shared-rate.spec.ts
```

最初の全体は11646成功/1失敗。旧helper証明なしのB入口の期待が残っていたため、その防御も追加し、対象4件と負例を確認。code変更があるので再build後に全体を再実行する。
