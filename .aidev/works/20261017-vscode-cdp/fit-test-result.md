# 表示領域への追従（viewport fit）

ユーザーの「SodashitsuのウィンドウサイズにVSCodeを表示させたい」に対応する追加。Windows外枠を変更する実装とは区別し、同じrendererの描画領域を表示枠へ合わせる。Windows内部の同じGUIレイアウトにも反映される。native folder dialogは対象外のまま。

## 実装

- Windows `--allow-input --allow-fit`、cookie/Origin認証済みviewerの操作許可、明示checkboxの3条件で有効。
- ResizeObserverで表示枠を測り200ms集約、同寸法は送らない。160×120未満/極端な比率では解除。最大4096×2400 CSS pxへ比率維持で収める。
- protocolはstrictな `viewport {size:{width,height}|null}` のみで、CDP名や任意式は公開しない。旧bridge helloはallowFit=falseとして受け付ける。
- helperは最新1件へ集約して入力queueと直列化。capture停止→旧latestを破棄・世代更新→metrics変更/解除→capture再開。送信済み旧frame ACKは保持、未送信旧frameは破棄。新しい対応画像のACKとworker終了まで入力を破棄し、旧座標を後から送らない。
- fitオフ・閲覧復帰・停止でclearDeviceMetricsOverrideを試み、通常停止ではclear後にCDPを閉じる。別DevToolsの既存overrideを保存/復元できるAPIは無いので同時利用は非対応。

## Windows実機

ユーザーが分離したuser-data-dirで起動したWindows VSCode 1.142.0 / Electron 43.7.7 / Chromium150。こちらからVSCodeの起動/終了・設定変更・外枠resizeはしていない。最初に900×600へのset/clearの動作を確認後、更新したSoda appへWindows Node v24.19.0のbridgeを接続。

実際のブラウザでfit checkbox・ブラウザサイズ変更・fit解除・再ON・共有停止を行い、別の読み取りCDP接続でCSS viewportを照合。描画画像の比率と、`/tmp/vscode-cdp-fit-windows.png` の目視も確認。

生の出力:

```text
before {"width":1199,"height":800,"targetId":"023ED2C203F545063B9CDCB4981B2292"}
bridge: 接続しました。ブラウザで操作を許可できます。
fit {"source":{"width":943,"height":616},"view":{"width":943,"height":616}}
viewer resized {"source":{"width":743,"height":516},"view":{"width":743,"height":516}}
fit off restored {"width":1199,"height":800}
stop restored {"width":1199,"height":800}
bridge: 共有を停止しました
```

## 自動検証

- 対象単体/統合34件PASS（relay11、capture14、component9）。/tmp/vscode-cdp-fit-target.log
- fit E2E 2件PASS（11.9s）。実app pack/install/enable→実Chromium pipe capture→native canvasの画素・寸法・新レイアウト入力・fit解除/閲覧/停止後のnative baseline復帰、モバイルのiframe隔離。/tmp/vscode-cdp-fit-e2e.log
- pnpm build、pnpm typecheck PASS。追加の最終web buildとE2E typecheckもPASS。
- pnpm smoke PASS。git diff --check PASS。
- 既存関連E2Eは別Playwrightプロセスとの同一artifactフォルダ競合によりENOENTで1件失敗・12件通過。製品のassert失敗ではなく実行方法の不備。同一プロセス・単一worker・専用outputで新規含む15件を再実行し、15件すべてPASS（1.2m）。/tmp/vscode-cdp-fit-final-e2e.log
- 新E2E作成時の誤った前提を修正: 固定dock panelはブラウザresizeでサイズが変わらないため、実際のapp viewで検証する。Playwright viewportもemulation overrideなので、fit前にclearして実native baselineを計測し復元期待に使う。他クライアントのoverrideへ復元できるとは扱わない。

## 独立レビューと修正

resume_reviewが新fit差分を点検。未適用fitを取消し再許可するとinputBlockedが残るP2を発見し、fit_captureが修正。さらにrootが指摘した『キー解放待ち中の旧ACK→旧座標input』raceも再現・修正した。修正差分ごとに独立再レビューを通過。詳細 review.md。

## 回帰テストのnegative control

指定の修正箇所のみを戻して失敗させ、元bytesへ復元して一致を確認後、修正後全capture14件をPASS。生の出力を以下に保存する。

### 旧ACKが未送信frameを解放するrace

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-vscode-cdp

 ❯ |scripts| vscode-cdp.test.ts (11 tests | 1 failed | 10 skipped) 26ms
   × ignores duplicate old ACKs while preparing an unsent frame 22ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |scripts| vscode-cdp.test.ts > ignores duplicate old ACKs while preparing an unsent frame
