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
