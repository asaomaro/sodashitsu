# 調査: ask-form の部品（`<ask-form>`）の取り込み

- 調べた部品: `/workspaces/public_docs/docs/ClaudeCode/skills/other/ask-form/ask-form.js`（890 行。以下 `js:行`）。このフォルダを最後に変えたコミットは `94a5ef68b173a2cf06d1d43f4ab60e33428173f0`、作業ツリーに未コミットの変更なし。public_docs の `main` の HEAD は `29bfd09…`（別のフォルダの変更で進んでいる）。
- 書き方: 根拠は `path:行`。**実測** = scratchpad に置いた一時の確かめ（下の 2 種）で見た結果。**推測**・**未確認** はそう書く。
  - 実測（happy-dom）: `packages/web` の vitest 5.0.1 ＋ happy-dom 20.14.5 で部品を読み込む一時テスト。
  - 実測（Chromium）: `packages/e2e` の Playwright の Chromium（headless・Linux）で、**確かめ用のページ**（いまの `.ask-dialog` と同じ CSS の `<dialog>` ＋ 固定の行 `h2[tabindex=-1]` ＋ `<ask-form>`。Sodashitsu と同じ CSP ヘッダで配る）を開いたもの。**実物の `AskDialog.vue`・実物のサーバではない**。Firefox・Safari・実機は未確認。

## 調査の問い

- Q1 部品の受け渡し・描くもの・キー・フォーカス・ページ分け・安全（通読）。この作業の範囲（`single`・`multi`・`text`）で `Esc` を使う場面
- Q2 いまの `AskDialog.vue` の責務の切り分け／単体テストの環境で部品が動くか
- Q3 E2E のセレクタと操作が、部品の DOM で何に当たるか
- Q4 protocol（`normalizeAskSpec`・`collectAsk`・`checkAskAnswer`）と共通の試験データの形、`paging`・`page` の検査の仕様
- Q5 写す先・読み方（Vite・TypeScript・eslint・テストからの JSON）・スクリプトの先例
- Q6 テーマの変数と部品の変数
- Q7 UI の規範（APG）との突き合わせ・`Alt+PageDown`／`Alt+PageUp`
- Q8 互換（古い画面・古い sodactl）と配布

## 判明した事実

### 部品の受け渡し（Q1）

- **F1 公開の受け渡し**（`AskFormElement`。`js:798-874`）
  - プロパティ: `spec`（get/set。入れるたびに**全部描き直す**＝入力は消える。`js:829-833`・`#render` `js:852-873`）／`busy`（get/set。`js:835-839`）／`resolveMedia`（関数か null。既定 null。`js:809`）／読み取り専用 `value`（`{answers, custom?, edited?, note?, lacking: [id]}`。描いていなければ null。`js:848`・`js:782`）・`pageCount`（`js:849`）・`contentHeight`（`js:850`）。
  - メソッド: `submit()`（`js:842`）・`relayout()`（`js:844`）・`notify(message, warn)`（`js:846`）。**ページを移る公開のメソッドは無い**（`go`・`step` は `mount` の中だけ。`js:584-596`）。
  - 静的: `AskFormElement.version = '1.0.0'`（`js:20,799`）・`AskFormElement.supports = {types, fields}`（`js:21-25,801`）。
  - イベント（どれも `bubbles: true, composed: true`。`js:186,861,868`）: `ask-submit`（detail `{answers, custom?, edited?, note?}`。`custom`・`edited`・`note` は空なら項目ごと無い。`js:698-706,721`）／`ask-cancel`（detail `{}`。［キャンセル］のクリックだけ。`busy` の間は出ない。`js:736`）／`ask-unsupported`（detail `{reason}`。`queueMicrotask` で出す。`js:861,868`）。
  - 登録: ファイルの末尾で `customElements.define('ask-form', …)`（未登録のときだけ。`js:890`）。`export class AskFormElement`（`js:798`）。読み込むだけで登録される（副作用のある ES モジュール）。
- **F2 `spec` に期待する形**: `fixtures/normalize.json` の「正規化後」（`js:7`）。
  - `unsupported(spec)`（`js:877-888`）が理由を返すと描かない: `spec` がオブジェクトでない・`questions` が配列でない／空 →`'spec has no questions'`／質問がオブジェクトでない・`id` が空でない文字列でない／`type` が `TYPES`（`single`・`multi`・`text`・`edit`・`rank`・`table`）に無い／`text`・`edit` 以外で `options` が配列でない・空・`value` が文字列でない選択肢がある／`table` の `rows` が壊れている。**`text` で `options` が配列でないときは、渡された質問のオブジェクトに `q.options = []` を書き込む**（`js:883`）。`label` の有無は見ない。
  - 出せないとき・`mount` が例外を投げたとき（`js:864-870`）: Shadow DOM に「このフォームは、この画面では出せません。」だけを出し、`ask-unsupported` を出す。［決定］［キャンセル］は**描かれない**（取り消しは置いた側）。
  - 読む項目（この作業の範囲）: 全体 `title`（無ければ「質問」。`js:517`）・`intro`（`js:519`）・`submit`（無ければ「決定」。`js:193`）・`note`（`!== false` なら補足欄。`js:552`）・`notePlaceholder`（`js:554`）・`paging`（`js:567,651`）。質問 `id`・`label`・`type`・`help`・`page`・`options[]`（`value`・`label`・`desc`・`recommended === true`・`colors`）・`default`・`allowOther`・`otherLabel`・`otherPlaceholder`・`showIf`・`required`・`multiline`・`placeholder`・`minWidth`。
  - **渡していなくても効くもの**: `filter` が無いと**選択肢が 12 件以上で絞り込みの欄が自動で付く**（`q.filter ?? q.options.length >= 12`。`js:341`）。`showValue` が無いと、**表示名と値が違う選択肢には値が横に出る**（`.key`。`js:307`）。
  - **部品は渡された定義に書き込む**: 選択肢ごとに `o._image`・`o._audio`（`resolveMedia` が無ければ null。`js:276`）。
- **F3 描くもの**（Shadow DOM の直下は `style`・`div.body`・`footer`・`div.lb`。`js:560`）
  - `div.body > div.inner`（スクロールするのは `.body`。`js:40,188,195`）の中に、順に: `h1[tabindex=-1][data-ask-title]`（`js:517`）／`p.intro`（`js:519`）／`nav.steps[aria-label="ページ"]`（1 ページなら `hidden`。`js:536`）／質問ごとの `fieldset[data-ask-question="<質問の id>"]`（`js:540`）／補足 `fieldset[data-ask-note]`（`js:555`）。
  - 質問の枠: `legend`（`span.num`〔通し番号〕＋ `label` ＋ `span.kind`。`kind` は `multi`=「複数選べます」・必須でない `text`=「任意」・`single` は**無し**。`js:514,541-543`）、`p.help`（`js:544`）。未回答の強調は `fieldset.missing`（`js:47,713`）。表示条件で隠れた枠は `hidden` 属性（**DOM には残る**。`js:676`）、ほかのページの枠は class `off`（`js:48,587`）。
  - 選択肢（`js:274-339`）: `div.opts > label.opt > input[type=radio|checkbox][name="<質問の id>"][value="<選択肢の value>"]`＋`span.name`＋（表示名≠値なら）`span.key`＋（おすすめ）`span.badge`「おすすめ」＋`span.desc`＋色の帯 `span.sw > i`（`style.backgroundColor`）。「その他」は `label.opt.other > input[name="<質問の id>"][value="__other__"]`＋`span.name`＋`input[type=text][maxlength=10000][aria-label="<otherLabel か「その他」>の内容"]`（`js:333-338`）。
  - 自由記述: `textarea.clear[name=<id>]` か `input[type=text].clear[name=<id>]`、`maxlength=10000`・`aria-label=<label>`（`js:388-394`）。補足: `textarea.clear[aria-label="補足"][maxlength=10000]`（`js:553`）。
  - `footer`（`js:189-194`）: `span.status[role=status][data-ask-status]`・`button[data-ask-cancel]`「キャンセル」＋`kbd`「Esc」・`button[data-ask-prev][hidden]`「‹ 戻る」・`button.primary[data-ask-next][hidden]`「次へ ›」・`button.primary[data-ask-submit]`（文言は `submit`）＋`kbd`「Ctrl+Enter」。`kbd` は幅 767px 以下で消える（`js:156-157`）。
  - ページの帯: `nav.steps > button[data-ask-page="<1 始まり>"]`（`<b>番号</b>`＋題。今のページは class `cur`・`aria-current="page"`、ほかは `aria-current="false"`。未回答のあるページは class `lack`。`js:576,605-607`）＋`span.pos`「n / m ページ」（`js:611`）。
  - **`div.lb`（画像の拡大表示）は、画像が無くても常に描かれる**（`hidden`。中に `<img alt="">` が 1 つ。`js:211-215,560`）。
  - 状態の行の文言: 「未回答 N 件」「すべて回答済み」（`js:690`）、決定を押して未回答があると「未回答 N 件 — 答えてから決定してください」＋class `warn`（`js:716-717`）。
