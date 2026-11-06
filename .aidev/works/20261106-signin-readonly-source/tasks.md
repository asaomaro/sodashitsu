# 期限を維持したreadonly workerの共有

- [x] epoch内に限定したprivate readonly worker、固定操作/4path/上限/timeout/abort/終了待ち。
- [x] 既存登録readerの検査を共通関数へ抽出し、oneoff readerも維持。
- [x] Runtimeのsource分岐と準備後5秒lease、全teardownの回帰テスト。
- [x] 旧Runtime差替でwarmup前のconnector起動を捕捉。生ログ保存、byteexact復元。
- [x] 関連6files/124tests、server build/typecheck、package staging validator、signin bundle build成功。
- [x] 独立レビュー。要求timeoutの受信時monotonic照合など追加差分も必須指摘なし。
- [x] native SYSTEM readonly fixtureで20.059秒継続、外側Abortまで有効。task削除/Jobzero/runtime不変。
- [x] 統合版native通常non-admin token拒否、unknown op/foreign ACL path/oversize line拒否。
- [x] 統合版も20秒継続+拒否3件成功（22.190秒）、task削除/Jobzero/runtime不変。
- [x] 実装最終レビュー、1f7aff4eでmain push。
- [ ] 既存鍵/viewer/enrollment/historyを保持してprotected package更新、サインイン前実接続と再起動検証。

初回fixtureのStateDir過剰escapeはJSON.stringifyへ修正。修正後もwarmup timeout。
第2回ではworkerのready行まで約0.8秒で到達するphase記録があり、親の受信を切り分け中。
両試行はtask削除/Jobzero/runtime不変を確認。成功とは扱わず、本番serviceへは未導入。


Windows PowerShellのConsole.Outによるready通知はstdin終了後まで届かなかった。
第3回のnative記録は受信16bytesが10.823秒/child終了10.890秒で、warmup timeoutを捕捉。
raw OpenStandardOutput UTF8 Write/FlushとOpenStandardInput strictUTF8 readerへ変更後、
第4回はwarmup599ms/初回登録982ms/status1021ms、次回登録13ms/status45ms。
生成presence/非通信endpointのreadonly検証であり、実サインイン接続の成功とは分ける。
既存Presenceの120秒epoch境界は今回緩和しておらず、長時間接続は別残件。


## 導入互換性を維持する統合

新PSファイルをRequiredPathsへ増やすと、旧b499 manifestがstrict Upgradeで読めなくなる。
旧検証やschemaは緩めず、新workerと共通読取を既存read-signin-enrollment.ps1に統合。
固定-ReadonlySource分岐のみ-StateDirを受け、従来oneoffは-StateDirを拒否して1回返却/終了。
package三つのリストはHEADと完全一致。最終System実機fixtureでも更新scriptの20秒継続/拒否3件を確認。


## Session間worker起動の修正（2026-11-07）

- [x] 実機のCreateProcessAsUserW Win32 5を固定stage診断で特定。
- [x] protected observed Host identityからの明示parentとHost保持aggregate/individual Jobを実装。
- [x] Root handleで自Host非所属を確認。Rootはbreakawayなし、anonymous、Hostのみ保持。
- [x] 正常/異常終了はRootとaggregate双方0確認を維持。
- [x] Windows native Host/RunSession/Worker既存checksとcompile/staging成功。
- [x] native suspended fixtureでcaller Root所属、指定親/worker Root非所属、2 Job所属、個別peer維持、全回収を実確認。
- [x] 親属性のみ旧状態へ戻すnegativeは同一fixtureでWin32 5により失敗。修正sourceをbyteExact復元。
- [x] 関連75 tests/server build成功。製品差分とfixture/setupの独立レビュー必須指摘なし。
- [ ] mainへ反映、現在の異常runを結果unknownのまま保存し、標準Upgradeで実導入。
- [ ] actual service HostBinding/長時間接続/通知/再起動前ログインなしの検証。

