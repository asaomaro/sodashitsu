# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [should][conv:-] packages/tui/src/modes/HelpDialog.ts:195 絞り込みの欄の開始位置と幅を文字数で数え、全角のラベルに重なりカーソルがずれる / 対応: 修正済（4e9fdb0。ラウンド1。負の確認 43 本）
- [should][conv:-] packages/tui/src/modes/dialogs.ts:360 ListDialog のクリックが見えている行の範囲を確かめず、画面外の行を実行しうる / 対応: 修正済（4e9fdb0。ラウンド1。負の確認 43 本）
- [nit][conv:-] packages/tui/src/modes/HelpDialog.ts:158 q で閉じるが web は閉じない（コメントと食い違い） / 対応: 修正済（4e9fdb0。ラウンド1。負の確認 43 本）
- [nit][conv:-] packages/tui/src/modes/TextInput.ts:92 DEL・C1 の制御文字が名前に入る / 対応: 修正済（4e9fdb0。ラウンド1。負の確認 43 本）
- [nit][conv:-] packages/tui/src/modes/ContextMenu.ts:183 短い端末で見えない項目へ移動して実行できる / 対応: 修正済（4e9fdb0。ラウンド1。負の確認 43 本）
- [must][conv:-] packages/tui/src/input/mouse.ts:120-125,200-206 下へ分割した境界の当たりが名前の行を覆い、名前のドラッグとクリックの焦点が効かず、クリックで比率が動く / 対応: 修正済（4e9fdb0。ラウンド1。負の確認 43 本）
- [must][conv:-] packages/tui/src/input/mouse.ts:258-259,391-396 語の選択とコピーがセルの列を文字列の添字として使い、全角の行でずれる / 対応: 修正済（4e9fdb0。ラウンド1。負の確認 43 本）
- [must][conv:-] packages/tui/src/input/mouse.ts:1-501 T4 のリンクを開く（M6）とサイドバーの区画の境界のドラッグが未実装 / 対応: 修正済（4e9fdb0。ラウンド1。負の確認 43 本）
- [should][conv:-] packages/tui/src/input/mouse.ts:98-104,462-466 離しを取りこぼすとドラッグが残り、次のクリックを取り違える / 対応: 修正済（4e9fdb0。ラウンド1。負の確認 43 本）
- [should][conv:-] packages/tui/src/input/mouse.ts:383-385 代替画面でマウスのモードが無い pane のホイールが効かない（herdr・xterm.js は矢印キー） / 対応: 修正済（4e9fdb0。ラウンド1。負の確認 43 本）
- [nit][conv:-] packages/tui/src/input/mouse.ts:231-232,303-304,380 切り取りの余白でのクリックが pane の大きさを超える座標を送る / 対応: 修正済（4e9fdb0。ラウンド1。負の確認 43 本）
- [nit][conv:-] packages/tui/src/input/mouse.ts:102-104 1003 のモードの pane に動きが届かない / 対応: 修正済（4e9fdb0。ラウンド1。負の確認 43 本）
- [must][conv:-] packages/tui/src/term/CopyTarget.ts:194 copy モードが文字列の添字とセルの列を混ぜ、全角の行で強調と写しが食い違う / 対応: 修正済（4e9fdb0。ラウンド1。負の確認 43 本）
- [should][conv:-] packages/tui/src/term/CopyTarget.ts:114 折り返しの行に改行を入れて写す / 対応: 修正済（4e9fdb0。ラウンド1。負の確認 43 本）
- [should][conv:-] packages/tui/src/term/CopyTarget.ts:252 検索が折り返しをまたぐ一致を見つけない / 対応: 修正済（4e9fdb0。ラウンド1。負の確認 43 本）
- [should][conv:-] packages/tui/src/term/CopyTarget.ts:264 検索の後の y が空を写して「コピーしました」を出す / 対応: 修正済（4e9fdb0。ラウンド1。負の確認 43 本）
- [should][conv:-] packages/tui/src/term/CopyTarget.ts:90 copy モードのまま別の pane へ移ると元の pane が遡ったまま残る・カーソルが古い / 対応: 修正済（4e9fdb0。ラウンド1。負の確認 43 本）
- [nit][conv:-] packages/tui/src/term/CopyTarget.ts:56 スクロールバックの切り詰めで選択がずれる / 対応: 修正済（4e9fdb0。ラウンド1。負の確認 43 本）
- [should][conv:-] packages/tui/src/actions/TuiDispatcher.test.ts:111-121 全操作の試験が投げないことしか見ず、run に網羅の検査（never）も無い / 対応: 修正済（4e9fdb0。ラウンド1。負の確認 43 本）
- [nit][conv:-] packages/tui/src/app/TuiApp.ts:401-402 b38e1f0 の時点で copy モードから抜けられない（T3 で直った中間の状態） / 対応: 許容（squash で 1 コミットになる。D6）
- [nit][conv:-] packages/tui/src/actions/TuiDispatcher.ts:1040-1045 クリップボードの読み取りが未配線で、空でも「読めませんでした」と出す / 対応: 修正済（4e9fdb0。ラウンド1。負の確認 43 本）
- [nit][conv:-] packages/tui/src/actions/TuiDispatcher.ts:540-547 自動グループの折りたたみの prefs.set の失敗を黙って捨てる / 対応: 修正済（4e9fdb0。ラウンド1。負の確認 43 本）
- [should][conv:-] packages/tui/src/render/chrome/sidebar.ts:66 + packages/tui/src/layout/computeLayout.ts:81 狭い幅で navigate モードの選択が見えない（herdr は switcher を出す） / 対応: 修正済（df65107。ラウンド2。負の確認 39 本）
- [should][conv:-] packages/tui/src/render/chrome/narrowHeader.ts:57 狭い幅の見出しが「接続できません」・知らせ・session 名を出さない（tab バーの写しがずれている） / 対応: 修正済（df65107。ラウンド2。負の確認 39 本）
- [should][conv:-] packages/tui/src/app/TuiApp.narrow.test.ts:71 広い→狭いへの切り替えと 63/64 の境界の試験が無い / 対応: 修正済（df65107。ラウンド2。負の確認 39 本）
- [nit][conv:-] packages/tui/src/render/chrome/narrowHeader.ts:73-74 tab が見つからないと tab 0/n・tab の名前を出さない / 対応: 修正済（df65107。ラウンド2。負の確認 39 本）
- [nit][conv:-] packages/tui/src/render/chrome/narrowHeader.ts:35-45 モードの印を tabBar の MODE_BADGES から引かない / 対応: 修正済（df65107。ラウンド2。負の確認 39 本）
- [nit][conv:-] packages/tui/src/layout/computeLayout.ts:92-94 狭い幅で焦点の pane が無いと分割の木ごと並べる / 対応: 修正済（df65107。ラウンド2。負の確認 39 本）
- [must][conv:-] packages/tui/src/term/bufferText.ts:117-121 サロゲートペアの文字（絵文字）の後の検索の一致の位置がずれ、違う文字を写す / 対応: 修正済（df65107。ラウンド2。負の確認 39 本）
- [should][conv:-] packages/tui/src/term/bufferText.ts:82-86,115-123 行末に収まらず折り返した全角の前の空きセルを空白として写し・検索する / 対応: 修正済（df65107。ラウンド2。負の確認 39 本）
- [should][conv:-] packages/tui/src/app/TuiApp.ts:165-174 copy モードから prefix で別のモードへ移ると leave() せず遡ったまま残る / 対応: 修正済（df65107。ラウンド2。負の確認 39 本）
- [should][conv:-] packages/tui/src/term/CopyTarget.ts:49-52 選択の行が切り詰めで消えると 0 行目へ移り、無関係な文字を写す / 対応: 修正済（df65107。ラウンド2。負の確認 39 本）
- [nit][conv:-] packages/tui/src/term/CopyTarget.ts:336,348-349 toLowerCase で長さが変わる文字の後の一致がずれる / 対応: 修正済（df65107。ラウンド2。負の確認 39 本）
- [must][conv:-] packages/tui/src/app/TuiApp.ts:714-720 ?1003l だけ送ると外側の端末のマウス報告が全部止まる / 対応: 修正済（df65107。ラウンド2。負の確認 39 本）
- [must][conv:-] packages/tui/src/app/TuiApp.ts:556-561 Windows のリンクを cmd /c start で開き、& などで任意のコマンドが走る / 対応: 修正済（df65107。ラウンド2。負の確認 39 本）
- [should][conv:-] packages/tui/src/input/mouse.ts:166-168,405-409 境界を掴んだだけで 1 セル動く / 対応: 修正済（df65107。ラウンド2。負の確認 39 本）
- [should][conv:-] packages/tui/src/input/mouse.ts:455 ホイールの座標が pane の大きさに収めていない / 対応: 修正済（df65107。ラウンド2。負の確認 39 本）
- [should][conv:-] packages/tui/src/input/mouse.ts:460,466 横のホイールを上へのホイールとして扱う / 対応: 修正済（df65107。ラウンド2。負の確認 39 本）
- [should][conv:-] packages/tui/src/term/bufferText.ts:118-121 リンクの当たりがサロゲートの後でずれる・全角の右半分 / 対応: 修正済（df65107。ラウンド2。負の確認 39 本）
- [should][conv:-] packages/tui/src/render/chrome/sidebar.ts:104-105 区画の境界を上げると workspace の一覧が切れて見えず押せない / 対応: 修正済（df65107。ラウンド2。負の確認 39 本）
- [should][conv:-] packages/tui/src/input/mouse.ts:446-450 tab バーのホイール・pane のスクロールバー（M9）・サイドバーのボタン（M14）・押したままの語単位の選択（M5）が未実装なのに一覧は「対応」 / 対応: 修正済（df65107。ラウンド2。負の確認 39 本）
- [should][conv:-] packages/tui/src/app/TuiApp.ts:714-720 mouseCapture を見ずに ?1003h を出す / 対応: 修正済（df65107。ラウンド2。負の確認 39 本）
- [nit][conv:-] packages/tui/src/input/mouse.ts:115,539-542 ドラッグを捨てるとき pane へ離しを送らない / 対応: 修正済（df65107。ラウンド2。負の確認 39 本）
- [nit][conv:-] packages/tui/src/input/mouse.ts:290,312,322 遡っているときの切り取りの余白の行・ダブルクリックの全角・従来形式の動きのボタン / 対応: 修正済（df65107。ラウンド2。負の確認 39 本）