- **F4 キー**
  - リスナーの場所: `host.addEventListener('keydown', onKey)`（**部品の要素そのもの**・バブル。`js:776`。`destroy` で外す `js:794`）。ほかに Shadow DOM の根に `pointerdown`・`keydown` のキャプチャ（直前の操作 `how` を覚えるだけ。`js:728-729`）、`inner` に `change`・`input`（`js:730-734`）。**部品の外（同じダイアログの固定の行など）にフォーカスがあるときのキーは、部品に届かない**。
  - `onKey`（`js:741-775`）: IME の変換中（`isComposing`・`keyCode 229`）は何もしない。扱ったキーは `preventDefault()`＋`stopPropagation()`（`used()`）。
    - `Ctrl/Cmd+Enter` → `submit()`。
    - `Alt+PageDown`／`Alt+PageUp` → **ページが 1 つでも `used()` する**（ボタンが出ていれば押す。`js:754-758`）。
    - `Esc`: 絞り込みの欄（`input[type=search]`）に文字があるときだけ `used()` して消す（`js:759-763`）。拡大表示の間は `Esc`・`←`・`→`・`Enter` を取る（`js:744-751`。画像が無ければ起きない）。**それ以外の `Esc` は何もしない（外へ流れる）**。
    - `Enter`（絞り込みの欄）→ `preventDefault()` だけ（`js:764`）。
    - `Enter`（`input[type=text]`。**「その他」の欄を含む**。`Shift` は見ない）→ `used()`。［次へ］が出ていれば次のページ、無ければ `submit()`（`js:765-768`）。
    - `Enter`（即確定の形で、「その他」以外のラジオ）→ `used()`・選んで `submit()`（`js:769-774`）。
    - **`Space` を扱う分岐は無い**。
  - 即確定（`js:726-733`）: `instant = 質問が 1 つ && single && spec.note === false`。`change` が来たとき、`how` が `'pointer'`・`' '`・`'Enter'` で、対象が「その他」以外のラジオなら `submit()`。`how` は Shadow DOM の根のキャプチャで、最後の `pointerdown`（→`'pointer'`）か `keydown`（→ そのキー）。
  - 実測（Chromium・即確定の形）: 既定で選ばれているラジオで `Space` → **確定しない**（`change` が起きない）。矢印で移る → 確定しない。移った先で `Space` → 確定しない（既に選ばれている）。`Enter` → 確定。カードのクリック → 確定。**既に選ばれているカードのクリック → 確定しない**。既定なしで `Tab` → `Space` → 確定。
- **F5 フォーカスを動かす箇所**（この作業の範囲）: `go(i)` の `PAGES[cur].tab.focus()`（**そのページの番号のボタン**。同時に `.body.scrollTop = 0`。`js:590`）だけ。呼ばれるのは: 番号のクリック（`js:577`）・［次へ］［戻る］・`Alt+PageDown/Up`・入力欄の `Enter`（`step` `js:592-596`）・**今のページの質問が表示条件で全部隠れたとき**（`refresh` → `step`。`js:692`。入力・選択の最中に起きうる）。
  - 決定して未回答があったときは、ページは移るが**フォーカスは動かさない**（`go(…, true)`＋`scrollIntoView({behavior:'smooth', block:'center'})`。`js:714-715`）。
  - 開いたときに部品が自分でフォーカスを取ることは無い。`h1` は `tabindex=-1` だが部品は使わない。部品の要素の `tabindex` は置いた側が付ける（`form.html` は `<ask-form tabindex="-1">` にして `form.focus()`。`form.html` の該当行「キー…が最初から部品に届くように」）。
  - 実測（Chromium）: 固定の行から `Tab` → ページが分かれていれば**番号のボタン 1**、分かれていなければ最初のラジオ。`Tab` の順は 番号 → 質問（ラジオ・「その他」の入力・チェックボックス）→ キャンセル → 次へ → 決定 → 番号へ戻る。［決定］の次に 1 回、部品の中にフォーカスが無い状態を通った（どこにあったかは未確認）。固定の行（`tabindex=-1`）は巡回に入らない。
- **F6 ページ分け**
  - 優先順（`js:565-568,643-658`）: (1) どれかの質問に `page != null` があれば題で分ける（題が変わるたびに新しいページ。最初の質問に `page` が無ければ題の無いページ。**空文字の `page` も「書いた」扱い**）。(2) 無くて `paging` が 1 以上の数ならその数ずつ（`i % paging`。**整数かは見ない**）。(3) それ以外: `paging` が `undefined`／`null`／`"auto"`／`true` なら高さで分ける（`autoPaging`）、`false` や 1 未満の数なら 1 ページ。
  - `setPages`（`js:570-583`）: 空のページを捨てる／補足はどのページにも無ければ最後のページへ／番号のボタンを作り直す／`go(min(cur, 最後), true)`／`refresh()`。
  - `autoPages`（`js:617-642`）: `autoPaging` でない・`.body.clientHeight` が 0 なら何もせず `false`。隠れている質問（`showIf`）も出して高さを測る。`fits = inner.offsetHeight <= body.clientHeight + 1` なら 1 ページ。収まらなければ、各枠の `offsetHeight + 12` を上から詰め、`fill = body.clientHeight − 題と説明の分 − 12 − 40` を超えたら次のページ。
  - いつ走るか: `spec` を入れた直後に部品の `clientHeight` が 0 でなければ 1 回（`js:872`）／`ResizeObserver`（部品自身を見る）が最初に成功するまで（`#sized`。**成功したら以後は走らない**。`js:819`）／置いた側が `relayout()` を呼んだとき（`js:844`）。
  - `contentHeight`（`js:787-793`）: 全ページを順に出して `inner.offsetHeight` の最大＋`footer.offsetHeight`（元のページへ戻す。フォーカスは動かさない）。`form.html` は「使える最大の高さを部品に与える → `relayout()` → `contentHeight` に合わせて縮める」（`form.html` の `fit()`）。
  - ページをまたぐ動き: 決定はどのページからでも／途中のページでは［次へ］が `primary`、［決定］は `primary` でなくなる（`js:614`）／表示条件で 1 問も出ていないページは番号ごと隠れて飛ばす（`js:569,594,604`）／`intro` は 1 ページ目だけ（`js:588`）／質問の番号は通し（`js:678`）。
  - 実測（Chromium・確かめ用のページ・1280×720）: **中身に合わせて伸びるダイアログ（`max-height: calc(100% - 16px)` だけ）でも、高さでのページ分けは起きる**——測るときに隠れた質問も出すので、ダイアログが `max-height` まで伸び、その高さで判定される。例: 3 問（うち 1 問は `showIf` で隠れている）＋補足が、全部出した高さ 579px ＞ 使える 561px で 2 ページになった（`paging: false` なら 1 ページ・ダイアログ 608px）。**ページを移るとダイアログの高さが変わる**（14 問の例で 625px → 677px → 655px）。ダイアログに高さを固定で与えると（`height: calc(100% - 16px)`）高さは変わらないが、短いページでは下が空く。
- **F7 `busy`・`notify`**: `busy = true` で［決定］［キャンセル］が `disabled`（`js:783`）、`submit()` は何もしない（`js:710`）、［キャンセル］も出さない（`js:736`）。［次へ］［戻る］・入力は止めない。`notify(文, 警告か)` は状態の行を書き換えるだけ（`js:784`）——**次の入力・選択（`refresh`）で「未回答 N 件／すべて回答済み」に戻る**（`js:690-691`）。
- **F8 未回答があるとき**（`submit` `js:709-722`）: `ask-submit` を出さない。未回答の枠に `missing`、最初の未回答のページへ移る、その枠へスクロール、状態の行に警告。答えるとその枠の `missing` は消える（`js:681`）。`aria-invalid`・フォーカスの移動は無い。
- **F9 回答の集め方**（`collect` `js:670-687`・`buildChoice` の `get` `js:372-376`）: 上から順に `showIf` を見て、出ている質問だけ入れる。`single` の未回答は `answers` に入れない。複数選択は **DOM の順（＝定義の順）、「その他」の入力は最後**。「その他」を選んでいれば、入力が空でも `custom` に id が入る（`js:378,683`）。自由記述・補足は `trim()`。

### 部品の安全（Q1。全文を読んで確かめた）

- **F10 無いもの**: `innerHTML`・`insertAdjacentHTML`・`outerHTML`・`document.write`・`eval`・`new Function`・`fetch`・`XMLHttpRequest`・`WebSocket`・`EventSource`・動的 `import()`・`localStorage`／`sessionStorage`・`location`・`window`・`cssText`・`style` 属性への `setAttribute`・`adoptedStyleSheets`・インラインのイベント属性（`on*`）・`href`。`prefers-color-scheme` も無い（`form.html` の側にだけある）。
- **F11 あるもの（と入る値）**
  - `document` は `document.createElement` の 1 か所だけ（`js:168`）。ほかに使うグローバル: `customElements`・`HTMLElement`・`ResizeObserver`・`CustomEvent`・`Event`・`queueMicrotask`・`CSS.escape`（`js:208,370`）・`Audio`（`js:262`。音があるときだけ）。
  - 定義の文字は `textContent`（`el()` の `text`。`js:171`）か、子として `append` した文字列（`js:173`。`legend` の `q.label` `js:542` など——テキストノードになる）。
  - 属性は `setAttribute(固定の名前, 値)`（`js:171`）。定義の値が入る属性: `value`・`name`・`placeholder`・`aria-label`・`data-ask-question`・（表だけ）`title`／`label`・（並べ替えだけ）`data-v`。属性の**名前**は全部コードの中の固定の文字列。
  - スタイル: `<style>` 要素に固定の `STYLE` を `textContent` で入れる（`js:560,860,867`）。定義の値がスタイルへ入るのは 3 か所で、どれも CSSOM の個別のプロパティ: `--min`（`num(q.minWidth, 60, 2000)` で数に限ってから `+ 'px'`。`js:281`）・`--thumb`（同じく数。`js:282`。この作業では渡らない）・色の帯 `i.style.backgroundColor = c`（`COLOR_RE`〔`#` ＋ 16 進 3・4・6・8 桁〕を通ったものだけ・16 個まで。`js:161,310-313`）。
  - `src` を作る箇所: `js:219,293,321`（`img`）・`js:262`（`new Audio`）。どれも `media()`（`js:182-185`）が返した URL だけで、**`resolveMedia` が関数でなければ null**＝この作業では作られない。
  - セレクタへ定義の値を入れる箇所は `CSS.escape` を通す（`js:208,370`）。
