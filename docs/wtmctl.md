# wtmctl（外部操作 CLI）

`wtmctl` は、動いている `wtm serve` をブラウザを介さずに操作する CLI（`packages/cli`）。
ブラウザと同じ認証（token でのログイン → session cookie）と同じ接続（`/ws`。Origin/Host の検査つき）を使う。
新しいソケットや認証の入口は持たない。

## 接続とログイン

```bash
wtmctl login --url http://127.0.0.1:7780 --token <TOKEN>   # session cookie を ~/.wtmctl に保存（token は保存しない）
export WTMCTL_URL=http://127.0.0.1:7780                    # 以後 --url を省ける（既定もこの値）
```

- 各コマンドは `--url` / `--token`（または環境変数 `WTMCTL_URL` / `WTMCTL_TOKEN`）を受ける。wtm の pane の中では、`--url`・`WTMCTL_URL` が無ければ
  その pane を動かしているサーバ（pane の環境の `WTM_SERVER_URL`）につなぐ（下の「pane の中から使う」）。
  保存済みのセッションが失効していて token が分かれば、1 回だけ再ログインしてやり直す。
- 成功は終了コード 0（結果は stdout に JSON／テキスト）、サーバ・待ち合わせのエラーは 1（stderr に
  `{"error":{"code","message"}}`）、使い方の誤りは 2。

## コマンド一覧

```
wtmctl workspace create [--cwd <path>] [--label <text>]
wtmctl workspace close <workspaceId>
wtmctl workspace rename <workspaceId> <label>
wtmctl tab create [--workspace <id>] [--label <text>]
wtmctl tab close <tabId>
wtmctl pane split <paneId> --direction right|down [--ratio <0.05-0.95>]
wtmctl pane close <paneId>
wtmctl pane input <paneId> <text>          # Enter を付けずに送る
wtmctl pane run <paneId> <command>         # command と改行を送る
wtmctl pane read <paneId> [--follow] [--raw] [--timeout <ms>]
wtmctl pane attach <paneId> [--takeover]   # 手元の端末をその pane に直結する（Ctrl+B q で切り離す）
wtmctl pane observe <paneId>               # pane の画面を NDJSON で流し続ける（閲覧専用）
wtmctl pane control <paneId> [--takeover] [--cols <N>] [--rows <N>]   # NDJSON で流し、stdin の NDJSON で操作する
wtmctl snapshot
wtmctl watch [--json]
wtmctl agent list
wtmctl agent get <target>                  # <target> は pane ID か、agent rename で付けた名前
wtmctl agent wait <target> [--until working|blocked|idle|done|unknown]... [--timeout <ms>]
wtmctl agent read <target> [--lines <N>] [--raw] [--timeout <ms>]
wtmctl agent prompt <target> <text> [--wait] [--until working|blocked|idle|done|unknown]... [--timeout <ms>]
wtmctl agent send-keys <target> <key>...
wtmctl agent rename <target> <name>|--clear
wtmctl agent start <name> --kind <KIND> --pane <paneId> [--timeout <ms>] [-- <args>...]
wtmctl skill                               # エージェントに wtmctl の使い方を教える Markdown（skill ファイル）を出す
```

## ほかのマシンへ送る（`--machine`）

`wtmctl --machine <名前|id> <コマンド> …` で、手元の `wtm serve` に `wtm machine add` で登録したマシンの `wtm serve` へコマンドを送る
（20260927-multi-host-machines。herdr の `herdr --machine`）。手元の `wtm serve` の `/ws?machine=` を通すので、手元の `wtm serve` が動いていて、そのマシンが
繋がっている必要がある。`login`・`skill` 以外の全コマンドに使える。id（pane・エージェントの名前を含む）はマシンごとに別。
登録に無い・無効・曖昧は `machine_not_found`、繋がっていないは `machine_unavailable`（終了コード 1）。`--machine` のとき自分の pane の歯止め（`self_target`）は
効かない（`--machine local` は手元そのもの）。詳しくは `docs/machines.md`。

## pane への直結（`pane attach`）

手元の端末（SSH 先のシェルを含む）を pane 1 枚に直結し、ブラウザを開かずにその場の端末として操作する。

```bash
wtmctl pane attach p2              # 直結する
wtmctl pane attach p2 --takeover   # 既に別の端末が直結していれば、それを奪って直結する
```

- つないだ時点の**見えている画面**を描き、以後の出力をそのまま流す。打鍵はそのまま pane へ送る（手元の端末は raw モード・代替画面になる）。
  直結より前のスクロールバックは送らない。pane の出力に含まれる端末への問い合わせ（DA・カーソル位置の報告・色の問い合わせ・クリップボードの読み出し等）は
  手元の端末に書かない——答えるのはサーバだけ（ブラウザと同じ）で、手元の端末にも答えさせると答えが二重に pane へ届くため。
- **`Ctrl+B q` で切り離す**（pane のプロセスは止めない）。`Ctrl+B Ctrl+B` で `Ctrl+B` を 1 つ送る。`Ctrl+B` に続くそれ以外のキーは両方を送る。
- 直結している間、**pane の大きさは手元の端末の大きさ**になり、手元の端末の大きさを変えると追従する。ブラウザの表示の大きさ（サイズ権限）は
  その pane の大きさを変えない（同じ tab のほかの pane は今までどおり）。切り離すと、その tab の大きさを決めているブラウザの大きさへ戻る
  （決めているブラウザがいなければ直結時の大きさのまま）。
