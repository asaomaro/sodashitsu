# 要件: エージェント連携のフックの設定を、現行の公式文書に合わせ直す（Grok CLI・Devin CLI・Qoder CLI）

紐づく charter ゴール: なし（`.aidev/charter.md` 未導入。herdr 対応表 H32b の保守）

## 背景 / 課題

`20260923-other-agents-session-resume` は、Claude Code・Codex 以外の 6 エージェントに会話の再開を広げた。
どれも実機が無く、当時の公式文書の記述だけを根拠にした。その後、文書の側が変わった（または当時の読みが
誤っていた）疑いが 3 つ出たので、現行の文書を原文で取り直して確かめた（research.md。取った日は 2026-10-07）。

| 対象 | いまの実装 | 現行の文書 | 結論 |
|---|---|---|---|
| Grok CLI | 平らなエントリ `{matcher:"", type, command, timeout}` | 内側に `hooks[]` を持つ入れ子。`matcher` は省くと全部に当たる（research G2・G3） | 食い違いあり |
| Devin CLI | `$DEVIN_CONFIG_DIR` か `~/.devin` の `hooks.json`、トップレベル直下の `SessionStart` | 利用者の段は `~/.config/devin/config.json`（Windows は `%APPDATA%\devin\config.json`）の `hooks` キー。`~/.devin/hooks.json`・`DEVIN_CONFIG_DIR` は文書に無い（research D1・D2） | 食い違いあり |
| Qoder CLI | 対象外（「`SessionStart` が無い」） | `SessionStart` があり、設定・入力・再開のコマンドまで文書にある（research Q-1〜Q-9） | 食い違いあり（対応できる） |

確かめる途中で、**6 つの kind の報告が受け口で捨てられている**ことも分かった（research X1）。フックを正しく
入れても会話は再開されない。Qoder を「ほかの kind と同じ形で足す」には、足す先が動いている必要があるので、
この work で一緒に直す。

## 目的 / ゴール

Grok CLI・Devin CLI・Qoder CLI のフックの設定を、現行の公式文書の記述どおりにする。既に古い形・古い場所で
入れた利用者の設定は、壊さずに見つけて片づけられるようにする。

**この work の「完了」**: 3 つのフックが文書どおりの場所・形で書かれ（書いた形を単体テストで文書の例と
突き合わせてある）、連携の kind の全部の報告が受け口で pane に記録される状態。
**3 つとも実機が無く、実機で動くことは確かめていない**（`which grok qodercli qoder devin` はどれも無い）。

## ユーザーストーリー

- US1: Grok CLI・Devin CLI・Qoder CLI を使う利用者として、連携を導入したら、現行版のエージェントが実際に読む
  場所・形でフックが入ってほしい。（受け入れ: AC1・AC3・AC6・AC7）
- US2: 以前の版で Grok CLI・Devin CLI の連携を導入した利用者として、新しい版に替えた後、設定画面で
  「更新が必要」と分かり、［更新］で新しい形に替わり、古いものが残らないでほしい。解除でも古いものごと
  消えてほしい。（受け入れ: AC2・AC4・AC-I2）
- US3: 自分の設定ファイルを大事にする利用者として、本製品が解釈できないファイル（コメントつきの
  `config.json` 等）を勝手に書き換えないでほしい。（受け入れ: AC5）

## スコープ

### 対象

- `AgentIntegrationInstaller` の grok・devin の設定の直しと、古い形・古い場所の片づけ（install / uninstall /
  status）。
- 連携の kind に Qoder CLI（`qodercli`）を足す（導入・解除・状態・報告・再開のコマンド・設定画面と端末版の一覧）。
- 報告の受け口が、連携の kind の全部の報告を受けるようにする（research X1）。
- 関連する docs（`docs/verification.md`・`docs/herdr-parity.md`・`docs/migrate-from-wtm.md`）と、
  backlog の「非対応」の記録（`.aidev/backlog/product-roadmap.md` の Qoder CLI の行）。

### 対象外

- Bob Shell の追加、拡張の仕組み（別の work）。
- Claude Code 用のフックを Devin CLI・Grok CLI も読んで実行する件（research X2。見分け方の設計が要る）。
- Grok の `GROK_HOME`、Devin の `XDG_CONFIG_HOME` への追従（文書に、フック・設定の場所がそれに従うという
  記述が無い。research G8・D7）。
- `agent start` の表の `qodercli`（herdr の表に合わせたもの）の変更。
- Cursor・Copilot・Droid・Qwen Code の文書の読み直し（今回の疑いの外）。
- 実機での確認・E2E（実機が無い）。

## 機能要件

- FR1（Grok）: `~/.grok/hooks/soda-agent-report.json` の `hooks.SessionStart` に、
  `{hooks:[{type:"command", command, timeout:10}]}`（`matcher` なし）を書く。
- FR2（Devin）: `~/.config/devin/config.json`（Windows は `%APPDATA%\devin\config.json`）の
  `hooks.SessionStart` に、`{matcher:"", hooks:[{type:"command", command, timeout:10}]}` を書く。
  ファイルのほかのキー・ほかのフックは保つ。
