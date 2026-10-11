# プラグインアプリのCLI操作

配布パッケージの導入操作（`plugin install` 等）に加え、実行中のプラグインが公開する操作を `sodactl` で呼べます。帯・パネルとして追加したビュー、アプリタブの両方に対応します。

```sh
sodactl plugin operations commit-graph --tab <タブID>
sodactl plugin call commit-graph history --tab <タブID> --params '{"limit":20}'
sodactl plugin call commit-graph refresh --pane <ペインID>
```

`--pane`、`--tab`、`--workspace` のどれか1つを指定します。UUIDの一意な先頭部分（4文字以上）も使えます。同じIDのユーザー／PJプラグインが複数あれば `sodactl ext list` の `key` を指定してください。同じタブやワークスペースに複数の対象ビューがあれば、`--pane` で絞ります。対象はプラグインが追加されているペインです。未承認・無効なプラグインをこのコマンドで起動することはありません。

`operations` は `key`、`paneId`、`tabId`、`workspaceId` と `operations` をJSONで返します。各操作の `name`、`description`、`inputSchema` を確認してから呼びます。`call` は `{"result": ...}` を返します。`--params` は64 KiB以内のJSONオブジェクト、結果は256 KiB以内、応答待ちは30秒、サーバ全体で同時32件までです。エラー時は終了コード1、引数の誤りは2です。

タイムアウト・停止・接続断は、操作の未実行を意味しません。作成や削除を自動再試行せず、取得操作で状態を確認してください。必要ならプラグイン自身がリクエスト用の識別子をパラメータに定義し、重複実行を防ぎます。

## プラグイン側の実装

既存の標準入出力NDJSONに次のメソッド／イベントを追加しました。パッケージ形式・拡張プロトコルv1は変わりません。古いプラグインは公開操作がない状態で動作します。

起動時（`ext.hello` を受けた後）に操作を登録します。各起動ごとに登録し直してください。最大32操作、説明500文字、入力スキーマ16 KiBです。同じ起動の再登録は一覧を置き換えます。

```json
{"id":"register","method":"app.register","params":{"operations":[{"name":"projects-list","description":"制作一覧を返す","inputSchema":{"type":"object","properties":{},"additionalProperties":false}}]}}
```

サーバは `ext.result` で登録結果を返し、CLIの要求を次のイベントで届けます。

```json
{"type":"app.call","callId":"<UUID>","operation":"projects-list","params":{},"target":{"paneId":"...","tabId":"...","workspaceId":"..."}}
```

プラグインは、対象を `ext.panes` と照合し、自分のアプリのPJフォルダ・状態を使います。サーバは公開名、入力サイズ、対象の範囲とビューへの紐付けを検査します。**入力スキーマの意味の検証はプラグイン側で行ってください。** `params` をシェルのコマンド文字列として実行しないでください。UIとCLIで同じアプリ操作関数を呼び、UIも更新します。

```json
{"method":"app.result","params":{"callId":"<受信したUUID>","ok":true,"result":{"projects":[]}}}
{"method":"app.result","params":{"callId":"<受信したUUID>","ok":false,"error":"制作が見つかりません"}}
```

任意の `id` を付ければ応答受理にも `ext.result` が返ります。結果は要求元の拡張・起動IDにだけ紐付きます。対象が移動・閉鎖された場合は結果を受理せずエラーにします。ただし、その時点までにプラグインで行った操作の取り消しはできません。

実装例は `plugins/commit-graph/extension.mjs` の `app.register`／`app.call` です。Yukkuri Studioはyukkuri-work側で管理されているため、そちらの拡張が同じ契約で制作一覧・新規制作・工程更新・レビュー入力等を公開できます。

## skillとMCP

シェルを使えるエージェントは `sodactl skill` と操作一覧でアプリを操作できます。アプリ専用skillには公開操作名、入力例、ワークフロー上の判断を載せ、利用者の依頼の範囲で呼び出します。

MCP専用クライアント向けには、`plugin.operations`／`plugin.call` を呼ぶ薄いMCPアダプターを別パッケージとして作れます。`sodactl`自体にMCPサーバーを内蔵することは必須ではありません。この変更ではMCPサーバーは提供しません。認証済みの `/ws` を操作口とし、ログイン不要の `pane.sock` には公開していません。
