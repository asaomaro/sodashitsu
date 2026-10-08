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
   全体の待ちの上限は **16 → 32 に見直した**（pane あたり 4 × 8 pane。受け口の接続（64）の半分までに抑え、`set`・`close`・`ask` の分を残す。再レビューの指摘で 64 から下げた）。`design.md` の 16 とは違う（`design.md` には触れていない。上流の側で直してほしい）。
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

### 再レビュー後の修正
- 待ちの全体の上限 `DISPLAY_WAITERS_MAX` を 32 に（上記）。テスト・SKILL.md の記述も合わせた。
- `runWaitLoop`: まだ一度も聞いていないときは、残りが 1 秒未満でも（期限を過ぎていても）1 回は聞く。2 回目以降で残りが 1 秒未満なら、残りだけ待って `display.timeout`。docs と SKILL.md に「時間切れの直前の 1 秒未満に起きた操作は受け取れないことがある」を足した。
- `display.end` の `reason` に `busy` を足したことを、SKILL.md の `events` の説明と `docs/sodactl.md` に書いた。

## PR2（画面・静的な形式。T8〜T22）の結果

ブランチ `feature/ext-display-web`（`6ea9570` から。`ebcbdc0` と `origin/main` を取り込み済み）。

### 実測した前提（`tasks.md`「不確かな点」。PR2 で確かめるもの）

| # | 前提 | 結果 | 確かめた筋 |
|---|---|---|---|
| 1 | `MessagePort` を、sandbox（`allow-same-origin` なし）の不透明 origin の枠へ、transfer で渡せる | **渡せた**（`render` が枠に届き中身が描かれる）。代替（合言葉）は採らない | `display.spec.ts`「実測 (a)」・`display-flows`（全部） |
| 2 | Playwright の `frame.evaluate` が `script-src 'self'` の枠で動く | **動いた**（`1 + 1`）。枠の `self.origin` は `"null"`、`localStorage`・`parent.document` は `SecurityError`（`location.origin` は URL から出る値なので証拠にならない） | `display.spec.ts`「実測 (b)」・`display-isolation` (1) |
| 3 | `allow-forms` で `submit` のイベントが起き、実際の送信は起きない | **起きた／起きなかった**（フォームの値が `display.action` で届き、`data-display-loads` は 1 のまま、待ち受けに届いた要求は 0） | `display-flows` (8) |
| 4 | marked が Markdown の中の HTML（`<button data-soda-action>`）を通す | **通した**（押すと `display.action`） | `display-flows` (8) |
| 7 | 枠が同じ origin の別の文書へ移ると、親から見た iframe の `load` が起きる | **起きた**（2 回目の `load` で `navigated`）。移った瞬間に親が iframe を外すので、Playwright の `frame.goto` は `Frame was detached` で終わる（テストは握りつぶす） | `display-isolation` (6) |
| 移った先の `ping` | 移った先は返事ができない | 移った先の静的ページは `display-ready` を送るが、親はもう `connected`/外した後なので受けない（action も 0）。`load` の回数で先に閉じるので、`unresponsive` の出番は無い | `display-isolation` (6) |

PR3（スクリプトが動く形式）の前提 5・6・8・10・11 は、この PR の範囲外（未実施）。9 は PR1（T4）。

### 自動テスト

`pnpm build`・`pnpm typecheck`（終了コード 0）・`pnpm test`（終了コード 1）:

```
 Test Files  1 failed | 434 passed (435)
      Tests  3 failed | 8491 passed (8494)
 FAIL  |@sodashitsu/server| src/tui.integration.test.ts > runTui（実サーバ・偽の外側の端末） > サイドバーに workspace 名・pane にコマンドの出力が出て、…（AC2・AC3・AC6・AC11）
 FAIL  |@sodashitsu/server| src/tui.integration.test.ts > … > もう一度開くと同じ画面（スクロールバックの SNAPSHOT）が戻る。SIGHUP でも終わってモードが戻る（AC3）
 FAIL  |@sodashitsu/server| src/tui.integration.test.ts > … > 端末版 2 つを同時に繋ぐ：どちらも描き・打て、最後に操作した側の大きさになり、もう一方は切り取って ⋯ を出す。…（AC11・AC12）
```

失敗の 3 件は既知（worktree のパスが長いと main でも落ちる。出力に `agent-ae08f15654bedf052`＝パスが画面の幅で折り返されて、期待する文字列が途切れる）。それ以外は全部通った。
途中の全体の実行で、`TuiApp.subagents.test.ts`（経過時間の 10 秒ごとの描き直し）が負荷のときに 1 回落ちた（単独では 14 件通る。時間に依る既存の試験）。

新しい単体・結合（このブランチで足した分）: `displayLabel.test.ts`（2）・`displayViewSanitize.test.ts`（8）・`frameJs.test.ts`（8）・`DisplayController.test.ts`（10）・`store/display.test.ts`（7）・`displayLayout.test.ts`（6）・`DisplayFrame.test.ts`（14）・`PanePanel.test.ts`（11）・`MobileDisplaySheet.test.ts`（3）・`PaneFrame.test.ts`（+3）・`ActionDispatcher.test.ts`（+2）・`HttpServer.integration.test.ts`（+4）。

既存の試験で直したもの（意図した変更）: 操作のカタログの数（`bindings.test.ts` 61→62・pane 群 29→30・`keymap.test.ts` の prefix の後のキー 49→50〔`i`〕・`TuiDispatcher.test.ts` の全操作の表・`KeySettings.test.ts` の 69→70）、
`uiTokens.test.ts` の「薄めた文字の下限」に `.pane-frame-main-dimmed`（操作中に端末を薄くする 0.55。設計の指定）を対象外として足した。

### E2E（実ブラウザ。Chromium。`packages/e2e`）

足した分（`display.spec.ts` 2・`display-flows.spec.ts` 12・`display-isolation.spec.ts` 13・`display-resize.spec.ts` 4・`display-mobile.spec.ts` 1）:

```
  37 passed, 1 failed (1.5m)   # 新しい 5 つの spec（32）と mobile.spec.ts（5 件中 4 件通る）。落ちた 1 件は mobile.spec.ts の「この端末に合わせる…繋ぎ直す」（main でも落ちる元からの失敗。:189 が足した行で :203 になった）
```

既存の E2E（`ask-view`・`ask-form`・`resize-handles`・`workspace-tab-pane`・`mobile`・`key-bindings`）:

```
  5 failed
  93 passed (4.0m)
  ✘ key-bindings.spec.ts:632（「こちらへ移す」へ Tab で届く）  ✘ key-bindings.spec.ts:699（Keyboard Lock。WebAssembly が CSP の unsafe-eval で拒否される）
  ✘ workspace-tab-pane.spec.ts:305（新しい pane の直後に打った文字）  ✘ mobile.spec.ts:77  ✘ mobile.spec.ts:189
```

切り分け（`origin/main`＝`6fd30bb` の別の worktree を作ってビルドし、同じ 5 件を流した）:

- **key-bindings:632・key-bindings:699・workspace-tab-pane:305・mobile:189 は main でも落ちる**（元から。この環境の問題）。mobile:189 の期待する送信順は、main では `file.info`、このブランチでは `display.subscribe` が混ざる違いだけで、どちらも落ちる。
- **mobile:77 は、このブランチだけ落ちた**（3 回とも）。main は 2 回とも通る。原因: 追加キーの列を開いた直後に、ブラウザの測り直しで pane の大きさが一度変わる（29 行 → 26 行。main でも同じ経過〔100ms ごとに記録して比べた〕）。
  テストは「サーバとブラウザの大きさが一致した」途中の状態を「分割の前の大きさ」に取っていた——時機の競合は元からあったが、起動時の通信が 1 本（`display.subscribe`）増えて時機がずれ、途中の一致を取るようになった。
  通信を外すと通る（実験で確かめた）。**テストを直した**: 「400ms 変わらずに一致し続ける」のを待ってから取る（`mobile.spec.ts`）。直した後は通る。
- 直した後の `mobile.spec.ts` 全体: 4 件のうち :189 だけが落ちる（main でも落ちる）。

### 画面の見た目（スクリーンショット）

`/tmp/claude-1000/-workspaces-sodashitsu/957621e5-6a11-4044-ad8d-c86e30053090/scratchpad/display-pr2/`（コミットしない）:
`desktop-dark.png`・`desktop-light.png`・`desktop-dark-engaged.png`・`desktop-light-engaged.png`（パネル＋帯。engaged は `prefix+i` で枠にフォーカスした状態）・`mobile-dark.png`・`mobile-light.png`（バーの［表示1］と重ね表示）。
撮って見つけた直し: モバイルのバーに［表示 N］を足すと狭い画面でバーの右端（設定）が切れた→余白を詰めて［表示N］にし、はみ出しを 1px（丸め）に収めた。重ね表示の固定のラベルが省略記号で切れた→ラベルを 1 行に出して、ボタンは次の行にした。

### 起動確認・未実施

- `aidev smoke`（`handoffSmoke`）は PR1 の変更だけで、PR2 は触っていない。PR2 の独立点検（`taskcheck`）は T8・T9・T11 が「点検待ち」（記録は `start` だけ）。
- 実機（iOS Safari・Android Chrome・Firefox・Safari・別のマシンのブラウザ）は未確認（`docs/verification.md` に手順）。

### 負の対照（T22。静的な形式）

対策を外した版で、対応するテストが落ちる（または、二重の守りの片方だけ外した版では**落ちない**）ことを確かめ、戻して通ることも確かめた。生の出力（`ts` のログ行と所要時間を除く）:

**(a) 受け口の `displayCloseOp`・`displayListOp`・`displayWaitOp` が、引数の `paneId` を対象にする版 → T4 の「引数に `paneId: <B>` を載せても B に届かない」が落ちる**
```
    ❯ |@sodashitsu/server| src/display/display.integration.test.ts (10 tests | 1 failed) 8028ms
        × pane A を名乗っても、pane B の面は見えず・閉じられず・待てない。引数に paneId: B を載せても B に届かない（AC14） 830ms
   ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
   AssertionError: expected { ok: true, result: { …(3) } } to match object { ok: false, …(1) }
   - Expected
   + Received
    Test Files  1 failed (1)
         Tests  1 failed | 9 passed (10)
```
戻して `display.integration.test.ts` は 10 件通る。

**(b) `DISPLAY_VIEW_SANDBOX` と `DISPLAY_VIEW_CSP` の両方に `allow-same-origin` を足した版 → `display-isolation` (1) が落ちる**
```
     ✘  1 src/specs/display-isolation.spec.ts:21:1 › (1) 枠の sandbox 属性と応答ヘッダに allow-same-origin が無く、枠の中から親・cookie・保存領域・アプリへの通信に触れない
     ✓  2 src/specs/display-isolation.spec.ts:75:3 › (2) 中身の <script>・onerror・onclick・javascript: が動かない（html）
     ✓  3 src/specs/display-isolation.spec.ts:75:3 › (2) 中身の <script>・onerror・onclick・javascript: が動かない（markdown）
     ✓  4 src/specs/display-isolation.spec.ts:91:1 › (3) 外の画像・stylesheet・@import・背景・フォントへの要求が 0（ブラウザの要求の記録と、待ち受けに届いた要求）
     ✓  5 src/specs/display-isolation.spec.ts:111:1 › (4) meta refresh・form の送信・base・iframe・object・embed で枠が移らず、外を読まない
     ✓  6 src/specs/display-isolation.spec.ts:132:1 › (5) 親のページの別の iframe から同じ形の message（display-ready・action）を送っても、ブラウザは display.action を送らない
     ✓  7 src/specs/display-isolation.spec.ts:147:1 › (6) 枠が移った場合: 面が閉じ、トーストが出て、display.report(navigated) が送られ、events に display.closed(navigated)。直後の html の set は通る
     ✓  8 src/specs/display-isolation.spec.ts:169:1 › (7)(8) 端末にフォーカスがあるとき、autofocus つきの中身・フォーカスを奪い続ける中身が来ても、打った文字は全部 pane に届き、activeElement は iframe にならない
     ✓  9 src/specs/display-isolation.spec.ts:188:1 › (10) 知らない形式（script-html・未知）: 枠が作られず固定の文言。形式が替わると iframe が別の要素になる
       Error: expect(locator).toHaveAttribute(expected) failed
       Expected: "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
       Received: "allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
           13 × unexpected value "allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
     1 failed
     8 passed
```

