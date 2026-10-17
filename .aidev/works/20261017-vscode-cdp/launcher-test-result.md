# 接続ボタンからの自動起動・接続 検証

2026-10-17。既存Windows VSCodeを再利用、同Code.exe/同targetを終了・再起動しない。Windowsに追加install/常駐service/自動起動登録なし。固定server argvはテスト用stateだけで有効。

## 確認済み

- Windows helper discoverで既存target 2025A8ADAA4E71E7708E4246270D6DB2 を検出、exit0。新しいCode.exeは起動しなかった。
- 実ブラウザから［VSCodeを起動・接続］、Windows Node helper自動実行、token/CLI入力なし、実画像表示、共有停止、helper終了/所有slot解放後の再接続を2回確認。閲覧のみ、文書/端末への入力・fit操作なし。
- 不透明画素を待ってから測定した最終ログ /tmp/cdp-launcher-windows-ui-final.log と /tmp/cdp-launcher-windows-ui-result.json は1799x1200 opaque=true、manualCommandVisible=0を2回記録。screenshot /tmp/cdp-launcher-windows-ui.png を目視で既存Code文書・メニュー・sidebar表示確認。最初の試行ログは採寸を描画待ちより先にしていたためopaque=falseを記録しており、最終証拠と区別する。
- 確認後も同target ID/titleで既存VSCodeが起動中。node.exe/bridgeの接続だけを生成・停止した。
- 新規VSCode起動分岐はfake childのunitで固定code/profile/port/shell:falseを確認。実機で新規VSCodeを起動する分岐、native Windows上でのSodashitsu server、remote別PCは未検証。WSL→Windows Node経由のみ実機検証済。

## 自動テスト

- root build/typecheck PASS: /tmp/cdp-launcher-root-build.log /tmp/cdp-launcher-root-typecheck.log。後続のbusy/state修正後のroot buildは別途記載。
- unit 72件PASS: /tmp/cdp-launcher-tested.log /tmp/cdp-launcher-ready-units.log。
- 新規E2Eは実Chromium sourceと固定helper command。single候補自動接続、候補選択、候補消失時の拒否、noCLI/token、fit→stopでnative size復帰、再接続をDOM/実canvasで確認。
- 最初のfit復帰試験はPlaywright別sessionの800px overrideをnative baselineと誤認し失敗。clearだけでは未設定handlerのno-opになるため、同sessionでset333→poll333→clear→poll!=333としてnativebaselineを採寸する形へ修正。当該E2E PASS9.1s (/tmp/cdp-launcher-native-baseline-e2e.log)。
- busy追加後、job.closedの汎用statusが接続失敗表示を消す不具合を検出。専用launcherStateメッセージへ分離し、下記negativeで再発検出を確認。

## negative control

修正した部分だけを元に戻し実行。unitはTSソースを直接読むためdist再buildは不要。終了後positive snapshotから復元しcmp一致確認。旧Code/E2E/environmentへ影響させない。

### connect helperのcleanupを5秒で強制終了しない

条件を旧5秒強制killへ戻す。fake時間6秒経過でkill SIGKILLが1回呼ばれ失敗。復元後6unit PASS (/tmp/cdp-launcher-cleanup-restored.log)。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-vscode-cdp

 ❯ |@sodashitsu/server| src/desktop/DesktopCdpLauncher.test.ts (6 tests | 1 failed | 5 skipped) 108ms
   × does not force-kill a connected helper during slow cleanup 104ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopCdpLauncher.test.ts > does not force-kill a connected helper during slow cleanup
AssertionError: expected "kill" to not be called at all, but actually been called 1 times

Received:

  1st kill call:

    Array [
      "SIGKILL",
    ]


Number of calls: 1

 ❯ src/desktop/DesktopCdpLauncher.test.ts:60:22
     58|   try {
     59|     job.cancel();await vi.advanceTimersByTimeAsync(6000);
     60|     expect(kill).not.toHaveBeenCalled();
       |                      ^
     61|   } finally {vi.useRealTimers();kill.mockRestore();}
     62|   await job.closed;expect(launcher.busy).toBe(false);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  18:33:19
   Duration  501ms (tests 49%, transform 37%, import 11%, worker 3%)


```

### 接続失敗をjob.closedの汎用statusで消さない

専用launcherStateを旧broadcastへ戻す。余分なstatusを実WSで検出し、期待8に対して9で失敗。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-vscode-cdp

 ❯ |@sodashitsu/server| src/desktop/DesktopCdpRelay.test.ts (21 tests | 1 failed | 19 skipped) 485ms
   × rejects expired discovered targets and reports a helper exiting before pairing 228ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopCdpRelay.test.ts > rejects expired discovered targets and reports a helper exiting before pairing
AssertionError: expected 9 to be 8 // Object.is equality

- Expected
+ Received

- 8
+ 9

 ❯ src/desktop/DesktopCdpRelay.test.ts:373:58
    371|   await vi.waitFor(()=>expect(v.messages.filter(m=>m.type==="status").…
    372|   // A later global availability update must not replace the viewer's …
    373|   expect(v.messages.filter(m=>m.type==="status").length).toBe(statusBe…
       |                                                          ^
    374|   await vi.waitFor(()=>expect(v.messages.filter(m=>m.type==="launcherS…
    375| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 19 skipped (21)
   Start at  18:39:11
   Duration  1.41s (transform 46%, tests 39%, import 14%)


```

## テスト用Sodaへの反映

17883はstate /tmp/soda-cdp-live-rqEGSD、sameToken/sameTabを保持して更新。固定argvは同state/launch-command.json、環境変数SODA_VSCODE_CDP_COMMANDに読み込んで起動。Windows TEMP/soda-vscode-cdp-bridgeへ4mjsファイルをcopy・bytes一致確認。元main/他worktree/WindowsVSCodeの終了再起動/公開設定/認証設定変更なし。接続URL/login tokenは既存のものを継続。

## 最終結果

- root build PASS /tmp/cdp-launcher-release-build.log
- unit72件PASS /tmp/cdp-launcher-release-units.log
- smoke（cwd /tmp、own dist参照）PASS /tmp/cdp-launcher-smoke.log
- 最終launcher E2E1件PASS11.0s /tmp/cdp-launcher-release-e2e.log。既存CDP3件は直前のまとめでPASS（/tmp/cdp-launcher-ready-e2e.log、同時実行のlauncher failureは上記status修正で解消）。
- 2negative後の正bytes復元をcmp確認。git diff --check PASS。
- 稼働中testSodaの最新webasset HTTP bytes一致を確認。起動設定有効、既存URL/token/tabを保持。Windows再起動/Code再起動なし。

最終root typecheck PASS (/tmp/cdp-launcher-release-typecheck.log)、独立最終レビュー通過。最新test server PID774856、asset index-D2r27n44.js。
