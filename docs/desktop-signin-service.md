# 専用サインインサービスのローカル制御（実機検証待ち）

サインアウト後の接続に使う専用サービスの、ローカル管理ツールです。初回導入、正常停止後の更新、記録に一致する更新途中の再開・手動設定復元を実装しています。実SYSTEMでの検証は未実施です。一般の異常終了を自動復旧するツールではありません。現在は自動で導入・起動しません。通常サーバーのbuild/handoffとは独立しています。

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

## 正常停止後の配布物更新（実機未検証）

`upgrade-signin-service.ps1`は、現行仕様の専用サービスを別のレビュー済み配布物へ更新する明示的なローカル操作です。旧版互換や移行用の分岐はありません。`-OwnerSid`、配置済みmanifestの生バイトSHAを`-OldManifestSha256`、新配布物を`-SourceDirectory`と`-ManifestSha256`で指定します。`-ValidateOnly`はコンパイルのみで、SCM・配置先・配布元に触れません。

実行時は64bit Windowsの昇格した管理者で、所有者mutex、既存配布物の保持、サービスの手動起動・停止設定を確認します。同じバリアの排他取得と、初期記録または独立確認済みの正常停止記録が必要です。開始待ち・独立確認前の停止・不明な記録・管理要求・導入途中の印があれば拒否します。

新配布物をprivateステージへコピー・確認した後、サービスを無効設定へ変更します。そこからprivateな更新記録を保持し、旧コードと旧実行記録をUUID名の保存先へ移し、同じディレクトリと記録であることを検証して新配布物へ切り替えます。既存の鍵・信頼設定・登録情報・runtime・バリアは削除や再作成をしません。旧コードと記録の保存先を結果に返します。

すべてを検証してこの更新の印を取り除いた後、手動起動設定へ戻します。サービスは起動しません。無効化前のコピー失敗では旧設定が保たれます。無効化後の中断では、コード・記録・ステージ・印を自動削除したり、手動起動へ戻したりしません。途中状態の復旧は別途必要です。再実行して上書き・自動修復する機能はありません。

生成した一時配布物・DPAPI記録・排他バリアとSCMの代替呼び出しで検証します。実際のSCM変更、配置先のACL作成、実SYSTEM起動、実機更新は未検証です。

## 更新途中の確認・再開と、正常記録からの手動設定復元（実機未検証）

`recover-signin-maintenance.ps1`は、現行仕様の更新記録に一致する途中状態だけを扱います。`-ValidateOnly`はコンパイル専用です。実操作には昇格した管理者・実所有者・所有者mutexが必要で、起動・停止・強制終了はしません。

`-Action inspect -OwnerSid ... -OldManifestSha256 ... -ManifestSha256 ...`は、privateな更新記録の閉じた項目と生バイトSHAを返します。SCMやファイルの状態を変更しません。`-Action resume`は同じ引数に、確認したSHAを`-MarkerSha256`として加えます。記録の所有者・新旧配布物・ディレクトリID・実行ID・停止証拠・バリア・保存先の名前が一致する必要があります。

再開では、無効・停止の完全なサービス設定と同じバリアの排他取得を確認します。旧世代の初期記録または独立正常停止記録を再検証したうえで、列挙したコード配置から未実施の切り替えだけを行います。保持を解除した移動元は、native検査後にも権限を確認し、記録の期待IDと一致する場合だけ移動します。移動後も同じIDと内容を確認します。

新世代の`runs`が空、未作成、または記録と一致する初期状態なら続行できます。単独の書きかけ`initial.writing`は、そのフォルダ全体を`runs-incomplete-<更新UUID>`へ元のバイトのまま退避します。書きかけの内容を正常停止の証拠として扱いません。旧世代の独立した証拠・更新記録・無効設定・排他状態に基づき、記録された新runIdで初期記録を作ります。ほかのファイル、開始待ち・実行中・未確認停止、不明な配置、退避先との衝突は拒否します。退避後の再中断で同じ退避先と衝突した場合も、双方を保持して別途の対応を必要とします。