- **同じ pane に直結できるのは 1 つだけ**。既に直結があれば `pane_attached` で終わる（何も変えない）。`--takeover` なら奪い、奪われた側は
  `attach_taken_over` で終わる。
- 直結中もブラウザでの表示と入力はそのまま使える（ブラウザの入力は止めない。ブラウザから直結を奪う・切り離す操作は無い）。
  直結の所有者は**安全の境界ではない**——認証済みの接続は今までどおり pane に書ける。ブラウザと同じ認証と `/ws`（Origin/Host の検査つき）を使う。
- 終了コード: 切り離しは 0（stderr に `wtmctl: detached from <paneId>`）。奪われた（`attach_taken_over`）・pane のプロセスが終わった・pane が閉じられた
  （`pane_closed`）・サーバ側から切れた（`connection_closed`）・既に直結がある（`pane_attached`）・pane が無い（`not_found`）・
  標準入力か標準出力が端末でない（`not_a_tty`）は 1。使い方の誤りは 2。
  どの終わり方でも、手元の端末のモード（色・カーソルの表示と形・スクロール領域・マウスの報告・bracketed paste 等）を戻し、代替画面から出る。
  `SIGTERM`・`SIGHUP` で止められたときは切り離しと同じに扱う。

## pane の NDJSON ストリーム（`pane observe`・`pane control`）

別のプログラム（pane の画面を別の UI へ中継するブリッジ・エージェントを操る自動化）が `wtmctl` を子プロセスとして起動し、
stdout を 1 行ずつ JSON として読む（`control` は stdin に 1 行 1 コマンドを書く）ための形。人が端末で使うなら `pane attach`。

```bash
wtmctl pane observe p2                                      # 閲覧専用。何本でも同時に動かせる
wtmctl pane control p2 --cols 120 --rows 40                 # 書き込み可能（所有者は pane に 1 つ）
wtmctl pane control p2 --takeover                           # 既に所有者（pane attach か control）がいれば奪う
```

### stdout の記録（observe・control 共通）

```jsonc
{"type":"terminal.frame","seq":1,"encoding":"ansi","width":120,"height":40,"full":true,"bytes":"<base64>"}
{"type":"terminal.frame","seq":2,"encoding":"ansi","width":120,"height":40,"full":false,"bytes":"<base64>"}
{"type":"terminal.closed","reason":"pane_closed"}
```

- `bytes` は pane の出力（ANSI の列を UTF-8 にしたもの）の base64。`full: true` は**見えている画面の描き直し**（つないだ最初と、下の「読み手が遅いとき」の再開時）で、
  それまでの画面を捨ててこれで描き直す。`full: false` はその後に pane が出した出力をそのまま区切ったもの。
- `seq` はフレームごとに 1 から 1 ずつ増える。`width`/`height` はその時点の pane の大きさ（大きさが変われば以後のフレームから変わる）。
- pane の出力に含まれる端末への問い合わせ（DA・カーソル位置の報告・色の問い合わせ等）は取り除く——答えるのはサーバだけ（`pane attach` と同じ）。
  受け取った列を端末エミュレータに流しても、エミュレータの答えが二重に pane へ届かない。
- 終わりは `terminal.closed` の 1 行。`reason` は `pane_closed`（pane のプロセスが終わった・pane が閉じられた）・`released`（control が所有を返した）・
  `taken_over`（control が奪われた）・`connection_closed`（サーバ側から切れた）。
- **読み手が遅いとき**: stdout の書き出し待ちが 1 MiB を超えると、wtmctl はサーバからの受信を止める。その間の出力はサーバが捨て、読み手が追いつくと
  `full: true` の描き直しから続く（wtmctl のメモリは増え続けない。切断もしない）。`pane control` はその間 stdin も読まない
  （奪われた知らせを読めないまま入力を送り続けないため。書いた行は、終わる前に追いつけば処理する）。

### `pane observe`

- 閲覧専用。サーバへ送るのは購読だけで、所有者・大きさ・入力には触れない。何本同時に動かしても、互いにも `pane attach`・`pane control`・ブラウザにも影響しない。
- 大きさは持たない（pane の大きさのフレームが届く）。

### `pane control`

- pane の所有者になり、pane の大きさを `--cols`×`--rows`（既定 120×40・1〜1000）にしてからフレームを流す。所有者は `pane attach` と共通で、
  **pane に 1 つ**。既に所有者がいれば `pane_attached` で終わり、`--takeover` なら奪う（奪われた側の `pane attach` は `attach_taken_over`、
  `pane control` は `terminal.closed`（`taken_over`）の後に `attach_taken_over` で終わる）。
- stdin に 1 行 1 コマンド（JSON）を書く:

| コマンド | 動作 |
|---|---|
| `{"type":"terminal.input","text":"ls\r"}` | 文字列を UTF-8 で pane へ送る（Enter は `\r`） |
| `{"type":"terminal.input","bytes":"Aw=="}` | base64 を戻した列を送る（例は Ctrl-C） |
| `{"type":"terminal.resize","cols":100,"rows":30}` | pane の大きさを変える（1〜1000） |
| `{"type":"terminal.release"}` | 所有を返して終わる |

