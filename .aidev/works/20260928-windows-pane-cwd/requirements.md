# 要件: Windows で pane の場所（cwd）が `cd` に追従する

## 背景 / 課題

- Windows ネイティブで、pane で `cd` してから Claude Code を開き、`soda serve` を止めて起動し直すと、pane が workspace を作った場所に戻る（ユーザーの報告。2026-09-28）。
- 原因: Linux・WSL2 は前面のプロセスの場所（`/proc/<pid>/cwd`）を読むが、Windows は Node から他のプロセスの場所を読めず、シェルが OSC 7 で知らせた場所だけを使う
  （`packages/server/src/agent/AgentMonitor.ts:173`）。既定の `powershell.exe`・`cmd.exe` は OSC 7 を出さないので、pane の場所は開いたときのまま更新されず、
  保存も復元もその場所になる。`docs/verification.md:449-452` に既知の制約として書かれている。
- 影響は再起動後の復元だけでなく、新しい tab・pane を「引き継ぐ」で開く場所、workspace の名前の追従にも及ぶ。

## 目的 / ゴール

- Windows ネイティブでも、利用者が何も設定せずに、pane で `cd` した場所が pane の場所として追従し、再起動後もその場所で開き直される状態。
- 利用者が自分のプロンプト（oh-my-posh・starship 等）を使っていても、その見た目と動きが変わらない状態。

## ユーザーストーリー

- US1: Windows で soda を使う開発者として、pane で `cd` した場所がサーバを起動し直しても保たれてほしい。なぜなら 作業のたびに場所を移し直す手間と、違う場所で Claude Code の会話を再開してしまう事故を防げるから。（受け入れ: AC1, AC2, AC3）
- US2: 同じ開発者として、自分のプロンプトの設定をそのまま使いたい。なぜなら soda のために PowerShell の設定を書き換えたくないから。（受け入れ: AC4, AC5）
- US3: 自分で OSC 7 を出している利用者として、soda の差し込みを切れるようにしたい。なぜなら 二重に知らせる必要が無く、起動の仕方を変えたくないから。（受け入れ: AC6）

## スコープ

### 対象

- Windows ネイティブで pane のシェルが Windows PowerShell 5.1（`powershell.exe`）・PowerShell 7（`pwsh.exe`）・`cmd.exe` のとき、起動時にプロンプトのたびに場所を知らせる設定を差し込む（`--shell` で指定した場合も、ファイル名がこれらなら対象）。
- 差し込みを切る設定（既定は入）。ブラウザと端末版の設定画面の「端末」の節。共有の設定（サーバに保存）なのでサーバが読む。
- Windows Terminal の場所の知らせ（OSC 9;9）も場所として受け取る（自分のプロンプトで 9;9 を出している利用者向け）。
- docs（`docs/verification.md` の既知の制約の書き換え・`docs/tui.md`・設定の説明）。

### 対象外

- 上の 3 つ以外のシェル（Git Bash・nushell・WSL の bash を Windows 側から起動する等）。自分で OSC 7 を出せば追従する（今までどおり）。
- 既に保存されている古い場所の書き換え（直した後に `cd` すれば追従する）。
- macOS（同じく OSC 7 だけの環境だが、既定のシェル zsh の扱いは別に考える）。

## 機能要件

- F1: Windows で対象のシェルの pane を開く（新規・分割・再起動後の復元。独自コマンドの pane は対象外——decisions D2）とき、プロンプトのたびに今の場所を OSC 7 で知らせるようにする。
- F2: 利用者のプロファイル・既存のプロンプト（`prompt` 関数・`PROMPT` 環境変数）は読み込まれ、見た目は変わらない。差し込みは既存のプロンプトの前に目に見えない知らせを足すだけ。
- F3: 設定「シェルの場所を追う（Windows）」を切ると、差し込まずに今までどおり起動する。変更は次に開く pane から効く。
- F4: OSC 9;9（`ESC ] 9 ; 9 ; "<path>" ST`）も pane の場所として受け取る。

## 非機能要件 / 制約

- 対応環境: Windows 10/11 の Windows PowerShell 5.1・PowerShell 7・cmd.exe。Linux・WSL2・macOS の挙動は変えない。
- 起動の遅れ: 差し込みで pane の起動が体感できるほど遅くならない（目安 +200ms 以内）。
- 安全: 差し込む文字列に利用者の入力を混ぜない（固定の文面）。パスを空白・非 ASCII・`#`・`%` を含めて正しく運ぶ（decisions D3 で OSC 9;9 を使う）。
- この環境（Linux）では Windows の実機で確かめられない。確かめられない範囲は未検証の穴として PR に書く。

## 完了条件 (受け入れ基準)

- [ ] AC1: Windows で既定の設定のまま、PowerShell 5.1・PowerShell 7・cmd の pane で `cd` すると、pane の場所（サイドバーの workspace の名前の追従・`sodactl pane current` の cwd）がその場所になる。
- [ ] AC2: `cd` した後にサーバを止めて起動し直すと、pane がその場所のシェルとして開き直される（Claude Code の会話の再開もその場所で行われる）。
- [ ] AC3: `cd` した後に「引き継ぐ」で新しい tab・pane を開くと、その場所で開く。
- [ ] AC4: 利用者のプロファイルの `prompt` 関数（oh-my-posh・starship を含む）と cmd の `PROMPT` 環境変数の見た目が変わらない。
- [ ] AC5: 差し込みの文字列は画面に見えず、pane の中のアプリ（Claude Code 等）の動きに影響しない。
- [ ] AC6: 設定を切ると、次に開く pane から差し込まれない（起動の引数・環境が今までと同じ）。
- [ ] AC7: OSC 9;9 で知らせる pane も場所が追従する。
- [ ] AC8: Linux・WSL2・macOS の pane の起動の引数・環境は変わらない（既存の試験がそのまま通る）。
- [ ] AC9: `docs/verification.md` の既知の制約の記述が新しい挙動に合わせて書き換えられ、設定が docs に載っている。

## 未確定事項 / 確認したいこと

- PowerShell への差し込み方（`-NoExit -Command` で既存の `prompt` を包む／一時ファイルのスクリプトを `-File` 相当で読む）→ design。`-NoExit -Command` は利用者の起動の引数（`--shell` で渡した引数）と衝突しうる。
- cmd の `PROMPT` への足し方（利用者が `PROMPT` を設定していないときの既定 `$P$G`）→ design。
- 共有の設定のキーの名前と、サーバが pane を開くときに設定を読む経路 → design。
