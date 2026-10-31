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

最新main反映後の全体試験・配布物・関連browser・最終head CIは未完了。
