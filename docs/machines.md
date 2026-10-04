# 複数のマシンをまとめて使う（保存した SSH のマシン）

手元の `soda serve` に、ほかのマシン（ビルド機・GPU 機など）を SSH の宛先として登録すると、手元のブラウザの 1 画面で全マシンの workspace と
エージェントの状態を一覧し、どのマシンの workspace にも切り替えて操作できます（herdr の「Connecting machines」に相当。`docs/herdr-parity.md` の H43）。

- 各マシンは**自分の `soda serve`・session・pane のプロセスを持ち続けます**。手元の `soda serve` を止めても、登録を無効化・削除しても、リモートの pane は動いたままです。
- 通るのは利用者がふだん使っている **SSH だけ**です。リモートの `soda serve` のポートをネットワークに出したり、ポート転送を張ったりする必要はありません。
- 登録簿に保存するのは**不透明な id・名前・SSH の宛先・リモートの session・有効か**だけです。パスワード・鍵・token は保存しません（認証は OpenSSH に任せます）。

## 仕組み

```
ブラウザ ──/ws?machine=<id>──▶ 手元の soda serve ──ssh -o BatchMode=yes … -- <宛先> soda bridge──▶ リモートの soda bridge ──▶ リモートの soda serve（bridge.sock）
```

- 手元の `soda serve` が、有効なマシンごとに裏で `ssh` を 1 本起動し（システムの `ssh` を引数の配列で。シェルを通しません）、リモートで `soda bridge` を動かします。
- `soda bridge` は標準入出力を、リモートの `soda serve` の状態ディレクトリの **`bridge.sock`（Unix ドメイン socket・権限 0600）** へ素通しで繋ぎます。
  **リモートの認証はこの socket の権限だけ**です（SSH でログインできる同じ利用者だけが繋げます）。リモートの token は読まず、手元へ何も写しません。
  `bridge.sock` は**マシンとして登録するかどうかに関わらず、Linux・macOS のすべての `soda serve` が置きます**。繋がった接続は token なしで全 pane を操作できるので、
  **同じ OS 利用者の権限で動くプロセスは信頼する前提**です（herdr と同じ。同じ利用者は `sodactl` が保存したログインの Cookie・`handoff.sock` でも既に操作できます）。
  別の OS 利用者・別のマシン・ブラウザからは繋げません（それらを締め出すのは従来どおり token です）。
- 1 本の SSH の上に、ブラウザの画面の接続・サイドバーの軽い接続・`sodactl` の接続を多重化します。各接続はリモートの `soda serve` にとって今までの `/ws` の
  1 接続と同じです。手元の `/ws?machine=` は手元のログイン（Cookie）を必ず通してから中継します（ログアウトすると中継の接続も閉じます）。
- リモートから来るものは信用しません（枠の形・大きさ・同時に開く数・最初の応答の形と時間を確かめ、外れたらその SSH を切ります）。
- 中継は中身（要求・入力）を解釈しません。端末の大きさ・pane に溜まる入力の上限（`docs/sodactl.md`「サーバ側の上限」）を判定するのは**リモートの `soda serve`** で、
  リモートの `bridge.sock` の各接続も今までの `/ws` と同じ判定を通ります。上限の無い古い版の `soda serve` をリモートにすると、そのマシンでは効きません。

## 準備

1. **リモートのマシンで `soda serve` を起動しておきます**（名前付き session も使えます）。`soda` がリモートの非対話の SSH の `PATH` から見つかる必要があります
   （`ssh <宛先> soda --help` で確かめられます。nvm 等で入れた場合は `.bashrc` の先頭〔非対話なら return する行より前〕で `PATH` を通してください）。
   **リモートの `soda serve` は既定の状態ディレクトリで動かしてください**——裏の接続は `soda bridge [--session <名前>]` だけを送り `--state-dir` を渡さないので、
   リモートで `soda serve --state-dir …` や、対話シェルでだけ設定した `XDG_STATE_HOME` を使っていると `bridge.sock` が見つからず「soda serve が動いていません」の要対応になります。