- 不正な行はサーバに何も送らず、stderr に `wtmctl: pane control input ignored: <理由>` を 1 行出して次の行へ進む。不正になるのは:
  UTF-8・JSON として正しくない（先頭の BOM・全角空白を含む）／オブジェクトでない／`type` が無い・文字列でない・上の 3 つ以外（`terminal.scroll` は未対応として不正）／
  知らないキーがある（`terminal.resize` の `cell_width_px`・`cell_height_px` は 0 以上の整数なら受け付けて使わない。そうでなければ不正）／
  `text` と `bytes` の両方かどちらも無い／`text` が文字列でない／`bytes` が正規の base64 でない／`cols`・`rows` が 1〜1000 の整数でない／
  1 行が 1 MiB を超える（次の改行まで捨てる）。空白（space・tab・CR）だけの行は黙って無視する。
  stderr を読まない相手でメモリを使い続けないよう、stderr の書き出し待ちが 64 KiB を超えている間は警告を捨てる。
- `terminal.release`・stdin の終わり・`SIGINT`/`SIGTERM`/`SIGHUP` で所有を返し、`terminal.closed`（`released`）を出して終了コード 0。
  所有を返すと、pane の大きさはその tab の大きさを決めているブラウザの大きさへ戻る（`pane attach` の切り離しと同じ）。
- 所有者は**安全の境界ではない**（`pane attach` と同じ。認証済みの接続は今までどおり pane に書ける）。observe・control ともブラウザと同じ認証と
  `/ws`（Origin/Host の検査つき）だけを使い、ログインしていなければ stdout に何も書かずに失敗する。

### 終了コード

- 0: `pane_closed`・`released`。
- 1: `taken_over`（`attach_taken_over`）・`connection_closed`・stdout に書けなくなった（`output_closed`。`terminal.closed` は書かない）。
  始まる前の失敗（`not_found`・`pane_attached`・未ログイン等）は stdout に何も書かない。エラーは stderr に `{"error":{"code","message"}}`。
- `pane control` で解放（`terminal.release`・stdin の終わり・シグナル）を始めた後に届いた奪取・切断・pane の終わりは、`released`・終了コード 0 として終える。
- 2: 使い方の誤り（`--cols 0` 等）。
- `pane observe` はシグナルを受け止めない。止めるなら `SIGTERM` 等で終わらせる（`terminal.closed` は出ず、終了コードはシグナルによる）。
  所有を持たないので、止めても pane とほかのクライアントには何も起きない。

## エージェント（`agent`）

pane の中で検出されたコーディングエージェント（Claude Code・Codex 等。ブラウザのサイドバーに状態が出るもの）を、
**その pane の ID** か、**`agent rename` で付けた名前**で指して扱う（下の `<target>`）。

### 名前と `<target>`

- `agent rename <target> <name>` … エージェントに名前を付ける（既に名前があれば置き換える）。`--clear` で外す。
  `{"agent":{…}}` を出す（`name` は付けた名前、外したら `null`）。
- 名前は **英小文字で始まり、英小文字・数字・`-`・`_` の 1〜32 文字**（`[a-z][a-z0-9_-]{0,31}`）。外れると `invalid_agent_name`。
- 名前は**いま検出されているエージェントの間で一意**。他のエージェントが使っている名前は `agent_name_taken`（同じエージェントへの
  付け直しは成功する）。エージェントの居ない pane には付けられない（`agent_not_found`）。
- 名前は**付けたときのエージェント**に付く。そのエージェントが終了した・pane の前面が別のエージェントに入れ替わった・pane が
  閉じたときに消え、次に現れたエージェントには引き継がれない。検出が一度外れると（前面のプロセスが一瞬見えなかった等）
  別のエージェントとして数え直すので、そのときも消える。サーバを再起動すると消える（保存しない）。
- `<target>` は、まず **pane ID として**そのエージェントの居る pane を探し、無ければ**名前として**探す。pane ID と同じ形の名前
  （`p3` 等）も付けられるが、その文字列の pane にエージェントが居ればそちらが優先される。見つからなければ `agent_not_found`。
- 名前で指したときも、コマンドが接続した時点のエージェントにだけ送る・名前を付ける（その後に入れ替わっていたら何もせずに
  `agent_not_found`）。
- ブラウザでは、サイドバーのエージェントの行・携帯の pane 選択のエージェント一覧・pane の呼び名（pane の枠の見出し・移動の候補・通知）に名前が出る
  （pane に自分で付けたラベルがあればそちらが優先）。ブラウザから名前を付ける操作は無い。

### 状態と各コマンド

| 状態 | 意味 |
|---|---|
| `working` | 作業中 |
| `blocked` | 承認・質問の入力待ち |
| `idle` | 手が空いている（サーバ側でまだ既読になっていない完了は無い） |
| `done` | 手が空いていて、サーバ側でまだ既読になっていない完了がある |
| `unknown` | エージェントは居るが状態を判定できない（成功した保証ではない） |

`done` と `idle` を分ける既読はサーバが持つもので、ブラウザでその pane へフォーカスが**移ったとき**に進む。
ブラウザのバッジはブラウザごとの既読（表示しているだけで既読になる）を使うので、既にフォーカスしている pane や
画面に見えているだけの pane で完了した場合など、ブラウザでは `idle` なのに CLI では `done` のままのことがある
（herdr でも CLI とクライアントのバッジは別々に既読を持つ）。

