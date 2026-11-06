# 手動ログインに依存しない復旧経路

利用者の指示: ログイン済み。続いて、しばらくログインできなくなるので復旧経路をこちらで用意し、作業を継続する。

- [x] Session1の通常接続とログイン後のRun readyを確認。
- [x] 通常ユーザーサーバーを起こす固定InteractiveToken/RunLevel0 taskを導入。
- [x] WMIではなく直接spawnし、実server PIDのowner/非admin/IL8192/UIAccess0/Session1を検査。
- [x] 同じ隔離stateで新規起動→既存再利用、PID/作成時刻一致、認証停止→PID/port終了を確認。検証taskは除去。
- [x] 固定readonly SYSTEM taskを導入。現在の専用packageとSCM状態だけを公開metadataへ保存。任意コマンドや変更の入口はない。
- [x] Session0・非adminの保守接続から両固定taskを呼べることを確認。
- [x] 現物のstopped/observed normal runを固定snapshotとして取得。元の鍵/2viewer/enrollment/historyを保持する再起動境界の限定復旧を生成fixtureで検証。
- [x] runtime読取周期の修正に加え、signin key restorationの重複status読取を除去。二重vault読取/identity/peer/required marker/revision/5秒期限を維持するverifiedEndpointを追加。
- [x] 旧Identity sourceはstatus2回/endpoint1回後の5秒deadlineで拒否。API不足ではない負対照を保存。
- [x] 関連6files/127test、全体build/typecheck成功。
- [x] SYSTEM readonly probeでverifiedEndpointを3509/3477msと実測。public fp/2viewer/required/active一致、runtime不変・Jobzero・task除去を確認。鍵ペアの内部署名検証は行うが、任意データへの署名や署名値の出力はない。
- [x] 元binding cdcd…は削除・再bindせず、同SCMのinspect-boundで照合して最終boot taskへ引継ぎ。元never-run taskはdefinition/ACL/未実行を照合してdisable、新taskをenable。
- [x] 実再起動後にrecover→package b499…へupgrade→normalstart admissionまで完了。
- [ ] ログイン前の暗号化接続・画面取得・PIN操作。現物SCMは1066/1で再停止しており未完了。
- [ ] 異常終了する段階のSYSTEM診断を追加取得し原因修正。現在の固定readonly診断からはSCM状態のみ取得できる。
- [ ] Windows通常server/sourceの更新、不要になった検証taskの整理、最終実機確認。

## 現在の境界

起動時の非admin保守接続は復帰したが、online/reconnectingが断続的である。暗号化signin serviceは更新後も停止し、通常user serverは対話ログイン前なので起動していない。固定InteractiveToken taskもログイン済みsessionを必要とし、ログイン前の権限を作るものではない。利用者へログインを再依頼しない。

System32の固定PSだけでowner/Session0/Adminをexit codeで返す一回限りS4U metadata probeを準備し、独立点検した。実行前に原子的な4 ACE、OWによる暗黙WRITE_DAC抑止、定義/ACL更新のAccessDeniedを確認する。登録や固定が拒否されれば実行しない。現在は保守接続待ちで、probeは未登録・未実行。結果を管理操作の自動許可として扱わない。


## 追加した起動段階の診断

従来はHost内のどの失敗もSCM 1066/1で潰れていたため、固定の101..109を
SERVICE_EXIT_CODEへ伝える変更を追加。例外本文・child output・秘密を公開せず、
後始末完了後にだけSTOPPEDを報告する順序と正常終了0/汎用失敗1を保持する。
Windowsの通常アカウントでservice lifecycleと8つのソース変異の負対照を実行し成功。
新規のstage-report変異は該当箇所を従来のSpecific=1へ戻し、意図したassertionで拒否。
範囲外の番号も1へ閉じることを検査した。生出力はevidence/signin-stage-native.txt。

この追加はまだsr-pcへ導入していない。保守接続がreconnectingのため、
導入済みb499の1066/1から実際の新番号を得たとは主張しない。


## 接続待ちの終了時点

通常側と起動時保守側はreconnecting、signin側はconnectingのまま。
保守接続の復帰を待つローカルmonitorを終了し、バックグラウンドで後から診断操作が
始まる状態は残していない。S4U probeの応答receiptは得られておらず、登録・実行成功は
未確認。再接続後はevidence/maintenance-unavailable.jsonの固定UUID taskを照会してから
再試行を判断する。利用者へ手動ログインを再依頼していない。


## PIN入力後の再開とACL確認の一括化

2026-11-06に通常/保守接続がonlineへ復帰。前回のreadonly S4U UUID taskはQueryで
不存在を確認。固定SYSTEM inspectionでb499停止1066/1を再確認した。

