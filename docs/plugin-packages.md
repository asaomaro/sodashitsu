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
- `views` は任意の追加ビュー定義（16件まで）。各項目は `id`、`title`、`placements`、任意の `requiresProject` を持つ。配置は `right/left/top/bottom/float/band-top/band-bottom` のうち対応するものを重複なく宣言する。主画面のdisplay名は32文字まで。
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

通常のターミナルタブとアプリタブの両方に［ビューを追加］がある。名前を検索して、表示対象を「タブ全体」または「作業ペイン」、配置を対応するパネル・帯・浮いた窓から選ぶ。追加済みビューはツールバーの×で外せる。停止中の拡張は追加候補から外れる。保存済みビューは残り、拡張の復帰後に再表示する。1タブ16ビューまで。

タブ全体のビューは画面切り替えの外側に表示する。作業ペインに付けたビューは、その作業ペインと一緒に作業画面で表示する。パネルは幅・高さが足りないとトレイへたたまれる。作業ペインを閉じる・別のタブへ移すと、そのペインの追加ビューの登録を外す。タブの画面モードとビューの登録はsession.jsonに保存する。

| 提供する画面 | 配布例 |
|---|---|
| ワークフローのアプリ | Yukkuri Studio。制作・進捗・成果物・確認をまとめた画面 |
| 汎用ビュー | [Commit Graph](../plugins/commit-graph/README.md)。読み取り専用のコミット履歴。単独のアプリタブとしても、既存タブのパネルとしても使える |

拡張は `ext.panes` の `virtual`・`plugin`・`views`・`tabId`・`agentState` を参照する。`plugin` は主画面の表示用アンカーにだけ付く。`views` は自分の拡張が担当するインスタンスだけで、`display` に指定されたnameを使って表示する。インスタンスの削除を受けたら表示も閉じる。

API: `tab.set_perspective {tabId,perspective: "terminal"|"app"}`、`tab.add_view {tabId,extensionKey,viewId,target: "tab"|"pane",paneId?,placement}`、`tab.remove_view {tabId,viewInstanceId}`。追加時はサーバでも拡張の稼働状態・範囲・PJ条件・対応配置を確認する。

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
