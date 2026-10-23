# 接続先のスキル・作業先・メモ・会話の引継ぎ

ローカルのClaude Code/Codexを使い、エージェントを導入していない接続先PCで開発できます。既存のmachine接続（SSH・操作委譲）を使います。両側のSodashitsuと操作側のsodactlを、この機能に対応した版へ更新してください。

## 接続先のシェルから操作元のエージェントを起動する

接続先PC（B）のSodashitsuのpaneで実行します。そのワークスペースにはPJフォルダを設定し、Bの`sodactl`もログインしておきます。Claude Code/Codexの導入とログインが必要なのは操作元PC（A）だけです。

```sh
sodactl work agent claude
sodactl work agent claude --resume
sodactl work agent claude --model sonnet --effort high
sodactl work agent codex resume --last
sodactl work agent codex -c 'model_reasoning_effort="high"'
```

AのWebでBを表示していると「操作元のエージェントを起動」が現れます。PC・PJ・引数を確認して「起動」を押すと、Aに新しいワークスペースとpaneを開き、AのCLIを起動します。Bから要求を送っただけでAのプログラムが自動実行されることはありません。最初の作業指示は、開いたエージェントの入力欄に入力してください。

端末版を使う場合は、**Aのシェル**で次を実行します。要求IDはBのコマンドにも表示されます。Aに新しいpaneが作られるので、そのpaneを選んで操作します。

```sh
sodactl --machine <Bのmachine名> work requests
sodactl work accept <Bのmachine名> <要求ID>
```

`sodactl`の`--pane`・`--url`・`--token`はエージェント名の**前**に指定します。その後の引数は配列のままCLIへ渡します。対応するのは対話起動、Claudeの`--resume`/`--continue`/`--fork-session`、Codexの`resume`/`fork`、モデル指定などの対話用オプションです。履歴IDはUUIDを使います。ツール・MCP・作業先・設定ファイル・権限を上書きするオプション、管理サブコマンド、起動時の自由な位置引数は拒否します。Codexの`-c`は`model_reasoning_effort`/`model_verbosity`の定数指定に限ります。要求は10分で期限切れです。両側のSodashitsuとCLIの更新が必要です。

この起動では、AのCLIに専用MCPの`remote_work`を設定し、検索・読み取り・編集・実行・スキル・メモをBのPJへ送ります。Claudeの組込みツール、Codexのローカルshell/画像ツール、既存MCPやプラグイン/フック等をこの起動では無効化します。Codexのシェルはread-only設定も併用します。これらの起動オプションに対応するCLIが必要です（Codexは`--no-daemon`と専用ツール設定に対応する版（0.163.0で実dispatchを検証））。起動を受け付けた作業先の専用MCPだけはCLIのツール許可にも登録します。エージェントは利用者の作業指示に従い、重大な操作は別途確認してください。CLIのログイン設定をBへ移すことはありません。Codexは起動前にfeatures一覧で設定の反映を確認し、必要な設定が無効化できない版では起動を拒否します。同じOSユーザーで動くプログラム同士を隔離するOSサンドボックスを提供するものではありません。

PC・PJはBの起動paneから毎回決まり、PJの実体とmachine接続の世代を固定します。切断やPJ変更時は失敗し、Aのファイルやシェルで代行しません。MCPに渡すのは固定先だけを操作できる一時的な能力で、一般のSodashitsuログインcookieは渡しません。

起動時にBのPJ規約・スキル一覧・`.soda/agent-memory/<Bの起動pane ID>/MEMORY.md`を読み込みます。その他のメモとスキル本文は必要時にMCPから読みます。エージェントに判断・未完了作業・検証手順を同じBのメモへ保存するよう初期指示を渡します。メモの自動要約・完全な保存を保証する機能ではありません。`--resume`はAに残るネイティブ会話履歴を再開する指定で、Bのメモとは別です。履歴のPC/PJへ接続先を自動で切り替えません。

