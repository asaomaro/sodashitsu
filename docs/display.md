# 表示の面（パネルと帯。`sodactl display`）

pane の中で動くプログラムが、その pane を見ているブラウザの画面に、**パネル（端末の右）か帯（端末の上）**を出して、進捗・結果・操作のボタンを見せ続けるしくみ（20261007-soda-extensions）。
ブラウザ版だけの機能で、端末版（引数なしの `soda`）には面が出ない（`docs/tui-parity.md`）。

- コマンドの形と終了コードは `docs/sodactl.md`、ここは「何が画面に出るか」「中身の書き方」「隔離のしくみと限界」。
- 形式は 4 つ。**静的な形式（`text`・`markdown`・`html`）では中身の中のスクリプトは動かない**（取り除かれる）。**スクリプトを動かしたいときだけ `script-html`**（下の「スクリプトが動く形式」。信頼できない中身には使わない）。

## 使い方

```sh
# 進捗をパネルに（pane の中ではログイン不要）
sodactl display set progress --kind panel --title 進捗 --html-file ./progress.html

# 結果を帯に（標準入力 + --format）
printf '# 結果\n- 緑 3\n- 赤 0' | sodactl display set result --kind band --format markdown

# 同じ名前の set は置き換える（枠は作り直さない）
sodactl display set progress --kind panel --text '90%'

sodactl display list                    # この pane の面の一覧
sodactl display close progress          # 閉じる（--all で全部）
```

操作を待つ:

```sh
cat > ask.html <<'HTML'
<p>デプロイしますか？</p>
<button data-soda-action="deploy" data-soda-value="prod">本番へ</button>
<button data-soda-action="cancel">やめる</button>
HTML
sodactl display set confirm --kind panel --html-file ask.html --wait --timeout 60000
# -> {"status":"ok",…}  の後、利用者が押すと
# -> {"type":"display.action","name":"confirm","rev":1,"action":"deploy","data":{"value":"prod"},…}
```

- 続けて受け取るなら `sodactl display events`（最初の行が `display.ready`）。1 回だけなら `display wait <名前>`。
- 使えるかは先に `sodactl display --features` で確かめる（`server` が `null` なら古い `soda`）。古い `soda` では各コマンドは `{"status":"unsupported",…}`（終了コード 0）。

## 中身の 3 つの静的な形式

| 形式 | 描き方 | 操作 |
|---|---|---|
| `text` | 文字のまま（`<pre>`）。`<b>` なども文字として出る | 持てない |
| `markdown` | 整形する（見出し・表・コード・リスト）。mermaid は図にせずコードのまま | 中に書いた HTML の `<button data-soda-action>` が使える |
| `html` | HTML として描く。`<style>` と `style` 属性は効く | `data-soda-action` と フォーム |

どの形式も **2 MiB（UTF-8）まで**。題は 80 文字まで（制御文字は不可）。パネルの幅（`--size`）は 160〜800px・帯の高さは 24〜96px。

### 取り除かれるもの

隔離は枠（下の「隔離のしくみ」）が担い、取り除きは二重の守り。中身を文書に入れる前に次を消す。

- 要素: `script`・`meta`・`link`・`base`・`iframe`/`frame`/`frameset`・`object`/`embed`/`applet`/`portal`・`map`/`area`・`math`・`audio`/`video`/`source`/`track`・`noscript`・SVG の SMIL（`set`・`animate` ほか）と `foreignObject`・`input type=file`/`image`。SVG の中の `a` は中身を残して外す。
- 属性: `on` で始まるもの全部・`autofocus`・`srcdoc`・`action`/`formaction`・`target`・`ping`・`background`・`http-equiv`・`srcset`。
- リンク: `#` で始まるものは残る。`http://`・`https://`（小文字）は新しいタブで開く（`rel="noopener noreferrer"`）。`javascript:`・`data:`・相対・`//host` は `href` が外れ、行き先が `title` に出る。
- **要素の名前の上書き（DOM clobbering）に備えている**: 中身の `<form><input name="attributes">`・`<img name="createElement">` は、`form.attributes`・`document.createElement` などを差し替える。取り除きと枠のスクリプトは、中身の要素・`document` のプロパティを直接読まず、読み込み時に控えたプロトタイプのメソッド・getter を使う。
  描画が例外で失敗しても、枠は次の `render` を受け、親へ知らせる（枠の場所に「この表示を描けませんでした」。次の更新で消える）。取り除きだけが破れても、枠の CSP が実行を止める（二重の守り）。
- 画像: `data:image/`（png・jpeg・gif・webp・svg+xml）だけ。外の URL の `src` は外れる。外の stylesheet・`@import`・`url()` の背景・フォントは、枠の CSP が止める（要求が出ない）。

## 操作（`data-soda-action`）

- `<button data-soda-action="名前" data-soda-value="値">` を押すと、待っている側に `display.action` が届く。`data-soda-value` が無ければ `value` 属性を使い、どちらも無ければ `data` なし。`disabled` は拾わない。
- `<form data-soda-action="名前">` の送信は、欄の値（文字列だけ。同じ名前は最後の値）と押したボタンの `name`/`value` を `data` にして届ける。**実際の送信（ページの移動）は起きない**（`action` は消える・枠の CSP が `form-action 'none'`・`submit` を必ず止める、の三重）。`data-soda-action` の無い `form` は何も送らない。
- 名前は `[A-Za-z0-9_.:-]` の 1〜64 文字。値の組は 64 まで・欄の名前は 64 文字まで・値の JSON は 8 KiB まで。外れた操作は送られない。
- 行には、押した時点の中身の版 `rev` が付く。`set` の結果の `rev` と違えば、古い中身で押されたと分かる（サーバは捨てない。判断は呼び出し側）。
- 毎秒 20 回を超えた操作は捨てる。2 つ以上のブラウザが開いていても、押せば 1 件。