- **F12 CSP**: 実測（Chromium）: `default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'`（`packages/server/src/http/HttpServer.ts:27-28` と同じ）で、部品を外部のモジュールとして読み、描き、選び、ページを移り、決定するまで、`securitypolicyviolation`・コンソールのエラーは 0 件。`<style>` の要素は `style-src 'unsafe-inline'` に頼る（いまの CSP が xterm.js のために許している。`HttpServer.ts:23-26`）。
- **F13 直に書いた色**: `STYLE` の既定値（`--ask-*` が無いとき。`js:30-31`）／差分の行 `rgba(46,160,67,.2)`・`rgba(248,81,73,.2)`（`js:93-94`。`code` があるときだけ）／拡大表示 `rgba(8,10,14,.9)`・`#fff`（`js:106-108`。`hidden` のまま）。この作業の範囲で画面に出るのは既定値だけ（変数を全部渡せば出ない）。
- **F14 この作業の範囲で部品が `Esc` を使う場面**: **1 つある**——選択肢が 12 件以上の質問に自動で付く絞り込みの欄（F2）に文字があるときの `Esc`（`js:759`）。実測（Chromium）: その `Esc` では `<dialog>` の `cancel` が**起きない**（絞り込みが消えるだけ）。欄が空のとき・ほかの場所の `Esc` は `cancel` が起きる。拡大表示（画像）は出ない。
- **F15 `__other__`**: 部品は値が `__other__` の `input` を「その他」とみなす（`js:374,732,769`）。`normalizeAskSpec` は選択肢の `value` に `__other__` を禁じていない（`packages/protocol/src/ask.ts:242-246`）。`allowOther` でない質問にその値の選択肢があり選ばれると、`otherText` が null のまま読まれる（`js:374`）。推測: 描いた直後の `refresh()` で例外 → `ask-unsupported`（`render failed`）になる（既定でその値が選ばれているとき）。未確認（走らせていない）。

### いまの画面（Q2）

- **F16 `AskDialog.vue` の責務**（`packages/web/src/components/AskDialog.vue`）
  - 枠に残るもの: `<dialog id="soda-ask-dialog">`＋`aria-labelledby="ask-origin"`（`:259`）／固定の行 `h2#ask-origin[tabindex=-1][data-ask-origin]`（`:262`）と文言の組み立て `origin`（`:68-77`）／開閉の `watch`（`askId` の変化で `showModal()`・`view.setAskOpen(true)`・固定の行へフォーカス。`immediate: true`。`:90-114`）／`closeDialog`・`restoreFocus`（`:116-147`）／`onBeforeUnmount` の `setAskOpen(false)`（`:149`）／`@cancel` の `onNativeCancel`（`preventDefault` して `controller.cancel`。`:230-233`）／`controller.answer`・`controller.cancel` の呼び出しと `sending`（`:202-228`）／枠の CSS（`.ask-dialog`・`::backdrop`・`.ask-header`・`.ask-origin`。`:340-373`）／`Teleport` の行き先としての id（`App.vue:104`）。
  - 部品に移るもの: 入力の状態 `form`・`resetForm`（`:35-46`）／`collected`・`shown`・`statusText`（`:52-65`）／`instant`（`:80-83`）／`pick`・`pickOther`・`onOtherInput`（`:153-174`）／`lastInputWasPointer`・`onOptionChange`・`onOptionKeydown`（`:180-200`）／未回答の強調とスクロール（`:206-212`）／`onKeydown` の `Ctrl/Cmd+Enter`・入力欄の `Enter`（`:235-247`）／`swatches`・`groupName`（`:250-255`）／テンプレートの `ask-main`・`ask-footer`（`:264-334`）と、その CSS（`:374-515`）。
  - **いまと部品で違う点**（どちらに寄せるかは design）:
    - 即確定の `Space`: いまは選択肢の `keydown` で `Space`・`Enter` を取り、**既に選ばれている選択肢でも**選んで決定する（`:191-200`）。部品は `Enter` だけ（F4）。
    - `Ctrl/Cmd+Enter`: いまは `<dialog>` の `keydown`（固定の行にフォーカスがあっても効く。ただし `.ask-header, .ask-main, .ask-footer` の中だけ。`:238`）。部品は部品の中だけ（F4）。
    - 入力欄の `Enter`: いまは `Shift` 無しのときだけ（`:243`）。
    - 文言: 未回答の警告（いま「選んでから決定してください」`:63`／部品「答えてから…」）、質問の種類（いま「1 つ選ぶ」「自由記述」「複数選べます」`:277`／部品は F3）、「その他」の入力欄の `aria-label`（いま `<label>（<その他>）` `:317`／部品 `<その他>の内容`）。
    - 選択肢の最小幅の既定: いま 180px（`:284`）／部品 150px（説明があれば 220px。`js:281`）。
    - 入力欄の文字の大きさ: いま常に `max(16px, 1em)`（`:480`）／部品は `pointer: coarse` のときだけ（`js:158`）。
    - 補足欄があるか: いま `spec.note`（真偽。`:325`）／部品 `note !== false`。検査済みの定義では同じ。
    - 送信中の `Esc`: いまも枠の `cancel` は `sending` を見ない（`:223-228`）。部品の `busy` は枠の `Esc` を止めない。
- **F17 置き方・通信**: `App.vue:23,100` に `<AskDialog />`（引数なし）。トーストと再接続の表示は、質問が出ている間 `#soda-ask-dialog` の中へ `Teleport` される（`App.vue:104`）。`AskController`（`packages/web/src/ask/AskController.ts`）: `answer(askId, body): Promise<boolean>`（成功・`ask_closed` は true＝外す／ほかの失敗はトーストを出して false＝開いたまま。`:62-70,82-94`）・`cancel(askId)`（必ず外す。`:73-80`）。`store/ask.ts`: `queue`・`current`（先頭）・`replaceAll`・`add`・`remove`・`clear`。`view.askOpen`／`setAskOpen`／`modalOpen`（`packages/web/src/store/view.ts:324-345`）。`modalOpen` の間、window の `keydown` は何もしない（`packages/web/src/main.ts:465-470`）・`KeyRouter` は dialog モード（`main.ts:454-457`）。
- **F18 単体テスト**
  - `AskDialog.test.ts`: `it` 25 件・`describe` 8 つ。`@vue/test-utils` の `mount(AskDialog, { attachTo: document.body, global: { plugins:[pinia], provide: {AskControllerKey: {answer, cancel}, TerminalRegistryKey} } })`（`:51-63`）。DOM は `wrapper.get/find/findAll`（＝ライト DOM の `querySelector`）で探す: `[data-ask-submit]`・`[data-ask-cancel]`・`[data-ask-origin]`・`[data-ask-title]`・`[data-ask-question]`・`[data-ask-status]`・`[data-ask-main]`・`.ask-num`・`.ask-opt`・`.ask-swatch`・`.ask-opt-desc`・`.ask-missing`・`.ask-other-text`・`input.ask-text`・`textarea.ask-text`・`input[value="…"]`・`input[type=radio][name$="-0"]`。操作は `setValue`・`trigger("click"|"keydown"|"pointerdown")`・`dispatchEvent(new Event("cancel"))`。`wrapper.text()`・`root.innerHTML`・`root.querySelectorAll("script, img")` も使う（`:181-188`）。`showModal`／`close` は無ければ生やす（`:18-23`）。
  - `AskController.test.ts`: `it` 8 件。DOM は使わない（`conn.request` の偽物と store）。**部品の取り込みで変わる所は無い**。
- **F19 単体テストの環境**（`packages/web/vitest.config.ts`: `environment: "happy-dom"`・`include: src/**/*.test.ts`。happy-dom 20.14.5・vitest 5.0.1）。実測（happy-dom）:
  - `customElements.define`・`attachShadow`・`ResizeObserver`・`HTMLDialogElement.prototype.showModal`／`close`・`CSS.escape`・`queueMicrotask`・`replaceChildren`・`scrollIntoView`・`composedPath`・`PointerEvent` は**どれもある**。`querySelectorAll("label.opt:has(input:checked)")`・`matches(":has(…)")` も動く。
  - 部品を `import` して `spec` を入れると描ける（`shadowRoot` に質問・番号・状態の行）。`page` で分ける・未回答の表示・`showIf`・色の帯（`style="background-color: #fff;"` だけ）・`busy`・`ask-unsupported`・`Ctrl+Enter`（`composed: true` の `KeyboardEvent`）・即確定（`pointerdown` → `change`／`Enter`）は期待どおり。
  - **ライト DOM からは見えない**: `dialog.querySelectorAll("[data-ask-submit]")` は 0 件（＝`wrapper.get("[data-ask-submit]")` は見つからない。`el.shadowRoot.querySelector(…)` なら見つかる）。
  - **大きさは全部 0**（`clientHeight`・`offsetHeight`・`contentHeight`）＝高さでのページ分けは単体テストでは起きない（`autoPages` は `false` を返す）。
  - Shadow DOM の中から `composed` を付けずに作った `keydown` は部品の要素（host）へ届かない（`@vue/test-utils` の `trigger` を Shadow DOM の中の要素に使う道は未確認）。
  - 先例: `MobileShell.test.ts:168-226` は `ResizeObserver` を偽物に差し替えている（コメントは「happy-dom には無い」だが、20.14.5 にはある。コールバックが実際に呼ばれるかは未確認）。カスタム要素・Shadow DOM を使う既存のコード・テストは `packages/web/src` に無い。
- **F20 Vue とカスタム要素**: `packages/web/vite.config.ts:9`・`vitest.config.ts:5` は `vue()` を引数なしで使う（`isCustomElement` の設定はリポジトリに無い）。推測（Vue 3 の仕様の知識）: テンプレートに `<ask-form>` を書くと「Failed to resolve component」の警告が出る（描画はされる）。止めるには `template.compilerOptions.isCustomElement` を両方の設定に足すか、要素を命令的に作る。Vue はカスタム要素のプロパティ（`spec` は要素にある）へ値をプロパティとして入れる（`.prop` で明示もできる）。`ask.value.spec` は pinia の ref の中身（リアクティブなプロキシ）で、部品はそれに書き込む（F2）。

