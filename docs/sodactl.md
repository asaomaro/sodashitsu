# sodactl（外部操作 CLI）

`sodactl` は、動いている `soda serve` をブラウザを介さずに操作する CLI（`packages/cli`）。
ブラウザと同じ認証（token でのログイン → session cookie）と同じ接続（`/ws`。Origin/Host の検査つき）を使う。
例外は pane の中の `sodactl ask` と `sodactl display` だけで、Linux・macOS ではログイン不要のローカルの受け口（状態ディレクトリの `pane.sock`）を使う（下の「ログイン不要の受け口（pane.sock）」）。
ほかのコマンドは、新しいソケットや認証の入口を持たない。

## 接続とログイン

```bash
sodactl login --url http://127.0.0.1:7780 --token <TOKEN>   # session cookie を ~/.sodactl に保存（token は保存しない）
export SODACTL_URL=http://127.0.0.1:7780                    # 以後 --url を省ける（既定もこの値）
```

- 各コマンドは `--url` / `--token`（または環境変数 `SODACTL_URL` / `SODACTL_TOKEN`）を受ける。soda の pane の中では、`--url`・`SODACTL_URL` が無ければ
  その pane を動かしているサーバ（pane の環境の `SODA_SERVER_URL`）につなぐ（下の「pane の中から使う」）。
  保存済みのセッションが失効していて token が分かれば、1 回だけ再ログインしてやり直す。
- 成功は終了コード 0（結果は stdout に JSON／テキスト）、サーバ・待ち合わせのエラーは 1（stderr に
  `{"error":{"code","message"}}`）、使い方の誤りは 2。

## コマンド一覧

```
sodactl workspace create [--cwd <path>] [--label <text>]
sodactl workspace close <workspaceId>
sodactl workspace rename <workspaceId> <label>
sodactl workspace report-metadata <workspaceId> --source <ID> [--token <NAME=VALUE>]... [--clear-token <NAME>]... [--seq <N>] [--ttl-ms <N>]
sodactl tab create [--workspace <id>] [--label <text>]
sodactl tab close <tabId>
sodactl pane split [<paneId>|--pane <paneId>|--current] --direction right|down [--ratio <0.05-0.95>]   # 省略時は下の「呼び出し元の pane」
sodactl pane current [--pane <paneId>|--current]                   # pane の今の tab・workspace を JSON で出す
sodactl pane close <paneId>
sodactl pane input <paneId> <text>          # Enter を付けずに送る
sodactl pane run <paneId> <command>         # command と改行を送る
sodactl pane read <paneId> [--follow] [--raw] [--timeout <ms>]
sodactl pane attach <paneId> [--takeover]   # 手元の端末をその pane に直結する（Ctrl+B q で切り離す）
sodactl pane observe <paneId>               # pane の画面を NDJSON で流し続ける（閲覧専用）
sodactl pane control <paneId> [--takeover] [--cols <N>] [--rows <N>]   # NDJSON で流し、stdin の NDJSON で操作する
sodactl pane report-metadata <paneId> --source <ID> [--token <NAME=VALUE>]... [--clear-token <NAME>]... [--seq <N>] [--ttl-ms <N>]
sodactl snapshot
sodactl watch [--json]
sodactl agent list
sodactl agent get <target>                  # <target> は pane ID か、agent rename で付けた名前
sodactl agent wait <target> [--until working|blocked|idle|done|unknown]... [--timeout <ms>]
sodactl agent read <target> [--lines <N>] [--raw] [--timeout <ms>]
sodactl agent prompt <target> <text> [--wait] [--until working|blocked|idle|done|unknown]... [--timeout <ms>]
sodactl agent send-keys <target> <key>...
sodactl agent rename <target> <name>|--clear
sodactl agent start <name> --kind <KIND> --pane <paneId> [--timeout <ms>] [-- <args>...]
sodactl graph show [--json]                 # 連携のグラフ（下の「連携のグラフ」）。graph のコマンドは既定が表、--json で JSON
sodactl graph link add <from> <to> [--kind trigger|supervise|approval] [--on done|blocked] [--prompt <text>] [--output <N>|--no-output] [--when-busy wait|skip] [--mode notify|delegate] [--lines <N>] [--limit <N>] [--json]
sodactl graph link set <linkId> [--on …] [--prompt …] [--output <N>|--no-output] [--when-busy …] [--mode …] [--lines <N>] [--limit <N>] [--json]
sodactl graph link rm|pause|resume <linkId> [--json]
sodactl graph pause|resume [--json]         # グラフ全体
sodactl graph node add <pane>... [--json]
sodactl graph node rm <pane> [--json]
sodactl graph node rekey <pane> <newPane> [--json]
sodactl graph history [<linkId>] [--limit <N>] [--json]
sodactl ask [--timeout <ms>] < spec.json    # pane の中のプログラムの質問のフォームを、その pane を見ているブラウザの画面に出す（下の「質問のフォーム」）
sodactl display set <name> --kind panel|band [--title <text>] [--size <px>] [--ttl-ms <ms>] [--dock right|left|top|bottom|float] [--edge top|bottom] [--collapsed] (--text <text> | --markdown-file <path> | --html-file <path> | --script-html-file <path> | [--format text|markdown|html|script-html] < stdin) [--wait [--timeout <ms>]]   # この pane を見ているブラウザの画面に、パネル（端末の右・左・上・下）か帯（端末の上か下）を出す（`docs/display.md`）。`script-html` は中身のスクリプトが枠の中で動く形式（信頼できない中身には使わない）
sodactl display send <name> (--json <JSON> | < stdin)   # スクリプトが動く面（`script-html`）へデータを送る（64 KiB まで・保存されない。結果は {"status":"ok","delivered":n}）
#   --dock（パネルだけ）・--edge（帯だけ）・--collapsed は「初めの置き方」の指定（利用者が一度でも動かしたら、利用者の状態が勝つ。`--dock float` の面は、記憶が無い間は閉じて始まる〔帯の行のボタンから利用者が開く。`docs/display.md`「浮いた窓」〕）。違う種類に付けると使い方の誤り（終了コード 2）。
#   `layout` を知らない古いサーバ（--features の server.features に無い）へは 3 項目を外して送り、結果に "ignored": ["dock", …]・標準エラーに 1 行（終了コード 0）。`docs/display.md`「たたむ・置き場所・帯の行のボタン」
sodactl display close (<name> | --all) / list / wait [<name>] / events [<name>...] / --features   # 面の閉じる・一覧・操作を待つ・続けて受け取る・機能確認（pane の中ではログイン不要）
sodactl ext list|reload / log <id|key> / restart <id|key>   # 拡張（設定に登録して soda が起動するプログラム）の状態・ログ・読み直し・起動し直し（下の「拡張（`ext`）」）
sodactl skill                               # エージェントに sodactl の使い方を教える Markdown（skill ファイル）を出す
```

## id の指定（UUID と先頭の部分）

workspace・tab・pane・グラフの線の id は UUID（`3f2a9c10-1111-4111-8111-aaaaaaaaaaaa` の形）で、一度使った id は二度と使われない。長いので、`sodactl` の
`<workspaceId>`・`<tabId>`（`tab close`）・`<paneId>`・`<target>`（pane の id で指すとき）・`<linkId>` は、**完全な id か、一意に決まる先頭の部分（4 文字以上、UUID に使う
16 進数字とハイフン）**を受ける。部分はつないだ先の一覧（hello の snapshot・`graph.get`）で完全な id に直してから送る。

- 完全に一致する id があればそれ。2 つ以上に当たる部分は `id_ambiguous`（終了コード 1。メッセージに候補が並ぶ）、当たらなければ `not_found`・`agent_not_found`（既存の扱い）。
- 自分の pane を対象にする操作の歯止め（`self_target`）は、部分で指しても効く（完全な id に直した後で確かめる）。
- 環境変数 `SODA_PANE_ID` は完全な id。`pane split`・`pane current` の対象を省いたときも完全な id を使う。
- `graph` の表の `node`・`link`・`from`・`to` は先頭 8 文字の短い呼び名（そのまま指定に使える）。完全な id は `key` の列と `--json`。別のマシンの pane（`<マシン>:<pane>`）と、
  手元の閉じた pane のノード（`graph node rm`）は、一覧を引けないので完全な id で指す。
- `--machine` のときは、そのマシンの一覧から引く（id はマシンごとに別）。

## ほかのマシンへ送る（`--machine`）

`sodactl --machine <名前|id> <コマンド> …` で、手元の `soda serve` に `soda machine add` で登録したマシンの `soda serve` へコマンドを送る
（20260927-multi-host-machines。herdr の `herdr --machine`）。手元の `soda serve` の `/ws?machine=` を通すので、手元の `soda serve` が動いていて、そのマシンが
繋がっている必要がある。`login`・`skill` 以外の全コマンドに使える。id（pane・エージェントの名前を含む）はマシンごとに別。
登録に無い・無効・曖昧は `machine_not_found`、繋がっていないは `machine_unavailable`（終了コード 1）。`--machine` のとき自分の pane の歯止め（`self_target`）は
効かない（`--machine local` は手元そのもの）。詳しくは `docs/machines.md`。

## サイドバーの独自トークン（`workspace report-metadata`・`pane report-metadata`）

外のスクリプト・エージェントのフックが、workspace・pane ごとに名前付きの短い値（独自トークン）をサーバへ報告する。値はサーバのメモリだけに持ち
（`session.json` に保存しない。再起動・`soda handoff` で消える）、接続しているすべてのブラウザへ配られる。ブラウザは、設定画面（節「表示」の
「サイドバーの行（上級者向け）」）で行の並びに `$名前` を置いたときだけ、その値を出す——spaces の行は workspace の値、agents の行は pane の値を読む。

```sh
sodactl pane report-metadata "$SODA_PANE_ID" --source my-hook --token summary="認証を直している" --token model=opus
sodactl workspace report-metadata 7c1e0a52 --source ci --token build=green --ttl-ms 600000
sodactl pane report-metadata 3f2a9c10 --source my-hook --clear-token summary
```

- **`--token` は値で見分ける**: `=` を含めば独自トークンの `NAME=VALUE`（最初の `=` で分ける）、含まなければ全コマンド共通の接続の token
  （`--token <TOKEN>`。接続の token は `=` を含まない）。**`=` を書き忘れた `--token summary` は独自トークンにならない**: ほかに `NAME=VALUE` が無ければ
  `missing token to set or clear`（終了コード 2）。ほかにあれば `summary` は接続の token の候補として扱われ、`sodactl login` のキャッシュが使えるあいだは
  使われずに捨てられる（報告は成功し、`summary` だけが出ない）。キャッシュが無い・失効しているときは、それで認証を試みて失敗する（`unauthorized`）。
  herdr のスクリプトを写すときは `NAME=VALUE` の形を確かめる。
- 値は前後の空白と制御文字を除いて 80 文字まで。整えて空になった値は消去（`--clear-token` と同じ）。触れない名前はそのまま残る。同じ名前を 1 回の報告で
  複数回指定すると最後が勝つ。
- 名前は `[A-Za-z0-9_-]` の 1〜32 文字、1 回の報告で 16 まで、1 つの対象で 32 まで。`--source` は `[A-Za-z0-9:._-]` の 1〜80 文字（必須）。
- `--seq N`: 同じ `--source` から受け付けた `seq` 以下の報告は、成功を返すが何も変えない（遅れて届いた古い報告を無視する）。1 つの対象が `seq` 付きで
  受け付ける `--source` は 32 まで（消去・期限でも枠は戻らない）。
- `--ttl-ms N`（1〜86400000）: その報告で設定した名前だけ、時間が来たら消える。`--ttl-ms` 無しで設定し直すと期限は外れる。
- 誤りの code（stderr の JSON・終了コード 1）: `not_found`・`invalid_metadata_source`・`invalid_metadata_ttl`・`invalid_metadata_token`・`metadata_token_limit`・
  `metadata_sequence_source_limit`（herdr と同じ）。生の長さ 4096・組 256 の上限（下の「herdr との対応と違い」）を超えると `invalid_params`。引数の形の誤り（`--source` が無い・設定も消去も無い・`NAME` が空・`--seq`/`--ttl-ms` が整数でない）は終了コード 2。
- 値は全ブラウザに文字として出る（HTML として解釈されない）。秘密を載せない。

## pane への直結（`pane attach`）

手元の端末（SSH 先のシェルを含む）を pane 1 枚に直結し、ブラウザを開かずにその場の端末として操作する。

```bash
sodactl pane attach 3f2a9c10              # 直結する
sodactl pane attach 3f2a9c10 --takeover   # 既に別の端末が直結していれば、それを奪って直結する
```

- つないだ時点の**見えている画面**を描き、以後の出力をそのまま流す。打鍵はそのまま pane へ送る（手元の端末は raw モード・代替画面になる）。
  直結より前のスクロールバックは送らない。pane の出力に含まれる端末への問い合わせ（DA・カーソル位置の報告・色の問い合わせ・クリップボードの読み出し等）は
  手元の端末に書かない——答えるのはサーバだけ（ブラウザと同じ）で、手元の端末にも答えさせると答えが二重に pane へ届くため。
