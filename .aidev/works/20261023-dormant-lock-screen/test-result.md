# sr-pc の休止したロック画面への接続

## 原因と修正

実機sr-pcでactive console session=1、WTS locked=0、input Default、foreground HWND=0、LockAppなし、LogonUIありを確認。元のPendingUserLockScreenは常駐LockApp必須だったためSelectSourceがtransitionを返し続け、Web側の4回目の再接続で停止していた。

ロック中のアクティブなコンソール・通常デスクトップ・前景なしを二度確認できたら、既存の非撮影cover経路を使う。明示ボタンはSetThreadExecutionState(2)だけを呼ぶ。Enterの送信は従来どおりUserLockScreenのOS実体/ユーザー/Logon SIDを確認した場合だけ。SYSTEMのWinlogon撮影/入力guard、サービスの導入と設定は変更しない。

## 検証

- Windows上でvalidate-unlock-helper.ps1成功。pipe/UTF8/duplex/display lease/process query/cover protocol/no-console UTF8の全チェック成功。
- DormantLockScreenの全状態組み合わせ（SYSTEM、locked/unknown/unlocked、Default、前景）と二度目の状態変化を検証。既存のwakeからEnterを連続送信しない試験も成功。
- 別コンテキストreview_transferが変更を独立点検。指摘なし。
- Bの変更前SHA-256を照合してUnlock.csの対象関数だけ置換し、バックアップを保存。コンパイル成功、新SHAがローカルと一致。
- 実機の非撮影照会で同じlocked/Default/HWND0状態がselected=coverとなることを確認。
- 公開HTTPSの /desktop-share 経由で ready secureDesktop=true、lockScreenCover=true、allowInput=true を確認。操作権を取得せず、入力を送らず、その接続だけ停止。
- localhost originからのprobeはBの許可ポリシーで拒否された。登録済み公開HTTPS originで実施し直して成功。許可設定は変更していない。
- 実際の復帰ボタン、Windows認証は利用者の操作待ち。自動では実行していない。
- ファイル転送作業の最終確認はこの修正の前に完了: 全体743ファイル/11318件、build/typecheck/smoke成功。本修正はC#とそのnative試験・文書のみで、上記Windows検証を実施した。

バックアップ: `C:\git\sodashitsu\.soda\maintenance-backups\20261023-dormant-lock-a4ee16a7-7980-4c16-a3e4-bff457c3c8cf`

変更前SHA: `956fb76d101003f9e1675f4b54433a4d6f6256007deedc82cb5ff3fa6851b050`
変更後SHA: `324a6e87f3ed7aa08988c0e603e43a2594d9ca0545990fbea5fc103302583e4d`

## 回帰の負対照（実機・非撮影）

別の一時PowerShellプロセスでBの変更前バックアップをコンパイルし、同じ実機のlocked/Default/HWND0条件を確認後、SelectSourceがcoverを返すという検査を実行。旧版はtransitionを返し失敗した。Bの運用ソースは修正済みのまま変更せず、負対照後もローカルとのSHA一致を確認する。

生のCLI出力:

```text
{"id":"4a10f332-4571-4cc5-8032-2c9a37d23d3d","status":"exited","stdout":"original_source_selected=transition\r\n","stderr":"#< CLIXML\r\n<Objs Version=\"1.1.0.1\" xmlns=\"http://schemas.microsoft.com/powershell/2004/04\"><Obj S=\"progress\" RefId=\"0\"><TN RefId=\"0\"><T>System.Management.Automation.PSCustomObject</T><T>System.Object</T></TN><MS><I64 N=\"SourceId\">1</I64><PR N=\"Record\"><AV>���W���[�������߂Ďg�p���邽�߂̏������Ă��܂��B</AV><AI>0</AI><Nil /><PI>-1</PI><PC>-1</PC><T>Completed</T><SR>-1</SR><SD> </SD></PR></MS></Obj><Obj S=\"progress\" RefId=\"1\"><TNRef RefId=\"0\" /><MS><I64 N=\"SourceId\">1</I64><PR N=\"Record\"><AV>���W���[�������߂Ďg�p���邽�߂̏������Ă��܂��B</AV><AI>0</AI><Nil /><PI>-1</PI><PC>-1</PC><T>Completed</T><SR>-1</SR><SD> </SD></PR></MS></Obj><S S=\"Error\">Regression: dormant locked desktop should offer noncapturing cover; got transition_x000D__x000A_</S><S S=\"Error\">�����ꏊ �s:13 ����:27_x000D__x000A_</S><S S=\"Error\">+ ... ne 'cover'){throw ('Regression: dormant locked desktop should offer n ..._x000D__x000A_</S><S S=\"Error\">+                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~_x000D__x000A_</S><S S=\"Error\">    + CategoryInfo          : OperationStopped: (Regression: dor... got transition:String) [], RuntimeException_x000D__x000A_</S><S S=\"Error\">    + FullyQualifiedErrorId : Regression: dormant locked desktop should offer noncapturing cover; got transition_x000D__x000A_</S><S S=\"Error\"> _x000D__x000A_</S></Objs>","stdoutTruncated":false,"stderrTruncated":false,"exitCode":1,"signal":null,"timedOut":false,"cancelled":false}


```

Windows native検証の生出力:

```text
desktop_unlock_pipe_cancelled
desktop_unlock_utf8_pipe_passed
desktop_unlock_duplex_pipe_passed
display_lease_checks_passed: DEVMODE220, supported-mode-only, guardian-before-apply, restore/disarm, preserve-local-change, partial-failure rollback; fake driver only; no OS mode changes
desktop_unlock_process_query_passed
desktop_lock_cover_checks_passed
desktop_unlock_checks_passed
desktop_unlock_no_console_utf8_passed

```
