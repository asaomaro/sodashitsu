# 設計の独立点検

2026-10-17、実装者とは別コンテキストで新規文書5ファイルと必要な既存実装を点検。製品コード未変更のため、以下は実装バグではなく設計の補足指摘。

1. 複数Aへの配送先選択: B発行のdestination lease、候補一覧CLI、明示destination/viewer、一意でなければ未送信、失効時fallback禁止をdesignへ追記。
2. appと接続の世代: appGenerationとconnectionGenerationを分け、A1のみの再接続でA2を失効しない範囲をdesign/researchへ追記。
3. gateway cookie衝突: 予約namespace、HTTPSでの__Host/Secure/HttpOnly/Path=/、cookieの一意性検証、upstream除去、JS注入・異Path/DomainのPoCをdesign/tasksへ追記。

修正差分の独立再点検: 完了。3点の解消を確認し、追加の重要指摘なし。その後PC補助方式の許可を受け、P0実装とブラウザ実測へ進んだ。製品全体への配線は未完了。

文書内の相対リンク確認: 不正なし。以下は後続のP0コード点検。

## P0 gatewayの独立点検

対象: `packages/cli/src/preview/LoopbackGateway.ts`、同test、`scripts/remote-web-preview-poc.mjs`。

1. P2: 不正なWS handshakeが処理枠を消費したまま戻らない。32回拒否の後にGETが429となる実プロセス再現あり。socket closeをhandleUpgradeより前で監視し、例外経路でも解放する修正と回帰テストを追加。修正差分の再点検済み。
2. P1: 認証値のJS文字数比較だけではtimingSafeEqualのバイト長が合わず、非ASCII cookieのWS要求でプロセスが終了する。UTF-8 BufferのbyteLengthを先に比較する修正と、不正cookieのHTTP/WS拒否・後続HTTP継続の回帰テストを追加。修正差分の再点検済み。

2件とも修正前の失敗を確認し、修正後にテスト通過。追加の重要指摘なし。残る遠隔転送/製品配線/OS・browser差などを合格扱いにしていない。詳細は[test-result.md](test-result.md)を参照。

## CLI・転送・UIの独立レビュー

PreviewService/PreviewStreamsを独立点検し、停止中の非同期port検査後のopen、空WSメッセージのB側キュー件数、接続開始時の管理port再検査を修正。さらに依頼元切断/abort中の非同期検査はpending attempt失効で修正し、独立再レビューで解消確認。

全差分を別コンテキストでレビューし、helper→B方向WSの空メッセージ待ち行列に件数上限がないP2を修正（256件、pause/resume、failed後無視）。修正差分の独立再レビューで解消確認。新たな重要指摘なし。全体テストは実装側で行い、レビュー側で重複実行していない。

文書のfact-check（別コンテキスト）: 高リスク10主張を実コード/試験ログと照合。遠隔WS binaryの言いすぎとHTTP限定Forwarded再生成を訂正し、再確認で不一致0。詳細は[implementation.factcheck.md](implementation.factcheck.md)。

## 再起動後の追加PoC

`scripts/remote-web-preview-vite-poc.mjs`を別コンテキストで独立レビュー。実DOM/CSS/document維持とブラウザ受信フレームの判定、直接fallbackの誤認防止、loopback限定、cleanupを確認し、重要指摘なし。将来の補強案としてWS URLのlocalhost含有判定を実iframe host完全一致にできるが、現構成の合格を妨げるものではない。

Vite追加文書のfact-checkも独立実施。実測JSON/試験コード/公式資料に照合し、追加7主張で不一致0、引用13/13一致、lint欠落0。implementation.factcheck.mdへ追記済み。