- **`Ctrl+B q` で切り離す**（pane のプロセスは止めない）。`Ctrl+B Ctrl+B` で `Ctrl+B` を 1 つ送る。`Ctrl+B` に続くそれ以外のキーは両方を送る。
- 直結している間、**pane の大きさは手元の端末の大きさ**になり、手元の端末の大きさを変えると追従する（サーバの上限の 1 辺 4096・面積 1,000,000 セルを
  超える端末では、幅を保って上限の内側に丸めて送る。「サーバ側の上限」）。ブラウザの表示の大きさ（サイズ権限）は
  その pane の大きさを変えない（同じ tab のほかの pane は今までどおり）。切り離すと、その tab を見ていて大きさを決めているブラウザがいれば、その
  ブラウザの大きさへ戻る。いなければ（決めているブラウザがいない・別の tab を見ている・その pane が見えていない）、**直結する前の大きさへ戻る**
  （引き取られた直結を重ねても、最初の直結の前の大きさ）。
- **同じ pane に直結できるのは 1 つだけ**。既に直結があれば `pane_attached` で終わる（何も変えない）。`--takeover` なら奪い、奪われた側は
  `attach_taken_over` で終わる。
- 直結中もブラウザでの表示と入力はそのまま使える（ブラウザの入力は止めない。ブラウザから直結を奪う・切り離す操作は無い）。
  直結の所有者は**安全の境界ではない**——認証済みの接続は今までどおり pane に書ける。ブラウザと同じ認証と `/ws`（Origin/Host の検査つき）を使う。
- 終了コード: 切り離しは 0（stderr に `sodactl: detached from <paneId>`）。奪われた（`attach_taken_over`）・pane のプロセスが終わった・pane が閉じられた
  （`pane_closed`）・サーバ側から切れた（`connection_closed`）・既に直結がある（`pane_attached`）・pane が無い（`not_found`）・
  標準入力か標準出力が端末でない（`not_a_tty`）は 1。使い方の誤りは 2。
  どの終わり方でも、手元の端末のモード（色・カーソルの表示と形・スクロール領域・マウスの報告・bracketed paste 等）を戻し、代替画面から出る。
  `SIGTERM`・`SIGHUP` で止められたときは切り離しと同じに扱う。

## pane の NDJSON ストリーム（`pane observe`・`pane control`）

別のプログラム（pane の画面を別の UI へ中継するブリッジ・エージェントを操る自動化）が `sodactl` を子プロセスとして起動し、
stdout を 1 行ずつ JSON として読む（`control` は stdin に 1 行 1 コマンドを書く）ための形。人が端末で使うなら `pane attach`。

```bash
sodactl pane observe 3f2a9c10                                  # 閲覧専用。何本でも同時に動かせる
sodactl pane control 3f2a9c10 --cols 120 --rows 40             # 書き込み可能（所有者は pane に 1 つ）
sodactl pane control 3f2a9c10 --takeover                       # 既に所有者（pane attach か control）がいれば奪う
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
- **読み手が遅いとき**: stdout の書き出し待ちが 1 MiB を超えると、sodactl はサーバからの受信を止める。その間の出力はサーバが捨て、読み手が追いつくと
  `full: true` の描き直しから続く（sodactl のメモリは増え続けない。切断もしない）。`pane control` はその間 stdin も読まない
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

- 不正な行はサーバに何も送らず、stderr に `sodactl: pane control input ignored: <理由>` を 1 行出して次の行へ進む。不正になるのは:
  UTF-8・JSON として正しくない（先頭の BOM・全角空白を含む）／オブジェクトでない／`type` が無い・文字列でない・上の 3 つ以外（`terminal.scroll` は未対応として不正）／
  知らないキーがある（`terminal.resize` の `cell_width_px`・`cell_height_px` は 0 以上の整数なら受け付けて使わない。そうでなければ不正）／
  `text` と `bytes` の両方かどちらも無い／`text` が文字列でない／`bytes` が正規の base64 でない／`cols`・`rows` が 1〜1000 の整数でない／
  1 行が 1 MiB を超える（次の改行まで捨てる）。空白（space・tab・CR）だけの行は黙って無視する。
  stderr を読まない相手でメモリを使い続けないよう、stderr の書き出し待ちが 64 KiB を超えている間は警告を捨てる。
- `terminal.release`・stdin の終わり・`SIGINT`/`SIGTERM`/`SIGHUP` で所有を返し、`terminal.closed`（`released`）を出して終了コード 0。
  所有を返すと、pane の大きさは、その tab を見ているブラウザの大きさ、いなければ直結する前の大きさへ戻る（`pane attach` の切り離しと同じ）。
- 所有者は**安全の境界ではない**（`pane attach` と同じ。認証済みの接続は今までどおり pane に書ける）。observe・control ともブラウザと同じ認証と
  `/ws`（Origin/Host の検査つき）だけを使い、ログインしていなければ stdout に何も書かずに失敗する。
- **pane が入力を読まないとき**（raw モードで固まった TUI 等）、サーバはその pane に溜まった入力と新しい入力の合計が 16 MiB を超える `terminal.input` を
  **pane に書かずに丸ごと捨てる**（「サーバ側の上限」）。捨てたときは stderr に
  `sodactl: pane control input dropped: pane <paneId> is not reading input (server input queue is full)` を出す（サーバは同じ pane について 2 秒に 1 回だけ
  知らせるので、捨てた回数ではない）。stdout の記録と終了コードは変えない。sodactl は stdin を読んだ速さのまま送る（pane が読むのを待たない）ので、
  読むのが遅いプログラムへ大きなファイルを流し込むときは、欠けないよう送る側で間を空けるか分けて送る。

### 終了コード

- 0: `pane_closed`・`released`。
- 1: `taken_over`（`attach_taken_over`）・`connection_closed`・stdout に書けなくなった（`output_closed`。`terminal.closed` は書かない）。
  始まる前の失敗（`not_found`・`pane_attached`・未ログイン等）は stdout に何も書かない。エラーは stderr に `{"error":{"code","message"}}`。
- `pane control` で解放（`terminal.release`・stdin の終わり・シグナル）を始めた後に届いた奪取・切断・pane の終わりは、`released`・終了コード 0 として終える。
- 2: 使い方の誤り（`--cols 0` 等）。
- `pane observe` はシグナルを受け止めない。止めるなら `SIGTERM` 等で終わらせる（`terminal.closed` は出ず、終了コードはシグナルによる）。
  所有を持たないので、止めても pane とほかのクライアントには何も起きない。

## サーバ側の上限

サーバ（`soda serve`）は `/ws` から届く大きさと入力を次の範囲に絞る。ブラウザと `pane attach` は送る前に範囲の内側に丸め、`pane control` は範囲の内側（1〜1000）の値しか受け付けないので、普段は気にしなくてよい
（生の `/ws` や古い sodactl から範囲の外を送ったときのためのもの）。**安全の境界ではない**——認証済みの接続はもともと pane でコマンドを走らせられる。
誤り・誤用（壊れたクライアント・読まない pane への流し込み）でサーバの全 pane を巻き込まないためのもの。

- **端末の大きさ**（`pane attach`・`pane control` の所有・`--cols/--rows`・`terminal.resize`、ブラウザの表示）: 1 辺 1〜4096・`cols × rows` が 1,000,000 セル以下
  （herdr のクライアントの画面の上限と同じ）。外れた要求は `invalid_params` で断られ、pane の大きさは変わらない。`pane control` の 1〜1000 はこの内側。
- **pane に溜まる入力**: pane のプログラムが読まずにサーバの中に溜まった入力が、pane ごとに 16 MiB まで（1 回の入力ごとに 256 バイトを上乗せして数える——1 バイトずつの大量の入力も約 6.5 万回で止まる）。それを超える入力は途中まで書かずに丸ごと捨て、
  送った接続に `client.error`（`input_queue_full`）で知らせる。1 回の入力（INPUT）は今までどおり 1 MiB まで。`agent prompt`・`agent send-keys`・`agent start` は
  上限を超える pane には何も書かず `input_queue_full` で失敗する。サーバ自身が書く端末の問い合わせへの応答は捨てない。
  知らせを表示するのはブラウザ（画面の下の通知）と `pane control`（stderr）だけ。**`pane attach` は知らせを表示せず**（直結の画面に割り込ませない）、
  `pane input`・`pane run` は 1 通送って `{"ok":true}` を出して終わる（捨てられたかを待たない）——どちらも、固まった pane への入力は黙って消える。
- **質問のフォーム**（`ask`）: 定義全体 256 KiB（JSON の UTF-8）・質問 100・1 つの質問の選択肢 200・`id`／`value` 200 文字・`title`／`label`／`page` 等の短い文字列 500 文字・
  `intro`／`help`／`desc` 4,000 文字・1 つの選択肢の `colors` 16 個（超えた分は捨てる）。回答の自由入力・`text` の答え・補足・質問ごとの自由記述（`comments`）の 1 つは 10,000 文字まで。自由記述の長さの合計は 100,000 文字まで（超える回答は断られる）。`--timeout` は 1,000〜86,400,000 ミリ秒。
  定義の上限の超過は使い方の誤り（終了コード 2）。標準入力は 1 MiB までしか読まない。サーバが同時に待てる質問は総数 32・1 つの接続あたり 8 まで（超えると `ask_busy`。終了コード 1）。
- **表示の面**（`display`。`docs/display.md`）: 中身 1 つ 2 MiB（UTF-8）・サーバ全体で合計 32 MiB・面は pane ごとにパネル 4・帯 2、全体で 64・`set` の頻度は pane ごとに続けて 10 回まで（1 秒に 10 回ぶん戻る）と量で続けて 8 MiB まで（毎秒 2 MiB 戻る）・`wait` の待ちは pane ごとに 4、全体で 32・題は 80 文字・操作の値は JSON で 8 KiB。
  受け口の要求の 1 行の上限は 4 MiB（中身 2 MiB の JSON 文字列でも収まる。`ask` の要求にも同じ上限がかかる）。外れた `set` は使い方の誤り（終了コード 2）か `display_limit`・`display_busy`。
  スクリプトが動く形式（`script-html`）は**設定で有効にしたときだけ**出せる（既定は無効。設定の画面の「スクリプトが動く表示を許可する」。`pane.sock` からは変えられない。ただし同じ OS の利用者で動くプログラムは、状態ディレクトリの認証の情報を読めば自分で有効にできる——悪意のあるプログラムへの防御ではなく、不注意やふつうのプログラムが出すのを防ぐもの。詳しくは docs/display.md）。無効のとき `set`・`send` は `display_script_disabled`（終了コード 1。stderr に理由。**未対応の `unsupported`〔終了コード 0〕とは別**。`--features` の `server.scriptEnabled` が `false`）。有効 → 無効にすると、出ている面は閉じて `display.closed` の理由が `script_disabled`。
  スクリプトが動く形式（`script-html`）: `send` のデータは JSON で 64 KiB・pane ごとに毎秒 20 回。**その pane でフォーカスを 3 回取った／枠が別のページへ移った（`navigated`）ら、5 分間、その pane の `script-html` の `set` は `display_busy`（終了コード 1。理由の文をそのまま出す）**。静的な形式は出せる。`script-html` の `set`・`send` は、送る前に `display.features` を見て、`format:script-html`・`send` が無い `soda` には `{"status":"unsupported",…}`（終了コード 0）。`events`/`wait` の `display.action` の行に `source`（`static`＝静的な面、`script`＝スクリプトが動く面。`script` は利用者が押したとは限らない）が付く。
- **ログイン不要の受け口**（`pane.sock`。下の「ログイン不要の受け口（pane.sock）」）: 同時に開いている接続 64（超えた接続と `soda handoff` の途中の接続は、要求を読まずに `pane_socket_busy`。sodactl は 5 秒まで繋ぎ直す）・要求の 1 行 4 MiB（超えると `bad_request`。1 MiB から上げた。表示の面の中身 2 MiB を載せるため）・
  接続してから要求の 1 行が揃うまで 10 秒（過ぎたら何も返さずに切る）。受け口から出した質問も、上の総数 32 と「1 つの pane に同時に 1 つ」に数える。
- 複数ホストの中継（`--machine`・`/ws?machine=`）では、判定するのは**先のマシンの `soda serve`**（`docs/machines.md`）。

## 質問のフォーム（`ask`）

pane の中のプログラム（エージェント）が、利用者に選択肢の多い確認を**その pane を見ているブラウザの画面の上のフォーム**で聞く。ブラウザがサーバと同じマシンでも別のマシンでも同じに動き、
新しいウィンドウ・タブは開かない（pane に重なるダイアログとして出る）。Claude Code のスキル ask-form（`AskUserQuestion` の「1 問 4 択・1 回 4 問まで」に収まらない確認）と同じ定義・同じ結果の形。

```bash
sodactl ask [--timeout <ms>] < spec.json
# → stdout に結果の JSON を 1 行
{"status":"answered","answers":{"theme":"manual","mode":"single"},"custom":["theme"],"note":"…","comments":{"theme":"…"}}
```

### 入力（標準入力の JSON）

ask-form の質問の定義と同じ。全体: `title`・`intro`・`submit`・`note`（`false` で補足欄なし・文字列なら入力例）・`paging`・`comments`（`false` で自由記述を全部付けない）・`view`（成果物。下の「成果物」）・`questions`。質問: `id`・`label`・`type`（`single`〔既定〕・`multi`・`text`・`edit`・`rank`・`table`）・`help`・
`options`・`default`・`allowOther`（`otherLabel`・`otherPlaceholder`）・`showIf`・`required`・`multiline`・`placeholder`・`minWidth`・`page`・`filter`・`showValue`・`preview`・`thumb`・`comment`（`false` でその質問に自由記述を付けない）。選択肢は文字列か `{value, label, desc, recommended, colors, image, audio, code, lang, group}`。
`edit`・`rank`・`table` は下の「選ぶ以外の質問」、`image`・`audio`・`code`・`preview`・`thumb`・`group` は下の「画像・音・コード」。
**知らない項目は無視する**。`showIf` は `{"他の質問の id": 値 または 値の配列}`（複数なら「かつ」。上の質問から順に判定する）。

| 項目 | どこに書く | 値 | 意味 |
|---|---|---|---|
| `paging` | 全体 | `"auto"`（既定）・`true`・`false`・1 以上の整数（数は `true` と同じ扱い） | 質問の目次を出すか。`"auto"` はダイアログの高さに収まらないときだけ出す・`true` は必ず出す・`false` は出さない。`null` は書かなかったのと同じ。それ以外の値は使い方の誤り（終了コード 2）。下の「目次」 |
| `page` | 質問 | 文字列（500 文字まで。空文字も可） | まとまりの題（目次の見出し）。書くと、高さに収まっていても目次が出る（`paging: false` なら出ない）。`null` は書かなかったのと同じ。それ以外で文字列でなければ使い方の誤り（終了コード 2）。下の「目次」 |
| `comments` | 全体 | `false` | どの質問にも自由記述（各質問の下の「＋ 自由記述」）を付けない。`false` 以外（`true`・無指定・真偽でない値）は書かなかったのと同じ（付ける。誤りにしない）。下の「質問ごとの自由記述」 |
| `comment` | 質問 | `false` | その質問にだけ自由記述を付けない。`false` 以外は書かなかったのと同じ。`text` の質問には、もともと付かない |
| `filter` | 質問（`single`・`multi`） | 真偽 | 選択肢の絞り込みの欄を出すか。書かなければ、選択肢が 12 件以上のときに出る。真偽でない値・`text` の質問に書いたものは無視する |
| `showValue` | 質問（`single`・`multi`） | 真偽 | 表示名（`label`）と値（`value`）が違う選択肢に、値を横に出すか。書かなければ出る。真偽でない値・`text` の質問に書いたものは無視する |

- 検査は ask.py の `normalize()` と同じ（`questions` が空でない配列・`id`／`label`・`id` の重複なし・`type` は文字列〔対応は `single`・`multi`・`text` の 3 つ。**それ以外の型は下の「対応していない型」**〕・`text` 以外は選択肢が 1 つ以上・`value` の重複なし・`showIf` が実在する `id` を指す・`paging` と `page` の値の形）に、
  上の「サーバ側の上限」を足したもの。誤りは使い方の誤り（終了コード 2・stderr に理由。定義の文字列の中身は理由に入れない。例外は `id` の重複で、その `id` を示す）。`__proto__` という `id` は使えない。
  `colors` は `#rgb`・`#rgba`・`#rrggbb`・`#rrggbbaa` の形だけを色として使い、ほかは捨てる（誤りにしない）。
