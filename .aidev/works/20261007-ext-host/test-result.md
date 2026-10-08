# テスト結果

## PR1: サーバと、利用者の設定の拡張（T1〜T14・T27）

実施: 2026-10-08。ブランチ `feature/ext-host`（worktree `agent-ae3980787e9bc58e1`）。`origin/main` は `1ff0418`（取り込み済み・差なし）。Node v24.15.0。Linux（WSL2・カーネル 6.6.87.2）。

### 全体

| コマンド | 結果 |
|---|---|
| `pnpm install --frozen-lockfile` | 通った |
| `pnpm build` | 通った（web のチャンクの大きさの警告は元からある） |
| `pnpm typecheck` | 通った（protocol・client-core・server・cli・web・e2e・scripts） |
| `pnpm test`（vitest 全体） | **458 ファイル中 457 通った・8990 件中 8987 通った・3 件失敗**（下） |
| `node packages/server/dist/handoffSmoke.js` | 通った（拡張の段を含む。出力は下） |
| `node packages/server/dist/stopSmoke.js` | 通った（拡張の段を含む。出力は下） |
| Playwright `display.spec`・`display-flows`・`display-mobile` | **16 件すべて通った**（38 秒。`--workers=2`） |

**失敗した 3 件**: すべて `packages/server/src/tui.integration.test.ts`（既知。worktree のパスが長いと、端末の画面の折り返しで `agent-ae3980787e9bc58e1` のラベルが欠けて落ちる。main でも落ちる、と指示にある）。

```
FAIL |@sodashitsu/server| src/tui.integration.test.ts > runTui（実サーバ・偽の外側の端末） > 端末版 2 つを同時に繋ぐ：どちらも描き・打て、最後に操作した側の大きさになり、もう一方は切り取って ⋯ を出す。セッションはそのまま（AC11・AC12）
AssertionError: expected ' ▾ Spaces     開いた順 + │ 1:1   +\n     …' to contain 'agent-ae3980787e9bc58e1'
```
（ラベルが `agent-ae3980787e9b…` に切り詰められる。ほかの 2 件も同じ形。切り分けの再実行は、既知として省いた。）

### 新しく足したテストの件数（PR1）

| ファイル | 件数 |
|---|---|
| `protocol/src/extension.test.ts` | 10 |
| `protocol/src/messages.test.ts`（追記）・`display.test.ts`（追記） | 3 + 2 |
| `server/src/extensions/extensionConfig.test.ts` | 40 |
| `lineReader.test.ts` | 10 |
| `extensionLaunch.test.ts`・`paneEnv.test.ts`（追記） | 14 + 2 |
| `ExtensionProcess.test.ts`（偽の子と時計）・`ExtensionProcess.real.test.ts`（実際の子と孫） | 31 + 5 |
| `display/DisplayService.test.ts`（追記。新しい `describe`「持ち主（札）」。既存は 1 行も変えていない） | 24 |
| `ExtensionApi.test.ts` | 20 |
| `approval.test.ts`・`ExtensionStateStore.test.ts` | 6 + 9 |
| `ExtensionHost.test.ts` | 34 |
| `extensions.integration.test.ts`（実際の子プロセス） | 14 |
| `cli`: `cliArgs.ext.test.ts`・`commands/ext.test.ts` | 5 + 3 |
| `web`: `displayLabel.test.ts`・`MobileDisplaySheet.test.ts`（追記） | 3 + 1 |

`extensions.integration.test.ts`・`ExtensionHost.test.ts` を、`src/extensions` と `src/display` ごと 3 回続けて流した。初回に 1 回、(13)（4 MiB 超の行）が負荷で落ちたので、「止められる途中の拡張が ext.error の行を読み切る」ことへの依存（決まっていない）を外し、待ちの上限を 8 秒にした。以後 3 回続けて 311 件通った。

### 実測した前提（未確認 u1〜u8）

