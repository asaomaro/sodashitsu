# タスク: ask-form の部品（`<ask-form>`）の取り込みと、sodactl ask の画面の置き換え

## 実装方針

下から積む: 写す仕組みと写したファイル（`third_party/ask-form/`）→ protocol（通す項目・分類・食い違いの修正・共通の試験データのテスト）→ Web の読み込み（型・`isCustomElement`・ビルドが通ること）→ 枠（`AskDialog.vue`）と単体テスト → E2E → docs。
subtask には割らない（1 PR に収まる大きさで、枠と E2E は protocol と写したファイルに依存して単独ではデリバリできない）。

## 作業順序と依存関係

下の `依存:` に従う。依存では表せない順序の理由:

- T4（Web が `packages/web` の外の素の JS を読んで、型検査・ビルド・開発サーバが通るか）は、枠を書き直す T5 より先に確かめる。ここで見立てが外れたら（`vue-tsc` が通らない等）、読み込み方（`decisions.md` D3-1）を決め直す。
- T4 の中で、値が `__other__` の選択肢で部品がどう動くかを単体テストで走らせて確かめ、「検査で断る」（design）を入れるか入れないかを T2 の前に確定する（結果は `decisions.md` に残す）。
- E2E（T7・T8）はビルドした成果物で走る。`pnpm build` をしてから走らせる。
- ask-form の側へ依頼した直し（即確定の `Space`・クリック／`__other__`）が届いたら、T10 の手順で取り込み直す（どのタスクの途中でもよい。届かなければ 29bfd09 のまま T10 を行う）。

## リスク / 留意点

- 既存の E2E の定義が、1280×720 でページに分かれうる（research R1）。実際の出方に合わせて書き直す（`paging: false` を足して逃げない）。
- 単体テスト（happy-dom）は大きさが全部 0。高さでのページ分け・`contentHeight` は E2E でしか確かめられない。`wrapper.get` は Shadow DOM を越えないので、`shadowRoot` の中を探す補助を作る。Shadow DOM の中から出すイベントは `composed: true`。
- `spec` を入れるたびに部品が描き直す。Vue の再描画のたびに入れない（`watch` の中で 1 回だけ）。
- 部品の中のキーは `stopPropagation` される。枠の `keydown` に届くのは、部品が扱わなかったキーと、部品の外にフォーカスがあるときのキー。
- 写したファイルは手で直さない（直したくなったら ask-form の側へ伝える）。prettier・eslint を当てない。
- Node は 24 で確かめる（既定の v20 は `engines` の外）。smoke の 1 本目は `/workspaces/sodashitsu` から走らせると `main` でも落ちる（前の作業の `test-result.md`）ので、別のパスの checkout で走らせる。
- このリポジトリのテストは soda の pane の中で走らせている。E2E・smoke の子へ渡す環境から socket の変数は外してある（前の作業）。動いている本物のサーバには触らない。

## テスト方針

- 単体: `packages/protocol`（`ask.test.ts`・`ask.fixtures.test.ts`）、`packages/web`（`AskDialog.test.ts`）、`scripts/sync-ask-form.test.ts`、サーバの統合テスト 1 件。
- E2E: `ask-form.spec.ts`（既存の書き直し＋ページング・テーマ・絞り込み・安全）・`ask-form-mobile.spec.ts`。合否はブラウザの DOM と sodactl の stdout・終了コード（条項 `e2e-observe-browser`）。
- 回帰（条項 `regression-negative-control`）: 空の `showIf`・複数選択の順は、共通の試験データの 2 例が直す前に落ちることを確かめる。
- 全体: `pnpm typecheck`・`pnpm test`・`pnpm build`（Node 24）。lint は変えたファイル（`main` で既に 22 errors）。smoke 10 本。
- ビルドした成果物に部品が入っていること・配布物に `third_party/ask-form/` が入ることを確かめて `test-result.md` に残す。
- 実物では確かめられないもの（Firefox・Safari・実機のモバイル・古い版との組み合わせ）は未検証として残す。

## タスク