### E2E（Q3）

- **F21 件数と道具**: `packages/e2e/src/specs/ask-form.spec.ts` は `test(` 22 件（うち 3 件は `test.describe` の中）、`ask-form-mobile.spec.ts` 1 件。`support/ask.ts` は DOM を触らない（`runAsk`・`runAskWithoutLogin`・`watchAskSubscriptions`〔CDP〕・`askFixture`〔`packages/protocol/src/ask.fixture.json` を `fs` で読む。`:19-24`〕）。既定の画面は Desktop Chrome（`playwright.config.ts`）、モバイルは `devices["iPhone 13"]`＋chromium。
- **F22 セレクタと操作の対応**（実測（Chromium）: Playwright の CSS ロケータは open の Shadow DOM を越える。子孫結合子・`:has()`・`hasText` も越える）

| いまのセレクタ／操作（`ask-form.spec.ts` の行） | 部品に替えた後 |
|---|---|
| `dialog#soda-ask-dialog[open]`（`:22`）・`toBeVisible`／`toHaveCount(0)`・`boundingBox`（`:398`） | 枠。変わらない |
| `[data-ask-origin]`（`:47,48,223,281,328,423,435,449`。`toBeFocused`・`toContainText`・`.focus()`・`boundingBox`） | 枠。変わらない |
| `[data-ask-title]`（`:49,189,225,420`。`toHaveText`・`boundingBox`） | 部品の `h1[data-ask-title]`。ロケータは届く。**要素は `h3` → `h1`** |
| `[data-ask-submit]`（`.click()` 多数・モバイルは `.tap()`） | 部品の `button[data-ask-submit]`。届く。文言の後ろに `kbd`「Ctrl+Enter」が付く（幅 767px 以下では消える） |
| `[data-ask-cancel]`（`:282,375,405`） | 部品の `button[data-ask-cancel]`。届く |
| `[data-ask-question]` の `toHaveCount(7)`→`(6)`（`:67,73`） | **数が変わる**: 隠れた質問・ほかのページの質問も DOM に残る（F3）。出ているものだけ数えるには `:visible` 等が要る（実測: 3 問中 1 問が隠れているとき `count()` は 3、`:visible` は 2） |
| `input[type=radio][value="…"]` の `.check()`・`toBeChecked`・`toBeFocused`（`:69-72,169,331,333,437,439`。モバイル `:31`） | 同じセレクタで届く（`name` は `ask-<askId>-<n>` → 質問の id）。`.check()` は実測で通る。**ほかのページにある質問は見えないので操作できない**。`toBeFocused` が Shadow DOM の中の要素で通るかは未実測（推測: 通る——Playwright はその要素の根の `activeElement` で見る） |
| `.ask-other-text` の `.fill`（`:89`） | **無い**。`label.opt.other input[type=text]`、または `aria-label="その他の内容"` |
| `textarea[aria-label=補足]` の `.fill`（`:90`） | 同じセレクタで届く。**補足は最後のページ**なので、ページが分かれると見えず `fill` が待ち続ける（実測） |
| `label.ask-opt:has(input[value="…"])`（モバイル `:28`。`scrollIntoViewIfNeeded`・`.tap()`） | `label.opt:has(input[value="…"])`（実測で届く） |
| `label.ask-opt`, `{ hasText: "ゼット" }` の `.click()`（`:443`） | `label.opt`（表示名≠値なので、カードに値 `z` も出る） |
| `dialog#soda-ask-dialog script, dialog#soda-ask-dialog img` の `count()` が 0（`:421`） | **1 になる**（部品が常に描く拡大表示の `<img alt="">`。F3。実測） |
| `dialog(page).evaluate((d) => d.querySelector("h1, h2, h3, [data-ask-title], [data-ask-question]")?.hasAttribute("data-ask-origin"))`（`:229`） | `querySelector` は Shadow DOM を越えない。結果は true のままだが、部品の中の題・質問を見ずに通る（確かめが弱くなる）。直前の `boundingBox` の上下の比較（`:226-228`）は有効 |
| `page.evaluate(() => document.activeElement?.closest("dialog.settings-dialog"))`（`:316`）・`closest(".sidebar, .tab-bar, .app-panes, .terminal-pane")`（`:348`） | フォーカスが部品の中にあると `document.activeElement` は `<ask-form>`。`closest` は枠の `dialog` をたどれる（実測）。意味は変わらない |
| `page.keyboard.press("Control+Enter")`（`:91,335`）: フォーカスは入力欄・ラジオ | 部品の中なので効く（実測）。**固定の行にフォーカスがあるときは効かない**（実測） |
| `page.keyboard.press("Escape")`（`:107,252,318,350`） | 枠の `cancel`。変わらない（絞り込みの欄に文字があるときを除く。F14） |
| `Tab` → `input[type=radio][value=beta]` が `toBeFocused`（`:329-331`）・`Tab` → `Space`（`:436-437,450-451`） | ページが分かれていなければ最初のラジオ（実測）。**分かれていると番号のボタンが先**（F5）。`:450-452` の「既定の `x` に `Tab` で入り `Space` で確定」は、部品では確定しない（F4 の実測） |
| `.xterm-helper-textarea`・`.tab-bar-item`・`dialog.settings-dialog[open]`・`dialog.name-dialog[open]`・`.xterm-screen`・`page.mouse.wheel` | 部品と関係なし |

- **F23 既存の定義がページに分かれうる**: `ask-form.spec.ts` の `SPEC`（3 問・うち 1 問は `showIf` で隠れる・補足あり）に近い定義は、実測（Chromium・確かめ用のページ・1280×720）で 2 ページになった（F6）。実物のダイアログ（固定の行の余白・文字の大きさが違う）でどうなるかは未確認。分かれると、`textarea[aria-label=補足]`・`Tab` の行き先・`[data-ask-question]` の見え方に効く（F22）。モバイルの大きさ（390×664）では、確かめ用に作った 7 問（1 問目の選択肢が 13 件・1 列。`ask.fixture.json` そのものではない）が 7 ページになり、ダイアログは幅に収まり、［決定］は画面の中に見えていた（実測）。`ask.fixture.json` そのものでの結果は未確認。
- **F24 条項 `e2e-observe-browser`**（`.aidev/conventions/e2e-observe-browser.md`）の要点: 合否はブラウザの描画・DOM・ブラウザが送受信したフレームで見る。テスト自身のクライアントは前提作りとサーバ側の状態の確認だけ。テストのクライアントに届いたイベントをブラウザの反映の合図にしない（DOM の印を待つ）。DOM から読めないものは、代わりに何を見たかを spec に書く。`waitForTimeout` だけを根拠にしない。いまの spec は `watchAskSubscriptions`（CDP）と `dialog` の DOM を待っている。CSP の違反を見る E2E の先例は未特定（`securitypolicyviolation` を使う spec は見つからなかった）。

### protocol（Q4）

- **F25 `normalizeAskSpec`**（`packages/protocol/src/ask.ts:153-297`）
  - 流れ: オブジェクトか → 大きさ（`jsonBytes` ≤ 256 KiB）→ `questions` が空でない配列・100 件まで → 全体の `title`・`intro`・`submit`（`:168-177`）→ `note`（`false`／文字列なら `notePlaceholder`。`:178-185`）→ 質問ごと（`:191-287`）: `id`・`label` → 長さ → `__proto__` → 重複 → `type`（対応していない文字列は `unsupportedType` に覚えて**その質問を飛ばす**。`:204-209`）→ 任意の文字列（`help`・`otherLabel`・`otherPlaceholder`・`placeholder`。`:220-229`）→ `minWidth`（60〜600 の整数だけ残す。`:230-231`）→ 選択肢（`:233-260`）→ `default`（`:262-273`）→ `showIf`（`:275-285`）→ 全質問の後に `showIf` の指す id の確認（`:288-290`）→ 対応していない型があれば失敗（`:292`）→ 組み立て（`:293-296`）。
  - 知らない項目の落とし方: 出力（`top`・`out`・`opt`）を**新しく作り、知っている項目だけ写す**。`paging`・`page` を写す行はいま無い。
  - 短い文字列の上限: `str(v, max, where)`（`:161-165`）が、**文字列でなければ黙って捨て（`undefined`）**、長ければ `"<where> is longer than <max> characters"`。`ASK_LABEL_MAX = 500`（`:17`）。文字数はコードポイント（`len` `:135-137`）。→ `page` は「文字列でなければ誤り」なので、`str()` の「捨てる」とは扱いが違う。
  - 誤りの形: `{ ok: false, message, unsupportedType? }`（`:146`）。`message` は英語で場所と理由。**分類（`reason`）の欄は無い**。
  - 空の `showIf`: `null`・空の配列は無いものとして飛ばすが（`:277`）、**空のオブジェクト `{}` は `isObject` を通り、`out.showIf = {}` が残る**（`:278-284`）。
  - 型: `AskSpec`（`:67-75`: `title`・`intro?`・`submit`・`note: boolean`・`notePlaceholder?`・`questions`）・`AskQuestion`（`:46-64`）・`AskQuestionType = "single" | "multi" | "text"`（`:44`）。`exactOptionalPropertyTypes: true`（`tsconfig.base.json`）。