- **u1（通った）**: 実際の子と孫で、`detached: true` の子へ `process.kill(-pid, "SIGTERM")` を送るとグループごと止まる（`ExtensionProcess.real.test.ts` の (i)〜(iv)。合図を無視する孫・親が先に終わる・掃いている途中の `stop()`・最後の標準エラー）。
- **u2（通常の道では通らない）**: 入れ替えの後、前の拡張と孫の pid が消え、新しい pid で動くことを確認した（起動確認）。「止め損ねた子の標準入力が `execve` の後に閉じる」道は、`pausePollers` が先に止めるので通らない。docs に「未確認」と書いた。
- **u3（組み立てだけ）**: win32 の `extensionArgv`・`killTreeCommand`・`buildExtensionEnv`、偽の `runFile` の記録（`taskkill` の絶対パスと `cwd`）。実機では確かめていない。
- **u4（読んで確認）**: pane の移動（`moveToTab`・`moveToNewTab`）は `pane.updated`・`tab.created`・`workspace.updated`・`layout.updated`・`tab.closed`・`workspace.closed` を bus に出す（`pane.created`・`pane.closed` は出さない）。すべて pane の一覧を作り直すきっかけに入っている。main の「pane の移動の制限」（PR #98）は設計に当てはめていない。範囲の確かめは、要求のたび・出来事を渡す直前・2 秒ごとの見直しのまま。
- **u5**: 済み（`displayLabel`・`displayBandLabel`）。**u6**: PR3。**u7**: 確かめていない（グループごと止めるので動きは同じ）。
- **u8（出典あり）**: POSIX.1-2017 XBD 4.14「Process ID Reuse」の原文（`decisions.md` D10）。`kill(2)` の man で `ESRCH`・`EPERM`・ゾンビの扱いも確認。

### 起動確認の出力（抜粋。ビルドしたものを直接）

```
handoff-smoke: extension running before the handoff: pid 3600933, child 3600940
handoff-smoke: extension replaced across the handoff: 3600933/3600940 gone, new 3601027/3601034 running ok
handoff-smoke: extension and its child gone after the server stopped ok
handoff-smoke: ok
stop-smoke: extension 3601753 and its child 3601760 are gone after the stop ok
stop-smoke: extension restarted with new pids and gone after the second stop ok
stop-smoke: ok
```

### 見本の拡張を、自前のサーバで動かした様子（AC32・AC33）

ビルドした `soda serve --state-dir <一時> --port <空き>` に、`docs/examples/extension-hello.mjs`（見本そのまま）と、操作を受けるボタンのパネルを出す `demo` 拡張を登録して起動した。

```
$ sodactl ext list        → hello: running displays=1 / demo: running displays=1（problems は空）
$ display.list（/ws）     → [{"name":"hello","source":{"type":"extension","id":"hello","scope":"user"}},
                              {"name":"panel","source":{"type":"extension","id":"demo","scope":"user"}}]
$ display.action（画面の役が押す） → {}
  demo 拡張が標準入力で受けた行: {"type":"display.action","paneId":"…","name":"panel","rev":1,"action":"go","data":{"value":"1"},"at":"…","source":"static"}
$ extension.setEnabled user:demo false → {"result":{}}
$ sodactl ext list (after) → user:hello running displays=1 / user:demo disabled displays=0
  display.list → hello だけ（demo の panel は消えた）
$ sodactl ext log demo     → {"status":"ok","key":"user:demo","lines":[],"dropped":0}
$ sodactl ext restart nope → {"error":{"code":"not_found","message":"extension not found: nope"}}  exit=1
サーバを SIGTERM → 終了コード 0、拡張のプロセスは残らない
```
自動の確認: `extensions.integration.test.ts` の「(AC32)」が、見本そのままを起動して帯 `hello` を確かめ、無効にして 0.5 秒以内に終わる（標準入力が閉じて終わる）ことと、面が消えることを見る。**ブラウザでの見え方（PR2 の E2E 以降）は未確認**。

### 負の対照（守りだけを外して、対応するテストが落ちることを確かめ、戻した）

