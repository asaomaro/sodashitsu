# 検証

- Windows native Node24 + fixed WinPS5: 実entry ValidateOnly 9cases、未選択sourceを物理退避、mic単独assemblyにAudio engineなし、invalid envも非選択。さらに既存audio/mic fakePCM/private pipe生成試験pass。実desktop/device/SCM/driver操作なし。/tmp/soda-lazy-desktop-native-roles-with-pipes.log。
- Node5files/97tests pass（許可plan・Provider・WSL audio・SharedCapture・設定）。/tmp/soda-lazy-desktop-focused-final.log。
- server build/typecheck pass（最新main統合前）。
- 独立risky taskcheck review_pointer: mustなし。macOS fixture literalをmacos-sckに修正、CIへ依存validator/Checks等のpaths追加。最終wholeは後続。

## 負例

同じprivate source copyでaudioの条件だけを外し、常にGet-Contentするよう変更すると、最初の画像のみ・未選択source不在ケースが失敗した。実装を元へ復元しbyte一致を確認。製品worktreeを変更していない。負例生ログ /tmp/soda-helper-role-negative.log、正例全9case+pipeログは上記。

```text
+ ... dioSource = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'Window ...
+                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + FullyQualifiedErrorId : PathNotFound,Microsoft.PowerShell.Commands.GetContentCommand
```

main4d33e4f7反映後の全体build/typecheck pass。全体920files/13,248tests pass（Windows専用1file/1test skip、exit0、/tmp/soda-lazy-desktop-all.log）。配布helper16C#資源・compiled RolePlan/Provider一致（/tmp/soda-lazy-desktop-package-verify.json）。独立19paths whole review_pointer: must/shouldなし。

関連browser remote-desktop-native-sharing.spec.tsはbranch/mainそれぞれ1回実行し、両backendとも共有開始前のmachine online表示で45秒timeoutが同一再現。RolePlan/helperを起動する前の箇所で、コード変更による退行ではないとして記録し、反復しない。main比較はPR346 tested head d26b4c82（main4d33e4f7とtree一致）。/tmp/soda-lazy-desktop-e2e.log、/tmp/soda-lazy-desktop-e2e-main-baseline.log。trace/error-contextは各WTのpackages/e2e/test-results/に残る。CI fresh browserでの同経路は後続。

```text
Test timeout of 45000ms exceeded.
Locator:  locator('[data-machine-id="f4b39c8f654b014857b7155d98ef0b9e"]').locator('[data-state="online"]')
```

同一のassert位置 src/specs/remote-desktop-native-sharing.spec.ts:23:160で失敗を確認。最終head CI/mainは未完了。


smokeもAPIのlogin/client.hello/workspace/pane/echo/custom-command往復はpassし、browserの初期xterm表示だけ15秒timeout。mainの同一treeで1回比較し同じ失敗、private load hookでpageerror/HTTP statusだけ観察したところ初期session/WebSocket認証が成立していない。今回のhelper起動前の基線問題として記録し、このsliceで認証の変更やdeadline延長はしない。/tmp/soda-lazy-desktop-smoke.log、/tmp/soda-main-smoke-diagnostic.log。実サービス/端末の稼働は変更していない。

```text
smoke: echo round trip ok
smoke: custom command popup round trip ok
smoke: FAIL page.waitForSelector: Timeout 15000ms exceeded.
```


最初のhosted Win node-policyで、既存checkpoint replayテストのstart.resultがなく参照時に失敗した（/tmp/soda-lazy-desktop-win-policy-failed.log）。従来tmpdirのfixtureを、Windowsだけ既存native transfer生成検証と同じLOCALAPPDATAの新規mkdtempへ合わせた。未設定は明示fail、製品ACLとRuntimeの5秒child期限は変えない。複数の実WinPS/DPAPI/storage操作を行うこの1テストだけ120秒の試験budget（Unixは従来5秒）とし、checkpoint参照前にstart.ok:trueも検査する。Linux対象32tests pass。fresh Windows結果を待ち、Temp ACLが原因確定とはまだ主張しない。workflowへ実テスト対象pathsも追加した。

```text
FAIL src/desktop/DesktopSettings.test.ts > rejects replayed completed checkpoints after OFF then ON and server replacement
TypeError: Cannot read properties of undefined (reading 'checkpoint')
```


追跡用の別branch（mainへmergeしない）で実Windowsの同テストだけを実行し、保存先確認のmetadata childで初期化失敗することを特定。check-endpoint-acl.ps1のGet-AclをCLR DirectoryInfo/FileInfo.GetAccessControl()へ置換すると、同じowner/rules判定・child5秒のままで完全なreplay試験が成功した（run41174467746、ログ /tmp/soda-win-transfer-clr-ci-success.log）。初期のfixture配置だけでは解消しなかったため、それを原因確定とはしていない。診断のログ出力や仮workflowは製品branchへ取り込まない。

製品生成validatorにも、任意Get-Aclコマンドを拒否したprivate childで実際のACL確認が成功する検査を追加した。旧Get-Acl呼出だけへ戻した隔離copyは意図して失敗、現実装は9case+pipe+ACL全pass。/tmp/soda-lazy-desktop-native-roles-clr-acl.log、/tmp/soda-lazy-desktop-clr-acl-negative.log。全体JS/TSの製品sourceは変更せず、Linux対象32件もpass。

```text
Endpoint storage permissions are unsafe
```

上は旧Get-Aclを拒否する生成負例の生stderr抜粋。fresh CIの関連browser/generated-sharingは既に成功しており、local基線の初期認証待ちと区別する。最終headの全CI結果はPR347で確認する。

最終head d8325c39d83e4bf5936b36f96577537c4e636ac7の19checks pass後PR347をmerge（main 1d4797aa73b5707f14d2f9a4f9d525917ce82a2e、tree一致）。Win node-policy/replayとfresh関連browserもpass。実desktop/audio検証・稼働handoffは別。receipt /tmp/soda-lazy-desktop-final-receipt.json。