fixtureはOS動作検証用で、製品Host認証の成功とは分ける。固定sshdを保持handleで読取のみ確認して明示親にする。
全workerはCREATE_SUSPENDEDのまま、一度もResumeしない。__FIXTURE_ROOT__はreview済みprivate rootへstage時に固定する。
negativeのunchanged=falseは、意図した例外終了でverified markerを発行しなかったことを表す。鍵変更を表すものではない。
直後のreadonly snapshotはtask0/unchanged=true、runtime digest d583496c...を確認した。


## b38 Specific107固定caseと再起動準備

- [x] 現b38/c12/started digest・PID15588/creation/owned start receipt・SCM1360を固定。
- [x] retained process handle/不在87/別incarnationで元Host消滅を検査、生存/AccessDeniedを拒否。
- [x] 生成データ正例9分岐・識別/SCM/Host/中断/identity guardを確認。started digestのみ除去する負例で失敗、source byteExact復元。
- [x] caseとfixed operator setup独立レビュー、実inspect→recover成功。unknown保存・keys保持・started=false。
- [x] 新c55 packageを生成。1ba65bb0…、readonly Preview validated=true。
- [x] 標準Upgradeは旧SCM状態1066/107を拒否、before-marker/no transition/b38/initial維持を確認。拒否済taskは再使用しない。
- [x] 復旧用SSH Automatic、保守接続、通常agent1名idleを確認。完了済旧BootRecovery3件はdisable、既存logon/保守taskは維持。
- [x] fresh191 operatorとnew-critical-SCM/1077/manualの一回Boot workflowを準備し独立review。guard compile-only成功。
- [ ] 許可済の再起動を/fなしで行い、ログイン前のSSH/BootMaintenance/標準Upgrade/実サービス起動を確認。

固定case: runs-startup107-30f9b30c5bb8430ea8a52531764b4d45へ元runを保存。
標準UpgradeScmのExit0/1077条件は緩和しない。再起動でOS状態が1077へ戻ったことを実確認して進む。
Boot task c3efd99d901f43c7979ccbf358534579は15秒delay/12分上限、fresh191 Rootの標準toolだけを一回呼ぶ。
鍵3ファイルのhashはupgrade前後で確認する。成功receiptは起動観測ACKであり、実接続・長時間健全性の確認とは分ける。
再起動後の復旧経路は未検証であり、準備だけで成功としない。


## 実boot結果とepoch取消

- [x] 実rebootは/fなしで要求し、手元ログインなしでSSH再接続（新boot 2026-11-06T17:05:45.5Z/Session0/SID一致）。
- [x] 新SCM1352:134384583610655456を実確認。Boot task c3は標準Upgrade b38→1ba/起動観測ACK1回まで成功。
- [ ] 実serviceはその後再び1066/107で停止。run217a29bb...の結果はunknownであり、起動成功とはしない。
- [x] readonly snapshotでHost8104/creation・started digest・runtime d583…不変を確認。まだrun再利用なし。
- [x] native証明後のsource準備/初回read中のepoch喪失を、確認済みteardown後にfresh probeへ戻す修正。
- [x] source単独不正/未確認native終了は引き続き拒否。4追加tests、旧Runtimeのみ戻す負例2件失敗→byteExact復元。
- [x] 固定201..215/240の診断番号を追加し、text/paths/keysを出さず停止原因を伝播。旧Presenceのみ戻す負例4件失敗→復元。
- [x] 関連26files/465tests、server typecheck/build、native Host/RunSession/Worker checks成功。独立レビュー必須指摘なし。
- [ ] epoch修正版を標準更新して実serviceとprelogin接続を再検証。

新診断番号: 201 package/runtime、202 console、203 journal open、204 journal照合、205 Host pin、
206 parent handle、207 parent照合、208 aggregate open、209 aggregate照合、210 pipe、211 worker create、
212 connect待ち、213 pipe認証、214 pump、215終了行、240 Node entryのreject。
番号は失敗状態の説明だけで、正常終了や入力解放ACKを意味しない。Specific報告は従来同様全Job清掃後。
