# 配布できる拡張パッケージ

拡張ホスト（`docs/extensions.md`）へ、UIとプログラムをまとめて導入する仕組み。パッケージは依存なしのNode `.mjs` エントリと、そのプログラムが読むファイルを持つ。最初の利用例は [Yukkuri Studio](https://github.com/asaomaro/yukkuri-work/tree/main/plugins/yukkuri-studio)。

## 作る・配る・導入する

```sh
sodactl plugin pack /path/to/yukkuri-work/plugins/yukkuri-studio --out yukkuri-studio.sodaplugin
sodactl plugin install yukkuri-studio.sodaplugin --state-dir /path/to/soda-state
sodactl plugin list --state-dir /path/to/soda-state
# コード・作者・許可を確認してから実行を認める
sodactl plugin enable yukkuri-studio --state-dir /path/to/soda-state
sodactl ext reload
```

`.sodaplugin` を配布すれば、導入先の絶対パスを配布物に埋めずに導入できる。外部サービスへの公開操作やnpmのインストールフックは呼ばない。導入時はファイルを展開して**無効で登録**し、有効化は別の明示的な操作にする。実行は既存の拡張ホストが行い、設定の入切・ログ・起動し直しが使える。

`--state-dir` は、その `soda` サーバが実際に使う状態ディレクトリを指定する（名前付きsessionなら `sessions/<name>` まで）。別のマシンの設定をサーバAPI経由で書く機能ではない。サーバのOSの利用者が、そのマシンで実行する。`enable` 後も、画面で別途無効にした拡張は、画面で有効に戻す必要がある。

```sh
sodactl plugin disable yukkuri-studio --state-dir /path/to/soda-state
sodactl plugin remove yukkuri-studio --state-dir /path/to/soda-state
sodactl ext reload
```

removeは登録を外すだけ。導入したファイルと制作データは保持する。同じidの新しい版をinstallすると登録を差し替え、再び無効になる。無関係な拡張は残し、手動で書き換えた同じidの登録は上書きしない。

## マニフェスト

パッケージの根の `soda-plugin.json`:

```json
{
  "schemaVersion": 1,
  "id": "hello",
  "version": "1.0.0",
  "name": "Hello",
  "description": "あいさつを表示する",
  "entry": "extension.mjs",
  "files": ["extension.mjs", "README.md", "LICENSE"],
  "allow": [],
  "tabView": {"title": "Hello", "display": "hello-main"}
}
```

- `id` は既存の拡張idと同じ形（小文字・数字・`-`・`_`、64文字まで）。versionは数字3組。
- `entry` は `files` に含まれる `.mjs`。Node標準ライブラリだけを使うか、依存を配布物へまとめる。
- `files` は128件まで、相対パスだけ。絶対パス・`.`・`..`・重複・シンボリックリンクを拒否する。1ファイル8MiB、配布物32MiBまで。
- `tabView` は任意。`title` はタブの種類の表示名、`display` はメイン画面に使う `display.set` のname。拡張は `ext.panes` の `plugin.extensionKey` / `plugin.display` と `projectDir` を見て、選ばれたタブのアンカーpaneにその面を出す。作業用ターミナルは別のpaneとして起動される。`requiresProject` は省略時true、falseならPJ未設定でも使える。
- `views` は任意の追加ビュー定義（16件まで）。各項目は `id`、`title`、`placements`、任意の `requiresProject`・`targets` を持つ。配置は `right/left/top/bottom/float/band-top/band-bottom` のうち対応するものを重複なく宣言する。主画面のdisplay名は32文字まで。
- `allow` は `script-html`（スクリプト表示）と `agent-start`（新しい作業ペインでの制作依頼）の必要なものを重複なく指定。説明文とコマンドは既存拡張設定と同じ文字制限。
- ファイルごとのSHA-256を検証し、版と配布物のハッシュを含む固有フォルダへ展開する。`enable` でも整合性を確認する。SHA-256は作者の署名ではないので、コードの信頼性・作者の確認は利用者が行う。

配布物は `format: "sodashitsu-plugin"`, `version: 1`, `manifest`, `files: [{path,sha256,data}]` のJSON（dataはBase64）。インストール先の `plugins.json` は管理台帳、`extensions.json` は既存ホストへの登録。installの途中で異常が起きてもコードは実行しない。同じ配布物の再導入はファイルを上書きせず検証する。

## Yukkuri Studioの構成

| 表示 | 用途 |
|---|---|
| プラグインタブ全体 | 制作一覧、新規制作、9工程の状態、生成ジョブとログ、成果物、レビュー記録、設定 |
| 下の帯 | 選択中の制作・完了工程数・作業中／確認待ち／要対応 |
| 浮いた窓 | 台本・出典・構成・QAの文字、サムネイル、単一HTMLの動画再生 |

エージェントとUIはワークスペースの `.yukkuri-studio/library.json` を共有する。制作ごとにUUIDのフォルダを作る。人が工程を確認して状態を変えられ、どのエージェントも同梱 `studio.mjs` で進捗を報告できる。Pythonの固定コマンドはUIから実行できる。未知のコマンド文字列やエージェントの種類を拡張APIへ追加しない。

動画は64MiBまで、`display.send` で小分けに転送し、`script-html` 内の不透明originのblob iframeで再生する。新しい許可はスクリプト形式の `frame-src blob:` だけで、静的形式の隔離は変わらない。子文書もsandbox・ネットワーク禁止を継承する。スクリプト形式の許可と設定が必要。別のマシンで見るブラウザにも同じ経路で届く。

## 現在の範囲

ローカル配布物のpack/install/list/enable/disable/removeを実装。レジストリ検索・署名・自動ダウンロード・自動更新はまだない。拡張はサーバ利用者の権限で動く。制作室は4タブまで、台帳は1MiB、制作は100件まで。制作の主画面はアプリタブに表示する。制作進捗は通常のターミナルタブにも追加できる。素材・VOICEVOX・Python・生成スキルは導入先で用意する。AIによる調査や台本執筆、外部への公開はエージェントと利用者が行う。

## PJフォルダとタブ

spacesの右クリック **［PJフォルダを設定…］** で、そのワークスペースのPJを指定する（サーバ側の絶対パス。空欄で解除）。新しいターミナルタブ・通常の分割ペインのcwdは、このフォルダを優先する。既存の端末は移動しない。設定していない場合は従来の新しい端末の場所の設定に従う。

タブの［＋］で **［タブの種類］** を選ぶ。動作中で `tabView` を持ち、そのPJで使える拡張だけを表示する。プラグインタブには通常の作業ペインと、レイアウト外の表示用アンカーがある。作業ペインは通常どおり分割・移動・拡大できる。アンカーはPTYを持たず、フォーカス・分割・D&D・コマンド起動の対象にしない。フォルダとタブの種類はsession.jsonに保存する。プラグインが停止するとアプリ画面に停止を表示する。［作業画面］へ切り替えて端末を操作できる。PJフォルダを変えたら旧PJのプロジェクト拡張の権限は即時に外れ、新しい根の確認と承認が必要になる。

API: `workspace.set_project_folder {workspaceId,path}`（nullで解除）、`tab.create {workspaceId,plugin:{extensionKey,display}}`。この初版のプラグインタブの主画面はブラウザで利用する。

## ユーザー導入とPJ導入

同じ `.sodaplugin` を、利用者全体またはPJだけに導入できる。導入範囲と画面の用途は別の概念。

| 導入範囲 | 配置・利用範囲 |
|---|---|
| ユーザー | `--state-dir` の状態ディレクトリ。どのワークスペースからも選べる |
| PJ | `--project-dir` で指定したフォルダの `.soda/`。そのPJを設定したワークスペースだけで使える |

```sh
sodactl plugin install yukkuri-studio.sodaplugin --project-dir /workspaces/yukkuri-work
sodactl plugin enable yukkuri-studio --project-dir /workspaces/yukkuri-work
sodactl plugin list --project-dir /workspaces/yukkuri-work
sodactl ext reload
```

PJの `enable` は登録の有効化であり、コード実行の承認ではない。設定の拡張画面で、既存のプロジェクト拡張の承認を行う。PJを別の場所へ移してもパッケージの起動パスは相対パスで維持するが、承認は移動先で再確認する。`--state-dir` と `--project-dir` は同時に指定できない。ユーザーとPJで同じidがあっても別々に管理し、画面の候補にも範囲を表示する。

## パースペクティブとビューを開く導線

タブは端末・エージェントが共有する1つの作業環境。アプリを選んだタブには［作業画面］［アプリ画面］があり、同じ作業を異なる配置で表示する。切り替えても端末・プロセス・作業ペインの構成を作り直さない。アプリ画面を開いている間も端末は動き続ける。Yukkuri Studioは同じタブの作業ペインとエージェント状態を一覧に表示する。Yukkuri Studio 0.4では、制作詳細でClaude Code/Codexを選び［新しい作業ペインで依頼］から制作指示付きで起動できる。既存端末には入力せず、新しい端末で実行する。起動結果やログイン・確認操作は作業画面で確認する。

通常のターミナルタブとアプリタブの両方に［ビューを追加］がある。名前を検索し、配置を対応するパネル・帯・浮いた窓から選ぶ。タブ行からはタブ全体、ペインヘッダーからはその作業ペインへ追加する。標準のファイル・Gitビューもこの入口で使える（[標準ビュー](workspace-tools.md)）。追加済みビューはツールバーの×で外せる。停止中の拡張は追加候補から外れる。保存済みビューは残り、拡張の復帰後に再表示する。1タブ16ビューまで。

タブ全体のビューは画面切り替えの外側に表示する。作業ペインに付けたビューは、その作業ペインと一緒に作業画面で表示する。パネルは幅・高さが足りないとトレイへたたまれる。作業ペインを閉じる・別のタブへ移すと、そのペインの追加ビューの登録を外す。タブの画面モードとビューの登録はsession.jsonに保存する。

| 提供する画面 | 配布例 |
|---|---|
| ワークフローのアプリ | Yukkuri Studio。制作・進捗・成果物・確認をまとめた画面 |
| 汎用ビュー | [Commit Graph](../plugins/commit-graph/README.md)。読み取り専用のコミット履歴。単独のアプリタブとしても、既存タブのパネルとしても使える |

拡張は `ext.panes` の `virtual`・`plugin`・`views`・`tabId`・`agentState` を参照する。`plugin` は主画面の表示用アンカーにだけ付く。`views` は自分の拡張が担当するインスタンスだけで、`display` に指定されたnameを使って表示する。インスタンスの削除を受けたら表示も閉じる。

### ビューの情報対象と配置（プラグイン開発）

`views[].targets` は、ビューが表示する情報の対象を宣言する設定です。`["tab"]` はタブ全体、`["pane"]` は作業ペインの情報、`["tab", "pane"]` は両方に対応します。省略した既存プラグインは両方として扱います。空配列・重複は指定できません。

```json
{
  "views": [
    {"id":"workflow","title":"制作進捗","targets":["tab"],"placements":["left","float"]},
    {"id":"conversation","title":"ペインの会話","targets":["pane"],"placements":["right","float"],"requiresProject":false}
  ]
}
```

タブ行の「ビューを追加」にはタブ情報とペイン情報の両方のビューを表示します。ペイン情報だけのビューをタブ側に置くと、そのタブのアクティブなペインへ追従します。ペインヘッダー側には `pane` 対応の候補だけを表示します。`views[].informationTarget` は情報の種類、`target` は追加した場所です。プラグインへ渡すインスタンスの `sourcePaneId` が実際の情報元で、タブ側の場合は焦点変更に伴って更新されます。`ext.panes_changed` を受けたら `ext.panes` を再取得してください。サーバーもペイン側でタブ専用ビューを追加しないか確認します。

情報の対象と表示の配置は別です。ペイン側で選ぶ `float` は、そのペインの情報を表示する浮いた窓です。ペインの表示矩形内に制限するという意味ではなく、他のペインやタブ全体を対象とした情報へ切り替わることもありません。`ext.panes` の `views[].informationTarget` と `sourcePaneId` を使って情報対象を判定してください。`tab` のインスタンスは表示専用アンカーを使うため、`tabId` が同じ作業ペイン群と `projectDir` を参照します。

標準ファイル・GitビューはワークスペースのPJフォルダに依存するため `targets:["tab"]` とし、タブ側の候補にだけ表示します。従来追加したペイン対象の標準ビューは表示を維持しますが、新しいペイン対象の追加は拒否します。

`placements` は追加・移動の両方で使う配置制限です。例えば `["band-top","band-bottom"]` なら上下の帯だけを選べ、上下の入れ替えは可能ですが、左右パネルやフロートへの移動はできません。Webの移動メニュー・D&Dでも制限し、`tab.move_view {tabId,viewInstanceId,placement}` でサーバーも検証して保存します。標準ビューも上下の帯を選べます。

端末版でも `left/right/top/bottom/band-top/band-bottom` は端末領域と並ぶ固定ビューとして描画し、`float` は浮いた窓で開きます。固定ビューをクリックして操作し、Escで端末へ戻ります。prefixや直接の全体ショートカットも利用できます。画面幅が狭い場合はフォーカスしているビューを1面に表示します。プラグインのHTMLは端末版の対応する簡易フォーム・Markdown等の表現で表示します。JavaScriptを実行するアプリ画面を端末版でそのまま実行する仕組みではありません。

API: `tab.set_perspective {tabId,perspective: "terminal"|"app"}`、`tab.add_view {tabId,extensionKey,viewId,target: "tab"|"pane",paneId?,placement}`、`tab.remove_view {tabId,viewInstanceId}`。追加時はサーバでも拡張の稼働状態・範囲・PJ条件・情報対象・対応配置を確認する。

## 外部プラグインの管理と連携テスト

Yukkuri Studioのソース・プラグイン単体テストはyukkuri-work側の `plugins/yukkuri-studio/` で管理する。Sodashitsuには含めない。Sodashitsuとのブラウザ連携テストは外部ソースを明示して実行する。指定しない場合はStudioを必要とするテストをスキップする。

```sh
YUKKURI_STUDIO_SOURCE=/path/to/yukkuri-work/plugins/yukkuri-studio pnpm --filter @sodashitsu/e2e exec playwright test plugin-perspectives.spec.ts yukkuri-studio.spec.ts studio-agent-request.spec.ts studio-notifications.spec.ts
```

実行中のプラグインアプリをエージェントから操作する `plugin operations`／`plugin call` と、プラグイン側の公開方法は [プラグインアプリのCLI操作](plugin-cli.md) を参照してください。

## モバイル専用アプリビュー

プラグインの `tabView` に任意の `mobileDisplay` を指定すると、モバイル画面ではその name の表示を主画面に使う。指定しなければ従来の `display` を使う。

```json
{"tabView":{"title":"My App","display":"my-app","mobileDisplay":"my-app-mobile"}}
```

拡張は `ext.panes` の主画面アンカーの `plugin.display` と `plugin.mobileDisplay` を参照し、同じ pane に両方の HTML 表示を公開する。両方で同じ制作データ・操作を扱い、配置だけを変える。専用表示が指定されているのに未公開の場合は準備中と表示する。公開後に画面幅を変えると切り替わり、作業ペインやプロセスは維持する。既存タブにも稼働中のプラグイン定義を反映し、設定は保存・復元する。主画面の二つの表示は追加パネル一覧から除外する。

[Commit Graph](../plugins/commit-graph/README.md) が実装例。モバイル側の HTML は viewport に応じた幅・折り返し・指で押せるボタンを備える。汎用の追加パネル・帯は従来のモバイル表示一覧で開く。ask-form は既存のモバイル対応を使用する。

### 端末版のプラグインビュー

Web版の表示とは別に、端末版に適した本文を提供できます。`views` の各ビューに `terminal: { "format": "markdown" }` を設定します。形式は `text`・`markdown`・`html`（簡易フォーム用）です。端末版の「ビューを追加」では `terminal` のあるプラグインビューだけが候補に出ます。標準のファイル・Gitビューは端末版も提供します。

```json
{
  "id": "conversation",
  "title": "会話の確認",
  "targets": ["pane"],
  "placements": ["left", "right", "float"],
  "terminal": { "format": "markdown" }
}
```

`ext.panes` のビューインスタンスには、Web用の `display` と端末用の `terminalDisplay` が含まれます。プラグインは、同じ `paneId` に両方の表示を作ります。端末用の名前はインスタンスごとにサーバーが生成するので、定数の表示名を流用せず `terminalDisplay` を使ってください。表示の配置はインスタンスの `placement` に従います。MarkdownのMermaidは端末上で記号に整形され、HTMLはJavaScriptを実行せず、対応する簡易フォーム・文字を表示します。フォームの回答は通常の `display.action` で受け取ります。

タブ全体のアプリ用パースペクティブは、`tabView` に `terminalDisplay`（表示名）を追加します。Web用 `display`、モバイル用 `mobileDisplay` と並ぶ端末用の名前です。`ext.panes` の `tabPlugin` にも渡されます。端末版の新規タブは、この設定を持つプラグインを種類として選べます。端末用表示を持たないWeb専用プラグインは、端末版の新規タブ候補にも出しません。

```json
{
  "tabView": {
    "title": "制作アプリ",
    "display": "studio",
    "mobileDisplay": "studio-mobile",
    "terminalDisplay": "studio-terminal"
  }
}
```

端末用本文を作る処理もWeb用本文と同じプラグインプロセスで行います。端末用に別のエージェントやタブを起こす必要はありません。追加した端末用表示も、拡張の表示件数・容量の上限に数えます。

端末版のアプリ用タブはタブの右クリックメニュー「端末画面へ」「アプリ画面へ」で切り替えられます。画面を切り替えても作業ペインは維持されます。

## 配置したパッケージを画面から登録する

ユーザーホーム、ワークスペースのPJフォルダ、sodaの起動フォルダにパッケージを置き、Webの設定画面「拡張」で「パッケージを探す」を押します。端末版はメニューの「プラグインパッケージ…」を開きます。

探索対象は各フォルダ直下、および `plugins/`・`.soda/plugins/`・`.soda/packages/` の直下です。`.sodaplugin` ファイルか、`soda-plugin.json` を含むパッケージフォルダを置けます。再帰的な探索はしません。

PJフォルダで見つかったものはそのPJに登録します。ユーザーホームと起動フォルダはユーザー全体への登録です。起動フォルダがワークスペースのPJフォルダでもある場合はPJとして扱います。確認画面で配置元・対象範囲・権限・検証値を確認して「許可して登録・有効化」を実行します。発見しただけではコードを実行しません。確認後に内容が変わった場合は再確認が必要です。導入済みの同じ内容は候補に出しません。

端末版の確認画面は上下キーで最後まで確認してからEnterで許可します。狭い画面では画面を広げてください。従来の `sodactl plugin install/enable` とPJ拡張のコマンドによる承認も引き続き利用できます。

## Sodashitsuの部品をアプリへ埋め込む

Web版・モバイルWeb版の `script-html` では、`soda.mount` で標準部品を配置できる。最初の部品は **端末**（閲覧専用／入力可能）。アプリ専用の入力フォームと、背景で動くエージェントの端末出力を組み合わせられる。`typeof soda.mount === "function"` でAPIの有無を判定できる。現在対応する部品名は `soda.components`（`["terminal"]`）で確認する。端末入力への対応は `soda.features?.terminalInput === true` で判定する。

```html
<div id="agent-output" style="height:360px; width:100%"></div>
<textarea id="reply" placeholder="エージェントへの指示"></textarea>
<button id="send">送信</button>
<script>
// agentPaneIdは拡張がext.panes等で把握した作業ペインの完全なUUID。
// HTMLを生成するときはJSON.stringifyで文字列を埋め込む。
const terminal = soda.mount("terminal", document.getElementById("agent-output"), {
  paneId: agentPaneId
});
document.getElementById("send").onclick = () => {
  soda.action("agent.reply", { paneId: agentPaneId, text: document.getElementById("reply").value });
};
// 要らなくなったとき。アプリを閉じる・表示を更新する場合は自動で片付く。
// terminal?.dispose();
</script>
```

`agent.reply` は例の操作名で、自動送信される標準コマンドではない。拡張側で `display.action` を受け、所有する作業ペイン・現在のエージェント・本文を検証し、既存の `agent.prompt` へ渡す。閲覧専用の端末部品は入力を送らないので、専用のテキストエリア・送信ボタン・レビュー承認等のワークフローをアプリ側で設計できる。

- `soda.mount("terminal", element, {paneId, interactive:false})` は `{dispose()}` を返す。未対応の部品・不正な指定・同時4部品の上限なら `null`。指定要素には幅と高さを持たせる。対象は同じワークスペースの実体がある稼働中ペインで、別タブの作業ペインも指定できる。仮想アンカーには端末がない。
- 対象を利用できない場合は、`soda.onMessage` に `{type:"component-error", id, error:"pane_not_available"}` が届く。表示中に対象が閉じられる・別ワークスペースへ移る場合も端末表示を外す。
- 元の端末と同じxterm.js、ANSIカラー、Unicodeアイコンと画像の表示処理を使い、取得済み履歴（最大5,000行）と以後の出力を表示する。既に表示済みの画像は履歴の複製時に復元されない場合があるが、新しく届く画像は描画する。端末の選択・コピー・スクロールはできる。ネットワークの再接続時は取り直す。
- 元のペインと同時に表示できる。部品の枠をリサイズしてもPTYの行数・桁数やサイズ権限は変えない。狭い枠ではスクロールして読む。埋め込みのみを理由に通知を自動で既読にはしない。出力を追っている間はカーソル行が見える位置に追従し、利用者が履歴へ戻ったときは位置を保つ。
- 部品はSodashitsu側のDOMに描画し、位置だけを隔離したアプリから受け取る。アプリに端末DOM・認証トークン・汎用RPCを渡さない。枠とスクロール領域の外には表示しない。要素へのCSS変形・重なり・角丸・透過・独自clip-pathは反映しないため、専用の矩形領域を確保する。
- 従来どおり `allow:["script-html"]` と利用者のスクリプト表示設定が必要。静的HTML・端末版の `terminalDisplay` ではこのWeb用APIは使えない。端末版のビューは従来のテキスト／Markdownの定義で提供する。

入力欄も端末にする場合は、次のように指定する。

```js
soda.mount("terminal", element, { paneId: agentPaneId, interactive: true });
```

`interactive` の省略時は `false`（閲覧専用）。`true` では、アプリの［操作する］を押した後、埋め込み端末へフォーカスを置いてキー入力・日本語入力・テキスト貼り付けを行える。入力は指定したペインへ直接送り、アプリ独自の送信処理は不要。元のペインの端末も同時に使える。操作終了・接続切断・対象が範囲外へ移動した場合は送信しない。通常のEscはアプリの操作終了／浮いた窓を閉じる操作を維持し、端末へ送らない。端末自身へEscapeを送る場合はCtrl+[を使う。Sodashitsuのprefixやモバイル追加キー、画像貼り付けボタンはこの部品には付属せず、端末のテキスト入力を提供する。
