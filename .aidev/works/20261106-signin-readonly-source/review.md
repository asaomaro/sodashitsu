# 独立レビュー

review_resource_monitorの別コンテキストで、Source/Runtime/readers/RequiredPathsの全差分、
monotonic期限補強、raw pipe切替、private SYSTEM fixtureとsetupを点検。最終必須指摘なし。
固定path・毎回のfresh検査・write拒否・私有pipe・上限・終了確認を維持。
120秒timerの指摘は既存Presenceが先にepochを終える関係を再確認して撤回された。
その既存2分境界自体の改善は本変更の範囲外として未完了に残している。

旧Runtime差替negativeの生ログと、旧Console.Out native failure、新rawpipe成功の
evidenceを保存。旧Runtimeはbyteexact復元。実機での本番サービス導入は未実施。

統合版も別contextで全差分再レビュー、mustなし。既存oneoff/固定共有分岐のguardを確認。
package path集合は変更せず、旧manifestからのstrict Upgradeを維持する構成にした。
統合版native最終fixtureは20秒継続＋3拒否ケース成功、runtime不変/Jobzero/task削除。


## 2026-11-07 cross-session native Job修正

独立review_resource_monitorで製品5files、fixture、各setupの固定hash/ACL/task/cleanupを点検。追加mustなし。
当初の全Job外条件は実機outer Jobに適合しないため、実Root handleでのHost非所属へ変更。
RootをbrokerへOpenさせる案はself-held handleによるkill-on-close妨害があるため採用しない。
最終native fixtureはRoot handleを持つGateだけがmembershipを照合し、明示親とworker双方のRoot非所属を確認。
positive task0、negativeは親属性のみ旧状態でCreateProcessAsUserWエラー5、source byteExact復元。
詳細と生出力はevidence/session-jobs-*。実サービス導入成功はまだ主張しない。


## Specific107 incidentと一回Boot workflow

review_resource_monitorがcase・生成tests・固定operator SDK/pins/ACL/once tasksを確認し必須指摘なし。
実caseはreadonly inspectの成功後にrecover一回だけを実行。結果unknown/cleanExitClaimed=false。
標準Upgradeの失敗条件を調べ、107を一般許可する変更は採用しなかった。
新critical SCMを保持するBoot Guard/標準toolsへの固定導線/鍵hash/once claim/BootTask ACLも独立点検済み。
実bootと実サービスの健全性は引き続き未検証。
