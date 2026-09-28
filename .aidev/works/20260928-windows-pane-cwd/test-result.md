# テスト結果: Windows で pane の場所（cwd）が `cd` に追従する

## 実行したもの
- `pnpm build` — exit 0 / `pnpm typecheck` — exit 0
- `pnpm test` — 327 files / 5855 passed / 2 failed（下の証跡。どちらもこの work で触っていないファイルの試験で、マシンの負荷〔load average 24〕の下での時間切れ・時刻の依存。単独の再実行で通過）
- `npx vitest run packages/web/src/components/KeySettings.test.ts packages/tui/src/image/image.test.ts` — 116 passed・exit 0
- 実装者の検証: build・typecheck・test（327 files / 5857 passed）exit 0

## 受け入れ基準ごとの判定
- AC1: 部分的に pass（単体試験：差し込みの組み立て・OSC 9;9 の受け取り・`Pane.cwd` への流れ）。Windows の実機では未検証。
- AC2: 部分的に pass（復元の pane も `trackCwd`〔SessionService の試験〕）。実機は未検証。
- AC3: pass（「引き継ぐ」は `Pane.cwd` を使う既存の経路）。実機は未検証。
- AC4: 部分的に pass（元の `prompt`・`PROMPT` を包む・前に足す組み立てと `$?` の保持を試験で固定）。oh-my-posh・starship の実機の見た目は未検証。
- AC5: 未検証（制御列が画面に出ないことは実機でしか確かめられない）。
- AC6: pass（設定が切なら引数・環境をそのまま返す試験・設定画面の項目・reload_config の試験）。
- AC7: pass（`Mirror` の OSC 9;9 の試験。引用符・空白・相対パスの拒否・UNC）。
- AC8: pass（win32 以外はそのまま返す試験・既存の試験が通る）。
- AC9: pass（docs の書き換え）。

## 失敗の証跡

```
 FAIL  |@sodashitsu/web| src/components/KeySettings.test.ts > KeySettings — navigate の既定へ戻す（AC5） > ［既定に戻す］は上書きしている操作にだけ出る。押すと既定へ戻り、フォーカスは単一の［追加］へ
Error: Test timed out in 5000ms.
 FAIL  |@sodashitsu/tui| src/image/image.test.ts > 画像とクリップボードの点検の指摘（05 T5） > 出し直しは同期の更新の中へ入れ、全体の描き直しの後は置き直す。狭い幅の navigate の重ねたサイドバーの間は出さない
AssertionError: expected -1 to be greater than 0
 Test Files  2 failed | 325 passed (327)
$ uptime
 load average: 24.14, 24.66, 14.15
$ npx vitest run packages/web/src/components/KeySettings.test.ts packages/tui/src/image/image.test.ts
      Tests  116 passed (116)
```

### 負の確認（点検の指摘の修正。直した行を戻して落ちることの生の出力）

