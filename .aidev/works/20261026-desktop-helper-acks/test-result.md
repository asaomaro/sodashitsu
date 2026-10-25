# helper入力ACKの独立出力

通常helperのconfigure/ready内部交渉だけで有効化し、公開viewer schemaは変更しない。stderrのASCII prefixに対し96byteまでの行・未完了入力64件までを管理。非ASCII/過大行/診断/未割当seq/重複ACKは捨てる。PowerShellのprogress CLIXML等が混ざっても単独行だけを扱う。SetUtf8Consoleでstderrをraw streamへ揃え、ACK先頭改行で部分診断との結合を防ぐ。

- 関連42 unit成功。未交渉・分割line・diagnostics・境界・重複・64pendingを確認。
- Windows実機のC# entry compile、既存pipe/display/input/frame/native priority回帰成功。OutputGateを保持したまま別threadのACKが完了し、stdoutへ混ざらないこと、legacy stdout ACKを確認。OS入力や画面取得は行っていない。
- CreateNoWindowの別PowerShellでraw UTF8 stdin/stdoutとstderr単独ACK行を確認して成功。stderr全体にはPowerShell progressの診断が混ざり得るため、全体一致でなく製品parserと同じ単独行の存在を判定する。
- browser focused inputはlegacy/dedicated両方とIME3件、計5件成功。dedicatedではhelper stdoutを初回inputの部分ACKのまま保ち、その間の3input ACKをbrowserで観測した後、blur releaseでstdoutを再開する。後半の操作は画像更新を継続し鮮度検査を維持。
- build/typecheck成功。差分全体と追加修正は独立レビュー済み。

## Negative controls

修正だけを戻して実行時失敗を確認し、その後byte一致で復元。nativeは毎回C#再コンパイル、browserはBサーバーを再buildした。

- [native](negative-native.log): stderr routeを使わないと『Input ACK waited behind video OutputGate』で失敗。
- [browser](negative-browser.log): Bのstderr交渉を無効にすると、stdout部分行の間のinput ACKが届かずブラウザassertion失敗。

source復元後にserver再build。実回線の入力遅延の改善率を示す試験ではない。secure workerは従来出力を維持し、サービス更新は不要。Bサーバーのbuild/handoffと共有の再接続で反映する。
