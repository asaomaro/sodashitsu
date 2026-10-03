# 判断の記録: 20261003-ask-form-component

追記式。既存のエントリは書き換えない。

## D1: 起こした経緯・規模・モード

- **経緯**: public_docs の ask-form を改修しているセッション（pane p2。セッション名 `other-c3`）から、「ask-form の画面を部品にして Sodashitsu が取り込み、検査は共通の試験データでそろえる」方法の検討と作業の依頼があった（2026-10-03）。
  - Sodashitsu 側の検討を返した（部品に求める条件・試験データの形・ページングだけの先行実装はしない・作業を A と B に分ける）。要点: 部品を取り込んでも定義の新しい項目は自動では届かない（`normalizeAskSpec` が知っている項目だけを通す）ので、同期の単位は「部品のファイル」＋「通す項目の一覧」＋「共通の試験データ」。
  - p2 と利用者が決めたこと: ページ移動のキーは `Alt+PageDown`／`Alt+PageUp`（単独ウィンドウも同じ）／1 問だけのときの即確定は Sodashitsu の決まり（矢印キーでは確定しない）に部品を合わせる／決定・キャンセル・未回答の表示は部品が持つ／部品が受ける定義は試験データの「正規化後」を正にし、差は Sodashitsu の形に寄せる。
  - 部品は public_docs の `main` に入った（94a5ef6。PR asaomaro/public_docs#107）。`static version` 1.0.0。
- **届いた部品の確認（作業を起こす前。Sodashitsu のコードは変えていない）**: 試験データをいまの `normalizeAskSpec`・`collectAsk` に通し、49 例中 47 例が一致。食い違いは 2 例（空の `showIf` を `{}` のまま残す／`collectAsk` が複数選択の値を定義の順に揃えない）で、試験データが正。誤りの分類の名前は全部対応が付く。
  `ask-form.js` を検索した範囲で `innerHTML` 系・通信・`window`／`document` への操作（`document.createElement` を除く）・`eval` は無い。全文の通読は、この作業の research で行う。
  条件との差 4 点（任意の変数 3 つ／差分表示と拡大表示の色を直に書いている／入力欄の 16px は `pointer: coarse` のときだけ／読み取りの `value` 等とメソッド）は受け入れた。
- **決定**: この作業は「作業 A」（部品の取り込み・`AskDialog.vue` を枠だけにする・`page`／`paging` を通す・共通の試験データのテスト・食い違い 2 例の修正）。型と項目を増やす「作業 B」は別に起こす。
  `profile: full`・`mode: autonomous`（利用者の選択。`humanGates` なし）。ブランチは `main`（862fbd4）から切った `feature/ask-form-component`。
- **research**: 利用者が操作する部品を作る・未確定事項が残る、に当たるので実施する（`protocol.md`「4.5」）。

## D2: requirements の独立点検（1 ラウンド・14 件）と、写すコミット

- **点検**: must 1・should 6・nit 7。全件を反映した。must は「試験データの `sodashitsu` の欄（`page`・`paging` の 3 例）が、この作業の後の Sodashitsu と食い違い、写したファイルを直さない決まりの下ではテストを通せない」。
- **写すコミット**: ask-form の側に 3 例の欄を外した版を依頼し、届いた。**固定するコミットは public_docs の 29bfd09**（マージコミット。変更は d3b0ab3。PR asaomaro/public_docs#108）。
  - `fixtures/normalize.json`: 3 例から `sodashitsu` の欄が外れ、「誤り: 知らない型」（`unsupported_type`）だけが残る。
  - `ask-form.js`: `unsupported()` が渡された定義に `q.options = []` を書き込む処理をやめた（こちらが気づいて伝えた点）。`static version` は 1.0.1。
  - requirements の「届かないときは読み替える」の代替は不要になった。

## D3: design の方針（research の申し送り 1〜16 への答え）