- `agent list` … エージェントの居る pane の一覧 `{"agents":[…]}`。各要素は `paneId`・`name`（名前。無ければ `null`）・`workspaceId`・`tabId`・
  `status`（上の 5 値）・`kind`（`claude` 等）・`label`・`state`（サーバの生の状態。`done` を含まない）・
  `instanceId`・`since` など。
- `agent get <target>` … 1 件 `{"agent":{…}}`。
- `agent wait <target>` … 状態が `--until` のどれかになったら `{"agent":{…}}` を出して終わる。
  - 呼び出した時点で一致していれば即座に返る。`--until` は繰り返し指定でき、省略時は `idle`・`done`・`blocked`。
  - 状態の変化はサーバからの push で受け取る（ポーリングしない）。
  - `--timeout` を省略すると無期限に待つ（指定できる上限は 2147483647ms）。時間切れは `timeout` のエラー（終了コード 1）。
    接続の死活確認は無いので、スリープやネットワーク断で接続が切れたまま気づけないことがある。長い待ちでは `--timeout` を付ける。
  - 待っている間にエージェントが終了した・別のエージェントに入れ替わった・pane が閉じたら `agent_not_running`、
    サーバが接続を閉じたら `connection_closed`（どちらも終了コード 1）。
- `agent read <target>` … その pane の画面（スクロールバック込み）の末尾 `--lines` 行（既定 80。末尾の空行は数えない）を
  テキストで出す（alternate screen を使うエージェントでは今の alt screen の中身だけ）。既定で ANSI エスケープを除く（`--raw` で除かない。そのときは端末の制御列〔カーソル移動・モード設定〕を
  含むので、端末へそのまま流さない）。`--timeout` は画面内容がサーバから届くまで
  待つ上限（既定 5000ms。超えたら `timeout`）。
- `agent prompt <target> <text>` … エージェントへ prompt を送って確定する。`{"agent":{…}}` を出す（`--wait` 無しは送信を始めた時点の
  エージェント、`--wait` は一致した時点のもの）。
  - 本文は、送る瞬間にその pane の端末で bracketed paste が有効なら `ESC[200~`…`ESC[201~` で包んで 1 つの貼り付けとして送る
    （複数行でも途中の改行で確定されない。本文の中の `ESC[200~`・`ESC[201~` は取り除く）。無効なら包まずに送る。
  - `agent list`/`get` と同じく、コマンドが接続したときに見たエージェントにだけ送る。送る前に別のエージェントに入れ替わっていたら
    何も送らずに `agent_not_found`（`send-keys` も同じ）。
  - 本文を書いてから **300ms** 置いて Enter（CR）を送る（貼り付けの直後の Enter を「貼り付けの続きの改行」として扱うエージェントがあるため。
    herdr と同じ間）。本文から Enter までの間に届いた他の入力（ブラウザでの打鍵・`pane input` 等）は Enter の後へ回す。
  - エージェントが `blocked`（承認・質問の入力待ち）なら**何も送らずに** `agent_blocked`。別の入力の後ろで待っている間に `blocked` になった・
    エージェントが終了した場合も、本文を書く直前にもう一度確かめて送らない（`agent_blocked` / `agent_not_found`）。ただし状態の判定は
    周期的（500ms ごと）で、本文から Enter までの 300ms の間は確かめ直さないので、その分の窓は残る。本文が空なら `empty_agent_prompt`、
    1MB を超えると `invalid_params`。本文が `--` で始まると未知のオプションとして使い方の誤り（終了コード 2）になる（`pane input` と同じ制約）。
  - 送信の途中で端末が閉じると `agent_prompt_failed`（閉じた時点によって、本文が書かれている場合も書かれていない場合もある）。
  - `--wait` … 送った後、エージェントが `working` か `blocked` になった（一瞬でもよい）ことを確かめてから、`--until`（省略時は `idle`・`done`・`blocked`）の
    どれかになるまで待つ。送信を書き終えてから **5 秒**以内に `working`/`blocked` を観測できなければ `agent_prompt_stalled`（メッセージに今の状態）。
    送る前から `working` ならこの確認を省く（そのときは今の作業の完了で返りうる。1 回の送信ごとの「ターン」は追わない）。
  - `--timeout` は送信の時間も含めた全体の上限（`--wait` と一緒のときだけ指定できる。`--until` も同じ）。残りが 5 秒以下なら
    `agent_prompt_stalled` ではなく締め切りで `timeout`。省略すると、活動を確かめた後は無期限に待つ。
  - 待っている間にエージェントが終了した・入れ替わった・pane が閉じたら `agent_not_running`。
  - `timeout`・`agent_prompt_stalled`・`agent_prompt_failed`・`agent_not_running`・`connection_closed` は「送られなかった」ことを意味しない。送り直す前に `agent read` で確かめる（二重に送らないため）。
- `agent send-keys <target> <key>...` … エージェントの UI（承認ダイアログ・メニュー）へキーを送る。`blocked` でも送れる。`{"ok":true,"paneId":…}` を出す（名前で指しても `paneId` は解決した pane の ID）。
  - キー名: `enter`/`return`・`esc`/`escape`・`tab`・`shift+tab`・`backspace`/`bs`・`space`・`up`/`down`/`left`/`right`・`f1`〜`f12`・1 文字
    （`y` 等。大文字は shift つき）・記号名（`minus` `comma` `period` `slash` `backslash` `quote` `double_quote` `semicolon` `colon`
    `percent` `ampersand` `backtick` `plus`）。修飾は `ctrl`/`control`・`alt`/`option`/`meta`・`shift` を `+` でつなぐ（例 `ctrl+c`。別名は `C-c` だけで、`C-x` のような書き方は使えない）。
  - 矢印は端末のアプリケーションカーソルモードに合わせて送る。符号化は xterm の既定のもの（`ctrl+enter` のように既定の符号化で表せない組み合わせは使えない）。
  - 不明なキー名が 1 つでもあれば**何も送らずに** `invalid_key`。
