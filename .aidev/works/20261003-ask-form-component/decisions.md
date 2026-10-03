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