## ラウンド 1（2026-09-27）
- [should][conv:-] packages/tui/src/app/TuiApp.ts:828 リンクで file: も許し、Windows で実行ファイルを起動しうる（web の D110 は http/https だけ） / 対応: 修正済（fcb94c3。負の確認 8 本）
- [should][conv:-] packages/tui/src/input/mouse.ts:746 OSC 8 のリンクを認識しない・一覧（H09・M6）の記述と食い違う / 対応: 修正済（fcb94c3。負の確認 8 本）
- [should][conv:-] packages/tui/src/input/mouse.ts:489,507 copyOnSelect の設定を読まずに常に写す / 対応: 修正済（fcb94c3。負の確認 8 本）
- [should][conv:-] packages/tui/src/modes/TextInput.ts:28-56 入力欄に Alt+B/F が無い（一覧 H27b は対応と書く） / 対応: 修正済（fcb94c3。負の確認 8 本）
- [should][conv:-] packages/tui/src/render/chrome/narrowHeader.ts:16 herdr の render_mobile_header の形に倣うのに出典・NOTICE が無い / 対応: 修正済（fcb94c3。負の確認 8 本）
- [nit][conv:-] packages/tui/src/modes/ContextMenu.ts:66 読めない「貼り付け」を黙って何もしない / 対応: 修正済（fcb94c3。負の確認 8 本）
- [nit][conv:-] docs/tui-parity.md:48 H19c のサイドバー・ヘルプのスクロールバーが無いのに対応と書く / 対応: 06 で一覧を直す（D15）
- [nit][conv:-] packages/tui/src/input/mouse.ts:512-522 境界のドラッグの比率を動きのたびに送る（web は 50ms で間引く） / 対応: 修正済（fcb94c3。負の確認 8 本）