**(c1) `sanitize.js` の `script`・`on*` の取り除きだけを外した版（`autofocus` の取り除きは残す）→ (2)・(7)(8) は落ちない（CSP が止める）。(2b) と `sanitize.js` の単体テストが落ちる**。枠のコンソールに CSP の違反が記録される:
```
     ✓   1 src/specs/display-isolation.spec.ts:21:1 › (1) 枠の sandbox 属性と応答ヘッダに allow-same-origin が無く、枠の中から親・cookie・保存領域・アプリへの通信に触れない
     ✓   2 src/specs/display-isolation.spec.ts:75:3 › (2) 中身の <script>・onerror・onclick・javascript: が動かない（html）
     ✓   3 src/specs/display-isolation.spec.ts:75:3 › (2) 中身の <script>・onerror・onclick・javascript: が動かない（markdown）
     ✘   4 src/specs/display-isolation.spec.ts:90:3 › (2b) 取り除き: 危険な要素・属性が文書に入っていない（html）
     ✘   5 src/specs/display-isolation.spec.ts:90:3 › (2b) 取り除き: 危険な要素・属性が文書に入っていない（markdown）
     ✓   6 src/specs/display-isolation.spec.ts:101:1 › (3) 外の画像・stylesheet・@import・背景・フォントへの要求が 0（ブラウザの要求の記録と、待ち受けに届いた要求）
     ✓   7 src/specs/display-isolation.spec.ts:121:1 › (4) meta refresh・form の送信・base・iframe・object・embed で枠が移らず、外を読まない
     ✓   8 src/specs/display-isolation.spec.ts:142:1 › (5) 親のページの別の iframe から同じ形の message（display-ready・action）を送っても、ブラウザは display.action を送らない
     ✓   9 src/specs/display-isolation.spec.ts:157:1 › (6) 枠が移った場合: 面が閉じ、トーストが出て、display.report(navigated) が送られ、events に display.closed(navigated)。直後の html の set は通る
     ✓  10 src/specs/display-isolation.spec.ts:179:1 › (7)(8) 端末にフォーカスがあるとき、autofocus つきの中身・フォーカスを奪い続ける中身が来ても、打った文字は全部 pane に届き、activeElement は iframe にならない
     ✓  11 src/specs/display-isolation.spec.ts:198:1 › (10) 知らない形式（script-html・未知）: 枠が作られず固定の文言。形式が替わると iframe が別の要素になる
       Expected: 0
       Received: 3
       Expected: 0
   [CSP の違反（枠のコンソール）]
   CSPMSGS ["Executing inline event handler violates the following Content Security Policy directive 'script-src 'self''. Either the 'unsafe-inline' keyword, a hash ('sha256…", …（2 件）]
   [sanitize.js の単体テスト]
   × 枠を動かす・外へ繋ぐ要素を消す 11ms
        × on で始まる属性・autofocus・srcdoc・action・target などを消す 3ms
   ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
         Tests  2 failed | 6 passed (8)
```
**(c2) `DISPLAY_VIEW_CSP` の `script-src` に `'unsafe-inline'` を足しただけの版（取り除きは残す）→ (2)・(2b)・(7)(8) は落ちない**。落ちるのは、ヘッダの値を直接見る (1)（と `HttpServer.integration.test.ts`）:
```
     ✘   1 src/specs/display-isolation.spec.ts:21:1 › (1) 枠の sandbox 属性と応答ヘッダに allow-same-origin が無く、枠の中から親・cookie・保存領域・アプリへの通信に触れない
     ✓   2 src/specs/display-isolation.spec.ts:75:3 › (2) 中身の <script>・onerror・onclick・javascript: が動かない（html）
     ✓   3 src/specs/display-isolation.spec.ts:75:3 › (2) 中身の <script>・onerror・onclick・javascript: が動かない（markdown）
     ✓   4 src/specs/display-isolation.spec.ts:90:3 › (2b) 取り除き: 危険な要素・属性が文書に入っていない（html）
     ✓   5 src/specs/display-isolation.spec.ts:90:3 › (2b) 取り除き: 危険な要素・属性が文書に入っていない（markdown）
     ✓   6 src/specs/display-isolation.spec.ts:101:1 › (3) 外の画像・stylesheet・@import・背景・フォントへの要求が 0（ブラウザの要求の記録と、待ち受けに届いた要求）
     ✓   7 src/specs/display-isolation.spec.ts:121:1 › (4) meta refresh・form の送信・base・iframe・object・embed で枠が移らず、外を読まない
     ✓   8 src/specs/display-isolation.spec.ts:142:1 › (5) 親のページの別の iframe から同じ形の message（display-ready・action）を送っても、ブラウザは display.action を送らない
     ✓   9 src/specs/display-isolation.spec.ts:157:1 › (6) 枠が移った場合: 面が閉じ、トーストが出て、display.report(navigated) が送られ、events に display.closed(navigated)。直後の html の set は通る
     ✓  10 src/specs/display-isolation.spec.ts:179:1 › (7)(8) 端末にフォーカスがあるとき、autofocus つきの中身・フォーカスを奪い続ける中身が来ても、打った文字は全部 pane に届き、activeElement は iframe にならない
     ✓  11 src/specs/display-isolation.spec.ts:198:1 › (10) 知らない形式（script-html・未知）: 枠が作られず固定の文言。形式が替わると iframe が別の要素になる
       Expected substring: "script-src 'self';"
       Received string:    "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox; default-src 'none'; script-src 'self' 'unsafe-inline'; style-src '
     1 failed
```
**(c3) c1 と c2 の両方 → (2) のイベント属性の筋（html・markdown）と (7)(8) が落ちる**:
```
     ✘   1 src/specs/display-isolation.spec.ts:21:1 › (1) 枠の sandbox 属性と応答ヘッダに allow-same-origin が無く、枠の中から親・cookie・保存領域・アプリへの通信に触れない
     ✘   2 src/specs/display-isolation.spec.ts:75:3 › (2) 中身の <script>・onerror・onclick・javascript: が動かない（html）
     ✘   3 src/specs/display-isolation.spec.ts:75:3 › (2) 中身の <script>・onerror・onclick・javascript: が動かない（markdown）
     ✘   4 src/specs/display-isolation.spec.ts:90:3 › (2b) 取り除き: 危険な要素・属性が文書に入っていない（html）
     ✘   5 src/specs/display-isolation.spec.ts:90:3 › (2b) 取り除き: 危険な要素・属性が文書に入っていない（markdown）
     ✓   6 src/specs/display-isolation.spec.ts:101:1 › (3) 外の画像・stylesheet・@import・背景・フォントへの要求が 0（ブラウザの要求の記録と、待ち受けに届いた要求）
     ✓   7 src/specs/display-isolation.spec.ts:121:1 › (4) meta refresh・form の送信・base・iframe・object・embed で枠が移らず、外を読まない
     ✓   8 src/specs/display-isolation.spec.ts:142:1 › (5) 親のページの別の iframe から同じ形の message（display-ready・action）を送っても、ブラウザは display.action を送らない
     ✓   9 src/specs/display-isolation.spec.ts:157:1 › (6) 枠が移った場合: 面が閉じ、トーストが出て、display.report(navigated) が送られ、events に display.closed(navigated)。直後の html の set は通る
     ✘  10 src/specs/display-isolation.spec.ts:179:1 › (7)(8) 端末にフォーカスがあるとき、autofocus つきの中身・フォーカスを奪い続ける中身が来ても、打った文字は全部 pane に届き、activeElement は iframe にならない
     ✓  11 src/specs/display-isolation.spec.ts:198:1 › (10) 知らない形式（script-html・未知）: 枠が作られず固定の文言。形式が替わると iframe が別の要素になる
       Expected substring: "script-src 'self';"
       Received string:    "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox; default-src 'none'; script-src 'self' 'unsafe-inline'; style-src '
       Received: "onclick"
```
**(d) `DisplayFrame.vue` の送り主の検査・`display-ready` の 1 回だけ・状態の検査を外し、`window` の `message` をそのまま受ける版 → (5)「送られない」と、単体（別の窓からの `display-ready`）が落ちる**:
```
     ✘  1 src/specs/display-isolation.spec.ts:142:1 › (5) 親のページの別の iframe から同じ形の message（display-ready・action）を送っても、ブラウザは display.action を送らない
       - Expected  - 1
       + Received  + 7
     1 failed
   [DisplayFrame.test.ts]
   × 送り主の窓が違う display-ready は丸ごと無視する（待ちを打ち切らない） 10ms
   ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
         Tests  1 failed | 13 passed (14)
```
（(5) は初め、親のページの別の iframe の `srcdoc` のインラインのスクリプトから送っていたが、アプリ本体の CSP がそれを止めるので、**この対照が落ちなかった**（空振り）。Playwright が別の iframe の中から式を動かして `postMessage` する形に直した。上は直した後。）

