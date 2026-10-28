# Windows ACL descriptorの生成確認

Base main964a58b15f3399b7d910ad51b227fd140b93ae1d。signinの秘密保存を検討中に、既存policyがOwner/Rulesだけではnull DACLと空DACLを区別しないことに気付いた。ただし実callerはGet-Acl/GetAccessRulesを使い、.NETがnull DACLをEveryone FullAccessへ変換する可能性がある。抽象Rules=[]だけで既存の安全性の不具合と断定しない。

独立した一次資料点検では、現callerは既に拒否する見込みで製品修正不要との結果。生成したabsent/null/empty/private DACLをFileSecurity/DirectorySecurityへ通し、storage/ancestorの両方で確認するテストを追加した。実ファイルのACLや実OS権限は読まず、変更もしない。Windows CIの結果は下記のとおり。

Windows仕様ではnull DACLは全アクセスを許し、空DACLはアクセスを許さない。両者を同じものとして扱わない。[Microsoft仕様](https://learn.microsoft.com/en-us/windows/win32/secauthz/null-dacls-and-empty-dacls)

.NETの正規化とルール列挙は[SecurityDescriptor reference source](https://github.com/microsoft/referencesource/blob/main/mscorlib/system/security/accesscontrol/securitydescriptor.cs)、[CommonObjectSecurity](https://github.com/microsoft/referencesource/blob/main/mscorlib/system/security/accesscontrol/commonobjectsecurity.cs)で確認した。生成テストが既存policyで通れば、今回はtest-onlyの追加として扱い、未確認の脆弱性修正を主張しない。

この結果からDPAPI LocalMachineの秘密をEveryone Read可で保存してよいとは判断しない。既存のCurrentUser鍵保護と、今後のSYSTEM専用enrollmentのconfidential ACLは別の条件として検討する。

## 結果

code666a9c3e8dfd100c5bf5a6e854923e7283c5086b。Protected CI40607130735/job122549306913 PASS2026-10-28T00:11:45Z、Node identity40607130652/job122549306436 PASS00:13:01Z。8descriptor各2用途の全16判定が期待どおり。null/absentはraw binary上DACLがnullでもGetAccessRulesには1件のルールが現れ、既存policyが拒否した。emptyは0ルールで安全なdeny-allのdescriptorとして扱う。脆弱性は確認されず製品policyを修正しない。

独立crossにmust/shouldなし。test-only差分のため、新しいJS全体テストや起動smokeを重複実行せず、base PR263の結果を新検証として数えない。実ファイルACL/OS権限の照会・変更は実行していない。

```text
boundaries	Generated ACL descriptor facts (no filesystem ACL writes)	﻿2026-10-28T00:11:25.8224572Z ##[group]Run scripts/remote-desktop/validate-endpoint-acl-facts.ps1
boundaries	Generated ACL descriptor facts (no filesystem ACL writes)	2026-10-28T00:11:25.8225437Z [36;1mscripts/remote-desktop/validate-endpoint-acl-facts.ps1[0m
boundaries	Generated ACL descriptor facts (no filesystem ACL writes)	2026-10-28T00:11:25.9334848Z shell: C:\Windows\System32\WindowsPowerShell\v1.0\powershell.EXE -command ". '{0}'"
boundaries	Generated ACL descriptor facts (no filesystem ACL writes)	2026-10-28T00:11:25.9336537Z ##[endgroup]
boundaries	Generated ACL descriptor facts (no filesystem ACL writes)	2026-10-28T00:11:29.5073319Z {"daclPresent":false,"name":"absent-dacl","parent":false,"ruleCount":1,"storage":false,"kind":"file","daclNull":true}
boundaries	Generated ACL descriptor facts (no filesystem ACL writes)	2026-10-28T00:11:29.5208361Z {"daclPresent":false,"name":"null-dacl","parent":false,"ruleCount":1,"storage":false,"kind":"file","daclNull":true}
boundaries	Generated ACL descriptor facts (no filesystem ACL writes)	2026-10-28T00:11:29.5291506Z {"daclPresent":true,"name":"empty-dacl","parent":true,"ruleCount":0,"storage":true,"kind":"file","daclNull":false}
boundaries	Generated ACL descriptor facts (no filesystem ACL writes)	2026-10-28T00:11:29.5392370Z {"daclPresent":true,"name":"private-dacl","parent":true,"ruleCount":1,"storage":true,"kind":"file","daclNull":false}
boundaries	Generated ACL descriptor facts (no filesystem ACL writes)	2026-10-28T00:11:29.5477219Z {"daclPresent":false,"name":"absent-dacl","parent":false,"ruleCount":1,"storage":false,"kind":"directory","daclNull":true}
boundaries	Generated ACL descriptor facts (no filesystem ACL writes)	2026-10-28T00:11:29.5489444Z {"daclPresent":false,"name":"null-dacl","parent":false,"ruleCount":1,"storage":false,"kind":"directory","daclNull":true}
boundaries	Generated ACL descriptor facts (no filesystem ACL writes)	2026-10-28T00:11:29.5500474Z {"daclPresent":true,"name":"empty-dacl","parent":true,"ruleCount":0,"storage":true,"kind":"directory","daclNull":false}
boundaries	Generated ACL descriptor facts (no filesystem ACL writes)	2026-10-28T00:11:29.5515419Z {"daclPresent":true,"name":"private-dacl","parent":true,"ruleCount":1,"storage":true,"kind":"directory","daclNull":false}
boundaries	Generated ACL descriptor facts (no filesystem ACL writes)	2026-10-28T00:11:29.5518735Z endpoint_acl_descriptor_generated_checks_passed
```