| 守り | 外し方 | 落ちたテスト |
|---|---|---|
| (d) `send` の持ち主の検査 | `entry.owner?.tag !== opts?.owner` を外す | 「表 9」「表 10」（2 件） |
| (d2) 持ち主が替わる置き換えで合計を引く | `detach` の `totalBytes -= …` を外す | 「32 MiB の合計」「大きい札つきの面を…繰り返しても」（2 件） |
| (e) `sweepGroup` の期限の `SIGKILL` | 送る行を外す | 「期限で SIGKILL を 1 回」「SIGKILL の後も見続ける」（2 件） |
| (f1) 終わった起動の面を消す | `finishRun` の `closeOwned` を外す | 「終わったら、その起動の札の面だけが closeOwned される」 |
| (g) `allow` の検査（set） | `if (false)` | 「allow が無い → … 台帳の set・send が呼ばれていない」 |
| (h) 出来事を渡す直前の範囲の確かめ | `if (true)` | 範囲の外の action／closed／受け手の中で台帳を呼ばない（3 件） |
| (i) 範囲の検査（display.list） | 外す | 「範囲の外 → not_found」ほか（2 件） |
| (j) `startOne` の 6 の `stopped`・`epoch` の再確認 | 外す | **落ちなかった**（直前の 5 で見ており、`await` が無いので冗長。`decisions.md` に記録） |

どれも元に戻した（`git status` はきれい）。E2E・起動確認を外した状態でビルドし直す負の対照（T30 の PR1 の分）は、test 工程の分として未実施。

### 実施していないこと・限界

- Windows・macOS の実機。
- `composeServer.close()` の `try` の途中で投げたときの `finally` の順（`machines.stop` に例外を注入する口が無い）。
- ブラウザでの E2E（PR2 の T18）。PR1 の T27 は単体テストまで。

## PR1 レビュー後の直し（should 3・nit 4）

### 1 細切れの出力: 実際の子プロセスでの前後の実測

子 = `node -e 'for(;;)fs.writeSync(fd,"a")'`（改行なし・1 バイトずつ）を `ExtensionProcess` で 4 秒流し、サーバ側（測る側）のプロセスの RSS と CPU を測った（`/tmp` の計測用スクリプト。同じ条件を `ExtensionProcess.real.test.ts` に、上限つきのテストとして足した）。

| 出力 | 直す前 | 直した後 |
|---|---|---|
| 標準出力 | RSS 140 → 540 MiB（4 秒で +400）・CPU 1.02 コア | RSS 79 → 85 MiB・CPU 0.12 コア |
| 標準エラー | RSS 77 → 136 MiB（+59）・CPU 0.48 コア | RSS 76 → 77 MiB・CPU 0.07 コア |

直し: 片に最低 1024 バイト相当の課金（拡張ごと・全体・標準エラーの桶）、行の途中の片は 64 個を超えたら 1 つにまとめる。テストの合否は、2.5 秒間の RSS の増え方が 120 MiB 未満・CPU が 0.6 コア未満（直す前の値はどちらも大きく超える）。正当な拡張（2 MiB の 1 行・5ms おきの短い行 100 本）は、4 秒以内にすべて処理される（テスト済み）。

### 2 読み込みの時間切れ
拒否は止める・時間切れは現状維持（`waiting`）に分けた。テスト 4 件（動いている拡張が止まらない／落ちた拡張は起動し直されず `waiting`、読めれば起動し直される／無効の記録の時間切れでも止まらない／拒否では止まる）。時間切れの分岐を外すと、先頭の 2 件が落ちることを確認した。

### 4・5
標準エラーの書字方向の文字はテスト済み。結合テストの `pid` の待ち・起動確認の後始末（グループごと）を直した。5(c) は `decisions.md` D11（`epoch` の検査を外してもテストは落ちない。仕事が直列で出力が同じため）。

### 結果
`pnpm build`・`pnpm typecheck` 通った。`src/extensions`・`src/display` を 3 回続けて 321 件通った。起動確認 2 本通った。全体 `pnpm test`: 9000 件中 8996 通った・4 件失敗（既知の `tui.integration.test.ts` の 3 件と、`web/src/store/notifications.test.ts` の 1 件〔全体の負荷のときだけ。単独で 3 回流して 32 件通る。この作業と無関係〕）。テストの後に、拡張・孫・`sleep` の残りのプロセスは無かった（`ps`）。

## 残った点
- 深い入れ子の JSON（約 3.8 MiB・190 万段）は、`JSON.parse` に 284 ms かかり、RSS が約 140 MiB 増える（レビューの実測）。1 行 4 MiB の上限と量の桶で守られるので、直していない。