### 枠の中で使える CSS の変数

枠の中の既定のスタイルは、アプリの配色に合わせて変わる。自分のスタイルで使えるのは、アプリの `--soda-*` の変数（`--soda-bg`・`--soda-fg`・`--soda-accent`・`--soda-accent-fg`・`--soda-menu-bg`・`--soda-menu-border`・`--soda-subtle-bg`・`--soda-error-fg`・`--soda-warn-fg` など）。明暗は `:root` の `data-dark="1"|"0"` で分かる。変数は次の `render`（中身の更新）で追従する。

## 行の決まり（stdout）

`display wait`/`events`/`set --wait` は 1 行 1 つの JSON を出す。読み手は**知らない `type`・項目を無視する**。

| `type` | 意味 |
|---|---|
| `display.ready` | `events` の最初の行。`v`・`paneId`・`epoch`・`features`・`renderers` |
| `display.action` | 利用者の操作。`name`・`rev`・`action`・`data?`・`seq`・`at` |
| `display.closed` | 面が閉じた。`reason`（下）・`name`・`seq` |
| `display.dropped` / `display.reset` / `display.timeout` / `display.end` | 取りこぼし・サーバの再起動・時間切れ・終わり（`docs/sodactl.md`） |

`display.closed` の `reason`: `closed`（プログラムの `close`）・`dismissed`（利用者が［×］）・`expired`（`--ttl-ms`）・**`navigated`（枠が別のページへ移ったので、アプリが止めた）**・**`unresponsive`（枠が 10 秒返事をしないので、アプリが止めた）**。知らない理由は「閉じた」として扱う。
`navigated`・`unresponsive` のときは、画面にトースト「表示『名前』は、別のページへ移ろうとしたので閉じました」／「…応答しなくなったので閉じました」が 1 回出る。

終了コードは `docs/sodactl.md` の「終了コード」と同じ（`unsupported` は 0・使い方の誤りは 2・待ちの上限などは 1）。

## どの画面に出るか

- 画面（ブラウザ）が名乗った種類（`panel`・`band`・`actions`）の数が、`set` の結果の `renderers`。**ブラウザが開いていなくても `set` は成功する**（`renderers` が 0）。後から開いたブラウザには、そのとき出ている面が出る。
- 同じ pane を見ているブラウザは全部に出る。たたむ・選んでいるタブ・パネルの幅は、その画面ごと。［×］（利用者が閉じる）は全部の画面から消える。
- 別の tab・workspace を見ている画面は、切り替えたときに中身を取る。たたんだパネルは中身を取らない。
- 別のマシン（`--machine`）の pane の面も、そのマシンを表示している画面に出る。
- 面は `soda handoff`・再起動で消える（保存しない）。pane を閉じると、その pane の面は消える。

### 数と大きさ

| 上限 | 値 |
|---|---|
| 1 つの中身 | 2 MiB（UTF-8） |
| サーバ全体の中身の合計 | 32 MiB |
| 面の数 | pane ごとに パネル 4・帯 2、サーバ全体で 64 |
| `set` の頻度（pane ごと） | 続けて 10 回まで（1 秒に 10 回ぶん戻る）。量は続けて 8 MiB まで（毎秒 2 MiB 戻る） |
| `wait` の待ち | pane ごとに 4・サーバ全体で 32 |

超えた `set` は `display_limit`（数・合計）か `display_busy`（頻度）で断られ、既にある面は変わらない。

## パネルと帯の見た目

- パネルは端末の右。開閉・幅の変更で、その pane の端末の列数が変わる（端末は 40 列は残す）。帯は端末の上で、高さの合計が pane の高さの 3 分の 1 を超える分は「ほか N 件」の 1 行になる。
- 見出し（アプリが描く固定の部分）は「pane のプログラムの表示（隔離）· 〈面の名前〉」。面の名前は `[A-Za-z0-9_-]` だけなので、似せた文言を入れられない。題は別に文字として出る（HTML にならない）。中身・題から、この文言・印の位置・色は変えられない（枠は自分の箱の外へ描けない）。
- 複数のパネルはタブ（矢印・`Home`・`End`）。たたむと幅 24px の見出しだけになる（押すと戻る）。pane が狭くて出せないときは自動でたたまれる。帯の左端には「▍表示」の印。
- 右クリックの pane のメニューに「表示をすべて閉じる」（面があるときだけ）。

### 幅のつまみ

パネルの左の縁（端末との境目）をドラッグして、幅を変えられる。

- ドラッグの間は**幅を変えず**、境目の案内の線だけが動く（離した瞬間に 1 回だけ端末の大きさが変わる）。`Esc` で取り消し、ダブルクリックでプログラムの指定の幅（`--size`）に戻る。
- キーボード: つまみに `Tab` で届き、`←` で 16px 広く・`→` で 16px 狭く（`Shift` を足すと 64px）・`Home` で最小・`End` で最大・`Enter` で指定の幅へ。
- 範囲: 最小 160px。最大は pane の幅の半分と、端末を 40 列残す幅の小さい方。
- 優先: 利用者が変えた幅 ＞ プログラムの `--size` ＞ 既定 320px。pane ごとに 1 つで、タブを替えても同じ。**その画面（ブラウザ）が覚える**（`localStorage` の設定。共有の設定には送らない。64 件まで・もう無い pane の分は捨てる）。別のブラウザや別の端末には引き継がれない。戻すにはダブルクリック（か `Enter`）。
- モバイルの重ね表示には出さない。帯の高さは利用者は変えられない。

