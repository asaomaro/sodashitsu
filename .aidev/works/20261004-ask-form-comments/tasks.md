# タスク: ask-form 1.3.0（質問ごとの自由記述）を取り込む

## 実装方針

design.md のとおり、下から積む。(1) 部品と試験データを写す → (2) 定義の検査 → (3) 回答の集め方・検査・スキーマ → (4) サーバ → (5) 画面の枠 → (6) 通り道の確認のテスト → (7) 既存の E2E を新しい部品に合わせる → (8)(9) 新しい E2E → (10) 文書。

**全タスク共通**
- 読む順: `requirements.md` → `design.md` → `decisions.md` → この文書、条項 2 本（`.aidev/conventions/e2e-observe-browser.md`・`regression-negative-control.md`）、`third_party/ask-form/README.md`。
- 各タスクの完了で `pnpm typecheck` と該当パッケージのテストが通ること。**例外は T1 の直後だけ**（下の T1 に、落ちてよいテストを名指しで書く）。
- 回帰テストを足したら、実装の該当行を一時的に壊してテストが落ちることを確かめ、**落ちたときの生の出力**を `review.md`（無ければ作る）の「タスク点検ログ」に貼る（条項 `regression-negative-control`。要約に置き換えない）。
- 部品（`third_party/ask-form/`）は手で直さない。prettier・eslint も当てない。
- 設計と違う判断・確かめた事実は `decisions.md` に足す（D の番号の続き）。

## チェックリスト

- [x] T1: 部品と試験データを public_docs `12a13b2`（1.3.0）に写し直す——`node scripts/sync-ask-form.mjs --from /workspaces/public_docs --commit 12a13b2`、`--check --from /workspaces/public_docs` が一致すること。`git -C /workspaces/public_docs diff 690d26d..12a13b2 -- docs/ClaudeCode/skills/other/ask-form/ask-form.js` を読み、`decisions.md` D2 の安全の確認と食い違いが無いことを確かめる。写した直後に `pnpm test` 全体を流して、落ちた件を記録する。**落ちるはずなのは、共通の試験データの normalize の 1 例「自由記述: 付けないとき（comments・comment が false）だけ残す。既定（付ける）は書かない」だけ**（`comments: true` の質問は今の実装が項目を落とすので通る。collect の新しい例は、この時点では `comments` を比べていないので通る）。それ以外（web の単体など）が落ちたら、部品の変更が原因かを見て、原因と直すタスク（T5・T7）を記録する
      対象: `scripts/sync-ask-form.mjs`、`third_party/ask-form/{ask-form.js,fixtures/normalize.json,fixtures/collect.json,SOURCE.json}`、`packages/protocol/src/ask.fixtures.test.ts:74-92, :141`（実行だけ）
      依存: なし
      AC: AC1
- [x] T2: 定義の検査——`AskSpec.comments?: false`・`AskQuestion.comment?: false`（`normalizeAskSpec` が `false` のときだけ残す。`true`・無い・真偽でない値は項目なし。誤りにしない）、`askCommentable(spec, q)`（定義の `comments !== false`・質問の `comment !== false`・`type !== "text"`・即確定のフォーム〔質問が 1 つ・`single`・`note === false`〕でない）。T1 で落ちた normalize の例が通る。単体テスト（`false` 以外は落ちる・`askCommentable` の 4 条件）と壊して落ちる確認
      対象: `packages/protocol/src/ask.ts:60-85`（`AskQuestion`・`AskSpec` の型）・`:205-216`（`note` の検査の近く）・`:280-286`（`filter`・`showValue` を通す箇所）・`:345`（`spec` の組み立て）、`packages/protocol/src/ask.test.ts`、`packages/protocol/src/ask.fixtures.test.ts`（実行だけ）
      依存: T1
      AC: AC3, AC5
- [x] T3: 回答の側——`AskFormState.comments?`、`collectAsk` の `comments`（見えていて `askCommentable` な質問について、`state.comments` が自分の項目として持つ〔`Object.hasOwn`〕文字列を `trim` し、空でなければ入れる。1 つも無ければ項目なし）、`AskAnswerBody`／`AskResult` の `comments?`、`checkAskAnswer` の検査（見えている質問・付けられる質問・文字列・合計 `ASK_COMMENTS_TOTAL_MAX` = 100000）、`AskAnswerParams.comments`（`z.record(z.string().max(ASK_ID_MAX * 2), askAnswerText).optional()`）。共通の試験データのテストの collect の比較に `expect(got.comments).toEqual(c.expect.comments)`（無い例は `undefined`）を足し、`CollectCase.expect` に `comments?`、`checkAskAnswer` に渡す body にも `comments` を入れる。**`collectAsk` を実装する前に、この比較を足して collect の新しい例が落ちることを確かめる**。単体テスト: 隠れている質問・`text`・`comment: false`・`comments: false`・即確定・文字列でない・10000／10001・合計の上限・`__proto__`／`constructor` の id。`__proto__` のキーが zod で落ちるか `checkAskAnswer` で断られるかを確かめて `decisions.md` に 1 件残す。`paneSocket.ts:28` のコメント（「3MB に届く」）を直す
      対象: `packages/protocol/src/ask.ts:19-23`（上限の定数）・`:88-113`（`AskResult`・`AskAnswerBody`）・`:354-362`（`AskFormState`）・`:409-430`（`collectAsk`）・`:436-478`（`checkAskAnswer`）、`packages/protocol/src/messages.ts:413-419`、`packages/protocol/src/ask.test.ts`、`packages/protocol/src/ask.fixtures.test.ts:47-52, :150-172`、`packages/protocol/src/messages.test.ts`、`packages/protocol/src/paneSocket.ts:28`
      依存: T2
      AC: AC6, AC7, AC10
