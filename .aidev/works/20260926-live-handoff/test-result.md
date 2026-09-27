# テスト結果: 更新時の引き継ぎ（live handoff）

## 実行したもの

- `pnpm -s build`（終了コード 0）・`pnpm -s typecheck`（終了コード 0。出力と終了コードを別に確かめた）
- `pnpm -s test`（全体。1 回）— **225 files / 4373 passed / 0 failed / 0 skipped**（`Test Files  225 passed (225)`・`Tests  4373 passed (4373)`・終了コード 0）
  - coding の途中の全体の実行（1 回）: 4375 passed（その後、エディタの対応の検査を 5 件の undefined から 1 件の「その 1 件だけ落とす」へまとめ、2 件足した差）
- 本 work で足したテスト（すべて上の全体に含まれる）:
  `handoff/HandoffManifest.test.ts`・`handoff/HandoffController.test.ts`・`handoff/HandoffSocket.test.ts`・`handoff/preflight.test.ts`・`handoff/startup.test.ts`・
  `handoff/handoffCommand.test.ts`・`pty/AdoptedPtyProcess.test.ts`・`pty/socketReading.test.ts`・`terminal/TerminalHost.handoff.test.ts`・
  `session/SessionService.handoff.test.ts`・`log/Logger.flush.test.ts`・`composeServer.handoff.integration.test.ts`（と `session/paneEnv.test.ts` の 1 行）
- `aidev smoke` — pass（6 本。6 本目が本 work で足した `node packages/server/dist/handoffSmoke.js`）
- E2E（Playwright）は**実行していない**（ユーザーの指示。smoke の 1 本目の中のブラウザの一巡は既存の smoke のまま）。負荷をかける繰り返しもしていない。

## 受け入れ基準ごとの判定

- AC1: pass — smoke 6 本目（実物の `wtm serve` → `wtm handoff` → 終了コード 0・`handoff complete: 1 pane(s) kept running`・サーバの pid が同じ・pane の id と
  シェルの pid が同じ）。手元でも 2 回続けて引き継ぎ（引き継いだ pane をもう一度引き継ぐ）、`ps --ppid` でシェルが同じ pid のまま。フォーカス・レイアウトは
  `SessionService.handoff.test.ts`（`session.json` から戻る）。
- AC2: pass — smoke（入れ替えの後の入力 → 同じシェルの出力、`pane.attach` の 101x29 が `stty size` に `29 101`）、`AdoptedPtyProcess.test.ts`（実物の PTY の組で
  入出力・resize・多バイト文字・70KB の書き込み）。
- AC3: pass — smoke（入れ替えの前の印 `HANDOFF-42-BEFORE` が、入れ替えの後の SNAPSHOT に出る）、`TerminalHost.handoff.test.ts`（読み取り済みの分もミラーに入れてから画面を取る）、
  `composeServer.handoff.integration.test.ts`（渡された画面が新しいミラーに出る）。
- AC4: pass — `HandoffController.test.ts`（preflight の失敗・投げる・pane を渡せない・保存の失敗・execve の失敗で何も変えずに／元に戻して断る）、`preflight.test.ts`
  （古い版の unknown command・形式の版の違い・答えが無い・fd が残らない）、`handoffCommand.test.ts`（理由を表示して 1）。実物の「古い版・壊れた版」の入れ替えは未実施（下の穴）。
- AC5: pass — smoke（入れ替えの後、同じ Cookie で `/ws` に繋がる。古い `/ws` は 1012 で閉じる）。ブラウザの自動の繋ぎ直しは既存の経路（4401 以外で繋ぎ直す）で、実物のブラウザでは未確認。
- AC6: pass — `HandoffSocket.test.ts`（0600・1 行の要求・上限）、`handoffCommand.test.ts`（Windows は ConfigError＝2）、composeServer は Windows で受け口を作らない（コードの読解）。
  新しい TCP の待ち受けは作らない（HTTP は同じポートに待ち受け直すだけ）。
