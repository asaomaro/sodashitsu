# 独立点検

/root/review_resource_monitor による別コンテキストでの点検を実施。

- 通常ユーザーの親PSの情報だけでserver非adminと記録する問題を修正。直接spawnと実server PIDのtoken/session検査を追加。
- Task principalは文字列比較からSIDへ正規化。
- 隔離検証を新規→既存再利用→認証停止とPID/port終了まで拡張。
- script/statusのCreateNew時にOwner BAとprotected DACLを明示。scriptはowner FRFX、statusはFR。
- NormalCase復旧は固定inventory/runtime/run・empty admin・enrollment/history不変、新SCM必須。inspect-boundは同SCMの読取だけで、recoverの新SCM条件は変更しない。
- 最終taskへの引継ぎは保存済みticketを保持。旧never-run taskの定義/ACLを照合し、新task disabled→旧task disabled→新task enabledの順序。
- verifiedEndpointの前後2load、key/peer/marker/required/revision/fingerprint/取消/5秒期限は保持。既存の汎用endpoint APIは変更なし。
- readonly SYSTEM probeは公開metadataだけを出力し、Job回収とruntime不変を確認。内部の鍵ペア署名検証と、任意データへの署名出力を区別。
- 上記修正後、追加mustなし。実機signin接続の成功とは別扱い。

S4U metadata probeについては、所有者の暗黙WRITE_DACとタスクの編集可能性を指摘。作成時OW ACEとUpdate/SD変更の負確認を追加し、readonly exit codeのみとした。SchedulerがPフラグを読み戻さないためtaskについてP必須条件を外し、厳密な4 ACEを維持。登録・実行結果はまだない。

Microsoft公式: [Task security contexts](https://learn.microsoft.com/en-us/windows/win32/taskschd/security-contexts-for-running-tasks)、[Owner Rights SID](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/understand-security-identifiers)。
