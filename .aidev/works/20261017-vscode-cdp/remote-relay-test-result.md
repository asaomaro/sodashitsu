# マシン一覧からのリモートVSCode共有 検証

2026-10-17。実装は同worktree内だけ。既存VSCode終了/再起動、追加公開ポート、実remote PC設定の変更なし。

## 検証範囲

- 限定RPC open/send、gateway live auth predicate、virtual/real共通のrelay/ACK/入力/viewport世代、個別connection eventを共用。
- open重複、load待ち中のconnection close、live auth途中失効、64virtual共通上限、別接続へ画像を配らない、許可前入力拒否、closeでhelper cleanupをunit確認。
- socketなし内部呼び出し/pane.sock相当、失効したsocket、任意CDP/command付きGUI要求を拒否するsurface unit。
- 初回root関連95unit PASS、追加Gateway/MachineRelay等を含む最終120unit PASS: /tmp/cdp-remote-final-units.log。
- 2Soda A/Bを実reverse delegationで接続し、実Chromium pageをCDP sourceにするE2E。Windows GDI/実別PCは使わない。画像の不透明画素/色、日本語の元入力欄反映、送受信WebSocket URL/event、DOMを検証根拠とする。
- Bマシンheader→専用dialog→起動接続→画像/日本語入力/普通Esc→fit→fullscreen/Esc→closeでnative viewport復帰→Bのplugin appへ切替→remote画像→localへ切替でunmount→localdialogにremote画像無し→B再open閲覧→machine無効化でdialog/header消失。別browserへ画像0を確認。
- 上記の正試験 PASS22.4s: /tmp/cdp-remote-third-e2e.log。初回はdisable時header自体が消える前提をdisabledと誤認し失敗。次はplugin用のA側script許可未設定で止まったため、A/Bの一時prefsを明示許可して再試験。製品の認証/隔離を緩めた修正ではない。

## negative control

### close後にopenのawait完了でpeerが残らない

post-loadのlive/authorizedガードだけを省略しTS直接unit実行。期待rejectに対してresolveとなり失敗。正Relay snapshotへ復元してcmp一致。初回negativeはduplicatePromiseのexpectが最初の失敗で到達しなくなりunhandledも出たため、両expectを先に登録するようtestを修正。以下negative2はunhandled無し。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-vscode-cdp

 ❯ |@sodashitsu/server| src/desktop/DesktopCdpRelay.test.ts (24 tests | 1 failed | 23 skipped) 44ms
   × RPC viewer reserves once and cannot become orphaned if its connection closes during load 40ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopCdpRelay.test.ts > RPC viewer reserves once and cannot become orphaned if its connection closes during load
