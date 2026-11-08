# 検証

固定製品source: `d531275c6edfb5c9469f998754718e94cc76e5c8`（共通4ea40e57→P2修正5d5cc22a→Web6c4136b6→TUI d531275c）。全リポジトリbuild/testは実行しない。

- 共通controller 23件、Web reader/新会話/UUID 41件、TUI新会話/reader 32件が成功。生成target/textのみ、実daemonや実providerへの送信なし。
- 共通P2負例: controller製品sourceだけ旧4eaへ戻すと、新4件が失敗。`.git/recovery/child-direct-p2/controller.ts`へ永続退避したsourceを復元し、SHA256一致・23件成功。`p2-negative.log`が生出力、`p2-restored.log`が再検証、`p2-restoration.json`に両SHA/exitを記録。core test-inclusive型0。
- 初回の中間Web型実行は環境世代の変更でexec/RAMが失われたため完了扱いにしない。未コミットbindingを会話内の既出差分から再構成して上記commitへ固定。今後の負例退避はRAMだけでなくgit管理領域内の専用recoveryへ永続保存する。
- 生成browser fixture: 実Vue/Pinia/Sidebar/子会話/読取部品をChromiumへ読み込み、formal capabilityのみdirect、送信前draft無配送、fresh lease、acceptedと完了の区別、unknown時draft保持/再送ボタン無効、親draft準備だけで送信なし、親checked明示送信、二重headerなし、4テーマ、focus/drag/resize/390px/ESC、pageerror0を確認。`browser.json`と生`browser.log`に結果、4PNGは生成情報のみ。One Lightの画像を実見。実モデルは呼んでいない。
- TUIは実Grid描画を関連テストから確認。直接/親の送信先、未知配送状態、2段階Enter、scope/close失効、長文を切り捨てず拒否する動作を確認。

exact d531 の Web/TUI test-inclusive型は両方exit0。続いて新Web/TUI会話hostの2製品sourceだけ旧6bへ戻すと Web7件/TUI12件と生成browserが失敗。git管理領域の永続recoveryから2sourceをSHA256完全一致で復元し、Web41件/TUI32件と同じbrowserが再成功した。`binding-restoration.json`と`negative-{web,tui,browser}.log`/`restored-{web,tui,browser}.log`が生出力。型実行中に製品sourceは変更していない。
