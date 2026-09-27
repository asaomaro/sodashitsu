# テスト結果: 名前付き session を CLI から止める（`wtm session stop`）

## 実行したもの

- `pnpm -s build` — exit 0
- `pnpm -s typecheck` — exit 0（出力と終了コードを別に残した。パイプに通していない）
- `pnpm -s test`（ルートの vitest。全パッケージ）— **233 files / 4491 passed / 0 failed / 0 skipped**（1 回だけ実行。再実行なし）
- 負の確認（変異 24 本。下の節）— 1 本ずつ直列に、対象のテストファイルだけを走らせた（M21 だけはビルドして smoke）
- `aidev smoke` — pass（exit 0、7 本。7 本目が今回足した `node packages/server/dist/stopSmoke.js`）
- 負荷試験・E2E は行っていない（ユーザーの指示。共有マシン）

## 受け入れ基準ごとの判定

- AC1: pass — 起動確認 `stopSmoke.js`（ビルドした `wtm` で `serve --session smoke --pane-history` → `wtm session stop smoke` が 0 と `wtm: stopped session smoke`・サーバの終了コード 0・サーバの出力に `wtm: stop requested (wtm session stop), shutting down`・`session list` が stopped・`wtm.lock` が無い・`session.json`/`session-history.json` がある → 同じ引数で起動し直すと 2 つ目の workspace の pane〔p2〕と前回の画面の印が戻る）。停止の手順がシグナルと同じ（token → close → 0）であることは `serveShutdown.test.ts`、実物の `composeServer` で止める指示 → 停止の入口 → close 後にロックが無く session.json があることは `composeServer.stop.integration.test.ts`。
- AC2: pass — `stopCommand.test.ts`「動いていなければ何も送らず・何も作らずに 3」（ディレクトリの中身が変わらない・既定の session にも何も作らない）と smoke の 1 段目（`sessions/smoke` の中が空のまま 3）。
- AC3: pass — `stopCommand.test.ts`（無い名前・規則外の名前・綴り違い・ファイル・シンボリックリンクで 2、テキストは `ConfigError`、`--json` は code）、`cliArgs.test.ts`（名前が無い・語が多い・`--session` で 2）。
- AC4: pass — 経路は `handoff.sock` の `stop` だけ（`HandoffSocket.test.ts`・0600 は既存のテスト）。CLI の依存に signal を送る口が無い（`stopCommand.ts` の `SessionStopDeps`）。pid の不一致は `stopCommand.test.ts`「返事の pid が…違えば止まったと言わない（1）」。新しい TCP の待ち受けは足していない（差分に `listen(` の追加が無い）。
- AC5: pass — `controlRequests.test.ts`（引き継ぎの最中の stop は busy・止まる途中の handoff は busy）、`HandoffController.test.ts`（`isBusy`・`waitIdle`）、`composeServer.stop.integration.test.ts`（止まる途中の handoff が busy・引き継ぎの最中に close() が始まったら終わるまで待つ）、CLI は `refused_busy` の文言（`stopCommand.test.ts`）。
- AC6: pass — `stopCommand.test.ts`（ECONNREFUSED で `unreachable`・Ctrl+C の案内、`bad_request` で `older_server`、`unsupported`、不正な返事）。サーバ側で入口の無いときに unsupported でロックを持ったまま動き続けることは結合テスト。
- AC7: pass — `serveShutdown.test.ts`（止める指示の 2 回目・シグナルの後の止める指示は何もしない）、`controlRequests.test.ts`（alreadyStopping・入口は 1 回）、結合テスト（止まる途中の 2 回目の stop が alreadyStopping・Ctrl+C の途中の stop が alreadyStopping で入口を呼ばない・閉じ終えると socket のファイルも無い）、`stopCommand.test.ts`（alreadyStopping でも待って 0、繋げなかった後の見直しで居なければ 3）。
- AC8: pass — `stopCommand.test.ts`「上限時間の内に…居なくならなければ timeout（1。server.log を案内）」。
- AC9: pass — `stopCommand.test.ts`「持ち主が別のホストなら何も送らずに 1」。
- AC10: pass — `stopCommand.test.ts`（成功の `{"stopped":true,"session":{name,default,stateDir,pid}}`・失敗の `{"error":{code,message}}`）。
- AC11: pass — `stopCommand.test.ts`「Windows は非対応で 2（何も送らない）」（platform を差し替え）。Windows の実機では未検証（下の穴）。
- AC12: pass — `stopCommand.test.ts` の各分岐の code・文言（`unsupported_platform`・`invalid_name`・`no_such_session`・`spelling`・`not_directory`・`not_running`・`other_host`・`unreachable`・`no_reply`・`bad_reply`・`older_server`・`refused_busy`・`refused_unsupported`・`pid_mismatch`・`timeout`）。
- AC13: pass — `sessionCommands.test.ts`（delete・token reset の案内に `wtm session stop <名前>`〔既定でない根なら `--state-dir`〕、別のホストでは出さない、`WTM_SESSION` の名前）、`namedSession.test.ts`（`sessionStopCommandFor` の引用・Windows では出さない）。
- AC14: pass — `main.ts` の `printHelp`・`cliArgs.ts` の `USAGE` に `wtm session stop`。`docs/herdr-parity.md` H33 ⑤・`docs/tls-setup.md`・`docs/verification.md` を更新（T8 の独立点検で実装と照合）。
- AC15: pass — 既存のテストを含む全 4491 件が通過（`HandoffSocket.test`・`handoffCommand.test`・`composeServer*.test`・`sessionCommands.test`・`cliArgs.test` を含む）。既存のテストを変えたのは 3 か所: `HandoffSocket.test.ts`/`handoffCommand.test.ts` の偽のハンドラに `stop` を足した（型が増えたため）、`cliArgs.test.ts` の「`session stop work` は未知のサブコマンド」を「`session attach work`」に替えた（意図した変更）。`handoffSmoke.js` も pass。
- AC16: pass — `aidev smoke` の 7 本目（下の生出力）。

