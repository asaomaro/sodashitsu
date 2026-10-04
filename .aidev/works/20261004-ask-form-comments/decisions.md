# 判断の記録: 20261004-ask-form-comments

## D1: 取り込む版と範囲

利用者の指示（2026-10-04「ask-form が更新されたので、こちらの取り込み作業も進めて」）。public_docs `12a13b2`（部品 1.3.0。質問ごとの自由記述）。部品を写すだけでは届かない（サーバが知らない項目を落とす）ので、定義の `comments`・`comment` と回答の `comments` を通す作業として行う。実装フェーズは、sodactl で別の pane に起動した Claude Code（sonnet）に任せる（利用者の指示）。

## D2: 部品の差分の安全（`690d26d..12a13b2` の `ask-form.js`。主エージェントが差分を全部読んだ）

`ffd516c` までは `ask-form.js` は不変で、`12a13b2` の 48 行の差分だけ。追加に、通信・`window`・`document`（`createElement` 以外）・`innerHTML` 系・`eval`・`location`・保存領域・`cssText`・`href` は無い。定義の値の行き先は、ボタンと欄の属性の値（`aria-label` = 質問の label ＋固定の文、`data-ask-comment`・`data-ask-comment-toggle` = 質問の id）だけで、HTML・スタイル・属性名には入らない。新しいリスナーは Shadow DOM の中のボタンの `click` 1 つ。利用者が書いた文は `textarea` の値として扱われ、HTML にならない。

## D3: 設計の独立点検で決めたこと

- 高さの追従は、自由記述のボタンの `click` のときだけ（絞り込み・`showIf` で高さを変える既存の動きの変更を避ける）。枠が部品の内部の属性 `[data-ask-comment-toggle]` を読む例外を README に載せる。
- 自由記述の長さの合計に上限 100000 を設ける（上限が無いと最悪で約 6MB になり、`/ws` の 4MB のフレームの上限を超えて接続が切れる）。
- 中継先（保存したマシン）の `soda` が古いと、付けない指定が効かず、書いた文が黙って落ちる。受け入れ、`docs/machines.md` に書く。
- 新しい画面と古いサーバ（同じマシン）は、バンドルをサーバ自身が配るので通常は起きない。検証しない。

## D4: 前の未 push のブランチ

`chore/ask-form-sync-ffd516c`（試験データだけを `ffd516c` に写したもの。63b0fb9）は、この work が `12a13b2` に写すので不要になる。削除は deliver の時点で利用者に確認する。

## D5: T1 部品と試験データを `12a13b2`（1.3.0）に写した

- `sync-ask-form.mjs --commit 12a13b2` で 3 ファイルと `SOURCE.json` を写し、`--check --from /workspaces/public_docs` は一致。
- `git -C /workspaces/public_docs diff 690d26d..12a13b2 -- docs/ClaudeCode/skills/other/ask-form/ask-form.js` を実装セッションでも全部読んだ。D2 と食い違いは無い（追加は VERSION・FIELDS への `comments`/`comment`・`.cmt` の CSS・`addComment`〔ボタンの `click` 1 つ〕・`collect`/`value` の `comments`・フォーカス先の `textarea:not([data-ask-comment])` だけ。通信・`window`・`document`・`innerHTML` 系・`eval`・`location` は無い）。
- 写した直後の `pnpm test` 全体（`pnpm build` 後）: 389 ファイル中 1 件だけが落ちた＝ `ask.fixtures.test.ts` の normalize の「自由記述: 付けないとき…」。想定どおり（web の単体は落ちない。T5・T7 で直す必要のある落ちは無い）。
- T1 は部品の無改変の写しだけで自前の差分が無いので、独立点検（`taskcheck`）は行わない（`--check` の一致が検証）。

## D6: `comments` の `__proto__` のキー（T3 で確かめた）