更新の印を取り除いた直後に中断した場合は、`-Action restore -OwnerSid ... -ManifestSha256 ...`で現在の配布物を指定します。印がなく、現在のpackageとバリアに一致する初期または独立正常停止記録があり、adminが空で、無効・停止設定を検証できた場合だけ手動設定へ戻します。runtime・鍵・信頼設定・登録情報は保持します。

成功してもサービスを起動しません。一般の異常終了や、独立した正常停止証拠のない実行履歴を消して再開する機能ではありません。生成した一時配布物・DPAPI・バリア・SCM代替で検証し、実際のSCM変更・実機復旧は未実施です。

## 専用stateの保存先

SYSTEM専用の鍵・登録情報・管理要求・実行記録は、コードとは別の`%ProgramFiles%\Sodashitsu\DesktopSigninData\<owner SIDのSHA-256>`へ置きます。専用rootと各owner slotはSYSTEM/Administratorsだけがアクセスできる固定ACLです。コードの更新・退避でstateを移動・再生成しません。

標準ProgramDataの祖先には一般ユーザーの属性変更権限もあるため、現在の祖先検査を緩めずにこの保存先を使います。既存のProgramDataやProgram FilesのACLを修復・変更して通すことはしません。旧`%ProgramData%\sodashitsu\desktop-signin\<owner hash>`がある場合や存在確認ができない場合、導入・更新・復旧・stateアクセスを拒否します。旧stateの自動コピー・削除・別の鍵の自動生成は行いません。既存の旧配置を使う場合は、別途レビューした移行が必要です。

## 初回導入マーカーが残っている場合の明示的な完了

`recover-signin-install.ps1`は、専用サービスの初回登録後に中断し、`install.transition`が残った未起動の配置だけを扱います。管理者で、レビュー済みの同じownerとmanifestを指定します。`-ValidateOnly`はコンパイルだけです。

`-Action inspect`はコード・stateのprivate ACL、canonicalな初回marker、停止/無効の固定サービス構成、同じpackage/barrierに結び付いたinitial journal、空のadmin/runtimeを確認し、markerのSHA256を返します。サービスやmarkerを変更しません。

同じ検査結果で完了する場合だけ、`-Action complete -MarkerSha256 <inspectの値>`を指定します。すべての証拠を保持し直して照合し、サービスのowner/DACLを設定・同じhandleで読み戻してからmarkerを除去し、最後にmanualへ変更します。サービスは起動しません。初期SCM ACLで許容する一般ユーザーのquery/interrogate/user-controlは停止中・無効の初回状態だけに限定し、start/change-config/ownership/DACL変更は許可しません。通常のサービス検査の基準は維持します。

marker除去前に失敗すれば、その状態と無効サービスを残します。marker除去後・manual変更前の中断は、従来の`recover-signin-initial.ps1`で照合できます。鍵・trust・登録情報・journalの再生成、未知の配置の削除や採用はしません。

## 固定サービス名のnative起動

固定名は `SodaDesktopSignin-` とowner SIDの64桁SHA-256を組み合わせた82文字です。.NET ServiceBaseの80文字制限を避けるため、登録済みの名前を短縮せずnative SCM dispatcherを使います。サービスへ渡す追加の起動引数は拒否します。stop/shutdownは25秒の停止期限を持ち、全cleanupが終わるまでSTOPPEDを報告しません。

`validate-signin-service-dispatch.ps1 -NegativeControls` は通常権限の生成adapterで名前と起動/停止/失敗を検査します。実SCM・鍵・trustは操作しません。既存の `validate-signin-host.ps1` は子プロセス/Jobと配布用EXE生成を含みます。起動失敗で未確認のpending要求が残った場合は、修正版のEXEを上書きして再送することはできません。要求とjournalを保持して明示的な復旧を行います。

## 未受理のまま期限が切れた初期化要求の取消

