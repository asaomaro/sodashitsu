# sr-pc再起動後の実機確認

## 復帰

利用者がログインし操舵室を起動した旨を報告後、元のsr-pc接続が復帰。ComputerName=OSK2-024680-2、LastBootUpTime=2026-11-05T11:35:44.5000000Z、対話Session1を確認した。前turnは再起動要求受理と接続断のみを確認していたが、今回は実OS再起動を照合できた。

既存の単発RunOnceは消費済みで、そのrunnerの完了記録はなかった。原因をコマンド長などと断定しない。通常ユーザーHKCU RunにSodashitsuを登録し直した。System32 wscript→同ユーザーprofileの固定VBS→ProgramFilesのNode→固定user-autostart.mjsという126文字の入口。VBSは画面を出さず、runnerは既存findOrStartでdefault stateのサーバーと認証済みWS準備完了を確認する。PW/PINは保存しない。serverはSYSTEM化しない。

同じwscript入口を手動実行し、user-autostart-status.jsonにreadyを確認（最終2026-11-05T12:00:44.141Z）。動的importをstarting記録後のtry内へ移し、import失敗時に古いreadyだけが残らないよう修正。StartupApprovedの無効化記録なし。既存サーバーのprimary tokenはAdmin=false、IL8192、elevation0、UIAccess0、expected owner一致。今回確認したのは既存サーバーへの手動接続であり、次回ログイン時の自動実行・停止状態からの新規起動は未検証。ログイン前の保守サーバーboot taskは登録していない。

## 専用サインインサービス

既存のレビュー済みwrapperと34ソースのSHAを照合して、利用者の継続承認に基づきUACで実行した。

- 異常runの再起動後復旧はabnormal-restart-recovered。clean exitを捏造しない。
- パッケージはec399280…からfc0b5cb3…へupgrade成功。
- 更新後statusはstopped/initialを確認。
- initialize prepareはpendingになったが、start controllerは整合性確認失敗で停止。
- 読み取り専用の管理者調査で、admin.claimedのみでadmin.resultなし、runsはobserved、SCM Stopped/Exit1066/Specific1。serviceはManual。
- runtimeにidentity.jsonがある。操作の一部が保存されている可能性があり、未実行・rollback済みと扱わない。

既存の鍵・信頼・要求・run journalは削除/reset/replayしなかった。現行の再起動recoveryは今回のclaimedと部分runtimeを対象にしていないため、もう一度再起動するだけで直るとはしない。サービスの自動接続・暗号化viewerによるサインインは未完了。

補助PSのコンパイルのみを測定したところtotal578/568ms。隔離した通常ユーザーの生成データでEndpointStore.initialize=3227ms、setRequired=4257ms。複合stepの5秒制限と近いが、今回の直接原因と確定する証拠ではなく、制限を無根拠に延ばす変更はしていない。最初のTemp fixtureはACL検査で拒否されたため、ユーザー所有のprivate fixtureに切り替えて測定し、生成鍵/一時stateを削除した。

## 仮想マイク

通常デスクトップを使う実リモート経路で、生成した440HzのPCM300フレームを送信。microphone=true、starting→running→stopped、errors=[]、ACK238件、screen8frames。全フレーム配送を保証した結果ではない。

同時に仮想capture endpointだけを読み、2999packets/1439520samples、peakRms5828.2279を確認。粗い周波数推定は400Hzであり、440Hzの厳密な周波数照合と主張しない。再起動前に発生した送信中unavailableは今回は発生せず、生成音の仮想入力受信まで確認。実マイクを使わず、PCMを保存せず、既定の音声endpointを変更していない。

## 通知とレビュー

今回のsr-pc assistant.settings.getはenabled=false/phase=disabled。設定を変更せず、今回のログイン後の実通知は未検証。以前のWindows隔離fixtureでの通知確認結果と混ぜない。

review_resource_monitorが自動起動runner、実VBS/Run値、実サーバーtokenを独立点検。動的import修正後、必須指摘なし。次回ログオン実行と停止状態からの新規起動は未検証として残した。通常サーバー・専用サービスのsystem境界と不明runの扱いも分けて記録した。