2. **ふだんの SSH で繋がることを確かめます**: `ssh <宛先>`。裏の接続は `BatchMode=yes`（パスワード・パスフレーズ・ホスト鍵の確認を聞かない）なので、
   - 未知のホスト鍵は、先に一度 `ssh <宛先>` で確かめて受け入れておきます（soda は `StrictHostKeyChecking` を上書きしません。`~/.ssh/config` の設定のまま）。
   - パスフレーズつきの鍵は `ssh-add` で ssh-agent に入れておきます。
   - 宛先は `~/.ssh/config` の `Host` 名・`user@host`・`ssh://user@host:port` が使えます。

## 登録する（`soda machine`）

```sh
soda machine add build-box --label "Build"              # リモートの既定の session
soda machine add ssh://me@gpu:2222 --label GPU --remote-session agents
soda machine list            # id・名前・宛先・session・有効か（--json も）
soda machine rename <id> --label "Build (old)"
soda machine disable <id>    # 接続を閉じる（登録は残す）
soda machine enable <id>
soda machine remove <id>     # 登録を消す（リモートは動いたまま）
```

- `add` は保存の前に実際に SSH で `soda bridge` まで繋ぎ、リモートの `soda serve` が応えることを確かめます。だめなら保存せず、理由と次の手を出して終了コード 1 で終わります。
- 名前の変更・無効化・削除は id で指します（`soda machine list` で確かめます）。名前は `local`（手元の予約名）・ほかのマシンの名前や id と同じものにできません。
- 登録簿は状態ディレクトリの根の `machines.json`（権限 0600）で、名前付き session どうしで共有します。`--state-dir` は根を指します（`soda session list` と同じ）。
- 動いている手元の `soda serve` は 1〜2 秒で変化に気づきます（再起動は要りません）。名前の変更では繋ぎ直しません。
- 同時に別の端末で `soda machine` を打つと、後から書いた方が勝ちます（排他はしません）。

## ブラウザで使う

- マシンを 1 台でも有効にすると、サイドバーの spaces がマシンごとのまとまりになります（ローカルが先頭、登録の順）。見出しに名前と状態（接続中・接続済み・再接続中・要対応）が出ます。
- **選んでいるマシン**のまとまりには今までの workspace の行（グループ・worktree グループ・「グループなし」・並べ替え・右クリックのメニュー）が出ます。ほかのマシンには workspace の名前とエージェントの状態の印だけが出ます。
- ほかのマシンの workspace（または見出し）を押すと、画面がそのマシンに切り替わります。見出しの `▾`/`▸` はまとまりを畳む・開くだけで、切り替えません。
- 選んでいないマシンは画面の中身（pane の出力）を流さず、workspace とエージェントの状態だけを受け取ります。
- 切れたマシンは最後の状態を薄く出し、選べません。選んでいるマシンが切れたら、画面は最後の中身のまま入力を止め（「再接続中…」）、繋がり次第戻ります。
- 選んでいるマシンを無効化・削除すると、ローカルへ戻ります。
- キー操作・新しい workspace・右クリックのメニュー等は、いま選んでいるマシンに対して働きます。session の切り替え（名前付き session）はローカルを選んでいる間だけです。

## `sodactl` から使う

```sh
sodactl --machine GPU agent list
sodactl --machine GPU agent prompt reviewer "今の差分をレビューして" --wait
sodactl --machine <id> pane read 3f2a9c10          # pane の id は先頭 4 文字以上の部分でもよい
```

- `--machine <名前|id>` はコマンドの前に置きます（`login`・`skill` 以外の全コマンド）。手元の `soda serve` の `/ws?machine=` を通すので、**手元の `soda serve` が動いていて、そのマシンが繋がっている**必要があります。
- id（pane・workspace・エージェントの名前）はマシンごとに別です（pane・tab・workspace の id は UUID で、先頭 4 文字以上の一意な部分でも指せます）。そのマシンの `snapshot`・`agent list` で調べた id を使ってください。
- 登録に無い・無効・名前が曖昧なら `machine_not_found`、繋がっていないなら `machine_unavailable`（どちらも終了コード 1）。ローカルへ黙って送ることはありません。
- `--machine` のときは、pane の中から呼んだときの自分の pane の歯止め（`self_target`）は効きません（`--machine local` は手元そのものなので効きます）。

