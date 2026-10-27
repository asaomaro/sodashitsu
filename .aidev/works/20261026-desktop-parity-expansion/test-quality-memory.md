# 画質設定の記憶と復元

画像と動画・表示を接続先ごとに保存。編集中は最後の有効値だけ保存し、permission/capture stateは保存しない。routeの一時fallbackと希望の値を分離し、readyで再導出。旧窓のcloseによる上書きを除去。

独立レビューでroute復帰と旧窓closeの2件を検出し修正。設定/旧窓close unit4通過、ブラウザ新1/既存1通過。初回browserはfixtureの--native-codecs不足で非対応option待ちになったため修正し、positiveを取り直した。以下negative3は修正除去後に実assertion失敗を確認し、元のbytesに復元した。

## Negative stale-close

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-quality-memory

 ❯ |@sodashitsu/web| src/components/RemoteDesktopPreferences.test.ts (1 test | 1 failed) 76ms
   × closing an unedited viewer does not overwrite newer preferences saved by another viewer 74ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/RemoteDesktopPreferences.test.ts > closing an unedited viewer does not overwrite newer preferences saved by another viewer
AssertionError: expected { width: 960, fps: 5, …(4) } to deeply equal { width: 1920, fps: 15, …(4) }

- Expected
+ Received

  {
    "adaptive": false,
    "deltas": true,
-   "fps": 15,
+   "fps": 5,
    "image": {
-     "colorMode": "full",
+     "colorMode": "rgb332",
      "showCursor": true,
    },
-   "quality": 85,
-   "width": 1920,
+   "quality": 40,
+   "width": 960,
  }

 ❯ src/components/RemoteDesktopPreferences.test.ts:12:50
     10|  // The other viewer has since saved a newer preference revision.
     11|  saveSettings("remote",presets.quality);const newer=normalizeViewerPre…
     12|  viewer.unmount();expect(loadSettings("remote")).toEqual(presets.quali…
       |                                                  ^
     13| });
     14|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  09:28:04
   Duration  2.87s (transform 66%, environment 17%, import 12%, tests 3%, worker 2%)


```

## Negative route

```text

Running 1 test using 1 worker

(node:1171362) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-27T00:28:41.257Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:28:41.258Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:28:41.258Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:28:41.266Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-ctJZkH/commands.json","count":0}
{"ts":"2026-10-27T00:28:41.995Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:28:41.996Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:28:41.996Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:28:41.997Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-NwK10X/commands.json","count":0}
{"ts":"2026-10-27T00:28:54.726Z","level":"info","msg":"machine link closed","machine":"a227bb975bdf9a6adb8a112688ef1243","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-quality-memory.spec.ts:5:1 › quality drafts survive browser reload without Apply, including codec, route, rate and fit (15.1s)


  1) src/specs/remote-desktop-quality-memory.spec.ts:5:1 › quality drafts survive browser reload without Apply, including codec, route, rate and fit 

    Error: expect(locator).toHaveValue(expected) failed

    Locator:  locator('[data-remote-desktop]').getByLabel('動画の経路')
    Expected: "native"
    Received: "auto"
    Timeout:  5000ms

    Call log:
      - Expect "toHaveValue" locator('[data-remote-desktop]').getByLabel('動画の経路') with timeout 5000ms
      - waiting for locator('[data-remote-desktop]').getByLabel('動画の経路')
        12 × locator resolved to <select data-v-5ffcff02="" aria-label="動画の経路">…</select>
           - unexpected value "auto"


      28 |   await view.locator("[data-desktop-media] summary").click();await expect(view.getByLabel("動画の経路")).toHaveValue("native");await expect(view.getByLabel("動画帯域の上限")).toHaveValue("6789");await expect(view.getByLabel("動画コーデック")).toHaveValue("hevc");await expect(view.getByLabel("動画FPS上限")).toHaveValue("30");await expect(view.getByLabel("UDPを優先",{exact:false})).not.toBeChecked();await expect(view.getByLabel("システム音声を要求",{exact:true})).not.toBeChecked();
      29 |   await page.evaluate(()=>(window as any).__withoutNative=true);await view.getByRole("button",{name:"適用して再接続",exact:true}).click();await expect(view.getByLabel("動画の経路")).toHaveValue("auto");
    > 30 |   await page.evaluate(()=>(window as any).__withoutNative=false);await view.getByRole("button",{name:"適用して再接続",exact:true}).click();await expect(view.getByLabel("動画の経路")).toHaveValue("native");
         |                                                                                                                                                                            ^
      31 |   expect(sent.filter(m=>m.type==="media"&&m.enabled)).toHaveLength(0);expect(sent.filter(m=>m.type==="control"&&m.enabled)).toHaveLength(0);expect(sent.filter(m=>m.type==="start").at(-1).options).toMatchObject({width:1000,fps:7,quality:72,deltas:false,adaptive:true,image:{colorMode:"gray16",showCursor:false}});
      32 |  }finally{await page.goto("about:blank").catch(()=>{});await provider.close();}
      33 | });
        at /workspaces/sodashitsu-desktop-quality-memory/packages/e2e/src/specs/remote-desktop-quality-memory.spec.ts:30:172

    Error Context: test-results/remote-desktop-quality-mem-d60ca-ng-codec-route-rate-and-fit/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-quality-mem-d60ca-ng-codec-route-rate-and-fit/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-quality-mem-d60ca-ng-codec-route-rate-and-fit/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-quality-memory.spec.ts:5:1 › quality drafts survive browser reload without Apply, including codec, route, rate and fit 
undefined
/workspaces/sodashitsu-desktop-quality-memory/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-quality-memory.spec.ts

```

## Negative autosave

```text

Running 1 test using 1 worker

(node:1174609) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-27T00:29:15.441Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:29:15.442Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:29:15.442Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:29:15.448Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-NGtng2/commands.json","count":0}
{"ts":"2026-10-27T00:29:15.924Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:29:15.926Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:29:15.926Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:29:15.927Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-OMCHk2/commands.json","count":0}
{"ts":"2026-10-27T00:29:25.544Z","level":"info","msg":"machine link closed","machine":"915a1efb845f630857872e56b02753cc","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-quality-memory.spec.ts:5:1 › quality drafts survive browser reload without Apply, including codec, route, rate and fit (11.3s)


  1) src/specs/remote-desktop-quality-memory.spec.ts:5:1 › quality drafts survive browser reload without Apply, including codec, route, rate and fit 

    Error: expect(locator).toHaveValue(expected) failed

    Locator:  locator('[data-remote-desktop]').getByLabel('送信幅の上限')
    Expected: "1000"
    Received: "1280"
    Timeout:  5000ms

    Call log:
      - Expect "toHaveValue" locator('[data-remote-desktop]').getByLabel('送信幅の上限') with timeout 5000ms
      - waiting for locator('[data-remote-desktop]').getByLabel('送信幅の上限')
        14 × locator resolved to <input min="320" max="1920" type="number" data-v-a84b42bd="" aria-label="送信幅の上限"/>
           - unexpected value "1280"


      25 |   // and its new start request, so saving only on close/Apply cannot pass.
      26 |   await page.reload();await expect(header.locator('[data-state="online"]')).toBeVisible({timeout:15000});if(!await view.count())await openNativeTab(page,"desktop",header);else await view.getByRole("button",{name:"情報・設定",exact:true}).click();
    > 27 |   await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9][0-9]*$/);await view.getByText("画質・計測",{exact:true}).click();await expect(view.getByLabel("送信幅の上限")).toHaveValue("1000");await expect(view.getByLabel("fps上限",{exact:true})).toHaveValue("7");await expect(view.getByLabel("JPEG品質")).toHaveValue("72");await expect(view.getByLabel("送信する色")).toHaveValue("gray16");await expect(view.getByLabel("共有元のカーソルを表示",{exact:true})).not.toBeChecked();await expect(view.getByLabel("差分転送",{exact:true})).not.toBeChecked();await expect(view.getByLabel("自動画質調整",{exact:true})).toBeChecked();await expect(view.getByLabel("画面に合わせる",{exact:true})).not.toBeChecked();
         |                                                                                                                                                                           ^
      28 |   await view.locator("[data-desktop-media] summary").click();await expect(view.getByLabel("動画の経路")).toHaveValue("native");await expect(view.getByLabel("動画帯域の上限")).toHaveValue("6789");await expect(view.getByLabel("動画コーデック")).toHaveValue("hevc");await expect(view.getByLabel("動画FPS上限")).toHaveValue("30");await expect(view.getByLabel("UDPを優先",{exact:false})).not.toBeChecked();await expect(view.getByLabel("システム音声を要求",{exact:true})).not.toBeChecked();
      29 |   await page.evaluate(()=>(window as any).__withoutNative=true);await view.getByRole("button",{name:"適用して再接続",exact:true}).click();await expect(view.getByLabel("動画の経路")).toHaveValue("auto");
      30 |   await page.evaluate(()=>(window as any).__withoutNative=false);await view.getByRole("button",{name:"適用して再接続",exact:true}).click();await expect(view.getByLabel("動画の経路")).toHaveValue("native");
        at /workspaces/sodashitsu-desktop-quality-memory/packages/e2e/src/specs/remote-desktop-quality-memory.spec.ts:27:171

    Error Context: test-results/remote-desktop-quality-mem-d60ca-ng-codec-route-rate-and-fit/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-quality-mem-d60ca-ng-codec-route-rate-and-fit/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-quality-mem-d60ca-ng-codec-route-rate-and-fit/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-quality-memory.spec.ts:5:1 › quality drafts survive browser reload without Apply, including codec, route, rate and fit 
undefined
/workspaces/sodashitsu-desktop-quality-memory/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-quality-memory.spec.ts

