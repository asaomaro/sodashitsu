# タスク: soda 拡張の表示の面（ブラウザ版）— `sodactl display`・パネルと帯・隔離した枠（静的な形式と、スクリプトが動く形式）

実装するのは、この文書を読む別のエージェント。**読む順**: この `tasks.md` → `design.md`（型・操作の表・枠とのやりとり・「スクリプトが動く形式」・脅威の表 H1〜H27 は、そこが正）→ `requirements.md`（AC の本文）→ `research.md` の追補（R1〜R9・実装アンカー A1〜A18・実装時の注意）。
`decisions.md` の D12〜D29 は、この作業の範囲と判断（D21〜D23 が利用者の決定。D28・D29 が、スクリプトが動く形式の今の作りの理由）。**範囲の外**（拡張の登録と起動〔`20261007-ext-host`〕・端末版のパネル・観測・割り込み・スクリプトが動く形式の「初回の許可」）には手を出さない。

## PR の分け方

差分が 60 ファイル前後（テスト込み）になる見込みなので、**PR を 3 つに分ける**。順に積み、前の PR だけで動く（後ろを待たない）。

| PR | 中身 | タスク | これだけで出来ること |
|---|---|---|---|
| **PR1: サーバと sodactl（静的な形式）** | protocol・台帳・受け口と `/ws`・`sodactl display`・handoff の起動確認 | T1〜T7 | 画面なしで、`set`・`list`・`close`・`wait`・`events`・`--features` が通る（結合テスト）。2 MiB の中身 |
| **PR2: 画面（静的な形式）** | 静的な枠・配信・パネルと帯・幅のつまみ・キーの操作・モバイル・E2E・文書・負の対照 | T8〜T22 | `text`・`markdown`・`html` の面がブラウザに出て、操作が返る |
| **PR3: スクリプトが動く形式** | `script-html`・`display.send`・土台のページ・覆いとフォーカスの番・E2E・文書・負の対照 | T23〜T30 | スクリプトが動く面と、残る限界の文書 |

- aidev の work は 1 つのまま（この `tasks.md`）。ブランチは `feature/ext-display-surface` から、PR ごとに切る（例: `feature/ext-display-surface-1-server`・`-2-web`・`-3-script`）。PR2 は PR1 の上、PR3 は PR2 の上に積む。
- **独立レビュー（差分全体。実装とは別のコンテキスト）は、PR ごとに掛ける**。`aidev` の test・review・deliver を PR ごとに回すか、PR2・PR3 を別の work に切り出すかは、実装を監督するセッションが決めて `decisions.md` に書く（勧める: PR2・PR3 を始める前に `aidev new` で別の work に切り出し、この `tasks.md` の該当のタスクを写す。1 work 1 PR の決まりに合う）。
- PR3 は、PR2 の静的な形式の守り（CSP・sandbox・取り除き）を 1 つも変えない（別のページ・別の定数を足すだけ）。PR3 のレビューで、PR2 のファイルの差分が「足した行だけ」であることを見る。

## PR3 で変わる型・定数（PR1・PR2 の実装が、先に知っておくこと）

PR1 は実装済み（`test-result.md`）。PR1 の実装は、**読み手の側の型をゆるく**してある: 受け取る `format` は `DisplayFormatValue`、閉じた理由は `DisplayClosedReasonValue`（どちらも、未知の文字列を通す）、`DisplayRenderers`・`DisplayLimits` は未知の項目を通す、一覧は `readDisplayInfo` で読む。
書き手の側（`checkDisplaySet`・`display.set` の `format`）は、その版が出せる形式だけを厳しく検査する。PR2 の画面も、この「読み手はゆるく」を守る（下の表の値を、知らないものとして受けても壊れない）。

| 種類 | PR1・PR2 の時点 | PR3 で足す・変える | 足すタスク |
|---|---|---|---|
| `DISPLAY_FORMATS`（書き手が出せる形式） | `text`・`markdown`・`html` | `script-html` を足す（`DISPLAY_STATIC_FORMATS` と `DISPLAY_SCRIPT_FORMAT` に分ける） | T23 |
| 閉じた理由（`display.closed`・`display.removed`） | `closed`・`dismissed`・`expired`・`navigated`・`unresponsive`（＋`display.removed` の `pane_closed`） | `focus_steal` | T23 |
| `display.report` の `problem` と意味 | `navigated`・`unresponsive`（どちらも、その面を閉じる）。引数は `{id, problem}`（PR1）。**PR2 の画面は、`paneId` と `format`（描いていた枠のもの）を添えて送る**（PR1 のサーバは、知らない項目として受け流すこと。受け流さないなら、T10 で `/ws` の schema に任意の 2 項目を足す） | `focus_steal` を足す。**これは閉じる知らせではなく「1 回取られた」の知らせ**（サーバが pane ごとに数える）。結果に `steals`。サーバは、面がもう無くても、添えられた `paneId`・`format` で数える | T10・T23・T24 |
| `display.action` の出来事 | `type`・`seq`・`paneId`・`name`・`rev`・`action`・`data?`・`at` | `source: "static" \| "script"` を足す（静的な面の操作にも付く） | T23・T24 |
| `DISPLAY_FEATURES` | `panel`・`band`・`format:text`・`format:markdown`・`format:html`・`actions` | `format:script-html`・`send` | T23 |
| `DISPLAY_RENDER_FEATURES`（画面の名乗り）と `DisplayRenderers` | `panel`・`band`・`actions` | `script-html`／`scriptHtml` | T23・T27 |
| `DisplayLimits` | PR1 の項目 | `sendBytes` | T23 |
| `/ws` の方式・受け口の操作 | 方式 10・操作 5 | `display.send`（方式 11・操作 6） | T23・T24 |
| イベント | `display.updated`・`display.removed` | `display.message` | T23 |
| 定数 | `DISPLAY_PING_INTERVAL_MS`・`DISPLAY_UNRESPONSIVE_MS`・（`DISPLAY_PONG_TIMEOUT_MS`） | `DISPLAY_SEND_MAX_BYTES`・`DISPLAY_SEND_RATE`・`DISPLAY_FOCUS_STEAL_MAX`・`DISPLAY_SCRIPT_COOLDOWN_MS`。`DISPLAY_PONG_TIMEOUT_MS` は使わなくなったので、T11 で消す | T11・T23 |
| サーバの状態 | 面の台帳・出来事の列 | pane ごとの「取られた回数」と「冷却の終わりの時刻」 | T24 |
| 枠の頁（`framePage()`） | 静的な 3 つ → `frame.html`。ほかは `null`（固定の文言） | `script-html` → `script.html` | T11・T27 |

## 実装方針

各 PR の終わりで `pnpm build`・`pnpm typecheck`・該当パッケージのテストが通る状態にする。

- **PR1**: protocol（T1・T2）→ サーバの台帳と登録（T3・T4）→ sodactl（T5・T6）→ handoff の起動確認（T7）。
- **PR2**: 静的ページと配信（T8・T9）→ ブラウザの状態と通信（T10）→ 枠（T11）→ パネル・帯の部品（T12）→ pane への差し込み（T13）→ **最初の E2E（T14。不確かな点 1・2）** → 幅のつまみ（T15）→ キーの操作（T16）→ モバイル（T17）→ E2E（T18・T19・T20）→ 文書（T21）→ 負の対照（T22。test 工程）。
- **PR3**: protocol の追加（T23）→ サーバ（T24）→ sodactl（T25）→ 土台のページと配信（T26）→ 枠の覆い・フォーカスの番・印（T27）→ E2E（T28。不確かな点 5〜8 と、限界の実測）→ 文書（T29）→ 負の対照（T30。test 工程）。

純粋な検査（引数・操作・行の形）は protocol に置き、サーバ・sodactl・ブラウザが同じ関数を使う。大きさの丸め・枠からの知らせの検査・フォーカスの番の状態は、web の純粋なモジュールに置いて単体テストする。
**`/ws` の handler を受け口に登録しない**（受け口の操作は、引数に `paneId` を持たない別の schema。design「操作」）。

独立点検（`aidev taskcheck`）は、壊れやすいタスク（サーバの状態・プロトコル・安全に関わるもの）だけに掛ける: **T1・T2・T3・T4・T6・T8・T9・T11・T23・T24・T26・T27**（各タスクの末尾に `点検: あり`）。
見た目・配線・E2E・文書のタスクには掛けず、PR ごとに、その PR のタスクが終わった後で `cross` を 1 回掛ける（AGENTS.md「点検とテストの掛け方」。考え方は `decisions.md` D17、今のタスクの番号での一覧は D26）。

## 作業順序と依存関係

下の `依存:` に従う。補足:

- **不確かな点と、だめだったときの扱い**（design「依拠する既存の事実」の未確認）。どれも、結果を `decisions.md` に 1 行残す。だめなら代えを採る。
  1. `MessagePort` を、sandbox の不透明 origin の枠へ `postMessage` の transfer で渡せること → **T14**。だめなら、design「枠とのやりとり」の「代替」（乱数の合言葉）に切り替える（直すのは `DisplayFrame.vue`・`frame.js`・後の `script.html` の土台）。
  2. Playwright の `frame.evaluate` が、`script-src 'self'` の枠の文書の中で式を評価できること → **T14**。だめなら、T19 (1) の探りは測れない。枠の origin が不透明であること（親から見た `iframe.contentDocument === null`・応答ヘッダと `sandbox` 属性の値）だけを見て、
     **AC15 の「枠の中から触れない（実測）」は未検証の穴として `test-result.md` と `decisions.md` に残す**（黙って緑にしない）。スクリプトが動く形式（AC30）は、中身のスクリプトに探りを書けるので、これに依らない。
  3. sandbox に `allow-forms` があれば、枠の中の `form` の `submit` のイベントが起き、実際の送信は起きないこと → **T18 (8)**。起きないなら、`decisions.md` D18 の 4 の代替案（送信ボタンの `click` と欄の `Enter` を `frame.js` が拾う）に切り替え、`allow-forms` を外す（T8・T9・T11 の定数）。
  4. marked が、Markdown の中の HTML（`<button data-soda-action>`）をそのまま通すこと → **T18 (8)**。通さないなら、`markdown` では操作を宣言できないと T21 の文書に書き、requirements の AC10 の後半を外す。
  5. 枠のスクリプトが `focus()` を呼ぶと、親の `window` に `blur` が起き、`document.activeElement` がその iframe になること（u1）と、親が元の要素へ `focus()` し直すと戻ること・戻し先が `body` のときの動き・変換中（IME）の文字の行方（u2・u11）→ **T28 (5)**。
     `blur` が起きないなら、250ms の見回りだけで検知する（限界 1 の「短い間」が 250ms になる、と docs に書く）。戻せないなら、design の「横取りの検知」の 2（`blur()` してもう 1 回 → その画面の枠を外す）が効くことを確かめ、効かなければ、取られた 1 回目で閉じる形に変える（`DISPLAY_FOCUS_STEAL_MAX` を 1 に）。
     `Permissions-Policy` の `focus-without-user-activation=()` が効く（取ること自体が止まる）なら、そのブラウザの名前と版を docs に書く（検知は、そのまま残す）。
  6. **アプリ本体の CSP が、枠が自分で外の origin へ移ることを止めるか**（u3）→ **T28 (6) の (ix)**（合否にしない筋）。どちらでも実装は変えない。結果（面が閉じたか・そのままか、待ち受けに要求が届いたか）を、T29 の文書の「限界 3」に書く（止まるなら、確かめたブラウザの名前つきで）。
     **合否を見る筋（T19 (4)・(6)、T22 (e)、T28 (6) の (i)〜(viii)・(xi)）は、必ず移れる宛先（同じ origin の `/display-view/frame.html?moved`）を使う**（外の宛先だと、CSP が止めた場合に、筋が空振りになる）。
  7. 枠が移ったとき、親から見た iframe の `load` が起きること（u4。主な判定の前提）→ **T19 (6)**（静的な形式で、Playwright が枠を移す）と **T28 (6)**。土台が中身を DOM に差し込む入れ方で、`load` が 1 回のままであること（u9）→ **T28 (1)**（合否にする。2 回目が起きるなら、正当な中身が全部「移った」になるので、差し込み方を直す。「どの `load` が土台のものか」を枠に言わせる作りには戻さない。D29 の 2）。
     文書を置き換えない移動（204 の応答・すぐ止める）で `load` が起きるか → **T28 (6) の (ix)**（合否にしない。起きないなら、気づけない道として docs の限界 3 に書く）。
  8. 土台が中身を DOM に差し込む入れ方（`<script>` を作り直して順に入れる・`DOMContentLoaded` と `load` を起こす）で、ふつうの HTML とグラフのライブラリが期待どおりに動くこと（u5）→ **T28 (1)・(8)**（インラインのスクリプトの順・`DOMContentLoaded`/`load` を待つ部品・`<body onload>`・埋め込んだ大きなライブラリ）。
     動かない書き方が見つかったら、土台で直せるものは直し、直せないものは docs の「ふつうの頁と違う点」に書く（`document.write` で入れる作りには戻さない）。`Esc` が取り次がれること → **T28 (7)**。
  10. ［操作する］を押した後・`prefix+i` の後の、ポインタとキーが上がるイベントが、枠へ届かないこと（u10）→ **T28 (7)**。届くなら、始めるのを 100ms 遅らせる・その間の枠の `keyup` を土台が捨てる、を足す（`engageEntry.ts` の中だけで直す）。
  11. 兄弟の枠（ほかの面。ほかの pane のものを含む）への `postMessage`・port の受け渡し・`parent.frames[i].location` の書き換え・`parent.frames[i].focus()`（u12）と、「確かでない」の行の全部（u13: WebRTC・`history`・先読み・クリップボード・音・`window.name`・PiP）→ **T28 (4) の「実測の一覧」**（合否にしない。結果で docs を書く）。
      兄弟の `location` を書き換えられる場合、書き換えられた側の面は `load` の回数で閉じる（**T28 (6) の (xi)** で合否にする。書き換えられた側がスクリプトの面なら、その pane が冷却に入る＝ほかの pane を巻き込める。限界 12）。
      兄弟へ `focus()` できる場合の扱い（スクリプトの面なら、その pane の回数に数える。静的な面なら、枠の `frame.js` が気づいて、親が戻す）は、**T28 (5) の (xi)** で合否にする。
  9. 別のマシンの中継が、4 MiB 近い 1 通を通すこと（u8）→ **T4** の中継越しの結合テスト（2 MiB の中身の `set` を、中継の接続から送る）。通らないなら、`--machine` での `set` の中身の上限を、通った大きさに下げて docs に書く（先のマシンの pane の中からの `set` は、中継を通らないので 2 MiB のまま）。
