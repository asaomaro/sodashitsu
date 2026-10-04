# 仕様: ask-form 1.3.0（質問ごとの自由記述）を取り込む

## 概要

部品を `12a13b2`（1.3.0）に写し直し、定義の `comments`・`comment`（`false` のときだけ）をサーバが通し、回答の `comments`（`{質問の id: 文}`）を画面 → サーバ → `sodactl ask` の結果まで運ぶ。定義の検査・回答の集め方・回答の検査は `packages/protocol/src/ask.ts` の 1 か所に足す。枠（`AskDialog.vue`）は、部品の `detail.comments` を送り、欄の開閉で変わる中身の高さを読み直す。

## 設計方針

- **既存の項目（`custom`・`note`）と同じ道を通す**。`AskAnswerBody`・`AskAnswerParams`・`AskResult` に省略可能な `comments` を足し、`checkAskAnswer` で検査、`AskService.answer` で結果に写す。新しい RPC・イベント・エラーコードは作らない（不正は今と同じ `invalid_params`）。
- **「自由記述を付けられるか」の判定は 1 つの関数**（`askCommentable(spec, q)`）にし、`collectAsk` と `checkAskAnswer` の両方で使う。条件は部品の `commentable` と同じ: 定義の `comments !== false`・質問の `comment !== false`・`type !== "text"`・即確定のフォームでない（質問が 1 つ・`single`・`note === false`）。
- **空の値は落とす**（断らない）。サーバで前後の空白を除き、空になった値は捨てる。既存の `custom`（空配列）・`note`（空文字）の扱いに合わせる。
- **高さの追従は枠の側で、自由記述のボタンの `click` のときだけ行う**。部品は中身の高さが変わっても知らせない（`contentHeight` は読み取りだけ。単独ウィンドウの殻 `form.html` も `load` と `resize` でしか読まない）。枠は、部品の要素に届いた `click`（ネイティブの `click` は `composed` で Shadow DOM の外へ届く。部品はこの `click` を止めない）のうち、`ev.composedPath()[0]` が `[data-ask-comment-toggle]` のものだけを合図に `contentHeight` を読み直す。**ほかの `click`・`input` には反応しない**——絞り込みの入力や `showIf` の出し入れで中身の高さが変わっても、今までどおりダイアログの高さは変えない（打っている欄が動かないように。既存の動きを変えない）。枠が部品の内部の属性を読むのはここだけで、`third_party/ask-form/README.md`「枠が使っている部品の受け渡し」に例外として載せる。
- **代替案を退けた理由**: 部品に高さの変化のイベントを足してもらう → ask-form 側の改修待ちになる（今回は枠で足りる。必要なら後で伝える）。`comments` を `note` に連結して送る → ask-form の結果の形と食い違い、質問との対応が失われる。

## 対象範囲

- `third_party/ask-form/`（`ask-form.js`・`fixtures/normalize.json`・`fixtures/collect.json`・`SOURCE.json`・`README.md`）。
- `packages/protocol/src/ask.ts`・`ask.test.ts`・`ask.fixtures.test.ts`、`messages.ts`（`AskAnswerParams`）。
- `packages/server/src/ask/AskService.ts` とそのテスト・統合テスト。
- `packages/web/src/components/AskDialog.vue`・`packages/web/src/ask/askFormElement.ts` とそのテスト。
- `packages/cli/src/commands/ask.ts`（結果をそのまま出すことの確認。変更は不要の見込み）。
- `packages/e2e/src/specs/`（自由記述の spec）・`packages/e2e/src/support/askForm.ts`。
- `docs/sodactl.md`・`packages/cli/skills/sodactl/SKILL.md`・`docs/verification.md`。

## 依拠する既存の事実

