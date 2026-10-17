# 接続済みマシンからのVSCode中継: 独立点検

担当: resume_resize_design。実装編集・Windows/live操作・他worktree/main変更はしない。

## 設計の初回確認

既存の認証済み `/ws?machine=UUID` の専用MachineLink channelへ限定RPC vscode.cdp.open/sendを流し、BのDesktopCdpRelayへvirtual viewerを作る方式は妥当。映像は呼び出したconnectionだけへvscode.cdpイベントとして送信し、EventBusへ載せない。BのWindows helperは従来どおりBの固定--sodaへ接続し、画像だけが既存MachineLinkを流れるため、B→Aの追加HTTPS接続先を要求しない。

### 親へ通知した重点境界

1. **認証はconnection lifetimeで保持する。** BRIDGE_SESSION_IDをauth.verifySessionで通す特例にしない。Gatewayが保持するstatesのconnection所属/生存を判定するtrusted closureを使い、remoteには存在しないB cookieを要求しない。RPCパラメータからclosureやconnectionを設定させない。
2. **1 connection 1 virtual peer。** open二重要求をidempotentにするか旧peer cleanupを待つ。WsGatewayはRPCを並行処理するため、初期化Mapの予約とconnclose hookは最初のawait前に行い、loaded待ち等の途中でcloseした後にorphan peerを作らない。
3. **全ての認証判定で同じclosureを使う。** 招待の消費、startResident、launchの非同期結果、frame受信、patrol等の一部だけcookie判定を残さない。Aのlogout/切断→channelclose→B peerclose→helper EOFの連鎖を検証する。
4. **画像・入力は専用connectionだけ。** EventBus broadcastを使わず、conn.sendTextのみを使う。別ブラウザ・別machine・通常のbus購読者へ画像を配らない。
5. **pane.sock等は拒否。** MethodContext.connectionはGatewayだけが渡す。connection無しのserver内呼び出し/pane.sockはRPCを実行できない。フロントのpeer ID指定だけで他connectionを操作できる設計にしない。
6. **virtual peerも上限へ含める。** 1 connection 1 peerだけでは無制限接続が可能なので、既存64 live上限へ含めるか別の同等上限を持つ。bufferedAmountを実connectionの待機量へ対応させ、ACK・rate・queue・frame timeoutを維持する。
7. **マシン切替で状態を引き継がない。** UIは明示machineIdでsocketを作り、削除/offline/unmountで閉じる。machineIdをnative componentのkeyへ含め、local token/画像/control/fitや旧WSの非同期画像decodeを新machineへ残さない。
8. **remoteでinviteを拒否。** B固定helperと内部短命tokenでlaunch/connectし、手元originの手動コマンドをB接続として表示しない。Bにhelper設定がなければgenericな設定不足を説明し、A helperへfallbackしない。

MachineHeaderからホスト側modalを開く案は、表示中machineとは独立した明示対象idを保持する構成とする。許可/認証・隔離iframeのCSPは維持する。

実装差分と、二重viewer/切断/上限/slow-client/remote-target消失の検証結果を待つ。

## 実装の独立レビュー

DesktopCdpPeer、real/virtual共通Relay、限定RPCとMethodContext/WsGateway、compose、MachineHeader modal、DesktopCdpViewのremote transport、DisplayFrame machine key/prop、protocol、関連unit/E2Eを確認した。

- Gatewayがconnectionとauthorized closureを提供し、statesの同じconnectionに属することを確認。通常cookieはauth.verifySession、認証済みBridgeEndpointのsentinelはGatewayのconnection寿命で扱う。AuthServiceへsentinelを許す例外を追加していない。
- 限定RPCはconnection/authorizedが無ければ拒否。通常内部invoke・pane.sock・予約へviewer権限を渡さない。
- openRpcはWeakSetへ同期予約し、最初のawait前にclosehookを登録する。load完了後にlive/authorizedを再検証してからpeerを作るため、重複openとclose中のorphanを防ぐ。peerはliveへtrackし、realと同じ64件上限/heartbeat/rate/ACK/queueを使う。
- RpcDesktopCdpPeerは当該connectionのbufferedAmountを参照し、vscode.cdpイベントをconnection.sendTextだけへ送る。EventBusへの画像送信はない。bridge.frame受信時/招待消費/startResident/launch結果/patrol/viewer入力のauth判定はauthorized closureへ統一されている。
- connection closeはpeer close→既存stop→所有helper EOFへ連動する。remote inviteを拒否し、helperの固定B originを維持。別peerのID指定やA helperへのfallbackはない。
- MachineHeaderは明示machine IDのnative modalを作り、offlineでunmountする。通常Escはremoteへ送り、native dialog cancelをpreventする。fullscreen Escは既存local処理。DisplayFrameもmachine key/propで再mountし、旧local/remote状態の継承を防ぐ。

