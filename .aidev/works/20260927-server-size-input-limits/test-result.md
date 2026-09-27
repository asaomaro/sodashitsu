# テスト結果: サーバ側の大きさと入力の上限

## ラウンド 2（review ラウンド 1 の差し戻しの後）

- 差し戻しの中身: 入力の待ちを「バイト数＋件数×256」で数え、量を O(1) で出す（decisions D9・D10・tasks T11）。
- `pnpm -s build`（exit 0）・`pnpm -s typecheck`（exit 0）・`pnpm -s test` — **5023 passed / 0 failed / 0 skipped**（270 files。`scratchpad/full-test-4.log`・exit=0）。
- 負の確認: 変異を **51 通り**に広げて（件数の手間・O(1) の数え方・詰め直し・Windows の件数・UTF-8 の長さ・後回しの待ちの増減を足した M41〜M51、式が変わった M15〜M26 を当て直した）1 つずつ走らせ、**51/51 検出**。
  戻したファイルは毎回 cmp で一致、走らせた前後の `git status --porcelain` も一致（`scratchpad/mutate/run3.out`）。このラウンドの test 工程では失敗が発生していない。
- `aidev smoke` — pass（8 本。`scratchpad/smoke2.log`。1 回目と同じ内容なので下の起動確認の節の出力を代表として残す）。

以下はラウンド 1 の記録（残す）。


## 実行したもの
- `pnpm -s build`（exit 0）・`pnpm -s typecheck`（exit 0。出力と終了コードを別に残した: `scratchpad/build.log`・`scratchpad/tc.log`）
- `pnpm -s test`（最終）— 5017 passed / 0 failed / 0 skipped（270 files。`scratchpad/full-test-2.log`・exit=0）。
  coding 途中の 1 回目は 5015 passed（その後 AdoptedPtyProcess と sessionStream のテストを 2 本足した）。load-flaky の再実行は無し。
- `aidev smoke` — pass（8 本。下）
- 負の確認（変異）— 40 通りを 1 つずつ当て、関係するテストだけを 1 回ずつ走らせた（並列にしない・`scratchpad/mutate/run.py`・生ログ `scratchpad/mutate/logs/M*.log`）。
  戻したファイルは毎回 cmp で元と一致を確認し、終わった後の `git status --porcelain` も走らせる前と一致。
- E2E・負荷試験はしていない（利用者の指示）。実物の PTY に書くテストは、読まない子に 1 回だけ書いて kill する（後に `sleep 30` の子が残っていないことを pgrep で確認）。

## 受け入れ基準ごとの判定
- AC1: pass — `terminalLimits.test.ts`（3 方式×4097・100000・0・負・非整数）と `surface/methods/attach.test.ts`（ControlSurface 経由で invalid_params・所有者にならない・pane の大きさと size_changed が変わらない）。
- AC2: pass — 1000×1000 は通り 1000×1001・4096×4096 は断る（protocol とサーバの両方）。
- AC3: pass — visible 4096 件は通り 4097 件は断る。1 件でも上限の外なら要求ごと断る。
- AC4: pass — 定数は `packages/protocol/src/terminalLimits.ts` の 1 か所。web の `measure`・cli の attach が `clampTerminalSize` を使い、丸めのテストがある（`measure.test.ts`・`attach.test.ts`）。
- AC5: pass — 実物の node-pty（raw の読まない子に 2 MiB を 1 回）で pendingWriteBytes が 2 MiB−256 KiB 超・2 MiB 以下、読む子は 0 に戻る。実物の `/ws` で 16 MiB 書いた後の入力は捨てられる（`WsGateway.integration.test.ts`）。`TerminalHost` の境界のテスト。
- AC6: pass — 知らせ `{code:"input_queue_full",paneId}` が 1 回、1999ms の内は出ず 2000ms で再び出る、接続は閉じない、ログは窓の上限 20 行（統合テスト）。
- AC7: pass — 16 通の 1 MiB の INPUT は知らせ無しで書かれる。ちょうど上限は通す（`TerminalHost.test.ts`）。既存の全テストが通る。
- AC8: pass — `sessionStream.test.ts`（制御中の pane・paneId 無しは stderr、別の pane・別の code は出さない、stdout 不変、stderr の上限で捨てる、attach 前でもすぐ出す）。
- AC9: pass — `clientError.test.ts`。
- AC10: pass — `runModal` が何も書かずに `input_queue_full` の RpcError・ちょうど上限は書く・後の入力は続く（`TerminalHost.test.ts`）。呼び出し側は RpcError をそのまま返す（agent.ts・AgentStarter.ts。taskcheck T4 で確認）。
- AC11: pass（記録）— research F15〜F18・F22、decisions D5・D8。backlog の `[ ]` 行は deliver で足す（decisions D7）。
- AC12: pass — decisions D2〜D4、docs（`docs/wtmctl.md`「サーバ側の上限」・`docs/verification.md`・`docs/machines.md`）。
- AC13: pass — 上記。負の確認は 40/40 検出（下）。
- AC14: pass — 待ちが上限を超えた偽の PTY でもミラーの DA の応答は書く。pendingWriteBytes の無い PTY では捨てない（`TerminalHost.test.ts`）。
- AC15: pass — 中継の先は同じ `WsGateway`/`ControlSurface`（research F14・`composeServer.ts:306`・`:311-312`）。smoke の machineSmoke で中継越しの hello・echo が通る。attach の丸めのテスト。

