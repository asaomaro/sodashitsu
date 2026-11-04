# PIN末尾の数字と認証desktop切替

実sr-pcで9caee3ad反映後、lock cover→認証画面→PIN入力を試した。session_unlockedがbrowserへ届き、自動再接続を開始したが、Bのresources.faulted/server_busyにより停止。手動再接続も拒否した。無条件の故障flag解除や新desktopへのキー解放は行っていない。

PINは末尾の数字downで認証が成立する場合があり、数字upの前にscopeが変わることが追加の原因候補。実遷移のキー件数/ACKの詳細は未観測。Enter/Unicodeだけをまとめても十分とは扱えないため、明示した認証workerだけで、他の保持キー/ボタンがないmain-row/Numpad数字のdown/upも一回のSendInputへまとめた。通常/昇格/chord/マウス保持中の挙動は維持する。

- Windowsの生成検査でDigit3/Numpad3、部分成功、通常/昇格/修飾キー/保持ボタンの数字操作を追加。
- 数字分岐だけを元のEnter限定へ戻す負例を加え、計4負例が狙ったassertionで失敗。各回のbyte復元と復元後正例が成功。生出力はwindows-authentication-checks.json。
- validate-resource-fence.ps1、validate-unlock-helper.ps1、validate-protected-worker.ps1もWindows上で成功（windows-existing-checks.json）。
- review_resource_monitorのsource/test独立点検で必須指摘なし。

実サービス再更新と、その後のPIN認証は未確認。この段階で実事象を解決済みとは扱わない。個人の画面・PIN値は保存しない。

## 実サービス更新後の確認

6d349156のPIN修正を含むhelperをWindows上で再コンパイルし、利用者のUAC承認で更新した。インストール済みexe SHA256=6A0D6D41A0AD985FB6AFFF670454C2D41BAB4CDC1C234C7B52D74B0F3509E581。改行変換のあるgit checkoutをLFのSHAで事前検査して止まった試行は、steps=[]で変更前に終了した。検査済みLF stageのSHA一致とコンパイルを確認し、そのstageから更新した。ハッシュ検査を省略したり、任意の差を許容したりしていない。

先行の入力解放不明からの保守復旧は、通常desktopと全キー/ボタンのdownなし500msを確認した後だけ、共有を一時無効化してhandoffした。4paneを保持。UAC処理の後、保存した共有許可の全項目への復元を確認した。

更新後、実ロック→認証画面→PIN入力→session_unlocked→通常readyへの自動再接続を2回続けて確認。通常frame14/26、errors=[]、各回に明示して操作権を再取得してマウス移動成功・操作権解放。2回の間にhandoff/故障flag解除/手動再接続は行っていない。観測値の集計はlive-unlock-cycles.json。長時間・多数回・別PCまで保証する確認ではない。

個人画面の一時画像は削除。PINや画面を検証記録・リポジトリへ残していない。
