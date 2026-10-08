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

## PR2: 設定の画面の節「拡張」（T15〜T19）の結果（2026-10-08）

### 実施
- 未コミットだった `settings.spec.ts`・`settings-menu.spec.ts` の直し（節が 6 → 7）は内容が正しく、既存の検査は弱めずに件数と順を直しているだけだったので、そのままコミット（`2089fab`）。
- 続けて、`settings-menu.spec.ts` の直し残しを足した（`c029403`）: メニュー末尾の項目が `nth(5)`（キー）→ `nth(6)`、`End`/`ArrowDown` の行き先、`Alt+PageUp` で「キー」から戻る先が「拡張」（`settings-extensions`）、`<select>` を持つ節の添字の上限。
- `pnpm build`・`pnpm typecheck`: 通った。

### `pnpm test`（全体）
- 459 ファイル中 1 ファイルが失敗、9019 件中 3 件が失敗（9016 件通過）。失敗は `packages/server/src/tui.integration.test.ts` の 3 件（実サーバ・偽の外側の端末）だけ。
- 失敗の出力: `expected ' ▾ Spaces …' to contain 'agent-a2d108671c3567190'`。サイドバー（幅 26）が workspace 名（作業フォルダ名）を `agent-a2d108671c35…` と切るので、テストが探す全文が画面に無い。
- 切り分け: このブランチは `packages/tui`・この試験を触っていない。main（長い名前の別の worktree）でも同じ試験が同じ形で落ちた（5 件中 1 件。どれが落ちるかは打鍵の時機で揺れる）。**作業フォルダ名の長さに依存する試験の前提の問題で、このブランチの退行ではない**。短い名前の場所なら通ると見られるが、短い場所での確認はしていない。

### E2E（`--workers=1`）
対象: `extensions-settings`・`settings-menu`・`settings.spec`・`theme-settings`・`appearance-settings`・`display.spec`・`display-flows`・`display-mobile`。

1 回目: 77 件中 67 件通過・10 件失敗。`settings-menu` の 2 件（上の直し残し）を直して、`settings-menu` は 23 件すべて通過（`c029403` の後）。

残る失敗（このブランチ。`settings-menu` 以外）と main（`origin/main` の別の一時 worktree。`settings.spec`・`theme-settings`・`appearance-settings` の 3 ファイルを 1 回）:

| 試験 | このブランチ | main |
|---|---|---|
| appearance-settings:113 tab バーの現在時刻 | 失敗 | 失敗 |
| appearance-settings:130 pane の枠の太さ | 失敗 | 失敗 |
| settings:167 保存された値が壊れていても既定 | 失敗 | 失敗 |
| settings:187 別のブラウザでは既定のまま | 失敗 | 失敗 |
| theme-settings:193 | 失敗 | 失敗 |
| theme-settings:271 | 失敗 | 失敗 |
| theme-settings:354 | 失敗 | 失敗 |
| theme-settings:528 すべての上書きを既定に戻す | 失敗 | 失敗 |
| theme-settings:385 | 通過 | 失敗 |

main の失敗は 9 件（上の 9 行）で、このブランチの 8 件はすべて main でも落ちる。**このブランチで増えた失敗は無い。** `extensions-settings`・`display*` は、失敗なし。

失敗の出力と、わかった範囲の原因（いつから・なぜは**確定していない**）:
- appearance:113: `.tab-bar-clock` が見つからない（`expect(clock).toBeVisible()` ）。現在の `packages/web/src` に `tab-bar-clock` が無い → 試験が古い（時計の部品が無くなったか名前が変わった）。
- appearance:130: ページのエラー `CompileError: WebAssembly.instantiate(): … violates … Content Security policy … 'unsafe-eval' … "default-src 'self'"`。配信の CSP（`HttpServer.ts:30`）が WebAssembly の組み立てを許さない。製品側の設定か、使っている Chromium の挙動の変化かは未確認。
- settings:167・187: 仕込んだ `soda.prefs.v1`（壊れた JSON）が、ページの読み込み後に `{"statusSymbols":false}` になっている。別のブラウザでも `data-symbols="off"`（期待は `on`）。新しいプロファイルで `statusSymbols` が `false` になる経路がある（誰が書くかは未特定。サーバの `prefs.json` は試験ごとの一時の場所で、利用者の状態ではない）。
- theme-settings:193: `locator('input.settings-path')` が 2 つに当たる（`aria-label="区切り文字"` と `"指定した場所のパス"`）。設定の画面に `settings-path` の入力が増えたのに、試験の探し方が 1 つ前提のまま → **試験の前提が崩れている**。
- theme-settings:271・354・528: 色・上書きの値の比較の失敗（528 は `--soda-accent` の暗い色の入力が `""` のはずが `"#222222"`）。193 と同じく、設定の画面の変更に対する前提のずれと見られるが、個別の確認はしていない。

