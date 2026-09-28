# 端末版（引数なしの `soda`）

ブラウザを使わず、端末の中で Sodashitsu の画面（サイドバー・tab バー・分割した pane）を開く。SSH で入った先・ブラウザを開けない
コンテナや WSL の端末でも、ブラウザと同じ session を同じ操作で扱える。herdr の引数なしの `herdr` に当たる。

各機能が端末版でどう扱われるか（対応／読み替え／非対応と理由）は `docs/tui-parity.md`。3 環境での確かめ方は `docs/verification.md`「端末版」。

この docs の `soda …` は `node <リポジトリ>/packages/server/dist/main.js …` の略（PATH への置き方は `docs/verification.md`「前提」）。

## 起動と終了

```sh
soda                        # 既定の session
soda --session work         # 名前付き session（SODA_SESSION=work soda でも同じ）
soda --state-dir ~/soda-lan # 状態ディレクトリを指定
```

- 手元の `soda serve` が動いていればそれに繋ぐ。動いていなければ**裏で起動してから**繋ぐ（既定の session は `127.0.0.1:7780`、
  名前付き session は記憶したポート〔`serve.json`〕、無ければ 7780）。起動した場合、初回の token（ブラウザでログインするためのもの）を端末版が画面を開く前に
  標準エラーへ出す。**二度と出ない**ので、ブラウザでも使うなら控える（無くしたら `soda token reset`）。
- 初めて開いたとき、はじめの案内が 1 回出る。Enter（か →・`l`・［はじめる］）で案内済みにして、設定画面の「エージェント連携」の節へ移る
  （herdr と同じく Esc・外側のクリックでは閉じない）。設定画面の端末版の節の末尾から開き直せる。次のときは出ない: 共有の設定で案内済み（Web 版で
  済ませた場合を含む）・案内ができる前からの利用者（共有の設定が保存済みで `onboarding` の項目が無い）・この状態ディレクトリで端末版を前に使った
  （`tui-state.json` がある）・環境変数 `SODA_NO_ONBOARDING=1`（スクリプトから疑似端末で `soda` を動かすときに使う）・端末でない。
- 抜ける（切り離す）: `prefix+q`（既定の prefix は `Ctrl+B`）。端末を閉じる・SSH が切れる・`SIGTERM` でも同じ。
  **サーバと pane のプロセスは動き続け**、もう一度 `soda` を打つと同じ画面（スクロールバックを含む）に戻る。
- サーバそのものを止める:
  - `soda session stop default`（名前付きなら `soda session stop <名前>`。`--state-dir` を付けて起動したなら同じものを付ける）。
    どの OS でも使える。
  - 端末版の中から: 操作「サーバを止める」（`stop_server`。**既定のキーは無い**——押し間違えると全ての pane が止まるので。
    設定の「キー」で割り当てる）。確認を挟み、止めたら端末版も終わる。
- `soda help` で使い方を出す。**標準入力か標準出力が端末でないと**（パイプ・リダイレクト・CI）、`soda` は
  サーバを起動せずに一行の案内を標準エラーへ、使い方を標準出力へ出して**終了コード 2** で終わる。スクリプトから使い方を見るなら `soda help`
  （終了コード 0）を使う。

### 起動できないとき（終了コード 1 と案内）

| 案内 | 理由と対処 |
|---|---|
| `refusing to open soda inside a soda pane` | pane の中で `soda` を打った（入れ子）。下の「入れ子」 |
| `the state dir … is in use by soda on another host` | 別のホスト・コンテナの soda が同じ状態ディレクトリを使っている。`--state-dir` か `--session` で分ける |
| `the running soda serve (pid …) does not support connecting without a token (an older version)` | 古い版の `soda serve` が動いている。止めてから（起動した端末で Ctrl+C・`soda session stop`）打ち直すか、`soda handoff` で新しい版に入れ替える |
| `soda serve exited before it became ready`・`did not become ready within 15 seconds` | サーバが起動できなかった（ポートの衝突等）。出た案内と状態ディレクトリの `server.log` を見る |
| `could not start soda serve` | 3 回起動を試みたが、サーバが動き続けなかった。状態ディレクトリの `server.log` を見る |
| `local login is rate limited` | ローカルログインの失敗が続き、サーバが一時的に受け付けていない（通常のログインと同じ回数の制限）。1 分ほど待ってやり直す |
| `local login was refused (HTTP 403)` | サーバが同じマシンからの接続と認めなかった（下の「認証」） |
| `the terminal UI could not be loaded` | 導入が壊れている（ソースから使っているなら `pnpm install` と `pnpm build`）。`soda serve` とブラウザは使える |

