# Windows ACL descriptorの生成確認

Base main964a58b15f3399b7d910ad51b227fd140b93ae1d。signinの秘密保存を検討中に、既存policyがOwner/Rulesだけではnull DACLと空DACLを区別しないことに気付いた。ただし実callerはGet-Acl/GetAccessRulesを使い、.NETがnull DACLをEveryone FullAccessへ変換する可能性がある。抽象Rules=[]だけで既存の安全性の不具合と断定しない。

独立した一次資料点検では、現callerは既に拒否する見込みで製品修正不要との結果。生成したabsent/null/empty/private DACLをFileSecurity/DirectorySecurityへ通し、storage/ancestorの両方で確認するテストを追加した。実ファイルのACLや実OS権限は読まず、変更もしない。Windows CIの結果は完了後に記録する。

Windows仕様ではnull DACLは全アクセスを許し、空DACLはアクセスを許さない。両者を同じものとして扱わない。[Microsoft仕様](https://learn.microsoft.com/en-us/windows/win32/secauthz/null-dacls-and-empty-dacls)

.NETの正規化とルール列挙は[SecurityDescriptor reference source](https://github.com/microsoft/referencesource/blob/main/mscorlib/system/security/accesscontrol/securitydescriptor.cs)、[CommonObjectSecurity](https://github.com/microsoft/referencesource/blob/main/mscorlib/system/security/accesscontrol/commonobjectsecurity.cs)で確認した。生成テストが既存policyで通れば、今回はtest-onlyの追加として扱い、未確認の脆弱性修正を主張しない。

この結果からDPAPI LocalMachineの秘密をEveryone Read可で保存してよいとは判断しない。既存のCurrentUser鍵保護と、今後のSYSTEM専用enrollmentのconfidential ACLは別の条件として検討する。
