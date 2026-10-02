# テスト結果: sodactl ask（pane のプログラムからブラウザ版の画面へ質問のフォームを出す）

## 実行したもの
- `pnpm run build` — exit 0
- `pnpm run typecheck` — exit 0（protocol・client-core・tui・web〔vue-tsc〕・server・cli・e2e）
- `pnpm test`（vitest 全体） — **6463 passed / 0 failed / 0 skipped**（364 ファイル）。新規: protocol `ask.test.ts`・server `AskService.test.ts`・`ask.integration.test.ts`・中継越しの `machines.integration.test.ts` に 1 ケース・cli `ask.test.ts`・web `AskDialog.test.ts`・`AskController.test.ts`・`store/ask.test.ts` ほか
- E2E（実物の Chromium）新規 `ask-form.spec.ts`・`ask-form-mobile.spec.ts` — **20 passed / 0 failed**
- E2E 全体（`playwright test`） — **137 passed / 19 failed**（失敗 19 件は変更前の `main` でも同じ spec で落ちるもの。下の「未検証の穴」）
- 変更した範囲の lint — 新しいコードのエラー 0（`packages/cli/src/smoke.ts:83`・`packages/cli/src/commands/graph.test.ts:417` の `no-control-regex` は変更前からある）
- `aidev coverage --strict` — ac=20 design=20/20 tasks=20/20 gaps=0
- 起動確認（smoke）10 本 — 個別に実行して全て pass（下。`aidev smoke` 自体は 1 本目が既存の理由で落ちる）
- 回帰の負の確認（変異）— 28 件を捕まえた（下。1 回目に捕まえていなかった 2 件を直して再実施）