## 画面

- 左にサイドバー（Spaces＝workspace の一覧、Agents＝エージェントの一覧）、上に tab バー（1 行。設定で下にも置け、tab が 1 つなら隠すこともできる）、残りに分割した pane。
  pane の枠の上辺に状態の記号と pane の名前。
- サイドバーの幅は既定 26 桁。境界のドラッグで変えられ、`prefix+b` で畳む。今の幅と折りたたみは端末ごと（状態ディレクトリの `tui-state.json`）。
  エージェントの行は Web 版と同じ既定で **1 件 2 行**（印・workspace・tab／名前・エージェント）。狭いと感じたら設定の「表示」でサイドバーの行を減らす。
- 端末の幅が 64 桁未満（設定「端末版 → 1 列表示にする幅」）だと、焦点の pane だけを全体に出し、上辺に workspace・tab の位置と
  「switch」（選び直し）を出す（herdr の狭い画面と同じ）。20×5 未満では「端末が小さすぎます」だけを描く。
- ほかのクライアント（ブラウザ・別の端末版）が最後に操作した tab は、その大きさで pane が動く。自分の枠と違う間は、
  左上を合わせて切り取り、余りは背景色で埋める（枠の右下に `⋯`）。自分がキーを打つ・クリックすると自分の大きさに戻る。

### 色

24 ビット色で描くか 256 色へ寄せるかは、次の順で決める。

1. 環境変数 `SODA_TRUECOLOR`（`1`＝24 ビット色、`0`＝256 色）。SSH 越しで判定が外れるときに使う。
2. 設定「端末版 → 色の出し方（この端末だけ）」（`tui-state.json` に残る。端末ごとに扱える色数が違うので共有しない）。
3. 自動: `COLORTERM=truecolor|24bit`・Windows Terminal（`WT_SESSION`）・`TERM` が `-direct` で終わる・`TERM_PROGRAM` が iTerm.app / WezTerm / vscode / ghostty・kitty。
   どれでもなければ 256 色。

テーマは Web 版と同じで、pane の中の配色もテーマが決める。明暗の自動は外側の端末に背景色を訊いて（OSC 11）追従する（対応する端末だけ）。

## キー

herdr と同じ prefix 方式。`Ctrl+B` の後に 1 キー。prefix を押すと tab バーの左端に `PREFIX` が出て、`Esc` か 3 秒で解ける。
`Ctrl+B Ctrl+B` で pane へ `Ctrl+B` そのものを送る。prefix とその直後の 1 キー、それに直接のキー（prefix なしで割り当てたキー。既定では画像の貼り付けの `ctrl+v` だけ）以外
（`Ctrl+C`・`Esc`・矢印・`Alt` 付き等）はすべて焦点の pane へ届く。直接のキーに割り当てたキーは端末版が受ける（割り当てを外せば pane へ届く。画像の貼り付けの `ctrl+v` は、クリップボードに画像が無ければそのまま pane へ送る）。

