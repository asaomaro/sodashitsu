# CDP実装の検証結果（2026-10-17）

## 実装と対象

- branch: `feature/vscode-cdp`、worktree: `/workspaces/sodashitsu-vscode-cdp`。基準は `94f53f1245cdc1543221627ba97ee7dcd259046a`。
- 既存Windows VSCode・現在稼働中のSoda状態・元worktreeの未コミット変更は変更していない。
- Node標準APIのWindows向けCDP bridge、cookie/Origin認証と一回限り招待の専用relay、Soda管理のcanvas部品、実験版Sodaプラグインを実装。VSCode本体fork・VSIX・任意JS/CDP proxyは含まない。
- 試験は一時stateのSodaとPlaywright既存pipeで接続したChromiumを使用。CDPのTCP portは開いていない。

## 合格した確認

- `pnpm build` と `pnpm typecheck`: 合格（`/tmp/vscode-cdp-build.log`、`/tmp/vscode-cdp-typecheck.log`）。
- `pnpm exec vitest run packages/server/src/desktop scripts/vscode-cdp.test.ts packages/web/src/display/components.test.ts --maxWorkers=2`: 18件合格（`/tmp/vscode-cdp-target-final.log`）。
- `pnpm --filter @sodashitsu/e2e exec playwright test vscode-cdp.spec.ts`: 2件合格。実CDP JPEG→専用relay→canvasの画素、ACK保留中の最終更新、閲覧から明示的な操作許可、日本語確定文字・物理キー・double click・画像外pointerup・停止後の透明画素を確認。実際のpack/install/enableで導入したアプリを390pxのモバイル幅で開き、iframeからtoken・親DOMへアクセスできずnative部品が収まることも確認（`/tmp/vscode-cdp-e2e.log`）。
- 既存 `plugin-components.spec.ts app-view-direct.spec.ts`: 13件合格（`/tmp/vscode-cdp-existing-e2e.log`）。
- `pnpm smoke`: 起動確認合格（`/tmp/vscode-cdp-smoke.log`）。
- 画面は `/tmp/vscode-cdp-app.png`、`/tmp/vscode-cdp-mobile.png` を目視確認。テスト用招待は既に失効している。
- 対象ESLint: error 0、テストの明示的anyのwarning 6（`/tmp/vscode-cdp-lint.log`）。
- 独立taskcheckで認証/入力/切断を点検、pointerup補正を再点検。全体の独立最終レビューと最終画像欠落修正の独立再レビューが通過（`review.md`）。

## 全体試験と既存失敗の切り分け

`pnpm exec vitest run --maxWorkers=4` は671ファイル中669通過、10900テスト通過、1失敗、1skip。別途1 suiteがdist鮮度で失敗した（`/tmp/vscode-cdp-all.log`）。

1. `soda.pty.integration.test.ts` のdistがsrcより古いという失敗は、全体再ビルド後の単独再実行で解消。実PTY起動テストは合格。
2. `surface/methods/agent.test.ts` の既存「1000ms」期待に対し実装が300msを返す1件は再実行でも失敗。今回変更していないファイル。汚れた元worktreeの代わりに `/tmp/sodashitsu-cdp-baseline` を同じ基準commitのdetached worktreeとして作り、offline installとprotocol/client-core build後に同じ試験を実行し、同じ `expected 300 to be 1000` を確認（`/tmp/vscode-cdp-baseline-agent.log`）。本作業では修正しない。

再ビルド後の2ファイル再実行は27件合格・上記1件失敗（`/tmp/vscode-cdp-unit-recheck.log`）。全体試験をすべて合格とは扱わない。最後の新規試験追加・画像保持修正については対象試験と実CDP E2Eを別途実行している。

## 回帰テストのnegative control

修正箇所のみを戻して失敗させ、finallyで元のbytesへ戻して一致を確認した。E2Eは変更状態でwebを再ビルドし、復元後にも再ビルドする。

### 部品の種別保持

