# 検証

build / typecheck 成功。単体62件成功。実browser9件成功+実画面performance1件opt-in skip（画像専用socketでのcanvas描画と親input ACK、cursor、生成H264/legacy1枚/pipeline3枚）。route negative復元build後の画像browser再実行1件成功。

独立レビューと最後の経路guard/docs再レビュー成功。実OS入力や実画面の取得は行っていない。

全体試験は、テスト実行中にmainを取り込んだ作業ミスで一時的なmerge markerがViteに読まれた。15 suitesがparse/cacheで失敗、SessionServiceの1件も同じparse error、PTY試験はcheckout後のmtimeを検出した。これら16 suites以外の733 suitesは成功（11,025 tests成功）。mergeはc9b846b9から製品sourceのbytesを変えずに解決し、取り込んだ差分はcursor検証記録とparity台帳のみ。serverを再build後、影響した16 suitesを全件再実行し567 tests成功。合計749 suitesを検証した。以降このworktreeの製品sourceは変更していない。原出力 /tmp/desktop-images-all.log、/tmp/desktop-images-merge-recheck.log。

## Negativeの生出力

修正だけを外して実行時に失敗し、元bytesと一致するよう復元。browser routeはserverを負例で再buildし、復元後再buildの終了を待ってpositiveを再実行。

### barrier

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-transport

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (53 tests | 2 failed | 51 skipped) 378ms
   × holds the first image until parent-ready ACK and image pairing, secure=false 212ms
   × holds the first image until parent-ready ACK and image pairing, secure=true 163ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > holds the first image until parent-ready ACK and image pairing, secure=false
 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > holds the first image until parent-ready ACK and image pairing, secure=true
AssertionError: expected [ …(1) ] to have a length of +0 but got 1

- Expected
+ Received

- 0
+ 1

 ❯ src/desktop/DesktopRelay.test.ts:673:72
    671|  image.on("error",()=>{});image.on("message",(bytes,binary)=>{expect(b…
    672|  await new Promise<void>((resolve,reject)=>{image.once("open",resolve)…
    673|  await expect.poll(()=>server.imageAttached).toBe(true);expect(frames)…
       |                                                                        ^
    674|  v.send({type:"image_ready"});await expect.poll(()=>frames.length).toB…
    675|  const info=decodeDesktopFrame(frames[0]!).info;v.send({type:"ack",seq…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 51 skipped (53)
   Start at  08:53:37
   Duration  1.28s (transform 52%, tests 32%, import 16%)


```

### held

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-transport

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (53 tests | 2 failed | 51 skipped) 248ms
   × holds the first image until parent-ready ACK and image pairing, secure=false 138ms
   × holds the first image until parent-ready ACK and image pairing, secure=true 108ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > holds the first image until parent-ready ACK and image pairing, secure=false
 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > holds the first image until parent-ready ACK and image pairing, secure=true
AssertionError: expected [ …(1) ] to have a length of +0 but got 1

- Expected
+ Received

- 0
+ 1

 ❯ src/desktop/DesktopRelay.test.ts:668:111
    666|  await expect.poll(()=>v.messages.some(m=>m.type==="ready")).toBe(true…
    667|  const ready=v.messages.find(m=>m.type==="ready")!;expect(ready.imageL…
    668|  const server=Array.from((f.relay as any).viewers)[0] as any;expect(se…
       |                                                                                                               ^
    669|  const ticket=v.messages.find(m=>m.type==="image_ticket")!.ticket;
    670|  const image=new WebSocket(f.endpoint,DESKTOP_IMAGE_LANE_PROTOCOL,{hea…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 51 skipped (53)
   Start at  08:53:39
   Duration  1.17s (transform 59%, tests 23%, import 18%)


```

### browser

```text

Running 1 test using 1 worker

(node:845403) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-25T23:54:13.753Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-25T23:54:13.754Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-25T23:54:13.754Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-25T23:54:13.766Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-pROzI8/commands.json","count":0}
{"ts":"2026-10-25T23:54:14.274Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-25T23:54:14.276Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-25T23:54:14.276Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-25T23:54:14.276Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-LCl8X0/commands.json","count":0}
{"ts":"2026-10-25T23:54:21.274Z","level":"info","msg":"machine link closed","machine":"21a5ff8f430365928def80f055fa564e","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-image-lane.spec.ts:7:1 › images render on a separate authenticated socket while input ACK stays on the parent (8.1s)


  1) src/specs/remote-desktop-image-lane.spec.ts:7:1 › images render on a separate authenticated socket while input ACK stays on the parent 

    Error: expect(received).toBeGreaterThan(expected)

    Expected: > 0
    Received:   0

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      29 |   const view=page.locator("[data-remote-desktop]"),canvas=view.getByLabel("共有画面");
      30 |   await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9]/);
    > 31 |   await expect.poll(()=>sockets.filter(s=>!s.main).reduce((n,s)=>n+s.images,0)).toBeGreaterThan(0);
         |                                                                                 ^
      32 |   expect(sockets.find(s=>s.main)?.images).toBe(0);expect(sockets.find(s=>s.main)?.ready).toBe(true);
      33 |   expect(await canvas.evaluate(el=>{const c=el as HTMLCanvasElement;return c.getContext("2d")!.getImageData(0,0,1,1).data[3];})).toBe(255);
      34 |   await view.getByRole("button",{name:"操作する",exact:true}).click();await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");await canvas.focus();
        at /workspaces/sodashitsu-desktop-transport/packages/e2e/src/specs/remote-desktop-image-lane.spec.ts:31:81

    Error Context: test-results/remote-desktop-image-lane--34e53-put-ACK-stays-on-the-parent/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-image-lane--34e53-put-ACK-stays-on-the-parent/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-image-lane--34e53-put-ACK-stays-on-the-parent/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-image-lane.spec.ts:7:1 › images render on a separate authenticated socket while input ACK stays on the parent 
undefined
/workspaces/sodashitsu-desktop-transport/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-image-lane.spec.ts

```