### スクリーンショット
`/tmp/claude-1000/-workspaces-sodashitsu/957621e5-6a11-4044-ad8d-c86e30053090/scratchpad/ext-host-ui/` に、明るい・暗いの両方（`*-light.png`・`*-dark.png`）: `mixed`（動作中・無効・続けて落ちて止まった・設定で無効・script-html の注意）・`waiting`・`problems`（設定の問題）・`empty`（拡張なし）・`panel-label`（パネルの見出しの出どころ）。前の実装のものが揃っていたので、撮り直していない。

## PR3: プロジェクトの設定と承認（T20〜T26・T28・T29。T30 の負の対照）の結果（2026-10-09）

### 実施
- T20 `projectRoot.ts`・`loadProjectExtensionsFile`、T21 `ApprovalStore`、T22・T22-2・T22-3 `ExtensionHost`（根・あるべき集合・起動の確かめ直し・承認の操作・範囲）、T23 方式 `extension.approve`・`deny`・`revoke`、T24 安全の結合テスト、T25 `approvalView.ts`、T26 承認のダイアログ・知らせ・節「拡張」の承認の操作、T28 E2E、T29 起動確認と文書。コミットは `git log origin/main..HEAD`。
- ★ のタスク（T20・T21・T22・T22-2・T22-3・T23・T26）は `aidev taskcheck start <id> --mode delegated` を記録しただけ（点検は別のエージェントが掛ける）。
- 設計との違い・補ったものは `decisions.md` の D12。設計の穴は見つからなかった（止めなかった）。

### 新しく足したテストの件数
| ファイル | 件 |
|---|---|
| `projectRoot.test.ts`（根。偽の git が呼ばれない） | 8 |
| `projectConfig.test.ts`（設定の読み方。リンク・持ち主・other 書き込み・根より上・FIFO・大きさ） | 14 |
| `ApprovalStore.test.ts`（記録・鍵のファイル・打ち切り・同時書き込み） | 24（it.each を展開） |
| `ExtensionHost.project.test.ts`（きっかけごと・確かめ直し・承認の操作・範囲・記録を読めない） | 37 |
| `extensions.integration.test.ts`（実際の子プロセス。P1〜P9・P1b） | 10 |
| `approvalView.test.ts` | 12 |
| `ExtensionApprovalDialog.test.ts`・`ExtensionSettings.test.ts`（追加分）・`ExtensionController.test.ts`（追加分） | 19・5・4 |
| `extensions-approval.spec.ts`（E2E） | 10 |

### 全体
- `pnpm build`・`pnpm typecheck`: 通過。`pnpm test`: **473 ファイル・9302 件、失敗 0**。
- `packages/server/src/extensions` のテストを **3 回続けて**: 14 ファイル・287 件が 3 回とも全部通過。
- E2E（`env -u DISPLAY -u WAYLAND_DISPLAY … --workers=1`）: `extensions-settings`・`extensions-approval`・`settings-menu`・`display.spec`・`display-flows`・`csp-wasm-images` で **63 件通過・2 件スキップ（元からの `test.skip`。`display.spec` の Chart.js の UMD〔環境変数を渡したときだけ〕）・失敗 0**。
  - 途中、同じ指定で 63 件がすべて落ちた回があった。**環境の事情**（このマシンで `DISPLAY`・`WAYLAND_DISPLAY` が残っていると Chromium が画面のフレームを描かず、`.xterm-helper-textarea` が出ない。監督役の知らせ）で、アプリの不具合ではない。`env -u DISPLAY -u WAYLAND_DISPLAY` を付けて流し直して全部通った。
- 起動確認: `handoffSmoke`（承認していないプロジェクトの拡張が、入れ替えの前後で `pending` のまま・印のファイルが無い段を足した。pane が 2 つになったので期待を `2 pane(s)` に）・`stopSmoke` ともに ok。

