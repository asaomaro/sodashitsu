# 要件: ask-form 1.3.0（質問ごとの自由記述）を取り込む

## 背景 / 課題

ask-form の部品 `<ask-form>` が 1.3.0 になり、**各質問の下に「＋ 自由記述」のボタン**が付いた（public_docs `12a13b2`）。押すと欄が開き、その質問への条件・希望を書ける。結果には `comments`（`{質問の id: 書いた文}`。書いた質問だけ）が加わった。定義の `comments: false` で全部、質問の `comment: false` でその質問だけ付けない。

Sodashitsu は部品を `third_party/ask-form/` に無改変で写して `sodactl ask` の画面に使っている（`docs/sodactl.md`「画面の部品と同期」）。部品を写すだけでは届かない——サーバは知っている項目だけを通し、回答も知っている項目だけを受けるため（`third_party/ask-form/README.md`）。このままだと:

- 部品だけ写すと、`comments: false`・`comment: false` がサーバで落ち、付けないはずの質問にも自由記述のボタンが出る。
- 利用者が書いた自由記述が、回答として `sodactl ask` の出力に届かない（ブラウザが送る `ask.answer` に項目が無く、サーバの検査も知らない）。
- 共通の試験データ（`fixtures/normalize.json` に 2 例・`collect.json` に 1 例追加）で、ask-form の側と結果が食い違う。

いまは `third_party/ask-form/` が `690d26d`（1.2.2）のままで、ask-form の skill（`ask.py`）は新しい版になっている。

## 目的 / ゴール

- Sodashitsu の画面に出る質問のフォームで、利用者が質問ごとに自由記述を書け、それが `sodactl ask` の結果の `comments` として呼び出したプログラム（ask-form・エージェント）に届く状態。
- 定義で自由記述を付けない指定（`comments: false`・`comment: false`）が、Sodashitsu の画面でも効く状態。
- 定義の検査と回答の集め方が、共通の試験データで ask-form の側と同じ結果になる状態。

charter ゴール: `.aidev/charter.md` は無い（紐づける charter はない）。

## ユーザーストーリー

- US1: Sodashitsu の pane の中で Claude Code を使う利用者として、質問のフォームで選択肢に無い条件・希望を、その質問に添えて書きたい。なぜなら、選ぶだけでは伝わらない意図を、末尾の補足にまとめず質問ごとに伝えられるから。（受け入れ: AC2, AC3, AC4, AC-I1, AC-I2, AC-I3, AC-I4, AC-I5）
- US2: フォームを出すプログラム（ask-form の skill・エージェント）として、自由記述を付けない質問を定義で指定し、書かれた自由記述を結果で受け取りたい。なぜなら、ウィンドウで聞いたときと同じ定義・同じ結果の形で扱えるから。（受け入れ: AC3, AC4, AC5, AC6）
- 同期・互換・安全・文書の AC（AC1, AC7, AC8, AC9, AC10）は、特定のストーリーに紐づかない制約由来の基準。

## スコープ

### 対象

- `third_party/ask-form/` を public_docs `12a13b2`（1.3.0）に写し直す（`scripts/sync-ask-form.mjs`）。
- プロトコル: 定義の `comments`・`comment`（`false` のときだけ残す）、回答の `comments`、回答の集め方（`collectAsk`）・回答の検査（`checkAskAnswer`）。
- サーバ: 回答の `comments` を受けて検査し、`sodactl ask` の結果へ渡す。
- 画面の枠（`AskDialog.vue`）と部品の型（`packages/web/src/ask/askFormElement.ts`）: 部品の `ask-submit` の `comments` を送る。欄を開いたときの高さの追従。
- `sodactl ask` の出力（結果の JSON に `comments`）。
- E2E・文書（`docs/sodactl.md`・`packages/cli/skills/sodactl/SKILL.md`・`docs/verification.md`・`third_party/ask-form/README.md`）。

### 対象外

- ask-form の `view`（成果物を横に見せる枠）・`--review`・Markdown の整形（`ask.py` が `sodactl ask` へ渡さずウィンドウで聞く。変えない）。
- `edit`・`rank`・`table` の型、画像・音・コードのプレビュー（今までどおり非対応）。
- 部品のファイルの改変（無改変で写す決まり）。
- 端末版（引数なしの `soda`）に質問のフォームを出すこと（今も出ない）。

## 機能要件