## 受け入れ基準ごとの判定
- AC1（別のマシンのブラウザに出て結果が返る）: **pass（ループバックのブラウザで）** — E2E「別のタブ・ウィンドウを開かず…」（ビルドした sodactl を子プロセスで起動し、ダイアログの DOM と stdout の 1 行・終了コード 0）。**ループバックでない接続のブラウザは未検証**。経路は接続元のアドレスに依らない `/ws` の方式とイベントだけ。
- AC2（同じマシンでも同じ・新しいウィンドウを開かない）: pass — 同 E2E で `context.on("page")` が 0。
- AC3（showIf・複数選択・自由入力・補足・即確定が ask-form と同じ結果）: pass — `ask.test.ts`（form.html の規則を写した期待値）・E2E（確かめ用の定義 7 問・テーマ 13 件で mode を print にすると motion が隠れる等）・E2E「その他の自由入力は custom・補足は note」。**ask-form 本体（ask.py）と同じ入力での突き合わせは未実施**。
- AC4（13 件を最後までスクロールして選べる）: pass — E2E（デスクトップ）・`ask-form-mobile.spec.ts`（iPhone 13 のエミュレーション。タップで最後の選択肢を選んで決定。幅に収まる）。**実機のスマートフォンは未検証**。
- AC5（cancelled・timeout・unavailable・どれも終了コード 0）: pass — E2E（Esc・`--timeout 1500`・ブラウザなし）・`AskService.test.ts`・`ask.integration.test.ts`（端末版の形＝desktop で hello しただけ・external だけ、でも unavailable）。
- AC6（定義の誤り・上限は終了コード 2・pane の外は caller_pane_unknown）: pass — `ask.test.ts`（protocol・cli）・E2E・CLI の smoke。
- AC7（SSH のマシンの pane）: pass（結合） — `machines.integration.test.ts`: 中継越しの desktop が `ask.subscribe` すると、リモートの pane の `ask.open` が届いて答えが返る。軽い接続（external）だけなら `unavailable`。**実物の `ssh` 越しは未検証**。
- AC8（2 つのブラウザ・最初の回答だけ採る）: pass — E2E・`AskService.test.ts`。
- AC9（再読み込みで出し直し）: pass — E2E（`page.reload()` の後に `ask.subscribe` の応答を待ってダイアログが出直す）・`ask.integration.test.ts`・`AskController.test.ts`。
- AC10（SIGINT・時間切れ・サーバ停止でダイアログが閉じる・表示していない pane でも出る）: pass — E2E（SIGINT・`--timeout`・`appServer.restart()`・別の tab を表示中）。
- AC11（どの pane からかを必ず示す）: pass — `AskDialog.test.ts`（title が空・500 文字・出どころの行そっくりでも変わらない）・E2E。
- AC12（HTML・色を文字として扱う）: pass — `AskDialog.test.ts`（script・img が生まれない・色でない文字列は style に入らない・検査を通らずに届いた色も入らない）・E2E（`window.__askXss` が立たない）・`ask.test.ts`（`isAskColor`）。
- AC13（ログに中身が出ない・2 つめは ask_busy）: pass — `ask.integration.test.ts`（`server.log` に目印の文字列が無い。検査に落ちる定義・誤った回答を含む）・E2E（`ask_busy` は終了コード 1）。
- AC14（docs・SKILL.md・tui-parity）: pass — `docs/sodactl.md`「質問のフォーム」・上限・`SKILL.md`・W31。`skill.test.ts`・`sodactl skill | cmp`（smoke 4 本目）が通る。
- AC15（追補: 対応していない型は unavailable）: pass — `ask.test.ts`（`edit`・`rank`・`table`・知らない文字列は `unsupportedType`。後ろの誤りは見逃さない・前の誤りが優先）・`AskService.test.ts`（台帳に置かず unavailable。pane・busy の確認が先）・`commands/ask.test.ts`（接続もサーバへの送信もせず unavailable・終了コード 0）・E2E（ダイアログが出ない）。
- AC-I1（開閉）: pass — `AskDialog.test.ts`・E2E（背景のクリックで閉じない）。
- AC-I2（確定・取り消し）: pass — `AskDialog.test.ts`（ボタン・Ctrl+Enter・Cmd+Enter・1 行の Enter・IME 中は送らない・未回答は強調・即確定はポインタと Space／Enter だけ）・E2E（実ブラウザで label のカードのクリックで確定・矢印では確定しない）。
- AC-I3（キーボードだけ・モバイルのタップ）: pass — E2E（見出し → Tab → 矢印 → Ctrl+Enter。Tab を 25 回回しても背面へ移らない）・E2E モバイル。
- AC-I4（フォーカスの行き先）: pass — E2E（開いたら見出し・pane を表示中ならその端末へ・別の tab なら開く前の場所・設定のダイアログの中へ戻る）。
- AC-I5（既存の操作を妨げない）: pass — E2E（文字・prefix・貼り付けが pane へ送られず、tab の名前入力も開かない・質問中も別の入力の出力がブラウザへ届く・ホイールのマウス報告が背面へ漏れない〔対照つき。decisions D7〕・設定のダイアログとの重なり）。

## 失敗の証跡
このラウンドで検出した失敗（**直す前**の出力）。`aidev smoke` の 1 本目が落ちた。変更前の `main` でも同じ条件で落ちることを確かめた（下の比較）。
```
$ aidev smoke   （1 本目: pnpm -s build && pnpm -s smoke）
smoke: 20261002-sodactl-ask
$ pnpm -s build && pnpm -s smoke
smoke(web): auto-login (#token) → connect → pane 表示 ok
smoke(web): 端末の描画用 canvas が画面内にある（xterm.css 有効。D96）
smoke(web): tab title ok ("my-notePC: smoke"。H14/AC4）
smoke: FAIL locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('.xterm-helper-textarea')
    - locator resolved to <textarea tabindex="0" ... class="xterm-helper-textarea"></textarea>
  - attempting click action
      - <div tabindex="0" role="button" ... class="pane-frame-edge pane-frame-edge-current" aria-label="pane「asaomaro@my-notePC: /workspaces/sodashitsu」のメニュー"></div> intercepts pointer events
    - retrying click action
    58 × waiting for element to be visible, enabled and stable
smoke: fail (exit 1, 10 本)
```