### 負の対照（T30。守りだけを外して、対応するテストが落ちることを確かめ、戻した）
外した箇所は `ExtensionHost.ts` の 1 か所ずつ（`git checkout` で戻し、差分が無いことを確認）。単体は `ExtensionHost.project.test.ts`（37 件）、結合は `extensions.integration.test.ts -t "(P"`（9 件）。落ちたときの生の出力（抜粋）:

#### (a1) reconcile の承認の判定だけを外す（プロジェクトの拡張を、記録を見ずに eligible にする）
- 単体: Tests  21 failed | 16 passed (37)
  - プロジェクトの拡張の状態（T22） > denied の記録 → denied で spawn なし。enabled: false で未承認 → disabled（pending ではない）
  - プロジェクトの拡張の状態（T22） > 利用者の拡張と同じ id でも、key が違う（利用者 user:a・プロジェクト project:<根の SHA>:a）
  - プロジェクトの拡張の状態（T22） > 寿命と一覧 > 根を引く処理が返らない workspace があっても、ほかの根の拡張は動き、5 秒後に差を埋める仕事が予約される
  - プロジェクトの拡張の状態（T22） > 承認が無ければ、どのきっかけでも spawn が呼ばれない（AC18） > start・workspace.created・reload・restart・setEnabled(true)・stop→start
  - プロジェクトの拡張の状態（T22） > 承認が無ければ、どのきっかけでも spawn が呼ばれない（AC18） > 上限の空きで枠が空いても、承認が無ければ起動しない
  - プロジェクトの拡張の状態（T22） > 承認の記録の見張りと、読めないとき（止める側に倒す） > 別の ApprovalStore（別の session のつもり）で記録を消す → 見張りの 1 回（approvalsPollMs）で止まる
  - プロジェクトの拡張の状態（T22） > 承認の記録の見張りと、読めないとき（止める側に倒す） > 承認の記録の読み込みが時間切れ → 承認待ちとして扱い、動いていたものも止める
  - プロジェクトの拡張の状態（T22） > 承認の記録の見張りと、読めないとき（止める側に倒す） > 承認の記録を壊す → 全部が pending（動く側に倒れない）。動いていたものも止まる
  - ほか 13 件

- 結合（実際の子プロセス）: Tests  9 failed | 14 skipped (23)
  - (P1) 承認していない拡張は、どのきっかけでも実行されない（workspace 作成・reload・restart・setEnabled・サーバの立て直し）。pending で、承認の画面に出すものがある
  - (P2) 画面の接続から approve → 動く。サーバを立て直しても聞き直されずに動く。同じ sessionRoot の別の名前付き session でも動く。sodactl 相当（external）・pane.sock からは承認できない
  - (P3) 登録の項目を 1 つずつ変えて reload → 止まって pending。同じファイルの別の拡張は同じ pid のまま。承認した中身へ戻すと聞き直されずに動く。リポジトリを別の場所へ写すと pending
  - (P4) 承認 → ファイルを書き換え（reload しない）→ 拡張を落とす → 起動し直されず pending
  - (P5) deny → 印が出来ない。後で approve → 動く。revoke → 止まって pending。別の session のサーバでの revoke が、見張りのうちに届く。記録を直接消してすぐ落としても、起動し直されない。workspace を消した後も記録が残り
  - (P5b) 承認して動かす → 承認の記録のファイルから、その 1 件を直接消し、すぐ拡張を落とす → 起動し直されない（見張りを 60 秒にして、起動の回数で見る）
  - (P6) 2 つのリポジトリ: 片方の拡張が、他方の pane へ display.set → not_found。ext.panes に他方の pane が無い。pane を他方の workspace へ移す操作は、モデルが断る
  - (P7) allow なしの script-html → unsupported。allow を足すと pending に戻り、承認すると、設定が有効なら出せ、無効なら display_script_disabled
  - (P9) .soda がリンク・extensions.json がリンク・cwd つき・chmod o+w → 一覧に理由が出て、印が出来ない。承認の記録を壊す → 全部 pending。無効の記録を壊す → 全部 disabled