```


## 最終main統合後の検証

main33aを統合しsourceを固定してbuild/typecheck、全体775 suites/11605件通過。独立worktreeでbuild/smoke通過。修正後の独立レビュー2件でmustなし。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-quality-memory

{"ts":"2026-10-27T00:33:47.535Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:33:47.536Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:33:47.537Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:33:47.537Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:33:47.537Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:33:47.537Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:33:47.538Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:33:47.541Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:33:47.541Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:33:47.545Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-display-state-WW59ie/commands.json","count":0}
{"ts":"2026-10-27T00:33:47.545Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-stream-it-Gp1dkk/state/commands.json","count":0}
{"ts":"2026-10-27T00:33:47.548Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-graph-it-state-ZuzUVJ/commands.json","count":0}
{"ts":"2026-10-27T00:33:47.614Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:33:47.616Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:33:47.616Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:33:47.640Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-paneenv-state-GJPJZp/commands.json","count":0}
{"ts":"2026-10-27T00:33:48.192Z","level":"info","msg":"display script enabled","byClientId":"5e4ffda8-02c0-41aa-a36b-d46f8ea920ea","byKind":"external"}
{"ts":"2026-10-27T00:33:48.222Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:33:48.239Z","level":"info","msg":"display set","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","name":"main","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:33:48.239Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:33:48.242Z","level":"info","msg":"display set","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","name":"main","kind":"panel","format":"text","bytes":1,"rev":2}
{"ts":"2026-10-27T00:33:48.242Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-27T00:33:48.244Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-27T00:33:48.245Z","level":"info","msg":"display closed","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","name":"main","reason":"closed"}
{"ts":"2026-10-27T00:33:48.246Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:5","code":"ok"}
{"ts":"2026-10-27T00:33:48.247Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:6","code":"ok"}
{"ts":"2026-10-27T00:33:48.248Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:7","code":"ok"}
{"ts":"2026-10-27T00:33:48.248Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:8","code":"ok"}
{"ts":"2026-10-27T00:33:48.255Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:9","code":"ok"}
{"ts":"2026-10-27T00:33:48.273Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:10","code":"ok"}
{"ts":"2026-10-27T00:33:48.304Z","level":"info","msg":"display set","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","name":"quotes","kind":"panel","format":"html","bytes":2096128,"rev":1}
{"ts":"2026-10-27T00:33:48.304Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:11","code":"ok"}
{"ts":"2026-10-27T00:33:48.316Z","level":"info","msg":"display closed","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","name":"quotes","reason":"closed"}
{"ts":"2026-10-27T00:33:48.316Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:12","code":"ok"}
{"ts":"2026-10-27T00:33:48.372Z","level":"info","msg":"display set","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","name":"viaws","kind":"band","format":"markdown","bytes":4,"rev":1}
{"ts":"2026-10-27T00:33:48.477Z","level":"info","msg":"display closed","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","name":"viaws","reason":"closed"}
{"ts":"2026-10-27T00:33:48.532Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:13","code":"ok"}
{"ts":"2026-10-27T00:33:48.992Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:1aafb830-c0f2-4bf9-8d99-b3880adfdb5e"]}
{"ts":"2026-10-27T00:33:49.052Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"1f189b4b-e21a-464c-bd51-bee8689498c1","connId":"pane-socket:14","code":"ok"}
{"ts":"2026-10-27T00:33:49.054Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"1f189b4b-e21a-464c-bd51-bee8689498c1","connId":"pane-socket:15","code":"ok"}
{"ts":"2026-10-27T00:33:49.079Z","level":"info","msg":"display set","paneId":"1f189b4b-e21a-464c-bd51-bee8689498c1","name":"m","kind":"panel","format":"html","bytes":39,"rev":1}
{"ts":"2026-10-27T00:33:49.079Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"1f189b4b-e21a-464c-bd51-bee8689498c1","connId":"pane-socket:17","code":"ok"}
{"ts":"2026-10-27T00:33:49.081Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"1f189b4b-e21a-464c-bd51-bee8689498c1","connId":"pane-socket:16","code":"ok"}
{"ts":"2026-10-27T00:33:49.084Z","level":"info","msg":"display closed","paneId":"1f189b4b-e21a-464c-bd51-bee8689498c1","name":"m","reason":"dismissed"}
{"ts":"2026-10-27T00:33:49.084Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"1f189b4b-e21a-464c-bd51-bee8689498c1","connId":"pane-socket:18","code":"ok"}
{"ts":"2026-10-27T00:33:49.086Z","level":"info","msg":"display set","paneId":"1f189b4b-e21a-464c-bd51-bee8689498c1","name":"n","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T00:33:49.086Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"1f189b4b-e21a-464c-bd51-bee8689498c1","connId":"pane-socket:20","code":"ok"}
{"ts":"2026-10-27T00:33:49.088Z","level":"info","msg":"display reported","paneId":"1f189b4b-e21a-464c-bd51-bee8689498c1","name":"n","problem":"navigated","format":"text"}
{"ts":"2026-10-27T00:33:49.088Z","level":"info","msg":"display closed","paneId":"1f189b4b-e21a-464c-bd51-bee8689498c1","name":"n","reason":"navigated"}
{"ts":"2026-10-27T00:33:49.088Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"1f189b4b-e21a-464c-bd51-bee8689498c1","connId":"pane-socket:19","code":"ok"}
{"ts":"2026-10-27T00:33:49.090Z","level":"info","msg":"display set","paneId":"1f189b4b-e21a-464c-bd51-bee8689498c1","name":"o","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T00:33:49.090Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"1f189b4b-e21a-464c-bd51-bee8689498c1","connId":"pane-socket:22","code":"ok"}
{"ts":"2026-10-27T00:33:49.091Z","level":"info","msg":"display closed","paneId":"1f189b4b-e21a-464c-bd51-bee8689498c1","name":"o","reason":"closed"}
{"ts":"2026-10-27T00:33:49.091Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"1f189b4b-e21a-464c-bd51-bee8689498c1","connId":"pane-socket:21","code":"ok"}
{"ts":"2026-10-27T00:33:49.091Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"1f189b4b-e21a-464c-bd51-bee8689498c1","connId":"pane-socket:23","code":"ok"}
{"ts":"2026-10-27T00:33:49.129Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"1f189b4b-e21a-464c-bd51-bee8689498c1","connId":"pane-socket:24","code":"not_found"}
{"ts":"2026-10-27T00:33:49.135Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:1f189b4b-e21a-464c-bd51-bee8689498c1"]}
{"ts":"2026-10-27T00:33:49.545Z","level":"info","msg":"display set","paneId":"bbcbcdc2-df67-4923-a7b2-8478004179d7","name":"m","kind":"panel","format":"html","bytes":39,"rev":1}
{"ts":"2026-10-27T00:33:49.545Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"bbcbcdc2-df67-4923-a7b2-8478004179d7","connId":"pane-socket:25","code":"ok"}
{"ts":"2026-10-27T00:33:49.547Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"bbcbcdc2-df67-4923-a7b2-8478004179d7","connId":"pane-socket:26","code":"ok"}
{"ts":"2026-10-27T00:33:49.548Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"bbcbcdc2-df67-4923-a7b2-8478004179d7","connId":"pane-socket:27","code":"ok"}
{"ts":"2026-10-27T00:33:49.619Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"bbcbcdc2-df67-4923-a7b2-8478004179d7","connId":"pane-socket:28","code":"ok"}
{"ts":"2026-10-27T00:33:49.667Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:6f1bd3ba-5c53-4b60-bd93-5dd0e0c760cb"]}
{"ts":"2026-10-27T00:33:49.680Z","level":"info","msg":"display closed","paneId":"bbcbcdc2-df67-4923-a7b2-8478004179d7","name":"m","reason":"pane_closed"}
{"ts":"2026-10-27T00:33:49.681Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"bbcbcdc2-df67-4923-a7b2-8478004179d7","connId":"pane-socket:29","code":"not_found"}
{"ts":"2026-10-27T00:33:49.690Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:bbcbcdc2-df67-4923-a7b2-8478004179d7"]}
{"ts":"2026-10-27T00:33:49.888Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:33:49.889Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:33:49.889Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:33:49.895Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-paneenv-named-E2ZNoa/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:33:50.060Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:93e918dd-6979-40d1-9668-f779032f445b"]}
{"ts":"2026-10-27T00:33:50.208Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:33:50.210Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:33:50.210Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:33:50.216Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-start-it-AHPgDH/state/commands.json","count":0}
{"ts":"2026-10-27T00:33:50.287Z","level":"info","msg":"display set","paneId":"708bf073-a0a4-4a27-8325-9259546ec6f1","name":"w","kind":"panel","format":"html","bytes":39,"rev":1}
{"ts":"2026-10-27T00:33:50.532Z","level":"info","msg":"display closed","paneId":"708bf073-a0a4-4a27-8325-9259546ec6f1","name":"w","reason":"pane_closed"}
{"ts":"2026-10-27T00:33:50.542Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:708bf073-a0a4-4a27-8325-9259546ec6f1"]}
{"ts":"2026-10-27T00:33:50.634Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:03788f72-9a35-44a2-94e9-4394ba878246"]}
{"ts":"2026-10-27T00:33:50.952Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"40a54d28-de7d-4176-a552-d4503b91ccd6","connId":"pane-socket:30","code":"ok"}
{"ts":"2026-10-27T00:33:50.953Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"40a54d28-de7d-4176-a552-d4503b91ccd6","connId":"pane-socket:31","code":"ok"}
{"ts":"2026-10-27T00:33:51.077Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:33:51.079Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:33:51.079Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:33:51.084Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-it-state-0OQIeX/commands.json","count":0}
{"ts":"2026-10-27T00:33:51.745Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:33:51.746Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:33:51.746Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:33:51.751Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-attach-it-1suMbj/state/commands.json","count":0}
{"ts":"2026-10-27T00:33:51.955Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"40a54d28-de7d-4176-a552-d4503b91ccd6","connId":"pane-socket:32","code":"ok"}
{"ts":"2026-10-27T00:33:51.958Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"40a54d28-de7d-4176-a552-d4503b91ccd6","connId":"pane-socket:33","code":"ok"}
{"ts":"2026-10-27T00:33:51.959Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"40a54d28-de7d-4176-a552-d4503b91ccd6","connId":"pane-socket:34","code":"ok"}
{"ts":"2026-10-27T00:33:52.240Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"40a54d28-de7d-4176-a552-d4503b91ccd6","connId":"pane-socket:35","code":"not_found"}
{"ts":"2026-10-27T00:33:52.251Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:40a54d28-de7d-4176-a552-d4503b91ccd6"]}
{"ts":"2026-10-27T00:33:52.255Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:36","code":"ok"}
{"ts":"2026-10-27T00:33:52.256Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:37","code":"ok"}
{"ts":"2026-10-27T00:33:52.257Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:38","code":"ok"}
{"ts":"2026-10-27T00:33:52.258Z","level":"info","msg":"display set","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","name":"b0","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T00:33:52.258Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:39","code":"ok"}
{"ts":"2026-10-27T00:33:52.259Z","level":"info","msg":"display set","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","name":"b1","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T00:33:52.260Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:40","code":"ok"}
{"ts":"2026-10-27T00:33:52.261Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:41","code":"display_limit"}
{"ts":"2026-10-27T00:33:52.262Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:42","code":"ok"}
{"ts":"2026-10-27T00:33:52.263Z","level":"info","msg":"display closed","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","name":"b0","reason":"closed"}
{"ts":"2026-10-27T00:33:52.263Z","level":"info","msg":"display closed","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","name":"b1","reason":"closed"}
{"ts":"2026-10-27T00:33:52.263Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:43","code":"ok"}
{"ts":"2026-10-27T00:33:52.303Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:44","code":"ok"}
{"ts":"2026-10-27T00:33:52.304Z","level":"info","msg":"display set","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","name":"sg","kind":"panel","format":"script-html","bytes":47,"rev":1}
{"ts":"2026-10-27T00:33:52.304Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:45","code":"ok"}
{"ts":"2026-10-27T00:33:52.306Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:46","code":"ok"}
{"ts":"2026-10-27T00:33:52.307Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:47","code":"ok"}
{"ts":"2026-10-27T00:33:52.332Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:49","code":"ok"}
{"ts":"2026-10-27T00:33:52.334Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:50","code":"ok"}
{"ts":"2026-10-27T00:33:52.356Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:33:52.357Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:33:52.357Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:33:52.363Z","level":"info","msg":"display set","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","name":"sg2","kind":"band","format":"script-html","bytes":18,"rev":1}
{"ts":"2026-10-27T00:33:52.364Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-it-follow-state-W30deZ/commands.json","count":0}
{"ts":"2026-10-27T00:33:52.367Z","level":"info","msg":"display set","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","name":"st","kind":"panel","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T00:33:52.368Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:51","code":"ok"}
{"ts":"2026-10-27T00:33:52.370Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:52","code":"ok"}
{"ts":"2026-10-27T00:33:52.371Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:53","code":"invalid_params"}
{"ts":"2026-10-27T00:33:52.373Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:48","code":"ok"}
{"ts":"2026-10-27T00:33:52.375Z","level":"info","msg":"display closed","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","name":"sg","reason":"closed"}
{"ts":"2026-10-27T00:33:52.375Z","level":"info","msg":"display closed","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","name":"sg2","reason":"closed"}
{"ts":"2026-10-27T00:33:52.375Z","level":"info","msg":"display closed","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","name":"st","reason":"closed"}
{"ts":"2026-10-27T00:33:52.375Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:54","code":"ok"}
{"ts":"2026-10-27T00:33:52.375Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:55","code":"ok"}
{"ts":"2026-10-27T00:33:52.378Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:57","code":"ok"}
{"ts":"2026-10-27T00:33:52.380Z","level":"info","msg":"display set","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","name":"lay","kind":"panel","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T00:33:52.380Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:58","code":"ok"}
{"ts":"2026-10-27T00:33:52.393Z","level":"info","msg":"display set","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","name":"lay2","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T00:33:52.397Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:59","code":"ok"}
{"ts":"2026-10-27T00:33:52.399Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:60","code":"ok"}
{"ts":"2026-10-27T00:33:52.400Z","level":"info","msg":"display closed","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","name":"lay","reason":"closed"}
{"ts":"2026-10-27T00:33:52.400Z","level":"info","msg":"display closed","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","name":"lay2","reason":"closed"}
{"ts":"2026-10-27T00:33:52.401Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"b986befd-adde-4c28-9f4a-c3883656aef8","connId":"pane-socket:61","code":"ok"}
{"ts":"2026-10-27T00:33:52.919Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"0d0a7442-9163-482f-985b-311ec19401e1","connId":"pane-socket:62","code":"ok"}
{"ts":"2026-10-27T00:33:52.920Z","level":"info","msg":"display set","paneId":"0d0a7442-9163-482f-985b-311ec19401e1","name":"cg","kind":"panel","format":"script-html","bytes":18,"rev":1}
{"ts":"2026-10-27T00:33:52.920Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"0d0a7442-9163-482f-985b-311ec19401e1","connId":"pane-socket:63","code":"ok"}
{"ts":"2026-10-27T00:33:52.958Z","level":"info","msg":"display reported","paneId":"0d0a7442-9163-482f-985b-311ec19401e1","name":"cg","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T00:33:52.980Z","level":"info","msg":"display reported","paneId":"0d0a7442-9163-482f-985b-311ec19401e1","name":"cg","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T00:33:52.982Z","level":"info","msg":"display reported","paneId":"0d0a7442-9163-482f-985b-311ec19401e1","name":"cg","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T00:33:52.982Z","level":"info","msg":"display closed","paneId":"0d0a7442-9163-482f-985b-311ec19401e1","name":"cg","reason":"focus_steal"}
{"ts":"2026-10-27T00:33:52.983Z","level":"info","msg":"display script cooldown","paneId":"0d0a7442-9163-482f-985b-311ec19401e1","reason":"focus_steal","closed":1,"ms":300000}
{"ts":"2026-10-27T00:33:52.989Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"0d0a7442-9163-482f-985b-311ec19401e1","connId":"pane-socket:64","code":"ok"}
{"ts":"2026-10-27T00:33:52.990Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"0d0a7442-9163-482f-985b-311ec19401e1","connId":"pane-socket:65","code":"display_busy"}
{"ts":"2026-10-27T00:33:52.993Z","level":"info","msg":"display set","paneId":"0d0a7442-9163-482f-985b-311ec19401e1","name":"cg","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T00:33:52.993Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"0d0a7442-9163-482f-985b-311ec19401e1","connId":"pane-socket:66","code":"ok"}
{"ts":"2026-10-27T00:33:53.469Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"abdf1f95-58cc-4ea2-8808-48d413070b75","connId":"pane-socket:67","code":"ok"}
{"ts":"2026-10-27T00:33:53.479Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"abdf1f95-58cc-4ea2-8808-48d413070b75","connId":"pane-socket:68","code":"ok"}
{"ts":"2026-10-27T00:33:53.480Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"abdf1f95-58cc-4ea2-8808-48d413070b75","connId":"pane-socket:69","code":"ok"}
{"ts":"2026-10-27T00:33:53.482Z","level":"info","msg":"display set","paneId":"abdf1f95-58cc-4ea2-8808-48d413070b75","name":"dg","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T00:33:53.482Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"abdf1f95-58cc-4ea2-8808-48d413070b75","connId":"pane-socket:70","code":"ok"}
{"ts":"2026-10-27T00:33:53.515Z","level":"info","msg":"display script enabled","byClientId":"23b6ba45-083d-42ff-91d3-734cda6c9658","byKind":"external"}
{"ts":"2026-10-27T00:33:53.519Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"abdf1f95-58cc-4ea2-8808-48d413070b75","connId":"pane-socket:71","code":"ok"}
{"ts":"2026-10-27T00:33:53.519Z","level":"info","msg":"display set","paneId":"abdf1f95-58cc-4ea2-8808-48d413070b75","name":"dg","kind":"panel","format":"script-html","bytes":8,"rev":2}
{"ts":"2026-10-27T00:33:53.520Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"abdf1f95-58cc-4ea2-8808-48d413070b75","connId":"pane-socket:72","code":"ok"}
{"ts":"2026-10-27T00:33:53.754Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:33:53.755Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:33:53.755Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:33:53.761Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-it-watch-state-sFP0VE/commands.json","count":0}
{"ts":"2026-10-27T00:33:54.417Z","level":"warn","msg":"origin rejected","path":"/ws","remoteAddress":"127.0.0.1","origin":"http://evil.example","host":"127.0.0.1:43099","allowed":["localhost:43099","127.0.0.1:43099","[::1]:43099"],"hint":"ブラウザで開いた Origin がこのマシンのアドレスに無いなら soda serve --origin <その Origin> で許可できます"}
{"ts":"2026-10-27T00:33:54.420Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:7e0e33ca-f7d6-4f9a-ae14-7f7fa1291871"]}
{"ts":"2026-10-27T00:33:54.845Z","level":"warn","msg":"origin rejected","path":"/ws","remoteAddress":"127.0.0.1","origin":"http://evil.example","host":"127.0.0.1:38609","allowed":["localhost:38609","127.0.0.1:38609","[::1]:38609"],"hint":"ブラウザで開いた Origin がこのマシンのアドレスに無いなら soda serve --origin <その Origin> で許可できます"}
{"ts":"2026-10-27T00:33:55.416Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:33:55.418Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:33:55.418Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:33:55.425Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-work-agent-it-IT5cGp/a/commands.json","count":0}
{"ts":"2026-10-27T00:33:55.853Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:33:55.854Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:33:55.854Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:33:55.859Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-work-agent-it-IT5cGp/b/commands.json","count":0}
{"ts":"2026-10-27T00:33:56.454Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:33:56.457Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:33:56.457Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:33:56.465Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-panecurrent-state-14Ik3z/commands.json","count":0}
{"ts":"2026-10-27T00:33:56.811Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:33:56.812Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:33:56.813Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:33:56.819Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-agent-it-state-k6IQyV/commands.json","count":0}
{"ts":"2026-10-27T00:33:58.461Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:33:58.464Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:33:58.465Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:33:58.471Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-3JFZaC/commands.json","count":0}
{"ts":"2026-10-27T00:33:59.090Z","level":"info","msg":"machine link closed","machine":"07dcb498c6bf7f68d49c36161c94e02d","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:33:59.608Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:33:59.609Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:33:59.609Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:33:59.613Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-mYBtsf/commands.json","count":0}
{"ts":"2026-10-27T00:34:00.023Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:00.024Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:00.024Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:00.030Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-PevGNe/commands.json","count":0}
{"ts":"2026-10-27T00:34:00.524Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:00.525Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:00.525Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:00.532Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-umaP3q/commands.json","count":0}
{"ts":"2026-10-27T00:34:00.963Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:00.964Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:00.964Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:00.972Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-mX3hLa/commands.json","count":0}
{"ts":"2026-10-27T00:34:00.983Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:00.984Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:00.984Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:00.991Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-prompt-it-yneQi0/state/commands.json","count":0}
{"ts":"2026-10-27T00:34:01.358Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:01.359Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:01.359Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:01.367Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-b235Gy/commands.json","count":0}
{"ts":"2026-10-27T00:34:01.864Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:01.865Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:01.866Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:01.873Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-9pwIfl/commands.json","count":0}
{"ts":"2026-10-27T00:34:02.353Z","level":"info","msg":"work agent proxy lifecycle","event":"disconnected","machineId":"07dcb498c6bf7f68d49c36161c94e02d","requestId":"bef3a1a9-1ea2-4156-99cb-021cd95c05ff","paneId":"2d953a04-edc2-48f4-9e19-9b093bd1233d","cause":"channel_unavailable"}
{"ts":"2026-10-27T00:34:02.353Z","level":"info","msg":"work agent proxy lifecycle","event":"reconnect_failed","machineId":"07dcb498c6bf7f68d49c36161c94e02d","requestId":"bef3a1a9-1ea2-4156-99cb-021cd95c05ff","paneId":"2d953a04-edc2-48f4-9e19-9b093bd1233d","cause":"connect_failed"}
{"ts":"2026-10-27T00:34:02.639Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:02.640Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:02.640Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:02.646Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-mD69Uo/commands.json","count":0}
{"ts":"2026-10-27T00:34:03.122Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:03.122Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:03.123Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:03.132Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-wsclient-test-X5gXJH/commands.json","count":0}
{"ts":"2026-10-27T00:34:04.598Z","level":"info","msg":"work agent proxy lifecycle","event":"reconnect_failed","machineId":"07dcb498c6bf7f68d49c36161c94e02d","requestId":"bef3a1a9-1ea2-4156-99cb-021cd95c05ff","paneId":"2d953a04-edc2-48f4-9e19-9b093bd1233d","cause":"connect_failed"}
{"ts":"2026-10-27T00:34:06.501Z","level":"info","msg":"work agent proxy lifecycle","event":"reconnected","machineId":"07dcb498c6bf7f68d49c36161c94e02d","requestId":"bef3a1a9-1ea2-4156-99cb-021cd95c05ff","paneId":"2d953a04-edc2-48f4-9e19-9b093bd1233d","elapsedMs":4147}
{"ts":"2026-10-27T00:34:06.636Z","level":"info","msg":"machine link closed","machine":"07dcb498c6bf7f68d49c36161c94e02d","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:34:06.636Z","level":"info","msg":"work agent proxy lifecycle","event":"operation_interrupted","machineId":"07dcb498c6bf7f68d49c36161c94e02d","requestId":"bef3a1a9-1ea2-4156-99cb-021cd95c05ff","paneId":"2d953a04-edc2-48f4-9e19-9b093bd1233d"}
{"ts":"2026-10-27T00:34:07.279Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:07.281Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:07.281Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:07.288Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-work-it-2LgIDt/a/commands.json","count":0}
{"ts":"2026-10-27T00:34:07.364Z","level":"info","msg":"work agent proxy lifecycle","event":"disconnected","machineId":"07dcb498c6bf7f68d49c36161c94e02d","requestId":"bef3a1a9-1ea2-4156-99cb-021cd95c05ff","paneId":"2d953a04-edc2-48f4-9e19-9b093bd1233d","cause":"channel_unavailable"}
{"ts":"2026-10-27T00:34:07.365Z","level":"info","msg":"work agent proxy lifecycle","event":"reconnect_failed","machineId":"07dcb498c6bf7f68d49c36161c94e02d","requestId":"bef3a1a9-1ea2-4156-99cb-021cd95c05ff","paneId":"2d953a04-edc2-48f4-9e19-9b093bd1233d","cause":"connect_failed"}
{"ts":"2026-10-27T00:34:07.745Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:07.747Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:07.747Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:07.751Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-work-it-2LgIDt/b/commands.json","count":0}
{"ts":"2026-10-27T00:34:07.947Z","level":"info","msg":"work agent proxy lifecycle","event":"reconnected","machineId":"07dcb498c6bf7f68d49c36161c94e02d","requestId":"bef3a1a9-1ea2-4156-99cb-021cd95c05ff","paneId":"2d953a04-edc2-48f4-9e19-9b093bd1233d","elapsedMs":583}
{"ts":"2026-10-27T00:34:14.332Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:14.334Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:14.334Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:14.340Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-exec-it-cVvmKn/a/commands.json","count":0}
{"ts":"2026-10-27T00:34:14.799Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:14.799Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:14.800Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:14.804Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-exec-it-cVvmKn/b/commands.json","count":0}
{"ts":"2026-10-27T00:34:15.773Z","level":"info","msg":"machine link closed","machine":"5473cc69f4fb0c45f72f90dc121d65e5","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:34:16.319Z","level":"info","msg":"work agent proxy lifecycle","event":"closed","machineId":"07dcb498c6bf7f68d49c36161c94e02d","requestId":"bef3a1a9-1ea2-4156-99cb-021cd95c05ff","paneId":"2d953a04-edc2-48f4-9e19-9b093bd1233d","reason":"target_validation_failed"}
{"ts":"2026-10-27T00:34:16.327Z","level":"info","msg":"machine link closed","machine":"07dcb498c6bf7f68d49c36161c94e02d","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:34:34.156Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:34.158Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:34.158Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:34.164Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-PTc0EP/commands.json","count":0}
{"ts":"2026-10-27T00:34:34.937Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:34.937Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:34.938Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:34.942Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-2TrwMP/commands.json","count":0}
{"ts":"2026-10-27T00:34:34.964Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:34.965Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:34.965Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:34.971Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-sECj03/commands.json","count":0}
{"ts":"2026-10-27T00:34:35.429Z","level":"info","msg":"extension started","extension":"user:env","run":"83a81624-c0a4-469b-9856-c406fba01857","state":"running"}
{"ts":"2026-10-27T00:34:35.740Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:35.801Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:35.801Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:35.807Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-2TrwMP/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:34:35.844Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:35.845Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:35.845Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:35.850Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-uVzyt4/commands.json","count":0}
{"ts":"2026-10-27T00:34:36.316Z","level":"info","msg":"extension started","extension":"user:a","run":"92416250-fccc-4fff-b742-970418e8d0a8","state":"running"}
{"ts":"2026-10-27T00:34:36.322Z","level":"info","msg":"extension started","extension":"user:b","run":"5adaad5d-a148-4b8c-aeee-f2c8a6e8674a","state":"running"}
{"ts":"2026-10-27T00:34:36.580Z","level":"info","msg":"extension started","extension":"user:c","run":"bb9aa0f2-5251-4b9d-bb77-8b4a085fa0ac","state":"running"}
{"ts":"2026-10-27T00:34:36.709Z","level":"info","msg":"extension started","extension":"user:a","run":"c03db0b3-c2df-4a01-b7ce-3048c504afe5","state":"running"}
{"ts":"2026-10-27T00:34:36.884Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:36.885Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:36.885Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:36.891Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-l670UG/commands.json","count":0}
{"ts":"2026-10-27T00:34:37.019Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:37.020Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:37.020Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:37.024Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-2TrwMP/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:34:37.044Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:37.045Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:37.045Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:37.049Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-2TrwMP/sessions/other/commands.json","count":0}
{"ts":"2026-10-27T00:34:37.266Z","level":"info","msg":"extension started","extension":"user:basic","run":"aec1a736-68c2-4749-b0c1-85a4166b432a","state":"running"}
{"ts":"2026-10-27T00:34:37.293Z","level":"info","msg":"display set","paneId":"1baabe23-26ae-44c6-8f22-79e20d01226b","name":"m","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T00:34:37.304Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"1baabe23-26ae-44c6-8f22-79e20d01226b","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:34:37.430Z","level":"info","msg":"display set","paneId":"1baabe23-26ae-44c6-8f22-79e20d01226b","name":"w","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T00:34:37.576Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:37.577Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:37.578Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:37.600Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-SZlKZx/commands.json","count":0}
{"ts":"2026-10-27T00:34:37.953Z","level":"info","msg":"display closed","paneId":"1baabe23-26ae-44c6-8f22-79e20d01226b","name":"m","reason":"closed"}
{"ts":"2026-10-27T00:34:38.009Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:38.010Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:38.010Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:38.015Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-B0suDv/commands.json","count":0}
{"ts":"2026-10-27T00:34:38.052Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:38.053Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:38.053Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:38.059Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:38.059Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:38.059Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:38.060Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-USuLHB/commands.json","count":0}
{"ts":"2026-10-27T00:34:38.064Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-C2J3N5/commands.json","count":0}
{"ts":"2026-10-27T00:34:38.107Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:38.109Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:38.110Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:38.126Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-C2J3N5/commands.json","count":0}
{"ts":"2026-10-27T00:34:38.466Z","level":"info","msg":"extension started","extension":"user:own","run":"aa6397a4-00ae-4cef-a9b9-50c0b7ccc73d","state":"running"}
{"ts":"2026-10-27T00:34:38.487Z","level":"info","msg":"display set","paneId":"07186f65-43ca-490d-a214-8d41bc00b9d4","name":"mine","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T00:34:38.494Z","level":"info","msg":"display set","paneId":"07186f65-43ca-490d-a214-8d41bc00b9d4","name":"theirs","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T00:34:38.494Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"07186f65-43ca-490d-a214-8d41bc00b9d4","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:34:38.557Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:38.558Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:38.558Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:38.565Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-Agaxgc/commands.json","count":0}
{"ts":"2026-10-27T00:34:39.134Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"07186f65-43ca-490d-a214-8d41bc00b9d4","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:34:39.137Z","level":"info","msg":"display closed","paneId":"07186f65-43ca-490d-a214-8d41bc00b9d4","name":"mine","reason":"closed"}
{"ts":"2026-10-27T00:34:39.137Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"07186f65-43ca-490d-a214-8d41bc00b9d4","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-27T00:34:39.139Z","level":"info","msg":"display set","paneId":"07186f65-43ca-490d-a214-8d41bc00b9d4","name":"mine","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T00:34:39.139Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"07186f65-43ca-490d-a214-8d41bc00b9d4","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-27T00:34:39.143Z","level":"info","msg":"extension exited","extension":"user:own","run":"aa6397a4-00ae-4cef-a9b9-50c0b7ccc73d","code":137,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:34:39.185Z","level":"info","msg":"extension started","extension":"user:own","run":"892cdea0-0069-4358-98ce-d3116eefffc0","state":"running"}
{"ts":"2026-10-27T00:34:39.235Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"07186f65-43ca-490d-a214-8d41bc00b9d4","connId":"pane-socket:5","code":"ok"}
{"ts":"2026-10-27T00:34:39.290Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:39.291Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:39.291Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:39.297Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-Agaxgc/commands.json","count":0}
{"ts":"2026-10-27T00:34:39.345Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:39.345Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:39.346Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:39.352Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-7MGRap/commands.json","count":0}
{"ts":"2026-10-27T00:34:39.730Z","level":"info","msg":"extension started","extension":"user:crash","run":"3a93edfe-fac7-4d53-bb04-14b37b852ef4","state":"running"}
{"ts":"2026-10-27T00:34:39.776Z","level":"info","msg":"extension exited","extension":"user:crash","run":"3a93edfe-fac7-4d53-bb04-14b37b852ef4","code":1,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:34:39.804Z","level":"info","msg":"extension started","extension":"user:crash","run":"0b85952c-f693-4248-8f69-6debac0fc03a","state":"running"}
{"ts":"2026-10-27T00:34:39.858Z","level":"info","msg":"extension exited","extension":"user:crash","run":"0b85952c-f693-4248-8f69-6debac0fc03a","code":1,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:34:39.908Z","level":"info","msg":"extension started","extension":"user:crash","run":"e222646d-91df-4f18-a5a2-cbce76610201","state":"running"}
{"ts":"2026-10-27T00:34:39.936Z","level":"info","msg":"extension exited","extension":"user:crash","run":"e222646d-91df-4f18-a5a2-cbce76610201","code":1,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:34:40.043Z","level":"info","msg":"extension started","extension":"user:crash","run":"c92ced21-3313-4684-b34b-5b98a88630db","state":"running"}
{"ts":"2026-10-27T00:34:40.103Z","level":"info","msg":"extension exited","extension":"user:crash","run":"c92ced21-3313-4684-b34b-5b98a88630db","code":1,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:34:40.141Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:40.142Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:40.142Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:40.148Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-IeebyO/commands.json","count":0}
{"ts":"2026-10-27T00:34:40.192Z","level":"info","msg":"extension started","extension":"user:crash","run":"97031175-1a7b-4dc1-99be-6a8e059cd701","state":"running"}
{"ts":"2026-10-27T00:34:40.234Z","level":"info","msg":"extension exited","extension":"user:crash","run":"97031175-1a7b-4dc1-99be-6a8e059cd701","code":1,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:34:40.235Z","level":"warn","msg":"extension failed","extension":"user:crash","state":"failed","failures":5}
{"ts":"2026-10-27T00:34:40.338Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:40.339Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:40.339Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:40.346Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-2echh5/commands.json","count":0}
{"ts":"2026-10-27T00:34:40.754Z","level":"info","msg":"extension started","extension":"user:a","run":"3e8d8939-9e57-439f-a2e7-4086c6c380fa","state":"running"}
{"ts":"2026-10-27T00:34:40.761Z","level":"info","msg":"extension started","extension":"user:b","run":"b8a11a3f-e955-44a4-85c9-ca6138a8d63e","state":"running"}
{"ts":"2026-10-27T00:34:41.049Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:41.049Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:41.049Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:41.056Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-IeebyO/commands.json","count":0}
{"ts":"2026-10-27T00:34:41.090Z","level":"info","msg":"extension exited","extension":"user:b","run":"b8a11a3f-e955-44a4-85c9-ca6138a8d63e","code":0,"signal":null,"reason":"exited"}
{"ts":"2026-10-27T00:34:41.896Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:41.897Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:41.897Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:41.902Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-IeebyO/commands.json","count":0}
{"ts":"2026-10-27T00:34:42.278Z","level":"info","msg":"agent resume skipped","paneId":"5f50f183-4423-4ec5-b437-019a12689242","reason":"no-session-ref"}
{"ts":"2026-10-27T00:34:42.583Z","level":"info","msg":"agent resume skipped","paneId":"03a020c9-ea0a-4bfb-8432-dff813069e49","reason":"no-session-ref"}
{"ts":"2026-10-27T00:34:42.717Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:42.718Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:42.718Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:42.723Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-q8mhC4/commands.json","count":0}
{"ts":"2026-10-27T00:34:43.286Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:43.286Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:43.286Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:43.295Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-NnbRzn/commands.json","count":0}
{"ts":"2026-10-27T00:34:43.358Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:43.359Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:43.359Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:43.367Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-FnUwsk/commands.json","count":0}
{"ts":"2026-10-27T00:34:43.397Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:43.398Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:43.398Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:43.407Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-w8o6sD/commands.json","count":0}
{"ts":"2026-10-27T00:34:43.480Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:43.480Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:43.480Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:43.487Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-vXMTSw/commands.json","count":0}
{"ts":"2026-10-27T00:34:43.686Z","level":"info","msg":"extension started","extension":"user:noisy","run":"f23e1fe2-1174-4cac-aa8e-ddcf7bd73a3b","state":"running"}
{"ts":"2026-10-27T00:34:43.945Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:43.946Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:43.946Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:43.952Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-yip7fT/commands.json","count":0}
{"ts":"2026-10-27T00:34:43.961Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:43.961Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:43.962Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:43.969Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-oRrdpV/commands.json","count":0}
{"ts":"2026-10-27T00:34:44.348Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:44.348Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:44.348Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:44.355Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-lcTqp9/commands.json","count":0}
{"ts":"2026-10-27T00:34:44.366Z","level":"info","msg":"extension started","extension":"user:once","run":"72f030ac-400e-45e2-b1dd-aed50e8a7546","state":"running"}
{"ts":"2026-10-27T00:34:44.545Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:44.545Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:44.545Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:44.553Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-oRrdpV/commands.json","count":0}
{"ts":"2026-10-27T00:34:44.953Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:44.953Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:44.954Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:44.962Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-fMbPPN/commands.json","count":0}
{"ts":"2026-10-27T00:34:45.025Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:45.026Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:45.026Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:45.047Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-jbCylK/commands.json","count":0}
{"ts":"2026-10-27T00:34:45.381Z","level":"info","msg":"extension started","extension":"user:four","run":"2a1bfa72-20c7-4986-b22c-c33defd90fc2","state":"running"}
{"ts":"2026-10-27T00:34:45.410Z","level":"info","msg":"display set","paneId":"99aaa4d3-6ce1-45ea-8ea1-d7ab128e4a75","name":"e1","kind":"panel","format":"html","bytes":1,"rev":1}
{"ts":"2026-10-27T00:34:45.411Z","level":"info","msg":"display set","paneId":"99aaa4d3-6ce1-45ea-8ea1-d7ab128e4a75","name":"e2","kind":"panel","format":"html","bytes":1,"rev":1}
{"ts":"2026-10-27T00:34:45.508Z","level":"info","msg":"display set","paneId":"99aaa4d3-6ce1-45ea-8ea1-d7ab128e4a75","name":"p1","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T00:34:45.509Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"99aaa4d3-6ce1-45ea-8ea1-d7ab128e4a75","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:34:45.511Z","level":"info","msg":"display set","paneId":"99aaa4d3-6ce1-45ea-8ea1-d7ab128e4a75","name":"p2","kind":"panel","format":"html","bytes":8,"rev":1}
{"ts":"2026-10-27T00:34:45.511Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"99aaa4d3-6ce1-45ea-8ea1-d7ab128e4a75","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:34:45.897Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:45.898Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:45.898Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:45.908Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-gK7raA/commands.json","count":0}
{"ts":"2026-10-27T00:34:46.220Z","level":"info","msg":"display closed","paneId":"99aaa4d3-6ce1-45ea-8ea1-d7ab128e4a75","name":"e1","reason":"closed"}
{"ts":"2026-10-27T00:34:46.220Z","level":"info","msg":"display closed","paneId":"99aaa4d3-6ce1-45ea-8ea1-d7ab128e4a75","name":"e2","reason":"closed"}
{"ts":"2026-10-27T00:34:46.308Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:46.309Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:46.309Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:46.316Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-O23hdp/commands.json","count":0}
{"ts":"2026-10-27T00:34:46.751Z","level":"info","msg":"extension started","extension":"user:bad","run":"dc3f0afb-47b2-42b7-9fa8-3b2511547d7d","state":"running"}
{"ts":"2026-10-27T00:34:46.758Z","level":"info","msg":"extension started","extension":"user:big","run":"07c8104b-69e2-4b79-87d9-3862b0a27fd2","state":"running"}
{"ts":"2026-10-27T00:34:46.784Z","level":"warn","msg":"extension stopped","extension":"user:bad","run":"dc3f0afb-47b2-42b7-9fa8-3b2511547d7d","reason":"bad_lines"}
{"ts":"2026-10-27T00:34:46.787Z","level":"info","msg":"extension exited","extension":"user:bad","run":"dc3f0afb-47b2-42b7-9fa8-3b2511547d7d","code":null,"signal":"SIGTERM","reason":"bad_lines"}
{"ts":"2026-10-27T00:34:46.903Z","level":"info","msg":"extension started","extension":"user:bad","run":"a039a3fb-028f-47ae-8e04-2469427a89d1","state":"running"}
{"ts":"2026-10-27T00:34:46.945Z","level":"warn","msg":"extension stopped","extension":"user:bad","run":"a039a3fb-028f-47ae-8e04-2469427a89d1","reason":"bad_lines"}
{"ts":"2026-10-27T00:34:46.945Z","level":"info","msg":"extension exited","extension":"user:bad","run":"a039a3fb-028f-47ae-8e04-2469427a89d1","code":null,"signal":"SIGTERM","reason":"bad_lines"}
{"ts":"2026-10-27T00:34:46.954Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:46.956Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:46.962Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:46.976Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-bOxHa5/commands.json","count":0}
{"ts":"2026-10-27T00:34:46.994Z","level":"info","msg":"extension started","extension":"user:bad","run":"903fca5f-1060-4251-aa1a-8c5ed4590d06","state":"running"}
{"ts":"2026-10-27T00:34:47.020Z","level":"warn","msg":"extension stopped","extension":"user:bad","run":"903fca5f-1060-4251-aa1a-8c5ed4590d06","reason":"bad_lines"}
{"ts":"2026-10-27T00:34:47.020Z","level":"info","msg":"extension exited","extension":"user:bad","run":"903fca5f-1060-4251-aa1a-8c5ed4590d06","code":null,"signal":"SIGTERM","reason":"bad_lines"}
{"ts":"2026-10-27T00:34:47.184Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:47.185Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:47.185Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:47.193Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-zHaZW2/commands.json","count":0}
{"ts":"2026-10-27T00:34:47.682Z","level":"info","msg":"extension started","extension":"user:plain","run":"e17311a9-b7df-443b-a5d4-fd1523b8ff94","state":"running"}
{"ts":"2026-10-27T00:34:47.689Z","level":"info","msg":"extension started","extension":"user:allowed","run":"b96563bb-12cb-40b1-944e-6283642528cf","state":"running"}
{"ts":"2026-10-27T00:34:47.690Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:47.691Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:47.691Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:47.697Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-bOxHa5/commands.json","count":0}
{"ts":"2026-10-27T00:34:47.822Z","level":"info","msg":"display script enabled","byClientId":"8c983df4-66d6-44ec-b248-6ea118dc4c37","byKind":"external"}
{"ts":"2026-10-27T00:34:47.933Z","level":"info","msg":"display script enabled","byClientId":"8c983df4-66d6-44ec-b248-6ea118dc4c37","byKind":"external"}
{"ts":"2026-10-27T00:34:47.935Z","level":"info","msg":"display set","paneId":"190740f6-f850-4680-8d47-315b1fcebd04","name":"g","kind":"panel","format":"script-html","bytes":18,"rev":1}
{"ts":"2026-10-27T00:34:48.014Z","level":"info","msg":"agent resume skipped","paneId":"76a08562-0ac8-4799-92c4-dc2c2ad1e550","reason":"no-session-ref"}
{"ts":"2026-10-27T00:34:48.036Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"190740f6-f850-4680-8d47-315b1fcebd04","connId":"pane-socket:1","code":"display_closed"}
{"ts":"2026-10-27T00:34:48.092Z","level":"info","msg":"display closed","paneId":"190740f6-f850-4680-8d47-315b1fcebd04","name":"g","reason":"script_disabled"}
{"ts":"2026-10-27T00:34:48.177Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:48.177Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:48.177Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:48.184Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-UxXzXl/commands.json","count":0}
{"ts":"2026-10-27T00:34:48.319Z","level":"info","msg":"agent resume skipped","paneId":"22a85337-c10d-49f0-83d6-e7249ff8dc6f","reason":"no-session-ref"}
{"ts":"2026-10-27T00:34:48.400Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:48.401Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:48.401Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:48.409Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-e2e-PGralh/commands.json","count":0}
{"ts":"2026-10-27T00:34:48.641Z","level":"info","msg":"extension started","extension":"user:hello","run":"ff932c5e-6a66-4714-ad11-f0793e5bbdf8","state":"running"}
{"ts":"2026-10-27T00:34:48.670Z","level":"info","msg":"display set","paneId":"aaa612e3-5c96-43c1-9fe5-01b4d6a26a3a","name":"hello","kind":"band","format":"text","bytes":33,"rev":1}
{"ts":"2026-10-27T00:34:48.803Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"aaa612e3-5c96-43c1-9fe5-01b4d6a26a3a","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:34:48.862Z","level":"info","msg":"display closed","paneId":"aaa612e3-5c96-43c1-9fe5-01b4d6a26a3a","name":"hello","reason":"closed"}
{"ts":"2026-10-27T00:34:48.893Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:48.894Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:48.894Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:48.901Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-wtdir-CjDOin/commands.json","count":0}
{"ts":"2026-10-27T00:34:48.939Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"aaa612e3-5c96-43c1-9fe5-01b4d6a26a3a","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:34:48.974Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:48.975Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:48.975Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:48.983Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-FiF7GZ/commands.json","count":0}
{"ts":"2026-10-27T00:34:49.402Z","level":"info","msg":"extension started","extension":"user:t10","run":"3d0fe585-0c7e-4b10-8e3a-d9e8cfe6d84d","state":"running"}
{"ts":"2026-10-27T00:34:49.686Z","level":"info","msg":"extension started","extension":"user:t10","run":"f1dcec36-52ca-4b74-a32e-ca7dd17608a3","state":"running"}
{"ts":"2026-10-27T00:34:49.820Z","level":"info","msg":"pane socket: request","op":"extension.list","paneId":"71ca0831-dd8d-4933-9bfe-af53773b0f49","connId":"pane-socket:1","code":"unknown_op"}
{"ts":"2026-10-27T00:34:49.821Z","level":"info","msg":"pane socket: request","op":"extension.setEnabled","paneId":"71ca0831-dd8d-4933-9bfe-af53773b0f49","connId":"pane-socket:2","code":"unknown_op"}
{"ts":"2026-10-27T00:34:49.822Z","level":"info","msg":"pane socket: request","op":"extension.reload","paneId":"71ca0831-dd8d-4933-9bfe-af53773b0f49","connId":"pane-socket:3","code":"unknown_op"}
{"ts":"2026-10-27T00:34:49.866Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:49.866Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:49.867Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:49.872Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-ntBNMf/commands.json","count":0}
{"ts":"2026-10-27T00:34:49.897Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:49.898Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:49.898Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:49.905Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-gitnow-YvOc8C/commands.json","count":0}
{"ts":"2026-10-27T00:34:50.654Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:50.656Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:50.656Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:50.677Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-shutdown-zLd9TK/commands.json","count":0}
{"ts":"2026-10-27T00:34:51.099Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:51.100Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:51.100Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:51.116Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-agent-U5WUwi/commands.json","count":0}
{"ts":"2026-10-27T00:34:52.284Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:52.285Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:52.285Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:52.291Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-diWJri/commands.json","count":0}
{"ts":"2026-10-27T00:34:52.576Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:52.577Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:52.578Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:52.585Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-64ANRW/commands.json","count":0}
{"ts":"2026-10-27T00:34:52.668Z","level":"info","msg":"extension started","extension":"user:slow","run":"546b107f-9b96-4206-8818-f2fef704720b","state":"running"}
{"ts":"2026-10-27T00:34:52.859Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:52.860Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:52.860Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:52.868Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-A96DNg/commands.json","count":0}
{"ts":"2026-10-27T00:34:53.434Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:53.435Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:53.435Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:53.441Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-64ANRW/commands.json","count":0}
{"ts":"2026-10-27T00:34:53.759Z","level":"info","msg":"agent resume skipped","paneId":"561252eb-77b2-426d-b2a1-31577a38c31a","reason":"no-session-ref"}
{"ts":"2026-10-27T00:34:54.063Z","level":"info","msg":"agent resume skipped","paneId":"162612a1-40f5-4740-baf2-6f42b8e06fc2","reason":"no-session-ref"}
{"ts":"2026-10-27T00:34:54.200Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:54.201Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:54.201Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:54.207Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-Aala6v/commands.json","count":0}
{"ts":"2026-10-27T00:34:54.678Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:54.679Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:54.679Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:54.686Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-A96DNg/commands.json","count":0}
{"ts":"2026-10-27T00:34:55.008Z","level":"info","msg":"agent resume skipped","paneId":"c91d0a5d-e236-419d-b620-ba3079ec8645","reason":"no-session-ref"}
{"ts":"2026-10-27T00:34:55.152Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:55.153Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:55.153Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:55.161Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-mXkaqL/commands.json","count":0}
{"ts":"2026-10-27T00:34:55.313Z","level":"info","msg":"agent resume skipped","paneId":"7ec162fd-989e-4660-a6c3-0aad0e034e2e","reason":"no-session-ref"}
{"ts":"2026-10-27T00:34:55.548Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:55.548Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:55.548Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:55.554Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-mXkaqL/commands.json","count":0}
{"ts":"2026-10-27T00:34:55.565Z","level":"info","msg":"removed session-history.json","reason":"pane history disabled"}
{"ts":"2026-10-27T00:34:55.873Z","level":"info","msg":"agent resume skipped","paneId":"32814ce7-7b8a-4412-9fd8-23747e20a5d9","reason":"no-session-ref"}
{"ts":"2026-10-27T00:34:55.986Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:55.987Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:55.987Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:55.994Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-qsdu5n/commands.json","count":0}
{"ts":"2026-10-27T00:34:56.029Z","level":"info","msg":"removed session-history.json","reason":"session.json was not restored"}
{"ts":"2026-10-27T00:34:56.378Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:56.379Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:56.379Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:56.384Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-ACDXWR/commands.json","count":0}
{"ts":"2026-10-27T00:34:56.415Z","level":"warn","msg":"session.json was corrupt; starting fresh","backupPath":"/tmp/soda-history-it-ACDXWR/session-backups/2026-10-27T00-34-56-415Z.json"}
{"ts":"2026-10-27T00:34:56.416Z","level":"info","msg":"removed session-history.json","reason":"session.json was not restored"}
{"ts":"2026-10-27T00:34:56.450Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:56.451Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:56.451Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:56.458Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-RYB0t0/commands.json","count":0}
{"ts":"2026-10-27T00:34:56.765Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:56.765Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:56.765Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:56.770Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-fFrZQt/commands.json","count":0}
{"ts":"2026-10-27T00:34:57.147Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:57.147Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:57.147Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:57.152Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-fFrZQt/commands.json","count":0}
{"ts":"2026-10-27T00:34:57.161Z","level":"warn","msg":"session-history.json was corrupt; restoring without pane history","reason":"invalid JSON"}
{"ts":"2026-10-27T00:34:57.465Z","level":"info","msg":"agent resume skipped","paneId":"f4d1f23e-966f-4e91-8e96-8ad2b7603b11","reason":"no-session-ref"}
{"ts":"2026-10-27T00:34:57.525Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:57.526Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:57.526Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:57.534Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-ilP9SP/commands.json","count":0}
{"ts":"2026-10-27T00:34:57.926Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:57.927Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:57.927Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:57.933Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-ilP9SP/commands.json","count":0}
{"ts":"2026-10-27T00:34:57.942Z","level":"warn","msg":"session-history.json was corrupt; restoring without pane history","reason":"panes: invalid_type"}
{"ts":"2026-10-27T00:34:58.246Z","level":"info","msg":"agent resume skipped","paneId":"46d13b87-26c2-42dc-ad96-0ce374a7d8dc","reason":"no-session-ref"}
{"ts":"2026-10-27T00:34:58.308Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:58.309Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:58.309Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:58.316Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-history-it-X6hBDh/commands.json","count":0}
{"ts":"2026-10-27T00:34:58.704Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:58.706Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:58.707Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:58.714Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-nYi52O/state-AQd4LK/commands.json","count":0}
{"ts":"2026-10-27T00:34:59.020Z","level":"warn","msg":"pane history save failed","path":"/tmp/soda-history-it-X6hBDh/session-history.json","error":"EISDIR: illegal operation on a directory, rename '/tmp/soda-history-it-X6hBDh/.tmp-on8TQr/write' -> '/tmp/soda-history-it-X6hBDh/session-history.json'"}
{"ts":"2026-10-27T00:34:59.068Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:59.069Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:59.069Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:59.089Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-zWC2e0/commands.json","count":0}
{"ts":"2026-10-27T00:34:59.490Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:59.491Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:59.491Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:59.497Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-zWC2e0/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:34:59.624Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:59.626Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:59.626Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:59.633Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-AnmSY3/commands.json","count":0}
{"ts":"2026-10-27T00:34:59.980Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:34:59.981Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:34:59.981Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:34:59.987Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-J5A4J3/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:35:00.423Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:00.425Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:00.425Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:00.433Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-J5A4J3/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:35:00.575Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:00.576Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:00.576Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:00.583Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-nYi52O/state-ABhk7i/commands.json","count":0}
{"ts":"2026-10-27T00:35:00.702Z","level":"info","msg":"pane socket: request","op":"extension.approve","paneId":"058b2216-7186-4bcf-b310-3db7154117f8","connId":"pane-socket:1","code":"unknown_op"}
{"ts":"2026-10-27T00:35:00.707Z","level":"info","msg":"pane socket: request","op":"extension.deny","paneId":"058b2216-7186-4bcf-b310-3db7154117f8","connId":"pane-socket:2","code":"unknown_op"}
{"ts":"2026-10-27T00:35:00.710Z","level":"info","msg":"pane socket: request","op":"extension.revoke","paneId":"058b2216-7186-4bcf-b310-3db7154117f8","connId":"pane-socket:3","code":"unknown_op"}
{"ts":"2026-10-27T00:35:00.749Z","level":"info","msg":"agent resume skipped","paneId":"b46152ce-dcc1-4cb6-a74e-e7d0ec9ae2e9","reason":"no-session-ref"}
{"ts":"2026-10-27T00:35:00.805Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:00.806Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:00.806Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:00.811Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-J5A4J3/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:35:01.059Z","level":"info","msg":"extension started","extension":"project:646619672b3aa8ab135ed1febace7bec79a8b2cb7904efa273b3219622d01f1c:p2","run":"1cabff46-2065-4e77-97d2-55f3919fc455","state":"running"}
{"ts":"2026-10-27T00:35:01.126Z","level":"info","msg":"agent resume skipped","paneId":"b46152ce-dcc1-4cb6-a74e-e7d0ec9ae2e9","reason":"no-session-ref"}
{"ts":"2026-10-27T00:35:01.188Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:01.188Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:01.188Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:01.194Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-AnmSY3/commands.json","count":0}
{"ts":"2026-10-27T00:35:01.201Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:01.201Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:01.201Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:01.209Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-6Lq3Ex/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:35:01.225Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:01.225Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:01.226Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:01.231Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-6Lq3Ex/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:35:01.248Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:01.248Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:01.248Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:01.255Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-6Lq3Ex/commands.json","count":0}
{"ts":"2026-10-27T00:35:01.269Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:01.269Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:01.269Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:01.274Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-6Lq3Ex/commands.json","count":0}
{"ts":"2026-10-27T00:35:01.310Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:01.310Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:01.311Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:01.315Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-cy4P7b/commands.json","count":0}
{"ts":"2026-10-27T00:35:01.510Z","level":"info","msg":"agent resume skipped","paneId":"058b2216-7186-4bcf-b310-3db7154117f8","reason":"no-session-ref"}
{"ts":"2026-10-27T00:35:01.752Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:01.753Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:01.753Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:01.760Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-kpYgxe/commands.json","count":0}
{"ts":"2026-10-27T00:35:01.766Z","level":"warn","msg":"cannot write serve.json","error":"EISDIR: illegal operation on a directory, rename '/tmp/soda-compose-named-ui-kpYgxe/.tmp-6A0VkV/write' -> '/tmp/soda-compose-named-ui-kpYgxe/serve.json'"}
{"ts":"2026-10-27T00:35:01.815Z","level":"info","msg":"agent resume skipped","paneId":"b0d0a849-2fbd-4bfa-99bb-c0e083c5abf7","reason":"no-session-ref"}
{"ts":"2026-10-27T00:35:01.847Z","level":"info","msg":"extension started","extension":"project:646619672b3aa8ab135ed1febace7bec79a8b2cb7904efa273b3219622d01f1c:p2","run":"9a6fa6a1-c3fa-4cc2-af75-caae22902e4c","state":"running"}
{"ts":"2026-10-27T00:35:01.890Z","level":"warn","msg":"subagents: too many, not counting more","paneId":"de2d528f-e5f5-4ff1-bebe-fda06047acc9","limit":256}
{"ts":"2026-10-27T00:35:01.976Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:01.977Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:01.977Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:01.984Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-nYi52O/state-AKzIxa/commands.json","count":0}
{"ts":"2026-10-27T00:35:02.145Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:02.146Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:02.146Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:02.152Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-fI1eLr/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:35:02.328Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:02.329Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:02.329Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:02.337Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-AnmSY3/sessions/other/commands.json","count":0}
{"ts":"2026-10-27T00:35:02.536Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:02.536Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:02.536Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:02.542Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-fI1eLr/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:35:02.560Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:02.561Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:02.561Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:02.567Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-named-ui-fI1eLr/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:35:03.124Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:03.126Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:03.126Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:03.132Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-IReDXV/commands.json","count":0}
{"ts":"2026-10-27T00:35:03.213Z","level":"info","msg":"extension started","extension":"project:646619672b3aa8ab135ed1febace7bec79a8b2cb7904efa273b3219622d01f1c:p2","run":"cf67b7b6-8ac2-418d-93f2-3683cc0326db","state":"running"}
{"ts":"2026-10-27T00:35:03.402Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:03.403Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:03.403Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:03.424Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-dCucr4/commands.json","count":0}
{"ts":"2026-10-27T00:35:03.800Z","level":"info","msg":"display script enabled","byClientId":"9410bcc1-e05d-476e-9fb5-9f7ca9a3fc87","byKind":"external"}
{"ts":"2026-10-27T00:35:03.862Z","level":"info","msg":"display set","paneId":"6bb5d174-3cb3-4fe5-a44a-25f352564383","name":"main","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T00:35:03.863Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"6bb5d174-3cb3-4fe5-a44a-25f352564383","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:35:03.888Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"6bb5d174-3cb3-4fe5-a44a-25f352564383","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:35:03.947Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"6bb5d174-3cb3-4fe5-a44a-25f352564383","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-27T00:35:03.950Z","level":"info","msg":"display closed","paneId":"6bb5d174-3cb3-4fe5-a44a-25f352564383","name":"main","reason":"closed"}
{"ts":"2026-10-27T00:35:03.951Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"6bb5d174-3cb3-4fe5-a44a-25f352564383","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-27T00:35:03.975Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"6bb5d174-3cb3-4fe5-a44a-25f352564383","connId":"pane-socket:5","code":"ok"}
{"ts":"2026-10-27T00:35:03.976Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"6bb5d174-3cb3-4fe5-a44a-25f352564383","connId":"pane-socket:6","code":"ok"}
{"ts":"2026-10-27T00:35:04.015Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:04.016Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:04.016Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:04.021Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-BYduIU/commands.json","count":0}
{"ts":"2026-10-27T00:35:04.041Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:04.042Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:04.042Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:04.049Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-nYi52O/state-v6Axza/commands.json","count":0}
{"ts":"2026-10-27T00:35:04.457Z","level":"info","msg":"display script enabled","byClientId":"54ab8624-3769-485c-a74b-ccbb05d99074","byKind":"external"}
{"ts":"2026-10-27T00:35:04.470Z","level":"info","msg":"display set","paneId":"2f24abc5-f006-47f9-b9d6-47cb5909215f","name":"big","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:35:04.470Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"2f24abc5-f006-47f9-b9d6-47cb5909215f","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:35:04.479Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"2f24abc5-f006-47f9-b9d6-47cb5909215f","connId":"pane-socket:2","code":"invalid_display"}
{"ts":"2026-10-27T00:35:04.514Z","level":"info","msg":"extension started","extension":"project:a4a85550b7f361e2d872cf8d86c9b936fa1c3ca0e08cce1d53c5d773e0904c8d:a","run":"dc3acc53-3d4b-4767-abfe-a05c563992cc","state":"running"}
{"ts":"2026-10-27T00:35:04.628Z","level":"info","msg":"extension started","extension":"project:a4a85550b7f361e2d872cf8d86c9b936fa1c3ca0e08cce1d53c5d773e0904c8d:b","run":"7faf297e-21b6-430b-8d22-db9b225999eb","state":"running"}
{"ts":"2026-10-27T00:35:04.669Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:04.671Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:04.671Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:04.679Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-cVkD8Y/commands.json","count":0}
{"ts":"2026-10-27T00:35:04.975Z","level":"info","msg":"extension started","extension":"project:a4a85550b7f361e2d872cf8d86c9b936fa1c3ca0e08cce1d53c5d773e0904c8d:a","run":"332bfaa5-6daf-40c8-9a15-abf2a88eaa50","state":"running"}
{"ts":"2026-10-27T00:35:05.120Z","level":"info","msg":"display script enabled","byClientId":"ec1496cd-ca1e-440a-bab4-2f34b13ea260","byKind":"external"}
{"ts":"2026-10-27T00:35:05.160Z","level":"info","msg":"display set","paneId":"5c6f25ee-9e8c-4508-b6e0-66e7f4525068","name":"q","kind":"panel","format":"html","bytes":2096128,"rev":1}
{"ts":"2026-10-27T00:35:05.161Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"5c6f25ee-9e8c-4508-b6e0-66e7f4525068","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:35:05.257Z","level":"info","msg":"pane socket: request","connId":"pane-socket:2","code":"bad_request"}
{"ts":"2026-10-27T00:35:05.285Z","level":"info","msg":"extension started","extension":"project:a4a85550b7f361e2d872cf8d86c9b936fa1c3ca0e08cce1d53c5d773e0904c8d:a","run":"9ebdd41a-fcb5-450e-adc0-5d627c070485","state":"running"}
{"ts":"2026-10-27T00:35:05.288Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:05.288Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:05.289Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:05.295Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-ZSN56c/commands.json","count":0}
{"ts":"2026-10-27T00:35:05.586Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:05.587Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:05.587Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:05.594Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-nYi52O/state-Nzk8xx/commands.json","count":0}
{"ts":"2026-10-27T00:35:05.645Z","level":"info","msg":"extension started","extension":"project:a4a85550b7f361e2d872cf8d86c9b936fa1c3ca0e08cce1d53c5d773e0904c8d:a","run":"a435792d-01a6-4c63-aeef-1a9764e9aad6","state":"running"}
{"ts":"2026-10-27T00:35:05.727Z","level":"info","msg":"display script enabled","byClientId":"20aec82c-be6b-490e-8398-be982ef3eef5","byKind":"external"}
{"ts":"2026-10-27T00:35:05.918Z","level":"info","msg":"extension started","extension":"project:a4a85550b7f361e2d872cf8d86c9b936fa1c3ca0e08cce1d53c5d773e0904c8d:a","run":"dcedca0c-c603-42c4-ab2f-f4236ad0145d","state":"running"}
{"ts":"2026-10-27T00:35:06.225Z","level":"info","msg":"display set","paneId":"2d799632-09f2-42d3-a753-006b3a10766e","name":"secret","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T00:35:06.227Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"15b0ad9f-03c6-4c8e-bd66-591672a5e33b","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:35:06.228Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"15b0ad9f-03c6-4c8e-bd66-591672a5e33b","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:35:06.229Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"15b0ad9f-03c6-4c8e-bd66-591672a5e33b","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-27T00:35:06.230Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"15b0ad9f-03c6-4c8e-bd66-591672a5e33b","connId":"pane-socket:4","code":"invalid_params"}
{"ts":"2026-10-27T00:35:06.231Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"15b0ad9f-03c6-4c8e-bd66-591672a5e33b","connId":"pane-socket:5","code":"invalid_params"}
{"ts":"2026-10-27T00:35:06.232Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"15b0ad9f-03c6-4c8e-bd66-591672a5e33b","connId":"pane-socket:6","code":"invalid_params"}
{"ts":"2026-10-27T00:35:06.232Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"15b0ad9f-03c6-4c8e-bd66-591672a5e33b","connId":"pane-socket:7","code":"invalid_params"}
{"ts":"2026-10-27T00:35:06.233Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"15b0ad9f-03c6-4c8e-bd66-591672a5e33b","connId":"pane-socket:8","code":"invalid_params"}
{"ts":"2026-10-27T00:35:06.731Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:06.732Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:06.732Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:06.739Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-oS8TkC/commands.json","count":0}
{"ts":"2026-10-27T00:35:07.242Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"15b0ad9f-03c6-4c8e-bd66-591672a5e33b","connId":"pane-socket:9","code":"ok"}
{"ts":"2026-10-27T00:35:07.281Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:07.282Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:07.283Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:07.289Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-m8xcdJ/commands.json","count":0}
{"ts":"2026-10-27T00:35:07.697Z","level":"info","msg":"display script enabled","byClientId":"94a4b228-7511-4b33-82d9-efdc65773260","byKind":"external"}
{"ts":"2026-10-27T00:35:07.749Z","level":"info","msg":"extension started","extension":"project:974f3a841d2b07e399f19e65df74ba3eeb56f58721c43c3af744dcd6be31ad60:p4","run":"a83b531c-9dac-4165-94fb-ee1bfac12dcf","state":"running"}
{"ts":"2026-10-27T00:35:07.753Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:07.755Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:07.755Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:07.763Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-nYi52O/state-WVtLlj/commands.json","count":0}
{"ts":"2026-10-27T00:35:07.810Z","level":"info","msg":"extension exited","extension":"project:974f3a841d2b07e399f19e65df74ba3eeb56f58721c43c3af744dcd6be31ad60:p4","run":"a83b531c-9dac-4165-94fb-ee1bfac12dcf","code":137,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:35:07.821Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"28da5aae-53cb-41cd-8cd1-128bd1027955","connId":"pane-socket:5","code":"display_busy"}
{"ts":"2026-10-27T00:35:08.162Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:08.162Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:08.163Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:08.170Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-FeYDyL/commands.json","count":0}
{"ts":"2026-10-27T00:35:08.581Z","level":"info","msg":"display script enabled","byClientId":"2e034120-5365-470b-a2a7-8d28676d3efa","byKind":"external"}
{"ts":"2026-10-27T00:35:08.753Z","level":"info","msg":"display set","paneId":"1d4948bb-274d-4de4-8a0b-cfeae9948613","name":"big","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:35:08.907Z","level":"info","msg":"display closed","paneId":"1d4948bb-274d-4de4-8a0b-cfeae9948613","name":"big","reason":"dismissed"}
{"ts":"2026-10-27T00:35:08.911Z","level":"info","msg":"display set","paneId":"1d4948bb-274d-4de4-8a0b-cfeae9948613","name":"again","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T00:35:08.915Z","level":"info","msg":"display reported","paneId":"1d4948bb-274d-4de4-8a0b-cfeae9948613","name":"again","problem":"navigated","format":"html"}
{"ts":"2026-10-27T00:35:08.915Z","level":"info","msg":"display closed","paneId":"1d4948bb-274d-4de4-8a0b-cfeae9948613","name":"again","reason":"navigated"}
{"ts":"2026-10-27T00:35:08.954Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:08.955Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:08.955Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:08.962Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-Bi0gkF/commands.json","count":0}
{"ts":"2026-10-27T00:35:09.149Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:09.150Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:09.151Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:09.172Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-nYi52O/state-uzN3KV/commands.json","count":0}
{"ts":"2026-10-27T00:35:09.425Z","level":"info","msg":"display script enabled","byClientId":"87376e1e-78e3-4e48-b1ef-1f724de8f9ba","byKind":"external"}
{"ts":"2026-10-27T00:35:09.427Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:09.428Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:09.428Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:09.437Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-Tg05Fn/commands.json","count":0}
{"ts":"2026-10-27T00:35:09.508Z","level":"info","msg":"display set","paneId":"0c745202-0160-46fa-80ab-a9b35b42bd24","name":"m","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T00:35:09.649Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:09.650Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:09.650Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:09.659Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-kI13bZ/commands.json","count":0}
{"ts":"2026-10-27T00:35:09.828Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:09.831Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:09.831Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:09.840Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-9kxjvd/commands.json","count":0}
{"ts":"2026-10-27T00:35:10.065Z","level":"info","msg":"display script enabled","byClientId":"38d305a8-21c4-41fd-ab74-2a1b6a2f791c","byKind":"external"}
{"ts":"2026-10-27T00:35:10.181Z","level":"info","msg":"display set","paneId":"a260154b-3543-438b-acf0-0f576eb08685","name":"p0","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:35:10.217Z","level":"info","msg":"display set","paneId":"a260154b-3543-438b-acf0-0f576eb08685","name":"p1","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:35:10.280Z","level":"info","msg":"display set","paneId":"a260154b-3543-438b-acf0-0f576eb08685","name":"p2","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:35:10.328Z","level":"info","msg":"display set","paneId":"a260154b-3543-438b-acf0-0f576eb08685","name":"p3","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:35:10.628Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:10.629Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:10.629Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:10.634Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-9Hpigh/commands.json","count":0}
{"ts":"2026-10-27T00:35:10.895Z","level":"info","msg":"extension started","extension":"project:f056baf598f58e60ff487871e27868127b135ffd3af54c44f48c7bcaed149ed7:p5","run":"37c779a4-b600-45f2-8ace-075f9bbe55db","state":"running"}
{"ts":"2026-10-27T00:35:11.174Z","level":"info","msg":"extension started","extension":"project:f056baf598f58e60ff487871e27868127b135ffd3af54c44f48c7bcaed149ed7:p5","run":"e43b69ad-2c61-42ea-a7e7-b826d07eccdb","state":"running"}
{"ts":"2026-10-27T00:35:11.268Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:11.269Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:11.269Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:11.277Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-Tg05Fn/sessions/other/commands.json","count":0}
{"ts":"2026-10-27T00:35:11.319Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:11.320Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:11.320Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:11.327Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-Aro6Ia/commands.json","count":0}
{"ts":"2026-10-27T00:35:11.420Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:11.421Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:11.422Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:11.430Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-nYi52O/state-oD3dFY/commands.json","count":0}
{"ts":"2026-10-27T00:35:11.553Z","level":"info","msg":"display set","paneId":"a1b19198-d9b0-4e0c-b3d2-1b9bd77a4202","name":"p0","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:35:11.578Z","level":"info","msg":"display set","paneId":"a1b19198-d9b0-4e0c-b3d2-1b9bd77a4202","name":"p1","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:35:11.611Z","level":"info","msg":"display set","paneId":"a1b19198-d9b0-4e0c-b3d2-1b9bd77a4202","name":"p2","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:35:11.638Z","level":"info","msg":"display set","paneId":"a1b19198-d9b0-4e0c-b3d2-1b9bd77a4202","name":"p3","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:35:11.663Z","level":"info","msg":"display set","paneId":"55c48ed6-2acc-435d-a812-ecedc2ca7c6c","name":"p0","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:35:11.691Z","level":"info","msg":"display set","paneId":"55c48ed6-2acc-435d-a812-ecedc2ca7c6c","name":"p1","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:35:11.721Z","level":"info","msg":"display set","paneId":"55c48ed6-2acc-435d-a812-ecedc2ca7c6c","name":"p2","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:35:11.778Z","level":"info","msg":"display set","paneId":"55c48ed6-2acc-435d-a812-ecedc2ca7c6c","name":"p3","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:35:11.824Z","level":"info","msg":"display set","paneId":"c297d1ed-e3c8-4587-b17d-fa8215fab424","name":"p0","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:35:11.940Z","level":"info","msg":"extension started","extension":"project:f056baf598f58e60ff487871e27868127b135ffd3af54c44f48c7bcaed149ed7:p5","run":"e98aa259-9740-4f1e-9d78-eae685a6104b","state":"running"}
{"ts":"2026-10-27T00:35:11.999Z","level":"info","msg":"display set","paneId":"c297d1ed-e3c8-4587-b17d-fa8215fab424","name":"p1","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:35:12.006Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:16a3c81c-a1c2-4bfa-8206-2d9640a25baf"]}
{"ts":"2026-10-27T00:35:12.027Z","level":"info","msg":"display set","paneId":"c297d1ed-e3c8-4587-b17d-fa8215fab424","name":"p2","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:35:12.051Z","level":"info","msg":"display set","paneId":"c297d1ed-e3c8-4587-b17d-fa8215fab424","name":"p3","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:35:12.299Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:cf607597-a7bd-4d99-aef3-544fa1d3b86b"]}
{"ts":"2026-10-27T00:35:12.337Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:12.338Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:12.338Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:12.343Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-EMuGR3/commands.json","count":0}
{"ts":"2026-10-27T00:35:12.579Z","level":"info","msg":"display closed","paneId":"a1b19198-d9b0-4e0c-b3d2-1b9bd77a4202","name":"p0","reason":"closed"}
{"ts":"2026-10-27T00:35:12.579Z","level":"info","msg":"display closed","paneId":"a1b19198-d9b0-4e0c-b3d2-1b9bd77a4202","name":"p1","reason":"closed"}
{"ts":"2026-10-27T00:35:12.579Z","level":"info","msg":"display closed","paneId":"a1b19198-d9b0-4e0c-b3d2-1b9bd77a4202","name":"p2","reason":"closed"}
{"ts":"2026-10-27T00:35:12.579Z","level":"info","msg":"display closed","paneId":"a1b19198-d9b0-4e0c-b3d2-1b9bd77a4202","name":"p3","reason":"closed"}
{"ts":"2026-10-27T00:35:12.586Z","level":"info","msg":"display set","paneId":"b720a3f1-3bfa-4796-b2b0-96002e3cd2a9","name":"one","kind":"panel","format":"html","bytes":1,"rev":1}
{"ts":"2026-10-27T00:35:12.643Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:12.644Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:12.644Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:12.652Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-LPlnGn/commands.json","count":0}
{"ts":"2026-10-27T00:35:12.667Z","level":"info","msg":"agent session attached","paneId":"150c84f7-b3c2-4315-a186-f3a4b56af148","kind":"claude","session":"resume-m","source":"hook"}
{"ts":"2026-10-27T00:35:12.704Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:12.705Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:12.706Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:12.715Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-nYi52O/state-HsXR0T/commands.json","count":0}
{"ts":"2026-10-27T00:35:12.998Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:12.999Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:12.999Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:13.006Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-AS70Jo/commands.json","count":0}
{"ts":"2026-10-27T00:35:13.070Z","level":"info","msg":"display script enabled","byClientId":"4d0ceb8f-a923-4a1a-a79c-3ae48c08df58","byKind":"external"}
{"ts":"2026-10-27T00:35:13.278Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:13.279Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:13.279Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:13.286Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-dkd8HK/commands.json","count":0}
{"ts":"2026-10-27T00:35:13.615Z","level":"info","msg":"display set","paneId":"cb9c5eec-1d44-42eb-9b8e-2f8734bf043e","name":"x","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T00:35:13.678Z","level":"info","msg":"display closed","paneId":"cb9c5eec-1d44-42eb-9b8e-2f8734bf043e","name":"x","reason":"pane_closed"}
{"ts":"2026-10-27T00:35:13.683Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:cb9c5eec-1d44-42eb-9b8e-2f8734bf043e"]}
{"ts":"2026-10-27T00:35:13.713Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:13.713Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:13.713Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:13.715Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:13.715Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:13.715Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:13.720Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-5g1XY1/commands.json","count":0}
{"ts":"2026-10-27T00:35:13.721Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-dkd8HK/commands.json","count":0}
{"ts":"2026-10-27T00:35:14.011Z","level":"info","msg":"extension started","extension":"project:68b4b6c8aa3fb667d9ac7cf1b40eabb5cf59bf25bbd483682b6afce3968b8a92:p5b","run":"16d66f28-0d53-4459-90f7-e13ec1d55d4b","state":"running"}
{"ts":"2026-10-27T00:35:14.041Z","level":"info","msg":"agent resume skipped","paneId":"568460d9-d859-455a-ae7c-aa08507f1d24","reason":"no-session-ref"}
{"ts":"2026-10-27T00:35:14.053Z","level":"info","msg":"extension exited","extension":"project:68b4b6c8aa3fb667d9ac7cf1b40eabb5cf59bf25bbd483682b6afce3968b8a92:p5b","run":"16d66f28-0d53-4459-90f7-e13ec1d55d4b","code":137,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:35:14.130Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:14.131Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:14.131Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:14.138Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-gxG0Z3/commands.json","count":0}
{"ts":"2026-10-27T00:35:14.182Z","level":"info","msg":"display script enabled","byClientId":"b29c2d1d-5e14-46d2-b129-b257009616cf","byKind":"external"}
{"ts":"2026-10-27T00:35:14.346Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:14.347Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:14.347Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:14.354Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-VE0wuG/commands.json","count":0}
{"ts":"2026-10-27T00:35:14.577Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:14.577Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:14.577Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:14.584Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-gxG0Z3/commands.json","count":0}
{"ts":"2026-10-27T00:35:14.593Z","level":"warn","msg":"session.json was corrupt; starting fresh","backupPath":"/tmp/soda-graph-it-gxG0Z3/session-backups/2026-10-27T00-35-14-592Z.json"}
{"ts":"2026-10-27T00:35:14.809Z","level":"info","msg":"display script enabled","byClientId":"2505ff83-9bbe-4de3-8722-3efc4ca19c89","byKind":"external"}
{"ts":"2026-10-27T00:35:14.901Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:2af60327-b4b0-4947-8e19-f0e81a877273"]}
{"ts":"2026-10-27T00:35:14.901Z","level":"info","msg":"graph.json had nodes of closed panes; removed them","nodes":1}
{"ts":"2026-10-27T00:35:14.935Z","level":"info","msg":"display set","paneId":"c9ee23d5-0507-452d-9f01-6ecac1c049eb","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-27T00:35:14.936Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"c9ee23d5-0507-452d-9f01-6ecac1c049eb","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:35:14.937Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"c9ee23d5-0507-452d-9f01-6ecac1c049eb","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:35:14.959Z","level":"info","msg":"display set","paneId":"c9ee23d5-0507-452d-9f01-6ecac1c049eb","name":"st","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T00:35:14.959Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"c9ee23d5-0507-452d-9f01-6ecac1c049eb","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-27T00:35:14.961Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"c9ee23d5-0507-452d-9f01-6ecac1c049eb","connId":"pane-socket:4","code":"invalid_params"}
{"ts":"2026-10-27T00:35:14.962Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"c9ee23d5-0507-452d-9f01-6ecac1c049eb","connId":"pane-socket:5","code":"invalid_params"}
{"ts":"2026-10-27T00:35:14.962Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"c9ee23d5-0507-452d-9f01-6ecac1c049eb","connId":"pane-socket:6","code":"display_closed"}
{"ts":"2026-10-27T00:35:14.965Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"c9ee23d5-0507-452d-9f01-6ecac1c049eb","connId":"pane-socket:7","code":"ok"}
{"ts":"2026-10-27T00:35:14.968Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"c9ee23d5-0507-452d-9f01-6ecac1c049eb","connId":"pane-socket:8","code":"ok"}
{"ts":"2026-10-27T00:35:15.002Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:15.002Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:15.002Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:15.010Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-frPOFC/commands.json","count":0}
{"ts":"2026-10-27T00:35:15.013Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:15.014Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:15.014Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:15.020Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-it-ld5JlY/commands.json","count":0}
{"ts":"2026-10-27T00:35:15.423Z","level":"info","msg":"display script enabled","byClientId":"7b28404a-9aa2-4ef6-82c5-f2d094ace84b","byKind":"external"}
{"ts":"2026-10-27T00:35:15.424Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:15.425Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:15.425Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:15.432Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-jv7olS/commands.json","count":0}
{"ts":"2026-10-27T00:35:15.460Z","level":"info","msg":"display set","paneId":"b190a5f4-14a3-4f05-9076-0285b2942cc7","name":"lay","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T00:35:15.460Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"b190a5f4-14a3-4f05-9076-0285b2942cc7","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:35:15.514Z","level":"info","msg":"display set","paneId":"b190a5f4-14a3-4f05-9076-0285b2942cc7","name":"bd","kind":"band","format":"text","bytes":1,"rev":1}
{"ts":"2026-10-27T00:35:15.514Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"b190a5f4-14a3-4f05-9076-0285b2942cc7","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:35:15.532Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"b190a5f4-14a3-4f05-9076-0285b2942cc7","connId":"pane-socket:3","code":"invalid_display"}
{"ts":"2026-10-27T00:35:15.535Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"b190a5f4-14a3-4f05-9076-0285b2942cc7","connId":"pane-socket:4","code":"invalid_params"}
{"ts":"2026-10-27T00:35:15.592Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:15.593Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:15.593Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:15.598Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:15.599Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:15.599Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:15.600Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-13NozX/commands.json","count":0}
{"ts":"2026-10-27T00:35:15.606Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-eW16kb/commands.json","count":0}
{"ts":"2026-10-27T00:35:16.076Z","level":"info","msg":"display script enabled","byClientId":"369c5036-e652-4dab-81a0-5fcc27da14a7","byKind":"external"}
{"ts":"2026-10-27T00:35:16.112Z","level":"info","msg":"display set","paneId":"e561b278-836d-4110-ae08-c6af7255f345","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-27T00:35:16.254Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:16.255Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:16.255Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:16.263Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-lx12Lh/commands.json","count":0}
{"ts":"2026-10-27T00:35:16.625Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:16.626Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:16.627Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:16.635Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-nYi52O/state-LqJwjk/commands.json","count":0}
{"ts":"2026-10-27T00:35:16.686Z","level":"info","msg":"display script enabled","byClientId":"b89ca8fe-32b8-4c61-a82d-47c2583b1ba7","byKind":"external"}
{"ts":"2026-10-27T00:35:16.921Z","level":"info","msg":"extension started","extension":"project:d2ff65d90c6a83f44ea393ff9584f35705c8f497b07346533ddd8b7ccdedb0c9:p6","run":"6c58bd9d-40a7-45a9-a3b3-49bb65fc5181","state":"running"}
{"ts":"2026-10-27T00:35:17.158Z","level":"info","msg":"display set","paneId":"8b3dca8a-fb2f-4c5d-a8b2-14dd4fac03ce","name":"secret","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-27T00:35:17.159Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"4e83cc50-f116-4f5c-9cca-c0d8062a7ef5","connId":"pane-socket:1","code":"display_closed"}
{"ts":"2026-10-27T00:35:17.160Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"4e83cc50-f116-4f5c-9cca-c0d8062a7ef5","connId":"pane-socket:2","code":"invalid_params"}
{"ts":"2026-10-27T00:35:17.214Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:17.214Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:17.214Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:17.221Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-8IeIjT/commands.json","count":0}
{"ts":"2026-10-27T00:35:17.478Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:17.479Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:17.479Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:17.485Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-hyQjMo/commands.json","count":0}
{"ts":"2026-10-27T00:35:17.651Z","level":"info","msg":"display script enabled","byClientId":"f18bb682-e315-4ffa-8f6d-10122e414439","byKind":"external"}
{"ts":"2026-10-27T00:35:17.743Z","level":"info","msg":"display set","paneId":"27e83104-1b23-41f8-9900-4beaea289f13","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-27T00:35:17.743Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"27e83104-1b23-41f8-9900-4beaea289f13","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:35:17.748Z","level":"info","msg":"display reported","paneId":"27e83104-1b23-41f8-9900-4beaea289f13","name":"g","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T00:35:17.748Z","level":"info","msg":"display set","paneId":"191c3c4d-a250-46d5-8ede-77c65926e5db","name":"m","kind":"panel","format":"html","bytes":1,"rev":1}
{"ts":"2026-10-27T00:35:17.750Z","level":"info","msg":"display reported","paneId":"27e83104-1b23-41f8-9900-4beaea289f13","name":"g","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T00:35:17.758Z","level":"info","msg":"display closed","paneId":"27e83104-1b23-41f8-9900-4beaea289f13","name":"g","reason":"closed"}
{"ts":"2026-10-27T00:35:17.758Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"27e83104-1b23-41f8-9900-4beaea289f13","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:35:17.760Z","level":"info","msg":"display set","paneId":"27e83104-1b23-41f8-9900-4beaea289f13","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-27T00:35:17.761Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"27e83104-1b23-41f8-9900-4beaea289f13","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-27T00:35:17.784Z","level":"info","msg":"display closed","paneId":"191c3c4d-a250-46d5-8ede-77c65926e5db","name":"m","reason":"closed"}
{"ts":"2026-10-27T00:35:17.814Z","level":"info","msg":"display reported","paneId":"27e83104-1b23-41f8-9900-4beaea289f13","name":"g","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T00:35:17.814Z","level":"info","msg":"display closed","paneId":"27e83104-1b23-41f8-9900-4beaea289f13","name":"g","reason":"focus_steal"}
{"ts":"2026-10-27T00:35:17.815Z","level":"info","msg":"display script cooldown","paneId":"27e83104-1b23-41f8-9900-4beaea289f13","reason":"focus_steal","closed":1,"ms":300000}
{"ts":"2026-10-27T00:35:17.815Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"27e83104-1b23-41f8-9900-4beaea289f13","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-27T00:35:17.818Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"27e83104-1b23-41f8-9900-4beaea289f13","connId":"pane-socket:5","code":"display_busy"}
{"ts":"2026-10-27T00:35:17.819Z","level":"info","msg":"display set","paneId":"27e83104-1b23-41f8-9900-4beaea289f13","name":"h","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T00:35:17.819Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"27e83104-1b23-41f8-9900-4beaea289f13","connId":"pane-socket:6","code":"ok"}
{"ts":"2026-10-27T00:35:17.822Z","level":"info","msg":"display reported","paneId":"27e83104-1b23-41f8-9900-4beaea289f13","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T00:35:17.856Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:17.857Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:17.857Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:17.864Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-7mkVpQ/commands.json","count":0}
{"ts":"2026-10-27T00:35:17.916Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:17.917Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:17.917Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:17.926Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-8nucdO/commands.json","count":0}
{"ts":"2026-10-27T00:35:18.051Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:18.052Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:18.052Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:18.058Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-nYi52O/state-BjeG2R/commands.json","count":0}
{"ts":"2026-10-27T00:35:18.424Z","level":"info","msg":"display script enabled","byClientId":"28ff5d10-39ac-4e1e-b6ef-903ec7743584","byKind":"external"}
{"ts":"2026-10-27T00:35:18.465Z","level":"info","msg":"display set","paneId":"85b4b5c4-d1f4-43e8-84a5-22de7d1743a3","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-27T00:35:18.466Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"85b4b5c4-d1f4-43e8-84a5-22de7d1743a3","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:35:18.468Z","level":"info","msg":"display reported","paneId":"85b4b5c4-d1f4-43e8-84a5-22de7d1743a3","name":"g","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T00:35:18.470Z","level":"info","msg":"display reported","paneId":"85b4b5c4-d1f4-43e8-84a5-22de7d1743a3","name":"g","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T00:35:18.471Z","level":"info","msg":"display closed","paneId":"85b4b5c4-d1f4-43e8-84a5-22de7d1743a3","name":"g","reason":"closed"}
{"ts":"2026-10-27T00:35:18.471Z","level":"info","msg":"pane socket: request","op":"display.close","paneId":"85b4b5c4-d1f4-43e8-84a5-22de7d1743a3","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:35:18.473Z","level":"info","msg":"display reported","paneId":"85b4b5c4-d1f4-43e8-84a5-22de7d1743a3","problem":"focus_steal","format":"script-html"}
{"ts":"2026-10-27T00:35:18.473Z","level":"info","msg":"display script cooldown","paneId":"85b4b5c4-d1f4-43e8-84a5-22de7d1743a3","reason":"focus_steal","closed":0,"ms":300000}
{"ts":"2026-10-27T00:35:18.475Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"85b4b5c4-d1f4-43e8-84a5-22de7d1743a3","connId":"pane-socket:3","code":"display_busy"}
{"ts":"2026-10-27T00:35:18.475Z","level":"info","msg":"agent session attached","paneId":"fcc078cc-cfe6-4b1b-b961-0d0a36da3de3","kind":"grok","session":"grok-1","source":"hook"}
{"ts":"2026-10-27T00:35:18.476Z","level":"info","msg":"agent session attached","paneId":"fcc078cc-cfe6-4b1b-b961-0d0a36da3de3","kind":"qodercli","session":"qodercli","source":"hook"}
{"ts":"2026-10-27T00:35:18.476Z","level":"info","msg":"agent session attached","paneId":"fcc078cc-cfe6-4b1b-b961-0d0a36da3de3","kind":"devin","session":"devin-1","source":"hook"}
{"ts":"2026-10-27T00:35:18.510Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:18.510Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:18.510Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:18.511Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:18.512Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:18.512Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:18.518Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-nYi52O/state-bctGVN/commands.json","count":0}
{"ts":"2026-10-27T00:35:18.521Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-fypLWF/commands.json","count":0}
{"ts":"2026-10-27T00:35:18.849Z","level":"info","msg":"display script enabled","byClientId":"31955335-67e6-4d54-8e34-e50670f85e04","byKind":"desktop"}
{"ts":"2026-10-27T00:35:18.902Z","level":"info","msg":"extension started","extension":"project:ef0270c7c32e7f03013af41dda1216e45fdbb195c404acdd4c54294cf6031856:p7","run":"07a845f5-ad49-42a0-b0b3-17183bcca0bc","state":"running"}
{"ts":"2026-10-27T00:35:18.914Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"153ef8d0-9538-4b89-8c6d-1a486f3fc424","connId":"pane-socket:1","code":"display_script_disabled"}
{"ts":"2026-10-27T00:35:18.916Z","level":"info","msg":"display set","paneId":"153ef8d0-9538-4b89-8c6d-1a486f3fc424","name":"st","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T00:35:18.916Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"153ef8d0-9538-4b89-8c6d-1a486f3fc424","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:35:18.918Z","level":"info","msg":"pane socket: request","op":"display.send","paneId":"153ef8d0-9538-4b89-8c6d-1a486f3fc424","connId":"pane-socket:3","code":"display_script_disabled"}
{"ts":"2026-10-27T00:35:18.919Z","level":"info","msg":"pane socket: request","op":"display.features","paneId":"153ef8d0-9538-4b89-8c6d-1a486f3fc424","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-27T00:35:18.945Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:18.945Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:18.946Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:18.952Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-wU4NHX/commands.json","count":0}
{"ts":"2026-10-27T00:35:19.237Z","level":"info","msg":"agent session attached","paneId":"375f7130-7859-45bd-a969-391113c1002b","kind":"codex","session":"marker-b","source":"hook"}
{"ts":"2026-10-27T00:35:19.308Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:19.308Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:19.308Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:19.315Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-nYi52O/state-wKbZpN/commands.json","count":0}
{"ts":"2026-10-27T00:35:19.392Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"181e1fb6-5be8-41e0-82e3-2402c000439c","connId":"pane-socket:1","code":"display_script_disabled"}
{"ts":"2026-10-27T00:35:19.395Z","level":"info","msg":"display script enabled","byClientId":"53187b94-09db-4d06-bee5-dea881bfa7df","byKind":"external"}
{"ts":"2026-10-27T00:35:19.397Z","level":"info","msg":"display set","paneId":"181e1fb6-5be8-41e0-82e3-2402c000439c","name":"g","kind":"panel","format":"script-html","bytes":42,"rev":1}
{"ts":"2026-10-27T00:35:19.397Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"181e1fb6-5be8-41e0-82e3-2402c000439c","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:35:19.398Z","level":"info","msg":"display set","paneId":"181e1fb6-5be8-41e0-82e3-2402c000439c","name":"st","kind":"panel","format":"html","bytes":9,"rev":1}
{"ts":"2026-10-27T00:35:19.398Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"181e1fb6-5be8-41e0-82e3-2402c000439c","connId":"pane-socket:3","code":"ok"}
{"ts":"2026-10-27T00:35:19.502Z","level":"info","msg":"display closed","paneId":"181e1fb6-5be8-41e0-82e3-2402c000439c","name":"g","reason":"script_disabled"}
{"ts":"2026-10-27T00:35:19.503Z","level":"info","msg":"pane socket: request","op":"display.wait","paneId":"181e1fb6-5be8-41e0-82e3-2402c000439c","connId":"pane-socket:4","code":"ok"}
{"ts":"2026-10-27T00:35:19.508Z","level":"info","msg":"pane socket: request","op":"display.list","paneId":"181e1fb6-5be8-41e0-82e3-2402c000439c","connId":"pane-socket:5","code":"ok"}
{"ts":"2026-10-27T00:35:19.509Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"181e1fb6-5be8-41e0-82e3-2402c000439c","connId":"pane-socket:6","code":"display_script_disabled"}
{"ts":"2026-10-27T00:35:19.545Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:19.545Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:19.545Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:19.553Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-display-vJJzpc/commands.json","count":0}
{"ts":"2026-10-27T00:35:19.930Z","level":"info","msg":"pane socket: request","op":"prefs.set","paneId":"9a1504c1-dc2c-4ea7-a47c-aaecfce62a6b","connId":"pane-socket:1","code":"unknown_op"}
{"ts":"2026-10-27T00:35:19.931Z","level":"info","msg":"pane socket: request","op":"prefs.get","paneId":"9a1504c1-dc2c-4ea7-a47c-aaecfce62a6b","connId":"pane-socket:2","code":"unknown_op"}
{"ts":"2026-10-27T00:35:19.932Z","level":"info","msg":"pane socket: request","op":"client.hello","paneId":"9a1504c1-dc2c-4ea7-a47c-aaecfce62a6b","connId":"pane-socket:3","code":"unknown_op"}
{"ts":"2026-10-27T00:35:19.933Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"9a1504c1-dc2c-4ea7-a47c-aaecfce62a6b","connId":"pane-socket:4","code":"display_script_disabled"}
{"ts":"2026-10-27T00:35:19.934Z","level":"info","msg":"pane socket: request","op":"display.set","paneId":"9a1504c1-dc2c-4ea7-a47c-aaecfce62a6b","connId":"pane-socket:5","code":"invalid_params"}
{"ts":"2026-10-27T00:35:19.980Z","level":"info","msg":"extension started","extension":"project:ef0270c7c32e7f03013af41dda1216e45fdbb195c404acdd4c54294cf6031856:p7","run":"31785073-7814-481a-b4c8-6bf64d186380","state":"running"}
{"ts":"2026-10-27T00:35:20.195Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:20.195Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:20.195Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:20.204Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-USxQn0/commands.json","count":0}
{"ts":"2026-10-27T00:35:20.680Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:20.681Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:20.681Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:20.687Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-nYi52O/state-lryEcD/commands.json","count":0}
{"ts":"2026-10-27T00:35:20.690Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:20.691Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:20.691Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:20.697Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-ApJuBL/state-CQkeJo/commands.json","count":0}
{"ts":"2026-10-27T00:35:20.806Z","level":"info","msg":"display set","paneId":"9f5af45a-629e-4079-b8d1-852a2fc6857f","name":"s","kind":"panel","format":"script-html","bytes":8,"rev":1}
{"ts":"2026-10-27T00:35:20.834Z","level":"info","msg":"display closed","paneId":"9f5af45a-629e-4079-b8d1-852a2fc6857f","name":"s","reason":"script_disabled"}
{"ts":"2026-10-27T00:35:20.961Z","level":"info","msg":"extension started","extension":"project:ef0270c7c32e7f03013af41dda1216e45fdbb195c404acdd4c54294cf6031856:p7","run":"c49e7185-35d6-417d-9902-45b9f54cc6c4","state":"running"}
{"ts":"2026-10-27T00:35:21.452Z","level":"info","msg":"agent session attached","paneId":"1107f7de-848b-43f7-9e25-d4a8ff146613","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:35:21.660Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:21.661Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:21.661Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:21.668Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-Hr6RJK/commands.json","count":0}
{"ts":"2026-10-27T00:35:21.905Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:21.906Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:21.906Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:21.931Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-F08Yoh/commands.json","count":0}
{"ts":"2026-10-27T00:35:22.272Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:22.273Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:22.273Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:22.278Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-nYi52O/state-mcPPYn/commands.json","count":0}
{"ts":"2026-10-27T00:35:22.372Z","level":"info","msg":"extension started","extension":"user:p10u","run":"558b9dc6-6faa-4289-96bd-b6fcccdd7f0d","state":"running"}
{"ts":"2026-10-27T00:35:23.058Z","level":"info","msg":"extension started","extension":"project:5cabd2a836350957ad5cca528e7f9189baabb44ae60d3b7b70d9ae630fe30c26:p10","run":"d2121ae6-0803-44d3-bb64-0a755c4c10e3","state":"running"}
{"ts":"2026-10-27T00:35:23.151Z","level":"info","msg":"extension exited","extension":"project:5cabd2a836350957ad5cca528e7f9189baabb44ae60d3b7b70d9ae630fe30c26:p10","run":"d2121ae6-0803-44d3-bb64-0a755c4c10e3","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:35:23.180Z","level":"info","msg":"extension started","extension":"project:5cabd2a836350957ad5cca528e7f9189baabb44ae60d3b7b70d9ae630fe30c26:p10","run":"797164e3-4272-4bed-80e8-18bf1d114c33","state":"running"}
{"ts":"2026-10-27T00:35:23.280Z","level":"info","msg":"extension exited","extension":"project:5cabd2a836350957ad5cca528e7f9189baabb44ae60d3b7b70d9ae630fe30c26:p10","run":"797164e3-4272-4bed-80e8-18bf1d114c33","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:35:23.331Z","level":"info","msg":"extension started","extension":"project:5cabd2a836350957ad5cca528e7f9189baabb44ae60d3b7b70d9ae630fe30c26:p10","run":"98c8ed2f-9cc5-4c2a-85be-0bd70aac4f39","state":"running"}
{"ts":"2026-10-27T00:35:23.421Z","level":"info","msg":"extension exited","extension":"project:5cabd2a836350957ad5cca528e7f9189baabb44ae60d3b7b70d9ae630fe30c26:p10","run":"98c8ed2f-9cc5-4c2a-85be-0bd70aac4f39","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:35:23.528Z","level":"info","msg":"extension started","extension":"project:5cabd2a836350957ad5cca528e7f9189baabb44ae60d3b7b70d9ae630fe30c26:p10","run":"f903e845-58ce-4806-bcf2-62607a6cfe93","state":"running"}
{"ts":"2026-10-27T00:35:23.736Z","level":"info","msg":"extension exited","extension":"project:5cabd2a836350957ad5cca528e7f9189baabb44ae60d3b7b70d9ae630fe30c26:p10","run":"f903e845-58ce-4806-bcf2-62607a6cfe93","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:35:23.755Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:23.756Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:23.757Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:23.781Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-nYi52O/state-RRRzib/commands.json","count":0}
{"ts":"2026-10-27T00:35:23.791Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:23.792Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:23.792Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:23.800Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-oZXthp/commands.json","count":0}
{"ts":"2026-10-27T00:35:23.826Z","level":"info","msg":"extension started","extension":"project:5cabd2a836350957ad5cca528e7f9189baabb44ae60d3b7b70d9ae630fe30c26:p10","run":"e5969266-a78b-4128-9c63-b288edc38493","state":"running"}
{"ts":"2026-10-27T00:35:23.942Z","level":"info","msg":"extension exited","extension":"project:5cabd2a836350957ad5cca528e7f9189baabb44ae60d3b7b70d9ae630fe30c26:p10","run":"e5969266-a78b-4128-9c63-b288edc38493","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:35:23.942Z","level":"warn","msg":"extension failed","extension":"project:5cabd2a836350957ad5cca528e7f9189baabb44ae60d3b7b70d9ae630fe30c26:p10","state":"failed","failures":5}
{"ts":"2026-10-27T00:35:24.675Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:24.676Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:24.676Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:24.685Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-BS4h21/commands.json","count":0}
{"ts":"2026-10-27T00:35:24.735Z","level":"info","msg":"agent session attached","paneId":"af446260-7b04-4542-b38b-89f54fd13a5e","kind":"claude","session":"9cc31ba4","source":"hook"}
{"ts":"2026-10-27T00:35:25.206Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:25.207Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:25.207Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:25.218Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-nYi52O/state-DopoUE/commands.json","count":0}
{"ts":"2026-10-27T00:35:25.826Z","level":"info","msg":"extension started","extension":"project:651287451420c4f960f9b2e478fe783fae7351bbc543735a6e82398fe8546a75:p10b","run":"df6ea237-4c04-468b-8297-fd667343a6f9","state":"running"}
{"ts":"2026-10-27T00:35:25.830Z","level":"info","msg":"extension exited","extension":"project:651287451420c4f960f9b2e478fe783fae7351bbc543735a6e82398fe8546a75:p10b","run":"df6ea237-4c04-468b-8297-fd667343a6f9","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:35:25.860Z","level":"info","msg":"extension started","extension":"project:651287451420c4f960f9b2e478fe783fae7351bbc543735a6e82398fe8546a75:p10b","run":"459188a4-78b7-499c-9103-320f46d0b6aa","state":"running"}
{"ts":"2026-10-27T00:35:25.862Z","level":"info","msg":"extension exited","extension":"project:651287451420c4f960f9b2e478fe783fae7351bbc543735a6e82398fe8546a75:p10b","run":"459188a4-78b7-499c-9103-320f46d0b6aa","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:35:25.912Z","level":"info","msg":"extension started","extension":"project:651287451420c4f960f9b2e478fe783fae7351bbc543735a6e82398fe8546a75:p10b","run":"e78b54bb-3d48-41e7-9643-b9ac91cc8437","state":"running"}
{"ts":"2026-10-27T00:35:25.914Z","level":"info","msg":"extension exited","extension":"project:651287451420c4f960f9b2e478fe783fae7351bbc543735a6e82398fe8546a75:p10b","run":"e78b54bb-3d48-41e7-9643-b9ac91cc8437","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:35:26.004Z","level":"info","msg":"extension started","extension":"project:651287451420c4f960f9b2e478fe783fae7351bbc543735a6e82398fe8546a75:p10b","run":"22a6a34c-77a1-4f6e-96ae-52188eb98897","state":"running"}
{"ts":"2026-10-27T00:35:26.006Z","level":"info","msg":"extension exited","extension":"project:651287451420c4f960f9b2e478fe783fae7351bbc543735a6e82398fe8546a75:p10b","run":"22a6a34c-77a1-4f6e-96ae-52188eb98897","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:35:26.097Z","level":"info","msg":"extension started","extension":"project:651287451420c4f960f9b2e478fe783fae7351bbc543735a6e82398fe8546a75:p10b","run":"1c021e70-26ec-4fbf-9b5f-94294a8a50c8","state":"running"}
{"ts":"2026-10-27T00:35:26.099Z","level":"info","msg":"extension exited","extension":"project:651287451420c4f960f9b2e478fe783fae7351bbc543735a6e82398fe8546a75:p10b","run":"1c021e70-26ec-4fbf-9b5f-94294a8a50c8","code":127,"signal":null,"reason":"crashed"}
{"ts":"2026-10-27T00:35:26.099Z","level":"warn","msg":"extension failed","extension":"project:651287451420c4f960f9b2e478fe783fae7351bbc543735a6e82398fe8546a75:p10b","state":"failed","failures":5}
{"ts":"2026-10-27T00:35:27.141Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:27.142Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:27.142Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:27.150Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-nYi52O/state-SpynKa/commands.json","count":0}
{"ts":"2026-10-27T00:35:27.421Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:27.422Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:27.422Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:27.436Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ext-tyL1LU/commands.json","count":0}
{"ts":"2026-10-27T00:35:28.774Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:28.775Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:28.776Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:28.783Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-ApJuBL/state-Xf1kFp/commands.json","count":0}
{"ts":"2026-10-27T00:35:29.399Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:29.400Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:29.400Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:29.409Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-nYi52O/state-cHXQYh/commands.json","count":0}
{"ts":"2026-10-27T00:35:29.539Z","level":"info","msg":"agent session attached","paneId":"13047945-cc5e-475e-a5ad-9b9f8fa5a7aa","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:35:30.074Z","level":"info","msg":"extension started","extension":"project:50d52a0dcad1a63c23a63bc0c078d562154881116823e85e3ac234f6cb877d05:p9","run":"98a331af-2423-45ed-993f-2d028a3534f8","state":"running"}
{"ts":"2026-10-27T00:35:30.273Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:30.274Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:30.274Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:30.285Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-gdX0be/commands.json","count":0}
{"ts":"2026-10-27T00:35:31.173Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:31.174Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:31.174Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:31.183Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-subagents-it-nYi52O/state-ihe7Eu/commands.json","count":0}
{"ts":"2026-10-27T00:35:31.263Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:31.264Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:31.264Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:31.273Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-gdX0be/commands.json","count":0}
{"ts":"2026-10-27T00:35:31.285Z","level":"warn","msg":"session.json was corrupt; starting fresh","backupPath":"/tmp/soda-graph-run-gdX0be/session-backups/2026-10-27T00-35-31-284Z.json"}
{"ts":"2026-10-27T00:35:31.610Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:33aa8838-0839-4462-b6e9-f07917718343","local:0462a4f9-69c7-4a70-aadd-f7153adc1292"]}
{"ts":"2026-10-27T00:35:31.610Z","level":"info","msg":"graph.json had nodes of closed panes; removed them","nodes":2}
{"ts":"2026-10-27T00:35:32.280Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:32.280Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:32.281Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:32.289Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-3CQzgM/commands.json","count":0}
{"ts":"2026-10-27T00:35:32.710Z","level":"info","msg":"pane socket: request","op":"agent.subagent_transcript","paneId":"2c4bcf80-4d23-442e-b2fd-90d53d2cd062","connId":"pane-socket:1","code":"unknown_op"}
{"ts":"2026-10-27T00:35:32.976Z","level":"info","msg":"agent session attached","paneId":"e43f686a-e23c-49d4-b540-353ffdd1e6f4","kind":"claude","session":"3c70132d","source":"hook"}
{"ts":"2026-10-27T00:35:33.213Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:33.214Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:33.214Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:33.237Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-run-2vNb7a/commands.json","count":0}
{"ts":"2026-10-27T00:35:34.198Z","level":"info","msg":"handoff: requested; running preflight"}
{"ts":"2026-10-27T00:35:34.211Z","level":"info","msg":"handoff: replacing this server with the version on disk","id":"eefe385d6d23c359","panes":2}
{"ts":"2026-10-27T00:35:34.213Z","level":"error","msg":"handoff: execve failed; keeping the current server","error":"execve refused by the test"}
{"ts":"2026-10-27T00:35:34.334Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:34.337Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:34.337Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:34.352Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-lYXEPa/commands.json","count":0}
{"ts":"2026-10-27T00:35:35.154Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:35.155Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:35.155Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:35.160Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-paiO3v/sessions/work/commands.json","count":0}
{"ts":"2026-10-27T00:35:35.703Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:35.704Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:35.705Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:35.706Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:35.706Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:35.706Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:35.716Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-F5pUfV/commands.json","count":0}
{"ts":"2026-10-27T00:35:35.718Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-F5pUfV/commands.json","count":0}
{"ts":"2026-10-27T00:35:36.186Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:36.187Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:36.187Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:36.193Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-0UQExC/commands.json","count":0}
{"ts":"2026-10-27T00:35:36.288Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:36.290Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:36.291Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:36.316Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-byfERp/commands.json","count":0}
{"ts":"2026-10-27T00:35:36.814Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:36.816Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:36.816Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:36.821Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-xxPwk5/commands.json","count":0}
{"ts":"2026-10-27T00:35:37.101Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:37.103Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:37.104Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:37.113Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-Q45IEE/commands.json","count":0}
{"ts":"2026-10-27T00:35:37.386Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:13047945-cc5e-475e-a5ad-9b9f8fa5a7aa"]}
{"ts":"2026-10-27T00:35:37.539Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:37.540Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:37.540Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:37.555Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-ApJuBL/state-aVQadf/commands.json","count":0}
{"ts":"2026-10-27T00:35:37.571Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:37.572Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:37.573Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:37.579Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-SSbQ7e/commands.json","count":0}
{"ts":"2026-10-27T00:35:38.304Z","level":"info","msg":"agent session attached","paneId":"ec5b3d8f-18f1-48d3-a783-881c95af3cb6","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:35:38.550Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T00:35:38.551Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:38.552Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:38.552Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:38.559Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-6pHUxI/commands.json","count":0}
{"ts":"2026-10-27T00:35:38.631Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:38.633Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:38.633Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:38.642Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-iDGg8D/commands.json","count":0}
{"ts":"2026-10-27T00:35:39.104Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:39.105Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:39.105Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:39.112Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-aqL54J/commands.json","count":0}
{"ts":"2026-10-27T00:35:39.122Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:39.123Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:39.123Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:39.146Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-Ehx1Iq/commands.json","count":0}
{"ts":"2026-10-27T00:35:39.615Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:39.616Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:39.616Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:39.625Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-NwUF2m/commands.json","count":0}
{"ts":"2026-10-27T00:35:39.733Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:35:39.938Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:39.939Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:39.939Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:39.946Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-CCi9W3/commands.json","count":0}
{"ts":"2026-10-27T00:35:40.365Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:40.366Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:40.366Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:40.375Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-nw7Its/commands.json","count":0}
{"ts":"2026-10-27T00:35:40.485Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:40.486Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:40.486Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:40.493Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-UzGS56/commands.json","count":0}
{"ts":"2026-10-27T00:35:40.922Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:40.924Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:40.924Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:40.929Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:35:40.930Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-SXY4Yz/state-yA1BjK/commands.json","count":0}
{"ts":"2026-10-27T00:35:41.434Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:41.434Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:41.435Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:41.441Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-6dMZXZ/commands.json","count":0}
{"ts":"2026-10-27T00:35:41.771Z","level":"info","msg":"agent session attached","paneId":"357ffb72-a74f-4732-a950-17ecbbb2b1ef","kind":"claude","session":"833fab57","source":"hook"}
{"ts":"2026-10-27T00:35:41.903Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:41.904Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:41.904Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:41.912Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-3k5NBH/commands.json","count":0}
{"ts":"2026-10-27T00:35:42.034Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T00:35:42.080Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:42.081Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:42.081Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:42.105Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-tijiMN/commands.json","count":0}
{"ts":"2026-10-27T00:35:42.376Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:42.377Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:42.377Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:42.384Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-find-ofqM8D/commands.json","count":0}
{"ts":"2026-10-27T00:35:42.548Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:42.550Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:42.550Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:42.566Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-hj2SnC/commands.json","count":0}
{"ts":"2026-10-27T00:35:42.868Z","level":"info","msg":"graph.auto: added","child":"adbfb427-d600-4a09-8948-29a923f5c256","parent":"c6adf496-3ebc-4b16-bd71-1fd863eac870","links":2}
{"ts":"2026-10-27T00:35:43.063Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:35:43.453Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:43.456Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:43.459Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:43.491Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-Erg7cJ/commands.json","count":0}
{"ts":"2026-10-27T00:35:43.956Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:43.971Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:43.972Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:43.979Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-vhOcey/commands.json","count":0}
{"ts":"2026-10-27T00:35:44.070Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"attention","reason":"リモートで soda serve が動いていません（リモートで起動してください）（soda: no running soda serve for session default）"}
{"ts":"2026-10-27T00:35:44.146Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:44.146Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:44.146Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:44.153Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-iSZyC5/commands.json","count":0}
{"ts":"2026-10-27T00:35:44.183Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:44.185Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:44.185Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:44.192Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-SXY4Yz/state-rte3D2/commands.json","count":0}
{"ts":"2026-10-27T00:35:44.490Z","level":"info","msg":"ask opened","askId":"259f048d13d731dafe5e5ff285fb08ba","paneId":"c0bcbe55-3329-49a5-b1ff-6a87de3c2220","questions":1,"media":0}
{"ts":"2026-10-27T00:35:44.563Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:44.563Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:44.564Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:44.571Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-Au7GHP/commands.json","count":0}
{"ts":"2026-10-27T00:35:44.647Z","level":"info","msg":"agent session attached","paneId":"4067310e-9b08-40e0-93c2-b73b961708fc","kind":"claude","session":"a3a38794","source":"hook"}
{"ts":"2026-10-27T00:35:44.677Z","level":"info","msg":"ask closed","askId":"259f048d13d731dafe5e5ff285fb08ba","paneId":"c0bcbe55-3329-49a5-b1ff-6a87de3c2220","status":"answered"}
{"ts":"2026-10-27T00:35:44.678Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"c0bcbe55-3329-49a5-b1ff-6a87de3c2220","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:35:44.721Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:44.722Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:44.722Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:44.729Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-TBtS2U/commands.json","count":0}
{"ts":"2026-10-27T00:35:45.161Z","level":"info","msg":"ask opened","askId":"eb607b0ffe7758ac24cfd0c30ffccf71","paneId":"83c906c4-6257-42e0-8d26-41987945798a","questions":1,"media":0}
{"ts":"2026-10-27T00:35:45.182Z","level":"info","msg":"ask closed","askId":"eb607b0ffe7758ac24cfd0c30ffccf71","paneId":"83c906c4-6257-42e0-8d26-41987945798a","status":"answered"}
{"ts":"2026-10-27T00:35:45.182Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"83c906c4-6257-42e0-8d26-41987945798a","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:35:45.225Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:45.226Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:45.227Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:45.233Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-ZaQcmb/commands.json","count":0}
{"ts":"2026-10-27T00:35:45.660Z","level":"info","msg":"ask opened","askId":"2622194ab1d6982d219d49ef9c0cc9e6","paneId":"63c30daa-dd6a-4f90-bfd4-9cbce81e3298","questions":1,"media":0}
{"ts":"2026-10-27T00:35:45.692Z","level":"info","msg":"ask closed","askId":"2622194ab1d6982d219d49ef9c0cc9e6","paneId":"63c30daa-dd6a-4f90-bfd4-9cbce81e3298","status":"cancelled"}
{"ts":"2026-10-27T00:35:45.693Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"63c30daa-dd6a-4f90-bfd4-9cbce81e3298","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:35:45.698Z","level":"info","msg":"ask opened","askId":"eae611cdf5387ec8876d5818bae3ee7a","paneId":"63c30daa-dd6a-4f90-bfd4-9cbce81e3298","questions":1,"media":0}
{"ts":"2026-10-27T00:35:45.874Z","level":"info","msg":"graph.auto: added","child":"7942fec4-ea69-4993-8c5e-c52363c655aa","parent":"ba2a1cc5-0585-46c9-bb7c-86b1d1fad6b8","links":2}
{"ts":"2026-10-27T00:35:46.400Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:46.401Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:46.401Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:46.409Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-u9CmmS/commands.json","count":0}
{"ts":"2026-10-27T00:35:46.699Z","level":"info","msg":"ask closed","askId":"eae611cdf5387ec8876d5818bae3ee7a","paneId":"63c30daa-dd6a-4f90-bfd4-9cbce81e3298","status":"timeout"}
{"ts":"2026-10-27T00:35:46.700Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"63c30daa-dd6a-4f90-bfd4-9cbce81e3298","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:35:46.761Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:46.762Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:46.762Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:46.768Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-WqiPu7/commands.json","count":0}
{"ts":"2026-10-27T00:35:46.835Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:46.836Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:46.836Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:46.843Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-SjY8NK/commands.json","count":0}
{"ts":"2026-10-27T00:35:47.146Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"ddf265cc-aa85-434c-9615-553016958977","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:35:47.190Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"ddf265cc-aa85-434c-9615-553016958977","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:35:47.221Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:47.221Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:47.222Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:47.229Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-vO85bc/commands.json","count":0}
{"ts":"2026-10-27T00:35:47.536Z","level":"info","msg":"ask opened","askId":"c50d34fc09b8a2f5e95665d72f4fcb20","paneId":"228fb180-e46c-4690-a867-5872e490e109","questions":1,"media":0}
{"ts":"2026-10-27T00:35:47.593Z","level":"info","msg":"ask closed","askId":"c50d34fc09b8a2f5e95665d72f4fcb20","paneId":"228fb180-e46c-4690-a867-5872e490e109","status":"answered"}
{"ts":"2026-10-27T00:35:47.596Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T00:35:47.642Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:47.643Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:47.643Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:47.652Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-01ex1v/commands.json","count":0}
{"ts":"2026-10-27T00:35:47.830Z","level":"info","msg":"ask opened","askId":"d35e64391c5c67465346ee50060ac4c8","paneId":"d15fee07-6397-469c-8f80-fe893f27ff6b","questions":1,"media":0}
{"ts":"2026-10-27T00:35:47.854Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"d15fee07-6397-469c-8f80-fe893f27ff6b","connId":"pane-socket:1","code":"ask_busy"}
{"ts":"2026-10-27T00:35:47.857Z","level":"info","msg":"ask closed","askId":"d35e64391c5c67465346ee50060ac4c8","paneId":"d15fee07-6397-469c-8f80-fe893f27ff6b","status":"cancelled"}
{"ts":"2026-10-27T00:35:47.863Z","level":"info","msg":"ask opened","askId":"c3385d0aa92c9d9f504ce70119bb33dc","paneId":"d15fee07-6397-469c-8f80-fe893f27ff6b","questions":1,"media":0}
{"ts":"2026-10-27T00:35:47.887Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"d15fee07-6397-469c-8f80-fe893f27ff6b","connId":"pane-socket:3","code":"ask_busy"}
{"ts":"2026-10-27T00:35:47.889Z","level":"info","msg":"ask closed","askId":"c3385d0aa92c9d9f504ce70119bb33dc","paneId":"d15fee07-6397-469c-8f80-fe893f27ff6b","status":"cancelled"}
{"ts":"2026-10-27T00:35:47.925Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:47.926Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:47.926Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:47.933Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-CJNnvj/commands.json","count":0}
{"ts":"2026-10-27T00:35:48.141Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:48.142Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:48.142Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:48.149Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-19K6s0/commands.json","count":0}
{"ts":"2026-10-27T00:35:48.382Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"p99","connId":"pane-socket:1","code":"not_found"}
{"ts":"2026-10-27T00:35:48.385Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"454c7cf4-84a9-4b76-aa2b-d5436cbfdf9a","connId":"pane-socket:2","code":"invalid_params"}
{"ts":"2026-10-27T00:35:48.386Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"454c7cf4-84a9-4b76-aa2b-d5436cbfdf9a","connId":"pane-socket:3","code":"invalid_params"}
{"ts":"2026-10-27T00:35:48.402Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"454c7cf4-84a9-4b76-aa2b-d5436cbfdf9a","connId":"pane-socket:4","code":"invalid_ask_spec"}
{"ts":"2026-10-27T00:35:48.409Z","level":"info","msg":"ask opened","askId":"a0a2fcbb8ffba4cdebc7fefb85d9f241","paneId":"454c7cf4-84a9-4b76-aa2b-d5436cbfdf9a","questions":1,"media":0}
{"ts":"2026-10-27T00:35:48.442Z","level":"info","msg":"ask closed","askId":"a0a2fcbb8ffba4cdebc7fefb85d9f241","paneId":"454c7cf4-84a9-4b76-aa2b-d5436cbfdf9a","status":"cancelled"}
{"ts":"2026-10-27T00:35:48.547Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:48.548Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:48.548Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:48.556Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-R173zn/commands.json","count":0}
{"ts":"2026-10-27T00:35:48.793Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:48.794Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:48.795Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:48.815Z","level":"info","msg":"display set","paneId":"d189f317-dcf1-40a1-ba3e-bbafd470a4c9","name":"two","kind":"panel","format":"html","bytes":2097152,"rev":1}
{"ts":"2026-10-27T00:35:48.819Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-SXY4Yz/state-1rwAUt/commands.json","count":0}
{"ts":"2026-10-27T00:35:48.947Z","level":"info","msg":"display set","paneId":"d189f317-dcf1-40a1-ba3e-bbafd470a4c9","name":"quotes","kind":"panel","format":"html","bytes":2096128,"rev":1}
{"ts":"2026-10-27T00:35:48.985Z","level":"info","msg":"ask opened","askId":"4ba5096c0615a79d3b990845fc5643b6","paneId":"e4addac7-7ae0-4d3b-86b9-07c40b994ec3","questions":1,"media":0}
{"ts":"2026-10-27T00:35:49.005Z","level":"info","msg":"ask closed","askId":"4ba5096c0615a79d3b990845fc5643b6","paneId":"e4addac7-7ae0-4d3b-86b9-07c40b994ec3","status":"cancelled"}
{"ts":"2026-10-27T00:35:49.122Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T00:35:49.147Z","level":"info","msg":"ask opened","askId":"fe9ce3714643d64f9b063b55cfc31257","paneId":"e4addac7-7ae0-4d3b-86b9-07c40b994ec3","questions":1,"media":0}
{"ts":"2026-10-27T00:35:49.168Z","level":"info","msg":"ask closed","askId":"fe9ce3714643d64f9b063b55cfc31257","paneId":"e4addac7-7ae0-4d3b-86b9-07c40b994ec3","status":"cancelled"}
{"ts":"2026-10-27T00:35:49.172Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:49.173Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:49.173Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:49.183Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-HLhRdd/commands.json","count":0}
{"ts":"2026-10-27T00:35:49.204Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:49.205Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:49.205Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:49.213Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-sruo1u/commands.json","count":0}
{"ts":"2026-10-27T00:35:49.611Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:49.611Z","level":"info","msg":"pane socket: request","op":"pane.write","paneId":"ee19a325-be40-4e10-9d34-443bb4b90821","connId":"pane-socket:1","code":"unknown_op"}
{"ts":"2026-10-27T00:35:49.612Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:49.612Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:49.612Z","level":"info","msg":"pane socket: request","op":"pane.write","paneId":"ee19a325-be40-4e10-9d34-443bb4b90821","connId":"pane-socket:2","code":"unknown_op"}
{"ts":"2026-10-27T00:35:49.613Z","level":"info","msg":"pane socket: request","op":"agent.send_keys","paneId":"ee19a325-be40-4e10-9d34-443bb4b90821","connId":"pane-socket:3","code":"unknown_op"}
{"ts":"2026-10-27T00:35:49.614Z","level":"info","msg":"pane socket: request","op":"workspace.create","paneId":"ee19a325-be40-4e10-9d34-443bb4b90821","connId":"pane-socket:4","code":"unknown_op"}
{"ts":"2026-10-27T00:35:49.615Z","level":"info","msg":"pane socket: request","op":"pane.rename","paneId":"ee19a325-be40-4e10-9d34-443bb4b90821","connId":"pane-socket:5","code":"unknown_op"}
{"ts":"2026-10-27T00:35:49.616Z","level":"info","msg":"pane socket: request","op":"ask.subscribe","paneId":"ee19a325-be40-4e10-9d34-443bb4b90821","connId":"pane-socket:6","code":"unknown_op"}
{"ts":"2026-10-27T00:35:49.617Z","level":"info","msg":"pane socket: request","op":"agent.fork","paneId":"ee19a325-be40-4e10-9d34-443bb4b90821","connId":"pane-socket:7","code":"unknown_op"}
{"ts":"2026-10-27T00:35:49.617Z","level":"info","msg":"pane socket: request","op":"agent.fork_preview","paneId":"ee19a325-be40-4e10-9d34-443bb4b90821","connId":"pane-socket:8","code":"unknown_op"}
{"ts":"2026-10-27T00:35:49.619Z","level":"info","msg":"pane socket: request","op":"agent.usage","paneId":"ee19a325-be40-4e10-9d34-443bb4b90821","connId":"pane-socket:9","code":"unknown_op"}
{"ts":"2026-10-27T00:35:49.620Z","level":"info","msg":"pane socket: request","op":"agent.usage_watch","paneId":"ee19a325-be40-4e10-9d34-443bb4b90821","connId":"pane-socket:10","code":"unknown_op"}
{"ts":"2026-10-27T00:35:49.621Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-iTpBxJ/commands.json","count":0}
{"ts":"2026-10-27T00:35:49.781Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:49.782Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:49.782Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:49.795Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-ApJuBL/state-FRjgib/commands.json","count":0}
{"ts":"2026-10-27T00:35:50.197Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:50.198Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:50.198Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:50.207Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-ZUzoOI/commands.json","count":0}
{"ts":"2026-10-27T00:35:50.276Z","level":"info","msg":"ask opened","askId":"bfca6b4443851c5f331367c047c9dc2a","paneId":"b34d1df1-6daf-415d-a368-b267a8ee6cda","questions":1,"media":2}
{"ts":"2026-10-27T00:35:50.330Z","level":"info","msg":"ask closed","askId":"bfca6b4443851c5f331367c047c9dc2a","paneId":"b34d1df1-6daf-415d-a368-b267a8ee6cda","status":"cancelled"}
{"ts":"2026-10-27T00:35:50.336Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T00:35:50.382Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:50.383Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:50.383Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:50.394Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-remote-IgOyoH/commands.json","count":0}
{"ts":"2026-10-27T00:35:50.509Z","level":"info","msg":"agent session attached","paneId":"1089414d-b723-410a-ad9c-026b65e54b86","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:35:50.655Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:50.656Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:50.656Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:50.663Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-WBEgPy/commands.json","count":0}
{"ts":"2026-10-27T00:35:50.837Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:50.839Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:50.839Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:50.850Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-machine-local-R0SSOk/commands.json","count":0}
{"ts":"2026-10-27T00:35:51.438Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:51.439Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:51.439Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:51.463Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-ApJuBL/state-J4KWOh/commands.json","count":0}
{"ts":"2026-10-27T00:35:51.558Z","level":"info","msg":"machine link closed","machine":"cccccccccccccccccccccccccccccccc","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T00:35:51.773Z","level":"info","msg":"graph.auto: added","child":"a15ba660-b05b-43b1-9536-dbb6d4541e47","parent":"407b495d-6994-477b-9ffb-3ac9d44ad9be","links":2}
{"ts":"2026-10-27T00:35:51.776Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"d95e9c57-62d5-43a4-b78a-4e5ca6ad2f70","connId":"pane-socket:1","code":"not_found"}
{"ts":"2026-10-27T00:35:51.834Z","level":"info","msg":"ask opened","askId":"729ffb27f814926cbb58a9c76122813b","paneId":"d95e9c57-62d5-43a4-b78a-4e5ca6ad2f70","questions":1,"media":0}
{"ts":"2026-10-27T00:35:51.851Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:51.852Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:51.852Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:51.855Z","level":"info","msg":"ask closed","askId":"729ffb27f814926cbb58a9c76122813b","paneId":"d95e9c57-62d5-43a4-b78a-4e5ca6ad2f70","status":"cancelled"}
{"ts":"2026-10-27T00:35:51.862Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-SXY4Yz/state-gCO9hk/commands.json","count":0}
{"ts":"2026-10-27T00:35:51.901Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:51.902Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:51.902Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:51.910Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-JLnMrC/commands.json","count":0}
{"ts":"2026-10-27T00:35:52.057Z","level":"info","msg":"agent session attached","paneId":"f9989920-d529-4c30-9f3d-8a0dcf10816e","kind":"claude","session":"../../et","source":"hook"}
{"ts":"2026-10-27T00:35:52.322Z","level":"info","msg":"ask opened","askId":"e0f7ade308f6aa8364a9e092e1d6bb93","paneId":"f3a7782d-dc6e-4708-b45d-5a59de1b7fdf","questions":1,"media":0}
{"ts":"2026-10-27T00:35:52.343Z","level":"info","msg":"ask closed","askId":"e0f7ade308f6aa8364a9e092e1d6bb93","paneId":"f3a7782d-dc6e-4708-b45d-5a59de1b7fdf","status":"cancelled"}
{"ts":"2026-10-27T00:35:52.375Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:52.377Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:52.377Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:52.386Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-xVi0d9/commands.json","count":0}
{"ts":"2026-10-27T00:35:52.735Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:52.736Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:52.736Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:52.743Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-ApJuBL/state-wHTMRg/commands.json","count":0}
{"ts":"2026-10-27T00:35:52.765Z","level":"warn","msg":"cannot start the pane socket; `sodactl ask` in a pane needs a login","error":"EISDIR: illegal operation on a directory, rename '/tmp/soda-psock-xVi0d9/.p-xoVPoJ/s' -> '/tmp/soda-psock-xVi0d9/pane.sock'"}
{"ts":"2026-10-27T00:35:52.990Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:52.990Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:52.991Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:52.999Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-psock-DZ33Pu/commands.json","count":0}
{"ts":"2026-10-27T00:35:53.323Z","level":"info","msg":"agent session attached","paneId":"83c3b0c5-5e18-4926-bcaf-7e3f75fb8082","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:35:53.426Z","level":"info","msg":"ask opened","askId":"5b6ef12bdb142b70b9cc213b57c4e454","paneId":"0b43921b-2716-4bcf-946c-57bc84242cb1","questions":1,"media":0}
{"ts":"2026-10-27T00:35:53.447Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"0b43921b-2716-4bcf-946c-57bc84242cb1","connId":"pane-socket:2","code":"invalid_ask_spec"}
{"ts":"2026-10-27T00:35:53.448Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"0b43921b-2716-4bcf-946c-57bc84242cb1","connId":"pane-socket:3","code":"invalid_params"}
{"ts":"2026-10-27T00:35:53.450Z","level":"info","msg":"pane socket: request","op":"pane.write","paneId":"0b43921b-2716-4bcf-946c-57bc84242cb1","connId":"pane-socket:4","code":"unknown_op"}
{"ts":"2026-10-27T00:35:53.451Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"p99","connId":"pane-socket:5","code":"not_found"}
{"ts":"2026-10-27T00:35:53.454Z","level":"info","msg":"ask closed","askId":"5b6ef12bdb142b70b9cc213b57c4e454","paneId":"0b43921b-2716-4bcf-946c-57bc84242cb1","status":"answered"}
{"ts":"2026-10-27T00:35:53.455Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"0b43921b-2716-4bcf-946c-57bc84242cb1","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:35:54.620Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:83c3b0c5-5e18-4926-bcaf-7e3f75fb8082"]}
{"ts":"2026-10-27T00:35:56.804Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:f93ee6e6-065d-40ae-b0e0-84df55594d64"]}
{"ts":"2026-10-27T00:35:56.858Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:56.859Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:56.859Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:56.870Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-ApJuBL/state-zIXT4m/commands.json","count":0}
{"ts":"2026-10-27T00:35:56.892Z","level":"info","msg":"graph.auto: added","child":"9e804019-1d6f-4408-b5b3-66a3706e53e1","parent":"9ae7ae87-6f68-4c06-8a6b-5fbbf44f5418","links":2}
{"ts":"2026-10-27T00:35:56.957Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:35:56.958Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:35:56.958Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:35:56.967Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-SXY4Yz/state-fydDJi/commands.json","count":0}
{"ts":"2026-10-27T00:35:57.503Z","level":"info","msg":"agent session attached","paneId":"3712d7e8-3b78-452a-8ecc-bc1025ac72e7","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:36:00.157Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:00.158Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:00.159Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:00.172Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-SXY4Yz/state-FRUTHY/commands.json","count":0}
{"ts":"2026-10-27T00:36:00.504Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:00.506Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:00.506Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:00.517Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-upHWUx/state-W75WAa/commands.json","count":0}
{"ts":"2026-10-27T00:36:01.901Z","level":"info","msg":"agent session attached","paneId":"a61d4456-d3b7-4f8a-97c5-410458c2b16a","kind":"claude","session":"conv-mai","source":"hook"}
{"ts":"2026-10-27T00:36:01.904Z","level":"info","msg":"graph.auto: added","child":"c19674a4-7c61-4bfb-895a-3321752e27ae","parent":"817f2209-c4cc-428d-b8f4-d6b80cdc0898","links":2}
{"ts":"2026-10-27T00:36:02.354Z","level":"info","msg":"agent report ignored","paneId":"a61d4456-d3b7-4f8a-97c5-410458c2b16a","kind":"claude","session":"conv-chi","reason":"the reporting process is not the pane's front agent (a nested or unrelated process)","agentPid":1201477}
{"ts":"2026-10-27T00:36:02.406Z","level":"info","msg":"agent session attached","paneId":"a61d4456-d3b7-4f8a-97c5-410458c2b16a","kind":"claude","session":"conv-mai","source":"hook"}
{"ts":"2026-10-27T00:36:02.455Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:02.470Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:02.470Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:02.478Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-upHWUx/state-mOMpTe/commands.json","count":0}
{"ts":"2026-10-27T00:36:03.054Z","level":"info","msg":"agent session attached","paneId":"cb810bdd-f4fa-423d-8b24-40adac72947b","kind":"claude","session":"conv-mai","source":"hook"}
{"ts":"2026-10-27T00:36:03.056Z","level":"info","msg":"agent report ignored","paneId":"cb810bdd-f4fa-423d-8b24-40adac72947b","kind":"claude","session":"conv-dae","reason":"the reporting process is not a descendant of the pane's shell","agentPid":1201389}
{"ts":"2026-10-27T00:36:03.169Z","level":"info","msg":"graph.auto: added","child":"7b495b77-61b7-44e0-bb18-bdc582e017b4","parent":"817f2209-c4cc-428d-b8f4-d6b80cdc0898","links":2}
{"ts":"2026-10-27T00:36:03.227Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:03.228Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:03.229Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:03.239Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-SXY4Yz/state-GQxiLa/commands.json","count":0}
{"ts":"2026-10-27T00:36:03.587Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:03.588Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:03.588Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:03.593Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-upHWUx/state-qN7PAg/commands.json","count":0}
{"ts":"2026-10-27T00:36:03.654Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:03.655Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:03.655Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:03.666Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-ApJuBL/state-g8JoE5/commands.json","count":0}
{"ts":"2026-10-27T00:36:04.165Z","level":"info","msg":"agent session attached","paneId":"d0056dd5-f58b-463b-8f92-e65ff3708df9","kind":"claude","session":"conv-nop","source":"hook"}
{"ts":"2026-10-27T00:36:04.219Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:04.220Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:04.220Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:04.227Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-upHWUx/state-HaNCJM/commands.json","count":0}
{"ts":"2026-10-27T00:36:04.340Z","level":"info","msg":"agent session attached","paneId":"ef8f9f5d-6bc4-4fc8-8893-0ba70e70cf68","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:36:05.035Z","level":"info","msg":"graph.auto: skipped","child":"4d7c3814-8efe-47f5-974c-6869e7ffeef5","parent":"43d63585-90c1-4930-85e8-738b02bbe499","reason":"duplicate_link"}
{"ts":"2026-10-27T00:36:05.035Z","level":"info","msg":"graph.auto: added","child":"4d7c3814-8efe-47f5-974c-6869e7ffeef5","parent":"43d63585-90c1-4930-85e8-738b02bbe499","links":1}
{"ts":"2026-10-27T00:36:05.152Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:05.153Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:05.153Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:05.161Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-SXY4Yz/state-RGTheE/commands.json","count":0}
{"ts":"2026-10-27T00:36:05.364Z","level":"info","msg":"agent session attached","paneId":"d6b54a22-215f-4797-bfa4-21c15be1c9ef","kind":"claude","session":"conv-mai","source":"hook"}
{"ts":"2026-10-27T00:36:05.366Z","level":"info","msg":"agent report ignored","paneId":"d6b54a22-215f-4797-bfa4-21c15be1c9ef","kind":"claude","reason":"the reporting process is not the pane's front agent (a nested or unrelated process)","agentPid":1201706}
{"ts":"2026-10-27T00:36:06.039Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:06.040Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:06.040Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:06.046Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-upHWUx/state-OMOMsP/commands.json","count":0}
{"ts":"2026-10-27T00:36:07.247Z","level":"info","msg":"agent session attached","paneId":"1e6d46f6-9b0a-4297-8870-a38d245b01f9","kind":"claude","session":"conv-fir","source":"hook"}
{"ts":"2026-10-27T00:36:07.340Z","level":"info","msg":"graph.auto: skipped","child":"8c6f0b39-0295-402e-97df-3aa33c024163","parent":"2eb23445-884b-4d6d-90cb-749c9c1ee1ea","reason":"supervisor_taken"}
{"ts":"2026-10-27T00:36:07.340Z","level":"info","msg":"graph.auto: added","child":"8c6f0b39-0295-402e-97df-3aa33c024163","parent":"2eb23445-884b-4d6d-90cb-749c9c1ee1ea","links":1}
{"ts":"2026-10-27T00:36:07.517Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:07.519Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:07.519Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:07.536Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-SXY4Yz/state-Lpjq0p/commands.json","count":0}
{"ts":"2026-10-27T00:36:08.149Z","level":"info","msg":"agent session dropped (a different agent started without reporting)","paneId":"1e6d46f6-9b0a-4297-8870-a38d245b01f9","kind":"claude","session":"conv-fir","sinceGoneMs":619.8582509999997}
{"ts":"2026-10-27T00:36:08.215Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:08.216Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:08.217Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:08.225Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-upHWUx/state-0naAEa/commands.json","count":0}
{"ts":"2026-10-27T00:36:08.797Z","level":"info","msg":"agent session attached","paneId":"6b07e1e2-e600-45b8-a5c5-4c85b3bc2445","kind":"codex","session":"01a1235d","source":"sole-codex"}
{"ts":"2026-10-27T00:36:08.880Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:08.881Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:08.881Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:08.888Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-upHWUx/state-ipRoIb/commands.json","count":0}
{"ts":"2026-10-27T00:36:09.218Z","level":"info","msg":"graph.auto: added","child":"5517770b-2d8a-475a-9e72-0602bb24af60","parent":"90d5a38c-bbdc-44ac-aa31-fa6fa747b20a","links":2}
{"ts":"2026-10-27T00:36:10.573Z","level":"info","msg":"graph.auto: added","child":"1714e0e3-9c3f-44f9-8212-32ffdcbc0430","parent":"90d5a38c-bbdc-44ac-aa31-fa6fa747b20a","links":2}
{"ts":"2026-10-27T00:36:10.616Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:10.617Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:10.617Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:10.627Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-lineage-it-SXY4Yz/state-Oa2UPh/commands.json","count":0}
{"ts":"2026-10-27T00:36:10.677Z","level":"info","msg":"agent report ignored","paneId":"cecdb8d1-86ad-4cea-a580-1d07707db18b","kind":"codex","session":"01a1235d","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): its cwd is not the pane's","agentPid":1201389}
{"ts":"2026-10-27T00:36:10.680Z","level":"info","msg":"agent report ignored","paneId":"cecdb8d1-86ad-4cea-a580-1d07707db18b","kind":"codex","session":"01a1235d","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): the report carries no cwd","agentPid":1201389}
{"ts":"2026-10-27T00:36:11.246Z","level":"info","msg":"agent session attached","paneId":"cecdb8d1-86ad-4cea-a580-1d07707db18b","kind":"codex","session":"01a1235d","source":"sole-codex"}
{"ts":"2026-10-27T00:36:11.328Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:11.329Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:11.329Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:11.334Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-upHWUx/state-jF2asQ/commands.json","count":0}
{"ts":"2026-10-27T00:36:11.790Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:bbc1d7c6-f208-4d12-9664-c23b3c11cbb8"]}
{"ts":"2026-10-27T00:36:12.483Z","level":"info","msg":"graph.auto: skipped","child":"3f4c3955-a64b-4feb-a472-aa6ee68cb5db","parent":"bbc1d7c6-f208-4d12-9664-c23b3c11cbb8","reason":"parent_gone"}
{"ts":"2026-10-27T00:36:13.083Z","level":"info","msg":"agent report ignored","paneId":"7be03376-ca96-41ff-8543-91d90a3804d5","kind":"codex","session":"codex-tw","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): 2 front codex agents exist and 0 of them took a first input just before the report (cannot tell which one owns it)","agentPid":1201389}
{"ts":"2026-10-27T00:36:13.123Z","level":"info","msg":"agent report ignored","paneId":"40a8d4df-2573-4310-b086-b785af86e5c1","kind":"codex","session":"codex-tw","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): 2 front codex agents exist and 0 of them took a first input just before the report (cannot tell which one owns it)","agentPid":1201389}
{"ts":"2026-10-27T00:36:13.892Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:13.893Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:13.893Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:13.902Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-upHWUx/state-dwNBEj/commands.json","count":0}
{"ts":"2026-10-27T00:36:14.313Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:14.316Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:14.317Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:14.325Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-ZqzM1x/commands.json","count":0}
{"ts":"2026-10-27T00:36:14.906Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:14.907Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:14.908Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:14.913Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-ZqzM1x/commands.json","count":0}
{"ts":"2026-10-27T00:36:14.920Z","level":"warn","msg":"handoff: listening on the configured port, which differs from the previous one","previous":1,"port":36505}
{"ts":"2026-10-27T00:36:14.963Z","level":"info","msg":"handoff: complete","id":"abcdef01","adopted":1,"dropped":0}
{"ts":"2026-10-27T00:36:15.052Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:15.053Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:15.053Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:15.059Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-tcZa9L/commands.json","count":0}
{"ts":"2026-10-27T00:36:15.512Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:15.513Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:15.513Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:15.520Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-tcZa9L/commands.json","count":0}
{"ts":"2026-10-27T00:36:15.526Z","level":"warn","msg":"handoff: closed terminals that were not part of the handoff","closed":1}
{"ts":"2026-10-27T00:36:15.526Z","level":"warn","msg":"handoff: listening on the configured port, which differs from the previous one","previous":1,"port":43865}
{"ts":"2026-10-27T00:36:15.539Z","level":"info","msg":"handoff: complete","id":"abcdef04","adopted":1,"dropped":0}
{"ts":"2026-10-27T00:36:15.648Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:15.655Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:15.655Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:15.667Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-Bv0HgQ/commands.json","count":0}
{"ts":"2026-10-27T00:36:15.814Z","level":"info","msg":"agent session attached","paneId":"cad54fa0-7a08-463f-8b66-212307f2cb84","kind":"codex","session":"01a12341","source":"first-turn"}
{"ts":"2026-10-27T00:36:15.866Z","level":"info","msg":"agent session attached","paneId":"b0ddd774-0893-40eb-ab1a-18e84769304b","kind":"codex","session":"01a1234a","source":"first-turn"}
{"ts":"2026-10-27T00:36:16.055Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:16.056Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:16.056Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:16.067Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-upHWUx/state-Kny9uU/commands.json","count":0}
{"ts":"2026-10-27T00:36:16.197Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:16.197Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:16.198Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:16.203Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-Bv0HgQ/commands.json","count":0}
{"ts":"2026-10-27T00:36:16.208Z","level":"warn","msg":"handoff: listening on the configured port, which differs from the previous one","previous":1,"port":35489}
{"ts":"2026-10-27T00:36:16.538Z","level":"info","msg":"agent resume skipped","paneId":"dda623e7-81f1-4992-82c9-f7b90b9a05a6","reason":"no-session-ref"}
{"ts":"2026-10-27T00:36:16.538Z","level":"warn","msg":"handoff: some handed-off panes were not usable and were closed","reason":"written by pid 1202603, not 1202602","panes":["dda623e7-81f1-4992-82c9-f7b90b9a05a6"]}
{"ts":"2026-10-27T00:36:16.538Z","level":"info","msg":"handoff: complete","id":"abcdef02","adopted":0,"dropped":1}
{"ts":"2026-10-27T00:36:16.898Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:16.899Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:16.899Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:16.905Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-EfBqzL/commands.json","count":0}
{"ts":"2026-10-27T00:36:17.422Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:17.422Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:17.423Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:17.430Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-EfBqzL/commands.json","count":0}
{"ts":"2026-10-27T00:36:17.436Z","level":"warn","msg":"handoff: listening on the configured port, which differs from the previous one","previous":1,"port":36443}
{"ts":"2026-10-27T00:36:17.750Z","level":"info","msg":"agent resume skipped","paneId":"e7b74fba-f38b-4f77-8da4-79527f49d9eb","reason":"no-session-ref"}
{"ts":"2026-10-27T00:36:17.751Z","level":"warn","msg":"handoff: some handed-off panes were not usable and were closed","reason":"not a pty master","panes":["e7b74fba-f38b-4f77-8da4-79527f49d9eb"]}
{"ts":"2026-10-27T00:36:17.751Z","level":"info","msg":"handoff: complete","id":"abcdef03","adopted":0,"dropped":1}
{"ts":"2026-10-27T00:36:17.930Z","level":"info","msg":"agent report ignored","paneId":"bd6ce598-c127-4795-85de-852dc1d2a583","kind":"codex","session":"01a12341","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): 2 front codex agents exist and 2 of them took a first input just before the report (cannot tell which one owns it)","agentPid":1201389}
{"ts":"2026-10-27T00:36:18.356Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:18.358Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:18.358Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:18.368Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-xqt3E6/commands.json","count":0}
{"ts":"2026-10-27T00:36:18.824Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:18.824Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:18.825Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:18.831Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-compose-xqt3E6/commands.json","count":0}
{"ts":"2026-10-27T00:36:18.835Z","level":"error","msg":"handoff: the handoff data was unusable; closed the handed-off terminals and starting normally","reason":"cannot read /tmp/soda-handoff-compose-xqt3E6/handoff.json: ENOENT","closed":1}
{"ts":"2026-10-27T00:36:18.919Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:18.920Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:18.921Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:18.928Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-upHWUx/state-3oVwo8/commands.json","count":0}
{"ts":"2026-10-27T00:36:19.150Z","level":"info","msg":"agent resume skipped","paneId":"0824efd1-5482-491c-b857-86ac5bb7dd49","reason":"no-session-ref"}
{"ts":"2026-10-27T00:36:19.211Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:19.212Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:19.212Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:19.220Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-handoff-psock-02LMHJ/commands.json","count":0}
{"ts":"2026-10-27T00:36:19.695Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:19.697Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:19.697Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:19.704Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-xdoqeU/state-cQZzXt/commands.json","count":0}
{"ts":"2026-10-27T00:36:19.772Z","level":"info","msg":"ask opened","askId":"d28e218c5c02d00846e16224e103d6ce","paneId":"54d68736-c3ca-4630-bc79-650d0c386e1c","questions":1,"media":0}
{"ts":"2026-10-27T00:36:19.775Z","level":"info","msg":"handoff: requested; running preflight"}
{"ts":"2026-10-27T00:36:19.776Z","level":"info","msg":"ask closed","askId":"d28e218c5c02d00846e16224e103d6ce","paneId":"54d68736-c3ca-4630-bc79-650d0c386e1c","status":"cancelled"}
{"ts":"2026-10-27T00:36:19.779Z","level":"info","msg":"pane socket: refused a connection","code":"pane_socket_busy"}
{"ts":"2026-10-27T00:36:19.789Z","level":"info","msg":"handoff: replacing this server with the version on disk","id":"ef871296c384a8d7","panes":1}
{"ts":"2026-10-27T00:36:19.790Z","level":"info","msg":"pane socket: refused a connection","code":"pane_socket_busy"}
{"ts":"2026-10-27T00:36:19.791Z","level":"error","msg":"handoff: execve failed; keeping the current server","error":"execve refused by the test"}
{"ts":"2026-10-27T00:36:19.818Z","level":"info","msg":"pane socket: request","op":"ask.open","paneId":"54d68736-c3ca-4630-bc79-650d0c386e1c","connId":"pane-socket:2","code":"ok"}
{"ts":"2026-10-27T00:36:20.529Z","level":"info","msg":"agent report ignored","paneId":"18bf0b32-87b6-41fb-aea3-4b23a2b89893","kind":"codex","session":"01a12326","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): 2 front codex agents exist and 0 of them took a first input just before the report (cannot tell which one owns it)","agentPid":1201389}
{"ts":"2026-10-27T00:36:20.584Z","level":"info","msg":"agent session attached","paneId":"4dbe57f0-c9c9-4be7-ba10-33d82772e425","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:36:21.282Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:21.283Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:21.283Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:21.291Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-xdoqeU/state-qsC6zi/commands.json","count":0}
{"ts":"2026-10-27T00:36:21.911Z","level":"info","msg":"agent session attached","paneId":"cca07259-7673-4ab9-8731-b9d12b677505","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:36:22.181Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:22.183Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:22.183Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:22.201Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-upHWUx/state-d8MaLy/commands.json","count":0}
{"ts":"2026-10-27T00:36:22.273Z","level":"info","msg":"agent report ignored","paneId":"18bf0b32-87b6-41fb-aea3-4b23a2b89893","kind":"codex","session":"01a1234a","reason":"the reporting process is a resident codex process (not a descendant of the pane's shell): the session record could not be checked","agentPid":1201389}
{"ts":"2026-10-27T00:36:22.522Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:22.523Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:22.523Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:22.529Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-xdoqeU/state-3xyDPC/commands.json","count":0}
{"ts":"2026-10-27T00:36:22.805Z","level":"info","msg":"agent session attached","paneId":"a783e220-90f0-43a0-9207-075f1dc9899a","kind":"codex","session":"01a12341","source":"argv"}
{"ts":"2026-10-27T00:36:22.868Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:22.869Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:22.869Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:22.879Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-upHWUx/state-4Ujwb2/commands.json","count":0}
{"ts":"2026-10-27T00:36:23.187Z","level":"info","msg":"agent session attached","paneId":"b718bdc4-f485-4378-b10e-66007da755ae","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:36:24.882Z","level":"info","msg":"agent session attached","paneId":"0bf298b7-cdde-4261-a440-7aea5cf64bce","kind":"codex","session":"01a12341","source":"first-turn"}
{"ts":"2026-10-27T00:36:25.897Z","level":"info","msg":"agent session dropped (a different agent started without reporting)","paneId":"0bf298b7-cdde-4261-a440-7aea5cf64bce","kind":"codex","session":"01a12341","sinceGoneMs":685.2803160000003}
{"ts":"2026-10-27T00:36:25.898Z","level":"info","msg":"agent session attached","paneId":"0bf298b7-cdde-4261-a440-7aea5cf64bce","kind":"codex","session":"01a1234a","source":"argv"}
{"ts":"2026-10-27T00:36:25.995Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:25.996Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:25.996Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:26.007Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-upHWUx/state-bBIcLz/commands.json","count":0}
{"ts":"2026-10-27T00:36:26.782Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:26.785Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:26.786Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:26.797Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-xdoqeU/state-au9RGm/commands.json","count":0}
{"ts":"2026-10-27T00:36:27.425Z","level":"info","msg":"agent session attached","paneId":"9c639490-6641-4e53-a931-0fa2e2240b04","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:36:27.526Z","level":"info","msg":"agent session attached","paneId":"49696e9b-9e91-4fc8-9b6f-0dcaa025ead6","kind":"codex","session":"01a12326","source":"exit-text"}
{"ts":"2026-10-27T00:36:27.594Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:27.595Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:27.595Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:27.605Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-upHWUx/state-xkIizY/commands.json","count":0}
{"ts":"2026-10-27T00:36:29.480Z","level":"info","msg":"agent session attached","paneId":"a4d6d916-9dd4-4840-bb57-545764dfce6c","kind":"codex","session":"01a12341","source":"first-turn"}
{"ts":"2026-10-27T00:36:29.544Z","level":"info","msg":"agent session attached","paneId":"b4beaf96-0414-418c-a02b-7338f2ca1d6c","kind":"codex","session":"01a1234a","source":"first-turn"}
{"ts":"2026-10-27T00:36:29.655Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:29.656Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:29.656Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:29.666Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-attribution-it-upHWUx/state-xkIizY/commands.json","count":0}
{"ts":"2026-10-27T00:36:30.023Z","level":"info","msg":"agent resume command written","paneId":"b4beaf96-0414-418c-a02b-7338f2ca1d6c","kind":"codex","session":"01a1234a"}
{"ts":"2026-10-27T00:36:30.340Z","level":"info","msg":"agent resume command written","paneId":"a4d6d916-9dd4-4840-bb57-545764dfce6c","kind":"codex","session":"01a12341"}
{"ts":"2026-10-27T00:36:30.668Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:30.670Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:30.671Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:30.680Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-tui-it-k9Sy3p/state/commands.json","count":0}
{"ts":"2026-10-27T00:36:34.028Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:34.030Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:34.030Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:34.037Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:3625cebb-0d73-45e5-9841-edb8ddefd464"]}
{"ts":"2026-10-27T00:36:34.038Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-o25VOG/commands.json","count":0}
{"ts":"2026-10-27T00:36:34.510Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:34.512Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:34.513Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:34.523Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-xdoqeU/state-puaNkM/commands.json","count":0}
{"ts":"2026-10-27T00:36:34.754Z","level":"info","msg":"ask opened","askId":"fe179852a6e2695a3a79c1d116085277","paneId":"3626f5ce-6c80-4b9a-9f13-b5438cf0543c","questions":1,"media":0}
{"ts":"2026-10-27T00:36:34.777Z","level":"info","msg":"ask closed","askId":"fe179852a6e2695a3a79c1d116085277","paneId":"3626f5ce-6c80-4b9a-9f13-b5438cf0543c","status":"answered"}
{"ts":"2026-10-27T00:36:34.832Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:34.833Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:34.833Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:34.865Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-FcQTK3/commands.json","count":0}
{"ts":"2026-10-27T00:36:35.177Z","level":"info","msg":"agent session attached","paneId":"fb056ce0-35e3-415f-bb18-3546a45a52c9","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:36:35.485Z","level":"info","msg":"ask opened","askId":"23a1298ef17524bb89b01affbc445dd8","paneId":"6519546b-047f-441e-92c6-1bd9b60e3e52","questions":13,"media":0}
{"ts":"2026-10-27T00:36:35.541Z","level":"info","msg":"ask closed","askId":"23a1298ef17524bb89b01affbc445dd8","paneId":"6519546b-047f-441e-92c6-1bd9b60e3e52","status":"answered"}
{"ts":"2026-10-27T00:36:35.581Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:35.582Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:35.582Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:35.591Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-oqU94Z/commands.json","count":0}
{"ts":"2026-10-27T00:36:35.925Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:35.926Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:35.926Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:35.940Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-xdoqeU/state-C0tjsZ/commands.json","count":0}
{"ts":"2026-10-27T00:36:36.194Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:36.195Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:36.195Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:36.202Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-sLc4ZO/commands.json","count":0}
{"ts":"2026-10-27T00:36:36.486Z","level":"info","msg":"agent session attached","paneId":"4e5fbb23-b748-4a45-8c2a-b2884b082745","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:36:36.805Z","level":"info","msg":"ask opened","askId":"8362b8443104d8f219240f442880eeb8","paneId":"a8aaed80-49c7-46d0-a920-651fd1edd254","questions":1,"media":0}
{"ts":"2026-10-27T00:36:36.830Z","level":"info","msg":"ask closed","askId":"8362b8443104d8f219240f442880eeb8","paneId":"a8aaed80-49c7-46d0-a920-651fd1edd254","status":"cancelled"}
{"ts":"2026-10-27T00:36:36.863Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:36.864Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:36.864Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:36.872Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-8fm8vD/commands.json","count":0}
{"ts":"2026-10-27T00:36:37.160Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:37.161Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:37.161Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:37.169Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-xdoqeU/state-GHmGIQ/commands.json","count":0}
{"ts":"2026-10-27T00:36:37.317Z","level":"info","msg":"ask opened","askId":"1f34c2ec2e06dd5a86f0ac7bc7f7adde","paneId":"9bfe1a53-5e5a-4b6e-a925-a302dd0f67e2","questions":1,"media":0}
{"ts":"2026-10-27T00:36:37.448Z","level":"info","msg":"ask closed","askId":"1f34c2ec2e06dd5a86f0ac7bc7f7adde","paneId":"9bfe1a53-5e5a-4b6e-a925-a302dd0f67e2","status":"cancelled"}
{"ts":"2026-10-27T00:36:37.541Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:37.544Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:37.544Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:37.563Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-IaEB6s/commands.json","count":0}
{"ts":"2026-10-27T00:36:37.774Z","level":"info","msg":"agent session attached","paneId":"7edba535-8cbe-43db-a4d7-04788bcd9f80","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:36:37.900Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:37.901Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:37.901Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:37.911Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-ApJuBL/state-e3xe9l/commands.json","count":0}
{"ts":"2026-10-27T00:36:38.145Z","level":"info","msg":"ask opened","askId":"06281979187c6d1390d1ed7bb5eb3624","paneId":"d1ad045b-f146-4f6e-b5a6-aad36f872c1d","questions":3,"media":0}
{"ts":"2026-10-27T00:36:38.207Z","level":"info","msg":"ask closed","askId":"06281979187c6d1390d1ed7bb5eb3624","paneId":"d1ad045b-f146-4f6e-b5a6-aad36f872c1d","status":"answered"}
{"ts":"2026-10-27T00:36:38.245Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:38.246Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:38.246Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:38.254Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-UyqDNM/commands.json","count":0}
{"ts":"2026-10-27T00:36:38.869Z","level":"info","msg":"ask opened","askId":"01cc5e43bfea038737fed0c07610b616","paneId":"17aab966-c02d-4406-ade0-61645ec19bf8","questions":1,"media":0}
{"ts":"2026-10-27T00:36:38.949Z","level":"info","msg":"ask closed","askId":"01cc5e43bfea038737fed0c07610b616","paneId":"17aab966-c02d-4406-ade0-61645ec19bf8","status":"answered"}
{"ts":"2026-10-27T00:36:39.006Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:39.006Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:39.007Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:39.018Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-1RXhNb/commands.json","count":0}
{"ts":"2026-10-27T00:36:39.048Z","level":"info","msg":"agent session attached","paneId":"46fb2736-153b-4154-9715-2e12e24260b0","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:36:39.251Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:39.253Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:39.253Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:39.260Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-6xcqOT/commands.json","count":0}
{"ts":"2026-10-27T00:36:39.526Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:39.528Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:39.528Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:39.536Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-xdoqeU/state-9F46Rc/commands.json","count":0}
{"ts":"2026-10-27T00:36:39.601Z","level":"info","msg":"ask opened","askId":"bb06b91fea5489206dc2b61ad30b3627","paneId":"555021e9-022e-4e3b-abeb-63ba3ac61c4b","questions":1,"media":0}
{"ts":"2026-10-27T00:36:39.621Z","level":"info","msg":"ask closed","askId":"bb06b91fea5489206dc2b61ad30b3627","paneId":"555021e9-022e-4e3b-abeb-63ba3ac61c4b","status":"cancelled"}
{"ts":"2026-10-27T00:36:40.115Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:40.116Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:40.116Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:40.123Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-tAxfG8/commands.json","count":0}
{"ts":"2026-10-27T00:36:40.139Z","level":"info","msg":"agent session attached","paneId":"3c62d988-7979-4247-84f2-8d30d8ac8648","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:36:40.149Z","level":"info","msg":"ask opened","askId":"2caa0235a033b8f515f8e58f8de5bf50","paneId":"e8b470b1-f050-4c59-bf48-9ae377181280","questions":1,"media":0}
{"ts":"2026-10-27T00:36:40.205Z","level":"info","msg":"ask closed","askId":"2caa0235a033b8f515f8e58f8de5bf50","paneId":"e8b470b1-f050-4c59-bf48-9ae377181280","status":"cancelled"}
{"ts":"2026-10-27T00:36:40.211Z","level":"info","msg":"graph.cleanup: removed nodes of closed panes","nodes":["local:e8b470b1-f050-4c59-bf48-9ae377181280"]}
{"ts":"2026-10-27T00:36:40.307Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:40.309Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:40.309Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:40.331Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-8EWD5g/commands.json","count":0}
{"ts":"2026-10-27T00:36:40.573Z","level":"info","msg":"display script enabled","byClientId":"8ed10a0e-e423-4dd3-9e79-6146bc5e84fc","byKind":"external"}
{"ts":"2026-10-27T00:36:40.619Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:40.619Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:40.620Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:40.626Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-P4l2a6/commands.json","count":0}
{"ts":"2026-10-27T00:36:40.717Z","level":"info","msg":"agent report ignored","paneId":"3c62d988-7979-4247-84f2-8d30d8ac8648","kind":"claude","session":"3e81f9a7","reason":"the reporting process is not a descendant of the pane's shell","agentPid":1203317}
{"ts":"2026-10-27T00:36:40.888Z","level":"info","msg":"ask opened","askId":"d3ae0a547446299a55515fb2d72f091f","paneId":"75539951-a4cf-4b75-88e9-983f839ac889","questions":1,"media":0}
{"ts":"2026-10-27T00:36:40.917Z","level":"info","msg":"ask closed","askId":"d3ae0a547446299a55515fb2d72f091f","paneId":"75539951-a4cf-4b75-88e9-983f839ac889","status":"cancelled"}
{"ts":"2026-10-27T00:36:40.951Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:40.952Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:40.952Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:40.960Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-ask-lqdg5s/commands.json","count":0}
{"ts":"2026-10-27T00:36:41.139Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:41.140Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:41.140Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:41.142Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:41.143Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:41.143Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:41.148Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-MIm7yO/commands.json","count":0}
{"ts":"2026-10-27T00:36:41.152Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usage-it-xdoqeU/state-8P63eN/commands.json","count":0}
{"ts":"2026-10-27T00:36:41.517Z","level":"info","msg":"ask opened","askId":"a558d1b52a85e1591daac33b737378f5","paneId":"ba300e79-f7c7-45be-873d-d4b88c9d85c7","questions":1,"media":0}
{"ts":"2026-10-27T00:36:41.543Z","level":"info","msg":"ask closed","askId":"a558d1b52a85e1591daac33b737378f5","paneId":"ba300e79-f7c7-45be-873d-d4b88c9d85c7","status":"answered"}
{"ts":"2026-10-27T00:36:41.618Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:41.619Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:41.619Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:41.626Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-MIm7yO/commands.json","count":0}
{"ts":"2026-10-27T00:36:41.954Z","level":"info","msg":"agent resume skipped","paneId":"59be33ed-31bd-4af2-b24a-69c50b8aa09d","reason":"no-session-ref"}
{"ts":"2026-10-27T00:36:42.099Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:42.101Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:42.101Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:42.110Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-olTOWF/commands.json","count":0}
{"ts":"2026-10-27T00:36:42.383Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:42.387Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:42.387Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:42.395Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-remote-88sVYf/commands.json","count":0}
{"ts":"2026-10-27T00:36:42.663Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:42.664Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:42.664Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:42.676Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-N28Vjw/commands.json","count":0}
{"ts":"2026-10-27T00:36:42.888Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:42.890Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:42.890Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:42.895Z","level":"info","msg":"agent session attached","paneId":"ada4530d-0510-4bd8-baed-e70799c0f761","kind":"claude","session":"1628ddc9","source":"hook"}
{"ts":"2026-10-27T00:36:42.895Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-local-qzERTa/commands.json","count":0}
{"ts":"2026-10-27T00:36:43.187Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:43.188Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:43.188Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:43.196Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-Rv5Lnu/commands.json","count":0}
{"ts":"2026-10-27T00:36:43.632Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:43.633Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:43.633Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:43.646Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-HjhnEd/commands.json","count":0}
{"ts":"2026-10-27T00:36:44.082Z","level":"warn","msg":"origin rejected","path":"/api/local-login","remoteAddress":"127.0.0.1","origin":"http://evil.example","host":"127.0.0.1:36037","allowed":["localhost:36037","127.0.0.1:36037","[::1]:36037"],"hint":"ブラウザで開いた Origin がこのマシンのアドレスに無いなら soda serve --origin <その Origin> で許可できます"}
{"ts":"2026-10-27T00:36:44.148Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:44.149Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:44.149Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:44.157Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-TBZkTN/commands.json","count":0}
{"ts":"2026-10-27T00:36:44.628Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:44.629Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:44.629Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:44.636Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-climode-ZyCGYB/commands.json","count":0}
{"ts":"2026-10-27T00:36:47.343Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T00:36:47.520Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:47.522Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:47.522Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:47.533Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-remote-b4McHB/commands.json","count":0}
{"ts":"2026-10-27T00:36:47.675Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:47.677Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:47.677Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:47.685Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-statusline-it-YxAIUo/state-c2n1FT/commands.json","count":0}
{"ts":"2026-10-27T00:36:48.126Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:48.127Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:48.127Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:48.134Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-local-8r16DD/commands.json","count":0}
{"ts":"2026-10-27T00:36:48.661Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:48.662Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:48.663Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:48.676Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-ApJuBL/state-eYX6Yz/commands.json","count":0}
{"ts":"2026-10-27T00:36:49.041Z","level":"info","msg":"agent session attached","paneId":"e855ede8-bbfa-4848-90d1-6744d8f154c0","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:36:49.052Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:49.054Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:49.054Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:49.062Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-qewG3S/commands.json","count":0}
{"ts":"2026-10-27T00:36:49.363Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:49.364Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:49.364Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:49.369Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-statusline-it-YxAIUo/state-xIytQX/commands.json","count":0}
{"ts":"2026-10-27T00:36:49.580Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:36:49.754Z","level":"info","msg":"agent session attached","paneId":"ce06f764-1ba0-4e93-ab70-491ed39908bb","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:36:49.760Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:49.761Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:49.761Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:49.784Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-7nw3iV/commands.json","count":0}
{"ts":"2026-10-27T00:36:51.183Z","level":"info","msg":"agent session attached","paneId":"9771b7b5-c6af-4c70-b0da-e3f9307e1ed9","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:36:51.700Z","level":"info","msg":"machine link closed","machine":"6265dfb4cab4af5a7be6d1cf31de7f8e","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T00:36:52.444Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T00:36:52.497Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:52.498Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:52.498Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:52.520Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-remote-Us6gXU/commands.json","count":0}
{"ts":"2026-10-27T00:36:52.822Z","level":"info","msg":"machine link closed","machine":"6265dfb4cab4af5a7be6d1cf31de7f8e","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:36:53.061Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:53.062Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:53.062Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:53.070Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-local-8AQF1Z/commands.json","count":0}
{"ts":"2026-10-27T00:36:53.423Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:53.424Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:53.425Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:53.448Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-1Wn85r/commands.json","count":0}
{"ts":"2026-10-27T00:36:53.547Z","level":"info","msg":"agent session attached","paneId":"ec0ad41c-1c6b-48bd-a098-66db93dcdbe2","kind":"claude","session":"5cc6a9f0","source":"hook"}
{"ts":"2026-10-27T00:36:54.096Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:54.098Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:54.098Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:54.107Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-PZ9Kmj/commands.json","count":0}
{"ts":"2026-10-27T00:36:54.743Z","level":"info","msg":"machine link closed","machine":"89fec6277540dd354e24c60678c88be5","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:36:55.334Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:55.335Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:55.335Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:55.344Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-PZ9Kmj/commands.json","count":0}
{"ts":"2026-10-27T00:36:55.676Z","level":"info","msg":"agent resume skipped","paneId":"0b0828c9-cf4b-4043-aa93-7cf41605b9e4","reason":"no-session-ref"}
{"ts":"2026-10-27T00:36:55.774Z","level":"info","msg":"machine link closed","machine":"89fec6277540dd354e24c60678c88be5","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:36:55.825Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:55.826Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:55.826Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:55.835Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-7FNQ70/commands.json","count":0}
{"ts":"2026-10-27T00:36:56.324Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:56.325Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:56.325Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:56.334Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-Lbi50f/commands.json","count":0}
{"ts":"2026-10-27T00:36:57.141Z","level":"info","msg":"machine link closed","machine":"1692ada6be8712f894dd2099e2bfa544","kind":"transient","reason":"接続が切れました"}
{"ts":"2026-10-27T00:36:57.191Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:57.192Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:57.192Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:57.200Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-ibu3il/commands.json","count":0}
{"ts":"2026-10-27T00:36:57.588Z","level":"info","msg":"machine link closed","machine":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","kind":"transient","reason":"接続を閉じました"}
{"ts":"2026-10-27T00:36:57.835Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:57.848Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:57.849Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:57.868Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-Is3Y1M/commands.json","count":0}
{"ts":"2026-10-27T00:36:58.749Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:58.750Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:58.751Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:58.765Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-reverse-pPjYuw/commands.json","count":0}
{"ts":"2026-10-27T00:36:59.009Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:36:59.010Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:36:59.011Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:36:59.030Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-ApJuBL/state-NrD1dO/commands.json","count":0}
{"ts":"2026-10-27T00:36:59.464Z","level":"info","msg":"machine link closed","machine":"6226a1da484dfa12c17fd8add495eaf7","kind":"transient","reason":"接続が切れました（ssh: connect to host 127.0.0.1 port 1: Connection refused）"}
{"ts":"2026-10-27T00:37:00.214Z","level":"info","msg":"agent session attached","paneId":"71bf8f40-e4b2-4e89-bb2b-1690b0cca902","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:37:00.959Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:00.961Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:00.961Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:00.968Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-askm-KTJkLL/commands.json","count":0}
{"ts":"2026-10-27T00:37:01.669Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:01.685Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:01.686Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:01.696Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-perf-Ll5hyv/commands.json","count":0}
{"ts":"2026-10-27T00:37:01.801Z","level":"info","msg":"ask remote image fetch","host":"example.com"}
{"ts":"2026-10-27T00:37:01.801Z","level":"info","msg":"ask remote image fetch","host":"example.com"}
{"ts":"2026-10-27T00:37:01.806Z","level":"info","msg":"ask opened","askId":"50cff71743f91ff9d81af7c72b1552e9","paneId":"edd2215d-85d5-49ce-b701-43f5551f02f6","questions":1,"media":5}
{"ts":"2026-10-27T00:37:01.869Z","level":"info","msg":"ask closed","askId":"50cff71743f91ff9d81af7c72b1552e9","paneId":"edd2215d-85d5-49ce-b701-43f5551f02f6","status":"answered"}
{"ts":"2026-10-27T00:37:01.940Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:01.941Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:01.941Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:01.947Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-askm-hW5LMF/commands.json","count":0}
{"ts":"2026-10-27T00:37:02.563Z","level":"info","msg":"ask remote image fetch","host":"example.com"}
{"ts":"2026-10-27T00:37:02.563Z","level":"info","msg":"ask remote image failed"}
{"ts":"2026-10-27T00:37:02.563Z","level":"info","msg":"ask opened","askId":"92541fd73edf19fbfe908537fb2bcb4c","paneId":"9a607f6d-a1fb-4afe-b841-8bfbf3ca6a2c","questions":1,"media":0}
{"ts":"2026-10-27T00:37:02.585Z","level":"info","msg":"ask closed","askId":"92541fd73edf19fbfe908537fb2bcb4c","paneId":"9a607f6d-a1fb-4afe-b841-8bfbf3ca6a2c","status":"cancelled"}
{"ts":"2026-10-27T00:37:02.631Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:02.632Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:02.632Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:02.641Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-askm-Qt0pLa/commands.json","count":0}
{"ts":"2026-10-27T00:37:03.260Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:03.261Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:03.261Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:03.268Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-askm-983hwK/commands.json","count":0}
{"ts":"2026-10-27T00:37:03.586Z","level":"info","msg":"usage report ignored","paneId":"9771b7b5-c6af-4c70-b0da-e3f9307e1ed9","kind":"claude","reason":"the report did not match the pane's front agent / current conversation in time"}
{"ts":"2026-10-27T00:37:03.877Z","level":"info","msg":"agent session attached","paneId":"56486b36-44ae-4fbb-ba72-71655f5bf8eb","kind":"claude","session":"bac43787","source":"hook"}
{"ts":"2026-10-27T00:37:03.884Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:03.901Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:03.901Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:03.915Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-statusline-it-YxAIUo/state-bAern7/commands.json","count":0}
{"ts":"2026-10-27T00:37:04.108Z","level":"info","msg":"ask opened","askId":"8bc9575bea10826e4516ae1d3fe398f7","paneId":"a85d5967-9fb2-4557-8424-8c0164a9d76d","questions":1,"media":1}
{"ts":"2026-10-27T00:37:04.129Z","level":"info","msg":"ask closed","askId":"8bc9575bea10826e4516ae1d3fe398f7","paneId":"a85d5967-9fb2-4557-8424-8c0164a9d76d","status":"cancelled"}
{"ts":"2026-10-27T00:37:04.188Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:04.196Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:04.196Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:04.207Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-askm-WcutyD/commands.json","count":0}
{"ts":"2026-10-27T00:37:04.806Z","level":"info","msg":"pane socket: request","op":"ask.features","paneId":"0279e636-6420-4833-94ba-327218984085","connId":"pane-socket:1","code":"ok"}
{"ts":"2026-10-27T00:37:04.809Z","level":"info","msg":"pane socket: request","op":"ask.nope","paneId":"0279e636-6420-4833-94ba-327218984085","connId":"pane-socket:2","code":"unknown_op"}
{"ts":"2026-10-27T00:37:05.344Z","level":"info","msg":"agent session attached","paneId":"eee2ffe9-8ee3-4941-b1da-b6860cca4c1c","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:37:05.373Z","level":"info","msg":"usage report ignored","paneId":"eee2ffe9-8ee3-4941-b1da-b6860cca4c1c","kind":"claude","reason":"the reporting process is not a descendant of the pane's shell"}
{"ts":"2026-10-27T00:37:07.010Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:07.024Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:07.025Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:07.038Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-statusline-it-YxAIUo/state-56oQxS/commands.json","count":0}
{"ts":"2026-10-27T00:37:10.307Z","level":"info","msg":"agent session attached","paneId":"d74cb6ee-5ede-4327-ba20-e0bf300df6f5","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:37:11.019Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:11.022Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:11.023Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:11.031Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usagefeed-it-gmqW9j/state-WWUJ68/commands.json","count":0}
{"ts":"2026-10-27T00:37:11.060Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:11.062Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:11.063Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:11.076Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-ApJuBL/state-unlolH/commands.json","count":0}
{"ts":"2026-10-27T00:37:11.783Z","level":"info","msg":"agent session attached","paneId":"3621a8f7-d8bc-49f0-9e07-b376d66e169c","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:37:12.258Z","level":"info","msg":"agent session attached","paneId":"dcd7ae4d-69b8-4ff6-8123-5259abf97663","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:37:13.796Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:13.798Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:13.798Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:13.809Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-qiNz8X/state-fw99ZW/commands.json","count":0}
{"ts":"2026-10-27T00:37:15.384Z","level":"info","msg":"agent session attached","paneId":"fb9e6f81-dbb1-49b6-876a-afaa01eb5c4e","kind":"claude","session":"conv-KIL","source":"hook"}
{"ts":"2026-10-27T00:37:15.655Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:15.656Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:15.657Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:15.662Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-qiNz8X/state-fw99ZW/commands.json","count":0}
[graph-perf] {"case":"single-change","panes":16,"links":32,"limitMs":2000,"results":[{"source":0,"toStartMs":[46,47],"toSentMs":[1463,1463]},{"source":5,"toStartMs":[488,489],"toSentMs":[1456,1457]},{"source":10,"toStartMs":[5,7],"toSentMs":[1131,1131]}]}
{"ts":"2026-10-27T00:37:15.996Z","level":"info","msg":"agent resume command written","paneId":"fb9e6f81-dbb1-49b6-876a-afaa01eb5c4e","kind":"claude","session":"conv-KIL"}
{"ts":"2026-10-27T00:37:16.084Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:16.087Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:16.087Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:16.094Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-qiNz8X/state-FoPT5r/commands.json","count":0}
{"ts":"2026-10-27T00:37:16.570Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:16.571Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:16.571Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:16.579Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-perf-2gPdVg/commands.json","count":0}
{"ts":"2026-10-27T00:37:16.663Z","level":"info","msg":"agent session attached","paneId":"3610c655-9d6a-4189-81fe-26ba56980285","kind":"claude","session":"conv-TER","source":"hook"}
{"ts":"2026-10-27T00:37:16.885Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:16.886Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:16.886Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:16.891Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-qiNz8X/state-FoPT5r/commands.json","count":0}
{"ts":"2026-10-27T00:37:17.207Z","level":"info","msg":"agent resume command written","paneId":"3610c655-9d6a-4189-81fe-26ba56980285","kind":"claude","session":"conv-TER"}
{"ts":"2026-10-27T00:37:17.321Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:17.324Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:17.326Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:17.342Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-qiNz8X/state-OYKS29/commands.json","count":0}
{"ts":"2026-10-27T00:37:18.554Z","level":"info","msg":"agent session attached","paneId":"fa22b738-cb4a-4a49-aab6-2f958a2d63a9","kind":"claude","session":"conv-HUP","source":"hook"}
{"ts":"2026-10-27T00:37:18.746Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:18.746Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:18.746Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:18.752Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-qiNz8X/state-OYKS29/commands.json","count":0}
{"ts":"2026-10-27T00:37:19.069Z","level":"info","msg":"agent resume command written","paneId":"fa22b738-cb4a-4a49-aab6-2f958a2d63a9","kind":"claude","session":"conv-HUP"}
{"ts":"2026-10-27T00:37:19.141Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:19.142Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:19.142Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:19.148Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-qiNz8X/state-rqifw9/commands.json","count":0}
{"ts":"2026-10-27T00:37:19.726Z","level":"info","msg":"agent session attached","paneId":"32272a29-b2fd-4902-8a7d-3c3cfba3e855","kind":"claude","session":"conv-gra","source":"hook"}
{"ts":"2026-10-27T00:37:22.275Z","level":"info","msg":"agent session attached","paneId":"96c0882d-5431-4b4d-bdf9-c97bb1c531bc","kind":"claude","session":"aa31c104","source":"hook"}
{"ts":"2026-10-27T00:37:22.987Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:22.987Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:22.988Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:22.994Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-qiNz8X/state-rqifw9/commands.json","count":0}
{"ts":"2026-10-27T00:37:23.313Z","level":"info","msg":"agent resume command written","paneId":"32272a29-b2fd-4902-8a7d-3c3cfba3e855","kind":"claude","session":"conv-gra"}
{"ts":"2026-10-27T00:37:23.363Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:23.364Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:23.364Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:23.371Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-qiNz8X/state-Hcykri/commands.json","count":0}
{"ts":"2026-10-27T00:37:23.920Z","level":"info","msg":"agent session attached","paneId":"d125f5ee-8970-4e82-bbdf-aa36662943e0","kind":"claude","session":"conv-lat","source":"hook"}
{"ts":"2026-10-27T00:37:23.990Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:23.991Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:23.991Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:24.001Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-ApJuBL/state-2f1KsB/commands.json","count":0}
{"ts":"2026-10-27T00:37:25.167Z","level":"info","msg":"agent session attached","paneId":"e3b6ebfe-bf42-4a82-92f9-14916cb1b52a","kind":"claude","session":"3e81f9a7","source":"hook"}
[graph-perf] {"case":"blocked","panes":16,"links":32,"holdMs":1000,"limitMs":2000,"results":[{"source":0,"triggerStartMs":1426,"approvalStartMs":1544},{"source":5,"triggerStartMs":1027,"approvalStartMs":1027},{"source":10,"triggerStartMs":1075,"approvalStartMs":1076}]}
{"ts":"2026-10-27T00:37:27.161Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:27.162Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:27.163Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:27.172Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-perf-iwEUGB/commands.json","count":0}
[graph-perf] {"case":"burst","panes":16,"links":32,"limitMs":2000,"maxFirstStartMs":16,"firstStartMs":[16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16]}
{"ts":"2026-10-27T00:37:34.854Z","level":"info","msg":"agent session attached","paneId":"ef41d1d2-1727-48a0-92cd-e3dedfff0e64","kind":"claude","session":"545fe14f","source":"hook"}
{"ts":"2026-10-27T00:37:36.187Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:36.189Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:36.189Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:36.197Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-qiNz8X/state-LL1Xse/commands.json","count":0}
{"ts":"2026-10-27T00:37:36.197Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:36.198Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:36.198Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:36.205Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usagefeed-it-gmqW9j/state-yKpcYy/commands.json","count":0}
{"ts":"2026-10-27T00:37:36.461Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:36.462Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:36.462Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:36.473Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-ApJuBL/state-8Yihkn/commands.json","count":0}
{"ts":"2026-10-27T00:37:36.690Z","level":"info","msg":"agent session attached","paneId":"b981a4d2-50d3-40eb-9177-af27260653fe","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:37:36.872Z","level":"info","msg":"agent session attached","paneId":"74684f47-671c-4743-a98c-29369fba560f","kind":"claude","session":"conv-qui","source":"hook"}
{"ts":"2026-10-27T00:37:37.094Z","level":"info","msg":"agent session attached","paneId":"74ea98e6-98d8-4b75-8985-a31c3953e241","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:37:38.027Z","level":"info","msg":"agent session attached","paneId":"74ea98e6-98d8-4b75-8985-a31c3953e241","kind":"claude","session":"7c0a3f2e","source":"hook"}
{"ts":"2026-10-27T00:37:40.344Z","level":"info","msg":"agent session attached","paneId":"5f583c1d-87cc-4d9b-96e9-4a9c01c6d9e3","kind":"claude","session":"d0e2d054","source":"hook"}
{"ts":"2026-10-27T00:37:40.417Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:40.418Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:40.418Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:40.426Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-ApJuBL/state-XprN0P/commands.json","count":0}
{"ts":"2026-10-27T00:37:41.356Z","level":"info","msg":"agent session attached","paneId":"14e3b3ae-8a47-433c-a3e5-50fc90af3e2e","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:37:41.990Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:41.991Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:41.991Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:41.998Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-ApJuBL/state-exLWWg/commands.json","count":0}
{"ts":"2026-10-27T00:37:42.053Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:42.054Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:42.054Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:42.063Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-usagefeed-it-gmqW9j/state-7JOwPB/commands.json","count":0}
{"ts":"2026-10-27T00:37:42.652Z","level":"info","msg":"agent session attached","paneId":"655ef919-5442-44c6-a3f9-8879f9b5c88f","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:37:42.866Z","level":"info","msg":"agent session attached","paneId":"1698f30e-46a9-4f3c-a826-fc43a1dce729","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:37:46.401Z","level":"info","msg":"agent session attached","paneId":"5a90436a-7473-4ec8-b621-3910f1658bd9","kind":"claude","session":"fbd1c049","source":"hook"}
{"ts":"2026-10-27T00:37:46.468Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:46.469Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:46.469Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:46.479Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-ApJuBL/state-7ltBlP/commands.json","count":0}
{"ts":"2026-10-27T00:37:47.082Z","level":"info","msg":"agent session dropped (agent gone, shell alive)","paneId":"74684f47-671c-4743-a98c-29369fba560f","graceMs":10000,"kind":"claude","session":"conv-qui","reason":"agent ended"}
{"ts":"2026-10-27T00:37:47.181Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:47.182Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:47.182Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:47.187Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-qiNz8X/state-LL1Xse/commands.json","count":0}
{"ts":"2026-10-27T00:37:47.426Z","level":"info","msg":"agent session attached","paneId":"9b1613a9-0fee-4e61-9db4-403d775544ff","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:37:47.504Z","level":"info","msg":"agent resume skipped","paneId":"74684f47-671c-4743-a98c-29369fba560f","reason":"no-session-ref"}
{"ts":"2026-10-27T00:37:47.689Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:47.691Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:47.691Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:47.699Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-maintain-et31Xp/commands.json","count":0}
{"ts":"2026-10-27T00:37:49.348Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:49.350Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:49.350Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:49.356Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-metadata-tAlMfm/commands.json","count":0}
{"ts":"2026-10-27T00:37:49.614Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:49.614Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:49.615Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:49.622Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-qiNz8X/state-0iF0s8/commands.json","count":0}
{"ts":"2026-10-27T00:37:50.110Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:50.111Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:50.111Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:50.118Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-metadata-mubBTi/commands.json","count":0}
{"ts":"2026-10-27T00:37:50.129Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:50.130Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:50.130Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:50.151Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-maintain-3ARaqD/commands.json","count":0}
{"ts":"2026-10-27T00:37:50.207Z","level":"info","msg":"agent session attached","paneId":"84d1dc4e-73a8-49b3-92d1-0a97c65c5f7b","kind":"claude","session":"conv-bc","source":"hook"}
{"ts":"2026-10-27T00:37:50.239Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:50.240Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:50.240Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:50.246Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-qiNz8X/state-0iF0s8/commands.json","count":0}
{"ts":"2026-10-27T00:37:50.581Z","level":"info","msg":"agent resume command written","paneId":"84d1dc4e-73a8-49b3-92d1-0a97c65c5f7b","kind":"claude","session":"conv-bc"}
{"ts":"2026-10-27T00:37:50.652Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:50.653Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:50.653Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:50.659Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-resumelost-it-qiNz8X/state-0iF0s8/commands.json","count":0}
{"ts":"2026-10-27T00:37:50.660Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:50.661Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:50.661Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:50.670Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-metadata-F2VgUX/commands.json","count":0}
{"ts":"2026-10-27T00:37:50.977Z","level":"info","msg":"agent resume command written","paneId":"84d1dc4e-73a8-49b3-92d1-0a97c65c5f7b","kind":"claude","session":"conv-bc"}
{"ts":"2026-10-27T00:37:51.430Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:51.431Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:51.431Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:51.438Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-metadata-jETgFg/commands.json","count":0}
{"ts":"2026-10-27T00:37:52.092Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:52.093Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:52.093Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:52.101Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-maintain-qPUkJ9/commands.json","count":0}
{"ts":"2026-10-27T00:37:52.213Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:52.215Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:52.215Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:52.226Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-t3rDxX/commands.json","count":1}
{"ts":"2026-10-27T00:37:52.701Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:52.706Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:52.707Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:52.721Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-image-5MzTIQ/commands.json","count":0}
{"ts":"2026-10-27T00:37:52.943Z","level":"info","msg":"custom command run","commandId":"cat","type":"popup","clientId":"24f178fe-ae19-46f3-8334-3221c8791fba","paneId":"c4c7f234-21c7-4ea6-8d2c-882556b25345"}
{"ts":"2026-10-27T00:37:53.189Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:53.190Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:53.190Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:53.195Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-qSi7rU/commands.json","count":1}
{"ts":"2026-10-27T00:37:53.435Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:53.436Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:53.436Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:53.440Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-image-e1t6mr/commands.json","count":0}
{"ts":"2026-10-27T00:37:53.607Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:53.608Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:53.608Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:53.614Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-maintain-uPiKqd/commands.json","count":0}
{"ts":"2026-10-27T00:37:53.731Z","level":"info","msg":"custom command run","commandId":"quit","type":"popup","clientId":"02e03286-1c4e-4e66-a22c-3b497f3cb938","paneId":"f6c0d845-5dee-4eef-851b-9814adc74fb3"}
{"ts":"2026-10-27T00:37:53.812Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:53.813Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:53.813Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:53.819Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-I76KYs/commands.json","count":1}
{"ts":"2026-10-27T00:37:53.846Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:53.847Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:53.847Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:53.854Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-image-f0wJoG/commands.json","count":0}
{"ts":"2026-10-27T00:37:54.337Z","level":"info","msg":"custom command run","commandId":"note","type":"shell","clientId":"2b8f2848-57cc-45ba-a710-aeec8ecae69e","paneId":"bb956212-1aae-4e65-a0f3-0d342624db58"}
{"ts":"2026-10-27T00:37:54.365Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:54.366Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:54.366Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:54.373Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-image-XQOwhB/commands.json","count":0}
{"ts":"2026-10-27T00:37:54.425Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:54.426Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:54.426Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:54.434Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-4RZDg6/commands.json","count":1}
{"ts":"2026-10-27T00:37:54.888Z","level":"info","msg":"custom command run","commandId":"cat","type":"popup","clientId":"c7e972c0-f134-4562-beaa-9e1a9355c423","paneId":"bfc0ed02-ceae-44ba-9dee-a29a3ec1711f"}
{"ts":"2026-10-27T00:37:55.030Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:55.030Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:55.030Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:55.037Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-Puz7ui/sessions/work/commands.json","count":1}
{"ts":"2026-10-27T00:37:55.655Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:55.655Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:55.656Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:55.663Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-compose-cmd-f5cV6z/commands.json","count":1}
{"ts":"2026-10-27T00:37:55.874Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:55.875Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:55.875Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:55.884Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-maintain-Am3jrI/commands.json","count":0}
{"ts":"2026-10-27T00:37:56.225Z","level":"warn","msg":"custom commands rejected","file":"/tmp/soda-compose-cmd-f5cV6z/commands.json","problem":"commands.json: commands[0]: 知らない項目です（env）"}
{"ts":"2026-10-27T00:37:57.349Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:57.352Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:57.352Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:57.361Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-MGJAUM/commands.json","count":0}
{"ts":"2026-10-27T00:37:58.580Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:58.581Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:58.581Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:58.585Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-UEeIrJ/commands.json","count":0}
{"ts":"2026-10-27T00:37:59.540Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:37:59.540Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:37:59.540Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:37:59.548Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-lYwD9N/commands.json","count":0}
{"ts":"2026-10-27T00:38:00.410Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:00.411Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:00.411Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:00.424Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-ZlxJmU/commands.json","count":0}
{"ts":"2026-10-27T00:38:01.390Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:01.391Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:01.391Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:01.399Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-RoSaKX/commands.json","count":0}
{"ts":"2026-10-27T00:38:02.308Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:02.308Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:02.308Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:02.317Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-file-Thumbr/commands.json","count":0}
{"ts":"2026-10-27T00:38:03.501Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:03.503Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:03.503Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:03.509Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-stop-compose-rqycWB/commands.json","count":0}
{"ts":"2026-10-27T00:38:03.997Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:03.998Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:03.998Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:04.002Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-stop-compose-sa2mLc/commands.json","count":0}
{"ts":"2026-10-27T00:38:04.340Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:04.342Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:04.342Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:04.348Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-bridge-ep-gI973J/commands.json","count":0}
{"ts":"2026-10-27T00:38:04.399Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:04.399Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:04.399Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:04.404Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-stop-compose-Rl2gGP/commands.json","count":0}
{"ts":"2026-10-27T00:38:04.761Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:04.762Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:04.762Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:04.766Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-bridge-ep-DCz2GQ/commands.json","count":0}
{"ts":"2026-10-27T00:38:04.785Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:04.785Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:04.785Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:04.789Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-stop-compose-yUAZD1/commands.json","count":0}
{"ts":"2026-10-27T00:38:05.144Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:05.144Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:05.144Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:05.149Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-bridge-ep-batWbJ/commands.json","count":0}
{"ts":"2026-10-27T00:38:05.201Z","level":"info","msg":"handoff: requested; running preflight"}
{"ts":"2026-10-27T00:38:05.517Z","level":"warn","msg":"bridge: closing a connection after a protocol violation","reason":"channel 1 is already open"}
{"ts":"2026-10-27T00:38:05.519Z","level":"warn","msg":"bridge: closing a connection after a protocol violation","reason":"BridgeProtocolError: unexpected frame type 66"}
{"ts":"2026-10-27T00:38:05.711Z","level":"warn","msg":"handoff: preflight failed; keeping the current server","message":"held by the test"}
{"ts":"2026-10-27T00:38:07.583Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:07.584Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:07.584Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:07.589Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-hooksource-TMwjF4/state/commands.json","count":0}
{"ts":"2026-10-27T00:38:07.641Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:07.643Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:07.643Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:07.650Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-mig-IoCuKr/commands.json","count":0}
{"ts":"2026-10-27T00:38:08.000Z","level":"info","msg":"agent session attached","paneId":"c2888c10-2885-4201-9da4-a64b2097ff86","kind":"claude","session":"11111111","source":"hook"}
{"ts":"2026-10-27T00:38:08.033Z","level":"info","msg":"agent session attached","paneId":"c2888c10-2885-4201-9da4-a64b2097ff86","kind":"claude","session":"22222222","source":"hook"}
{"ts":"2026-10-27T00:38:08.071Z","level":"info","msg":"agent session attached","paneId":"c2888c10-2885-4201-9da4-a64b2097ff86","kind":"claude","session":"33333333","source":"hook"}
{"ts":"2026-10-27T00:38:08.205Z","level":"info","msg":"agent session attached","paneId":"c2888c10-2885-4201-9da4-a64b2097ff86","kind":"claude","session":"33333333","source":"hook"}
{"ts":"2026-10-27T00:38:08.548Z","level":"info","msg":"agent session attached","paneId":"c2888c10-2885-4201-9da4-a64b2097ff86","kind":"claude","session":"aaaaaaaa","source":"hook"}
{"ts":"2026-10-27T00:38:08.582Z","level":"info","msg":"agent session attached","paneId":"c2888c10-2885-4201-9da4-a64b2097ff86","kind":"claude","session":"bbbbbbbb","source":"hook"}
{"ts":"2026-10-27T00:38:08.614Z","level":"info","msg":"agent session attached","paneId":"c2888c10-2885-4201-9da4-a64b2097ff86","kind":"claude","session":"cccccccc","source":"hook"}
{"ts":"2026-10-27T00:38:09.281Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:09.282Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:09.282Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:09.285Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-mig-IoCuKr/commands.json","count":0}
{"ts":"2026-10-27T00:38:09.606Z","level":"info","msg":"agent resume skipped","paneId":"b8cf4d8f-434b-40c3-95ba-62c237bf1f37","reason":"no-session-ref"}
{"ts":"2026-10-27T00:38:09.910Z","level":"info","msg":"agent resume skipped","paneId":"6452bf3c-3eb7-43c2-ae24-9e6b194daa03","reason":"no-session-ref"}
{"ts":"2026-10-27T00:38:10.216Z","level":"info","msg":"agent resume skipped","paneId":"96f8a7f3-12d8-405b-a89b-a232bac51f02","reason":"no-session-ref"}
hint: Using 'master' as the name for the initial branch. This default branch name
hint: is subject to change. To configure the initial branch name to use in all
hint: of your new repositories, which will suppress this warning, call:
hint: 
hint: 	git config --global init.defaultBranch <name>
hint: 
hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
hint: 'development'. The just-created branch can be renamed via this command:
hint: 
hint: 	git branch -m <name>
{"ts":"2026-10-27T00:38:10.532Z","level":"info","msg":"agent resume skipped","paneId":"7de52953-464c-4420-9cad-4a79de6b9a98","reason":"no-session-ref"}
{"ts":"2026-10-27T00:38:10.835Z","level":"info","msg":"agent resume skipped","paneId":"cba7b0fc-3501-459d-b140-7ab8991c81dd","reason":"no-session-ref"}
{"ts":"2026-10-27T00:38:10.842Z","level":"info","msg":"graph.json was migrated to schema 2 (a copy of the old file is in graph-backups/)"}
{"ts":"2026-10-27T00:38:10.913Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:10.914Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:10.914Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:10.919Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-graph-mig-IoCuKr/commands.json","count":0}
{"ts":"2026-10-27T00:38:11.237Z","level":"info","msg":"agent resume skipped","paneId":"b8cf4d8f-434b-40c3-95ba-62c237bf1f37","reason":"no-session-ref"}
{"ts":"2026-10-27T00:38:11.539Z","level":"info","msg":"agent resume skipped","paneId":"6452bf3c-3eb7-43c2-ae24-9e6b194daa03","reason":"no-session-ref"}
{"ts":"2026-10-27T00:38:11.844Z","level":"info","msg":"agent resume skipped","paneId":"96f8a7f3-12d8-405b-a89b-a232bac51f02","reason":"no-session-ref"}
{"ts":"2026-10-27T00:38:12.147Z","level":"info","msg":"agent resume skipped","paneId":"7de52953-464c-4420-9cad-4a79de6b9a98","reason":"no-session-ref"}
{"ts":"2026-10-27T00:38:12.449Z","level":"info","msg":"agent resume skipped","paneId":"cba7b0fc-3501-459d-b140-7ab8991c81dd","reason":"no-session-ref"}
{"ts":"2026-10-27T00:38:15.393Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:15.395Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:15.395Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:15.401Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-mig-state-ZZUkTN/commands.json","count":0}
{"ts":"2026-10-27T00:38:16.498Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:16.499Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:16.499Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:16.504Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-mig-state-ZZUkTN/commands.json","count":0}
{"ts":"2026-10-27T00:38:16.831Z","level":"info","msg":"agent resume skipped","paneId":"dfb00dac-3908-4081-a00b-883bcad0e70d","reason":"no-session-ref"}
{"ts":"2026-10-27T00:38:17.136Z","level":"info","msg":"agent resume skipped","paneId":"14d58d0a-7b1d-44b0-9456-97f75f438928","reason":"no-session-ref"}
{"ts":"2026-10-27T00:38:17.440Z","level":"info","msg":"agent resume skipped","paneId":"db55890f-3ddd-4dc9-88fe-8dc5f74b6030","reason":"no-session-ref"}
{"ts":"2026-10-27T00:38:18.358Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:18.361Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:18.361Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:18.368Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-N6YL51/commands.json","count":0}
{"ts":"2026-10-27T00:38:18.411Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:18.412Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:18.412Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:18.416Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-N6YL51/commands.json","count":0}
{"ts":"2026-10-27T00:38:18.867Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:18.868Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:18.868Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:18.871Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-njekFA/commands.json","count":0}
{"ts":"2026-10-27T00:38:18.892Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:18.893Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:18.893Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:18.898Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-wyFXmt/commands.json","count":0}
{"ts":"2026-10-27T00:38:19.292Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:19.292Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:19.292Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:19.296Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-NmawTJ/commands.json","count":0}
{"ts":"2026-10-27T00:38:19.315Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:19.315Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:19.315Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:19.320Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-freeport-NmawTJ/commands.json","count":0}
{"ts":"2026-10-27T00:38:21.246Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:38:21.248Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:38:21.248Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:38:21.260Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-fork-it-ApJuBL/state-uA5Dde/commands.json","count":0}
{"ts":"2026-10-27T00:38:22.235Z","level":"info","msg":"agent session attached","paneId":"97694cc1-9649-4dc9-b534-2aca1918f808","kind":"claude","session":"3e81f9a7","source":"hook"}
{"ts":"2026-10-27T00:38:25.705Z","level":"info","msg":"agent session attached","paneId":"f9ce79ca-1c66-4bb8-8ad7-f420d36f8398","kind":"claude","session":"e9063cd8","source":"hook"}
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=d07cd5fce9c76b96020b255d2538b583": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=68c77b4c48fd5abf9e401bd4e18921ee": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=6df84c9597daef4ab58606cbf261c965": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=60b09538b7ddef049b7cc6454fc1aeb9": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=a6d1068e3314397c286d04998c690783": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=62b0a117e62258164e9a062a24a09744": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=843ab23c90c60eb99faa20dd5638d5ce": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=ec9ede45a50d2026b8917d0658b1b788": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=d0f574a01ad90b98efaa35c35e7d580b": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=c4316a87df5e3ee70df9ccd4d56d7daa": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=c4e655352865247e14845591c1d1e73d": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=1e67b93ed2d566531cbd5995f0f26720": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=5ab7085d34cd3948c8d305d0abb686c7": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=72ad6b4f125d33132d5762a0595cfcb5": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=0d87b1cb0e2b511f9e5ba15686ed67dc": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=eb35c8f5df8d0120a28c5e4433b4b00e": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[disconnectedFromNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:829:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[disconnectedFromNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:829:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=ce8b8445631414d4a5e9adab7dafc877": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=ead896307a4e024716a6f201581b5b37": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=638f6e3312fa2b0e1ad89f7f0b977ff6": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=ab42ac4f1e563d05a929a7e672091ba9": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=2040343cac5a5dc486e51ede3a218987": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=6023ff60681fb403b6ccb1873fcf4df4": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=09c56dae1f524d5040c0bab77b12ce8b": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=33e44e4f1990a1803ef0a47aa6b5b6df": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=dfbf20c65260dbf9ef670fbe0750c907": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=0a8ae620b15fe4192aad1ea8f87743b7": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=2c7e71804990cf719f6b5e21aa4047e2": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=1d2918753d866d9d3aab894e4d88c4c7": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=a1c0f96e90528209f5b9f082459ec833": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=024754244e45b4fc3e637021169d0d98": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=2026a049fc8e4db633a5a7b981b597d9": connect ECONNREFUSED 127.0.0.1:3000
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at Socket.socketErrorListener (node:_http_client:593:5)
    at Socket.emit (node:events:509:28)
    at emitErrorNT (node:internal/streams/destroy:170:8)
    at emitErrorCloseNT (node:internal/streams/destroy:129:3)
    at processTicksAndRejections (node:internal/process/task_queues:90:21)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=427bb9d5612f0e41a21639fc5b687f93": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=faf06a21e19764c8e90a3c03ffd9671a": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=14f00d0fa75b9c3faad926b514dc70a9": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=007d9c9ab2537d2c13589c390f947589": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=1c9a30e6706c696b95d276c88e6b30b6": connect ECONNREFUSED 127.0.0.1:3000
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at Socket.socketErrorListener (node:_http_client:593:5)
    at Socket.emit (node:events:509:28)
    at emitErrorNT (node:internal/streams/destroy:170:8)
    at emitErrorCloseNT (node:internal/streams/destroy:129:3)
    at processTicksAndRejections (node:internal/process/task_queues:90:21)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[disconnectedFromNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:829:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=b20e186465626b1c19b2a82089c9a246": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=7c0d11c0d97b61a4952b20a2a1a478da": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=a99598df067d0092ae1deeb0637cea8d": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=764ef5da2c88ef69237cdda074e25f76": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=a6c9d963946a0a075ef314c53e15c347": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=44edc35a6a7662727587f1f8a0786229": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=c86b386b0348497d0b1f8fe7262109bf": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=59b0f34699681a26023473b97beb4ce5": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=3ad7e43f764e170124007b91a835bad8": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=07a59c2ad36dc41f384b5afa83da569c": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=bb2deb50b3309fa309f33e6d9e053396": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
DOMException [NotSupportedError]: Failed to load script "http://localhost:3000/display-view/frame.js". JavaScript file loading is disabled.
    at HTMLScriptElement.#loadScript (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-script-element/HTMLScriptElement.js:549:31)
    at HTMLScriptElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-script-element/HTMLScriptElement.js:315:33)
    at HTMLScriptElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLBodyElement.appendChild (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:314:48)
    at insertChildren (eval at boot (/workspaces/sodashitsu-desktop-quality-memory/packages/web/src/display/scriptHost.test.ts:31:3), <anonymous>:349:11)
    at inject (eval at boot (/workspaces/sodashitsu-desktop-quality-memory/packages/web/src/display/scriptHost.test.ts:31:3), <anonymous>:371:21)
    at onRender (eval at boot (/workspaces/sodashitsu-desktop-quality-memory/packages/web/src/display/scriptHost.test.ts:31:3), <anonymous>:491:7)
    at Object.onPort [as onmessage] (eval at boot (/workspaces/sodashitsu-desktop-quality-memory/packages/web/src/display/scriptHost.test.ts:31:3), <anonymous>:507:7)
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
[graph-perf] {"case":"web-subagent-churn","env":"happy-dom","subagents":60,"generations":20,"totalMs":24,"limitMs":10000}
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=ee2d41c11aeb1024906af7b799013bf4": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=9d4dd183d604b30afe73093a743287b4": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=51570b00af525efd48f871d5abd49b02": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=0e15f979875619e23c120dfbc3f3b123": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=307c086abd513b8180efab25dec2fbbb": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=4bd6ad1078a2fb164e50619e4edde259": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=2905f550c721fea0f06d42971366e9f7": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=d7fe6daf18dc26c354277978340ba6f2": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=14dbb8ede7d74946662765af4a3931e3": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=59f11dc1628192dc119619267cceaf1d": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=5b0a3a372181fbf8a41a00d12febd144": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=4e3fab3bcd21e02160ffa9f6bda03a87": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=1129a3ea49dad5b594fd66ea0d6ce01c": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=5fd3340b3656a1a369f25ca805d5953d": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=8dbbd573b1e4cbdb961b33e7253a4686": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=3fa9c7ff7470ac6483f55037d1d0b05d": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/script.html?t=04e2b61e489e19efc1279eab39b5ae30": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:804:58)
DOMException [AbortError]: The operation was aborted.
    at Fetch.onAsyncTaskManagerAbort (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:546:23)
    at Object.<anonymous> (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:101)
    at AsyncTaskManager.abortAll (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:292:30)
    at AsyncTaskManager.destroy (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:64:21)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:43:22
    at new Promise (<anonymous>)
    at BrowserFrameFactory.destroyFrame (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameFactory.js:30:16)
    at HTMLIFrameElement.#unloadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:363:33)
    at HTMLIFrameElement.[disconnectedFromDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:238:25)
    at HTMLIFrameElement.[disconnectedFromNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:829:58)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=c04b8f7f34c19e96115ba03620ae107c": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=02afdd82ef21085218d210e8db5b0ddc": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=ed5c07a7db4e9ae27384bb0c2acb4b5b": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=a7f77701cbf7445938da66e87000a6e6": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=1f4da3eaec0b0bd14df11849dce45ae6": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=af4cc3deb3e41b4949330b0f283822c2": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=fea60e4f5a6b05030ab78f9b1852d582": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NetworkError]: Failed to execute "fetch()" on "Window" with URL "http://localhost:3000/display-view/frame.html?t=a040c2dcb77c088c3638a877a41fa29d": The operation was aborted.
    at Fetch.onError (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:540:21)
    at ClientRequest.emit (node:events:509:28)
    at emitErrorEvent (node:_http_client:109:11)
    at _destroy (node:_http_client:993:9)
    at onSocketNT (node:_http_client:1013:5)
    at processTicksAndRejections (node:internal/process/task_queues:91:21)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/html.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:556:48)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
    at insert (/workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/@vue+runtime-dom@3.5.43/node_modules/@vue/runtime-dom/dist/runtime-dom.cjs.js:31:12)
    at mountElement (/workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5772:5)
    at processElement (/workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5688:7)
    at patch (/workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5554:11)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/html.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:556:48)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
    at insert (/workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/@vue+runtime-dom@3.5.43/node_modules/@vue/runtime-dom/dist/runtime-dom.cjs.js:31:12)
    at mountElement (/workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5772:5)
    at processElement (/workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5688:7)
    at patch (/workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/@vue+runtime-core@3.5.43/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:5554:11)
DOMException [NotSupportedError]: Failed to load iframe page "http://localhost:3000/ask-view/markdown.html". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLDivElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:793:58)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLDivElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:522:45)
    at HTMLDivElement.[insertBefore] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1118:63)
    at HTMLDivElement.insertBefore (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:339:49)
[graph-perf] {"case":"web-render","env":"happy-dom","panes":16,"links":32,"openMs":248,"rerenderMs":39,"limitMs":10000}
DOMException [NotSupportedError]: Failed to load iframe page "http://p00000000000000000000000000000000.localhost:1234/probe". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLBodyElement.appendChild (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:314:48)
    at ParentNodeUtility.append (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/parent-node/ParentNodeUtility.js:19:28)
    at HTMLBodyElement.append (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:510:27)
    at /workspaces/sodashitsu-desktop-quality-memory/packages/web/src/preview/helperProbe.ts:28:19
    at new Promise (<anonymous>)
Error: connect ECONNREFUSED 127.0.0.1:3000
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 3000
}
DOMException [NotSupportedError]: Failed to load iframe page "http://p00000000000000000000000000000000.localhost:1234/probe". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLBodyElement.appendChild (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:314:48)
    at ParentNodeUtility.append (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/parent-node/ParentNodeUtility.js:19:28)
    at HTMLBodyElement.append (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:510:27)
    at /workspaces/sodashitsu-desktop-quality-memory/packages/web/src/preview/helperProbe.ts:28:19
    at new Promise (<anonymous>)
DOMException [NotSupportedError]: Failed to load iframe page "http://p00000000000000000000000000000000.localhost:1234/probe". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLBodyElement.appendChild (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:314:48)
    at ParentNodeUtility.append (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/parent-node/ParentNodeUtility.js:19:28)
    at HTMLBodyElement.append (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:510:27)
    at /workspaces/sodashitsu-desktop-quality-memory/packages/web/src/preview/helperProbe.ts:28:19
    at new Promise (<anonymous>)
DOMException [NotSupportedError]: Failed to load iframe page "http://p00000000000000000000000000000000.localhost:1234/probe". Iframe page loading is disabled.
    at HTMLIFrameElement.#loadPage (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:333:27)
    at HTMLIFrameElement.[connectedToDocument] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at HTMLIFrameElement.[connectedToNode] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at HTMLBodyElement.[appendChild] (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLBodyElement.appendChild (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/node/Node.js:314:48)
    at ParentNodeUtility.append (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/parent-node/ParentNodeUtility.js:19:28)
    at HTMLBodyElement.append (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/nodes/element/Element.js:510:27)
    at /workspaces/sodashitsu-desktop-quality-memory/packages/web/src/preview/helperProbe.ts:28:19
    at new Promise (<anonymous>)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)
Error: Failed to execute 'startTask()' on 'AsyncTaskManager': The asynchronous task manager has been destroyed. This error can be thrown if scripts continue to run while a browser frame is closed.
    at AsyncTaskManager.startTask (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/async-task-manager/AsyncTaskManager.js:153:19)
    at file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-quality-memory/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)

 Test Files  775 passed (775)
      Tests  11605 passed (11605)
   Start at  09:33:42
   Duration  373.20s (tests 80%, import 11%, environment 5%, transform 4%)

Environment  |@sodashitsu/web| happy-dom was created 226 times · 66.70s total, 29% of tracked time
             create it once per worker with pool: 'vmThreads' (keeps per-file isolation) or isolate: false (shares it across files)
             learn more: https://vitest.dev/guide/improving-performance#test-environments


```

