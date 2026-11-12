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
既存のコード・データ・サービスを上書きしません。サービスは手動起動で、停止したままです。

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
旧サービスの登録を削除した後、新サービスを手動起動へ設定します。既存のBootサービスや
他のサービス・Taskを一括削除しません。移行後も自動で起動しません。

途中で失敗した場合は、SCMの状態と保存された配布物を、管理者がWindows標準ツールで確認します。
独自の復旧ticket、boot証明、履歴の再生成、自動rollbackはありません。

## 開始・停止・状態

`control-signin-service.ps1 -OwnerSid … -ManifestSha256 … -Action status|start|stop`を使います。
`-ValidateOnly`はコンパイルだけです。実操作は昇格した管理者のローカル呼び出しに限ります。
開始・停止はSCMへ要求し、実行中のプロセスはSCMのPIDと保持したOSハンドルで確認します。
子プロセスはWindows Jobで管理します。保存したPIDやrun journalは開始の条件にしません。

## 登録情報の管理

既存の`control-signin-admin.ps1`は`prepare`・`result`・`acknowledge`を扱います。
入力は標準入力のUTF8 JSONで、tokenをコマンド引数に載せません。操作は
`status`・`initialize`・`trust`・`revoke`・`enroll`・`disable`です。
prepareで返されたnonceとcipherSha256を、サービス開始の
`-Mode admin -AdminNonce … -AdminSha256 …`へ渡します。終了後にresultを確認し、
同じnonce・cipherSha256・resultSha256でacknowledgeします。
この管理用メールボックスは後続の整理対象で、Windows標準のサービス管理には使いません。

専用接続の閲覧と許可した入力の範囲は従来どおりです。音声・マイク・ファイル・クリップボード・
エージェント・Ctrl+Alt+Delを新たに許可する変更ではありません。