**(e) `sanitize.js` の `meta` の取り除き（と `http-equiv` の属性の取り除き。同じ守りの 2 層）を外した版 → (4) の「枠が移らない」が落ちる（同じ origin の宛先へ移り、面が閉じる）**:
```
     ✓   1 src/specs/display-isolation.spec.ts:21:1 › (1) 枠の sandbox 属性と応答ヘッダに allow-same-origin が無く、枠の中から親・cookie・保存領域・アプリへの通信に触れない
     ✓   2 src/specs/display-isolation.spec.ts:75:3 › (2) 中身の <script>・onerror・onclick・javascript: が動かない（html）
     ✓   3 src/specs/display-isolation.spec.ts:75:3 › (2) 中身の <script>・onerror・onclick・javascript: が動かない（markdown）
     ✓   4 src/specs/display-isolation.spec.ts:90:3 › (2b) 取り除き: 危険な要素・属性が文書に入っていない（html）
     ✓   5 src/specs/display-isolation.spec.ts:90:3 › (2b) 取り除き: 危険な要素・属性が文書に入っていない（markdown）
     ✓   6 src/specs/display-isolation.spec.ts:101:1 › (3) 外の画像・stylesheet・@import・背景・フォントへの要求が 0（ブラウザの要求の記録と、待ち受けに届いた要求）
     ✓   7 src/specs/display-isolation.spec.ts:124:3 › (4) meta refresh・form の送信・base・iframe・object・embed で枠が移らず、外を読まない（html-head）
     ✘   8 src/specs/display-isolation.spec.ts:124:3 › (4) meta refresh・form の送信・base・iframe・object・embed で枠が移らず、外を読まない（html-body）
     ✘   9 src/specs/display-isolation.spec.ts:124:3 › (4) meta refresh・form の送信・base・iframe・object・embed で枠が移らず、外を読まない（markdown）
     ✓  10 src/specs/display-isolation.spec.ts:148:1 › (5) 親のページの別の iframe から同じ形の message（display-ready・action）を送っても、ブラウザは display.action を送らない
     ✓  11 src/specs/display-isolation.spec.ts:170:1 › (6) 枠が移った場合: 面が閉じ、トーストが出て、display.report(navigated) が送られ、events に display.closed(navigated)。直後の html の set は通る
     ✓  12 src/specs/display-isolation.spec.ts:192:1 › (7)(8) 端末にフォーカスがあるとき、autofocus つきの中身・フォーカスを奪い続ける中身が来ても、打った文字は全部 pane に届き、activeElement は iframe にならない
     ✓  13 src/specs/display-isolation.spec.ts:211:1 › (10) 知らない形式（script-html・未知）: 枠が作られず固定の文言。形式が替わると iframe が別の要素になる
       Error: expect(locator).toBeAttached() failed
       Expected: attached
     2 failed
```
（html の `<meta>` は head に書くと断片に届かない〔取り除き以前に捨てられる〕ので、(4) は html の head・html の body・markdown の 3 通りにした。落ちたのは body と markdown。）

**(f) `DisplayFrame.vue` の `load` の回数の検知を外した版 → (6)「すぐ閉じて、理由が `navigated`」が落ちる**:
```
     ✘  1 src/specs/display-isolation.spec.ts:170:1 › (6) 枠が移った場合: 面が閉じ、トーストが出て、display.report(navigated) が送られ、events に display.closed(navigated)。直後の html の set は通る
       Error: expect(locator).toHaveCount(expected) failed
       Expected: 0
       Received: 1
           14 × locator resolved to 1 element
     1 failed
   [DisplayFrame.test.ts]
   × load の 2 回目で iframe を外して report(navigated)（paneId と format つき） 8ms
   ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
         Tests  1 failed | 13 passed (14)
```
**(g0) `framePage()` が知らない形式を静的な頁へ落とす版（`null` を返さない）→ (10)「枠が作られない」が落ちる**（`frameattached` が 0 でない）。このとき `frame.js` が `rejected` を返して中身が描かれないこと（二重の守り）は、`frameJs.test.ts` が見ている:
```
     ✘  1 src/specs/display-isolation.spec.ts:211:1 › (10) 知らない形式（script-html・未知）: 枠が作られず固定の文言。形式が替わると iframe が別の要素になる
       Expected: 0
       Received: 1
     1 failed
   [DisplayFrame.test.ts + frameJs.test.ts]
   × 静的な形式だけ頁を持つ。未知の形式（script-html を含む）は null 4ms
        × 未知の形式は枠を作らず固定の文言。形式が替わると iframe が別の要素になる 5ms
   ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
         Tests  2 failed | 20 passed (22)
```
どの版も、戻した後に `git diff` が空であること、再ビルドして該当の spec が全部通ることを確かめた。


## PR2 の独立レビューを受けた直し（2026-10-08）

レビュー: must 0・should 3・nit。判断は「直してから」。直した内容は `decisions.md` D31。

### 1・2. 名前の上書き（DOM clobbering）: 直す前で落ちることと、直した後

`sanitize.js`・`frame.js` が、中身の要素・`document` のプロパティを直接読んでいた。`display-isolation` の (11)（`<form onclick onsubmit formaction srcdoc autofocus><input name=…>` で、form の属性が全部消える）と (12)（`<img name=createElement>` などの後の `render`）を足した。
**直す前の版（直前のコミット `fd8cfb8` の `sanitize.js`・`frame.js`）で流した出力**（(11) の 12 通りのうち、実ブラウザで差し替えが効いて落ちたのは 4 通り。ほかは差し替えられても属性の取り除きが通った）:
```
     ✘   1 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=attributes でも、form の on*・formaction・srcdoc・autofocus が消える
     ✘   2 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=getAttribute でも、form の on*・formaction・srcdoc・autofocus が消える
     ✘   3 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=removeAttribute でも、form の on*・formaction・srcdoc・autofocus が消える
     ✓   4 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=setAttribute でも、form の on*・formaction・srcdoc・autofocus が消える
     ✘   5 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=hasAttribute でも、form の on*・formaction・srcdoc・autofocus が消える
     ✓   6 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=tagName でも、form の on*・formaction・srcdoc・autofocus が消える
     ✓   7 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=localName でも、form の on*・formaction・srcdoc・autofocus が消える
     ✓   8 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=children でも、form の on*・formaction・srcdoc・autofocus が消える
     ✓   9 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=parentNode でも、form の on*・formaction・srcdoc・autofocus が消える
     ✓  10 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=firstChild でも、form の on*・formaction・srcdoc・autofocus が消える
     ✓  11 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=remove でも、form の on*・formaction・srcdoc・autofocus が消える
     ✓  12 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=querySelectorAll でも、form の on*・formaction・srcdoc・autofocus が消える
     ✘  13 src/specs/display-isolation.spec.ts:245:1 › (12) 生きた document が中身の name・id で上書きされても、次の render が描かれる（createElement・importNode・body・querySelecto
       - Expected  - 1
       + Received  + 7
       - Array []
       + Array [
       +   "onclick",
       +   "onsubmit",
       +   "formaction",
       +   "srcdoc",
       +   "autofocus",
       + ]
       Error: expect(locator).toBeAttached() failed
```
直した後（同じ spec 全体）:
```
     ✓   1 src/specs/display-isolation.spec.ts:21:1 › (1) 枠の sandbox 属性と応答ヘッダに allow-same-origin が無く、枠の中から親・cookie・保存領域・アプリへの通信に触れない
     ✓   2 src/specs/display-isolation.spec.ts:75:3 › (2) 中身の <script>・onerror・onclick・javascript: が動かない（html）
     ✓   3 src/specs/display-isolation.spec.ts:75:3 › (2) 中身の <script>・onerror・onclick・javascript: が動かない（markdown）
     ✓   4 src/specs/display-isolation.spec.ts:90:3 › (2b) 取り除き: 危険な要素・属性が文書に入っていない（html）
     ✓   5 src/specs/display-isolation.spec.ts:90:3 › (2b) 取り除き: 危険な要素・属性が文書に入っていない（markdown）
     ✓   6 src/specs/display-isolation.spec.ts:101:1 › (3) 外の画像・stylesheet・@import・背景・フォントへの要求が 0（ブラウザの要求の記録と、待ち受けに届いた要求）
```
（`26 passed`。(11) 12 件・(12) 1 件を含む。）