- `composeServer.ts`・`HttpServer.ts`・`main.ts`（web）・`cliArgs.ts`・`ActionDispatcher.ts`・`DisplayFrame.vue` は、複数のタスクが触る。`依存:` の順に 1 つずつ（並行させない）。
- 並行してよい組: T3 と T5 の引数の解析、T8・T9 と T10、T16 と T17、T25 と T26。

## リスク / 留意点

- **葉（`.pane-layout-leaf`）と `TerminalPane.vue` の中に何も足さない**。足すのは `.pane-frame-body` の中の、葉の兄弟（research R3・実装時の注意）。操作中に端末を薄くするのも、葉の外（`.pane-frame-main`）に当てる。
- **`PaneFrame` は `enabled=false`（モバイル・単体テスト）でストアに触れない**。面の部品も同じ条件で描かない。既存の `PaneFrame.test.ts`・`PaneLayout.test.ts` を壊さない。
- **`/ask-view/*` の応答ヘッダ・`ASK_VIEW_*` の定数・`packages/web/public/ask-view/` の中身は変えない**。`HttpServer.ts` で共通の関数にまとめるときも、出るヘッダの値を変えない（既存の統合テストが守る）。
- **静的な形式の枠（`DISPLAY_VIEW_SANDBOX`＝T11、`DISPLAY_VIEW_CSP`＝T9）に `allow-same-origin` を付けない。その CSP の `script-src` に `'unsafe-inline'`・`'unsafe-eval'` を付けない**（`style-src 'unsafe-inline'` は要る）。
  **スクリプトが動く枠（`DISPLAY_SCRIPT_VIEW_SANDBOX`・`DISPLAY_SCRIPT_VIEW_CSP`＝T26・T27）は別の定数**で、`script-src` は `'unsafe-inline' 'unsafe-eval'`（**`'self'` は付けない**。土台は頁の中に書く）だが、`allow-same-origin`・`allow-forms`・`allow-popups`・`allow-modals`・`allow-downloads` は付けない。2 つの形式で、ページ・定数・ヘッダを共有しない。
- **枠の頁と sandbox を選ぶのは、`framePage()` の 1 つだけ**。`DisplayFrame` を置く側は、`:key` を **`frameKey(info)`**（`framePage.ts`。静的な形式は `<面の id>:<形式>`、スクリプトが動く形式は `<面の id>:script-html:<rev>`）にする。`:key` を自分で組み立てない（形式・版が替わったら、部品ごと——iframe・port・覆い・操作中の状態——作り直す）。知らない形式を、どちらかの頁へ落とさない。印「スクリプト」も同じ `info.format` から決める（H27）。
- **`render` を送るのは、手元の中身が、いまの見出しと同じ面・同じ版・同じ形式のときだけ**（`content.id`・`content.rev`・`content.format` が `info` と一致）。形式・版が替わった直後に、ストアに残っている前の中身を、新しい枠へ送らない（前の `html` の中身が、スクリプトの頁で動く）。
- **知らせ（`display.report`）を、操作の頻度の制限に入れない・捨てない**（画面もサーバも）。中身のスクリプトが `soda.action` を流して、知らせを落とせないように。
- **通り道（port）と中身を渡すのは、合い札の合う `display-ready` と、その iframe の最初の `load` の、両方を見た後だけ**（中身がストアにあっても、先に送らない）。中身のスクリプトを、親が最初の `load` を数える前に動かさない。
- **移ったことは、iframe の `load` の回数だけで決める**（2 回目は必ず「移った」）。枠の言うこと（`rendered`・`pong`）を、安全の判断に使わない。スクリプトの頁の土台は、`document.write` を使わない。
- **取られた回数を、画面やストアで「閉じる判断」に使わない**（数えて閉じるのはサーバ。画面は、戻して、知らせるだけ。画面の中で数えるのは、知らせを送れないときの、その画面の枠を外す判断だけ）。
- **面の出現・更新で、アプリは `focus()` を呼ばない**。`frame.js` が `focus()` を呼ぶのは、親の `focus` の知らせのときと、枠の文書が既にフォーカスを持つとき（`document.hasFocus()`）の持ち越しだけ。スクリプトの頁の土台は、親の `focus` の知らせのときの `window.focus()` だけ。
- **スクリプトが動く枠へ渡すのは、中身・配色・`send` のデータだけ**（prefix のキーの形〔`relayKeys`〕は、静的な形式の枠にだけ渡す）。pane の id・接続の id・token・ほかの面の情報を渡さない（`render` の項目を増やすときは、レビューで見る）。
- 受け口の 1 行の上限（`PANE_SOCKET_MAX_LINE_BYTES`）を 4 MiB に上げると、**ask の受け口の要求にも効く**。ask の既存のテスト（1 行の上限の超過で `bad_request`）は、新しい値に合わせて直す。`docs/sodactl.md` の「1 MiB」も直す。
- 受け口の待ち（`display.wait`）は、受け口の同時接続 64 を ask と分け合う。待ちの上限（pane 4・全体 16）を必ず入れる。
- `/ws` の `not_found` は「pane が無い」と「古いサーバ」の両方で返る。sodactl は `display.features` で見分ける。受け口の `unknown_op` は、`/ws` へ落とさずに古いサーバとする。1 行が 1 MiB を超える要求は、送る前に `display.features` を呼ぶ（design「sodactl」）。
- パネルの開閉・幅の確定で pane の列数が変わる。幅をアニメーションさせない。**つまみのドラッグの間は、パネルの幅を変えない**（案内の線だけを動かす）。
- ログに、面の中身・題・操作に添えた値・`send` のデータを書かない。
- 新しいテーマの変数を足さない（既存の変数を使う）。文言は日本語の直書き。エラーの code を足したら `packages/client-core/src/net/clientError.ts` にも足す。
- `USAGE_LINES` を変えるのは T5（静的な形式の全部）と T25（`--script-html-file`・`send`）。同じコミットで `packages/cli/skills/sodactl/SKILL.md` も直す（`skill.test.ts` が見る）。
- 動いている 7780 番のサーバには触らない。E2E・結合テストは、テストが立てるサーバ（空きポート・一時の状態ディレクトリ）だけを使う。E2E の sodactl には、テストのサーバの `SODA_PANE_SOCKET` を明示して渡し、走らせた人の環境の値を消す（`packages/e2e/src/support/ask.ts:56-64` と同じ）。
  **外への通信・移動の E2E は、テストが `127.0.0.1` の別のポートに立てた待ち受けだけを宛先にする**（本物の外のホストへ出さない）。
- 識別子（pane の id・面の id）の形に依存しない。

## テスト方針

- **単体**（各ファイルの隣の `*.test.ts`）:
  - protocol: `checkDisplaySet`（名前・種類・形・題・大きさ・中身の上限 2 MiB のちょうどと超過・`ttlMs`）・`checkDisplayAction`・`parseDisplayLine`（知らない `type`・知らない項目を落とさない）・受け口の schema に `paneId` が無いこと・`METHOD_SCHEMAS` の表。PR3 で、`script-html`・`send` のデータの上限。
  - server: `TokenBucket`（偽の時計。回数と量）・`DisplayService`（新規と置き換えの `rev`・数と合計 32 MiB の上限・回数と量の頻度・`close`/`all`/`ttl`/`pane.closed`・列の `seq` とあふれ・`wait` の 4 つの分岐・待ちの上限・`signal` の abort と `clientId` の切断・
    `subscribe`/`renderers`/`onClientGone`・`get` の小分け〔片の境目・`eof`・`offset` の誤り・途中で `rev` が変わる〕・`action`/`dismiss`/`report` の権限と理由・操作の頻度の超過は捨てて成功・`features` の `epoch`・`dispose`・`pane.closed` の処理の中で例外が出ても続く）。
    PR3 で、`send`（形式・大きさ・頻度・`delivered`）、**pane ごとの取られた回数と冷却**（偽の時計: 面の id・名前・接続が違っても足される・`close`→`set` で戻らない・3 回で、その pane の `script-html` を全部閉じる・冷却の 5 分ちょうどの前後・明けたら 0 に戻る・冷却中の知らせで延びない・静的な形式は冷却中も出せる・
    冷却中の、同じ名前の静的な面の `script-html` への置き換えは断られて面が残る・`unresponsive` と静的な面の `navigated` は冷却に入らない・`script-html` の `navigated` は入る）、出来事の `source`。
  - cli: 引数の解析（中身の指定は 1 つだけ・`--format` は標準入力のときだけで省くと `text`・どれも無くて標準入力が端末なら誤り・2 MiB 超は誤り・1 行が 4 MiB を超える中身は誤り・`--size` の範囲・`--all` と名前の排他・`--machine` に `--pane` が要る）・
    経路の選択（呼び出し元と違う `--pane` は `/ws`・受け口の `unknown_op` は `/ws` を呼ばずに `unsupported`・1 行が 1 MiB を超えるときは先に `display.features`）・`/ws` の `not_found` の見分け・`runWaitLoop`。PR3 で、`--script-html-file`・`send`・`script-html` を知らないサーバへの `unsupported`。
  - web: `frameMessages.ts`・`displayLayout.ts`（`panelWidthRange`・`panelWidth` の境目・利用者の幅の丸め）・`frameRegistry.ts`・`store/display.ts`（幅の保存・64 件・壊れた値）・`DisplayController`（小分けの取得の組み立て・`rev` が変わったら最初から）・
    `DisplayFrame.vue`（送り主の違う `message`・2 回目の `display-ready`・`load` の 2 回目で `report("navigated")`・見回りは見えている間だけ数える・port 以外を受けない・フォーカスのある枠が消えたら端末へ戻す）・`PanePanel.vue`（タブ・たたむ・固定のラベル・つまみの `aria`・キーボード）・`PaneBands.vue`・`sanitize.js`。
    PR3 で、`focusGuard.ts`（状態機械: 操作中でないのに枠がフォーカスを持つ、に**変わった**ときだけ「戻す・知らせる」〔取られたままを数え直さない〕・戻せなければ「この画面の枠を外す」・操作中は数えない・枠でない要素への `focusin` で操作中を解く・操作中でないときの `key` の知らせを捨てる・`prefix` は常に捨てる・
    元の場所の追跡が、表示の枠・覆い・［操作する］を覚えない）・`framePage.ts`（形式 → 頁と sandbox。知らない形式は `null`）・`engageEntry.ts`（始めるのは、ポインタ・キーが上がった後）・`script.html` の土台（`?raw` で読み込み、`<script>` の中身を取り出して、偽の port で `soda.action`・`onMessage`・`ping`・静的な形式の `render` を拒む）・`DisplayFrame.vue` の覆いと［操作する］。
- **結合**（実サーバ。vitest がソースから動かす）: 受け口（`paneSocket.integration.test.ts`）・`/ws`（`display.integration.test.ts`）・中継越し（`machines.integration.test.ts` の方式）・`HttpServer.integration.test.ts`（`/display-view/*`）・cli（`packages/cli/src/display.integration.test.ts`）。
- **E2E**（実ブラウザ。`.aidev/conventions/e2e-observe-browser.md` に従う）: 合否は、ブラウザの DOM・枠の中の DOM（`page.frameLocator("iframe[data-display-frame]")`）・要素の箱・計算済みのスタイル・ブラウザが送った要求
  （`client.view` は `support/panes.ts` の `watchClientView`、`display.action`・`display.report`・入力のフレームは CDP の記録）・ブラウザの要求の記録（`page.on("request")`）・テストが立てた待ち受けに届いた要求、で判定する。
  テスト自身の接続は、pane の用意と、サーバ側の確かめ（PTY の列数）にだけ使う。**テストの接続にイベントが届いたことを、画面に出た合図にしない**（枠の中の DOM・枠の外のラベルを待つ）。固定時間の待ちを根拠にしない。
  端末（WebGL）の文字は DOM から読めないので、「打ったキーが pane に届いた」は、ブラウザが送った入力のフレームで見て、spec のコメントに書く。sodactl は、ビルドした `packages/cli/dist/main.js` を子プロセスで動かす（`support/display.ts`）。
- **起動確認**: `handoffSmoke.ts` に 1 段（T7）。`aidev smoke` は、作業フォルダの外の worktree で流す（AGENTS.md）。
- **負の対照**（`.aidev/conventions/regression-negative-control.md`）: T22（静的な形式）・T30（スクリプトが動く形式）。対策を外した版でテストが落ちることを確かめ、生の出力を `test-result.md` に残す（test 工程で消化する。`decisions.md` D17）。
- **限界の実測**（合否にしない。数と結果を `test-result.md` に書く）: T28 の「閉じるまでに枠へ入ったキーの数」（限界 1）と「外の origin への移動の要求が届いたか」（限界 3）。
- 実装のセッションは、PR ごとに、最後に `pnpm build`・`pnpm typecheck`・`pnpm test` と、`packages/e2e` の新しい spec・既存の `ask-view.spec.ts`・`ask-form.spec.ts`（受け口の 1 行の上限を変えるため）・`resize-handles.spec.ts`・`workspace-tab-pane.spec.ts`・`mobile.spec.ts`・`key-bindings.spec.ts` を流して、結果（出力と終了コードを別々に）を報告する。

