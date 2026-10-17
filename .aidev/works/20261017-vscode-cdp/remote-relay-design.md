# 接続済みマシンからのVSCode共有

ユーザー「追加して」で、中央Sodashitsuのマシン一覧からremote BのVSCodeを操作する機能を追加。

- MachineHeaderにVSCodeボタン。local/remote別のmodalで既存DesktopCdpViewを使う。remoteは /ws?machine=UUID の専用接続、既存SSHまたはreverse MachineLinkの1channelでGUIの限定RPCを転送する。新規公開ポート/追加B→A HTTPSを要しない。
- BのWsGatewayが既存cookieまたは認証済みbridge connectionを受ける。MethodContextにgatewayのみがconnection/connectionAuthorizedを提供。vscode.cdp.open/sendはliveconnection無し（pane.sock/予約/通常内部invoke）で拒否。
- BのDesktopCdpRelayにvirtual peerを接続。viewer authorized predicateはgatewayの接続状態に束縛。通常viewerは従来cookie検査。bridge sentinelをAuthService.verifySessionに追加する例外は作らない。
- RPCopenはawait前にWeakSet予約しclosehookを登録。close後async完了/二重openを拒否。real/virtualのlive上限64・ACK/queue/viewport世代・停止処理を共用する。
- 画像/状態は当該connection.sendText(event=vscode.cdp,data=message)にだけ送る。busへ画像/入力/tokenを流さない。remote inviteは拒否し、起動先Bに設定した固定launcherで短命tokenを内部受渡し。helper --sodaはB自身の固定originのまま。
- マシンoffline/削除でmodalをunmount。plugin内のnativeviewもselectedmachine IDをkey/propへ渡し切替時に作り直す。古いsocket/画像/入力/fitは継承しない。別peer/別machineへの自動再共有なし。
- remote通常EscはVSCodeへ届けるためmodalのnative cancelをprevent。閉じるボタン・共有停止を残す。fullscreen Escは既存のローカル解除処理。
- Bに今回対応版Sodashitsuと固定Windowshelper設定が必要。native Windows/WSLの起動方法は既存launcherのもの。実機のリモート別PCは未確認で、まず2つの一時Soda+reverse接続と実Chromium sourceで検証する。

独立点検対象: gateway認証closure/RPC接続寿命、virtual peer/上限、busに配らないこと、machine切替/切断とcleanup。