原因の切り分け（このブランチの変更が原因ではないことの確認。実行した結果）:
```
$ node packages/server/dist/smoke.js   # 変更前の main の dist・作業ディレクトリ=/workspaces/sodashitsu
MAIN smoke, cwd=/workspaces/sodashitsu: exit=1
smoke: FAIL locator.click: Timeout 30000ms exceeded.
$ node packages/server/dist/smoke.js   # 同じ main の dist・作業ディレクトリを別の git worktree に変えた（2 回）
MAIN server + branch web, cwd=<worktree> run1 exit=0
MAIN server + branch web, cwd=<worktree> run2 exit=0
$ node packages/server/dist/smoke.js   # このブランチの dist・同じ作業ディレクトリ（worktree）（2 回）
BRANCH server + branch web, cwd=<worktree> run1 exit=0
BRANCH server + branch web, cwd=<worktree> run2 exit=0
$ node packages/server/dist/smoke.js   # このブランチの dist・作業ディレクトリ=/workspaces/sodashitsu（と /tmp/xcwd）
smoke: FAIL locator.click: Timeout 30000ms exceeded.
```
→ 失敗は**作業ディレクトリに依存**し、変更前の `main` でも `/workspaces/sodashitsu` で同じに落ちる（pane の枠の見出しにクリックが遮られる。既存の smoke の壊れやすさで、この work の対象外）。1 本目だけ作業ディレクトリを別の git worktree にして実行し、残り 9 本は `aidev smoke` と同じコマンドで実行した（下）。

