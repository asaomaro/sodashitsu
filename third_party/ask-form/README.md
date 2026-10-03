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
書けない（写した先が既存のファイル・書けないフォルダ。全部を一時の名前で書いてから置き換える。書く段階での失敗なら元は変わらない。置き換え（rename）の途中で失敗したら、`SOURCE.json` を最後に置き換えるので `--check` が食い違いを検出する）。

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
5. **E2E が読む部品の内部の属性・要素が残っている**ことを確かめる（下の「E2E が読む部品の内部」）。
6. `fixtures/*.json` の `sodashitsu` の欄（Sodashitsu だけ結果が違う例）を見直す（下の「試験データの `sodashitsu` の欄」）。
7. 部品の動きを書いた `docs/verification.md`・`docs/sodactl.md`（「画面の部品と同期」「質問のフォーム」）の段を、新しい版に合わせて見直す。
8. 確かめた結果を、その作業の `decisions.md` に 1 件として残す。

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

## E2E が読む部品の内部

「枠が使っている部品の受け渡し」とは別に、ask 関連の E2E 4 本（`packages/e2e/src/specs/ask-form.spec.ts`・`ask-form-paging.spec.ts`・
`ask-form-extras.spec.ts`・`ask-form-mobile.spec.ts`）は、部品の Shadow DOM の中の属性・要素を CSS ロケータ（Playwright は open の Shadow DOM を越える）で読む。
共通の読み方は `packages/e2e/src/support/askForm.ts` に集めてある（属性名が変わったときの直し先。spec にも直接書いたものが残る）。
spec が使っているものを `grep -o` で拾うと次のとおり。

| 属性・要素 | 何を見るか（spec の使い方） |
| --- | --- |
| `[data-ask-title]` | 定義の `title`（部品の中の見出し。無ければ「質問」）。枠の `[data-ask-origin]`（Shadow DOM の外・`AskDialog.vue`）とは別物 |
| `[data-ask-question="<id>"]` | 質問の枠（`:visible` で「いま出ている質問」を数える。`aria-invalid`・クラス `missing` も読む） |
| `[data-ask-note]` | 補足欄（最後のページ） |
| `[data-ask-status]` | 状態の行（未回答の知らせ。「未回答」の文字を読む） |
| `[data-ask-submit]`・`[data-ask-cancel]` | ［決定］・［キャンセル］のボタン |
| `[data-ask-page]`（`[aria-current="page"]`）・`[data-ask-next]`・`[data-ask-prev]` | ページの番号のボタン・［次へ］・［前へ］（ページ分けの確認の土台。1 枚のときは番号が 0 個） |
| `label.opt`（`.name`・`.key`）・`label.opt.other input[type=text]`・`input[data-other]` | 選択肢の行（表示名・値の表示）・「その他」の入力欄 |
| `input[type=radio]`・`textarea`・`input[type=search]`・`fieldset[aria-invalid]` | 選択肢の入力・補足欄・絞り込みの欄・未回答の強調 |
| `.cnt`・`.intro`・`.help` | 絞り込みの件数の表示・定義の導入文（`intro`）・質問の説明（`help`） |

属性名が変わった場合、E2E は一斉に落ちるのが普通だが、**落ちずに緑になる**ことがある（「見えない要素を数えて 0 件」を期待する件、
`toHaveCount(0)` や `not.toBeVisible()` は、属性が消えても通る）。取り込んだら次の順で確かめる。

1. 先に ask 関連の E2E 4 本を流す（`pnpm build` のあと、`cd packages/e2e && pnpm exec playwright test src/specs/ask-form.spec.ts src/specs/ask-form-mobile.spec.ts src/specs/ask-form-paging.spec.ts src/specs/ask-form-extras.spec.ts`）。
2. 落ちなくても、各属性が部品の `ask-form.js` に残っているかを `grep` で確かめる。0 なら名前が変わっている（E2E の側が空振りしている）。

```sh
for a in data-ask-title data-ask-question data-ask-note data-ask-status data-ask-submit data-ask-cancel \
         data-ask-page data-ask-next data-ask-prev data-other aria-invalid aria-current; do
  echo "$a: $(grep -c -- "$a" third_party/ask-form/ask-form.js)"
done
grep -c 'data-ask-submit' third_party/ask-form/ask-form.js    # 1 つだけ確かめるなら
grep -n "type: 'search'\|'search'" third_party/ask-form/ask-form.js   # input[type=search]
grep -c "'intro'\|'help'\|'cnt'" third_party/ask-form/ask-form.js    # .intro・.help・.cnt
```

（`data-ask-origin` は部品ではなく枠の `AskDialog.vue` にある属性なので、`ask-form.js` には無い。0 で正しい。）
`label.opt`・`.name`・`.key` は一般的な語なので、`grep -c` ではなく、E2E の `showValue` の件（`ask-form-extras.spec.ts`）が通ることで確かめる。

## 試験データの `sodashitsu` の欄

`fixtures/normalize.json`・`fixtures/collect.json` の例に、`expect` のほかに `sodashitsu` の欄が付くことがある（`about` に「実装ごとの差は、
その実装の名前の欄に `expect` を書いて上書きする」とある）。ask-form の側の結果と、**Sodashitsu だけ結果が違う例**で、`note` に理由が書いてある
（例: 部品の知らない型は ask-form では `unknown_type`、Sodashitsu は「対応していない型」として `unsupported_type`。`edit`・`rank`・`table` の型も Sodashitsu は同じ扱い）。読み方:

- `ask.fixtures.test.ts` は、`sodashitsu` の欄があればそちらの `expect` で比べる。欄の無い例は、ask-form と同じ結果でなければならない。
- 取り込み後に `sodashitsu` の欄が増えた・減った・`note` が古くなったときは、その差が今も意図したものかを見直す。
  部品が新しい型・項目を描けるようになったのに Sodashitsu が通していないなら、この欄が残っていて当然（通すかは「通す項目を足すときに直す場所」で決める）。
  Sodashitsu が通すようにしたら、その例から `sodashitsu` の欄を消す（残すと通した結果と食い違って落ちる）。
