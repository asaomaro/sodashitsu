# 認証入力とdesktop遷移時の入力解放

## 問題と変更

実sr-pcでPIN/Enterによる解除後、入力解放を確認できず再共有を拒否する事象がある。Enter down/up間のscope変化によるterminal ACK欠落が最有力の原因候補だが、実遷移のキー件数/cleanup/ACKは未観測で、原因確定とは扱わない。故障flagを設定操作やworker終了だけで解除する扱いは変更しない。

明示した認証worker（SecureLockStateあり）だけで、他のキー/ボタンを保持しないEnter/NumpadEnterのdown/upを一度のSendInputへ渡す。文字入力も各UTF-16文字のdown/upを一度に渡す。送信件数が不足/例外なら停止し、入力解放を確認済みとは扱わない。通常・昇格・修飾キー/マウス保持中のEnterは従来どおり。元scopeが失われた後に新scopeへ解放入力を送らない。

Microsoftの[SendInput仕様](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput)は配列の連続挿入と実挿入件数を定義する。desktop切替全体の原子性を保証したとは扱わない。

## Windows上の検査

隔離stageへソースをコピーしてSHA256照合。各検査を新しいPowerShellでコンパイルして実行した。生成scope/入力hookのみで、実キー入力・画面・clipboardは使わない。

- validate-authentication-input.ps1 -NegativeControls: exitCode=0。Enter、NumpadEnter、Unicode、scope喪失、partial input、通常/昇格/chord/held buttonを検査。
- 負例3件: 認証Enter経路を無効化、Unicodeを2つのnative呼出しへ復元、partial件数検査を無効化。すべて狙ったassertionで失敗。生出力はwindows-authentication-checks.json。
- 各負例後に元byte列へ復元して一致を検査。最後に正例を再実行して成功。
- validate-resource-fence.ps1 -NegativeControls、validate-unlock-helper.ps1、validate-protected-worker.ps1: exitCode=0。生出力はwindows-existing-checks.json。

実機サービスはコンパイル済みexeを使うため、ソース反映だけでは更新されない。管理者によるサービス更新と更新後のロック解除・通常再共有は未確認。この時点では実事象を解決済みとは記載しない。

## 独立点検

review_resource_monitorがsource/testと最終差分を独立点検。必須のコード指摘なし。実測事象と内部原因候補を分ける文書指摘を反映した。
