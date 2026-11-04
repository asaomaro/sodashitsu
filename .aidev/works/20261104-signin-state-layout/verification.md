# 専用サインインstateの固定private配置

## 実機で確認した失敗

利用者のUAC承認後、専用サービスの初回導入が失敗した。SCM/配置先/旧stateを上書きする再試行は行わず確認したところ、owner accountは有効、C:\・Program Files・SodashitsuのCodeAclは合格し、標準ProgramDataだけが不合格だった。SYSTEM所有のProgramDataにはUsersのread権限とContainerInherit 0x116（作成/属性/EA変更）があり、現在の祖先ポリシーが拒否する。旧owner slot/コード配置は存在しなかった。

## 設計と変更

祖先ACLの基準を緩和せず、stateを `%ProgramFiles%\Sodashitsu\DesktopSigninData\<owner hash>` へ分離する。コードは引き続き別のDesktopSignin-<hash>。Vault.StateRoot/StateDirectoryを導入・Host・journal・quiescence・管理PSへ一元化し、新root以下はSYSTEM/Administrators-onlyを要求する。CodeAcl自体と既存WindowsフォルダーのACLは変更しない。

旧ProgramData owner slotが存在する場合や存在確認で2/3以外のWin32エラーになった場合、導入・更新・復旧・stateアクセスは拒否。旧stateの自動コピー/削除/別の鍵の作成はしない。既存の不完全な新slot/コードも従来どおり自動採用しない。

review_resource_monitorが設計・実装・private rootの検証箇所を独立点検し必須指摘なし。metadata書込権限を緩める案は採用しなかった。

## Windows検査と配布物

- validate-signin-state-layout: readonlyの実祖先handleと生成ACL、旧slot拒否を検査。3負例が狙ったassertionで失敗し、byte復元と復元後正例が成功（windows-layout-checks.json）。
- vault/quiescence/host/controller/initial-recovery/upgrade/maintenance-recoveryの7検査が成功。最初のaggregateは旧fixtureのinstaller失敗を含むためexitCode=1を保持（windows-existing-final.json）。
- installer検査は旧9caee3adでも同じpartial assertionで2回失敗。生成した .signin/hash/UUID 配下の長いパスがローカライズされたuser tempと重なり、FileStreamでDirectoryNotFoundが出てSCM mock以前に止まっていた。fixtureのroot/子名を短縮し、ordinary temp用createFileも全ケースで明示した。製品factoryは変更しない。
- 修正後のinstaller検査と既存4負例、復元後正例が成功（windows-installer-final.json）。baseline生出力はwindows-installer-baseline.json。追加のtest差分も独立点検済み。
- 新Native hostの実コンパイルと配布物ValidateOnly成功。manifest SHA256=2fee9af791dde7547e4f554f5a355f530f75294eb878d53641064ca56f9f6d67、revision=28e1a39a-466a-43b2-8f0f-ae6107c00421。stageはsignin-layout-package-20261104。実導入・鍵/trust・接続はまだ確認していない。

rawログは個人profile名のパス部分だけ匿名化。PIN・画面・既存clipboard・登録tokenは保存していない。