承認者がいない（autonomous・`humanGates` なし）ので、方針と `design.md` を同じ approve ゲートで受ける。番号は research「design への申し送り」の番号。

1. **写した先 = `third_party/ask-form/`**（`ask-form.js`・`fixtures/normalize.json`・`fixtures/collect.json`・`SOURCE.json`・`README.md`）。先例（`third_party/herdr/`）に合い、配布物に丸ごと入る。Web は `packages/web` の外への相対の `import`（副作用だけ）で読み、**要素の型は Web の側に宣言する**（写したフォルダに手書きの `.d.ts` を混ぜない・`allowJs` は入れない）。試験データは protocol のテストが `fs` で読む（`rootDir` の外の JSON を `import` しない）。
   - 採らなかった案: `packages/web/src/` の中（protocol のテストが Web のフォルダを読むことになる）。
2. **同期スクリプトは手元の clone から `git show <commit>:<path>` で取る**（`scripts/sync-ask-form.mjs --from <public_docs の場所> --commit <コミット>`）。ネットワークは使わない（先例が無く、テストから呼べない）。`SOURCE.json` にコミットと各ファイルの sha256。`--check` は「写した先が `SOURCE.json` と一致するか」＋（`--from` があれば）「元の同じコミットと一致するか」。
   - **手で直していないことの検査**は vitest（`scripts/sync-ask-form.test.ts`）が `SOURCE.json` のハッシュと比べる（CI が無いので `pnpm test` で落とす）。改行の変換でバイトが変わらないよう `.gitattributes` に `third_party/ask-form/** -text`。
