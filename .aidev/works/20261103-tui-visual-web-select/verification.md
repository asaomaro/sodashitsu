# 端末画面の情報整理とWebの選択肢一覧

## 実装と既存画面の点検

- MonitorView: 型付きsection/metric/table/warning行、囲みサマリー、グループ見出し、強調列見出し、色付き棒/比率/警告。広幅のプロセス一覧は固定列+詳細行、狭幅は折返し。取得/絞込み/数値の意味は維持。
- 共通pageHeaderを非base画面の状況/予約/外部接続/履歴/グラフ/分析/リソースへ適用。文字/ヒット座標を変えず見出し帯/太字を揃え、既存の選択と操作ボタン背景を維持。
- UsageDashboardはアカウント/エージェントのセクション帯、Connectionsはグループ帯と接続状態の印、Scheduleは有効/無効の印を色分け。既存のグラフ/履歴は操作位置・既存の色/枠を保ちタイトルを統一。
- Web共通CSSのselectにappearance:base-selectを追加。全テーマで一覧の外枠10px/項目6px、選択/ホバー/背景を配色。multiple/size指定は従来、未対応環境は@supportsでフォールバック。プラグインにも共通CSSを利用。

## 検証

- TUI全81ファイル758件成功。カード/警告/分析構成比の色、使用率との区別、タイトル変更時の文字/選択/内容維持を検証。
- root build/typecheck成功。最終復元後のTUI/Web個別buildも成功。
- 全19テーマ×3段階のChromiumソース検証成功。実Web設定のボタン配色selectもappearance=base-select、popup10px、option6pxを確認し、開いてEscで戻して保存値が変わらないことを確認。
- 外部cwd /tmpから稼働サーバへread-only RPCで分析/リソースを取得し、新描画のsmoke成功。pane操作やモデル呼出なし。
- 囲み/比較/親子/ツール/プロセス一覧を/tmp/soda-tui-visual-preview.html/pngで目視。Web実画面は/tmp/soda-web-picker-live.pngで目視。
- 独立レビューreview_bubble_resizeの構成比への危険色の誤用指摘を修正し、さらにusage明示フラグで説明文の割合も通常色へ限定。差分再レビュー完了、必須指摘なし。
- native popup修正、構成比色修正だけ取り消した負例がそれぞれ失敗。negative-*.txtへ原文保存、修正をbytes同一で復元。

Web差分の独立レビューreview_resource_monitorで、option色指定による無効項目の減光消失を検出。Web/assistant両方でoption:disabled/disabled optgroup配下をopacity .5とし、hover/focusを除外。全19×3のdisabled項目/optgroup配下2項目とassistant実UIテストが成功。減光修正だけ取り消す負例は失敗（negative-disabled-options.txt）。差分再レビュー完了、必須指摘なし。