- 部品の差分（public_docs `690d26d..12a13b2` の `ask-form.js`。`ffd516c` までは `ask-form.js` は不変で、`12a13b2` で変わる。この work で `git diff` を読んで確認）: `FIELDS` に `comments`・`comment`。各質問の下に `button[data-ask-comment-toggle=<id>]`（`aria-expanded`）と `textarea[data-ask-comment=<id>]`（`hidden`・`maxlength` は `TEXT_MAX`・`aria-label` は「<質問の label> の自由記述」）。`commentable(q)` は `SPEC.comments !== false && q.comment !== false && q.type !== 'text' && !(QS.length === 1 && QS[0].type === 'single' && SPEC.note === false)`。`collect()` が、見えている質問の欄の値を `trim()` して空でなければ `comments[q.id]` に入れる（閉じていても入れる）。`value()` は `comments` が 1 つ以上あるときだけ `out.comments` を付ける。目次・未回答への移動のフォーカスは `textarea:not([data-ask-comment])` で自由記述の欄を除く。追加された語に、通信・`window`・`document`・`innerHTML` 系・`eval`・`location`・`cssText`・`href` は無い。新しいリスナーはボタンの `click`（Shadow DOM の中）。
- `ask.py` の `normalize()`: `comments` が `False` でなければ項目を落とし、質問の `comment` も同じ（同 `git diff` で確認）。共通の試験データに 2 例（normalize）・1 例（collect。`state.comments` と期待の `comments`）。
- 部品の `TEXT_MAX` は 10000、`ASK_ANSWER_TEXT_MAX` も 10000（`packages/protocol/src/ask.ts:23`。requirements の点検で確認）。
- 定義の検査 `normalizeAskSpec`（`packages/protocol/src/ask.ts`。`filter`・`showValue` を通す箇所は :284-285、全体の組み立ては :345）は、知っている項目だけで作り直す。`note` は必ず真偽になる（:210-216, :345）。
- 回答の型 `AskAnswerBody {answers, custom?, note?}`（`ask.ts:109-113`）、結果 `AskResult`（:90-94）、状態 `AskFormState`（:354-362）、`collectAsk`（:409-430）、`checkAskAnswer`（:436-478）。この work で読んで確認。
- `AskAnswerParams`（`packages/protocol/src/messages.ts:413-419`）は `z.object`（strict でない）で、`askAnswerText` を使う。
- `AskService.answer`（`packages/server/src/ask/AskService.ts:138-149`）は `custom`・`note` を写し、`checkAskAnswer` の理由を `RpcError("invalid_params", reason)` にする。空の `custom`・`note` は結果から落とす。
- 枠 `AskDialog.vue` の `onSubmit`（:208-220）は `detail` の `answers`・`custom`・`note` だけを送る。`AskFormSubmitDetail`（`packages/web/src/ask/askFormElement.ts:31-35`）。高さは `loadSpec` と `onResize` で `contentHeight` を読む（:191, :201 付近）。
- `sodactl ask` は定義を検査して読んだまま送り、結果をそのまま出す（`packages/cli/src/commands/ask.ts:75`〔読んだままを送る〕・`:98-116`〔結果を `deps.print(result)` でそのまま出す〕。design の点検で確認。受け口 `pane.sock` 経由も素通し: `packages/server/src/panesocket/askOp.ts:23-33`・`packages/cli/src/paneSocket.ts:204-205, :239`）。
- 共通の試験データのテスト `packages/protocol/src/ask.fixtures.test.ts`: normalize の側は `writtenKeys()`（:74-92）が書かれた項目を自動で比べる。**collect の側が比べるのは `answers`・`lacking`・`custom`・`note` だけ**（:161-165。`CollectCase.expect` :47-52 にも `comments` が無い）で、`checkAskAnswer` に渡す body（:169-172）にも無い。
- E2E の補助 `packages/e2e/src/support/askForm.ts`、spec は `ask-form*.spec.ts` 4 本、`third_party/ask-form/README.md` に「E2E が読む部品の内部」の表。

## インターフェース / データ構造

