# サインイン整理: ソース検証

実行場所: `/workspaces/sodashitsu-signin-cleanup`。Windows実機のサービス・Task・レジストリ・鍵は操作していない。

## Node

```
node scripts/remote-desktop/validate-signin-bootstrap.mjs
signin_bootstrap_standard_node_loader_passed

pnpm exec vitest run packages/server/src/signin/bundle.test.ts packages/server/src/signin/nativePackage.test.ts
Test Files  2 passed (2)
Tests  2 passed (2)
```

最初のbundleテストは隔離worktreeのprotocol/client-coreのdistがなく失敗。両packageをビルド後に成功。

## C# のコンパイル

UbuntuのMono 6.8パッケージを`/tmp/soda-signin-csharp`に展開し、各PowerShellの閉じたソース一覧をlibraryとしてコンパイルした。パッケージをシステムへインストールしていない。コンパイル済みのSYSTEMエントリポイントは実行していない。

```
build-signin-host.ps1 0
control-signin-service.ps1 0
control-signin-admin.ps1 0
validate-signin-worker.ps1 0
validate-signin-host.ps1 0
install-signin-service.ps1 0
upgrade-signin-service.ps1 0
```

MonoでのコンパイルはWindows PowerShell 5.1でのコンパイルやSCM/DPAPI/WTS/Jobの実機検証の代わりではない。

## 純粋な生成テスト

一時的なMainから、OS入力/SCM/DPAPIを呼ばない既存の検査だけを実行。

```
signin_scope_generated_epoch_expiry_frame_and_input_passed
signin_presence_generated_readonly_expiry_and_commands_passed
signin_native_closed_roles_generated_pass
```

`git diff --check`成功。独立レビューとWindowsのコンパイル・実機検証は統合担当で実施する。

## 削除後・初回導入縮小後の追加コンパイル

上の7セットに加えて次の4セットもMonoでコンパイル成功。Windowsエントリポイントは実行していない。

```
validate-signin-admin-controller.ps1 0
validate-signin-process-evidence.ps1 0
validate-signin-state-layout.ps1 0
validate-signin-install-source.ps1 0
```

## 独立レビュー指摘: 子Jobの停止失敗時のDispose境界

`Child.Dispose`が例外を投げると、外側のコード/runtime保持が解放され得たため、停止を確認できないときはFailFastで通常のunwindを止める境界へ戻した。検査専用の子プロセスが実際の`Child.Dispose`を無効なJob handleで呼び、外側finallyのファイルが作られないことを確認した。実SCMやWindows APIは呼ばない。Windowsの既存Host検証にも同じ子fixtureの確認を追加。

修正箇所だけ元に戻してEXEをコンパイルし直し、元の実装で同じ検査が失敗することと、ソースのバイト一致での復元を確認した。生の出力:

```
fixed: exit=-6 outer_unwound=False
negative_original: exit=1 outer_unwound=True
AssertionError: Failed child cleanup released outer leases
restored: exit=-6 outer_unwound=False
dispose_boundary_negative_control_and_exact_restore_passed
```

## 管理IPCへの置換（Windows実機未実行）

管理用service pipe、SCM/保持processの認証、固定Nodeのstdin/stdout、既存EndpointStoreとenrollment DPAPI形式への書き込みを実装。旧メールボックスの実行経路とJS LocalLeaseを通常起動から外した。単体のfull server typecheckはdefault4GBでOOMとなったため、変更したSignin main/admin/startupと関連テストを含む一時tsconfigで、標準tscを8GB設定で実行して成功した。full serverは統合時の1回にまとめる。

```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

変更したC#の7ソースセットがMonoでコンパイル成功。さらにruntime-assetsだけを一時フォルダへコピーし、Checksソースが無いことを確認してpublicソースセットをコンパイルした生出力:

```
closed asset build-signin-host.ps1 0
closed asset control-signin-service.ps1 0
closed asset control-signin-admin.ps1 0
closed asset install-signin-service.ps1 0
closed asset upgrade-signin-service.ps1 0
signin_admin_pipe_bounded_and_exact_frame_passed
signin_package_generated_staging_manifest_passed
```

pipeの実OS ACL・接続者token・remote拒否・SCM purposeの実確認はWindowsで未実施。唯一のWindows operatorが独立レビュー後に行う。上のMemoryStream検査を実認証の検査として扱わない。


管理IPCの変更を含む5つのVitestファイル・19テストが成功。続く削除段階で、JS管理mailbox/LocalLeaseの14ファイルと、C#管理envelope/journal/deadline/result/persistence・専用helper/検査の20ファイルを物理削除した。残された実機の履歴・DPAPI暗号文の消去や再生成は行っていない。


## Windows標準のAutomatic/ManualとSCM adapter縮小

登録/更新の旧callback controller・状態フラグ・復旧関数を削除し、標準SCM API呼び出しだけに縮小。設定検査は固定binary/名前/SYSTEM own-process/DACLの権限境界に限定し、管理者が設定する標準の回復・依存・trigger等を独自に禁止しない。起動種別はAutomatic/Manualを許可し、更新で指定しなければ既存種別を保持する。実機のTask/サービス設定は変更していない。

変更した8ソースセットがMonoでコンパイル成功。生成データによる起動種別、サービスidentity/ACLとquery buffer範囲の検査:

```
signin_service_standard_start_modes_identity_and_acl_passed
```

最初の純粋ACL fixtureはMonoが空DACLのSDDLを読めず失敗したため、空ACLをRawSecurityDescriptor/RawAclで組み立てるportableなfixtureへ変更した。OSのサービス設定やDACLは操作していない。

## 直接OS scope・実所有への縮小（実機未実行）

private WinEvent/marker/Epoch、context role、120秒presence/worker寿命、readonly miniRPC/watchdog、5秒policy leaseと2秒DPAPI/digest pollを削除。通常native/helperのEpoch参照除去はNative担当commitと対になる。健康なsourceが12時間維持される生成検査と、source/session/同意/replay喪失時の拒否を確認。スナップショットIDは実capture開始時に固定し、frame Flush完了後にのみpendingから取り除く。

変更したC#の5セットがMonoでコンパイル成功。pure Scope/Presence/NativeHost/Worker生成検査成功。Windows専用GetCurrentThreadIdを使うDuplex検査は実行せずsole operatorへ残す。その他の20個のvalidator負例と旧120秒制限再挿入の負例は意図したassertionで失敗し、バイト一致復元後に成功。旧寿命制限の生出力:

```
negative old-120s-lifetime
signin_scope_direct_process_session_consent_and_replay_passed

