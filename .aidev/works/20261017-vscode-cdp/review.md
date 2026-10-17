# 独立最終レビュー

最終判定: 通過（初回P1 1件は修正し、末尾の再レビューで確認済み）。初回判定: 要修正。実装を変更せず、git diff と追加実装・試験・手順を別コンテキストで点検した。既存 VSCode および元 worktree は操作していない。

## P1: 最後の画面変更が背圧/間引き中だと永久に表示されない

対象: `plugins/vscode-desktop/cdp-client.mjs:47-54` と `:73-75`。

`pending` 中または前回送信から100ms内に届いたフレームを保持せず捨て、Chromiumには即ACKしている。viewerのACKでは `pending=false` に戻すだけなので、以後の描画変更がなければ最新画面が再送されない。入力直後の結果・保存結果・メニュー閉鎖等の最終状態が古い画像のままになる。遅い回線で特に起きやすい。スクリーンキャストは静止中に新しいフレームを送る保証がない。

独立再現（実Chromium、Playwright既存pipe CDP。TCP CDP portは開いていない）:

1. 赤背景の静止ページを `CdpCapture` で開始し、最初のframeを受け取る。
2. viewerのACKを保留したまま、元rendererを青背景に変更して300ms待つ。
3. `capture.ack(1)` を呼び、さらに1秒待つ。

生の出力:

```text
initial frames 1
changed while pending frames 1
after ack + 1s frames 1
```

元rendererは青だがviewerへは赤の1枚しか届かない。既存E2Eは最初の背景画素と元renderer側の入力結果を検査しており、この最終画像欠落を捕捉しない。

対応案: 未送信の最新画像を最大1枚保持し、viewerのACK後か100msの間隔経過後にflushする。stop/navigation時には保留画像とtimerを破棄する。遅いACK中に変化した後に静止するページと、100ms内の最終変更について、元rendererの最終色がviewerのcanvasに現れる回帰検証を行う。

## 確認した境界

- viewerのcookie認証とOrigin検査、bridgeへのブラウザOrigin拒否。
- 5分・一回限り招待とviewer/bridgeの1対1対応、再招待・失効・停止時の切断。
- 任意CDP/JSを公開しない入力schemaと固定CDP操作、共有元とviewerの両方の入力許可。
- native Vue描画によりiframeへtoken・画像を渡さない経路、既存terminal mountの分岐維持。
- reload/navigationの停止、入力release、画像ACK背圧、パッケージとWindows向けNode標準APIによるbridge。

全体build/typecheck/unit/E2Eの結果は実装担当側の記録を参照する。このレビューでは全体試験を重複実行していない。Windows VSCode実機・Safari/iOS・native dialog・最小化/ロックは未検証のままである。

## 修正差分の独立再レビュー

判定: 通過。`CdpCapture.onFrame/flush/ack/stop` と追加の単体・実CDP E2E検査を再確認した。最新画像を1枚保持し、ACK後/間隔経過後に送ることでP1の原因を除去している。停止時のtimer・画像破棄と、非running時に非同期処理からframeを出さない条件も維持されている。修正差分に新たな要修正事項は認めなかった。

前回と同一の実Chromium pipe再現を再実行し、今回はACK後に2枚目が届いた。さらに最後に送信されたJPEGをChromiumのcanvasへ復号して青背景の画素を確認した。

```text
initial frames 1
changed while pending frames 1
after ack + 1s frames 2
last transmitted pixel RGBA [0,0,254,255]
```

既存VSCode・TCP debug portは使用していない。追加E2Eの全体実行と回帰テストのnegative controlの記録は実装担当側で行う。

## 非アクティブWindows rendererの入力修正・独立再レビュー

判定: 通過。`/tmp/vscode-cdp-client-before-focus.mjs` との差分、および追加の2単体試験を点検した。`Emulation.setFocusEmulationEnabled` は操作許可時に固定CDP命令として入力queueへ入り、入力に先行する。閲覧への復帰と停止で無効へ戻し、従来のepoch検査により許可取消し前の未実行入力は再送されない。汎用CDP操作の公開や、閲覧のみの接続にfocus overrideを加える変更はない。

追加の読み取り専用Node検証で、focus設定応答待ちの間のstop、取消し直後の再許可、focus設定失敗を模擬した。停止/取消し前にqueueへ積まれた入力が実行されず、stop/失敗後の最後のfocus命令がfalseであること、取消しと再許可の順序がtrue→false→trueであることをassertした。