```ts
// packages/protocol/src/ask.ts
interface AskSpec { /* 既存 */ comments?: false }          // false のときだけ持つ
interface AskQuestion { /* 既存 */ comment?: false }       // false のときだけ持つ
type AskComments = Record<string, string>;
interface AskAnswerBody { answers; custom?; note?; comments?: AskComments }
type AskResult = { status: "answered"; answers; custom?; note?; comments?: AskComments } | …
interface AskFormState { /* 既存 */ comments?: Record<string, string> }   // 省略可（既存の呼び出しを壊さない）
function askCommentable(spec: AskSpec, q: AskQuestion): boolean
// collectAsk の戻り値に comments?: AskComments（1 つ以上あるときだけ）

// packages/protocol/src/messages.ts
AskAnswerParams.comments: z.record(z.string().max(ASK_ID_MAX * 2), askAnswerText).optional()
//   キーの数は checkAskAnswer の「見えている質問にあること」で質問の数以内に収まる
export const ASK_COMMENTS_TOTAL_MAX = 100_000;   // 自由記述の長さの合計の上限（ask.ts）

// packages/web/src/ask/askFormElement.ts
interface AskFormSubmitDetail { answers; custom?; note?; comments?: Record<string, string> }
```

## 振る舞いの詳細

- **定義の検査**: `raw.comments === false` のとき `spec.comments = false`。質問の `comment === false` のとき `out.comment = false`。それ以外（`true`・無い・真偽でない）は項目なし。誤りにはしない（`ask.py` と同じ）。
- **回答の集め方（`collectAsk`）**: 質問を上から見る既存のループの中で、見えていて `askCommentable` な質問について、`state.comments` が自分の項目として持つ（`Object.hasOwn`）文字列の値を `trim()` し、空でなければ `comments[q.id]` に入れる（id が `constructor`・`toString` のとき、継承された値を拾わない）。1 つも無ければ戻り値に `comments` を付けない。
- **回答の検査（`checkAskAnswer`）**: `body.comments` があれば、各キーについて (1) 見えている質問（既存の `shown`）にあること、(2) その質問が `askCommentable`、(3) 値が文字列、を確かめる。(4) 値の長さの合計が `ASK_COMMENTS_TOTAL_MAX`（100000。UTF-16 の単位）以内、を確かめる。外れたら理由（英語。値の中身を含めない）を返す。1 つの値の長さは `AskAnswerParams` のスキーマ（`askAnswerText`）で先に落ちる（検査の順: スキーマ → `checkAskAnswer` → 空の値を落とす）。`__proto__` のキーは、定義の id になれない（`ask.ts:139, :240`）ので「定義に無い id」として断る期待を、テストで確かめる（zod が落とすなら、落ちて項目なしになることを確かめて `decisions.md` に残す）。
- **サーバ（`AskService.answer`）**: `p.comments` を受け、検査の後、各値を `trim()` して空でないものだけを `result.comments` に写す。1 つも残らなければ項目を付けない。ログには件数も中身も出さない（今の `ask closed` のログのまま）。
- **枠（`AskDialog.vue`）**:
  - `onSubmit`: `detail.comments` があれば `body.comments` に入れる。
  - 高さ: 部品の要素で、自由記述のボタンの `click` を受けたら、**その場で（同期で）** `contentHeight` を読み直して `applyHeight()` する（枠のリスナーは部品のボタン自身のリスナーの後に走るので、その時点で欄は開閉済み。`requestAnimationFrame` を挟まない——頭打ちでないフォームで 1 フレームだけ中がスクロールして戻るのを避ける）。開いたときは増え、閉じたときは縮む。条件: `loadedAskId` が今の質問・`contentHeight > 0`（`onResize` と同じ守り）。幅（`applyWidth`）は読み直さない。目次を出すかは決め直さない（`relayout()` は呼ばない）。欄のつまみ（`resize: vertical`）で広げた高さには追従しない（既存の補足欄と同じ。対象外）。上限で頭打ちのフォームでは、部品の `ta.focus()` が欄を見える位置へ動かす。
- **`sodactl ask`**: 結果をそのまま出す実装であることを確かめる。作り直している箇所があれば `comments` を通す。
- **即確定のフォーム**: 部品が自由記述を付けないので、画面の動きは変わらない。サーバは `comments` が来たら `askCommentable` が偽なので断る。

## ドメイン固有の考慮

- AGENTS.md の条項: E2E は `e2e-observe-browser`（ダイアログの DOM・`shadowRoot.activeElement`・ブラウザが送った `ask.answer` のフレーム・`sodactl` の stdout で見る）。回帰テストは `regression-negative-control`。
- 部品は無改変で写す（`.prettierignore`・`.gitattributes` 済み）。`third_party/ask-form/README.md` の「通す項目を足すときに直す場所」に従う。
- 自由記述は利用者が書いた文で、`sodactl ask` を呼んだエージェントへ渡る。エージェントにとっては「利用者の入力」であり、既存の `note`・自由入力と同じ扱い（新しい経路ではない）。