| キー | 操作 | キー | 操作 |
|---|---|---|---|
| `prefix+?` | キー一覧（`/` で絞り込み） | `prefix+q` | 切り離し（端末版を終える） |
| `prefix+s` | 設定 | `prefix+o` | 次の知らせの対象へ移る |
| `prefix+w` | navigate（サイドバーをキーで選ぶ。Space でメニュー） | `prefix+g` | goto（workspace・tab・pane を探す） |
| `prefix+shift+n` | 新規 workspace | `prefix+shift+w` / `shift+d` | workspace の名前を変更 / 閉じる |
| `prefix+shift+g` | 新しい worktree | `prefix+c` | 新規 tab |
| `prefix+n` / `p` / `1..9` | 次 / 前 / 番号の tab | `prefix+shift+t` / `shift+x` | tab の名前を変更 / 閉じる |
| `prefix+v` / `-` | 右 / 下へ分割 | `prefix+h/j/k/l` | 左 / 下 / 上 / 右の pane へ |
| `prefix+shift+h/j/k/l` | pane を入れ替え | `prefix+tab` / `shift+tab` | pane を巡回 |
| `prefix+x` | pane を閉じる | `prefix+z` | 拡大表示 |
| `prefix+r` | resize モード（h/j/k/l・矢印、Esc で抜ける） | `prefix+shift+p` | pane の名前を変更 |
| `prefix+[` | copy モード（v で選択・y でコピー・`/` で検索・q で抜ける） | `prefix+e` | スクロールバックをエディタで開く（サーバの上で。Linux・macOS は `EDITOR`〔無ければ `vi`〕、Windows は `VISUAL`、無ければ `EDITOR`） |
| `prefix+b` | サイドバーの折りたたみ | `prefix+shift+r` | 設定と独自コマンドを読み直す |
| `ctrl+v` | クリップボードの画像を貼り付け（手元だけ。下の「クリップボード」） | | |

- 割り当ては Web 版と**共有**（設定「キー」でどちらから変えても両方に効く）。プリセット（herdr-ctrl-alt・tmux）・直接のキー（prefix なし）も同じ。
  既定のキーの無い操作（`switch_workspace`〔1〜9 の番号つき〕・`open_worktree`・`remove_worktree`・`stop_server` 等）は設定で割り当てると使える。
- 名前の入力欄は Enter で確定・Esc で取り消し。Ctrl+A/E/U/K/W・Alt+B/F が効く。

### 区別できないキー

端末は一部の組合せを区別して送らないので、キー設定に割り当てても区別されない（端末版は Kitty keyboard protocol を使わない）。

- `ctrl+shift+文字` は多くの端末で `ctrl+文字` と同じ。`ctrl+i`＝`Tab`・`ctrl+m`＝`Enter`・`ctrl+[`＝`Esc`。
- **`Esc` を素早く 2 回押すと `ctrl+alt+[`（＝`alt+Esc`）として読む**（どちらも同じ列 `ESC ESC`）。1 回の `Esc` は 25ms 待って確定する。
- 設定のキーの取り込み（「次に押したキーを割り当てる」）で、外側の端末が送らない組合せは取り込めない。

### 外側の端末との衝突

外側の端末（端末エミュレータ）が先に取るキーは端末版に届かない。よくあるもの：

| 外側の端末 | 先に取るキーの例 | 回避 |
|---|---|---|
| Windows Terminal | `ctrl+shift+t`（新しいタブ）・`ctrl+shift+w`・`ctrl+c`（選択中のコピー）・`ctrl+v`（貼り付け）・`alt+enter` | 端末の設定で外すか、prefix 方式のキー（既定）を使う。`ctrl+v` の画像の貼り付けは下の「クリップボード」 |
| VS Code の統合端末 | `ctrl+p`・`ctrl+shift+p`・`ctrl+b`（サイドバー）など VS Code のキー | VS Code の設定 `terminal.integrated.commandsToSkipShell` から外すか、`terminal.integrated.sendKeybindingsToShell` を有効にする。prefix を変えてもよい |
| macOS の端末 | `cmd+…` | 端末版は `cmd` を受けない |

`Shift`＋クリック・ドラッグは多くの端末が自分の選択に使う（端末版の選択は `Shift` 無しでよい）。

## マウス

外側の端末のマウス報告（SGR）で、herdr と同じ操作ができる。