3. **`ask-unsupported` は取り消しにする**: 枠が `controller.cancel(askId)` を呼び（sodactl には `cancelled`）、トーストで「このフォームは、この画面では出せません」と知らせる。検査済みの定義では型・形の理由では起きない（サーバが検査済み）ので、起きるのは部品の例外だけ。利用者にボタンを押させる形（枠にボタンを足す）は、起きにくい場面のために枠を太らせるので採らない。
4. **`Esc`**: 絞り込みの欄に文字があるときの `Esc` は、絞り込みを消すだけ（取り消さない）を受け入れる。それ以外の `Esc` は今までどおり取り消し。AC-I1・AC-I2 の `Esc` は「絞り込みの欄に文字があるときを除く」と読む（docs に書く）。
5. **即確定の `Space`・選ばれている選択肢のクリック（R2）**: **ask-form の側へ直しを依頼した**（2026-10-03。決めた決まりと部品の実際が違うため）。直った版に固定し直す。届かないまま着地するときは、AC9 のうち「既に選ばれている選択肢での `Space`・クリック」を既知の差として `test-result.md` と PR に書く（枠で補わない——部品の中の要素を枠から覗いて同じ判定を二重に持つことになり、この作業の目的と逆）。
6. **固定の行にフォーカスがある間のキー（R3）**: 開いたときのフォーカスは今までどおり固定の行（AC-I4）。枠の `<dialog>` の `keydown` が、**部品の外にフォーカスがあるとき**だけ、`Ctrl/Cmd+Enter` → `el.submit()`、`Alt+PageDown`／`Alt+PageUp` → 部品の `[data-ask-next]`／`[data-ask-prev]`（出ていれば）を押す。どちらも `preventDefault()`。部品の中のキーは部品が止めるので、二重には効かない。部品に公開のメソッドが足されたら、そちらへ替える。
7. **ダイアログの高さ**: `form.html` と同じ手順——開いたら部品に「使える最大の高さ」を与える → `relayout()` → `contentHeight` に合わせる（最大を超えない）。ページを移っても高さは変わらない（一番高いページに合う）。画面の大きさが変わったときは、最大の高さだけを当て直す（ページは作り直さない——部品の決まり）。**いままで 1 枚だった定義が、高さに収まらなければページに分かれる**ことは受け入れる（AC4 そのもの。分けたくない定義は `paging: false`）。
8. **`paging`・`page` の検査**: `ask.py` と試験データに合わせる。`paging` は `"auto"`・真偽（`true` は `"auto"` と同じ）・1 以上の整数（それ以外は `paging_invalid`）。既定は埋めない（無ければ無いまま）。`page` は `null` を無し扱い・空文字は通す・文字列でなければ `page_invalid`・500 文字を超えたら `too_large`。検査の順は `ask.py` と同じ「id・label → id の重複 → `page` → `type`」。requirements の AC11（`true` を挙げていない）は、この決定で読み替える。
9. **誤りの分類は `normalizeAskSpec` の `Fail` に足す**（`reason`。試験データの `reasons` の名前）。テストの中だけの対応表にすると、文言を直したときに表が黙ってずれる。`message`・`unsupportedType` は今までどおり（sodactl・サーバは変えない）。
10. **試験データの `sodashitsu` の欄**: 解決済み（D2。29bfd09 に固定）。
11. **送信に失敗したとき**: 今までどおりトースト（`AskController` が出す）。枠は `el.busy = false` に戻す。部品の `notify()` は使わない（次の入力で消え、トーストと二重になる）。
12. **`filter`・`showValue` を通す**（どちらも真偽のときだけ。それ以外は落とす）。部品は、渡さないと「選択肢 12 件以上で絞り込みが付く」「表示名と値が違うと値が横に出る」が既定で効く。ask-form のウィンドウでは定義で止められるのに、Sodashitsu では止められない、という食い違いを作らないため。requirements の「対象外」の `filter` は、この決定でこの作業に入れる（絞り込みの欄そのものは部品が描くので、足すのは通す 1 行）。`__other__` は ask-form の側へ依頼した（D3-5 と同じ連絡）。届くまでは 3 の取り消しで受ける。
13. **テーマの割り当ては `AskDialog.vue` の `<ask-form>` の規則**に 7 つを書く（`--ask-bg: var(--soda-menu-bg)` 等）。任意の 3 つは渡さない（部品が `color-mix` で作る）。
14. **`isCustomElement` を `vite.config.ts` と `vitest.config.ts` の両方に足す**（`tag === "ask-form"`）。`spec` は Vue の束縛ではなく、`watch` の中で**命令的に 1 回だけ**入れる（入れるたびに描き直されて入力が消えるため）。入れるのは `structuredClone(toRaw(spec))`（部品が定義に書き込んでも store に付かない）。
15. **ライセンス**: public_docs に `LICENSE` が無い。`NOTICE` と `README.md` には事実（出どころ・コミット・同じ作者のリポジトリ・ライセンスの記載が無いこと）を書き、**PR で利用者に確認を求める**（持ち主の判断）。
16. **ask-form の側へ伝えたこと**: 直しの依頼 2 つ（即確定の `Space`・クリック／`__other__`）と、参考 4 つ（ページを移る公開のメソッド／常に描かれる拡大表示の `img`／`aria-invalid` と未回答のときのフォーカス／`SKILL.md:244`）。

### architecture を挟まない

- モジュール間の境界は動かさない（`AskDialog.vue` の中身が外の部品に替わる・protocol に項目を足す・`third_party` に置き場を足す）。新しい依存の向きは「Web → `third_party/ask-form/ask-form.js`」の 1 本で、先例（サーバ → `third_party/herdr`）と同じ向き。`protocol.md`「4.5」の 4 条件に当たらないと判断した。

## D4: design の独立点検（1 ラウンド・18 件）と、それで足した決定

