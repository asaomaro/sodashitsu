# 限定された異常終了からの再起動復旧（2026-11-05）

対象は、固定owner/配布物のadmin initializeがHostで観測済みだがadmin.pendingは未claimで期限切れ、runtimeが空、停止記録がない状態。以前の未受理取消1件と完了した更新1件の履歴だけを許す。一般の異常終了・稼働中・既存鍵/登録状態をresetしない。

## 実装

`recover-signin-restart.ps1 -Action bind|recover`。Bindは管理者、package/mutex/SCM構成、停止1066/specific1、排他barrier、原本DPAPI・生バイトSHAと全slotの閉じたinventoryを検証。固定System32 services.exeをnative handleで生存・SYSTEM/session0・criticalとして保持し、PID/creationと全inventory digestをprivate install.transitionに固定する。

Recoverは確認済みticket SHA、変化したcritical SCM instance、同じ原本/配置/barrier/inventoryを要求する。元runs/adminを非置換で退避し、identity/hashを再照合して新generationと永久の異常復旧receiptを作る。最後にだけmarkerを取り除く。旧Host/Nodeのclean exit0やJob-zeroを作ったことにはしない。失敗時のmarker/原本は保持し、再実行で自動修復しない。

Microsoftの[critical system services](https://learn.microsoft.com/en-us/windows/win32/rstmgr/critical-system-services)の説明と[IsProcessCritical](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-isprocesscritical)を根拠に、実体が変わったことを再起動境界の証拠として使う。kernel boot GUIDとは呼ばない。critical属性の変更、SCM終了、再起動そのものはこの処理から行わない。

## Windowsでの検証

- 公開ValidateOnlyのcompile: 成功、実service/state/reboot操作なし。
- 隔離した通常ユーザーfixtureで実Coreを通し、Bind、同instance/違うticketの拒否、Recover、新generation、再実行拒否を確認。
- runs退避後/admin退避後/新directory後/initial後/receipt後の5中断でmarkerと今回の原本バイト保持を確認。旧履歴が同じadminバイトを持っていても検査をすり抜けないよう、検索先を今回の現行/退避先だけに限定した。
- root許可集合/同instance拒否/旧履歴digestを外す3負例が各意図したassertionで失敗し、同じsource bytesへ復元後成功。raw outputはwindows-source-negatives.json。最終保持検査の強化後の全fixture成功はwindows-transactions.json。
- /root/review_resource_monitorによる独立レビュー。未知root鍵、取引検査不足、旧履歴による保持検査のマスクの指摘を修正し、それぞれ再レビュー済み。最終必須指摘なし。

raw logの個人profile名だけを <owner-profile> に置換した。PIN・秘密鍵・招待token・個人画面は記録しない。

## 実機（ここまで）

- 旧ec399配布物/観測済み原本のBind成功。ticket SHA d711f324484736cc42cd51e6dff1e88847d744b54b64dc8662d8b70a4e1ce688、critical SCM instance 1332:134378968957578307。サービスを起動/再起動していない。
- 同instanceでの実Recover拒否成功、marker保持/サービス変更なし。
- TypeScript保存先修正6da256c3をmain pushしsr-pcへpull。新bundle/package fc0b5cb3a3960c058308b9102ff118641651a6e2e3e5459293a6b16dc226e5a0を所有者profileの隔離stageへ生成。まだ実配置を更新していない。
- 公式署名ValidのVB-CABLE x64 installer（734c35dfa6d98f48782a451633ceb471166ec70d60482fd89a1123d0ee3c4f41）をUAC確認後に実行。Install Driver成功表示、installer exit0、OS再起動を要求。
- 導入前の既定audio endpoint全6roleをメタデータだけで記録。installerがrender既定を変更したのでWindowsサウンド画面から元のRealtekへ復元。全6roleが元と一致、audio-defaults-restored.json。録音・既存音声の保存なし。
- 再起動後の実Recover/更新/initialize/trust/enroll/専用接続、および実マイク転送は未完了。再起動直後の現行remote接続はWindowsログイン後の操舵室起動に依存する。自動ログインは未設定。利用者へ初回ログインの手元操作が可能か確認中であり、まだ再起動していない。
