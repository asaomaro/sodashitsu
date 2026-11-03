# 設定画面とメニューの角丸統一

設定dialogはスクロールコンテナ・sticky headerを維持し、角丸形状でscrollbar端をクリップ。接続ビュー/その他のメニューはContextMenuと同じmenu色・余白・角丸・高さ・影を利用する。接続ビューのメニューに残っていたmodernの0.8em指定も除去。

- Web build（vue-tsc含む）成功。既存chunk size警告のみ。
- ViewerTabBar/ScreenSwitcher: 2 files / 4 tests passed。
- 実Chromium: 3メニューのcomputed style一致、dialog clipとradius一致、最下部/最上部スクロールと閉じる操作を確認。
- 独立レビュー review_bubble_resize: 全差分と追加font-size修正を再レビュー、必須指摘なし。

実ブラウザ検証の途中では接続ビューの項目paddingが4.48px、基準が5.6pxだったため一致判定が失敗。残存する0.8em指定の除去後は全項目一致した。永続設定の変更やpaneへの入力は行っていない。
