# 専用サインインサービスのローカル制御（準備段階）

サインアウト後の接続に使う専用サービスの、ローカル管理ツールです。初回導入ツールを実装しています。更新・復旧ツール、および実SYSTEMでの検証は未完了です。現在は自動で導入・起動しません。通常サーバーのbuild/handoffとは独立しています。

## コンパイルだけ確認する

64bit Windows PowerShell 5.1で、同じrevisionのリポジトリを使います。

```powershell
powershell.exe -NoProfile -File scripts/remote-desktop/control-signin-service.ps1 `
  -ValidateOnly -OwnerSid 'S-1-5-21-1-2-3-1001' -ManifestSha256 ('a' * 64)
```

この例は生成用のSIDとハッシュを使います。SCM、配置済みファイル、鍵や登録情報へアクセスせず、C#をコンパイルするだけです。

## 配置済みサービスの操作

明示的に導入・確認したサービスに対して、昇格した管理者PowerShellから実行します。`-OwnerSid`には所有者の実SID、`-ManifestSha256`にはレビュー済みの配置済み`signin-package.json`の生バイトのSHA-256を指定します。ツールは固定パスと設定、ファイルの権限・リンク・ハッシュ、管理者の権限、所有者の実アカウントを検査します。別のサービス名・実行ファイル・コマンド・認証情報は引数にできません。

- `-Action status`：サービスと実行記録の状態をJSONで返します。開始・停止しません。
- `-Action start`：通常の起動要求を一度だけ保存し、実サービスのPID・作成時刻・実行ファイル・SYSTEM/session0を確認したハンドルを保持して、開始のACKを返します。`observation-acknowledged`は起動条件を確認した意味で、接続成功や閲覧・入力の許可を表しません。
- `-Action stop`：動作中の同じプロセスを保持して停止を要求し、SCMの停止、実プロセスの終了、終了コード0、子孫Job全回収の記録、同じバリアの排他取得を確認して、独立した停止記録を保存します。実プロセスの終了よりSCMの停止通知が先に届いた場合も、保持したハンドルで待ちます。

通常のNode処理が正常終了した場合、サービス本体は停止要求までバリアと配置済みコードを保持します。後から`stop`で同じサービス本体を確認できます。異常終了や強制終了は正常停止の証拠になりません。

管理実行は`-Mode admin -AdminNonce ... -AdminSha256 ...`で、実際の暗号化済みpending要求のnonceとハッシュを指定します。要求の準備と結果の確認は、後述の`control-signin-admin.ps1`で行います。管理実行の開始では、ACK時に保持した同じハンドルで自然終了まで観測します。返り値の`adminResult: inspect-required`はリソースの正常停止を示すだけで、要求が成功した意味ではありません。結果の確認・ack前に通常動作へ自動移行しません。

途中の書き込み、古い記録、不明なファイル、確認できない終了は復旧を必要とする状態として扱います。起動要求の再送、鍵や登録情報の消去、ACLの修復、サービスの再登録、プロセスの強制終了は自動で行いません。

## 検証範囲

生成した通常権限のHost・子プロセス・Jobと一時ファイルで、起動要求、ACK、終了、停止記録、別世代の起動を通して検証します。SCMはテスト用の呼び出しに置き換えます。記録の読み書きは、所有者単位の管理mutexとは別のjournal mutexで直列化します。公開途中のファイルを復旧状態と取り違えず、残された不明な途中ファイルを自動修復しません。

実際のサービスの登録・開始・停止、保護画面の取得・入力、実鍵やtrustの登録、音声デバイスはこの生成検証に含みません。関連APIは[QueryServiceStatusEx](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/nf-winsvc-queryservicestatusex)、[GetProcessTimes](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getprocesstimes)を参照してください。

## 管理要求の準備・結果確認・ack

`control-signin-admin.ps1`は、`prepare`・`result`・`acknowledge`を扱います。同じ実ownerとレビュー済みmanifest SHA（64桁の小文字16進数）を指定してください。サービス停止、同じバリアの排他取得、初期状態または独立確認済みの正常停止が必要です。サービスを自動で開始・停止しません。

`-Action prepare`は標準入力のパイプからUTF8の操作JSONを最大16384バイト受け取り、10秒以内のEOFを要求します。登録用token等を引数へ載せません。操作は`status`・`initialize`・`trust`・`revoke`・`enroll`・`disable`の6種類で、未知の項目・コマンド・パスは受け付けません。生成したnonceと期限を付け、機械DPAPIとprivateな固定保存先へ保存します。返り値はnonce・暗号化済み要求のSHA・期限・操作名だけです。

操作のJSONの例は`{"kind":"status"}`です。`trust`は`peer:{fingerprint,label}`、`revoke`は`fingerprint`、`enroll`は`origin,machineId,token,allowInput,peers`と任意のpublicな`caPem`を持ちます。viewerのfingerprintは64桁、machineIdは32桁の小文字16進数です。各peerはfingerprintとlabelだけで、最大8件です。enrollには最低1件必要です。

UTF8ファイルから渡す場合は、Windowsの`cmd.exe /d /c "type operation.json | powershell.exe ..."`のようにバイト列を保つパイプを使います。入力ファイルに登録tokenを保存した場合は、そのファイルの権限と削除を自身で管理してください。

`-ValidateOnly`はコンパイルのみです。`-ValidateOperationOnly`は入力を検証して`{"state":"operation-validated","operation":"status"}`のように2項目だけを返します。この事前検証は管理者の確認・SCM・保存を行いません。日本語labelや登録tokenを出力しません。両方の検証スイッチは同時指定できません。

準備後は、返されたnonceとcipherSha256を`control-signin-service.ps1 -Action start -Mode admin -AdminNonce ... -AdminSha256 ...`へ指定します。自然終了とリソースの正常停止を確認した後、`control-signin-admin.ps1 -Action result -Nonce ... -CipherSha256 ...`で結果を確認します。`success`と`incomplete`を区別し、公開statusだけを表示します。

確認した結果を片付ける場合だけ、同じnonce・cipherSha256と結果の`resultSha256`を`-Action acknowledge -Nonce ... -CipherSha256 ... -ResultSha256 ...`へ渡します。`incomplete`も明示的に確認・ackできますが、操作の再試行や巻き戻しを意味しません。結果がない・照合できない・途中のファイルが残る場合は削除せず、復旧が必要な状態を保ちます。ack後も通常サービスを自動起動しません。

## 初回導入（実機未検証）

`install-signin-service.ps1`は、レビュー済みの配布フォルダを固定配置へコピーして専用サービスを登録します。既存のサービス・コード・保存先があれば導入処理を中止し、上書き・修復・自動起動はしません。通常サーバーのbuild/handoffで実行される処理ではありません。

まず`-ValidateOnly -SourceDirectory ... -OwnerSid ... -ManifestSha256 ...`を指定します。このモードは配布元のmanifestの生バイトSHAと閉じたファイル一覧、各ファイルのサイズとSHAを検証し、配布物を実行しません。配置先・SCM・管理者権限の検証や変更も行いません。

実導入は64bit Windowsの昇格した管理者が、確認した同じ引数から`-ValidateOnly`だけを外して明示的に行う操作です。所有者単位の管理mutexを保持し、privateなステージへコピーし、保持したファイルとディレクトリの同一性を検証して固定先へ公開します。初期記録はmanifestと排他バリアに結び付けます。サービスはまず無効状態で登録し、設定・配置・初期記録を確認して導入途中の印を取り除いた後、手動起動へ変更します。返り値の`started`は`false`です。鍵・trust・登録情報は作成しません。

途中失敗のファイルや無効サービスは自動で消しません。再実行で上書きもせず、明示的な復旧を必要とする状態を保ちます。導入途中の印はファイル・ディレクトリのどちらでも通常起動を拒否します。

生成検証では一時フォルダへのコピー、DPAPI初期記録、バリア、SCMの代替呼び出しを通しています。実際のSCM登録・設定変更、privateファイル作成APIによる実所有者/ACLの確認、SYSTEM起動は未検証です。実導入前に、配布物とこの手順のレビュー、実機で実行する操作の承認が必要です。

## 初回導入完了直後の無効設定からの復旧（実機未検証）

`recover-signin-initial.ps1`は、初回導入がすべて完了し、導入途中の印を取り除いた後、手動起動設定への変更前に中断した場合だけを対象にします。`-OwnerSid`とレビュー済みの`-ManifestSha256`を指定します。まず`-ValidateOnly`でコンパイルだけを確認できます。このモードはSCMや保存先に触れません。

実行時は昇格した管理者、所有者mutex、同じ配布物の保持、同じバリアの排他取得、無効かつ停止中の完全なサービス設定を必要とします。初期DPAPI記録がpackage/barrierと一致し、admin/runtimeが空で、保存先の項目が正確な一覧と一致する場合だけ、手動起動へ戻します。停止状態のPIDは使用しません。初期記録を作り直す処理や、印・残骸の削除は行いません。

開始要求後の記録、管理要求、鍵や登録情報、導入途中の印、不明なファイルがある場合は拒否します。更新途中や一般の異常終了を直すツールではありません。成功してもサービスを起動しません。実際のSCM設定変更は未検証です。