## エラー処理 / 異常系

- 不正な `comments`（定義に無い id・隠れている質問・付けられない質問・文字列でない）: `invalid_params`。質問は開いたまま（既存の `answer` の決まり）。画面は既存のトースト。
- 10001 文字以上: スキーマで `invalid_params`。合計が 100000 を超える: `checkAskAnswer` で `invalid_params`。
- **大きさ**: `/ws` の 1 フレームの上限は 4MB（`packages/server/src/ws/WsServerWs.ts:17, :67`）。今の回答の最悪値は 100 問 × 10000 × 3 バイトで約 3MB。自由記述に合計の上限を設けない場合は約 6MB になり、`invalid_params` ではなく接続の切断になる。合計 100000（約 0.3MB）に抑え、合わせて約 3.3MB に収める。`packages/protocol/src/paneSocket.ts:28` のコメント（「3MB に届く」）を直す。
- **中継先の `soda` が古い**（保存したマシン。`docs/machines.md:118-121` は版の混在を前提にしている）: 古い側の検査が `comments: false`・`comment: false` を落とすので、付けない指定の質問にもボタンが出る。書いた文は古い側のスキーマで落ち、回答は成功する（自由記述だけが届かない）。受け入れ、`docs/machines.md` に「リモートもこの版が要る」と書く。`decisions.md` に残す。
- 空・空白だけ: 落とす。`{}`: 項目なし。
- 古い画面（`comments` を送らない）: 今までどおり。

## テストの方針

- **protocol 単体**: `ask.test.ts`（`normalizeAskSpec` の `comments`・`comment`、`askCommentable`、`collectAsk`、`checkAskAnswer` の各不正・合計の上限・`__proto__`・`constructor` の id）。`messages.test.ts`（`AskAnswerParams.comments` の 10000／10001）。
- **共通の試験データ**: `ask.fixtures.test.ts` の collect の比較に `expect(got.comments).toEqual(c.expect.comments)`（無い例は `undefined`）を足し、`CollectCase.expect` に `comments?` を足し、`checkAskAnswer` に渡す body に `comments` も入れる。**`collectAsk` を実装する前に、新しい例が落ちることを確かめる**（`regression-negative-control`）。
- **server 単体**: `AskService`（結果に写す・空を落とす・`{}`・不正は断って質問が開いたまま）。**統合**（`ask.integration.test.ts`）: `/ws` 越しに 10001 文字を送って `invalid_params`・質問が残る／`comments` つきの回答が結果に出る／ログに自由記述の中身が出ない（既存の :232-246 の件に印を足す）。
- **web 単体**: `AskDialog.test.ts`（`onSubmit` が `detail.comments` を送る・無ければ項目なし）、`AskDialog.form.test.ts`（自由記述のボタンの `click` で高さを読み直す・ほかの `click`／`input` では読み直さない・今の質問でないとき／`contentHeight` が 0 のときは何もしない）、`askFormElement.test.ts`（実物の部品でボタンがある・`value` に `comments` が入る）。
- **cli**: `packages/cli/src/commands/ask.test.ts`（:93・:103 の形）に `comments` つきの結果を 1 件（そのまま出る）。`paneSocket.integration.test.ts` に受け口経由の 1 件。中継越しの統合（`machines.integration.test.ts:398-432` の形）に `comments` つきの回答を 1 件（中継が素通しする）。
- **E2E**（新しい spec `ask-form-comments.spec.ts`。合否はブラウザの DOM・`shadowRoot.activeElement`・ブラウザが送った `ask.answer` のフレーム・`sodactl` の stdout）: 下の AC の対応に挙げる場面。スマホ幅は `ask-form-mobile.spec.ts` に足す。
- 回帰テストを足したら、実装の該当行を壊して落ちることを確かめる（全タスク共通）。

## 受け入れ基準との対応

