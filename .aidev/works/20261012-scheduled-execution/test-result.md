# 検証

- ビルド・型検査: 通過 (`/tmp/view-schedule-build.log`, `/tmp/view-schedule-typecheck.log`)。
- Scheduler: 一回のclaim/保存/再起動、繰り返しの欠落分抑制、同一予約競合、closeとの永続化競合、crash後の中断、無効化・削除時履歴を検証。
- agent.prompt: modal待ち中のabortで送信しないことを検証。
- TUI: 登録フォーム本文の改行、対象UUID保持、消失対象拒否、nativeプラグイン本文とsource切替、sidebarから予約/グラフの開閉、PTYに入力を流さないことを検証。
- Web: save待ちで別編集を閉じないことを検証。
- 保存: plugin terminalDisplayを含むsession保存・復元の往復。
- E2E: 予約の登録/名前編集/手動command実行/出力と終了結果/390pxモバイル編集、1件通過 (`/tmp/schedule-e2e-final.log`)。初回はselectのラベル検索が選択肢本文まで含むため待機。実DOMのアクセシブルrole/nameによる検索に修正し再実行。
- ビューとworkspace E2E: 3件通過 (`/tmp/view-schedule-e2e.log` の予約以外)。標準開発・検索/Grep・編集・Git・モバイル、tab/pane候補、workspace往復。
- 対照実験: `negative-controls.md`。修正部分だけ戻して失敗、元のバイト列へ復元を確認。
- 全体テスト: 607ファイル・10,572件を実行。10,571件通過、Appの画面名の旧期待値1件が失敗。端末・グラフ・状況・予約の4画面へ期待値を更新し、App 23件を再実行して全件通過 (`/tmp/view-schedule-all.log`, `/tmp/view-schedule-app-final.log`)。製品ソースの追加変更はなし。
- 実環境: handoff通過、8ペインを保持。更新後のschedule.list、graph.get、w3のPJファイル一覧RPCを確認。

端末グラフの枠・接続線・native座標D&D・Web座標非変更・選択ペインへのEnter移動、画面再オープンを検証。GraphView/Dispatcher/OuterTerminal harnessは全体テストでも通過。