## タスク

独立点検（`taskcheck`）を掛けるのは T1・T2・T3・T4・T6・T8・T9・T11・T23・T24・T26・T27。

### PR1: サーバと sodactl（静的な形式）

- [x] T1: protocol の型・定数・検査を新しいファイルに作る（静的な形式の分）: design「定数と型」のうち、`script-html`・`send`・`focus_steal` に関わるもの（T23）を除く全部。`DISPLAY_FORMATS` は、この時点では `text`・`markdown`・`html` の 3 つ。中身の上限は 2 MiB・サーバ全体 32 MiB・`DISPLAY_GET_CHUNK_BYTES`・回数と量の頻度の定数・
      `DisplayInfo`・`DisplayChunk`・`DisplayRenderers`（`scriptHtml` は T23）・`DisplayLimits`（`requestLineBytes` つき）・`DisplayFeatures`（`epoch` つき）・`DisplaySetBody`・`DisplaySetResult`・`DisplayWaitResult`・`DisplayEvent`・`DisplayClosedReason`（`closed`・`dismissed`・`expired`・`navigated`・`unresponsive`）・`DisplayLine`・`DISPLAY_PING_INTERVAL_MS`・`DISPLAY_PONG_TIMEOUT_MS`・`DISPLAY_UNRESPONSIVE_MS`、
      `checkDisplaySet`・`checkDisplayAction`・`displayLimits`・`parseDisplayLine`。題は制御文字を拒否し、前後の空白を除く。中身のバイト数は UTF-8 で数える。`index.ts` から export。単体テスト
      対象: `packages/protocol/src/display.ts`（新規）、`packages/protocol/src/display.test.ts`（新規）、`packages/protocol/src/index.ts` / 根拠: design「定数と型」、手本は `packages/protocol/src/ask.ts`
      依存: なし
      AC: AC23, AC25, AC36
      点検: あり
- [x] T2: protocol の通信（静的な形式の分）: `/ws` の 10 の方式の引数の zod schema と結果（`display.set`・`close`・`list`・`wait`・`features`・`subscribe`・`get`〔`{id, offset}`〕・`action`・`dismiss`・`report`〔`problem` は、この時点では `navigated`・`unresponsive`〕）を `METHOD_SCHEMAS`・`MethodResultMap` に足す。
      `display.close` と `display.dismiss` は「どちらか 1 つ」を `superRefine` で検査。受け口の操作の名前の定数 5 つと、`paneId` を除いた schema。**`PANE_SOCKET_MAX_LINE_BYTES` を 4 MiB に上げる**。イベント `display.updated`・`display.removed`（理由つき）を `ServerEvent` に。
      エラーの code `invalid_display`・`display_limit`・`display_busy`・`display_closed`。`clientError.ts` に 4 つの code の日本語。テスト（表に載っていること・受け口の schema が `paneId` を `strict` で拒否すること・1 行の上限の値）
      対象: `packages/protocol/src/messages.ts:920` 付近・`1017` 付近、`packages/protocol/src/paneSocket.ts`、`packages/protocol/src/events.ts`、`packages/protocol/src/errors.ts:84-86` の後、`packages/client-core/src/net/clientError.ts:96` 付近、`packages/protocol/src/messages.test.ts`・`paneSocket.test.ts` / 根拠: research A6、design「操作」
      依存: T1
      AC: AC14, AC23, AC36
      点検: あり
- [x] T3: server の台帳: `TokenBucket`（`take(now, n = 1): boolean`。回数にも量にも使う）と `DisplayService`（design「サーバ: `DisplayService`」のうち、`send` と `focus_steal` を除く全部。中身は `Buffer` で持つ・`get` は小分け〔`DisplayChunk.totalBytes`〕・`report`（`navigated`・`unresponsive`）・回数と量の桶・
      bus の `pane.closed` の購読〔処理の中を `try` で囲む〕・`ttl` のタイマー・pane ごとの列と `seq`・`epoch`）。時計・id の生成は差し替えられる形にする。サーバはファイルを読まない・外へ通信しない（`node:fs`・`node:http`・`node:https`・`node:net` を import しない）。
      ログに中身・題・値を書かない。規則の外は `RpcError` で投げる。単体テスト（「テスト方針」の server の項目）
      対象: `packages/server/src/display/DisplayService.ts`（新規）、`packages/server/src/display/rateLimit.ts`（新規）、各 `.test.ts`（新規） / 根拠: research A5（手本は `packages/server/src/ask/AskService.ts`）
      依存: T2
      AC: AC2, AC3, AC8, AC12, AC13, AC20, AC22, AC25, AC34, AC36
      点検: あり
- [x] T4: server の登録と配線: 受け口の操作 5 つ（`ctx.paneId` だけを対象に。`displayWaitOp` は `{ signal: ctx.signal }`）、`/ws` の方式 10（`display.wait` は `{ clientId: ctx.clientId }`。handler は `RpcError` 以外を投げない）、
      `composeServer.ts`（`DisplayService` の組み立て〔`isScreenKind` は `AskService` に渡している `isBrowserKind` と同じ関数〕・`paneOps.register` × 5・`registerAllMethods` の依存・2 つの `onClientGone`・`close()` の `finally` で `dispose`）、`MethodDeps`、`testkit.ts` の export。
      受け口の 1 行の上限の変更に合わせて、既存の受け口のテスト（上限の超過）と、`docs/sodactl.md` の「サーバ側の上限」「ログイン不要の受け口」に書かれた「1 MiB」を直す（PR1 で値が変わるので、文書の値も PR1 で直す）。結合テスト: 受け口（ログインなしで `set` → `list` → `wait`・**2 MiB ちょうどの中身の `set` が通る**・
      **pane A を名乗って、pane B の面の名前で `close`/`list`/`wait` しても B に届かない。引数に `paneId: <B>` を載せて送っても B に届かない**〔通常の版では `invalid_params`。T22 (a) の対〕・待ちの上限・接続を切ると待ちが外れる）、
      `/ws`（名乗り → **2 MiB ちょうどの中身を、手元の `/ws` の `display.set` で直に出す**〔AC36 の `/ws` の経路〕→ `display.updated` → `get` を小分けで全部取って元の中身と一致〔2 MiB なので、片 3 つにまたがる。`offset` が片の倍数でないと `invalid_params`〕→ `action` → `dismiss`・`report("navigated")` → `display.removed`〔理由つき〕と `display.closed`・
      中身の合計が 32 MiB を超える `set` は `display_limit`・量の頻度（続けて 8 MiB）を超える `set` は `display_busy` で、どちらも既にある面は変わらない・名乗らない接続の `get`/`report` は `display_closed`・`external` の `subscribe` は `invalid_params`・pane を閉じると面が消える）、
      中継越し（別のマシンの pane の面が、中継の接続の `display.subscribe` に出て、`get` で取れる。**2 MiB の中身の `set` を中継の接続から送る**〔不確かな点 9〕）
      対象: `packages/server/src/panesocket/displayOps.ts`（新規）、`packages/server/src/surface/methods/display.ts`（新規）、`packages/server/src/surface/methods/index.ts`・`deps.ts`、`packages/server/src/composeServer.ts:334-352`・`411`・`460-475`・`close()`、`packages/server/src/testkit.ts`、`docs/sodactl.md:213` の節・`718` の節（「1 MiB」の値だけ）、
      `packages/server/src/panesocket/paneSocket.integration.test.ts`・`PaneSocket.test.ts`、`packages/server/src/display/display.integration.test.ts`（新規）、`packages/server/src/machine/machines.integration.test.ts` / 根拠: research A1〜A4
      依存: T3
      AC: AC1, AC3, AC14, AC26, AC36
      点検: あり
- [x] T5: sodactl の `display` の引数（静的な形式の全部）と、`set`・`close`・`list`・`--features` の実行: `USAGE_LINES`（design「sodactl」の行のうち、`--script-html-file`・`script-html`・`send` を除いたもの）・`Command` の union・`parseCommand`（中身の指定は 1 つだけ・`--format` は標準入力のときだけで省くと `text`・`--size` の範囲・`--all` と名前は排他・`--machine` には `--pane` が要る・`--since` と `--epoch` は組）、
      `main.ts` の switch と `printHelp`（`wait`・`events`・`set --wait` の実行は T6。T5 の時点では「未実装」の誤りで終わってよい）、
      `commands/display.ts`（ファイルと標準入力の読み込み〔通常ファイル・2 MiB・UTF-8〕・送る前の `checkDisplaySet` と「要求の 1 行が 4 MiB を超えない」の確かめ・**1 行が 1 MiB を超えるときは先に `display.features`**・
      経路の包み〔受け口の `unknown_op` は `/ws` へ落とさずに古いサーバとする。繋げない・`bad_request` は `/ws` へ落ちる。`callPaneOp` の結果を見る〕・呼び出し元と違う `--pane` は受け口を使わない・`invalid_display` は使い方の誤りに読み替える・
      `/ws` の `not_found` を受けたら `display.features` で古いサーバと「pane が無い」を見分ける・古いサーバは `{"status":"unsupported",…}` で終了コード 0・`--features` は常に終了コード 0）、SKILL.md（`USAGE_LINES` に合わせる分）。
      単体テスト（「テスト方針」の cli の項目）と、結合テスト（実サーバ: ログインなし・受け口の経路で `set` → `list` → `close` → `--features`、2 MiB ちょうどの `--html-file`、2 MiB＋1 バイトは終了コード 2、
      ログイン済み・`SODA_PANE_SOCKET` なし・`--pane <id>` の `/ws` の経路で `set` → `list`〔AC26〕、無い pane の `--pane` は `not_found` で終了コード 1）
      対象: `packages/cli/src/cliArgs.ts`、`packages/cli/src/main.ts`、`packages/cli/src/commands/display.ts`（新規）、`packages/cli/src/commands/display.test.ts`（新規）、`packages/cli/src/display.integration.test.ts`（新規）、`packages/cli/src/cliArgs.test.ts`、`packages/cli/skills/sodactl/SKILL.md`
      / 根拠: research A14（手本は `commands/ask.ts`、`packages/cli/src/paneSocket.ts` の `callPaneOp`・`paneSocketFor`）
      依存: T4
      AC: AC1, AC2, AC3, AC20, AC21, AC22, AC26, AC36
- [x] T6: sodactl の `display wait`・`display events`・`set --wait` の実行: `runWaitLoop`（design「sodactl」の「`wait`・`events` の繰り返し」のとおり。まず `display.features` で `epoch` を得る・`events` は最初の行 `display.ready`・**`display.wait` には必ず `epoch` を渡す**・1 回の待ちは 30 秒で、空なら次を呼ぶ・`dropped`・`reset`・
      5 秒の繋ぎ直し〔受け口の `connection_closed`・`ECONNREFUSED`・`pane_socket_busy`、`/ws` の切断〕・途中の `not_found` は `pane_closed`・stdout が閉じたら終了コード 1・`--timeout` は全体の待ち時間で、省くと待ち続ける）。`set --wait` は `set` の結果の `epoch`・`next` から待つ。`main.ts` の「未実装」を実行につなぐ。
      単体テスト（時計と受け口を差し替える）と、結合テスト（実サーバ: 受け口の経路で `events` を起動 → `/ws` から `action` → 行が出る・`/ws` の経路でも同じ・`wait <名前>` が 1 行出して終わる・`report("navigated")` で `display.closed`〔`navigated`〕の行・pane を閉じると `display.end`〔`pane_closed`〕で終了コード 0）
      対象: `packages/cli/src/commands/display.ts`（T5 のファイル）、`packages/cli/src/commands/display.test.ts`、`packages/cli/src/display.integration.test.ts`、`packages/cli/src/main.ts`、`packages/cli/src/paneSocket.ts`（変えるなら `connection_closed` を呼び出し側で扱えるようにするだけ）/ 根拠: research R7
      依存: T5
      AC: AC10, AC12, AC21, AC24, AC26, AC34
      点検: あり
- [x] T7: 起動確認: `handoffSmoke.ts` に 1 段。入れ替えの前に、ビルドした `sodactl display set` で面を出し、`sodactl display events` を子プロセスで待たせる → 実物の `soda handoff` → `events` が終わらずに `display.reset` の行を出す → `display list` が空 → `set` で出し直すと `list` に出る →
      出し直した面を `display close` すると、待ち続けている `events` に `display.closed`（`closed`）の行が出る → サーバを止めると、`events` が `display.end`（`connection_closed`）を出して終了コード 1。ログインなし（受け口の経路）で行う。Windows では何もしない
      対象: `packages/server/src/handoffSmoke.ts:145-170`（`runSodactlAsk` の近くに `display` 用の起動）・`299` の段の後 / 根拠: research A16
      依存: T6
      AC: AC24

### PR2: 画面（静的な形式）

- [x] T8: 静的な形式の枠のページ: `frame.html`（既定のスタイル・4 つの `<script src>`）・`sanitize.js`（`self.__sodaDisplaySanitize(root)`。design「静的ページ」の消す要素・消す属性・`a`・`img`・`form` の決まり）・
      `frame.js`（読み込みの最後に、自分の URL の `t`（合い札）を読んで `display-ready` に添える・`display-init` を親から 1 回だけ・port・`ping` に `pong`・`render` の 3 つの形〔**`format` が `text`・`markdown`・`html` でなければ、描かずに `{ type: "rejected", rev }` を返す**。`script-html` を、静的な頁で描かない〕・差し替えの前後でスクロールと欄の値を保つ・フォーカスの持ち越しは `document.hasFocus()` のときだけ・`click` と `submit` の拾い方〔`submit` は必ず `preventDefault()`〕・`Esc` と `relayKeys` のキーの取り次ぎ・`focus`・壊れた中身は `<pre>`）。
      `sanitize.js` の単体テスト（`?raw` で読み込んで評価。消える要素と属性・`javascript:` と `data:` のリンクが外れる・`http(s)` は `_blank`・`data:image/png` の `img` は残り外の `src` は外れる・`form` の `action` が消える・`autofocus` が消える・SVG の `a` と SMIL が消える）
      対象: `packages/web/public/display-view/frame.html`・`frame.js`・`sanitize.js`（新規）、`packages/web/src/display/displayViewSanitize.test.ts`（新規） / 根拠: research A8（手本は `packages/web/public/ask-view/markdown.js:37`・`keys.js`・`links.js`。読み込むだけ）、テストの型は `packages/web/src/ask/askViewLinks.test.ts:1`
      依存: T1
      AC: AC6, AC11, AC16, AC17, AC19
      点検: あり
