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