`recover-signin-unclaimed.ps1` は、初期化の管理要求がclaim前に期限切れとなった場合だけの明示的なローカル復旧です。`-ValidateOnly` はコンパイルだけを行います。実行時は昇格した管理者で、固定owner/配布物のSHAと、確認した元 `intent.pending`／`admin.pending` の生バイトSHAを `-RunFileSha256`／`-AdminFileSha256` に指定します。

停止中の厳格なサービス構成、同じ配布物と排他barrier、鍵などがまだない初回slot、空runtime、未受理の2ファイルだけを必要とします。暗号化済み要求のowner/nonce/hash/package/barrierと両期限を照合し、操作がinitializeであることを確認します。claim/started/不明なファイル・未期限切れ・別操作があれば拒否します。

`install.transition` を先に保存し、元runs/adminを `runs-unclaimed-<id>`／`admin-unclaimed-<id>` へ非置換で退避します。Windowsのdirectory移動前だけ元file handleを閉じ、移動後は同じfile identityとhashを確認したarchive handleを再保持します。新しい実行世代のinitialと空adminを用意し、永久の `unclaimed-<id>.json` に取消の結び付きを残してから印を除去します。元要求を再生・削除せず、cleanなprocess停止を証明した記録とは扱いません。サービスの起動・停止・設定変更や鍵/trustの生成・消去は行いません。成功後は既存の明示的な更新へ進めます。

途中失敗では印・退避済み/未退避の原本・途中ファイルを保持し、既存の起動・更新・復旧を拒否します。自動で再試行・印の削除・初期化はしません。生成検査は `validate-signin-unclaimed-recovery.ps1 -NegativeControls` です。sr-pcの実配置では、下記のとおり取消と更新を確認済みです。

2026-11-05のsr-pcでは、この未受理取消と次の配布物への更新が成功しました。その後のadmin起動は観測済みのまま異常終了したため、この取消操作の対象にはなりません。native hostとTypeScriptで状態保存先の判定が一致しない不具合を修正しています。

## 観測済みの異常終了から、OS再起動を挟む限定復旧

`recover-signin-restart.ps1` は、未claimの期限切れinitialize、空のruntime、正確なobserved記録3件、以前の未受理取消1件と完了した更新1件の履歴だけを対象にします。既存鍵・登録情報・未知のファイル・他の履歴は拒否します。一般の異常終了を自動復旧するものではありません。

昇格した管理者で `-Action bind -OwnerSid … -ManifestSha256 … -RunFileSha256 … -AdminFileSha256 …` を実行し、返された `ticketSha256` を記録します。固定配布物、SCMの停止状態、元の生バイト、全項目のidentity/hash、排他barrierを照合し、起動を遮断する印を保存します。固定System32の `services.exe` を、SYSTEM・session 0・critical・生存が確認できるnative handleで保持し、PIDと作成時刻を印に固定します。

OS再起動後、同じ指定に `-Action recover -TicketSha256 …` を渡します。検証済みのcritical SCM実体が変わり、その他の証拠が一致する場合だけ、元のruns/adminを退避して新generationと永久receiptを作ります。旧Host/Nodeの正常終了やJob-zeroを証明したことにはしません。同じ実体、証拠の差異、中断状態、再実行は拒否し、原本と印を保持します。復旧操作自体は再起動もサービス起動も行いません。