回帰の負の確認（`.aidev/conventions/regression-negative-control.md`。主要な判定を 1 つずつ壊し、対応するテストが落ちることを確かめ、元に戻した）。**1 回目は 2 件を捕まえていなかった**——（a）「showIf を常に表示」の変異が実は等価（`dep in answers` を外しても空配列との照合で偽になる）で、真の変異（`askVisible` を常に真）に替えると落ちた。（b）ダイアログの色の二重の防御（`isAskColor`）は、検査済みの定義だけを渡すテストでは見えないので、検査を通らずに届いた定義のテストを足した。
```
[PASS(捕まえていない)] showIf を常に表示（隠れた質問を答えに入れる）
    Tests  30 passed (30)
[FAIL(捕まえた)] single の未回答を未回答と数えない
    × single は未選択が未回答（answers に入らない）。multi・text は required のときだけ未回答（空でも answers に入る） 5ms
    × 「その他」: 選んで入力があれば値は入力（trim）で custom に id が入る。入力が空なら選択は無いもの（ただし custom には入る＝form.html と同じ） 1ms
    × default が選択肢に無い値なら、選択済みにしない 1ms
[FAIL(捕まえた)] 「その他」の入力が空でも custom に入れない／値の trim をやめる
    × 「その他」: 選んで入力があれば値は入力（trim）で custom に id が入る。入力が空なら選択は無いもの（ただし custom には入る＝form.html と同じ） 5ms
    Tests  1 failed | 29 passed (30)
[FAIL(捕まえた)] color の検査を外す
    × colors は色の形だけ残し、上限で切る（誤りにしない） 5ms
    × #rgb・#rgba・#rrggbb・#rrggbbaa だけ 1ms
    Tests  2 failed | 28 passed (30)
[FAIL(捕まえた)] 答えの検査で隠れた質問の答えを許す
    × 隠れた質問の答え・知らない id・型違い・必須の欠け・選択肢に無い値は断る 4ms
    Tests  1 failed | 29 passed (30)
[FAIL(捕まえた)] 購読者が居なくても質問を置く（unavailable にしない）
    × ブラウザが 1 つも居なければ、置かずにすぐ unavailable（購読していない desktop・external・端末版の形を含む） 5006ms
    × 購読の後に画面でなくなった接続（hello で external に替わった）は、購読者に数えず、get・answer・cancel もさせない 5004ms
    Tests  2 failed | 16 passed (18)
[FAIL(捕まえた)] 購読後に kind が変わった接続を数える
    × 購読の後に画面でなくなった接続（hello で external に替わった）は、購読者に数えず、get・answer・cancel もさせない 2ms
    Tests  1 failed | 17 passed (18)
[FAIL(捕まえた)] 同じ pane の 2 つめを断らない
    × 検査に落ちる定義・無い pane・同じ pane の 2 つめは断る（2 つめが来ても前の質問は残る） 3ms
    Tests  1 failed | 17 passed (18)
[FAIL(捕まえた)] pane.closed で質問を閉じない
    × pane.closed → cancelled。別の pane の質問は残る 5003ms
    Tests  1 failed | 17 passed (18)
[FAIL(捕まえた)] 呼び出し側の切断で質問を閉じない
    × 呼び出し側の切断で質問を閉じ ask.closed を配る。別の接続の質問は残る 5003ms
    Tests  1 failed | 17 passed (18)
[FAIL(捕まえた)] 誤った回答の検査を外す（誰の答えでも通す）
    × custom は空でなければ結果に入る 3ms
    × 誤った形の回答は invalid_params で、質問は閉じない（答え直せる） 1ms
    Tests  2 failed | 16 passed (18)
[FAIL(捕まえた)] ログに回答の中身（note）を出す
    × ログに定義・回答の中身を出さない（askId・paneId・件数・結果の種類だけ） 4ms
    Tests  1 failed | 17 passed (18)
[FAIL(捕まえた)] 定義の検査に落ちても sodactl が接続へ進む（検査を外す）
    × 定義の誤り（JSON でない・検査に落ちる・上限）は使い方の誤り。何も送らない・接続しない 2ms
    Tests  1 failed | 13 passed (14)
[FAIL(捕まえた)] sodactl が切断を connection_closed にしない
    × 結果が出る前に接続が切れたら connection_closed（保留の要求は reject されないので onClose で拾う） 5002ms
    Tests  1 failed | 13 passed (14)
[FAIL(捕まえた)] --machine を local 以外でも通す
    × --machine は local 以外では使えない（local は通る） 4ms
    Tests  1 failed | 13 passed (14)
[FAIL(捕まえた)] 即確定の判定を『直前がポインタ』でなく常に確定にする
    × 矢印キーで移っただけ（直前の操作が keydown の change）では確定しない。ポインタの後でもキーを打てば確定しない 7ms
    Tests  1 failed | 23 passed (24)
[FAIL(捕まえた)] IME の変換中の Enter でも送る
    × IME の変換中（isComposing・keyCode 229）の Enter では送らない 8ms
    Tests  1 failed | 23 passed (24)
[FAIL(捕まえた)] 出どころの行を定義の title にする
    × 最上部に、どの pane からの質問か（pane の名前・workspace・tab）を固定の行で出す。pane が無ければ pane <id> 15ms
    × 定義の title が空・長い・出どころの行そのものに見える文字列でも、出どころの行は変わらない（AC11） 8ms
    Tests  2 failed | 22 passed (24)
[FAIL(捕まえた)] v-html で定義の文字を出す
    × 定義のどの文字列に <script>・<img onerror> を入れても、文字のまま表示される。色でない文字列は style に入らない 12ms
    Tests  1 failed | 23 passed (24)
[PASS(捕まえていない)] 色を検証せずに style に入れる
    Tests  24 passed (24)
[FAIL(捕まえた)] askOpen を modalOpen に入れない
    × askOpen が立つと modalOpen になり（キーを端末へ送らない）、ほかのダイアログとは独立 5ms
    Tests  1 failed | 5 passed (6)
[FAIL(捕まえた)] ネイティブに閉じられたら開き直さない
    × 前の質問でネイティブに閉じられていても、次の質問のために開き直し、askOpen を立て直す 6ms
    Tests  1 failed | 23 passed (24)
[FAIL(捕まえた)] マシンの切り替えで世代を進めない
    × onClosed・マシンの切り替えで空にし、その前に始めた要求の応答を捨てる 7ms
    Tests  1 failed | 7 passed (8)
[FAIL(捕まえた)] ダイアログ中に焦点 pane の差し替えを無視
    × 質問のフォーム（20261002-sodactl-ask）を開いている間も同じく、焦点は動かさず閉じたときの戻り先だけを差し替える。ask イベントはコールバックへ渡す 5ms
    Tests  1 failed | 34 passed (35)

summary: 22 / 24 caught
NOT CAUGHT: showIf を常に表示（隠れた質問を答えに入れる） PASS(捕まえていない)
NOT CAUGHT: 色を検証せずに style に入れる PASS(捕まえていない)
```
2 件の再実施:
```
[FAIL(捕まえた)] showIf を常に表示（askVisible が常に真）
    × showIf: 条件を外すと、その質問は answers に入らず visible からも外れる（motion は mode が single/site のときだけ） 4ms
    × showIf は上から順に判定する（隠れた質問に依存する質問も隠れる） 2ms
    × collectAsk が作った回答は通る 1ms
[FAIL(捕まえた)] 色を検証せずに style に入れる
    × 定義の検査を通らずに届いた（版の違う中継等）色でない文字列も、style に入れない 9ms
    Tests  1 failed | 24 passed (25)
    ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

summary: 2 / 2 caught
```
追補（AC15）の判定の変異 4 件:
```
[FAIL(捕まえた)] 対応していない型の質問を黙って落とす（normalize が型を読み飛ばして成功にする）
    × 対応していない型（edit・rank・table・知らない文字列）は誤りでなく unsupportedType として返す（黙って落とさない）。型の名前は短い識別子だけ 7ms
    × message に定義の文字列（id の重複を除く）を入れない 1ms
    Tests  2 failed | 29 passed (31)
[FAIL(捕まえた)] CLI が対応していない型でもサーバへ送る
    × 対応していない型の質問（edit・rank・table）があれば、接続もサーバへの送信もせず unavailable（終了コード 0）。黙って落とさない（追補） 1ms
    Tests  1 failed | 14 passed (15)
    ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
[FAIL(捕まえた)] サーバが対応していない型を invalid_ask_spec にする
    × 対応していない型の質問がある定義は、ダイアログを出さず（台帳に置かず）すぐ unavailable。黙って落とさない（追補） 3ms
    Tests  1 failed | 18 passed (19)
    ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
[FAIL(捕まえた)] 未対応の型より後ろの誤りを見逃す（continue の後で検査を飛ばす）
    × 対応していない型（edit・rank・table・知らない文字列）は誤りでなく unsupportedType として返す（黙って落とさない）。型の名前は短い識別子だけ 6ms
    Tests  1 failed | 30 passed (31)
    ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

summary: 4 / 4 caught
```
変異は全てソースを元に戻した（変異の前後で `git diff --stat` が同じ・全テストが通る）。