- **F26 `collectAsk`・`checkAskAnswer`・`initialAskState`**
  - `collectAsk`（`:351-372`）の複数選択の値は `valueOf`（`:338-345`）が決める: **`state.picked[q.id]` の並びのまま**（定義の順に並べ直さない）＋「その他」の入力を最後。いまの画面は `pick` の側で定義の順に揃えてから入れている（`AskDialog.vue:161`）。
  - `checkAskAnswer`（`:378-420`）: 複数選択は「配列か・必須なら空でないか・各値が選択肢にあるか（無い値は `custom` に id があり空でないときだけ・1 つまで）」を見る（`:398-409`）。**値の順・重複は見ない**。`custom`: 重複なし・出ている質問で `text` でなく `allowOther` のもの（`:382,414-417`）。`note` は補足欄があるときだけ（`:418`）。
  - `ask.answer` の zod（`packages/protocol/src/messages.ts:407-413`）は `z.object`（余分な項目は落とす）。部品の `detail` に `edited` が付いても通る（この作業の型では付かない）。
  - `initialAskState`（`:312-326`）: `default` のうち選択肢にある値だけを `picked` に。部品を使うと画面の側では要らなくなる（共通の試験データの `state` を読むテストでは使う形）。
  - 部品の `ask-submit` の `detail` は、いまの `controller.answer(askId, body)` の `body`（`{answers, custom?, note?}`）と同じ形（F1・F9）。
- **F27 `ask.test.ts`**（`packages/protocol/src/ask.test.ts`。`it` 31 件）: `describe` は「誤り」「既定と丸め」「isAskColor」「collectAsk」「checkAskAnswer」。確かめ用の定義は `import fixture from "./ask.fixture.json" with { type: "json" }`（`:16`。`resolveJsonModule: true` は `tsconfig.base.json`）。誤りは `message` の正規表現・部分一致で見ている（`:36-40` など）。
- **F28 定義を検査する 2 か所**: sodactl `readAskSpec`（`packages/cli/src/commands/ask.ts:63-76`）——`normalizeAskSpec` で検査し、**送るのは読んだままのオブジェクト**（`:75`）。誤りは終了コード 2（`:74`）、対応していない型は `unavailable`（`:73`）。サーバ `AskService.open`（`packages/server/src/ask/AskService.ts:100-131`）——もう一度 `normalizeAskSpec` し、**正規化後の `checked.spec` を持つ**（`:117`）。誤りは `invalid_ask_spec`（`:102`）で、sodactl が終了コード 2 に読み替える（`ask.ts:113`）。
- **F29 共通の試験データ**
  - `fixtures/normalize.json`: `{ about, reasons, cases }`。`reasons` は分類の名前 → 説明（18 個: `questions_empty`・`id_label_required`・`id_duplicate`・`unknown_type`・`unsupported_type`・`options_empty`・`option_value_required`・`option_value_duplicate`・`showif_unknown_id`・`showif_invalid`・`paging_invalid`・`page_invalid`・`row_default_unknown`・`preview_invalid`・`code_invalid`・`media_type`・`media_missing`・`too_large`）。`cases` は 29 例で、各例 `{ name, spec, expect, sodashitsu? }`。`expect` は `{ ok: true, spec }`（正規化後）か `{ ok: false, reason }`。`about` の決まり: **比べるのは `expect.spec` に書いた項目だけ**／誤りは文言でなく `reason` で比べる／実装ごとの差は実装の名前の欄で上書きする。
  - `sodashitsu` の欄は 4 例（`{ note, expect }`）: 「ページ: 質問の page と、全体の paging」（`page`・`paging` を落とした形）・「誤り: 知らない型」（`unsupported_type`）・「誤り: paging の値」（`{ok: true}`）・「誤り: page が文字列でない」（`{ok: true}`）。**`only` の欄は無い**。
  - `fixtures/collect.json`: `{ about, cases }`。20 例で、各例 `{ name, spec, state, expect }`。`spec` は書かれたままの定義（各実装が正規化してから使う）。`state` は `{ picked, otherPicked, otherText, text, note }`（`AskFormState` と同じ形。`state` は `default` より優先・書かれていない質問は何も選んでいない）。`expect` は `{ answers, lacking, custom?, note? }`。`sodashitsu` の欄は無い。`about` は `collectAsk`・`checkAskAnswer` の両方が読むと書く。
  - いま食い違う 2 例: 「表示条件: 空・null は無いものとして落とす」（F25 の `{}`）・「複数選択: 選んだ値は定義の順」（`picked: ["z","x"]` → `["x","z"]`。F26）。
- **F30 `paging`・`page` の検査の仕様**（`ask.py` の `normalize()`・`SKILL.md`「ページ（質問が多いとき）」）
  - `paging`（`ask.py:129-131`）: `None`・`"auto"`・**真偽（`true` も `false` も）**・1 以上の整数、のどれかでなければ `paging_invalid`。`0`・負・小数（Python では `5.0` は整数でない）・ほかの文字列は誤り。既定は埋めない（無ければ無いまま）。→ requirements の AC11（`"auto"`・`false`・1 以上の整数）と、**`true` の扱いが違う**（部品は `true` を `"auto"` と同じに扱う。`js:567`）。試験データに `true` の例は無い。JSON の `5.0` は JS では整数 5 と区別できない。
  - `page`（`ask.py:140-141`）: `None` でなく文字列でもなければ `page_invalid`。`null` は無いのと同じ。空文字は通る（部品は「書いた」扱い。F6）。長さの上限は `ask.py` に無い（Sodashitsu の 500 文字は requirements AC11）。検査の順は「id・label → id の重複 → `page` → `type`」。
  - 動き（`SKILL.md:115-136`）: F6 のとおり。`SKILL.md:244` は「ページ分けは `sodactl ask` には効かない」と書いている（ask-form の側の文書。この作業の後は合わなくなる）。

### 写す先と読み方（Q5）

- **F31 `third_party/herdr/` の先例**: 置き場は `third_party/herdr/`（`LICENSE`・`README.md`・`agent-detection/*.toml`）。`README.md` に取得元コミット・取得元パス・取得日・ライセンス・「変更点: なし」・更新のときの決まり。`NOTICE` は「This product includes … derived from <名前>（URL）, Copyright …, licensed under …」＋ `Location in this repository`・`License text`・`Source commit`・`Retrieved`・「included unmodified」。読む仕組みは**サーバが実行時に相対パスで読む**（`packages/server/src/composeServer.ts:134-138` `manifestDirFor`）。テストは `join(import.meta.dirname, "..", …, "third_party", …)` で実物を読む（`packages/server/src/agent/ManifestStore.test.ts:8`・`infra/FsManifestSource.test.ts:8`）。**Web が `third_party/` を読む先例は無い**。写したファイルのハッシュを確かめる先例も無い。
- **F32 配布**: `scripts/package.mjs:47-48` は `third_party`・`docs`・`LICENSE`・`NOTICE` を丸ごと `cpSync` する。`packages/web/dist` も写す（`.map` を除く。`:44`）。→ `third_party/` の下に置けば配布物にそのまま入る（Web の `dist` にまとめられた分とは別に）。
- **F33 Web からの読み方**
  - Vite 8（`packages/web/vite.config.ts`）: 設定は `plugins`・`server.proxy`・`build.outDir` だけ（`alias`・`server.fs` の指定なし）。推測（Vite の仕様の知識）: `build` は `packages/web` の外の相対パスの `import` もまとめる。`dev` は `server.fs.allow` の既定がワークスペースの根（`pnpm-workspace.yaml` のある所＝リポジトリ直下）なので `third_party/` を配れる。実際のビルドは走らせていない（未確認）。
  - TypeScript: `packages/web/tsconfig.json` は `include: ["src"]`・`types: ["vite/client"]`・`allowJs` なし。`tsconfig.base.json` は `module`／`moduleResolution: NodeNext`・`strict`。`packages/web` に `.d.ts`・`declare module` は無い。推測（TypeScript の仕様の知識）: 名前を取り込む `import { AskFormElement } from "…/ask-form.js"` は、隣に `ask-form.d.ts` が無いと TS7016（型の宣言が無い）になる。**副作用だけの `import "…/ask-form.js"` は型を解決しないので通る**（`noUncheckedSideEffectImports` は指定なし）。相対パスのモジュールには `declare module "相対パス"` を書けない（ワイルドカードの `declare module "*/ask-form.js"` か、隣の `.d.ts`、または要素の型だけを Web の側に宣言する）。`vue-tsc --noEmit -p tsconfig.typecheck.json` は `pnpm build` の前段（`packages/web/package.json` の `build`）なので、型が通らないとビルドが止まる。
  - 素の JS を Web が持つ先例: `packages/web/public/theme-boot.js`（`index.html` から `<script src>` で読む。まとめられない）。
  - eslint: `eslint . --ext .ts`（`package.json`）＝`.js` は見ない。`.eslintrc.cjs` の `ignorePatterns` は `dist`・`node_modules`・`*.cjs`（`third_party` は入っていないが、`.ts` が無ければ対象にならない）。prettier: `.prettierrc.json` はあるが、走らせるスクリプトは `package.json` に無い（`.prettierignore` も無い）。
  - `.gitattributes` は `*.bat text eol=crlf` だけ。`.js`・`.json` の改行の指定は無い（Windows で `core.autocrlf` が有効な clone では、写したファイルのバイトが変わりうる——推測）。
- **F34 protocol のテストから JSON を読む方法**: 先例は 2 つ——`import … with { type: "json" }`（同じ `src` の中。`ask.test.ts:16`）と、`fs` で読む（`packages/e2e/src/support/ask.ts:19-24`・サーバのテスト F31）。`packages/protocol/tsconfig.json` は `rootDir: "src"` で、`tsconfig.typecheck.json` はテストも含める。推測: `src` の外の JSON を `import` すると、型検査で「rootDir の外」の誤り（TS6059）になりうる（未確認）。`fs` で読むなら型検査に関係しない。
- **F35 `scripts/`**: `package.mjs`（配布物。`node:fs` の `cpSync` 等）・`run-quiet.mjs`・`tui-pty-verify.mjs`（`fetch` は手元のサーバ `…/api/local-login` へだけ。`:361`）・`migrate-from-wtm.sh`／`.bat`・`migrate-from-wtm.test.ts`。テストは `scripts/vitest.config.ts`（`name: "scripts"`・`environment: "node"`・`include: ["*.test.ts"]`・`testTimeout: 60_000`）で、ルートの `vitest.config.ts` の `projects: ["packages/*", "scripts"]` から読まれる。型検査は `tsc -p scripts/tsconfig.json`（`include: ["*.ts"]`＝`.mjs` は見ない）。**外部のネットワークへ取りに行くスクリプトの先例は無い**。CI の設定（`.github/`）は無い。
- **F36 public_docs**: `git -C /workspaces/public_docs remote -v` は `origin https://github.com/asaomaro/public_docs`（fetch・push）。手元の clone は `/workspaces/public_docs`（ブランチ `main`）。リポジトリ直下に `LICENSE` は無い（`README.md`・`docs`・`fonts`・`pkg`・`setup` だけ）＝**ライセンスの文面は未確認**。手元の 3 ファイルの SHA-256: `ask-form.js` `16100c86…286c40`・`fixtures/normalize.json` `b09c2c6e…6d930d`・`fixtures/collect.json` `f5f3454c…7acddb`。ask-form の側は `../tests/test_ask_form.py` が部品の決まり（禁止語の検索）と試験データを確かめている。