Unhandled Exception:
System.InvalidOperationException: Healthy presence expired by time without ownership loss
  at SodaDesktopSigninPresence.VerifyGeneratedData () [0x00257] in <d5e0c4d313bb4aafb6e6f34cbfba0054>:0
  at ScopePresenceProof.Main () [0x00005] in <d5e0c4d313bb4aafb6e6f34cbfba0054>:0
[ERROR] FATAL UNHANDLED EXCEPTION: System.InvalidOperationException: Healthy presence expired by time without ownership loss
  at SodaDesktopSigninPresence.VerifyGeneratedData () [0x00257] in <d5e0c4d313bb4aafb6e6f34cbfba0054>:0
  at ScopePresenceProof.Main () [0x00005] in <d5e0c4d313bb4aafb6e6f34cbfba0054>:0

restored
signin_scope_direct_process_session_consent_and_replay_passed
signin_presence_real_owner_lifetime_and_readonly_commands_passed
signin_native_closed_roles_generated_pass
signin_presence_real_owner_lifetime_and_readonly_commands_passed
signin_worker_generated_data_and_abi_passed
```

Signin関連11ファイルのVitest・163テストが成功（この時点のEndpoint/Dispatch追加検査を含む）。scoped標準tscを8GBで実行して成功。full server型検査はRootが統合時1回にまとめる。Windows OS token/ACL/session0/Winlogon/UAC/SCM起動、実DPAPIはここでは実行しない。

## 専用RPC/暗号化接続の寿命と権限

Endpoint/Dispatch/SigninRequiredから120秒のsession/offer制限を除去し、完了したJSON-RPC IDの永続記憶と1000回上限を削除。再使用したIDで1500回の要求と12時間健康なidle dispatchを検査。修正前のDispatchだけを戻して実行し、意図した2検査の失敗とバイト一致復元を確認した生出力:

```

 RUN  v5.0.1 /workspaces/sodashitsu-signin-cleanup/packages/server

 ❯ src/desktop/DesktopSigninDispatch.test.ts (40 tests | 2 failed | 38 skipped) 19ms
   × keeps a healthy idle channel for hours and rejects pre-aborted dispatchers 14ms
   × accepts more than a thousand requests and reuses completed JSON-RPC IDs 4ms

 Test Files  1 failed (1)
      Tests  2 failed | 38 skipped (40)
   Start at  23:51:07
   Duration  963ms (transform 77%, import 21%, tests 2%)

undefined
/workspaces/sodashitsu-signin-cleanup/packages/server:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/desktop/DesktopSigninDispatch.test.ts -t healthy idle|more than a thousand

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/desktop/DesktopSigninDispatch.test.ts > keeps a healthy idle channel for hours and rejects pre-aborted dispatchers
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      1008,
      "Desktop signin connection is unavailable",
    ]


Number of calls: 1

 ❯ src/desktop/DesktopSigninDispatch.test.ts:73:208


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/desktop/DesktopSigninDispatch.test.ts > accepts more than a thousand requests and reuses completed JSON-RPC IDs
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      1008,
      "Desktop signin connection is unavailable",
    ]


