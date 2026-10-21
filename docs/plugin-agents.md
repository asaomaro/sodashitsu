# 操作元のエージェントを使うプラグイン

接続先PCをB、ブラウザを提供する操作元SodashitsuのPCをAとします。Bで動くプラグインは、AのClaude Code / Codexを担当に選べます。Bにエージェントの導入やログインは要りません。Bには、プラグイン、制作ツール、PJ、スキルを置きます。Aには、Sodashitsuとログイン済みのエージェントCLIが必要です。

ブラウザだけを使う第三のPCがあっても、エージェントが動くのはAです。プラグインの旧来のサーバ側起動はそのまま使えます。

## 起動先を選ぶ

パッケージの `allow` に `agent-start` を登録し、利用者が承認して有効化します。NDJSONの `ext.hello.methods` に `task.status` / `task.prompt` があることを確認してください。古いサーバでは「操作元」を選べない表示にし、黙ってBで起動しないでください。

画面には「接続先のエージェント」「操作元のエージェント」の選択を設けます。`execution` の省略または `"server"` は従来どおりBで起動、`"operator"` はAへの起動要求です。

```js
// callは拡張のNDJSON request / ext.resultの相関を行う関数。
const { kinds } = await call('task.kinds', { execution: 'operator' });
// kindsのavailableは「要求できる」印。Aの導入・ログイン確認は起動時。
const task = await call('task.start', {
  paneId: appPane.id, // ext.panesにある、このプラグイン自身のアプリ／追加ビュー
  execution: 'operator',
  kind: 'codex', // claude | codex
  taskFile: '.soda/my-app/tasks/job-123.md',
});
// { requestId, execution:'operator', kind:'codex', status:'pending' }
```

指示ファイルは、BのPJ内の相対パス、64KiB以下の通常ファイルにします。PJ外を指すリンク、絶対パス、`..` は使えません。**起動前にファイルを書き終えてください。** 別ジョブには別の指示ファイル名を使います。

AでBを選択している画面に、プラグインと指示ファイルを示した起動要求が出ます。利用者が［起動］を押すと、Aの新しい作業ペインに専用エージェントが起動し、初期プロンプトとしてBの指示ファイルを読む依頼が渡ります。画面を使わない場合は、Aで `sodactl work accept <Bのmachine id> <requestId>` を実行します。Bの要求だけでAのプログラムを自動起動しません。

同じ拡張プロセス・アプリ・指示ファイルの連続要求は、同じ担当要求を返します。未承認の要求は10分で期限切れです。同じアプリpaneで受付中にできる要求は1件です。

## 状態と追加指示

```js
const status = await call('task.status', {
  paneId: appPane.id, requestId: task.requestId,
});
// status: pending | claimed | launched | failed | rejected
// agent?: { paneId: Aの担当pane, state: starting|idle|working|blocked|stopped, updatedAt }
// connection?: online | stale（15秒以上、更新なし）

// 追加指示をBのPJに、一度だけ使う別名で保存してから呼ぶ。
await call('task.prompt', {
  paneId: appPane.id, requestId: task.requestId,
  taskFile: '.soda/my-app/tasks/instruction-456.md',
});
```

追加指示は `status.instruction` の `queued → delivering → sent | failed` で追えます。Aが約3秒おきに受け取り、同じエージェントが `idle` のときだけ送ります。作業中・承認待ちには入力しません。`sent` は端末への送信までで、LLMが作業を完了した印ではありません。成果物・進捗はプラグインの報告操作で確認します。

同じ追加指示ファイル名を繰り返しても再送しません。`delivering` のまま接続が切れた場合や `failed` の場合は、Aの担当画面とBの成果物を確認してください。受信不明の指示を自動再送しないでください。担当paneのidはAのものなので、Bの `agent.prompt` や端末埋め込みに渡してはいけません。追加指示は `task.prompt`、担当との直接の対話はAの作業ペインを使います。

起動要求・担当の接続はメモリ上だけです。拡張プロセスの世代変更、アプリの移動・削除、PJ変更、接続切断、Aの担当終了、Sodashitsu再起動で利用できなくなります。起動後の有効期間は最大24時間です。AのCLI会話の `--resume` と、BのPJに残すメモは別です。プラグインからのネイティブ会話再開、任意のCLI引数、Aの端末の自動埋め込みは、このAPIでは行いません。

## エージェントからプラグインを操作する

進捗・完成・質問などは、プラグインが `app.register` で意味のある操作として公開します（[CLI操作の作成ガイド](plugin-cli.md)）。専用エージェントは、追加のログインなしで、`remote_work` MCPから**依頼元のアプリだけ**を操作できます。

```json
{"operation":"plugin","request":{"action":"operations"}}
```

返った操作一覧のスキーマを読み、例えば `report` 操作があれば次のように呼びます。

```json
{"operation":"plugin","request":{"action":"call","name":"report","params":{"message":"台本を保存しました"}}}
```

plugin key・アプリpane・プロセス世代・BのPJはサーバ側で固定します。呼び出し側が別のアプリやPCを指定することはできません。プラグイン以外から起動した `work agent` では、この操作は使えません。登録した操作の入力検査・結果サイズ制限・30秒の期限は通常の `plugin.call` と同じです。不確かな書き込み・操作結果は状態を読み直し、盲目的に再実行しないでください。

指示ファイルには、Bのスキルを読むこと、制作物をBに保存すること、報告用の公開操作と引数を書きます。`sodactl` をAのシェルで実行する指示は書かず、`remote_work` の `file` / `skill` / `exec` / `memory` / `plugin` を使うよう案内します。長時間の生成処理は、プラグインがジョブ登録操作を公開し、短い受付結果を返して別の状態取得操作で追跡する設計にしてください。

利用者への質問・成果物確認は `ask_user` MCPを使います。BのMarkdownを `remote_work` で読み、`documents:[{title,markdown}]` に本文を渡すと、Aの担当に質問フォームが開き、回答JSONが戻ります。BのパスをAのフォームへ渡さないでください。

## 既存プラグインを移行する

サーバ側の `agent.start` / `agent.prompt` / snapshotを直接使っているプラグインは、起動先に応じてアダプターを分けます。「操作元」を選んだ経路では、BのCLI導入判定・Bのpane作成・Bのグラフ登録・Bの会話resumeを実行せず、上記の `task.*` と報告操作を使います。起動失敗時にBへ自動で切り替えないでください。

Yukkuri Studioのような制作アプリでは、ファイル・スキル・レンダリング・投稿処理をBに残し、監督・担当の起動先だけをAにできます。プラグイン自身のUIと担当台帳にも、この起動先とrequestIdを記録してください。本体のAPI対応だけで、既存プラグインの独自のエージェント起動処理が自動置換されるわけではありません。