### テーマ（Q6）

- **F37 Sodashitsu の変数**: 一覧は `packages/client-core/src/theme/uiTokens.ts:16-36` `CSS_VARS`（19 個。問いの 8 つは全部ある）。当てる先は `document.documentElement`（`packages/web/src/main.ts:256`）で、`ThemeController.apply`／`applyOverrides` が `root.style.setProperty` で入れる（`packages/web/src/theme/ThemeController.ts:117-138`。`root.style.colorScheme` と `data-theme` も）。最初の描画は `App.vue:117-139` の `:root`（dracula の写し）か `public/theme-boot.js`（控え）。テーマには明るいものもある（`uiTokens.ts:41,354` `colorScheme`）。
- **F38 部品の変数**: 部品は `:host` で `--ask-*` を受ける（`js:29-35`）。CSS の変数は Shadow DOM の境界を越えて継承されるので、**部品の要素かその祖先**に `--ask-bg: var(--soda-menu-bg)` 等を書けば届く（実測（Chromium）: 確かめ用のページで `<ask-form>` の規則に書き、地の色が `--soda-menu-bg` の値になった）。任意の 3 つは無ければ `color-mix` で作る（`--ask-card` = 地 93%＋文字／`--ask-muted` = 文字 62%＋地／`--ask-accent-soft` = 強調 14%＋地。`js:32-34`）。割り当てを書ける場所の候補: `AskDialog.vue` の `<style scoped>`（テンプレートに書いた `<ask-form>` には scoped の属性が付く。いまの `.ask-dialog` は `:345-347` で 3 つの変数を使っている）／`.ask-dialog` の規則（継承で届く）／`App.vue` の `:root`。部品は `:host` に `background`・`color`・`display:flex; flex-direction:column; min-height:0`・`font: inherit; line-height: 1.6` を持つ（`js:29-35`）。文字の大きさは `h1` 18px・`legend` 15px など px で固定（`js:42,56`）。

### UI の規範（Q7。知識の要約。外部は取得していない）

- **F39 APG の決まり**
  - Dialog (Modal): 開いたらフォーカスを中へ移す。ふつうは最初のフォーカスできる要素だが、**内容が長い・読む順が大事なときは、先頭の静的な要素に `tabindex="-1"` を付けてそこへ**置いてよい。`Tab`／`Shift+Tab` は中を巡回し外へ出ない。`Esc` で閉じる。閉じたら、開いた要素（無ければ流れに合う場所）へ戻す。`aria-modal`・`aria-labelledby`。確定のキー（`Ctrl+Enter`）・背景のクリックは APG では決めていない。
  - Tabs: `role="tablist"`／`tab`／`tabpanel`、`aria-selected`、矢印でタブを移り、`Tab` はパネルの中へ。
  - Radio Group: `Tab` で群へ入ると選ばれているもの（無ければ最初）へ。矢印は移ると同時に選ぶ。`Space` は、フォーカスのあるものが選ばれていなければ選ぶ。
  - **複数ページのフォーム（ウィザード・ステップ）の APG のパターンは無い**（未確認: 最新の APG に足されていないか）。ARIA は「いまの段階」に `aria-current="step"`、ページ送りの「いまのページ」に `aria-current="page"` を用意している。ページを移ったあとのフォーカスは APG の決まりが無く、一般には新しいページの見出しか先頭へ置く。
  - WCAG 3.2.2（入力時）: 値を変えただけで文脈が変わる（送信される）のは、前もって知らせていない限り避ける。3.3.1（誤りの特定）: 誤りの項目を文で示す。
- **F40 部品の実際との食い違い・一致**
  - ページの帯は Tabs ではない: `nav[aria-label="ページ"]` の中のふつうの `button`（`role` なし）で、`aria-current="page"`／`"false"`（`js:536,576,606`）。矢印では移れず、`Tab` で 1 つずつ通る（F5 の実測）。`aria-current` の値は `step` でなく `page`。
  - ページを移ったあとのフォーカスは番号のボタン（F5）——見出しでも最初の質問でもない。requirements AC-I4（「そのページの番号（題）」）とは一致。
  - ラジオは素の `input[type=radio]` なので Radio Group の動きはブラウザ任せ（APG と同じ）。即確定は「矢印では確定しない」が、**選ばれている選択肢での `Space` は何も起きない**（F4）＝AC9 の「`Space` で確定」は、既定が選ばれている状態では満たさない。
  - 未回答: 文（`role="status"`）と枠の色・ページの番号の色で示す。`aria-invalid`・フォーカスの移動は無い（F8）。
  - 開いたときのフォーカス・`Esc`・閉じたあとの戻し先は枠（`AskDialog.vue`）の責務で、いまの実装は APG の「先頭の静的な要素」に合っている（`:106`）。
- **F41 `Alt+PageDown`／`Alt+PageUp`**
  - 実測（Chromium・Linux・headless）: 部品の中にフォーカスがあればページが移る。ページが 1 つでも部品が `preventDefault`＋`stopPropagation` する（F4）。**固定の行にフォーカスがあるとき（開いた直後）は部品に届かず、何も起きない**（枠の `keydown` には届く。`defaultPrevented` は false）。
  - 既定の動きとの重なり（知識）: Chrome・Firefox のタブの切り替えは `Ctrl+PageDown/Up`（`Alt` ではない）。Windows・Linux のブラウザで `Alt+PageDown/Up` に割り当てられた既定の動きは知らない。macOS では入力欄の中の `Option+PageUp/PageDown` が「カーソルをページ単位で動かす」に当たる。Firefox・Safari・実機の macOS・ウィンドウマネージャの横取りは**未確認**。

### 互換と配布（Q8）

- **F42 古い画面（読み込み直す前）× 新しいサーバ**: サーバは正規化後の定義を配る（F28）ので、`paging`・`page` を通すと `AskPending.spec` に項目が増える。古い `AskDialog.vue` が読むのは `spec.title`・`intro`・`submit`・`note`・`notePlaceholder`・`questions[].{id,label,type,help,options,default,allowOther,otherLabel,otherPlaceholder,showIf,required,multiline,placeholder,minWidth}` だけ（`:32-83,265-333`）で、`collectAsk`・`initialAskState` も知らない項目を見ない（F26）。画面の側で応答を検査していない（`AskController.ts:26-29,53-56`。結果の型は `packages/protocol/src/messages.ts:939-940` の型注釈だけ）。→ 壊れない・ページに分かれないだけ。古い画面が送る複数選択の値は定義の順（`AskDialog.vue:161`）で、サーバの検査は順を見ない（F26）。
- **F43 古い sodactl × 新しいサーバ**: 古い `normalizeAskSpec` は `paging`・`page` を知らない項目として無視して通し、**読んだままのオブジェクトを送る**（F28）ので、サーバには `paging`・`page` が届き、ページに分かれる。値が不正（`paging: "many"` 等）なら、sodactl の検査は通ってサーバが `invalid_ask_spec` を返し、sodactl が終了コード 2 にする（`packages/cli/src/commands/ask.ts:111-114`）。
- **F44 新しい sodactl × 古いサーバ**: 古いサーバが `paging`・`page` を落とす。新しい画面 × 古いサーバでは、部品は `paging` が無い＝`"auto"` として高さで分ける（F6）。
- **F45 配布物**: `packages/web` の `vite build` は `import` をたどって `dist` にまとめるので、Web の入口からたどれる所に `import` があれば部品は `dist` に入る（推測。F33）。`scripts/package.mjs` は `packages/web/dist` と `third_party/` を写す（F32）。部品は実行時に通信しない（F10）。共通の試験データはテストだけが読む。

## 影響範囲

- `packages/web/src/components/AskDialog.vue`（524 行の大半が部品へ移る）・`AskDialog.test.ts`（25 件。ライト DOM のセレクタ・`setValue`・`trigger` が Shadow DOM の中へ届かない）
- `packages/web/vite.config.ts`・`packages/web/vitest.config.ts`（`isCustomElement`）・型の宣言の置き場（`packages/web/src/` か `third_party/`）
- `packages/protocol/src/ask.ts`（`AskSpec.paging`・`AskQuestion.page`・`normalizeAskSpec`・`collectAsk`〔または `valueOf`〕・空の `showIf`）・`ask.test.ts`・新しいテスト（共通の試験データ）
- `packages/e2e/src/specs/ask-form.spec.ts`（22 件）・`ask-form-mobile.spec.ts`（1 件）と、ページングの E2E
- 新しく作るもの: 写した先（`ask-form.js`・`fixtures/*.json`・出どころの記録）・同期スクリプト（`scripts/`）・写したファイルのハッシュを確かめるテスト
- `NOTICE`・`docs/sodactl.md`（`:220-290` 付近「質問のフォーム」）・`docs/verification.md`（`:734-742` 付近）・`packages/cli/skills/sodactl/SKILL.md`（`:109-127`）
- 変わらないもの: `AskController.ts`・`store/ask.ts`・`App.vue` の置き方・サーバ `AskService`・sodactl `commands/ask.ts`（どれも `normalizeAskSpec` の結果を使うだけ）・`packages/e2e/src/support/ask.ts`
- public_docs の側（この作業では変えない。依頼になるもの）: `fixtures/normalize.json` の `sodashitsu` の欄 3 例・`SKILL.md:244` の記述

