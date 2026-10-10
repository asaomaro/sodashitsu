# レビューの記録: e2e-fake-agent（試験が、実物の `claude` を起動していた件）

## 何が起きていたか（調べ。実物は、1 度も実行していない）
- pane のシェルは、利用者の rc を読む。この機械の `~/.bashrc` は、PATH の先頭へ `~/.local/bin`（実物の `claude`）を足し直す。PATH の先頭に偽の `claude` を置いて、pane に `claude` と打ち込む試験——E2E `graph-add` の 4 本と、結合 `composeServer.integration` の 1 本——は、**実物を起動していた**。
- 打ち込むのは `claude` と Enter だけで、入力は送らない。`~/.claude/projects` に、試験の場所の記録は無い。費用・枠への影響は、小さいか無い（推測）。
- `graph-add` の 1 本は、偽の `claude` の作りが悪く（`bash -c '…; sleep 600'` は、最後の `sleep` を exec して、名前が替わる）、**実物のおかげで通っていた**。

## 直し（試験と、試験の道具だけ。製品は変えない）
- E2E の共通の道具: pane のシェルを、`bash --norc --noprofile` の包みに（プロンプトとタイトルは、Debian・Ubuntu の既定と同じ形を渡す）。
- 守り `assertPaneResolvesFake`: 打ち込む前に、pane の中で `command -v` が偽を指すことを確かめ、違えば、**打ち込まずに落とす**。偽の `claude` を打ち込む E2E・結合の全部に。
- 偽の `claude` の作りを直した（偽物で、検知される）。

## 軽いレビュー（実装とは別のエージェント）
- 判断: マージしてよい。製品のコードに差分なし。守りは、打つ前に落とす（打つのは `command -v` だけ）。守りの抜け 2 つ（`composeServer.usage.integration`・cli `agentStart.integration`）→ 足した。#134 の `agent-fork.spec` の、spec ごとの `SHELL` の差し替えは、共通の道具に寄せた。

## E2E の全体（1 回。839 件・1.2 時間。負荷の平均 30 前後の時間を含む）
781 通過・48 skip・10 失敗。切り分け（作業ブランチと origin/main で、各 2 回まで）:
- **シェルの変更が原因の 3 件**（`display-layout-state:293`・`mobile:18`・`ui-style-pane-actions:115`。rc を読まない bash は、プロンプトが `bash-5.2$ `・タイトルが無く、pane の見出しの幅・カーソルの列が変わる）→ 包みが、既定の形の `PS1` を渡すようにして、3 件とも通る。spec は変えていない。
- **負荷の中の時間切れ 3 件**（`ask-view:405`・`display-script-noreturn:219`・`performance:165`）: 単独で通る。
- **もとから落ちる 4 件**（origin/main でも、2 回とも落ちる）: `display-script-drop:73`・`new-terminal-cwd:128`・`scrollback-copy:80`・`terminal-app:258`。この変更とは無関係。**別の作業（`fix/e2e-main-failures`）で、いつから・何が原因かを調べる。**
- プロンプトの直しの後は、切り分けた 10 件と、関係する spec を確かめた（E2E の全体は、流し直していない）。

## 監督役の確認（main を #137 まで取り込んだ後。自分で）
- `pnpm build`・`pnpm typecheck`・`pnpm test` の全体（546 ファイル・10289 件・**失敗 0**）・起動確認。

## 残ること
- E2E は、製品の既定（pane のシェルが rc を読む）を、検査しなくなった。守りは、打ち込んだ後の PATH の変化は見ない。
- E2E・結合のサーバは、まだ、利用者の本物の `~/.codex`・`~/.claude` を読む（利用状況の PR3 で、`CODEX_HOME`・`CLAUDE_CONFIG_DIR` を、一時のフォルダへ向ける）。