- 選択肢の値に特別な文字列は無い。値が `__other__`・空文字の選択肢も、ふつうの選択肢として使える（選べばその値が回答になる。空文字の値の選択肢を選んだ回答は `""` で、未回答ではない）。
  「その他」（`allowOther`）の自由入力とは別もので、同じ質問で併用できる。
- **対応していない型**: この版の `sodactl ask` が対応するのは `single`・`multi`・`text`・`edit`・`rank`・`table` で、**それ以外の型（知らない文字列を含む）の質問が 1 つでもあれば、
  質問を黙って落とさず、ダイアログを出さずに `{"status":"unavailable","reason":"…"}`（終了コード 0）を返す**（サーバへ送らない）。回答が欠けたまま `answered` になって、呼び出し側が聞いたつもりで進むのを防ぐため。
  呼び出し側（ask-form）は `AskUserQuestion` へ切り替える。`type` が文字列でないなど、型以外の誤りは今までどおり使い方の誤り（終了コード 2）。`remember` は ask-form 側（`ask.py`）が処理する。
- 標準入力が端末のとき（定義を渡していないとき）は、読まずに使い方の誤り。
- 対象は**呼び出し元の pane**（`SODA_PANE_ID`・`SODA_SERVER_URL`。pane の外・別のサーバへ向けると接続せずに `caller_pane_unknown`）。`--pane`・位置引数は取らない。`--machine` は `local` 以外では使えない
  （別のマシンの pane の質問は、そのマシンの pane の中で `sodactl ask` を打つ）。
- **Linux・macOS の pane の中では `sodactl login` が要らない**（その pane のサーバのログイン不要の受け口 `pane.sock` を使う。条件と、使えないときの動きは下の「ログイン不要の受け口（pane.sock）」）。
  Windows（ネイティブ）・`--url`／`SODACTL_URL` を明示したとき・受け口を持たない古いサーバでは、今までどおり `/ws` の経路で、`sodactl login` が要る。

### 選ぶ以外の質問（`edit`・`rank`・`table`）

| 型 | 画面 | 回答の値 | 項目 |
|---|---|---|---|
| `edit` | 文面が入った編集欄（直して返してもらう） | 直した後の文字列（末尾の空白は除く）。直されたら結果の `edited` に質問の id が入る | `text`（最初の文面。無ければ文字列の `default`。10000 文字まで）・`rows`（行数。1〜60）・`mono`（`false` で等幅にしない）・`required`（**既定で true**＝空は答えにできない。`false` で許す） |
| `rank` | ドラッグか `↑` `↓` で並べ替える一覧 | 並べた順の選択肢の `value` の配列（全部を 1 回ずつ） | `options`・`default`（最初の順の配列。選択肢の並べ替えでなければ無視して、`options` の順） |
| `table` | 行ごとに 1 つ選ぶ表（選択肢が 5 つまでは並んだボタン、より多ければ選択欄） | `{行の value: 選んだ value}`（全部の行が入る） | `rows`（行。文字列か `{value, label, desc, default}`。1 つ以上・`value` の重複なし）・`options`・`default`（行に `default` が無いときの値）・`rowLabel`・`pickLabel`（見出し） |

- サーバは回答を検査する: `rank` が選択肢の並べ替えでない・`table` の行が足りない／余る・値が選択肢にない・`edit` が必須なのに空・`edited` が直された `edit` 以外を指す、のとき `invalid_params` で断る（質問は開いたまま。画面は再度の決定を促す）。
  部品が出す正しい回答は断らない。`edit`・`rank`・`table` は `showIf` の条件にならない（`single`・`multi` だけ）。`table` の行・`rank` の選択肢にも `group`・`desc` が使える。
- 定義の誤りの分類（`ask.py` の `reason` と同じ名前）: `table` の `rows` が無い・空は `options_empty`、行の `default` が選択肢に無いのは `row_default_unknown`。

### 画像・音・コード（選択肢の `image`・`audio`・`code`・`lang`・`group`、質問の `preview`・`thumb`）

画面案の見比べ・実装方針の差分の比較に使う。**ファイルを読むのは `soda serve` の動くマシン**（pane のシェルと同じ権限で読める範囲。別のマシンの pane なら、そのマシンの `soda` が自分のファイルを読み、手元のブラウザへは既存の中継で運ばれる）。

| 項目 | 内容 |
|---|---|
| `image` | 画像の参照: **絶対パス**（相対パス・`~/` は `sodactl` が呼び出し元の cwd・ホームから絶対にして送る）・`https://…` の URL・`data:image/…;base64,…`。png・jpg・jpeg・gif・webp・avif・svg |
| `audio` | 音の参照（試聴）: 絶対パス・`data:audio/…;base64,…`（外部 URL は不可）。wav・mp3・ogg・oga・opus・m4a・aac・flac |
| `code` / `lang` | 等幅で出す文字列（5 万文字まで）と種類の名前。`lang` が `diff` なら `+`・`-`・`@@` の行を色分けする |
| `group` | 分類の見出し（同じ分類の選択肢は続けて並べる） |
| `preview` / `thumb` | `side`（横の枠）か `inline`（カードの中）／`inline` の画像の高さ（20〜2000） |

- **安全のため検査する**: 通常のファイルだけ（ディレクトリ・FIFO・デバイスは断る。シンボリックリンクは辿る）・拡張子が許可の一覧にあること・**先頭バイトが拡張子の種類と合うこと**（`.png` の名前のテキストや `/etc/passwd` は読めない）。
  MIME は拡張子ではなくサーバが先頭バイトから決める。SVG は `<img>` でだけ描く（中のスクリプトは動かない。拡大表示・単独で開く経路はない）。誤りは**定義の誤り（終了コード 2）**で、窓にも画面にも出さない。
- **`https://` の画像**: **サーバが取得して一時保存し、ブラウザには自分の経路（`/ws` の分割取得）で渡す**。ブラウザは画像の取得先へリクエストを出さない（利用者の IP が取得先に見えない）。サーバの取得は `https` のポート 443 だけ・解決した**全部**のアドレスが
  公開アドレスであること（ループバック・プライベート・リンクローカル・メタデータ・CGNAT・予約は拒否。接続は検査したアドレスに固定）・リダイレクトは 3 回まで（毎回検査し直す）・Cookie などは付けない・10 秒・8 MiB・種類は本文の先頭バイトも確かめる。
  **取得に失敗した画像は、質問ごと失敗にせず画像なしで出す**（ダイアログ最上部に「画像 N 件を取得できませんでした」の固定の行が出る）。社内のプロキシ越しにしか外へ出られない環境では、取得できず画像なしになる。
- 大きさの上限（超えたら**窓へ落とさず**、理由つきの定義の誤り〔終了コード 2〕）: 1 ファイル 8 MiB（Markdown・テキストの成果物は 2 MiB）・1 つの質問の合計 24 MiB・32 ファイルまで・`soda` が待っている質問全部の合計 128 MiB（超えたら `ask_busy`）。同じファイル・URL は 1 つに数える。外部 URL の画像は、**受け取るたびに**質問の合計・サーバ全体（取得中の分を含む）へ足し、超えたら残りの取得を中止する（取り終えてから判定しない）。
  パスは UNC（`\\host\share`・`//host/share` など、先頭が区切り 2 つのもの）を断る（Windows のサーバが外の SMB へ繋ぐため）。
  `data:` の画像・音は定義全体の 256 KiB の中に入れる。
- 質問が閉じると（回答・取り消し・時間切れ・pane が閉じた・切断）、サーバは保持したメディアを捨てる（メモリだけ。ディスクには書かない）。

### 成果物（`view`）

質問の横に、スキルが作った成果物を見せて確認してもらう（`ask.py --review` の `view`）。定義の全体に `view`（1 つ〔文字列のパスか辞書〕か、8 件までの配列）。項目は `file`（ファイル。上と同じ絶対化）か `text`（その場の文字。定義全体の 256 KiB の中）の片方と、
任意の `title`（タブの名前）・`raw`（`true` で Markdown を整形せず文字のまま）。`view` があると `paging` の既定は `false`（質問の欄が狭いため。書けばそれに従う）。

| 見せるもの | 出し方 |
|---|---|
| HTML（`.html`・`.htm`。8 MiB まで） | 隔離した枠（`iframe sandbox="allow-scripts"`）に表示。**スクリプトも動く**（md-to-doc の文書など）が、**`fetch`・XHR・WebSocket・画像・スタイルシートなどの外への読み込みは止まる**（CDN・Google Fonts を読む HTML は崩れる）。ただし**枠自身が外のページへ移ること（`location=`・`<meta refresh>`）は止められない**（下の「隔離の仕組み」）。相対パスで読む別ファイルは配らない |
| Markdown（`.md`・`.markdown`。2 MiB まで） | 整形して表示（見出し・表・コード・チェックリスト）。` ```mermaid ` は図（SVG）になる。右上で「ソースを見る」に切り替え。**本文のリンクは、`http:`・`https:` のものだけ新しいタブで開ける**（`target="_blank"`・`rel="noopener noreferrer"`。`javascript:`・`data:`・相対・`//host`・`HTTP://` や空白・制御文字・改行を含むものは開かず、文字として残して行き先を title に出す。`#` のページ内リンクは今までどおり）。**図（mermaid）の中のリンクは開けない** |
| 画像 | `<img>` で表示（SVG のスクリプトは動かない） |
| そのほか（UTF-8 のテキスト。2 MiB まで） | `<pre>` に文字のまま |