- AC1: `scripts/sync-ask-form.mjs --from <public_docs> --commit 12a13b2`。差分（`690d26d..12a13b2`）の安全の確認を `decisions.md` に残す。入力は public_docs の clone。
- AC2: 部品が描く（取り込みで入る）。E2E がボタン・欄・文言（「＋ 自由記述」「自由記述を閉じる」「自由記述（入力あり）を開く」）・`text` に無いこと・スマホ幅（タップで開いて書ける）を見る。
- AC3: `normalizeAskSpec` が `false` を残し、部品が読む。E2E が `comments: false`・`comment: false`・即確定を見る。入力は `sodactl ask` に渡す定義。
- AC4: 部品の `detail.comments` → 枠の `onSubmit` → `ask.answer` → `AskService.answer` → 結果 → `sodactl ask` の stdout。E2E が端から端まで見る: 書いた質問の id と文（前後の空白なし）／閉じた欄の内容も入る／空白だけの欄は入らない／`showIf` で隠れた質問の欄は入らない／いったん隠れて再び見えた質問の欄は入る／何も書かなければ項目が無い。
- AC5: `ask.fixtures.test.ts` が新しい `normalize.json` の全例を読む。
- AC6: `ask.fixtures.test.ts` が新しい `collect.json` の全例を読む（`state.comments` を `AskFormState` に重ねる）。
- AC7: `checkAskAnswer`（単体）と `AskService`（単体・統合）。境界の 10000／10001 は `AskAnswerParams` のテスト。
- AC8: 部品は `textarea` の値として扱う（HTML にしない）。E2E が `<script>`・`<img onerror>` を書いて動かないこと・結果に文字のまま入ることを見る。サーバのログに中身が出ないことは統合テストで見る。
- AC9: `comments` なしの回答の既存のテストが通る。`sodactl ask` が結果を作り直さないことをコードで確かめ、`decisions.md` に残す。
- AC10: 直す箇所——`third_party/ask-form/README.md`（「取り込んでいる版は 1.2.2」→ 1.3.0／「`detail` のうち `answers`・`custom`・`note` だけ」に `comments` を足す／「通す項目を足すときに直す場所」のいま通している項目に `comments`・`comment`／「E2E が読む部品の内部」の本数・ファイル名・実行コマンド・表・`grep` に `data-ask-comment`・`data-ask-comment-toggle` と新しい spec／「枠が使っている部品の受け渡し」に、枠が `[data-ask-comment-toggle]` の `click` を読む例外）、`docs/sodactl.md`（:228, :233, :265 付近。定義の `comments`・`comment`、結果の `comments`、大きさの上限）、`packages/cli/skills/sodactl/SKILL.md`（:123, :128 付近）、`docs/verification.md`（:745 の ask-form 本体と比べる項目・:759 以降の節に手順）、`docs/machines.md`（リモートもこの版が要る）、`packages/web/src/ask/askFormElement.ts` の JSDoc、`packages/protocol/src/paneSocket.ts:28` のコメント。
- AC-I1: 部品の動き。E2E が開閉・内容が残る・`aria-expanded`・欄の読み上げ用の名前を見る。
- AC-I2: 部品の動き（`textarea` の `Enter` は改行）。E2E が、欄の中の `Enter` で `ask.answer` が 0 件（改行が入る）・`Ctrl+Enter` で 1 件・欄の中の `Esc` で `ask.cancel` が 1 件を見る。
- AC-I3: E2E がキーだけで `Tab` → 開く → 書く → `Ctrl+Enter`。
- AC-I4: 部品の動き。E2E が、開いた後の `shadowRoot.activeElement`、キーで閉じた後のボタン、目次・`Alt+PageDown`・未回答への移動の後が自由記述の欄でないことを見る。
- AC-I5: 枠の高さの読み直し。E2E が、欄を開く前後のダイアログの高さ（増える）と、上限のフォームで画面に収まり欄が見えることを見る。自由記述の欄の上でのキー入力・ホイールが端末の pane へ漏れないことを、欄にフォーカスを置いた状態で見る（既存の件は自由記述の欄の上では見ていない）。絞り込みの入力・`showIf` の出し入れでは、ダイアログの高さが今までどおり変わらないことも見る。
