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

### 点検の指摘