### 操作中の表示

枠の中にフォーカスがある間（クリックした・`Tab` で入った・`prefix+i` で移った）は、枠の縁が 2px の強調色になり、見出しに「入力はこの表示に届きます（Esc で端末へ）」と出て、その pane の端末が薄くなる。**キーは別の文書（枠）へ入るので、端末には届かない**。`Esc` で端末へ戻る。枠の中で prefix のキーを押すと端末へ戻って prefix の状態になる。

### キーの操作

`prefix+i`（`focus_display`。設定で変えられる）で、フォーカス中の pane のパネル（たたんであれば戻す）、無ければ最初の帯の枠へ移る。面が無ければ「この pane に表示はありません」。モバイルでは、パネルの枠が端末の横に無いので、重ね表示を開く（トーストは出さない。帯は枠へ移る）。端末版では「ブラウザで使えます」と知らせる。
枠にフォーカスがある面が消えたら、その pane の端末へ戻る。面の出現・更新・消滅では、アプリは `focus()` を呼ばない（打っている最中のフォーカスを奪わない）。

### モバイル

幅 767px 以下の画面（1 列のレイアウト）では、パネルは端末の横に出ない。上部のバーに［表示N］のボタンが出て、押すと重ね表示（ダイアログ）が開く。［閉じる］は重ね表示だけを閉じ（面は残る）、［この表示を消す］は面を閉じる。幅のつまみは出ない。帯は端末の上に出る。パネルを出しても端末の箱・列数は変わらない。

## スクリプトが動く形式（`script-html`）

`html` と違い、**中身の中のスクリプトが、枠の中で動く**形式。動くグラフ・絞り込みのできる一覧・自分で更新する表示のために使う。静的な形式（`text`・`markdown`・`html`）の守り（取り除き・`script-src 'self'`）は、この形式では**かからない**——代わりに、別の仕組み（下の「3 つの備え」）で守る。

```sh
# 中身は 1 つの HTML ファイル。ライブラリ（Chart.js など）は中身に埋め込む（外の URL は読めない。2 MiB まで）
sodactl display set chart --kind panel --title 件数 --script-html-file ./chart.html
# 標準入力なら --format script-html
cat chart.html | sodactl display set chart --kind panel --format script-html

# 拡張からスクリプトへデータを送る（保存されない。--json か標準入力。64 KiB まで）
sodactl display send chart --json '{"labels":["月","火"],"values":[3,7]}'
```

中身のスクリプトから使える `window.soda`:

| | |
|---|---|
| `soda.action(name, data?)` | 操作を返す。静的な形式の `data-soda-action` と同じ `display.action` になる（名前・値・上限も同じ。値は文字列の組で 8 KiB まで）。規則の外は `false` を返して何も送らない。行には `source: "script"` が付く |
| `soda.onMessage(fn)` | `sodactl display send` のデータを受ける関数を登録する。戻り値は登録を外す関数。1 つが投げても、ほかの関数は呼ばれる |
| `soda.theme` | `{ dark, vars }`。アプリの配色（`--soda-bg` など）。同じ値が `:root` の CSS の変数にも当たっている |
| `soda.version` | `1` |

- `send` は**保存されない**: あとからつないだ画面・たたんでいた画面には届かない。拡張は、状態の全体を送り直せる形にする。
- `set` し直す（同じ名前でも）と、枠は**作り直される**（スクリプトの状態は消える）。`send` では作り直されない。
- **`message` を受けるなら、送り主を確かめる**: 同じ pane の別の面は、`postMessage` を送り合える（下の実測）。確かめずに `soda.action` を呼ぶ作りだと、別の面から操作を引き出される。
- 後から `document.write` し直さない（頁を書き直してしまい、`load` が起きるとアプリが閉じる）。`location` を書き換えない。
- `<script src>` は読めない（CSP）。インラインにする。`defer`/`async`/`type="module"` は、文書の順に差し込まれる（`module` は非同期で、差し込みの直後）。
- ふつうの頁と違う点: 中身は、枠の頁に **DOM として差し込んで**動かす（`document.write` は使わない）。インラインのスクリプトは文書の順に動き、`DOMContentLoaded` と `load` は差し込みのあとで 1 回ずつ起こす（`<body onload>` も動く。`document.readyState` は `complete`）。親から見た枠の `load` は 1 回のまま。

### 静的な形式との使い分け

**信頼できない中身（外から取ってきた HTML・他人が書いたもの）を `script-html` で出さない。静的な `html` で出す。** `script-html` のスクリプトは、枠の中でなんでもできる（下の「できること・できないこと」）。pane のプログラム（エージェント）は、どちらの形式を出すかを自分で選べ、利用者が形式を縛る手段は、この版には無い。
危ない操作の承認には `sodactl ask` を使う。`source: "script"` の操作は、**利用者が押したとは限らない**（スクリプトは `soda.action` を自分で呼べて、`rev` も偽れる）。承認の印として扱わない。

