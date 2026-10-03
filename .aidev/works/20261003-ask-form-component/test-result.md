# テスト結果: ask-form の部品（`<ask-form>`）の取り込みと、sodactl ask の画面の置き換え

対象: `feature/ask-form-component` の HEAD。部品は public_docs の 029e17f（version 1.1.1）。合格の根拠にした実行は **Node v24.21.0**（この環境の既定は v20.20.2。`engines` は 24 以上）。実行のたびに Node の版を書く。

## 実行したもの

- `pnpm build`（Node 24）— 終了コード 0。`packages/web/dist/assets/*.js` に `customElements.define("ask-form"` が入っている。
- `pnpm typecheck`（Node 24）— 終了コード 0。
- `pnpm test`（全体。**Node 24**）— 382 ファイル・**6888 passed / 0 failed**・終了コード 0。
- `pnpm test`（全体。Node 20）— 6886 passed / **1 failed** / 1 skipped。落ちた 1 件は `composeServer.graph.integration.test.ts` の「引き継ぎの間は実行を止め…」で、Node 20 に `process.execve` が無く handoff が `unsupported` を返すため。前の作業（20261003-sodactl-ask-socket）から同じで、この work では触っていないファイル。
- `pnpm lint`（Node 24）— 終了コード 1・22 errors（`no-control-regex` 17 件ほか）。**前の作業の HEAD（pane.sock の PR #75 を含む）と同じファイル・同じ件数**で、この work で足した・変えたファイルのものは無い（`.vue` はこのリポジトリの eslint 設定では解析できないので、`AskDialog.vue` は型検査と単体テストで確かめた）。
- 起動確認（smoke。`aidev smoke` 10 本。**Node 24**・別のパスの checkout）— **pass**（下の「起動確認」）。
- E2E（ask 関連 4 つの spec: `ask-form`・`ask-form-mobile`・`ask-form-paging`・`ask-form-extras`。Node 24）— **51 passed / 0 failed**（実装の途中で 3 回、点検の修正の後で 2 回、全部同じ結果。間欠の失敗なし）。
- E2E 全体（22 spec。Node 24）— 172 passed / **18 failed**。落ちた 18 件は設定・テーマ・キー割り当て・モバイル等で、**ask と関係しない。前の作業の記録（`20261003-sodactl-ask-socket/test-result.md`。`main` でも同じ 18 件が落ちることを worktree で確かめた）と、件の名前が 1 件も違わない**。今回だけ落ちた件・前回だけ落ちた件は 0。
- 単体テスト（この work で足した・書き直したもの。上の全体に含まれる）: `packages/protocol` の `ask.test.ts`・`ask.fixtures.test.ts`（共通の試験データ: normalize 29 例・collect 23 例の全例）、`packages/web` の `AskDialog.test.ts`（56 件）・`askFormElement.test.ts`、`scripts/sync-ask-form.test.ts`（19 件）、サーバの `ask.integration.test.ts`（1 件足した）。
- 陰性対照（条項 `regression-negative-control`。実装を一時的に戻して落ちることを確かめた）— `review.md` の「タスク点検ログ」と `decisions.md` D6〜D11 に記録: 空の `showIf`・複数選択の順・値が空文字の選択肢（共通の試験データの該当の例が落ちる）／`spec` を再描画のたびに入れる・描けない定義で取り消さない・固定の行の取り次ぎ・`loadedAskId` を戻さない（単体 15 通り以上）／矢印で確定するよう部品を壊す（回答のフレームが 0 件でなくなる）／新しい E2E の観測（収まる側・決定されていない・`defaultPrevented` の対照・高さの頭打ち）。

## 受け入れ基準ごとの判定