- 対象の pane が無い・エージェントが検出されていない・どのエージェントも持たない名前だと `agent_not_found`。
- 読み取り（`get`・`wait`・`read`）は既読を進めない（`done` は `done` のまま）。

### エージェントを起動する（`agent start`）

`wtmctl agent start <name> --kind <KIND> --pane <paneId> [--timeout <ms>] [-- <args>...]` は、**前面がシェル自身だけの pane**
（プロンプトで待っているシェル）に `KIND` のエージェントを起動し、`<name>` を付け、入力を受け付けられる状態（`idle`）になるまで待ってから
`agent get` と同じ形で出す。pane は作らない（先に `pane split` 等で用意する）。

- `KIND` は次の表からだけ選ぶ。打ち込む実行ファイルは表で決まっていて、任意のコマンド行は受け付けない（表に無いものは使用誤り＝終了コード 2）。
  `pi` `claude` `codex` `gemini` `cursor`（`cursor-agent`）`devin` `agy` `cline` `opencode` `copilot` `kimi` `kiro`（`kiro-cli`）`droid` `amp`
  `grok` `hermes` `kilo` `qodercli` `qwen` `letta` `maki` `muse`（括弧の無いものは kind と同じ名前）。
- `--` の後はすべてエージェントへの引数（`--kind` 等もオプションとして読まない）。各引数は**単一引用符で包んで**打ち込むので、
  `;`・`$(…)`・バッククォート・`'`・`"`・`*`・`~`・`!` 等を含んでもそのまま 1 つの引数として届き、シェルの構文として解釈されない。
  **制御文字（改行・タブ・ESC 等）を含む引数**と、打ち込む 1 行が 4000 バイトを超えるものは `invalid_agent_argument` で何も送らない。
- 打ち込むのは、Ctrl-C（継続行＝引用符が開いたままの入力を捨てさせる）→ 200 ms 後に Ctrl-E・Ctrl-U（打ちかけの行を消す）＋コマンド行
  （シェルが bracketed paste を有効にしていれば貼り付けとして）＋Enter。**シェルがまだ読んでいない打鍵は Ctrl-C で消える**（シェルの起動直後に
  打った内容等）。Ctrl-C を受けたシェルは新しいプロンプトを出し、`$?` は 130 になる。vi の編集モードのシェルでは打ちかけの消去が
  効かないことがある。200 ms は保証ではなく、極端な高負荷でシェルが Ctrl-C を処理する前に行を読み始めると、行の先頭が落ちうる。
- 起動できる pane: サーバが Linux／WSL2 で、pane の前面プロセスグループがシェル自身だけで、そのシェルが `sh`・`bash`・`dash`・`zsh`・`ksh`・
  `mksh` のどれか。エージェントが検出されている・同じ pane で別の起動中・サーバの復元で会話の再開コマンドを打ち込んでから 30 秒以内でまだ
  検出されていない・前面が別のコマンド（エディタ等）・前面を確かめられないときは
  `agent_pane_busy`（CLI は 2 秒まで 100 ms おきに再試行する）。fish・csh・tcsh・nu・elvish・xonsh・pwsh・powershell・cmd の pane と、
  Windows で動くサーバでは `unsupported_agent_shell`。どれも**何も打ち込まない**。macOS 等（`/proc` が無い）では前面を確かめられないので
  常に `agent_pane_busy`。前面は受け付けた時点と、書き込む直前（ブラウザ等からの他の入力を後回しにしている間）の 2 回確かめる。
  それでも、書き込む直前の確認の少し前に打たれたコマンドがまだ起動し終えていない（シェルが fork・exec している途中の）瞬間には
  見分けられず、そのコマンドに Ctrl-C と行が届きうる（herdr も同じ）。確かめ直しの間（最長 2 秒）は、その pane への他の入力が遅れて届く。
- 名前: 書式と一意性は `agent rename` と同じ（`invalid_agent_name`・`agent_name_taken`）。起動中（まだ検出されていない）の名前も予約され、
  他の `agent start`・`agent rename` には使えない。期待した種類のエージェントがその pane で検出された時点で名前が付き、以後は `agent rename` で
  付けた名前と同じ（終了・入れ替わり・pane の close で消える）。サーバは打ち込んだ時点から `--timeout` の間に検出されなければ予約を解く
  （CLI は送る前から数えるので、CLI が `timeout` を返した後も数秒は予約が残り、その間に検出されれば名前が付く）。
- 待ち合わせ: 検出後 3 秒は状態を判定しない（`unknown`）ので、成功は検出から 3 秒以上後。`idle`（または `done`）で成功。
  - `blocked`（信頼の確認・承認等）になったら `agent_not_ready`。名前は付いたままなので、`agent read`・`agent send-keys` で答え、
    `agent wait <name>` で待ち直せる。
  - 別の種類のエージェントが検出された → `agent_kind_mismatch`。名前の付いたエージェントが終了した・入れ替わった・pane が閉じた →
    `agent_start_failed`。`--timeout`（既定 30000。3000 より大きく 300000 以下。範囲外は `invalid_agent_timeout`、0 以上の整数でなければ使用誤り）を
    過ぎた → `timeout`（検出されて名前が付いていれば、名前は付いたまま）。