### 固定の印と、操作の始め方

- 見出しの固定のラベルの先頭に、固定の印**「スクリプト」**（警告の色。`title` に「この表示は、pane のプログラムのスクリプトを動かしています」）が付く。帯・モバイルの重ね表示も同じ。題・中身から消せず、静的な形式の面には付かない。
- **利用者が操作を始めるまで、枠は覆いの下**にあり、キーもポインタも枠に届かない。**操作を始める入口は 2 つだけ**: 見出しの固定の［操作する］ボタン（帯は［×］の左、モバイルは重ね表示の見出し。`Tab` で届く）と、`prefix+i`。**枠の中・覆いを押しても始まらない**（覆いを押すと、［操作する］を 1 秒だけ強調して場所を教える）。覆いの上のホイールは、枠の文書のスクロールになる。
- 始めた押下・キーの残りは枠に届かない: ポインタは `click`（＝上がった後）で、`Enter`/`Space`/`prefix+i` はそのキーの `keyup` を親が受けて処理が済んでから、始める（`pointerup`・`mouseup`・`touchend`・`keyup` を中身が受けないことを E2E で確かめている）。
- 操作中は、静的な形式と同じ「操作中の表示」（縁の強調色・「入力はこの表示に届きます（Esc で端末へ）」・端末が薄くなる）。`Esc`（と、端末を押すこと）で端末へ戻り、覆いと［操作する］が戻る。**操作中の枠の中で prefix を押しても、アプリの操作にはならない**（`Esc` で戻ってから押す）。
- `set` で版が替わる・形式が替わると、操作中は解けて、新しい枠は覆いの下に戻る。

### 土台の乗っ取りへの備え

中身のスクリプトは土台と同じ `window` で動き、プロトタイプ・グローバルを差し替えられる。土台（`script.html` の中の 1 つのスクリプト）は、**読み込み時（中身が動く前）に、使う関数・getter・setter・コンストラクタを全部控え**、実行時に `.call`・`.apply`・`.bind`・配列のメソッド・`for...of` を使わず、控えた `Reflect.apply` だけで呼ぶ。port へ送る物・設定の物・受け手の名簿は、`Object.create(null)` と控えた `defineProperty` で作る（`Object.prototype` の setter・`Array.prototype` の差し替えの影響を受けない）。`Esc` の受け手は、読み込み時（＝中身より先）に `window` の capture へ付け、本物の（`isTrusted` の）キーだけを見る（`KeyboardEvent.prototype.isComposing` の差し替えにも影響されない）。
中身が `isComposing`・`Function.prototype.call`・`Object.prototype` を差し替えても、`Esc`・`ping`・`soda.action`・`onMessage` が動き、差し替えた関数が port を受け取らないことを、E2E で確かめている。**それでも、中身が port 自体を拾う・頁を書き直す等は、枠の中のことなので止められない**（枠の外は守られる）。

## 3 つの備え（スクリプトが動く形式）

1. **(a) 操作中をはっきり見せる**（上のとおり。操作中は見出しに［操作を終える］が出る）。
2. **(b) 利用者が操作を始めるまでは、フォーカスを元の場所へ戻す**: 操作中でないのに、枠（のスクリプト）が `window.focus()`・要素の `focus()` でフォーカスを取ったら、アプリはすぐ、取られる前にいた場所へ戻す（覚えているのは、最後にフォーカスのあった、表示の枠・覆い・［操作する］でない要素。無い・`body` のときは、利用者が選んでいる pane の端末）。戻ったかを確かめ、だめなら `blur()` してもう 1 回。それでもだめなら、**その画面の枠を外して**「この表示は、キー入力を取ろうとしたので、この画面では止めました」と［もう一度出す］を出す。
   同時に、画面が見えていれば、サーバへ「1 回取られた」と知らせる。**数えて閉じるのは、サーバ**:
   - 回数は **pane ごと**（面の id・名前・画面・接続に依らない。`close` → `set` の出し直し・別の名前の面・再読み込み・利用者が操作を始めたこと、のどれでも 0 に戻らない。時間でも数え直さない）。
   - **3 回**に達したら、その pane の**スクリプトが動く面を全部閉じ**（`display.closed` の理由 `focus_steal`。利用者にはトースト「表示『…』は、キー入力を取ろうとし続けたので閉じました。この pane は、しばらくスクリプトが動く表示を出せません」）、**5 分間**、その pane の `script-html` の `set`（同じ名前の置き換えを含む）は `display_busy`（終了コード 1）で断られる。静的な形式は出せる。5 分ちょうどで明け、回数も 0 に戻る。
   - 知らせは操作の頻度の制限に入れず、捨てない（中身が `soda.action` を毎秒 200 回流しても、3 回で閉じる）。面を閉じた直後・形式を替えた直後の知らせも、知らせに添えた pane と形式で数える。
   - 片づけのとき（面が閉じる・版や形式が替わって枠が外れる）に、操作中でないのにフォーカスが枠にあれば、それも 1 回の知らせとして送ってから外す。
   - **回数は、冷却が明けるか pane が閉じるまで戻らない**（1〜2 回の横取りは、長く残る。時間で薄れない）。
   - **フォーカスの脱落**: 枠が `window.focus(); parent.focus()` を同じタスクで呼ぶと、親の `document.activeElement` は枠でなく `body` になり、端末へ打った文字が届かなくなる（枠が取った形跡が親から見えない）。画面にスクリプトが動く枠が載っているあいだ、アプリは「アプリの要素にあったフォーカスが、**本物のポインタ・タッチの操作なしに** `body` へ落ちた」ことを見て（文書がフォーカスを持たないとき・直前に別のウィンドウから戻ったときは除く。キーの操作は excuse にしない——打っている最中に落とされるのが止めたい被害）、元の場所へ戻し、横取りとして数える。**どの面が起こしたかは分からないので、数え方は次のとおり**: 利用者が選んでいる pane にスクリプトが動く面があれば、その pane の面に 1 回。無ければ、スクリプトが動く面が載っている pane のそれぞれに 1 回（早く閉じる側に倒す）。サーバが pane ごとに 3 回で冷却に入れる。
     限界: アプリ自身が、利用者の操作なしにフォーカスのある要素を取り除いて `body` へ落ちた場合も、同じに見える（元の場所へ戻し、1 回数える）。
   - **`set` で面を更新すると枠ごと作り直され、操作中のフォーカスと入力が失われる**。定期的な更新・状態の送り込みには、`sodactl display send`（枠は作り直されない）を使う。
