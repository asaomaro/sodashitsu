# Web段階1（readonly/親依頼）

- base `7d91e568`、専用worktree、通常設定/利用者pane/Windows/実モデル操作0。
- Web関連3file236test成功、Web全source/testの型check成功。raw: restored.log/typecheck.log。
- 実Vue/ブラウザ4テーマ（操舵室通常/ダーク/Dracula/One Light）で子選択の専用窓・情報内の履歴/会話button撤去・親子名・既存会話本文・親下書き編集のみでは送信0を確認。親へ明示送信した場合だけchecked API1、子send0。move/resize/focus/390px狭幅も確認。browser.json/log/png。
- 元Sidebar/PaneInfoの2製品sourceに戻すと3test失敗＋実DOMでも旧情報button残存を検出。raw negative.log/negative-browser.log。
- 2製品sourceをbyteExactで復元、restoration.jsonにSHA記録。復元後236pass＋実DOM成功。
- 他instance/kind/refkind/session/machine/client/接続への切替はwindow/旧結果を消去。子hasTranscriptの明示失効は本文停止、一覧から終了子が外れた場合だけ同parent内の既取得grant閲覧を維持。親blockedでは送信0、checked API非対応時にunchecked fallbackしない。

これは段階1であり、正式control/send能力接続、TUI移行、終了子一覧入口、新子usage表示は未完としてtasks.mdに保持する。公開製品機能全体の完了とは主張しない。新規fixtureの全会話本文・名前・idは生成値のみ。

## TUI段階2（readonly/親依頼）

- 6file96関連test成功、TUI型check/build成功。raw tui-restored.log/tui-typecheck.log。
- agents子行のmouse hit→専用会話WindowOverlay、既存子一覧Tab/Enterのkeyboard入口を実app harnessで確認。情報内履歴導線は撤去し、モデル/effort/状態は維持。
- 新controller側は既存800件/1Mi文字のread-only readerを再利用。instance/kind/refkind/session/connection/close/proofのlate結果を拒否し、scope失効で下書きも破棄。P→親下書き入力だけでは送信0、確認後に明示送信だけchecked API、blockedでは送信0。
- 4製品sourceを旧7d91へ一時置換すると3test失敗、4source byteExact復元後96test成功。tui-restoration.json/negative/restored生log。
- 実compiled TUI Gridを4テーマで生成。親子名・公開生成本文・親宛先/下書き・送信0を検証。tui-screen.mjs/json/テーマ別txt。実device/利用者pane/実モデル呼出0。
- 正式direct能力、終了子一覧入口、子usage表示は引き続き未完。Windows作業は停止継続。