### 3. E2E の空振りと、負の対照

(a) 旧 (7)(8) は、中身が `onerror` と `autofocus` で、取り除きと CSP で動かず、奪取の実装が壊れても通る空振りだった。作り直した: 端末にフォーカスがある状態で、`autofocus`・`tabindex`・`input`・`textarea` を含む中身を `set`・更新・形式替え・帯の追加して、毎回 `document.activeElement` が端末のままで、打った文字が pane に届くこと。
**観測した事実（守りには数えない）**: 別 origin の枠の `autofocus` は、ブラウザが親の文書のフォーカスを動かさない（枠の `document.hasFocus()` は `false`。Chromium）。奪取そのものへの備え（`focus()` を呼び続ける中身）は、作者のスクリプトが動く形式（PR3）の範囲で、静的な形式では作れない。

(b) 取り除きと CSP の**両方**を外した版（`script` と `on*` の取り除きを外し、`script-src` に `'unsafe-inline'` を足す）→ スクリプトが動いて (2) が落ちる（html・markdown）。ほかに (1)（ヘッダの値）・(2b)・(11) も落ちる:
```
     ✘   1 src/specs/display-isolation.spec.ts:21:1 › (1) 枠の sandbox 属性と応答ヘッダに allow-same-origin が無く、枠の中から親・cookie・保存領域・アプリへの通信に触れない
     ✘   2 src/specs/display-isolation.spec.ts:75:3 › (2) 中身の <script>・onerror・onclick・javascript: が動かない（html）
     ✘   3 src/specs/display-isolation.spec.ts:75:3 › (2) 中身の <script>・onerror・onclick・javascript: が動かない（markdown）
     ✘   4 src/specs/display-isolation.spec.ts:90:3 › (2b) 取り除き: 危険な要素・属性が文書に入っていない（html）
     ✘   5 src/specs/display-isolation.spec.ts:90:3 › (2b) 取り除き: 危険な要素・属性が文書に入っていない（markdown）
     ✘  13 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=attributes でも、form の on*・formaction・srcdoc・autofocus が消える
     ✘  14 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=getAttribute でも、form の on*・formaction・srcdoc・autofocus が消える
     ✘  15 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=removeAttribute でも、form の on*・formaction・srcdoc・autofocus が消える
     ✘  16 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=setAttribute でも、form の on*・formaction・srcdoc・autofocus が消える
     ✘  17 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=hasAttribute でも、form の on*・formaction・srcdoc・autofocus が消える
     ✘  18 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=tagName でも、form の on*・formaction・srcdoc・autofocus が消える
     ✘  19 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=localName でも、form の on*・formaction・srcdoc・autofocus が消える
     ✘  20 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=children でも、form の on*・formaction・srcdoc・autofocus が消える
     ✘  21 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=parentNode でも、form の on*・formaction・srcdoc・autofocus が消える
     ✘  22 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=firstChild でも、form の on*・formaction・srcdoc・autofocus が消える
     ✘  23 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=remove でも、form の on*・formaction・srcdoc・autofocus が消える
     ✘  24 src/specs/display-isolation.spec.ts:230:3 › (11) 取り除き: form の子が name=querySelectorAll でも、form の on*・formaction・srcdoc・autofocus が消える
     17 failed
     9 passed (1.1m)
```
(c) 外への要求の筋 (3) の、CSP を緩めた対照（`default-src *`・`style-src * 'unsafe-inline'`・`img-src *`・`font-src *`。取り除きは残す）→ (3) だけが落ち、待ち受けに **`@import`（`/b.css`）・`<style>` の `url()` の背景（`/bg.png`）・インラインの `style` の背景（`/d.png`）・フォント（`/f.woff2`）の 4 件**が届く。CSP が外への要求を止めている証拠:
```
     ✘   6 src/specs/display-isolation.spec.ts:101:1 › (3) 外の画像・stylesheet・@import・背景・フォントへの要求が 0（ブラウザの要求の記録と、待ち受けに届いた要求）
     1 failed
     25 passed
   - Array []
   + Array [ "/b.css", "/bg.png", "/d.png", "/f.woff2" ]      （`expect(sink.requests()).toEqual([])` の差分）
```
（`<link rel=stylesheet>`・`<img src>`・`background` 属性は、取り除きが先に消すので、CSP を緩めても届かない。二重の守りの片方。）

(d) 対照 (b)（`allow-same-origin` を足した版）で落ちるのは、`display-isolation` の中では (1) だけ（9 件中 1 件。上の「負の対照」の (b)）。つまり (1) が `allow-same-origin` の単独の守りで、ほかの筋はそれを見張っていない。

### 4〜7（nit）の確かめ
- `DisplayController` の中身の取得: 受け取った大きさが `totalBytes` と合わない・空の片が `eof` でないときは取り直し、`REFETCH_MAX` 回やっても合わなければ固定の文言「表示の中身を取得できませんでした」（`store.contentFailed`）。単体テストあり。
- 接続が切れて台帳を空にしたとき（`store.clear`）、枠にフォーカスがあれば端末へ戻す（`clear` がフォーカスの印を下ろさず、枠の部品が外れるときに下ろして端末へ戻す）。単体テストあり。
- 題の書字方向を変える文字（U+202A〜202E・U+2066〜2069）: `checkDisplaySet`（サーバ・sodactl 共通）の制御文字の検査に足した。protocol・cli の単体テストあり。
- モバイルの `prefix+i`: パネルの枠が載っていなければ重ね表示を開く（トーストなし）。単体・E2E（`display-mobile`）あり。

### 9. 初回の案内のトーストと、帯・パネルの見出し（見た目）
右上の「ctrl+b ? でキー一覧」は、既存の `Toast.vue` の置き場所（右上の固定。20261005-notify-bell）。**一度だけ出て、4 秒で消え、クリックを通す**（`.toast:not(.toast-sticky) { pointer-events: none }`）ので、帯・パネルの［×］・たたむを押すのを妨げない。消えない知らせ（`sticky`。［移動］・［×］つき）は、消すまで右上に残り、パネルの見出しに重なる——これも既存の置き場所の決まりで、モバイル以外は動かさない。**理由を付けて「そのまま」**。

### ask の側の取り除き（`packages/web/public/ask-view/markdown.js`）に同じ穴があるか
実ブラウザで確かめた（`/ask-view/markdown.html` を直に開き、自分宛てに `ask-view` の知らせを送った）。`<form><input name="remove"></form>` を含む Markdown で、`sanitize` の `el.remove()` が `TypeError`（`remove` が子の入力に差し替わる）→ 枠は**ソースの文字表示（`plain()`）へ落ちる**。**閉じる側に倒れる（実行・移動には至らない）が、取り除きの途中で止まり、整形されない**。`attributes` などは読まないので、属性が残る形の穴は見つからなかった。
`html.html`（スクリプトが動く枠）は、もともと取り除きを掛けない。この PR では直さない。別の作業の候補（低）: `ask-view/markdown.js` の `sanitize` が、要素のメソッドを直接呼ばず、プロトタイプのメソッドを `call` で使う。