- ダイアログは広く・高くなり、**左に成果物・右に質問**（幅 767px 以下のモバイルは**上に成果物・下に質問**の縦積み）。成果物が複数ならタブ（矢印キー・`Home`・`End`）。
- **枠の上に固定のラベル「pane『…』の成果物（隔離表示）」**が出る（アプリが描く。成果物の題・本文では変えられない）。成果物の中に soda の確認画面に似せたものがあっても、利用者が見分けられる。質問の出どころの固定の行は今までどおり最上部にある。
- 隔離の仕組み: 枠は `allow-same-origin` を付けない iframe（不透明 origin）で、`/ask-view/*` の専用ページを専用の応答ヘッダ（HTML の枠は `sandbox allow-scripts`、Markdown の枠は `sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox`。どちらも `default-src 'none'`）で開き、本文は `postMessage` で渡す。枠の中のスクリプトからは、アプリの DOM・Cookie・`localStorage`・`/ws`・親の
  `document` に触れず、`fetch`・WebSocket・外への画像・フォーム送信も拒否される。**ただし、枠自身が外部のページへ移ること（`location=`・`<meta refresh>`・リンク）はブラウザに止める手段が無い**（Markdown の枠は `meta`・`form` を取り除き、リンクは `http:`・`https:` の本文のものだけ新しいタブで開けるようにして、残りの href を外す。`svg`・`math`・`map`・`area` も取り除く〔SVG の `<a>` は SMIL の `<set>`・`<animate>` で `href` を後から書き換えられ、リンクを外してもすり抜けるため。図は ` ```mermaid ` で書く〕。**この取り除きは、整形の直後と、mermaid の図を挿入した直後の両方に掛ける**（図の `click … href`・ラベルの `<a href>` も `<a>` になり、SMIL は `href` を後から書き換えるため。図の SVG は残し、中のリンクと `set`・`animate*` だけを外す。mermaid の設定は `securityLevel: 'strict'`・`flowchart.htmlLabels: false` も併用）。HTML の枠は成果物のとおりに動く。CSP に `navigate-to` を足す手は、ブラウザが実装していないので使えない）。移った先のページも同じ隔離（不透明 origin）の中で、固定のラベルは残り、枠から親へ取り次がれるのは取り消し・前後の質問と、決定の「知らせ」だけ（決定そのものは取り次がない。下の「枠の中のキー」）。Markdown の枠は `script-src 'self'` だけで、埋め込まれた `<script>`・`onerror=` 等のインラインは動かない（無害化の代わりに CSP と隔離に任せる）。ダウンロードは許さない。**ポップアップは Markdown の枠だけ許す**（`allow-popups`・`allow-popups-to-escape-sandbox`。リンクを新しいタブで開くため。Markdown の枠はスクリプトが動かないので、ポップアップの URL に本文を載せて外へ出す経路にならない。`allow-same-origin`・`allow-top-navigation` は付けない。開いた先のタブは、元の画面と無関係〔`opener` なし〕）。**HTML の枠はスクリプトが動くので、ポップアップを許さない**（`window.open`・`target="_blank"` のリンクは開かない。`sandbox` の属性にも応答のヘッダにも `allow-popups` を付けない）。限界: Markdown の作者が選んだ URL へ利用者を誘導できるのは、通常の Markdown のリンクと同じ（利用者が押したときだけ開く。行き先は title に出る）。**信頼できない Markdown の URL を、利用者が確かめずに押す危険は残る**。
  アプリ本体の CSP は、音の試聴のための `media-src data:` と、端末内の画像（Sixel の復号）のための `script-src 'self' 'wasm-unsafe-eval'` を足した以外は変えていない。`'wasm-unsafe-eval'` は WebAssembly の組み立てだけを許す値で、`eval`・`new Function`・文字列の `setTimeout`・インラインのスクリプトは引き続き許さない（`'unsafe-eval'` は無い。E2E `csp-wasm-images.spec.ts` が確かめる）。
- **枠の中のキー**: 枠にフォーカスがあると、キーは親に届かないので、枠のページが `Esc`（取り消し）・`Ctrl/Cmd+Enter`（決定）・`Alt+PageUp/PageDown`（前後の質問）だけを `postMessage` で親へ渡す（親は自分の枠からのものだけを受ける）。HTML の中のスクリプトがこれらのキーを先に止めると、効かない（［キャンセル］・［決定］で操作できる）。**枠の中の `Ctrl/Cmd+Enter` は、回答を確定しない**。親は質問側の固定の行（「どの pane からの質問か」）へフォーカスを移すだけで、利用者がそこでもう一度 `Ctrl/Cmd+Enter`（または［決定］）を押して確定する。成果物のスクリプトは、本物のキー操作と区別できない `postMessage` を送れる（ブラウザの `navigator.userActivation` は親ページの操作でも有効になり、枠のフォーカスもスクリプトが `focus()` で奪える。どちらも条件にできないことを実測して、この形にした）ので、枠からの知らせだけで既定のままの回答が確定しないようにしている。**防げているのは回答の確定だけで、入力内容の漏えいは防げていない**: HTML の枠のスクリプトは `window.focus(); input.focus()` を繰り返して、質問側の入力欄（自由記述・`text`・`edit`）に文字を打っている利用者からフォーカスを奪え、その後に打った文字は枠の `<input>` に入る（実測。ask-view の E2E「限界の実測」。`inert`・`visibility`・`display:none` でも防げなかった）。成果物のスクリプトは、それを読み、`location=` での外への遷移（上のとおり止められない）で URL に載せて外へ出せる。**成果物は信頼できるもの（自分のスキルが作ったもの）だけにする。自由記述・`text`・`edit` の質問を含む定義では、信頼できない成果物（外から取ってきた HTML）を出さない**（Markdown の枠はスクリプトが動かないので、この害は無い）。取り消し（`Esc`）は枠からそのまま取り次ぐ（害が小さいため）。
- 成果物が読めない（存在しない・UTF-8 でない・大きすぎる）定義は、質問を出さず定義の誤り（終了コード 2）。サーバから成果物を取れなかったときは、見ないまま答えさせないために質問を取り消す（`cancelled`）。
- 見せるのは自分のスキルが作ったものにする（外から取ってきた HTML をそのまま見せない）。成果物なしで承認されることを避けたいときは、質問の文面に「成果物を見たか」を入れない（画面は成果物を出せたときだけ質問を出す）。

#### ローカル起動では大きさの上限が無い（20261005-ask-local-no-limit）

**ローカル起動**のサーバでは、上の大きさの上限（1 ファイル 8 MiB・テキストの成果物 2 MiB・1 つの質問の合計 24 MiB・サーバ全体 128 MiB）を**無視**する。数十 MiB の HTML も画面内のダイアログに出る（窓へは落ちない）。

- **ローカル起動の定義**: ① `soda serve` が `--host` が `127.0.0.1`・`::1`・`localhost` のどれかで待ち受けている（`*.localhost` や `127.0.0.2` など、ほかの名前・アドレスは外向きとして扱う）、② TLS（`--cert`・`--key`）も `--origin` も無い（LAN・リバースプロキシ・ポート転送・Tailscale の名前で公開する構成は外向き）、
  ③ いま質問を見られる画面に、**別のマシンの `soda serve` の中継（bridge）越しのもの**が無い（保存した SSH のマシンの pane の質問を、手元のブラウザへ送る構成）。
  利用者の端末・サーバ・ファイルが同じマシンにあるときだけ外す（上限は、ネットワーク越しの転送とメモリを守るためのもの）。①②は起動時の設定、③は質問を出すたびに見る。
- **外さないもの**: 1 つの質問のファイル数（32）・`view` の件数（8）・外部 URL の画像の 1 枚 8 MiB（取得の上限）。
- **安全弁**（無制限でも超えられない）: 1 ファイル 100 MiB・1 つの質問の合計 200 MiB・サーバ全体 400 MiB（超えたら、上限と同じ形の誤り〔終了コード 2・サーバ全体は `ask_busy`〕）。
  サーバ全体の安全弁は、**ファイルを読む（メモリを確保する）前に**、確保する大きさを予約して見る（同時に複数の質問が大きなファイルを読んでも、安全弁を超える確保をしない。超えるなら読まずに `ask_busy`）。
  **値の根拠は実測**（Chromium・実物のサーバ。`docs/verification.md`）: ブラウザへは `ask.media` の片をチャンクごとに復号して `Blob` に積み、HTML の本文だけを最後に 1 回だけ文字列にして枠へ `postMessage` で渡す。それでも 200 MiB の HTML で、ブラウザ全体のメモリは
  節の多い HTML（`<p>` が大量）で約 3.3 GB（開く前から約 2.7 GB 増。元の約 13 倍）・節の少ない HTML（コメントに詰めたもの）で約 2.0 GB（約 7 倍）、表示まで約 25 秒・約 8 秒。
  そこで DOM の重い最悪の場合でもブラウザ全体が約 2 GB に収まる 100 MiB を 1 ファイルの上限にし（100 MiB 自体は実測していない。200 MiB の実測からの外挿）、質問の合計はその 2 倍・サーバ全体は 4 倍にした。**100 MiB の html を 2 つ持つ質問（合計 200 MiB）では、ブラウザ全体が約 4 GB を超えうる**（算術の外挿。未実測）（V8 の文字列の限界〔約 5.4 億文字〕はこれよりずっと先で、決め手ではない）。
  **それでもブラウザがメモリを使い切るとタブが落ちうる**（落ちた場合は JS で検知できず、質問は時間切れまで待つ）。メモリの少ない端末では、数十 MiB の HTML でも重い。
- 外向きに公開した構成・別のマシンの pane の質問は、従来の上限のまま。ローカル起動で出した大きな質問（従来の上限を超えるもの）は、あとから繋いだ別のマシン越しの画面には見せない（`ask.subscribe`・`ask.get`・`ask.media` に出ない）。
- 限界: `localhost` の名前の解決先が、手元の loopback でなく外向きの IP になる環境（hosts を書き換えた等）は未確認。**`ssh -L` で loopback のサーバへ繋いだ別のマシンのブラウザは、サーバからは手元と見分けられない**（ローカルとして扱う）。そのブラウザへ大きなファイルを送りたくなければ、`--origin` を付けて起動するか、大きな質問を出さない。
- `sodactl ask --features` は、ローカル起動のとき `limits` に `unlimited: true` と `safety`（上の安全弁）を足す。**`fileBytes` などの従来の数はそのまま残す**（古い読み手が壊れない。古い `ask.py` は従来の数で事前確認し、従来どおり窓へ落ちる/終了コード 1 になる）。
  `sodactl ask` 自身の事前確認は、従来の上限を超えるファイルがあるときだけサーバに上限を聞き、`unlimited` なら安全弁まで通す（聞けない・古いサーバ・外向きは従来の上限）。

### 機能確認（`sodactl ask --features`）と、古い版との組み合わせ

```bash
sodactl ask --features
# → {"sodactl":["media","view","types:edit","types:rank","types:table","remote-image"],"limits":{"fileBytes":8388608,"textBytes":2097152,"totalBytes":25165824,"files":32,"serverBytes":134217728,"views":8},"server":{"features":[…],"limits":{…}}}
```

定義は読まない（標準入力を使わない）。`server` は、その pane のサーバに繋いで `ask.features` で確かめた結果で、**繋げない・古いサーバ（`ask.features` を知らない）・pane の外のときは `null`**。終了コードは常に 0。呼び出し側（ask-form の `ask.py`）は、これで画像・成果物・新しい型を渡してよいかを確かめ、
`limits` で上限を超えないかを事前に確かめる。

| sodactl | サーバ | 動き |
|---|---|---|
| 新 | 新 | すべて使える |
| 新 | 旧 | 新しい項目（メディア・`view`・`edit`/`rank`/`table`）がある定義は、送る前に `ask.features` で確かめ、`{"status":"unavailable","reason":"this server does not support … in ask forms (update soda)"}`（終了コード 0）。新しい項目が無い定義は今までどおり |
| 旧 | 新 | `--features` を知らない（使い方の誤り＝終了コード 2）ので、呼び出し側は使えないと判断する。旧 sodactl が定義を送ると、`edit`/`rank`/`table` は旧 sodactl 自身が `unavailable`、`image` は相対パスのまま新サーバに届き `invalid_ask_spec`（終了コード 2） |
| 旧 | 旧 | 新しい項目は黙って無視される（プレビューなし）。**`view` が捨てられて成果物なしで質問が出る**ので、呼び出し側は `--features` で確かめてから渡す |

### 出力

stdout に 1 行の JSON。`status` は次の 4 つで、**どれも終了コード 0**（区別は `status` で行う）。

| `status` | いつ | ほかの項目 |
|---|---|---|
| `answered` | 決定が押された | `answers`（id → 値。`single`・`text`・`edit` は文字列、`multi`・`rank` は配列、`table` は `{行: 値}`。`showIf` で隠れた質問は入らない）・`custom`（自由入力した質問の id。あれば）・`edited`（直された `edit` の質問の id。あれば）・`note`（補足。あれば）・`comments`（質問ごとの自由記述。id → 文。書いた質問だけで、無ければ項目ごと無い） |
| `cancelled` | キャンセル・`Esc`・pane が閉じられた | — |
| `timeout` | `--timeout` が過ぎた（既定 540000 ミリ秒） | — |
| `unavailable` | この pane のサーバに、質問を出せるブラウザが 1 つもつながっていない・**定義に、この版の `sodactl ask` が対応していない型の質問がある** | `reason`（理由） |

終了コード: 上の 4 つは 0。サーバ・接続・認証のエラーは 1（stderr に `{"error":{code,message}}`）、使い方と定義の誤りは 2。1 になるもの: `caller_pane_unknown`・`unauthenticated`（**受け口を使えず `/ws` の経路へ落ちて、ログインしていないときだけ**。受け口を使えていれば出ない）・`not_found`
（古いサーバ・pane が無い）・`ask_busy`（同じ pane の前の質問がまだ答えを待っている・待っている質問の総数か接続あたりの上限）・`connection_closed`（待っている間にサーバが閉じた・止まった・`soda handoff` が始まった）・`pane_socket_busy`（受け口が `soda handoff` の途中・同時接続の上限 64。sodactl が 5 秒まで繋ぎ直しても続いたとき。質問は出ていないので打ち直してよい）・`timeout`（**stdout の `status: "timeout"` とは別物**——
サーバが `--timeout` を過ぎても応答しないときの保険で、`--timeout` に 15 秒を足して待った後の sodactl 側の時間切れ）。

### どのブラウザに出るか

- 出るのは、その pane を動かしているサーバにつながっている**画面**（ブラウザ。デスクトップ・モバイル）。複数あれば全部に出し、**最初の回答を採って、ほかのダイアログは閉じる**。
  端末版（引数なしの `soda`）・sodactl・ブラウザの軽い接続（別のマシンの要約）には出さない。ブラウザは接続のたびに「質問を出せる画面」として名乗る（古いブラウザの画面・古いサーバは名乗れないので、
  `unavailable` になる）。1 つも居なければ待たずに `unavailable`。
- **どの pane からの質問か**は、ダイアログの最上部に固定で出る（pane の名前・workspace・tab。定義の `title` では消せない・書き換えられない）。定義の文字は全て文字として表示され（HTML として解釈しない）、
  pane のプログラムが soda 自身の確認を装えないようにしている。
- **質問した pane をそのブラウザが表示していなくても**（別の tab・workspace を見ていても）その場で出る。表示は切り替えない。閉じたら、質問した pane が表示中ならその端末へ、そうでなければ開く前にフォーカスの
  あった場所へフォーカスが戻る。設定・確認などほかのダイアログが開いていても潰さず上に重なり、閉じると元のダイアログへ戻る。
- 待っている間にブラウザを**再読み込み・再接続**しても、質問は出し直される（回答待ちはサーバが持つ）。出せるブラウザが全部切れても質問はそのまま待ち、戻れば出し直す（時間切れまで）。
- `sodactl ask` を止めた（Ctrl+C・接続が切れた）・時間切れ・pane が閉じた・サーバが止まると、ダイアログは閉じる。
- 同じ pane からの質問は同時に 1 つまで。2 つめは `ask_busy`（終了コード 1）で、前の質問はそのまま。別の pane からは同時に出せ、受けた順に 1 つずつ出る。
- **保存した SSH のマシン**（`docs/machines.md`）の pane の質問は、**そのマシンを表示中の手元のブラウザ**に出る（既存の中継のまま）。そのマシンを表示していないブラウザ（別のマシン・ローカルを表示中）には出ず、
  表示中のブラウザが無ければ `unavailable`。リモートのマシンの pane の中で `sodactl ask` を打つ。リモートのマシンの受け口（`pane.sock`）で動くので、**リモートのマシンでの `sodactl login` は要らない**
  （リモートのサーバが受け口を持たない古い版のときは、今までどおりリモートのマシンで `sodactl login` 済みであることが前提。pane の環境に token は入らない）。

### 目次（`page`・`paging`）

質問は 1 枚に並んだまま出る（ページには分かれない）。返る JSON（`answers` 等）の形は、目次が出ても変わらない。質問が多いときに、左に質問の題の目次が出て、見たい質問へ移れる。

- **出る条件**: `paging` が `"auto"`（書かなければこれ）なら、ダイアログの高さ（ブラウザの画面の高さから決まる）に全部が収まらないときだけ出る。`true`（数も同じ扱い）なら必ず出す。`false` なら出さない。
  質問に `page` を 1 つでも書くと、高さに収まっていても出る（`paging: false` のときは出ない）。**いままで 1 枚で出ていた定義も、高さに収まらなければ目次が出る**。出したくなければ `paging: false`（質問は 1 枚のまま、ダイアログの中がスクロールする）。
  項目が 1 つだけ（質問が 1 つで補足の欄なし）のときは出ない。出すかどうかは開いたときに 1 回決め、その後に画面の高さが変わっても決め直さない（入力中の欄を見失わないため）。
- **まとまりの題（`page`）**: 質問に `page` を書くと、その質問から新しいまとまりが始まり、目次に題の見出しが出る（次に別の題の `page` が出るまでが 1 つのまとまり。書いていない質問・同じ題の質問は前のまとまりに入る）。
  見出しは目次の飾りで、質問は分かれない。`showIf` で出ていない質問が 1 つも無いまとまりの見出しは出ない。
- **動き**: 目次の項目を押すと、その質問へ移って（スクロールして）入力にフォーカスが移る。`Alt+PageDown`（次）・`Alt+PageUp`（前）でも次・前の質問へ移る（端では何もしない）。
  スクロールに合わせて、今見ている質問の項目に印が付く。未回答の質問（`single` の未選択・`required` の空）の項目は色が変わる。補足の欄がある定義では、最後の項目が「補足」。
- **決定はどこからでも出来る**（［決定］・`Ctrl+Enter`／`Cmd+Enter`）。未回答の質問があると決定されず、最初の未回答の質問へ移り、その質問の入力へフォーカスが移る。
- `showIf` で出ていない質問は、目次にも出ない（答えを変えると項目が出る・消える）。
- **幅**: 幅の狭い画面（ブラウザの幅が 768px 未満。モバイル）では目次は出ず、質問を最後までスクロールして答える。目次が出ると、ダイアログの幅が目次の幅（212px）の分だけ広がる（画面の幅 − 16px は超えない）。
  ウィンドウの幅を変えて 768px 未満になると目次が消え、ダイアログの幅も戻る。


### 質問ごとの自由記述

各質問（`single`・`multi`）の下に「＋ 自由記述」のボタンが出る（部品 `<ask-form>` 1.3.0 から）。押すと欄が開き、選択肢に無い条件・希望をその質問に添えて書ける。もう一度押すと閉じる（書いた内容は残り、ボタンの文言が「自由記述（入力あり）を開く」に変わる）。

- **付かない場合**: `text` の質問・定義が `comments: false`・質問が `comment: false`・質問が 1 つだけで `single` かつ `note: false`（選んだ時点で決定するフォーム）。
- **結果**: 書いた質問だけが `comments`（質問の id → 文）に入る。前後の空白は除き、空白だけの欄は入らない。閉じている欄も、書いてあれば入る。`showIf` で隠れている質問の欄は入らない（いったん隠れて再び見えた質問は、書いた内容が残っていて入る）。1 つも無ければ `comments` の項目ごと無い。
- **上限**: 1 つの欄は 10,000 文字まで、長さの合計は 100,000 文字まで（サーバが検査し、超える・付けない質問への回答は `invalid_params` で断る。質問は開いたままで、画面にトーストが出る）。
- 自由記述は利用者が書いた文で、`note`・自由入力と同じく「利用者の入力」として扱う（画面・ログに HTML としては出ない。サーバのログにも中身を出さない）。
- 欄の中の `Enter` は改行（決定しない）。`Ctrl+Enter`（macOS は `Cmd+Enter` も）で決定し、`Esc` で取り消す。欄を開くと、ダイアログの高さが中身に合わせて増える（画面の高さ − 余白で頭打ちになり、それ以上は中がスクロールする）。
- **版の差**: 古い画面は `comments` を送らないだけで今までどおり答えられる。古い `sodactl` は結果をそのまま出すので `comments` も出る。別のマシンの `soda`（`docs/machines.md`）が古いと、`comments: false`・`comment: false` が効かず、書いた文が届かない。

### 画面の操作

- ダイアログが開くと、フォーカスは最上部の見出し（どの pane からの質問か）に置かれる（打っている途中の文字が回答として効かない）。`Tab` で目次の項目・質問・選択肢・下のボタンを巡り、ラジオは矢印で選択を移す。
  背面の操作・キーはダイアログが開いている間は届かない（ホイールも）。**背景のクリックでは閉じない**。
- 決定: ［決定］・`Ctrl+Enter`（macOS は `Cmd+Enter` も。自由記述の欄の中でも）・1 行の入力欄での `Enter`（IME の変換中は除く。**目次が出ているときは次の質問へ移り、最後の質問で決定。目次が出ていない短いフォームでは決定**）。未回答の質問があれば決定せず、
  その質問を強調して知らせる（上の「目次」）。取り消し: ［キャンセル］・`Esc`。
- **絞り込みの欄に文字があるときの `Esc`** は、絞り込みを消すだけ（取り消さない）。それ以外の `Esc` は取り消し。絞り込みの欄での `Enter` は何もしない。絞り込んでも、選択中の選択肢は隠れない。
- 次・前の質問へ移る: `Alt+PageDown`（次）・`Alt+PageUp`（前）。端では何もしない（目次が出ていないときも、次・前の質問へ移る）。
- 開いた直後（フォーカスが最上部の見出しにある間）でも、`Ctrl+Enter`／`Cmd+Enter`（決定）と `Alt+PageDown`／`Alt+PageUp`（質問の移動）は効く（枠が部品へ取り次ぐ）。
- 質問が 1 つだけ・`single`・`note: false` のときは、選択肢（「その他」以外）を**クリック・タップ・`Space`・`Enter`** で選んだ時点で決定する（既に選ばれている選択肢でも）。**矢印キーで移っただけでは決定しない**
  （見て回っている途中で決まらないように）。ask-form の単独ウィンドウと同じ部品なので、動きも同じ。
- 画面が定義を描けなかったとき（画面の部品の中の誤り等。検査を通った定義では通常起きない）は、質問を取り消して（`sodactl ask` には `cancelled`）、画面の下の通知で知らせる。
- 質問の定義・回答を読める・答えられるのは、`ask.subscribe` した画面（デスクトップ・モバイルのブラウザ）の接続だけ。sodactl・端末版・軽い接続は `ask.subscribe` できない。ただし hello の前の接続は
  既定でデスクトップとして扱われるので、認証済みの生の `/ws` クライアントなら購読できる（pane のシェルを操作できるのと同じ権限。新しい権限は増えない）。回答の内容はサーバのログに残らない。

### 画面の見た目（部品に替わって変わったもの）

質問・選択肢・入力欄・目次・下のボタンは、ask-form の単独ウィンドウと同じ部品 `<ask-form>` が描く（下の「画面の部品と同期」）。以前の版の画面から変わった主なもの:

- 質問の横に種類が出る（`multi` は「複数選べます」・必須でない `text` は「任意」。`single` は何も出ない）。
- 下の状態の行は「未回答 n 件」／「すべて回答済み」。未回答のまま決定すると「未回答 n 件 — 答えてから決定してください」。
- 下のボタンにキーが出る（［キャンセル］`Esc`・［決定］`Ctrl+Enter`。幅 767px 以下の画面では出ない）。
- 質問が多い定義には、左に質問の目次が出る（上の「目次」）。
- 表示名と値が違う選択肢には、値が横に出る（消すには `showValue: false`）。
- 選択肢が 12 件以上の質問には、絞り込みの欄が出る（消すには `filter: false`）。
- `title` が空のときの題は「質問」。

### 画面の部品と同期

- `sodactl ask` の画面は、ask-form と同じ部品 `<ask-form>`（`third_party/ask-form/ask-form.js`）で描く。public_docs（ask-form のリポジトリ）の**固定したコミットから無改変で写したもの**で、出どころ（コミット・部品の版・各ファイルの SHA-256）は
  `third_party/ask-form/SOURCE.json` にある。`packages/web/src/components/AskDialog.vue` が持つのは、ダイアログの枠と、最上部の「どの pane からの質問か」の行（部品の外にあり、定義では消せない・書き換えられない）だけ。
- 写し直す: `node scripts/sync-ask-form.mjs --from <public_docs の clone> --commit <コミット>`。確かめる: `node scripts/sync-ask-form.mjs --check`。**写したファイルは手で直さない**（`pnpm test` が SHA-256 を `SOURCE.json` と比べる）。
  取り込むコミットを替えるたびに、部品の差分を読んで安全（通信・画面全体への操作・定義の文字の出し方・キーの扱い）を確かめる。手順と確かめる点は `third_party/ask-form/README.md`。
- **定義の新しい項目は、部品を写し直すだけでは届かない**。サーバと sodactl は `normalizeAskSpec`（`packages/protocol/src/ask.ts`）が知っている項目だけを通すので、通す行をそこへ足し、共通の試験データ
  （`third_party/ask-form/fixtures/`。`packages/protocol/src/ask.fixtures.test.ts` が読む）で ask-form の側と同じ結果になることを確かめる。直す場所の一覧は `third_party/ask-form/README.md`「通す項目を足すときに直す場所」。
- 部品は `edit`・`rank`・`table` の型や画像・コードのプレビューも描けるが、`sodactl ask` は通していない（型は `unavailable`・項目は無視。上の「入力」）。

## エージェント（`agent`）

pane の中で検出されたコーディングエージェント（Claude Code・Codex 等。ブラウザのサイドバーに状態が出るもの）を、
**その pane の ID** か、**`agent rename` で付けた名前**で指して扱う（下の `<target>`）。

### エージェントが動かしているサブエージェント（`subagents`）

`agent list`・`get`（と、`agent wait`・`start`・`rename` が返す `agent`）の各要素に、エージェントが中で動かしているサブエージェント（Claude Code の Agent ツール）の `subagents` が付く（20261004-subagent-display）。
サブエージェントは pane を持たないので、`agent` の一覧には出ない。値は 2 通り（項目の有無は揺れない）:

- `null` … **分からない**（フック連携を導入していない・Claude Code 以外・サーバが古い・報告をまだ受けていない）。
- `{"count": 2, "items": [{"id": "…", "type": "Explore", "description": "調べる", "background": true, "startedAt": 1700000000000}, …]}` … 報告を受けている。0 件なら `{"count": 0, "items": []}`。
  `items` は起動した順で最大 64 件、`count` は実際の数（64 を超えれば `items` より大きい）。各項目の `type`・`description`・`background` は分からなければ `null`、`startedAt` はサーバが起動（または作業の終わりの報告での突き合わせ）を知った時刻（epoch ms）。
  `description` はエージェントが書いた短い説明で、そのまま文字として扱う（画面でも HTML としては出さない）。

`agent wait` の `--until` や待ちの判定は、`subagents` の変化では動かない（状態の変化だけで動く）。「作業中」の中身（並行で何件動いているか）を知りたいときに読む。
仕組み・対象外・制約は `docs/agent-graph.md`「サブエージェントの表示の仕組みと制約」。

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
  （`3f2a9c10` 等）も付けられるが、その文字列の pane にエージェントが居ればそちらが優先される。見つからなければ `agent_not_found`。
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
  `instanceId`・`since`・`subagents` など。
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

（グラフの画面の「＋」のフォームも同じ方式 `agent.start` を使う。送るのは `kind`・`name`・`paneId` と空の `args` だけ。選べる種類の一覧は読み取りだけの方式 `agent.kinds`〔表示名と見つかったかだけを返す〕。`docs/agent-graph.md`「グラフから pane・workspace を足す・閉じる」）

`sodactl agent start <name> --kind <KIND> --pane <paneId> [--timeout <ms>] [-- <args>...]` は、**前面がシェル自身だけの pane**
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
pane=$(sodactl pane split 3f2a9c10 --direction right | jq -r .pane.id)
sodactl agent start reviewer --kind codex --pane "$pane" -- -m gpt-5.4
sodactl agent prompt reviewer "この差分をレビューして" --wait --timeout 600000
```

