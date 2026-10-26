# 7A途中: private v2 prefix handshake

準備commit 3b92da89時点の記録。続くservice/worker/UI統合と最終検証はtest-protected-sessions.mdに記録する。7Bと実UAC確認は別の未完了項目。

WindowsProtectedHandshakeのBrokerは、OS peer認証を済ませたprivate pipeで固定scope tupleを送り、同tupleのworker_scope_readyを受けるまで戻らない。呼出側は成功後にだけviewer configure/input転送を開始する。未知/legacy/wrong-role/oversize prefix、owner失効、期限切れを拒否し、closeを一度だけ呼ぶ。monotonic期限を成功確定時にも検査する。外部live callbackをdeadline用gateの中で呼ばない。

Receiveはprefixをbounded/canonicalに解釈して、呼出側がCLIとOS pipe peerから得た期待identity/role/nonce/creation timeとの一致を照合する。Confirmは実scope guardの前後確認でreadyを送る。呼出側はReceive/Confirm失敗後にconfigureへ進まず、必ずpipe/jobを閉じる必要がある。

## 試験

- Windowsでscope/handshake/checksをcompileし、generated owner/processとfake streamでprefix順序/相互認証/期限/失効を検査。
- 実private asynchronous named pipeでもscope→ACK→configureの往復と、silent workerで待機readを期限closeにより解除することを確認。実worker/serviceやcapture/OS入力は使わない。
- cleanupのwriter.Flush例外が意図したpipe-close失敗を隠さないよう、pipeを先に閉じ、task完了を待ち、残ったreader/writerの破棄例外だけを抑える。正常データは明示flushと相手readで確認。
- review_transferがmodule/状態/期限、実pipe試験を独立taskcheck。追加must/shouldなし。最終reviewと両端/CI/full検証はservice統合差分で実施する。
- 下記4guardを個別に戻し、同じ試験が意図したruntime assertionで落ちることを確認。初回ready負例の構文誤りはコンパイル時に検出して不採用、修正した負例で再実行。元bytesへ毎回復元し、positive成功。

## 負例（UTF8/CRLFの生出力）

### ready

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Invalid worker acknowledgement forwarded configure"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-elevated-handshake\scripts\remote-desktop\validate-protected-
handshake.ps1:4 文字:1
+ [SodaDesktopProtectedHandshakeChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 
```

### peer

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Unauthenticated scope accepted"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-elevated-handshake\scripts\remote-desktop\validate-protected-
handshake.ps1:4 文字:1
+ [SodaDesktopProtectedHandshakeChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 
```

### confirm

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Invalid worker emitted scope ready"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-elevated-handshake\scripts\remote-desktop\validate-protected-
handshake.ps1:4 文字:1
+ [SodaDesktopProtectedHandshakeChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 
```

### lifetime

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Broker lifetime lost during acknowledgement was ignored"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-elevated-handshake\scripts\remote-desktop\validate-protected-
handshake.ps1:4 文字:1
+ [SodaDesktopProtectedHandshakeChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 
```

## Positive

```text
protected_handshake_checks_passed: same-tuple prefix before configure, legacy/wrong mode/bounds rejected, owner lifetime and silent worker deadline; generated identities + fake streams + actual private duplex pipes; no worker/service/capture/input
```
