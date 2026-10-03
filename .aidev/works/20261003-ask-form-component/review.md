# レビュー記録: 20261003-ask-form-component

## タスク点検ログ

coding 工程のタスク単位の独立点検（委譲）で見つけ、その場で直した指摘。review 工程のラウンド指摘の件数には数えない。

- T1 [should] 同期スクリプトが書き込みの失敗を受けておらず（未捕捉の例外で終了コード 1）、途中で失敗すると新しいファイルと古い `SOURCE.json` が混ざる → 一時の名前で書いてから rename で置き換え、失敗は理由 1 行と終了コード 2。前の版で足したテストが落ちることを確かめた（f85c6ae） [conv:-]
- T1 [nit] 「バイトのまま写す」テストの試験データが妥当な UTF-8 だけで、文字コードの変換をしない点を確かめていない → 不正な UTF-8 のバイトを含む例を足し、`encoding: "utf8"` を付けると落ちることを確かめた（f85c6ae） [conv:-]
- T1 [nit] 「同じコミット・同じ中身の写し直しでは `retrieved` を変えない」のテストが無い → 足した。`retrieved` が UTC の日付であることを README とコメントに書いた（f85c6ae） [conv:-]
- T1 [nit] 値を取る引数が、次の `--` で始まる引数を値として飲み込む → 使い方の誤りにした（f85c6ae） [conv:-]
- T1 [nit] 写したファイルに prettier を当てない決まりを機械的に守る仕組みが無い → `.prettierignore` に `third_party/ask-form/` を入れた（f85c6ae） [conv:-]
- T3 [nit] 期待との比較が「無い項目」と `undefined` を区別しない → 厳密な比較（`toStrictEqual`）にした（6858e7d） [conv:-]
- T3 [nit] 「`sodashitsu` の欄の例が 1 つ以上ある」を必須にしていて、差が解消されると実装が正しくても落ちる → 必須にしない（6858e7d） [conv:-]
- T4 [nit] `__other__` の (d) の件の名前が確かめている内容と食い違う → 直した（fc5ea69） [conv:-]
- T4 [nit] `ask-submit` の `custom`・`note` を観測する件が無い → T5 の `AskDialog.test.ts`（決定で `{answers, custom?, note?}` を見る）で満たす [conv:-]
- T5 [nit] `ask-unsupported` を、定義を入れた質問ではなく、イベントが届いた時点の先頭の質問に結び付けている → `spec` を入れたときの `askId` を覚えて取り消す（T7 と同じ作業で修正） [conv:-]
- T5 [nit] テストが mount したまま unmount せず、`window` の `resize` のリスナーが残る → `enableAutoUnmount(afterEach)`（T7 と同じ作業で修正） [conv:-]
- T9 [should] `page` と `paging: false` を両方書いたときの動きが抜け、`false` を無条件に「分けない」と書いていた → `page` が 1 つでもあれば `paging` の値に依らず `page` で分かれる、と直した [conv:-]
- T9 [should] 「質問が 1 つも無いページは消える」に例外（補足の欄がある定義の最後のページ）が抜けていた → 足した [conv:-]
- T9 [should] 前の作業の要約の段に古い記述（「`form.html` の規則」「ask-form 本体との同じ結果は確かめていない」）が残り、新しい節と食い違う → 共通の試験データで確かめたことと、実物の `ask.py` との突き合わせが未確認であることを書き分けた [conv:-]
- T9 [should] `NOTICE` の「ライセンスの記載が無い」が事実より広い（リポジトリの別の場所に `"license": "UNLICENSED"` がある） → 「LICENSE のファイルが無く、ask-form のフォルダにライセンスの記載が無い」に狭めた [conv:-]
- T9 [nit] skill の `paging` の値の列挙に `true` が無い・`null` の扱いが docs に無い → 足した [conv:-]
- T9 [nit] README の「使っていないもの」に `pageCount` が無い → 足した [conv:-]
- T7 [should] 「矢印で移っただけでは確定しない」を、キー直後に 1 回読むだけで見ていた（確定していても通る）→ ブラウザが送った `ask.answer` のフレーム（CDP の `webSocketFrameSent`）を数え、矢印の間は 0 件・`Enter` の後に 1 件、を見る。確定するよう壊すと落ちることを確かめた [conv:e2e-observe-browser]
- T7 [should] ページ数・最初のページの中身を、描画が落ち着く前に再試行なしで読んでいた（キーボードの件は 0 を読むとページ番号の確認が黙って飛ぶ）→ `expect.poll` で待ってから読む [conv:e2e-observe-browser]
- T7 [should] XSS の件の `script`／`img` の数が、選択肢の描画を待つ前にあった（何も描かれていなくても 0）→ `toHaveText` を先に待つ [conv:e2e-observe-browser]
- T7 [should] `AskDialog.vue` の `loadedAskId` が `closeDialog` で戻らず、質問が無くなった後に遅れて届いた `ask-unsupported` が古い質問を取り消しトーストを出す → 閉じるときに戻す。戻す行を外すと落ちる単体テストを足した [conv:-]
- T7 [nit] `firstHeadingIsOrigin` が枠（light DOM）だけを見る → 名前とコメントで範囲を狭く書いた [conv:-]
- T7 [nit] `test.fixme` の再現手順がコードに残っていない → 部品 1.1.1 で外した（結果をコメントに残した） [conv:-]
- T11 [nit] 絞り込みの `Esc` の件が、取り消されていないことをキー直後に 1 回読むだけ [conv:e2e-observe-browser]
- T11 [nit] `paging: "many"` の件が、ブラウザへ質問が届かなかったことを受信したフレームで見ていない [conv:e2e-observe-browser]
- T11 [nit] 安全の件で、2 問目の選択肢の説明（`desc`）の表示の確認が漏れている [conv:e2e-observe-browser]
- T8 [should] 高さで分かれる件が、描画が落ち着く前に `count()` を 1 回読んでいる（収まる側は分割前の 0 個で通る）[conv:e2e-observe-browser]
- T8 [should] 「決定されていない」を、`run.finished()` の 1 回の読み取りだけで見ている [conv:e2e-observe-browser!]
- T8 [should] `defaultPrevented` の観測が、部品・枠・ほかのリスナーのどれが止めたかを区別できない [conv:e2e-observe-browser]
- T8 [should] 「ダイアログの高さが変わらない」が、上限で頭打ちになっているだけの場合を区別できない [conv:-]
- T8 [should] フォーカスの行き先を合否にしているが、計画は「観測して報告」で、理由がコメントに無い [conv:-]
- T8 [nit] キーの配列の期待が、押したキー以外の `keydown` で崩れる [conv:-]
- T8 [nit] 画面に収まることの確認が最終ページだけ [conv:-]
- cross [nit] 「手で直していない」検査が、`SOURCE.json` も書き換えられた場合は抜ける → README に前提を書いた（元のコミットとの突き合わせは `--check --from`） [conv:-]
- cross [nit] 回答のフレームを数える補助が 2 実装ある（`ask-form.spec.ts` と `support/askSent.ts`）→ `askSent.ts` の 1 つにした [conv:-]