- **結果**: must 0・should 9・nit 9。全件を `design.md` に最小の差分で反映した。2 ラウンド目は打っていない。
- **requirements の読み替え（この決定で読み替える。requirements の本文は書き換えない）**:
  - 機能要件「足すのは定義の 2 項目だけ」→ **4 項目**（`paging`・`page`・`filter`・`showValue`）。
  - AC16「`filter` は落とされ、絞り込みの欄が出ない」→ `filter` は通す。絞り込みの欄は、選択肢 12 件以上か `filter: true` で出て、`filter: false` で出ない（D3-12）。
  - AC11 の `paging` の値 → `true` も通す（D3-8）。
  - AC-I4「決定を押して未回答のページへ移されたときの行き先」→ **部品の動きを受け入れる**: フォーカスは動かさず、ページを替えて未回答の質問へスクロールし、状態の行に警告を出す。フォーカスを未回答の質問へ移すほうが親切だが、部品の中の動きなので、この作業では直さず ask-form の側へ参考として伝えた（D3-16）。
- **`__other__` という値の選択肢は、Sodashitsu の検査で断る**（D3-12 の「取り消しで受ける」を改める）。部品が「その他」と取り違えると、例外にならない場合でも利用者が選んだ値と違う回答が送られうる（research F15 は推測で、後から選んだ場合が分からない）。coding で部品の実際の動きを確かめ、害が無いと分かれば外す。ask-form の側が直したら合わせる。
- **高さの手順**: 「高さを与える → `spec` を入れる → `relayout()` → `contentHeight` に合わせる」の順にした（`spec` を先に入れると、高さ 0 でページ分けが保留になり、`ResizeObserver` と `relayout()` の 2 回が走る）。`contentHeight` が 0 のとき（単体テストの環境）は与えた高さを消す。
- **取り込むコミットを替えるたびに、94a5ef6 からの `ask-form.js` の差分を読む**（research が調べたのは 94a5ef6）。29bfd09 の差分は 2 行（`unsupported()` が定義へ書き込まない）で、安全・キー・ページ分けに関わらない。
- **既存の E2E は、実際の出方に合わせて書き直す**（ページに分かれるならページを移る。`paging: false` を足して逃げない）。

## D5: tasks の独立点検（1 ラウンド・14 件）

- **結果**: should 9・nit 5。全件を反映した（9 → 11 タスク）: `__other__` の確かめを T2 の前（T4 の中）へ移した／取り込むコミットの確定・差分の確認・配布物の確認を T10 として立てた／新しい E2E を「ページング」（T8）と「テーマ・絞り込み・安全」（T11）に割った／T5 に `structuredClone`・`resize`・トーストを明記した／AC3・AC-I2 の E2E の件と、開発サーバでの確認を足した。
- T10 は確かめが主で、自前の差分は「取り込み直し」があるときだけ生まれる。

## D6: coding の途中の判断（T1・T4・T2・T3・T6）