### 例: エージェントに作業させて、終わるのを待って結果を読む

```bash
pane=3f2a9c10                                             # sodactl agent list で調べた pane ID（先頭の部分でもよい）
sodactl agent prompt "$pane" "テストを直して" --wait --timeout 600000   # 送って、作業が始まったのを確かめ、終わるまで待つ
sodactl agent read "$pane" --lines 120
```

### 例: 承認待ちで止まったら、画面を読んで答える

```bash
sodactl agent wait "$pane" --until blocked --timeout 600000
sodactl agent read "$pane" --lines 40
sodactl agent send-keys "$pane" esc                         # 取り消す（答えるなら例えば y や enter）
```

## 拡張（`ext`）

設定（`extensions.json`）に登録して `soda` が起動する拡張（`docs/extensions.md`）の状態を見る・読み直す・起動し直す。**`/ws`（ログイン済み）の経路だけ**（`pane.sock` には載せない）。`--machine` で別のマシンへ送れる。

```
sodactl ext list                       # {"status":"ok","extensions":[…],"problems":[…],"userConfigPath":"…"}
sodactl ext log <id|key>               # {"status":"ok","key":"user:hello","lines":[…],"dropped":0}
sodactl ext reload                     # list と同じ形（設定を読み直し、failed・exited を戻す）
sodactl ext restart <id|key>           # {"status":"ok","key":"user:hello"}
```

