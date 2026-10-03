# ask-form の部品（取り込み）

このディレクトリの `ask-form.js`（カスタム要素 `<ask-form>`）と `fixtures/normalize.json`・`fixtures/collect.json`
（定義の検査・回答の集め方の、共通の試験データ）は、public_docs（https://github.com/asaomaro/public_docs）の
ask-form スキルから**無改変で**写したものです。

- 取得元コミット・取得日・部品の版・各ファイルの SHA-256: `SOURCE.json`（同期スクリプトが書く。手で直さない）
  - 取得日 `retrieved` は UTC の日付。同じコミット・同じ中身を写し直しただけなら変えない。
- 取得元パス: `docs/ClaudeCode/skills/other/ask-form/`（`ask-form.js`・`fixtures/normalize.json`・`fixtures/collect.json`）
- ライセンス: public_docs に LICENSE の記載が無い。同じ作者のリポジトリ。
- 変更点: なし（無改変で取り込み）。
- 使う所:
  - `ask-form.js` — Web（`packages/web/src/ask/askFormElement.ts` が副作用だけの `import` で読み、`<ask-form>` を登録する。
    `sodactl ask` の質問のフォームの中身）。要素の型は Web の側に宣言してある（このフォルダに `.d.ts` は置かない）。
    置く側は `packages/web/src/components/AskDialog.vue`（ダイアログの枠と、最上部の「どの pane からの質問か」の行だけを持つ。
    その行は部品の外＝Shadow DOM の外にあり、定義からは触れない）。
  - `fixtures/*.json` — `packages/protocol/src/ask.fixtures.test.ts` が `fs` で読む（`normalizeAskSpec`・`collectAsk`・
    `checkAskAnswer` が ask-form の側の実装と同じ結果になることを確かめる）。

## 決まり

- **写したファイルは手で直さない**（1 バイトも変えない。prettier・eslint も当てない。prettier はリポジトリ直下の
  `.prettierignore` に `third_party/ask-form/` を入れてある）。直したくなったら ask-form の側へ伝え、直った版を写し直す。
- 手で直していないことは `scripts/sync-ask-form.test.ts`（`pnpm test`）が `SOURCE.json` の SHA-256 と比べて確かめる。
  これは、写したファイルだけが手で直された場合を捕まえる。`SOURCE.json` も一緒に書き換えられた場合は、元のコミットとの突き合わせ（`node scripts/sync-ask-form.mjs --check --from <public_docs の clone>`）でしか分からない（clone が要るので `pnpm test` には入らない。取り込むたびと、`docs/verification.md` の手順で行う）。
- 改行の変換でバイトが変わらないよう、`.gitattributes` に `third_party/ask-form/** -text` を置いてある。

## 更新の手順

手元に public_docs の clone が要る（ネットワークは使わない。clone の作業ツリーには触らず、`git show` で読むだけ）。

```sh
node scripts/sync-ask-form.mjs --from <public_docs の clone> --commit <コミット>   # 写して SOURCE.json を書く
node scripts/sync-ask-form.mjs --check --from <public_docs の clone>              # 写した先・SOURCE.json・元が一致するか
node scripts/sync-ask-form.mjs --check                                            # 写した先が SOURCE.json と一致するか
```

終了コードは 0 成功／1 食い違い（`--check`）／2 使い方の誤り・取れない（リポジトリでない・コミットが無い・ファイルが無い）・
書けない（写した先が既存のファイル・書けないフォルダ。全部を一時の名前で書いてから置き換えるので、途中で失敗しても元は変わらない）。

### 取り込むコミットを替えるたびに確かめること

1. **`ask-form.js` の差分を読む**（前に固定していたコミットから。
   `git -C <clone> diff <前のコミット> <新しいコミット> -- docs/ClaudeCode/skills/other/ask-form/ask-form.js`）。
   定義は敵対的な入力として扱うので、次が変わっていないことを確かめる:
   - 禁止する語が無い: `innerHTML`・`insertAdjacentHTML`・`outerHTML`・`document.write`・`eval`・`new Function`・`fetch`・
     `XMLHttpRequest`・`WebSocket`・`EventSource`・動的 `import()`・`localStorage`／`sessionStorage`・`location`・`window`・
     `cssText`・`href`（`document` は `document.createElement` だけ）。
   - 定義の値をスタイル・`src` へ入れる箇所（`style.*`・`setProperty`・`img`／`Audio` の `src`）が、数・色の検査や
     `resolveMedia` を通したものだけであること。
   - キーの扱い（`Ctrl/Cmd+Enter`・`Alt+PageDown`／`Alt+PageUp`・`Esc`・`Enter`）と、フォーカスを動かす箇所。
