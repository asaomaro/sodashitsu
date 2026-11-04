# 認証入力とdesktop遷移時の入力解放

## 問題と変更

実sr-pcでPIN/Enterによる解除後、入力解放を確認できず再共有を拒否する事象がある。Enter down/up間のscope変化によるterminal ACK欠落が最有力の原因候補だが、実遷移のキー件数/cleanup/ACKは未観測で、原因確定とは扱わない。故障flagを設定操作やworker終了だけで解除する扱いは変更しない。

明示した認証worker（SecureLockStateあり）だけで、他のキー/ボタンを保持しないEnter/NumpadEnterのdown/upを一度のSendInputへ渡す。文字入力も各UTF-16文字のdown/upを一度に渡す。送信件数が不足/例外なら停止し、入力解放を確認済みとは扱わない。通常・昇格・修飾キー/マウス保持中のEnterは従来どおり。元scopeが失われた後に新scopeへ解放入力を送らない。

Microsoftの[SendInput仕様](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput)は配列の連続挿入と実挿入件数を定義する。desktop切替全体の原子性を保証したとは扱わない。

## Windows上の検査

隔離stageへソースをコピーしてSHA256照合。各検査を新しいPowerShellでコンパイルして実行した。生成scope/入力hookのみで、実キー入力・画面・clipboardは使わない。

- validate-authentication-input.ps1 -NegativeControls: exitCode=0。Enter、NumpadEnter、Unicode、scope喪失、partial input、通常/昇格/chord/held buttonを検査。
- 負例3件: 認証Enter経路を無効化、Unicodeを2つのnative呼出しへ復元、partial件数検査を無効化。すべて狙ったassertionで失敗。生出力はwindows-authentication-checks.json。
- 各負例後に元byte列へ復元して一致を検査。最後に正例を再実行して成功。
- validate-resource-fence.ps1 -NegativeControls、validate-unlock-helper.ps1、validate-protected-worker.ps1: exitCode=0。生出力はwindows-existing-checks.json。

実機サービスはコンパイル済みexeを使うため、ソース反映だけでは更新されない。管理者によるサービス更新と更新後のロック解除・通常再共有は未確認。この時点では実事象を解決済みとは記載しない。

## 独立点検

review_resource_monitorがsource/testと最終差分を独立点検。必須のコード指摘なし。実測事象と内部原因候補を分ける文書指摘を反映した。

## main反映後の準備

- e0e00b82をmainへpushし、sr-pcも同commitへfast-forward。Electronの内部host資材もbuild成功。
- リポジトリのinstall-unlock-service.ps1 -ValidateOnlyはexitCode=0（windows-installer-check.json）。実サービス更新は別のUAC承認が必要。
- サインアウト専用packageを最新ソースで再生成。manifest SHA256=985a168ef5ffa7304782d7719d8e7c1980f671ff78e2cca56ecc9c8039ebf3ca、revision=da6c0710-e8b2-4453-8cfe-4ed022a463c2。ValidateOnly成功、インストール/自動開始/鍵作成はしていない。
- VB-CABLE x64 installerの署名Validと既知SHA256一致を再確認。未実行、再起動なし。

## 管理者更新の実行待ち

専用の更新スクリプトとHostのSHA256を固定し、インストーラーを実行するUACを要求した。最初の非同期起動は実行継続を確認できなかったため、180秒の明示待機へ変更。実consent.exe=1・更新launcher=1を観測したが、期限までに完了結果が得られず、execはtimedOut=true/exitCode=1。期限後はconsent.exe=1、launcher=0、更新結果なし、既存service=Stopped。サービス更新成功とは扱わない。承認画面の状態と後から生成される結果を次回まず照合する。再要求は結果を確認してから行う。

共有許可は一時無効化前に所有者profileのprivateファイルへ保存しており、終了時に元の全項目へ復元し、originalPermissionsRestored=true、enabled=trueを確認した。PIN/実画面は保存しない。共有許可の復元で入力解放故障flagを消す処理は加えていない。

## 利用者承認後の実サービス更新と実機結果

2026-11-04T12:09:07Z、利用者の再表示指示でUACを要求し、承認後の更新結果ok=true/kind=unlock-service-updateとexec exitCode=0を確認。以前のキャンセル記録は別名へ保持。インストール済みexeの新規検査メソッド名VerifyAuthenticationInputのmetadata markerが存在し、SHA256=16F39A0CFD689DB9918321E8A2FD2DBAB4F47FF9252320EDD39482CEA1DD5E1E、service=Running。更新完了後に元の共有許可を復元した。

通常共有ready・実画像4frame以上を確認後、実LockWorkStationでロック。coverからサインイン画面へ進み、認証画面の操作許可を取得。PINとEnterで認証した。PIN/画像はログやリポジトリへ保存しない。

解除直後は「画像の専用接続が切れました。接続し直してください。」で一度終了した。これは未解決として残す。既定monitorへの明示再接続で通常ready、実画像9→26frame、errors=[]、操作許可enabled=true、マウス移動が成功し、操作を解放した。さらにbrowserを閉じて新しく開いた接続もready/errors=[]。間にserver handoffや入力解放故障flagの解除はしていない。今回、以前の恒久的な再接続拒否は再現しなかったが、反復/長時間の安定性と自動再接続の完全動作を保証したとは扱わない。

画像laneのcloseとcontrol側transition通知の到着順は原因候補。実機でその順序を観測しておらず、この段階では仕様変更や修正をしていない。確認用の個人画面の一時画像は削除した。