3. **(c) 枠が別のページへ移ったら、捨てて知らせる**（どの形式でも）: 親から見た iframe の `load` が**2 回目**なら、必ず「移った」として枠を外し、面を閉じる（`display.closed` の理由 `navigated`）。スクリプトが動く形式では、さらにその pane は冷却に入る（上と同じ 5 分）。
   移った先は、通り道も中身も受けず、操作も送れない（枠ごとの合い札を、最初の合図 1 回だけ受ける）。見えている画面で 10 秒返事が無い枠も閉じる（理由 `unresponsive`。冷却には入らない）。

### よそからフォーカスが来たとき（静的な枠）

スクリプトの面が `parent.frames[i].focus()` で、同じ pane の**静的な面**へフォーカスを移そうとする場合に備える。**実測（Chromium 153）では、呼べるが、フォーカスは移らなかった**（利用者が操作を始めて枠の中をクリックした後に呼んでも）。移るブラウザでは、次のとおり働く（単体テストで確かめた。E2E では、このブラウザで移らないので通らない）。
静的な枠は、直前に本物のポインタの押下も親からの知らせも無い `focus` を受けたら親へ知らせ、親は、**いま画面に `script-html` の枠が 1 つ以上載っているときだけ**（脅威は、スクリプトの枠が兄弟の静的な枠へフォーカスを移すことにしか無い）、直前に `Tab` を受けておらず・こちらが移した直後でなく・**文書が別のウィンドウ／タブ／ブラウザの UI（アドレスバーからの `Tab` を含む）から戻った直後でもない**ときに、元の場所へ戻す（回数には数えない）。
スクリプトの面が載っていなければ、静的な面は何も戻さない（支援技術・音声操作・拡張機能のプログラムによるフォーカスを追い出さない）。見分けられない場合は、戻さない側に倒す。戻すまでの短い間のキーは、その面の欄に入りうる（限界 12）。

## できること・できないこと（スクリプトから）

実測したブラウザ: **Chromium 153.0.8010.12**（Playwright 同梱）。**ほかのブラウザ（Firefox・Safari）は未確認**。「止まる」と書くのは、実際に確かめたものだけ。

| | 結果 |
|---|---|
| できる | 枠の中の DOM と CSS を自由に書く・`canvas`・SVG・`eval`・`setInterval`・`requestAnimationFrame`・`data:`/`blob:` の画像と音・`soda.action`・`soda.onMessage`。埋め込んだ大きなライブラリ（marked・Chart.js）も動く |
| **止まった**（実測） | アプリの DOM（`parent.document`・`top.document`）・Cookie・`localStorage`・`sessionStorage`・`indexedDB`（どれも `SecurityError`）／同じ pane の別の面の枠の中（`parent.frames[i].document` は `SecurityError`）／`fetch`・XHR・`WebSocket`（アプリの `/ws` も外も）・`EventSource`・外の画像・スタイルシート・フォント・`<script src>`（**同じ origin の `<script src>` も**）— 試みた要求は CSP が止め、テストの待ち受けには 1 つも届かない／フォームの送信（待ち受けに届かない）／`window.open`（`null`）・`<a target="_blank">`（ポップアップが開かない）／`alert`・`confirm`・`prompt`（ダイアログが出ない）／ダウンロード（始まらない）／Service Worker（`SecurityError`）／`top.location`・`parent.location` の書き換え（`SecurityError`。アプリのページは移らない）／兄弟の枠の `location` の読み書き（`SecurityError`）／全画面（`requestFullscreen` は拒否される）／Picture-in-Picture（`document.pictureInPictureEnabled` が偽）／`<link rel=preconnect\|prefetch\|prerender\|modulepreload>` で待ち受けへの TCP 接続が来ること（1.5 秒見て 0。**`dns-prefetch` は DNS の問い合わせだけが外へ出るので、ループバックの待ち受けでは測れていない。出る前提で考える**）／`history.back()`・`history.go(-1)`・`pushState`（枠自身の履歴だけが動き、枠が戻ると「移った」として閉じる。アプリのページの URL は変わらない）／枠が外の origin・`localhost` の別のサービス・応答が 204 の宛先へ移ること（アプリの CSP が止め、要求は届かず、枠は「移った」として閉じる。直後に `window.stop()` を呼んだ場合は、枠は閉じずに残るが、要求は届かない） |
| **止まらなかった**（実測） | **WebRTC**: `RTCPeerConnection` を作って STUN の宛先を指定すると、**UDP の要求が待ち受けに届いた**（5 パケット）。CSP の `webrtc 'block'` は、このブラウザは解釈しない（「Unrecognized Content-Security-Policy directive」）。→ 外へ出す道として残る（限界 4）／**クリップボードへの書き込み**: 利用者が操作を始めて枠の中をクリックした**後**は、`document.execCommand("copy")` が通り、クリップボードが書き換わった（操作の前は通らない。`navigator.clipboard.writeText` は前後とも `NotAllowedError`）／**音**: 利用者が操作を始めて枠の中をクリックした**後**は鳴らせる（操作の前は `AudioContext` が `suspended`・`audio.play()` が `NotAllowedError`）／**`window.name`**: 移った先の同じ origin の文書で読めた（持ち出しに使える。限界 3）／**兄弟の枠への `postMessage`**: 届く／**`MessagePort` の受け渡し**: 兄弟の枠に port を渡せ、その port で送れる（限界 7・12）／**兄弟の枠への `focus()`**: 呼べる。**ただし、このブラウザではフォーカスは兄弟へ移らなかった**（ユーザー操作の後でも）。移るブラウザでは、静的な面なら上のとおりアプリが戻し、スクリプトの面なら、その pane の回数に数えられる見込み（未確認）／`Permissions-Policy` の `focus-without-user-activation=()`: このブラウザでは「Origin trial controlled feature」で、**効かない**（コンソールに警告。検知と戻しはそのまま働く） |
| 測れなかった | 変換中（IME）の文字の行方（ヘッドレスの Chromium に IME が無い）／ほかのブラウザ |
| できない（アプリが止める） | 利用者が操作を始める前に、キー入力を取り続ける（pane ごとに 3 回で、その pane のスクリプトの面が全部閉じ、5 分出せない）／別のページへ移った後に、操作を送る・中身を受け取る／操作中でないのに、端末へフォーカスを移す・prefix を押したことにする／静的な形式の枠・印のまま、スクリプトを動かす |

