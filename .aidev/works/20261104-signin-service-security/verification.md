# サービス権限のnative APIと初回登録の限定完了

## 実機事象

PIN helperの更新は成功し、実ロック解除からの自動復帰・操作を2回確認した。専用signinサービスはコード公開・SCM登録まで進んだが、PowerShellが無出力で終了。Application Errorに13:13:51Zのpowershell.exe/0xc0000409を確認。sc queryはSTOPPED/exit1077、registry Start=4/Type=16。サービスは起動していない。Get-Serviceの抑止されたエラーだけを不存在の証拠とはせず、registryとsc queryで存在を確認した。

## native修正

SetSecurityInfoのObjectTypeへ5を渡していた。Win32 [SE_OBJECT_TYPE](https://learn.microsoft.com/en-us/windows/win32/api/accctrl/ne-accctrl-se_object_type)のSE_SERVICEは2で、5はSE_LMSHARE。[SetSecurityInfo](https://learn.microsoft.com/en-us/windows/win32/api/aclapi/nf-aclapi-setsecurityinfo)の情報mask（owner/DACL=5）とは別の引数。named constantでサービス種別を明示し、同じhandleのowner/DACLをQueryServiceObjectSecurityで読み戻して厳格ポリシーを検査する。旧値とnativeクラッシュの因果は実setterの修正後確認まで確定とは扱わず、危険な旧native呼出しを実機で再実行しない。

## 初回マーカーのある配置の完了

既存のmarker-free InitialRecoveryの拒否条件は緩めず、recover-signin-install.ps1のinspect/completeを追加。固定owner/manifest/配布物、canonical7項目markerとhash、privateな全state ancestor、exact inventory、空admin/runtime、initialだけのjournal、同じpackage/barrierの排他を保持。SCMの構成・停止/無効を検査し、初期Default ACLだけprivileged owner/BA full/SY存在と非privileged query/user-control 0x2018dを許容する。start/change-config/owner/DACL変更の権限は拒否する。通常runtimeのAclは変更しない。

completeは外部marker hashを照合して、厳格ACL設定と同一handle読み戻し→厳格構成/停止/証拠再検査→marker除去→manual変更だけを行う。start/stop/deleteのservice権限を要求せず、鍵/trust/journalを生成・削除・初期化しない。marker除去後・manual前の中断は既存InitialRecoveryへつなぐ。失敗時に既存配置や無効状態を自動修復・削除しない。

## Windows検査

- installer/native setterの正例・6負例・byte復元後正例が成功。fake setterでobject type/handle/descriptor/情報maskを観測し、readback失敗も拒否（windows-native-security-checks.json）。実SCMへの旧API誤呼出しは行わない。
- 新completionの正例・5負例・byte復元後正例が成功（windows-recovery-checks.json）。11種の危険証拠、ACL後の3種の変化、inspect非変更、replay拒否、既存marker-free復旧への引継ぎを生成user temp/SCM mockで検査。
- 最初の実行は60秒の実行上限で途中終了。元sourceではなく一時コピー内だけを変異しており、実SCM/stateは触っていない。ログをwindows-recovery-timeout.jsonに保持し、300秒の期限で全体が完走した。
- service-policy/host/controller/initial-recovery/upgrade/maintenance-recoveryの既存6検査もWindows上で成功（windows-existing-checks.json）。
- recover-signin-install.ps1 -ValidateOnlyが成功。コンパイルのみで配置/SCMは変更していない。
- review_resource_monitorが設計、source/test、marker前後の失敗境界、初期ACLの限定、同一handle読み戻しを独立点検し必須指摘なし。

実配置のinspect/completeとSYSTEM起動・鍵/trust・別machine登録・実サインアウトは、まだ確認していない。
