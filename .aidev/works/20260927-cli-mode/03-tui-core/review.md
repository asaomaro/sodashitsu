# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [should][conv:-] packages/tui/src/app/processIo.ts:24-27 SIGHUP の後の EIO で error の受け手が外れていて落ちうる（attach.ts と同じ穴） / 対応: 修正済（d6e3c5c〜452b6fb。ラウンド1。直した箇所の変異でテストが落ちることを確認）
- [should][conv:-] packages/tui/src/app/TuiApp.ts:22-30 端末が無いとき startupNotice（初回の token）を出さずに終わる / 対応: 修正済（d6e3c5c〜452b6fb。ラウンド1。直した箇所の変異でテストが落ちることを確認）
- [should][conv:-] packages/tui/src/app/TuiApp.test.ts:29,40,53 有効にした全モードが RESTORE で戻ることを検査していない / 対応: 修正済（d6e3c5c〜452b6fb。ラウンド1。直した箇所の変異でテストが落ちることを確認）
- [nit][conv:-] packages/tui/src/app/TuiApp.ts:37 mouseCapture の設定が未配線で印も無い / 対応: 修正済（d6e3c5c〜452b6fb。ラウンド1。直した箇所の変異でテストが落ちることを確認）
- [should][conv:-] packages/tui/src/term/PaneTerminal.ts:70-76,156-161 DECSTR（CSI ! p）でカーソルの表示・形の追跡を戻さない / 対応: 修正済（d6e3c5c〜452b6fb。ラウンド1。直した箇所の変異でテストが落ちることを確認）
- [nit][conv:-] packages/tui/src/term/PaneTerminal.ts:150 DECSCUSR の Ps>6 を bar にする（xterm は無視） / 対応: 修正済（d6e3c5c〜452b6fb。ラウンド1。直した箇所の変異でテストが落ちることを確認）
- [nit][conv:-] packages/tui/src/term/PaneRegistry.ts:91,105 subscribe の scrollbackLines を作った時の値でなく今の値で送る / 対応: 修正済（d6e3c5c〜452b6fb。ラウンド1。直した箇所の変異でテストが落ちることを確認）
- [nit][conv:-] packages/tui/src/term/PaneRegistry.ts:60-62 resize を書き込みの待ち行列の後にしない（web と同じ） / 対応: 修正済（d6e3c5c〜452b6fb。ラウンド1。直した箇所の変異でテストが落ちることを確認）
- [should][conv:-] packages/tui/src/net/nodeTransport.ts:24 証明書の指紋の照合と実物の通信の部品にテストが無い / 対応: 修正済（d6e3c5c〜452b6fb。ラウンド1。直した箇所の変異でテストが落ちることを確認）
- [nit][conv:-] packages/tui/src/net/nodeTransport.ts:61 https で指紋が無いと同期の例外が拾われずに落ちうる / 対応: 修正済（d6e3c5c〜452b6fb。ラウンド1。直した箇所の変異でテストが落ちることを確認）
- [nit][conv:-] packages/tui/src/net/nodeTransport.ts:24 指紋の照合が server の launch/localHttp.ts と二重 / 対応: 修正済（d6e3c5c〜452b6fb。ラウンド1。直した箇所の変異でテストが落ちることを確認）
- [nit][conv:-] packages/tui/src/net/TuiNet.ts:130 1 回の停止の間にログインの確かめが 1 回だけで、その後に止まると「再接続中」のまま / 対応: 修正済（d6e3c5c〜452b6fb。ラウンド1。直した箇所の変異でテストが落ちることを確認）
- [nit][conv:-] packages/tui/src/app/TuiApp.ts:107 detach の後に stop が client.detach をもう一度送る / 対応: 修正済（d6e3c5c〜452b6fb。ラウンド1。直した箇所の変異でテストが落ちることを確認）
- [should][conv:-] packages/tui/src/render/Screen.ts:132 chrome の文字列で幅 0 の結合文字を捨てる（NFD の名前が崩れる） / 対応: 修正済（d6e3c5c〜452b6fb。ラウンド1。直した箇所の変異でテストが落ちることを確認）
- [should][conv:-] packages/tui/src/render/paintPane.ts:33-44 太字のパレット 0〜7 を明るい色へ寄せない（web の xterm の既定と違う） / 対応: 修正済（d6e3c5c〜452b6fb。ラウンド1。直した箇所の変異でテストが落ちることを確認）
- [nit][conv:-] packages/tui/src/layout/computeLayout.ts:81 narrowThreshold が 30 未満だと pane の幅が最小を割る / 対応: 修正済（d6e3c5c〜452b6fb。ラウンド1。直した箇所の変異でテストが落ちることを確認）
- [should][conv:-] packages/tui/src/input/decode.ts:218-221 ESC ESC を常に単独の Escape にし、Ctrl+Alt+[（推奨の直接のキー）が効かない / 対応: 修正済（d6e3c5c〜452b6fb。ラウンド1。直した箇所の変異でテストが落ちることを確認）
- [should][conv:-] packages/tui/src/input/decode.ts:210-216 ESC ] / P / _ / ^ を常に OSC 等の始まりとして持ち、Alt+] 等が効かず、BEL や ESC \ が来るまでの打鍵を捨てうる / 対応: 修正済（d6e3c5c〜452b6fb。ラウンド1。直した箇所の変異でテストが落ちることを確認）
- [should][conv:-] packages/tui/src/input/encode.ts:4-7,63-70 キーパッドのモード（DECKPAM）に合わせた符号化が無い（design は DECCKM とキーパッド） / 対応: 修正済（d6e3c5c〜452b6fb。ラウンド1。直した箇所の変異でテストが落ちることを確認）
- [nit][conv:-] packages/tui/src/input/decode.ts:200-208 SS3 を常に 3 バイトとして読み、修飾つきの SS3 が崩れる / 対応: 修正済（d6e3c5c〜452b6fb。ラウンド1。直した箇所の変異でテストが落ちることを確認）
- [nit][conv:-] packages/tui/src/input/decode.ts:198,201 25ms の待ちが途中まで届いたマウスや CSI にも掛かり、遅い回線で崩れる / 対応: 修正済（d6e3c5c〜452b6fb。ラウンド1。直した箇所の変異でテストが落ちることを確認）
- [nit][conv:-] packages/tui/src/input/encode.ts:25-33 Ctrl+3〜8・Ctrl+/・Ctrl+- の従来のバイトが無い・CSI u の Shift+文字が小文字になる / 対応: 修正済（d6e3c5c〜452b6fb。ラウンド1。直した箇所の変異でテストが落ちることを確認）
- [must][conv:-] packages/tui/src/input/decode.ts:246-259 Esc の直後に届いたマウス・フォーカス・貼り付けの始まりで Esc が消えるか事象が壊れる（ESC ESC [ を一律に Alt＋列として読む） / 対応: 修正済（6b76ec0。ラウンド2。負の確認の生の出力は scratchpad/03-negative-control.txt → test-result.md）
- [should][conv:-] packages/tui/src/input/encode.ts:91 従来の列に直せない modifyOtherKeys・CSI u のキーを拡張列のまま pane へ送る / 対応: 修正済（6b76ec0。ラウンド2。負の確認の生の出力は scratchpad/03-negative-control.txt → test-result.md）
- [should][conv:regression-negative-control] packages/tui/src/app/TuiApp.ts:260-265 待ち時間を decoder.waitMs に替えた変更を TuiApp の段で確かめるテストが無い / 対応: 修正済（6b76ec0。ラウンド2。負の確認の生の出力は scratchpad/03-negative-control.txt → test-result.md）
- [should][conv:regression-negative-control] .aidev/works/20260927-cli-mode/03-tui-core/review.md:20-23 負の確認の生の出力が記録に無い / 対応: 修正済（6b76ec0。ラウンド2。負の確認の生の出力は scratchpad/03-negative-control.txt → test-result.md）
- [nit][conv:-] packages/tui/src/input/decode.ts:261-269 Esc 2 回のすばやい押下が ctrl+alt+[（previous_tab の推奨キー）と重なる / 対応: 修正済（6b76ec0。ラウンド2。負の確認の生の出力は scratchpad/03-negative-control.txt → test-result.md）
- [nit][conv:-] packages/tui/src/input/decode.ts:228,286 CSI・SS3 の頭の 150ms の待ちで Alt+[ / Alt+O の後の文字が列として読まれる / 対応: 修正済（6b76ec0。ラウンド2。負の確認の生の出力は scratchpad/03-negative-control.txt → test-result.md）
- [nit][conv:-] packages/tui/src/input/decode.ts:234-240 問い合わせていないのに OSC/DCS の応答として捨て、Alt+] と Ctrl+G が消えうる / 対応: 修正済（6b76ec0。ラウンド2。負の確認の生の出力は scratchpad/03-negative-control.txt → test-result.md）
- [nit][conv:-] packages/tui/src/input/decode.ts:346-349 SGR マウスの拡張ボタン（128〜131）を左ボタンとして扱う / 対応: 修正済（6b76ec0。ラウンド2。負の確認の生の出力は scratchpad/03-negative-control.txt → test-result.md）
- [nit][conv:-] packages/tui/src/input/decode.ts:327-330,400 X10 形式のマウスを文字のごみとして pane へ送る・接続が開いていない間の打鍵を黙って捨てる / 対応: 修正済（6b76ec0。ラウンド2。負の確認の生の出力は scratchpad/03-negative-control.txt → test-result.md）
- [should][conv:-] packages/server/src/main.ts:143 + packages/server/src/launch/tuiCommand.ts:55 端末版の動的 import が裏のサーバの起動の後で、失敗すると生のスタックと起動したままのサーバが残る / 対応: 修正済（c42d81c）
- [should][conv:-] packages/server/src/launch/soda.pty.integration.test.ts:63,163,184 待ちの時間切れで pty の子を kill しない / 対応: 修正済（c42d81c）
- [should][conv:-] packages/server/src/launch/soda.pty.integration.test.ts:145-147 開発者のシェルとプロンプトに依存する待ち / 対応: 修正済（c42d81c）
- [nit][conv:-] packages/server/src/launch/soda.pty.integration.test.ts:76 build が無いと黙って skip・古い dist で走りうる / 対応: 修正済（c42d81c）
- [nit][conv:-] packages/tui/src/net/TuiNet.ts:208 コメントのずれ・tuiTarget.ts:4 の TuiTarget の二重の定義 / 対応: 修正済（c42d81c）

## ラウンド 1（2026-09-27）
- [should][conv:-] packages/tui/src/net/TuiNet.ts:167-181 再接続中のログインの失敗を一律に「サーバが止まった」として終える（handoff・一時的な通信の失敗・起動の途中でも終わる） / 対応: 修正済（b9ed77b。負の確認済み）
- [should][conv:-] packages/tui/src/render/Screen.ts:182-257 herdr の render_ansi.rs の手順を写したのに出典・Apache-2.0 の表示と NOTICE が無い / 対応: 修正済（b9ed77b。負の確認済み）
- [should][conv:-] packages/tui/src/render/color.ts:29-32 truecolor の判定が COLORTERM だけで、SSH 越し（COLORTERM が届かない）で 256 色に落ちる / 対応: 修正済（b9ed77b。負の確認済み）
- [should][conv:-] packages/tui/src/net/TuiNet.test.ts:44 端末版 2 つの同時接続（AC12・切り取り）を確かめるテストが無い / 対応: 修正済（b9ed77b。負の確認済み）
- [nit][conv:-] packages/tui/src/net/TuiNet.ts:173-177 再接続の確かめのたびに新しいセッションを作り、古いものをログアウトしない / 対応: 修正済（b9ed77b。負の確認済み）

## ラウンド 2（2026-09-27）
- [should][conv:-] packages/tui/src/net/TuiNet.ts:261-269 サーバが生きているのにログインが通らない状態（別のポートで再起動・local-auth.json が読めない）で、上限も知らせも無く再接続中のまま / 対応: 修正済（bfd9399。負の確認済み）
- [should][conv:-] packages/protocol/src/messages.ts:477 / packages/tui/src/model/PrefsModel.ts:97 colorMode が共有の設定で、端末ごとに違う対応を上書きしてしまい、SODA_TRUECOLOR より優先される / 対応: 修正済（bfd9399。負の確認済み）
- [nit][conv:-] packages/tui/src/render/Renderer.ts:43-47 色のモードが変わらなくても setColorMode が全部を描き直させる / 対応: 修正済（bfd9399。負の確認済み）
- [nit][conv:-] packages/server/src/launch/findOrStart.ts:397-405 pidAlive が StateDirLock.isPidAlive の写し / 対応: 修正済（bfd9399。負の確認済み）
- [nit][conv:regression-negative-control] .aidev/works/20260927-cli-mode/03-tui-core/test-result.md:22,31 同時接続のテストの負の確認が無いのに「追記」と書き、AC12 の行が古い・最初の変異が落ちなかった経緯が書かれていない / 対応: 修正済（test-result.md を直した。同時接続は新しい機能の試験で直しではないので負の確認の対象外）

## ラウンド 3（2026-09-27）
- 指摘なし（bfd9399 を主エージェントが直読。ラウンド 2 の 4 件の解消を確認：30 秒の上限と知らせ・colorMode を tui-state へ移し SODA_TRUECOLOR を最優先・Renderer の早期 return・isPidAlive の共用。負の確認の記録あり）