## 起動確認（smoke）
`aidev smoke` は上のとおり 1 本目で落ちた（既存の壊れやすさ）。10 本を設定どおりのコマンドで個別に実行した結果（1 本目は作業ディレクトリを別の git worktree にして）:
```
$ bash smoke-cmds.sh   （.aidev/config.yml の smokeCommands の 10 本を順に実行）
--- smoke command 1
=> exit 0
--- smoke command 2
=> exit 0
--- smoke command 3
=> exit 0
--- smoke command 4
=> exit 0
--- smoke command 5
=> exit 0
--- smoke command 6
=> exit 0
--- smoke command 7
=> exit 0
--- smoke command 8
=> exit 0
--- smoke command 9
=> exit 0
--- smoke command 10
=> exit 0
```
この work が足した入口 `sodactl ask` は、**CLI の smoke（2 本目）に足した**: ビルドした sodactl を子プロセスで起動し、ブラウザの無いサーバで `ask` が `unavailable`（終了コード 0）・定義が誤りなら終了コード 2・pane の外なら `caller_pane_unknown`（終了コード 1）になることを確かめる。
```
$ pnpm --filter @sodashitsu/cli run smoke
smoke(cli): sodactl ask (unavailable without a browser / bad spec → 2 / outside a pane) ok
```