- [x] T1: 同期スクリプトと写した先——`scripts/sync-ask-form.mjs`（`--from`・`--commit`・`--check`。`git show` で取る・`SOURCE.json` を書く・終了コード 0／1／2。`SOURCE.json` の `version` は写した `ask-form.js` の `const VERSION` の行から読み、読めなければ `"unknown"`。`--from` が git のリポジトリでない・コミットが無い・ファイルが無いときは終了コード 2 と理由）で public_docs の 29bfd09 から `ask-form.js`・`fixtures/normalize.json`・`fixtures/collect.json` を `third_party/ask-form/` へ写す。`README.md`（出どころ・手で直さない・更新の手順・取り込むコミットを替えるたびに確かめること・通す項目を足すときに直す場所）、`.gitattributes`（`third_party/ask-form/** -text`）。`scripts/sync-ask-form.test.ts`: 写した先の sha256 が `SOURCE.json` と一致／一時の git リポジトリから写せて `SOURCE.json` が出来る／写した後に 1 バイト変えると `--check` が終了コード 1／使い方の誤り・取れない（リポジトリでない・コミットが無い・ファイルが無い）は 2／`VERSION` の行が無ければ `"unknown"`
      対象: `scripts/sync-ask-form.mjs`・`scripts/sync-ask-form.test.ts`（新規作成）、`third_party/ask-form/`（新規作成）、`.gitattributes`、手本は `scripts/package.mjs`・`scripts/migrate-from-wtm.test.ts`・`third_party/herdr/README.md` / 根拠: research A19, A20, F31, F35, F36
      依存: なし
      AC: AC1, AC14
- [x] T2: protocol——`Fail` に分類 `reason`（既存の全部の誤りに割り当てる）／`paging`・`page`・`filter`・`showValue` を検査して通す（検査の順は id の重複の後・`type` の前に `page`）／空の `showIf` を落とす／選択肢の `value` が `__other__` なら誤り（**T4 の確かめで「断る」と決まった場合だけ**。外すと決まったら入れず、`decisions.md` の記録だけ）／`valueOf` が複数選択の値を定義の順に揃える。`ask.test.ts` に足す: 各誤りの `reason`／`paging`（`"auto"`・`true`・`false`・`3` は通る、`0`・`1.5`・`"many"` は `paging_invalid`）／`page`（文字列・空文字は通る、`null` は項目なし、数は `page_invalid`、501 文字は `too_large`、対応していない型の質問の不正な `page` も誤り）／`filter`・`showValue`（真偽だけ残る・文字列は落ちる・`text` では落ちる）／`__other__`／対象外の項目（`code`・`group`・`image`・`audio`・`preview`・`thumb`）が正規化後に無い／複数選択の順
      対象: `packages/protocol/src/ask.ts:44-75`（型）・`:146`（`Fail`）・`:153` `normalizeAskSpec`（全体の項目 `:168-185`・質問の項目 `:211-231`・選択肢 `:233-260`・`showIf` `:275-285`・組み立て `:293-296`）・`:338` `valueOf`、`packages/protocol/src/ask.test.ts` / 根拠: research A13, A14, F25, F26, F30
      依存: T4
      AC: AC4, AC6, AC11, AC16
- [x] T3: 共通の試験データを読むテスト `ask.fixtures.test.ts`——`third_party/ask-form/fixtures/*.json` を `fs` で読み、normalize の全例（`sodashitsu.expect ?? expect` と `ok`・`reason`・`expect.spec` に書いた項目）と collect の全例（正規化 → `state` を `initialAskState` に重ねる → `collectAsk` の `answers`・`lacking`・`custom`・`note`。`lacking` が空の例は `checkAskAnswer` も通る）を回す。例が 0 件なら落ちる（読めていないのに通らない）。**T2 の修正を一時的に戻して、空の `showIf`・複数選択の順の 2 例が落ちることを確かめる**（生の出力を報告に含める）
      対象: `packages/protocol/src/ask.fixtures.test.ts`（新規作成）、`third_party/ask-form/fixtures/normalize.json`・`collect.json`、`packages/protocol/src/ask.ts:312` `initialAskState`・`:351` `collectAsk`・`:378` `checkAskAnswer` / 根拠: research A13, F29, F34
      依存: T1, T2
      AC: AC4, AC6, AC11, AC16
