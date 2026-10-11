# 検証結果

## Windowsネイティブ

Windows Node v24.19.0、ConPTY/node-pty、PowerShell 5.1とcmdで、一時state・偽Claudeを使って検証。元の利用者プロジェクト・会話は変更していない。プロセスツリーnative bindingがVS Spectre libraries不足で導入できず、CIM fallbackを実際に使った。

初期一巡はPowerShell/cmdで各5項目PASS。レビュー後の期限更新も、旧Workerが作るmanifestを120秒前へ戻した状態で同じ一巡を検証する。

## 回帰テストのnegative control

修正したraw入力保持だけを以前のUTF8文字列変換に戻してWorkerPtyBackend試験を実行。失敗を確認後、保存したファイルへ戻し、バイト単位で一致を確認。出力:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/pty/WorkerPtyBackend.test.ts (1 test | 1 failed) 116ms
   × IPC中の未送信量を数え、分割したUTF8バイトを保持し、holdの前の出力を渡す 115ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/pty/WorkerPtyBackend.test.ts > IPC中の未送信量を数え、分割したUTF8バイトを保持し、holdの前の出力を渡す
AssertionError: expected [ Array(2) ] to deeply equal [ [ 227 ], [ 129, 130 ] ]

- Expected
+ Received

  [
    [
-     227,
+     "�",
    ],
    [
-     129,
-     130,
+     "�",
+     "�",
    ],
  ]

 ❯ src/pty/WorkerPtyBackend.test.ts:62:46
     60|       });
     61|     });
     62|     expect(writes.map((x) => Array.from(x))).toEqual([[0xe3], [0x81, 0…
       |                                              ^
     63|     expect(done).toMatchObject({ bytes: 0, chunks: 0, held: true, data…
     64|   } finally {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  18:25:23
   Duration  509ms (import 54%, tests 27%, transform 18%, worker 1%)


```

同期disposeをawait直後に再検査する修正だけを戻してTerminalHost.handoffの当該試験を実行。失敗を確認後、保存したファイルへ戻し、バイト単位で一致を確認。出力:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/terminal/TerminalHost.handoff.test.ts (10 tests | 1 failed | 9 skipped) 5011ms
   ❯ DefaultTerminalHost の引き継ぎの口 (8)
     × 待っている間に端末が捨てられたら、holdForHandoff は undefined（閉じた fd を渡さない） 5010ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/terminal/TerminalHost.handoff.test.ts > DefaultTerminalHost の引き継ぎの口 > 待っている間に端末が捨てられたら、holdForHandoff は undefined（閉じた fd を渡さない）
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/terminal/TerminalHost.handoff.test.ts:166:3
    164|   });
    165|
    166|   it("待っている間に端末が捨てられたら、holdForHandoff は undefined（閉じた fd を渡さない）", asyn…
       |   ^
    167|     const pty = new HandoffFakePty();
    168|     const host = new DefaultTerminalHost("p1", pty, 80, 24, 1000);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  18:25:25
   Duration  5.46s (tests 93%, transform 5%, import 2%)


```

## 全体

初回全体: 566 files / 10,450 pass / 1 fail。唯一の失敗はholdReadingの非同期化による同期dispose後のflush待機（上記negative control）。再検査を追加し、関連4files/23tests PASS。Windows関連9files/135tests、追加5files/24testsもPASS。

`pnpm build`、最終 `pnpm typecheck` PASS。/tmpからのブラウザ起動確認 `smoke: PASS`。

修正後の全体再実行: 10,450 PASS、1件の起動試験はbeforeAllのビルド鮮度チェックで停止。negative controlの元ファイル復元がmtimeを更新したため、内容は一致していてもdistより新しくなっていた。`tsc -b packages/server --force`で再生成し、この起動試験のみ再実行し1file/1test PASS。全10,451件について成功を確認（全体の重複実行は避ける）。

## 検証の限界

実機は偽Claudeで、実物のClaude/Codex/Copilotの会話分岐は別途確認が必要。Copilot forkのRPCはmock transportで検証済み。pwsh実機、新worktreeへのWindows実機fork、状態ファイルの復旧自体が不可能なディスク故障は未実測。

## 最終Windows実機出力

PowerShell:

```text
PASS: Windows powershell.exe agent auto-start, arguments and session detection
PASS: Windows fork creates another process with a new conversation
PASS: Windows handoff refreshes expired transfer data and preserves both pane IDs and live agent PIDs
PASS: failed Windows update rolls back without losing live agents
PASS: native Windows stop cleans up supervisor

```

cmd:

```text
PASS: Windows cmd.exe agent auto-start, arguments and session detection
PASS: Windows fork creates another process with a new conversation
PASS: Windows handoff refreshes expired transfer data and preserves both pane IDs and live agent PIDs
PASS: failed Windows update rolls back without losing live agents
PASS: native Windows stop cleans up supervisor

```

最終起動試験の出力:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu


 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  18:30:36
   Duration  4.05s (tests 46%, transform 45%, import 9%)


```