## 未検証の穴（skip / 環境不足）
- **既存の E2E 19 件が変更前の `main` でも落ちる**（設定画面・テーマ・appearance・key-bindings・mobile・new-terminal-cwd・scrollback-copy・workspace-tab-pane。`main`（1da98d6）を別の worktree でビルドして同じ spec を流し、同じ 19 件が落ちることを確かめた）。この work で増えていない（今回の全体: 137 passed / 19 failed）。
- **`aidev smoke` の 1 本目（server の smoke）は、作業ディレクトリ `/workspaces/sodashitsu` で変更前の `main` でも落ちる**（上の証跡）。deliver の PR 本文の既知の制約に載せる。
- 実物では確かめていない: **ループバックでない接続のブラウザ**・**実機のスマートフォン（iOS Safari・Android Chrome。画面のキーボードが出たときのダイアログの高さ）**・**Firefox・Safari**・**実物の `ssh` 越しの保存したマシン**・**ask-form 本体（ask.py）との同じ入力での結果の突き合わせ**・**Claude Code からの実際の呼び出し**（ask-form 側の対応は対象外）。手順は `docs/verification.md`「共通：質問のフォーム」。
- ask-form の追補（質問の型 `edit`・`rank`・`table`・選択肢の `code`・`image`・`audio` 等）は、**対応しない型は `unavailable`（AC15）だけを取り込み、型・項目そのものの対応は今回しない**（decisions D9・backlog）。
- hello 前の接続が `ask.subscribe` できる点は許容した（decisions D6）。
- design の AC-I5 の検証手段を、端末のスクロール位置からマウス報告の有無に替えた（decisions D7。xterm.js 6 の描画では DOM のスクロール位置が動かないため）。

## review ラウンド 1 の差し戻し後の再検証
review の指摘（同時に待てる質問の上限・標準入力の読み止め・コメント）を直した後に再実行した。このラウンドでは失敗が発生していない（上の「失敗の証跡」の smoke・既存 E2E の失敗は変更前の `main` でも同じ）。
- `pnpm run build`・`pnpm run typecheck` — exit 0
- `pnpm test` — **6464 passed / 0 failed**（364 ファイル。`AskService.test.ts` に上限〔総数 32・1 接続 8〕のケースを足した）
- E2E 新規（`ask-form.spec.ts`・`ask-form-mobile.spec.ts`） — **20 passed / 0 failed**
- `aidev coverage --strict` — gaps=0

## 着地前の `aidev smoke`（deliver 工程。利用者の判断で実施）
`aidev verify` は上の既存の smoke の失敗を理由に FAIL したので、設定（`.aidev/config.yml`）の 1 本目のコマンドの作業ディレクトリだけを一時的に別の git worktree にして `aidev smoke` を実行し、pass を記録した（設定は実行後に元へ戻した。差分なし）。コマンドの中身は同じ（`node packages/server/dist/smoke.js`）。
```
$ aidev smoke   （1 本目だけ作業ディレクトリを別の git worktree にして）
- 端末版を両方 prefix+q で抜けた（終了コード 0）
tui-pty-verify: OK
smoke: pass (exit 0, 10 本)
```