Number of calls: 1

 ❯ src/desktop/DesktopSigninDispatch.test.ts:97:28
     95| it("accepts more than a thousand requests and reuses completed JSON-RP…
     96|   const f=fixture();await f.hello();for(let i=0;i<1500;i++){f.request(…
     97|   expect(f.conn.close).not.toHaveBeenCalled();expect(f.handlers.capabi…
       |                            ^
     98| });
     99| it.each(["result-size","backpressure","error","serialize","post-serial…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

dispatch_old_lifetime_and_request_quota_negative_exact_restore_passed
```

実EndpointStore/Identityと実WebSocket/DesktopEndpointWireによる暗号化viewer fixtureで、trust revoke後の入力拒否と、client命令なしでnativeから出る次pixelsの送信拒否・接続/helperの終了を確認。view-onlyは妥当な現行schemaのinput/controlおよびadmin/execを拒否。Dispatchはexec/pane/file/plugin/endpoint管理/agentの全未知methodを転送しない。詳細API一覧はinventoryに記録。

closed runtime-assetsだけを新しい一時フォルダへコピーし、Checksファイルがゼロであることと5つのpublic Signin source setがコンパイルできることを再確認:

```
closed asset build-signin-host.ps1 compiled without Checks
closed asset control-signin-service.ps1 compiled without Checks
closed asset control-signin-admin.ps1 compiled without Checks
closed asset install-signin-service.ps1 compiled without Checks
closed asset upgrade-signin-service.ps1 compiled without Checks
```

最初のEndpoint寿命fixtureはperformance全体を12時間進め、独立した暗号化wireの無通信タイムアウトまで発生させていたため採用しなかった。修正部分だけを捕まえるDispatch/nativeの健康寿命検査を使用し、失効のEndpoint検査は実際のtrust変更で確認した。

最終共有wireはTransport担当c2d03150のdesktop schema/Workerと3946684dのsnapshot ID schemaを取り込んだ。browser JSON heartbeatは廃止し、native IPCの既存heartbeatだけを保持。最後の使用者を失ったnative Snapshot.Fingerprintも削除した。復元後、最終sourceで実行した生出力:

```
Test Files  11 passed (11)
Tests       162 passed (162)
Test Files  2 passed (2)
Tests       13 passed (13)
```

前者はSigninの11 serverテスト、後者はprotocol desktop/desktopSigninの2テスト。scoped標準tsc（全DesktopSignin source/test + main、8GB）はexit0。full serverの重複実行はしていない。独立レビュー未完了、Windows実機操作ゼロの状態でsourceをfreezeする。

## 独立レビュー修正: 管理要求のstdin完了と自然終了

`Child.Request`は要求を書いてstdinを閉じた後もstopSent=falseだったため、stdoutが先に閉じるとTryGracefulが閉じたstdinへ停止命令を書こうとして失敗していた。stdinを正常に閉じた時点でstopSent=trueとし、既存TryGracefulの実process exit code0とJob active0の確認へ進める。stdout EOF自体を成功の条件にはしない。

既存HostChecksへ専用子プロセスを追加。子はstdin EOFまで要求を読み、返答とstdout EOFを出した後、親のreleaseまで実際に生存する。親は終了待ちが先に完了しないことを確認し、release後にのみ成功とJob0を確認する。旧コードとstdout EOFだけで成功を返す変異をvalidatorの負例へ追加。新fixtureが先に実行されるため、既存job-accounting負例の期待assertionも更新した。Checksは従来どおり本番assets/compileに含めない。

production hostとHostChecksの2ソースセットがMonoでコンパイル成功。Windows実API・Jobを実行しないLinuxの一時proofでは、変更していないChild本体と新RequestCompletion検査を抽出して再コンパイルし、実stdin/stdout/processとOS呼び出しのテスト用wrapperで実行した。子は実Python subprocessでstdin EOF→stdout EOF→親release→正常終了を行う。実Windows Job accounting/handle semanticsの確認ではなく、変更した自然終了制御の検査である。Mono子自身のstdout fdを閉じる最初のローカルfixtureはMono runtimeがabortしたため採用せず、専用子だけをPythonにした。Windows用の既存HostChecks子fixtureはコンパイル確認のみで、実行はsole operatorへ残す。

修正箇所だけ旧実装へ戻して再コンパイルした負例、stdout EOFのみを成功とする負例、バイト一致復元後の生出力:

```
fixed exit=0
signin_admin_stdin_eof_stdout_eof_delayed_clean_exit_passed

negative_original exit=1
System.InvalidOperationException: Admin completion did not wait for clean process exit
  at RequestProof.RequestCompletion (System.String exe, System.String directory) [0x000da] in <1928bc1fddce45b08f0f6feab7e43fc4>:0
  at RequestProof.Main (System.String[] args) [0x000a9] in <1928bc1fddce45b08f0f6feab7e43fc4>:0

negative_stdout_eof_success exit=1
System.InvalidOperationException: Admin completion did not wait for clean process exit
  at RequestProof.RequestCompletion (System.String exe, System.String directory) [0x000da] in <807eb87a86c34ae39cc6926cc2d8f2ef>:0
  at RequestProof.Main (System.String[] args) [0x000a9] in <807eb87a86c34ae39cc6926cc2d8f2ef>:0

restored exit=0
signin_admin_stdin_eof_stdout_eof_delayed_clean_exit_passed

request_natural_exit_negative_and_exact_restore_passed```

Windows/service/task/registry/本番データの操作は実施していない。full TSテストの重複実行はせず、この変更に必要なC#コンパイルと終了境界の検査に限定した。
