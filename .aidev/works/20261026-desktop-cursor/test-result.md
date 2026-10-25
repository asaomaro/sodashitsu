# 検証記録

2026-10-26。生成した画像/カーソル/入力イベントのみ。Windowsの実画面を取得したり、実OS入力・自動unlockを行っていない。

- pnpm build / pnpm typecheck 成功。
- 全体: 749 suites、11,386 tests全件成功（467.60秒）。
- 関連: protocol/stream/renderer/Relay 62件成功。dirty rootへの3-way適用後は同対象67件成功（既存local provider試験を含む）。root build/typecheck/smoke成功。既存変更は保持、backup /tmp/desktop-cursor-root-merge。
- Windows生成HICON/DIB: 32bit alpha、32/24bit masked color、monochrome AND/XOR、hotspotを2背景でDrawIconExと比較して成功。worker出力gate待ちでStop(20)が期限内false、解放後Stop(1000) true、desktop照会なしを確認。A/Bとも同じ生成試験成功。Bはbranch archiveを一時ディレクトリに展開しrepo HEAD b48da500/dirty状態を変更せず検証。
- 既存Windows unlock/helperとGPU surface生成試験成功。cursor poll/capture/init/disposeのlock追加後もfullframe CPU readbackなし。
- ブラウザ: 実製品の2枚のcanvasを観測。shape/alpha/XOR/端clip/予測と実位置への復帰/非表示/reconnectでの解除、元画像canvas不変を確認。最終input/IME併走結果は追記する。
- 独立レビューと修正差分の再レビュー成功。join失敗でcapture破棄へ進まない、watchdogを最後まで維持、agent切替時予測解除、DXGIエラー時古いshapeを保持しない修正を含む。

## 実行時negative

該当修正のみ一時的に外して実行し、失敗後は元のbytesと一致することをassertした。browserは予測を無効化した製品をbuildして実行し、元に戻して再build。以下は各試験の生の出力（ANSI除去以外は要約していない）。

### shape

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-input

 ❯ |@sodashitsu/server| src/desktop/DesktopCursorStream.test.ts (3 tests | 1 failed | 2 skipped) 35ms
   × resends the current bounded shape after either source or viewer backpressure drops a cursor update 33ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopCursorStream.test.ts > resends the current bounded shape after either source or viewer backpressure drops a cursor update
AssertionError: expected undefined to be defined
 ❯ src/desktop/DesktopCursorStream.test.ts:9:146
      7|  stream.accept({info,data:new Uint8Array([255,255,255,255])});expect(d…
      8|  buffered=70000;stream.accept({info:{...info,seq:2,shape:undefined,x:.…
      9|  buffered=0;stream.accept({info:{...info,seq:3,shape:undefined,x:.7},d…
       |                                                                                                                                                  ^
     10|  stream.accept({info:{...info,seq:4,shape:undefined,x:.8},data:new Uin…
     11|  stream.accept({info:{...info,seq:2},data:new Uint8Array(4)});expect(p…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
   Start at  08:49:59
   Duration  1.48s (transform 69%, import 28%, tests 3%)


```

### native-alpha

```text
"0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Cursor composite mismatch 2 at 0,0 channel 0: 40 expect
ed 72"
�����ꏊ \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-input\scripts\remote-desktop\validate-cursor.ps1:4 ����:1
+ [SodaDesktopTests.CursorChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 

```

### worker-stop

```text
"0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Blocked worker must report unsuccessful stop"
�����ꏊ \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-input\scripts\remote-desktop\validate-cursor.ps1:4 ����:1
+ [SodaDesktopTests.CursorChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 

```

### guard

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-input

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (47 tests | 1 failed | 46 skipped) 1054ms
   × does not send cursor extensions to an incompatible viewer 1051ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > does not send cursor extensions to an incompatible viewer
AssertionError: expected 0 to be greater than 0
 ❯ src/desktop/DesktopRelay.test.ts:654:118
    652| it.each(["viewer","provider","secure"])("does not send cursor extensio…
    653|  const f=await fixture(true,missing==="provider",true,missing==="secur…
    654|  const v=await f.viewer(missing==="viewer"?"extended":"cursor");v.send…
       |                                                                                                                      ^
    655|  expect(v.messages.find(m=>m.type==="ready")).not.toHaveProperty("curs…
    656|  if(missing!=="secure")expect(f.startRequests[0]!.options).not.toHaveP…

Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.ts:654:79

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 46 skipped (47)
   Start at  08:50:09
   Duration  3.19s (transform 47%, tests 36%, import 15%, worker 2%)


```

### browser

```text

Running 1 test using 1 worker

(node:837621) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-25T23:50:54.803Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-25T23:50:54.806Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-25T23:50:54.807Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-25T23:50:54.816Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-Fr7UAC/commands.json","count":0}
{"ts":"2026-10-25T23:50:55.680Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-25T23:50:55.681Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-25T23:50:55.681Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-25T23:50:55.682Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-JRLgEG/commands.json","count":0}
{"ts":"2026-10-25T23:51:04.148Z","level":"info","msg":"machine link closed","machine":"deb44d45fe2021e7eaca0a783a39dcc0","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-cursor.spec.ts:7:1 › cursor shape/alpha/XOR and local motion are separate from screenshot pixels, then clear on hide/reconnect (10.6s)


  1) src/specs/remote-desktop-cursor.spec.ts:7:1 › cursor shape/alpha/XOR and local motion are separate from screenshot pixels, then clear on hide/reconnect 

    Error: expect(received).toBeGreaterThan(expected)

    Expected: > 0.7
    Received:   0.5

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      27 |   await view.getByRole("button",{name:"操作する",exact:true}).click();await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");await base.focus();
      28 |   const box=(await base.boundingBox())!;await page.mouse.move(box.x+box.width*.75,box.y+box.height*.75);
    > 29 |   await expect.poll(async()=>Number(await overlay.getAttribute("data-cursor-x"))).toBeGreaterThan(.7);
         |                                                                                   ^
      30 |   // Source intentionally refuses movement, like a clipped cursor; local prediction
      31 |   // must move first and then yield to its real position after the bounded interval.
      32 |   expect(poses.filter(p=>p.visible).every(p=>p.x===.5&&p.y===.5)).toBe(true);
        at /workspaces/sodashitsu-desktop-input/packages/e2e/src/specs/remote-desktop-cursor.spec.ts:29:83

    Error Context: test-results/remote-desktop-cursor-curs-d46f3-hen-clear-on-hide-reconnect/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-cursor-curs-d46f3-hen-clear-on-hide-reconnect/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-cursor-curs-d46f3-hen-clear-on-hide-reconnect/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-cursor.spec.ts:7:1 › cursor shape/alpha/XOR and local motion are separate from screenshot pixels, then clear on hide/reconnect 
undefined
/workspaces/sodashitsu-desktop-input/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-cursor.spec.ts

```