## 負の確認（変異 40 通り）
- M1〜M14（protocol の定数・比較・refine・件数・丸め）、M15〜M23（TerminalHost の比較・待ちの数え方・終了後・モード付き入力・定数・UTF-8）、M24〜M27（PTY の待ちの数え方）、
  M28〜M33（WsGateway の間隔・知らせ・不正なフレームに数えない・paneId・ログの間引き・writeInput を使う）、M34（web の丸め）、M35〜M40（cli の知らせの条件・stderr の上限・attach の丸め・1000 の関係）。
- 1 回目: 37 検出・3 生存（M15・M26・M27）。
  - M15（`>` → `>=`）の生存は**ハーネスの誤り**: `-t "読まない pane"` がほかのファイルにも効き、TerminalHost のテストが絞り込まれて走らなかった（M15.log の 1 回目は `1 passed | 42 skipped`）。
    `-t` を外して再実行すると検出（`3 failed | 40 passed`。下）。同じ組み合わせの M18・M22・M25 も再実行して検出。
  - M26（AdoptedPtyProcess の待ちで offset を無視）・M27（閉じた後に 0 を返さない）の生存は**テストの穴**。「offset の分は数えない（厳密に size 未満）」と
    「slave が閉じた後は 0」のテストを足し、再実行で検出。
- 2 回目（M15・M18・M22・M25・M26・M27）: 全て検出。合計 40/40 検出。

## 失敗の証跡

M15 の再実行（変異を当てた状態。検出の証拠）:

```
$ npx vitest run packages/server/src/terminal/TerminalHost.test.ts packages/server/src/ws/WsGateway.integration.test.ts   # M15: > → >=
 ❯ |@wtm/server| src/terminal/TerminalHost.test.ts (25 tests | 3 failed) 148ms
 FAIL  |@wtm/server| src/terminal/TerminalHost.test.ts > DefaultTerminalHost の入力の上限（20260927-server-size-input-limits） > 待ち＋長さがちょうど上限なら書き、1 バイトでも超えれば何も書かずに false（AC5・AC7）
AssertionError: expected false to be true // Object.is equality
      Tests  3 failed | 40 passed (43)
```

coding 中の T3 の点検で見つかった統合テストの取りこぼし（点検者の 1 回の実行。修正前）は `review.md` のタスク点検ログに記録。test 工程のテスト実行では失敗が発生していない（上の 1 回目・2 回目の変異の結果を除く）。

## 起動確認（smoke）