起動中の能力は終了・切断・Aのpane閉鎖・Aのサーバ停止で破棄され、最長24時間です。Aの再起動・更新後は、通常の`claude --resume`等で自動復元せず、Bのpaneから同じコマンドで起動し直します。保存済みのBのメモはそのまま読み込めます。MCPのキャンセル通知またはツール接続の終了時は、その接続から実行中のコマンドへ中断を送ります。ファイル更新等の完了済み操作は元に戻りません。常駐・対話コマンドは従来どおりBのpaneを使ってください。

## 操作元と接続先のファイル転送

`work agent` の専用MCP `remote_work` で、Excel・PDF・画像などを変換せずに双方向転送できます。

```json
{"operation":"transfer","action":"download","sourcePath":"成果物/集計.xlsx","destinationPath":"C:\\Users\\user\\Downloads\\集計.xlsx"}
{"operation":"transfer","action":"upload","sourcePath":"C:\\Users\\user\\Documents\\資料.pdf","destinationPath":"資料/資料.pdf"}
```

`upload` は操作元A→接続先B、`download` はB→Aです。Bのパスは固定されたPJ内の相対パスです。Aのパスは**AのサーバOSから読める**絶対パス、またはエージェント起動フォルダからの相対パスを指定します。AがWSLならWindowsのファイルは `/mnt/c/Users/...` などのパスにします。保存先の親フォルダは事前に用意してください。転送するのは通常ファイル1件、100MiBまでです。リンクを経由するパス、PJ外へのアクセス、既存の保存先への上書きは拒否します。別名で保存してください。

完了時は `{"status":"completed","direction":"download","source":"成果物/集計.xlsx","destination":"/操作元の絶対パス/集計.xlsx","bytes":12345,"sha256":"..."}` を返します。失敗時は `status:"failed"` と要求した保存先 `destination`、理由 `message` を返します。エージェントはこの成否と保存先を利用者に伝えてください。応答が途切れた場合は完了とはみなさず、保存先を確認してから対応します。自動で再転送しません。

64KiBずつ転送し、サイズとSHA-256を照合したファイルを保存先に公開します。中断した一時ファイルは最大約1分の無通信後に片付けます（サーバの強制終了時の残骸は除く）。既に開いているエージェントは更新後に起動し直してください。操作元のファイルを扱うのは明示した転送だけで、開発操作は引き続き接続先で行います。転送に使えるのは操作元**サーバ**のファイルであり、別PCのブラウザのダウンロードやファイル選択ダイアログではありません。

## 操作元への質問フォームと接続先資料

`work agent`で起動したエージェントには、専用MCPの`remote_work`と`ask_user`を公開します。

| ツール | 実行先・用途 |
| --- | --- |
| `remote_work` | 接続先Bの検索・編集・Git・テスト・スキル・メモ |
| `ask_user` | 操作元Aのエージェントpaneに紐付く質問フォーム。回答をJSONで返す |

フォームは既存のask-form部品で表示します。専用MCPのエージェントは`ask_user`を直接呼び、接続先で`ask.py`や`sodactl ask`を実行する必要はありません。通常の`sodactl ask`は実行したPCのpaneを対象にするため、接続先Bで実行するとBのpaneに紐付きます（Bを表示している操作元ブラウザでも受け取れます）。

接続先の資料は`remote_work`のfile read等で読み、取得した**本文**を`documents[].markdown`へ渡します。操作元/接続先のファイルパスやpane/machine IDを渡す指定はありません。

```json
{
  "spec": {
    "title": "設計の確認",
    "questions": [
      {"id":"approve","label":"この設計で進めますか","options":[{"value":"yes","label":"進める"},{"value":"revise","label":"修正する"}]}
    ]
  },
  "documents": [
    {"title":"接続先の設計メモ","markdown":"# 設計案\n\nここに接続先で読んだMarkdown本文を入れます。"}
  ],
  "timeoutMs": 300000
}
```