- AC7: pass — smoke（`exit` で pane.closed）、`AdoptedPtyProcess.test.ts`（読み取りの終わり・ゾンビの検出で 1 度だけ onExit、終了コードの取得）、`SessionService.handoff.test.ts`。
- AC8: pass — `HandoffManifest.test.ts`（0600・環境変数とファイルを必ず消す・nonce/pid/期限/PTY の確認）、`composeServer.handoff.integration.test.ts`（壊れた受け渡し・pid の違い・番号の再利用・
  受け渡しに載らない master）、smoke（`handoff.json` が残らない）。
- AC9: pass — `SessionService.handoff.test.ts`（会話の再開を打ち込まない・画面履歴を流さない）。
- AC10: pass — `handoffCommand.test.ts`（`--session`・`WTM_SESSION`・`--state-dir` の状態ディレクトリの `handoff.sock` に送る・無い session は ConfigError）。
- AC11: pass — `docs/tls-setup.md`「更新時の引き継ぎ」・`docs/verification.md`（手動確認・既知の制約）・`docs/herdr-parity.md` H32（T10 の点検で内容とコードを突き合わせた）。
- AC12: pass — smoke（動いていないとき終了コード 3・何も作らない）、`handoffCommand.test.ts`。
- AC13: pass — 全体のテスト 4373 passed・smoke 6 本 pass。
- AC14: pass — `SessionService.handoff.test.ts`（引き継いだエディタの pane を閉じると一時ディレクトリが消え、焦点と拡大表示が戻る・引き継げなかったものは消す）。

## 失敗の証跡

このラウンド（test 工程）では失敗が発生していない。coding の途中の失敗（テストの書き誤り・型の誤り）はその場で直した（review.md「タスク点検ログ」）。

### 負の確認（規約 regression-negative-control・変異の網羅）

主な判定を 1 つずつ壊し（`scratchpad/sweep.py` が 1 変異ごとに書き換え → 該当のテストを 1 回 → 元のファイルへ戻して `cmp` で一致を確認）、テストが落ちることを確かめた。
**ログを残した 29 変異すべてが検知された**（ほかに T2 の点検で `setEncoding`・書き込みの `offset`・終了の待ち〔settle〕の 3 変異も検知を確認。review.md「タスク点検ログ」）（最初の sweep で M23〔pane の環境から nonce を落とす規則〕だけ生き残り、`paneEnv.test.ts` に足して検知するようにした）。
T9（execve の環境に nonce を入れない）は戻した状態でビルドし直して smoke を走らせ、元に戻してビルドし直した後の smoke の pass も確かめた。
T7-rejected-order は T7 の点検の must（確かめに通らなかった fd を復元の後に閉じる）を戻したもので、統合テストが pane の消失で落ちる。生の出力（落ちたテストの行）:

```
$ (M01-nonce-env-not-deleted)
     × 一致すれば taken。環境変数とファイルを消す 60ms
     × 環境変数があってファイルが無ければ broken 11ms
     × 形が合わなければ broken で、ファイルは消す 18ms

$ (M02-nonce-not-compared)
     × nonce が違う なら全 pane を rejected 34ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 31 passed (32)

$ (M03-pid-not-compared)
     × 書いた pid が自分でない なら全 pane を rejected 38ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 31 passed (32)

$ (M04-age-not-checked)
     × 古い なら全 pane を rejected 165ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 31 passed (32)

$ (M05-fd-not-checked)
     × PTY の master でない fd は rejected へ 63ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 31 passed (32)

$ (M06-file-not-removed)
     × 環境変数が無い起動は none。残っていたファイルは消す（AC8） 133ms
     × 一致すれば taken。環境変数とファイルを消す 35ms
     × 形が合わなければ broken で、ファイルは消す 65ms

$ (M07-scrollback-dir-unchecked)
     × 合わないエディタの対応（一時ディレクトリの形でない・..・相対・空・同じ pane の 2 つ目）はその 1 件だけ落とす 21ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 28 passed (29)

$ (M08-orphans-close-any-fd)
     × closeOrphanPtyMasters は /dev/ptmx を指す fd だけを閉じる（閉じる関数は差し替え） 130ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 31 passed (32)

$ (M09-adopted-falls-through)
     × 引き継いだ pane は新しいシェルを起動せず、その PTY を使う。レイアウト・フォーカスは session.json のまま 120ms
     × 引き継いだ pane には会話の再開も画面履歴も流さず、古い画面（安全化済み）を流して大きさでつつく（AC3・AC9） 85ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

$ (M10-screen-not-sanitized)
     × 引き継いだ pane には会話の再開も画面履歴も流さず、古い画面（安全化済み）を流して大きさでつつく（AC3・AC9） 35ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 8 passed (9)

$ (M11-no-exit-wiring)
     × 引き継いだ pane のプロセスが終わると pane を閉じる（AC7） 240ms
     × 引き継いだが既に閉じた pane の一時ディレクトリは消し、登録しない 125ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

$ (M12-editor-root-unchecked)
     × 一時ディレクトリの場所（tmpRoot の直下）でないものは、登録も削除もしない 144ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 8 passed (9)

$ (M13-socket-no-chmod)
     × 状態ディレクトリの handoff.sock を 0600 で待ち受ける 241ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 4 passed (5)

$ (M14-rollback-no-resume)
     × execve が戻ったら元に戻す: 読み取り・poller・handoff.json・/ws（nonce は handoff.json と同じ値で渡す） 109ms
     × 時間切れの後で止まった端末も戻し、poller も戻す 50ms
     × poller を止められなければ prepare_failed で、戻す（返事は 1 回） 18ms

$ (M15-rollback-no-manifest-removal)
     × execve が戻ったら元に戻す: 読み取り・poller・handoff.json・/ws（nonce は handoff.json と同じ値で渡す） 176ms
     × 返事の後で /ws を閉じる・ログの書き出しが投げても元に戻す（返事は ok の 1 回だけ） 50ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

$ (M16-preflight-ignores-format)
     × 形式の版が違う なら通らない 52ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 15 passed (16)

$ (M17-probe-ignores-dev)
     × 同じ master（dev:ino）なら true でシェルを終わらせ、違えば false 39ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 15 passed (16)

$ (M18-cli-not-running-exit1)
     × サーバが動いていなければ 3（何も送らない。AC12） 28ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 17 passed (18)

$ (M19-held-resumes-on-drain)
     × 止めている間はミラーが追いついても（流量制御の onDrained）resume しない 182ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 9 passed (10)

$ (M20-release-ignores-flowcontrol)
     × 流量制御で止めている間に引き継ぎをやめても resume しない（ミラーが追いついたときに再開する） 16ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 9 passed (10)

$ (M21-hold-returns-disposed)
     × 待っている間に端末が捨てられたら、holdForHandoff は undefined（閉じた fd を渡さない） 37ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 9 passed (10)

$ (M22-unused-not-discarded)
     × 使わなかった pane は fd を閉じて SIGHUP。確かめに通らなかった pane は数えるだけ（呼び出し側が先に手放している） 16ms
     × session.json を読めなかった（adoptedPaneIds が空）なら全部を手放す 4ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

$ (M23-pane-env-keeps-nonce)
     × 受け継いだ wtmctl の設定と古い WTM_* を消し、サーバの値を入れる（利用者の変数は写す） 16ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 7 passed (8)

$ (T7-orphans)
     × 環境変数はあるが受け渡しが無い（壊れた）なら、残った PTY の master を閉じて普通に起動する 981ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 2 passed (3)

$ (T7-rejected-order)
     × 確かめに通らなかった番号を新しいシェルの master が使っていても、閉じない（手放すのは PTY を開く前） 1638ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 3 passed (4)

$ (T9-no-nonce-env)
handoff-smoke: FAILED Error: wtm handoff failed (exit 1): wtm: handing off 1 pane(s) of pid 922871 to the wtm on disk…

$ (X1-no-stray-sweep)
     × 受け渡しに載らなかった PTY の master（読み取りを止めた後にできた pane 等）は、起動の最後に閉じる。使っている master は閉じない 880ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 4 passed (5)

$ (socketReading-readStart)
     × node-pty: 止めている間は出力が届かず、戻すと続きが届く 5058ms
     × AdoptedPtyProcess: 止めている間は出力が届かず、戻すと続きが届く 5025ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

$ (socketReading-readStop)
     × AdoptedPtyProcess: 止めている間は出力が届かず、戻すと続きが届く 325ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 2 passed (3)
```

