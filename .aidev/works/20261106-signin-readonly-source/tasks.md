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
