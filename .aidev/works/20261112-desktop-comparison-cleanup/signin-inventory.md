# サインインの独自実装の除去台帳

基準: `a29196e6`。Windows実機での設定変更は行わず、ソースのみを整理する。
この台帳は完了報告ではない。「対象」は未実装。既存コードが相互依存していることは残す根拠にしない。
「独自実装の方が優れている」として残す例外は **0 件**。

## 標準の比較元と境界

- [RustDesk Windows実装（1ac53ccb1b28e62b726db3cbd6042110349c9c2a）](https://github.com/rustdesk/rustdesk/blob/1ac53ccb1b28e62b726db3cbd6042110349c9c2a/src/platform/windows.rs#L639): WindowsのSCM handler/statusとセッション別プロセスを使う。独自の開始intent/claim/観測ACK/停止receiptがWindowsの起動に必要という根拠にはならない。
- [Microsoft Service Control Handler](https://learn.microsoft.com/en-us/windows/win32/services/service-control-handler-function): stop/shutdownとSCMの状態報告を標準の寿命管理にする。
- [Microsoft QueryServiceStatusEx](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/nf-winsvc-queryservicestatusex): 実行中のPIDはSCMから取得する。保存したPIDやrun journalを起動許可として使わない。
- [Node vm](https://nodejs.org/docs/latest-v24.x/api/vm.html): vmは未信頼コードの安全な隔離ではない。本製品の同梱アプリはnative側で検証した信頼済みコードであり、Node標準ローダーを使う。
- DPAPI・既存のidentity・trust・enrollmentは製品の認証データ。ソース削除に伴って消去・再生成・自動再登録しない。
- SCMとファイルACLは一般ユーザー→SYSTEMの境界。管理者とSYSTEMが同じ鍵を読めることを新たな独自journalで証明する必要はない。署名/マニフェスト照合とprivateなコード配置は通常の配布物の信頼確認へ縮小する。
- この基準コミットにはBoot用登録の実装/登録スクリプトが存在しない。実機の起動用Task等は外部配置として、sole operatorが別途確認する。通常サーバーからの一時SYSTEM Task起動と、再起動/サインイン前の起動機能は分ける。

## 実装と検証

第1段階: 独自JSローダーを除去、Worker/Presence/NativeHostの埋込チェックをテスト専用partialへ移動。Node検証とbundle/nativePackageの2テストが成功。C#のコンパイルとWindows実機は未実施。
第2段階: 未受理・再起動・claim後初期化の復旧とSCM critical processの起動世代証明を削除。これらの呼び出しは削除対象の中だけに閉じており、runtime-assetsにも含まれていない。履歴ファイルや登録されたサービスへは触れない。

第3段階: `ServiceBase`へ置換し、サービス名をowner hash先頭16文字に短縮。Host/Workerの実行記録による許可を除去し、SCMと実プロセスhandle/作成時刻を使う。installerは初期journalを作らず、upgraderは既存データを触らず標準のコード退避と置換を行う。旧全64桁サービス名からの明示移行をupgraderに含めた。独自dispatcherの検査とjournal前提のcontroller検査は削除。

ServiceBaseへの置換根拠は[Microsoft公式API](https://learn.microsoft.com/en-us/dotnet/api/system.serviceprocess.servicebase?view=netframework-4.8.1)。長い自前の名前だけが独自dispatcherを必要にしていたため、名前を変えた。短縮名は認証identityではなくSCMの検索キーであり、owner/パッケージ/フルhashのパス照合を維持する。

第4〜5段階: 初回/更新の復旧、maintenance/upgrade記録と実行journalの全ソース・専用検査・専用操作を削除。runtime-assetsからも除去。第6段階: 初回導入のinstall.transitionと状態ラッパーを除去し、private配置→検証→SCM登録の順へ縮小。既存の記録ファイルは削除しない。

## 残る整理とレビュー境界

- 管理メールボックスの実行経路は標準named pipe request/replyへ置換済み。旧AdminEnvelope/Journal/Deadline/Result/PersistenceとTS対応の未使用ファイルは物理削除済み。SYSTEM CurrentUser DPAPIと既存identityは維持。GUI用一時Taskは使わず、新たな永続要求・結果・nonce・世代journalも作らない。
- ServiceBase・短縮名・旧名からの移行と停止/終了の競合を独立レビューするまで、このソースを実機へ適用しない。起動の見た目や旧記録の存在を正常稼働の証拠にしない。
- Scmは標準ServiceControllerへ、InstallerScm/UpgradeScmは登録/設定/削除だけのWin32 SCM呼び出しへ縮小済み。旧Calls/busy/checking/created状態や復旧用関数は削除。Automatic/ManualはWindows標準の設定として許可し、更新では省略時に既存値を維持する。旧BootStart Taskの読み取り結果に基づく実設定変換はsole operatorが行う。
- 独自scopeのWinEvent/atom/marker/epoch/ticket/時刻による失効とJS LocalLeaseを削除。保持したbroker/worker handleとPID/作成時刻/実session/NoUser+Winlogonの事実、明示した操作同意、入力sequenceだけを残す。画像ACKは転送backpressureだけで入力許可とは結び付けない。

## 所有と寿命の整理

Presenceの120秒寿命・5秒policy lease・2秒DPAPI/digest poll・4096回readonly RPC上限・専用context roleを削除し、既存EndpointStoreをwriteAllowed=falseで直接使う。Node module VM/builtin sandboxは用いない。保護済みnative hostのpackage/data保持と停止時だけの管理編集が所有を確保する。サービスの候補session待ちは既存startup loopへ戻り、source喪失時は現在の接続を閉じる。実機のWinlogon/UAC/起動前session生成は未検証。

WindowsProtectedEpochの物理削除はNative担当の通常helper/prepared/protected参照除去と対になる。独立branch単体の旧helper build listにはまだ旧参照があるため、統合順を守る。

起動Taskの実機読み取りでは、BootStartはSCM世代guard・attempt/result記録・旧controllerのstart normalだけを実行し、別のアプリ起動等はしない。標準SCM Automaticへ置換できるソース構成とし、実登録の変換/既知Task削除はsole operatorが別途行う。

## 管理IPCの標準実装との対応

| 本製品の処理 | 比較元と理由 |
| --- | --- |
| pipe作成時の明示ACL・接続前のサーバー認証 | [RustDesk ipc/windows.rs（固定commit）](https://github.com/rustdesk/rustdesk/blob/1ac53ccb1b28e62b726db3cbd6042110349c9c2a/src/ipc/windows.rs#L42)のlistener_security_attributes / connect / ensure_serverと同じOSの境界。本製品の受け口は管理操作だけなのでBA/SYに限定 |
| 実サービスのPIDとpipeサーバーPIDの照合 | 同ファイルのGetNamedPipeServerProcessId。こちらは固定SCMサービスと保持したSYSTEM/session0 process handleも照合。独自のnonce・receiptは使わない |
| 管理者token確認とSYSTEMへ復帰 | [Microsoft named pipe impersonation](https://learn.microsoft.com/en-us/windows/win32/ipc/impersonating-a-named-pipe-client)。RunAsClient内で管理者を確認し、抜けてからSYSTEM DPAPI/保存を行う |
| privateなpipeとremote拒否 | [Microsoft named pipe ACL](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights)。明示DACLとREJECT_REMOTE_CLIENTS、FIRST_PIPE_INSTANCE。通常ユーザー→SYSTEMへの境界で、管理者自身を隔離する仕組みではない |
| 許可した6操作を1回処理 | RustDeskのservice-scoped IPC allowlistに対応。Sodashitsu固有のidentity/trust/enrollment操作は既存EndpointStoreと固定helperへ渡す薄いアダプター。任意パス・実行ファイル・コマンドは受け付けない |

旧コードの更新では古い配布物を実行しないため、旧22項目manifest schemaは持たない。固定サービス/実行パス/コードACLと明示指定した旧manifestのバイトSHAを確認してコードを退避し、新しい閉じた配布物だけを検証・実行する。データスロットは変更しない。

## C# 全件

| ファイル | 判断 |
| --- | --- |
| `scripts/remote-desktop/WindowsSigninAdminController.cs` | Sodashitsu用アダプター：固定SCM serviceへ1回の管理要求、OS認証pipeと固定操作allowlist。永続mailbox/結果を持たない |
| `scripts/remote-desktop/WindowsSigninAdminControllerChecks.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninAdminDeadline.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninAdminEnrollment.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninAdminEnrollmentChecks.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninAdminEnvelope.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninAdminExecutionChecks.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninAdminInput.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninAdminJournal.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninAdminJournalChecks.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninAdminPersistence.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninAdminPersistenceChecks.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninAdminResult.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninCandidate.cs` | Sodashitsu用アダプター：固定Signin identity/trust/enrollment/desktop wireとOS APIの接続。優位性による独自framework例外ではない |
| `scripts/remote-desktop/WindowsSigninCandidateChecks.cs` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/WindowsSigninCandidateNative.cs` | Sodashitsu用アダプター：固定Signin identity/trust/enrollment/desktop wireとOS APIの接続。優位性による独自framework例外ではない |
| `scripts/remote-desktop/WindowsSigninClaimedInitializeRecovery.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninClaimedInitializeRecoveryChecks.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninController.cs` | 標準へ置換済み：ServiceBase/SCM/OSプロセスhandle/Job・通常の配布物配置。残る共通コードは独立レビューで確認 |
| `scripts/remote-desktop/WindowsSigninControllerChecks.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninControllerMutex.cs` | 標準へ置換済み：BA/SY private Windows Mutex。AbandonedMutexは標準の取得成功として扱う。独自policy/reentry/poison状態は除去 |
| `scripts/remote-desktop/WindowsSigninDuplexChecks.cs` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/WindowsSigninHost.cs` | 標準へ置換済み：ServiceBase/SCM/OSプロセスhandle/Job・通常の配布物配置。残る共通コードは独立レビューで確認 |
| `scripts/remote-desktop/WindowsSigninHostChecks.cs` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/WindowsSigninInitialRecovery.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninInitialRecoveryChecks.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninInstallFiles.cs` | 標準へ置換済み：ServiceBase/SCM/OSプロセスhandle/Job・通常の配布物配置。残る共通コードは独立レビューで確認 |
| `scripts/remote-desktop/WindowsSigninInstallRecovery.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninInstallRecoveryChecks.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninInstallSource.cs` | 標準へ置換済み：ServiceBase/SCM/OS process handle/Job・通常の保護済み配布物配置 |
| `scripts/remote-desktop/WindowsSigninInstallSourceChecks.cs` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/WindowsSigninInstaller.cs` | 標準へ置換済み：ServiceBase/SCM/OSプロセスhandle/Job・通常の配布物配置。残る共通コードは独立レビューで確認 |
| `scripts/remote-desktop/WindowsSigninInstallerChecks.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninInstallerScm.cs` | 標準へ置換済み：ServiceBase/SCM/OS process handle/Job・通常の保護済み配布物配置 |
| `scripts/remote-desktop/WindowsSigninMaintenanceRecovery.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninMaintenanceRecoveryChecks.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninMaintenanceState.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninNativeHost.cs` | 標準へ置換済み：ServiceBase/SCM/OS process handle/Job・通常の保護済み配布物配置 |
| `scripts/remote-desktop/WindowsSigninPackage.cs` | 標準へ置換済み：ServiceBase/SCM/OS process handle/Job・通常の保護済み配布物配置 |
| `scripts/remote-desktop/WindowsSigninPackageChecks.cs` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/WindowsSigninPackageNative.cs` | 標準へ置換済み：ServiceBase/SCM/OS process handle/Job・通常の保護済み配布物配置 |
| `scripts/remote-desktop/WindowsSigninPartialIdentityProof.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninPresence.cs` | Sodashitsu用アダプター：読取専用のsource状態通知。健康なsourceの寿命上限なし |
| `scripts/remote-desktop/WindowsSigninProcess.cs` | 標準へ置換済み：ServiceBase/SCM/OSプロセスhandle/Job・通常の配布物配置。残る共通コードは独立レビューで確認 |
| `scripts/remote-desktop/WindowsSigninProcessEvidence.cs` | 標準へ置換済み：ServiceBase/SCM/OSプロセスhandle/Job・通常の配布物配置。残る共通コードは独立レビューで確認 |
| `scripts/remote-desktop/WindowsSigninProcessEvidenceChecks.cs` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/WindowsSigninQuiescence.cs` | 標準へ置換済み：private固定ファイルの共有/排他FileStream。通常hostと停止時管理/更新の同時実行を排他 |
| `scripts/remote-desktop/WindowsSigninQuiescenceChecks.cs` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/WindowsSigninRestartRecovery.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninRestartRecoveryChecks.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninRunAdmission.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninRunAdmissionChecks.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninRunJournal.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninRunJournalChecks.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninRunRecord.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninRunRecordChecks.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninRunSession.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninRunSessionChecks.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninRunStorage.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninScm.cs` | 標準へ置換済み：ServiceBase/SCM/OS process handle/Job・通常の保護済み配布物配置 |
| `scripts/remote-desktop/WindowsSigninScope.cs` | Sodashitsu用アダプター：実process/session候補と明示操作同意・sequence replay。時刻/描画/epoch ticketなし |
| `scripts/remote-desktop/WindowsSigninScopeChecks.cs` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/WindowsSigninScopeNative.cs` | 標準へ置換済み：保持Process handle/PID/作成時刻/実sessionを直接読む。WinEvent observer/markerなし |
| `scripts/remote-desktop/WindowsSigninServicePolicy.cs` | 標準へ置換済み：ServiceBase/SCM/OSプロセスhandle/Job・通常の配布物配置。残る共通コードは独立レビューで確認 |
| `scripts/remote-desktop/WindowsSigninServicePolicyChecks.cs` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/WindowsSigninStateLayoutChecks.cs` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/WindowsSigninTarget.cs` | Sodashitsu用アダプター：固定Signin identity/trust/enrollment/desktop wireとOS APIの接続。優位性による独自framework例外ではない |
| `scripts/remote-desktop/WindowsSigninUnclaimedRecovery.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninUnclaimedRecoveryChecks.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninUpgrade.cs` | 標準へ置換済み：ServiceBase/SCM/OSプロセスhandle/Job・通常の配布物配置。残る共通コードは独立レビューで確認 |
| `scripts/remote-desktop/WindowsSigninUpgradeChecks.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninUpgradeFiles.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninUpgradeRecord.cs` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/WindowsSigninUpgradeScm.cs` | 標準へ置換済み：ServiceBase/SCM/OSプロセスhandle/Job・通常の配布物配置。残る共通コードは独立レビューで確認 |
| `scripts/remote-desktop/WindowsSigninVault.cs` | Sodashitsu用アダプター：固定Signin identity/trust/enrollment/desktop wireとOS APIの接続。優位性による独自framework例外ではない |
| `scripts/remote-desktop/WindowsSigninVaultChecks.cs` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/WindowsSigninWorker.cs` | Sodashitsu用アダプター：固定Signin identity/trust/enrollment/desktop wireとOS APIの接続。優位性による独自framework例外ではない |
| `scripts/remote-desktop/WindowsSigninWorkerNative.cs` | 標準へ置換済み：ServiceBase/SCM/OSプロセスhandle/Job・通常の配布物配置。残る共通コードは独立レビューで確認 |

## TypeScript 全件

| ファイル | 判断 |
| --- | --- |
| `packages/server/src/desktop/DesktopSigninAdminBackend.node.test.ts` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `packages/server/src/desktop/DesktopSigninAdminBackend.node.ts` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `packages/server/src/desktop/DesktopSigninAdminMailbox.node.test.ts` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `packages/server/src/desktop/DesktopSigninAdminMailbox.node.ts` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `packages/server/src/desktop/DesktopSigninAdminRequest.test.ts` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `packages/server/src/desktop/DesktopSigninAdminRequest.ts` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `packages/server/src/desktop/DesktopSigninAdminResult.node.test.ts` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `packages/server/src/desktop/DesktopSigninAdminResult.node.ts` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `packages/server/src/desktop/DesktopSigninAdminTask.node.test.ts` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `packages/server/src/desktop/DesktopSigninAdminTask.node.ts` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `packages/server/src/desktop/DesktopSigninAdministration.test.ts` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `packages/server/src/desktop/DesktopSigninAdministration.ts` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `packages/server/src/desktop/DesktopSigninBridge.test.ts` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `packages/server/src/desktop/DesktopSigninBridge.ts` | Sodashitsu用アダプター：固定Signin identity/trust/enrollment/desktop wireとOS APIの接続。優位性による独自framework例外ではない |
| `packages/server/src/desktop/DesktopSigninCertificate.test.ts` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `packages/server/src/desktop/DesktopSigninCertificate.ts` | Sodashitsu用アダプター：固定Signin identity/trust/enrollment/desktop wireとOS APIの接続。優位性による独自framework例外ではない |
| `packages/server/src/desktop/DesktopSigninConnector.test.ts` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `packages/server/src/desktop/DesktopSigninConnector.ts` | Sodashitsu用アダプター：固定Signin identity/trust/enrollment/desktop wireとOS APIの接続。優位性による独自framework例外ではない |
| `packages/server/src/desktop/DesktopSigninContextProcess.test.ts` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `packages/server/src/desktop/DesktopSigninDispatch.test.ts` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `packages/server/src/desktop/DesktopSigninDispatch.ts` | Sodashitsu用アダプター：固定Signin identity/trust/enrollment/desktop wireとOS APIの接続。優位性による独自framework例外ではない |
| `packages/server/src/desktop/DesktopSigninEndpoint.test.ts` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `packages/server/src/desktop/DesktopSigninEndpoint.ts` | Sodashitsu用アダプター：固定Signin identity/trust/enrollment/desktop wireとOS APIの接続。優位性による独自framework例外ではない |
| `packages/server/src/desktop/DesktopSigninEnrollment.test.ts` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `packages/server/src/desktop/DesktopSigninEnrollment.ts` | Sodashitsu用アダプター：固定Signin identity/trust/enrollment/desktop wireとOS APIの接続。優位性による独自framework例外ではない |
| `packages/server/src/desktop/DesktopSigninEntry.test.ts` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `packages/server/src/desktop/DesktopSigninEntry.ts` | Sodashitsu用アダプター：固定Signin identity/trust/enrollment/desktop wireとOS APIの接続。優位性による独自framework例外ではない |
| `packages/server/src/desktop/DesktopSigninIdentity.test.ts` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `packages/server/src/desktop/DesktopSigninIdentity.ts` | Sodashitsu用アダプター：固定Signin identity/trust/enrollment/desktop wireとOS APIの接続。優位性による独自framework例外ではない |
| `packages/server/src/desktop/DesktopSigninLocalLease.node.test.ts` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `packages/server/src/desktop/DesktopSigninLocalLease.node.ts` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `packages/server/src/desktop/DesktopSigninPresenceProcess.test.ts` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `packages/server/src/desktop/DesktopSigninPresenceProcess.ts` | Sodashitsu用アダプター：固定native brokerのstdio/source所有と実close。専用context role/120秒proofなし |
| `packages/server/src/desktop/DesktopSigninReadonlyStore.test.ts` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `packages/server/src/desktop/DesktopSigninRuntime.test.ts` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `packages/server/src/desktop/DesktopSigninRuntime.ts` | Sodashitsu用アダプター：read-only既存EndpointStoreとdesktop専用handler構成。DPAPI/policy proof pollなし |
| `packages/server/src/desktop/DesktopSigninSource.test.ts` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `packages/server/src/desktop/DesktopSigninSource.ts` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `packages/server/src/desktop/DesktopSigninStartup.test.ts` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `packages/server/src/desktop/DesktopSigninStartup.ts` | Sodashitsu用アダプター：固定Signin identity/trust/enrollment/desktop wireとOS APIの接続。優位性による独自framework例外ではない |
| `packages/server/src/desktop/DesktopSigninStopSignal.test.ts` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `packages/server/src/desktop/DesktopSigninStopSignal.ts` | Sodashitsu用アダプター：固定Signin identity/trust/enrollment/desktop wireとOS APIの接続。優位性による独自framework例外ではない |
| `packages/server/src/desktop/DesktopSigninVault.node.test.ts` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `packages/server/src/desktop/DesktopSigninVault.node.ts` | Sodashitsu用アダプター：固定Signin identity/trust/enrollment/desktop wireとOS APIの接続。優位性による独自framework例外ではない |
| `packages/server/src/desktop/DesktopSigninWorkerProcess.test.ts` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `packages/server/src/desktop/DesktopSigninWorkerProcess.ts` | 標準へ置換済み：ServiceBase/SCM/OS process handle/Job・通常の保護済み配布物配置 |
| `packages/server/src/signin/bundle.test.ts` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `packages/server/src/signin/main.ts` | Sodashitsu用アダプター：固定Signin identity/trust/enrollment/desktop wireとOS APIの接続。優位性による独自framework例外ではない |
| `packages/server/src/signin/nativePackage.test.ts` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |

## 操作・ビルド・検証コマンド全件

| ファイル | 判断 |
| --- | --- |
| `scripts/remote-desktop/SigninAclPolicy.ps1` | Sodashitsu用アダプター：固定Signin identity/trust/enrollment/desktop wireとOS APIの接続。優位性による独自framework例外ではない |
| `scripts/remote-desktop/SigninAdminStorage.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/build-signin-bundle.mjs` | Sodashitsu用アダプター：同梱ビルド・配布一覧。実行時フレームワークを含めない |
| `scripts/remote-desktop/build-signin-host.ps1` | Sodashitsu用アダプター：同梱ビルド・配布一覧。実行時フレームワークを含めない |
| `scripts/remote-desktop/build-signin-package.mjs` | Sodashitsu用アダプター：同梱ビルド・配布一覧。実行時フレームワークを含めない |
| `scripts/remote-desktop/commit-signin-vault.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/control-signin-admin.ps1` | Sodashitsu用アダプター：固定Signin identity/trust/enrollment/desktop wireとOS APIの接続。優位性による独自framework例外ではない |
| `scripts/remote-desktop/control-signin-service.ps1` | 標準へ置換済み：ServiceBase/SCM/OS process handle/Job・通常の保護済み配布物配置 |
| `scripts/remote-desktop/create-signin-partial-identity-proof.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/install-signin-service.ps1` | 標準へ置換済み：ServiceBase/SCM/OS process handle/Job・通常の保護済み配布物配置 |
| `scripts/remote-desktop/read-signin-admin.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/read-signin-enrollment.ps1` | Sodashitsu用アダプター：既存LocalMachine DPAPI enrollmentを1回読む。独自readonly RPC/watchdogなし |
| `scripts/remote-desktop/recover-signin-claimed-initialize.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/recover-signin-initial.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/recover-signin-install.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/recover-signin-maintenance.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/recover-signin-restart.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/recover-signin-unclaimed.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/signin-bootstrap.mjs` | 標準へ置換済み：ServiceBase/SCM/OSプロセスhandle/Job・通常の配布物配置。残る共通コードは独立レビューで確認 |
| `scripts/remote-desktop/upgrade-signin-service.ps1` | 標準へ置換済み：ServiceBase/SCM/OS process handle/Job・通常の保護済み配布物配置 |
| `scripts/remote-desktop/validate-signin-admin-controller.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/validate-signin-admin-enrollment.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/validate-signin-admin-execution.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/validate-signin-admin-journal.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/validate-signin-admin-persistence.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/validate-signin-admin.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/validate-signin-bootstrap.mjs` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/validate-signin-candidate.ps1` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/validate-signin-claimed-initialize.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/validate-signin-controller.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/validate-signin-host.ps1` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/validate-signin-initial-recovery.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/validate-signin-install-recovery.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/validate-signin-install-source.ps1` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/validate-signin-installer.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/validate-signin-maintenance-recovery.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/validate-signin-native.ps1` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/validate-signin-node-negative.mjs` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/validate-signin-package.mjs` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/validate-signin-package.ps1` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/validate-signin-process-evidence.ps1` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/validate-signin-quiescence.ps1` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/validate-signin-restart-recovery.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/validate-signin-run-admission.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/validate-signin-run-journal.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/validate-signin-run-record.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/validate-signin-run-session.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/validate-signin-scope.ps1` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/validate-signin-service-dispatch.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/validate-signin-service-policy.ps1` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/validate-signin-state-layout.ps1` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/validate-signin-stop.mjs` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/validate-signin-unclaimed-recovery.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/validate-signin-upgrade.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/validate-signin-vault.ps1` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/validate-signin-worker.ps1` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/virtual-display-driver/prepare-signing.py` | 担当外：通常desktop/native担当のvirtual-display署名ツール。Signin runtimeの構成要素ではない |
| `scripts/remote-desktop/virtual-display-driver/test-prepare-signing.py` | テスト専用：本番コンパイル・配布へ含めない。public ValidateOnlyは本番ソースだけをコンパイル |
| `scripts/remote-desktop/write-signin-admin-result.ps1` | 削除済み：旧フレームワークと対応検査。保存された実機の状態は変更しない |
| `scripts/remote-desktop/write-signin-enrollment.ps1` | Sodashitsu用アダプター：固定Signin identity/trust/enrollment/desktop wireとOS APIの接続。優位性による独自framework例外ではない |

## 新設・共有の差分

| ファイル | 判断 |
| --- | --- |
| `scripts/remote-desktop/WindowsSigninAdminPipe.cs` | 標準named pipeアダプター：BA/SY ACL、OS impersonation、remote拒否、固定16KiB framing。独自nonce/世代/永続mailboxなし |
| `scripts/remote-desktop/WindowsProtectedEpoch.cs` | 削除済み：Signin最後のWinEvent/marker参照を除去。Native担当の参照除去と統合する |
| `scripts/remote-desktop/WindowsSigninWorkerGeneratedChecks.cs` | テスト専用partial。本番buildとruntime-assetsへ含めない |
| `scripts/remote-desktop/WindowsSigninPresenceGeneratedChecks.cs` | テスト専用partial。本番buildとruntime-assetsへ含めない |
| `scripts/remote-desktop/WindowsSigninNativeHostGeneratedChecks.cs` | テスト専用partial。本番buildとruntime-assetsへ含めない |
| `packages/server/src/desktop/DesktopSigninAdminCommand.ts` | Sodashitsu用アダプター：固定6操作を既存EndpointStore/DPAPIに渡す。汎用exec/任意pathなし |
| `packages/server/src/desktop/DesktopSigninReadonlyStore.test.ts` | テスト専用：writeAllowed=falseが実ファイルを作らないことを確認 |
