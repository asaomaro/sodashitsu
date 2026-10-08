# 拡張（`extensions.json`）

設定に登録した別プロセスのプログラム（**拡張**）を、Sodashitsu（`soda`）が起動・停止し、標準入出力の **NDJSON**（1 行 1 JSON）でやり取りする仕組み（20261007-ext-host）。
拡張は、pane の画面（パネル・帯）に表示を出し、その表示への利用者の操作を受け取れる。サーバの中で拡張の JS を動かすのではなく、**別のプロセス**として動かす。

- 登録できるのは、サーバの持ち主（`soda` を動かす OS の利用者）だけ。登録は設定ファイルへ書く。ブラウザから拡張のコマンドを渡す口は無い。
- 拡張は**隔離されない**（利用者の権限で動く。下の「安全と限界」）。登録したものは、利用者が自分で実行するのと同じ。
- この版は、**利用者の設定**だけを読む。リポジトリの中の設定（`.soda/extensions.json`）は、読まない（何も起きない）。設定の画面も、この版には無い（状態は `sodactl ext`）。

## 拡張とは

- `soda` が起動するプログラム 1 つ。起動した時点から、標準入力に `soda` からの行（挨拶・pane の一覧・出来事）が届き、標準出力へ要求の行を書く。標準エラーは記録される（`sodactl ext log`）。
- `soda` の起動に合わせて動き、サーバを止める・入れ替える（`soda handoff`）と止まる。落ちたら、間隔を置いて起動し直す（1・2・4・8 秒。続けて 5 回で止める）。
- できること（この版）: pane に表示の面（パネル・帯。形式は `text`・`markdown`・`html`。`allow` があれば `script-html` も）を出す・閉じる・一覧する、操作の値を受け取る、pane の一覧を知る。
  表示の面そのものは `docs/display.md`。

## 置き場所と書き方

`soda serve` の状態ディレクトリの `extensions.json`（`soda` を動かす利用者が書く）。

| 起動の仕方 | ファイル |
|---|---|
| 既定（Linux・macOS） | `${XDG_STATE_HOME:-~/.local/state}/sodashitsu/extensions.json` |
| 既定（Windows ネイティブ） | `%LOCALAPPDATA%\sodashitsu\extensions.json` |
| `--state-dir <dir>` | `<dir>/extensions.json` |
| 名前付き session（`--session work`） | `<状態ディレクトリ>/sessions/work/extensions.json`（session ごとに別のファイル。拡張も session ごとに 1 つずつ動く） |

```json
{
  "extensions": [
    {
      "id": "hello",
      "command": "node /home/me/soda-ext/hello.mjs",
      "description": "pane の上に、あいさつの帯を出す",
      "enabled": true,
      "allow": [],
      "onUnresponsive": "pass",
      "cwd": "/home/me/soda-ext"
    }
  ]
}
```

| 項目 | 必須 | 内容 |
|---|---|---|
| `id` | ○ | 小文字・数字・`-`・`_` の 1〜64 文字（先頭は小文字か数字）。ファイルの中で重複しない |
| `command` | ○ | シェル（`/bin/sh -c`。Windows は `%ComSpec% /d /s /c`）に渡す 1〜1024 文字。前後の空白は不可。制御文字・書字方向の制御・幅の無い文字・U+0020 以外の空白などは不可 |
| `description` | | 0〜200 文字。同じ文字の制限 |
| `enabled` | | 既定 `true`。`false` なら起動しない（`disabled`） |
| `allow` | | 許可の一覧。いまの値は `"script-html"` だけ（重複・知らない値は誤り）。既定は空 |
| `onUnresponsive` | | `"pass"`（既定）か `"block"`。いまは記録だけで、動きは変わらない（後の層のため） |
| `cwd` | | 絶対パス（1〜1024 文字）。既定はホームディレクトリ |