## 失敗の証跡

このラウンドでは受け入れ基準の検証の失敗は発生していない。coding 中に smoke の初回が失敗した（`stopSmoke.ts` が `spawnSync` で CLI を待つ間、同じプロセスの `/ws` クライアントが閉じる握手に答えられず、サーバの `close()` が HTTP の待ち受けを閉じきれなかった。smoke 側の不具合で、CLI の子を非同期で待つよう直した）:

```
$ timeout 120 node packages/server/dist/stopSmoke.js
stop-smoke: not running → exit 3, nothing created ok
stop-smoke: started: pid 1222386, pane p1, marker shown
stop-smoke: FAILED Error: wtm session stop failed (exit 1):  wtm: the server of session smoke (pid 1222386) accepted the stop request but has not exited within 30s; check server.log in /tmp/wtm-stop-smoke-63CI86/sessions/smoke
```

### 負の確認（規約 regression-negative-control。変異の網羅）

主要な判断を 1 行・1 記号ずつ壊し、対応するテストだけを走らせ、落ちることを確かめてから `cp` で戻し `cmp` で一致を確かめた（`scratchpad/nc/sweep.py`。生のログは作業場所の `scratchpad/nc/M*.log`）。**24 本すべて落ち、すべて元に戻した**:

| id | 壊したもの | 落ちたテスト |
|---|---|---|
| M1 | stop で `closing = true` を立てない | controlRequests「2 回目は alreadyStopping」ほか 2 |
| M2 | 止まる途中の handoff を断らない | controlRequests「止まる途中は busy で断る」ほか 2 |
| M3 | 引き継ぎの最中の stop を断らない | controlRequests「引き継ぎの最中は busy」 |
| M4 | `isBusy` が常に false | HandoffController「実行中にもう 1 つ来たら busy」 |
| M5 | 返事の失敗で入口を呼ばない | controlRequests「返事を書けなかったときも止める」 |
| M6 | `stopRequest` の冪等の判定を外す | serveShutdown「止める指示の 2 回目…何もしない」 |
| M7 | `close()` の `beginClosing` を外す | 結合「Ctrl+C の経路の途中…alreadyStopping」ほか 2 |
| M7d | `await control.beginClosing()` を `void` に | 結合「引き継ぎの最中に close()…待つ（D9）」 |
| M7b | `beginClosing` が `waitIdle` を待たない | controlRequests「beginClosing…解決しない」 |
| M7c | `waitIdle` が常にすぐ解決 | HandoffController「実行中にもう 1 つ来たら busy」 |
| M8 | `finally` の socket の close を外す | 結合「…閉じ終えるとロックが無く…」 |
| M9 | socket を `close()` の最初でも閉じる（元の位置） | 結合 2 本 |
| M10 | `op === "stop"` の分岐を外す | HandoffSocket「stop は…1 行返す」 |
| M11 | pid の不一致を見ない | stopCommand「返事の pid が…違えば」 |
| M12 | 待つ間に持ち主の pid が替わったのを見ない | stopCommand「別の pid に替わった」 |
| M13 | 繋げなかった後の見直しで pid の替わりを見ない | stopCommand「socket に繋げない…」 |
| M14 | Windows の判定を外す | stopCommand「Windows は非対応で 2」 |
| M15 | 返事の時間切れを見分けない | stopCommand「no_reply」 |
| M16 | 別のホストを見ない | stopCommand「別のホストなら…1」 |
| M17 | `sessionStopCommandFor` の Windows の判定を外す | namedSession「sessionStopCommandFor」 |
| M18 | 根の比較を外す（常に `--state-dir`） | namedSession「sessionStopCommandFor」 |
| M19 | `session stop <name>` を解釈しない | cliArgs「wtm session stop <name> を読む」 |
| M20 | 別のホストでも token reset に案内を出す | sessionCommands「別のホストなら…案内しない」 |
| M21 | `main.ts` の `server.onStopRequest(...)` を外してビルド | smoke `stopSmoke.js`（下） |

