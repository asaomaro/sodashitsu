# 起動前の検証（進行中）

通常Windowsサーバーの状態と接続は維持。OS再起動は未実施。

## 失敗した候補

S4U / RunLevel=0 / compatibility=2でも、Session0のPSでWindowsPrincipal.IsInRole(Administrators)=trueとなった。EnableLUA=1。ユーザー書換可能なコードをこの権限で自動起動しない方針とし、作成した手動probe taskを撤去した。

固定runas.exeを使い、管理者/SYSTEMのみ書込可能なProgramFilesのguardを実行した。Administratorsは無効になり、残存特権はSeChangeNotifyPrivilegeだけだったが、IL=12288のためguardで拒否しNodeは起動しなかった。長いEncodedCommandをrunasへ渡す候補は起動結果を確認できず、短い固定File指定へ切り替えた。

## 制限を再検査した候補

固定guardで現在のprimary tokenのILを8192へ低下し、handleを閉じてから新しく開き直して検査。thread impersonation tokenなし、UIAccess=0、危険特権がtokenから除去されていることを確認した。Nodeも、保護した同じguardのInspectPid（metadataだけ）で自身のprimary tokenを別プロセスから照合した。

```text
{"sessionId":0,"elevationType":1,"privileges":["SeChangeNotifyPrivilege"],"threadToken":false,"tokenElevation":1,"uiAccess":0,"nonAdmin":true,"integrity":8192}
{"integrity":8192,"elevation":1,"uiAccess":0,"elevationType":1,"threadToken":false,"admin":false,"owner":"<expected-owner>","privileges":["SeChangeNotifyPrivilege"]}
{"localRpc":true,"delegationReadable":true,"remoteHttps":true}
```

NodeのthreadTokenは検査用PSのthreadに対する観測であり、Node全threadの列挙ではない。Node primary tokenのIL/owner/groups/privileges/UIAccessは対象Node PIDから照合した。

最初のnetwork probe失敗は検証器のURL比較の問題。保存済み委譲URLはwssだがhttpsと比較しており、修正前にremote HTTPSまで進んだ証拠として扱わない。修正後の上記3項目は成功した。ただし、隔離サーバー自身が認証済み委譲WebSocketへ接続した検証はまだない。

各一時taskにはboot triggerを付けていない。直近の一時taskは管理者のfinallyで停止/削除し、task-result=0を確認。ProgramFilesの保護した検証guardは残しているが、通常ユーザーには書換不可。

## 独立レビュー

review_resource_monitorが設計を点検。実測Admin=trueを優先、通常ユーザー書換可能な昇格taskを残さないこと、PS/Nodeの実トークン、Medium以下、危険特権の除去、UIAccess/impersonation、privileged handle継承なし、認証済みWS実証と終了/重複検証を要求。RunOnce/S4Uのメタデータだけを起動成功と扱わない。

## 操作手順の修正

認証画面を確認しきらないまま解除用入力を送った操作ミスを利用者へ報告した。現在の画面ではcomposerは空で、新しい会話も表示されていなかった。入力・会話が送信されていないことを全履歴から証明したものではない。以後はsecureDesktop=trueかつ非protected/非coverの実ready情報を確認できないと解除入力を送らないdriverへ変更し、無条件の秘密入力operationを削除した。PINや個人画面はこの記録へ保存しない。

参照: MicrosoftのTask Scheduler security contexts、CreateRestrictedToken、runasの公式文書。S4Uは対話ログオンと同等でなく、特にネットワーク資格情報/暗号化データの制限がある。


## この試行の終了時点

- 既存sr-pcへの接続は維持。実機のComputerNameはOSK2-024680-2であることを照合した。OS再起動は行っていない。
- 新しい保守用招待を作り、既存サーバーから一時的に委譲して、認証情報を同PCの隔離state `boot-maintenance-20261105`へコピーした。認証情報を引数・出力・この記録には載せていない。一時委譲は停止済み。隔離サーバーの起動による接続成功とは数えない。
- System32 runas→ProgramFiles固定guard→同トークンのNode spawnで隔離17882を起動する候補を準備した。通常の7780/stateと分け、WMIによる別トークンへの起動は避ける設計。
- 独立レビューの指摘: 固定guardの特権denylistをallowlistへ変更（SeChangeNotifyPrivilegeのみ）。停止要求を終了前に削除しない、RPC失敗をstop-unconfirmedとして記録、single-flightにする変更を候補へ反映。失敗時の子孫回収・終了確認と、重複起動の実測は未完了であり採用済みとしない。
- 管理者確認の開始後に実機がロック状態となり、保護画面helper開始が拒否された。ロックcoverから認証画面への再接続も安定せず、認証画面のguardを満たさない操作では秘密入力を送らなかった。管理者起動を待つremote execは300秒でtimeoutした。
- 最後の照合時点で、新しい `C:\Program Files\SodashitsuBootMaintenance-20261105` は存在しなかった。したがって新しいboot taskの登録成功を報告しない。隔離サーバーの認証済みWS、停止、重複、ログイン前復帰は未検証。
- 既存のRunOnceによるログイン後の通常サーバー復帰準備は維持。ログイン前の接続とは区別する。利用者が現地ログインできない状況で、自動復帰未検証のまま再起動することは避けた。

次回はロック解除と管理者画面経路の復旧から再開し、隔離サーバー自身の認証済みWS・終了/子孫・二重起動を検証した後に、boot taskと実OS再起動を試す。起動前の専用signin service recoveryと仮想マイクの再起動後確認も未完了。


候補の再レビューでは、実行中のasync停止callbackが最終stopped記録を上書きし得る点が残った。採用前に終端フラグと進行中promiseを管理する。実機に採用・登録していない候補であり、完了済みとはしない。

管理者起動待ちのtimeout後にもconsent processが残っていたため、ハッシュ照合対象の一時installerを削除した。遅れて承認されても、この候補を登録できないようにした。PIN・個人画面はリポジトリへ記録していない。
