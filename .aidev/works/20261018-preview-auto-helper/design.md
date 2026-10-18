# Webプレビューhelperの自動起動

利用者依頼: 画面操作時にhelperコマンドの手入力を不要にする。localhostで開いた操作元Aで固定のgatewayを管理し、接続先Bへは既存のmachine channelを利用。CLI/OSコマンド/新規PTY/tokenを起こさない。別PCブラウザ・旧版は手動コマンドの導線を維持。

- protocol: root専用helper_start(machineId,viewerId)/helper_stop(viewerId)。startはlocalSettingsで直接localhostの認証済み接続に限定。stopはownerの接続IDで限定。
- service: owner+viewerで重複排除、全体32/owner8、Scope/Workの上限検証、gateway上限32。開始中離脱も閉じる。root clientGone/shutdown/target channel切断で回収。
- nodeのloopback gatewayとRPC transportはclient-coreの専用subpathに共通化。CLIは既存pathからreexport。browser entry indexにはNode部品を出さない。
- remote RPCは既存channelのHelloを使用。preview HTTP readの35s指定を尊重し、read単体のtimeoutでは他streamを閉じない。Desktop既定10s+closeは維持。
- WebPreviewはcontroller専用接続でstart/stop、Bへのwatch/list/openは従来の接続。許可取消・unmount・古い開始の完了に対して回収。

状態・保存ではなく接続の寿命/プロトコル/loopback境界がfragile taskcheck対象。最後に実装とは別コンテキストで全体点検と修正差分再点検を実施。

## デスクトップ・VSCodeの画面からの自動起動

- デスクトップは既存のローカル共有許可と同梱Windows helper起動を利用。
- VSCodeはvscode.settings.get/setを追加し、共有元PCのlocalSettings権限だけが永続設定を更新できる。既定off、破損保存はlegacyコマンドがあってもoff。手動residentの許可には影響せず、自動起動だけを制御。
- 同梱4モジュール、標準VSCodeとWindows Nodeの読み取り専用パス探索、argvによる実行。起動操作以前にOSプログラムを起動しない。Windows/WSL限定。既存固定コマンドを互換維持。
- URL空欄はserver自身のloopback、HTTPS時は証明書が有効な自身のURLをローカル設定できる。TLS検証無効化やブラウザ由来の自動URL決定は行わない。
- 設定更新は自動起動した共有だけを停止し、現在のlauncherAvailableを全viewerへ配信。手動共有は切断しない。
