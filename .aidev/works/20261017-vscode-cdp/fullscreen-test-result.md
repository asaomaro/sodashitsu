# 全画面表示の検証

2026-10-17。Sodashitsu親document内のnative VSCode表示面をFullscreen APIへ移す。Windows実ウィンドウの最大化ではない。iframeの権限・認証・入力許可は変更しない。

## 実装・確認範囲

- ［全画面］/［全画面を解除］。閲覧中も利用可能。全画面中は接続設定を隠し、操作・停止・解除・fitを残す。
- viewport top-layerの実寸を確認。等倍表示を保ち、fitが明示的に有効な場合はsource rendererの寸法を追従し、解除時は元の表示枠へ戻す。
- Esc down/repeat/upは解除用にローカル消費。UAがkeydownを配送せずに解除した場合のkeyupも消費。通常画面へ戻った後の新しいEscは遠隔へ配送する。
- stop/disconnect/unmountで自分の全画面を終了。requestFullscreen完了がdisconnect後になる競合も検査。
- API拒否時はメッセージを表示し、共有・入力を維持して再試行可能。非対応時はボタンを無効化。
- 実ChromiumのFullscreen APIと実CDPの映像・入力を用いるE2E。Windows実機のブラウザ全画面操作は未確認。

## ビルド・検査

- web build（vue-tscを含む）PASS: /tmp/vscode-cdp-fullscreen-restored-build.log
- E2E typecheck PASS: /tmp/vscode-cdp-fullscreen-restored-typecheck.log
- 初回実CDP E2E3件PASS（38.6s）: /tmp/vscode-cdp-fullscreen-first-e2e.log
- スクリーンショット /tmp/vscode-cdp-fullscreen.png を実装者と独立レビュー担当で目視。
- main integrationのtest timeoutを30sから60sへ変更。既存pixel/IME/pointer/wheelに複数回の全画面・fit確認を追加したため。assertion timeoutは5sのまま。

## negative control

各不具合の修正箇所だけを戻し、webを再ビルドしてE2Eを実行。以下は生の出力。終了後は /tmp/vscode-cdp-fullscreen-positive.vue から復元しcmp一致を確認、再ビルド。最後にUAによるkeydown省略のguardと検査を追加。

### disconnect後にrequestが成功する競合

完了後の `disposed || !connected.value` を `disposed` のみに戻す。resident E2EがfullScreenElement=nullの検査で失敗。

