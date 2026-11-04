# 認証画像接続の終了とcontrol通知の順序

## 事象と対応

sr-pcの実ロック解除後、画像専用接続の切断エラーで画面が終了し、手動再接続すると通常画像/操作が成功した。Providerはterminal通知の送信後に独立image socketをterminateする。別々のsocketのためrelayでimage切断が先着し、control側のsession_unlockedを受ける前にviewerを停止する経路がある。実ネットワークでの到着順の生観測はしておらず、生成した先着ケースでこの経路を再現している。

ready済みの認証画面（secure、elevatedではない）だけ、画像切断後に最大1秒terminal通知を待つ。その間controlを無効化してagentをrevokeし、viewerからの新規操作をすべて遮断する。provider側も限定したterminal以外のデータ/制御は受理しない。正式な通知が届けば既存の遷移処理で停止し、画面側の再接続につなぐ。通知がない場合は元のエラーで停止し、切断だけを根拠に再接続を許可しない。親socket終了も停止、明示stopも即停止。timerは停止時に回収する。通常/昇格画面の既存の即停止は維持する。

## 検証

- 先着→正式遷移、通知なしの1秒期限、viewer明示stop、parent closeの4ケース。待機中の操作再取得・キー転送とproviderからのcontrol再有効化を拒否し、不明な項目のある遷移通知も受理しない。
- 認証画面の待機分岐だけを無効にする負例で4ケースが失敗。negative.txtに生出力。元のbyte列とSHA256を照合して戻した後、DesktopRelay.test.ts全310件が成功（tests.txt）。
- pnpm buildとpnpm typecheck成功（build.txt、typecheck.txt）。
- source/test差分をreview_resource_monitorが独立点検し、terminal項目数・親終了・deadline分離検査の追加差分も再点検。必須指摘なし。

実環境へ反映後の自動再接続は、この時点で未確認。