## 実現性 / リスク

- **R1 高さでのページ分けが、いままで 1 枚だった定義にも起きる**（F6・F23）。E2E の既存の `SPEC` に近い定義が 1280×720 で 2 ページになった（確かめ用のページでの実測。実物では未確認）。補足欄・`Tab` の行き先・`[data-ask-question]` の数え方に効く。あわせて、ページを移るたびにダイアログの高さが変わる（高さを固定しない場合）。
- **R2 即確定の `Space`**（F4・F16・F40）。既定が選ばれている選択肢での `Space`・クリックでは確定しない。いまの画面・`docs/sodactl.md:286`・AC9・E2E `ask-form.spec.ts:446-452`・単体テスト `AskDialog.test.ts:296-306` は「`Space` で確定」を前提にしている。部品は直さない決まり（requirements「対象外」）。
- **R3 固定の行にフォーカスがある間、`Ctrl+Enter`・`Alt+PageDown/Up` が効かない**（F4・F41）。開いた直後のフォーカスは固定の行（AC-I4）。`Ctrl+Enter` は枠から `el.submit()` を呼べるが、ページを移る公開のメソッドは無い（F1）。AC-I5 の「`Alt+PageDown/Up` が既定の動きを起こさない」も、固定の行にフォーカスがあるときは部品が止めない。
- **R4 絞り込みの欄が自動で付く**（F2・F14）。12 件以上の選択肢で付き、文字があるときの `Esc` は取り消しにならない。requirements は「絞り込みは渡らない」前提（対象外に `filter`）。確かめ用の定義（テーマ 13 件）で出る。
- **R5 値の表示が増える**（F2）。表示名と値が違う選択肢に値が出る（`showValue` を通さないので消せない）。pane のプログラムが内部の値を `value` に入れていると、それが利用者に見える。
- **R6 既存のテストの書き直しの量**（F18・F19・F22）。単体テストは Shadow DOM の中を `shadowRoot.querySelector` で探し、イベントは `composed: true` で作る必要がある。大きさが 0 なので高さでのページ分けは単体テストでは確かめられない（E2E だけ）。E2E は `script, img` の数（拡大表示の `img`）・`.ask-other-text`・`label.ask-opt`・`[data-ask-question]` の数・`querySelector` を使う 1 か所が変わる。
- **R7 部品が定義に書き込む**（F2・F20）。pinia のリアクティブなオブジェクトをそのまま渡すと、store の中身に `_image`・`_audio` が付く。再接続で `replaceAll` された定義は別のオブジェクトなので、`spec` を入れ直すと描き直しになる（いまも切断で一度閉じるので、入力が消える点は同じ。`AskController.ts:35-38`）。
- **R8 `__other__` という値の選択肢**（F15）。部品が「その他」と取り違える。検査は禁じていない。
- **R9 `paging: true` と小数**（F30）。`ask.py` は `true` を通し、部品は `"auto"` と同じに扱う。requirements は `true` を挙げていない。JS では `5.0` と `5` を区別できない。試験データに例が無い。
- **R10 型検査・ビルド**（F33・F34）。`packages/web` の外の素の JS・`packages/protocol/src` の外の JSON を `import` したときの `vue-tsc`・`tsc`・`vite build` の通り方は、推測で、走らせていない。
- **R11 写したファイルのバイトの一致**（F33）。改行の変換（`core.autocrlf`）でハッシュが変わりうる。`.gitattributes` に指定が無い。
- **R12 ライセンスの記載**（F36）。public_docs に `LICENSE` が無く、`NOTICE` に書くライセンスの名前が決まらない（同じ持ち主のリポジトリではある）。
- **R13 送信に失敗したときの表示**（F7）。`notify()` の文は次の入力で消える。いまはトースト（`AskController.ts:88-92`）で、ダイアログの中へ `Teleport` されている（`App.vue:104`）。
- **R14 ブラウザの差**: 実測は Chromium だけ。`:has()`・`color-mix()`・Shadow DOM の中のフォーカス・`Esc` と `cancel` の関係・`Alt+PageDown` は Firefox・Safari で未確認。いまの画面も `:has()`・`color-mix()` を使っている（`AskDialog.vue:438-440`）。

## 実装アンカー

- A1 `/workspaces/public_docs/docs/ClaudeCode/skills/other/ask-form/ask-form.js:798` `AskFormElement` — 公開の受け渡し（`spec` `:829`・`busy` `:835`・`submit` `:842`・`relayout` `:844`・`notify` `:846`・`value`／`pageCount`／`contentHeight` `:848-850`）
- A2 同 `:877` `unsupported` — 出せない定義の判定。`:852` `#render` — 出せないときの表示と `ask-unsupported`
- A3 同 `:741` `onKey`／`:776` — キーの扱いとリスナーの場所。`:726-733` — 即確定
- A4 同 `:570` `setPages`・`:584` `go`・`:617` `autoPages`・`:787` `contentHeight`・`:819` `ResizeObserver`
- A5 同 `:28-159` `STYLE` — 変数（`:30-35`）・モバイル（`:156-158`）
- A6 同フォルダ `form.html` — 置く側の手本（`ask-submit`・`ask-cancel`・`Esc`・`busy`・`notify`・`fit()`）
- A7 `packages/web/src/components/AskDialog.vue:90` 開閉の `watch`／`:116` `closeDialog`／`:130` `restoreFocus`／`:202` `submit`／`:223` `cancel`／`:230` `onNativeCancel`／`:235` `onKeydown`／`:259-263` 枠と固定の行／`:340-373` 枠の CSS
- A8 `packages/web/src/components/AskDialog.test.ts:51` `mountDialog`・`:65` `open`・`:70` `submitBtn` — テストの土台
- A9 `packages/web/src/ask/AskController.ts:62` `answer`・`:73` `cancel`・`:82` `failed`
- A10 `packages/web/src/App.vue:100` `<AskDialog />`・`:104` `Teleport`
- A11 `packages/web/vite.config.ts:9`・`packages/web/vitest.config.ts:5` `vue()` — `isCustomElement` を足す場所
- A12 `packages/web/tsconfig.json`・`tsconfig.typecheck.json` — `include`・`types`
- A13 `packages/protocol/src/ask.ts:44-75` 型／`:153` `normalizeAskSpec`（全体の項目 `:168-185`・質問の項目 `:211-231`・`showIf` `:275-285`・組み立て `:293-296`）／`:161` `str`／`:338` `valueOf`／`:351` `collectAsk`／`:378` `checkAskAnswer`／`:312` `initialAskState`
- A14 `packages/protocol/src/ask.test.ts:16` JSON の `import`・`:18-28` `spec`／`bad`
- A15 `packages/cli/src/commands/ask.ts:63` `readAskSpec`・`:113` `invalid_ask_spec` の読み替え
- A16 `packages/server/src/ask/AskService.ts:100` `open`
- A17 `packages/e2e/src/specs/ask-form.spec.ts:22` `dialog`・`:25` `openBrowser`・`:13-20` `SPEC`／`ask-form-mobile.spec.ts:11`／`packages/e2e/src/support/ask.ts:19` `ASK_FIXTURE_PATH`・`:34` `runAsk`・`:92` `watchAskSubscriptions`
- A18 `packages/server/src/http/HttpServer.ts:23-29` `SECURITY_HEADERS` — CSP
- A19 `third_party/herdr/README.md`・`NOTICE:1-13` — 出どころの書き方の先例
- A20 `scripts/package.mjs:44-48` — 配布物に入れるもの。`scripts/vitest.config.ts`・`scripts/migrate-from-wtm.test.ts` — スクリプトのテストの先例
- A21 `packages/client-core/src/theme/uiTokens.ts:16` `CSS_VARS`・`packages/web/src/theme/ThemeController.ts:117` `apply`・`packages/web/src/App.vue:117-139` `:root`
- A22 `/workspaces/public_docs/docs/ClaudeCode/skills/other/ask-form/ask.py:83` `normalize`（`paging` `:129-131`・`page` `:140-141`・`showIf` `:154-160`）
- A23 `docs/sodactl.md:220-290`・`docs/verification.md:734-742`・`packages/cli/skills/sodactl/SKILL.md:109-127` — 直す文書
- A24 E2E で CSP の違反を観測する既存の道具 — 未特定（先例なし）
- A25 写したファイルのハッシュを確かめる既存の道具 — 未特定（先例なし）

## 実装時の注意