- クリックで pane・tab・workspace・エージェントへ。右クリックでメニュー（pane・tab・workspace・グループ。空いた所は全体のメニュー＝キー一覧・goto・設定・知らせの一覧・切り離し）。
- 分割の境界・サイドバーの幅・Spaces と Agents の境界をドラッグ。tab・workspace をドラッグで並べ替え。「＋」で新しい workspace・tab。
- pane の名前をドラッグ: 別の pane の縁へ落とすと分割して移し、中央で置き換え、tab・サイドバーの workspace へ落とすと移動（Web 版と同じ）。
- ホイールでスクロールバック（3 行）。pane の右端のスクロールバーもドラッグできる。pane のアプリがマウスを求めていれば（vim・htop 等）アプリへ送る。
- ドラッグで選択して離すとコピー、ダブルクリックで単語。`Ctrl`＋クリックでリンクを開く（http・https だけ。手元では OS の既定のブラウザ、
  SSH 越しでは開けないのでクリップボードへ写す）。OSC 8 のリンクは、繋ぎ直すと失われる（サーバの画面の写しが文字だけのため）。
- 設定「端末版 → マウスを使う」を切ると、外側の端末がマウスを扱う（外側の端末の選択・貼り付けがそのまま使える。端末版の操作はキーだけ）。
  「マウスで選んだらコピー」を切ると、選んだ範囲を反転するだけで写さない。

## クリップボード

- コピー（選択・copy モードの `y`）は、外側の端末へ OSC 52 を出す（SSH 越し・VS Code・WSL・tmux の中でも効く唯一の手段）。
  手元（SSH 越しでない）の Linux・macOS で OS の道具（`wl-copy`・`xclip`・`pbcopy`）があれば、それでも写す（OSC 52 を受けない端末のため）。
  Windows・WSL は OSC 52 だけ（Windows Terminal が受ける。`clip.exe` は UTF-8 の文字を化かすので使わない）。tmux の中なら tmux の `set -g set-clipboard on` が要る。
- 貼り付けは外側の端末の貼り付け（ブラケットペーストで pane へ届く）。pane のメニューの「貼り付け」は手元のクリップボードを読める構成だけ。
- 画像の貼り付け（`ctrl+v`）は、端末版がクリップボードを読める機械で動いているときだけ（Linux は `wl-paste`・`xclip`、macOS は `osascript`、Windows・WSL は PowerShell）。
  **SSH で入った先で端末版を起動した構成では出来ない**（外側の端末からクリップボードの画像を読む手段が無い）。

## 通知

エージェントの入力待ち・完了を、次の 3 つで知らせる。通知の種類・音の有無は Web 版と共有の設定「通知」。

- 画面内のトースト（右下・5 秒。クリックで対象へ）。`prefix+o` で次の対象の pane へ移る。全体のメニューの「知らせの一覧」で未処理の知らせを見られる（端末版だけ）。
- 音を鳴らす設定のときはベル（外側の端末の音）。pane のアプリが出したベルも、外側の端末にフォーカスがあれば送る（設定「pane のベルを外側の端末へ」）。
- 外側の端末へのデスクトップ通知の依頼: kitty→OSC 99、Ghostty・iTerm2・WezTerm→OSC 9、Windows Terminal→OSC 777
  （Windows Terminal 側で受ける設定が要る版がある）、判別できない端末（gnome-terminal・VS Code 等）では出さない。
  SSH 越しでは環境変数が届かず判別できないことが多いので、設定「端末版 → 通知の出し方」で選ぶ。tmux の中では tmux の素通しで包んで出す
  （tmux に `set -g allow-passthrough on` が要る）。
- 外側の端末がフォーカスの報告に対応していれば、端末版を見ている間は Web 版と同じ規則で抑える。ブラウザの「OS 通知を許可」の手順は無い。

## 設定（ブラウザと共有）

`prefix+s`。節は通知・テーマ・表示・端末・エージェント連携・キー・端末版（画面の並び）。変更はすぐ効き、**サーバに保存されてブラウザと他の端末版にも届く**。