- `extensions[]` の各項目: `key`（`user:<id>`）・`id`・`scope`・`state`（`running`・`backoff`・`failed`・`exited`・`disabled`・`over_limit`・`waiting`〔設定を読めないので起動を見送っている〕）・`failures`・`lastExit`・`displays`（出している面の数）など。**コマンドの文字列は出ない**。
- `<id|key>` は、`key` の完全一致 → `id` が 1 つに決まるもの。同じ `id` が 2 つ以上あるときは使い方の誤り（終了コード 2。候補の `key` を並べる）。無ければ `not_found`（終了コード 1）。
- 古いサーバ（拡張を知らない）では `{"status":"unsupported","reason":"このサーバは拡張に対応していません"}`（終了コード 0）。
- 承認・取り消し・有効と無効の切り替えのコマンドは**無い**。

## 連携のグラフ（`graph`）

ブラウザのグラフ画面（`docs/agent-graph.md`）と同じグラフを読み書きする（20260927-agent-graph）。変更はサーバが `graph.changed` で配るので、開いている画面にすぐ届く。
グラフは接続した `soda serve` のもの（`--machine <名前>` を前に付けると、そのマシンの `soda serve` のグラフ）。

```bash
sodactl graph show
# graph: running (rev 4)
#
# node          key                                            status  space  workspace
# 3f2a9c10      local:3f2a9c10-1111-4111-8111-aaaaaaaaaaaa      ok      work   api
# 9d000000      local:9d000000-2222-4222-8222-bbbbbbbbbbbb      ok      work   api
# box:5b7e01c4  0123…:5b7e01c4-3333-4333-8333-cccccccccccc      -       -      -
#
# link      kind       from          to            count  state   settings
# 6a41f0d2  trigger    3f2a9c10      9d000000      2/10   active  on=done output=80 busy=wait prompt="レビューして {output}"
# e07b3395  supervise  9d000000      box:5b7e01c4  0/10   paused

l=$(sodactl graph link add impl reviewer --prompt "次の差分をレビューして。{output}" --output 120 --json | jq -r .link.id)
sodactl graph link add impl lead --kind approval --mode delegate --limit 5
sodactl graph link set "$l" --when-busy skip
sodactl graph link pause "$l"; sodactl graph link resume "$l"   # 線の再開は回数を 0 に戻す
sodactl graph pause; sodactl graph resume                        # 全体（線ごとの回数・一時停止は変えない）
sodactl graph history "$l" --limit 5
```

- **端の指定**（`<from>`・`<to>`・`<pane>`）: pane ID（UUID。先頭 4 文字以上で一意なら部分でもよい）・`agent rename` で付けたエージェントの名前（手元だけ。引き方は `agent` の `<target>` と同じ順——
  その ID の pane にエージェントが居ればその pane、次にその名前のエージェント、次にエージェントの居ない同じ ID の pane、最後に pane の ID の先頭の部分）・`<マシンの名前|id>:<pane の完全な ID>`
  （`soda machine` で登録した別のマシンの pane。完全な ID だけで、部分・エージェントの名前は引けない。例 `box:5b7e01c4-3333-4333-8333-cccccccccccc`。`local:<UUID>` は手元）。マシンの名前は `--machine` と同じく、id の完全一致 → 名前の完全一致が 1 台で引き
  （`machine.list`）、ノードの鍵には id を使う（名前は変えられるため）。同じ名前が 2 台なら `machine_ambiguous`、無ければ `machine_not_found`。
  登録から外したマシンのノードを外す（`node rm`）・選び直す前のノード（`node rekey` の 1 つ目）を指すときだけ、一覧に無い 32 桁の id もそのまま受ける
  （載せる・結ぶ端では `machine_not_found`。打ち間違いで動かない線を作らない）。
- 手元の pane のノードは、サーバが全部の pane に足している（`docs/agent-graph.md`「ノード（すべての pane が載る）」）。`node add` は手元の pane では「すでにある」で成功する（何も送らない）。
  `link add` は、端が別のマシンの pane でグラフに載っていなければ一緒に載せる（そのマシンの囲いの空いた升に、手元の囲いと重ならないよう置く）。載せる・結ぶ pane が手元に無ければ `not_found`
  （別のマシンの pane は確かめない。実行のときに `target_absent`）。
- 線の設定の項目と既定値は画面と同じ（トリガ: `--on done`・既定の文面・`--output 80`・`--when-busy wait`。承認の代理: `--mode notify`・`--lines 40`。
  上限 `--limit 10`）。線の種類に合わない項目（監督の線に `--prompt` 等）は使い方の誤り（終了コード 2）。`link set` は書いた項目だけを変える。
  線の種類は変えられない（消して作り直す）。
- 監督・承認の代理の線は `<from>` が配下、`<to>` が監督役。
- `<linkId>`（`link set|rm|pause|resume`・`history`）も、線の ID（UUID）か先頭の部分（4 文字以上で一意）。表の `link`・`node`・`from`・`to` は先頭 8 文字の短い呼び名で、そのまま指定に使える（完全な ID は `key` の列・`--json`）。
  曖昧な部分は `id_ambiguous`（候補が出る）、当たらなければ `not_found`。
- `node rm` はそのノードの線も消す。**開いている手元の pane のノードは外せない**（`node_required`。終了コード 1。pane を閉じるとノードも消える）。閉じた pane のノード・別のマシンのノードは外せる。
  `node rekey` は pane の無いノード（画面で無効と出る、別のマシンの pane が閉じたもの。`graph show` の `status` は `-` なので完全な id で指す）を同じマシンの別の pane に付け替える（線はそのまま。別のマシンの pane へは
  `invalid_params`）。**手元のノードは選び直せない**（`node_required`）。
- 変更は、送る前に画面と同じ規則（client-core の検証）で確かめ、落ちれば送らずに `invalid_params`（メッセージに `supervisor_taken` 等の理由）。
- 変更は取り出した rev を添えて送る。その間に画面などが変えていれば（`rev_conflict`）、**取り直して操作を組み立て直し、1 回だけ送り直す**。2 回目も衝突したら
  `rev_conflict` で終了コード 1。
- 知らない線は `not_found`（終了コード 1）。
- 表のセルの制御文字（C0・C1・双方向の上書き等）は `\uXXXX` の形に逃がして出す（履歴の文面などで端末の表示を偽装させない）。`--json` はそのまま。
- `--json` の形: 変更は `{"graph": …}`、`link add` は `{"link": …, "graph": …}`、`history` は `{"runs": […]}`（新しい順）。
  `show` は `{"graph": …, "spaces": […]}`: `graph.nodes` の各ノードに `workspaceId`・`tabId`（手元の開いている pane の場所。別のマシンの pane・閉じた pane は `null`）が足され、
  `spaces` はグループごとの `{"id": グループの id, "name": 名前, "workspaces": [workspace の id…]}`（サイドバーの順。最後に「グループなし」が `id`・`name` を `null` で入る）。
  今ある項目は変わらない（足しただけ）。囲いの四角は出さない。表には `space`（グループの名前。「グループなし」は `-`）と `workspace` の列が出る。
- 表の `status`: `ok`（手元の pane がある）・`closed`（手元の pane が無い）・`-`（別のマシン。ここからは確かめない）。
  `state`: `active`・`paused`（利用者が止めた）・`paused(limit)`（上限で止まった）。
- 履歴はサーバのメモリだけ（線ごとに直近 50 件。再起動で消える）。
- `--prompt` の文面が `--` で始まるときは `--prompt=<文面>` の形で渡す（離して書くと `missing value for --prompt` の使い方の誤り。終了コード 2）。

## エージェントに教える（skill ファイル）と、pane の中から使う

### skill ファイル（`sodactl skill`）

`sodactl skill` は、コーディングエージェント（Claude Code・Codex 等）に sodactl の使い方と作法を教える Markdown（skill ファイル）を標準出力に書く
（サーバにはつながない。中身はリポジトリの `packages/cli/skills/sodactl/SKILL.md` で、使っている sodactl と同じ版のもの）。sodactl を更新したら入れ直す。
旧名の `~/.claude/skills/wtmctl` を入れていたら、消してから入れ直す（`docs/migrate-from-wtm.md`）。

```bash
# Claude Code（利用者全体）。プロジェクトだけなら <プロジェクト>/.claude/skills/sodactl/ に置く
mkdir -p ~/.claude/skills/sodactl && sodactl skill > ~/.claude/skills/sodactl/SKILL.md
# skill の仕組みの無いエージェント（Codex 等）は、プロジェクトか利用者の指示（AGENTS.md 等）に貼る（先頭の --- で囲んだ front matter は除く）
sodactl skill | awk 'NR==1&&/^---$/{f=1;next} f&&/^---$/{f=0;next} !f' >> AGENTS.md
```

skill は、最初に pane の中にいるか（`SODA_PANE_ID` があるか）を確かめ、無ければ止まるようエージェントに指示する（soda の外のエージェントが
自分のものでない session を操作しないため）。ほかに教えること: 構文の正典は `sodactl help`・ID は応答の JSON から読む・隣の pane を作って
コマンドを走らせ結果を読む手順・エージェントを起動して prompt を送り待つ手順・自分が作っていないものを閉じない・`timeout` 等の後に確かめずに
送り直さない・承認ダイアログには利用者に確かめてから答える・token をコマンド行や会話に書かない・認証されていなければ利用者に `sodactl login` を頼む。

### pane の環境変数

サーバは pane を起動するとき、次の変数を入れる（サーバが管理する変数で、サーバを起動した環境から受け継いだ同名の値は使わない）。

| 変数 | 中身 |
|---|---|
| `SODA_PANE_ID` | その pane の ID（UUID。完全な ID）。pane の中にいる印を兼ねる（herdr の `HERDR_ENV=1`・`HERDR_PANE_ID` に当たる） |
| `SODA_SERVER_URL` | その pane を動かしているサーバへ sodactl がつなげる URL（URL にできない待ち受け〔ゾーン付きの IPv6 等〕では入れない）。待ち受けが `0.0.0.0` なら `http(s)://127.0.0.1:<port>`、`::` なら `[::1]`、それ以外は待ち受けのホスト。ポートは実際に待ち受けているもの |
| `SODA_AGENT_REPORT_SOCKET` | 公式フック連携の report の socket（あれば）。フックのスクリプトが、セッション ID に加えて、サブエージェントの起動・終了・作業の終わり（Claude Code だけ。20261004-subagent-display）を 1 接続 1 行の JSON で報告する |
| `SODA_PANE_SOCKET` | ログイン不要の受け口（状態ディレクトリの `pane.sock`）のパス（Linux・macOS。Windows では入れない）。値は socket のパスだけで、秘密は含まない。下の「ログイン不要の受け口（pane.sock）」 |