- [x] T4: Web の読み込み——`packages/web/src/ask/askFormElement.ts`（部品の副作用だけの `import` と、要素の型 `AskFormElement`・`AskFormSubmitDetail`）、`vite.config.ts`・`vitest.config.ts` の `isCustomElement`。**確かめる**: `pnpm typecheck`（`vue-tsc`）・`pnpm --filter @sodashitsu/web run build` が通り、`packages/web/dist/assets/*.js` に部品が入っている（`ask-form` の `customElements.define`）／単体テストで `import` すると `customElements.get("ask-form")` がある／`vite dev`（開発サーバ）で `third_party/` の部品が配られる（`pnpm --filter @sodashitsu/web run dev` を空きポートで立て、部品のモジュールの URL が 200 で返ることを見て止める。動いている本物のサーバには触らない）。通らなければ読み込み方を決め直し、`decisions.md` に残す。**あわせて `__other__` の確かめ**: 値が `__other__` の選択肢を持つ定義（`allowOther` あり・なし、既定で選ばれている・後から選ぶ）を部品に入れ、`ask-unsupported` が出るか・`value`／`ask-submit` の回答が選んだ値と合うかを走らせて確かめ、結果と「検査で断るか」の決定を報告する（主エージェントが `decisions.md` に残す）
      対象: `packages/web/src/ask/askFormElement.ts`（新規作成）、`packages/web/vite.config.ts:9`・`packages/web/vitest.config.ts:5`、`packages/web/tsconfig.json`・`tsconfig.typecheck.json` / 根拠: research A11, A12, F20, F33
      依存: T1
      AC: AC14
- [x] T5: 枠——`AskDialog.vue` を design「`AskDialog.vue`（枠）」のとおりに書き直す（固定の行・開閉・フォーカス・取り消しは残す／`spec` は `structuredClone(toRaw(…))` を命令的に 1 回だけ入れる——`structuredClone` が投げたら `ask-unsupported` と同じ扱い／高さの手順 `fit()`: 高さを与えてから `spec`・`relayout()`・`contentHeight` に合わせる・0 なら与えた高さを消す・`window` の `resize` では最大だけ当て直す〔`relayout()` しない〕・リスナーは開いている間だけ／`onSubmit`／`onUnsupported`: `controller.cancel`＋固定の文言のトースト・`reason` は画面に出さず `console.warn`／枠が取り次ぐキー／テーマの 7 つの変数）。`AskDialog.test.ts` を書き直す（`shadowRoot` の中を探す補助）: 固定の行が部品の外にあり、定義の `title` で変わらない／質問が届くと開き、固定の行にフォーカス／決定で `controller.answer` に `{answers, custom?, note?}`／未回答では呼ばれない／［キャンセル］・`cancel`（`Esc`）で `controller.cancel`／`answer` が偽なら `busy` が戻る／固定の行にフォーカスがあるときの `Ctrl+Enter` → 決定・`Alt+PageDown`／`PageUp` → ページが移る（`preventDefault` される）・部品の中のキーでは二重に効かない／即確定（クリック・`Enter` で確定・矢印では確定しない）／色の帯・おすすめ・既定・その他・`showIf`・補足が出る／`page` でページに分かれる／定義の文字が HTML にならない／描けない定義（部品が `ask-unsupported`）で `cancel` が呼ばれ `answer` は呼ばれず、トーストに固定の文言が出て `reason` は出ない／部品へ渡した定義に部品が書き込んでも store の定義は変わらない／大きさが取れない環境（単体テスト）では部品に高さが残らない／閉じると `resize` のリスナーが外れる／次の質問で描き直す・同じ質問の再描画では入力が消えない／閉じたときのフォーカスの戻し先（既存の件）
      対象: `packages/web/src/components/AskDialog.vue:90`（開閉の `watch`）・`:116` `closeDialog`・`:130` `restoreFocus`・`:202` `submit`・`:223` `cancel`・`:230` `onNativeCancel`・`:235` `onKeydown`・`:259-263`（枠と固定の行）・`:340-373`（枠の CSS）、`packages/web/src/components/AskDialog.test.ts:51` `mountDialog`、`packages/web/src/ask/AskController.ts:62` `answer`・`:73` `cancel`（読むだけ）、トーストの出し方は `AskController.ts:82` `failed` が使う store / 根拠: research A7, A8, A9, F16, F17, F18, F19
      依存: T2, T4
      AC: AC2, AC3, AC7, AC9, AC15, AC-I1, AC-I2, AC-I4, AC-I5
