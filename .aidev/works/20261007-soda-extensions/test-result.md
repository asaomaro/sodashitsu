# テスト結果（PR1: サーバと sodactl・静的な形式。T1〜T7）

実施: 2026-10-08、worktree `feature/ext-display-surface`（main の `165f88b` から。コミット `afd2286`〜T7）。画面（web）・スクリプトが動く形式は PR2・PR3。

## 全体

| コマンド | 結果 |
|---|---|
| `pnpm build` | 終了コード 0 |
| `pnpm typecheck` | 終了コード 0 |
| `pnpm test` | 終了コード 1。427 ファイル中 426 通過・8409 件中 8406 通過、**3 件失敗** |

失敗した 3 件は、既知の `packages/server/src/tui.integration.test.ts`（worktree のパスが長いと main でも落ちる。退行ではない）だけ:

```
 FAIL  |@sodashitsu/server| src/tui.integration.test.ts > runTui（実サーバ・偽の外側の端末） > サイドバーに workspace 名・pane にコマンドの出力が出て、…（AC2・AC3・AC6・AC11）
 FAIL  |@sodashitsu/server| src/tui.integration.test.ts > runTui（実サーバ・偽の外側の端末） > もう一度開くと同じ画面（スクロールバックの SNAPSHOT）が戻る。SIGHUP でも終わってモードが戻る（AC3）
 FAIL  |@sodashitsu/server| src/tui.integration.test.ts > runTui（実サーバ・偽の外側の端末） > 端末版 2 つを同時に繋ぐ：…（AC11・AC12）
 Test Files  1 failed | 426 passed (427)
      Tests  3 failed | 8406 passed (8409)
```

（`packages/server` だけを先に流したとき、`src/launch/soda.pty.integration.test.ts` も 1 回落ちたが、全体の `pnpm test` では通った。負荷による間欠と見て、再現しなかった。）

## 起動確認

ビルドした `packages/server/dist/handoffSmoke.js` を直接流した（`aidev smoke` は監督側が作業フォルダの外の worktree で流す）。T7 の 1 段を含めて `handoff-smoke: ok`:

```
handoff-smoke: sodactl display set / events without a login (pane socket) ok
handoff-smoke: display events survived the handoff (display.reset), list was empty, re-set and close reach the waiting events ok
handoff-smoke: display events after the server stopped → display.end (connection_closed), exit 1 ok
handoff-smoke: ok
```

## 実測した前提（tasks「不確かな点」のうち PR1 の分）

- **9. 別のマシンの中継が、4 MiB 近い 1 通を通すか（u8）→ 通る。** `machines.integration.test.ts` の新しい 1 件: 手元の `/ws?machine=Remote` の external 接続から (a) 2 MiB ちょうどの `display.set`、(b) 引用符だけの 2 MiB − 1 KiB（JSON のエスケープで 1 通が約 4 MiB − 2 KiB）の `display.set` を送り、リモートのサーバの面になり、中継越しの desktop 接続が `display.updated` を受け、`display.get` の小分け（片 768 KiB）で取り直して中身が一致した。中継越しの `display.wait` に画面の操作も届いた。上限を下げる必要は無い（docs に書く縮小は不要）。
- 受け口の 1 行の上限 4 MiB: 引用符だらけの 2 MiB − 1 KiB（1 行が 1 MiB を大きく超え 4 MiB 未満）は受け口を通り、引用符 2 MiB ＋ 100 バイト（1 行が 4 MiB 超）は `bad_request`（`display.integration.test.ts`）。
- 2 MiB ちょうどの中身: 受け口・`/ws` のどちらでも通り、`display.get` の片 3 つにまたがって元の中身と一致する。1 バイト超えは `invalid_display`（サーバ）・終了コード 2（sodactl）。

## AC の被覆（PR1 の分）

- AC14: **PR1 では 5 つの分（`set`・`close`・`list`・`wait`・`features`）を満たす。`send`（6 つ目）は PR3。** 受け口の操作は `ctx.paneId` だけを対象にし、引数に `paneId: <B>` を載せると `invalid_params`（strict）。pane A を名乗って B の面の名前で `close`/`list`/`wait` しても B に届かない（`display.integration.test.ts`）。この組は T22 (a) の負の対照で使う（PR2）。
- AC1・AC3（画面なしの分）・AC2（`rev`）・AC12・AC20〜AC22・AC24・AC26（`/ws` の経路で `--pane` の `set`/`list`）・AC34（`report` の `navigated`/`unresponsive` が `display.closed` の行になる）・AC36（2 MiB ちょうどが 2 つの経路で通る）・AC25（上限・頻度。台帳の単体と結合）・AC23（型は `packages/protocol/src/display.ts` の 1 か所）。画面の描画に関わる分は PR2。

