# Independent review

- /root/review_resource_monitor: メディア入力のIPC権限、上限、明示送信、遅延読取を独立レビュー。
  - 会話IDを含むcontext固定、表示済みcontextとfresh snapshot照合、変更時のtools配信・選択破棄を修正し再レビュー通過。
  - 最小化時の遅延upload拒否を修正し再レビュー通過。
- /root/review_bubble_resize: 通知の自然高計測、geometry、revision付きIPC、尻尾を独立レビュー。
  - cloneのスタイルをclassで維持、本文の数値line-heightを明示し再レビュー通過。
- Chromiumの通知キャプチャを目視。尻尾は2枚の三角形を重ね、接続点から余分な角が出ないことを確認。
