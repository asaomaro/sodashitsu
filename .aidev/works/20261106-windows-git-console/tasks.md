# Windows Git polling console

利用者からTerminalの連続開閉を止める指示があり、CIMでSession1の通常Soda18040を
親とするgit.exe、conhost、WindowsTerminalの繰返し生成を確認した。一時停止で新Git0を確認。
再開指示後、GitRunnerにwindowsHideが欠けていたことを確認し、指定を追加。

- [x] Git出力/timeoutは維持してhidden指定だけ追加。
- [x] GitRunner/GitInfoPollerの78tests成功。最終regression単独も成功。
- [x] 実旧source差替ではwindowsHideのassertionで失敗、バイト一致で復元。
- [x] server build/typecheck成功、独立レビュー（差分/実機patch/wrapper）必須指摘なし。
- [x] Windowsのbefore module hashが期待値と一致し、1行の修正後はlocal builtとバイト一致。
- [x] 同じ停止PID/creation/owner/Session/listenerを検証し、既知hashのdistだけbackup後に差替。
- [x] 同一processをresume後、認証済みlocal snapshotで対象を照合して標準Windows handoff。
- [x] before/afterのpane UUID2件一致、親PID18040維持、handoffは実行中pane1件の維持を返した。
- [x] Windowsで16秒の継続観察。Git child2件の動作を確認し、WindowsTerminal新規0件。
- [ ] main pushとWindows checkoutの恒久更新。

## 実機反映の範囲

最小反映はC:\git\sodashitsu\packages\server\dist\infra\GitRunner.jsだけ。
既存TS checkoutは変更していない。backed-up moduleと実行receiptを保持している。
恒久的なsourceの更新も、同commitを含むmainをWindows cloneへ取り込んで行う必要がある。
一時停止/再開の記録は20261106-autonomous-recovery側に保存。


## 実機での観察

WindowsHide指定後もconhost自体は観察されるが、新しいWindowsTerminalは16秒間0件。
Git処理の停止で隠したものではなく、Git childが2件動作した状態で確認した。
通常/保守machine接続はonlineへ復帰した。サインイン専用serviceの問題は別件で残る。