- 他の code: `unsupported_agent_kind`（サーバ）・`agent_pane_not_found`・`agent_start_input_failed`（端末に書けなかった）。

```bash
pane=$(wtmctl pane split p1 --direction right | jq -r .pane.id)
wtmctl agent start reviewer --kind codex --pane "$pane" -- -m gpt-5.4
wtmctl agent prompt reviewer "この差分をレビューして" --wait --timeout 600000
```

### 例: エージェントに作業させて、終わるのを待って結果を読む

```bash
pane=p2                                                    # wtmctl agent list で調べた pane ID
wtmctl agent prompt "$pane" "テストを直して" --wait --timeout 600000   # 送って、作業が始まったのを確かめ、終わるまで待つ
wtmctl agent read "$pane" --lines 120
```

### 例: 承認待ちで止まったら、画面を読んで答える

```bash
wtmctl agent wait "$pane" --until blocked --timeout 600000
wtmctl agent read "$pane" --lines 40
wtmctl agent send-keys "$pane" esc                         # 取り消す（答えるなら例えば y や enter）
```

## エージェントに教える（skill ファイル）と、pane の中から使う

### skill ファイル（`wtmctl skill`）

`wtmctl skill` は、コーディングエージェント（Claude Code・Codex 等）に wtmctl の使い方と作法を教える Markdown（skill ファイル）を標準出力に書く
（サーバにはつながない。中身はリポジトリの `packages/cli/skills/wtmctl/SKILL.md` で、使っている wtmctl と同じ版のもの）。wtmctl を更新したら入れ直す。

```bash
# Claude Code（利用者全体）。プロジェクトだけなら <プロジェクト>/.claude/skills/wtmctl/ に置く
mkdir -p ~/.claude/skills/wtmctl && wtmctl skill > ~/.claude/skills/wtmctl/SKILL.md
# skill の仕組みの無いエージェント（Codex 等）は、プロジェクトか利用者の指示（AGENTS.md 等）に貼る（先頭の --- で囲んだ front matter は除く）
wtmctl skill | awk 'NR==1&&/^---$/{f=1;next} f&&/^---$/{f=0;next} !f' >> AGENTS.md
```

skill は、最初に pane の中にいるか（`WTM_PANE_ID` があるか）を確かめ、無ければ止まるようエージェントに指示する（wtm の外のエージェントが
自分のものでない session を操作しないため）。ほかに教えること: 構文の正典は `wtmctl help`・ID は応答の JSON から読む・隣の pane を作って
コマンドを走らせ結果を読む手順・エージェントを起動して prompt を送り待つ手順・自分が作っていないものを閉じない・`timeout` 等の後に確かめずに
送り直さない・承認ダイアログには利用者に確かめてから答える・token をコマンド行や会話に書かない・認証されていなければ利用者に `wtmctl login` を頼む。

### pane の環境変数

サーバは pane を起動するとき、次の変数を入れる（サーバが管理する変数で、サーバを起動した環境から受け継いだ同名の値は使わない）。

| 変数 | 中身 |
|---|---|
| `WTM_PANE_ID` | その pane の ID（`p3` 等）。pane の中にいる印を兼ねる（herdr の `HERDR_ENV=1`・`HERDR_PANE_ID` に当たる） |
| `WTM_SERVER_URL` | その pane を動かしているサーバへ wtmctl がつなげる URL（URL にできない待ち受け〔ゾーン付きの IPv6 等〕では入れない）。待ち受けが `0.0.0.0` なら `http(s)://127.0.0.1:<port>`、`::` なら `[::1]`、それ以外は待ち受けのホスト。ポートは実際に待ち受けているもの |
| `WTM_AGENT_REPORT_SOCKET` | 公式フック連携の report の socket（あれば） |

サーバを起動した環境の `WTMCTL_URL`・`WTMCTL_TOKEN` は pane に**渡さない**（別のサーバを指していることがあり、token は秘密なので pane の全プロセスと
エージェントの記録に流さない。Windows では大文字小文字を区別せずに取り除く）。pane の環境に token・cookie は入らない。

### 接続先と認証

- 接続先は `--url` → `WTMCTL_URL` → `WTM_SERVER_URL` → `http://127.0.0.1:7780` の順。pane の中では何も付けずにその pane のサーバにつながる
  （名前付き session・`--port` で別のポートのサーバでも）。
- TLS で全インタフェースに待ち受けるサーバでは、`WTM_SERVER_URL` は `https://127.0.0.1:<port>`（`::` なら `https://[::1]:<port>`）になるので、証明書に `127.0.0.1`（`::1`）が要る（mkcert の例は
  `docs/tls-setup.md`）。無ければ pane の中で `WTMCTL_URL` に証明書の名前の URL を export する（そのときは下の歯止めが効かなくなる）。自己署名・mkcert の CA は Node に教える
  （`NODE_EXTRA_CA_CERTS`。pane の外と同じ）。