- [x] T6: サーバの統合テストに 1 件足す（製品のコードは変えない）——読んだままの定義に `page`・`paging` を入れて `ask.open` → 画面役が受け取る定義（`ask.subscribe`／`ask.get`）に項目がある／不正な `paging` は `invalid_ask_spec`
      対象: `packages/server/src/ask/ask.integration.test.ts`（既存の件の作りに合わせる） / 根拠: research A16, F28, F43
      依存: T2
      AC: AC13
- [x] T7: 既存の E2E を部品の DOM に合わせて書き直す——`ask-form.spec.ts` の各件（セレクタ: `label.opt`・「その他」の入力欄・`[data-ask-question]` の数え方〔見えているもの〕・`script`／`src` を持つ `img` が無い・`evaluate` の中の `querySelector`）と `ask-form-mobile.spec.ts`。定義がページに分かれる件は、実際の出方に合わせてページを移る操作を足す（`paging: false` を足さない）。回答の JSON の期待は変えない。固定の行の件に足す: 定義の `title` に何を書いても `[data-ask-origin]` の文言が変わらず、部品の題（`[data-ask-title]`）より上にある（`boundingBox` で比べる）。即確定の件: クリック・タップ・`Enter`・選ばれていない選択肢での `Space` で確定／矢印では確定しない。**既に選ばれている選択肢での `Space`・クリックの件**は、ask-form の側の直しが入ったコミットに固定できていれば通し、できていなければその 1 点を `test.fixme` にして理由を書く
      対象: `packages/e2e/src/specs/ask-form.spec.ts:13-20` `SPEC`・`:22` `dialog`・`:25` `openBrowser`・各件（research F22 の表の行）、`packages/e2e/src/specs/ask-form-mobile.spec.ts:11` / 根拠: research A17, F21, F22, F23
      依存: T5
      AC: AC2, AC3, AC8, AC9, AC10, AC16, AC-I1, AC-I4, AC-I5
- [x] T8: 新しい E2E（ページング。`ask-form-paging.spec.ts`）——`page` の題で分かれる／`paging: 2`／`paging: false`／書かずに高さに収まらない定義が分かれ、収まる定義は 1 枚／`page` を書くと高さでは分かれない／`page` と `paging: 1` は `page` が優先。ページをまたぐ決定: 未回答のページへ移る・両方のページの回答が stdout に出る・`showIf` がページをまたぐ・ページを移って戻ると答えが残る。入力欄の `Enter`: 途中のページでは次のページへ、最後のページでは決定。キーだけで完結: `Tab` → 選ぶ → `Alt+PageDown` → 選ぶ → `Ctrl+Enter`／固定の行にフォーカスがあるままの `Alt+PageDown`・`Ctrl+Enter`／`keydown` の `defaultPrevented`（固定の行・部品の中の両方）。ページを移る 5 通り（［次へ］・［戻る］・`Alt+PageDown`・番号・入力欄の `Enter`）のそれぞれで、そのページの番号のボタンにフォーカス。ページを移ってもダイアログの高さが変わらない。**別のページの入力欄にフォーカスがあるまま決定して未回答のページへ移されたとき、フォーカスがどこに残るかを観測して報告する**（見えない要素に残るなら、主エージェントが ask-form の側へ伝える。合否にはしない）
      対象: `packages/e2e/src/specs/ask-form-paging.spec.ts`（新規作成）、`packages/e2e/src/support/ask.ts:34` `runAsk`（読むだけ）、手本は `packages/e2e/src/specs/ask-form.spec.ts:22-25` / 根拠: research A17, F5, F6, F41
      依存: T7
      AC: AC4, AC5, AC-I2, AC-I3, AC-I4, AC-I5
