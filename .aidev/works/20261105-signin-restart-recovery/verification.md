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

## 追加の準備と確認

- 2026-11-05追加: 再起動後に利用者が手動ログインすると通常ユーザーのSodaサーバーを一度だけ再開するHKCU RunOnce `SodashitsuResumeSigninRecovery20261105` を登録。自動ログイン・PIN保存・SYSTEM化は行わない。既存の登録値がないことと実行ユーザーのowner一致を確認してから専用値のみ作成し、読み戻しを照合した。
- 実体はprofile内stageの `resume-user-server-20261105.mjs`（SHA256 3f5a57c34a28e37e582181000ee2cf07c6e84a37ea2254a77dfb3592d56eb30c）。Bのmain.js SHA 76128f1e509c213c59ca48c552acb8f00ea0482d2036edf346227826c90971fd と固定Node pathを照合し、既存製品のfindOrStartを再利用する。現在の起動条件（HTTP / 127.0.0.1:7780 / 通常state-dir）を維持し、lock/serve/local-auth PID、local-login、WS-readyを45秒・起動試行1回で検査する。結果は排他的にready/manual-start-requiredのみ保存し、秘密やcookieをログへ出さない。
- 独立レビューで独自PID部分一致と起動直後の成功扱いを指摘されたため、その案を撤回して製品の検出・起動確認へ統合。修正版の再レビューは追加必須指摘なし。新規起動を拒否する`--check`を実稼働中に通し、サーバーを増やさずreadyを確認した。RunOnceの実行と実OS再起動はまだ行っていない。再起動後の最初の手動ログインが可能か、利用者の回答待ち。

- main 36577744をsr-pcへpull。`context-connect-admin.ps1`（profile内stage、SHA a3fd9228238e25572ce9e9f48a74eebe6645d7ec0fc6e33a05840255b572ea7e）は復旧→新配布物へ更新→initialize/trust/enrollの束縛済み要求・結果照合/ack→通常起動までを準備した。34ソースをcanonical LF SHAで照合してBA/SY限定のProgramFiles配下へコピーし、秘密値はstdin/メモリーでだけ扱う。独立読み取りレビューで必須指摘なし。まだ実行していない。再起動前にこの手順を実行しない。
- 通常ユーザーのlocalhost RPCで既存permissionsを保持してallowMicrophoneを有効化し、実CABLE Inputのrender endpoint IDを明示。変更前permissionsはsr-pcの専用stageに排他的に保存した。物理speakerの既定値は変更しない。
- raw WebSocketを使う生成音の試行ではsr-pcが自動ロックしており、readyのsecureDesktop=true/lockScreenCover=trueとなった。現行仕様どおりマイク機能は交渉されず、音は送信していない。仮想CABLE Outputだけを明示した30秒のメタデータprobeはパケットを受信できたが、440Hz到達の成功証拠はない。音声データ・個人画面は保存していない。probe/共有は終了済み。
- 全体テストの設定画面失敗について、修正前590419efの該当1テストだけの実行は成功（残り146skip）。全ファイル実行のworker SIGABRT/順序依存は未解決として残す。今回の修正の関連66件・ビルド・型検査の成功とは区別する。
- 再起動後に最初のWindowsログインと操舵室起動を手元で行えるか、利用者への確認が未回答。UACの再承認を求めているのではなく、現行接続がログイン後起動に依存するための手元操作の確認。再起動はまだ行わず、元のmarker/journalを保持している。


## 2026-11-05 ロック解除後の仮想マイク再検証

通常のリモート閲覧経路でsr-pcのWindowsを解除できた。物理マイクは使用せず、440Hzの生成PCMを既存の明示的なVB-CABLE render endpointへ送り、対応するvirtual capture endpointだけを30秒計測した。PCMは保存しない。
ロック中の試行はmicrophoneを交渉できず、captureのpeakRmsは0.522程度（無信号）だった。
解除後はmicrophone=true / microphone_ready / runningまで進み、captureはpeakRms=5751.5123となり生成信号が実際に届いた。ただし6秒の転送途中でunavailableとなり中断したため、連続転送は未合格。再起動要求があるドライバーの検証と継続性の調査を残す。

```text
{"virtualCaptureOnly":true,"packets":2999,"samples":1439520,"peakRms":5751.5123065590324,"hzAtPeak":500,"pcmSaved":false}
Error: Virtual sink unavailable
```

周波数は短い窓の粗いゼロ交差推定で500Hz。入力の生成周波数440Hzとの厳密なスペクトル照合や連続転送の合格値として扱わない。
再起動後にユーザーの初回Windowsサインインが可能か確認中。応答なしを可能と解釈して再起動しない。