- **`__other__` という値の選択肢は、検査で断る**（`reason: "invalid"`。D4 の決定を確定）。部品 1.0.1 を単体テスト（happy-dom）で走らせた結果、4 通りすべてで害が出た: (a) `allowOther` なしの `single` で既定がその値 → 描けない（`ask-unsupported`・`render failed`）／(b) 同じく後から選ぶ → `el.value`・`submit()` が `TypeError` を投げ、決定できない／(c) `allowOther: true` と併存 → 値 `__other__` の入力が 2 つでき、選んでも未回答のまま・「その他」の欄の文字が回答になる（取り違え）／(d) `multi` で `allowOther` あり → 選んだ `__other__` が黙って落ちる。この動きは `packages/web/src/ask/askFormElement.test.ts` に「部品のいまの動き」として残した（部品の版が変わって動きが変わったら気づける）。実ブラウザでは確かめていない。
- **Web の読み込み方は design のまま**（副作用だけの相対の `import`）。`vue-tsc`・`vite build`・`vite dev`（`/@fs/…/third_party/ask-form/ask-form.js` が 200）で通ることを確かめた。`server.fs.allow`・`alias` は要らなかった。
- **同期スクリプトに `--dest <フォルダ>` を足した**（design に無い。テストが実物の `third_party/ask-form/` へ書かないため）。同じコミット・同じ中身の写し直しでは `SOURCE.json` の `retrieved` を変えない。`--check --commit` は使い方の誤り（比べるのは `SOURCE.json` のコミット）。
- **共通の試験データの比べ方**: 「`expect.spec` に書いた項目だけ比べる」を、「試験データのどこかの例が書いている項目名だけを、実際の出力から取り出して完全一致で比べる」と読んだ（`toMatchObject` では余分な `showIf: {}` を捕まえられず、陰性対照が落ちない）。collect の `state` は、試験データの `about`（書かれていない質問は何も選んでいない）に従い、空の状態に重ねる（design の「`initialAskState` に重ねる」と違う。いまの 20 例に `default` を持つ定義は無いので結果は同じ）。
- **`reason` の割り当てで文書に無かったもの**: 質問がオブジェクトでない → `invalid`／`showIf` のキーが `__proto__` → `showif_unknown_id`。`valueOf` の並べ替えは `multi` だけ（選択肢に無い値は落とす）。`{a: []}` のような `showIf` は残す（キーが 0 個のときだけ落とす）。
- **陰性対照**（条項 `regression-negative-control`）: 空の `showIf` を落とす行・`valueOf` の定義の順を、それぞれ 1 行だけ戻すと、共通の試験データの該当の 1 例と `ask.test.ts` の 1 件が落ちた（生の出力は `test-result.md` に貼る）。

## D7: 部品 1.1.0（public_docs 816bf82）に取り込み直す

- **経緯**: ask-form の側が、依頼した直し 2 つと参考 4 つを入れて `main` にマージした（816bf82。変更は c4ad486。PR asaomaro/public_docs#111）。`static version` は 1.1.0。
  - 即確定: 決定のきっかけを `change` から `click` にした。既に選ばれている選択肢のクリック・`Space`・`Enter` で決定し、矢印キーで移ったときの `click` では決定しない。
  - `__other__`: 「その他」の印を値ではなく `data-other` 属性で持つ（その入力の `value` は空）。値が `__other__` の選択肢はふつうの選択肢。値が空文字の選択肢も選べる。
  - 公開のメソッド `step(±1)`／拡大表示は開いたときだけ Shadow DOM に入れる／未回答の `fieldset` に `aria-invalid="true"`・決定して未回答があれば最初の未回答の質問の入力へフォーカス／`SKILL.md` の記述の直し。
  - `fixtures/collect.json` に 3 例（値が `__other__` の選択肢・それと「その他」の併用・値が空文字の選択肢）。`normalize.json` は 29bfd09 のまま。
- **決定**:
  - 固定するコミットを **816bf82** にする（T10 の「取り込み直し」を、T7 の前に行う）。94a5ef6 からの `ask-form.js` の差分を読んで、安全・キーの扱いを確かめる。
  - **`__other__` を断る検査（D6）を外す**（部品が直り、試験データが「ふつうの選択肢」としている）。`askFormElement.test.ts` の「部品のいまの動き」は、新しい動きに書き直す。
  - **値が空文字の選択肢を回答として扱う**: 新しい試験データをいまの `collectAsk` に通すと、この 1 例が食い違う（空文字の値を未回答として扱っている）。`collectAsk`（`valueOf`）と `checkAskAnswer` を直す。
  - 枠が取り次ぐページ移動は、ボタンを押す形から `el.step(±1)` に替える（D3-6 の「公開のメソッドが足されたら替える」）。
  - AC-I4「決定して未回答のページへ移されたときの行き先」は、部品 1.1.0 で「最初の未回答の質問の入力へフォーカス」になった（D4 の「フォーカスは動かさない」は 1.0.1 の動き）。E2E はこの動きを見る。
  - ask-form の側の確かめは「プログラムからイベントを起こした」もの。Sodashitsu の E2E で、実際のキー入力（Playwright のキーボード）とクリックで確かめ、違いがあれば知らせる。