- pane のシェルの初期化（`.bashrc` 等）で `WTMCTL_URL` を export していると、そちらが `WTM_SERVER_URL` より優先される。
- 認証は pane の外と同じく、利用者が `wtmctl login` で保存した session cookie（`~/.wtmctl`）を使う。cookie は URL の origin ごとに保存されるので、
  **pane の中の接続先と同じ origin で** login しておく（`http://localhost:7780` で login していても、`http://127.0.0.1:7780` では見つからない）。
  まだなら、利用者が `wtmctl login --url <URL> --token <TOKEN>` を打つ（`<URL>` は pane の中の `echo "$WTM_SERVER_URL"` の値。pane の外の端末には
  この変数が無いので値そのものを渡す。skill はエージェントに、その値を示して利用者に頼ませる）。

### 自分の pane への操作の歯止め（`self_target`）

pane の中の wtmctl（`WTM_PANE_ID` と `WTM_SERVER_URL` があり、接続先の origin が `WTM_SERVER_URL` と同じ）は、次の操作の対象が**自分の pane**、
または**それを含む tab・workspace** のとき、操作の要求を送らずに `self_target`（終了コード 1）で終わる。

`pane close`・`pane input`・`pane run`・`pane attach`・`pane control`・`tab close`・`workspace close`・`agent prompt`・`agent send-keys`・`agent start`

- 自分の pane を閉じると自分が終わり、自分の pane への入力・prompt は自分の入力欄に混ざり、自分の pane への直結は出力が自分に返って流れ続けるため。
  エージェントを名前で指しても、その pane が自分なら断る。
- 読み取り・分割・名前付け（`pane read`・`pane observe`・`pane split`・`snapshot`・`watch`・`agent list/get/wait/read/rename` 等）は断らない。
- 意図してやるとき（人が自分の pane を閉じる等）は `WTM_PANE_ID` を空にして打つ: `WTM_PANE_ID= wtmctl pane close "$WTM_PANE_ID"`。
  別のサーバ（`--url`・`WTMCTL_URL` で別の origin）につなぐときは効かない。ループバックの名前（`localhost`・`127.0.0.1`・`[::1]`）の違いと既定のポートの
  省略は同じサーバとみなす（`WTMCTL_URL=http://localhost:7780` を export していても外れない）。ループバック以外の名前（TLS の証明書の名前・LAN の IP 等）で
  同じサーバを指した `WTMCTL_URL` では、同じサーバだと見分けられないので**効かない**（何も表示しない）。
- **安全の境界ではない**。誤操作を止めるだけで、環境変数を消せば効かず、認証済みの接続は今までどおりどの pane にも書ける。

## herdr との対応と違い

### `pane attach`

herdr の `terminal attach <terminal_id> [--takeover]` に相当する（`docs/herdr-parity.md` の H40）。同じ点: 1 端末に書き込み可能な直結は 1 つ・
`--takeover` で奪う・直結の大きさを優先してフル UI（ブラウザ）からは変えない・`Ctrl+B q` / `Ctrl+B Ctrl+B`・切り離しは終了コード 0 でそれ以外の終わり方は 1（使い方の誤りは 2）・
フル UI からの入力は止めない。違い:

- herdr はサーバで描き直したフレームを送るが、wtmctl は **pane の生の出力をそのまま流す**。このため pane の中のアプリが代替画面から出ると
  手元の端末も主画面に出て、直結前の画面に出力が重なる。kitty keyboard のフラグ・modifyOtherKeys は切り離しても戻さない
  （pane のエージェントがそれを有効にしていた場合、切り離した後に手元のシェルのキー入力の符号化が戻らないことがある）。
- 直結中のサーバ側のスクロール（ホイール・PageUp/PageDown で遡る）は無い。対象は pane ID だけ（`agent attach <name>` は無い）。
- 閲覧専用の `terminal session observe`・NDJSON で制御する `terminal session control` は、`pane observe`・`pane control` が相当する（下）。
- Windows の端末からの直結は確かめていない（herdr はネイティブ Windows では直結できない）。

### `pane observe`・`pane control`

herdr の `terminal session observe <target> [--cols N] [--rows N]`・`terminal session control <target> [--takeover] [--cols N] [--rows N]` に相当する
（`docs/herdr-parity.md` の H40）。同じ点: 記録の形（`terminal.frame` の `seq`・`encoding`・`width`・`height`・`full`・`bytes` と `terminal.closed`）・
複数の観測者・観測者は入力・大きさ・奪取の権限を持たない・control の所有者は 1 つで `--takeover` で奪う・stdin の `terminal.input`（`text` か `bytes`。両方は不可）・
`terminal.resize`・`terminal.release`・不正な行は stderr に出して読み飛ばす・stdin の終わりで所有を返す・control の `--cols/--rows` の既定 120×40。違い:

- herdr のフレームはサーバが描き直した画面（観測者の `--cols/--rows` の大きさ）。wtmctl は **pane の生の出力を区切ったもの**で、`width`/`height` は pane の実際の大きさ。
  そのため `pane observe` は `--cols/--rows` を持たない。
- `terminal.scroll` は未対応（不正な行として読み飛ばす）。対象は pane ID だけ（herdr は terminal・agent も受ける）。
- 大きさは 1〜1000（herdr は 1〜65535）。不正な行の検査が厳しい（知らないキー・非正規の base64・Unicode の空白や BOM も不正。herdr は知らないキーを無視する）。
- 読み手が遅いとき、herdr は 30 秒書けなければ切るが、wtmctl は受信を止めて待ち、追いついたら描き直し（`full: true`）から続ける。
- 終わり方の `reason` は「stdout の記録」、終了コードは「終了コード」の節のとおり（herdr はサーバがストリームを閉じた理由を `terminal.closed` の `reason` に載せ、終了コードは 0）。

