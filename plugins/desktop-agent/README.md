# Desktop Agent

人がリモートデスクトップの共有窓で発行した通常の43文字コードだけを使うプラグイン操作例です。接続や許可を自動で開始しません。プラグインの導入・有効化、アプリタブの追加と、共有窓でのエージェント許可が必要です。PJ拡張の承認は通常どおり必要です。

`pnpm build`後、`sodactl plugin pack plugins/desktop-agent --out <保存先.sodaplugin>`で配布できます。導入したパッケージは無効で始まります。`desktop-agent`許可を持つプラグインは、利用者が渡したコードに基づいて画面画像を受け取り、操作できます。このアプリ自身のpaneを`--pane`へ指定してください。

- `sodactl plugin operations desktop-agent --pane <アプリpane>`で操作とschemaを確認します。
- `plugin call desktop-agent attach`に`{"ticket":"<人が発行したコード>"}`を渡し、返ったleaseIdを以降に使います。
- `observe`に`{"leaseId":"..."}`を渡すとobservationIdと画像が返ります。
- `act`にleaseId、observationId、inputsを渡します。既存の`desktop.agent.act`と同じ形式です。画像が変わっていれば拒否します。操作後はafterFrameSeqより新しい画像をobserveし、操作を再判断してください。
- `release`にleaseIdを渡すと権限を解放します。アプリの移動・閉鎖・拡張停止・許可取消・期限切れでも失効します。

コード・lease・画像をログやGitへ保存しないでください。画像も含むplugin.callの結果は256KiBまでです。大きければ明示的に拒否し、共有窓で幅/品質を下げて改めて取得します。画像の自動保存、モデル送信、権限再取得、不確定な操作の再送は行いません。

このホストAPIは通常接続用です。`soda-e2e-agent-v1.`で始まる暗号化コードは受理せず、暗号化から通常経路へ切り替えません。暗号化されたエージェントには既存の`sodactl desktop session/mcp/model --endpoint-fingerprint ...`を使います。拡張プロセスの停止と別途起動したCLIの寿命を結び付けることは、CLIを組み込むプラグイン側の責任です。


`desktop.agent.observe` の `region: {x,y,width,height}` は転送画像の画素座標です。対応Windows sourceでは最大1,048,576画素を変更確認し、画像全体と `verification.pointerOnly: true` を返します。以降のactは領域内のpointerだけを許可します。キー・文字列・ホイールはregionを省略して観察し直してください。未対応sourceは失敗し、暗黙の全画面fallbackはしません。領域外の背景が変わっても、領域内・寸法・許可・新鮮さが保たれれば操作を継続できます。