## 連携のグラフで使う

グラフ画面（`docs/agent-graph.md`）の「pane を載せる」に登録したマシンの pane が出て、手元の pane と線で結べます（`sodactl graph link add 3f2a9c10 GPU:<pane の完全な id>` のように
`<名前>:<pane の完全な id>` でも。別のマシンの pane は部分指定できません）。

- 手元の `soda serve` が、グラフに載っているマシンにだけ接続を張って線を動かします（ブラウザを閉じても動きます）。
- マシンが繋がっていない間の線は見送られ（履歴に `machine_unavailable`）、繋がり直しても後から送りません。
- pane の id は UUID で再利用されないので、別のマシンが状態を消して始め直しても、載せたノードが別の pane を指すことはありません（pane が無くなったノードは線が動かず、
  `docs/agent-graph.md`「pane が無くなったノードと選び直し」のとおり選び直すか外します）。
- 監督役への知らせの中の「マシン」は監督役から見た名前です。別のマシンの監督役が `sodactl --machine <名前>` で手元の pane を操作できるのは、そのマシンの登録簿に
  手元のマシンを同じ名前で登録しているときだけです。

- サブエージェントの件数・一覧（`docs/agent-graph.md`「サブエージェントの件数と一覧」）は、別のマシンのノードにも出ます。**フックの導入と更新は、そのマシンの `soda` の設定画面で行います**
  （手元からは、別のマシンのエージェントの設定ファイルを書き換えません。そのマシンに導入していない・古いと、そのマシンのエージェントの件数は出ません）。

## 繋がらないとき

| 見出しの状態 | 意味と次の手                                                                                                                                                                                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 接続中       | 初めての試み（HELLO を待っています。上限 20 秒）。                                                                                                                                                                                                                                                    |
| 再接続中     | 切れたので、1 秒から倍々（最大 2 分）で繋ぎ直しています。1 分以上続いた接続の後の切断だけ、間隔を最初に戻します。黙った接続は 15 秒で確かめ、45 秒応えなければ切ります。                                                                                                                              |
| 要対応       | 利用者の対応が要る失敗です（理由は見出しのツールチップ）。`ssh` が無い・認証・ホスト鍵・リモートに `soda` が無い・リモートで `soda serve` が動いていない・版が合わない（リモートの `soda` が古く `soda bridge` が無い等）。直せば、2 分ごとの試みで自然に繋がります（`soda serve` の再起動は要りません）。 |

- まず `ssh <宛先>` と `ssh <宛先> soda bridge`（リモートで `soda serve` が動いていなければ終了コード 3 と案内を出します）を手で試してください。
  動いていれば、読めない出力（中継の目印と最初の枠）が出て入力を待つので、Ctrl+D（または Ctrl+C）で抜けてください。
- 手元の `soda serve` の `server.log` に、切れた理由（`machine link closed`）が残ります。

## herdr との違い

- herdr はクライアント（TUI）が SSH を持ちます。soda は**手元の `soda serve` が SSH を持ちます**——ブラウザを閉じても接続は保たれ、`sodactl --machine` は手元の `soda serve` を通ります
  （herdr の `--machine` は開いた UI が無くても CLI が自分で SSH を張ります）。
- herdr はリモートへの導入・更新・サーバの起動を承認つきで行います。soda は**行いません**（リモートで `soda serve` を先に起動しておく）。
- herdr は要対応のマシンをクライアントの再起動まで繋ぎ直しません。soda は**最大の間隔（2 分）で繋ぎ直しを続けます**。
- herdr は `StrictHostKeyChecking=yes` を付け、ControlMaster（接続の共有）の設定を自動で足します。soda はどちらもせず（`~/.ssh/config` のまま）、`BatchMode=yes`・`ConnectTimeout=10`・
  `ServerAliveInterval=15`・`ServerAliveCountMax=4` 等を引数で付けるだけです。
- 同じ点: 認証は、どちらもリモートの bridge がリモートのサーバのローカル socket（soda は `bridge.sock`・0600）に繋ぐ形です。