## 追加したテスト

- protocol: `display.test.ts`（検査・読み手のゆるさ）、`messages.test.ts`・`paneSocket.test.ts`（10 方式・受け口の schema が `paneId` を拒否・1 行の上限）。
- server: `rateLimit.test.ts`、`DisplayService.test.ts`（57 件）、`display.integration.test.ts`（10 件。受け口と `/ws`）、`machines.integration.test.ts`（中継越し 1 件）、`handoffSmoke.ts` の 1 段。
- cli: `cliArgs.test.ts`（display の引数）、`commands/display.test.ts`（26 件。経路・サイズ・`runWaitLoop`）、`display.integration.test.ts`（10 件。実サーバ。ログインなしの受け口・`/ws`・events・wait・set --wait・上限）、`skill.test.ts`。

## 設計から外れた点・判断

- **読み手の側の型をゆるくした**（監督の指示）: `DisplayInfo.format`・`DisplayChunk.format`・`DisplayContent.format` は `DisplayFormatValue`（未知の文字列を通す）、閉じた理由は `DisplayClosedReasonValue`、`DisplayRenderers`・`DisplayLimits` は未知の項目を通す。書き手（`checkDisplaySet`・`display.set` の `format`）は今の 3 つだけを厳しく検査する。`readDisplayInfo` を足した（未知の `format`・項目の面が混じっても一覧が壊れない。単体テストあり）。テストは features・renderers・limits を `toEqual` で固めない。
- `DISPLAY_REQUEST_LINE_BYTES`（4 MiB）を `display.ts` に別に持つ: `paneSocket.ts` を読むと `messages.ts` を通って循環するため。同じ値であることは `display.test.ts` が見る。
- 受け口の display 操作の結合テストは、`paneSocket.integration.test.ts` ではなく `display.integration.test.ts`（`/ws` の経路と同じ起動の部品を使うため）に置いた。
- `/ws` の handler と受け口の操作は別（`surface/methods/display.ts` と `panesocket/displayOps.ts`）。受け口の schema は `paneId` を持たず strict。
- `display.set` の `/ws` schema は項目を `z.unknown().optional()` にし、規則の外を `invalid_display`（`display.set` 以外の形の誤りは `invalid_params`）にそろえた。
- sodactl の経路: 一度受け口で通ったあとの失敗（サーバが止まった等）は `/ws` へ落とさず切れたものとして扱い、5 秒まで繋ぎ直す（`events` が未ログインでも `display.end`〔`connection_closed`〕で終わるため）。最初の呼び出しで受け口に繋げなければ `/ws`。
- stdout が閉じたことの検知は、書いたあとの `error`・`close` の監視（次の行を出す前に気づく）。

## 点検待ち（監督側が別のエージェントで掛ける）

`aidev taskcheck start <id> --mode delegated` を記録済み: **T1・T2・T3・T4・T6**。

## 残った不確かな点

- 点検が掛かっていない T5（sodactl の引数・`set`/`close`/`list`/`--features`）は、PR1 の `cross` に含まれる。
- Windows の経路（受け口なし）は実機で確かめていない。`/ws` の経路の結合テスト（`--pane`・`SODA_PANE_SOCKET` なし）で代える。
- `tui.integration.test.ts` の 3 件は worktree のパスが長いための既知の失敗。main での切り分けは、この work では実施していない（指示の「既知」を採用）。

---

## PR1 独立レビュー後の修正（should 3・nit 3・テスト 1）