- AC1: pass — `scripts/sync-ask-form.test.ts`（19 件）: 写した先の sha256 が `SOURCE.json` と一致／一時の git リポジトリから写せる／1 バイト変えると `--check` が終了コード 1／書き込みの失敗は終了コード 2／不正な UTF-8 もそのまま写す。`--check --from /workspaces/public_docs` が一致（029e17f）。
- AC2: pass — E2E `ask-form.spec.ts`（部品に替える前と同じ回答の JSON。期待は弱めていない）。
- AC3: pass — E2E: 定義の `title` が何でも（題なし・長い題・出どころの行に似せた題）`[data-ask-origin]` の文言が同じで、部品の題より上にある。単体: 出どころの行が Shadow DOM の外にある。
- AC4: pass — E2E `ask-form-paging.spec.ts`: `page` の題・`paging: 2`・`false`・書かずに高さを超える定義が分かれ収まる定義は 1 枚（対照つき）・`page` を書くと高さでは分かれない・`page` と `paging`（1・`false`）を両方書くと `page` が優先。
- AC5: pass — E2E: 2 ページ目の必須の質問を答えずに決定 → 2 ページ目へ移り `aria-invalid`・入力にフォーカス・sodactl は終わらない／答えて決定で両方のページの回答が出る／`showIf` がページをまたぐ。
- AC6: pass — `ask.fixtures.test.ts`（共通の試験データの全例）。空の `showIf`・複数選択の順の 2 例は直す前に落ちることを確かめた。
- AC7: pass — E2E `ask-form-extras.spec.ts`: 設定のダイアログで dracula・catppuccin-latte・nord と実際に切り替え、部品の地・文字・質問の枠・選択中の枠の色がそのテーマの値になり、テーマ間で違う。
- AC8: pass — E2E `ask-form-mobile.spec.ts`（iPhone 13 相当）: 幅に収まる・1 列・最後までスクロールしてタップ・［決定］が常に見える・タップで即確定。
- AC9: pass — E2E（実際のキー入力・クリック。Chromium）: クリック・タップ・`Enter`・`Space` は、選ばれていない選択肢でも既に選ばれている選択肢でも確定し、ブラウザが送った `ask.answer` は 1 回だけ。矢印だけでは確定しない（`ask.answer` 0 件）。**部品 1.1.0 では `Space`（既に選ばれている選択肢）が確定せず、1.1.1 で直った**（`decisions.md` D10・D11）。
- AC10: pass — E2E: 題・説明・質問・help・選択肢・desc・ページの題・決定ボタン・補足の案内に HTML を書いた定義で、文字として見える・`script`・`img[src]` が無い・`window` に印が付かない・フォームを出して答える間の `securitypolicyviolation` が増えない（画面を開いた時点でアプリ自身が出す 2 件〔`eval`・`wasm-eval`〕を除く。外への `img` で違反が数えられる対照つき）。
- AC11: pass — `ask.test.ts`（`paging`・`page` の値・500 文字・`null`）、E2E: `paging: "many"` は終了コード 2 でダイアログが出ず、ブラウザへ `ask.opened` が来ない。
- AC12: pass — `docs/sodactl.md`（「ページ」「画面の部品と同期」ほか）・`docs/verification.md`・skill・`NOTICE`・`AGENTS.md`・`third_party/ask-form/README.md`。docs の記述は実装と 1 つずつ照合して点検した（`review.md` T9）。`skill.test.ts` と smoke 4 本目（`sodactl skill | cmp`）が通る。
- AC13: pass（一部コードの読みとテスト）— サーバの統合テスト: 読んだままの定義に `page`・`paging` を入れて画面役が受け取る定義に項目がある／不正な `paging` は `invalid_ask_spec`。古い画面は知らない項目を読まないこと（前のコミットの `AskDialog.vue`・`collectAsk`）と、古いサーバが項目を落とすこと（前の `normalizeAskSpec`）はコードで示した。**実物の古い版を並べた確認はしていない**（未検証の穴）。
- AC14: pass — `pnpm build` の `dist` に部品が入っている。`node scripts/package.mjs --no-build --no-install --no-archive` で作った配布物に `third_party/ask-form/ask-form.js`（リポジトリと同じバイト）と部品を含む `packages/web/dist` がある。部品の安全（通信・ページ全体への操作が無い）は、取り込んだ 3 つの版（94a5ef6→816bf82→029e17f）の差分を読んで確かめ、`decisions.md` D9・D11 に残した。
- AC15: pass — `AskDialog.test.ts`: 部品が描けない定義で `controller.cancel` が呼ばれ `answer` は呼ばれない・トーストは固定の文言・`reason` は画面に出ない・取り消し先は `spec` を入れた質問・質問が無くなった後に遅れて届いても取り消さない。
- AC16: pass — `ask.test.ts`: `edit`・`rank`・`table` は `unsupported_type`・`code`・`group`・`image`・`audio`・`preview`・`thumb` は落ちる。E2E: 対応していない型 3 つは `unavailable`・終了コード 0。`filter`・`showValue` は通す（AC16 の読み替え。`decisions.md` D4）: 13 件で絞り込みの欄が出る・`filter: false` で出ない・11 件では出ず `filter: true` で出る・`showValue: false` で値が出ない。
- AC-I1: pass — E2E の既存の件（開く・背景クリックで閉じない・`Esc`・pane が閉じる・sodactl が終わる）。
- AC-I2: pass — E2E: 途中のページの入力欄で `Enter` は次のページへ・最後で決定／ページを移って戻ると答えが残る／絞り込みの欄に文字があるときの `Esc` は消すだけ（`ask.cancel` 0 件）・空のときは取り消し。
- AC-I3: pass — E2E: `Tab` → 選ぶ → `Alt+PageDown` → 選ぶ → `Ctrl+Enter`。固定の行にフォーカスがあるままの `Alt+PageDown`・`Ctrl+Enter`。
- AC-I4: pass — E2E: 開いた直後は `[data-ask-origin]`／ページを移る 5 通り（［次へ］・［戻る］・`Alt+PageDown`・番号・入力欄の `Enter`）のどれでも移った先の番号のボタンにフォーカス／別のページの入力欄にフォーカスがあるまま決定すると、2 ページ目の未回答の質問の入力にフォーカスが移る／閉じると端末へ。
- AC-I5: pass — E2E の既存の件（キーが端末へ流れない・設定のダイアログを潰さない）。`Alt+PageDown` の `defaultPrevented`: 固定の行・部品の中で真、ダイアログが無いとき・ほかのキーで偽（誰が止めたかを区別できる対照つき）。**Firefox・Safari は未検証**。