- [x] T4: サーバ——`AskService.answer` が `comments` を受けて検査し、値を `trim` して空を落とし、残れば結果に写す（`{}`・全部空なら項目なし）。ログに中身を出さない。`ask.answer` のハンドラ（`params` をそのまま渡している）は、型が通ることを確かめるだけ。単体と統合（`/ws` 越し: `comments` つきの回答が結果に出る／10001 文字・付けられない質問・合計の超過は `invalid_params` で質問が開いたまま残る／空白だけは落ちて結果に項目が無い／ログに自由記述の文が出ない）と壊して落ちる確認
      対象: `packages/server/src/ask/AskService.ts:138-149`、`packages/server/src/surface/methods/ask.ts:24`、`packages/server/src/ask/AskService.test.ts`、`packages/server/src/ask/ask.integration.test.ts:232-247`（ログの件）
      依存: T3
      AC: AC4, AC7, AC8, AC9
- [x] T5: 画面の枠——`AskFormSubmitDetail.comments?`（JSDoc も直す）、`onSubmit` が `detail.comments` を送る。高さ: `<ask-form>` の要素に `@click` を付け、`ev.composedPath()[0]` が `[data-ask-comment-toggle]` のときだけ、**その場で同期に**（`requestAnimationFrame`・`nextTick` を挟まない——頭打ちでないフォームで 1 フレーム中がスクロールして戻るのを避ける）`contentHeight` を読み直して `applyHeight()` する。条件は `loadedAskId` が今の質問・`contentHeight > 0`。`applyWidth()`・`relayout()` は呼ばない。単体テスト: `comments` を送る・無ければ項目なし／ボタンの `click` で高さを読み直す・ほかの `click` と `input` では読み直さない・今の質問でないとき何もしない・`contentHeight` が 0 のとき何もしない／実物の部品でボタンがあり `value` に `comments` が入る。Shadow DOM の中のボタンを押すテストは `btn.click()`（合成イベントなら `composed: true`）にする——でないと `composedPath()[0]` がボタンにならない。T1 で web の単体が落ちていれば、ここで直す。壊して落ちる確認
      対象: `packages/web/src/ask/askFormElement.ts:22-35`、`packages/web/src/components/AskDialog.vue:145-150`（`applyHeight`）・`:171-193`（`loadSpec`）・`:199-203`（`onResize`）・`:208-220`（`onSubmit`）・`:277`（`<ask-form>` のイベントの並び）、`packages/web/src/components/AskDialog.test.ts`・`AskDialog.form.test.ts:86-88`（`contentHeight` を差し替える手本）・`askDialogTestKit.ts`、`packages/web/src/ask/askFormElement.test.ts`
      依存: T3
      AC: AC2, AC4, AC9, AC-I5
- [x] T6: 通り道の確認のテスト——(1) `sodactl ask` が `comments` つきの結果をそのまま出す、(2) 受け口 `pane.sock` 経由で質問を出して画面が答えたとき、`comments` が結果に出る、(3) 中継（別のマシン）越しでも `comments` つきの回答が素通しする。製品コードは変えない見込み（結果を作り直している箇所があれば通す。そのときは止まって主エージェントに知らせる）。`sodactl ask` が結果を作り直さないことをコードで確かめ、`decisions.md` に 1 件残す
      対象: `packages/cli/src/commands/ask.ts:75, :98-116`、`packages/cli/src/commands/ask.test.ts:93, :103`、`packages/server/src/panesocket/paneSocket.integration.test.ts:195`（「ログインなしで質問を出し、画面が答えると answered が返る」の形）、`packages/server/src/panesocket/askOp.ts:23-33`、`packages/server/src/machine/machines.integration.test.ts:398-432`（中継越しの質問の件）
      依存: T4
      AC: AC4, AC9
