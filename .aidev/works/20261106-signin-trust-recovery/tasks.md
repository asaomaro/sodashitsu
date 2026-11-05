# 信頼登録の途中終了

- [x] ログイン後の通常接続(Session1)と恒久Runのready記録を確認。
- [x] 保存済みrequest/result/journal/SCMを読取り、trust-ownedはclaim済み・resultなし・observed・Stopped1066/1と確認。再送・ackなし。
- [ ] SYSTEMの読取り専用status/権限確認/復号の時間測定。
- [ ] 原因に対応した修正・回帰の旧コード否定・必要なテスト・独立レビュー。
- [ ] 元要求を不明のまま保持し、鍵を再生成せず明示復旧。
- [ ] 残りの登録・通常起動・画面取得/PIN操作・自動起動を検証。
- [ ] mainへの反映と検証用task/窓の整理。

## 調査で確認したこと

- SYSTEM読取専用statusを3回実施。2.034/2.038/2.006秒。ACL/DPAPI helperは303–381ms。Job内の子プロセス終了とJob-zero、runtime bytes不変を確認。
- required=true、provider同一、User browser/Owned signin verificationの2viewerが既に保存済み。元trustを再送しない。
- 実packageのnative result codecで2peer成功結果が受理されることを確認。2peer schemaが原因ではない。
- 終了記録欠落の当時の直接原因は未確定。一般的な5秒helper制限の一律延長は実施しない。
- 固定owner/package/whole-slot(file ID+hash)/runtime/run/claimの今回だけの復旧操作を作成。製品の汎用復旧条件は変更しない。
- Windows ordinary-file fixtureで製品trust codec、期限、history変更、余分なfile、同じSCM、ticket変更、成功・5段階中断・再実行拒否、runtime/元要求/history保全を確認。

## 再起動後

- Windowsのマイク転送許可を検証前のtrueへ復元した。
- SYSTEM Session0のboot taskで固定snapshot recovery/status(2viewer)/enroll/normal-startまでcompleted。public receiptを保存。
- prelogin bridgeの接続復帰を確認。通常のuser serverはサインイン前なので未起動。
- 独自検証profileからの暗号化接続は失敗し、サインイン用aliasはconnectingのまま。これを未完了として扱う。
- 読取に2秒を要する場合、順次readと読取完了後からのpollでは5秒のfreshnessを超える不具合を生成テストで確認。並列readと前回開始からの次checkに変更し、5秒期限/失効後復活禁止/readonly/native所有権を維持した。
- 旧ソースでは新規3caseが失敗。元ソースを完全復元し、修正後の関連5file/103testが成功。
- 現物の失敗原因がこの周期だけかは修正版導入後に検証する。Windowsへの管理者操作経路がpreloginで未成立のため、ログインを依頼した。
- 全体build/typecheck、専用signin bundle buildも成功。修正bundle SHA256: e3ba6a995b01e30add5a2c915eda2b43cb79a1f45f7f466e5ddf55a7d6c1de1b。
- prelogin保守接続経由のbundle stagingはexec.read timeoutで中断した。未検証の部分ファイルは実行・package化していない。転送完了・導入済みとは扱わない。