## ラウンド 2（2026-09-27）
- [should][conv:-] packages/tui/src/term/PaneTerminal.ts:115-133,150-170 OSC 8 のリンクを始まりと終わりの位置だけで覚え、上書き・代替画面・カーソル移動の後も見えない URL を開く / 対応: 修正済（6c65ebb。xterm のセルごとのリンクの id を読む形に変えた。負の確認済み）
- [nit][conv:-] packages/tui/src/term/PaneTerminal.ts:121,133 大きさが変わって折り返し直すとリンクの位置がずれる / 対応: 修正済（6c65ebb。xterm のセルごとのリンクの id を読む形に変えた。負の確認済み）
- [nit][conv:regression-negative-control] packages/tui/src/input/mouse.r2.test.ts:305-325 OSC 8 の試験に上書き・代替画面・折り返しの負の場合が無い / 対応: 修正済（6c65ebb。xterm のセルごとのリンクの id を読む形に変えた。負の確認済み）

## ラウンド 3（2026-09-27）
- 指摘なし（6c65ebb を主エージェントが直読。位置で覚える形を捨て、xterm のセルごとのリンクの id を読む形になったので、上書き・代替画面・カーソルの移動・折り返し直しの 4 つが構造的に解消した。内部を読む点は decisions D16。負の確認の記録あり）