## 失敗の証跡

このラウンドでは、この work に由来する失敗は発生していない。テスト工程に入る前の実装の途中で出た失敗（点検・E2E の最初の実行・部品 1.0.1／1.1.0 の動きの確認）は、`review.md`「タスク点検ログ」と `decisions.md` D6〜D11 に生の観測とともに残してある。

Node 20 の全体の実行（参考。合格の根拠ではない）:

```
$ node -v
v20.20.2
$ pnpm test
 FAIL  |@sodashitsu/server| src/composeServer.graph.integration.test.ts > composeServer: 連携の実行（20260927-agent-graph の 02） > 引き継ぎの間は実行を止め…
 Test Files  1 failed | 381 passed (382)
      Tests  1 failed | 6886 passed | 1 skipped (6888)
```

## 起動確認（smoke）

`aidev smoke` を、**この work の HEAD を別のパスに checkout した worktree**（scratchpad の下。`pnpm install --offline` → 1 本目がビルドする）で **Node v24.21.0** で走らせた。`/workspaces/sodashitsu` から走らせると 1 本目が落ちる（端末のクリックを pane の枠の上辺が受ける。`main` でも同じ。前の作業の `test-result.md` に切り分けを記録）ため。worktree で記録された 1 行を、この work の `metrics.yml` へ写した。
この work は新しい入口（サブコマンド・オプション）を足していないので `smokeCommands` に行は足さない。

```
$ node -v
v24.21.0
$ aidev smoke        # 抜粋
smoke: starting server on 127.0.0.1:35459 (state dir /tmp/soda-smoke-r1J7AW)
smoke: login ok
smoke: PASS
smoke(cli): sodactl ask (unavailable without a browser / bad spec → 2 / outside a pane) ok
smoke(cli): sodactl ask without a login ok (pane socket → unavailable / derived from SODA_AGENT_REPORT_SOCKET / bad spec → 2; without the socket → unauthenticated)
handoff-smoke: sodactl ask without a login in a pre-handoff pane environment (SODA_AGENT_REPORT_SOCKET only) → unavailable, exit 0 ok
handoff-smoke: ok
stop-smoke: ok
machine-smoke: ok
tui-pty-verify: OK
smoke: pass (exit 0, 10 本)
```

## 未検証の穴（skip / 環境不足）

- **Chromium 以外のブラウザ（Firefox・Safari・WebKit）**: E2E は Chromium だけ。`Alt+PageDown`／`PageUp`・`:has()`・`color-mix()`・Shadow DOM の中のフォーカス・`Esc` と `<dialog>` の `cancel` の関係は未確認。
- **実機のスマートフォン**（iOS Safari の画面のキーボードが出たときの高さを含む）。E2E のモバイルは Playwright の `iPhone 13` のエミュレーション。
- **実物の ask-form 本体（`ask.py` の単独ウィンドウ）と同じ定義で同じ回答になること**の突き合わせ。共通の試験データ（検査 29・回答の集め方 23）で、検査と回答の集め方の規則が同じことは確かめたが、画面の動きは別々に確かめている。
- **古い版との組み合わせ**（読み込み直す前の古い画面・`page`／`paging` を知らない古い sodactl・古いサーバ）の実物での確認。コードの読みとテスト（サーバが読んだままの定義を受ける）だけ。
- **実際の Claude Code の ask-form から** `sodactl ask` を呼んでの、ページに分かれたフォームの確認（動いているサーバが古い版のため。マージ後にサーバを入れ替えてから確かめる）。
- 高さでの自動のページ分けが、1px の差で決まる定義がある（既存の E2E の `SPEC`: 全部を並べた高さ 577px・使える高さ 575px+1）。環境によって 1 枚か 2 ページかが変わる。新しい E2E は余裕を持たせた定義で書いてある。ask-form の側へ伝えた。
- 部品の `aria-invalid` を `fieldset` に付けていること（ARIA 1.2 の `group` に `aria-invalid` は定義されていない）が、読み上げでどう伝わるかは未確認。
- 配布物は `--no-install --no-archive` で作った中身（`third_party/ask-form/` と `packages/web/dist`）の確認だけで、配布物を展開して動かしてはいない。
- E2E 全体の 18 件の失敗・`pnpm lint` の 22 errors・smoke の 1 本目が `/workspaces/sodashitsu` から落ちる件は、`main` でも同じ（この work の範囲外。原因は未調査）。