`spec`には通常のask-formの質問定義（single/multi/text/edit/rank/table、出し分け等）を使えます。`spec.view`を使う場合は`text`の直接指定のみです。整形したMarkdownは`documents`で指定してください。操作元の任意のファイルを読む`view.file`や画像/音声参照は受け付けません。資料は合計8件、質問と資料の本文は合計256KiBまで。待機時間は1秒～5分、既定5分です。

回答は`{"status":"answered","answers":{"approve":"yes"}}`の形で返り、自由記述があれば`comments`や`note`も返ります。`cancelled`・`timeout`・`unavailable`は承認とみなさず、必要なら同じ内容を会話で確認します。操作元の質問表示対応画面が無ければ`unavailable`です。MCP終了・pane閉鎖・作業先接続の終了時はフォームも取り消します。既に起動済みのエージェントには、更新後に起動し直すと新しいツールが反映されます。

## 作業先を一度指定する

操作する側のエージェントのpaneで実行します。接続先のワークスペースにはPJフォルダを設定しておきます。

```sh
sodactl work bind <machine名またはid> <接続先workspaceのid>
sodactl work status
```

種類は呼出元のClaude Code/Codexから判定します。判定できない場合は`--kind claude`または`--kind codex`を指定します。paneの外では操作する側の`--pane <id>`が必要です。workspace/paneのidは一意に決まる4文字以上の先頭部分も使えます。

移行前から保存されている`w3`・`p3`等のIDもそのまま指定できます。新しく作る実体のIDはUUIDです。

bindは接続先・PJの実体・呼出元pane/会話を保存し、接続先のスキル一覧（名前・説明・id）、AGENTS.md/CLAUDE.md、エージェントが使う操作手順を返します。別paneに作業先は引き継がれません。サーバ再起動後も保存されますが、会話・PJ設定・PJの実体が変わったら再bindが必要です。`work unbind`で解除できます。

## スキルと実行先

```sh
sodactl work skills
sodactl work skill <skill-id>
sodactl work skill <skill-id> --path references/usage.md
sodactl work file list
sodactl work file read --path src/main.ts
sodactl work file search --query TODO
sodactl work file write --path src/main.ts --version <read結果のversion> < edited-main.ts
sodactl work exec -- 'git status --short'
```

スキル一覧は毎回接続先から検出し、選んだスキルの本文・付属資料は必要な時に読みます。`file`も`exec`も同じmachineとPJへ送られます。`work`に`--machine`は併用しません。未接続・未指定・PJ変更時にローカルへフォールバックしません。

検出する場所はPJ/親PJの`.agents/skills`、種類に対応する`.claude/skills`または`.codex/skills`、ユーザーの同等フォルダ、Codexのsystem/adminスキル、エージェントのプラグインキャッシュです。親への探索は最寄りの`.git`まで。`CLAUDE_CONFIG_DIR`/`CODEX_HOME`は接続先サーバの環境を使います。プラグインキャッシュからの検出は、そのプラグインの有効化やMCP・認証・依存ツールの導入を意味しません。無効化設定やプラグインの許可はエージェント側の設定も確認してください。

検出は200スキル・2000探索項目までで、上限に達したら`truncated: true`です。SKILL.mdは128KiB、必要時の本文・付属ファイルは256KiBまでのUTF-8テキストです。読み込みでscriptを実行しません。スキルの付属scriptを使う場合も`work exec`で接続先のシェルへ送ります。

**エージェント組込みのRead/Edit/Shellや、既存のローカルMCP自体を差し替える機能ではありません。** `sodactl skill`とbindの返す指示に従い、対象PJの操作をwork経由に統一します。接続先の絶対パスをローカルのファイルツールへ渡さないでください。`file`はPJ相対path、UTF-8・512KiBまでの既存ファイル編集とversion照合を扱います。新規ファイル/フォルダや大きな変更は`work exec`で行います。対話/常駐処理は接続先のpaneを使います。execの時間・出力・終了コードの制約は[CLI](sodactl.md)と同じです。

