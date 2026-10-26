# 保護worker private WinEvent監視の実配送確認

第7段階準備の基盤に、明示オプション `validate-protected-scope.ps1 -ReadOnlyObserver` を追加。診断はprivate observer-only constructorを使い、SYSTEM fact collector・WTS/token/session/desktop facts取得・capture・OS入力・lock/UAC・service導入を実行しない。自分のmessage-only window/独自WinEvent/atomのみ作成・処理・解放する。

## 判明した問題と修正

模擬通知queueだけでは通っていたが、接続元Windowsで実配送を調べるとNULL HWNDのNotifyWinEventがcallbackへ届かなかった。own hidden message-only STATIC HWNDをobserver threadに作ると配送された。callbackのidEventThreadはNotifyを呼んだcapture/input threadではなくwindow ownerのobserver threadだったため、こちらを照合する。

markerはown HWND・private atom・window owner threadと毎回生成する62bit random object/child tokenを照合する。順番待ちのsequenceを直接外部へ出さず、別通知・推測・前回markerの再送で完了させない。同一hookの順序待機と250ms期限・永久失効は維持する。message loopはTranslate/Dispatchを行い、observer threadでwindowを破棄してからatomを回収する。

実配送試験は専用markerを2回往復し、未応答markerの期限切れ後に後続checkpointが拒否されることを検査。実desktop-switchを生成していないため、実画面切替やWinlogonでの配送まで確認済みとはしない。

## 根拠

- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-notifywinevent
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nc-winuser-wineventproc
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwineventhook
- https://learn.microsoft.com/en-us/windows/win32/winauto/allocation-of-winevent-ids

## 独立点検

review_transferがown message-only HWND、owner thread、token、同hook順序、timeout後拒否とwindow/atom cleanupを点検。追加mustなし。負例後の復元確認は別途追記する。

## 負例（生出力、UTF8/CRLF保持）

実通知のHWNDをNULLへ戻す、受理threadを不一致へ戻す変更を個別に適用し、実APIを通る同じ診断でruntime失敗することを確認。毎回元bytesへ復元し、最後にpositiveが成功。

### window

```text
protected_host_boundaries_passed: queued frame discarded; key/mouse release and direct input blocked after transition; generated facts/input only
protected_output_gate_passed: generated frame blocked after scope transition while stdout gate was held
protected_scope_checks_passed: canonical v2 tuple/ack, modes/purpose, owner/logon/session/process/nonce, post-encode epoch, irreversible revocation, no keyup after scope loss; fake facts only
"0" 個の引数を指定して "VerifyMarkerDelivery" を呼び出し中に例外が発生しました: "Private WinEvent marker delivery failed"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-elevated-broker\scripts\remote-desktop\validate-protected-sco
pe.ps1:9 文字:26
+ ... Observer) { [SodaDesktopProtectedScopeNative]::VerifyMarkerDelivery() ...
+                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 
```

### thread

```text
protected_host_boundaries_passed: queued frame discarded; key/mouse release and direct input blocked after transition; generated facts/input only
protected_output_gate_passed: generated frame blocked after scope transition while stdout gate was held
protected_scope_checks_passed: canonical v2 tuple/ack, modes/purpose, owner/logon/session/process/nonce, post-encode epoch, irreversible revocation, no keyup after scope loss; fake facts only
"0" 個の引数を指定して "VerifyMarkerDelivery" を呼び出し中に例外が発生しました: "Private WinEvent marker delivery failed"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-elevated-broker\scripts\remote-desktop\validate-protected-sco
pe.ps1:9 文字:26
+ ... Observer) { [SodaDesktopProtectedScopeNative]::VerifyMarkerDelivery() ...
+                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 
```

## Positive

```text
protected_host_boundaries_passed: queued frame discarded; key/mouse release and direct input blocked after transition; generated facts/input only
protected_output_gate_passed: generated frame blocked after scope transition while stdout gate was held
protected_scope_checks_passed: canonical v2 tuple/ack, modes/purpose, owner/logon/session/process/nonce, post-encode epoch, irreversible revocation, no keyup after scope loss; fake facts only
protected_private_marker_delivery_passed: own private WinEvents only; no screen capture/input/lock/session or service changes
```

## 最終検証

- source 028ea42509d46a1931af8a597d37b39e7773c07aを固定。以後の変更は記録のみ。
- pnpm build / pnpm typecheck: 成功。
- 全体771 suites / 11,530 tests 成功、324.56秒。
- 別worktree /workspaces/sodashitsu-desktop-protected-checkで028ea425のbuild / smoke PASS。
- 接続元とsr-pcの両方でprivate marker実配送/timeout試験成功。sr-pcではTEMP archiveのみ使用、helper/broker compile-only・generated scope/Host・既存helper/pipe/input/monitor checksも成功（exit0/timeout false）。repo HEAD06189c3f、tracked status空を維持。
- Windows CI: https://github.com/asaomaro/sodashitsu/actions/runs/40344360115 と https://github.com/asaomaro/sodashitsu/actions/runs/40344941427 成功。
- 独立レビュー、修正再点検、negative復元後のsource確認通過。
- 前PRのブラウザ5件からHost/UI/TSに追加変更がないためE2Eは重複実行しない。新しく実行したnative診断の検証範囲は、Default上の自分の非表示window/WinEventに限定する。

第7段階のworker/service/local permission/protocol/UI接続は未完了で、RunProtectedはまだproduction未接続。実UAC、Winlogon上の監視配送、実画面切替は未確認。