- [x] T9: 静的な形式のページの配信: `HttpServer.handle` に `/display-view/` の経路（許可リスト `frame.html`・`frame.js`・`sanitize.js`。GET・HEAD だけ。`frame.html` は design の `DISPLAY_VIEW_CSP` と `X-Frame-Options: SAMEORIGIN`、`.js` は CSP と `X-Frame-Options` を外す）。`DISPLAY_VIEW_CSP` を export。
      統合テスト（ヘッダが design の文字列と一致・**全体に `allow-same-origin` が無い・`script-src` の指定が `'self'` だけ**・許可リストの外と `/display-view/` は 404・POST は 405・**アプリ本体と `/ask-view/*` のヘッダが変わっていない**）。テストは、一時の配布フォルダにファイルを自分で書いて用意する（`HttpServer.integration.test.ts:154-156` と同じ）
      対象: `packages/server/src/http/HttpServer.ts:49-52`・`132`・`137-160`、`packages/server/src/http/HttpServer.integration.test.ts:149` の後 / 根拠: research A7
      依存: なし
      AC: AC15, AC16, AC17
      点検: あり
- [x] T10: web の状態と通信: `useDisplayStore`（`infos`・`contents`・`collapsed`・`activePanel`・`focusedDisplayId`・`panelsOf`・`bandsOf`。幅の保存は T15）、`DisplayController`（`onOpened` で `display.subscribe {features:["panel","band","actions"]}`・`onClosed`・`resetForMachineSwitch`・`onEvent`・
      `ensureContent`〔`display.get` を `offset` を進めて繰り返し、片を積んで最後に 1 回だけ文字列にする・同じ id は 1 本・途中で `rev` が変わったら最初から・古い世代を捨てる・`display_closed` は消えた扱い〕・`sendAction`〔毎秒 20 回で捨てる〕・`dismiss`・`report`。古いサーバ〔`not_found`〕では何もしない）、
      `display.removed` の理由が `navigated`・`unresponsive` のときのトースト（design の 2 つの文言。自分が `report` した画面でも、ほかの画面でも 1 回だけ）、**`report` は、`sendAction` の頻度の制限と別にして、捨てない。引数に、描いていた枠の `paneId` と `format` を添える**（PR1 のサーバが知らない項目を拒むかを確かめ、拒むなら、`/ws` の `display.report` の schema に、任意の `paneId`・`format` を足す。
      あわせて、**返事が `invalid_params` なら `{id, problem}` だけで 1 回送り直す**＝既に入っている古いサーバを、新しい画面で見る組み合わせのため。受け口には無い操作）、`StoreAdapter` の case とコールバック `onDisplayEvent`、`main.ts` の配線、`injection.ts` のキー `DisplayControllerKey`。単体テスト
      対象: `packages/web/src/store/display.ts`（新規）、`packages/web/src/display/DisplayController.ts`（新規）、各 `.test.ts`、`packages/web/src/store/StoreAdapter.ts:51`・`200-202`、`packages/web/src/main.ts:133`・`198`・`298-299`・`398`・`519`、`packages/web/src/injection.ts` / 根拠: research A11（手本は `packages/web/src/ask/AskController.ts`・`ask/mediaUrl.ts` の小分けの取得）
      依存: T2
      AC: AC1, AC3, AC22, AC34, AC36
- [x] T11: web の枠の部品（静的な形式）: `frameMessages.ts`（`readFrameMessage`・型 `FrameMessage`。`rendered`・`rejected`・`action`・`key`・`pong` の 5 つ）、`themeVars.ts`（`readThemeVars`）、`frameRegistry.ts`（面の id → `{ focusInside(): void }`）、
      `DisplayFrame.vue`（iframe〔定数 `DISPLAY_VIEW_SANDBOX`・`DISPLAY_VIEW_PAGE` を export。`data-display-frame` と `data-display-loads`。**`src` に、枠ごとの乱数の合い札 `?t=…` を付ける**〕・`display-ready` を、送り主・状態・**合い札の一致**で 1 回だけ受ける・
      **`MessageChannel` と `render` を渡すのは、最初の `load` を見た後**（合図が先なら `load` を待つ。中身がストアにあっても、先に送らない）・**その iframe の窓から届いた**合い札の合わない合図・10 秒の時間切れは、通り道も中身も渡さずに固定の文言（**`report` は送らない**）・**送り主の窓が違う合図は、丸ごと無視**（待ちを打ち切らない）・合い札の合う合図も 2 回目は受けない・以後は port だけ・`render` を中身と `rev` の変化で送る〔`relayKeys` は prefix を `chordToKeyInput` で変えたもの〕・
      `action` を `DisplayController.sendAction` へ・`key` は**フォーカスがその枠にあるときだけ受ける**（`escape` は `focusPaneIfShown`、`prefix` は端末へ戻して `keyInput.injectPrefix()`）・**移ったことは `load` の回数で決める**（静的な形式は、2 回目の `load` で、iframe を外して `report(id, "navigated")`。`ping` の返事は待たない。どの形式でも同じ決まりで、スクリプトが動く形式の分は T27）・
      **見回り**（2 秒ごとの `ping`。`document.visibilityState === "visible"` の間だけ数え、見えなくなったら止めて、見えたら数え直す。見えている間に 10 秒続けて返事が無ければ、iframe を外して `report(id, "unresponsive")`。見えていない画面は送らない）・10 秒で `display-ready` が来なければ固定の文言・**頁の選択と枠の鍵**（design「枠の鍵と、頁の選択」。H27）: `framePage.ts` の `framePage(format)`（`text`・`markdown`・`html` → `{ page: DISPLAY_VIEW_PAGE, sandbox: DISPLAY_VIEW_SANDBOX, kind: "static" }`、**それ以外は `null`**。PR2 の時点では `script-html` も `null`）を作り、`DisplayFrame` はこれだけで `src` と `sandbox` を決める。
      **`render` を送るのは、`content.id`・`content.rev`・`content.format` が `info` と一致するときだけ**（`render` の `format` は `content.format`。形式・版が替わった直後の、前の中身を送らない）。鍵は `framePage.ts` の `frameKey(info)`（静的な形式は `<id>:<形式>`。**置く側の部品は、必ずこの関数で `:key` を作る**。PR3 で、スクリプトが動く形式の鍵に版が入る）。`relayKeys` は静的な形式の枠にだけ渡す。
      `null` の形式の面は、**枠を作らず**、固定の文言「この画面では、この形式の表示を出せません」（後の版のサーバが `script-html` を配っても、静的な頁に入れない）。`DisplayFrame` を置く側が `:key` を `<id>:<形式>` にする前提で、`DisplayFrame` 自身も、`info.format` が変わったら iframe を作り直す。
      枠が `{ type: "rejected" }` を返したら固定の文言。`DISPLAY_PONG_TIMEOUT_MS` を使わない（protocol から消す）・
      `window` の `blur`/`focus`/`focusin` で「フォーカスがこの枠にあるか」を見て `store.focusedDisplayId` を更新（備え (a) の元）・載っている間は `frameRegistry` に登録・片づけで port を閉じ、フォーカスがその枠にあれば pane の端末へ戻す）。単体テスト（「テスト方針」の `DisplayFrame.vue` の項目に加えて: `load` の 2 回目で `report("navigated")`・見えていない間は見回りを数えない・
      `framePage` の表〔知らない形式と `script-html` は `null`〕・`info.format` が変わると iframe が別の要素になる・`rejected` で固定の文言・**`display-ready` が `load` より先でも、`load` の前には `display-init`・`render` を送らない**・合い札の違う `display-ready` を受けない（その iframe の窓からなら固定の文言・**別の窓からなら何も起きず、後から来た正しい合図で描ける**）・**正しい合い札の 2 回目の `display-ready` を受けない**・
      中身がストアにある状態で載せても、最初の `load` の後にしか `render` しない・`report` に `paneId` と `format` が付く）
      対象: `packages/web/src/display/frameMessages.ts`・`themeVars.ts`・`frameRegistry.ts`・`framePage.ts`（新規）、`packages/web/src/components/DisplayFrame.vue`（新規）、各 `.test.ts`、`packages/protocol/src/display.ts`（`DISPLAY_PONG_TIMEOUT_MS` を消すだけ）/ 根拠: research A8（手本は `packages/web/src/components/AskViewer.vue` の `onMessage`）、A13、`packages/web/src/actions/paneFocus.ts` の `focusPaneIfShown`、`packages/client-core/src/keys/chord.ts:388`
      依存: T8, T10
      AC: AC2, AC10, AC18, AC19, AC34, AC37, AC-I4, AC-I5
      点検: あり
- [x] T12: パネル・帯の部品（まだ pane には差し込まない。幅のつまみは T15）: `displayLayout.ts`（`panelWidthRange`・`panelWidth`〔`userPx` の引数つき〕・`visibleBands`。純粋）、`PanePanel.vue`（props: `paneId`・`paneWidthPx`・`cellWidthPx`。`role="complementary"`・固定のラベル「pane のプログラムの表示（隔離）· 〈面の名前〉」・題は `textContent`・
      タブ〔`role="tablist"`。矢印・`Home`・`End`〕・たたむ〔`button`。幅 24px の見出しだけ〕・［×］〔`button`。`dismiss {id}`〕・選ばれた面の `DisplayFrame`（**`:key` は `frameKey(info)`**）・載ったときと戻したときに `ensureContent`・**操作中の表示**〔`focusedDisplayId` がその面のとき、縁を 2px の `--soda-accent`・見出しに固定の文言「入力はこの表示に届きます（Esc で端末へ）」〕）、
      `PaneBands.vue`（props: `paneId`・`paneHeightPx`。1 本ごとに固定の印・`DisplayFrame`〔`:key` は `frameKey(info)`〕・［×］・操作中の表示。あふれは「ほか N 件」）。単体テスト（`displayLayout` の境目・タブのキー・ラベルが題で変わらない・［×］とたたむが `button`・操作中の表示の出し入れ）
      対象: `packages/web/src/display/displayLayout.ts`（新規）、`packages/web/src/components/PanePanel.vue`・`PaneBands.vue`（新規）、各 `.test.ts` / 根拠: research R3・R8、design「ブラウザ」
      依存: T11
      AC: AC5, AC7, AC8, AC25, AC33, AC-I1, AC-I2
- [x] T13: pane への差し込みと、まとめて閉じる: `PaneFrame.vue`（`enabled` のときだけ: `.pane-frame-body` を縦の flex にし、`PaneBands` と、`.pane-frame-row` の中の `.pane-frame-main`〔この中に `<slot />`〕・`PanePanel`。葉の CSS には触らない。
      pane の幅・高さは、`.pane-frame-body` に張った `ResizeObserver` で測って部品へ渡す。セルの幅は、その pane の端末から `getCellSize`〔`packages/web/src/term/measure.ts:30`〕で取り、取れなければ 9。**その pane のどれかの面にフォーカスがある間、`.pane-frame-main` を `opacity: 0.55` にする**）、
      右クリックのメニュー「表示をすべて閉じる」（面があるときだけ）と `ActionDispatcher.dismissDisplays(paneId)`。単体テスト（`enabled=false` で何も描かない・面が無ければ DOM が今までと同じ・既存の `PaneFrame.test.ts`・`PaneLayout.test.ts` が通る）
      対象: `packages/web/src/components/PaneFrame.vue:305`・`478`、`packages/web/src/components/PaneFrame.test.ts`、`packages/web/src/components/ContextMenu.vue:61-70`、`packages/web/src/actions/ActionDispatcher.ts` / 根拠: research A9・A12、R3
      依存: T12
      AC: AC4, AC8, AC33
- [x] T14: 最初の E2E と helper（不確かな点 1・2）: helper `support/display.ts`（`runDisplay(appServer, paneId, args, { stdin?, login? })`: ビルドした sodactl を `["display", …]` で子プロセスに。ログインなしはテストのサーバの `SODA_PANE_SOCKET` を渡す。走らせた人の環境の値を消す。出し続けるコマンド用に `nextLine()`。
      CDP でブラウザが送った `display.action`・`display.report` を数える `watchSentDisplay(page)`。別の origin の待ち受けを立てる `startSink()`〔`127.0.0.1` の空きポート。届いた要求を記録する〕）。spec の最初の筋: ログインなしの `set --kind panel` と `--kind band` で、枠の中に中身が出る・パネルの箱が端末の箱の右・帯の箱が端末の箱の上・
      枠の `sandbox` 属性が `DISPLAY_VIEW_SANDBOX`。あわせて、(a) 中身が port 経由で届いている、(b) `frame.evaluate(() => 1 + 1)` が枠の文書の中で動くか、を確かめ、結果を `decisions.md` に 1 行残す
      対象: `packages/e2e/src/support/display.ts`（新規。手本は `packages/e2e/src/support/ask.ts:54`・`askSent.ts`）、`packages/e2e/src/specs/display.spec.ts`（新規）/ 根拠: research A15
      依存: T5, T9, T13
      AC: AC1
