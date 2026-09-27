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
