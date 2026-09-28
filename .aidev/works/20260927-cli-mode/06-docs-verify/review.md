# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [must][conv:-] docs/migrate-from-wtm.md:28-29 端末の無い soda の使い方は標準出力（案内だけ標準エラー）なのに両方を標準エラーと書く（docs/tui.md:33 も） / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [must][conv:-] docs/verification.md:930 はじめの案内を「Esc で閉じる」と書く（閉じない） / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [nit][conv:-] docs/verification.md:888 「3 環境」と書くが表は SSH 越しを含む 4 行 / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [must][conv:-] .aidev/config.yml:23-32 smokeCommands に疑似端末の確かめが無い（T5 の範囲） / 対応: 修正済（143ea7d）
- [should][conv:-] scripts/tui-pty-verify.mjs:318-336 SIGINT・SIGTERM で片付けず、サーバと一時ディレクトリが残る / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [should][conv:-] scripts/tui-pty-verify.mjs:222-224 prefs.json の onboarding を 1 回だけ読み、書き込みを待たない / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [should][conv:-] scripts/tui-pty-verify.mjs:277-283 同じ workspace の確かめが一般的な語「state」の部分一致 / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [should][conv:-] scripts/tui-pty-verify.mjs:7,194-199 tab バー・枠の描画を確かめていないのにコメントは確かめると書く / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [nit][conv:-] scripts/tui-pty-verify.mjs:138 代替画面に一度も入らなくても通る / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [nit][conv:-] scripts/tui-pty-verify.mjs:238,242-265 サーバが動き続けたかを pid の一致で見ていない / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [nit][conv:-] scripts/tui-pty-verify.mjs:216-219,165 固定の sleep・空きポートの競合 / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [must][conv:-] packages/tui/src/bench/latency.ts:141-148,277,440-442 (d) が打鍵の前に出力の静まりを待ち、大量出力の最中の打鍵を測っていない / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [should][conv:-] packages/tui/src/bench/latency.ts:421-423,540 足した遅延を別々の走りの p95 の差で出し、基準も同じイベントループで測る / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [should][conv:-] packages/tui/src/bench/latency.ts:529-544 AC17 の目安を判定せず常に 0 で終わる・JSON に added が無い / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [should][conv:-] packages/tui/src/bench/latency.ts:34,266,419-421 暖機が無く 30 標本の p95 が外れ値で決まる / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [should][conv:-] packages/tui/src/bench/latency.ts:280 当たりの判定が画面のどこかにその文字があるかで、別の場所の描画で早く終わる / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [should][conv:-] packages/tui/src/bench/latency.ts:503-505 大きさの変更の後の最初のフレームを全体の描き直しかを確かめずに数える / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [nit][conv:-] packages/tui/src/bench/latency.ts:329-340 try の前の準備の失敗で一時ディレクトリが残る・空きポートの競合 / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [nit][conv:-] packages/tui/src/bench/latency.ts:70-72,111 全フレームを持ち続け毎回先頭から探す / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [should][conv:-] docs/tui-parity.md:88 H44 の macOS の画像の読み取りを pbpaste と書く（実際は osascript） / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [should][conv:-] docs/tui-parity.md:91 H48 の host_cursor・redraw_on_focus_gained の扱いが無いのに対応と書く / 対応: 修正済（f4d3b77・cc52797）
- [should][conv:-] docs/tui-parity.md:59 H25b の検証の AC に AC-I1 を挙げるが案内は Esc で閉じない（例外） / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [should][conv:-] docs/tui-parity.md:43 H14・W23 の検証の AC が AC2 で、外側の端末のタイトルを確かめていない / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [should][conv:-] docs/herdr-parity.md:73 H37b が「worktree の削除は対象外のまま」で、web にも足した（D4）ことと食い違う / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [nit][conv:-] docs/tui-parity.md:59 案内の条件の出所を D18 と書く（D19） / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [nit][conv:-] docs/tui-parity.md:73 凡例に無い分類「端末版だけ」 / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [nit][conv:-] docs/tui-parity.md:8 H32b・H37b の行が無い / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [nit][conv:-] docs/tui-parity.md:88 画像ファイルのドロップの分類が無い / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [should][conv:-] docs/tui.md:130 Windows・WSL でも clip.exe で写すと書くが OSC 52 だけ / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [nit][conv:-] docs/tui.md:91 操作の名前 switch_workspace_1..9 は存在しない / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [nit][conv:-] docs/tui.md:149 設定の節の順が画面と違う / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [nit][conv:-] docs/tui.md:72 直接のキー（ctrl+v 等）も pane へ届かない例外を書いていない / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [nit][conv:-] docs/tui.md:36-45 起動の失敗の表に回数の制限・3 回の失敗が無い / 対応: 修正済（c957791・776677d・cc52797・143ea7d）
- [nit][conv:-] docs/tui.md:86 prefix+e は VISUAL・EDITOR（Windows は VISUAL を先に） / 対応: 修正済（c957791・776677d・cc52797・143ea7d）

## ラウンド 1（2026-09-28）
- [should][conv:-] docs/tui-parity.md:45,146 H14・W23 が AC15 自身を検証の AC に挙げている（循環） / 対応: 修正済（1601d33）
- [should][conv:-] docs/tui-parity.md:74,95 H29d・H48 の検証の AC が挙動を覆っていない / 対応: 修正済（1601d33）
- [should][conv:-] docs/tui-parity.md:149 W26 が AC-I1 で検証と書くが案内は AC-I1 の例外 / 対応: 修正済（1601d33）
- [should][conv:-] docs/verification.md:919-922,950 / docs/tui.md:18,43 新しい状態ディレクトリの既定の session は 7780 を使い、利用者の soda が動いていると確かめが失敗する（回避の手順が無い） / 対応: 修正済（1601d33）
- [nit][conv:-] docs/tui-parity.md:8 ID の範囲が herdr-parity.md と一致すると書くが一致しない / 対応: 修正済（1601d33）
- [nit][conv:-] scripts/tui-pty-verify.mjs:2 見出しの AC4・AC11 は確かめていない・docs ごとに AC の集合が違う / 対応: 修正済（1601d33）
- [nit][conv:-] docs/tui.md:36-47 起動の失敗の表に TLS の失敗が無い / 対応: 修正済（1601d33）

## ラウンド 2（2026-09-28）
- 指摘なし（1601d33 を主エージェントが確かめた：AC15 の自己参照が消え、D20 の書き方〔AC なし（試験: …）〕になった。W26 は AC1 と AC-I1 の例外。7780 の回避の手順は実際に打って確かめた記録がある。疑似端末の確かめの AC の集合は 3 か所でそろった）