## D8: T5（`AskDialog.vue` の書き直し）の途中の判断

- `sending` の ref をやめ、`el.busy` だけにした（`cancel()` も `el.busy = true`）。`Esc` は `busy` を見ないので、送信中も取り消せるのは今までどおり。
- `structuredClone` が投げたときは `el.spec = null` で前の質問の中身を消してから、取り消し＋トースト。
- 枠が取り次ぐキーの判定は `closest(".ask-header")`（固定の行の中にフォーカスがあるときだけ）。「使える最大」は `Math.floor` で整数にする。
- 部品に替わって変わる見た目で、design の一覧に無かったもの: 題が空の定義に、部品は「質問」と出す。
- eslint は `.vue` を解析できない設定（既存の `.vue` でも同じ）。`AskDialog.vue` は型検査（`vue-tsc`）と単体テストで確かめる。
- 既存の単体テスト 25 件のうち、丸ごと消した件は無い（枠の責務 15 件は意味を保って残し、部品へ移った 10 件は「部品が描くことの確認」に置き換えた）。22 件を足して 47 件。

## D9: 取り込み直し（816bf82・部品 1.1.0）の結果と、部品の差分の確認

- **写したもの**（`third_party/ask-form/SOURCE.json`）: commit `816bf82f2b3fbe1cd0dbe9f7f85b0dc5dac47dae`・version 1.1.0。`ask-form.js` `3dc46699…60043`／`fixtures/normalize.json` `b09c2c6e…6d930d`（29bfd09 と同じ）／`fixtures/collect.json` `9c5702e1…0945a`（3 例を追加）。`--check --from /workspaces/public_docs` は一致。
- **部品の差分の確認**（`git diff 94a5ef6 816bf82 -- …/ask-form.js`。30 行追加・17 行削除を全部読んだ。94a5ef6 は research が全文を読んだ版）:
  - 新しく入っていない・変わっていない: `innerHTML`・`insertAdjacentHTML`・`outerHTML`・`document.write`・`eval`・`new Function`・`fetch`・`XMLHttpRequest`・`WebSocket`・`EventSource`・動的 `import()`・`localStorage`／`sessionStorage`・`location`・`window`・`cssText`・`style` 属性への文字列・`href`。`document` は `createElement` だけのまま。定義の値をスタイル・`src` へ入れる箇所は増えていない。新しく使うグローバルは無い。
  - リスナー: 新しいのは Shadow DOM の中（`inner`）の `click` 1 つだけ。`Esc` の扱いは変わらない。
  - 変わった動き: 即確定（`click` で決定。`ask-form.js:734-743`・`:779`）／「その他」は `data-other` 属性（`:336`・`:208`・`:374-375`）／`step(delta)`（`:855`。`delta < 0 ? -1 : 1`）／拡大表示は開いたときだけ DOM に入る（`:227`・`:232`）／未回答に `aria-invalid="true"` と、最初の未回答の質問の入力へフォーカス（`:714-719`）／`unsupported()` が渡された定義を書き換えない。
  - → research F10・F11（安全）は 1.1.0 でも成り立つ。F4（キー）・F5（フォーカス）・F15（`__other__`）は上のとおり変わった。
- **protocol**: `__other__` を断る検査（D6）を外した。空文字の値は、`valueOf` を「その質問に値が空文字の選択肢が無いときだけ落とす」に直した（「その他」の空の入力は別の行で見ていて、混ざらない）。`checkAskAnswer`・`initialAskState`・`normalizeAskSpec` は、読んだうえで変えていない（元から空文字の値の選択肢を正しく扱っていた。テストを足して固定）。共通の試験データは normalize 29・collect 23 の全例が通る。`valueOf` の 1 行を戻すと、試験データの「値が空文字の選択肢も選べる」ほか 3 件が落ちた。
- **枠**: `Alt+PageDown`／`Alt+PageUp` の取り次ぎを `el.step(±1)` に替えた（戻すと 2 件落ちる）。
- **ask-form の側へ伝える候補**（単体テストとコードの読みから。実物のブラウザでは未確認。E2E の結果とあわせて伝える）: `step(0)`・`step(NaN)` が次へ進む／拡大表示の［これを選ぶ］も即確定に入るが、既に選ばれている選択肢では入らず不揃い／未回答のときのフォーカスの先が、絞り込みで隠れている選択肢だと移らない見込み／`aria-invalid` を `fieldset`（`group`）に付けている。