```text
stop-during-focus: PASS
revoke-regrant: PASS
focus-command-failure: PASS
```

修正差分に要修正事項は認めなかった。既存Windows VSCode・元worktreeは操作していない。実Windows上のmouse/key成功は実装担当者側の診断結果に依拠し、この独立レビューでは実機操作を重複していない。

## 環境再起動後の追加差分・独立レビュー

判定: 通過。`scripts/vscode-cdp-dev.mjs`、resize/HiDPI E2Eの追加、READMEの再作成手順とnative UI/resizeの境界、`resize-design.md`を点検した。既存の稼働サーバ・Windows・他worktree・mainは操作していない。

ランチャーは新規mkdtemp配下の名前付きsession `cdp-test`だけにプラグイン導入・表示許可・タブ作成を行い、待受は127.0.0.1に固定されている。認証済みRPCで初期化し、tokenを含むファイルは0600、token自身はログへ出さない。起動失敗時はserver.closeを実行する。

独立検証は既存17883とは別の17946と別の一時stateで実行した。生の出力（`/tmp/cdp-resume-review.log`）:

```text
ready origin http://127.0.0.1:17946 state within temp true file mode 600
login status 204
collision exit 1 EADDRINUSE true
SIGTERM exit 0
```

リサイズ検査は元rendererのDPR=2、転送canvasの寸法変更・上限・縦横比・実画素、新しいCSS座標でクリックした元rendererの文字入力結果を検証している。DPRとJPEG解像度を同一視せず、実Windowsのウィンドウ変更とは区別されている。最終実行ログ `/tmp/vscode-cdp-resume-e2e.log` の `2 passed (12.0s)` を確認した。Windows実ウィンドウの遠隔リサイズ案は設計のみで、実装・実機検証済みとは扱っていない。追加差分に要修正事項は認めなかった。

## 表示領域へのfit追加・独立taskcheckと最終レビュー

最終判定: 通過。初回P2 1件と、実装担当側で追加発見した入力release中のraceは修正・再点検済み。対象はprotocol/relay/bridge/CdpCapture/Vueのfit経路、単体試験、実CDP E2E、README。Windows、既存17883、他worktreeはこの独立レビューでは操作していない。

確認した境界:

- viewport要求は上限付き整数サイズまたはnullのみ。relayは共有元のallowFitとallowInput、viewerの操作許可をすべて要求し、bridgeにもローカルflagを要求する。
- Vueは明示checkboxと200ms集約、同一サイズの抑止を使う。Windows側の同じrendererレイアウトも変わる旨の説明がある。native外枠のリサイズとは区別されている。
- CdpCaptureは最新要求を一件保持し、入力queueと同じ順序で変更する。旧世代の未送信画像を捨て、送信済み画像のACKを維持し、新座標に対応する画像のACK前には入力を通さない。停止は実行中queueを待ってoverride解除を試みる。

初回P2: focus応答待ち中に未適用fit要求を取り消し再許可すると、inputBlockedが残って入力不能になった。独立再現の生出力:

```text
regrant control true inputBlocked true insertText calls 0
```

修正は未適用要求と、実際に変更した世代の新画像待ちをawaitingFrameGenerationで区別する。修正後の独立再実行では、取消し後は入力可能、適用後の解除では復元画像のACKまで入力不可であることをassertした。

```text
cancelled-fit regrant: PASS
restored-frame ACK required: PASS
```

追加race: workerが要求を取り出して保持キーのrelease応答を待つ間に旧画像ACKが来ると、一時的にinputBlockedが解除され、旧座標がqueueへ入る。viewportQueuedもACK/取消しの条件へ含め、workerのfinallyで新画像/次要求待ちから再計算する修正を確認した。追加回帰を独立実行した結果:

```text
Test Files  1 passed (1)
     Tests  1 passed | 13 skipped (14)
```

`/tmp/vscode-cdp-fit-regrant-negative.log` と `/tmp/vscode-cdp-fit-release-negative.log` は、それぞれ修正前に期待する入力欠落/旧座標送信で失敗することを示している。

最終E2Eは実際のpackaged app viewを使い、fit後のsource/view実寸一致、canvas画素・比率、新座標での入力、閲覧ブラウザのリサイズ、fit解除、操作取消しと再許可、停止時の復元を観察している。`/tmp/vscode-cdp-fit-e2e.log` の最終結果は `2 passed (11.9s)`。Playwright自身のviewport overrideを事前に解除して実ベースラインを得るため、通常サイズの復元と別emulationへの復元を混同していない。

