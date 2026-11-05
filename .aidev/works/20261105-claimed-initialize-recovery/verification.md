# 検証記録

## 対応内容

複合initializeで既存identityを保存した後、5秒のstep期限が切れた場合、結果記録を作れずclaim済み・観測済みの状態になる経路を生成テストで再現した。各段階30秒・全体60秒とし、単調時計で失効を固定する。実機で最初に起きた停止の原因がこの経路だったとまでは断定しない。native個別保存5秒・teardown8秒・要求期限は維持する。

既存鍵が1件だけ保存されている既知の履歴に限定した明示復旧を追加した。鍵を復号できるSYSTEM primary tokenの読取専用proofを先に必要とし、秘密鍵の署名と保存公開鍵の一致を確認する。暗号文と全runtimeのSHA、全履歴、SCMのcritical実体、排他barrierを固定し、再起動を挟んで同じ鍵を確認する。元要求は結果不明のまま退避し、正常停止と偽装しない。

## 自動検証

- 旧実装に戻した回帰テストは期待したassertionで失敗した。生出力: `negative-control.txt`。実装は元の修正版の生バイトへ復元した。
- 関連8ファイル154テスト成功（単体25件を含む）。全体typecheck/build成功。生出力: `typecheck.txt`, `build.txt`, `server-build.txt`。
- Windowsの凍結ZIP sourceで、Node WebCrypto PKCS8→DPAPI→native公開鍵一致、保存cipher無変更、曲線/DER/反転公開点/秘密鍵差異の拒否、既知履歴の結び付き、proof期限/SCM差異、退避と5箇所の中断保持を検査。5種のsource否定と完全復元成功。生出力: `windows-generated-first.json`。
- PowerShellの省略したstring引数が空文字になる実機境界を追加修正。inspect/bindのnull/emptyのみ受容、recoverは64hex必須、空白や不要ticketは拒否する。最終6否定検査も成功。生出力: `windows-generated-final.json`。

## 実機の確認と残る検証

sr-pcの既存サービスは停止中で、claim済みinitializeと843byteの暗号化identityを保持している。新しいSYSTEM読取専用taskが成功し、既存identityのDPAPI復号・PKCS8形式・公開/秘密鍵の署名一致を確認した。taskの完了と削除を確認し、runtime/admin/runsは変更していない。最初の管理者inspectはPowerShell省略引数の変換で入口で拒否された。修正後は新しいproofと同一親操作でnative inspectが成功し、mutates=false、元のrunId、公開指紋とruntime SHAを確認した。生出力: `windows-readonly-inspection.json`。

再起動前に、保守用のSession0通常ユーザーサーバーを別state/portで用意した。保護されたguardでAdmin=false、Medium IL、UIAccess=0、SeChangeNotifyPrivilegeだけの実tokenを検証し、通常ユーザーrunnerとserver両方がSession0であることを確認した。認証RPC接続、task再実行で二重起動しないこと、固有停止要求によるserver/runner/portの終了を確認した。再度起動して待機中。実OS再起動後の再接続は未検証。

当初の読取専用inspect終了時点ではbind/recover以降は未実施だった。その後の実行結果は末尾の追加再起動の節へ記録する。

## 独立レビュー

`/root/review_resource_monitor` が実装と別コンテキストで最終差分・期限処理・DERと署名照合・PowerShell省略値・実機記録・6否定の整合性を確認。必須指摘なし。実機のbind/recover以降は別の未完了検証として扱う。

## Windows事前検査・復旧予約

新しいpackage SHA 8e6d72110ffafcbfbe4b8e4e582dcecf83976e8a2d645a2c37066a31cb8429d9を生成。BA/SYだけが書けるProgram Filesの固有rootへ、レビュー済み36ソース、配布物、一度限りの固定boot entryを配置した。公開状態ファイル1件だけにowner FRを与え、owner/group、protected DACL、ACEと読取maskを読み戻した。秘密のsealed enrollment・sourceへの権限は広げていない。