- [x] T7: 既存の E2E を新しい部品に合わせる——`pnpm build` の後、既存の ask の E2E 4 本（`ask-form.spec.ts`・`ask-form-index.spec.ts`・`ask-form-mobile.spec.ts`・`ask-form-extras.spec.ts`）を流し、自由記述のボタンが増えたことで変わった期待（`Tab` を数える件: `ask-form.spec.ts:381, :400, :526`・`ask-form-index.spec.ts:654-657`、高さ・目次の閾値を見る件）を直す。期待を弱めない（回答の JSON の期待は変えない）。`third_party/ask-form/README.md` の「部品を替えるたびに確かめること」の手順（E2E を流し直す・「E2E が読む部品の内部」の `grep`・共通の試験データの `sodashitsu` の欄の見直し・`decisions.md` に 1 件残す）を行う。4 本を 2 回続けて流し、同じ結果になること
      対象: `packages/e2e/src/specs/ask-form.spec.ts:381, :400, :526`、`packages/e2e/src/specs/ask-form-index.spec.ts:654-657`、`packages/e2e/src/specs/ask-form-mobile.spec.ts`、`ask-form-extras.spec.ts`、`packages/e2e/src/support/askForm.ts`、`third_party/ask-form/README.md:41-60, :113-124`
      依存: T5, T6
      AC: AC2
- [ ] T8: 新しい E2E（表示と結果）——`ask-form-comments.spec.ts`: ボタンと欄の開閉・文言（「＋ 自由記述」「自由記述を閉じる」「自由記述（入力あり）を開く」）・`text` の質問に無い／`comments: false`・`comment: false`・即確定のフォーム（付かず、選んだ時点で決定する）／端から端まで（書いた質問の id と文・閉じた欄も入る・空白だけは入らない・隠れた質問は入らない・隠れて戻った質問は入る・何も書かなければ項目が無い）／HTML（`<script>`・`<img onerror>`）を書いても動かず、文字のまま届く。`ask-form-mobile.spec.ts` に、タップで開いて書く件。補助 `support/askForm.ts` に自由記述のロケータ。壊して落ちる確認（`onSubmit` の `comments`・`normalizeAskSpec` の `comments`）
      対象: `packages/e2e/src/specs/ask-form-comments.spec.ts`（新規）、`packages/e2e/src/specs/ask-form-mobile.spec.ts`、`packages/e2e/src/support/askForm.ts`・`askSent.ts`、手本は `packages/e2e/src/specs/ask-form-extras.spec.ts`
      依存: T7
      AC: AC2, AC3, AC4, AC8
- [ ] T9: 新しい E2E（操作）——同じ spec に: `aria-expanded` と欄の読み上げ用の名前／欄の中の `Enter`（改行が入り `ask.answer` は 0 件）・`Ctrl+Enter`（1 件）・`Esc`（`ask.cancel` が 1 件）／キーだけで一巡（`Tab` → 開く → 書く → `Ctrl+Enter`）／フォーカス（開いた後は欄・もう一度開いても欄・キーで閉じた後はボタン・目次と `Alt+PageDown` と未回答への移動は自由記述の欄へ行かない）／高さ（上限に達していないフォームで開くと増え、閉じると戻る・上限のフォームで画面に収まり欄が見える・絞り込みの入力と `showIf` の出し入れではダイアログの高さが変わらない）／欄にフォーカスがある間のキー・ホイールが端末の pane へ漏れない。壊して落ちる確認（高さの読み直し）。新しい spec を 2 回続けて流し、同じ結果になること
      対象: `packages/e2e/src/specs/ask-form-comments.spec.ts`、手本は `packages/e2e/src/specs/ask-form-index.spec.ts`（フォーカス・高さ・`defaultPrevented` の見方）・`ask-form.spec.ts`（キーが漏れない件）
      依存: T8
      AC: AC-I1, AC-I2, AC-I3, AC-I4, AC-I5
- [ ] T10: 文書——design の AC10 に挙げた箇所: `third_party/ask-form/README.md`（「取り込んでいる版」→ 1.3.0／「`detail` のうちサーバへ送る項目」に `comments`／「通す項目を足すときに直す場所」のいま通している項目に `comments`・`comment`／「E2E が読む部品の内部」の本数〔5 本〕・ファイル名・実行コマンド・表・`grep` に `data-ask-comment`・`data-ask-comment-toggle`／「枠が使っている部品の受け渡し」に、枠が `[data-ask-comment-toggle]` の `click` を読む例外）、`docs/sodactl.md`（定義の `comments`・`comment`、結果の `comments`、上限）、`packages/cli/skills/sodactl/SKILL.md`、`docs/verification.md`（ask-form 本体と比べる項目に `comments`・実機の手順）、`docs/machines.md`（リモートもこの版が要る）。`packages/cli/src/skill.test.ts` が通ること
      対象: `third_party/ask-form/README.md`、`docs/sodactl.md:228, :233, :265`、`packages/cli/skills/sodactl/SKILL.md:123, :128`、`docs/verification.md:745, :759-`、`docs/machines.md:118-121`、`packages/cli/src/skill.test.ts`
      依存: T9
      AC: AC10