1. **`events` が ready の直後の出来事を落とす**: `display.list` の結果に `seq`（その pane の出来事の今の通し番号）と `epoch` を足し（読み手はゆるく読む）、`runEvents` は ready の前に `display.features` → `display.list` を呼んで、最初の `display.wait` から必ず `since` を付ける（`--since/--epoch` があればそれ）。`wait` コマンドも同じ。
   テスト: `cli/src/display.integration.test.ts` の「ready の後・最初の display.wait が登録される前に起きた出来事も届く」。`callPaneOp` を差し替えて `display.wait` の送信を門で止め、ready を受けた後に画面から操作を送り、門を開ける（時間に頼らない）。
   **直す前（`startSince` を `a.since` だけにした版）で落ちることを確認**:
   ```
        × events: display.ready の後・最初の display.wait が登録される前に起きた出来事も届く（順序は時間でなく門で決める） 10468ms
   ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
    FAIL  src/display.integration.test.ts > sodactl display（実サーバ） > events: display.ready の後・最初の display.wait が登録される前に起きた出来事も届く（順序は時間でなく門で決める）
   Error: waiting for a line; have ["display.ready"]
        91|         if (!l) throw new Error(`waiting for a line; have ${JSON.strin…
   ```
   単体（`commands/display.test.ts`）: ready の前に features → list が呼ばれ、最初の `wait` に `since: 7, epoch` が付く。
2. **空の標準入力**: 中身の指定が無く標準入力が 0 バイトなら使い方の誤り（終了コード 2）。空の面は `--text ""`。単体・結合テストあり。
3. **docs**: `docs/sodactl.md`「ログイン不要の受け口」の「安全の境界」と「載せてよい操作の条件」に、`display` が他の pane の操作の値を読める点・守っているのは OS の利用者の境界で pane 同士ではない点・パネルのフォームに秘密を入れさせないことを書いた。
4. **送る前の大きさの検査に余裕（512 バイト）**: `line + 512 > 4 MiB` なら送らずに使い方の誤り（サーバの `requestLineBytes` の比較も同じ）。単体テストで、余裕の内側（上限 − 100）は誤り・外側（上限 − 1000）は送る。
5. **`wait --timeout`・`set --wait --timeout`**: 残りの時間で数える。残りが 1 秒に満たないときはサーバに聞かず、残りだけ待って `display.timeout`（サーバの 1 回の待ちの最小は 1 秒）。その端の区間に起きた出来事は拾わない（終わる直前の 1 秒未満）。単体テストあり。
6. **`display_busy`（待ちの上限）の `events`**: 以前は標準エラーの JSON だけで、stdout には何も出なかった。**直した**: `display.end`（reason `busy`）の行を出してから、エラー（標準エラー。終了コード 1）を投げる。`DisplayLine` の `display.end` の reason に `busy` を足した。
   全体の待ちの上限は **16 → 64 に見直した**（pane 4 × 16 pane。受け口の同時接続 64 と同じ）。ほかの pane の待ちで無関係な pane が `display_busy` になりにくくなる。`design.md` の 16 とは違う（`design.md` には触れていない。上流の側で直してほしい）。
7. **AC14 の負の対照（PR1 の時点）**: `panesocket/displayOps.ts` の `displaySetOp`・`displayListOp`・`displayWaitOp` を、引数の schema を `paneId` を許すものに替え、対象を `p.paneId ?? ctx.paneId` にした版で `display.integration.test.ts`「pane A を名乗っても…」を流すと落ちる（`paneId: B` を載せた要求が `invalid_params` にならず成功する）:
   ```
        × pane A を名乗っても、pane B の面は見えず・閉じられず・待てない。引数に paneId: B を載せても B に届かない（AC14） 948ms
   ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
    FAIL  src/display/display.integration.test.ts > 表示の面（実物のサーバ。pane.sock と /ws） > pane A を名乗っても、pane B の面は見えず・閉じられず・待てない。引数に paneId: B を載せても B に届かない（AC14）
   AssertionError: expected { ok: true, result: { …(3) } } to match object { ok: false, …(1) }
   + Received
   +   "ok": true,
       210|       [PANE_OP_DISPLAY_WAIT, { paneId: paneB, timeoutMs: 1000 }],
       211|     ] as const) {
       212|       expect(await call(sockPath, op, paneA, params)).toMatchObject({ …
       213|     }
       214|     // B の面は無傷で、A には何も出ていない
         Tests  1 failed | 9 skipped (10)
   ```
   確かめた後は戻し、`git diff -- packages/server/src/panesocket/displayOps.ts` が空であることを確認した。

### 残った点（直さない）
- 認証の前に受け口が溜める量が、64 接続 × 4 MiB（256 MiB）に増えた（10 秒の期限・同じ OS の利用者だけが繋げる）。
- 接続元の pid から pane を逆引きして、受け口の名乗りを検証する案は、別の作業の候補（上の docs の限界の解消）。