AssertionError: expected [ 'FIRST', 'THIRD' ] to deeply equal [ 'FIRST' ]

- Expected
+ Received

  [
    "FIRST",
+   "THIRD",
  ]

 ❯ vscode-cdp.test.ts:282:35
    280|   capture.ack(1);
    281|   await capture.onFrame({sessionId:1,data:'THIRD'});
    282|   expect(frames.map(f => f.data)).toEqual(['FIRST']);
       |                                   ^
    283|   metrics.resolve(); await next;
    284|   expect(frames.map(f => f.data)).toEqual(['FIRST','SECOND']);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 10 skipped (11)
   Start at  15:01:42
   Duration  679ms (transform 69%, import 19%, tests 9%, worker 3%)

```

### 未適用fit取消し後の再許可

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-vscode-cdp

 ❯ |scripts| vscode-cdp.test.ts (13 tests | 1 failed | 12 skipped) 25ms
   × allows input after a queued fit is cancelled before applying any viewport override 20ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |scripts| vscode-cdp.test.ts > allows input after a queued fit is cancelled before applying any viewport override
AssertionError: expected [] to deeply equal [ 'after cancelled fit' ]

- Expected
+ Received

- [
-   "after cancelled fit",
- ]
+ []

 ❯ vscode-cdp.test.ts:304:86
    302|   await capture.setControl(true);
    303|   await capture.input({kind:'text',text:'after cancelled fit'});
    304|   expect(calls.filter(c => c.method === 'Input.insertText').map(c => c…
       |                                                                                      ^
    305|   expect(calls.some(c => c.method === 'Emulation.setDeviceMetricsOverr…
    306|   await capture.stop();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 12 skipped (13)
   Start at  15:02:28
   Duration  625ms (transform 68%, import 21%, tests 8%, worker 3%)

```