## 接続先にメモを残す

メモはファイル名の`name`で指定します。`MEMORY.md`や`decisions.md`のような名前を**一覧の確認・読取・保存・読み戻しで揃えてください**。`name`を省略すると`MEMORY.md`です。`path`や`.soda/agent-memory/...`の絶対/相対パスは渡しません。名前は英数字で始め、英数字・`_`・`-`・`.`の128文字以内（末尾の`.`とWindows予約名は不可）です。

専用MCPの`remote_work`は、`work agent`を要求した接続先Bのpane IDを保存単位にします。CLIの`work memory`は`work bind`した操作元の呼出元pane IDを使います。別paneや別方式の一覧を見て、メモが消えたと判断しないでください。

### 専用MCPの例

`remote_work`へ次のJSONを1件ずつ順に渡します。PC/PJ/paneの指定を追加する必要はありません。

1. 一覧の`files`で、使う名前が存在するか確認します。

   ```json
   {"operation":"memory","action":"list"}
   ```

2. `decisions.md`が存在しなければ、`version`を付けずに新規作成します。

   ```json
   {"operation":"memory","action":"write","name":"decisions.md","content":"決定事項と未完了作業"}
   ```

3. 既存メモは先に読み、返された`text`と`version`を確認します。

   ```json
   {"operation":"memory","action":"read","name":"decisions.md"}
   ```

4. 更新は同じ`name`と、直前のreadが返した`version`を指定します。下のプレースホルダーを実際の64桁の値に置き換えてください。古いversion・任意に作った値・version省略による既存メモの上書きはできません。

   ```json
   {"operation":"memory","action":"write","name":"decisions.md","content":"読み取った内容を踏まえた改訂メモ","version":"<直前のreadのversion>"}
   ```

5. 保存後は同じ名前をもう一度readし、`text`が保存したい内容であることと、`version`がwrite結果と一致することを確認します。write結果が受け取れなかった場合も、再送前に読み戻します。

   ```json
   {"operation":"memory","action":"read","name":"decisions.md"}
   ```

一覧に無い名前でも、その後に別の処理が作成することがあります。新規作成が失敗したら同じ名前をreadし、存在すれば最新versionを使う更新へ切り替えます。一覧は最大200件です。

### CLIの例

次は`work bind`済みの呼出元paneで使う例です。専用MCP起動が自動でCLIのbindを作るわけではありません。シェルの標準入力で渡す本文はUTF-8にしてください。

```sh
sodactl work memory list
# decisions.mdが無い場合だけ新規作成（versionなし）
sodactl work memory write decisions.md < handoff-notes.md
# 既存メモは先にtext/versionを取得
sodactl work memory read decisions.md
# <最新version>を直前のread結果に置き換えて更新
sodactl work memory write decisions.md --version <最新version> < revised-notes.md
# 保存後のtext/versionを確認
sodactl work memory read decisions.md
```

PowerShellでは`< file`を使わず、UTF-8の標準入力をパイプで渡します。既存メモの更新例です。

```powershell
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$memo = sodactl work memory read decisions.md | ConvertFrom-Json
# read成功と$memo.versionを確認してから実行
Get-Content .\revised-notes.md -Raw -Encoding UTF8 | sodactl work memory write decisions.md --version $memo.version
sodactl work memory read decisions.md
```

接続先PJの`.soda/agent-memory/<保存単位のpane ID>/`に保存します。既存AGENTS.md/CLAUDE.mdは上書きしません。判断、未完了作業、起動・検証コマンドなどを残してください。各ファイルは256KiB、paneごとに200ファイルまで。必要に応じ、このフォルダを接続先のGit ignoreへ追加してください。

### メモ操作が失敗したとき