Windows実機の結果は担当者側の `/tmp/vscode-cdp-fit-live.log` で読み取り確認した（独立レビューでの実機操作はしていない）:

```text
before 1199x800
fit source/view 943x616
viewer resized source/view 743x516
fit off restored 1199x800
stop restored 1199x800
```

同じtargetへ別DevTools等から設定されたoverrideの保存・復元は非対応で、READMEもこの制約を明記している。追加差分に残る要修正事項は認めなかった。

## fit最終統合結果の追記

最終判定: 通過。Vueの最終追加guardは、最大4096×2400へ比率縮小した後に160×120の下限を割る極端な領域を検知し、適用済みならnullで解除してinvalidサイズを送らない。既存の権限やqueue経路を変更しておらず、新たな指摘はない。

最終ログの読み取り確認:

- `/tmp/vscode-cdp-fit-final-e2e.log`: 新規2件と既存関連13件、計 `15 passed (1.2m)`。単一workerと専用output `/tmp/vscode-cdp-fit-final-results` で完了。
- `/tmp/vscode-cdp-fit-target.log`: 対象3ファイル、`34 passed (34)`。
- `/tmp/vscode-cdp-fit-build.log`、`/tmp/vscode-cdp-fit-typecheck.log`: full build/typecheck完了。
- `/tmp/vscode-cdp-fit-smoke.log`: `smoke: PASS`。
- Windows実機のfit/閲覧先resize/解除/停止復元結果は上節と `/tmp/vscode-cdp-fit-live.log` を参照。この独立レビュー自身はWindowsを操作していない。

初回の既存関連E2Eでは12件通過・1件がPlaywright artifactのENOENTで失敗していた。生ログ `/tmp/vscode-cdp-fit-existing-e2e.log` の失敗箇所は `browserContext.close` における共有 `.playwright-artifacts-0/traces/...trace` とzipの欠落であり、並行Playwright実行によるartifactディレクトリ衝突という実行方法の不備として切り分ける。製品のassert失敗とは扱わない。専用outputで新規/既存をまとめて再実行し15件すべての通過を確認した。

## CDP探索エラーの案内追加・独立再レビュー

判定: 通過。`cdp-bridge.mjs` のtargets内fetchを囲む小差分と追加回帰を点検した。CDP endpointは従来のloopback URL検査を通過しており、案内にtoken等の秘密を含めない。通信失敗時に接続先の `/json/list` URL、CDP有効で起動済みかの確認、`--cdp` の案内を返し、元例外はcauseに保持する。既存のHTTP status・JSON・対象filter検査は維持され、VSCode起動や設定変更は行わない。

追加回帰はfetchを拒否させ、接続先と--cdpの説明、およびcauseの同一性を確認する。`/tmp/vscode-cdp-discovery-positive.log` の15件通過、`/tmp/vscode-cdp-discovery-negative.log` の修正前の `fetch failed` だけでは説明検査に失敗する生出力を確認した。検証記録は `fit-test-result.md` の「手動再接続時のCDP到達エラー」に残されている。この独立再レビューではWindowsを操作していない。変更に要修正事項は認めなかった。

## 操作復帰と等倍表示・独立最終レビュー

判定: 通過。direct appのnative desktop部品へのtrusted pointerdownに限り、親のFocusGuardを再engageしてnative wrapperへフォーカスする変更を点検した。connected phaseとdirect判定を要求し、非direct面の覆いや既存terminal分岐を維持する。遠隔control許可を自動で与える経路は追加されていない。

canvasはJPEG物理解像度でなく転送されたCSS viewport寸法をstyleへ指定し、flex縮小を禁止してスクロールする。これによりDPR2でも1CSS pxを基準に表示し、元rendererへの座標対応を維持する。画面内クリックでの操作復帰、等倍表示、fit未許可の案内も実装と一致する。

実ブラウザE2Eは親側へフォーカスを移してボタンdisabledを確認し、native headerへの実クリック後にenabledへ戻ること、1000×700 CSS寸法の表示、狭いviewerでも寸法を維持してスクロールできることを観察する。negative controlを確認した:

