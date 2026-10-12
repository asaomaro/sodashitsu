# 検証

- TUI実画面（OuterTerminal harness）: 左→右変更、端末領域の縮小、native入力の非漏出、未保存draftの一時切断保持。
- scope/placementのprotocol/schema、pane情報のtab active-pane source投影、band-onlyのpanel/float拒否とserver経由の帯移動。
- ExtensionHostで実際のsession.focus_changedを受けてpane再配信。
- plugin native本文を同一ドックで別displayへ切り替える表示確認。
- picker候補のscroll後mouse誤選択、無関係dialog破棄を回帰テスト。
- Web/TUI/server独立レビュー通過。
- build/typecheck通過、workspace-tools/selectionの実ブラウザ3件通過。
- 修正前対照のrawログは隣接workの`../20261012-scheduled-execution/negative-controls.md`。
- 全体テスト: 607ファイル・10,572件を実行。10,571件通過、Appの画面名の旧期待値1件が失敗。端末・グラフ・状況・予約の4画面へ期待値を更新し、App 23件を再実行して全件通過 (`/tmp/view-schedule-all.log`, `/tmp/view-schedule-app-final.log`)。製品ソースの追加変更はなし。
- 実環境: handoff通過、8ペインを保持。更新後のschedule.list、graph.get、w3のPJファイル一覧RPCを確認。
