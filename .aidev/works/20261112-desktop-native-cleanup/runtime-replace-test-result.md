# Existing Runtime image replacement

The public preparation script passed `$null` to the string backup-path argument of `File.Replace`. Windows PowerShell converted this to an empty string, and the installed-image update failed before replacing the destination. The fix passes `System.Management.Automation.Language.NullString.Value`, preserving the existing atomic replacement and destination ACL restoration. Microsoft documents this type specifically for passing null to .NET string parameters: https://learn.microsoft.com/en-us/dotnet/api/system.management.automation.language.nullstring?view=powershellsdk-7.4.0 .

Production source delta: only the third argument of the existing `File.Replace` call. No C# inputs, prepared executable bytes, Scheduler/service operations, or 3330 built package outputs change. The closed SDK remains 89 files; its preparation script hash changes from `107bef3799018f976987ff830ba2afeb2248d5eb88f8cec479eaa0e49f78add9` to `7529a2667e359135a584d2ae611fa698f2e2739ddda1e4c522e94615bdbc36de`. The historical final SDK inventory describes the prior snapshot; this is its explicit single-file delta. The release source Git bundle must include this follow-up commit.

The repo-only `validate-runtime-helper-replace.ps1` is excluded from runtime assets. It finds the unique actual `IO.File.Replace` invocation in the public script's AST and executes its whole enclosing existing-image branch verbatim against generated scratch files. It checks replacement bytes, consumed staging file, unchanged ACL, no backup output, and unchanged source hash. It never executes the generated `.exe` bytes or invokes compilation, Task Scheduler, SCM, or installed paths.

The sole Windows operator ran the regression under normal Windows PowerShell policy in an isolated scratch directory. Initial exact-public-branch positive stdout:

```text
runtime_helper_existing_image_replace_passed
```

The earlier direct Windows `File.Replace` probe independently reported:

```json
{"oldFailed":true,"failurePreservedBytes":true,"fixedPassed":true,"restorationPassed":true,"scratchRemoved":true}
```

Final old-argument negative control and exact-source restoration evidence follows below. No Windows commands were executed by this source-author session.

## Exact public-branch negative control and restoration

Sole operator proof files: `/tmp/soda-final-migration-ef9d8914/null-regression2-positive.stdout`, `null-regression3-negative-restored.stdout`, and `null-regression3-negative-restored.stderr`. The negative control changed only the fully qualified NullString expression back to `$null` in an isolated candidate copy. Its raw captured exception (decoded from Windows CP932):

```text
System.Management.Automation.MethodInvocationException: "4" 個の引数を指定して "Replace" を呼び出し中に例外が発生しました: "パスの形式が無効です。" ---> System.ArgumentException: パスの形式が無効です。
   場所 System.IO.Path.NewNormalizePath(String path, Int32 maxPathLength, Boolean expandShortPaths)
   場所 System.IO.Path.NormalizePath(String path, Boolean fullCheck, Int32 maxPathLength, Boolean expandShortPaths)
   場所 System.IO.Path.GetFullPathInternal(String path)
   場所 System.IO.File.InternalReplace(String sourceFileName, String destinationFileName, String destinationBackupFileName, Boolean ignoreMetadataErrors)
   場所 CallSite.Target(Closure , CallSite , Type , Object , Object , Object , Boolean )
   --- 内部例外スタック トレースの終わり ---
   場所 System.Management.Automation.ExceptionHandlingOps.CheckActionPreference(FunctionContext funcContext, Exception exception)
   場所 System.Management.Automation.Interpreter.ActionCallInstruction`2.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
   場所 System.Management.Automation.Interpreter.EnterTryCatchFinallyInstruction.Run(InterpretedFrame frame)
```

The same invocation restored the original candidate bytes in `finally`, checked its SHA256 was exactly `7529a2667e359135a584d2ae611fa698f2e2739ddda1e4c522e94615bdbc36de`, and reran the public-branch validator. Raw stdout:

```text
{"oldFailed":true}
runtime_helper_existing_image_replace_passed
```

An initial validator locator failed before branch execution and was corrected to inspect the actual invocation AST; an initial operator negative mutation used an abbreviated type spelling absent from the candidate and correctly failed its negative-control assertion. Neither was accepted as evidence. The final corrected validator SHA256 is `2430e593ba7f0c4bad04ef8d5bca939619266063348bffef69051e17c59b2c67`.

`git diff --check`: PASS. Independent source review is required before installing this fix. No full build/type/test was repeated: the change is PowerShell argument marshalling only and does not change compiled helper inputs.