# PR3（スクリプトが動く形式 `script-html`。T23〜T30）のテスト結果（2026-10-08。ブラウザ: **Chromium 153.0.8010.12**、Playwright 同梱）

ブランチ `feature/ext-display-script`（`3c15e4d` から）。設計から外れた点は `decisions.md` D32。

## 自動テスト

- `pnpm build`・`pnpm typecheck`: 通った。
- `pnpm test`: 8629 件中 8626 件が通り、**3 件が落ちた**——すべて既知の `packages/server/src/tui.integration.test.ts`（worktree のパスが長いと main でも落ちる）。それ以外の失敗は無い。
- 追加した単体・結合: protocol（`checkDisplaySend`・`script-html`・定数・schema）／server（`DisplayService` の `send`・pane ごとの回数と冷却〔5 分の 1 ミリ秒前は断り、ちょうどで通る〕・`source`・閉じた面／形式の替わった面への知らせ・結合 5 件）／sodactl（`--script-html-file`・`send`・unsupported）／web（`scriptHost.test.ts`＝土台、`focusGuard`・`focusOrigin`・`engageEntry`、`DisplayFrameScript.test.ts` 21 件、`DisplayScriptMark.test.ts`、`DisplayController`、`frame.js` の `foreign-focus`）／HttpServer（`script.html` のヘッダが設計の文字列と一致・`script-src` に `'self'` が無い・`frame.html` は不変）。

## 実測した前提（tasks.md の「不確かな点」）

| 前提 | 結果 |
|---|---|
| 差し込みで親から見た枠の `load` が 1 回のまま（点 7・u9。合否） | **1 回のまま**（1.5 秒見た）。インラインのスクリプトは文書の順・`DOMContentLoaded`/`load`/`<body onload>` が 1 回ずつ・`eval`・`new Function`・`<script type=module>` が動く |
| 差し込みで、ふつうの HTML と大きなライブラリ（点 8・u5） | marked の UMD・Canvas のグラフ・**Chart.js 4.4.7**（205 KB）が動く（`display-script.spec.ts`。Chart.js は `SODA_E2E_CHARTJS` を渡したときだけ） |
| 枠のスクリプトの `focus()` で親が気づいて戻せる（点 5・u1・u2） | **気づけて、戻せた**。親の `document.activeElement` が iframe になり、親が覚えた要素へ `focus()` し直すと戻った。**ただし**、枠から親の端末へ戻る途中（`focus`/`blur`/`focusout`）では `activeElement` がまだ iframe を指す（→ D32 の 3）。戻し先が `body` のとき: 利用者が選んでいる pane の端末へ戻り、打ったキーが届いた |
| ［操作する］・`prefix+i` の後の `pointerup`/`mouseup`/`touchend`/`keyup` が枠へ届かない（点 10・u10） | **届かない**（3 つの入口で確認）。ただし `prefix+i` は xterm.js が `keyup` の中で自分へフォーカスを戻すので、始めるのを `keyup` の処理のあとにした（D32 の 4） |
| アプリの CSP が、外の origin・`localhost` への枠の移動を止めるか（点 6・u3） | **止めた**（下の実測） |

## 「確かでない」の項目の実測（合否にしない）

出力の `MEASURE …` から。**ほかのブラウザは未確認**。

| 項目 | 結果 |
|---|---|
| WebRTC（`RTCPeerConnection`、STUN の宛先を待ち受けの UDP に） | **止まらなかった**: `offer` が作れ、UDP が **5 パケット**届いた。CSP の `webrtc 'block'` は「Unrecognized Content-Security-Policy directive 'webrtc'」で解釈されない |
| `history.back()`・`go(-1)`・`go(-2)`・`pushState` | アプリのページの URL は変わらない（`#b` → `#b`）。枠自身の履歴が動いて枠が移り、面は `navigated` で閉じた（`history.length` は 4 → 5） |
| `<link rel=dns-prefetch\|preconnect\|prefetch\|prerender\|modulepreload>` | 待ち受けへの **TCP 接続は届かなかった**（0・1.5 秒見た）。**`dns-prefetch` は DNS の問い合わせだけが外へ出るので、ループバックの待ち受けでは測れていない（出る前提で考える）** |
| クリップボード | 操作を始めて枠の中をクリックする前: `execCommand("copy")` は `false`。クリックした後: **`true` で、クリップボードが書き換わった**（`readText` が `copy-me`）。`navigator.clipboard.writeText` は前後とも `NotAllowedError` |
| 音 | 前: `AudioContext` が `suspended`・`audio.play()` が `NotAllowedError`。クリックの後: `AudioContext` が `running`・`play()` が成功（**止まらなかった**） |
| 全画面・Picture-in-Picture | `requestFullscreen` は拒否（`TypeError`）。`document.pictureInPictureEnabled` は偽（**止まった**） |
| `window.name` | 同じ origin の移った先で `carried-secret` が**読めた**（運べる） |
| 兄弟の枠（ほかの面）への `postMessage`・`MessagePort` の受け渡し | **届く**（兄弟が `hello-from-a`・port を受け、port 越しの `over-port` も受けた）。`display.action` にはならなかった（`display-script-isolation`） |
| 兄弟の枠の `location` の読み書き | **止まった**（どちらも `SecurityError`。書き換えられた側の面が閉じる筋は、書き換えられないので空振り） |
| 兄弟の枠への `focus()` | 呼べる（例外なし）が、**フォーカスは兄弟へ移らなかった**（親の `activeElement` を 5ms ごとに記録: `TEXTAREA` のみ）。利用者が操作を始めて枠の中をクリックした直後（ユーザー操作の後）に呼んでも、移らなかった（`IFRAME[script]` のまま）。→ 限界 12 のフォーカスの部分は「止まった」。静的な枠の `foreign-focus` の戻し処理は、このブラウザでは E2E で通らない（単体で確かめた） |
| `focus-without-user-activation=()` | **効かない**（コンソール「Origin trial controlled feature not enabled」） |
| 枠が外の origin（待ち受け）・`localhost` の別のポート・応答が 204 の宛先へ `location.href` | 5 試行とも**待ち受けに要求が届かなかった**（アプリの CSP が止める）。外・localhost・204 は面が閉じた（`navigated`）。`window.stop()` を直後に呼んだ 2 試行（204・応答しない口）は、面が**閉じずに残った**（枠の文書は生きていた）。文書を置き換えない移動で `load` が起きるかは、CSP が先に止めるので測れなかった |
| 隔離の探り（`display-script-isolation`） | `parent.document`・`top.document`・`cookie`・`localStorage`・`sessionStorage`・`indexedDB`・兄弟の `document`・`top.location`/`parent.location` の読み書き・Service Worker は `SecurityError`。外への `fetch`/XHR/`WebSocket`/`EventSource`/画像/`link`/`script src`/フォント/フォーム/`window.open`/`a target=_blank`/`alert`/`confirm`/`prompt`/ダウンロードは、待ち受けに 0。試みた 6 件の要求は `csp` で失敗。**同じ origin の `<script src="/display-view/frame.js">` も読めなかった**。`Worker(blob)` は作れたが、外への要求は 0 |
| 閉じるまでに枠へ入ったキーの数（限界 1） | 15ms おきにキーを打ち、20ms おきにフォーカスを取る中身: 打った 21 キーのうち**枠に入ったのは 1 つ**、20 は pane に届いた（軽い負荷。下限） |
| 重いスクリプト（15 秒の同期ループ） | 約 10 秒で `unresponsive` で閉じた（冷却に入らない）。アプリのページへの問い合わせは遅れなかった（最大 27ms。サンプルは粗い） |
| 裏に回しても閉じないか（(vi)） | ヘッドレスでは別のタブを前に出しても `visibilityState` は `hidden` にならなかった（`visible` のまま）。見えない状態を `visibilityState` の上書きで再現して 30 秒置いたところ、閉じず、`display.report` も送られなかった |
| 端末を押して操作を終えるとき、枠が `blur` の中で `focus()` を呼び返す中身（(x)） | このブラウザでは、フォーカスは端末へ移り、横取りとしては数えられなかった（報告 0）。`pointerdown` の備えは、移らないブラウザ向け（単体で確かめた） |
| 変換中（IME）の文字の行方 | **測れなかった**（ヘッドレスの Chromium に IME が無い） |