独立実行: WsGateway.integration.test / surface/methods/desktopCdp.test / DesktopCdpRelay.test **3ファイル44件合格**（`/tmp/cdp-remote-independent.log`）。`git diff --check`合格。

親の初回E2Eログ `/tmp/cdp-remote-first-e2e.log` は、disableしたmachineのheader自体が消えた後にbutton disabledを期待した箇所で失敗した。画像/日本語/fit/fullscreen/close/reopenまでの検証は通過。header消失を期待する前提修正を提案し、製品不具合とは判定しない。

現コードに追加blocking指摘なし。共通化境界を補強するなら、authorized closureの途中失効、64 virtual上限、slow virtualの直接試験が有効と親へ通知した。実ブラウザpositive・negativeと最終検証結果を待つ。

## 拡張検証と差分の再確認

- RPC error時に専用WSをcloseするVue差分を確認。未対応版/満杯のopen失敗で接続したまま再試行不能になる状態を避け、既存の再接続導線を使う。イベント内の通常helper errorとは区別している。
- 共通64 virtual上限・authorized closure途中失効の追加試験を確認。親報告のexpanded **95件合格**は `/tmp/cdp-remote-expanded-tests.log`。
- orphan防止のpost-load guardを外したnegative2は、close済み接続のopenがrejectせずresolveする期待どおりの失敗（`/tmp/cdp-remote-orphan-negative2.log`）。両reject期待をclose前に付けた試験で、先行negativeの未処理Promise問題を除いた生出力を独立に確認した。親による正Relay snapshotとのexact cmp復元報告あり。
- remote E2E `/tmp/cdp-remote-third-e2e.log` **1件合格22.4s**を独立に確認。native modalの画像/日本語/通常Esc/fit/fullscreenEsc/close復帰、Bのplugin appへmachine切替、Aへ切替時のB画像なし、reopen閲覧、disable時dialog/header消失、別browserへの画像漏れゼロを含む。A側のscript表示許可も一時stateで設定する前提修正は妥当。

追加blocking指摘なし。DisplayFrame machine-idをlocalへ戻すnegativeと、正source復元後の最終build/typecheck/関連E2E結果を待つ。

## 最新UI・復元・実Windows経路の確認

- 正しいDisplayFrameのmachine key/propを再確認。親による正snapshotとのexact cmp復元報告あり。machine-idをlocalへ戻したnegativeはremote plugin内の手動接続buttonが0期待に1となる、狙ったマシン取り違え検査で失敗（`/tmp/cdp-remote-machine-negative.log`を独立に確認）。
- Vueのremote時invitation computed無効化、socket close時pending/busyリセット、socket非OPEN時の起動/選択接続button無効化を確認。切断後に旧起動状態を表示したり、手元originのコマンドをremoteへ案内したりすることを避ける妥当な差分。追加blocking指摘なし。
- 最終unit `/tmp/cdp-remote-final-units.log` は **12ファイル120件合格**を独立確認。作業フォルダ外smoke `/tmp/cdp-remote-smoke.log` は **PASS**。root build合格の親報告とroot typecheck各Doneを確認。
- 一時test A/Bを同一PCのloopbackに置いた実Windows中継ログ `/tmp/cdp-remote-windows-ui.log` は、2回とも **1799×1200・opaque=true・manualCommandVisible=0**。`/tmp/cdp-remote-windows-ui.png` を独立目視し、別Sodaの名前を示すnative modal内で実Windowsの既存文書が描画され、閲覧状態であることを確認した。Windows/live viewerをレビュー担当が操作したものではない。
- 実機経路は同一PCの2 Sodaであり、別PC・本番マシン・WANの検証へ一般化しない。

最終関連5 E2Eの結果を待つ。コードレビューは通過相当。

## 最終判定: 通過

復元後の最終関連E2E `/tmp/cdp-remote-final-e2e.log` を独立に読み、remote/launcher/resident/既存CDP/mobileの **5件合格、1.8m** を確認。最終root build/typecheckログの各Done、unit120件、smoke、negative2本、正DisplayFrameも確認済み。最後の `git diff --check` 合格。追加blocking指摘なし。

同一PCでの実Windows中継と別PC/WANの未検証範囲を分け、既存のnative dialog等の制約を維持する。親の検証記録と合わせて成果を扱う。