- ファイルが無ければ 0 件（誤りではない）。**1 つでも規則の外なら、そのファイルの拡張は 1 つも採らない**（動いていたものも止まる）。誤りは `sodactl ext list` の `problems` に出る（誤りの文に、書いた値〔コマンドなど〕は入れない）。
- 1 つのファイルは 16 件まで・64 KiB まで。同時に動かす拡張は合計 32 まで（超えた分は `over_limit`）。
- 持ち主が自分でない・グループかその他が書き込める・シンボリックリンク・通常のファイルでないものは読まない（`commands.json` と同じ）。
- 設定は、サーバが起動するときと `sodactl ext reload` のときに読む。変わった拡張だけを入れ替える（中身が同じなら、動き続ける）。
- `soda` を動かす環境変数（API の鍵など）は、拡張にも渡る。渡さないのは、`SODACTL_TOKEN`・`SODACTL_URL`・`SODA_PANE_ID`・`SODA_SERVER_URL`・`SODA_PANE_SOCKET`・`SODA_AGENT_REPORT_SOCKET`・`SODA_SESSION` など。
  足すのは `SODA_EXTENSION_ID`・`SODA_EXTENSION_SCOPE`（`user`）・`SODA_EXTENSION_RUN_ID`（起動 1 回ごとの UUID）。
- **コマンドに秘密（token・パスワード）を書かない**。シェルの誤りの文として、コマンドの断片が標準エラーの記録に出うる。

## やり取り（1 行 1 JSON）

- 1 行 = 1 つの JSON。UTF-8。改行は `\n`（`\r\n` の `\r` は除く）。空の行は無視する。
- **サーバ → 拡張**の行は `type`（`<層>.<種類>`）を持つ。**読み手は、知らない `type` の行・知らない項目を無視する**（後の版で増える）。項目の意味は変わらない。
- **拡張 → サーバ**の行は要求: `{"id": 1, "method": "display.set", "params": {…}}`。`id`（数か 1〜64 文字の文字列）を付ければ、同じ `id` の `ext.result` が返る。**`id` を省くと、返事は来ない**（誤りのときも）。`method` は 1〜64 文字。知らない項目は無視する。
- 標準出力に書く 1 行は 4 MiB まで（超えた行は捨てられ、`ext.error` が返る）。続けて壊れた行（JSON でない・形が合わない・4 MiB 超・UTF-8 でない）が 20 になると、拡張は止められる（起動し直しの回数に入る）。

### サーバ → 拡張の行

| `type` | 中身 |
|---|---|
| `ext.hello` | 起動の直後に 1 回。`v`（1）・`runId`・`extension`（`id`・`scope`）・`allow`・`onUnresponsive`・`methods`（呼べる操作）・`events`（届く `type`）・`display`（`features`・`scriptEnabled`・`limits`）・`limits`（行の大きさ・頻度・面の数など） |
| `ext.panes` | pane の一覧 `panes: [{ id, label, workspaceId, workspaceLabel, workspaceCwd, agent }]`。hello の次に 1 回、以後は変わったとき（まとめて 100ms〜500ms） |
| `ext.result` | 要求への返事。`{ id, ok: true, result }` か `{ id, ok: false, error: { code, message } }` |
| `ext.error` | どの要求にも結び付かない誤り。`code` は `bad_line`・`line_too_long`・`bad_request` |
| `ext.dropped` | 書き込みが詰まって、出来事を `count` 件捨てた |
| `display.action` | 利用者が拡張の面を操作した（`paneId`・`name`・`rev`・`action`・`data`・`at`・`source`〔`static`｜`script`〕）。**その拡張にだけ届く**（pane の `display wait` には返らない） |
| `display.closed` | 拡張の面が閉じた。`reason` は表示の面の `closed`・`dismissed`・`expired`・`navigated`・`focus_steal`・`unresponsive`・`script_disabled` に、`pane_closed`（pane が閉じた）と `out_of_scope`（pane が範囲の外へ出た）が加わる |

## 操作と出来事の一覧

