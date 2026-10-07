# 表示の面（パネルと帯。`sodactl display`）

pane の中で動くプログラムが、その pane を見ているブラウザの画面に、**パネル（端末の右）か帯（端末の上）**を出して、進捗・結果・操作のボタンを見せ続けるしくみ（20261007-soda-extensions）。
ブラウザ版だけの機能で、端末版（引数なしの `soda`）には面が出ない（`docs/tui-parity.md`）。

- コマンドの形と終了コードは `docs/sodactl.md`、ここは「何が画面に出るか」「中身の書き方」「隔離のしくみと限界」。
- **この版で出せるのは静的な形式（`text`・`markdown`・`html`）だけ**。中身の中のスクリプトは動かない（取り除かれる）。スクリプトが動く形式は別の版が足す。

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

`prefix+i`（`focus_display`。設定で変えられる）で、フォーカス中の pane のパネル（たたんであれば戻す）、無ければ最初の帯の枠へ移る。面が無ければ「この pane に表示はありません」。端末版では「ブラウザで使えます」と知らせる。
枠にフォーカスがある面が消えたら、その pane の端末へ戻る。面の出現・更新・消滅では、アプリは `focus()` を呼ばない（打っている最中のフォーカスを奪わない）。

### モバイル

幅 767px 以下の画面（1 列のレイアウト）では、パネルは端末の横に出ない。上部のバーに［表示N］のボタンが出て、押すと重ね表示（ダイアログ）が開く。［閉じる］は重ね表示だけを閉じ（面は残る）、［この表示を消す］は面を閉じる。幅のつまみは出ない。帯は端末の上に出る。パネルを出しても端末の箱・列数は変わらない。

## 隔離のしくみ

- 枠は、アプリと**別の文書**（`/display-view/frame.html`）の `<iframe>`。`sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"` で、**`allow-same-origin` が無い**ので、枠の origin は不透明（`null`）。枠の中のスクリプトは、アプリの DOM・cookie・`localStorage`・API に触れない。
- 枠のページの応答ヘッダの CSP は `sandbox …; default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'`。**`script-src` は `'self'`（枠のページ自身のスクリプト）だけ**で、インライン・`eval` は止まる。外へ繋ぐ許可は無い。直接開かれても同じ隔離がかかる。`/ask-view/*` のヘッダは変えていない。
- 親と枠のやりとりは、`MessageChannel` の port だけ。枠ごとの乱数の**合い札**を URL に付け、枠のページが `display-ready` に添えて返す。親は、**送り主がその iframe の窓・状態が待ち・合い札が合う**合図を 1 回だけ受け、**最初の `load` を見た後に**通り道と中身を渡す。以後、枠の `window` の `message` は受けない。ほかの窓（親の別の iframe など）の同じ形のメッセージは、丸ごと無視する。
- **移ったことは、`load` の回数だけで決める**: 期待する `load` は最初の 1 回。2 回目以降は必ず「移った」として iframe を外して面を閉じ、プログラムへ `display.closed`（`navigated`）を届ける。見回り（2 秒ごとの `ping`）は、**画面が見えている間だけ**数え、見えている間に 10 秒返事が無ければ `unresponsive` で閉じる（重い処理で 10 秒返事ができない中身も閉じられる）。
- 知らない形式の面（この版が出せない形式を後の版のサーバが配ったとき）は、枠を作らず「この画面では、この形式の表示を出せません」と固定の文言だけを出す。形式が替わる `set`（`html` → `markdown` など）では、枠を部品ごと作り直す。
- ブラウザ・サーバのログに、中身・題・操作の値は書かない。

## 限界（防げていないこと）

- **見る人への表示だけを制御する**: 面の中身・題・操作の値は、サーバのメモリに平文で載り、`sodactl display wait`/`events` でその pane の名前を名乗るプロセスが読める。名乗る pane の id は検証されない（`docs/sodactl.md`「ログイン不要の受け口」）。**秘密（パスワード・token）を面の欄に打たせない**。
- **静的な形式ではスクリプトは動かない**。グラフや動く表示を作りたくても、この版ではできない（`html` の `<style>` と CSS の動きは使える）。
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

## 確かめ（開発者向け）

- 単体: `packages/web/src/display/*.test.ts`・`packages/web/src/components/{DisplayFrame,PanePanel}.test.ts`・`packages/web/src/store/display.test.ts`。
- 結合: `packages/server/src/http/HttpServer.integration.test.ts`（`/display-view/*` のヘッダ）。
- E2E（実ブラウザ。`packages/e2e/src/specs/display*.spec.ts`）: 出す・更新する・閉じる・操作（`display-flows`）／隔離（`display-isolation`）／幅のつまみ（`display-resize`）／モバイル（`display-mobile`）。手順は `docs/verification.md`「表示の面」。
- 実測した前提: `MessagePort` は sandbox の不透明 origin の枠へ transfer で渡せる。Playwright の `frame.evaluate` は `script-src 'self'` の枠でも動く（枠の origin は `self.origin` が `"null"`・`localStorage`/`parent.document` が `SecurityError`）。`allow-forms` があると `submit` のイベントが起き、実際の送信は起きない。marked は Markdown の中の HTML（`<button data-soda-action>`）をそのまま通す。