- [x] T11: 新しい E2E（テーマ・絞り込み・安全）——テーマを切り替えると地・文字・枠・選択中の色が替わる／絞り込み: 13 件で出る・`filter: false` で出ない・文字があるときの `Esc` は取り消さない（消すだけ）・空のときの `Esc` は取り消す／`showValue: false` で値が出ない／安全: 題・説明・質問・選択肢・ページの題の HTML が文字として出る・`dialog` の中に `script`・`src` を持つ `img` が無い・フォームを出して答える間の `securitypolicyviolation` が 0（`page.addInitScript` でリスナーを置く。何を観測したかを spec に書く）／`paging: "many"` → 終了コード 2
      対象: `packages/e2e/src/specs/ask-form.spec.ts`（件を足す）、テーマの切り替え方は `packages/e2e/src/specs/theme-settings.spec.ts` / 根拠: research A17, F12, F14, F24, F37
      依存: T7
      AC: AC7, AC10, AC11, AC16
- [x] T9: docs——`docs/sodactl.md`「質問のフォーム」（`page`・`paging`・`filter`・`showValue`・ページを移るキー・絞り込みの `Esc`・即確定の説明の直し〔矢印では決定しない〕・部品に替わって変わった見た目・新しい節「画面の部品と同期」）、`docs/verification.md`（ページングを実物で確かめる手順）、`packages/cli/skills/sodactl/SKILL.md`（`page`・`paging`）、`NOTICE`（出どころ。ライセンスの記載が無い事実）、`AGENTS.md`（案内に 1 行）。書いた後に `skill.test.ts` を通し、ビルドし直して 4 本目の smoke（`sodactl skill | cmp`。`.aidev/config.yml`）を通す
      対象: `docs/sodactl.md:220-290`、`docs/verification.md:734-742`、`packages/cli/skills/sodactl/SKILL.md:109-127`、`NOTICE:1-13`、`AGENTS.md`、`third_party/ask-form/README.md`（T1 で作ったものに、実装で決まった点を足す）、`packages/cli/src/skill.test.ts` / 根拠: research A19, A23
      依存: T5
      AC: AC12
- [x] T10: 取り込むコミットの確定と確認——ask-form の側の直し（即確定の `Space`・クリック／`__other__`）が `main` に入っていれば、T1 のスクリプトでそのコミットへ取り込み直す（入っていなければ 29bfd09 のまま）。**固定するコミットの `ask-form.js` について、94a5ef6（research が読んだ版）からの差分を読み**、通信・ページ全体への操作（`fetch`・`window`・`location`・保存領域・`innerHTML` 系）・スタイルや `src` へ定義の値を入れる箇所・キーの扱いが変わっていないかを確かめ、結果を報告する（主エージェントが `decisions.md` に 1 件として残す）。取り込み直したら: T3 のテスト・`AskDialog.test.ts`・E2E を流し直す／T7 の `test.fixme`（既に選ばれている選択肢での `Space`・クリック）を外して通す／`__other__` の検査の分類を ask-form の側に合わせる（T2 で断っていた場合）。**配布物の確認**: `node scripts/package.mjs --no-install --no-archive` で作った配布物に `third_party/ask-form/ask-form.js` と、部品を含む `packages/web/dist` があることを確かめて報告する（作った `release/` は残してよい——`.gitignore` 済み）
      対象: `third_party/ask-form/`、`scripts/sync-ask-form.mjs`、`/workspaces/public_docs`（読むだけ。`git log`・`git diff 94a5ef6 <コミット> -- docs/ClaudeCode/skills/other/ask-form/ask-form.js`）、`scripts/package.mjs:44-48` / 根拠: design「依拠する既存の事実」「受け入れ基準との対応」AC14、research F10, F11, F32
      依存: T8, T11
      AC: AC9, AC14