- [x] T15: パネルの幅のつまみ（design「パネルの幅のつまみ」）: `PanePanel.vue` の左の縁に `div.pane-panel-resize.resize-handle.resize-handle-x`（`role="separator"`・`aria-orientation`・`aria-label`・`aria-valuenow/min/max`・`tabindex="0"`。たたんでいる間は出さない）、`useResizeDrag`（`begin`・`move` は案内の線だけ・`commit` で確定・`cancel`・`reset`）、
      案内の線（`.pane-frame-row` の中。`PaneFrame.vue` に置き場）、ドラッグ中の `iframe.display-frame` の `pointer-events: none`、キーボード（`←`/`→`・`Shift`・`Home`・`End`・`Enter`。`keydown` を端末へ流さない）、
      `useDisplayStore` の `panelWidths`・`setPanelWidth`・`clearPanelWidth`（`soda.prefs.v1` の `displayPanelWidths`。64 件まで・無い pane の分を捨てる・壊れた値を捨てる）、`DEVICE_LOCAL_PREF_KEYS` に `displayPanelWidths`。
      単体テスト（ドラッグ中は幅が変わらない・確定で 1 回変わる・`Esc`・ダブルクリック・キー・範囲の丸め・保存と読み込み・64 件）と、E2E `display-resize.spec.ts`: つまみをドラッグしている間、`watchClientView` の記録が増えず、離した後に 1 回だけ増えて列数が変わる・`aria-valuenow` とパネルの箱の幅が合う・
      `Esc` で元の幅・ダブルクリックで `--size` の幅・キーボードで同じ・最小 160 と最大（pane の半分・端末 40 列）に止まる・再読み込みの後も幅が残る・`--size` を変えた `set` の後も利用者の幅のまま・2 つ目のブラウザの幅は変わらない・ドラッグ中に打った文字が端末へ漏れない（既存の `resize-handles.spec.ts` の見方）
      対象: `packages/web/src/components/PanePanel.vue`・`PaneFrame.vue`、`packages/web/src/store/display.ts`、`packages/web/src/store/view.ts:168-176`・`718-723` の近く（`readPrefs`・`writePrefs` を使う）、`packages/protocol/src/messages.ts`（`DEVICE_LOCAL_PREF_KEYS`）、各テスト、`packages/e2e/src/specs/display-resize.spec.ts`（新規）
      / 根拠: `packages/web/src/composables/useResizeDrag.ts`、`packages/web/src/styles/resizeHandle.css`、`packages/web/src/components/Sidebar.vue:635-682`・`1011-1020`（手本）、`packages/e2e/src/specs/resize-handles.spec.ts`
      依存: T14
      AC: AC35, AC25, AC-I3, AC-I4
- [x] T16: キーの操作とフォーカス: `ACTIONS` に `focus_display`（既定 `prefix+i`。`group: "pane"`・`action: { type: "focusDisplay" }`）、`keys/actions.ts` の種類、web の `ActionDispatcher`（フォーカス中の pane の、選ばれているパネル〔たたんであれば戻して、描かれるのを待つ〕。パネルが無ければ最初の帯。その面の id で `frameRegistry.focusFrame(id)`。面が無ければトースト「この pane に表示はありません」）、
      端末版は「ブラウザで使えます」の知らせ（`openGraph` と同じ形）。既存のキーの検査（`bindings.test.ts`・`presets.test.ts`・`keymap.test.ts`）が通ること。`prefix+i` は利用者が決めた値（D23）なので、衝突が見つかったら、変えずに `decisions.md` に書いて報告する
      対象: `packages/client-core/src/keys/bindings.ts:79-86` の近く、`packages/client-core/src/keys/actions.ts:94` の近く、`packages/web/src/actions/ActionDispatcher.ts:264` の近く、`packages/tui/src/actions/TuiDispatcher.ts:257` の近く、各テスト / 根拠: research A13
      依存: T13
      AC: AC-I3, AC-I4
- [x] T17: モバイル: `MobileShell.vue` に、`.mobile-shell-bar` と `.mobile-shell-pane` の間の `PaneBands`（フォーカス中の pane の分）と、バーのボタン（パネルがあるときだけ。「表示」と件数）。`MobileDisplaySheet.vue`（`<dialog>`。固定のラベル・タブ・［閉じる］でシートだけ閉じる・［この表示を消す］で `dismiss`・`DisplayFrame`〔`:key` は `frameKey(info)`〕。幅のつまみは出さない）。
      パネルを出しても `.mobile-shell-pane` の箱が変わらないこと。単体テスト
      対象: `packages/web/src/mobile/MobileShell.vue:81`・`94`、`packages/web/src/mobile/MobileDisplaySheet.vue`（新規）と `.test.ts` / 根拠: research A10、R3
      依存: T13
      AC: AC9
- [x] T18: E2E（出す・更新する・閉じる・操作）。`display.spec.ts` に足す:
      (2) 同じ名前の `set` で中身が替わり、枠の要素が同じ（`data-display-loads` が 1 のまま）・スクロールと入力途中の欄の値が残る・`rev` が増える。2 回目の `set` は、標準入力と `--format html` で渡す、
      (3) パネルを出すとブラウザが送る `client.view` の列数が減り、サーバの PTY の列数も減る。たたむ・閉じると戻る。端末の箱とパネルの箱が重ならない、(4) パネル 2 つでタブ・帯 2 本で縦積み、
      (5) `text` の `<b>` が文字のまま・`markdown` が整形され mermaid はコードのまま・`html` の CSS が効く・`http(s)` のリンクは `target=_blank` で、ほかのリンクは `href` が無い、(6) 固定のラベルが、題に HTML や似た文言を書いても変わらない、
      (7) ［×］で消えて `events` に `dismissed`・右クリックの「表示をすべて閉じる」・フォーカスが枠の中にある面を閉じると、フォーカスがその pane の端末へ戻り、続けて打ったキーが pane に届く、
      (8) ボタンで `wait` と `set --wait` が 1 行出して終わる・**フォームの送信で値が届き（不確かな点 3）、枠が移らず、外への要求が無い**・**`markdown` の中の `<button data-soda-action>` も届く（不確かな点 4）**、
      (9) 2 つのブラウザ: 両方に出る・どちらで押しても 1 件・古い中身の画面で押すと古い `rev`、(10) 画面が無いとき `set` の `renderers` が 0 で、後から開くと出る・`--features` の数、(11) `close`・`--all`・`--ttl-ms`・pane を閉じると消える。無い名前の `close` は `closed: []`、
      (12) 幅の丸め（狭い pane で半分まで・40 列を下回ると自動でたたむ）と帯の「ほか N 件」、(13) キーボード: `prefix+i` で枠へ → `Tab` → `Enter` で操作が届く → `Esc` で端末へ戻り、続けて打ったキーが pane に届く。枠の中で prefix を押すと端末へ戻って prefix の状態になる。タブを矢印で切り替える。見出しの［×］・たたむに `Tab` で届き、`Enter` で効く。
      **枠にフォーカスがある間、縁の色・文言・端末の `opacity` が変わり、戻ると元に戻る**（計算済みのスタイル）、(14) 面を出した状態で既存の操作が動く: 枠の上でホイールを回すと枠の中がスクロールし、端末のスクロール位置は変わらない・分割の境をドラッグすると `client.view` が変わる・拡大（zoom）してもパネルが出ている・コピーモードに入れる、
      (15) 2 MiB ちょうどの `html`（末尾に印の要素）が出て、末尾の印が枠の中に見える
      対象: `packages/e2e/src/specs/display.spec.ts`（T14 のファイル）、`packages/e2e/src/support/display.ts`、`packages/e2e/src/support/panes.ts` / 根拠: research A15
      依存: T6, T14, T16
      AC: AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC10, AC11, AC12, AC13, AC20, AC22, AC25, AC33, AC36, AC-I1, AC-I2, AC-I3, AC-I4, AC-I5
- [ ] T19: E2E（静的な形式の隔離）: (1) 枠の `sandbox` 属性と応答ヘッダに `allow-same-origin` が無い。`frame.evaluate` で、`parent.document`・`document.cookie`・`localStorage` が SecurityError、`fetch`・`new WebSocket(アプリの /ws)` が拒否される（使えないと T14 で分かった場合は、不確かな点 2 の代えと、未検証の穴の記録）、
      (2) 中身の `<script>`・`<img src="data:image/png;base64,（壊れた値）" onerror=…>`（操作なしで起きる形）・`<button onclick>`（押す）・`<a href="javascript:…">`（押す）が動かない（枠の文書に実行の印が付かない。`markdown` でも同じ）。通常の版では、CSP の違反が出ることは合否にしない。
      `<script>` の要素は、中身を `DOMParser`・`<template>` を通して差し込むので、守りを外しても実行されない見込み（仕様の理解。実測していない）。負の対照で落ちるのは、イベント属性の筋、
      (3) 外の画像・`<link rel=stylesheet>`・`@import`・`url()` の背景・フォントへの要求が 0（`page.on("request")` と、`startSink()` の待ち受け）、(4) `<meta http-equiv=refresh>`（**宛先は、同じ origin の `/display-view/frame.html?moved`**。必ず移れる宛先にして、T22 (e) の対にする）・`<form action=…>` の送信・`<base>`・`<iframe>`・`<object>`・`<embed>` で枠が移らない（`data-display-loads` が 1 のまま・面が閉じられない）・外を読まない（外の宛先のものは、`startSink()` に届かないこと）、
      (5) 親のページに別の iframe を作って、同じ形の `message`（`display-ready`・`action`）を送っても、ブラウザは `display.action` を送らない、
      (6) **枠が移った場合**（H4。不確かな点 7）: Playwright で枠を、同じ origin の `/display-view/frame.html?moved` へ移す（`frame.goto`）。面が閉じ（枠が DOM から外れる）、トーストが出て、ブラウザが `display.report`（`navigated`）を送り、`events` に `display.closed`（`navigated`）が出る。静的な形式なので、冷却には入らない（直後の `html` の `set` が通る）。
      移った先は同じ静的ページなので、読み込みの最後に自分で `display-ready` を送る。親がそれを受けず、中身を渡さないこと（ブラウザが、その後に `display.action` を送らない。移った先に中身を渡さないことそのものは、T11 の単体テスト「2 回目の `display-ready` を受けない」で見る。E2E で枠の中を見る前に枠が外れるため、と spec のコメントに書く）、
      (7) 端末にフォーカスを置いて、`autofocus` つきの中身を `set` → 更新 → もう一度 `set`。その間に打った文字が全部 pane に届き、`document.activeElement` が iframe でない、
      (8) 同じことを、**フォーカスを奪い続ける中身**で行う: 壊れた `data:` の `img` の `onerror` から、`setInterval` で `window.focus()` と欄の `focus()` を 50ms ごとに繰り返す。静的な形式ではイベント属性が動かないので、打った文字が全部 pane に届く（T22 (c3) の対）、
      (9) 既存の `ask-view.spec.ts` が通る、
      (10) **知らない形式**（PR2 の時点では `script-html` も）: テストの接続が、台帳に形式の違う面を作れないので（書き手は厳しい）、ブラウザが受ける `display.updated` を、テストが差し替えて（`routeRecordingWebSocket` で、`format` を `script-html`・`future-x` に書き換える）、
      枠が作られず、固定の文言が出ること・その面の中身を静的な頁に渡さないことを見る。`format` を `html` → 別の値 → `html` と替えると、iframe が別の要素になる
      対象: `packages/e2e/src/specs/display-isolation.spec.ts`（新規。手本は `packages/e2e/src/specs/ask-view.spec.ts`）、`packages/e2e/src/support/frames.ts`（`routeRecordingWebSocket` を使う）
      依存: T18
      AC: AC15, AC16, AC17, AC18, AC19, AC34, AC37
- [ ] T20: E2E（モバイル）: 幅 767px 以下の画面で、パネルを `set` しても端末の横に出ず、バーのボタンから重ね表示が開いて枠の中身が出る。帯は端末の上に出る。パネルの前後で、ブラウザが送る `client.view` の列数が変わらない
      対象: `packages/e2e/src/specs/display-mobile.spec.ts`（新規）
      依存: T14, T17
      AC: AC9
- [ ] T21: 文書（静的な形式と、幅のつまみ）: `docs/display.md`（新規: 使い方と例・中身の 3 つの静的な形式・`data-soda-action` と `data-soda-value` とフォーム・枠の中で使える CSS の変数・行の決まりと行の一覧〔`display.closed` の理由 `navigated` を含む〕・終了コード・どの画面に出るか・モバイル・キーの操作・**幅のつまみ**〔ドラッグ・キーボード・範囲・その画面が覚える・戻し方〕・
      **操作中の表示**・隔離の仕組み・**限界**〔design の「残る限界（どの形式でも）」と、「秘密を面の欄に打たせない」「静的な形式ではスクリプトは動かない」「`soda handoff`・再起動で消える」〕・上限の一覧〔2 MiB・32 MiB・回数と量〕・新旧の表・別のマシン・Windows）、
      `docs/sodactl.md`（コマンド一覧・「サーバ側の上限」〔受け口の 1 行を 4 MiB に〕・「ログイン不要の受け口」の「今載っている操作」と 4 条件の表）、`docs/verification.md`、`docs/tui-parity.md` と `docs/tui.md`、`packages/cli/skills/sodactl/SKILL.md`（例と「機能の問い合わせをしてから使う」）、`AGENTS.md` の案内の 1 行。不確かな点 3・4・9 の結果を、決まった形で書く
      対象: `docs/display.md`（新規）、`docs/sodactl.md:21`・`213`・`718`、`docs/verification.md`、`docs/tui-parity.md`、`docs/tui.md:137` の近く、`packages/cli/skills/sodactl/SKILL.md`、`AGENTS.md`
      依存: T15, T18, T19
      AC: AC27