## 残る限界（スクリプトが動く形式。防げていないこと）

1. **戻すまでの短い間のキー**: 利用者が操作を始める前でも、スクリプトがフォーカスを取ってから、アプリが元の場所へ戻すまでの短い間に打ったキーは、枠に入りうる。**0 にはできない**。
   - 長さ: ふつうはイベント 1 回ぶん（フォーカスのイベントのあと、1 拍置いて確かめるので、その分）。イベントが起きないブラウザでは見回りの 250ms まで。**アプリの画面が重いときは、それより長くなりうる**（保証できる上限は無い）。
   - 実測（Chromium 153。軽い負荷。**下限**）: 15ms おきにキーを打ち続けながら 20ms おきにフォーカスを取り続ける中身を出したとき、閉じるまでに打った 21 キーのうち、**枠に入ったのは 1 つ**、20 は pane に届いた。
   - 回数: サーバが pane ごとに数え、3 回で、その pane のスクリプトが動く面を全部閉じて、5 分出せなくする。漏れうるのは、**pane 1 つにつき、5 分に 3 回ぶんまで**。受け口へ繋げるプロセスは pane を名乗れるので、**悪意のあるプロセスは、開いている pane の数 × 3 回まで取れる**。
   - 変換中（IME）に取られた文字の行方は、測れていない。
2. **操作中のキー**: 利用者が操作を始めた後に打ったキーは、すべて枠に届く（それが操作）。スクリプトはそれを読める。操作中の表示（縁の色・文言・端末が薄くなる）に気づかずに、端末のつもりで打つと、枠に入る。`Esc` を押す・端末を押すまで続く。
3. **枠の移動での持ち出しと、居座り**: スクリプトは `location` を書き換えて枠を別の URL へ移せ、URL と `window.name`（実測：読めた）に載せたデータは移るときに送られる。アプリが気づくのは移った後で、面を閉じても、送られたものは戻らない。
   **実測（Chromium 153）**: 外の origin・`localhost` の別のポート・応答が 204 の宛先へ移ろうとしても、**アプリの CSP が止め、要求は届かなかった**（枠は「移った」として閉じる）。同じ origin への移動（`/display-view/…`・`/`）は止まらないが、アプリの静的ページなので外へは出ない。**ほかのブラウザは未確認**——CSP が止めないブラウザでは、移るときの要求が外へ出て、アプリが枠を外すまでの間（`load` の直後まで）は外のページが枠の中で動きうる。LAN の機器・`localhost` の別のサービスへの GET も、同じ理由（止まらないブラウザで）使える見込み。
   `window.stop()` を直後に呼ぶと、枠は閉じずに残る（要求は届いていない）。**文書を置き換えない移動**（応答が 204 の宛先など）は、このブラウザではアプリの CSP が先に止めて枠が閉じたので、CSP が止めないブラウザでの `load` の起き方は未確認。アプリが気づけない道が残りうる。
