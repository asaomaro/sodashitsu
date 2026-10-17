# ホイール入力の混雑停止修正

## 実装と検証

利用者のWindows実機でwheel操作後「入力が混雑したため共有を停止しました」。従来は各入力をPromise列へ積み、128超で停止。viewerの32ms集約とhelperの最大128項目buffer/1workerで連続入力をまとめる。クリック/キー/文字境界・座標・修飾・ボタン・方向を維持。極端なburstは±10000飽和/超過量破棄、満杯では移動入力を先に破棄する。離散だけの128件超停止は継続。CDP単一commandの5秒timeoutは変更しない。

- helper単体24件PASS /tmp/vscode-cdp-wheel-capture.log。501wheel slowCDP→2コマンドで合計5010、2001wheel飽和、境界順序、move最新、revoke/fit/stop破棄、新focus前の入力再生防止、満杯時release保持、離散のみ満杯の停止/release。
- 実Chromium CDPと実appのE2E2件PASS(13.3s) /tmp/vscode-cdp-wheel-final-e2e.log。実wheelによるsource scroll、200 line-wheelのbrowser送信合計3200pxかつ2通以下、source scroll進行・操作中継続を確認。
- web build/typecheck PASS /tmp/vscode-cdp-wheel-final-build.log。E2E typecheck PASS /tmp/vscode-cdp-wheel-e2e-typecheck.log。
- Windows実機の修正版wheel確認は未実施。既存viewerを奪う接続やWindows再起動/設定変更は実行していない。

## helper negative（input()のみ従来へ戻して実行）

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-vscode-cdp

 ❯ |scripts| vscode-cdp.test.ts (22 tests | 1 failed | 21 skipped) 16ms
   × bounds a slow-CDP wheel burst without stopping and preserves scroll amount below saturation 11ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |scripts| vscode-cdp.test.ts > bounds a slow-CDP wheel burst without stopping and preserves scroll amount below saturation
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ vscode-cdp.test.ts:379:29
    377|   try {
    378|     for (let i = 0; i < 500; ++i) pending.push(capture.input(wheelInpu…
    379|     expect(capture.running).toBe(true);
       |                             ^
    380|     expect(capture.queued).toBeLessThanOrEqual(2);
    381|   } finally { gate.resolve(); await Promise.all(pending); }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 21 skipped (22)
   Start at  15:57:58
   Duration  397ms (transform 74%, import 14%, tests 8%, worker 3%)


```

helperは保存byte列へ完全復元後、全24件を実行して通過。

## viewer negativeの初回

input()のみ従来へ戻してbuildしたが、既存のDPR変更後frame寸法検査で失敗し、目的のwheelassertionへ到達していない。これはviewer wheel回帰の証拠に使わない。/tmp/vscode-cdp-wheel-view-negative.log。正状態を復元してbuildしE2E2件通過後、同条件で再度negative検証する。

## viewer negative再検証（有効）

```text

Running 1 test using 1 worker

(node:301481) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-17T07:00:24.326Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T07:00:24.327Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T07:00:24.328Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-helGrq/commands.json","count":0}
{"ts":"2026-10-17T07:00:24.972Z","level":"info","msg":"display script enabled","byClientId":"5c725334-3830-4890-9424-40b376db70d3","byKind":"desktop"}
{"ts":"2026-10-17T07:00:25.630Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T07:00:25.630Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T07:00:25.630Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-helGrq/commands.json","count":0}
{"ts":"2026-10-17T07:00:25.961Z","level":"info","msg":"agent resume skipped","paneId":"1f5a6c1a-3d20-4255-ab32-ef9011bb56d5","reason":"no-session-ref"}
{"ts":"2026-10-17T07:00:26.003Z","level":"info","msg":"extension started","extension":"user:vscode-desktop","run":"de822f53-3fab-4234-98e9-605979931907","state":"running"}
{"ts":"2026-10-17T07:00:26.476Z","level":"info","msg":"display set","paneId":"4306f6cf-c65e-40a0-997c-181394d3a120","name":"vscode-desktop","kind":"panel","format":"script-html","bytes":362,"rev":1}
{"ts":"2026-10-17T07:00:31.081Z","level":"info","msg":"display closed","paneId":"4306f6cf-c65e-40a0-997c-181394d3a120","name":"vscode-desktop","reason":"closed"}
  ✘  1 src/specs/vscode-cdp.spec.ts:31:1 › real CDP pixels and input through the app view, explicit permissions and stop (7.4s)


  1) src/specs/vscode-cdp.spec.ts:31:1 › real CDP pixels and input through the app view, explicit permissions and stop

    Error: expect(received).toBeLessThanOrEqual(expected)

    Expected: <= 2
    Received:    200

      276 |       });
      277 |       await expect.poll(() => wheelMessages.reduce((sum, m) => sum + m.deltaY, 0)).toBe(3200);
    > 278 |       expect(wheelMessages.length).toBeLessThanOrEqual(2);
          |                                    ^
      279 |       await expect.poll(scrollTop).toBeGreaterThan(beforeScroll + 2000);
      280 |       await expect(view.getByRole("status")).toHaveText("操作中");
      281 |     } finally { await viewerSession.detach(); }
        at /workspaces/sodashitsu-vscode-cdp/packages/e2e/src/specs/vscode-cdp.spec.ts:278:36

    Error Context: ../../../../tmp/vscode-cdp-wheel-view-negative2-results/vscode-cdp-real-CDP-pixels-121cc-plicit-permissions-and-stop/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    ../../../../tmp/vscode-cdp-wheel-view-negative2-results/vscode-cdp-real-CDP-pixels-121cc-plicit-permissions-and-stop/trace.zip
    Usage:

        pnpm exec playwright show-trace ../../../../tmp/vscode-cdp-wheel-view-negative2-results/vscode-cdp-real-CDP-pixels-121cc-plicit-permissions-and-stop/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/vscode-cdp.spec.ts:31:1 › real CDP pixels and input through the app view, explicit permissions and stop
undefined
/workspaces/sodashitsu-vscode-cdp/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test vscode-cdp.spec.ts -g real CDP pixels --output /tmp/vscode-cdp-wheel-view-negative2-results

```

input()のみ旧実装へ戻しbuildして実行、wheel送信が2件以下の期待に対して200件になり失敗。検査後に保存byte列へ完全一致復元。最終buildを戻して配信する。

最終正状態の再build PASS（/tmp/vscode-cdp-wheel-restored-build.log）。source保存bytes一致、node syntax/diff check PASS。Windows一時bridgeファイルsource一致更新済。
