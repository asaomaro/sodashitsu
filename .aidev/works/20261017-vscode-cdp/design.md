# CDP desktop view — 最小構成

## 所有と認証

- Windows側の明示起動Nodeブリッジがloopbackの既存CDPへ接続。VSCode起動/終了、Node Inspector経由の注入、任意Runtime.evaluateは行わない。
- viewerは通常Soda session cookie + Origin/Host検査。同じoriginの専用WS /desktop-cdp?role=viewer を使う。
- native部品で作る256bit one-time tokenは5分・1接続限定。Node bridgeの最初のhelloだけで交換し、tokenをURL、ログ、永続ファイルへ載せない。ユーザーがコピーする一時コマンドには含む。
- bridgeはcookieを受け継がず、target選択済みのローカルプログラムが外向きに /desktop-cdp?role=bridge へ接続する。
- viewerごとに独立したbridge。認証済みの別viewerであっても他の画面を購読できない。切断時は再招待し、controllerの入力を再送しない。
- local --allow-input と native部品のcontrol両方が必要。grantは当該WSペアの寿命に限定し、session失効・停止・切断に連動する。

## 表示と入力

- soda.mount('desktop-cdp', element) はextension由来script-htmlの面だけに許す。iframeは矩形配置だけ通知し、Soda DOMのnative部品がWSとtoken・画像を所有する。CSP/sandboxは緩めない。
- CDP JPEG screencast最大1920x1200・約10fps上限。viewerの描画ACKまで次を送らず、未送信の最新画像を最大1枚保持してACK後/間隔経過後に送る。CDPのframeはACKして内部待ちを解消し、停止時には保留画像とtimerを破棄する。
- Page.getLayoutMetricsのCSS viewportを各送信画像に対応させ、縮小表示されたcanvas座標を戻す。通常は映像の拡縮のみ。明示的fitではSoda枠へrenderer viewportを合わせ、Windows外枠は変更しない。
- native部品は描画をcanvas画素で行い、mouse/key/textだけを送る。サーバとブリッジで固定操作へ制限し、method/JS式を受け取らない。
- 入力待ちは最大128、WS流量・payload・未認証bridge数・全接続数に上限。heartbeatで応答がない接続を閉じる。
- 操作許可ではEmulation.setFocusEmulationEnabled(true)を入力queueに先行して送る。Electronの非アクティブwindowでmouse ACKが来ない実機問題への対応。解除/停止ではfalseを送って復元を試み、許可切替時のepochで待機入力を再送しない。別のDevToolsとのfocus override併用は未検証。
- 共有終了/解除では保持キーとbuttonの解放を試みる。pointerupがcanvas外でも座標を補正して送る。pointercancelは操作を解除する。

## 現時点の制約

- 通常起動したVSCodeへCDPを後付けしない。起動オプションの導入・再起動は別途判断が必要。
- Windows実機の画像・マウス移動・Shift・閲覧への復帰は確認済み。メニューはWindows側で前面化すると配信されることを確認。terminal/Monaco/extension Webviewの全操作、native dialog、最小化/lock、macOS/Linux desktop、Safari/iOS、WAN性能は未検証。nativeフォルダー選択は対象外。
- lock検知は未実装。自動clip sync、音、file transfer、常駐接続、保存復元は対象外。
- ブラウザがログインしたSoda本体へ接続する専用経路。マシン委譲を汎用media tunnelとして流用しない。
- VSCode UI拡張へのブリッジ同梱は後続。今回の配布単位はSoda plugin + Windows Nodeスクリプト。

## 表示枠への追従の追加

`--allow-input --allow-fit` + viewer control + 明示checkboxで、Emulation.setDeviceMetricsOverride({width,height,deviceScaleFactor:0,mobile:false})を使う。解除はclearDeviceMetricsOverride。旧frameと新座標の混在を避けるためstopScreencast/世代更新/restartとfresh ACK待ちを用い、待機入力を再送しない。fit取消し・閲覧・停止でoverrideを解除してからCDPを閉じる。詳細は fit-test-result.md。実外枠を変える候補は resize-design.md に残すが今回の実装には含めない。

## 等倍表示とdirect appの操作受付復帰

映像canvasのCSS寸法は共有元のCSS viewport寸法と一致させる。JPEG pixel寸法・DPRとは分離する。自動縮小やflex shrinkをせず、枠を超えればスクロールする。余白があればmargin:autoで中央寄せし、oversize時は先頭へスクロールできる。fitの明示許可/checkboxは維持する。

direct appのnative Desktop部品では、利用者のtrusted pointerdownに限り親のFocusGuardをengageし、必要ならnative wrapperへfocusを戻す。disabled button自身にfocusできない状態を解除する。遠隔control許可は別であり、このpointerdownだけでは有効にしない。非direct panel・iframeからの合図・非trusted eventは対象外。

## ホイールburstの追加修正

viewerは32ms単位で同位置・修飾・ボタン・方向のwheelを集約し、line=16px/page=元viewport高さでpixelへ換算する。各軸±10000を上限にし極端なburstの超過量は破棄。離散入力の前にflushし順序を保ち、revoke/blur/fit変更・座標変更・停止で未送信を破棄。Windows bridgeもbounded連続入力bufferで遅いCDPへ無限のPromise列を作らない。離散操作の上限は維持。詳細検証はwheel-test-result.mdへ。

## 共有表示の全画面

親documentにあるnative DesktopCdpView自身をrequestFullscreenする。隔離iframeへfullscreen権限を与えない。通常のconnected/ローカル操作受付は維持し、fullscreen操作だけではremote control/fitをgrantしない。:fullscreenで親のinline geometryを上書きしtop-layerを占め、接続設定/header等を隠す。操作/停止/解除/fitは残す。fullscreenchangeで実状態を同期、ResizeObserverと200ms最新サイズ送信で既存fitを追従する。

Esc一押し（終了後のrepeatとkeyup含む）はlocalに消費する。Fullscreen exitで保持キーをrelease、通常Esc新keydownはremoteへ送れる。API非対応はfeature detection・拒否時はalertでshare/入力状態を変えない。stop/disconnect/unmountは自分のfullscreenだけを解除し、request中に切断/unmountしてもlate successを解除する。

仕様根拠: https://fullscreen.spec.whatwg.org/ （Fullscreen API/top-layer/user activation/UA exit）。実ブラウザのpixels/DOM寸法・source寸法/入力・browserWSフレームを検証する。
