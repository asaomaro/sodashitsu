# 応答端末窓の初回サイズ追従

actor検証済みの端末窓だけ、client.view確立後からclient.fitを有効化する。ask-only窓は対象外。PaneLayoutは二重requestAnimationFrameの後に既存スロットル経由で再計測。フォント準備・visibility復帰・再接続にも対応。アンマウントで予約・リスナーを解放。

検証: AssistantResponse/PaneLayoutほか関連Web単体47件。修正だけ外し初回fitと初描画再計測のテスト失敗を確認、バイト一致で復元。生ログ negative-fit.txt / negative-measurement.txt。独立レビュー review_resource_monitorで必須指摘なし。

既存E2Eは変更点より前の通常画面のxterm初期表示（38行）でタイムアウト。30秒と90秒で同じ位置。425ccc1fの独立worktree（Webを当該版からビルド、サーバdistは今回サーバ変更なし）でも同じ38行で失敗したため、本変更の退行ではない。生ログは e2e-initial.txt / e2e-second.txt / e2e-main-baseline.txt。応答窓を直接開く初回サイズ確認を追加。

最終検証: pnpm build / pnpm typecheck 通過、関連Web単体47件通過。稼働Web画面の既存丸型picker/矢印開閉/8pxスクロールバーも維持。

直接応答窓に入るE2EもHTML部品の初期表示待ちでタイムアウトし、寸法の検証までは到達していない（e2e-direct.txt）。ブラウザで初回サイズ追従が通ったとは扱わない。実装と同期順序は47件の単体テストと独立レビューで検証。

追加E2Eの独立レビューも review_resource_monitor が実施し、必須指摘なし。初期表示停止のためfit成功未確認という制限を記録。