- **ブラウザ同士でも共有になった**（以前はブラウザごとの localStorage）。サーバにまだ設定が無いとき（初めてこの版に繋いだとき）だけ、
  最初に繋いだブラウザの値がサーバへ移る（同時に 2 つが移したら項目ごとに後の方）。2 つのブラウザで違う設定を使っていた人は 1 つに揃う。
- 保存の上限（256KB）を超えて断られた変更は、その画面の中でだけ効く値として残り、知らせが 1 回出る（ほかの項目の同期は続く）。
- 「表示」の pane の枠の表示・隙間・エージェント名、tab バーの位置（上・下）と右端の表示（拡大の状態・ホスト名・日時・固定文字列と区切り）は、
  ブラウザと端末版の両方に効く（端末版では、枠を描かないときも分割の境目に線を 1 本残し、隙間を切にすると左右の縦の罫線を 1 本にまとめる。1 列表示の間の tab バーはいつも上）。
- ブラウザの画面の見た目にだけ効く項目（pane の枠・隙間の太さ・外周の枠、全画面のときの予約キー）は、端末版からも変えられるが
  「ブラウザの画面の設定です」と注記が出て、端末版の画面は変わらない。
- 端末版の節（端末版にだけ効く。保存先は共有の設定なので、どの端末版でも同じ）:

  | 項目 | 既定 | 意味 |
  |---|---|---|
  | マウスを使う | 入 | 切にすると外側の端末がマウスを扱う |
  | マウスで選んだらコピー | 入 | 切にすると選んだ範囲を反転するだけ |
  | 通知の出し方 | 自動 | 外側の端末へのデスクトップ通知の出し方（下の「通知」） |
  | サイドバーの既定の幅 | 26 | ドラッグで変えた今の幅があればそちらが先 |
  | 1 列表示にする幅 | 64 | 端末の幅がこれより狭いと 1 列表示 |
  | tab が 1 つなら tab バーを隠す | 切 | サイドバーを畳んでいる間と 1 列表示では隠さない。隠している間のモードの印と接続の状態は pane の場所の右上に出す |
  | 外側の端末のタイトル | `{hostname}: {workspace}` | OSC 2 で外側の端末のタイトルを書く。`{hostname}`・`{workspace}`・`{tab}`・`{pane}`・`{terminal_title}`（`{{`・`}}` で括弧そのもの）。空にすると触らない。読めない書式は設定画面で受け付けない（`prefs.json` に読めない書式があればタイトルに触らない）。終えるとき元のタイトルへ戻す（戻せる端末だけ） |
  | 外側の端末に戻ったら全部描き直す | 入 | 外側の端末にフォーカスが戻ったとき全体を描き直し、外側の端末の表示のまれな崩れを直す（herdr の `redraw_on_focus_gained`）。切にすると戻ったときのちらつきが減る |
  | pane のベルを外側の端末へ | 入 | 見えている pane が出した BEL を、外側の端末にフォーカスがあるときだけ送る（100ms に 1 回まで） |
  | workspace を閉じる前に確かめる | 入 | 切でも、動作中の pane があれば確かめる（herdr と同じ） |
  | 新しい tab の名前を先に聞く | 入 | 新しい tab を作るとき名前の入力欄を出す |
  | 新しい workspace の名前を先に聞く | 切 | 新しい workspace を作るとき名前の入力欄を出す |

  端末ごと（`tui-state.json`）: 色の出し方・今のサイドバーの幅と折りたたみ。
- 色の上書きは、CSS の色のうち端末版が読める形（`#rgb`〜`#rrggbbaa`・`rgb()`・`hsl()`・色の名前）だけ効く。ほかの値はその色だけ既定のまま。
- `done` の既読は共有しない（クライアントごと。Web 版・herdr と同じ）。

## 複数のマシン

`soda machine add` で登録したマシン（`docs/machines.md`）の workspace がサイドバーにマシンの見出しごとに並ぶ。見出しの左端で畳む・広げる、
見出しのクリックでそのマシンの画面に切り替える（手元のサーバが中継する）。共有の設定は手元のサーバとだけやりとりする。
見ていないマシンの要約の既読は、そのサーバが覚えているものだけで決まる。

