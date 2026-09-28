# 独自コマンド（`commands.json`）

よく使うコマンドを、ブラウザのキー 1 つで走らせる仕組み（herdr の `[[keys.command]]` に当たる。20260927-custom-command-keys）。

- **コマンドはサーバの設定ファイルにだけ書く**。ブラウザは書かれたコマンドを id で呼ぶだけで、コマンドの文字列はブラウザへも送らず、
  ブラウザからも受け取らない（ブラウザの不具合・盗まれた Cookie が「サーバで任意のコマンドを走らせる口」にならないように）。
- **キーはブラウザの設定画面で割り当てる**（`prefix+s` の節「キー」の群「独自コマンド」。ブラウザごと。既定のキーは無い）。

## 置き場所

`soda serve` の状態ディレクトリの `commands.json`。

| 起動の仕方 | ファイル |
|---|---|
| 既定（Linux・macOS） | `${XDG_STATE_HOME:-~/.local/state}/sodashitsu/commands.json` |
| 既定（Windows ネイティブ） | `%LOCALAPPDATA%\sodashitsu\commands.json` |
| `--state-dir <dir>` | `<dir>/commands.json` |
| 名前付き session（`--session work`・`SODA_SESSION=work`） | `<状態ディレクトリ>/sessions/work/commands.json`（session ごとに別のファイル） |

ファイルが無ければ独自コマンドは 0 件（エラーではない）。

## 書き方

```json
{
  "commands": [
    { "id": "lazygit", "type": "popup", "command": "lazygit", "description": "lazygit を開く", "width": "80%", "height": "80%" },
    { "id": "scratch", "type": "popup", "command": "exec \"${SHELL:-sh}\"", "description": "使い捨てのシェル" },
    { "id": "htop", "type": "pane", "command": "htop" },
    { "id": "build", "type": "shell", "command": "make -C \"$SODA_ACTIVE_PANE_CWD\" > /tmp/soda-build.log 2>&1", "description": "裏でビルド" },
    { "id": "touch-ok", "type": "shell", "command": "touch /tmp/soda-cmd-ok" }
  ]
}
```

| 項目 | 必須 | 内容 |
|---|---|---|
| `id` | ○ | 小文字・数字・`-`・`_` の 1〜64 文字（先頭は小文字か数字）。**ブラウザのキーの割り当てはこの id に結びつく**ので、変えると割り当てが外れる |
| `type` | ○ | `popup`・`pane`・`shell`（下の表） |
| `command` | ○ | シェルに渡す文字列（1〜4,096 文字。改行は使えるが、ほかの制御文字は使えない） |
| `description` | | キー一覧・設定画面に出す名前（1〜200 文字）。無ければ `id` |
| `width`・`height` | | `popup` だけ。セル数（1〜1,000 の整数）か `"80%"`（pane の領域の割合）。省略は半分 |

| `type` | 動き |
|---|---|
| `popup` | tab のレイアウトを変えずに、そのブラウザの画面に浮いた端末を開く。**コマンドが終わるまで、Esc・Tab・prefix を含む全てのキーが popup に届く**（閉じるにはコマンドを終える。例：lazygit の `q`・シェルの `exit`）。見出しの × ボタン（マウス）でも閉じられる（コマンドを止める）。1 つのブラウザで同時に 1 つ。0 以外の終了コードで終わると知らせが出る |
| `pane` | フォーカス中の pane を分割した新しい pane で拡大表示して走らせ、終わると閉じて元の pane・拡大表示の状態へ戻る（`prefix+e` と同じ） |
| `shell` | 入出力を捨てて裏で走らせる。結果は知らせない（「走らせました」とだけ出る）。同時に 16 本まで |