| `method` | `params` | 結果 | 備考 |
|---|---|---|---|
| `ext.features` | `{}` | `{ methods, events, display, limits }` | `display` は `display.features` と同じ（`allow` で絞ったもの） |
| `ext.panes` | `{}` | `{ panes }` | いまの pane の一覧 |
| `display.set` | `{ paneId, name, kind, format, content, title?, size?, ttlMs? }` | `{ display, renderers, epoch, next }` | `sodactl display set` と同じ規則。`next` は拡張では意味を持たない。同じ名前なら置き換え |
| `display.close` | `{ paneId, name }` か `{ paneId, all: true }` | `{ closed: [名前] }` | **自分の面だけ** |
| `display.list` | `{ paneId }` | `{ displays }` | **自分の面だけ** |
| `display.features` | `{}` | 機能と上限 | `allow` に `script-html` が無ければ、`format:script-html`・`send` を除き、`scriptEnabled` は `false` |
| `display.send` | `{ paneId, name, data }` | `{ delivered }` | `script-html` の面へデータを送る。`allow` に `script-html` がある拡張だけ（無ければ `unsupported`）。自分の面だけ |
| `display.wait` ほか | | `unsupported` | 待たせる操作は無い（出来事は行で届く） |

- 誤りの `code`: `unsupported`（知らない操作・許可が無い）・`invalid_params`・`not_found`（pane が無い）・`invalid_display`・`display_limit`・`display_busy`・`display_script_disabled`・`display_closed`・`internal`。
- **面の持ち主は、その起動の拡張**。ほかの面（pane のプログラムが出した面・ほかの拡張の面）は、`list` に出ず、`close`・`send` できず、同じ名前の `set` は `invalid_display`。
  逆に、pane のプログラム（`sodactl display`）は、拡張の面を**閉じられる・同じ名前で出し直せる**（出し直すと、拡張に `display.closed` が届く）。拡張の面のスクリプトへデータは**送れない**。
- 拡張が止まる・落ちると、その起動が出した面は全部閉じる（pane のプログラムが出した面は残る）。
- 面は、画面の固定のラベルに「拡張『<id>』の表示（利用者・隔離）」と出る。

### `script-html`（スクリプトが動く面）を出せる条件

次の**両方**が要る。

1. 登録の `allow` に `"script-html"` がある（無ければ、`set`・`send` は `unsupported`）。
2. サーバの設定「スクリプトが動く表示」が有効（既定は無効。無効なら `display_script_disabled`）。設定を見るのは表示の面の台帳で、拡張が設定を読む・変える口はない。

設定が有効 → 無効に変わると、拡張の `script-html` の面も閉じ、`display.closed`（`script_disabled`）が届く。`ext.hello.display.scriptEnabled` は起動した時点の値、`ext.features` はいまの値。

## 上限

| 項目 | 値 |
|---|---|
| 拡張 → サーバの 1 行 | 4 MiB |
| 要求の頻度 | 毎秒 50（続けて 100）。超えたら**読むのを待つ**（捨てない） |
| 標準出力の量 | 拡張ごとに毎秒 2 MiB（続けて 8 MiB）、全部の拡張で毎秒 8 MiB（続けて 16 MiB） |
| 続けて壊れた行 | 20 で止める |
| サーバ → 拡張の列 | 512 行・8 MiB（出来事は古いものから捨てて `ext.dropped`。捨てられない行が入らない・30 秒書けないと止める） |
| 1 つの拡張の面 | 16 面・中身の合計 8 MiB（pane のプログラムの分と合わせて、サーバ全体の面の上限〔64 面・32 MiB〕にも数える） |
| 1 つのファイル | 16 件・64 KiB |
| 同時に動かす拡張 | 32 |
| 標準エラーの記録 | 新しい 200 行・1 行 4 KiB |
| 落ちた後の起動し直し | 1・2・4・8 秒。続けて 5 回で `failed`（60 秒動いたら数え直す） |
| 止める | 標準入力を閉じるのと**同時に**、グループへ SIGTERM を送る。2 秒たっても残っていれば SIGKILL。待つのは 3 秒まで |

## 見本

`docs/examples/extension-hello.mjs`（Node。依存なし）。pane ごとに、あいさつの帯 `hello` を 1 つ出す。

