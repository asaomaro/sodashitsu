# ask-form の部品（取り込み）

このディレクトリの `ask-form.js`（カスタム要素 `<ask-form>`）と `fixtures/normalize.json`・`fixtures/collect.json`
（定義の検査・回答の集め方の、共通の試験データ）は、public_docs（https://github.com/asaomaro/public_docs）の
ask-form スキルから**無改変で**写したものです。

- 取得元コミット・取得日・部品の版・各ファイルの SHA-256: `SOURCE.json`（同期スクリプトが書く。手で直さない）
- 取得元パス: `docs/ClaudeCode/skills/other/ask-form/`（`ask-form.js`・`fixtures/normalize.json`・`fixtures/collect.json`）
- ライセンス: public_docs に LICENSE の記載が無い。同じ作者のリポジトリ。
- 変更点: なし（無改変で取り込み）。
- 使う所:
  - `ask-form.js` — Web（`packages/web/src/ask/askFormElement.ts` が副作用だけの `import` で読み、`<ask-form>` を登録する。
    `sodactl ask` の質問のフォームの中身）。要素の型は Web の側に宣言してある（このフォルダに `.d.ts` は置かない）。
  - `fixtures/*.json` — `packages/protocol/src/ask.fixtures.test.ts` が `fs` で読む（`normalizeAskSpec`・`collectAsk`・
    `checkAskAnswer` が ask-form の側の実装と同じ結果になることを確かめる）。

## 決まり

- **写したファイルは手で直さない**（1 バイトも変えない。prettier・eslint も当てない）。直したくなったら ask-form の側へ伝え、
  直った版を写し直す。
- 手で直していないことは `scripts/sync-ask-form.test.ts`（`pnpm test`）が `SOURCE.json` の SHA-256 と比べて確かめる。
- 改行の変換でバイトが変わらないよう、`.gitattributes` に `third_party/ask-form/** -text` を置いてある。

## 更新の手順

手元に public_docs の clone が要る（ネットワークは使わない。clone の作業ツリーには触らず、`git show` で読むだけ）。

```sh
node scripts/sync-ask-form.mjs --from <public_docs の clone> --commit <コミット>   # 写して SOURCE.json を書く
node scripts/sync-ask-form.mjs --check --from <public_docs の clone>              # 写した先・SOURCE.json・元が一致するか
node scripts/sync-ask-form.mjs --check                                            # 写した先が SOURCE.json と一致するか
```

終了コードは 0 成功／1 食い違い（`--check`）／2 使い方の誤り・取れない（リポジトリでない・コミットが無い・ファイルが無い）。

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
3. 確かめた結果を、その作業の `decisions.md` に 1 件として残す。

## 通す項目を足すときに直す場所

部品を写し直しても、定義の新しい項目は自動では届かない（サーバの `normalizeAskSpec` が、知っている項目だけを通す）。

- `packages/protocol/src/ask.ts` — 型（`AskSpec`・`AskQuestion`）と `normalizeAskSpec`（検査して写す行）。
  誤りには分類 `AskSpecFailReason`（試験データ `normalize.json` の `reasons` の名前）を付ける。
- `packages/protocol/src/ask.test.ts`・`ask.fixtures.test.ts` — 試験データで足りない境界の例。
- `packages/web/src/ask/askFormElement.ts` — 部品の公開の受け渡しのうち、Sodashitsu が使うものの型。
- `docs/sodactl.md`「質問のフォーム」・`packages/cli/skills/sodactl/SKILL.md` — 利用者向けの説明。
