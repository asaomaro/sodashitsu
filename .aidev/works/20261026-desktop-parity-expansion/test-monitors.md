# 第3段階 tests

局所protocol/relay/settings83 tests成功。browser5件（switch/permission off/old helper/secure/topology after maximum display）成功。Native combined helper compileとfake geometry/production input queue check成功。read-only topology probeはA Windowsの3200x2000/200%を取得、guard30samples median0.0076ms/p95 0.0923ms（1monitor、入力→表示/WAN遅延ではない）。実OScapture/input/clipboard/設定変更は行わない。Native fake checkはOS queryも使わないが、別のreadonly probeは構成情報だけを読む。

初回secure browser試験は正しい表示が『ロック画面・閲覧中』なのにexact『閲覧中』を求めて失敗したため期待値を訂正した。Native fake pointer試験のfixture Bounds初期化漏れ/CS var複数宣言、probe script serializer assembly依存も試験の包みを修正した。製品動作の退行とは扱わない。

最終build/typecheck/full/unit/browser/独立worktree smoke/B metadata probeはこれから。

## 修正除去の負例

各修正だけを外してruntime失敗を確認し、元のbytesへ復元して一致をassert。browserは負例build後に実行、復元web buildをawait。native入力の負例もMemoryDesktop/MemoryInput/MemoryOutput/fake driverが先に設定され、actual SendInput/desktop queryを呼ばない。

### queued-input

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Queued input after topology change was not rejected and
 released"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-monitors\scripts\remote-desktop\validate-monitors.ps1:4 
文字:1
+ [SodaDesktopTests.MonitorChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 
```

### one-enumeration

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Queued input after topology change was not rejected and
 released"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-monitors\scripts\remote-desktop\validate-monitors.ps1:4 
文字:1
+ [SodaDesktopTests.MonitorChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 
```

### gap

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Gaps never receive pointer actions"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-monitors\scripts\remote-desktop\validate-monitors.ps1:4 
文字:1
+ [SodaDesktopTests.MonitorChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 
```

### scale

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Scale change revokes the old topology"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-monitors\scripts\remote-desktop\validate-monitors.ps1:4 
文字:1
+ [SodaDesktopTests.MonitorChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 
```

### rounding

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-monitors

 ❯ |@sodashitsu/protocol| src/desktopMonitors.test.ts (3 tests | 1 failed | 2 skipped) 5ms
   × uses the Windows ties-to-even physical-pixel rule at a gap boundary 4ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/protocol| src/desktopMonitors.test.ts > uses the Windows ties-to-even physical-pixel rule at a gap boundary
AssertionError: expected { id: 'right', x: 3, y: +0, …(3) } to be undefined

- Expected:
undefined

+ Received:
{
  "height": 1,
  "id": "right",
  "primary": false,
  "width": 3,
  "x": 3,
  "y": 0,
}

 ❯ src/desktopMonitors.test.ts:51:43
     49|     ],
     50|   };
     51|   expect(desktopMonitorAt(value, 0.5, 0)).toBeUndefined();
       |                                           ^
     52|   expect(desktopMonitorAt(value, 0.6, 0)?.id).toBe("right");
     53| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
   Start at  14:53:41
   Duration  173ms (import 53%, transform 37%, tests 6%, worker 3%)

```

### topology-cause

```text

Running 1 test using 1 worker

(node:1950673) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-26T05:56:07.810Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T05:56:07.811Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T05:56:07.811Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T05:56:07.816Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-6Tvho7/commands.json","count":0}
{"ts":"2026-10-26T05:56:08.303Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T05:56:08.304Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T05:56:08.304Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T05:56:08.305Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-0fikL8/commands.json","count":0}
{"ts":"2026-10-26T05:56:16.735Z","level":"info","msg":"machine link closed","machine":"5dcaf8c3632007def9cf9c9bf33ff1ae","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-monitors.spec.ts:8:96 › desktop generated monitors topology-display (9.3s)


  1) src/specs/remote-desktop-monitors.spec.ts:8:96 › desktop generated monitors topology-display ──

    Error: expect(locator).toContainText(expected) failed

    Locator: locator('[data-remote-desktop]').getByRole('alert')
    Expected substring: "モニター構成が変更"
    Received string:    "Bの解像度を変更できませんでした。共有元で対応モードと復元状態を確認してください。"
    Timeout: 5000ms

    Call log:
      - Expect "toContainText" locator('[data-remote-desktop]').getByRole('alert') with timeout 5000ms
      - waiting for locator('[data-remote-desktop]').getByRole('alert')
        14 × locator resolved to <p role="alert" data-v-92946140="" class="desktop-alert">Bの解像度を変更できませんでした。共有元で対応モードと復元状態を確認してください。</p>
           - unexpected value "Bの解像度を変更できませんでした。共有元で対応モードと復元状態を確認してください。"


      20 |   if(mode==="topology-display"){
      21 |    await view.getByLabel("接続先を最大解像度にする").check();await expect(view.locator("[data-desktop-applied]")).toContainText("等倍");await expect.poll(()=>canvas.evaluate(el=>(el as HTMLCanvasElement).width)).toBe(1920);
    > 22 |    await writeFile(marker,"generated topology change after resize");await expect(view.getByRole("alert")).toContainText("モニター構成が変更");await expect(view.locator("[data-desktop-status]")).toHaveText("停止");await expect(view.getByRole("button",{name:"既定のモニターで接続し直す",exact:true})).toBeVisible();return;
         |                                                                                                           ^
      23 |   }
      24 |   expect(await pixel(.5,.5)).toEqual([255,0,0,255]);await view.getByRole("button",{name:"操作する",exact:true}).click();await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");
      25 |   await selector.selectOption("left");await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9]/);await expect.poll(()=>pixel(.5,.5)).toEqual([0,0,255,255]);await expect(view.locator("[data-desktop-status]")).toHaveText("閲覧中");await expect(selector).toHaveValue("left");
        at /workspaces/sodashitsu-desktop-monitors/packages/e2e/src/specs/remote-desktop-monitors.spec.ts:22:107

    Error Context: test-results/remote-desktop-monitors-de-30d20-d-monitors-topology-display/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-monitors-de-30d20-d-monitors-topology-display/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-monitors-de-30d20-d-monitors-topology-display/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-monitors.spec.ts:8:96 › desktop generated monitors topology-display ───
undefined
/workspaces/sodashitsu-desktop-monitors/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-monitors.spec.ts --grep topology-display
```
