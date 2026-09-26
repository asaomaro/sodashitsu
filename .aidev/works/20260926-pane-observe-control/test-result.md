# テスト結果: `wtmctl pane observe` / `wtmctl pane control`（20260926-pane-observe-control）

## 実行したもの

- `pnpm -s build` → exit 0、`pnpm -s typecheck` → exit 0（build を先に）
- 全体 `pnpm -s test` を 1 回 → exit 0（204 files / **4064 passed / 0 failed / 0 skipped**）。
  その後に単体テストを 2 件足した（負の確認で生き残った変異を捕まえるため。下）ので、cli パッケージだけ再実行 → 29 files / **551 passed**。
  deliver で main を取り込んだ後にもう一度全体を 1 回実行する。
- 追加・変更したテストの単体実行: `sessionStream.test.ts` 73 passed・`commands/sessionStream.test.ts` 47 passed・`cliArgs.test.ts` 127 passed・`wsClient.test.ts` 6 passed・
  `sessionStream.integration.test.ts` 5 passed（実サーバ・実 PTY）
- `aidev smoke`（3 本）→ pass。cli の smoke にビルド済みの `wtmctl pane observe`/`pane control` を子プロセス（パイプ）で一巡させる手順を足した（下の「起動確認」）。
- 負の確認（`.aidev/conventions/regression-negative-control.md`・変異の網羅）45 通り → 42 通り検出、生き残り 3 通りのうち 2 通りはテストを足して検出、1 通りは観測上等価（下）。
- ユーザーの指示により負荷試験・E2E・テストの繰り返し実行はしていない。

## 受け入れ基準ごとの判定

- AC1: pass — 単体（最初の行の形・seq 1・大きさ・bytes を戻すと画面）と結合（observe 2 本とも最初は full で pane の大きさ）・smoke（子プロセスの最初の行が full）。
- AC2: pass — 単体（OUTPUT が full:false で seq が 1 ずつ・送り直しの SNAPSHOT が full:true・UTF-8 の区切り・問い合わせの除去・最初の SNAPSHOT 前の出力は捨てる）と結合（control の入力の結果が両方の observe に届き seq が連番）。
- AC3: pass — 単体（pane.size_changed の後のフレームの大きさ）と結合（terminal.resize 90x25 の後の両 observe のフレーム）。
- AC4: pass — 単体（exited/closed で pane_closed・切断で connection_closed・subscribe 待ちの切断・not_found で何も書かない）、結合（シェルの exit で pane_closed・存在しない pane で not_found）、smoke（pane close で observe が pane_closed・終了コード 0）。
- AC5: pass — 単体（observe が送る要求は pane.subscribe だけ）と結合（observe の開始前後で pane の大きさが同じ・watcher の接続で pane.attach_changed が control の 2 回だけ）。
- AC6: pass — 引数の単体（既定 120x40・1〜1000・範囲外と整数でない値は使い方の誤り）、単体（pane.attach に cols/rows/takeover）、結合・smoke（pane が 100x30）。
- AC7: pass — 単体（text・bytes・空は送らない・行の分割）と結合（text と bytes の両方で印が出る）・smoke（パイプの stdin からの echo の往復）。
- AC8: pass — 単体（pane.attach_resize）と結合（pane が 90x25）。
- AC9: pass — 単体（release・stdin の終わり・シグナルで detach → released・終了コード 0・購読の解除と stdin の停止、detach 失敗でも released、解放中の奪取・終了・切断も released、2 度目のシグナルで即終了）、
  結合（release の後も pane が残り、takeover 無しの control が所有者になれる・stdin の終わりで released）、smoke（release で終了コード 0）。
- AC10: pass — 単体（pane_attached で何も書かない・奪われて taken_over / attach_taken_over・所有者になる前の別 clientId では奪われたとしない）と、
  結合（control→control・control 所有中の pane attach の拒否・pane attach --takeover が control から・pane attach 所有中の control の拒否・control --takeover が pane attach から）。
- AC11: pass — `parseControlLine` の単体（不正の種類 30 通り近く・プロトタイプの名前・BOM・全角空白・理由の JSON 化）と、control の単体（不正な行 7 本に 7 行の警告・後の正しい行は処理・空行は無警告）・結合（知らないキーのある行の印が出ない）・smoke（警告が出る）。
- AC12: pass — `LineSplitter` の単体（上限ちょうど・超え・改行の来ない超過・捨て中の次の行・既定 1 MiB）と control の単体（分割して届いた 1 MiB 超の行の後の行が処理される）。
- AC13: pass — 結合（セッションも token も無い observe は UnauthenticatedError・誤った token の control は AuthError `login failed: HTTP 401` で、stdout に何も書かず stdin の購読も始まらず、pane に印が出ない）。
  新しい入口は作っていない（サーバは無変更。`git diff --stat` に packages/server・protocol が無い）。
- AC14: pass — 単体（書き出し待ちが上限を超えたら pause・ちょうどでは止めない・drain で resume・再開後の SNAPSHOT は full:true・subscribe の応答までは止めない・終わるときは resume してから close・解放中は止めない・止めている間は stdin も止める）。
  実物の遅い読み手での確認は負荷を掛けることになるのでしていない（未検証の穴）。
- AC15: 文書は済（`docs/wtmctl.md`・`docs/herdr-parity.md` の H40。T8 のタスク点検で実装と照合）。backlog の消し込みは deliver で行う。

## 失敗の証跡

このラウンドでは失敗が発生していない（全体テスト・smoke とも 1 回で pass）。

## 負の確認（変異の網羅）

`scratchpad/mutate.py`（作業場所。コミットしない）で実装の要所を 1 か所ずつ壊し、対応する単体テストのファイルを走らせ、元に戻して `filecmp`（cmp 相当）で一致を確かめた。
45 通りの結果の要約（生の出力は変異ごとのログ）:

```
(1..4, 6..17 sessionStream.ts) KILLED   — seq・full・行の上限・捨て中の解除・Buffer の写し・base64 の正規・Map・キーの白リスト・text/bytes の排他・1〜1000・scroll・BOM・空白・理由の引用・cell_*_px
(5 sessionStream.ts)  SURVIVED — `end()` の `this.discarding ||` を外す。捨て中は溜めが必ず空（too_long で parts を捨て、捨て中は溜めない）なので観測上等価
(18, 20..34, 36..42 commands/sessionStream.ts) KILLED — 最初の SNAPSHOT 前の出力・decoder の作り直し・空フレーム・大きさの追従・exited・released への寄せ・output_closed・高水位・resume・allowPause・attach 前の溜め・解放中の allowPause・stdin の連動・flush・flush の上限・所有前の clientId・空の入力・解放後の行・EOF の最後の行・2 度目のシグナル・stdin の停止・stdout の error
(19 commands/sessionStream.ts) SURVIVED → テスト追加後 KILLED — SNAPSHOT で問い合わせの持ち越しを捨てる `queries.reset()`
(35 commands/sessionStream.ts) SURVIVED → テスト追加後 KILLED — attach の直後に切れたときの `closedEarly`
(43 cliArgs.ts・44 既定の大きさ・45 wsClient.ts pause) KILLED
```

変異 30（attach が通るまでイベントを溜める）の生の出力（抜粋・そのまま）:

```
 FAIL  src/commands/sessionStream.test.ts > runPaneControl（20260926-pane-observe-control） > attach が通る前に届いた pane の終わりでは何も書かず、attach の失敗で終わる（始まる前の失敗は stdout に何も書かない）
AssertionError: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "{\"type\":\"terminal.closed\",\"reason\":\"pane_closed\"}
+ ",
+ ]

 ❯ src/commands/sessionStream.test.ts:818:20
    816|       code: "not_found",
    817|     });
```

テストを足した後の変異 19・35 の再実行:

```
SUMMARY
(19, 'packages/cli/src/commands/sessionStream.ts', 'KILLED', 'Tests  1 failed | 46 passed (47)')
(35, 'packages/cli/src/commands/sessionStream.ts', 'KILLED', 'Tests  1 failed | 46 passed (47)')
```

## 起動確認（smoke）

```
$ aidev smoke
$ pnpm --filter @wtm/cli run smoke

> @wtm/cli@0.1.0 smoke /workspaces/web-tn-multiplexer-wt/pane-observe-control/packages/cli
> node --enable-source-maps dist/smoke.js

smoke(cli): temp server state dir /tmp/wtmctl-smoke-state-rcFncp, sandboxed HOME /tmp/wtmctl-smoke-home-r5Z8Wq
{"ts":"2026-09-26T17:09:50.079Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
smoke(cli): server listening on http://127.0.0.1:44739
smoke(cli): wtmctl workspace create ok (pane p2)
smoke(cli): wtmctl pane run ok (no --token needed; cached session reused)
smoke(cli): wtmctl pane read ok (echo round trip confirmed)
smoke(cli): wtmctl snapshot ok
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
wtm: new token: 5fCw0wX26nBF4L2cILNyK6JjIMkhYvDV
wtm: deleted session smoke (/tmp/tmp.P5Mv1zutb2/sessions/smoke)
smoke: pass (exit 0, 3 本)
```

- この work は新しい入口（`pane observe`・`pane control`）を足したので、既存の 2 本目（`pnpm --filter @wtm/cli run smoke`）の `smoke.ts` に手順を足した（`.aidev/config.yml` は変えない）。

## 未検証の穴

- 実物の遅い読み手（stdout を読まないパイプ）で受信が止まり、サーバの流量制御が出力を捨て、追いついたら full のフレームから続くことは、単体テスト（偽の stdout・偽の client）でしか確かめていない。
  大量の出力を流す確認は負荷試験になるため行っていない（ユーザーの指示）。`ws` の `pause()` が実サーバの接続で応答の受け取りを止めることは `wsClient.test.ts` で 1 回確かめた。
- 失敗で終わるときの stdout の書き出し待ち（`write("", cb)`）は、主エージェントが node で 3 MiB＋記録の後の exit で全バイトが届くことを 1 回確かめただけ（点検者が修正前の取りこぼしを実測）。
- Windows・macOS での動作（stdin/stdout のパイプ・シグナル）は確かめていない。
- 本物のブリッジ（herdr 向けに書かれたもの）での互換は確かめていない。

## ラウンド 2（review ラウンド 1 の差し戻しの後）

- 直したもの: `WsWtmClient.close()` で待ち中の要求のタイマーを消す・不正な行の警告を stderr の書き出し待ち 64 KiB 超で捨てる・docs の終了コードの例外（decisions D13）。
- `pnpm -s build` → exit 0、`pnpm -s typecheck` → exit 0。
- 全体 `pnpm -s test` 1 回 → exit 0（204 files / **4068 passed / 0 failed / 0 skipped**。ラウンド 1 の 4064 にこの 2 件の修正のテスト 2 件と、ラウンド 1 で足した変異検出用の 2 件）。
- 負の確認（追加 2 通り）: どちらも検出。

```
(46, 'packages/cli/src/wsClient.ts', 'KILLED', 'Tests  1 failed | 6 passed (7)')
(47, 'packages/cli/src/commands/sessionStream.ts', 'KILLED', 'Tests  1 failed | 47 passed (48)')
```

- `aidev smoke` → pass（3 本）:

```
smoke: pass (exit 0, 3 本)
```

着地の判定はラウンド 2 の結果による。このラウンドでは失敗が発生していない。
