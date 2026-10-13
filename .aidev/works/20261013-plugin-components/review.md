# 独立レビュー

別コンテキスト `review_plugin_components` が差分全体を点検。

1. 部品追加ごとのpane.subscribeが元端末・既存ミラーをSNAPSHOT/RISで初期化し、選択・スクロールを失う（P2）。購読済みはserializeを新ミラーだけへ配信するよう修正。writeバリア以降のイベント順も検証。
2. ミラーのacquireが可視と扱われ、clip0でも背景エージェント通知を既読にする（P2）。LRU保持とisVisibleを分離し、clip0はunmount。visibility:hiddenもSDKで扱う。

修正差分の独立再レビュー: 必須指摘なし。
最終の5000行serialize上限・遅延Nerd Fontのrefresh配信も差分再レビュー: 必須指摘なし。

E2Eで背景別tab・再接続・pane閉鎖を確認。修正を戻す負の対照も2件失敗することを確認し、製品ソースをバイト一致で復元した（test-result.md）。