クリップボードの画像の貼り付け（H44。`Ctrl+V` 等）は、ほかのマシンの pane でも使えます。画像はそのマシンの状態ディレクトリ（`clipboard-images/`）に置かれ、
そのマシンのパスが貼られます（リモートの `soda` もこの機能を含む版である必要があります。古い版では「サーバ／マシンの版が古く…」のトーストが出ます）。

pane のプログラムからの質問のフォーム（`sodactl ask`。`docs/sodactl.md`「質問のフォーム」）も、ほかのマシンの pane で使えます。リモートのマシンの pane の中で `sodactl ask` を打つと、
**そのマシンを表示している手元のブラウザ**にダイアログが出ます（画面の接続が既存の中継でリモートの `soda serve` につながっているため）。そのマシンを表示していないブラウザ
（ローカルや別のマシンを表示中）には出ず、表示中のブラウザが無ければ待たずに `unavailable` です。リモートの `soda` もこの機能を含む版である必要があります（古い版では `sodactl ask` が
`not_found` で失敗し、古い画面〔手元の `soda` が古い〕では `unavailable` になります）。画像・音・成果物（`view`）・`edit`/`rank`/`table`（`docs/sodactl.md`「画像・音・コード」「成果物（view）」）では、**ファイルを読むのはリモートの `soda`**（その pane のマシンにあるファイル）で、手元のブラウザへは既存の中継で運ばれます。リモートの `soda` がこの機能を含む版でないと、リモートの pane の `sodactl ask` が送る前に `ask.features` で確かめて `unavailable` にします。質問ごとの自由記述（`comments`。`docs/sodactl.md`「質問ごとの自由記述」）も同じで、リモートの `soda` がそれを含む版でないと、`comments: false`・`comment: false` が効かず（付けない指定の質問にもボタンが出る）、書いた文も結果に届きません（回答は成功し、自由記述だけが落ちます）。リモートのマシンの pane の中の `sodactl ask` は、リモートの `soda serve` のログイン不要の受け口（`pane.sock`。`docs/sodactl.md`「ログイン不要の受け口（pane.sock）」）で動くので、
リモートのマシンでの `sodactl login` は要りません（受け口を持たない古い版のリモートでは、今までどおり `sodactl login` を済ませておく必要があります。pane の環境に token は入りません）。

ファイルのリンクとドロップ（`docs/file-links.md`）も、ほかのマシンの pane で使えます。そのマシンは常に「別のマシン」として扱うので、リンクは
そのマシンのファイルのダウンロードになり、ドロップしたファイルはそのマシンの状態ディレクトリ（`dropped-files/`）に置かれます（こちらもリモートの
`soda` がこの機能を含む版である必要があります。古い版ではパスがリンクにならず、ドロップは同じトーストが出ます）。

## まだできないこと（backlog）

- モバイルの 1 列の画面でのマシンの切り替え（1 列の画面では手元のマシンだけを表示します。今までどおり）。
- ほかのマシンのエージェントの状態の変化を、トースト・OS 通知・音で知らせること（サイドバーの状態の印は変わります）。`prefix+w` のようなキーボードでのマシンをまたぐ移動。
- ほかのマシンの workspace の行のグループ（グループ・worktree グループ・「グループなし」）の表示（ほかのマシンには workspace の名前と状態の印が平らに並ぶだけで、そのマシンのグループは出ません。選んでいるマシンのまとまりだけが、そのマシンのグループ・worktree グループ・「グループなし」で並びます）。
- リモートへの `soda` の自動の導入・更新・`soda serve` の自動の起動。登録せずに 1 回だけ繋ぐ `--remote`。手元の `soda serve` を通さない直接の SSH での `sodactl --machine`。
- Windows のマシンをリモートにすること（`bridge.sock` が Unix ドメイン socket のため）。
- 画面からマシンを登録・変更すること（CLI だけ）。

## 確かめた範囲

- Linux で、偽の `ssh`（引数を記録し、`soda bridge` をこのマシンで実行するスクリプト）を使い、ビルドした `soda` で `soda machine add` → 手元の `soda serve` の接続 →
  `/ws?machine=` 越しの hello・workspace の作成・echo を確かめています（起動確認 `packages/server/dist/machineSmoke.js`）。
- **本物の SSH のサーバ・macOS・手元が Windows の組み合わせは確かめていません。**