- FR3（Qoder）: `$QODER_CONFIG_DIR`（無ければ `~/.qoder`）の `settings.json` の `hooks.SessionStart` に、
  `{hooks:[{type:"command", command, async:true}]}`（`matcher` なし）を書く。再開のコマンドは
  `qoder --resume <id>`。CLI の検出は `qoder` か `qodercli`。
- FR4（古いものの片づけ）: 以前の版が入れたエントリ（Grok の平らな形・Devin の古い `hooks.json`）を、
  status は「導入済み・更新が必要」と返し、install は新しい形に入れ直して古いものを除き、uninstall は
  新旧どちらも除く。利用者のほかのエントリ・ファイルは保つ。
- FR5（受け口）: 連携の kind の全部（claude・codex・cursor・copilot・devin・droid・grok・qwen・qodercli）の
  セッション id の報告を pane に記録する。知らない kind の報告は今までどおり捨てる。

## 非機能要件 / 制約

- **書き込みは利用者の明示の操作のときだけ**（既存と同じ）。status は何も書き換えない。
- **解釈できないファイルは書き換えない**（既存と同じ）。Devin の `config.json` はコメントを許す形式なので、
  断るときは理由（コメントつきの JSON は書き換えられない）を伝える。
- **既存の kind の動きを変えない**: claude・codex・cursor・copilot・droid・qwen の書く内容・状態の判定は変えない。
- **差分を小さく保つ**（AGENTS.md）。
- **実機未確認であることを docs に明記する**。推測で「動く」と書かない。

## 相互作用の受け入れ基準（UI を伴う work）

- [ ] AC-I1: 設定画面（ブラウザ版・端末版）の連携の一覧に「Qoder CLI」が出て、ほかの kind と同じ操作
  （導入・解除・状態・更新）ができる。既存の行の並びと操作は変わらない。
- [ ] AC-I2: 古い形で導入済みの Grok・Devin は「導入済み（更新が必要）」と出て、［更新］で消える。
  ［更新］の後の知らせは、何をしたか（古い形のフックを入れ直した）を伝える。Claude Code 以外の行の
  ［更新］の説明・知らせに「Claude Code」という語が出ない。

## 完了条件 (受け入れ基準)

- [ ] AC1（Grok の形）: install が、専用ファイルの `hooks.SessionStart` に、内側に `hooks[]` を持つエントリを
  1 つ書く。エントリに `matcher`・直下の `command` が無く、`hooks[0]` が `type:"command"`・`timeout:10` と
  本製品のコマンドを持つ。同じフォルダのほかの `*.json` は変わらない。
- [ ] AC2（Grok の移行）: 平らな形のエントリが入った専用ファイルに対して、status は
  `installed:true, needsUpdate:true`。install の後はエントリが入れ子の 1 つだけになり、`needsUpdate:false`。
  平らな形のままの状態から uninstall しても、エントリが消える。
- [ ] AC3（Devin の場所と形）: install が、`~/.config/devin/config.json` の `hooks.SessionStart` に
  エントリを 1 つ書く（`matcher:""`・`hooks[0].timeout:10`）。既存のほかのキー（`agent`・`permissions`・
  ほかのフック）は変わらない。Windows の場所は `%APPDATA%\devin\config.json`。
- [ ] AC4（Devin の移行）: 古い `hooks.json`（`$DEVIN_CONFIG_DIR` か `~/.devin`）に本製品のエントリがあると、
  status は `installed:true, needsUpdate:true`。install の後は、新しい場所にエントリがあり、古いファイルから
  本製品のエントリと古いスクリプトが消え（本製品のエントリだけだったファイルは消える。利用者のほかの
  エントリがあれば、それだけ残る）、`needsUpdate:false`。古い場所だけにある状態から uninstall しても消える。
- [ ] AC5（解釈できない設定）: コメントつきの `config.json` に対して、Devin の install は `ok:false` で、
  ファイルを 1 バイトも変えず、知らせにコメントのことが書いてある。このとき古い `hooks.json` も変えない。
- [ ] AC6（Qoder）: kind `qodercli` の install / uninstall / status が FR3 の場所と形で働く。
  `QODER_CONFIG_DIR` に従う。`PATH` に `qoder` か `qodercli` のどちらかがあれば `cliDetected:true`。
  再開のコマンドは `qoder --resume <id>`（危ない文字を含む id では出さない）。
- [ ] AC7（受け口）: 実物の受け口へ、kind が claude・codex 以外の連携の kind（grok・qodercli など）の
  セッション id の報告を送ると、その pane の `agentSession` に記録される。連携の kind でない名乗りは
  記録されない。**直す前のコードで落ちることを確かめる**（regression-negative-control）。
- [ ] AC8（既存の kind）: claude・codex・cursor・copilot・droid・qwen の既存の単体テストが、中身を変えずに通る
  （kind の一覧を数え上げる箇所に `qodercli` を足すことは除く）。古いものを持たない kind の `needsUpdate` は
  今までどおり。
- [ ] AC9（docs）: `docs/verification.md`・`docs/herdr-parity.md`・`docs/migrate-from-wtm.md` が新しい場所・
  形・kind に合い、「文書だけで確認。実機は未確認」と書いてある。`.aidev/backlog/product-roadmap.md` の
  「非対応」から Qoder CLI が外れている。
- [ ] AC10: `pnpm build`・`pnpm typecheck`・`pnpm test` が通る。