- [ ] T22: 負の対照（静的な形式。test 工程で消化する）: 次の版（9 つ）で、対応するテストが落ちる（または、二重の守りの片方だけ外した版では**落ちない**）ことを確かめ、戻して通ることも確かめ、生の出力を `test-result.md` に残す。
      (a) 受け口の `displayCloseOp`・`displayListOp`・`displayWaitOp` が、引数の `paneId`（schema にも足す）を対象にする版 → T4 の「引数に `paneId: <B>` を載せて送っても B に届かない」が落ちる、
      (b) `DISPLAY_VIEW_SANDBOX` と `DISPLAY_VIEW_CSP` の両方に `allow-same-origin` を足した版 → T19 (1) が落ちる、
      (c1) `sanitize.js` の `script`・`on*` の取り除きだけを外した版（`autofocus` の取り除きは残す）→ T19 (2)・(8) は**落ちない**（CSP が止める）。このとき、枠のコンソールに CSP の違反が記録されることを確かめる、
      (c2) `DISPLAY_VIEW_CSP` の `script-src` に `'unsafe-inline'` を足しただけの版 → T19 (2)・(8) は**落ちない**、(c3) c1 と c2 の両方 → T19 (2) のイベント属性の筋と (8) が落ちる、
      (d) `DisplayFrame.vue` の送り主の検査（`ev.source`）・「`display-ready` は 1 回だけ」・port を外し、`window` の `message` をそのまま受ける版 → T19 (5) の「送られない」と、T11 の単体（別の窓からの `message`・正しい合い札の 2 回目の `display-ready` を受けない）が落ちる、
      (e) `sanitize.js` の `meta` の取り除きを外した版 → T19 (4) の「枠が移らない」が落ちる（同じ origin の宛先へ移り、面が `navigated` で閉じる）、
      (f) `DisplayFrame.vue` の、`load` の回数の検知を外した版 → T19 (6) の「すぐ閉じて、理由が `navigated`」が落ちる（移った先は見回りに返事をしないので、10 秒後に `unresponsive` で閉じる。落ちるのは、閉じるまでの時間と理由の検査）、
      (g0) `framePage()` が、知らない形式を静的な頁へ落とす版（`null` を返さない）→ T19 (10) の「枠が作られない」が落ちる。このとき、`frame.js` が `rejected` を返して中身が描かれないこと（二重の守り）も確かめる
      対象: `packages/server/src/panesocket/displayOps.ts`、`packages/web/src/components/DisplayFrame.vue`、`packages/server/src/http/HttpServer.ts`（`DISPLAY_VIEW_CSP`）、`packages/web/public/display-view/sanitize.js`、`.aidev/works/20261007-soda-extensions/test-result.md`
      依存: T4, T19
      AC: AC28

### PR3: スクリプトが動く形式（`script-html`）

- [ ] T23: protocol の追加（上の「PR3 で変わる型・定数」の表の全部）: `DISPLAY_SCRIPT_FORMAT = "script-html"` を `DISPLAY_FORMATS` に足す（`DISPLAY_STATIC_FORMATS` と分ける）。`DISPLAY_SEND_MAX_BYTES`・`DISPLAY_SEND_RATE`・`DISPLAY_FOCUS_STEAL_MAX`・`DISPLAY_SCRIPT_COOLDOWN_MS`。`DISPLAY_FEATURES` に `format:script-html`・`send`、`DISPLAY_RENDER_FEATURES` に `script-html`、`DisplayRenderers.scriptHtml`、`DisplayLimits.sendBytes`、
      閉じた理由に `focus_steal`、`display.action` の出来事に `source`。`/ws` の方式 `display.send`（`{paneId, name, data}`）と、受け口の `PANE_OP_DISPLAY_SEND`・`PaneDisplaySendParams`。`display.report` の `problem` に `focus_steal`（結果に `steals?`。引数の任意の `paneId`・`format` が、T10 でまだ入っていなければ、ここで足す）。イベント `display.message`。`checkDisplaySend(data)`（JSON にして 64 KiB 以下）。
      単体テスト（`script-html` が `checkDisplaySet` を通る・`send` のデータの上限のちょうどと超過・受け口の schema が `paneId` を拒否・`parseDisplayLine` が `source` つきの行を通す）。**静的な形式の定数・検査の動きを変えない**（既存のテストがそのまま通る）
      対象: `packages/protocol/src/display.ts`・`display.test.ts`、`packages/protocol/src/messages.ts`、`packages/protocol/src/paneSocket.ts`、`packages/protocol/src/events.ts`、各テスト
      依存: T2
      AC: AC23, AC29, AC31
      点検: あり
- [ ] T24: server の追加: `DisplayService.send`（面があるか・`script-html` か・64 KiB・pane の `send` の桶・bus に `display.message`・保存しない・`delivered`）、出来事の `source`（面の形式から。静的な面の操作にも付ける）、`renderers().scriptHtml`、`features()` の値、
      **pane ごとの取られた回数と冷却**（design「取られた回数と冷却」のとおり。`report` の `focus_steal` は、面を閉じずに pane の回数を 1 増やす〔`script-html` の面だけ。ほかは `invalid_params`〕・
      **`report` は頻度で捨てない**（操作の桶と分ける）・**面がもう無い・形式が替わっている場合も、知らせに添えられた `paneId`・`format` で、その pane に数える**（pane が無ければ `not_found`。面が残っていて pane が違えば `invalid_params`。サーバの側に、閉じた面の控えは持たない）・
      冷却に入るのは「3 回に達した」と「形式が `script-html` の枠について `navigated` が来た」の 2 つだけ・**冷却に入るとき、その pane の `script-html` の面を全部閉じる**・冷却の間は、その pane の `script-html` の `set`〔同じ名前の置き換えを含む〕を `display_busy` で断り、既にある面は変えない・静的な形式は出せる・回数は、冷却が明けたとき・pane が閉じたときだけ 0 に戻る・
      回数は、面の id・名前・接続・`close`→`set` に依らない・冷却中の知らせで延びない。時計は差し替えられる）。受け口の `displaySendOp`（`ctx.paneId` だけ）と `/ws` の `display.send`、`composeServer.ts` の `register`。ログに `send` のデータを書かない。
      単体テスト（「テスト方針」の server の PR3 の項目の全部。**冷却が 5 分の 1 ミリ秒前は断り、5 分ちょうどで通る**・静的な形式の `set`・`report` で冷却が延びない／入らない・冷却中の同じ名前の置き換え・
      **操作の桶を空にした直後の `report` が数えられる**・**`close` した直後／`html` に置き換えた直後の id への `focus_steal`・`navigated` が、添えられた `paneId`・`format` で数えられる**（何分後でも・その間に `set`→`close` を何百回はさんでも同じ。`paneId` の無い古い形の知らせで面が無ければ `display_closed`）・冷却中の pane の静的な面への `navigated` は、その面を閉じる（回数と冷却は変えない）・`paneId`・`format` を省いた知らせは、面があれば面の値を使う・同じ id が `html` に置き換わった後の、`format: script-html` つきの `navigated` は、いまの面を閉じずに冷却に入る・数えるものの無い知らせは `{closed: []}`・
      `navigated` で冷却に入ると、同じ pane のほかの `script-html` の面も閉じる・冷却が明けた直後に数え直しても、明ける前の 5 分に取れた回数は 3 を超えない）と、
      結合テスト（受け口からログインなしで `script-html` を `set` → `send` → 名乗った `/ws` の接続に `display.message` が届く・**pane A を名乗って pane B の面へ `send` できない（引数に `paneId` を載せても）**・静的な形式の面への `send` は `invalid_params`・64 KiB 超は誤り・
      **`report("focus_steal")` を 2 回 → 受け口から `close` → `set`（面の id が変わる）→ もう 1 回の `report` で、面が閉じ、`display.closed`〔`focus_steal`〕が `wait` に出て、直後の `script-html` の `set` は `display_busy`、`html` の `set` は通る**・2 つの接続から 1 回ずつ＋もう 1 回でも同じ・
      `action` の出来事に `source` が付く・`script-html` を名乗らない接続だけのとき `delivered` と `renderers.scriptHtml` が 0）
      対象: `packages/server/src/display/DisplayService.ts`・`.test.ts`、`packages/server/src/panesocket/displayOps.ts`、`packages/server/src/surface/methods/display.ts`、`packages/server/src/composeServer.ts:350-352` の近く、`packages/server/src/display/display.integration.test.ts`
      依存: T4, T23
      AC: AC14, AC29, AC31, AC32, AC34
      点検: あり
- [ ] T25: sodactl の追加: `--script-html-file <パス>` と `--format script-html`、`display send <名前> (--json <JSON> | < 標準入力)`（どちらか 1 つ・JSON として読めない・64 KiB 超は使い方の誤り。結果は `{"status":"ok","delivered":n}`）。`script-html` の `set` と `send` は、送る前に `display.features` を見て、`format:script-html`・`send` が無ければ `unsupported`（終了コード 0）。
      冷却で断られた `set`（`display_busy`）は、終了コード 1 で、理由の文をそのまま出す。`USAGE_LINES`・`Command`・`parseCommand`・`main.ts`・SKILL.md。単体テストと、結合テスト（実サーバ: ログインなしで `--script-html-file` の `set` → `send` → `/ws` の接続に `display.message`・`/ws` の経路でも同じ・`events` の `display.action` の行に `source`）
      対象: `packages/cli/src/cliArgs.ts`、`packages/cli/src/main.ts`、`packages/cli/src/commands/display.ts`・`display.test.ts`、`packages/cli/src/display.integration.test.ts`、`packages/cli/src/cliArgs.test.ts`、`packages/cli/skills/sodactl/SKILL.md`
      依存: T6, T24
      AC: AC29, AC36
- [ ] T26: 土台のページと配信: `script.html`（`<meta charset>` と、**頁の中に直に書いた土台のスクリプト 1 つ**。別の `.js` にしない＝CSP の `script-src` に `'self'` を付けないため）。土台は、design「スクリプトが動く形式」の「枠と静的ページ」1〜6 と `window.soda`:
      読み込みの最後に、自分の URL の合い札 `t` を添えて `display-ready`・`display-init` は親から 1 回だけ・`ping` に `pong`・最初の `render` で、**`format` が `script-html` でなければ描かずに `rejected`**・`script-html` なら、`soda` を置き、`keydown` の取り次ぎ〔`Escape` だけ〕を**先に**付けてから、**中身を DOM に差し込む**（`document.open()`/`document.write()` は使わない。`DOMParser` で解釈して `head`・`body` の子を順に移し、`<script>` は同じ属性と中身で作り直して、文書の順に入れる）・
      差し込み終えたら `DOMContentLoaded` と `load` を 1 回ずつ起こす・`rendered`・2 回目以降の `render` は無視・`message`・`scroll`・`focus`。単体テストに、差し込みの順（インラインのスクリプトが文書の順に動く・`head` の `<style>` が効く・`DOMContentLoaded`/`load` の受け手が呼ばれる）を足す。
      `HttpServer` の許可リストに `script.html`（`DISPLAY_SCRIPT_VIEW_CSP`〔`script-src 'unsafe-inline' 'unsafe-eval'`。`'self'` なし。`webrtc 'block'`〕・`DISPLAY_SCRIPT_VIEW_PERMISSIONS`〔`picture-in-picture=()`・`focus-without-user-activation=()` を含む〕・`X-Frame-Options: SAMEORIGIN`）。定数を export。
      単体テスト（`script.html` を `?raw` で読み、`<script>` の中身を取り出して、偽の `parent` と port で: 親以外の `display-init` を受けない・2 回目を受けない・静的な形式の `render` を拒む・`soda.action` が規則の外で `false`・`onMessage` の登録と解除・1 つが投げてもほかを呼ぶ・`ping` に `pong`）と、
      統合テスト（`script.html` のヘッダが design の文字列と一致・**`script-src` に `'self'` が無い**・`allow-same-origin`/`allow-forms`/`allow-popups` が無い・`Permissions-Policy` が design の値・**`frame.html` のヘッダが T9 のまま変わっていない**・アプリ本体と `/ask-view/*` も変わっていない）
      対象: `packages/web/public/display-view/script.html`（新規）、`packages/web/src/display/scriptHost.test.ts`（新規）、`packages/server/src/http/HttpServer.ts`（`DISPLAY_VIEW_FILES` の近く）、`packages/server/src/http/HttpServer.integration.test.ts` / 根拠: 手本は `packages/web/public/ask-view/html.js`・`html.html` のヘッダ（research R2）
      依存: T9, T23
      AC: AC29, AC30, AC37
      点検: あり
