# 第7段階準備: protected worker scope / frame・入力境界

対象: 新しい管理者画面workerを安全に接続するための基盤。第7段階全体・7Aの有効化を完了とはしない。RunProtectedを呼ぶproduction routeはまだない。サービス起動・ローカル許可・purpose/protocol/helper/UI接続、実UAC/昇格動作、サインアウト後signinは未完了。

## 実装

- canonical v2 tupleとsame-tuple ready検証。role/purpose、期待owner SID・logon SID・WTS session、世代/nonce、broker/worker PID+creation timeを固定。ownerはWindows SecurityIdentifierのcanonical構文とtrusted owner完全一致（S-1-12-1を含む）。
- epochを最初の有効snapshotで固定し、その後の変化は不可逆に失効。capture ticketはnonce/generation/epochを持つ。
- native fact collectorはSYSTEM限定。WTS/token・active console・input/thread desktop・lock状態・process lifetimeを読む。lock状態は終端でも再読し、同じWinlogon名のUAC→lockと逆を拒否する。
- observerはprivate GUIDをGlobalAddAtomで割り当て、desktop-switchとprivate markerを同一OUTOFCONTEXT hookで処理。発信thread/sequence一致のmarkerを期限250msで待ち、先行する非同期通知を処理してからepochを採取。timeout/停止で永久失効。単なるposted thread messageを通知処理完了と見なさない。
- HostのRunProtectedはSASを禁止。保護modeで入力を送る直前、保持キー/ボタン解除、capture開始・encode後・実際のstdout lock待ち/JSON構築後の公開直前にscopeを確認。失効後はheld trackerをclearして終了し、新desktopへkeyupを送らない。
- normal/legacy secureは新しいscope fieldを要求しない。通常画像もPublishPreparedを通し、既存AllowedDesktop検査を出力lock取得後に実行する。

## 検証範囲

Windowsローカルでscope/native/Host/Unlockをまとめてコンパイルし、生成identity/desktop facts、fake input、生成3byte frame、fake通知queueで検査。native collector constructor、実画面capture、OS入力、実UAC、lock/unlock、サービス導入/更新は実行していない。実WinEvent配送/順序/timeoutのread-only実機確認はruntime接続時に残す。LinuxのTS build/typecheck/全体testと既存Windows helper/pipe/input checksは実行結果を後段へ追記する。

## 独立レビュー

- review_transfer: epoch固定、終端LockState再読、非同期通知marker待機を指摘し、各修正を再点検。準備source範囲で追加mustなし。
- review_pointer: OutputGate待機後の実書込直前検査とOwner SID互換性を指摘し、production publication pathへの適用・生成待機試験・canonical SID対応を再点検。負例後の復元sourceも確認、追加mustなし。

## 負例

各guardだけを変更して同じvalidatorを実行。コンパイル失敗を除外し、意図したruntime assertionで落ちたことを確認。毎回元bytesへ完全復元し、最後のpositiveも通過。初回epoch負例はunused fieldのコンパイル警告で落ちたため不採用。採用版は!=を<へ変更し、増加epochの見逃しを検出する。

以下はUTF-8で取得した生の出力（CRLFを保持）。

### epoch

```text
protected_host_boundaries_passed: queued frame discarded; key/mouse release and direct input blocked after transition; generated facts/input only
protected_output_gate_passed: generated frame blocked after scope transition while stdout gate was held
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "New epoch admitted without reapproval"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-secure-sessions\scripts\remote-desktop\validate-protected-sco
pe.ps1:4 文字:1
+ [SodaDesktopProtectedScopeChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 
```

### keyup

```text
protected_host_boundaries_passed: queued frame discarded; key/mouse release and direct input blocked after transition; generated facts/input only
protected_output_gate_passed: generated frame blocked after scope transition while stdout gate was held
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Keyup sent into new desktop"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-secure-sessions\scripts\remote-desktop\validate-protected-sco
pe.ps1:4 文字:1
+ [SodaDesktopProtectedScopeChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 
```

### nonce

```text
protected_host_boundaries_passed: queued frame discarded; key/mouse release and direct input blocked after transition; generated facts/input only
protected_output_gate_passed: generated frame blocked after scope transition while stdout gate was held
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Other worker scope frame accepted"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-secure-sessions\scripts\remote-desktop\validate-protected-sco
pe.ps1:4 文字:1
+ [SodaDesktopProtectedScopeChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 
```

### lock

```text
protected_host_boundaries_passed: queued frame discarded; key/mouse release and direct input blocked after transition; generated facts/input only
protected_output_gate_passed: generated frame blocked after scope transition while stdout gate was held
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Lock changed on same Winlogon desktop accepted"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-secure-sessions\scripts\remote-desktop\validate-protected-sco
pe.ps1:4 文字:1
+ [SodaDesktopProtectedScopeChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 
```

### marker

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Unrelated marker accepted"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-secure-sessions\scripts\remote-desktop\validate-protected-sco
pe.ps1:4 文字:1
+ [SodaDesktopProtectedScopeChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 
```

### emit

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Protected Emit bypassed scope guard"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-secure-sessions\scripts\remote-desktop\validate-protected-sco
pe.ps1:4 文字:1
+ [SodaDesktopProtectedScopeChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 
```

### output-gate

```text
protected_host_boundaries_passed: queued frame discarded; key/mouse release and direct input blocked after transition; generated facts/input only
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Old frame published after output gate wait"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-secure-sessions\scripts\remote-desktop\validate-protected-sco
pe.ps1:4 文字:1
+ [SodaDesktopProtectedScopeChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 
```

## Positive

```text
protected_host_boundaries_passed: queued frame discarded; key/mouse release and direct input blocked after transition; generated facts/input only
protected_output_gate_passed: generated frame blocked after scope transition while stdout gate was held
protected_scope_checks_passed: canonical v2 tuple/ack, modes/purpose, owner/logon/session/process/nonce, post-encode epoch, irreversible revocation, no keyup after scope loss; fake facts only
```