```
smoke(cli): wtmctl workspace/pane report-metadata ok (normalized, in snapshot, cleared, bad source refused)
smoke(cli): wtmctl agent list ok (no agents)
smoke(cli): wtmctl agent rename ok (named, resolved by name, cleared)
smoke(cli): wtmctl agent start ok (usage error for an unknown kind, agent_pane_busy on a pane with an agent)
smoke(cli): wtmctl agent send-keys ok (the RPC accepted the keys)
smoke(cli): wtmctl agent prompt ok (submitted; the shell printed the marker)
smoke(cli): wtmctl pane attach refuses a non-terminal (not_a_tty)
smoke(cli): wtmctl pane attach ok (in a real PTY: size 100x30, echo round trip, resize 90x25, Ctrl+B q exit 0, left the alternate screen)
smoke(cli): wtmctl pane observe/control ok (pipes: full first frame, control size 100x30, NDJSON input round trip, invalid line warned, release exit 0, observe pane_closed exit 0)
smoke(cli): PASS
$ d=$(mktemp -d) && mkdir -p "$d/sessions/smoke" && node packages/server/dist/main.js token reset --session smoke --state-dir "$d" && test -f "$d/sessions/smoke/auth.json" && node packages/server/dist/main.js session list --state-dir "$d" | grep -q '^smoke ' && node packages/server/dist/main.js session delete smoke --state-dir "$d" && test ! -e "$d/sessions/smoke"; rc=$?; rm -rf "$d"; exit $rc
wtm: new token: <一時ディレクトリの token・伏せた>
wtm: deleted session smoke (/tmp/tmp.CoV8PxU8CJ/sessions/smoke)
$ WTMCTL_URL=http://127.0.0.1:9 node packages/cli/dist/main.js skill | cmp - packages/cli/skills/wtmctl/SKILL.md
$ d=$(mktemp -d) && mkdir -p "$d/sessions/smoke" && WTM_SESSION=smoke node packages/server/dist/main.js token reset --state-dir "$d" && test -f "$d/sessions/smoke/auth.json" && test ! -e "$d/auth.json" && { WTM_SESSION=a/b node packages/server/dist/main.js token reset --state-dir "$d" 2>/dev/null; test $? -eq 2; } && test ! -e "$d/auth.json"; rc=$?; rm -rf "$d"; exit $rc
wtm: new token: <一時ディレクトリの token・伏せた>
$ node packages/server/dist/handoffSmoke.js
handoff-smoke: not running → exit 3, nothing created ok
handoff-smoke: before: server pid 541133, pane p1, shell pid 541158
handoff-smoke: wtm handoff → exit 0: wtm: handoff complete: 1 pane(s) kept running
handoff-smoke: same server pid, /ws closed with 1012, handoff.json removed ok
handoff-smoke: same pane, same shell pid, previous screen visible, input/output ok
handoff-smoke: resize reaches the adopted pty ok
handoff-smoke: pane closes when the adopted shell exits ok
handoff-smoke: ok
$ node packages/server/dist/stopSmoke.js
stop-smoke: not running → exit 3, nothing created ok
stop-smoke: started: pid 541333, pane p2, marker shown
stop-smoke: stopped: CLI exit 0, server exit 0, list shows stopped, lock released, state saved ok
stop-smoke: stopped → exit 3 ok
stop-smoke: restarted: same pane, previous screen restored ok
stop-smoke: ok
$ node packages/server/dist/machineSmoke.js
machine-smoke: remote wtm serve started (pid 541440)
machine-smoke: wtm machine add (probed over the fake ssh) and list ok
machine-smoke: local wtm serve connected to the remote machine (machine.list: online)
machine-smoke: relay ok: hello (hostname OSK2-024680-2), workspace.create and echo reached the remote wtm serve
machine-smoke: ok
smoke: pass (exit 0, 8 本)
smoke=0
```

- 新しい入口（サブコマンド・オプション）は足していないので `smokeCommands` は増やさない。変えたのは既存の `/ws` のスキーマと INPUT の扱いで、smoke の既存の 8 本
  （ログイン → workspace → echo の往復・wtmctl・中継越しの echo 等）が上限の内側の普段の入力と大きさで通ることを確かめている。

## 未検証の穴（skip / 環境不足）
- Windows（ConPTY）の `pendingWriteBytes`（`_agent.inSocket.writableLength`）は実機で確かめていない（Linux だけ）。ready の前の `_deferreds` は数えない。
- macOS の node-pty で内部の形が同じかは確かめていない（同じ `unixTerminal.js` を使う前提。統合テストは Linux で実行）。
- 実物のブラウザで固まった pane に打ったときの toast は E2E で見ていない（文言の単体テストと、サーバが送る知らせの統合テストだけ）。
- 上限を超える流し込みの長時間の振る舞い（メモリの推移）は測っていない（負荷試験をしない指示）。16 MiB で止まることは単体・統合テストの判定で確かめた。
- Windows の件数（`_writableState.buffered`・`writing`）は実機で確かめていない。writev の束は 1 件と数える（decisions D10 の追記。最悪で件数の約 2 倍まで。バイト数の上限は別に効く）。
- node-pty の `EAGAIN` の busy loop（読まない raw の pane に待ちがあると CPU を使い続ける。research F9）は変えていない（decisions D5・後続）。