- F1: 今の写し（`690d26d`・1.2.2）からの差分を対象に、`third_party/ask-form/` の 3 ファイル（`ask-form.js`・`fixtures/normalize.json`・`fixtures/collect.json`）と `SOURCE.json` が `12a13b2` と一致する。部品の差分に、通信・ページ全体への操作・定義の値を HTML やスタイルへ入れる箇所が増えていないことを、差分を読んで確かめて記録する。
- F2: 定義の検査（`normalizeAskSpec`）は、`comments` が `false` のときだけ `comments: false` を、質問の `comment` が `false` のときだけ `comment: false` を残す。`true`・無指定・真偽でない値は項目ごと落とす（`ask.py` の `normalize()` と同じ。共通の試験データの例と一致する）。
- F3: 画面で、各質問（`text` を除く）の下に「＋ 自由記述」のボタンが出る。`comments: false` の定義ではどの質問にも出ず、`comment: false` の質問には出ない。質問が 1 つだけ・`single`・補足なしの（選んだ時点で決定する）フォームには出ない。
- F4: 利用者が書いた自由記述（前後の空白を除いて空でないもの）が、回答の `comments`（`{質問の id: 文}`）として届く。表示条件（`showIf`）で隠れている質問・空白だけの欄は入らない。欄を閉じていても、書いてあれば入る。1 つも無ければ `comments` の項目自体が無い。
- F5: サーバは回答の `comments` を検査する: キーは定義にある質問の id（数は質問の数の上限 `ASK_QUESTIONS_MAX` 以内）、その質問が自由記述を付けられる（`text` でない・`comment: false` でない・定義が `comments: false` でない・即確定のフォーム〔質問が 1 つ・`single`・補足なし。部品と同じ 3 条件〕でない）、表示条件を満たして見えている、値は文字列で、既存の回答の文字列と同じ上限（10000。UTF-16 の単位。部品の `TEXT_MAX` と同じ値）以内。外れた回答は、今の不正な回答と同じく `invalid_params` で断る。
  - 値の前後の空白はサーバでも除く。除いて空になった値は断らずに落とす（既存の `custom` の空配列・`note` の空文字と同じ扱い）。全部落ちた・`{}` のときは、結果に `comments` の項目を出さない。
- F6: `sodactl ask` の結果の JSON に `comments` が入る（`{"status":"answered","answers":{…},"comments":{…}}`）。無ければ項目が無い（今までと同じ出力）。
- F7: 回答の集め方（`collectAsk`）は、共通の試験データの新しい例（`comments` の状態と期待）で ask-form の側と同じ結果になる。

## 非機能要件 / 制約

- 部品は無改変で写す（`scripts/sync-ask-form.mjs --check` が一致する）。
- 自由記述の文は、画面・ログ・エラーメッセージに HTML として出さない（文字として扱う）。サーバのログに自由記述の中身を出さない。
- 互換: 古い画面（読み込み済みの古いバンドル）は `comments` を送らないだけで、今までどおり答えられる。古い `sodactl` は結果をそのまま出すので、`comments` も出る。新しい画面と古いサーバの組み合わせは、画面のバンドルをサーバ自身が配るので通常は起きない（起きた場合は、回答は成功し、自由記述だけが落ちる——古いサーバのスキーマは知らない項目を落とすため。この組み合わせは検証しない）。
- 自由記述の長さの上限は、既存の回答の文字列の上限（`ASK_ANSWER_TEXT_MAX` = 10000）を使う（部品の `TEXT_MAX` と同じ値）。自由記述の長さの合計にも上限（100000）を設け、回答 1 通の大きさが WebSocket の 1 フレームの上限（4MB。既存）に収まるようにする。
- 自由記述の欄を開くと、ダイアログの高さが中身に合わせて増える（上限〔画面の高さ − 余白〕で頭打ちになり、それ以上は中がスクロールする。画面からはみ出さない）。

## 完了条件 (受け入れ基準)

