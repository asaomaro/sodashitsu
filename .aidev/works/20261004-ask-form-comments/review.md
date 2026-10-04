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

#### T4（`answer` が `p.comments` を body に渡さない／空白を除かず空も落とさない、を別々に壊した）
```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/ask/AskService.test.ts > AskService > comments は前後の空白を除いて結果に入る。空白だけの値は落とし、全部落ちた・{} なら項目が無い
AssertionError: expected { status: 'answered', …(1) } to deeply equal { status: 'answered', …(2) }
 FAIL  src/ask/AskService.test.ts > AskService > 不正な comments（定義に無い id・隠れている質問・付けられない質問・文字列でない値・合計の超過）は invalid_params で断り、質問は開いたまま残る
AssertionError: expected function to throw an error, but it didn't
 FAIL  src/ask/AskService.test.ts > AskService > ログに定義・回答の中身を出さない（askId・paneId・件数・結果の種類だけ）
AssertionError: expected { status: 'answered', …(2) } to match object { Object (comments) }
 FAIL  src/ask/ask.integration.test.ts > ask.*（実物の /ws。20261002-sodactl-ask） > comments つきの回答が結果に出る。10001 文字・付けられない質問・合計の超過は invalid_params で、質問は開いたまま残る。空白だけは落ちる
AssertionError: promise resolved "{}" instead of rejecting
 FAIL  src/ask/ask.integration.test.ts > ask.*（実物の /ws。20261002-sodactl-ask） > server.log に定義・回答・補足・自由記述の文字列が出ない
AssertionError: promise resolved "{}" instead of rejecting
      Tests  5 failed | 27 passed (32)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/ask/AskService.test.ts > AskService > comments は前後の空白を除いて結果に入る。空白だけの値は落とし、全部落ちた・{} なら項目が無い
AssertionError: expected { status: 'answered', …(2) } to deeply equal { status: 'answered', …(2) }
 FAIL  src/ask/ask.integration.test.ts > ask.*（実物の /ws。20261002-sodactl-ask） > comments つきの回答が結果に出る。10001 文字・付けられない質問・合計の超過は invalid_params で、質問は開いたまま残る。空白だけは落ちる
AssertionError: expected { status: 'answered', …(2) } to deeply equal { status: 'answered', …(2) }
      Tests  2 failed | 30 passed (32)
```

#### T5（`onSubmit` の `comments`・`onFormClick` の守り〔今の質問・contentHeight>0〕・ボタンだけに反応する条件、の 3 か所をまとめて壊した）
```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/AskDialog.form.test.ts > AskDialog — 部品へ定義を入れる（1 回だけ・写し・高さ） > 自由記述のボタンの click で高さを読み直す（部品 1.3.0） > ほかの click と input では読み直さない（絞り込み・表示条件で高さが変わっても、ダイアログの高さは変えない）
AssertionError: expected '500px' to be '300px' // Object.is equality
 FAIL  src/components/AskDialog.form.test.ts > AskDialog — 部品へ定義を入れる（1 回だけ・写し・高さ） > 自由記述のボタンの click で高さを読み直す（部品 1.3.0） > 今の質問でないとき・contentHeight が 0 のときは何もしない
AssertionError: expected '380px' to be '111px' // Object.is equality
 FAIL  src/components/AskDialog.form.test.ts > AskDialog — 確定・取り消し（AC-I2） > 送るのは answers・custom・note・comments だけ（部品の detail のほかの項目は送らない）
AssertionError: expected "vi.fn()" to be called with arguments: [ 'a1', { answers: { …(2) }, …(3) } ]
      Tests  3 failed | 38 passed (41)
```

#### T6（サーバが結果に `comments` を写さない／CLI が結果を作り直して `comments` を落とす、を壊した）
```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/machine/machines.integration.test.ts > 保存した SSH のマシン（2 つの composeServer。T8） > 質問のフォーム（20261002-sodactl-ask の T5）: リモートの pane の質問は、そのマシンを表示中の（中継越しの）画面に出て、答えが返る。軽い接続（external）だけなら待たずに unavailable
 FAIL  src/panesocket/paneSocket.integration.test.ts > pane.sock の ask.open（実物のサーバ。ログインなし。20261003-sodactl-ask-socket） > 画面が comments つきで答えると、結果に comments が出る（20261004-ask-form-comments）
      Tests  2 failed | 18 passed (20)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/commands/ask.test.ts > runAsk > 結果は作り直さずそのまま出す（comments つきの answered も、知らない項目も。古い sodactl でも comments が出る）
AssertionError: expected { status: 'answered', …(1) } to be { status: 'answered', …(3) } // Object.is equality
 FAIL  src/commands/ask.test.ts > runAsk > 4 つの status はどれもそのまま出す（unavailable の reason を含む）
AssertionError: expected "vi.fn()" to be called with arguments: [ { status: 'unavailable', …(1) } ]
 FAIL  src/commands/ask.test.ts > runAsk — 経路の選択（ログイン不要の受け口 pane.sock） > 受け口の 4 つの status はどれもそのまま出す
AssertionError: expected "vi.fn()" to be called once with arguments: [ { status: 'unavailable', …(1) } ]
      Tests  3 failed | 25 passed (28)
```

#### T8（枠の `onSubmit` が `comments` を送らない／`normalizeAskSpec` が `comments: false` を残さない、を別々に壊して `pnpm build` 後に E2E）
```
  1) src/specs/ask-form-comments.spec.ts:74:1 › 端から端まで: 書いた質問の id と文（前後の空白なし）が sodactl の結果の comments に入る。閉じた欄も入る。空白だけは入らない（AC4） 
  2) src/specs/ask-form-comments.spec.ts:98:1 › 表示条件（showIf）で隠れた質問の欄は入らない。いったん隠れて再び見えた質問の欄は、内容が残っていて入る（AC4） 
  3) src/specs/ask-form-comments.spec.ts:138:1 › 自由記述に HTML（<script>・<img onerror>）を書いても動かず、DOM に要素もできず、結果には書いた文字のまま入る（AC8） 
  4) src/specs/ask-form-mobile.spec.ts:92:1 › モバイルの画面で、自由記述のボタンをタップして欄を開き、書いて決定すると comments に入る（AC2・AC4） 
  4 failed
  6 passed (18.3s)
  1) src/specs/ask-form-comments.spec.ts:42:1 › comments: false の定義ではどの質問にもボタンが出ない。comment: false の質問にだけ出ない定義では、ほかの質問には出る（AC3） 
    Error: expect(locator).toHaveCount(expected) failed
  1 failed
  6 passed (17.2s)
```

### 点検の指摘
- [nit][conv:-] decisions.md D8 の Tab の行番号が差分で 1 行ずれていた / 対応: 修正済（T7・ラウンド1）
- [nit][conv:-] ask-form.spec.ts の「目次は出ない」が paging: false による固定の観測になったことを D8 に書くとよい / 対応: 修正済（T7・ラウンド1）
- [nit][conv:-] ask-form-comments.spec.ts・ask-form-mobile.spec.ts が部品の内部属性（`[data-ask-submit]`・`textarea[data-ask-comment]` 等）を askForm.ts を経由せず直書き / 対応: 修正済（T8・ラウンド1。`submitForm`・`commentToggle`・`commentBox` に集約）
- [nit][conv:-] multi の質問に自由記述を書く例が端から端までに無い / 対応: 修正済（T8・ラウンド1。d に書く）
- [nit][conv:-] HTML の件が入力直後の DOM だけを見ている / 対応: 修正済（T8・ラウンド1。閉じて開き直した後も見る）