- [ ] T27: web の追加（頁の選択・覆い・［操作する］・フォーカスの番・印）:
      `framePage.ts` に `script-html` → `{ page: DISPLAY_SCRIPT_VIEW_PAGE, sandbox: DISPLAY_SCRIPT_VIEW_SANDBOX, kind: "script" }` を足す（定数もここから export。**頁と sandbox を決める場所を増やさない**）。
      `focusGuard.ts`（純粋な状態機械: `engaged`・`focused`。「操作中でないのに枠がフォーカスを持つ」に**変わった**ときだけ、「戻す・知らせる」を返す〔取られたままを見回りのたびに数えない〕。`acceptKey(key)` は、操作中の `escape` だけ真。回数で閉じる判断は持たない〔サーバが数える〕。知らせを送れない間だけ、画面の中で数えて 3 回で「この画面の枠を外す」）、
      元の場所の追跡（親の文書の `focusin`。**表示の枠〔どの面のものでも〕・覆い・［操作する］ボタンは覚えない**）、戻し方（覚えた要素へ `focus()`。無い・`body` なら `view.focusedPaneId` の端末。**戻ったかを確かめ**、だめなら `iframe.blur()` してもう 1 回、それでもだめなら、この画面の枠を外して固定の文言と［もう一度出す］）、
      `engageEntry.ts`（操作を始める入口の決まりを 1 か所に: `ENGAGE_ENTRY = "button"`。［操作する］をポインタで押したら `click` で、`Enter`/`Space`・`prefix+i` なら、そのキーの `keyup` を親が受けてから始める。覆い・枠を押しても始めない〔覆いを押したら、［操作する］を 1 秒強調〕。
      案 A〔覆いを押して始める〕へ差し替えるときは、このファイルだけを変える、とコメントに書く）、
      `DisplayFrame.vue` の `script-html` の分岐（`data-display-script`。`tabindex="-1"`。`render` は 1 回だけで、`rev` が変わったら枠を作り直す。**覆い** `div.display-frame-cover`・覆いの上の `wheel` を port の `scroll` へ・枠でない要素への `focusin` で操作中を解いて覆いを戻す・
      **`load` の 2 回目は、必ず `report(id, "navigated")`**（T11 の静的な形式と同じ決まり。「初めの窓」のような、枠の知らせで決まる例外を置かない）・`frameKey(info)` に、スクリプトが動く形式の鍵 `<id>:script-html:<rev>` を足す（置く側の 3 つの部品は、T12・T17 で `frameKey(info)` を使っているので、版が替わったら部品ごと——覆い・操作中の状態も——作り直される）・`render` は、その版の中身が届いたときに 1 回だけ（T11 の条件のまま）・`relayKeys` は渡さない・
      操作を終える判定は、枠でない要素への `focusin` と、「`document.activeElement` がその iframe でなくなった」（`focusout` と 250ms の見回り）の両方・`report` は捨てない・
      **片づけのとき（面が閉じた・版や形式が替わって部品が外れる）、操作中でないのにフォーカスが枠にあれば、`report(id, "focus_steal")` を 1 回送ってから外す**・合い札の合わない合図・10 秒の時間切れでは `report` を送らない（T11 のまま）・
      横取りを見つけたら、戻して、画面が見えていれば `report(id, "focus_steal")` を 1 回・枠からの `key` は操作中の `escape` だけ受ける・`display.message` を port の `message` へ）、
      **静的な枠へ、よそからフォーカスが来たとき**（design の同じ題の項。`frame.js` に足す: 自分の `window` の `focus` で、直前 500ms に枠の中の `isTrusted` の `pointerdown` も、親からの `focus` の知らせも無ければ、port で `{ type: "foreign-focus" }`。`frameMessages.ts` に、この型を足す。
      `DisplayFrame.vue` は、直前に親の文書で `Tab` を受けていなければ、元の場所へ戻す。回数には数えない。**`frame.js` に足すのは、この知らせだけ**で、静的な形式のほかの動き・CSP・sandbox は変えない）、
      ［操作する］ボタン（`button.display-engage`。`PanePanel.vue` の見出し・`PaneBands.vue` の［×］の左・`MobileDisplaySheet.vue` の見出し。スクリプトが動く面で、操作中でないときだけ出す）と、固定の印「スクリプト」（`--soda-warn-fg`・`title`。`info.format` から決める）、
      `DisplayController`（`subscribe` の `features` に `script-html`・`onMessage`・`display.removed` の理由が `focus_steal` のときのトースト〔design の文言〕）、`frameRegistry` の `focusInside()`（`prefix+i` から。`engageEntry` を通る）。
      単体テスト（片づけのときの横取りの知らせ・`focusGuard` の全部の遷移・追跡が枠を覚えない〔面 2 つが続けて取っても、戻る先は枠でない要素〕・戻せないときの枠の取り外し・`engageEntry`〔`keyup` の前には始まらない〕・覆いの出し入れ・`rev` の変化で作り直す・
      **版の置き換えで、覆いが戻る**〔操作中に同じ形式で `rev` が替わると、部品が作り直され、操作中が解けて、新しい枠は覆いの下〕・**形式の切り替え**〔`html` → `script-html` → `html` で、iframe が毎回別の要素・`src` と `sandbox` が `framePage()` の値・印と覆いと［操作する］が、形式に合わせて付く・外れる〕・`load` が 1 回のままなら閉じない・2 回目は必ず `report`・`render` は id・版・形式が一致したときだけ〔前の形式・前の版の中身を、新しい枠へ送らない〕・`report` が `sendAction` の制限に掛からない・印が題で消えない・静的な形式の面には覆いも印も［操作する］も出ない）
      対象: `packages/web/src/display/framePage.ts`・`.test.ts`、`packages/web/public/display-view/frame.js`（`foreign-focus` の知らせだけ）、`packages/web/src/display/frameMessages.ts`、`packages/web/src/display/focusGuard.ts`・`engageEntry.ts`（新規）と各 `.test.ts`、`packages/web/src/components/DisplayFrame.vue`・`.test.ts`、`packages/web/src/display/DisplayController.ts`・`.test.ts`、`packages/web/src/display/frameRegistry.ts`、`packages/web/src/components/PanePanel.vue`・`PaneBands.vue`、`packages/web/src/mobile/MobileDisplaySheet.vue`
      依存: T13, T16, T17, T26
      AC: AC31, AC32, AC33, AC34, AC37, AC-I3, AC-I4
      点検: あり
- [ ] T28: E2E（スクリプトが動く形式）。`display-script.spec.ts`:
      (1) `--script-html-file` の中身のインラインのスクリプトが DOM を書き換え、`eval` が動く。`window.soda` がある（不確かな点 8）。**土台が中身を差し込んだ後も、`data-display-loads` が 1 のまま**（不確かな点 7。合否）。インラインのスクリプトが文書の順に動く・`DOMContentLoaded`/`load` を待つ部品が動く・`<body onload>` が動く（不確かな点 8）。
      操作を始めてからボタンを押すと、`soda.action("pick", {id:"3"})` が `wait` に `display.action`（`source: "script"`）の 1 行で届く。静的な `html` の面の操作は `source: "static"`。`soda.action` に規則の外の名前を渡すと `false` で、何も届かない、
      (2) `sodactl display send` のデータが `soda.onMessage` に届いて DOM に出る。**枠が作り直されていない**（iframe が同じ要素・スクリプトが持つカウンタが続いている）。同じ名前の `set` では作り直される。2 つのブラウザの両方に届く、
      (3) 固定の印「スクリプト」が枠の外にあり、題・中身に何を書いても消えない。静的な形式の面には無い。`--features` の `renderers.scriptHtml` が、ブラウザの数になる、
      (3b) **形式の切り替え**（AC37）: 同じ名前で `html` → `script-html` → `html` と `set` する。そのたびに、iframe が別の要素（前の要素は DOM に無い）・`src` が `frame.html`／`script.html`・`sandbox` 属性がその形式の値・印「スクリプト」と［操作する］が付く／外れる。
      `script-html` のときはスクリプトが動き、`html` に戻した後は、同じ中身の `<script>`・`onerror` が動かない（実行の印が付かない）。操作中に形式を替えると、操作中が解けて端末へ戻る。
      **前の中身が、新しい形式の枠で動かない**: `html` の面（中身に、印を付ける `<img onerror>`）を出しておき、ブラウザの `display.get` の応答をテストが 2 秒遅らせた状態（`routeRecordingWebSocket`）で、同じ名前を `script-html`（別の中身）に替える。遅らせている間、新しい枠（`script.html`）の中は空で、前の `html` の中身の印が付かない。
      応答が届いたら、新しい中身だけが動く。同じ形式（`script-html`）で版だけ替えたときも、前の版の中身が、新しい枠でもう 1 回動かない。**操作中に版を替えると、操作中が解け、新しい枠は覆いの下**（［操作する］が出ている）、
      (4) **隔離（合否）**: 中身のスクリプトに探りを書き、結果を枠の DOM に書かせて読む（操作は要らない）: `parent.document`・`top.document`・`document.cookie`・`localStorage`・`sessionStorage`・`indexedDB.open`・同じ pane の別の面の枠（`parent.frames[i].document`）が例外。`fetch`・XHR・`new WebSocket(アプリの /ws)`・`new WebSocket(待ち受け)`・`new Image().src = 待ち受け`・
      `<link rel=stylesheet href=待ち受け>`・`<script src=待ち受け>`・**`<script src="/display-view/frame.js">`（同じ origin。`'self'` を外したので読めない）**・`@font-face` の外の URL・`new EventSource(待ち受け)`・フォームの送信・`window.open`・`<a target="_blank">` の `click()`・`alert`/`confirm`/`prompt`・`<a download>` の `click()`・`new Worker(blob)`・`navigator.serviceWorker.register`・
      `top.location = …`（アプリのページ全体を移す）が、例外になるか、何も起きない（アプリのページの URL が変わらない）。`page.on("request")` と `startSink()` に、外への要求が 0。別の面の枠へ `postMessage` しても、その面の `display.action` にならない。
      **design の表「できない見込み」の項目を、1 つずつ全部探る**（探れなかった項目は、T29 の文書の表から外すか「未確認」と書く）。
      **実測の一覧（合否にしない。ブラウザの名前と版つきで `test-result.md` に書き、T29 の文書は、その結果で書く）**: `RTCPeerConnection` を作って、待ち受けを STUN の宛先にしたとき、要求が届くか／`history.back()`・`history.go(-1)`・`history.pushState` で、アプリのページの URL・履歴が動くか／
      `<link rel="dns-prefetch|preconnect|prefetch" href=待ち受け>` で、待ち受けに接続が来るか／`document.execCommand("copy")`・`navigator.clipboard.writeText` が、操作を始めた後（利用者の操作の後）に通るか／音（`AudioContext`・`<audio>` の `data:`）が、操作の前・後に鳴らせるか／`requestPictureInPicture`・`requestFullscreen`／
      `window.name` に入れた文字が、移った先（同じ origin の静的ページ）で読めるか／兄弟の面の枠へ `postMessage` が届くか（兄弟の中身のスクリプトが受け取れるか）・`MessagePort` を渡せるか・`parent.frames[i].location` を書き換えられるか／`focus-without-user-activation=()` で `focus()` 自体が止まるか、
      (5) **フォーカスの番**（不確かな点 5）: 端末にフォーカスを置く。読み込みの直後から 50ms ごとに `window.focus()` と欄の `focus()` を呼ぶ中身を `set` する。**その pane で合計 3 回**取った時点で、その pane のスクリプトが動く面が閉じ（枠が外れる）、トーストが出て、`events` に `display.closed`（`focus_steal`）が出る。閉じた後に打ったキーは、全部 pane に届く。
      直後の `script-html` の `set` は誤り（冷却）で、`html` の `set` は通る。合否の筋:
      (i) **2 回取って止まる中身 → `close` → 同じ中身を `set`（面の id が変わる）→ 1 回目で閉じて冷却**（回数が戻らない）、(ii) 別の名前の面 2 つ（1 回と 2 回）でも、合計 3 回で両方閉じる、(iii) 2 回取った後に**画面を再読み込み**しても、次の 1 回で閉じる、(iv) 2 回取った後に、利用者が操作を始めて終えても、次の 1 回で閉じる、
      (v) **4 秒おきに 1 回ずつ取る中身でも、3 回目で閉じる**（時間で数え直さない）、(vi) **別の pane の端末にフォーカスを置いた状態で取られたら、フォーカスはその別の pane の端末へ戻る**（打ったキーが、別の pane に届く）、(vii) 面 2 つが交互に取っても、戻る先は端末（枠どうしで回らない）、
      (viii) **枠の通り道を直に使う**: 中身のスクリプトが `MessagePort.prototype.postMessage` を差し替えて、土台の port を拾う（土台が次に `pong` を返したときに `this` を取る）。その port で、フォーカスを取った直後（`focused` だが操作中でない間）に `{ type: "key", key: "prefix" }`・`{ type: "key", key: "escape" }` を直に送っても、
      フォーカスが面の pane の端末へ動かず、prefix の状態にならない（port を拾えなかった場合は、その旨を記録し、`dispatchEvent` で作った `keydown` の筋だけを見る）、(ix) 1 回だけ `focus()` を呼ぶ中身では、元の場所へ戻るだけで、面は閉じない、
      (xi) **兄弟の枠へ `focus()`**（出来る場合。出来なければ記録して、この筋は飛ばす）: スクリプトの面が `parent.frames[i].focus()` で、(a) 同じ pane の静的な面へ移す → フォーカスが元の場所へ戻り、続けて打ったキーが pane に届く（静的な枠の `frame.js` の `foreign-focus`）、(b) 別の pane のスクリプトの面へ移す → 元の場所へ戻り、その面の pane の回数が増える（巻き添え。限界 12 のとおりに動くことの確かめ）、
      (xii) **知らせを落とせない**: 中身のスクリプトが `soda.action` を毎秒 200 回流しながらフォーカスを取っても、3 回で閉じて冷却に入る、(xiii) **閉じる直前の知らせ**: 2 回取った後、スクリプトが `soda.action("bye")` を送り、プログラム（テスト）が `close` した直後に 3 回目を取る → 面はもう無いが、その pane は冷却に入る（直後の `script-html` の `set` が誤り）、
      (x) 操作を終えるために端末を押したとき、枠が自分の `blur` の中で `focus()` を呼び返す中身は、横取りとして数えられ、端末へ戻る。
      **実測（合否にしない）**: `set` から閉じるまでの間にも一定の間隔でキーを打ち、枠へ入ったキーの数（中身のスクリプトが数えて、閉じる前に `soda.action` で報告する）と、pane に届いた数。戻し先が `body` のとき（何もフォーカスしていない状態で取られた）の動き。`test-result.md` に書く（限界 1 の実測。軽いときの下限、と明記）、
      (6) **枠の移動**（不確かな点 6・7。合否は、必ず移れる同じ origin の宛先で見る）: (i) 中身のスクリプトが `location.href = "/display-view/frame.html?moved"` → 面が閉じ、トースト、`display.report`（`navigated`）、`events` に `display.closed`（`navigated`）、直後の `script-html` の `set` は冷却で誤り、
      (ii) `location.href = "/"`（アプリの画面）→ 同じく閉じる（枠の中にアプリの画面が残らない）、(iii) (i) の移った先（同じ静的ページが `display-ready` を送る）に、親が中身を渡さない・`display.action` を送らない、(iv) `<meta http-equiv=refresh>`（同じ宛先）を書いた場合も同じ、
      (v) **正当な重い初期化は閉じない**: 差し込みの中で同期に 2.5 秒掛かるスクリプトと、その後に `setTimeout` で 3 秒ごとに 200ms の処理を続ける中身を `set` し、15 秒たっても面が生きていて、`soda.action` が届く、
      (vi) **裏に回しても閉じない**: 面を出したページを裏に回して（別のタブを前に出す）30 秒置き、戻しても面が生きている。裏の間に `display.report` を送っていない、
      (vii) 面 A のスクリプトが、自分が拾った port（土台の `soda` を覗く・`message` の受け手で拾う、など出来る手で）を兄弟の面 B へ渡してから A を移しても、A は閉じる（渡せなかった場合は、その旨を記録して、この筋は「移したら閉じる」だけを見る）、(viii) **差し込みの最中に移る**: 中身の最初のインラインのスクリプトが `location.href = "/display-view/frame.html?moved"` を呼ぶ → すぐ（10 秒待たずに）閉じて、理由は `navigated`、その pane は冷却（`unresponsive` にならない）。
      **中身がストアに既にある状態**（パネルをたたんで戻す・タブを切り替えて戻す・別の tab へ行って戻る、で枠が作り直される）でも同じ（`render` が最初の `load` の後なので、移動は 2 回目の `load` になる）。後から `document.open(); document.write(…)` し直す中身も、`load` が起きれば閉じる（起きなければ、その旨を記録）、
      (xi) **兄弟の `location` の書き換え**（出来る場合。出来なければ記録して飛ばす）: 面 A のスクリプトが `parent.frames[i].location = "/display-view/frame.html?moved"` で面 B を移す → B が `navigated` で閉じる（B がスクリプトの面なら、B の pane が冷却）。
      **作られた直後の枠を移す**: A が 10ms ごとに `parent.frames` を見回して、新しく出来た枠（テストが、その間に静的な面 C を `set` する）の `location` を、合い札の無い `/display-view/script.html`・`/display-view/frame.html` に書き換える → **C の中身が、移った先に出ない**（結果は、時機で 2 通りあって、どちらも正しい: 最初の `load` より前に移されたら、通り道も中身も渡らず、固定の文言。後に移されたら、2 回目の `load` で C が `navigated` で閉じる）。
      **合い札の使い回し**: スクリプトの面の中身が `location.reload()`（同じ合い札つきの URL を読み直す）を呼ぶ → 読み直した文書に、通り道も中身も渡らず（スクリプトがもう 1 回動かない）、`navigated` で閉じる、
      (ix) **合否にしない実測**: 応答が 204 の宛先（テストの待ち受けと、同じ origin の 204 を返す口があれば）へ `location.href` を書き換える・書き換えた直後に `window.stop()` する → 要求が届くか・`load` が起きるか・面が閉じるかを記録する（気づけない道の実測。限界 3）。
      `location.href = 待ち受けの URL + "?d=secret"`（外の origin）。面が閉じたか・そのままか（枠の文書が生きていて、操作できるか）と、**待ち受けに要求が届いたか**、届いた場合に、枠が外れるまでの間、外のページのスクリプトが動いたか（待ち受けが返すページが、もう 1 回要求を出す）を記録する。
      `location.href = "http://127.0.0.1:<別の待ち受け>/"`（`localhost` の別のサービスに見立てる）でも同じ（限界 3 の「LAN・`localhost` への GET」の実測）、
      (x) 重いスクリプト（`while (Date.now() < t + 15000) {}` を、読み込みの 1 秒後に 1 回）: 枠だけが固まるなら、10 秒ほどで面が閉じて `display.closed`（`unresponsive`）・冷却には入らない。アプリの画面ごと固まるなら、固まったことと、その後の動きを記録する（合否にしない。u7）、
      (7) **操作を始める・操作中**（不確かな点 8・10）: 覆いがある間、枠の中のボタン・覆いを押しても、操作は始まらず、`soda.action` も呼ばれない（［操作する］が強調される）。枠の外の［操作する］を押す・［操作する］に `Tab` で届いて `Enter`・`prefix+i` のどれでも操作中になり、枠の中の欄に打った文字が入る（スクリプトが `soda.action` で報告する）。
      **中身のスクリプトが `window` に置いた `pointerup`・`mouseup`・`touchend`・`keyup` の受け手が、操作を始めた押下・キーでは 1 回も呼ばれない**（3 つの入口のそれぞれで）。その間、縁の色・文言・端末の `opacity` が変わり、［操作する］が消える。
      `Esc` で端末へ戻ると、表示が戻り、覆いと［操作する］が戻る。**フォーカスを受けない場所（パネルの見出しの余白）を押して離れた後に、スクリプトが `focus()` で取り返すと、横取りとして数えられる**（操作中が解けている）。操作中の枠の中で prefix を押しても、アプリの操作にならない。操作中に呼ばれた `focus()` は数えない。覆いの上のホイールで、枠の文書がスクロールする、
      (8) 2 MiB ちょうどの `script-html`（大きなスクリプトを埋め、末尾のスクリプトが印を書く）が**描かれ（末尾の印が出る）、15 秒たっても面が生きている**（`navigated`・`unresponsive` で閉じない・`soda.action` が届く）。2 MiB＋1 バイトは終了コード 2、
      (9) `script-html` を名乗らない画面（テストが、`display.subscribe` の `features` から `script-html` を外した接続を用意できるなら。できなければ T27 の単体テストに任せ、その旨をコメントに書く）では、固定の文言が出て、スクリプトは動かない、
      (10) モバイルの重ね表示でも、覆い・［操作する］・印・操作中が同じに動く、(11) 既存の `display-isolation.spec.ts`（静的な形式）がそのまま通る
      対象: `packages/e2e/src/specs/display-script.spec.ts`（新規）、`packages/e2e/src/support/display.ts`
      依存: T19, T25, T27
      AC: AC29, AC30, AC31, AC32, AC33, AC34, AC36, AC37