4. **そのほかの持ち出しの道**: **WebRTC（UDP の要求が外へ出る。実測）**、利用者の操作の後に許されるクリップボードへの書き込み（`execCommand("copy")`。実測）と音（実測）が残る。先読み（`preconnect`・`prefetch` など）は、TCP 接続が届かなかった。`dns-prefetch` の DNS の問い合わせは測れていない（出る前提で考える）。
5. **画面を固める・使い続ける**: スクリプトの重い処理・無限ループ・大量のメモリの確保で、パネルが固まる。固まらなくても、**CPU・電力・メモリを使い続けられる**（10 秒応答が無ければ閉じるが、応答しながら使い続けるものは止まらない）。
   実測（Chromium 153）: 15 秒の同期ループは、枠だけが固まり（アプリの画面への問い合わせの応答は保たれた。サンプルは粗い）、約 10 秒で `unresponsive` で閉じた（冷却には入らない）。枠がアプリと同じプロセスで動くブラウザでは、アプリの画面全体が固まり、［×］も押せない。そのときは、別の端末から `sodactl display close --all --pane <id>`（ログイン済み）か、端末版（`soda`）・サーバの再起動で消す。
6. **見た目のなりすまし**: スクリプトは、自分の枠の中に、端末や Sodashitsu の画面に似せた絵・偽の入力欄を描ける。見分けるのは、枠の外の固定のラベルと印「スクリプト」。
7. **操作のなりすまし**: `soda.action` は、利用者が押していなくても呼べ、`rev` も偽れる。出来事の `source: "script"` が、その印。プログラムは、スクリプトが動く面からの操作を「利用者が承認した」印として扱わない。同じ pane の面どうしは `postMessage` と `MessagePort` を送り合える（実測）ので、**`message` を受けるなら送り主を確かめる**。
8. **同じプロセスの中の読み取り**: 枠がアプリと同じプロセスで動くブラウザでは、理屈の上では、プロセッサの隙を突く読み取り（Spectre の類）の対象になりうる。対策は、ブラウザの側（サイトの隔離）に依る。
9. **信頼できない中身を出さない／形式は縛れない**: 上の「静的な形式との使い分け」。
10. **キーボードだけでは、戻れないことがある**（確認済み）: スクリプトが動く面では prefix のキーは効かない（`Esc` で戻ってから押す）。中身が `Esc` を無効にできる場合がある（土台の `Esc` の受け手は、読み込み時に控えた関数だけで動き、中身のプロトタイプの差し替えには影響を受けないが、中身が頁を書き直す・フォーカスを別の枠へ移すなどで、`Esc` が枠から親へ届かない状態は作れる）。そのときは、見出しの**［操作を終える］を押す**（マウス・タッチ）。キーボードだけのときは、ブラウザの操作（アドレスバーへ移る `Ctrl+L`/`F6` など）で枠を出る。
11. **誤って閉じることがある・ふつうの頁と違う**: 10 秒応答できない重い処理・自分で `document.write` する中身・読み込みのたびに `focus()` を呼ぶ部品（3 回で、その pane の全部が閉じる。2 つの画面を開いていれば、その数だけ早い）は、悪意が無くても閉じられる。
12. **ほかの面・ほかの pane を巻き込める**（兄弟の枠へフォーカスを移せるブラウザで）: **Chromium 153 では、兄弟の枠への `focus()` は呼べるがフォーカスは移らなかった**（実測。移るブラウザは未確認）。移るブラウザでは、宛先がスクリプトの面なら、**その面の pane の回数が増え、3 回で、その pane のスクリプトが動く面が閉じて冷却に入る**（ほかの pane のスクリプトに、巻き添えで止められる）。宛先が静的な面なら、アプリは「利用者が入ったのではない」と気づいて元へ戻すが、戻すまでの短い間のキーは、その面の欄に入りうる。兄弟の枠の `location` は、このブラウザでは書き換えられない（実測：`SecurityError`）。誰がやったかは、アプリには分からない。

## スクリプトが動く形式の上限

- 中身は **2 MiB** まで（静的な形式と同じ）。`send` のデータは JSON で **64 KiB** まで・pane ごとに毎秒 20 回（続けて 20 回）。超えると使い方の誤り（終了コード 2）か `display_busy`（終了コード 1）。
- 取られた回数は 3 回・冷却は 5 分。面の数の上限・サーバ全体の合計は静的な形式と共通。
- `sodactl display --features` の `renderers.scriptHtml` は、`script-html` を出せると名乗った画面の数。0 のときは、いま出せる画面が無く、誰にも見えない。

## 隔離のしくみ（静的な形式）

- 枠は、アプリと**別の文書**（`/display-view/frame.html`）の `<iframe>`。`sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"` で、**`allow-same-origin` が無い**ので、枠の origin は不透明（`null`）。枠の中のスクリプトは、アプリの DOM・cookie・`localStorage`・API に触れない。
- 枠のページの応答ヘッダの CSP は `sandbox …; default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'`。**`script-src` は `'self'`（枠のページ自身のスクリプト）だけ**で、インライン・`eval` は止まる。外へ繋ぐ許可は無い。直接開かれても同じ隔離がかかる。`/ask-view/*` のヘッダは変えていない。
- 親と枠のやりとりは、`MessageChannel` の port だけ。枠ごとの乱数の**合い札**を URL に付け、枠のページが `display-ready` に添えて返す。親は、**送り主がその iframe の窓・状態が待ち・合い札が合う**合図を 1 回だけ受け、**最初の `load` を見た後に**通り道と中身を渡す。以後、枠の `window` の `message` は受けない。ほかの窓（親の別の iframe など）の同じ形のメッセージは、丸ごと無視する。
- **移ったことは、`load` の回数だけで決める**: 期待する `load` は最初の 1 回。2 回目以降は必ず「移った」として iframe を外して面を閉じ、プログラムへ `display.closed`（`navigated`）を届ける。見回り（2 秒ごとの `ping`）は、**画面が見えている間だけ**数え、見えている間に 10 秒返事が無ければ `unresponsive` で閉じる（重い処理で 10 秒返事ができない中身も閉じられる）。
- 知らない形式の面（この版が出せない形式を後の版のサーバが配ったとき）は、枠を作らず「この画面では、この形式の表示を出せません」と固定の文言だけを出す。形式が替わる `set`（`html` → `markdown` など）では、枠を部品ごと作り直す。
- ブラウザ・サーバのログに、中身・題・操作の値は書かない。

