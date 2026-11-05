# ローカルデスクトップ

- [x] PC登録なしでローカルの接続ビューを作成できるようにする。
- [x] 認証済みviewer専用の内部leaseで既存providerを使う。任意RPC・設定変更の口は増やさない。
- [x] 内部source専用loopback受け口と取消可能なscopeで、既存の入力・エージェント・OS許可を維持する。
- [x] 関連単体・統合テスト、ビルド・型検査（全体unit suiteの既知失敗はverification.mdに記録）。
- [x] ブラウザ上で描画・入力・終了とcomputer-useの取得画像・入力・取消を確認する。
- [x] 独立レビューと修正確認。
- [ ] mainへ反映しWindows検証環境へ導入する。

共有先の状態・許可・切断に関わるため、全体差分の独立レビューを行う。設定を自動で有効化しない。

## 先行する通知調査

MY-NOTEPCの `C:\git\sodashitsu-windows-notify` にmainを実際にcloneし、Windows Node 24で依存導入とbuildが成功。別ポート17880と専用state/userDataを使い、実物Electronとproduction managed relayで接続・立ち絵生成を確認した。実デスクトップはロック中で、通知表示を抑制する仕様を確認。元の別PCでの通知不具合の原因とは断定していない。

sr-pcでもWindowsネイティブの別ポート17880・専用state/userDataで同じ接続まで確認した。sr-pcもロック中で、既存サインインサービスの復旧が未完了。実表示と音声の確認は未完了。PIN等の認証情報はこの記録に保存しない。
