# 決定記録

## D1: この work は、`20261007-soda-extensions` から分けた「拡張の登録と起動」。要件の骨子だけを置き、工程は始めない

- **背景**: `20261007-soda-extensions/decisions.md` D12。依頼は「分ける場合は、最初の 1 つだけ tasks まで書き、残りは要件の骨子だけにする」。
- **決定**: `aidev new ext-host --mode autonomous --depends 20261007-soda-extensions` で起こし、`requirements.md`（骨子）とこの文書だけを置く。`aidev event requirements start` は打たない
  （工程を始めていないので。着手するセッションが打つ）。`dependsOn` により、表示の面が着地するまで着手しない。
- **理由・代替案**: subtask（親の PR に含める）にしない理由は、親の D12。backlog の 1 行にしない理由は、安全の要件と設計の方針の案を、行き先の決まった場所に残すため。
- **影響**: この work の `state.yml` は `current: requirements`・承認なしのまま。`aidev status` に未着手の work として出る。

## D2: 設計の方針の案（確定は、この work の design。利用者に確かめる点は `requirements.md` の末尾）

`20261007-soda-extensions/research.md` の追補 R9 を読んだうえでの、勧める案。**決定ではない**。

### 登録

- 利用者の設定: `<状態ディレクトリ>/extensions.json`（名前付き session では session ごと）。`commands.json` と同じ読み方
  （`packages/server/src/commands/commandConfig.ts` の `loadCommandsFile` の型: `O_NOFOLLOW|O_NONBLOCK`・開いた fd の fstat で通常ファイル・持ち主・ほかの利用者が書けないこと・64 KiB・zod の `strictObject`・1 つでも規則外なら全体を採らない）。
- プロジェクトの設定: `<リポジトリの根>/.soda/extensions.json`。根は `findGitRoot(Workspace.cwd)`（`packages/server/src/session/workspaceLabel.ts`。worktree ごとの根）。
  持ち主・権限の検査は、**通常ファイルであること・リンクでないこと・大きさ**だけにする（clone したファイルの権限は様々。守りは承認）。根の外を指すリンクは読まない。
- 1 件の形（案）: `{ "id": "<COMMAND_ID_RE と同じ規則>", "command": "<シェルに渡す 1 行>", "description"?: "<200 文字>", "onUnresponsive"?: "pass" | "block" }`。
  `command` は `/bin/sh -c`（Windows は `%ComSpec% /d /s /c`。`commandArgv` と同じ）。上限は、利用者 16 件・プロジェクトごと 16 件・動かす合計 32。

### 承認

- 鍵: `sha256( JSON.stringify({ root: realpath(根), entry: 正規化した 1 件 }) )`。1 件ごと（1 つ変えても、ほかは承認のまま）。
- 記録: `<状態ディレクトリの根>/extension-approvals.json`（`writeFileAtomic`・0600）。`{ approvals: [{ key, root, id, approvedAt }] }`。上限 256 件（古いものから捨てる）。
- 流れ: 設定を読む（workspace が開いた・読み直しの操作・サーバの起動）→ 鍵が記録に無いものは「承認待ち」→ 画面に知らせ（トーストと、設定画面の節「拡張」の印）→ 利用者が開いて、中身を見て承認／承認しない。
  承認しないものは、同じ鍵の間は聞き直さない（「承認しない」も記録する）。
- 承認の RPC（`extension.approve {key}`）は、**サーバが今読んで計算した鍵と一致するときだけ**受ける（画面が見せた中身と、動かす中身を一致させる。画面は鍵を作らない）。
  画面の種類（`desktop`・`mobile`）の接続だけが呼べる。`pane.sock` には載せない。
- 承認の画面: ask のダイアログと同じく、ほかのダイアログを潰さない別の `<dialog>`。コマンドは `<pre>` に `textContent`。

### プロセス