## Negative video preferences load

保存値読込だけをdefaultsに戻し、再buildしたbrowserで復元assertionが失敗。元bytesに復元後再buildし上記全体検証。

```text

Running 1 test using 1 worker

(node:1181209) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-27T00:32:28.520Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:32:28.522Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:32:28.522Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:32:28.528Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-ddmDl6/commands.json","count":0}
{"ts":"2026-10-27T00:32:29.211Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:32:29.213Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:32:29.213Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:32:29.214Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-ijDMVO/commands.json","count":0}
{"ts":"2026-10-27T00:32:39.590Z","level":"info","msg":"machine link closed","machine":"d6bb9e310866f0eb1dfb63bb994488e0","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-quality-memory.spec.ts:5:1 › quality drafts survive browser reload without Apply, including codec, route, rate and fit (12.4s)


  1) src/specs/remote-desktop-quality-memory.spec.ts:5:1 › quality drafts survive browser reload without Apply, including codec, route, rate and fit 

    Error: expect(locator).not.toBeChecked() failed

    Locator:  locator('[data-remote-desktop]').getByLabel('画面に合わせる', { exact: true })
    Expected: not checked
    Received: checked
    Timeout:  5000ms

    Call log:
      - Expect "not toBeChecked" locator('[data-remote-desktop]').getByLabel('画面に合わせる', { exact: true }) with timeout 5000ms
      - waiting for locator('[data-remote-desktop]').getByLabel('画面に合わせる', { exact: true })
        14 × locator resolved to <input type="checkbox" data-v-ddd25c76=""/>
           - unexpected value "checked"


      25 |   // and its new start request, so saving only on close/Apply cannot pass.
      26 |   await page.reload();await expect(header.locator('[data-state="online"]')).toBeVisible({timeout:15000});if(!await view.count())await openNativeTab(page,"desktop",header);else await view.getByRole("button",{name:"情報・設定",exact:true}).click();
    > 27 |   await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9][0-9]*$/);await view.getByText("画質・計測",{exact:true}).click();await expect(view.getByLabel("送信幅の上限")).toHaveValue("1000");await expect(view.getByLabel("fps上限",{exact:true})).toHaveValue("7");await expect(view.getByLabel("JPEG品質")).toHaveValue("72");await expect(view.getByLabel("送信する色")).toHaveValue("gray16");await expect(view.getByLabel("共有元のカーソルを表示",{exact:true})).not.toBeChecked();await expect(view.getByLabel("差分転送",{exact:true})).not.toBeChecked();await expect(view.getByLabel("自動画質調整",{exact:true})).toBeChecked();await expect(view.getByLabel("画面に合わせる",{exact:true})).not.toBeChecked();
         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         ^
      28 |   await view.locator("[data-desktop-media] summary").click();await expect(view.getByLabel("動画の経路")).toHaveValue("native");await expect(view.getByLabel("動画帯域の上限")).toHaveValue("6789");await expect(view.getByLabel("動画コーデック")).toHaveValue("hevc");await expect(view.getByLabel("動画FPS上限")).toHaveValue("30");await expect(view.getByLabel("UDPを優先",{exact:false})).not.toBeChecked();await expect(view.getByLabel("システム音声を要求",{exact:true})).not.toBeChecked();
      29 |   await page.evaluate(()=>(window as any).__withoutNative=true);await view.getByRole("button",{name:"適用して再接続",exact:true}).click();await expect(view.getByLabel("動画の経路")).toHaveValue("auto");
      30 |   await page.evaluate(()=>(window as any).__withoutNative=false);await view.getByRole("button",{name:"適用して再接続",exact:true}).click();await expect(view.getByLabel("動画の経路")).toHaveValue("native");
        at /workspaces/sodashitsu-desktop-quality-memory/packages/e2e/src/specs/remote-desktop-quality-memory.spec.ts:27:649

    Error Context: test-results/remote-desktop-quality-mem-d60ca-ng-codec-route-rate-and-fit/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-quality-mem-d60ca-ng-codec-route-rate-and-fit/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-quality-mem-d60ca-ng-codec-route-rate-and-fit/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-quality-memory.spec.ts:5:1 › quality drafts survive browser reload without Apply, including codec, route, rate and fit 
undefined
/workspaces/sodashitsu-desktop-quality-memory/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-quality-memory.spec.ts

```