この境界の考え方は、[Microsoftのcritical system servicesの説明](https://learn.microsoft.com/en-us/windows/win32/rstmgr/critical-system-services)と[IsProcessCritical](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-isprocesscritical)に基づきます。kernelのboot GUIDとは区別します。critical属性の変更やSCMの終了は行いません。

`-ValidateOnly` はコンパイルだけ、`validate-signin-restart-recovery.ps1 -NegativeControls` は通常ユーザーの隔離ファイルで成功・再実行拒否・中断保持と負例を検査します。sr-pcでBindと同じ再起動状態からのRecover拒否は確認済みです。実OS再起動後のRecover以降は[実機記録](../.aidev/works/20261105-signin-restart-recovery/verification.md)で未完了として管理しています。

## claim後の初期化が鍵の保存直後に中断した場合

`recover-signin-claimed-initialize.ps1` は、期限切れのclaim済みinitialize、観測済みの実行記録、既知の取消・再起動復旧履歴、`runtime/desktop-endpoint/identity.json` だけがある状態に限定した管理者用ツールです。未知の履歴やファイル、既存のtrust・登録情報があれば拒否します。初期化要求の再生や鍵の作り直しは行いません。

先に、レビュー済みのソースを管理者だけが書ける場所へ配置し、`create-signin-partial-identity-proof.ps1 -OwnerSid … -ManifestSha256 … -Nonce …` をSYSTEMのprimary tokenで実行します。これは既存鍵の読取専用検査です。SYSTEMのCurrentUser DPAPIで復号し、P-256 PKCS8形式、秘密鍵による署名と保存公開鍵の一致、trustが空であることを確認します。鍵・平文を出力せず、privateな固定先へpackage・SCM実体・runtimeのSHAと公開指紋を含む証拠を作ります。生成したtaskの終了と削除を確認してから次へ進みます。

復旧ツールへ `-OwnerSid`、`-ManifestSha256`、元の `-RunFileSha256`／`-ClaimFileSha256`、新しい `-ProofNonce`／`-ProofSha256` を指定します。省略時の `-Action inspect` は照合だけです。証拠は90秒以内で、実行中のSCM実体・barrier・保存された暗号文と一致する必要があります。

`-Action bind` は全項目を固定した印とticket SHAを保存します。OS再起動後、別nonceで同じSYSTEM検査を行い、`-Action recover -TicketSha256 …` を実行します。新しいcritical SCM実体と、元の暗号文・公開指紋・全履歴が一致する場合だけ、runs/adminをUUID名で退避して新しい初期境界を作ります。runtimeは全バイト維持し、元要求の結果は「不明」のまま保存します。サービスは起動しません。中断後は印と原本を残し、自動再試行しません。

その後は、修正版への明示更新と、別nonceの新しいinitialize要求を使います。既存identityの読み込みに失敗した場合の鍵再生成は認めません。複合初期化の期限は各段階30秒・全体60秒で、要求自体の期限も維持します。タイマー通知が遅れても単調時計の期限を超えた結果を成功扱いしません。個別native保存処理の期限は変えていません。

`validate-signin-claimed-initialize.ps1 -NegativeControls` は、実SCMや実保存先を使わず、生成した鍵・履歴で照合、退避、5箇所の中断、改変したソースの拒否を検査します。実機の進捗は[検証記録](../.aidev/works/20261105-claimed-initialize-recovery/verification.md)に分けて記載します。


### サービスの起動段階を確認する

専用サービスが `WIN32_EXIT_CODE=1066` で停止した場合、この版以降の
`SERVICE_EXIT_CODE` は次の固定番号です。Windowsの `sc.exe query` で確認できます。
古い版や分類できない失敗は `1`、正常終了は `0` です。

| 番号 | 失敗した段階 |
| --- | --- |
| 101 | 導入済みパッケージの検証 |
| 102 | 保護されたruntimeと排他ファイルの保持 |
| 103 | 実行記録のオープン |
| 104 | 実行記録による起動許可 |
| 105 | 専用Nodeプロセスの起動・再開 |
| 106 | プロセス待機中の確認 |
| 107 | 子プロセスの終了結果・保持状態・正常終了の確認 |
| 108 | 実行記録への完了記録 |
| 109 | 完了後の停止要求の待機 |

番号は最終的に失敗を検出した箇所を示します。例えば107だけでは、Node内部の
どの処理が失敗したかまでは分かりません。例外本文・ファイルパス・子プロセスの出力・
鍵・画面・入力内容はこの番号に含めません。後始末が終わる前に停止完了を報告せず、
この番号を理由に再試行・鍵の初期化・起動許可の省略は行いません。
