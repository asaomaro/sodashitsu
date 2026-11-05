# sr-pcの再起動前の自動起動準備

利用者は再起動の試行と、再起動後の操舵室自動起動を明示依頼した。UAC操作も以前から許可済み。まだOSを再起動していない。

- [x] RunOnceのみでは対話ログオン前に接続できないことを確認。
- [x] S4U + RunLevel LUAの実行を検証。設定と異なりAdmin=trueだったため通常起動へ採用せず、手動probe taskを撤去。
- [x] System32 runas /trustlevel:0x20000 + ProgramFilesの保護した固定guardを検証。Admin=falseだがIL=Highが残る状態を拒否。
- [x] 固定guardでprimary tokenのILをMediumへ下げ、新規handleで再検査。PSとNodeの実トークンでAdmin=false、IL=8192、UIAccess=false、特権SeChangeNotifyPrivilegeのみを確認。TokenElevation=1は記録し、意味を推測で確定しない。
- [x] Session0の制限済みNodeからlocal RPCとリモートHTTPSが成功。
- [x] 隔離した操舵室のサーバー自体を同じ条件で起動し、Aへ認証済み委譲WSが接続することを確認。
- [x] 起動時taskを登録し、終了/孤児/重複を確認。
- [ ] ログオン時の既存stateとの共存と恒久Run自動起動を確認。
- [x] 復帰経路の独立レビューと、実OS再起動・接続復帰。

通常サーバーをSYSTEM化しない。OSパスワード/PINを保存しない。未知のsignin service markerをresetしない。Session0のRPC接続と対話Session1の画面操作を同等扱いしない。


終了時点: 候補は準備したが、管理者画面への接続とロック解除が不安定になり新しいboot taskの登録は未完了。認証済みの隔離サーバー復帰・終了/重複検証を通していないため、OS再起動は実施しなかった。既存RunOnceはログイン後の復帰に限る。


追記: 利用者の明示的な再起動指示を受けて、2026-11-05 11:35 UTC頃にsr-pcの再起動要求を実行（Windows終了コード0）。接続断後150秒の監視では復帰せず、実OS起動完了とログイン後の自動復帰は未確認。上の「再起動未実施」は当初の検証終了時点の記録。

2026-11-06: 上の未実施記述は当時の履歴。現状は追加検証記録を参照。boot保守RPCは実再起動で復帰し、専用signinの検証用trustが停止したため手元ログインを依頼中。