## D10: 実際のキー入力・クリックでの即確定（T7 の確かめ）

- Playwright の実際のキー入力・クリック（Chromium・Linux・headless）で確かめた結果: クリック（カード・ラジオ。選ばれていない・既に選ばれている）・タップ（iPhone 13 相当）・`Enter`（選ばれていない・既に選ばれている・矢印で移った先）は確定する。矢印だけでは確定しない。`Space`（まだ選ばれていない選択肢）は確定する。
- **既に選ばれている選択肢で `Space` を押しても確定しない**（部品 1.1.0 の欠陥）。Chromium は既に選ばれているラジオでは `Space` で `click` を出さず（`keydown` と `keyup` だけ）、部品は `Space` での確定を `click` で見ているため。ask-form の側の確かめは、プログラムから `click` を起こしたものだった。ask-form の側へ直しを依頼した（2026-10-03）。
- **扱い**: 該当の E2E の件は `test.fixme`（理由つき）。ask-form の側が直した版が届けば、そのコミットに固定し直して fixme を外す。届かないまま着地するときは、`test-result.md` と PR に既知の差として書く（枠で補わない。D3-5 と同じ理由）。
- 参考: 自動のページ分けが 1px の差で決まる定義がある（E2E の `SPEC`: 全部を並べた高さ 577px、使える高さ 575px+1）。環境によって 1 枚か 2 ページかが変わるので、E2E の合否にページ数の決め打ちを使わない。
- 以降、このセッションのモデルは Sonnet 5.5（`/model` で切り替え）。コミットの共著者の行は `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。

## D11: 部品 1.1.1（public_docs 029e17f）に取り込み直す

- **経緯**: 実際のキー入力で見つかった `Space` の欠陥（D10）を ask-form の側が直し、`main` にマージした（029e17f。変更は 12dd729。PR asaomaro/public_docs#115）。`static version` は 1.1.1。`fixtures/*.json` は 816bf82 から変わっていない。
- **写したもの**（`third_party/ask-form/SOURCE.json`）: commit `029e17fa15c663263884312511341e2320e2b951`・version 1.1.1。`ask-form.js` `5b324534…bc199`／`normalize.json` `b09c2c6e…6d930d`／`collect.json` `9c5702e1…0945a`（どちらも 816bf82 と同じ）。
- **部品の差分の確認**（`git diff 816bf82 029e17f`。11 行追加・8 行削除を全部読んだ）: 禁止の語（`innerHTML` 系・通信・`window`・`document`〔`createElement` 以外〕・`eval`・`location`・保存領域・`cssText`・`href`）・定義の値をスタイルや `src` へ入れる箇所・新しいリスナー・新しいグローバルは増えていない。変わった動き: `Space` を `Enter` と同じく keydown で受けて選んで決定する／`click` での決定は直前の操作がポインタのときだけ／画像の拡大表示の［これを選ぶ］は `instant` のとき 1 回だけ決定する／`step(0)`・`step(NaN)` は何もしない／未回答のフォーカスは隠れていない最初の入力へ。
- **実際のキー入力での即確定**（Playwright・Chromium。回答のフレーム `ask.answer` は操作ごとに 1 回だけ）: クリック（カード・ラジオ。選ばれていない・既に選ばれている）・`Enter`（選ばれていない・既に選ばれている・矢印で移った先）・`Space`（選ばれていない・既に選ばれている・矢印で移った先）はすべて確定する。矢印だけでは確定しない（`ask.answer` は 0 件）。タップ（iPhone 13 相当）は確定する（フレームの数は見ていない）。D10 の欠陥は解消し、`test.fixme` は外した。Firefox・WebKit は確かめていない。
- **枠**: `closeDialog` で `loadedAskId` を戻す（質問が無くなった後に遅れて届いた `ask-unsupported` で、古い質問を取り消さずトーストも出さない。戻す行を外すと単体テスト 1 件が落ちる）。

## D12: 部品 1.2.1（public_docs 62c7cd7）への方針転換——ページ分けから質問の目次へ

- **経緯**: review ラウンド 1 の修正の途中で、利用者から「ask-form skill が更新されたので、フォームを取り込んでおいて」（2026-10-03）。ask-form の側が、ページ分け（`c80ca0c`）をやめて**質問の題の目次**に替え（`62c7cd7` は目次の不具合の修正）、`static version` は 1.2.1（1.1.1 の次）になった。fixtures は変わっていない。
  - 質問は 1 枚に並んだまま。高さに収まらないとき、左に質問の題の目次が出る。スクロールに合わせて今見ている質問に印が付き、目次の項目を押すか `Alt+PageDown`／`Alt+PageUp`（`step(±1)`）で次・前の質問へ移る。
  - `page` は「まとまりの題」（目次の見出し。書くと高さに収まっていても目次が出る）。`paging` は `"auto"`（既定）・`true`（必ず出す）・`false`（出さない）。**数は `true` と同じ扱い**。`ask.py` の検査は 3 値になった（数を誤りにするかは、取り込んだ `ask.py` の検査と共通の試験データで確かめる）。
  - 印: `data-ask-page`・`-next`・`-prev` は無くなり、`data-ask-index`（目次の項目。値は質問の id、補足は空）になった。`el.pageCount` は互換のために残る（いつも 1）。新しく `el.indexWidth`（目次の幅。出ていなければ 0）。幅 768px 未満の画面では目次は出ない。
  - `form.html`（殻）は、目次が出たらその分だけウィンドウの幅を広げる。
- **決定**: 利用者の指示どおり 1.2.1 に取り込む。この作業の核が「ページに分かれて答えられる」から「目次で質問を見渡して移れる」に変わるので、**要件・設計の読み替え**（以下）をここに残し、テスト・docs・README を直す。要件・設計の本文は書き換えない（読み替えをここに書く）。
  - AC4「ページに分かれる」→ 質問が 1 枚に並び、高さに収まらないとき（または `page` を書いた・`paging: true`）に、左に目次が出る。`paging: false` なら出ない。収まる定義では出ない。
  - AC5「どのページからでも決定・未回答のページへ移る」→ どこからでも決定できる。未回答があると決定されず、最初の未回答の質問へ移る（目次の色でも分かる）。
  - AC-I2 の入力欄の `Enter`（途中のページでは次へ）→ 目次が出ているときは次の質問へ、最後の質問では決定。
  - AC-I3 の `Alt+PageDown`／`PageUp`（ページを移る）→ 次・前の質問へ移る。
  - AC-I4 の「ページを移ったら、そのページの番号のボタンにフォーカス」→ 目次の項目／次・前の質問へ移ったときの行き先は、部品 1.2.1 の動きを実際に観測して書く。
  - US1「質問の多いフォームを、ページを移りながら答えたい」→ 「目次で質問を見渡しながら答えたい」（価値は同じ）。
- **AskDialog の幅**: 目次が出ると 212px 分が本文から減るので、ダイアログの幅を `indexWidth` の分だけ広げる（画面の幅を超えない）。幅 768px 未満（モバイル）では目次が出ない。
- **PR の見出し**: 「ページング」ではなく「質問の目次」。
