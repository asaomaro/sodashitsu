# 起動元paneへのエージェント端末中継の独立レビュー

実装base79eadbcf / source3f615441。review_pointer/review_transferが実装セッションとは別コンテキストで差分全体を点検。

必須指摘と対応:

- requester切断中のcreate/claim/openが進むrace: 両WsGatewayのclientGoneから同期失効し、createはlive認可callbackを必須化。非同期検査後・要求公開直前とvalidate/operateの待機後にstate/claim/接続を再検査。
- 入力期限がCLI→B/非同期検査の遅延を含まない: B発行のランダム1秒leaseをキー受信時に固定し、Bで更新せず期限を評価。Aにも残期限を返してRPC往復時間を差し引く。
- 親shellへ戻る入力漏れ: terminalHereはwork-agent-runを専用PTYのrootとして起動し、親shellを持たない。Ctrl+Z byteは適用前に拒否。
- 質問がRPC既定10秒で取消: start/readの短いRPCへ変更し本来の質問期限まで待機。
- should: snapshotにフラグを付け、CLI decoder/query filterの途中状態を破棄。

修正差分の再レビューで必須事項はすべて解消。create追加raceの再レビューも2件通過し、追加mustなし。新規moduleの最後のprettierは書式だけで動作を変えない。実CLIアカウント/実OS入力の操作、重複全体テスト、レビュアーによるソース変更は行っていない。
