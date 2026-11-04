# PIN末尾の数字と認証desktop切替

実sr-pcで9caee3ad反映後、lock cover→認証画面→PIN入力を試した。session_unlockedがbrowserへ届き、自動再接続を開始したが、Bのresources.faulted/server_busyにより停止。手動再接続も拒否した。無条件の故障flag解除や新desktopへのキー解放は行っていない。

PINは末尾の数字downで認証が成立する場合があり、数字upの前にscopeが変わることが追加の原因候補。実遷移のキー件数/ACKの詳細は未観測。Enter/Unicodeだけをまとめても十分とは扱えないため、明示した認証workerだけで、他の保持キー/ボタンがないmain-row/Numpad数字のdown/upも一回のSendInputへまとめた。通常/昇格/chord/マウス保持中の挙動は維持する。

- Windowsの生成検査でDigit3/Numpad3、部分成功、通常/昇格/修飾キー/保持ボタンの数字操作を追加。
- 数字分岐だけを元のEnter限定へ戻す負例を加え、計4負例が狙ったassertionで失敗。各回のbyte復元と復元後正例が成功。生出力はwindows-authentication-checks.json。
- validate-resource-fence.ps1、validate-unlock-helper.ps1、validate-protected-worker.ps1もWindows上で成功（windows-existing-checks.json）。
- review_resource_monitorのsource/test独立点検で必須指摘なし。

実サービス再更新と、その後のPIN認証は未確認。この段階で実事象を解決済みとは扱わない。個人の画面・PIN値は保存しない。
