# Sodashitsu起動中に限るWindowsロック解除

利用者の依頼: リモートデスクトップでロック解除に対応。Sodashitsu起動中に限ってよい。Windows起動時の自動常駐、無人ログイン、仮想ディスプレイは対象外。

## 方式

接続先Windowsへ管理者が一度だけ専用helperをProgram Files配下へ導入し、WindowsサービスをDemandStartで登録する。Sodashitsuのローカル許可が有効な間だけ通常ユーザーのlease helperを起動する。leaseのstdin/IPCが切れたらサービスも終了する。TCP listen・Firewall・UAC・ロックポリシーは変更しない。サービスはSession 0でUIを作らず、固定の署名/管理者導入済みexeから対象sessionのWinSta0/Winlogon専用workerを起動する。Sodashitsu自体はSYSTEMにしない。

ロック画面への画面取得・入力は、既存の委譲接続・共有ticket・操作許可に加え、Bの明示的なローカル許可と起動中leaseを必須にする。IPCはlocal-only named pipe、導入したSIDと現在console sessionを照合し、実行ファイル/任意コマンド/任意sessionはRPCで受け取らない。

workerはSYSTEMであること、active console session、Winlogon input desktop、WTSのlocked状態をすべて確認。UAC（Winlogonでもunlocked）は拒否する。解除するとworkerを終了し、通常ユーザーhelperへ再接続（閲覧専用）する。通常デスクトップの画面取得をSYSTEMで続けない。

認証はWindows標準ログオン画面へ利用者が入力する。認証情報は保存/ログ出力しない。ロック画面中はエージェントへの画面提供/操作、clipboard、動画、解像度変更を無効にする。Ctrl+Alt+Delが必要な環境はserviceから固定SendSASを行い、Windowsの既存software SAS policyが許さなければ案内する。

## 制約

## 実装の安全境界

- Program Filesの固定exeを管理者のみ書換可能にする。ownerにはSCMのSTART/QUERYのみ付与し、任意コマンド・パス・sessionを受け取らない。
- pipeはFIRST_PIPE_INSTANCEとREJECT_REMOTE_CLIENTSを使用する。ユーザー側ACLはlogon SIDに限定し、FILE_CREATE_PIPE_INSTANCEを含まない個別データ権限のみ。クライアント側もSCMが示すPID、LocalSystem・DemandStart・固定ImagePathのサービス設定、固定exeとsession 0を照合する（通常ユーザーからSYSTEM tokenへの権限を要求しない）。サービス側は接続PID/token/owner/logon SID/sessionを照合する。
- leaseのheartbeat期限・親プロセス寿命・console sessionを監視する。workerはkill-on-close Job Objectに入れ、サービス異常終了でも回収する。
- WTS状態不明、console以外、UACは拒否する。capture・入力・SAS直前直後にも確認する。ロック解除で画像・入力・権限を破棄し、別接続の閲覧専用に戻す。
- SASは認証済み対象sessionのtokenを短時間impersonateして送る。既存policyの変更はしない。資格情報・入力本文・secure framebufferはログにもディスクにも保存しない。

対象はWindows 10/11 x64のログイン済みでロックされたactive console sessionの解除。古いWindowsのWTS lock flag反転を避けるため、HKLMのWindows majorを確認し対象外OSは拒否する。サインアウト状態/複数ユーザー/RDP session切替/生体認証の遠隔再現は含めない。初回導入はBの管理者操作が必要。実機のロック・資格情報入力・サービス導入は、レビューと模擬検証後に利用者の操作で行う。

## 一次資料

- https://learn.microsoft.com/en-us/windows/win32/winstation/desktops
- https://learn.microsoft.com/en-us/windows/win32/services/interactive-services
- https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessasuserw
- https://learn.microsoft.com/en-us/windows/win32/api/sas/nf-sas-sendsas
