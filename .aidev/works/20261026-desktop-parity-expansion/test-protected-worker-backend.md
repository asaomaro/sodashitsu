# 7A前半: 保護service/worker接続

7AをbackendとNode/protocol/UIに分割する。今回の差分はinstalled workerのrole/nonce専用pipe・same-tuple prefix/ACK・Native GuardからHostへの接続。Nodeのcap/options/local permissionとUIは次の差分で追加するため、通常の接続から新しい管理者画面経路を自動選択しない。7B signin、実UAC取得/入力を完了扱いしない。

## 実装

- purpose bit4（新4〜7固定名）と旧1/2/3の互換。任意desktop/path/tokenを受け付けず、Default/Winlogonのroleをworker CLIとprefixへ固定。
- client/worker/brokerのprocess handle・PID+creationとowner/logon/session、generation/UUID nonceを固定。System-only nonce別pipeで同じscopeのACKを受けるまでconfigureを転送しない。
- SYSTEM workerは実peer identityとNative factsをGuardに結び、capture/input/publication/keyupを検査。protected roleにはSASを許可しない。
- 失効時は固定protected_desktop_failure。従来unlockの再分類へfallbackせず、source変化時にcontrollerの操作許可を再取得する。
- EOFで正常workerのfinally入力解放に猶予750msを与え、それを超える場合はjob終了。stale generationは新workerを閉じず、Worker handleは明示Dispose/null化。
- helper/installerは同じprotected sourcesを含めてコンパイル。通常/旧unlock/virtualの既定経路は維持。

## 検証と限定

review_transferが全C#境界を独立点検し、handle解放のshouldを修正再点検。追加must/shouldなし。コンパイル、generated SID/process/desktop factsとfake input、実private pipeのscope→ACK→configureおよび期限closeによるread解除で確認。SYSTEM workerやSCM/service導入・更新、実UAC/capture/inputは実行しない。実終了時のOS held解除は未検証である。

Hostのproduction predicateと共通guard setupでSAS禁止、fake未起動Processでstale generation/一度だけのDisposeを試験。purpose/SAS/Dispose負例は意図したruntime assertionで失敗し元bytesへ復元。以下はUTF8・元改行の生出力。

### purpose

```text
desktop_broker_purpose_checks_passed: unlock-only / virtual-only / both routes separated; no service/device creation or display/input changes
"0" 個の引数を指定して "VerifyProtectedPurposes" を呼び出し中に例外が発生しました: "Unlock helper unavailable"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-elevated-handshake\scripts\remote-desktop\validate-protected-
worker.ps1:6 文字:1
+ [SodaDesktopUnlock]::VerifyProtectedPurposes()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 
```

### sas

```text
desktop_broker_purpose_checks_passed: unlock-only / virtual-only / both routes separated; no service/device creation or display/input changes
protected_broker_purpose_checks_passed: all fixed purpose bits/routes and legacy lease compatibility; no service/token/worker/input operations
protected_worker_cleanup_passed: stale generation cannot close current handles; matching teardown disposes once and clears scope; fake Process only
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Protected secure attention allowed"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-elevated-handshake\scripts\remote-desktop\validate-protected-
worker.ps1:8 文字:1
+ [SodaDesktopProtectedScopeChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 
```

### cleanup

```text
desktop_broker_purpose_checks_passed: unlock-only / virtual-only / both routes separated; no service/device creation or display/input changes
protected_broker_purpose_checks_passed: all fixed purpose bits/routes and legacy lease compatibility; no service/token/worker/input operations
"0" 個の引数を指定して "VerifyWorkerCleanup" を呼び出し中に例外が発生しました: "Current worker handle or scope was not released"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-elevated-handshake\scripts\remote-desktop\validate-protected-
worker.ps1:7 文字:1
+ [SodaDesktopUnlock]::VerifyWorkerCleanup()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 
```

## Positive

```text
desktop_broker_purpose_checks_passed: unlock-only / virtual-only / both routes separated; no service/device creation or display/input changes
protected_broker_purpose_checks_passed: all fixed purpose bits/routes and legacy lease compatibility; no service/token/worker/input operations
protected_worker_cleanup_passed: stale generation cannot close current handles; matching teardown disposes once and clears scope; fake Process only
protected_host_boundaries_passed: queued frame discarded; key/mouse release and direct input blocked after transition; generated facts/input only
protected_output_gate_passed: generated frame blocked after scope transition while stdout gate was held
protected_scope_checks_passed: canonical v2 tuple/ack, modes/purpose, owner/logon/session/process/nonce, post-encode epoch, irreversible revocation, no keyup after scope loss; fake facts only
protected_handshake_checks_passed: same-tuple prefix before configure, legacy/wrong mode/bounds rejected, owner lifetime and silent worker deadline; generated identities + fake streams + actual private duplex pipes; no worker/service/capture/input
protected_worker_factory_passed: generated scope only; no service, worker spawn, token/desktop APIs, capture or input
```

## 最終結果

- source72c560008f3ee3df6ee0133b0b3784aa77c55234、13filesへ分割。Node/protocol/UIは後半PR。
- Windows接続元でhelper/broker compilerとgenerated worker/purpose/Scope/SAS/Dispose/private duplex pipe checks成功。
- sr-pcはTEMP archiveで同じcompile-only/生成checksと既存helper/pipe/input/monitor、private marker診断成功。exit0/timeout false、repo HEAD5da512c8のまま、tracked status空を維持。
- 本worktreeのfrozen install/build成功、smoke PASS。production TS不変の前半で全Nodeテストを重複実行せず、後半の固定したcombined sourceでfull build/typecheck/testを実行する。
- Windows CI https://github.com/asaomaro/sodashitsu/actions/runs/40362051585 と https://github.com/asaomaro/sodashitsu/actions/runs/40362459448 成功。
- 分割後の独立レビューも通過。C#10ファイルが後半worktreeの点検済みsourceとbyte一致することをレビュー側でも確認。
- SCM登録更新、SYSTEM worker起動、実UAC/capture/inputは行っていない。
