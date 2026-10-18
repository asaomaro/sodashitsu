# 独立レビュー

実装とは別コンテキストのreview_remote_tabsが全体と修正差分を点検。

1. DesktopBridgeRpc流用時の固定10sがHTTP readの35s指定を無視し、中継全体を閉じる: opts.timeoutMsを上限35sで尊重。previewだけcloseOnTimeout:falseとし、単独read timeoutでは他streamを閉じない。Desktop既存defaultは10s+closeを維持。fake timerと負対照で検証し、再レビュー指摘なし。
2. Bからの同一requestIdのjobが既存gatewayへ上書きし、リスナーが漏れる: 登録済みIDをskip。実gateway listen/closeを数える回帰を追加。負対照で複数リスナーを検出し、修正後は1個作成/回収。再レビューで追加の必須指摘なし。

localhost認証済み接続の制限、ownerによる停止制限、開始中離脱時の取消も確認済み。

## VSCode自動起動の独立レビュー

review_vscode_auto（別コンテキスト）で確認し、次を修正。最終再レビューは追加の必須指摘なし。

1. HTTPSにloopback名固定では証明書名が不一致: 証明書名が有効な自身のURLをローカル設定可能にし、TLS検証を維持。
2. 自動起動許可と手動residentの権限範囲が曖昧: 設定を自動起動に限定しWeb/TUIで明記。手動共有には適用しない。
3. 破損保存時にlegacy設定が再有効化: ENOENT以外はoffへ倒す。
4. 開いたviewerの設定変更通知漏れ: cancelLaunchedからstatusをbroadcast。real WebSocketの負対照で検知。