## Final browser verification after main integration

```text

Running 3 tests using 1 worker

(node:1225088) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-27T00:40:25.216Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:40:25.217Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:40:25.217Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:40:25.223Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-BlGD1M/commands.json","count":0}
{"ts":"2026-10-27T00:40:25.691Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:40:25.691Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:40:25.691Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:40:25.692Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-Qo0D0S/commands.json","count":0}
{"ts":"2026-10-27T00:40:31.374Z","level":"info","msg":"machine link closed","machine":"adfa37876806b421a27ff8312c85b4d5","kind":"transient","reason":"接続が切れました"}
  ✓  1 src/specs/remote-desktop-quality-memory.spec.ts:5:1 › quality drafts survive browser reload without Apply, including codec, route, rate and fit (7.0s)
{"ts":"2026-10-27T00:40:32.043Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:40:32.044Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:40:32.044Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:40:32.053Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-ArzXIz/commands.json","count":0}
{"ts":"2026-10-27T00:40:32.495Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:40:32.496Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:40:32.496Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:40:32.497Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-ReACFn/commands.json","count":0}
{"ts":"2026-10-27T00:40:36.832Z","level":"info","msg":"machine link closed","machine":"70443169a56cd01d46640c9592d68a8a","kind":"transient","reason":"接続が切れました"}
  ✓  2 src/specs/remote-desktop-settings.spec.ts:6:1 › connection presets and reduced colors reach the canvas, persist per machine, and reconnect read-only (4.9s)
{"ts":"2026-10-27T00:40:37.002Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:40:37.003Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:40:37.003Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:40:37.010Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-wd34J2/commands.json","count":0}
{"ts":"2026-10-27T00:40:37.443Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T00:40:37.443Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T00:40:37.443Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T00:40:37.444Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-RPzEGN/commands.json","count":0}
{"ts":"2026-10-27T00:40:48.071Z","level":"info","msg":"machine link closed","machine":"2e72606857797a31d36d929dc1ed82d6","kind":"transient","reason":"接続が切れました"}
  ✓  3 src/specs/remote-desktop-shared-datagrams.spec.ts:10:1 › shared UDP viewers recover packet loss and one peer can fall back to WSS independently (11.2s)

  3 passed (24.9s)

```
