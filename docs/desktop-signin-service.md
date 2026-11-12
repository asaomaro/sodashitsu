# 専用サインインサービスのローカル制御

サインアウト中の接続に使う専用サービスを、Windows SCMで導入・更新・開始・停止します。
通常の操舵室サーバーと、サーバーが起動する一時SYSTEM Taskとは別の機能です。
導入や更新のコマンドがサービスを自動起動することはありません。

この版ではServiceBaseを使い、独自の開始要求・claim・観測ACK・停止receiptと、その履歴を
照合する専用復旧を廃止しました。新しい版のWindows実機確認は未実施です。
2026年11月7日までの実ロック/PIN画面・入力・通常操舵室への復帰の確認は旧版の結果です。

## 配置と認証情報

サービス名は `SodaDesktopSignin-` とowner SIDのSHA-256の先頭16文字です。
コードとデータの固定パス、配布物のowner SIDとの照合には従来どおりSHA-256の全64文字を使います。
同じ短縮名が登録済みなら、別の所有者のサービスとして採用しません。

コードは管理者とSYSTEMだけが変更できるProgram Files配下に置きます。SYSTEMホストが
マニフェストと同梱コードを確認し、保持したままNode標準ローダーで同梱アプリを起動します。
Nodeの独自VMローダーを未信頼コードの隔離には使いません。

既存のidentity・trust・enrollmentの保存先とDPAPI形式は変更していません。更新はデータの
スロットを移動・削除・再生成しません。以前のruns/admin履歴も、起動許可として参照せず保持します。
管理要求が未処理・未確認の場合、鍵の初期化や要求の再送をせず、その要求を確認してください。

## 初回導入

64bit Windows PowerShell 5.1で、レビュー済み配布元と所有者の実SID、
`signin-package.json`の生バイトのSHA-256を指定します。

```powershell
powershell.exe -NoProfile -File scripts/remote-desktop/install-signin-service.ps1 `
  -ValidateOnly -SourceDirectory 'C:\reviewed-release' -OwnerSid '<owner SID>' `
  -ManifestSha256 '<64桁のSHA-256>'
```

`-ValidateOnly`は配布元を検証します。配置先やSCMを変更せず、配布物を実行しません。
導入は昇格した管理者が同じ引数から`-ValidateOnly`を外して行います。
既存のコード・データ・サービスを上書きしません。既定は手動起動です。`-StartupType Automatic`を指定するとWindows標準の自動起動に設定します。導入直後はどちらも停止したままです。

## 更新と旧サービス名からの移行

先に対象サービスを停止します。更新コマンドは停止を要求せず、停止済みであることを確認します。

```powershell
powershell.exe -NoProfile -File scripts/remote-desktop/upgrade-signin-service.ps1 `
  -OwnerSid '<owner SID>' -OldManifestSha256 '<配置済み配布物のSHA-256>' `
  -SourceDirectory 'C:\reviewed-release' -ManifestSha256 '<新配布物のSHA-256>'
```

`-ValidateOnly`を付けるとコンパイルだけを確認し、SCMと配置済みデータにアクセスしません。
実際の更新は、配置済みコードと配布元を検証し、新コードをステージしてから旧コードを
`*.previous-*`へ移動し、新コードを固定パスへ配置します。以前のコードを自動削除しません。

従来の全64文字を使う長いサービス名がある場合、その正確な実行パス・SYSTEMアカウント・
停止状態・設定を確認してから、短い名前へ移行します。新サービスを無効状態で登録し、
旧サービスの登録を削除した後、新サービスへ選択した起動設定を反映します。`-StartupType`を省略した更新は、既存サービスのAutomatic/Manualを維持します。`-StartupType Automatic`または`Manual`を明示して変更できます。既存の起動用登録や
他のサービス・Taskを一括削除しません。更新の直後には開始しません。起動だけを行う旧Taskがある場合のSCM Automaticへの集約は、実機のsole operatorがその内容を確認して個別に行います。

途中で失敗した場合は、SCMの状態と保存された配布物を、管理者がWindows標準ツールで確認します。
独自の復旧ticket、boot証明、履歴の再生成、自動rollbackはありません。

## 開始・停止・状態

`control-signin-service.ps1 -OwnerSid … -ManifestSha256 … -Action status|start|stop`を使います。
`-ValidateOnly`はコンパイルだけです。実操作は昇格した管理者のローカル呼び出しに限ります。
開始・停止はSCMへ要求し、実行中のプロセスはSCMのPIDと保持したOSハンドルで確認します。
子プロセスはWindows Jobで管理します。保存したPIDやrun journalは開始の条件にしません。

## 登録情報の管理

昇格した管理者が、操作JSONを標準入力のパイプから1回だけ渡します。

```powershell
powershell.exe -NoProfile -File scripts/remote-desktop/control-signin-admin.ps1 `
  -OwnerSid '<owner SID>' -ManifestSha256 '<配置済み配布物のSHA-256>'
```

JSONの入力にはUTF8を使います。上のコマンドを対話入力で待たせず、呼び出し元からパイプで渡して
EOFを閉じます。tokenをコマンド引数に載せません。`-ValidateOnly`はコンパイルだけです。

操作は`status`・`initialize`・`trust`・`revoke`・`enroll`・`disable`の6種類です。
`{"kind":"status"}`で現在の公開状態を確認できます。trustには`peer:{fingerprint,label}`、
revokeには`fingerprint`、enrollには`origin,machineId,token,allowInput,peers`と任意の`caPem`を指定します。
任意のコマンド・実行ファイル・保存先は指定できません。要求と返答は各16384バイトまでです。

通常のサインインサービスを先に停止してください。管理コマンドはSCMから同じ固定サービスを
管理目的で開始し、既存の排他ハンドルを保持したSYSTEMホストへ接続します。
受け口はローカルの管理者とSYSTEMだけに許可したnamed pipeです。サービス側はOSの
接続者tokenで昇格した管理者であることを確認し、クライアント側はpipeのサーバーPIDと
SCMの実PID、保持したSYSTEMプロセスを照合してから秘密を含む要求を渡します。
リモート接続は拒否し、既存のpipeを採用しません。

SYSTEMホストが検証済みの同梱Nodeにstdin/stdoutで1操作だけを渡します。
既存のidentity/trustの保存形式とSYSTEM CurrentUser DPAPI、enrollmentのLocalMachine DPAPIは維持します。
操作完了後に子Jobを回収して公開状態を返し、サービスは停止します。通常接続へ自動移行しません。
既存サービスのIPCだけを使い、GUI用の一時Taskに管理操作を流しません。

`outcome: success`と`incomplete`を区別します。途中の処理が保存済みかもしれないため、
失敗時の自動再送やrollbackはありません。次の明示操作の前にstatusを確認してください。
要求・結果・nonce・期限・ackのファイルは作りません。旧admin/runs履歴は消去せず、
起動や管理操作に読み込まないまま残します。旧prepare/result/acknowledgeの手順は廃止しました。

専用接続の閲覧と許可した入力の範囲は従来どおりです。音声・マイク・ファイル・クリップボード・
エージェント・Ctrl+Alt+Delを新たに許可する変更ではありません。
