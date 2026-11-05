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