- `/tmp/vscode-cdp-1to1-negative-focus2.log`: handlerとnative wrapper tabindexを旧状態へ戻した場合、期待するenabledに対してdisabledのままで失敗。
- `/tmp/vscode-cdp-1to1-negative-scale.log`: 旧縮小表示では1000×700を期待する検査に対して587.140625×410.984375で失敗。
- 最初のfocus negativeはhandlerだけを戻し、追加tabindexによる既定フォーカスが残っていたため有効なnegativeとして扱わない。focus2で修正全体を戻して確認した。

復元後の統合実行 `/tmp/vscode-cdp-1to1-final-e2e.log` は既存関連13件とCDP1件が通過し、CDP主試験のドラッグ検査1件が失敗した。等倍化したcanvas全体が可視と仮定したテスト座標がclip領域外へ出ていたことが原因で、製品コードは変更していない。初期スクロール0の条件でcanvasとscreenの可視範囲内からdblclick/dragを開始するよう検査を修正し、mouseup外releaseの元のassertは維持した。

最終結果: 既存関連13件通過に加え、修正したCDP2件を `/tmp/vscode-cdp-1to1-final-cdp.log` で `2 passed (15.5s)` と確認した。web build、web typecheck、修正後E2E typecheckも完了し、差分検査は通過。既存13件は製品コード変更がないため重複実行していない。この独立レビューでWindowsや稼働中17883へ接続・介入はしていない。残る要修正事項は認めなかった。

## ホイール混雑停止修正・独立最終レビュー

判定: 通過。Vue viewerのwheel集約とCdpCaptureのbounded buffer/worker、追加単体/E2EとREADMEを点検した。認証・招待の寿命・自動接続方式は変更されていない。`reconnection-design.md` は未実装案として記録され、実装済み機能とは区別されている。

viewerは同じ座標・修飾・buttons・軸方向のwheelだけを32ms単位で合算し、離散入力前にflushする。line単位は16 CSS px、page単位は水平width/垂直heightで換算する。各軸±10000に制限し、release、操作取消し、fit変更とnull解除、新frameの寸法変更では未送信wheelを破棄する。異なる操作対象や古い座標へ後から再送する経路はない。

helperは最大128項目のbufferと単一workerを使い、連続moveは最新位置、互換wheelは合計/飽和に集約する。異なる座標・修飾・ボタン・方向や離散入力の境界を跨がない。満杯時の連続入力を破棄し、離散入力には連続項目を回収して場所を空けるためkeyup/button releaseを残す。離散項目だけで満杯になった場合は既存の安全停止と保持キー/ボタンの解放を維持する。revoke/fit/stopは旧bufferを空にして配列を切り替え、旧workerが新許可の入力を消費することを防いでいる。既存fit世代/ACK待ちと入力epoch検査は維持される。

最終検証ログの読み取り確認:

- `/tmp/vscode-cdp-wheel-capture.log`: 24単体試験通過。遅いCDPでの501wheel、極端な飽和、離散順序、取消し/fit/stopの破棄、新focus順序、満杯時のrelease保持と離散のみ満杯の安全停止を含む。
- `/tmp/vscode-cdp-wheel-final-e2e.log`: `2 passed (13.3s)`。実sourceのscrollTop進行、viewerでの200 line-wheelを合計3200pxかつ2通以下へ集約、操作中の継続を確認する。単なるserver受信のみの成功判定ではない。
- helper negative `/tmp/vscode-cdp-wheel-negative.log`: input()を旧方式へ戻すとslow-CDP burstでrunningがfalseになり、期待する継続assertで失敗する。
- 有効viewer negative `/tmp/vscode-cdp-wheel-view-negative2.log`: viewer input()だけを旧方式へ戻すと、合計3200pxの確認後に送信数の `Expected <=2 / Received 200` で失敗する。初回negativeは既存DPR寸法検査で止まり目的assertへ到達していないため無効と区別した。
- 復元Vueとpositive時保存VueのSHA256は両方 `fa3859c82cec8392b960b5dfba9e6834288173c9d395a5d5c1729e05049a2841` で一致し、`/tmp/vscode-cdp-wheel-restored-build.log` の再build完了を確認した。positive2件は同一bytesのため重複実行していない。web/E2E型検査結果は `wheel-test-result.md` の記録を参照する。

修正版のWindows実機wheelは利用者確認待ちであり、Chromium検証を実機成功とは扱わない。この独立レビューではWindows・稼働17883・他worktreeを操作していない。残る要修正事項は認めなかった。
