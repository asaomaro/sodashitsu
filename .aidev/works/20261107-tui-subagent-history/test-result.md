# TUIの情報画面内で子の会話を読む

Base integration1ee52c84。Web履歴とは独立のTUI追加commit。通常paneの情報画面UsageDialogに取得可能な子の[会話]を表示し、Tab/Enter/クリックで同じdialog内を読み取り会話へ切り替える。Escは情報へ戻り、通常情報でのEsc/外側閉鎖/他overlayへの置換でdisposeする。既存アカウント一覧のTab/Enterは維持。入力欄や送信RPCは追加しない。

製品3files: TuiAppは既存RPC・再描画・接続/machine/client/dialog/終了のscope getterだけを渡す。UsageViewは親instance/kind/session/refkindとhasTranscriptをscopeへ結合し、選択・表示を管理。新SubagentTranscriptは既存agent.subagent_transcriptだけを1.5sごとに単発取得し、前後のscopeを照合、close/失効/not_foundで停止・保持内容を消去する。offset/reset/省略を反映。保持最大800entry、本文とtool名計1Mi文字、表示前plainTextで端末制御/Bidiを除去。無効・未取得を空履歴/0と偽装しない。実マシン/モデル/利用者pane操作なし。

- 関係3suites45tests pass。controllerは重複readなし・offset/reset/上限・制御文字・not_found・遅い結果破棄、UsageDialogは親instance/refkind/session/proof/connection/close失効、TuiApp/headless端末はTab→Enter→返答表示→Esc情報へ→Esc閉鎖/入力RPC0/停止後poll0を確認。既存accountキーも既存testがpass。
- protocol/core/TUI scoped build exit0、TUI型check exit0。全体checks重複なし。
- compiled UsageDialog＋Gridの生成fixtureを4テーマで実行し、指示/発言/道具/読むだけ、同dialog切替とEsc復帰を数値receiptと画面テキストへ保存。screen.mjs、screen-*.txtを目視し通常のpane/OS操作なし。これは生成recordのTUI表示検証で、各kind実履歴取得はbackendの別検証。
- old TuiApp/UsageView2source＋新controllerのscopeguardを否定したnegativeで8fail/37pass、old状態TUIを再buildしたcompiledscreenもfail。raw negative.txt/negative-screen.txt。
- 3製品sourceを保存済byteとSHA256で完全復元し、TUI再build0、45tests/4themecompiledscreen pass。restoration.jsonの3SHAが最終sourceと一致。controllerは新規なのでold版なし、scopeguard否定で失効回帰を捕まえることを確認した。