2. `pnpm test`（`scripts/sync-ask-form.test.ts`・`packages/protocol/src/ask.fixtures.test.ts`・
   `packages/web/src/ask/askFormElement.test.ts` を含む）と E2E を流し直す。試験データの例が増えて落ちたら、
   下の「通す項目を足すとき」に従って Sodashitsu の側を合わせる。
3. **枠が使っている部品の公開の受け渡しが変わっていない**ことを確かめる（下の「枠が使っている部品の受け渡し」。
   名前・意味が変わっていたら `askFormElement.ts` の型と `AskDialog.vue` を合わせる）。
4. 部品の先頭の `VERSION` と `SOURCE.json` の `version` が同じこと（`scripts/sync-ask-form.test.ts` が比べる）。
5. 確かめた結果を、その作業の `decisions.md` に 1 件として残す。

## 枠が使っている部品の受け渡し

`AskDialog.vue` が使うのは、部品の先頭のコメントにある公開の受け渡しのうち次のもの（型は `packages/web/src/ask/askFormElement.ts`）。
部品の中（Shadow DOM の中の要素・クラス名）には触らない。

- `spec`（検査済みの定義。入れるたびに部品が全部描き直すので、質問が替わったときに 1 回だけ入れる。部品は定義に書き込むので写しを渡す）・`busy`（送信中）。
- `submit()`・`step(±1)` — 開いた直後はフォーカスが固定の行（部品の外）にあり、部品のキーは届かない。その間の `Ctrl/Cmd+Enter` と
  `Alt+PageDown`／`Alt+PageUp` を、枠が `submit()`・`step()` で取り次ぐ。**`step()` は部品 1.1.0 から**（それより前のコミットへ戻すと、この取り次ぎが動かない）。
- `relayout()`・`contentHeight` — 枠が先に最大の高さを与えてから定義を入れ、いちばん高いページの高さにダイアログを合わせる
  （ページを移っても高さが変わらない）。高さでのページ分けは部品が最初の 1 回だけ行う。
- イベント `ask-submit`（`detail` のうち `answers`・`custom`・`note` だけをサーバへ送る）・`ask-cancel`・`ask-unsupported`
  （質問を取り消してトーストで知らせる。`reason` は定義に由来する文字を含むので画面に出さない）。`Esc` は部品が `ask-cancel` を出さないので、枠（`<dialog>` の `cancel`）が取り消す。
- 配色の変数 `--ask-bg`・`--ask-fg`・`--ask-border`・`--ask-accent`・`--ask-accent-fg`・`--ask-error`・`--ask-warn`（テーマの変数を割り当てる）。
- 使っていないもの: `resolveMedia`（入れないので、画像・音のプレビューは出ない）・`notify()`・`value`・`pageCount`。

## 通す項目を足すときに直す場所

部品を写し直しても、定義の新しい項目は自動では届かない（サーバの `normalizeAskSpec` が、知っている項目だけを通す）。
いま通しているのは `single`・`multi`・`text` の型と、`paging`・`page`・`filter`・`showValue` を含む項目
（一覧は `docs/sodactl.md`「質問のフォーム」の「入力」）。部品が描ける `edit`・`rank`・`table` の型と、`code`・`group`・`image`・`audio`・
`preview`・`thumb` 等の項目は通していない（型は `unavailable`・項目は落とす）。

- `packages/protocol/src/ask.ts` — 型（`AskSpec`・`AskQuestion`）と `normalizeAskSpec`（検査して写す行）。
  誤りには分類 `AskSpecFailReason`（試験データ `normalize.json` の `reasons` の名前）を付ける。
- `packages/protocol/src/ask.test.ts`・`ask.fixtures.test.ts` — 試験データで足りない境界の例。
- `packages/web/src/ask/askFormElement.ts` — 部品の公開の受け渡しのうち、Sodashitsu が使うものの型。
- `docs/sodactl.md`「質問のフォーム」・`packages/cli/skills/sodactl/SKILL.md` — 利用者向けの説明。