```text

Running 1 test using 1 worker

(node:671033) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-17T08:57:55.422Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T08:57:55.422Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T08:57:55.425Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-tZuKE5/commands.json","count":0}
{"ts":"2026-10-17T08:57:56.194Z","level":"info","msg":"display script enabled","byClientId":"35349b3a-7d46-4d42-a760-7ae4bbbbcf5d","byKind":"desktop"}
{"ts":"2026-10-17T08:57:58.545Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T08:57:58.545Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T08:57:58.546Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-tZuKE5/commands.json","count":0}
{"ts":"2026-10-17T08:57:58.927Z","level":"info","msg":"agent resume skipped","paneId":"cbc09d17-de52-46cf-8368-8a35eaf133cc","reason":"no-session-ref"}
{"ts":"2026-10-17T08:57:59.003Z","level":"info","msg":"extension started","extension":"user:vscode-desktop","run":"4cc0abfb-6b7f-4568-936c-ad7162bfab94","state":"running"}
{"ts":"2026-10-17T08:58:00.176Z","level":"info","msg":"display set","paneId":"76e7b950-2e7f-4192-8c9e-2a7602879e81","name":"vscode-desktop","kind":"panel","format":"script-html","bytes":362,"rev":1}
{"ts":"2026-10-17T08:58:32.387Z","level":"info","msg":"display closed","paneId":"76e7b950-2e7f-4192-8c9e-2a7602879e81","name":"vscode-desktop","reason":"closed"}
{"ts":"2026-10-17T08:58:32.844Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T08:58:32.845Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T08:58:32.848Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-tZuKE5/commands.json","count":0}
{"ts":"2026-10-17T08:58:33.392Z","level":"info","msg":"agent resume skipped","paneId":"cbc09d17-de52-46cf-8368-8a35eaf133cc","reason":"no-session-ref"}
{"ts":"2026-10-17T08:58:33.874Z","level":"info","msg":"agent resume skipped","paneId":"31affd57-c882-4e22-a510-70c1c06f7226","reason":"no-session-ref"}
{"ts":"2026-10-17T08:58:34.958Z","level":"info","msg":"extension started","extension":"user:vscode-desktop","run":"4a4c0152-3459-458c-9d73-1f3b10b8183c","state":"running"}
{"ts":"2026-10-17T08:58:35.445Z","level":"info","msg":"display set","paneId":"76e7b950-2e7f-4192-8c9e-2a7602879e81","name":"vscode-desktop","kind":"panel","format":"script-html","bytes":362,"rev":1}
{"ts":"2026-10-17T08:59:03.525Z","level":"info","msg":"display closed","paneId":"76e7b950-2e7f-4192-8c9e-2a7602879e81","name":"vscode-desktop","reason":"closed"}
  ✘  1 src/specs/vscode-cdp-resident.spec.ts:12:1 › registered Windows bridge stays resident across stop, reload and server restart (1.2m)


  1) src/specs/vscode-cdp-resident.spec.ts:12:1 › registered Windows bridge stays resident across stop, reload and server restart

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      140 |     await expect(view.getByRole("status")).toHaveText("共有元が接続されていません");
      141 |     await view.evaluate(async el => { await Reflect.get(el, "finishFullscreenTest")(); });
    > 142 |     await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
          |                                                                                       ^
      143 |     await view.evaluate(el => {
      144 |       Reflect.deleteProperty(el, "requestFullscreen"); Reflect.deleteProperty(el, "finishFullscreenTest");
      145 |     });
        at /workspaces/sodashitsu-vscode-cdp/packages/e2e/src/specs/vscode-cdp-resident.spec.ts:142:87

    Error Context: ../../../../tmp/vscode-cdp-fullscreen-disconnect-negative-results/vscode-cdp-resident-regist-5f381-p-reload-and-server-restart/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    ../../../../tmp/vscode-cdp-fullscreen-disconnect-negative-results/vscode-cdp-resident-regist-5f381-p-reload-and-server-restart/trace.zip
    Usage:

        pnpm exec playwright show-trace ../../../../tmp/vscode-cdp-fullscreen-disconnect-negative-results/vscode-cdp-resident-regist-5f381-p-reload-and-server-restart/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/vscode-cdp-resident.spec.ts:12:1 › registered Windows bridge stays resident across stop, reload and server restart
undefined
/workspaces/sodashitsu-vscode-cdp/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test vscode-cdp-resident.spec.ts --output /tmp/vscode-cdp-fullscreen-disconnect-negative-results

```

### 全画面解除後のEsc repeat/keyup漏れ

fullscreenKeyをfullscreen=trueのときだけ消費する実装へ戻す。real CDP E2Eのremote Escape不達検査で失敗。

