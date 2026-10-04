# レビュー: 20261004-ask-form-comments

## タスク点検ログ（coding 工程内・「3.3」(b)）

### 壊して落ちる確認（条項 regression-negative-control。生の出力）

#### T2（`out.comment = false`・`spec.comments = false`・`askCommentable` の `q.comment === false` を消した）
```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/ask.fixtures.test.ts > 共通の試験データ: normalize.json（normalizeAskSpec） > 自由記述: 付けないとき（comments・comment が false）だけ残す。既定（付ける）は書かない
AssertionError: expected { title: '質問', submit: '決定', …(2) } to strictly equal { title: '質問', submit: '決定', …(3) }
 FAIL  src/ask.test.ts > 自由記述の指定（comments・comment） > comments・comment は false のときだけ残す。true・無い・真偽でない値は項目なし（誤りにしない）
AssertionError: expected undefined to be false // Object.is equality
 FAIL  src/ask.test.ts > 自由記述の指定（comments・comment） > askCommentable: 定義の comments: false・質問の comment: false・text・即確定のフォームでは付けない（4 条件）
AssertionError: expected true to be false // Object.is equality
 Test Files  2 failed (2)
      Tests  3 failed | 101 passed (104)
```

#### T3（実装の前に collect の比較だけ足したとき。`collectAsk` が `comments` を返さない）
```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/ask.fixtures.test.ts > 共通の試験データ: collect.json（collectAsk・checkAskAnswer） > 質問ごとの自由記述: 書いた質問だけ comments に入る（隠れている質問・空白だけは入らない）
AssertionError: expected undefined to deeply equal { a: '金曜は避けたい' }
- Expected:
+ Received:
      Tests  1 failed | 55 passed (56)
```

#### T3（`askCommentable` の判定・合計の上限・自由記述の拒否・スキーマの上限・`Object.hasOwn` を壊した）
```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/ask.test.ts > 自由記述の回答（comments） > collectAsk > 隠れている質問・text・comment: false の質問・定義が comments: false のときは入らない
AssertionError: expected { answers: { a: 'x', t: '' }, …(4) } to not have property "comments"
 FAIL  src/ask.test.ts > 自由記述の回答（comments） > checkAskAnswer > 定義に無い id・隠れている質問・text・comment: false・文字列でない値は断る
 FAIL  src/ask.test.ts > 自由記述の回答（comments） > checkAskAnswer > 定義が comments: false・即確定のフォームでは、どの質問の自由記述も断る
 FAIL  src/ask.test.ts > 自由記述の回答（comments） > checkAskAnswer > 長さの合計が上限（100000）を超えたら断る。ちょうどは通る
 FAIL  src/messages.test.ts > AskAnswerParams.comments（質問ごとの自由記述） > 無くてもよい。10000 文字は通り、10001 文字は断る。{} も通る
AssertionError: expected true to be false // Object.is equality
      Tests  5 failed | 155 passed (160)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/ask.test.ts > 自由記述の回答（comments） > collectAsk > constructor・toString のような継承された値は、自分の項目でないので拾わない
AssertionError: expected { answers: {}, custom: [], …(3) } to not have property "comments"
      Tests  1 failed | 56 passed (57)
```

### 点検の指摘