- `AskAnswerParams`（zod の `z.record`）は、`JSON.parse` が作った自分の項目 `__proto__` を**黙って落とす**（ほかのキーは残る。`{"__proto__":"x","b":"y"}` → `["b"]`）。`messages.test.ts` で固定した。
- スキーマをすり抜けて `checkAskAnswer` に届いた場合に備え、`checkAskAnswer` は `__proto__` を「定義に無い id」として断る（`ask.test.ts` で確認。定義の id に `__proto__` は使えない）。どちらの経路でも、`__proto__` が結果の `comments` に入ることは無い。

## D7: `sodactl ask` は結果を作り直さない（T6 でコードを読んで確かめた）

- `packages/cli/src/commands/ask.ts`: 定義は `readAskSpec` が検査だけして**読んだままのオブジェクト**を返し（:75 付近）、結果は `runAsk` が `deps.print(result)` でそのまま出す（:116 付近。`status` 別の組み立て・項目の選り分けは無い）。受け口 `pane.sock` 経由も、サーバの `askOpenOp` が `AskService.open` の結果をそのまま返し（`packages/server/src/panesocket/askOp.ts:23-33`）、CLI は `viaPaneSocketOrSession` の返り値をそのまま出す。したがって `comments` を通すための CLI 側の変更は要らない（製品コードは変えない）。`ask.test.ts` が「同じオブジェクトをそのまま出す」ことを固定した。
- 受け口・中継越し（`machines.integration.test.ts` の質問の件）でも `comments` つきの回答が結果に出ることを統合テストで確かめた。

## D8: T7 既存の E2E を 1.3.0 に合わせた（README「取り込むコミットを替えるたびに確かめること」の確認）

- 既存の ask の E2E 4 本（56 件）を `pnpm build` の後に流した。初回の落ちは 2 件: ① `ask-form-index.spec.ts`「質問を移っても…高さは変わらない」（自由記述のボタンで中身が 672px になり、「上限より十分小さい」の閾値 604px を超えた）、② `ask-form.spec.ts`「キーボードだけで答えられる」（SPEC が背が高くなって画面に収まらず、目次が 3 項目出た。件の前提は「目次は出ない」）。どちらも、部品が各質問に自由記述のボタンを足したことで中身が高くなったための、定義の側の合わせ直し: ① はその定義に `comments: false`（件の主題は「質問を移っても高さが変わらない」で、自由記述と無関係）、② は `paging: false`（目次なしの Tab を見る件）。**期待（閾値・Tab の順・回答の JSON）は変えていない**。ただし ② の「目次は出ない」は `paging: false` による固定の観測になった（「収まれば目次は出ない」の確認は `ask-form-index.spec.ts` の目次の件が引き続き担う）。
- 直した後、4 本を 2 回続けて流して 56 件とも通った（同じ結果）。`Tab` を数える件（`ask-form.spec.ts` の 382・401・527 行目〔T7 の差分でコメントが 1 行増えた後の行番号〕・`ask-form-index.spec.ts:654-657`）は変更なしで通る（自由記述のボタンは、ラジオの後ろ・次の質問の前に入るが、これらの件は 1 問目のラジオから `ArrowDown` や `Alt+PageDown` で動くので順番に影響しない）。
- 「E2E が読む部品の内部」の `grep`: README の属性 10 個はすべて 1 以上（`data-ask-title` 2・`data-ask-question` 1・`data-ask-note` 1・`data-ask-status` 1・`data-ask-submit` 1・`data-ask-cancel` 1・`data-ask-index` 1・`data-other` 3・`aria-invalid` 2・`aria-current` 1）、`nav.index`/`.sec`/`.lack` 3・`intro`/`help`/`cnt` 5。新しい `data-ask-comment` 4・`data-ask-comment-toggle` 1 を T8 以降の E2E が読む（README の表は T10 で足す）。
- 共通の試験データの `sodashitsu` の欄: `normalize.json` の「誤り: 知らない型」だけ（`collect.json` は無し）。自由記述の例は欄を持たない（ask-form と同じ結果）ので見直す必要は無い。