### `agent`

herdr の `agent list` / `agent get` / `agent wait` / `agent read` / `agent prompt`（`--wait`）/ `agent send-keys` / `agent rename` に相当する
（`docs/herdr-parity.md` の H39）。違い:

- 名前の書式・一意性・`<target>` の解決順（pane ID → 名前）・`--clear`・code（`invalid_agent_name`・`agent_name_taken`・
  `agent_not_found`）は herdr と同じ。違うのは、名前が消える条件（herdr は検出の一時的な揺れでは消さないが、本製品は検出が一度
  外れると別のエージェントとして数え直すので消える）と、保存しないこと（herdr は session に保存して復元する）。
- `agent start`: 空いているシェルの判定・kind の表と実行ファイル・`--` の後の引数・制御文字の拒否・起動中の名前の予約・`blocked` で
  `agent_not_ready`・既定 30 秒と範囲・`agent_pane_busy` の 2 秒の再試行・code は herdr と同じ。違い:
  - 対応するシェルは POSIX 系（sh・bash・dash・zsh・ksh・mksh）だけで、それ以外と Windows のサーバは `unsupported_agent_shell`（herdr に無い code。
    herdr は fish・csh 等にも POSIX のクォートを使い、Windows は PowerShell／cmd.exe 向けに組み立てる）。
  - 引数は全部を単一引用符で包む（herdr は安全な文字だけの引数を裸で出す）。打ち込む前に Ctrl-C と Ctrl-E・Ctrl-U を送る（herdr は送らない）。
    打ち込む 1 行は 4000 バイトまで。
  - `--kind` は正規の名前だけ（herdr は `claude-code` 等の別名も受ける）。`omp`・`mastracode` は無い（本製品が検出できない）。
  - 起動中（検出前）は `agent list` に出ない。検出されて名前が付いた後は、締め切りを過ぎても名前を外さない（herdr は起動完了前なら外す）。
    `agent_pane_busy` の再試行はシェルが初期化中かを見ずに行う。起動時の会話の再開・名前の保存は無い。
- `agent focus`・`agent explain`・`agent attach` は無い。
- `agent prompt`: herdr の Windows 向けの回避策（Codex への貼り付けの区切り・Copilot へのフォーカス通知）と `agent_not_ready`（名前付きで
  起動中の判定。本製品では `agent start` だけが返す）は無い。`--timeout` が送信の途中で尽きたらその時点で `timeout` になる（herdr の Unix 版は送信の完了を待つ）。
  待ち行列の後ろで待っている間の `blocked`・エージェントの終了を書く直前にも確かめる（herdr は受け付けの時点だけ）。
  本文の中の貼り付けの印（`ESC[200~`・`ESC[201~`）を取り除く（herdr はそのまま包む）。
- `agent send-keys`: キーの符号化は xterm の既定だけ（kitty keyboard protocol には合わせない）。`cmd`/`super`/`hyper` の修飾は無い。
- `agent read` に `--source` は無い（常にスクロールバック込みの画面の末尾 N 行。alternate screen を使うエージェントでは
  今の alt screen の中身だけ）。alternate screen の履歴を自動でスクロールして読む機能も無い。
- 出力は camelCase で、herdr の `.result.agent` は `.agent` に当たる（例: `jq -r .agent.status`）。
- エラーの code（`agent_not_found`・`agent_not_running`・`timeout`・`agent_blocked`・`agent_prompt_stalled`・`empty_agent_prompt`・
  `invalid_key`）と、`--until` の既定・300ms の遅延 Enter・5 秒の活動の確認・終了コードは herdr と同じ。
- 本物の Claude Code 等での送信は確かめていない（bracketed paste を有効にする偽のエージェントでの結合テストだけ。
  `.aidev/works/20260926-agent-prompt-send-keys/test-result.md`）。

### skill ファイル・pane の環境変数

herdr の agent skill（`skills/herdr/SKILL.md`・`herdr --skill`）と pane の環境（`HERDR_ENV` 等）に相当する（`docs/herdr-parity.md` の H39）。違い:

- skill は `wtmctl skill` で出す（herdr は `herdr --skill`）。中身は本製品のコマンドに合わせて書き直した日本語のもの。`npx skills add` 等の配布は無い。
- pane の中にいる印は `WTM_PANE_ID`（herdr は `HERDR_ENV=1`）。接続先は socket のパスではなく URL（`WTM_SERVER_URL`）で、認証は利用者の login の
  キャッシュ（herdr の socket はファイルの権限で守られ、認証が無い）。`HERDR_WORKSPACE_ID`・`HERDR_TAB_ID`・`HERDR_BIN_PATH` に当たる変数は無い。
- herdr の `--current`・`pane split` の対象の省略（呼び出し元の pane を既定にする）・`pane current` は無い。`"$WTM_PANE_ID"` を明示して渡す。
- 自分の pane への操作を断る `self_target` は本製品だけ（herdr は断らない）。
- サーバを起動した環境の `WTMCTL_URL`・`WTMCTL_TOKEN` を pane に渡さない（herdr は管理する変数を上書きするが、token に当たるものは無い）。