AssertionError: promise resolved "undefined" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
undefined

 ❯ src/desktop/DesktopCdpRelay.test.ts:393:38
    391|   const first=f.relay.openRpc(a.connection,()=>true);
    392|   const duplicate=f.relay.openRpc(a.connection,()=>true);
    393|   const firstRejected = expect(first).rejects.toThrow("closed");
       |                                      ^
    394|   const duplicateRejected = expect(duplicate).rejects.toThrow("already…
    395|   a.connection.close();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 23 skipped (24)
   Start at  18:56:45
   Duration  1.22s (transform 70%, import 25%, tests 4%, worker 1%)


```

### remote pluginがlocalへ誤接続しない

DisplayFrameのmachine-idだけlocalへ戻し、webをnegative状態で再buildして実E2Eを実行。B plugin上にlocal用手動ボタンが現れ、期待0/実1で失敗。後続の正stateではBの実画像も確認する。正Vue snapshotへ復元してcmp一致、正buildを再実行。

```text

Running 1 test using 1 worker

(node:838188) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-17T09:58:07.116Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T09:58:07.117Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T09:58:07.120Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-wJoRGp/commands.json","count":0}
{"ts":"2026-10-17T09:58:08.244Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T09:58:08.244Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T09:58:08.245Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-OxRdcq/commands.json","count":0}
{"ts":"2026-10-17T09:58:10.107Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T09:58:10.108Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T09:58:10.109Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-OxRdcq/commands.json","count":0}
{"ts":"2026-10-17T09:58:10.443Z","level":"info","msg":"agent resume skipped","paneId":"b18d253b-188b-4bda-a85e-825b1b9d604d","reason":"no-session-ref"}
{"ts":"2026-10-17T09:58:10.527Z","level":"info","msg":"extension started","extension":"user:vscode-desktop","run":"385d50ef-03ce-489b-b699-24a1d94cda2e","state":"running"}
{"ts":"2026-10-17T09:58:10.764Z","level":"info","msg":"display script enabled","byClientId":"41521fb7-7d11-41f0-a9ed-a30829fa514f","byKind":"desktop"}
{"ts":"2026-10-17T09:58:10.778Z","level":"info","msg":"display script enabled","byClientId":"f1575713-0814-41d4-aba7-de766d932416","byKind":"desktop"}
{"ts":"2026-10-17T09:58:11.223Z","level":"info","msg":"display set","paneId":"29c94e89-ef68-465f-9421-d5279810128e","name":"vscode-desktop","kind":"panel","format":"script-html","bytes":362,"rev":1}
{"ts":"2026-10-17T09:58:26.320Z","level":"info","msg":"display closed","paneId":"29c94e89-ef68-465f-9421-d5279810128e","name":"vscode-desktop","reason":"closed"}
{"ts":"2026-10-17T09:58:26.439Z","level":"info","msg":"machine link closed","machine":"0e39ba7997e9eb39adee64f0bff22b0a","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/vscode-cdp-remote.spec.ts:9:1 › machine header routes only the selected remote VSCode and stops it on close or revocation (21.0s)


  1) src/specs/vscode-cdp-remote.spec.ts:9:1 › machine header routes only the selected remote VSCode and stops it on close or revocation

    Error: expect(locator).toHaveCount(expected) failed

    Locator:  locator('[data-plugin-view] [data-desktop-cdp]').getByRole('button', { name: '共有元を接続', exact: true })
    Expected: 0
    Received: 1
    Timeout:  5000ms

    Call log:
      - Expect "toHaveCount" locator('[data-plugin-view] [data-desktop-cdp]').getByRole('button', { name: '共有元を接続', exact: true }) with timeout 5000ms
      - waiting for locator('[data-plugin-view] [data-desktop-cdp]').getByRole('button', { name: '共有元を接続', exact: true })
        14 × locator resolved to 1 element
           - unexpected value "1"


      127 |     const appView=page.locator("[data-plugin-view] [data-desktop-cdp]");
      128 |     await expect(appView).toContainText("接続先: Remote VSCode B");
    > 129 |     await expect(appView.getByRole("button",{name:"共有元を接続",exact:true})).toHaveCount(0);
          |                                                                          ^
      130 |     await appView.getByRole("button",{name:"VSCodeを起動・接続",exact:true}).click();
      131 |     await expect(appView.getByRole("status")).toHaveText("閲覧中",{timeout:15000});
      132 |     await expect.poll(()=>appView.locator("canvas").evaluate(el=>{
        at /workspaces/sodashitsu-vscode-cdp/packages/e2e/src/specs/vscode-cdp-remote.spec.ts:129:74

    Error Context: ../../../../tmp/cdp-remote-machine-negative-results/vscode-cdp-remote-machine--7767b-s-it-on-close-or-revocation/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    ../../../../tmp/cdp-remote-machine-negative-results/vscode-cdp-remote-machine--7767b-s-it-on-close-or-revocation/trace.zip
    Usage:

        pnpm exec playwright show-trace ../../../../tmp/cdp-remote-machine-negative-results/vscode-cdp-remote-machine--7767b-s-it-on-close-or-revocation/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/vscode-cdp-remote.spec.ts:9:1 › machine header routes only the selected remote VSCode and stops it on close or revocation
undefined
/workspaces/sodashitsu-vscode-cdp/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test vscode-cdp-remote.spec.ts --output /tmp/cdp-remote-machine-negative-results

```

## 残る実機範囲

2Sodaは同一検証環境。実別PCのWindows/実SSH回線/混在version/モバイル/Safariは未検証。SSHとreverseは同じ既存MachineLink channelのルートを使うが、今回新E2Eはreverseだけ。実回線性能/端末遅延への影響は測定していない。

## 最終結果

- root build/typecheck PASS: /tmp/cdp-remote-final-build.log /tmp/cdp-remote-final-typecheck.log
- 対象unit/integration120件PASS（12ファイル）: /tmp/cdp-remote-final-units.log
- 関連E2E **5件PASS（1.8m）**: /tmp/cdp-remote-final-e2e.log、artifacts /tmp/cdp-remote-final-results
- 作業folder外cwd /tmpからown distのsmoke PASS: /tmp/cdp-remote-smoke.log
- git diff --check PASS、2negative後のRelay/Vue cmp復元確認。

## 実Windows画像の中継確認

own testA17883とown testB17884をreverse delegationで接続し、Windows側Node helperはB自身17884の固定originへ接続。Aのマシン一覧で「検証用別Soda（同一PC）」を選び、remote専用dialogから起動済みCodeに閲覧接続し停止する操作を2回確認。コマンド/tokenの表示・入力なし。sourceは既存targetを維持。実Windowsの入力/fitは今回の中継実機試験では行わず、文書/端末/設定を変更しない。

以下は不透明画素待ち後の実測生出力。source画素1799x1200を確認し、/tmp/cdp-remote-windows-ui.png を目視で既存文書/sidebars/menuの表示を確認。新しいWindows Codeを起動する分岐は今回未使用。

```text
{"remoteWindowsReuseAndStop":true,"rounds":[{"round":1,"frame":{"width":1799,"height":1200,"opaque":true},"manualCommandVisible":0},{"round":2,"frame":{"width":1799,"height":1200,"opaque":true},"manualCommandVisible":0}]}

```

2つのSodaは同一PC内であり、別PC/WANの性能・互換性の実測ではない。実機用マシン登録/起動設定はown一時state内だけ。通常main/他worktree/ユーザー実remote machineの状態は変更していない。