最初のtask読戻しではTask SchedulerがPフラグを返さずprincipalのSY FRを追加したため、開始前に拒否した。未実行(267011/Ready/instances0)・principal・action・引数・root・SDDL一致を確認してそのtaskだけを削除し、原本rootは保持。Microsoft仕様に従ってTASK_DONT_ADD_PRINCIPAL_ACEを使い、SY/BAの完全制御2件のみを厳格に読み戻した。通常ファイルのDACLProtected検査は維持した。

新SYSTEM preflightはpackage previewと全controller compileに成功し、終了・task削除を確認。新しいreadonly proofからbindが成功し、providerとruntime SHAは最初のinspectと完全一致。boot taskと保守用通常ユーザーSession0の認証RPC接続を確認した。生結果はwindows-bound-ready.json。boot entryは再試行しない。実行済みの再起動で完了状態を上書きしない。これらの運用scriptも独立レビューを通した。

Windows通知は再起動後の隔離17880で作業完了通知のvisible/source一致を再確認。要約用の自前遅延exe、専用CODEX_HOME/PATHの条件下で16.001秒の簡潔なfallbackを確認した。実モデルは使わない。fixture準備中の空JSON読取競合、起動環境不足、未readyでの読取はfixtureとして切り分け、成功結果と混同しない。windows-notification-post-reboot.json / windows-headline-post-reboot.json参照。検証後は認証server.stop、両port待受0・自前summaryprocess0・dummy削除を確認した。通常のdesktop assistant設定は変更していない。

実運用に用いた固定scriptはoperational/に保存する（このPCと今回の生バイトに限定。汎用の再実行用ではない）。原本の暗号文やtoken、PINは含まない。Taskのprincipal ACE抑止は [Microsoft TASK_CREATION](https://learn.microsoft.com/en-us/windows/win32/api/taskschd/ne-taskschd-task_creation) と [登録の仕様](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-tsch/849c131a-64e4-46ef-b015-9d4c599c5167) に基づく。

2026-11-05T14:43Z頃、予約済み公開状態と保守RPC接続を再確認し、利用者の既存再起動承認に基づいてshutdown /r /t 0を実行。/fは指定していない。返却はrestart_requested_without_force。その後、通常接続→保守接続の順にreconnectingへ移った。再起動後の完了を確認中。

## 追加再起動の結果（2026-11-06 JST）

保守用接続が約51秒で自動復帰。途中で一時的なreconnectingがあり、WMI取得を含む読取exec.startは2回timeoutとなった。単純なファイル読取りは成功しており、安定した接続とまでは断定しない。Session0の通常ユーザーserver/runnerのready記録と、実tokenのAdmin=false・Medium8192・UIAccess0・SeChangeNotifyPrivilegeだけを確認した。15:00:25Z時点のOS uptime 979031msとSession0を取得し、実OS再起動も確認。

公開状態はfailed / run-trust-owned。保護された固定scriptの検査順序から、fresh SYSTEM proof、新SCMに基づく鍵保持のrecover、package8e6d7211へのupgrade、既存指紋のままinitialize成功/required=true/peers0の結果確認とack、利用者browserのtrust成功/正確な1viewerの結果確認とackまでは完了している。元の不明initialize要求・元の実行履歴・旧packageは退避保持している。

検証用browserのtrust-ownedはprepare済み・起動処理の段階で拒否された。原因と実際の結果は未確認。再送・ack・原本削除を行っていない。enrollと通常起動には進んでいない。専用サインイン接続もまだonlineではない。boot taskはattempted印により以後の再起動でも再実行せず、失敗状態を保持する。

現在の保守接続はSession0の制限された通常ユーザーであり、専用serviceのprivateな結果を読んだり、Session1 Winlogonを操作する権限はない。既存unlock helperも呼出元がactive console sessionであることを要求する。これを緩めて操作する変更はしない。利用者へWindowsの手元ログインを依頼した。ログイン後は恒久Runの自動起動を確認し、管理者の読取専用inspectで既存要求の結果を確認してから、適切なack/残りの登録・通常起動・実PIN操作検証を続ける。

未完了: trust-ownedの結果/原因確認、enroll/通常起動、専用経路の実サインイン、ログイン時Runの実自動復帰。通常Windows版の通知は今回の追加再起動より前のログイン環境で再確認済み。追加再起動後のログイン環境で再検証したとは扱わない。