```js
#!/usr/bin/env node
// pane ごとに、あいさつの帯を 1 つ出す、最小の拡張。
import { createInterface } from "node:readline";

const call = (method, params) => process.stdout.write(JSON.stringify({ method, params }) + "\n"); // id を省くと、返事は来ない
const lines = createInterface({ input: process.stdin });

lines.on("line", (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type === "ext.panes") {
    for (const pane of msg.panes) {
      call("display.set", { paneId: pane.id, name: "hello", kind: "band", format: "text", content: `こんにちは、${pane.workspaceLabel}` });
    }
  }
  // 知らない type の行は、無視する（後の版で増える）
});
lines.on("close", () => process.exit(0)); // 標準入力が閉じたら終わる（決まり）
process.on("SIGTERM", () => process.exit(0)); // 止めるとき、soda は標準入力を閉じるのと同時に SIGTERM も送る（2 秒後に SIGKILL）。後始末はここでも
```

登録:

```json
{ "extensions": [ { "id": "hello", "command": "node /絶対パス/docs/examples/extension-hello.mjs" } ] }
```

`soda` を（再）起動するか、`sodactl ext reload` すると、各 pane に帯が出る。`sodactl ext list` で状態、`sodactl ext log hello` で標準エラーを見る。
**標準入力が閉じたら終わる**のを決まりにする（`soda` が止める・サーバが異常終了したときに、拡張が残らないように）。
**止めるときの順**: `soda` は、標準入力を閉じる（EOF）のと**同時に**、拡張のプロセスのグループへ `SIGTERM` を送り、2 秒たっても残っていれば `SIGKILL` を送る。標準入力の EOF を待って後始末をする拡張は、`SIGTERM` も処理しないと、EOF を読む前に終わらされる。見本は、EOF と `SIGTERM` のどちらでも、終了コード 0 で終わる。

## `sodactl ext`

`/ws`（ログイン済み）の経路だけ。コマンドの形は `docs/sodactl.md`「拡張（`ext`）」。

| コマンド | 内容 |
|---|---|
| `sodactl ext list` | 拡張の一覧（`state`・`failures`・`lastExit`・面の数）と `problems`。コマンドの文字列は出ない |
| `sodactl ext log <id\|key>` | 標準エラーの記録 |
| `sodactl ext reload` | 設定を読み直して差を埋める（`failed`・`exited` を戻す） |
| `sodactl ext restart <id\|key>` | 止めて、回数を 0 にして起動し直す |

承認・取り消し・有効と無効の切り替えのコマンドは無い。

## 安全と限界