- [ ] AC1: `third_party/ask-form/SOURCE.json` が `12a13b2`・version 1.3.0 を指し、`sync-ask-form.mjs --check --from <public_docs>` が一致する。差分の安全の確認が `decisions.md` に残っている（F1）。
- [ ] AC2: 画面で、`single`・`multi` の質問の下に「＋ 自由記述」のボタンが出て、押すと欄が開き、もう一度押すと閉じる。閉じても内容は残り、ボタンの文言が「自由記述（入力あり）を開く」になる。`text` の質問には出ない。スマホ幅の画面でも、タップで開いて書ける（F3）。
- [ ] AC3: `comments: false` の定義ではどの質問にもボタンが出ず、`comment: false` の質問にだけ出ない定義では、ほかの質問には出る。質問が 1 つだけ・`single`・補足なしのフォームには出ず、選んだ時点で決定する動きが今までと変わらない（F2・F3）。
- [ ] AC4: 自由記述を書いて決定すると、`sodactl ask` の stdout の JSON に `comments` が入り、書いた質問の id と文（前後の空白を除く）が一致する。閉じた欄の内容も入る。空白だけの欄・表示条件で隠れた質問の欄は入らない（いったん隠れて再び見えた質問の欄は、内容が残っていて入る）。何も書かなければ `comments` の項目が無い（F4・F6）。
- [ ] AC5: 定義の検査が、共通の試験データ `normalize.json` の全例（自由記述の 2 例を含む）で ask-form の側と同じ結果になる（F2）。
- [ ] AC6: 回答の集め方が、共通の試験データ `collect.json` の全例（自由記述の 1 例を含む）で同じ結果になる（F7）。
- [ ] AC7: サーバが、不正な `comments`（定義に無い id・`text` の質問・`comment: false` の質問・`comments: false` の定義・即確定のフォーム・隠れている質問・文字列でない値・10001 文字以上の値）を持つ回答を `invalid_params` で断り、質問は開いたまま残る。10000 文字の値は通る。長さの合計が 100000 を超える回答は断る。空文字・空白だけの値は断らずに落とし、前後の空白を除いた値が結果に入る。`{}` は項目なしと同じ（F5）。
- [ ] AC8: 自由記述に HTML（`<script>`・`<img onerror>`）を書いても、画面で動かず、結果には書いた文字のまま入る。サーバのログに自由記述の中身が出ない（非機能）。
- [ ] AC9: `comments` を送らない回答（古い画面）が今までどおり受け付けられ、結果が今までと同じ。古い `sodactl`（結果の `comments` を知らない版）でも、サーバが返した結果をそのまま出す（`sodactl` は結果を作り直さないことを、コードで確かめて示す）（非機能「互換」）。
- [ ] AC10: `docs/sodactl.md`（定義の `comments`・`comment`、結果の `comments`）・`packages/cli/skills/sodactl/SKILL.md`・`docs/verification.md`・`third_party/ask-form/README.md`（取り込んでいる版・「枠が使っている部品の受け渡し」の `detail` のうちサーバへ送る項目・E2E が読む部品の内部の属性 `data-ask-comment`・`data-ask-comment-toggle`）が新しい動きに合っている。

## 相互作用の受け入れ基準

- [ ] AC-I1 開く / 閉じる: 自由記述の欄は、ボタンのクリック・`Enter`・`Space` で開き、同じ操作で閉じる。閉じても書いた内容は残る。ボタンの `aria-expanded` が開閉に合わせて変わり、欄には質問の名前を含む読み上げ用の名前が付いている。ダイアログ自体の開閉（`Esc` でキャンセル等）は今までと変わらない。
- [ ] AC-I2 確定 / 取り消し: 自由記述の欄の中で `Enter` を押しても決定しない（改行になる）。`Ctrl+Enter`（`Cmd+Enter`）で決定する。`Esc` はフォームを取り消す（今までどおり）。
- [ ] AC-I3 キーボードだけで完結するか: `Tab` でボタンへ移る → 開く → 書く → `Ctrl+Enter` で決定、がマウス無しでできる。
- [ ] AC-I4 フォーカスの行き先: 欄を開くと（もう一度開いたときも）欄にフォーカスが移る。キーボードで閉じると、ボタンにフォーカスが残る。目次・`Alt+PageDown` で質問へ移ったとき、および未回答の質問へ移されたときのフォーカスは、自由記述の欄ではなく、その質問の入力（ラジオ等）へ行く。
- [ ] AC-I5 既存の操作を妨げないか: 自由記述の欄の上でのキー入力・ホイールが端末の pane へ漏れない。上限に達していないフォームで欄を開くと、ダイアログの高さが増えて欄が収まる。上限に達しているフォームでは、ダイアログは画面からはみ出さず、開いた欄が見える位置まで中がスクロールする。

## 未確定事項 / 確認したいこと

- 自由記述の欄を開いたときのダイアログの高さの追従（部品が高さの変化を枠へ知らせるか。枠は `contentHeight` を `spec` を入れたときと `resize` でしか読まない）。枠の側で読み直すきっかけ（部品の中のクリック・入力のイベントが外へ届くか）を design で決める。
- 前の作業の未 push のブランチ `chore/ask-form-sync-ffd516c`（試験データだけを `ffd516c` に写したもの）は、この work が `12a13b2` に写すので不要になる。deliver の時点で削除を利用者に確認する。
