# Linux前面プロセス検出の同時走査

## 目的と範囲

Windowsとのmic転送切り分けで、WSL側中継サーバーの高負荷を観測。CPU profileはファイルIOとLinuxProcessInspectorの/proc走査等を示す。音声停止の原因とはまだ確定していないが、複数paneの同時foregroundJobがそれぞれ全/procを走査する重複を減らす。

## 設計

LinuxProcessInspectorの同一instance内で、実行中のPromiseだけを共有する。全groupのpid/comm/pgrp/ppidを一度読み、各呼出しで自分のtpgidへ絞る。完了・失敗時には共有を解き、後続pollは必ず再走査。各shellのtpgidと各対象のcmdline/cwdはこれまでどおり読む。PID/プロセスの同一性を保証する新機能や安全境界として使わない。TTLや常駐cacheを追加しない。

## タスク

- [x] 重複走査を同時呼出し間で共有。
- [x] 異なるgroupの分離、次回pollの変化、失敗後の再走査を検査。
- [x] 旧コードで同時走査回数テストの失敗、byte exact復元を確認。
- [x] 関連unit/integration 11テスト成功。
- [x] 全体test/typecheck/build（全体初回の試験側失敗を修復し、該当試験を再確認）。
- [x] 最終独立レビュー（taskごとではなくこの小差分全体へ実施）。
- [x] 稼働反映後のCPU/mic再確認。CPU負荷は低下、micのOpus停止は再現したため別修正へ分離。


型チェックは全体成功。復旧後の旧buildでも5秒385ticks（100ticks/秒）を観測し、再起動だけで高負荷が解消したとはしない。Windowsは再測定準備時にロック状態だったため、転送0のTimeout結果を製品回帰や再起動によるmic失敗と数えない。


## 全体確認で見つかった試験側の修復

全体runは13881 pass/3 fail/2 skip、1 suiteはdist未buildで拒否、SettingsDialog workerは4GBでOOM。生出力はevidence/full-test-failures.txt。

- Linux変更前から既存のSidebar goldenにdata-assistant-feature属性がなく、現行UIの正当なtheme属性との差だけだった。golden2件を現行属性へ揃えた。製品UIは変更しない。
- AssistantHostBundleのsynthetic Electron moduleへ既存importのnativeThemeを追加。deny proxyのままで、ネイティブAPIの実呼出しは許可しない。
- SettingsDialogのmountを自動unmount、Piniaをdispose、試験中のstorage listenerだけ除去する後始末を追加。同じ4GB上限で147件が17.53秒で完走。メモリ不足に対して上限を更に増やさず、試験間の蓄積を除去した。
- 全体build/typecheckは成功。修復した試験とdistを要求する試験を選んで再確認する。他の通過済み13881件を二重に流さない。


再確認はserverの4file/13件、Sidebar golden2件、SettingsDialog147件が成功。全体typecheck/buildと修復後web typecheckも成功。追加の独立レビューも必須指摘なし。12PTYを継承するhandoffに成功し、全14pane/5workspaceのID保持を確認。CPUは5秒385ticks（旧build）に対し、新buildは立上げ直後326/その後165/165ticks（100ticks/秒）を観測。負荷条件が完全同一のbenchmarkではないので低減率を保証しない。


反映後、実ブラウザのPCMは291frame/ACK288/maxPending4で6秒の転送と停止に成功。Opusはencoder configure3/encode69/close3、66frameで停止し、圧縮器の局所回復が尽きる現象へ絞れた。CPU重複走査の修正を音声停止の解決とは扱わず、別途圧縮器の時刻照合を修正する。