- **拡張は隔離されない**。利用者の権限で動くので、ファイルの読み書き・通信・ほかのプログラムの起動・`sodactl`（ログイン済みなら）の利用ができる。登録するのは、自分が信頼するプログラムだけ。
- **設定「スクリプトが動く表示」は、拡張からの守りではない**。拡張は利用者の権限で動くので、状態ディレクトリの認証の情報を読んで `/ws` につなげば、設定を自分で有効にできる（有効になると、すべての画面に知らせが出る）。設定は、不注意を防ぐためのもの。`allow` は、標準入出力から `script-html` を出せる拡張を絞る。
- **冷却の巻き添え**: スクリプトの面がフォーカスを取り続ける・枠を移すと、その pane は 5 分、だれも `script-html` を出せなくなり、そのとき**同じ pane の `script-html` の面は（pane のプログラムのものも、ほかの拡張のものも）全部閉じる**。逆に、pane のプログラムの面が原因で、拡張の面が閉じることもある（持ち主ごとに回数を分けると、持ち主を替えて回数を稼げるため、分けない）。閉じた面の持ち主には、理由つきの `display.closed` が届く。
- **面の名前のぶつかり**: pane のプログラムは、拡張の面と同じ名前で出し直せる・閉じられる。拡張は、自分の面だけを扱える。
- **面の数・頻度は合わせて数える**: 同じ pane の面の数（パネル 4・帯 2）、`set` の頻度は、拡張と pane のプログラムで合わせて数える。片方が上限を使い切れる。
- **設定・無効の記録が読めないとき**: ファイルが読めたが規則の外・壊れている（拒否）なら、そのファイルの拡張は 1 つも動かさない（動いていたものは止まる）。読み込みが**時間切れ・一時の失敗**（遅いディスクなど）のときは、**現状維持**: 動いている拡張は止めず、新しく起動する・落ちた拡張を起動し直すことだけを見送る（その拡張は `sodactl ext list` で `state: "waiting"`、`problems` に理由が出る）。いままでの間隔で読み直し（続けて 3 回まで。以後は `sodactl ext reload` を待つ）、読めれば起動する。これは利用者が登録した拡張だけの話で、読めないまま新しいものを動かすことは無い。設定を一時的に読めない間は、**設定のファイルで `enabled: false` に書き直した拡張も、読めるまで止まらない**（`sodactl ext reload` の結果の `problems` に「設定を読めないので、前の状態のまま」と出る）。画面と `extension.setEnabled` からの無効は、読み込みを待たず、すぐ止まる。
- **標準エラーに秘密が出うる**: 拡張の標準エラーは記録され（200 行）、**ログイン済みのどの接続からも `sodactl ext log`・`extension.log` で読める**。シェルの誤りの文として、コマンドの断片も出うる。標準エラーに秘密を書かない・コマンドに秘密を書かない。端末で見るときの偽装を避けるため、制御文字と書字方向を変える文字は `?` に替えて記録する。
- **面の数・頻度は共有**: 面の数・合計の大きさ・`set` の頻度は、拡張と pane のプログラムで共有する。1 つの拡張は 16 面・8 MiB までだが、複数の拡張で、サーバ全体の上限（64 面・32 MiB）を使い切れる。
- **サーバの入れ替え（`soda handoff`。execve）**: 入れ替えの前に、拡張と孫を止めてから置き換わる。止め損ねた子の標準入力が、置き換わった後に閉じる経路（パイプが close-on-exec であること）は、**未確認**（止めて待つので通常は通らない）。
- **環境変数は見える**: 落とす一覧に無い変数（API の鍵など）は、拡張に渡る。
- **標準入力が閉じたら終わる**決まり。`soda` が異常終了（SIGKILL・クラッシュ）すると、拡張が残りうる。標準入力が閉じるので、見本のように終わる作りにする。次の起動で、同じ拡張が 2 つ動くことがある。
- **孫プロセス**: 拡張は新しいプロセスのグループで起動し、止めるときはグループごと止める（子が終わった後に残った孫も掃く）。**自分でグループ・セッションを抜けた孫（`setsid` など）は、止められない**。
- 子が `exit` しても、読み残しを 200 ミリ秒だけ待ってから、標準出力・標準エラーを閉じる。
- 拡張のコマンドが指すファイルの中身は、`soda` は見ない（変えれば、次の起動で変わった動きになる）。

## 新旧の組み合わせ

| sodactl | サーバ | 動き |
|---|---|---|
| 新 | 新 | すべて使える |
| 新 | 旧（拡張を知らない） | `sodactl ext …` は `{"status":"unsupported","reason":"このサーバは拡張に対応していません"}`（終了コード 0） |
| 旧 | 新 | `ext` を知らない（使い方の誤り＝終了コード 2）。拡張は動く |
| 新 | 新（拡張を登録していない） | 一覧は空 |

拡張の面を表示する画面が古い（読み込み直していない）ときは、見出しの `source` を知らないので、固定のラベルは今までの「pane のプログラムの表示（隔離）」のまま。

## Windows

- ネイティブの Windows では、実機で確かめていない。起動は `%ComSpec% /d /s /c "<command>"`、止めるのは `%SystemRoot%\System32\taskkill.exe /pid <pid> /T /F`（絶対パス）。
- **親が先に終わった後の孫は止められない**（pid が再利用されうるので、`taskkill` を動かさない）。
- 結合テスト・起動確認は Windows ではスキップする。