readonly timing fixtureは実status/enrollment、生成presence、非通信endpoint/connectorを
使う。元の初期statusは4875ms、enrollment3987ms。更新が元5秒期限に間に合わない。
最初のfixtureはendedをhealthy扱いしてしまい、9.18秒で終了したものまでok=trueに
なっていた。以降は外側12秒Abortまで続いた場合だけok=trueへ修正した。

Windows ACLのroot/directory/identityとroot/markerを、毎読取の新規helper内で各々
検査するbatchに変更。既存の祖先ACL/drive/reparse/file-handle検査とsingle hookを保持。
秘密open前に全検査し、不存在時の祖先確認も保持。読取キャッシュと5秒期限の緩和はない。
引数はUTF8 JSONをBase64化してquote処理に依存させず、厳密UTF8/配列/個数/長さを検査。

実Windows Nodeの最小環境で、PS5 ConvertFrom-Json配列を@()で包むと配列が入れ子に
なることを発見して直接代入へ修正。初回native validatorもPSの-and/-orの等価precedence
による誤判定があったため明示括弧で修正し、one-safe成功ケースを追加した。
最終native13ケース成功、旧配列包みに戻すとone-safeで意図して失敗、復元一致。
Storeも旧実装差替で新2testsが意図失敗、復元一致。関連101tests、build/typecheck成功。

一括化後の現物初期status2259ms/enrollment2092msへ短縮したが、後半の負荷時に
policy期限が切れて11.632秒でended（ok=false）。この変更で問題が完治したとは言わない。
SYSTEM task終了/削除、Jobzero、runtime digest不変を確認。正常なサインイン前接続には
引き続き処理時間と起動状態の追加対応が必要。

利用者の復旧経路を用意する指示に基づき、接続元と専用鍵を限定したWindows標準SSHを
別途準備中。秘密鍵はlocalstateの専用0600ファイルに置き、リポジトリへ含めない。


## 利用者によるsr-pc操作の一時停止

利用者が「sr-pcをしばらく使うので、一旦sr-pc側への操作は停止」と指示。
sr-pcへの新規exec/照会/設定/検証は行わず、リモート画面のbrowserをcloseして切断済み。
ローカルの既存receiptだけを確認したところ、SSH v7の昇格PowerShellは終了コード
-1073741510 (0xC000013A)で中断終了していた。新しいremote照会はしていないため、
Windows capability処理の完了/途中状態、SSH設定・サービスの有無は未確認。
再開指示までsr-pcへのアクセスを停止する。次回は最初に現物状態を読み取ってから
復旧経路の続行を判断し、同installerを盲目的に再実行しない。

SSH最終sourceは/tmp/soda-install-recovery-ssh.ps1、stage名install-recovery-ssh-20261106-v7.ps1、
結果予定rootはC:\Program Files\Sodashitsu\RecoverySsh20261106d。
専用private keyはlocalstateのsrpc-recovery-20261106/identityに保持、非repo。
public-statusはこの停止指示後には読み取っていない。

ACL batchは13a9c668でmainへpush済み。残る期限切れ対策の案は
../20261106-signin-readonly-source/design.md。ローカル案のみで実機未導入。


## Terminal連続開閉の緊急停止

利用者が「繋いで良いので停止させて」と、原因確認と停止に限り再接続を許可。
Session1の通常Soda Node18040がgit.exeを繰り返し起動し、その直後にWindowsTerminalが
新規作成されることを12秒のCIM追跡で確認。こちらのlocal実行controllerは残っていなかった。
Gitだけ停止する既存APIがないため、端末内の子プロセスをkillせず、通常serverだけを
NtSuspendProcessで一時停止。Boot(Session0)を経由し、host/owner/Session1/node/main.js/
7780 listener/creationを検証し、保持したhandleでcreationを再照合後に実行。
独立点検で必須指摘なし。receipt: PID18040 / createdFileTime134384363801563095。
6秒間の再確認で新Git child 0、同じ通常serverの生存を確認。

通常操舵室は一時停止中であり、その接続は応答しない。pane内プログラムは保持。
新たなsr-pc操作はここで停止し、利用者の再開指示までresumeも行わない。
再開はoperational/resume-normal-server.ps1のinstance束縛を使って、同一PID/creationだけに
行うこと。OS再起動や別serverへは適用しない。保守接続は別PID3620/Session0。
再開前にGitのWindows非表示spawn設定の不足を確認し、連続表示の修正を準備する。


## 再開許可後の通常server復帰

利用者の「作業再開してOK」でsr-pcの操作停止制約が解除された。
GitRunnerのhidden指定欠落を修正し、期待SHAのdist moduleだけに最小反映。
PID18040/creation134384363801563095を再検証してNtResumeProcessで復帰後、
標準Windows handoff成功。pane UUID2件と親PID一致、実行中pane1件の維持を確認。
16秒の観察でGit child2/新WindowsTerminal0。通常serverは現在一時停止中ではない。
詳細は../20261106-windows-git-console/へ保存。