## ラウンド 1（HEAD = test-result の記録のコミット・作業全体の差分・委譲）

must 0・should 3・nit 3。should があるので coding へ差し戻す。`aidev coverage` は tasks 承認時と同じ（ac=21・gaps=0）。
AC1〜AC16・AC-I1〜AC-I5 は、実装と `test-result.md` の判定に食い違いなし。読み替え（D4・D5・D7・D9・D11）は目的を損なわない。`AskDialog.vue`（`spec` を入れる時機・`loadedAskId`・取り次ぎのキー・`structuredClone` の失敗）、`ask.ts`（`reason`・`paging`／`page` の検査・`valueOf` の空文字と「その他」の区別）、`sync-ask-form.mjs`（`git show` 経由で作業ツリーを触らない・バイトを変えない）に欠陥は見つからなかった。`ask.fixtures.test.ts` の `writtenKeys`（試験データが書いている項目名を集めて比べる）は、部品側が項目を足したとき通し忘れが落ちる安全網になっている。

- [should] 次に部品を取り込む人向けの手順が、E2E が部品の内部の属性（`data-ask-question`・`data-ask-submit`・`data-ask-page`・`data-ask-next`・`data-ask-title` など、E2E 4 本で計約 100 箇所）に強く依っていることを書いていない。写し直して属性名が変わると、E2E が一斉に落ちる（または見えないのに緑になる） — 根拠: third_party/ask-form/README.md:41-63 [conv:-]
- [should] E2E の補助（`dialog`・`openBrowser`・`shownQuestions`・`pageButtons`・`setup` 等）が 3 つの spec に複製されている。部品の属性が変わったときの直し先が 3 か所に増える — 根拠: packages/e2e/src/specs/ask-form.spec.ts:32-51・ask-form-paging.spec.ts:18-52・ask-form-extras.spec.ts:16-51 [conv:-]
- [should] `AskDialog.test.ts` が 1101 行・56 件に膨らみ、枠の責務（開閉とフォーカス・`spec` を入れる時機・高さ・取り次ぎのキー・取り消しと `ask-unsupported`）が 1 ファイルに混ざっている。次の取り込みで落ちたときの切り分けが重い — 根拠: packages/web/src/components/AskDialog.test.ts [conv:-]
- [nit] 既存の E2E の `SPEC` は、全部を並べた高さが使える高さを 1px 超えるかで 1 枚か 2 ページかが環境で変わる（577px 対 575px）。AC2 の確認がこの定義に載っている。ページ数は決め打ちにしていないので偽の失敗にはならないが、環境で経路が変わるテストが残る — 根拠: packages/e2e/src/specs/ask-form.spec.ts:19-21 [conv:e2e-observe-browser]
- [nit] README の「途中で失敗しても元は変わらない」は言い過ぎ（`rename` の途中で失敗すると混ざる。`SOURCE.json` を最後に置き換えるので `--check` が検出する） — 根拠: scripts/sync-ask-form.mjs:117-130・third_party/ask-form/README.md:39 [conv:-]
- [nit] skill に `page`／`paging` は足したが `filter`／`showValue` が無い（`docs/sodactl.md` の表にはある） — 根拠: packages/cli/skills/sodactl/SKILL.md [conv:-]