- **`spec` を入れるたびに描き直す**（F1）。Vue の描き直しのたびに新しいオブジェクトを入れると入力が消える。`busy` の切り替えは描き直さない。
- **ダイアログが閉じている（`display: none`）間に `spec` を入れると高さ 0 で、ページ分けは `ResizeObserver` 待ちになる**（F6）。開いたあと最初に高さが付いた時点で 1 回だけ走り、その後は `relayout()` を呼ばない限り走らない。次の質問で `spec` を入れ替えると `#sized` は戻る（`js:854`）。
- 部品の中のキーは `stopPropagation` されるので、枠の `@keydown` には届かない（`Ctrl+Enter`・`Alt+PageDown/Up`・入力欄の `Enter`・即確定の `Enter`）。届くのは部品が扱わなかったキーで、`ev.target` は `<ask-form>` に付け替わる（いまの `closest(".ask-header, .ask-main, .ask-footer")` の判定 `AskDialog.vue:238` はそのままでは合わない）。
- 部品の外へ出るイベントは `composed` なので、`<ask-form>` にも `<dialog>` にもリスナーを付けられる。`ask-unsupported` はマイクロタスクで遅れて出る（`spec` を入れた直後には出ていない）。出せないときは部品にボタンが無い。
- 隠れた質問・ほかのページの質問は DOM に残る（`hidden`／class `off`）。「出ている質問」を数える・探すときは見え方で絞る。
- フォーカスが部品の中にあると `document.activeElement` は `<ask-form>`。中の要素は `el.shadowRoot.activeElement`。
- `wrapper.find` 等（`@vue/test-utils`）と `querySelector` は Shadow DOM を越えない。Playwright の CSS ロケータは越えるが、`evaluate` の中の `querySelector` は越えない。
- 単体テストでは大きさが 0（F19）。高さでのページ分け・`contentHeight` は E2E でしか確かめられない。
- `normalizeAskSpec` は出力を作り直す方式なので、`paging`・`page` は写す行を足さない限り落ちる。`exactOptionalPropertyTypes` のため、無い項目は `undefined` を入れずに項目ごと省く（いまの書き方 `:176,228,294-295` と同じ）。
- `str()` は文字列でない値を黙って捨てる。`page` の「文字列でなければ誤り」には使えない（F25・F30）。検査の順（`type` より前に `page`）も `ask.py` と合わせるかで、対応していない型の質問にある不正な `page` の扱いが変わる（いまは対応していない型の質問は中身を見ずに飛ばす。`:205-209`）。
- 試験データは「`expect.spec` に書いた項目だけ比べる」・誤りは `reason` で比べる（F29）。Sodashitsu の誤りには `reason` が無いので、テストの側で `message` から分類へ対応づけるか、`Fail` に分類を足すかになる。`sodashitsu` の欄がある例はそちらが期待値。
- `collectAsk` の順を直すと、「その他」の入力は最後のまま・選択肢にある値だけを定義の順に、が試験データの形（「その他（複数選択）: 選んだ値の後ろに入力が入る」）。
- `checkAskAnswer` は順を見ない（F26）ので、古い画面・新しい画面のどちらの回答も通る。
- 部品のラジオの `name` は質問の id そのもの。Shadow DOM の中なので、外の同名の入力とは群にならない。
- 部品の `kbd`（「Esc」「Ctrl+Enter」「Alt+PgDn」）はボタンの文字に含まれる。E2E・単体テストでボタンの文言を完全一致で見ると合わない（幅 767px 以下では消える）。
- 定義の `submit` は部品のボタンに出る。`title` は部品の `h1` に出る（枠の固定の行 `h2` とは別。見出しの順は `h2` → `h1` になる）。
- 写したファイルは `eslint`（`.ts` だけ）・`tsc`（`include` の外）の対象にならない。`scripts/tsconfig.json` は `*.ts` だけを見るので、同期スクリプトを `.mjs` で書くと型検査されない。
- `docs/sodactl.md:286` は「`form.html` は矢印キーで移っただけでも決定する」と書いている。部品 1.0.0 は矢印では決定しない（F4）ので、この記述は合わなくなる。

## design への申し送り

判断はしない。未確定事項ごとに、選べる案と事実だけ。

1. **写した先の場所・読み方**
   - `third_party/ask-form/`: 先例（`third_party/herdr/`・`NOTICE`・`README.md`）に合う。`scripts/package.mjs` が丸ごと配布物に入れる。Web からは `packages/web` の外への相対の `import`（Vite は対応・型は別に要る。F33。ビルドは未実測）。
   - `packages/web/src/` の中: `tsconfig` の `include` に入るので、`allowJs` 無しでは型の宣言が要る点は同じ。`third_party` の先例からは外れる。試験データは protocol のテストも読むので、Web の中に置くと protocol から Web のフォルダを読む形になる。
   - 型: (a) 副作用だけの `import` ＋ Web の側に要素の型（`spec`・`busy`・`submit()`・`notify()` 等）を宣言／(b) 写した JS の隣に手書きの `.d.ts`（写したフォルダに手書きのファイルが混ざる）／(c) `allowJs`。
   - 試験データを protocol のテストが読む方法: `fs` で読む（先例 F34）／JSON の `import`（`rootDir` の外。未確認）。
2. **同期スクリプトの取り方**: 手元の clone（`/workspaces/public_docs`。パスを引数か環境変数で）から `git show <commit>:<path>` で取る／GitHub から取る（remote は `https://github.com/asaomaro/public_docs`。ネットワークを使うスクリプトの先例は無い。raw の URL は試していない）。記録するのはコミット（フォルダの最後のコミットは `94a5ef6…`）と各ファイルのハッシュ。改行の変換への備え（`.gitattributes`）を足すか。
3. **`ask-unsupported` の扱い**: 部品はボタンを描かない（F2）。検査済みの定義では、型・形の理由では起きない見込み（サーバが `single`・`multi`・`text` と選択肢を検査済み）。起きうるのは `mount` の例外（F15 の `__other__` など）。案: 取り消す（`controller.cancel`＝sodactl には `cancelled`）／枠にボタンを出して利用者に閉じてもらう／トーストで知らせる。`unavailable` を返す経路は、いまの `ask.cancel`・`ask.answer` には無い（`AskController.ts`）。
4. **`Esc`**: この作業の範囲で部品が `Esc` を取るのは「絞り込みの欄に文字があるとき」だけ（F14）。そのとき `<dialog>` の `cancel` は起きない（Chromium の実測）。絞り込みの欄は 12 件以上の選択肢で自動で付き、止めるには定義に `filter: false` を入れる（＝`normalizeAskSpec` か枠が足す）しかない。受け入れるなら AC-I1・AC-I2 の `Esc` の記述との関係を決める。
5. **即確定の `Space`（R2）**: 案: 部品のまま（既定が選ばれているときの `Space` は効かない。AC9・docs・E2E を合わせる）／枠が補う（部品が扱わなかった `Space` の `keydown` は枠へ届くが、`target` は `<ask-form>` に付け替わる。中の要素は `composedPath()`・`shadowRoot.activeElement` で分かる）／ask-form の側へ直しを依頼する。
6. **固定の行にフォーカスがある間のキー（R3）**: 案: 枠が `Ctrl/Cmd+Enter` を受けて `el.submit()`／開いたときのフォーカスを部品へ移す（AC-I4「操作部品ではない」との関係。部品の要素そのものは `tabindex=-1` を付ければフォーカスでき、操作部品ではない——`form.html` の方法）／`Alt+PageDown/Up` は部品に公開のメソッドが無いので、枠からは部品の中のボタン（`[data-ask-next]`）を押すか、部品へキーを送り直すか、ask-form の側へ依頼する。
7. **ダイアログの高さ**: 案: いまのまま中身に合わせる（`max-height` で判定される。ページごとに高さが変わる。F6 の実測）／高さを固定で与える（変わらないが短いページで下が空く）／`form.html` と同じ手順（最大の高さを与える → `relayout()` → `contentHeight` に合わせる。`contentHeight` は部品の中身と下のボタンの分で、固定の行の高さは枠が足す）。あわせて、**いままで 1 枚で出ていた定義がページに分かれる**こと（R1）を受け入れるか、既定を変える（`paging` が無いとき枠・サーバが `false` を入れる等。AC4 は「書かず、収まらないときは自動で分かれる」）か。
8. **`paging` の値の範囲（R9）**: `true` を通すか（`ask.py` は通す・部品は `"auto"` 扱い・AC11 は挙げていない・試験データに例なし）。正規化後に `paging` の既定（`"auto"`）を埋めるか（試験データの「最小の定義」は `paging` を書いていない＝どちらでも一致する）。`page: null`・空文字の扱い（`ask.py` は `null` を無し扱い・空文字は通す）。`page` の長さ超過の分類（試験データの `too_large`「上限の超過（Sodashitsu だけ）」）。
9. **誤りの分類**: 試験データは `reason` で比べる。`normalizeAskSpec` の `Fail` に分類を足す（protocol の型が変わる。sodactl・サーバは `message` と `unsupportedType` だけを使う）／テストの中だけで `message` → 分類の表を持つ。
10. **試験データの `sodashitsu` の欄 3 例**（「ページ: …」「誤り: paging の値」「誤り: page が文字列でない」）: `page`・`paging` を通すと、欄の期待（落とす・通る）と食い違う。欄を外してもらうまで（ask-form の側のコミットが進むまで）の扱い: 固定するコミットを欄が外れた後のものにする／テストの側で 3 例だけ本来の `expect` を使う。「誤り: 知らない型」の欄（`unsupported_type`）は残る。
11. **送信に失敗したとき（R13）**: いまのトースト（`AskController` が出す）のまま／部品の `notify()` も使う（次の入力で消える）。`busy` を戻す必要はどちらでもある（`el.busy = false`）。
12. **`__other__`（R8）・値の表示（R5）・絞り込み（R4）**: 部品は直さない前提で、検査で断る・通す項目（`showValue`・`filter`）を足す・そのまま受け入れる、のどれか。`showValue`・`filter` は requirements では作業 B の側（`filter`）か、挙がっていない（`showValue`）。
13. **テーマの割り当ての場所**（F38）と、任意の 3 つ（`--ask-card`・`--ask-muted`・`--ask-accent-soft`）を渡すか（渡さなければ `color-mix` で作られる。Sodashitsu には `--soda-menu-hover-bg`・`--soda-subtle-bg` 等がある。`uiTokens.ts:16-36`）。
14. **`isCustomElement` の設定**か、要素を命令的に作るか（F20）。前者は `vite.config.ts` と `vitest.config.ts` の両方に要る。
15. **ライセンスの書き方**（R12）: public_docs に `LICENSE` が無い。`NOTICE` に何と書くかは持ち主（利用者）の確認が要る。
16. **ask-form の側へ伝える候補**（この作業では直さない）: 選ばれている選択肢での `Space`／ページを移る公開のメソッド／`aria-current` の値と未回答の `aria-invalid`／画像が無いときも描かれる拡大表示の `img`／`__other__` の取り違え／`SKILL.md:244` の記述。
