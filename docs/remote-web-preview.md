# リモートWebプレビュー

Bで動かす開発Webアプリを、Aへ接続したSodashitsuのブラウザで操作します。アプリのport公開やルーター設定は不要です。既存のmachine接続を使います。PCブラウザ版の「Webプレビュー」タブとして使います。モバイル幅では既存のmachine接続仕様で外部machineからlocalへ切り替わるため、リモートプレビューの対象外です。

1. Sodashitsuで対象machineとworkspaceを選び、新しいタブの「タブの種類」から「Webプレビュー」を選びます。タブ内で表示元のpaneを選べます。このタブを開くことで、選んだpaneからの表示要求を受け付けます。
2. **ブラウザを使うPC**で、画面に出る`sodactl preview helper`のコマンドを実行します（画面の全文をコピー）。そのPCにsodactlが必要で、表示先Sodashitsuへのログインも必要です。Bの遠隔paneでは起動しません。ブラウザから求められた場合はSodashitsuサイトのローカルネットワークアクセスを許可します。
3. Bで開発サーバーを127.0.0.1で起動し、タブ内で名前と実ポートを入力して「登録して開く」を押します。利用者による登録コマンドの入力は不要です。エージェントから自動で登録・表示する場合は、引き続き次のCLIを使えます。

```sh
sodactl preview register --name frontend --port 5173 --replace
sodactl preview list
sodactl preview open <登録結果のid>
```

pane内の候補操作は対応OSでpane.sockを利用でき、管理tokenをアプリへ渡す必要はありません。pane外ではログイン済みCLIと`--pane <id>`を使います。複数ブラウザまたは複数プレビュータブが許可している場合は`preview viewers`で確認し、`open <id> --viewer <id>`で選びます。IDは完全UUIDか4文字以上の一意な先頭部分です。

```sh
sodactl preview viewers
sodactl preview helper --viewer <id> --url <AのSodashitsu URL>
# helperでBへ既存machine接続を使う場合
sodactl --machine <BのmachineId> preview helper --viewer <id> --url <AのSodashitsu URL>
sodactl preview stop <appId>
sodactl preview remove <appId>
```

helperは起動したままにします。以後のport登録・表示開始は画面またはエージェントから行えます。stopは転送を停止し、開発サーバーのプロセスは終了しません。再開はregister --replaceで行います。登録は再起動で消えます。helper/viewerの切断、表示元paneの変更、許可取消、期限切れで表示は失効します。通常のタブ・workspaceの切替ではhelperと表示を維持します。タブを閉じると、そのタブの許可を取り消します。表示を閉じる操作は選択viewだけを閉じます。

openの`view_opened`は画面作成の確認で、アプリのテスト合格ではありません。アプリ表示後に利用者やエージェントが実際の動作を確認してください。接続エラー、iframe拒否、アプリのHTTPエラーを自動で正常扱いにはしません。

アプリごとに別のlocalhost originへroot配信するため、通常はbasePath不要です。固定のlocalhost URL/別port API/WS HMR URL、HostやOrigin許可リストにはアプリ側設定が必要です。アプリのCSPやX-Frame-Optionsが埋込みを拒否する場合は「別タブで開く」を試してください。ブラウザのcookie/LNA制限を無効化する機能はありません。

確認済みはLinux Chromium153、実2サーバーのB発外向き委譲、HTTP/module/API/SSE/upload/WSです。SSH経路は既存RPCを使える設計ですが今回実機未検証です。最小JS/CSSアプリではVite 8.3.0のHMRも追加設定なしで確認しました。NextのHMR、Vite plugin個別互換性、Windows/macOS/Firefox/Safari、実公開HTTPSの親サイトは未検証です。helperの自動導入・自動起動、plugin operations、TUI表示は含みません。

管理portと任意URL転送を拒否しますが、開発アプリ自体をOS sandboxにする機能ではありません。信頼する開発アプリを登録してください。転送失効でも既取得データ・Service Workerのcacheは回収できません。

実装・上限・検証根拠は[設計記録](../.aidev/works/20261017-remote-web-preview/design.md)と[検証記録](../.aidev/works/20261017-remote-web-preview/test-result.md)を参照してください。

## 速度と接続経路

プレビューのHTTP/WSは端末出力の帯域制限とは別のRPC経路です。同一LANでもmachineが外部のトンネルURL経由で委譲接続していれば、その経路を通ります。LAN直結と同じ遅延になるとは限りません。

対応するserverとhelper間では、HTTPダウンロードの読取を最大256KiBずつまとめ、RPC往復回数を減らします。旧版との接続では32KiBの読取を維持します。溜まっているデータだけをまとめるため、SSEのイベントはバッチが満ちるまで待ちません。アップロード・WS・全体のサイズ制限は変わりません。タブ機能と性能変更の利用には、操作側と接続先のSodashitsuおよびブラウザPCのsodactlを更新してください。