範囲外（follow-up の候補）: `normalizeAskSpec` の `showIf` で `dep` が `"__proto__"` のとき `cond[dep] = …` がオブジェクトの原型を差し替える（グローバルの汚染にはならず、値は捨てられるだけ。以前からある書き方。`Object.create(null)` か `Map` にすると明確）／public_docs に LICENSE が無い（NOTICE と README に明記済み。public_docs 側で明示してもらう）／E2E 全体の 18 件・lint の 22 errors・smoke の 1 本目が `/workspaces/sodashitsu` から落ちる件は `main` でも同じ。
- review ラウンド 1 の should 3・nit 3 を直した: README に E2E が読む部品の内部の属性の表と取り込み後の確認手順を足した（98d1877）／E2E の補助を `support/askForm.ts` に共通化し、既存の E2E の定義は確実に分かれる側にした（e49b33c）／`AskDialog.test.ts` を 3 ファイル（11＋34＋11 件＝56 件）に分けた（c59f3d4）／README の「元は変わらない」を実際に合わせた・skill に `filter`・`showValue` を足した（98d1877）。

## ラウンド 2（a1b3e4f..HEAD・部品 1.2.1／1.2.2 への取り込み直しの差分・委譲）

must 0・should 1・nit 4。安全（`ask-form.js` の通しの差分に通信・`window`・`document`・`innerHTML` 系・`eval`・`location`・`cssText`・`href` の追加なし。新しい API は `performance.now()` だけ、新しいリスナーは Shadow DOM の中だけ）・`applyWidth`／`onResize` に再入なし・`ask.ts` はコメントのみの差分・E2E に床読みなし・docs に `data-ask-page`／［次へ］等の残りなし、を確かめた。

- [should] 前の質問で広げた `--ask-index-width` が、次の質問の定義を部品へ入れる時点で残り、部品が広い幅で「収まる」と判断して目次を出さない場面がある — 根拠: AskDialog.vue `loadSpec`／`applyWidth` → `loadSpec` で `el.spec` を入れる前に外した。単体テスト（`spec` の setter の時点で変数が空）を足し、外す行を消すと落ちることを確かめた [conv:regression-negative-control]
- [nit] README の「取り込んでいる版は 1.2.1」→ 1.2.2 に直した
- [nit] `ask.integration.test.ts` のコメントの「ページに分かれる」→ 目次に直した
- [nit] `ask-form.spec.ts` のキーボードの件で、目次への Tab のループが常に 0 回 → 目次が出ないことを `expect(...).toBe(0)` で明示し、目次つきは `ask-form-index.spec.ts` に任せる、とコメントした [conv:e2e-observe-browser]
- [nit] `ask.ts` のコメントで `ask.py` が 2 回出る → 直した

修正の後: build・typecheck・`pnpm test`（6892 passed）・ask 関連 E2E 4 spec（56 passed）が通る。