### キー解放待ち中の旧ACKと旧座標入力

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-vscode-cdp

 ❯ |scripts| vscode-cdp.test.ts (14 tests | 1 failed | 13 skipped) 16ms
   × does not queue old-coordinate input when an old ACK arrives during fit key release 13ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |scripts| vscode-cdp.test.ts > does not queue old-coordinate input when an old ACK arrives during fit key release
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ vscode-cdp.test.ts:348:76
    346|     button:'none',buttons:0,modifiers:0,clickCount:0,deltaX:0,deltaY:0…
    347|   release.resolve(); await Promise.all([resize, oldInput]);
    348|   expect(harness.calls.some(c => c.method === 'Input.dispatchMouseEven…
       |                                                                            ^
    349|   await capture.input({kind:'text',text:'new viewport ready'});
    350|   expect(harness.calls.filter(c => c.method === 'Input.insertText').ma…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 13 skipped (14)
   Start at  15:03:40
   Duration  607ms (transform 73%, import 14%, tests 7%, worker 6%)

```

## 最終確認

新規/既存関連E2E 15件すべてPASS（1.2m、専用output /tmp/vscode-cdp-fit-final-results）。対象単体34件、全体build/typecheck、最終web build/E2E typecheck、smoke、差分検査が通過。Windowsの一時フォルダのcdp-client.mjs/cdp-bridge.mjsはリポジトリの最新bytesと一致を確認。既存VSCodeの終了/再起動や設定保存、外部公開、main/他worktree変更、commit/PRは行っていない。

## 手動再接続時のCDP到達エラー

Windows PowerShellから9222/json/version・json/listは接続失敗、Soda17883はHTTP200を確認。CDP側が応答していない。VSCodeの自動起動/終了はせず、利用者へ分離プロファイルの手動起動を案内。ブリッジの探索fetch失敗を接続先URLとCDP起動確認・--cdp案内付きエラーへ変更し、Windows一時コピーも更新。例外causeを保持する。対象15件合格。修正箇所のみ戻したnegative controlの生出力（復元後のbytes一致確認済み）:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-vscode-cdp

 ❯ |scripts| vscode-cdp.test.ts (15 tests | 1 failed | 14 skipped) 8ms
   × identifies the Windows CDP endpoint when discovery cannot connect 7ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |scripts| vscode-cdp.test.ts > identifies the Windows CDP endpoint when discovery cannot connect
AssertionError: expected 'fetch failed' to contain 'Windows側のCDP接続先 http://127.0.0.1:9222…'

Expected: "Windows側のCDP接続先 http://127.0.0.1:9222/json/list"
Received: "fetch failed"

 ❯ vscode-cdp.test.ts:360:29
    358|     const failure = await targets("http://127.0.0.1:9222").catch((e: E…
    359|     expect(failure).toBeInstanceOf(Error);
    360|     expect(failure.message).toContain("Windows側のCDP接続先 http://127.0.0.…
       |                             ^
    361|     expect(failure.message).toContain("--cdp");
    362|     expect(failure.cause).toBe(cause);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 14 skipped (15)
   Start at  15:21:40
   Duration  213ms (transform 76%, import 14%, tests 8%, worker 3%)


```

更新後のWindows Nodeによる `cdp-bridge.mjs --list` 実行でも、接続先付きエラーとexit1を実測。Windows起動等の変更なし。

## 等倍表示・操作受付復帰の追加検証（作業中）

初回E2Eは760pxへの変更でモバイルの画面構成へ切り替わり、appが再接続中でcanvas非表示のため失敗。等倍・overflow検証はdesktop構成を保つ1050pxに変更し、2件合格（11.7s、/tmp/vscode-cdp-1to1-e2e2.log）。モバイル初期表示の隔離検証は別ケースで継続。

最初のfocus negativeはpointer handlerのみ外したが、追加tabindexによるnative focus復帰が残っていて目的のassertionを通過し、後段のpointerupで失敗した。この結果は復帰回帰の証拠として使わない。tabindexとhandler両方を旧状態に戻して再検証する。

### 有効なnegative: focus2

```text

Running 1 test using 1 worker

(node:208558) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-17T06:37:46.958Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T06:37:46.959Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T06:37:46.960Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-OcK07Z/commands.json","count":0}
{"ts":"2026-10-17T06:37:47.714Z","level":"info","msg":"display script enabled","byClientId":"ea56f756-69a1-434a-9921-92c4cd290b08","byKind":"desktop"}
{"ts":"2026-10-17T06:37:48.396Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T06:37:48.396Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T06:37:48.397Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-OcK07Z/commands.json","count":0}
{"ts":"2026-10-17T06:37:48.722Z","level":"info","msg":"agent resume skipped","paneId":"8036b697-d1bb-481f-8ebc-912346df0885","reason":"no-session-ref"}
{"ts":"2026-10-17T06:37:48.765Z","level":"info","msg":"extension started","extension":"user:vscode-desktop","run":"5040fc07-5a13-47f5-b2f2-cb0e68d9a20d","state":"running"}
{"ts":"2026-10-17T06:37:49.212Z","level":"info","msg":"display set","paneId":"953ab365-5a0f-490c-a3ec-04c877204c67","name":"vscode-desktop","kind":"panel","format":"script-html","bytes":362,"rev":1}
{"ts":"2026-10-17T06:37:55.848Z","level":"info","msg":"display closed","paneId":"953ab365-5a0f-490c-a3ec-04c877204c67","name":"vscode-desktop","reason":"closed"}
  ✘  1 src/specs/vscode-cdp.spec.ts:31:1 › real CDP pixels and input through the app view, explicit permissions and stop (9.4s)


  1) src/specs/vscode-cdp.spec.ts:31:1 › real CDP pixels and input through the app view, explicit permissions and stop 

    Error: expect(locator).toBeEnabled() failed

    Locator:  locator('[data-plugin-view] [data-desktop-cdp]').getByRole('button', { name: '操作する', exact: true })
    Expected: enabled
    Received: disabled
    Timeout:  5000ms

    Call log:
      - Expect "toBeEnabled" locator('[data-plugin-view] [data-desktop-cdp]').getByRole('button', { name: '操作する', exact: true }) with timeout 5000ms
      - waiting for locator('[data-plugin-view] [data-desktop-cdp]').getByRole('button', { name: '操作する', exact: true })
        14 × locator resolved to <button disabled data-v-ab509081="">操作する</button>
           - unexpected value "disabled"


      136 |     await expect(view.getByRole("button", { name: "操作する", exact: true })).toBeDisabled();
      137 |     await view.locator("header strong").click();
    > 138 |     await expect(view.getByRole("button", { name: "操作する", exact: true })).toBeEnabled();
          |                                                                           ^
      139 |     await page.locator("#outside-cdp").evaluate(el => el.remove());
      140 |     await view.getByRole("button", { name: "操作する", exact: true }).click();
      141 |     await expect(view.getByRole("status")).toHaveText("操作中");
        at /workspaces/sodashitsu-vscode-cdp/packages/e2e/src/specs/vscode-cdp.spec.ts:138:75

    Error Context: ../../../../tmp/vscode-cdp-1to1-negative-focus2-results/vscode-cdp-real-CDP-pixels-121cc-plicit-permissions-and-stop/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    ../../../../tmp/vscode-cdp-1to1-negative-focus2-results/vscode-cdp-real-CDP-pixels-121cc-plicit-permissions-and-stop/trace.zip
    Usage:

        pnpm exec playwright show-trace ../../../../tmp/vscode-cdp-1to1-negative-focus2-results/vscode-cdp-real-CDP-pixels-121cc-plicit-permissions-and-stop/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/vscode-cdp.spec.ts:31:1 › real CDP pixels and input through the app view, explicit permissions and stop 
undefined
/workspaces/sodashitsu-vscode-cdp/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test vscode-cdp.spec.ts -g real CDP pixels --output /tmp/vscode-cdp-1to1-negative-focus2-results

```

### 有効なnegative: scale

```text

Running 1 test using 1 worker

(node:206980) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-17T06:37:16.313Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T06:37:16.314Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T06:37:16.315Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-YJncdQ/commands.json","count":0}
{"ts":"2026-10-17T06:37:16.954Z","level":"info","msg":"display script enabled","byClientId":"5789fb1e-e909-4a56-9d97-73017fa16920","byKind":"desktop"}
{"ts":"2026-10-17T06:37:17.716Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T06:37:17.716Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T06:37:17.717Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-YJncdQ/commands.json","count":0}
{"ts":"2026-10-17T06:37:18.044Z","level":"info","msg":"agent resume skipped","paneId":"f03dcd25-1355-42a0-a837-3d410124c53a","reason":"no-session-ref"}
{"ts":"2026-10-17T06:37:18.087Z","level":"info","msg":"extension started","extension":"user:vscode-desktop","run":"74b5b1e5-744d-4ca8-b6ac-acc90ac3688c","state":"running"}
{"ts":"2026-10-17T06:37:18.611Z","level":"info","msg":"display set","paneId":"3729c784-13b0-463c-8bae-bb1df8634896","name":"vscode-desktop","kind":"panel","format":"script-html","bytes":362,"rev":1}
{"ts":"2026-10-17T06:37:26.124Z","level":"info","msg":"display closed","paneId":"3729c784-13b0-463c-8bae-bb1df8634896","name":"vscode-desktop","reason":"closed"}
  ✘  1 src/specs/vscode-cdp.spec.ts:31:1 › real CDP pixels and input through the app view, explicit permissions and stop (10.6s)


  1) src/specs/vscode-cdp.spec.ts:31:1 › real CDP pixels and input through the app view, explicit permissions and stop 

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 2
    + Received  + 2

      Object {
    -   "height": 700,
    -   "width": 1000,
    +   "height": 410.984375,
    +   "width": 587.140625,
      }

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      189 |       const b = (await canvas.boundingBox())!;
      190 |       return { width: b.width, height: b.height };
    > 191 |     }).toEqual({ width: 1000, height: 700 });
          |        ^
      192 |     // A small viewer must scroll rather than scaling the existing renderer.
      193 |     await page.setViewportSize({ width: 1050, height: 650 });
      194 |     await expect.poll(async () => {
        at /workspaces/sodashitsu-vscode-cdp/packages/e2e/src/specs/vscode-cdp.spec.ts:191:8

    Error Context: ../../../../tmp/vscode-cdp-1to1-negative-scale-results/vscode-cdp-real-CDP-pixels-121cc-plicit-permissions-and-stop/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    ../../../../tmp/vscode-cdp-1to1-negative-scale-results/vscode-cdp-real-CDP-pixels-121cc-plicit-permissions-and-stop/trace.zip
    Usage:

        pnpm exec playwright show-trace ../../../../tmp/vscode-cdp-1to1-negative-scale-results/vscode-cdp-real-CDP-pixels-121cc-plicit-permissions-and-stop/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/vscode-cdp.spec.ts:31:1 › real CDP pixels and input through the app view, explicit permissions and stop 
undefined
/workspaces/sodashitsu-vscode-cdp/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test vscode-cdp.spec.ts -g real CDP pixels --output /tmp/vscode-cdp-1to1-negative-scale-results

```

両方とも修正箇所のみ戻してビルドし直し、対象assertionで失敗。その後DisplayFrame.vue/DesktopCdpView.vueを保存byte列と一致する形に復元。

### 最終検証

統合15件は14件合格・CDP1件失敗（/tmp/vscode-cdp-1to1-final-e2e.log）。等倍表示ではcanvas全体がscroll viewport内に入る保証がなく、既存dblclick・drag開始のcanvas比率座標が可視範囲外をクリックしていた。テストの両座標を初期scroll=0でcanvas/screenの交差範囲内へ修正（実装変更なし）。再実行したCDP2件は合格（/tmp/vscode-cdp-1to1-final-cdp.log）。先に合格した既存13件は重複実行せず、最終差分に対する15件の通過を組み合わせて確認。

web build、web typecheck、E2E typecheck、diff check合格。最新配信assetとdistのbyte一致をHTTP fetchで確認。既存viewer・Windows sessionを奪う自動接続はしておらず、利用者の再読み込み・再接続で適用する。
