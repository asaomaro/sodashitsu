# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [should][conv:-] packages/tui/src/settings/SettingsWriter.ts:37-38 prefs.set の失敗（上限超え）で変更を捨てる（D10 は localOnly で残す） / 対応: 修正済（1ca74f6。ラウンド1。負の確認 9 本）
- [should][conv:-] packages/tui/src/settings/keySection.ts:78 キーの衝突の検査に独自コマンドを含めず、独自コマンドがあっても「ありません」と出す / 対応: 修正済（1ca74f6。ラウンド1。負の確認 9 本）
- [should][conv:-] packages/tui/src/settings/sections.ts:623 空の入力が 0 として通り、0x40・1e2 も通る / 対応: 修正済（1ca74f6。ラウンド1。負の確認 9 本）
- [nit][conv:-] packages/tui/src/settings/keySection.ts:283 上書きが無くても「既定に戻す」を出す / 対応: 修正済（1ca74f6。ラウンド1。負の確認 9 本）
- [nit][conv:-] packages/tui/src/settings/SettingsWriter.ts:48 tui の節を丸ごと送り、失敗した A が B の要求に乗って保存される / 対応: 修正済（1ca74f6。ラウンド1。負の確認 9 本）
- [must][conv:-] packages/tui/src/input/decode.ts:246-254 OSC 11 の応答が読みで割れると Alt+] と文字として pane へ漏れる（今は端末版が問い合わせる） / 対応: 修正済（9dbde9b。負の確認 11 本）
- [nit][conv:-] packages/tui/src/render/cssColor.ts:60-63 rgb(1 2 3 4)・混在の % を通し、web が落とす値を保存する / 対応: 修正済（9dbde9b。負の確認 11 本）
- [nit][conv:-] packages/tui/src/render/chrome/sidebar.ts:216-217 2 行の項目の 2 行目が見えるところまで送らない / 対応: 修正済（9dbde9b。負の確認 11 本）
- [nit][conv:-] packages/tui/src/render/Renderer.test.ts:99-100,118 サイドバーの既定の変化（エージェント 2 行）が decisions に無い・試験を緩めた / 対応: 修正済（decisions D17）。試験の緩めは修正済（9dbde9b）
- [should][conv:-] packages/tui/src/notify/terminalNotify.ts:58-62 通知の文字から C1（U+0080〜009F）と CAN・SUB を除かず、ESC 無しで外側の端末へ制御を送りうる / 対応: 修正済（35191e9。負の確認 5 本）
- [should][conv:-] packages/tui/src/app/TuiApp.ts:256-257 見えているかの判定が前の描画の割り付けを使い、同じ打鍵での切り替えを取り違える / 対応: 修正済（35191e9。負の確認 5 本）
- [should][conv:-] packages/tui/src/modes/NotificationList.ts:51-53 一覧を開いている間に待ち行列が縮むと削除で TypeError / 対応: 修正済（35191e9。負の確認 5 本）
- [nit][conv:-] NOTICE:42-47 herdr から写した試験の値のファイルが NOTICE と README に無い / 対応: 修正済（35191e9。負の確認 5 本）
- [must][conv:-] packages/tui/src/app/TuiApp.ts:435-438 別のマシンを見ている間も prefs.get/set/changed を遠くのサーバとやりとりし、手元の設定を上書きする（D7.4 に反する） / 対応: 修正済（4aa549d。負の確認 10 本）
- [should][conv:-] packages/tui/src/app/TuiApp.ts:718-739 マシンを切り替えてもキーのモードを戻さない / 対応: 修正済（4aa549d。負の確認 10 本）
- [should][conv:-] packages/tui/src/model/SessionModel.ts:72,88-104 reset() が既読を消さず、マシンをまたいで同じ id のエージェントに当たる / 対応: 修正済（4aa549d。負の確認 10 本）
- [nit][conv:-] packages/tui/src/net/TuiNet.ts:103 要約の接続に 4401 の再ログインが無い・生成の同期の例外を拾わない / 対応: 修正済（4aa549d。負の確認 10 本）
- [should][conv:-] packages/tui/src/app/TuiApp.ts:1028 狭い幅の navigate で重なるサイドバーの上に画像の印・画像が出る / 対応: 修正済（9d812c4。負の確認済み）
- [should][conv:-] packages/tui/src/image/kittyOutput.ts:49 全体の描き直し（2J）の後に置き直さず画像が消えたまま / 対応: 修正済（9d812c4。負の確認済み）
- [should][conv:-] packages/tui/src/clipboard.ts:39 xclip の子が stdout を持ち続け、端末版が終わらない / 対応: 修正済（9d812c4。負の確認済み）
- [should][conv:-] packages/tui/src/image/ImagePaster.ts:15 Windows・WSL で画像の読み取りが 2 秒を超えて貼り付けが黙って 0x16 になる / 対応: 修正済（9d812c4。負の確認済み）
- [nit][conv:-] packages/tui/src/image/inlineImages.ts:76-77 途中で打ち切られた OSC の後の BEL で余分な IND を足す / 対応: 修正済（9d812c4。負の確認済み）
- [nit][conv:-] packages/tui/src/term/PaneTerminal.ts:166-192 上書きされた画像を残す / 対応: 修正済（9d812c4。負の確認済み）
- [nit][conv:-] packages/tui/src/app/TuiApp.ts:1036 画像の鍵が中身に依らず、作り直した pane で古い画像を置く / 対応: 修正済（9d812c4。負の確認済み）
- [nit][conv:-] packages/tui/src/app/TuiApp.ts:965 Kitty の置き直しが同期の更新の外でちらつく / 対応: 修正済（9d812c4。負の確認済み）
- [should][conv:-] packages/tui/src/modes/OverlayHost.ts:58 別のダイアログが popup を置き換えると popup を閉じず、サーバ側で動き続けて以後の popup が断られる / 対応: 修正済（6fcf23f。負の確認済み）
- [nit][conv:-] packages/tui/src/modes/CommandPopup.ts:177-186 popup の中のプログラムへマウスを渡さない（web は渡す） / 対応: 修正済（6fcf23f。負の確認済み）
- [nit][conv:-] packages/tui/src/modes/CommandPopup.test.ts:90-126 切断で閉じる経路の試験が無い / 対応: 修正済（6fcf23f。負の確認済み）
- [nit][conv:-] packages/tui/src/actions/TuiDispatcher.ts:1164-1169 releaseHold の JSDoc が runCommand の上に取り残された / 対応: 修正済（6fcf23f。負の確認済み）
- [nit][conv:-] packages/tui/src/actions/TuiDispatcher.ts:60 残ったコメント「独自コマンド（05）」 / 対応: 修正済（6fcf23f。負の確認済み）