生の出力（抜粋。全体は各ログ）:

```
== M7d
 FAIL  src/composeServer.stop.integration.test.ts > composeServer: 止める指示（T2） > 引き継ぎの最中に close()（Ctrl+C）が始まったら、引き継ぎが終わる（元に戻す）
AssertionError: expected undefined to be defined
 ❯ src/composeServer.stop.integration.test.ts:129:44
    129|       expect(server.terminals.get(paneId)).toBeDefined();

== M11
 FAIL  src/stop/stopCommand.test.ts > runSessionStop > 返事の pid が wtm.lock の持ち主と違えば止まったと言わない（1）
AssertionError: expected +0 to be 1 // Object.is equality

== M21（main.ts の配線を外してビルドし直し、smoke を 1 回）
stop-smoke: not running → exit 3, nothing created ok
stop-smoke: started: pid 1264598, pane p2, marker shown
stop-smoke: FAILED Error: wtm session stop failed (exit 1):  wtm: the server refused to stop (this server does not accept stop requests)
```

M21 の後は `main.ts` を戻し（`cmp` 一致）、ビルドし直してから `aidev smoke` を通した。

## 起動確認（smoke）

```
$ aidev smoke
…（1〜6 本目は既存。すべて pass）
$ node packages/server/dist/handoffSmoke.js
handoff-smoke: not running → exit 3, nothing created ok
handoff-smoke: before: server pid 1266451, pane p1, shell pid 1266463
handoff-smoke: wtm handoff → exit 0: wtm: handoff complete: 1 pane(s) kept running
handoff-smoke: same server pid, /ws closed with 1012, handoff.json removed ok
handoff-smoke: same pane, same shell pid, previous screen visible, input/output ok
handoff-smoke: resize reaches the adopted pty ok
handoff-smoke: pane closes when the adopted shell exits ok
handoff-smoke: ok
$ node packages/server/dist/stopSmoke.js
stop-smoke: not running → exit 3, nothing created ok
stop-smoke: started: pid 1266573, pane p2, marker shown
stop-smoke: stopped: CLI exit 0, server exit 0, list shows stopped, lock released, state saved ok
stop-smoke: stopped → exit 3 ok
stop-smoke: restarted: same pane, previous screen restored ok
stop-smoke: ok
smoke: pass (exit 0, 7 本)
```

新しい入口（`wtm session stop`）に対して 7 本目を足した。テストが起動したサーバはすべて終わっている（`pgrep` で残りが無いことを確かめた。別の worktree の古い `wtm serve` が 1 つ動いているが、この work のものではない）。

## ラウンド 2（review ラウンド 1 の差し戻しの後）

- `pnpm -s build`・`pnpm -s typecheck` — exit 0
- `pnpm -s test` — **233 files / 4492 passed / 0 failed / 0 skipped**（1 回だけ。+1 は `wtm handoff` の `stopping` の断りのテスト）
- 追加の負の確認 3 本（M13 を新しい判定に合わせて作り直し・M22 `wtm handoff` の `stopping` の出し分け・M23 止まる途中の断りの reason）— 3 本とも落ち、元に戻した（`cmp` 一致）
- `aidev smoke` — pass（exit 0、7 本。`stopSmoke.js` も pass）
- このラウンドでは失敗が発生していない。

## 未検証の穴（skip / 環境不足）

- **macOS** の実機では確かめていない（同じ Unix socket の仕組み。docs に未検証と記載）。
- **Windows** は非対応（終了コード 2）で、非対応の応答も platform を差し替えた単体テストだけで、Windows の実機では確かめていない。
- 実物の `wtm handoff` の最中に `wtm session stop` を打つ組み合わせは、ビルドした成果物では確かめていない（受け付けの判断は単体・結合テスト。`docs/verification.md` に手動の手順）。
- pane の中から自分の session を止める場面（結果の行が出ないことがある）は手動の確認に残した。
- 負荷時の挙動（止まるまでに 30 秒を超える環境）は確かめていない（負荷試験をしない指示）。