## E2E の件数

`display*.spec.ts` の全部（PR2 の分を含む）＋スクリーンショットの spec を 1 回流した結果: **98 件が通り、2 件が落ちた**。2 件とも PR3 の変更で古くなった PR2 の筋で、直して通った:
- `display-isolation (10)`: 「未知の形式」に `script-html` を使っていたが、PR3 から既知の形式。未知の形式を 2 つ（`future-x`・`future-y`）にした。
- `display-flows (2)`: 入力途中の欄の値の保持。`fill()` はポインタ無しでフォーカスを入れるので、静的な枠は「よそからフォーカスが来た」（`foreign-focus`）と見て親が戻し、間欠的に落ちた。利用者は押すか `Tab` で入るので、`click()` してから `fill()` に直した（5 回続けて通った）。
  **補足**: ポインタもキーも使わずにスクリプトでフォーカスを入れる自動操作（Playwright の `fill`・`focus()`）は、静的な枠でも、利用者の入力ではないものとして元の場所へ戻される。
既存の E2E の `key-bindings`・`workspace-tab-pane`・`mobile` は流していない（触っていないため。既知の失敗の対象）。スクリーンショットは `/tmp/claude-1000/-workspaces-sodashitsu/957621e5-6a11-4044-ad8d-c86e30053090/scratchpad/display-pr3/`（01 覆いのあるグラフのパネル・02 操作中・03 フォーカスを取り続ける面・04 閉じたあとのトースト）。

## 負の対照（T30。生の結果）

対策を外した版を作り、対応するテストが落ちること・戻して通ることを確かめた（`mutate.py`/`neg.py` の記録。落ちたテストの名前は先頭の部分）。

| 版 | 外した結果 | 戻した結果 |
|---|---|---|
| (m) サーバが回数を面の id ごとに数える | server 単体・結合 5 件が落ちた（「3 回目で全部閉じる」「close→set の後の 1 回で閉じる」「2 つの接続から」ほか） | 通った |
| (h5) `report` を操作の桶で捨てる | 「操作の桶を空にした直後の report が数えられる」が落ちた | 通った |
| (h6) 面の無い知らせを paneId・format を見ずに `display_closed` で捨てる | server 単体・結合 7 件が落ちた | 通った |
| (j) 受け口の `displaySendOp` が引数の `paneId` を対象にする | 「pane A を名乗って pane B の面へ send できない」が落ちた | 通った |
| (f) 枠の sandbox 属性と応答ヘッダの**両方**に `allow-same-origin` | `display-script-isolation` の隔離の筋が落ちた | 通った |
| (f) 属性だけ／(f2) 応答ヘッダだけ | **落ちなかった**（sandbox は累積で、もう片方が止める。二重の守り） | 通った |
| (i) CSP の `default-src` を `*` | 隔離の筋が落ちた | 通った |
| (i2) `script-src` に `'self'` を足す | 「同じ origin の `<script src>` が読めない」で隔離の筋が落ちた | 通った |
| (h) `load` の回数の検知を外す | `display-script-nav` の (i)(ii)(viii)×2・reload の 5 件が落ちた | 通った |
| (g1) 横取りの検知（戻す・知らせる）だけを外す（覆いは残す） | (5)(i) が落ちた（面が閉じない） | 通った |
| (g2) 覆いだけを外す（検知は残す） | (7)「覆いがある間、枠の中のボタン・覆いを押しても始まらない」が落ちた | 通った |
| (g3) 操作の開始を押した時点で行う | (7)「始めた押下の残りが枠に届かない」が落ちた | 通った |
| (k) 枠からの `key` を操作中でなくても受け、prefix も受ける | `focusGuard`・`DisplayFrameScript` の単体が落ちた | 通った |
| (l) 戻す先を、覚えた元の場所でなく面の pane の端末にする | (vi)（フォーカスが 2 つ目の pane の端末に戻る）が落ちた（`Expected: 1 / Received: 0`）。最初は typing だけを見ていて**落ちなかった**ので、DOM の `activeElement` を見る筋に強めた | 通った |
| (l2) 元の場所の追跡が、枠・覆い・［操作する］も覚える | `focusOrigin` の単体が落ちた | 通った |
| (n) 枠の鍵から形式と版を外す／(n2) `DisplayFrame` が形式の変化で作り直さない | **どちらか片方だけでは落ちなかった**（(n) は E2E、(n2) は単体で、もう片方が止める。n2 の単体は落ちた）／**両方外すと** (3b) が落ちた | 通った |
| (o) 静的な枠の `foreign-focus` の戻し | 単体が落ちた。**E2E は落ちない**（このブラウザは、兄弟へのフォーカスが移らない） | 通った |
| (p) 操作を終える判定から「`activeElement` が枠でなくなった」を外す | `focusGuard` の単体が落ちた | 通った |
| (p2) 操作中に枠でない場所を押したら操作を終える処理（`pointerdown`）を外す | 単体が落ちた。**E2E は落ちない**（このブラウザは、端末を押すとフォーカスが端末へ移る） | 通った |
| (h4) `render` を形式・版の一致を見ずに送る | `DisplayFrame`・`DisplayFrameScript` の単体 2 件が落ちた | 通った |
| (h7) 通り道と `render` を最初の `load` を待たずに渡す | 「display-ready が load より先でも、load の前には送らない」が落ちた | 通った |
| (h8) `display-ready` の合い札を確かめない | 合い札の単体 2 件が落ちた | 通った |
| (h10) 片づけのときの横取りの知らせを外す | 単体が落ちた | 通った |

**実行していない版**: (h3)（土台が `document.open(); document.write()` で入れる）——設計は「`load` が 2 回になるブラウザでだけ落ちる」としていて、土台を書き換える手間が大きいので、実行していない。(h9)（合い札の合う 2 回目の合図を受ける）——`phase` の検査と `readySeen` の二重で、片方だけ外しても落ちない作り。(h5) の画面側（`report` を `sendAction` の頻度の制限に入れる）は、`DisplayController.test.ts`「100 回続けても全部送る」が見る。