## 起動確認（smoke）

```
smoke: 20260926-live-handoff
$ pnpm -s build && pnpm -s smoke
smoke: starting server on 127.0.0.1:46349 (state dir /tmp/wtm-smoke-qazuik)
smoke: agent manifests ok (22/22)
smoke: login ok
smoke: websocket connected
smoke: client.hello ok
smoke: workspace.create ok (pane p2)
smoke: pane.subscribe ok
smoke: echo round trip ok
smoke(web): echo round trip ok（ブラウザでの入力が PTY まで届いた）
smoke: PASS
$ pnpm --filter @wtm/cli run smoke
smoke(cli): PASS
$ d=$(mktemp -d) && mkdir -p "$d/sessions/smoke" && node packages/server/dist/main.js token reset --session smoke --state-dir "$d" && test -f "$d/sessions/smoke/auth.json" && node packages/server/dist/main.js session list --state-dir "$d" | grep -q '^smoke ' && node packages/server/dist/main.js session delete smoke --state-dir "$d" && test ! -e "$d/sessions/smoke"; rc=$?; rm -rf "$d"; exit $rc
wtm: new token: Qt4h54hv0VjX2OAuMVMDTTq0tQ2bgHoE
wtm: deleted session smoke (/tmp/tmp.BXyyu22lGz/sessions/smoke)
$ WTMCTL_URL=http://127.0.0.1:9 node packages/cli/dist/main.js skill | cmp - packages/cli/skills/wtmctl/SKILL.md
$ d=$(mktemp -d) && mkdir -p "$d/sessions/smoke" && WTM_SESSION=smoke node packages/server/dist/main.js token reset --state-dir "$d" && test -f "$d/sessions/smoke/auth.json" && test ! -e "$d/auth.json" && { WTM_SESSION=a/b node packages/server/dist/main.js token reset --state-dir "$d" 2>/dev/null; test $? -eq 2; } && test ! -e "$d/auth.json"; rc=$?; rm -rf "$d"; exit $rc
wtm: new token: gHpVBf893xySn6MfGIG8_KBDc-DUcEv-
$ node packages/server/dist/handoffSmoke.js
handoff-smoke: not running → exit 3, nothing created ok
handoff-smoke: before: server pid 1000120, pane p1, shell pid 1000314
handoff-smoke: wtm handoff → exit 0: wtm: handoff complete: 1 pane(s) kept running
handoff-smoke: same server pid, /ws closed with 1012, handoff.json removed ok
handoff-smoke: same pane, same shell pid, previous screen visible, input/output ok
handoff-smoke: resize reaches the adopted pty ok
handoff-smoke: pane closes when the adopted shell exits ok
handoff-smoke: ok
smoke: pass (exit 0, 6 本)
```

## 未検証の穴（skip / 環境不足）

- **macOS は未検証**（実機が無い）。`process.execve` と node-pty の master の close-on-exec の無さは同じ設計で動く想定。PTY の確かめは弱い（master と slave を区別しない）。
- **Windows は非対応**（CLI が断る・受け口を作らない）。Windows 上でのテストは実行していない（`skipIf(win32)`）。
- **実物のブラウザ**での「再接続中…」からの復帰・vim / Claude Code 等の TUI の描き直し（nudge）は未確認（smoke は WebSocket のクライアントで確かめた。手動確認の手順は `docs/verification.md`）。
- **新しい版が実際に違う版**（古い版への入れ替え＝`unknown command`・形式の版の違い）の入れ替えは、実物ではなく preflight の判定の単体テストでだけ確かめた。
- execve の後に新しい版が起動の途中で落ちた場合（戻れない区間）の挙動は、設計どおり「普通の再起動と同じ」とし、実物では確かめていない。
- systemd の下での動作（pid が同じなので影響しない想定）は未確認。
- E2E（Playwright）は実行していない（ユーザーの指示）。
