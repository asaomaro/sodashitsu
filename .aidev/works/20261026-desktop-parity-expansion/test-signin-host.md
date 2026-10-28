# 7B2f 検証記録

Base main5b04dd0584e6ee6d64518d1084a21922d9e75dbb、PR #269。serviceは生成してcompileするだけで登録/実行しない。実SYSTEM/実鍵/実画面/入力を使わない。

## 進行中

- native/service taskcheckと全体cross、Add-Type分離/C#修正/継承sentinel追加差分点検は確定must/shouldなし。Windows実行結果はまだ未承認。
- 初回Windows compileでServiceBaseの継承Runが優先解決されるエラー。SodaDesktopSigninHost.Run(stop)と明示修飾。次にshort-circuitのout accounting未代入がcompile errorとなり明示初期化。両者はcompile失敗で、正常検証やsource負例の成功とは計上しない。
- 生成childがreadyになった後の孫Job条件で失敗。実factsは`generated_job_active=4 descendant_marker=True child_running=True`で、exact2というtest前提が不適切だった。具体的な生成孫PIDへのIsProcessInJobで対象Jobへの所属を確認し、Active>=2/停止後0と分けた。正常成功するまではJob回収のWindows実証済みとはしない。
- fresh check worktree53a2add9: frozen install/build/smoke PASS、clean。workspace TS/runtime/既存helperはbaseから無変更。このphaseの全体suiteの新規PASSは主張しない。後続C#修正・test差分はWindows CIと独立差分点検で確かめる。
- ログはsource/checkのnode_modules/.cache/signin-host/へ保存。実service導入/起動、Node main/worker/controller/UIは後続。

## 初回エラーの生ログ抜粋

```text
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:28:39.9664260Z Add-Type : c:\Users\runneradmin\AppData\Local\Temp\jfuinjcf\jfuinjcf.0.cs(375) : The best overloaded method match for 
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:34:48.1132026Z generated_job_active=4 descendant_marker=True child_running=True
```

## Native正常経路と負例の切り分け

- 1a7fd033のWindows run40707527732で生成子/孫・Job全回収/zero active/取消/初期拒否/不存在child後の復帰、ServiceBase in-memory compile、staging exe compileが成功。
- 同runのprivate-runtime負例はif(false)置換のC# unreachable warningでAdd-Typeが失敗し、狙ったassertへ到達しなかったため不採用。guard自体を除去する生成copy mutationへ変更。元workspace sourceは書き換えない。
- d445a9ccのrun40707813046はprivate-runtime負例が狙ったassertへ到達。parent-environment負例はchild起動前のPlan境界assertが先に検出したため期待labelを実際の先行assertへ直し、全負例を再実行する。単なるexit1だけで成功扱いにしない。
- 生成combined source copyは各mutationをfinallyで元UTF-8 bytesに戻し、Base64 bytes同一を確認する。

```text
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:36:35.9705575Z signin_host_generated_environment_job_descendants_and_revocation_passed
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:36:36.4450113Z signin_host_compiled_no_execution
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:36:36.8745916Z signin_host_compiled_staging_only
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:36:37.2845580Z System.Exception: c:\Users\runneradmin\AppData\Local\Temp\soda-signin-host-checks-0471acf96fc04c3c9081f58184ea45e1\mutant.cs(334) : Warning as Error: Unreachable code detected
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:38:14.9596351Z signin_host_generated_environment_job_descendants_and_revocation_passed
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:38:15.5233662Z signin_host_compiled_no_execution
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:38:16.0924852Z signin_host_compiled_staging_only
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:38:16.6058485Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "2" argument(s): "Foreign runtime read accepted" ---> System.InvalidOperationException: Foreign runtime read accepted
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:38:17.0811315Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "2" argument(s): "Parent environment retained" ---> System.InvalidOperationException: Parent environment retained
```

- e6f7543c/run40708034442のpost-create負例では、markerファイル作成直後の読み取りがwriterと衝突してIOExceptionとなった。この失敗も負例成功に含めない。生成child/孫は一時fileへ書きclose後renameしてmarkerを公開するよう修正し、全6負例を再実行する。製品launcherの権限/環境を緩めていない。

## Windows生成検証成功

Head860e953e025f38fac8e79a2c3b12c20e38dab332、protected run40708273841成功。正常生成子/孫/環境/限定handle/Job停止zero active/取消/復帰、service compile-onlyとstaging生成、6 source-copy負例・finally元bytes復元・復元後normal成功。Windows上のJob全回収をこの生成ordinary経路で実証した。実SYSTEM/SCM/専用main/Winlogon workerは未実行。Native/taskcheck/cross/すべての修正差分点検に確定must/shouldなし。

```text
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:41:04.7284955Z signin_host_generated_environment_job_descendants_and_revocation_passed
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:41:05.3157514Z signin_host_compiled_no_execution
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:41:05.8736965Z signin_host_compiled_staging_only
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:41:06.3758737Z negative private-runtime
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:41:06.3783375Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "2" argument(s): "Foreign runtime read accepted" ---> System.InvalidOperationException: Foreign runtime read accepted
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:41:06.8470933Z negative parent-environment
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:41:06.8477331Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "2" argument(s): "Parent environment retained" ---> System.InvalidOperationException: Parent environment retained
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:41:07.4149517Z negative post-create-revocation
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:41:07.4154782Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "2" argument(s): "Post-create revocation accepted" ---> System.InvalidOperationException: Post-create revocation accepted
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:41:07.9757713Z negative handle-inheritance
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:41:07.9763723Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "2" argument(s): "Unexpected handle inherited" ---> System.InvalidOperationException: Unexpected handle inherited
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:41:13.5496949Z negative job-membership
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:41:13.5503377Z generated_job_active=4 descendant_marker=True child_running=True
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:41:13.5507900Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "2" argument(s): "Grandchild not owned by job" ---> System.InvalidOperationException: Grandchild not owned by job
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:41:14.2497586Z negative job-accounting
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:41:14.2502136Z System.Management.Automation.MethodInvocationException: Exception calling "Run" with "2" argument(s): "Descendant cleanup failed" ---> System.InvalidOperationException: Descendant cleanup failed
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:41:14.4454518Z signin_host_generated_environment_job_descendants_and_revocation_passed
boundaries	Generated ordinary signin host child and descendant checks (no service install)	2026-10-28T14:41:14.4456724Z signin_host_source_negatives_and_restore_passed
```