workspace・tab の ID は環境変数に**入れない**（herdr の `HERDR_WORKSPACE_ID`・`HERDR_TAB_ID` に当たるものは無い）。pane は別の tab・workspace へ移せ
（pane の ID は変わらない。別の workspace へは、同じ worktree の workspace の間だけ。20261008-web-tab-dnd）、環境変数は起動した時の値のまま変わらないので、移された後に古い workspace を操作させてしまうため。今の値は
`sodactl pane current`（下）で聞く。

サーバを起動した環境の `SODACTL_URL`・`SODACTL_TOKEN` は pane に**渡さない**（別のサーバを指していることがあり、token は秘密なので pane の全プロセスと
エージェントの記録に流さない。Windows では大文字小文字を区別せずに取り除く）。pane の環境に token・cookie は入らない。

### 接続先と認証

- 接続先は `--url` → `SODACTL_URL` → `SODA_SERVER_URL` → `http://127.0.0.1:7780` の順。pane の中では何も付けずにその pane のサーバにつながる
  （名前付き session・`--port` で別のポートのサーバでも）。
- TLS で全インタフェースに待ち受けるサーバでは、`SODA_SERVER_URL` は `https://127.0.0.1:<port>`（`::` なら `https://[::1]:<port>`）になるので、証明書に `127.0.0.1`（`::1`）が要る（mkcert の例は
  `docs/tls-setup.md`）。無ければ pane の中で `SODACTL_URL` に証明書の名前の URL を export する（そのときは下の歯止めが効かなくなる）。自己署名・mkcert の CA は Node に教える
  （`NODE_EXTRA_CA_CERTS`。pane の外と同じ）。
- pane のシェルの初期化（`.bashrc` 等）で `SODACTL_URL` を export していると、そちらが `SODA_SERVER_URL` より優先される。
- 認証は pane の外と同じく、利用者が `sodactl login` で保存した session cookie（`~/.sodactl`）を使う。cookie は URL の origin ごとに保存されるので、
  **pane の中の接続先と同じ origin で** login しておく（`http://localhost:7780` で login していても、`http://127.0.0.1:7780` では見つからない）。
  まだなら、利用者が `sodactl login --url <URL> --token <TOKEN>` を打つ（`<URL>` は pane の中の `echo "$SODA_SERVER_URL"` の値。pane の外の端末には
  この変数が無いので値そのものを渡す。skill はエージェントに、その値を示して利用者に頼ませる）。
- **`sodactl ask` だけは例外**で、Linux・macOS の pane の中ではログインなしで動く（下の「ログイン不要の受け口（pane.sock）」）。ほかのコマンドは上のとおり login が要る。

### ログイン不要の受け口（`pane.sock`）

サーバ（Linux・macOS。macOS は未検証）は、状態ディレクトリに Unix ドメイン socket **`pane.sock`**（権限 0600。0700 の一時ディレクトリの中で待ち受けて 0600 にしてから、rename で置く）を立て、
pane の環境の `SODA_PANE_SOCKET` にそのパスを入れる。**pane の中のプログラム向けの、ログイン不要のローカルの受け口**で、`/ws` の RPC は通さず、**受け口に登録した操作だけ**を受ける。
今載っている操作は `ask.open`（`sodactl ask`）・`ask.features`（`sodactl ask --features` の、サーバの機能確認）と、表示の面（`sodactl display`。`docs/display.md`）の `display.set`・`display.close`・`display.list`・`display.wait`・`display.features`・`display.send` の 6 つ。**`sodactl` のほかのコマンドは何も変わらない**（今までどおり `sodactl login` が要る）。新しいネットワーク（TCP）の待ち受けは作らない。

- **使われる条件**（全部を満たすとき。`sodactl ask` が自分で選ぶので、利用者が指定するものは無い）:
  - Windows（ネイティブ）でない。
  - pane の中（`SODA_PANE_ID` と `SODA_SERVER_URL` がある）。
  - 受け口のパスが分かる: `SODA_PANE_SOCKET`（絶対パス。サーバは `--state-dir` が相対でも絶対パスにして入れる。相対の値は使わない）。無ければ、`SODA_AGENT_REPORT_SOCKET` が絶対パスで末尾がちょうど `/agent-report.sock` のとき、同じディレクトリの `pane.sock`
    （版を上げて `soda handoff` した後の、前から動いている pane のため——その pane の環境には `SODA_PANE_SOCKET` が無い）。
  - 接続先を明示していない（`--url`・`SODACTL_URL` のどちらも無い。明示した先がその pane のサーバとは限らないため）。
  - `--machine` が無い（`--machine local` は可）。
- **使えないときは、黙って今までの `/ws` の経路（session cookie）へ落ちる**: 上の条件を満たさない・受け口へ繋げない（ファイルが無い・サーバが受け口を置けなかった・権限が無い等）・
  受け口がその操作を知らない（`unknown_op`）・要求を読めない（`bad_request`。どちらも版の違う受け口）。落ちたことは表示しない。落ちた先で未ログインなら、今までどおり `unauthenticated`（終了コード 1）。
  受け口のファイルはあるのに誰も待ち受けていないとき（`ECONNREFUSED`。`soda handoff` で古い版が入れ替わってから、新しい版が受け口を置き直すまでの間）だけは、すぐには落ちずに 5 秒まで繋ぎ直す
  （一時的な入れ替えの間に `unauthenticated` を出さないため。繋がっていないので質問は出ておらず、二重にはならない）。
  **`sodactl ask` が `unauthenticated` で終わったら、受け口を使えていない**（これが見分け方）。そのときは上の「接続先と認証」のとおり `sodactl login` する。
- **`/ws` へ落ちないもの**（操作が既に始まっているかもしれず、落ちると質問を二重に出すため）:
  - 繋がった後に、返事なしで閉じた（サーバの停止・`soda handoff` の開始）→ `connection_closed`（終了コード 1）。
  - `soda handoff` の途中・同時接続の上限（64）→ 受け口は要求を読まずに `pane_socket_busy` で断る。**sodactl はこれも 5 秒まで自動で繋ぎ直す**（上の `ECONNREFUSED` の繋ぎ直しと合わせて 1 つの上限）。
    それでも続いたときだけ `pane_socket_busy`（終了コード 1）で終わる。要求は読まれていない（質問は出ていない）ので、打ち直してよい。
    `soda handoff` が成功して新しい版に入れ替わった直後は、ブラウザがまだ繋ぎ直していないので、繋ぎ直した `sodactl ask` は `unavailable`（終了コード 0）になることがある（質問を出せる画面がまだ無い）。
  - 繋がった後に、返事が読めない（1 行の JSON でない・上限 8 MiB を超える）・受け口が要求の 1 行を 10 秒待っても揃わずに切った → 同じく `connection_closed`。
  - sodactl 側の時間切れ（`--timeout` に 15 秒を足して待っても返事が無い）→ `timeout`（終了コード 1。stdout の `status: "timeout"` とは別物）。
  - 操作のエラー（`not_found`・`ask_busy`・`invalid_ask_spec` 等）は `/ws` の経路と同じ code・同じ終了コード。
- **`/ws` の経路と同じもの**: 結果の JSON・終了コード・定義の検査・どのブラウザに出るか・「どの pane からの質問か」の固定の表示・呼び出し側（`sodactl ask`）が終わったら質問を取り消すこと。
  待っている質問の総数（32）と「1 つの pane に同時に 1 つ」は、`/ws` から出した質問と合わせて数える（受け口は 1 接続 1 要求なので、接続あたりの上限 8 には届かない）。
- **Windows（ネイティブ）では受け口を出さない**（名前付きパイプに繋げる相手を同じ利用者に限れるかを確かめられていないため）。`SODA_PANE_SOCKET` も入らず、今までどおり `sodactl login` が要る。
  WSL2 の中の `soda serve` は Linux として受け口を出す。
- サーバが受け口を置けなかったとき（ログに `cannot start the pane socket`）も、起動は続く。pane の中の `sodactl ask` は `/ws` の経路へ落ちる。

**安全の境界**

- 受け口を守るのは**ファイルの権限だけ**（サーバと同じ OS の利用者だけが繋げる）。token・cookie は要らず、pane の環境に token・cookie を入れない方針も変わらない（`SODA_PANE_SOCKET` の値は socket のパスだけ）。
  「同じ OS の利用者の権限で動くプロセスは信頼する」という前提は `bridge.sock`・`handoff.sock`（`docs/machines.md`）と同じ。
- 受け口へ繋げるプロセスは、要求の `paneId` を**自由に名乗れる**（受け口が確かめるのは、その pane が実在することだけ）。同じ session のほかの pane の名前で質問を出せ、ダイアログの
  「どの pane からの質問か」には**名乗った pane** が出る。今までの `/ws` の経路でも、ログイン済みなら `SODA_PANE_ID` を書き換えて同じことが出来た（`ask.open` は `paneId` を引数で受け、実在だけを確かめる）。
  受け口で変わるのは、それに**ログインが要らなくなった**こと。
- **`ask.open` は、サーバに読み出しと外部への通信をさせる**（メディア・成果物の対応で増えた権限）。受け口へ繋げるプロセスは、`image`・`audio`・`view.file` に書いたパスを**サーバの OS 利用者の権限で読ませられ**
  （画像・音・成果物の形に合うものだけ。中身は質問の画面にだけ届き、プロセスへは返らない）、`https://` の画像 URL を**サーバから外へ取りに行かせられる**（公開アドレスの 443 だけ。クエリにデータを載せれば、外へ持ち出す経路になりうる。
  サーバのログには、取得の宛先の**ホスト名だけ**を残す〔URL の全文・パス・クエリは残さない〕）。「同じ OS の利用者を信頼する」前提には沿うが、読み取り・外部通信を制限したサンドボックスの中のエージェントも、受け口を通じて**サーバの権限を借りられる**。
  そうした環境では、`SODA_PANE_SOCKET` の socket へ繋げられないようにする（サンドボックスの設定で socket を許可しない）。
- **`display`（表示の面）の操作は、`ask` と違い、ほかの pane の操作の値を読める**（20261007-soda-extensions）。受け口に載せた `display.set`・`close`・`list`・`wait`・`features`・`send` は、対象が要求の `paneId`（名乗った pane）だけで、
  引数に `paneId` は持たない（載せると `invalid_params`）。だが**名乗る pane の id を受け口は検証しない**（実在だけ）ので、同じ OS の利用者の別のプロセスが、ほかの pane の id を知っていれば、その pane の面を出す・閉じる・
  一覧する、そして **`display wait`/`events`（`events` の終わりの行 `display.end` の `reason` は `pane_closed`・`connection_closed`・`unsupported`・`busy`。`--timeout` の時間切れの直前の 1 秒未満に起きた操作は受け取れないことがある）でその pane の面への操作の値（パネルのフォームに利用者が入れた値）を読める**。`ask` で出来たのは偽の質問を出すことまでだった。
  守っているのは「同じ OS の利用者」の境界で、**pane 同士の境界ではない**。パネルのフォームに、秘密（パスワード・token など）を入れさせない。pane の id は `SODA_PANE_ID`・`sodactl snapshot`（ログイン済み）などで分かる。
  （接続元の pid から pane を逆引きして名乗りを検証する案は、別の作業の候補。）
- 受け口から出来るのは登録した操作だけなので、pane の入出力・ほかの pane の操作・設定・認証には届かない（`agent.send_keys`・`workspace.create` 等の `/ws` の RPC は、今までどおりログインした接続だけ）。
- 名前付き session（`soda serve --session <名前>`）は状態ディレクトリが別なので、受け口も session ごとに別。ある session の受け口からは、別の session の pane を名乗れない（同じ OS の利用者なら、その session の受け口へ繋げば名乗れる）。

**受け口に操作を足すとき**（開発者向け）

載せてよいのは、次の 4 つを全部満たす操作だけ（受け口には認証が無いため）。**`/ws` の handler をそのまま登録しない**。

1. 対象が呼び出し元の pane に限られる（引数に対象の pane を持たない schema で受け、handler は `ctx.paneId` だけを使う。**ただし名乗る pane の id は検証されない**ので、「呼び出し元の pane」はプロセスの自己申告。pane 同士の境界にはならない——上の「安全の境界」の `display`）。
2. pane のプログラムがもともと出来ることを超えない（pane の入出力・ほかの pane・設定・認証に触れない）。
3. 秘密を返さない。
4. 量の上限がある。