#### (a2) startOne の 4（承認の記録の読み直し）だけを外す
- 単体: Tests  1 failed | 36 passed (37)
  - プロジェクトの拡張の状態（T22） > 起動の直前の確かめ直し（startOne の 3・4） > 承認して動かす → 承認の記録から、その 1 件を直接消す（見張りの前）→ 拡張を落とす → 時間を進める → spawn されない

- 結合（実際の子プロセス）: Tests  1 failed | 8 passed | 14 skipped (23)
  - (P5b) 承認して動かす → 承認の記録のファイルから、その 1 件を直接消し、すぐ拡張を落とす → 起動し直されない（見張りを 60 秒にして、起動の回数で見る）

#### (a3) 両方を外す
- 単体: Tests  26 failed | 11 passed (37)
  - プロジェクトの拡張の状態（T22） > denied の記録 → denied で spawn なし。enabled: false で未承認 → disabled（pending ではない）
  - プロジェクトの拡張の状態（T22） > 利用者の拡張と同じ id でも、key が違う（利用者 user:a・プロジェクト project:<根の SHA>:a）
  - プロジェクトの拡張の状態（T22） > 寿命と一覧 > 根を引く処理が返らない workspace があっても、ほかの根の拡張は動き、5 秒後に差を埋める仕事が予約される
  - プロジェクトの拡張の状態（T22） > 承認が無ければ、どのきっかけでも spawn が呼ばれない（AC18） > start・workspace.created・reload・restart・setEnabled(true)・stop→start
  - プロジェクトの拡張の状態（T22） > 承認が無ければ、どのきっかけでも spawn が呼ばれない（AC18） > 上限の空きで枠が空いても、承認が無ければ起動しない
  - プロジェクトの拡張の状態（T22） > 承認の記録の見張りと、読めないとき（止める側に倒す） > 別の ApprovalStore（別の session のつもり）で記録を消す → 見張りの 1 回（approvalsPollMs）で止まる
  - プロジェクトの拡張の状態（T22） > 承認の記録の見張りと、読めないとき（止める側に倒す） > 承認の記録の読み込みが時間切れ → 承認待ちとして扱い、動いていたものも止める
  - プロジェクトの拡張の状態（T22） > 承認の記録の見張りと、読めないとき（止める側に倒す） > 承認の記録を壊す → 全部が pending（動く側に倒れない）。動いていたものも止まる
  - ほか 18 件

- 結合（実際の子プロセス）: Tests  9 failed | 14 skipped (23)
  - (P1) 承認していない拡張は、どのきっかけでも実行されない（workspace 作成・reload・restart・setEnabled・サーバの立て直し）。pending で、承認の画面に出すものがある
  - (P2) 画面の接続から approve → 動く。サーバを立て直しても聞き直されずに動く。同じ sessionRoot の別の名前付き session でも動く。sodactl 相当（external）・pane.sock からは承認できない
  - (P3) 登録の項目を 1 つずつ変えて reload → 止まって pending。同じファイルの別の拡張は同じ pid のまま。承認した中身へ戻すと聞き直されずに動く。リポジトリを別の場所へ写すと pending
  - (P4) 承認 → ファイルを書き換え（reload しない）→ 拡張を落とす → 起動し直されず pending
  - (P5) deny → 印が出来ない。後で approve → 動く。revoke → 止まって pending。別の session のサーバでの revoke が、見張りのうちに届く。記録を直接消してすぐ落としても、起動し直されない。workspace を消した後も記録が残り
  - (P5b) 承認して動かす → 承認の記録のファイルから、その 1 件を直接消し、すぐ拡張を落とす → 起動し直されない（見張りを 60 秒にして、起動の回数で見る）
  - (P6) 2 つのリポジトリ: 片方の拡張が、他方の pane へ display.set → not_found。ext.panes に他方の pane が無い。pane を他方の workspace へ移す操作は、モデルが断る
  - (P7) allow なしの script-html → unsupported。allow を足すと pending に戻り、承認すると、設定が有効なら出せ、無効なら display_script_disabled
  - (P9) .soda がリンク・extensions.json がリンク・cwd つき・chmod o+w → 一覧に理由が出て、印が出来ない。承認の記録を壊す → 全部 pending。無効の記録を壊す → 全部 disabled

#### (b) startOne の 3 のうち、プロジェクトの digest の比較を外す
- 単体: Tests  1 failed | 36 passed (37)
  - プロジェクトの拡張の状態（T22） > 起動の直前の確かめ直し（startOne の 3・4） > 承認 → 設定ファイルを書き換え → 拡張を落とす → 時間を進める → spawn されず pending（AC21）

