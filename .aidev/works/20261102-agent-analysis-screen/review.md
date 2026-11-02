# 独立レビュー

review_resource_monitorがUsageWorkContext・レポート指示・RPCを、review_bubble_resizeが画面分離・active切替・PC条件を点検。指摘修正後の再点検で必須指摘なし。

- report表示中のPC切替でも前PCの選択条件を失効する。
- 後続pane読取のawait中に先行paneが替わった場合も、全収集後に内部IDで除外する。
- 返却したverifyをモデル起動前／実行中の既存チェックへ合成する。内部ID・verifyはレポート用JSONへ含めない。
- 認証失効をcatchで未取得へ置き換えない。開いたfdはcheckが失敗してもfinallyで閉じる。

限定抜粋を生成先へ渡す点はユーザーの明示要求に基づく変更で、画面と文書に記載済み。数値用DBへ本文を保存しない。