```text

Running 1 test using 1 worker

(node:675923) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-17T09:00:20.524Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T09:00:20.525Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T09:00:20.526Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-6lToXo/commands.json","count":0}
{"ts":"2026-10-17T09:00:21.293Z","level":"info","msg":"display script enabled","byClientId":"cf51902e-aff9-49ed-96e8-3e411df0e299","byKind":"desktop"}
{"ts":"2026-10-17T09:00:22.515Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T09:00:22.515Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T09:00:22.516Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-6lToXo/commands.json","count":0}
{"ts":"2026-10-17T09:00:22.850Z","level":"info","msg":"agent resume skipped","paneId":"0d674613-96df-46fc-b93c-fdb622c246b7","reason":"no-session-ref"}
{"ts":"2026-10-17T09:00:22.908Z","level":"info","msg":"extension started","extension":"user:vscode-desktop","run":"05feac1e-c863-4d04-bb25-1baed7779cfa","state":"running"}
{"ts":"2026-10-17T09:00:23.387Z","level":"info","msg":"display set","paneId":"67eb9813-308f-47d5-a42f-2b4ae0858750","name":"vscode-desktop","kind":"panel","format":"script-html","bytes":362,"rev":1}
{"ts":"2026-10-17T09:00:36.754Z","level":"info","msg":"display closed","paneId":"67eb9813-308f-47d5-a42f-2b4ae0858750","name":"vscode-desktop","reason":"closed"}
  ✘  1 src/specs/vscode-cdp.spec.ts:31:1 › real CDP pixels and input through the app view, explicit permissions and stop (18.2s)


  1) src/specs/vscode-cdp.spec.ts:31:1 › real CDP pixels and input through the app view, explicit permissions and stop

    Error: expect(locator).not.toHaveAttribute(expected) failed

    Locator:  locator('body')
    Expected: not "yes"
    Received: "yes"
    Timeout:  5000ms

    Call log:
      - Expect "not toHaveAttribute" locator('body') with timeout 5000ms
      - waiting for locator('body')
        14 × locator resolved to <body data-releases="8" data-doubleclick="yes" data-remote-escape="yes">…</body>
           - unexpected value "yes"


      306 |       (el as HTMLInputElement).selectionStart,
      307 |     )).toBe("existing日本語ARF".length);
    > 308 |     await expect(source.locator("body")).not.toHaveAttribute("data-remote-escape", "yes");
          |                                              ^
      309 |     expect(escapedInputs).toHaveLength(0);
      310 |     await fullscreenNetwork.detach();
      311 |     await expect.poll(sourceSize).toEqual(embeddedSize);
        at /workspaces/sodashitsu-vscode-cdp/packages/e2e/src/specs/vscode-cdp.spec.ts:308:46

    Error Context: ../../../../tmp/vscode-cdp-fullscreen-escape-negative-results/vscode-cdp-real-CDP-pixels-121cc-plicit-permissions-and-stop/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    ../../../../tmp/vscode-cdp-fullscreen-escape-negative-results/vscode-cdp-real-CDP-pixels-121cc-plicit-permissions-and-stop/trace.zip
    Usage:

        pnpm exec playwright show-trace ../../../../tmp/vscode-cdp-fullscreen-escape-negative-results/vscode-cdp-real-CDP-pixels-121cc-plicit-permissions-and-stop/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/vscode-cdp.spec.ts:31:1 › real CDP pixels and input through the app view, explicit permissions and stop
undefined
/workspaces/sodashitsu-vscode-cdp/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test vscode-cdp.spec.ts -g real CDP pixels --output /tmp/vscode-cdp-fullscreen-escape-negative-results

```

## 復元後の最終結果

最新のUA keyup guardを含むweb再build/E2E typecheck PASS。実CDP E2E **3件PASS、28.2s**（/tmp/vscode-cdp-fullscreen-final-e2e.log、artifacts /tmp/vscode-cdp-fullscreen-final-results）。

```text
  ✓  1 src/specs/vscode-cdp-resident.spec.ts:12:1 › registered Windows bridge stays resident across stop, reload and server restart (10.0s)
  ✓  2 src/specs/vscode-cdp.spec.ts:31:1 › real CDP pixels and input through the app view, explicit permissions and stop (12.4s)
  ✓  3 src/specs/vscode-cdp.spec.ts:421:1 › packaged app on mobile keeps its pairing capability outside the plugin iframe (3.2s)
  3 passed (28.2s)
```

稼働中17883の /assets/index-C_Pp_Bma.js をHTTP取得し、全画面ラベルを含む最新distとbytes一致。検証用Soda・Windows VSCode・bridgeを再起動せず反映済み。実利用はブラウザreload後に接続し［全画面］。独立再レビューはfullscreen-review.md。