- 結合（実際の子プロセス）: Tests  1 failed | 8 passed | 14 skipped (23)
  - (P4) 承認 → ファイルを書き換え（reload しない）→ 拡張を落とす → 起動し直されず pending

#### (c) inScope を、いつも真にする
- 単体: Tests  4 failed | 33 passed (37)
  - 範囲（T22-3） > ext.panes に、別の根・根の無い workspace の pane が出ない
  - 範囲（T22-3） > pane が別の根の workspace へ移る（bus のイベントなし）→ 見直しの 1 回で面が消え、display.closed（out_of_scope）が届き、その後の display.set は not_found
  - 範囲（T22-3） > 別の根の workspace の pane への display.set は not_found（無い pane と、同じ code・同じ文）
  - 範囲（T22-3） > 移った後・見直しの前に、その面の display.action が来ても、拡張へ渡らない

- 結合（実際の子プロセス）: Tests  1 failed | 8 passed | 14 skipped (23)
  - (P6) 2 つのリポジトリ: 片方の拡張が、他方の pane へ display.set → not_found。ext.panes に他方の pane が無い。pane を他方の workspace へ移す操作は、モデルが断る

#### (f) approve・deny の isScreenKind を外す
- 単体: Tests  1 failed | 36 passed (37)
  - 承認の操作（T22-2） > 画面の種類でない接続の approve・deny・revoke → invalid_params

#### (f') revoke の isScreenKind を外す
- 単体: Tests  1 failed | 36 passed (37)
  - 承認の操作（T22-2） > 画面の種類でない接続の approve・deny・revoke → invalid_params

#### (D11) 設定の時間切れ（現状維持）の道から、承認の側の enforceApprovals を外す（承認の側を混ぜる）
- 単体: Tests  1 failed | 36 passed (37)
  - プロジェクトの拡張の状態（T22） > 承認の記録の見張りと、読めないとき（止める側に倒す） > 設定の読み込みが時間切れ（現状維持）の間に承認の記録が消えても、承認の側は止める（混ぜない）


**二重の守りの確認（a1・a2・a3）**: (a1) だけを外した状態では、単体は状態が `pending` でなく `backoff` になって落ちる（`expected 'backoff' to be 'pending'`）が、**その直前の `spawn` が 0 回であることの検査は通る**＝`startOne` の 4 が止めている。結合の P1b（状態の表示に関わらず、印のファイルが出来ないこと）も、a1・a2 を片方ずつ外しても通り、**両方（a3）を外すと落ちる**:
```
(a1) P1b: Tests 1 passed
(a2) P1b: Tests 1 passed
(a3) P1b: AssertionError: expected [ 771710, 771756 ] to deeply equal []   ← 承認していないのに、拡張が 2 回起動された
```
(a1) の注意（外した状態では、`startOne` の 4 が断るたびに差を埋める仕事が予約され続ける）は、単体が時計を決まった分だけ進める形（`drive`）なので、落ちずに回り続けるテストにはなっていない。

### スクリーンショット
`/tmp/claude-1000/-workspaces-sodashitsu/957621e5-6a11-4044-ad8d-c86e30053090/scratchpad/ext-approval/`（明るい `-light`・暗い `-dark`）: `1-toast`（承認待ちのトースト）・`2-settings-pending-rows`（承認待ちの行）・`3-dialog-long-command-script-html`（長いコマンド・script-html の注意・グループの注意）・`4-dialog-next-of-two`（2 件中 2 件目）・`5-after-approve-and-deny`（承認した後・「承認しない」の後）・`6-registration-changed-back-to-pending`（登録が変わって承認待ちへ戻る）・`7-dialog-changed-since-approved`（前に承認した登録からの変更）。撮るのは `SODA_E2E_SHOTS=<dir>` を渡した `extensions-approval-shots.spec.ts`。

### 実施していないこと・限界
- Windows では、結合テスト・起動確認はスキップ（実機で確かめていない）。
- 別のマシン（中継越し）のダイアログのマシンの名前は、単体で見ていない（表示の分岐だけ。E2E は 1 マシン）。
- 独立レビュー（差分全体。攻める側の目で S1〜S26 を 1 行ずつ）は、別のエージェントが掛ける。