「接続先の操作に失敗しました。接続とPJを確認してください」などの**汎用エラーだけでは、接続切断と判断できません**。引数不備、メモの未作成、version競合、権限、容量/件数制限、保存先の実体変更なども切り分けます。

1. `operation`/`action`、同じ`name`を使っているか、writeの`content`、更新の`version`、本文と名前の上限を確認します。
2. 専用MCPでは`{"operation":"inspect"}`、memory list、存在する名前のmemory readを**順番に**試します。並列実行は「別のremote操作が実行中」になる場合があります。CLIでは`work status`でbindを確認し、`work skills`で接続先のinspect、`work memory list/read`でメモを確認します。
3. 読取が成功すれば、その時点の通信とその読取の対象確認はできています。書込権限まで確認できたとは限りません。未作成なら作成、version競合なら最新内容を読んで差分を合わせ、最新versionで更新します。引数が正しいのに失敗する場合は、接続先の権限・上限・保存先の状態を調べます。
4. writeが成功したか不明なら同じ名前をreadし、`text`と`version`を照合します。読取でも確認できない間は更新を止めて利用者に状況を伝えます。書込を無条件に再送しません。
5. inspectや一覧も失敗する場合は、操作元の接続一覧、接続先の起動pane/PJ設定、サーバ再起動や接続の世代変更を確認します。切断や対象変更が確認できたら操作を止め、利用者に同じ作業先での再起動を依頼します。CLIのbindが失効した場合も、対象を確認してから再bindします。手元のファイル/シェルで代行しません。

## 接続先の同じエージェントからresumeする

```sh
sodactl work handoff
```

操作する側の呼出元paneに対応するClaude Code/Codexの主会話を、完結したJSONL行の時点でスナップショットし、64KiBずつ転送します。サブエージェントの独立した履歴は含みません。会話は32MiBまで。対応する記録が無い・上限を超える場合はメモ経由で引き継ぎます。接続先のエージェントを自動起動したり、元の会話を停止したりはしません。

接続先に`.soda/agent-memory/<pane>/handoff-<転送UUID>/`を作り、元の`transcript.jsonl`と`SODASHITSU-HANDOFF.md`を保存します。Claudeのプロジェクト固有auto memoryも同じフォルダへコピーします（32ファイル・合計512KiB、各64KiBまで）。Codexのグローバルmemoriesは他PJを含むため自動転送しません。`work memory`で保存したメモは既に接続先の親フォルダにあります。

さらに同じ種類の標準の会話保存先へ登録を試み、成功時は`nativePath`・`resumeArgv`・`cwd`を返します。`cwd`を作業ディレクトリとして、`resumeArgv`を配列の各要素のまま起動してください。返すargvには引継ぎメモを読む初期指示も含まれます。シェルへ連結する場合は接続先のシェルに応じた引用が必要です。対象にはその種類のエージェントとログイン設定が必要です。

既存の同ID履歴を上書きしません。既存履歴の探索が完走できない、保存先がリンク等で確認できない場合も、native登録を見送ってメモと元の履歴を残します。この場合`nativePath`/`resumeArgv`はnullで、`warnings`に理由を返します。転送中の切断・不完全データ・ハッシュ不一致ではnative履歴を登録しません。同じ会話の引継ぎを同時に複数送ってもnative登録は1件までです。

ネイティブ履歴は各エージェントの内部形式です。バージョン差・利用モデル・追加ツールによってresumeできない場合があります。最上位のcwdは接続先へ変更しますが、過去のツール引数などに含まれる元PCのパスを機械的に書き換えません。再開時に引継ぎメモと現在のPJ規約を読み直してください。互換性が合わない場合もメモを読んで新しいセッションで続けられます。

認証cookie・APIキーの設定ファイル・MCP設定・元PCの全体設定はコピーしません。ただし会話・メモに利用者が書いた情報自体は転送対象です。通常の認証済みWS/machine経路を使い、pane.sockでは利用できません。