## 入れ子と tmux

- **入れ子**: pane の中（環境変数 `SODA_PANE_ID` がある）で `soda` を打つと、終了コード 1 で断る（同じ画面を二重に開くため。herdr と同じ）。
  それでも開くなら `soda --allow-nested`。`sodactl` や `soda serve` 等のサブコマンドは断らない。
- **tmux の中**: tmux の既定の prefix も `Ctrl+B` なので tmux が先に取る。`Ctrl+B Ctrl+B`（tmux の `send-prefix`）で端末版へ届けるか、
  どちらかの prefix を変える（端末版は設定「キー」、または プリセット「tmux」）。通知は tmux の素通しで包み、画像は出し直さず `[画像]` の印にする。

## SSH 越し

SSH で入った先で `soda` を打てば、その先の状態ディレクトリでサーバを見つける・起動する（端末版はその先で動く）。port の転送は要らない。

- デスクトップ通知・24 ビット色の判定に使う環境変数が SSH で届かないことが多い。設定「端末版 → 通知の出し方」・`SODA_TRUECOLOR=1` で指定する。
- コピーは OSC 52 で手元の端末へ届く。リンクは手元では開けないのでクリップボードへ写す。クリップボードの画像の貼り付けは出来ない。
- SSH が切れても pane は動き続ける。入り直して `soda` で戻る。

## 認証（手元へ token なしで繋ぐ仕組み）

端末版は token を打たずに手元のサーバへ繋ぐ。サーバは起動のたびに乱数の秘密を状態ディレクトリの `local-auth.json`（0600）に書き、
`POST /api/local-login` で**その秘密を示し、かつ接続が同じマシンから（接続元と接続先のアドレスが同じ）**のときだけ、ブラウザと同じ session の cookie を出す。

- **信頼の根拠は秘密のほう**（状態ディレクトリを読めるのは同じ利用者だけ。Linux・WSL2 は 0600、Windows は `%LOCALAPPDATA%` の既定の ACL）。
  同じマシンかの判定は補助にすぎない: **手元の中継（SSH のポート転送・リバースプロキシ・コンテナのポートの公開等）の後ろのサーバでは、
  中継が同じマシンからの接続に見えるので判定が効かない**。そういう構成でも秘密を読めない人は繋げないが、状態ディレクトリの権限を緩めないこと。
  逆に、中継の先のサーバへ引数なしの `soda` で繋ぐことは出来ない（`HTTP 403`。ブラウザか `sodactl login` の token を使う）。
- 失敗は通常のログインと同じ回数の制限に数える。サーバを止めると秘密のファイルは消える。

## Windows ネイティブの注意

- 対象の端末は Windows Terminal（PowerShell）と VS Code の統合端末。
- 裏でのサーバの起動は、端末を閉じても止まらないよう、PowerShell から WMI（`Win32_Process.Create`）で `cmd.exe` 越しに起動する（herdr と同じ）。
  **WMI で起動したサーバの環境は、この端末の環境ではなく利用者の既定の環境**（この端末で足した `PATH`・環境変数は pane に入らない）。
  WMI の起動に失敗したときは普通の起動に落とし、「端末を閉じるとサーバも止まることがある」と知らせる。
- 状態ディレクトリは `%LOCALAPPDATA%\sodashitsu`。秘密のファイルの保護はこの場所の既定の ACL（利用者本人と SYSTEM・Administrators）に頼る。
  ACL を広げた場所を `--state-dir` に指定しないこと。
- 止めるときは `soda session stop default`（`soda session stop` は全 OS で使える）か、端末版の「サーバを止める」。

## 性能

入力から描画までの遅延・16 pane・大量出力の隣での入力・エージェントの表示の反映を `node packages/tui/dist/bench/latency.js` で測れる
（`packages/tui/src/bench/README.md`）。
