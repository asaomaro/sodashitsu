# 全画面表示の独立レビュー

対象: DesktopCdpView.vue のFullscreen API・CSS・cleanup追加とCDP E2Eの関連差分。
担当: resume_resize_design。Windows実機やlive17883へ接続していない。実装は編集していない。

## 初回確認

親documentのnative sectionをFullscreen APIのtop-layerへ移す方式は、隔離iframeのpolicyを緩めず、rendererの共有状態や入力権限を新たに与えない。CSSのfullscreen時の位置/寸法important指定、実際のfullscreenElementとの同期、ResizeObserver/fit追従、API非対応/拒否時の表示、unmountの自分のfullscreenだけを終了する処理を確認した。

### 修正を提案したrace

requestFullscreenがpendingの間に共有stop/disconnectが起きると、connectedのwatchはまだfullscreenElementが自分でないためexitを行わない。その後requestが成功したときdisposedだけを検査する現在の処理では、切断済みの画面へfullscreenが成立して残る。request完了後にdisposedだけでなく!connectedも確認し、自分のfullscreenを終了すべき。親へ直接通知済み。

### Escの境界

fullscreenのEsc keydownを消費しても、fullscreenchange後のkeyup時にはfullscreen=falseとなるためremoteへkeyupを流す余地がある。対応するkeyupもローカルで消費するguardを提案。実ブラウザ試験ではremote keydownだけでなくkeyupも確認すると有効。親へ直接通知済み。

その他のblocking指摘は初読時点ではない。修正差分と実ブラウザの結果を待つ。

## 修正差分の再確認

- request完了後に `disposed || !connected.value` なら自分のfullscreenを終了する差分を確認。resident E2Eは実requestFullscreenの成功完了を停止後まで遅らせ、document.fullscreenElement=nullを検査する。raceの検証として有効。
- Escの対応keyupをfullscreen終了後も消費するguardを確認。ただし押し続けた場合のrepeat keydownも同じ一押しに属するため、guardがある間はlocal消費し、次のrepeat=falseの新しいkeydownだけでリセットする追加対応を提案した。sourceのkeydown/keyup両方を観測するE2Eを確認。
- fit中のexitでは座標切替のinputBlockedが入力を落とすため、Esc不達だけでguardを検証すると不備を隠す可能性がある。fit OFFでのrepeat確認、またはbridgeへのEscape input送信ゼロの補助確認を提案。
- CSSは親のnative sectionをtop-layerへ移し、inlineのposition/left/top/width/heightをfullscreen時だけ上書きする。iframe側のpolicy/CSPに変更はない。追加のCSS指摘はない。

## 正状態での再確認

negative control実行中の実ファイルとは区別し、親が保存した `/tmp/vscode-cdp-fullscreen-positive.vue` を確認。repeat keydownもguard中はlocal消費し、次の新しいrepeat=falseのkeydownでguardを戻す修正を確認した。request完了後のdisconnected guardも含め、既指摘はコード上解消。

E2EはEsc down→fullscreen終了待ち→repeat down→upを実行し、sourceのkeydown/keyup不達だけでなくブラウザのNetwork.webSocketFrameSentでもEscape inputゼロを検査する。viewport復帰/inputBlocked解除後のArrowRightでsource caretの変化も検査し、後続の実入力が通ることをbarrierにする。fit中の入力破棄でguard不備を隠す懸念に対応している。

`/tmp/vscode-cdp-fullscreen-first-e2e.log`: 新旧CDP **3件合格、38.6s**。`/tmp/vscode-cdp-fullscreen.png` を独立目視し、共有画面がviewport全体に広がり、control/stop/exit/fitの導線が残ることを確認。コードに追加blocking指摘なし。negativeと元bytes復元後の最終試験結果を待つ。

## negativeと最終差分の再確認

- disconnect guardのみを外したnegativeは、遅延したrequestの成功後にdocument.fullscreenElementがnullへ戻らず、狙った検査で失敗（`/tmp/vscode-cdp-fullscreen-disconnect-negative.log`）。
- Esc guardを旧処理へ戻したnegativeは、source bodyのdata-remote-escape=yesとなり、狙ったremote不達検査で失敗（`/tmp/vscode-cdp-fullscreen-escape-negative.log`）。両ログを独立に確認した。
- 親による元snapshotとのexact cmp復元報告あり。復元後の正しいVueを読み直し、request完了後のdisconnect/unmount guard、repeat/down/upのlocal消費を確認。
- 追加差分として、UAがEsc keydownをページへ届けずfullscreenを終了する場合に備え、own fullscreen解除の検出でもguardを立てる。次のfreshなnon-repeat keydownではguardを戻すため、通常のremote Escapeを永続的に遮断しない。
- E2E追加は解除ボタン後にkeyupだけを送って漏れゼロを検査し、その後の新しい普通のEscapeはkeydown/upの2件が実際に送信・反映されることを確認する。End→ArrowRightのcaret barrierを使う。追加差分にblocking指摘なし。

復元後の最終3 E2Eの結果待ち。コードレビューは通過相当。

## 最終判定: 通過

復元後の最終E2Eログ `/tmp/vscode-cdp-fullscreen-final-e2e.log` を独立に読み、**3件合格、28.2s** を確認した。新しいUA解除/keyupのみ・fresh通常Esc・repeat境界を含む正状態での結果。`git diff --check`も合格。

親から最新版web build/vue-tsc/E2E typecheckの合格と、live17883のasset `index-C_Pp_Bma.js` のHTTP bytes/dist一致の報告を受領。実ブラウザ検証とnegative2本の生出力は `fullscreen-test-result.md` に保存されている。レビュー担当はWindowsやlive viewerを操作していない。追加blocking指摘なし。