## PR3 の独立レビューを受けた直し（D33）

レビュー: must 0・should 4・nit。直した内容は `decisions.md` D33。**直す前（レビュー前の版）に新しい E2E を流した生の出力**（`display-script-review.spec.ts`。6 件中 4 件が落ちた。落ちなかった 2 件は、直す前から成り立つ対照）:

```
  ✘  1 (レビュー 1) スクリプトの面が載っていないとき: 静的な面の欄へプログラムでフォーカスを入れても、端末へ戻されない
       Expected substring: "IFRAME"   Received string: "TEXTAREA"          ← 利用者の入力中の欄から追い出された
  ✓  2 (レビュー 1) スクリプトの面が載っているとき: 静的な面へプログラムでフォーカスが入ると、元の場所へ戻される
  ✘  3 (レビュー 2) 単発: window.focus(); parent.focus() … 元の場所へ戻り、打った文字が端末に届く。取られた回数が進む
       Expected: >= 1   Received: 0                                         ← 検知されず、数えられない
MEASURE focus-drop-loop: typed=91 reached-pane=0 steal-reports=0            ← 91 キー打って pane に 0
  ✘  4 (レビュー 2) 4ms ごとの繰り返し … 3 回で面が閉じ、その pane は冷却に入る
       Expected: >= 3   Received: 0
  ✓  5 (レビュー 2) 利用者が余白を押して端末からフォーカスが外れても、数えない
  ✘  6 (レビュー 3) isComposing・Function.prototype.call を差し替えた中身でも、土台の Esc が効き、port は拾われず、［操作を終える］でも端末へ戻れる
       Expected: visible（［操作を終える］が無い）
```

直した後: 6 件とも通り（`MEASURE focus-drop-loop: typed=75 reached-pane=75 steal-reports=9`）、レビュー 5 の E2E「知らせが見出しに重ならない」も通る。知らせを右下へ寄せる直しを外した版では、「`.pane-panel-head` と知らせが重ならない」で落ちる。

- 追加した単体: `scriptHost.test.ts`（実行時に `.call`/`.apply`/`.bind`/配列メソッド/`for...of`/スプレッドを使わない静的な検査・`Function.prototype.call`/`apply`・`KeyboardEvent.prototype.isComposing`・`Object.prototype` の setter を差し替えても `Esc`・`ping`・`soda.action`・`onMessage` が動く・合成の `Esc` は取り次がない）、`focusDrop.test.ts`（6 件）、`DisplayFrameScript.test.ts`（スクリプトの枠が載っていないと `foreign-focus` で戻さない・ウィンドウから戻った直後は戻さない・載っているときは戻す）。
- `display-flows (2)` は、`click()` を先に入れた直しを取り消し、元の `fill()` だけで通ることを確かめた（スクリプトの面が載っていない状態）。
- 実測の言い直し（docs と突き合わせた）: `dns-prefetch` は「TCP の接続が届かなかった。DNS の問い合わせが外へ出るかは測れていない」。兄弟の枠への `focus()` は「呼べるが、Chromium 153 では移らなかった」。そのほかの行（WebRTC・クリップボード・音・`window.name`・`postMessage`/`MessagePort`・`location`・全画面・PiP・外への移動・隔離の探り）は、docs の「止まった」「止まらなかった」と測定の出力が同じ向きであることを 1 項目ずつ確かめた。
- 結果: `pnpm build`・`pnpm typecheck` 通過。`pnpm test` は 8640 件中 8637 件が通り、落ちたのは既知の `tui.integration.test.ts` の 3 件だけ。display の E2E は全部（PR2 の分を含む）通った（レビューの 6 件を足して 106 件。［操作を終える］の文言変更で落ちた 2 件の期待を直して通った）。


### 再レビュー（指摘 2 の直し残り）を受けた、フォーカスの脱落の作り直し（D34）

**直す前（D33 の版。クリックの直後 1 秒は戻しも数えも止め、数え先は選択中の pane の最初の面）に、新しい E2E を流した生の出力**（8 件中 6 件が落ちた。落ちなかった 2 件は、利用者が余白を押した・ダイアログ／pane を閉じた、の対照）:

```
  ✘ 単発: window.focus(); parent.focus() … 数えず、面は閉じず、冷却に入らない        Expected: 0   Received: 1   ← 数えて、サーバへ知らせた
MEASURE focus-drop-loop-4ms: typed=70 reached-pane=70
  ✘ 4ms ごとの繰り返し … 面は自動では閉じず・冷却に入らず、利用者への知らせが出る  Expected: 0   Received: 3   ← 面が閉じ、冷却に入った
MEASURE focus-drop-rounds: interval=300ms cumulative-reached=[3,5,6,11,14,15]
MEASURE focus-drop-after-click: interval=300ms typed=60 reached-pane=15 lost=45
MEASURE focus-drop-rounds: interval=500ms cumulative-reached=[7,12,17,22,26,30]
MEASURE focus-drop-after-click: interval=500ms typed=60 reached-pane=30 lost=30
MEASURE focus-drop-rounds: interval=900ms cumulative-reached=[10,16,20,22,23,33]
MEASURE focus-drop-after-click: interval=900ms typed=60 reached-pane=33 lost=27
  ✘ 実測（300・500・900ms）: 失われるキーは少数 … Expected: > 48   Received: 15 / 30 / 33
  ✘ 無関係な pane を冷却に入れない（p1 に無害な面・p2 に落とす面） … Expected: 0   Received: 11   ← 11 件の focus_steal が送られ、p1 の面が閉じた
  ✓ 不要な戻しが起きない: 余白 / キー一覧・分割して閉じる
```

**直した後の実測**（`MEASURE`。**失われた数**）: 本物のクリックの後に 10 キーずつ 6 回（60 キー。準備の 1 回は数えない）。

| 落とす間隔 | 打った | 端末に届いた | 失われた |
|---|---|---|---|
| 300ms | 60 | 60 | **0** |
| 500ms | 60 | 60 | **0** |
| 900ms | 60 | 60 | **0** |
| 4ms（繰り返し。4 秒間） | 50〜54 | 46〜49 | 4〜7 |

（見回り 25ms・キー間隔 25ms の軽い負荷。0 を保証するものではない。再レビューの手順で、直す前は 51・46・40 が失われたのと対応する。）合否の線は、届いた割合が 80% を超えること（上の実測の 0 から余裕を見た。イベントの時機で数キーは失われうる）。
一緒に、フォーカスの脱落が**数えられず・サーバへ知らせず**、p1 の無害な面・p2 の落とす面のどちらも**冷却に入らず、p1 の面が閉じない**こと、4ms ごとの繰り返しで**利用者への知らせが出る**こと、余白を押して外したフォーカスが**端末へ引き戻されない**こと（`BODY` のまま）、キー一覧のダイアログを開いて閉じる・pane を分割して閉じる、のあとに不要な戻しが起きず（知らせも出ない）フォーカスは利用者の側（`TEXTAREA`）にあることを確かめた。
単体: `focusDrop.test.ts`（9 件）。ask のダイアログ・モバイルの重ね表示を閉じる筋は E2E にしていない——どちらも「フォーカスのあった要素が文書から外れた」で同じ判定（`isShown`）に入るので、単体で見る（外れた・隠れた要素は戻さない）。
