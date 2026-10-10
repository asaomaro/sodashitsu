# e2e-real-claude: 調べの結果（2026-10-10）

実物の `claude` は、**1 度も実行していない**（`command -v`・`type -a` と、偽物のスクリプトだけ。デバッグ用に作った偽の `claude` は、実行するのは偽物）。

## 1. 実際に起きているか — **起きている（事実。再現した）**
### pane のシェルの起動のしかた（読んだ）
- `TerminalManager.create`: `opts.shell` が無いとき `processInspector.defaultShell()` = `{ shell: process.env.SHELL || "/bin/sh", args: [] }`（`LinuxProcessInspector.ts`）。環境は `buildPaneEnv(process.env, …)`（サーバの環境から作る）。→ この機械では `SHELL=/bin/bash`・引数なし（対話・非ログイン）＝ **`~/.bashrc` を読む**。
- この機械の `~/.bashrc` の 128 行目: `export PATH="/home/asaomaro/.local/bin:$PATH"`（無条件）。`~/.local/bin/claude` は実物（`~/.local/share/claude/versions/2.1.296` へのリンク）。
### 同じ形のシェルで見た（事実）
```
PATH=/tmp/…/fakebin:$PATH  bash -i -c 'command -v claude'      → /home/asaomaro/.local/bin/claude   ← 実物
                           type -a claude → ①~/.local/bin/claude（実物）②fakebin/claude ③~/.local/bin/claude
PATH=…  bash --norc --noprofile -i -c 'command -v claude'       → /tmp/…/fakebin/claude              ← 偽物
HOME=<一時>  PATH=…  bash -i -c 'command -v claude'              → /tmp/…/fakebin/claude              ← 偽物（rc が無い）
```
→ **偽の `claude` を PATH の先頭に置いて、pane のシェルに `claude` と打ち込む試験は、この機械では実物を起動する。**

### 該当の試験の一覧（grep と読み）
| 場所 | 偽の置き方 | シェルが rc を読むか | 実物が起動するか |
| :- | :- | :- | :- |
| E2E `graph-add.spec.ts` | `process.env.PATH` の先頭に偽の `claude`。サーバの `agent.start` が pane のシェルへ `claude` を打ち込む | 読む（`SHELL` 既定） | **する**（4 本が `agent.start` を送る。`agent.kinds` の検出はサーバ自身の PATH なので偽物を見つけ、**表示だけ偽物を指す**） |
| E2E `agent-detection.spec.ts` | スクリプトを絶対パスで実行（`exec -a claude bash <script>`） | 読むが、名前を引かない | しない |
| E2E `subagents`・`graph-subagent-nodes`・`notifications` ほか | 報告を直接送る・`claude` を打ち込まない | — | しない |
| 結合 `composeServer.integration.test.ts`「偽の claude を起動すると…」 | `process.env.PATH` の先頭に偽物。**HOME は実物のまま**。WS で `claude\n` を打ち込む | 読む | **する** |
| 結合 `attribution`・`resumeLost`・`subagents`・`lineage`・`fork` | PATH の先頭＋**`HOME` を一時のフォルダ**・`ENV` を消す | 読まない（rc が無い） | しない（ただし、守りが無かった） |
| 結合 `agentStart.shell`・`soda.pty` | `--norc --noprofile`／`HOME` 一時・`ENV=""` | 読まない | しない |

### E2E の、もう 1 つの事実（直しで分かった）
`graph-add` の偽の `claude` は、`bash -c "…; sleep 600"` を `exec -a claude` で動かす。**`bash -c` は最後のコマンド（`sleep`）を直接 exec するので、プロセスの名前が `sleep` になり、エージェントとして検出されない**（再現: 偽物だけにすると「シェル」のまま）。つまり、`エージェントを足す…` の試験は、**これまで実物の `claude` のおかげで通っていた**（偽物の検出は、そもそも成立していなかった）。

## 2. すでに起きた形跡 — **確かな形跡は無い（事実）**
- `~/.claude/projects/` は 38 件のフォルダ。**E2E（`-tmp-soda-e2e-…`・`packages-e2e`）・結合テストの一時フォルダの名前のものは 0 件**。`-tmp-…` は、エージェントが手で作った scratchpad（`…scratchpad-t0-A`・`-hooktest` など。10-04〜10-10）と `-tmp-ask-img-test`（10-05）だけ。
- `~/.claude.json` の `projects`（28 件）にも、E2E・結合の場所は無い（`/tmp/claude-1000/…/scratchpad/{t0/A,e2e/repo}` の 2 件は手作業）。
- 解釈（推測）: 実物の `claude` は、起動しても**最初の入力が送られない**ので、会話の記録（最初のメッセージで作られる）は残らない。起動したことの形跡が残らないのは自然。**「起動していない」の証拠ではない**。

## 3. 実物が起動していた場合、何をしたか（推測。コードの読み）
- 試験が打ち込むのは `claude`＋Enter だけ（`agent.start` は、固定の表の実行ファイル名と、`args`〔`graph-add` は空〕）。**入力は送らない**（最初のターンを始めない）。
- したがって実物は、TUI を起動して入力待ちのまま、試験の終わり（サーバの停止・pane の終了）に kill される。会話の記録は作られない（上の 2）。起動時の通信（更新の確認など）・`~/.claude.json` の更新・`SessionStart` のフック（pane の環境の `SODA_AGENT_REPORT_SOCKET` ＝**試験のサーバ**へ報告する。利用者のサーバではない）は、ありうる。
- 費用: 入力が無いので、モデルの呼び出しは、起きない（推測）。利用者のアカウントの枠・費用への影響は、小さいか無い。
- 影響の本体は (b): 結果が機械の rc に左右される。`graph-add` の 1 本は、実物のおかげで通っていた。