- [ ] T29: 文書（スクリプトが動く形式）: `docs/display.md` に節を足す: 使い方（`--script-html-file`・`send`・`soda.action`・`soda.onMessage`・`soda.theme`・ライブラリは中身に埋める・`set` し直すと作り直される・後から `document.write` し直さない・`message` を受けるなら送り主を確かめる）・**静的な形式との使い分け**（信頼できない中身は `html` で出す）・固定の印・
      **操作の始め方**（枠の外の［操作する］か `prefix+i`。枠を押しても始まらない）と操作中の表示・出来事の `source`・**できること・できないこと**（design の表の形で。**「止まる」と書くのは、T28 (4) で確かめた項目だけ**。確かめたブラウザの名前と版を添え、「確かでない」の行は実測の結果で書く。確かめていないブラウザは「未確認」）・
      **3 つの備え**（回数は pane ごとにサーバが数える・3 回で、その pane のスクリプトが動く面を全部閉じて 5 分出せない・入る条件の表）と、**残る限界 1〜12**（design の文面を、利用者向けの言葉で、全部。T28 の実測〔枠へ入ったキーの数・外の origin と `localhost` への移動の要求が届いたか・`focus-without-user-activation` が効いたか〕を添える）・
      誤って閉じられる場合（限界 11）・画面が固まったときの消し方・上限（`send` 64 KiB）・新旧の表の行。`docs/sodactl.md`（コマンド一覧と、受け口の操作に `display.send`）、`docs/verification.md`、SKILL.md（エージェント向け: **外から取ってきた HTML を `script-html` で出さない**・`source: "script"` の操作を利用者の承認として扱わない）
      対象: `docs/display.md`、`docs/sodactl.md`、`docs/verification.md`、`packages/cli/skills/sodactl/SKILL.md`
      依存: T21, T28
      AC: AC27, AC32, AC34
- [ ] T30: 負の対照（スクリプトが動く形式。test 工程で消化する）: 次の版で、対応するテストが落ちることを確かめ、戻して通ることも確かめ、生の出力を `test-result.md` に残す。
      (f) `DISPLAY_SCRIPT_VIEW_SANDBOX` と `DISPLAY_SCRIPT_VIEW_CSP` の両方に `allow-same-origin` を足した版 → T28 (4) の「`parent.document`・Cookie・`localStorage` が例外」が落ちる、
      (g) 覆いを出さず、横取りの検知（「戻す・知らせる」）も外した版 → T28 (5) が落ちる（面が閉じない・キーが枠に入り続ける）、(g1) **横取りの検知だけを外した版**（覆いと［操作する］は残す）→ T28 (5) が落ちる（覆いはポインタを止めるだけで、スクリプトの `focus()` は止めないことの確かめ）、
      (g2) 覆いだけを外した版（検知は残す）→ T28 (7) の「覆いがある間、枠の中のボタンを押しても始まらない」が落ちる、(g3) `engageEntry` が、押した時点（`pointerdown`・`keydown`）で始める版 → T28 (7) の「`pointerup`・`keyup` の受け手が呼ばれない」が落ちる、
      (h) `load` の回数の検知を外した版 → T28 (6) の (i)・(ii)・(vii)・(viii) の「すぐ閉じて、理由が `navigated`、冷却に入る」が落ちる（10 秒後に `unresponsive` で閉じ、冷却に入らない）、(h2) 見回りを、見えていない間も数える版 → T28 (6) (vi) が落ちる（裏に回すと閉じる）、
      (h3) 土台が `document.open(); document.write()` で中身を入れる版 → `load` が 2 回になるブラウザでは、T28 (1) の「`data-display-loads` が 1 のまま」が落ち、正当な中身が全部閉じる（起きないブラウザでは落ちない。その旨を記録。差し込みにした理由の確かめ）、
      (h4) `render` を、形式・版の一致を見ずに送る版 → T28 (3b) の「`html` → `script-html` に替えた直後、前の `html` の中身がスクリプトの頁で動かない」が落ちる、(h5) `report` を `sendAction` の頻度の制限に入れる版（画面）・操作の桶で捨てる版（サーバ）→ T28 (5) (xii) が落ちる、
      (h6) サーバが、面の無い知らせを（添えられた `paneId`・`format` を見ずに）`display_closed` で捨てる版 → T28 (5) (xiii) と T24 の同じ筋が落ちる、
      (h7) 通り道と `render` を、最初の `load` を待たずに渡す版 → T28 (6) (viii) の「中身がストアにある状態で、差し込みの最中に移っても、すぐ `navigated`」が落ちる、(h8) `display-ready` の合い札を確かめない版 → T11 の単体（合い札の違う合図に、通り道を渡さない）が落ちる。E2E の T28 (6) (xi) の「作られた直後の枠を移す」は、時機によって `load` の回数の検知が先に閉じるので、落ちないことがある（その旨を記録）、
      (h9) 「合い札の合う合図も 2 回目は受けない」を外した版 → T28 (6) (xi) の「`location.reload()` で読み直した文書に、中身が渡らない」と T11 の単体が落ちる、(h10) 片づけのときの横取りの知らせを外した版 → T27 の単体（片づけのときの知らせ）が落ちる、
      (i) `script.html` の CSP の `default-src 'none'` を `default-src *` にした版 → T28 (4) の「外への要求が 0」が落ちる、(i2) `script-src` に `'self'` を足した版 → T28 (4) の「同じ origin の `<script src>` が読めない」が落ちる、
      (j) 受け口の `displaySendOp` が引数の `paneId` を対象にする版 → T24 の「pane B の面へ `send` できない」が落ちる、
      (k) 枠からの `key` の知らせを、操作中でなくても受け、`prefix` も受ける版 → T28 (5) (viii) が落ちる、(l) 戻す先を、常に面の pane の端末にする版 → T28 (5) (vi) が落ちる、(l2) 元の場所の追跡が、表示の枠も覚える版 → T28 (5) (vii) が落ちる、
      (m) **サーバが、回数を面の id ごとに数える版** → T28 (5) の (i)・(ii) と、T24 の「`close` → `set` の後の 1 回で閉じる」が落ちる、(m1) **画面のストアで数えて、3 回で `report` する版**（サーバは数えない）→ T28 (5) の (i)・(ii)・(iii)〔再読み込みで戻る〕が落ちる、(m2) 回数を 10 秒で数え直す版 → T28 (5) (v) が落ちる、(m3) 利用者が操作を始めたら回数を 0 に戻す版 → T28 (5) (iv) が落ちる、
      (o) 静的な枠の `foreign-focus` の知らせ（または、親の「戻す」）を外した版 → T28 (5) (xi) の (a) が落ちる（出来ないブラウザでは、この筋ごと飛ばす）、(p) 操作を終える判定から「`activeElement` が iframe でなくなった」を外した版 → T28 (7) の「余白を押した後の取り返しが数えられる」が落ちる、
      (n) 枠の鍵から形式を外した版（`:key` が面の id だけ・`DisplayFrame` が形式の変化で作り直さない）→ T28 (3b) が落ちる（前の形式の iframe が使い回される）。このとき、枠のページの側の「相手の形式を拒む」で、中身が描かれないこと（二重の守り）も確かめる
      対象: `packages/web/src/components/DisplayFrame.vue`、`packages/web/src/display/focusGuard.ts`・`engageEntry.ts`・`framePage.ts`、`packages/server/src/display/DisplayService.ts`、`packages/server/src/http/HttpServer.ts`（`DISPLAY_SCRIPT_VIEW_CSP`）、`packages/server/src/panesocket/displayOps.ts`、`.aidev/works/20261007-soda-extensions/test-result.md`
      依存: T24, T28
      AC: AC28