- 持ち主は 1 つ（`ExtensionHost`）。手本は `packages/server/src/machine/MachineLink.ts`・`MachineManager.ts`（`stdio: ["pipe","pipe","pipe"]`・stderr は上限つきでログへ・`SIGTERM` → 2 秒 → `SIGKILL`・終了を待つ・バックオフ 1 秒〜120 秒）。
- 起動は `listen()` の中（状態ディレクトリのロックの後。二重起動で 2 つ動かさない）。停止は `close()` で、端末を捨てる前。handoff は `pausePollers` で止めて待ち、新しい版の `listen()` が起動し直す。
- 作業ディレクトリ: プロジェクトの拡張はリポジトリの根、利用者の拡張はサーバを起動した場所。環境変数: `buildPaneEnv` の規則＋`SODA_EXTENSION_ID`・`SODA_EXTENSION_SCOPE`（`user`｜`project`）・`SODA_PROJECT_ROOT`（`PANE_ENV_DROPPED` にも足す）。`SODA_PANE_ID` は入れない。
- 続けて落ちる（1 分に 5 回）→ 止めて、画面に知らせ。設定の読み直しか、設定画面の［起動し直す］で戻す。

### NDJSON（標準入出力）

- 行の決まりは、表示の面の `DisplayLine` と同じ（1 行 1 JSON・`type` は `<層>.<種類>`・知らない `type` と項目は無視）。
- サーバ → 拡張の最初の行: `{"type":"ext.hello","v":1,"extension":{"id","scope","projectRoot"?},"features":[…],"limits":{…}}`。
- 拡張 → サーバ: `{"id":<数か文字列>,"method":"display.set","params":{"paneId",…}}`。返事: `{"id":…,"result":…}` か `{"id":…,"error":{"code","message"}}`。知らない `method` は `error.code: "unsupported"`（D1 の「未対応」。切らない）。
  操作の名前と引数は、`/ws` の `display.*`（`paneId` つき）と同じ schema を使う。
- サーバ → 拡張の出来事: `display.action`・`display.closed`（表示の面の `DisplayEvent` そのまま）、`ext.panes`（pane の増減。id・名前・workspace・cwd・エージェントの種類）。観測・割り込みは、後の作業が `type` を足す。
- 上限（案）: 1 行 1 MiB・要求は毎秒 50・サーバが拡張へ溜める出来事 256（あふれたら古いものを捨てて `ext.dropped`）・書き込みが 30 秒詰まったら止めて起動し直す。

### 脅威と対策（案）

| 脅威 | 対策 |
|---|---|
| clone しただけで、リポジトリの拡張が動く | 承認の前は実行しない。承認は 1 件ごと・画面からだけ・既定は［承認しない］ |
| 承認の後に、登録が書き換わる（`git pull`・攻撃者の PR） | 鍵に中身を含める。変われば止めて再承認。差分を見せる |
| 承認した登録が指すスクリプトの中身だけが変わる | **防げない**（鍵に含めない案のとき）。承認の画面と docs に書く。利用者に確かめる点 1 |
| 承認の画面の表示と、動く中身が違う（検査と実行の間の差し替え） | サーバが読んだバイト列で鍵を作り、その解釈で起動する。承認の RPC は鍵の一致を確かめる |
| pane の中のプログラム（エージェント）が、自分で承認する | 承認の RPC は `pane.sock` に無く、画面の種類の接続だけ。ただし、`sodactl login` 済みの環境では、pane のプログラムは元から何でも実行できる（守る対象ではない） |
| リンク・`..` で、リポジトリの外の設定を読ませる | 根の実体のパスの下にある通常ファイルだけ。`O_NOFOLLOW` |
| 承認の画面を、コマンドの見た目でだます（長い空白・制御文字・似た文字） | 文字として全文を出す・制御文字は登録の検査で拒否・折り返して省略しない・長さの上限 4096 |
| 拡張が暴走する（大量の行・読まない・落ち続ける） | 行と頻度の上限・溜める数の上限・バックオフ・続けて落ちたら止める |
| 拡張が、ほかのリポジトリの pane に面を出す | プロジェクトの拡張は、そのリポジトリの workspace の pane だけ（利用者に確かめる点 2） |
| 拡張のプロセスが、利用者の権限で何でもする | **隔離しない**（D3 で受け入れた）。承認の画面の固定の文言・docs。利用者の設定の拡張は、利用者が自分で書いたものとして信頼する |
| handoff・停止で、子プロセスが置き去りになる | 止めて終了を待つ（ssh と同じ型）。起動確認（smoke）で見る |
| 設定の中の秘密（コマンドに書いた token）が、ログ・ほかの画面へ出る | ログには id だけ。コマンドの全文を出すのは、承認の画面（プロジェクトの分）と、設定画面の一覧（ログイン済みの画面）だけ。利用者の設定の分のコマンドは、画面へ送らない（`commands.json` と同じ） |