- protocol: 操作の名前の定数と引数の schema を `packages/protocol/src/paneSocket.ts` に足す（サーバと sodactl の両方がここから読む。例は `PANE_OP_ASK_OPEN`・`PaneAskOpenParams`）。
- サーバ: `packages/server/src/panesocket/PaneOpRegistry.ts` の `PaneOpDef`（名前・引数の schema・handler）を作り、`packages/server/src/composeServer.ts` で `register` する（例は `panesocket/askOp.ts`）。
- 結果を待つ操作（返事までに時間がかかる）は、handler に渡る `ctx.signal` の abort で自分の待ちを取り消す（接続が終わると abort する。取り消しの配線を登録の外に持たない。例は `panesocket/askOp.ts`）。
- sodactl: `packages/cli/src/paneSocket.ts` の `viaPaneSocketOrSession` を使う（受け口を使うか・`/ws` へ落ちるかの判断をコマンドごとに持たない）。
- やりとりの形は `packages/protocol/src/paneSocket.ts`: **1 接続 1 要求**。要求は 1 行の JSON（`{"v":1,"op":"<名前>","paneId":"<id>","params":{…}}`。上限 4 MiB）、返事も 1 行の JSON
  （`{"ok":true,"result":…}` か `{"ok":false,"error":{"code","message"}}`。sodactl が読む上限は 8 MiB）で、受け口は返事を書いたら閉じる
  （要求を読まずに断るとき〔`pane_socket_busy`・行の上限の超過〕は、返事が相手に届くよう、相手が閉じるか 1 秒たつまで待ってから閉じる）。検査の順は「行の形（`bad_request`）→ 操作（`unknown_op`）→ pane の実在（`not_found`）→ 引数（`invalid_params`）」。
  受け口だけの code は `unknown_op`・`bad_request`・`pane_socket_busy` の 3 つ。呼び出し側は要求を書いた後、返事の行を読むまで接続を閉じない（受け口は相手が閉じたら、呼び出し元が終わったものとして操作を取り消す）。
- 上限は上の「サーバ側の上限」。

### 呼び出し元の pane を対象にする（`--current`・対象の省略・`pane current`）

`pane split`・`pane current` の対象は、位置引数（`pane split` だけ）・`--pane <paneId>`・`--current` のどれか 1 つで指す（2 つ以上は使い方の誤り）。

| 指し方 | 対象 |
|---|---|
| `<paneId>`・`--pane <paneId>` | その pane |
| `--current` | 呼び出し元の pane（`SODA_PANE_ID`）。`SODA_PANE_ID` が無ければ使い方の誤り（終了コード 2） |
| 省略（pane の中＝`SODA_PANE_ID` がある） | 呼び出し元の pane |
| 省略（pane の外） | サーバのフォーカスの pane（`snapshot` の `.focus.paneId`。無ければ `not_found`） |

```bash
sodactl pane split --current --direction right          # 自分の隣に pane を作る（pane の中なら --current を省いても同じ）
sodactl pane current | jq -r '.pane.tabId, .pane.workspaceId'
sodactl tab create --workspace "$(sodactl pane current | jq -r .pane.workspaceId)"
```

- `pane current` は対象の pane（`snapshot` の `.panes[]` と同じ形）に `workspaceId` と `focused`（サーバのフォーカスの pane か）を足して `{"pane": {...}}` で出す。
  `tabId`・`workspaceId` は打った時点のサーバの状態なので、pane が移された後でも今の値になる。何も変えない。
- 呼び出し元の pane を使う（`--current`・pane の中での省略）のは、接続先がその pane を動かしているサーバだと確かめられるときだけ。確かめ方は下の歯止めと同じ
  （接続先と `SODA_SERVER_URL` の origin を比べ、ループバックの名前は同じとみなす）。確かめられない（`SODACTL_URL`・`--url` が別の origin・証明書の名前等、
  `SODA_SERVER_URL` が無い）ときは、何も送らずに `caller_pane_unknown`（終了コード 1）で断る。ID はサーバごとに別で、別のサーバでは同じ ID が
  無関係な pane を指すため。同じサーバだと分かっているとき（証明書の名前で同じサーバを指している等）だけ `--pane "$SODA_PANE_ID"` で明示し、
  そうでなければ `SODACTL_URL`・`--url` を外して `SODA_SERVER_URL` につなぐ（`SODA_SERVER_URL` が無い pane では `--pane` で明示するしかない）。
- `--machine <名前|id>`（`local` 以外）では、`--current` は使い方の誤り、省略はそのマシンのフォーカスの pane（手元の `SODA_PANE_ID` はそのマシンの pane を指さない）。
  `--machine local` は `--machine` が無いときと同じ。
- 自分の pane を分ける・調べるのは歯止めの対象外（断らない）。

### グラフの自動載せのための名乗り（`callerPaneId`）

`pane split`・`workspace create`・`tab create`・`agent start` は、pane の中から打ったとき、要求に呼び出し元の pane の ID（`callerPaneId`）を添える。
サーバが「誰が作ったか・誰が起動したか」を覚え、エージェントが検出されたとき連携のグラフに自動で載せるため（`docs/agent-graph.md`「エージェントが起動したエージェントの自動載せ」）。

- 送るのは、上の `--current` と同じ確かめ（`SODA_PANE_ID` があり、接続先が `SODA_SERVER_URL` と同じサーバ）ができたときだけ。確かめられないとき・`--machine`（`local` 以外）・pane の外では送らない
  （送らなくても、コマンドの成功・エラー・出力は変わらない）。古い `sodactl` は送らず、古いサーバは知らない項目として無視する。
- 使うのは**グラフの自動載せの関係の記録だけ**。権限の判断には使わず、他の pane への操作の許可を広げない。サーバは名乗られた pane が実在することだけ確かめ、実在しなければ黙って無視する。
  `agent start` の `callerPaneId` は、対象の `paneId` とは別の項目（打った pane を指す）。
- ログインなしの受け口（`pane.sock`）には載せない。この名乗りは、ログイン済みの `/ws` の経路でだけ届く。

### 自分の pane への操作の歯止め（`self_target`）

pane の中の sodactl（`SODA_PANE_ID` と `SODA_SERVER_URL` があり、接続先の origin が `SODA_SERVER_URL` と同じ）は、次の操作の対象が**自分の pane**、
または**それを含む tab・workspace** のとき、操作の要求を送らずに `self_target`（終了コード 1）で終わる。

`pane close`・`pane input`・`pane run`・`pane attach`・`pane control`・`tab close`・`workspace close`・`agent prompt`・`agent send-keys`・`agent start`

- 自分の pane を閉じると自分が終わり、自分の pane への入力・prompt は自分の入力欄に混ざり、自分の pane への直結は出力が自分に返って流れ続けるため。
  エージェントを名前で指しても、その pane が自分なら断る。
- 読み取り・分割・名前付け（`pane read`・`pane observe`・`pane split`・`snapshot`・`watch`・`agent list/get/wait/read/rename` 等）は断らない。
- 意図してやるとき（人が自分の pane を閉じる等）は `SODA_PANE_ID` を空にして打つ: `SODA_PANE_ID= sodactl pane close "$SODA_PANE_ID"`。
  別のサーバ（`--url`・`SODACTL_URL` で別の origin）につなぐときは効かない。ループバックの名前（`localhost`・`127.0.0.1`・`[::1]`）の違いと既定のポートの
  省略は同じサーバとみなす（`SODACTL_URL=http://localhost:7780` を export していても外れない）。ループバック以外の名前（TLS の証明書の名前・LAN の IP 等）で
  同じサーバを指した `SODACTL_URL` では、同じサーバだと見分けられないので**効かない**（何も表示しない）。
- **安全の境界ではない**。誤操作を止めるだけで、環境変数を消せば効かず、認証済みの接続は今までどおりどの pane にも書ける。

## herdr との対応と違い

### `pane attach`

herdr の `terminal attach <terminal_id> [--takeover]` に相当する（`docs/herdr-parity.md` の H40）。同じ点: 1 端末に書き込み可能な直結は 1 つ・
`--takeover` で奪う・直結の大きさを優先してフル UI（ブラウザ）からは変えない・`Ctrl+B q` / `Ctrl+B Ctrl+B`・切り離しは終了コード 0 でそれ以外の終わり方は 1（使い方の誤りは 2）・
フル UI からの入力は止めない。違い:

- herdr はサーバで描き直したフレームを送るが、sodactl は **pane の生の出力をそのまま流す**。このため pane の中のアプリが代替画面から出ると
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

- herdr のフレームはサーバが描き直した画面（観測者の `--cols/--rows` の大きさ）。sodactl は **pane の生の出力を区切ったもの**で、`width`/`height` は pane の実際の大きさ。
  そのため `pane observe` は `--cols/--rows` を持たない。
- `terminal.scroll` は未対応（不正な行として読み飛ばす）。対象は pane ID だけ（herdr は terminal・agent も受ける）。
- 大きさは 1〜1000（herdr は 1〜65535）。不正な行の検査が厳しい（知らないキー・非正規の base64・Unicode の空白や BOM も不正。herdr は知らないキーを無視する）。
- 読み手が遅いとき、herdr は 30 秒書けなければ切るが、sodactl は受信を止めて待ち、追いついたら描き直し（`full: true`）から続ける。
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

### `workspace report-metadata`・`pane report-metadata`

herdr の同名のコマンドに相当する（`docs/herdr-parity.md` の H21）。整え方・上限・`seq`・`ttl-ms`・誤りの code は herdr と同じ。違い:

- `pane report-metadata` はトークン（`--token`・`--clear-token`）だけ。herdr の `--title`・`--display-agent`・`--state-label`・`--clear-state-labels`・`--agent`・
  `--applies-to-source` は無い（`.aidev/backlog/product-roadmap.md`）。
- `--token` の値が `=` を含まなければ接続の token として読む（本製品の `--token` は全コマンド共通の接続の token のため）。
- `--token`・`--clear-token` の値が `--` で始まると、値が無いものとして断る（終了コード 2。本製品の CLI のほかのオプションと同じ。herdr は次の引数をそのまま値にする）。
- RPC（`workspace.report_metadata`・`pane.report_metadata`）の `tokens` は `{name, value}` の配列（herdr は map）。`source`・名前・値の生の長さは 4096 まで、
  組は 256 まで（herdr には無い上限。値は 80 文字に切り詰めるので実用上の違いは無い）。

### skill ファイル・pane の環境変数

herdr の agent skill（`skills/herdr/SKILL.md`・`herdr --skill`）と pane の環境（`HERDR_ENV` 等）に相当する（`docs/herdr-parity.md` の H39）。違い:

- skill は `sodactl skill` で出す（herdr は `herdr --skill`）。中身は本製品のコマンドに合わせて書き直した日本語のもの。`npx skills add` 等の配布は無い。
- pane の中にいる印は `SODA_PANE_ID`（herdr は `HERDR_ENV=1`）。接続先は socket のパスではなく URL（`SODA_SERVER_URL`）で、認証は利用者の login の
  キャッシュ（herdr の socket はファイルの権限で守られ、認証が無い）。**`sodactl ask` だけ**は、herdr と同じく socket のパス（`SODA_PANE_SOCKET`）で繋ぐ、ファイルの権限で守られた認証の無い受け口を使う
  （Linux・macOS。載っている操作は質問のフォームだけで、herdr の socket のように全操作を受けるものではない。ほかのコマンドは今までどおり URL と login）。`HERDR_WORKSPACE_ID`・`HERDR_TAB_ID`・`HERDR_BIN_PATH` に当たる変数は無い（workspace・tab は `pane current` で聞く）。
- `--current`・`pane split` の対象の省略・`pane current` は herdr と同じ（呼び出し元の pane・pane の外ではフォーカスの pane・`--machine` では呼び出し元を使わない）。違い:
  - `--current` を受けるのは `pane split`・`pane current` だけ（herdr の `pane layout`・`process-info`・`neighbor`・`edges`・`focus`・`resize`・`zoom`・`swap` は
    コマンド自体が無く、herdr の `pane input --right-click` は sodactl の `pane input`〔文字の送信〕とは別物の右クリックの設定で、これも無い）。
  - 位置引数・`--pane`・`--current` を 2 つ以上渡すと使い方の誤り（herdr は後に書いたものが勝つ）。
  - `pane current --current` は `SODA_PANE_ID` が無ければ使い方の誤り（herdr はフォーカスの pane を返す）。
  - 接続先がその pane のサーバだと確かめられないと `caller_pane_unknown` で断る（herdr は socket のパスでつなぐので、この確かめが要らない）。
  - 出力は camelCase の `{"pane": {...}}`（herdr の `.result.pane` の snake_case の `PaneInfo`）。
  - workspace・tab の ID の環境変数（`HERDR_WORKSPACE_ID`・`HERDR_TAB_ID`）は無い。`pane current` で今の値を聞く（herdr の値は起動時のまま `pane move` で古くなる）。
    pane を移しても pane の ID は変わらないので、`SODA_PANE_ID` は古くならない（herdr は別の workspace への移動で pane の ID が変わり、古い ID を別名として残す）。
    pane を別の workspace へ移す RPC（`pane.move_to_tab`・`pane.move_to_new_tab`）は、移動元と移動先が同じ worktree（`worktreeKey` が同じ）のときだけ通り、別の worktree へは何も動かさず `{ok: false, reason: "different_worktree"}` を返す（管理外・判定前の workspace どうしは、開いた場所が同じときだけ。同じ workspace の中は今までどおり）。作った直後で判定が入る前に断られることがあるので、続けて移すスクリプトは `reason` がある間、待って試し直す。
- 自分の pane への操作を断る `self_target` は本製品だけ（herdr は断らない）。
- サーバを起動した環境の `SODACTL_URL`・`SODACTL_TOKEN` を pane に渡さない（herdr は管理する変数を上書きするが、token に当たるものは無い）。