## 限界（防げていないこと）

- **見る人への表示だけを制御する**: 面の中身・題・操作の値は、サーバのメモリに平文で載り、`sodactl display wait`/`events` でその pane の名前を名乗るプロセスが読める。名乗る pane の id は検証されない（`docs/sodactl.md`「ログイン不要の受け口」）。**秘密（パスワード・token）を面の欄に打たせない**。
- **静的な形式ではスクリプトは動かない**。グラフや動く表示は `script-html`（上）で出す。
- **入れ子の `<template>` の中身は取り除かれない**（断片の中の `template.content` は、取り除きが辿らない）。ただし不活性（文書に入らず、描かれず、スクリプトも動かない）。
- **`<use href="…">`（SVG）は、取得を始める**が、枠の CSP（`default-src 'none'`）と不透明 origin で止まる（Chromium で確認）。
- **実測は Chromium だけ**。Firefox・Safari で、枠が移ったときの `load` の回数・`allow-forms` の `submit`・不透明 origin の扱いが同じかは確かめていない（`docs/verification.md` の手順）。
- 題・タブの文字から、書字方向を変える文字（U+202A〜202E・U+2066〜2069）は、制御文字と同じく受け付けない（`sodactl` が断る）。
- 枠の中の `html` は、外へ繋がない（画像・stylesheet・フォントの要求は出ない）。リンクを押すと新しいタブで開く（`http(s)` だけ）。その先は信頼されない外のページ。
- 中身の絵・色・文言で、利用者を誤解させることはできる（見出しの固定の文言と、操作中の表示で、アプリ自身の画面と見分けられるようにしている）。
- 枠の中の入力（`<input>`）は、枠にフォーカスが入っている間の入力が、そのまま中身のフォームの欄に入る。パネルに「パスワードを入力してください」と書かれていても、入れない。
- `soda handoff`・サーバの再起動で面は消える（`display.reset`。プログラムは出し直す）。
- Windows（ネイティブ）では、ログインなしの受け口が無いので、`SODA_PANE_SOCKET` が空で、`sodactl` は今までのログイン済みの経路（`/ws`）を使う。

## 古い版との組み合わせ

| sodactl | サーバ | 画面 | 動き |
|---|---|---|---|
| 新 | 新 | 新 | すべて使える |
| 新 | 旧 | — | 各コマンドは `unsupported`（終了コード 0）。`events` は `display.end`（`unsupported`）。`--features` の `server` は `null` |
| 旧 | 新 | — | `display` を知らない（使い方の誤り＝終了コード 2） |
| 新 | 新 | 旧（読み込み直していない） | 名乗らないので出ない。`renderers` に数えない。`set` は成功する |
| 新 | 新 | 端末版だけ | 同上（`renderers` はすべて 0） |
| 新 | 静的な形式だけの版 | — | `script-html` の `set`・`send` は `{"status":"unsupported","reason":"this server does not support script-html displays (update soda)"}`（終了コード 0。`display.features` に `format:script-html`・`send` が無いとき） |
| 新 | 新 | `script-html` を名乗らない画面 | その画面では、枠を作らず固定の文言「この画面では、この形式の表示を出せません」（スクリプトは動かない）。`renderers.scriptHtml` に数えない |

## 確かめ（開発者向け）

- 単体: `packages/web/src/display/*.test.ts`（`scriptHost.test.ts`＝スクリプトの頁の土台、`focusGuard`・`focusOrigin`・`engageEntry`）・`packages/web/src/components/{DisplayFrame,DisplayFrameScript,DisplayScriptMark,PanePanel}.test.ts`・`packages/web/src/store/display.test.ts`。
- 結合: `packages/server/src/http/HttpServer.integration.test.ts`（`/display-view/*` のヘッダ）。
- E2E（実ブラウザ。`packages/e2e/src/specs/display*.spec.ts`）: 出す・更新する・閉じる・操作（`display-flows`）／隔離（`display-isolation`）／幅のつまみ（`display-resize`）／モバイル（`display-mobile`）／スクリプトが動く形式（`display-script`＝土台への差し込みの前提、`display-script-app`＝部品を通した筋、`display-script-engage`＝操作の始め方とフォーカスの番、`display-script-isolation`＝隔離、`display-script-nav`＝枠の移動、`display-script-measure`＝実測、`display-script-mobile`）。手順は `docs/verification.md`「表示の面」。
- 実測した前提: `MessagePort` は sandbox の不透明 origin の枠へ transfer で渡せる。Playwright の `frame.evaluate` は `script-src 'self'` の枠でも動く（枠の origin は `self.origin` が `"null"`・`localStorage`/`parent.document` が `SecurityError`）。`allow-forms` があると `submit` のイベントが起き、実際の送信は起きない。marked は Markdown の中の HTML（`<button data-soda-action>`）をそのまま通す。