コマンドは Unix で `/bin/sh -c '<command>'`（`shell` はログインシェルの `/bin/sh -lc`）、Windows ネイティブで
`%ComSpec% /d /s /c "<command>"` として走る（Windows では環境変数は `%VAR%` の書き方）。作業場所はフォーカス中の pane の場所（無い・
ディレクトリでなければ `soda serve` を起動した場所）。
Windows で対話の pane のシェルに差し込む場所の知らせ（設定「シェルの場所を追う（Windows）」）は、`pane` の種類の pane には差し込まない
（コマンドの引数の意味が変わるため）。その pane の場所は、コマンドが自分で OSC 7・OSC 9;9 を出さない限り開いた場所のまま（今までどおり）。

### コマンドに渡す環境変数

pane と同じ環境（`soda serve` の環境から `SODACTL_TOKEN`・`SODACTL_URL` を落とし、`SODA_SERVER_URL`・名前付き session の `SODA_SESSION`・公式フック連携の
`SODA_AGENT_REPORT_SOCKET` などを足したもの）に、次を足す。

| 変数 | 値 |
|---|---|
| `SODA_ACTIVE_WORKSPACE_ID`・`SODA_ACTIVE_TAB_ID`・`SODA_ACTIVE_PANE_ID` | 走らせたときにフォーカスしていた workspace・tab・pane の id |
| `SODA_ACTIVE_PANE_CWD` | その pane の場所 |
| `SODA_COMMAND_ID` | 走らせたコマンドの `id` |
| `SODA_PANE_ID` | `pane` の種類だけ（その新しい pane の id）。`popup`・`shell` には入らない（herdr と同じ） |

## 読み込みと読み直し

- `soda serve` の起動時に読む。書き換えたら**ブラウザで「設定を読み直す」（既定 `prefix+shift+r`）**を押すとサーバが読み直し、
  全てのブラウザの一覧が新しくなる。
- **1 つでも規則に合わない所があるとファイル全体を採らない**（独自コマンドは 0 件になる。読み直しでは前の一覧も捨てる）。理由は
  サーバのログ（`server.log`）・設定画面の群「独自コマンド」・読み直しのトーストに出る（コマンドの文字列は理由に入れない）。
  上限：ファイル 64 KiB・100 件。

## 安全

- **ファイルは本人だけが書ける形に**（`chmod 600 commands.json`）。Linux・macOS では、シンボリックリンク・通常のファイルでない・
  `soda serve` を動かしているユーザー以外の持ち物・グループかその他が書き込める（`chmod g+w`/`o+w`）、のどれかなら採らない
  （他人がコマンドを差し込めるため）。グループかその他が読めるだけなら採るが、ログに警告を出す（トークンを書く人がいるため）。
- **Windows ネイティブでは持ち主・権限を検査しない**（依存無しに ACL を読む手段が無い）。状態ディレクトリが利用者ごとの
  `%LOCALAPPDATA%` の下にあることに頼る。`--state-dir` で共有の場所を指すときは、そのフォルダの権限を自分で絞る。
- コマンドの文字列はそのままシェルに渡す（書いた人の意図どおり）。ブラウザから来る値（pane の id 等）は文字列に差し込まない。
  環境変数の値はサーバが持つ workspace・tab・pane の情報から作る。
- 走らせる要求は、ログインした WebSocket の接続からだけ届く。ログにはコマンドの文字列を書かない（id・種類・接続・pane だけ）。

## 制約（herdr との違いは `docs/herdr-parity.md` の H12）

- popup は開いたブラウザだけに出る。そのブラウザが切断・再読み込みすると popup のコマンドは止まる。ウィンドウの大きさを変えても
  popup の端末の大きさは変わらない。
- `pane` の種類の pane はサーバを再起動すると普通のシェルの pane として戻る。更新時の引き継ぎ（`soda handoff`）の後は、閉じても元の
  pane・拡大表示には戻らない。
- `plugin_action`（herdr のプラグインの操作）は無い。
- Windows ネイティブでの起動は実機で確かめていない（`popup`・`pane` は node-pty に 1 本のコマンドライン `/d /s /c "<command>"` として渡し、node-pty が引用し直さないことだけを単体テストで確かめている）。