```
# 20260928-windows-pane-cwd の点検の指摘の修正：直した箇所だけを元に戻して新しい試験が落ちることの生の出力（vitest の FAIL・差分の行を抜き出し）
===== fix1: PowerShell の包みの $? を取る・戻す 2 行を外す =====
exit=1
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/pty/shellCwdTracking.test.ts > withShellCwdTracking — PowerShell（design D-3） > スクリプトは既存の prompt を包み、FileSystem の場所だけ OSC 9;9 を引用符付きで [Console]::Write する
AssertionError: expected '$__sodaPrompt = $function:prompt\nfun…' to be '$__sodaPrompt = $function:prompt\nfun…' // Object.is equality
- Expected
+ Received
-   $__sodaOk = $?
-   if (-not $__sodaOk) { Write-Error '' -ErrorAction Ignore }
      Tests  1 failed | 18 passed (19)
===== fix2: 位置引数で見送る判定を元に戻す（位置引数を無視） =====
exit=1
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/pty/shellCwdTracking.test.ts > withShellCwdTracking — PowerShell（design D-3） > 位置引数（pwsh script.ps1 は -File、5.1 は -Command として読む）・知らない引数・どちらとも読める省略があれば差し込まない
AssertionError: powershell.exe script.ps1: expected { shell: 'powershell.exe', …(2) } to be { shell: 'powershell.exe', …(2) } // Object.is equality
- Expected
+ Received
+     "-NoExit",
+     "-EncodedCommand",
+     "JABfAF8AcwBvAGQAYQBQAHIAbwBtAHAAdAAgAD0AIAAkAGYAdQBuAGMAdABpAG8AbgA6AHAAcgBvAG0AcAB0AAoAZgB1AG4AYwB0AGkAbwBuACAAZwBsAG8AYgBhAGwAOgBwAHIAbwBtAHAAdAAgAHsACgAgACAAJABfAF8AcwBvAGQAYQBPAGsAIAA9ACAAJAA/AAoAIAAgACQAbABvAGMAIAA9ACAAJABlAHgAZQBjAHUAdABpAG8AbgBDAG8AbgB0AGUAeAB0AC4AUwBlAHMAcwBpAG8AbgBTAHQAYQB0AGUALgBQAGEAdABoAC4AQwB1AHIAcgBlAG4AdABMAG8AYwBhAHQAaQBvAG4ACgAgACAAaQBmACAAKAAkAGwAbwBjAC4AUAByAG8AdgBpAGQAZQByAC4ATgBhAG0AZQAgAC0AZQBxACAAJwBGAGkAbABlAFMAeQBzAHQAZQBtACcAKQAgAHsACgAgACAAIAAgAFsAQwBvAG4AcwBvAGwAZQBdADoAOgBXAHIAaQB0AGUAKABbAGMAaABhAHIAXQAyADcAIAArACAAJwBdADkAOwA5ADsAIgAnACAAKwAgACQAbABvAGMALgBQAHIAbwB2AGkAZABlAHIAUABhAHQAaAAgACsAIAAnACIAJwAgACsAIABbAGMAaABhAHIAXQAyADcAIAArACAAJwBcACcAKQAKACAAIAB9AAoAIAAgAGkAZgAgACgALQBuAG8AdAAgACQAXwBfAHMAbwBkAGEATwBrACkAIAB7ACAAVwByAGkAdABlAC0ARQByAHIAbwByACAAJwAnACAALQBFAHIAcgBvAHIAQQBjAHQAaQBvAG4AIABJAGcAbgBvAHIAZQAgAH0ACgAgACAAaQBmACAAKAAkAF8AXwBzAG8AZABhAFAAcgBvAG0AcAB0ACkAIAB7ACAAJgAgACQAXwBfAHMAbwBkAGEAUAByAG8AbQBwAHQAIAB9ACAAZQBsAHMAZQAgAHsAIAAiAFAAUwAgACQAKAAkAGwAbwBjACkAJAAoACcAPgAnACAAKgAgACgAJABuAGUAcwB0AGUAZABQAHIAbwBtAHAAdABMAGUAdgBlAGwAIAArACAAMQApACkAIAAiACAAfQAKAH0A",
      Tests  1 failed | 18 passed (19)
===== fix3: 綴りの違う PROMPT を落とす処理を元に戻す =====
exit=1
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/pty/shellCwdTracking.test.ts > withShellCwdTracking — cmd（design D-4） > 綴りの違う PROMPT が複数あれば 1 つにまとめる（PROMPT を優先し、ほかは落とす）
AssertionError: expected { prompt: 'a', PATH: 'C:\bin', …(2) } to deeply equal { PATH: 'C:\bin', …(1) }
- Expected
+ Received
+   "Prompt": "b",
+   "prompt": "a",
      Tests  1 failed | 18 passed (19)
===== fix4: 二重の前置きを防ぐ判定を外す =====
exit=1
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/pty/shellCwdTracking.test.ts > withShellCwdTracking — cmd（design D-4） > 既に知らせが付いた PROMPT（soda の中から起動した等）には二重に足さない
AssertionError: expected { Object (PROMPT) } to deeply equal { PROMPT: '$E]9;9;"$P"$E\$P$G' }
- Expected
+ Received
-   "PROMPT": "$E]9;9;\"$P\"$E\\$P$G",
+   "PROMPT": "$E]9;9;\"$P\"$E\\$E]9;9;\"$P\"$E\\$P$G",
      Tests  1 failed | 18 passed (19)
===== fix5: 引用符を外す前の trim を外す =====
exit=1
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/terminal/Mirror.test.ts > XtermMirror — serialize / bottomLines / OSC capture > OSC 9;9 の中身：前後の空白を落としてから引用符を外す
AssertionError: expected null to be 'C:\a b' // Object.is equality
- Expected:
+ Received:
      Tests  1 failed | 47 passed (48)
===== fix6: 絶対パスの確かめを外す（元の挙動） =====
exit=1
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/terminal/Mirror.test.ts > XtermMirror — serialize / bottomLines / OSC capture > OSC 9;9 の中身：そのサーバの形の絶対パスでなければ場所にしない（相対パス・ゴミ）
AssertionError: win32 9;"src": expected 'src' to be null
- Expected:
+ Received:
 FAIL  src/terminal/Mirror.test.ts > XtermMirror — serialize / bottomLines / OSC capture > 相対パスの OSC 9;9 は、それまでの場所を変えない
AssertionError: expected 'relative/dir' to be '/keep' // Object.is equality
      Tests  2 failed | 46 passed (48)
===== fix7: 9;9 を扱った後に false を返す（元の挙動） =====
exit=1
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/terminal/Mirror.test.ts > XtermMirror — serialize / bottomLines / OSC capture > OSC 9 のハンドラは 9;9 を扱い終えたら true（壊れた中身でも）、通常の通知は false を返す
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
      Tests  1 failed | 47 passed (48)
===== fix8: reload_config の shellCwdTracking の読み直しの行を外す =====
exit=1
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — reloadConfig（設定を読み直す。20260922-appearance-settings-rest。AC13〜AC15） > localStorage（soda.prefs.v1）の今の値を settings・view ストアへ読み直し、トーストを出す（AC13・AC14）
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
- false
+ true
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — reloadConfig（設定を読み直す。20260922-appearance-settings-rest。AC13〜AC15） > 壊れた値は既定へ落ちる（load* の壊れた値の扱いをそのまま引き継ぐ）
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
      Tests  2 failed | 1 passed | 171 skipped (174)
```

## 起動確認（smoke）
`aidev smoke` は deliver の前に打つ（下）。

## 未検証の穴（skip / 環境不足）
- Windows の実機すべて（PowerShell 5.1・7・cmd の実際の振る舞い・`-NoExit -EncodedCommand` がプロファイルの後に走ること・実行ポリシー・`[Console]::Write` と `$E` が画面に出ないこと・`Write-Error -ErrorAction Ignore` で `$?` が False に戻ること・起動の遅れ）。
- `tui/src/image/image.test.ts` の 1 件が高負荷で落ちた（時刻の依存の疑い。この work の範囲外。backlog に積む）。