## ラウンド 1（2026-09-28）
- [should][conv:-] packages/tui/src/input/mouse.ts:298-306 別のマシンへはマウスでしか切り替えられない（navigate・goto・キーで届かない。AC-I3・AC14） / 対応: 修正済（7dbb323。負の確認 8 本）
- [should][conv:-] packages/tui/src/app/TuiApp.ts:757-760 tmux の中で OSC 52 を包まず、黙って写せない / 対応: 修正済（7dbb323。負の確認 8 本）
- [nit][conv:-] packages/tui/src/image/kittyOutput.ts:53-58 オーバーレイを開くたびに全画像のデータを消し、次の描画で送り直す / 対応: 修正済（7dbb323。負の確認 8 本）
- [nit][conv:-] packages/tui/src/render/Screen.ts:147 chrome の文字列に C1 が残り、pane のタイトル経由で外側の端末へ制御を送りうる / 対応: 修正済（7dbb323。負の確認 8 本）
- [should][conv:-] packages/tui/src/input/mouse.ts:226 枠の無い・隙間の無い pane の中身の列を境界として掴み、pane へ届かない / 対応: 修正済（f32e3f6。負の確認 7 件）
- [should][conv:-] packages/tui/src/app/TuiApp.ts:870-882 はじめの案内に既存の利用者・自動の起動の除外が無く、bench の打鍵が案内に吸われる / 対応: 修正済（f32e3f6。負の確認 7 件）
- [should][conv:-] docs/tui-parity.md:43,52,54,59,72,93 T7 の後も一覧が非対応のまま / 対応: 修正済（9954ec3）
- [should][conv:-] NOTICE:22-37 windowTitle.ts（herdr から写した）が NOTICE に無い / 対応: 修正済（f32e3f6。負の確認 7 件）
- [nit][conv:-] packages/tui/src/app/windowTitle.ts:3,86-100 写した元の title.rs を見出しに書いていない / 対応: 修正済（f32e3f6。負の確認 7 件）
- [nit][conv:-] packages/tui/src/app/TuiApp.ts:97-101 export と JSDoc の位置がずれた / 対応: 修正済（f32e3f6。負の確認 7 件）
- [nit][conv:-] packages/tui/src/app/TuiApp.ts:222-228 取り残されたコメント・案内の後に「エージェント連携」の節を選ばない / 対応: 修正済（f32e3f6。負の確認 7 件）

## ラウンド 2（2026-09-28）
- [should][conv:-] docs/tui.md:21-22 はじめの案内を「Esc で閉じる」と書くが、コードは herdr と同じく閉じない / 対応: 修正済（主エージェントが docs を直した）
- [nit][conv:-] docs/tui-parity.md:59 案内を出さない 4 つの条件と SODA_NO_ONBOARDING が docs と decisions に無い / 対応: 修正済（docs と decisions D19）

## ラウンド 3（2026-09-28）
- 指摘なし（ラウンド 2 の 2 件は docs の食い違いで、主エージェントが 8e665fd で直し decisions D19 に残した。コードは f32e3f6 のまま）