`frameMessages.ts` の `component: data.component` のみを `terminal` 固定に戻した。テストは期待したdesktop-cdpとterminalの差で失敗し、復元後は合格。生の出力:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-vscode-cdp

 ❯ |@sodashitsu/web| src/display/components.test.ts (9 tests | 1 failed | 8 skipped) 11ms
   ❯ native component boundary (4)
     × preserves the desktop component kind instead of routing it as a terminal 9ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/display/components.test.ts > native component boundary > preserves the desktop component kind instead of routing it as a terminal
AssertionError: expected 'terminal' to be 'desktop-cdp' // Object.is equality

Expected: "desktop-cdp"
Received: "terminal"

 ❯ src/display/components.test.ts:10:64
      8|     const rect = { x: 0, y: 0, width: 800, height: 600 };
      9|     const message = readFrameMessage({ type: "component", component: "…
     10|     expect(message?.type === "component" && message.component).toBe("d…
       |                                                                ^
     11|   });
     12|   const info = {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 skipped (9)
   Start at  13:35:14
   Duration  2.05s (transform 62%, environment 24%, import 14%, tests 1%, worker 1%)

```

### 最終画像の保持

`cdp-client.mjs` の画像保持修正だけを前版に戻した。REDの後のBLUEが欠落して失敗。復元後のSHA256は `61fa8925c9d60c210b42c617230186f8a9ae62629ccf53530c04de738033df93`。生の出力:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-vscode-cdp

 ❯ |scripts| vscode-cdp.test.ts (3 tests | 1 failed | 2 skipped) 10ms
   × retains the final repaint while waiting for ACK or the frame interval 9ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |scripts| vscode-cdp.test.ts > retains the final repaint while waiting for ACK or the frame interval
AssertionError: expected [ 'RED' ] to deeply equal [ 'RED', 'BLUE' ]

- Expected
+ Received

  [
    "RED",
-   "BLUE",
  ]

 ❯ vscode-cdp.test.ts:101:35
     99|     capture.ack(1);
    100|     await vi.advanceTimersByTimeAsync(110);
    101|     expect(frames.map(f=>f.data)).toEqual(['RED','BLUE']);
       |                                   ^
    102|     capture.ack(2);
    103|     await capture.onFrame({sessionId:1,data:'GREEN'});

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
   Start at  13:41:50
   Duration  185ms (transform 67%, import 19%, tests 11%, worker 4%)

```

### 画像外のマウスボタン解放

`DesktopCdpView.vue` のpointerup座標補正だけを戻し、webを再ビルドして実CDP E2Eを実行。元rendererのmouseup回数が1増えるという検査で失敗した。復元後のSHA256は `a2a7cd98516edab264400fc16d73f4c8129f393f811fd30c89c6e6c46254c2ad`。最初のnegative実行は別の全体ビルドと重なり成功してしまったため証拠として採用せず、全ビルドの終了後に単独で再ビルド・再実行して以下の失敗を確認した。復元後にもwebを再ビルド済み。

生の出力:

```text

Running 1 test using 1 worker

(node:3107420) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-17T04:43:15.218Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T04:43:15.218Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T04:43:15.219Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-gcJbJb/commands.json","count":0}
{"ts":"2026-10-17T04:43:15.669Z","level":"info","msg":"display script enabled","byClientId":"a42b49e1-5d2f-411d-a3fb-12dd309a0efb","byKind":"desktop"}
{"ts":"2026-10-17T04:43:15.698Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T04:43:15.698Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T04:43:15.699Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-gcJbJb/commands.json","count":0}
{"ts":"2026-10-17T04:43:16.017Z","level":"info","msg":"agent resume skipped","paneId":"4a2ecb6e-2847-4982-b4f1-9c616cddf741","reason":"no-session-ref"}
{"ts":"2026-10-17T04:43:16.043Z","level":"info","msg":"extension started","extension":"user:scrhost","run":"ba06b60c-6654-4f74-8b88-86b79ba58df9","state":"running"}
{"ts":"2026-10-17T04:43:16.969Z","level":"info","msg":"display set","paneId":"4a2ecb6e-2847-4982-b4f1-9c616cddf741","name":"desktop","kind":"panel","format":"script-html","bytes":164,"rev":1}
{"ts":"2026-10-17T04:43:24.134Z","level":"info","msg":"display closed","paneId":"4a2ecb6e-2847-4982-b4f1-9c616cddf741","name":"desktop","reason":"closed"}
  ✘  1 src/specs/vscode-cdp.spec.ts:18:1 › real CDP pixels and input through the app view, explicit permissions and stop (9.4s)


  1) src/specs/vscode-cdp.spec.ts:18:1 › real CDP pixels and input through the app view, explicit permissions and stop 

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: 5
    Received: 4

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      142 |     await expect
      143 |       .poll(async () => Number(await source.locator("body").getAttribute("data-releases")))
    > 144 |       .toBe(releases + 1);
          |        ^
      145 |     await page.screenshot({ path: "/tmp/vscode-cdp-app.png" });
      146 |     const ended = once(bridge, "close");
      147 |     await view.getByRole("button", { name: "共有を停止", exact: true }).click();
        at /workspaces/sodashitsu-vscode-cdp/packages/e2e/src/specs/vscode-cdp.spec.ts:144:8

    Error Context: test-results/vscode-cdp-real-CDP-pixels-121cc-plicit-permissions-and-stop/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/vscode-cdp-real-CDP-pixels-121cc-plicit-permissions-and-stop/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/vscode-cdp-real-CDP-pixels-121cc-plicit-permissions-and-stop/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/vscode-cdp.spec.ts:18:1 › real CDP pixels and input through the app view, explicit permissions and stop 
undefined
/workspaces/sodashitsu-vscode-cdp/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test vscode-cdp.spec.ts --grep real CDP
```

## 未検証・残る境界

Windows本物のVSCode、Monaco/terminal/Webview、native menu/dialog、最小化/非表示/lock、Safari/iOS、WANの性能は未検証。Windows側の既定9222 listenerが無いことだけを読み取り確認した。他portの有無や既存VSCodeへ後付けできることは主張しない。既存の終了/再起動やdebug port開放は行わない。ロック検知・clipboard同期・audio・file transfer・常駐復元は未実装。実機検証は既にCDPが有効なVSCodeを明示選択して行う必要がある。

## 復元後の最終確認

全negative controlの復元後に `pnpm build` を再実行し、実CDPのE2E 2件が再度合格（10.9s）。対象単体/統合18件も再度合格。全体typecheckも最終状態で再度合格。`git diff --check` は合格。元worktreeのstatusも作業開始時と同じ変更ファイルの一覧であり、本作業のファイルは独立worktree内だけにある。

## Windows実機の接続準備（ユーザーによる起動後）

ユーザーがWindows PowerShellから、分離した `%TEMP%\soda-vscode-cdp-test` のuser-data-dirと `--remote-debugging-port=9222` でVSCodeを起動した。読み取り確認で、Windows `127.0.0.1:9222` のlisten、`/json/version` 200、`/json/list` のworkbench pageを確認。VSCode 1.141.2 / Electron 43.7.7 / Chromium 150.0.7871.250。PowerShellの `Invoke-RestMethod ... | Select-Object` の直結では空欄に見えたが、一度変数へ代入してからpipeすると対象が表示された。

Windows Node v24.19.0で、配置した `cdp-bridge.mjs --list` からも「ようこそ - Visual Studio Code」のworkbenchを確認。Windows側の一時配置先は `%TEMP%\soda-vscode-cdp-bridge`（ブリッジ2ファイルと一時login-url.txt）。元の作業中VSCodeは操作していない。

実機向けSodaは別プロセス・loopback 17883・一時state `/tmp/soda-cdp-live-3Nwtam`・名前付きsession `cdp-test` で起動。既存cookieと区別する。プラグイン導入/有効化・script表示許可・アプリtab作成はこの一時state内だけ。WindowsからHTTP 200を確認。起動スクリプト `/tmp/sodashitsu-cdp-live-server.mjs`、管理情報 `/tmp/sodashitsu-cdp-live-info.json`（0600、tokenを含むため外部共有しない）、ログ `/tmp/sodashitsu-cdp-live-server.log`。実機の画像取得・入力の合格はまだ主張しない。

## Windows本物のVSCodeの画像転送確認

ユーザーから「共有元が接続されていません」の報告後、読み取り調査時点でWindowsのcdp-bridgeプロセスは存在せず、CDPのworkbenchは引き続き存在した。ユーザーのviewerを操作せず、別の認証済み検証用headless browserで一回限りの招待を作り、Windows Nodeで同じテスト用VSCodeへ `--target` 指定・閲覧専用でブリッジを起動した。

`/tmp/sodashitsu-cdp-real-vscode-check.mjs` の生出力:

```text
bridge err: 閲覧専用で接続しました
REAL_VSCODE_IMAGE_RECEIVED { width: 1799, height: 1200, frame: '1' }
bridge err: 共有を停止しました
bridge exit: 0
```

Sodaのnative canvasを含む実際のブラウザ画面 `/tmp/sodashitsu-real-vscode.png` を目視し、Windows VSCodeのようこそ画面・メニュー・サイドバーが表示されることを確認。終了は自分のviewerの［共有を停止］のみで行い、Windows VSCodeは終了・再起動していない。入力許可や文字入力は行っていない。この結果は実機での初回画像取得に限り、Windowsの入力・IME・最小化・lock・連続操作性能は引き続き未検証。ユーザーのWindows PowerShellに出た終了メッセージは確認待ちで、失敗原因を確定していない。

## Windows実機の非アクティブ入力timeout修正

ユーザーが操作許可付きブリッジを起動し「入力に失敗しました」で終了。別の読み取り/軽微入力診断（マウス移動とShiftの押下/解放。文書編集なし）で、通常状態のInput.dispatchMouseEventが5秒timeout、dispatchKeyEventは成功することを確認した。CDPのEmulation.setFocusEmulationEnabled(true)後はマウス・Shiftとも成功し、finallyでfalseに戻した。

ブリッジは操作許可時のfocus設定を入力queueへ先行して入れ、閲覧/停止時に解除するよう修正。epochによる未実行入力の破棄を維持した。Windowsの一時フォルダのcdp-client.mjsも更新した。通常のVSCodeの再起動やデバッグ設定の変更は行っていない。

- 対象単体/統合20件合格（/tmp/vscode-cdp-focus-target.log）、うちbridge単体5件。
- 既存CDP E2E 2件合格（/tmp/vscode-cdp-focus-e2e.log）。
- 独立再レビュー合格、stop-during-focus / revoke-regrant / focus-command-failureの追加模擬検証も合格（review.md）。
- 修正前版へ一時的に戻して回帰テストを実行するとmouse処理回数0対期待1で失敗。元bytesへ復元しSHA256 fa766a2815b14a15ca3a47644671d0abafa8959b43958f0d3a75fd6335deb054を確認、復元後に単体/E2Eを実行。

negative controlの生出力:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-vscode-cdp

 ❯ |scripts| vscode-cdp.test.ts (5 tests | 1 failed | 4 skipped) 10ms
   × focuses an inactive Electron page before input and releases focus on view-only and stop 9ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |scripts| vscode-cdp.test.ts > focuses an inactive Electron page before input and releases focus on view-only and stop
AssertionError: expected +0 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 0

 ❯ vscode-cdp.test.ts:132:19
    130|       button: "none", buttons: 0, modifiers: 0, clickCount: 0, deltaX:…
    131|     await granting;
    132|     expect(moves).toBe(1);
       |                   ^
    133|     expect(focused).toBe(true);
    134|     await capture.setControl(false);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 4 skipped (5)
   Start at  14:20:48
   Duration  180ms (transform 70%, import 15%, tests 12%, worker 3%)

```

実機のSoda canvasからマウス移動・Shiftを送り、従来の5秒timeoutを超えて操作中を維持することを確認。実機テストでは文書編集・実行・保存を行っていない。実機の英字/日本語入力、IME候補、最小化、ロックの全条件はまだ合格とはしない。

修正後のWindows実機Soda経由確認の生出力（/tmp/sodashitsu-cdp-real-vscode-control.log）:

```text
bridge err: 接続しました。ブラウザで操作を許可できます。
REAL_VSCODE_IMAGE_RECEIVED { width: 1799, height: 1200, frame: '1' }
REAL_VSCODE_CONTROL_AFTER_MOUSE_AND_SHIFT 操作中
REAL_VSCODE_AFTER_REVOKE 閲覧中
bridge err: 共有を停止しました
bridge exit: 0
```

## メニューとnative dialog・実ウィンドウサイズの境界

ユーザー報告: ヘッダーメニューとフォルダー選択が映らない。読み取り専用のDOM/CSS診断（Windows一時フォルダ内のui-boundary/ui-menu系mjs。製品ブリッジへは組み込まない）で、メニューはHTMLとして存在し、boxあり、display:block/visibility:visible/opacity:1でも、非アクティブ時のCDP画像に描かれないことを確認。fromSurface true/falseの両方で欠落。Page.bringToFrontで検証用VSCodeを一時的に前面化した後は、同じCDP screenshotにファイルメニューが描かれた（boundary-menu-front.png）。メニュー開閉だけを試し、文書・設定は変更していない。その後ユーザーも「メニューは表示。フォルダ選択は表示されない」と確認した。focus emulationのみでnative非アクティブ時の全描画を保証できるとは扱わない。

フォルダー選択は標準ではnativeHostService.pickFolderAndOpenを使用し、files.simpleDialog.enable:trueならworkbench内の簡易UIを選ぶ（公式ソース https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/dialogs/electron-browser/fileDialogService.ts ）。Windowsのnative dialog自体はpage screenshot/screencastの対象外。簡易UIへ切り替えると見た目が変わるため、自動では設定しなかった。

遠隔からの実ウィンドウresizeは未実装。Windows側での通常のサイズ変更を映像のviewport/CSS座標へ反映する設計であり、Sodaの面だけのサイズ変更は映像の拡縮にとどまる。実機のbrowser-level CDPへBrowser.getWindowForTargetを読み取り送信した結果:

```text
Browser.getWindowForTarget {"id":1,"error":{"code":-32601,"message":"'Browser.getWindowForTarget' wasn't found"}}
```

Windowsの実ウィンドウのサイズを変更するCDP/API命令は送っていない。CDPのwindow APIがElectronでも使えると仮定せず、必要なら選択済みHWNDに限定したWindows helper側の実装を別途設計する。

## 環境再起動後の再開検証

元session履歴と実状態を照合し、一時サーバを復元した。再作成可能な `scripts/vscode-cdp-dev.mjs`、renderer resize/HiDPI/座標のE2Eを追加。対象単体/統合20件、E2E2件、E2E typecheckと構文・差分検査が合格。再開経緯と現状態は resume.md、遠隔resize未実装の設計は resize-design.md。Windows実機側CDPが無く、起動依頼中のため再起動後の実機リサイズ合格はまだ主張しない。

独立検証の生出力:

```text
ready origin http://127.0.0.1:17946 state within temp true file mode 600
login status 204
collision exit 1 EADDRINUSE true
SIGTERM exit 0
```

## 表示枠追従の追加実装

ユーザー希望に応じ、CDP viewport fitを実装。Windows実機で追従・解除・停止復帰を確認し、対象34件・新規/既存関連E2E15件・build/typecheck/smokeが通過。独立レビューと2件のrace修正/再レビューを実施。詳細・生のnegative control・制約は fit-test-result.md を参照。Windows外枠resize/native dialog共有とは区別する。
