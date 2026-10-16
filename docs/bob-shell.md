# Bob Shell への対応

IBM Bob Shell（npm の `bobshell`。コマンドは `bob`）を、ほかのコーディングエージェントと同じように扱う。
実機の bobshell 2.0.6（Linux）で確かめた（20261016-bob-shell。`soda serve` の pane で、導入 → `sodactl agent start --kind bob` →
承認待ち → 作業中 → 完了 → 会話の id の記録 → サーバの再起動 → `bob --resume <id>` での再開 → 解除、までを通した）。

## できること

| 機能 | 内容 |
|---|---|
| 前面の検出 | pane の前面で `bob` が動いていれば、種類 `bob`（表示は「Bob Shell」）として見つける。`node <...>/bin/bob` の形を見る（Windows の npm の shim が起こす `node <...>\bob.js` も同じ名前で見つける想定。Windows の実機は未確認）。Bob は起動すると同じ形の子を起こし直すが、親子の両方を同じエージェントとして扱う。 |
| 画面の判定 | 作業中・承認待ち・待機を、画面から判定する（下の「画面の判定」）。 |
| 会話の再開 | 設定の「エージェント連携」で Bob Shell を導入すると、pane の会話（Bob のタスク）の id を記録し、サーバの再起動の後に `bob --resume <id>` で再開する。 |
| 起動 | `sodactl agent start <name> --kind bob --pane <paneId>`・グラフの「＋」のフォームから起動できる。 |

## 画面の判定

Bob の画面の文言は、利用者のロケールに合わせて 15 の言語で替わる。そこで、文言ではなく、言語に依らない印で見る。

- **作業中**: 入力の枠のすぐ上の行が、点字のスピナーで始まる（`⠼ Processing… (Enter to steer, Tab to queue)`・`⠇ 処理中… (…)`）。
  承認したコマンドを動かしている間も同じ。
- **承認待ち**: 選択肢の位置 `↑↓ (1/3)` が出ていて、入力の枠が無い（コマンドの承認・フォルダーの信頼の確認では、入力の枠が消える）。
  `/` のメニューのように、入力の枠が残る一覧は、承認待ちにしない。
- **待機**: どれにも当たらないとき（返答の後・起動した直後）。

ルールは `packages/server/assets/agent-detection/bob.toml`。herdr から無改変で取り込んだルール（`third_party/herdr/agent-detection/`）
には Bob が無いので、本製品独自のルールの置き場所として `packages/server/assets/agent-detection/` を設けた。サーバは herdr のものを先に読み、
こちらの `index.toml` にある種類のうち、まだ無いものは足し、既にあるものは**ルールを後ろに足す**（herdr のルールは消さず、上書きもしない。
ルールの id が重なる・足すと 1 種類あたりのルールの上限〔128〕を超える・先の置き場所のものが読めていない、のどれかのときは、足さずに警告する）。書き方は herdr のものと同じ。

この「足す」仕組みで、GitHub Copilot CLI の判定も補っている（`github-copilot-extra.toml`）。実機の 1.0.98 は、メッセージを送った直後の数秒、
いちばん下の帯に `◎ Working esc edit prompt` を出すが、herdr のルールは `esc interrupt` などしか見ないので、この間を待機と取り違えていた。

## フック（会話の再開）

導入すると、Bob の全体の設定 `~/.bob/settings/settings.json` の `hooks.SessionStart` に、次の 1 項目を足す
（スクリプトは `~/.bob/hooks/soda-agent-report.cjs` に写す）。設定のほかのキー（Bob 自身が書く `licenseConsent`・`bobShell` など）と、
利用者のほかのフックは保つ。解除すると、この項目とスクリプトだけを除く。

```json
{ "hooks": { "SessionStart": [ { "hooks": [ { "type": "command", "command": "node \"/home/you/.bob/hooks/soda-agent-report.cjs\" bob" } ] } ] } }
```

- Bob はフックの項目を厳密に検証し、知らない項目があると、**全体のフックの設定を丸ごと捨てる**。そのため `async`・`timeout` などは書かない
  （時間切れは Bob の既定の 10 秒）。`matcher` も書かない（`startup`・`resume`・`compact` のどれでも報告する）。
- フックに届く `session_id` は Bob のタスクの id（`bob --list-tasks` の ID）そのもので、`bob --resume <id>` にそのまま渡せる。

## 限界

- **会話の id が付くのは、最初のメッセージを送った後**。Bob の `SessionStart` は、起動したときではなく、そのタスクの最初のメッセージを
  送ったときに来る。起動しただけで何も送っていない pane は、サーバを再起動しても再開しない（再開するタスクがまだ無い）。
- `~/.bob` の場所を替える環境変数は Bob に無いので、本製品も `~/.bob` だけを見る。ワークスペースの `.bob/settings.json` には書かない。
- 判定のルールは 2.0.6 の画面から起こした。Bob の画面の作りが変わると、判定が外れることがある。
- 確かめたのは Linux だけ。設定の画面（Web・端末版）の［導入］ボタンからの導入は、手ではまだ押していない（導入の処理そのものは、下の通しで使った）。
