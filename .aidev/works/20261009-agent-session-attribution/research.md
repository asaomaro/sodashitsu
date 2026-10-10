# 再起動の後、会話が再開されなかった 2 件の調査の結果（調べただけ。コードも利用者の状態も変えていない）

読んだだけのもの: `~/.local/state/sodashitsu/{server.log,session.json}`・`~/.codex/{hooks.json,config.toml,hooks/,sessions/,logs_2.sqlite,app-server-daemon/}`・動いているプロセスの `/proc/*/environ`・`~/.claude/settings.json`。7780 番のサーバには触っていない。再現は、一時の状態ディレクトリで別に立てたサーバ（ポート 7791。`/tmp/claude-1000/ri/`）で行い、終わったので止めた。

---

## 件 A: Codex の pane（9f962410）に会話の参照が無かった

### 結論（言い切れる）
**(1) 一度も届かなかった、でも (2) 届いて後で捨てられた、でもない。第 3 の道: 報告は届いたが、別の pane（f0b545a5）に付いた。** そして、その pane は、のちに閉じられた。

### 事実（確かめたこと）
1. **Codex の `SessionStart` フックは、pane の中ではなく、Codex の「app-server daemon」の中で動いている。** 動いているプロセスを見ると:
   - `codex app-server daemon pid-update-loop`（pid 45280）は **10/10 00:12 JST** に始まり、その子が `codex app-server --remote-control --listen unix://`（pid 1083022。05:18 に入れ替わり）。cwd は `/workspaces/yukkuri-work`。
   - この daemon の環境変数は `SODA_PANE_ID=f0b545a5-e318-4463-8607-f93adfd0672c`・`SODA_AGENT_REPORT_SOCKET=…/agent-report.sock`（3 つのプロセスとも同じ）。`f0b545a5` は、**最初に daemon を起動した pane**（そのときの環境を引き継いだ）。この pane は、サーバのログで 23:26Z（08:26 JST）に `graph.cleanup: removed nodes of closed panes` とあり、閉じられている。
   - Codex 0.162 の daemon が、会話（thread）を持っている: `daemon.stderr.log.previous` に `codex_core::session … thread 01a12158-… already has an active writer`（thread-store の競合）。つまり、各 pane の `codex` は、daemon の窓口（クライアント）で、フックも、ツールのコマンドも、daemon が動かす。
2. **会話 `01a12154…` のロールアウトに、そのものの証拠が残っている**（`~/.codex/sessions/2026/10/10/rollout-…01a12154….jsonl` の 32 行目。2026-10-09T15:46:37Z）。その会話の中で Codex が `sodactl pane current --current; sodactl agent list` を動かした結果:
   - `pane.id = f0b545a5…`（`SODA_PANE_ID` が **f0b545a5** だった。会話を動かしている TUI の pane は 9f962410）
   - その pane の `agentSession = {kind: codex, sessionId: 01a12154-058f-76e0-a3a0-f01baf8912f2, reportedAt: 1791560765139}` ＝ 15:46:05.139Z。
   - `agents` の一覧では、`f0b545a5` が codex（instanceId b8b8fbce、since 15:19:42Z）、`9f962410` が別の codex（instanceId 1d5956db、**since 1791560764634 ＝ 15:46:04.6Z**）。ロールアウトの最初の行（session_meta）は 15:46:04.4Z。
   → 9f962410 で `codex` を起動した（15:46:04.6Z）直後、15:46:05.1Z に出た `SessionStart` の報告は、**f0b545a5 の `agentSession` に書かれた**。9f962410 には、一度も付いていない。
3. 同じ報告は、f0b545a5 に元からあった会話の参照（そこで動いていた別の Codex のもの）を、**上書きして**いた（件 B と同じ形の取り違え）。
4. 9f962410 の cwd・フックの設定・信頼の記録は正しい（`hooks.json`・`config.toml` の `hooks.state` の信頼のハッシュは存在する）。フックのスクリプトは動いた（報告がサーバに届いた）。だから (1) の候補（フックが発火しない・`node` が無い・fnm の失敗・環境変数が渡らない・`session_id` の形）は、**この件では原因ではない**。報告が届いたことが、スクリプトが最後まで動き、Codex の入力に `session_id` があり、UUID の検査も通ったことを示している。fnm の失敗した shell は、フック（daemon の環境の PATH）には関係しない（daemon の PATH に `node` がある。システムの `/usr/bin/node` v20.20.2 もある）。
5. `server.log`: 22:31:00Z に、両 pane（f0b545a5・9f962410）で `agent judgment failed … foregroundJob timed out after 2000ms`（同時刻。高負荷の時間）。**判定の失敗は `agent` を `null` にしない**（`AgentMonitor` は失敗したら何も更新しない）ので、(2) の原因ではない。

### 推測（確かめていないこと）
- フックが daemon の環境で動くことは、上の 2・事実 1 から言えるが、Codex の実装を読んだわけではない。実物の Codex を一時の `CODEX_HOME` で動かして、フックの `env` を採る追試はしていない（`auth.json` を複製する必要があり、やらなかった）。
- この構造は Codex 0.162.0（10/10 00:09 に `/usr/bin/codex` が更新された）で入った新しい形に見える。それ以前は、フックは `codex` の子として pane の中で動いていたはず（設計の前提のとおり。以前は動いていた）。

### 今の状態（影響）
- いまの daemon（pid 45280）の環境は **閉じた pane の id（f0b545a5）のまま**。**どの pane で `codex` を起動しても、報告は存在しない pane 宛て（サーバは黙って捨てる）で、どの pane にも会話の参照が付かない**。daemon を終わらせて、次に `codex` を起動した pane から起動し直すまで続く（ただし、その pane 以外の Codex の報告は、また誤る）。
- 同じ原因で、Codex の中の `SODA_PANE_ID` も daemon の値になる。**`sodactl pane current --current`・`sodactl` の「自分の pane」の歯止めが、別の pane（または閉じた pane）を指す**。会話 01a12154 の中の `sodactl` は、f0b545a5 を自分だと思っていた（ロールアウトのとおり）。

### 直し方の案（Codex 側）
1. **報告を pane に結び付ける材料を、daemon の環境ではなく、TUI（pane の中のプロセス）から取る。** フックの入力（`cwd`・`transcript_path`・`session_id`）と、pane の Codex の判定（`agent.since`・pane の cwd）で、サーバが突き合わせる: 「`kind: codex` で、まだ `agentSession` が無い（または `since` がこの報告の少し前の）pane のうち、cwd が一致するもの」。**穴**: 同じ cwd で、ほぼ同時に起動した 2 つの Codex は区別できない。
2. **pane の Codex（TUI）が、起動時に、自分の pane を daemon に伝える。** Codex の起動を、サーバが包む（`agent start` の経路）なら、`codex --config …` で環境をツールに渡せるか。Codex の仕様次第（未調査）。
3. 当面の運用: Codex の daemon を、使う pane で起動し直す（`codex` を使う最初の pane が親になる前提を崩さない）。復旧しても、2 つ目以降の pane は誤る。→ **根本は 1 か 2**。
4. どれでも、**誤った pane に付けないための歯止め**（件 B の案）は先に要る（f0b545a5 が持っていた別の会話を上書きした）。

---

## 件 B: Claude Code の pane（79b64b7c）の参照が、別の会話に書き換わっていた

### 事実（確かめたこと）
- **再現した**（一時のサーバ。pane に対し、`agent-report.sock` へ、本来の会話 A、続けて子の会話 B の `session_start` を送る）:
  - A を報告 → `agentSession = A`。B を報告 → **`agentSession = B`**（`reportedAt` も更新。保存した `session.json` にも B）。
  - サーバを止めて、立て直す → `agent resume command written … session 22222222`（B の先頭 8 文字）→ 3 秒後に、子の偽の `claude --resume B` が「No conversation found」で終わる → **12.8 秒後に `agent session dropped (agent gone, shell alive)`**（`graceMs 10000`）。利用者のログ（書き込み → 13 秒後に dropped）と同じ並び。
- **上書きの場所**: `composeServer.ts` の報告の受け口 → `SessionService.reportAgentSession(paneId, kind, sessionId)`（`SessionService.ts:1320` 付近）。**無条件に** `model.setAgentSession` し、`agentGoneAt` も消す。**報告した側が誰か（プロセス・pane の前面のエージェントか）を、何も確かめない**。`AgentReportSocket` も、1 接続 1 行の JSON を読むだけ（`SO_PEERCRED` を使っていない）。
- フックは、`SODA_PANE_ID`（pane のシェルの環境から、子の `claude` も引き継ぐ）だけで、pane を決める。子の `claude`（tmux の中・`claude -p`・Bash ツールから起動したもの）のフックが `session_start` を送れば、親の参照が替わる。**一時のサーバでは、偽の報告で再現した。実物の子の `claude` で起きたことは、利用者の記録（3d55e5c6 が `~/.claude/projects/-tmp-claude-1000--workspaces-sodashitsu-…-t0-A/` にある）から言える。**
- 今の `~/.claude/settings.json` の `SessionStart` の matcher は `startup|resume`。子の `claude`（新しく起動）は `startup`、`claude --resume` なら `resume` で、どちらも通る。
- **このセッション自身の環境変数**（フックの子プロセスも同じ）: `CLAUDE_PID=1803184`（実際の `claude` の pid と一致を確認）・`CLAUDE_CODE_SESSION_ID`・`CLAUDE_CODE_CHILD_SESSION=1`・`CLAUDECODE=1`。`CLAUDE_PID` は、フックの `session_start` が **自分の親の `claude` が誰か**を示す材料になる（未文書の可能性があるので、「あれば使う」の扱い）。
- サブエージェントの数え方（`SubagentTracker`）: 会話ごとに別に持つ（`pane.sessions` が `sessionId` をキーにする）。**参照のように上書きはしない**が、`current(paneId)` は全会話のサブエージェントを足す。**入れ子の子の `claude` が自分のサブエージェントを動かすと、親の pane の件数に混ざる**（取り違えの別の形。親の `SessionStart` が先でも、`SubagentStart` の `sessionId` が別なら、別会話として足される）。

### 直し方の案（比較）
| 案 | 中身 | 防げる | 穴（正しい報告を落とす・防げない） | 費用 |
|---|---|---|---|---|
| **A. 報告したプロセスの確認（勧める）** | フックが、自分の親の `claude`（`CLAUDE_PID`。無ければ、`/proc` で最も近いエージェント名の祖先）の pid を報告に足す。サーバは、その pane の前面のエージェントのプロセス（`ForegroundJob` で `match` した、グループリーダー／いちばん浅いもの）と一致するときだけ受ける。一致しなければ、ログに 1 行（`agent report ignored: not the pane's front agent`）で捨てる | tmux の中・`claude -p`・Bash ツールから起動した子（pid が違う）。Codex の daemon（pid が pane の外。誤った pane に付かない） | pid の取れない環境（Windows。`CLAUDE_PID` が無く `/proc` も無い）は、この確認ができない → 受ける（今までどおり）。ラッパー越しの起動（`npm`→`node`→native）で「前面のエージェント」がどれか曖昧な場合は、グループ内の祖先に含まれるかで見る。**正しい上書きを落とす場合**: 親の `claude` が `/resume`・`/clear`・compact で会話を替えるときは pid が同じなので落ちない（落とさない）。親の `claude` を再起動した直後の報告は、検出（最大 1 周期）より先に届くと「前面のエージェントが無い」で落ちる → 落とさず保留して、次の検出で再判定する（要作り込み） | 中（フックの報告に 1 項目・サーバの確認・保留） |
| **B. 制御端末の確認** | フックが、自分の制御端末（`/proc/self/stat` の `tty_nr`）を報告し、サーバは pane のシェルのものと比べる。違えば捨てる | tmux の中（別の pty）・daemon（端末なし） | 同じ pty を共有する入れ子（`!claude`・`script` を使わない直の子）は防げない。Windows は不可。`tty_nr` が取れない環境は受ける | 小〜中 |
| **C. 参照があり、エージェントが生きている間は、`startup`・`resume` で上書きしない** | サーバだけの変更。`agentSession` があって `pane.agent !== null` なら、`source` が `startup`/`resume` の報告を捨てる。`clear`・`compact`・`fork` だけを通す | 子が `startup` で来る形 | **正しい上書きを落とす**: 親の `claude` で `/resume`（`source: resume`）して別の会話へ移った場合、フォークで matcher を広げたあとの新しい参照が落ちる。子が `claude --resume` だと `resume` で、そもそも区別できない。エージェントが検出される前（起動直後）の報告は受けるので、子が先に始まれば上書きする | 小（ただし穴が大きい） |
| **D. フック側で、入れ子を見て報告しない** | `TMUX` が立っている・`-p`・`CLAUDE_CODE_CHILD_SESSION=1` のとき報告しない | tmux の子・`-p` | **`CLAUDE_CODE_CHILD_SESSION=1` は、この pane のふつうの `claude`（`sodactl agent start` で起動したもの）でも立っている**（このセッションで確認）ので、目印として使えない。tmux・`-p` だけの対症。子の `claude` が tmux 外の直の子なら通ってしまう | 小（効果が小さい） |
| **E. 参照の履歴を持つ** | 上のどれにも足す。pane ごとに直近 3 件の `agentSession` を保存（再開には最新だけ使う）。失敗したら、一つ前を試せる | 取り違えた後の復旧（本来の `26785c34` が残る） | 取り違えそのものは防がない | 小 |

**勧める**: **A**（フックが親の `claude` の pid を報告し、サーバが pane の前面のエージェントと突き合わせる）＋ **E**（直近の参照を残す）。Codex の daemon の問題（件 A）も、**A の「pid が pane の前面のエージェントの子孫でなければ捨てる」で、誤った pane に付かなくなる**（正しい pane へ付ける仕組みは、件 A の案 1・2 が別に要る）。**C は、正しい `/resume` を落とすので勧めない。D は効果が小さい。**

### 再開が失敗したとき、参照を捨ててよいか
- **捨てるのでよい**（捨てないと、再起動のたびに、失敗する `claude --resume` を打ち込む）。ただし、**今は足りないものがある**:
  1. **ログに理由が残らない。** `agent session dropped (agent gone, shell alive)` に、どの会話か・再開コマンドの失敗か・利用者が終わらせたのかが無い（`graceMs`・`kind` だけ）。「No conversation found」は画面の中にしか無い。
  2. **本来の会話の id が、上書きされた時点で失われている**（今回は `26785c34`。利用者の記録に残っていた）。
- 直し方（小）: ログに `session`（先頭 8 文字）・`sinceResumeWrittenMs`（`resumeWrittenAt` からの時間）・`resumeAttempted: true` を足す。これで「再開を打ち込んでから 13 秒で居なくなった＝再開の失敗」と読める。さらに E（履歴）。画面から「No conversation found」を拾って理由にする案は、エージェントごとの文言になり脆いので勧めない。

---

## 件 A のもう 1 つの確認: 「捨てる弱さ」（#122 の後でも、10 秒より長く「居ない」と見えたら捨てる）が実際に起きるか
- **事実**: `AgentTracker.update` は、`kind === null`（前面のジョブから種類が決まらなかった）の周期で、**すぐに** `agent` を `null` にする（猶予が無い）。そのあと、`AGENT_GONE_GRACE_MS`（10 秒）の間、再検出が無ければ参照を捨てる。判定が**失敗・時間切れ**した周期は、何も更新しない（`null` にしない）ので、この道には入らない（22:31Z の時間切れ 2 件で agent は残った）。
- **推測**: 前面のプロセスグループが、エージェントのものでなくなる（子がターミナルの前面を取る・`foregroundJob` が `null` を返す）周期が 10 秒続くと捨てる。Codex・Claude Code の通常の子のコマンド（Bash ツール）は、pty を渡さず、エージェントのグループのままなので、起きにくい。**実物で長いコマンドを前面で動かして確かめてはいない**（この調査では、記録に起きた形跡も無い。#122 以後の `dropped` は、利用者の件 B の 1 件だけ）。`SessionStart` が 1 回しか来ない（以後の再検出で戻らない）弱さは、コードのとおり。直すなら、「`agent` が戻った周期に、`agentSession` を捨てる前の参照を、同じ種類なら復活させる」（捨てた参照を短い間だけ保持する）。

## 残った不確かな点
- Codex のフックが daemon の中で動くことの、Codex の実装・文書による確認（上は、実測の状況証拠のみ。強いが、直接ではない）。
- 件 B の案 A の `CLAUDE_PID` が公式の値かどうか（このセッションでは、実際の pid と一致した）。無ければ、`/proc` の祖先をたどる。
- Windows での pid・制御端末の確認。
- 子の `claude` の実物（tmux 内）での再現は、していない（偽の報告での再現）。

---

# 追補: AC7 の確かめ（Codex 0.162 のフックと daemon。実物で）


## 先に報告: 調べの途中で、利用者の環境に 1 つ、意図しない変更をした
- Codex の対話画面（TUI）を、擬似端末から動かしたとき、**起動の最初の画面の「更新しますか」に、自分が Enter を送ってしまい、「Update now」が選ばれた**（`npm install -g @openai/codex`）。
- 結果: **fnm の Node 24 の全体の置き場（`~/.local/share/fnm/node-versions/v24.15.0/installation/lib/node_modules/@openai/codex` と `…/bin/codex`）の Codex が、0.162.1 に入れ替わった**（`~/.npm/_logs/2026-10-09T23_54_11_707Z-debug-0.log` に記録。もとの版は、その時点で消えたので、確かでない）。
- 影響: シェルで fnm の Node が PATH の先頭にあるとき、`codex` はこの 0.162.1 になる（`/usr/bin/codex`＝システムの 0.162.0 とは別）。daemon の自動更新が使っているのも 0.162.1（動いている daemon の releases に `0.162.1` がある）なので、実害は小さいはずだが、**私が起こした変更なので、報告する**。元に戻す必要があれば、`npm install -g @openai/codex@<元の版>`（fnm の Node で）。`~/.codex` と `/usr/lib/node_modules` は、変えていない（`auth.json`・`hooks.json`・`config.toml` は読んだだけ）。
- 一時の `CODEX_HOME`（`/tmp/claude-1000/cx`）に、`auth.json` の**複製**を作って使った。終わって、`shred` で消し、ディレクトリごと消した。そこで起動した daemon・待ち受けは、止めた。

## 確かめた事実（実物の Codex 0.162.0/0.162.1 で）
一時の `CODEX_HOME` に、利用者の `hooks.json` と同じ内容を置き（信頼のハッシュは、`hooks.json` のパスに依らず同じ値で通った）、フックの `command` の `node` を、記録する包みに差し替えて、観察した。

1. **対話画面の `codex` は、daemon の窓口（クライアント）で、会話は daemon が持つ。**
   - `codex --help`: `agents  Browse all agent sessions on the shared local app-server daemon`（公式の説明）。
   - 最初の `codex`（`SODA_PANE_ID=PANE-TUI-A`）が、daemon（`codex app-server --listen unix:// --managed-daemon` と `daemon pid-update-loop`）を起動した。**daemon の環境は、`SODA_PANE_ID=PANE-TUI-A`・`SODA_AGENT_REPORT_SOCKET=…`（起動した `codex` から受け継いだもの）**（`/proc/<pid>/environ`）。daemon は、init の子（ppid 301）になって残る。
   - TUI は、daemon に `thread/start`（会話の開始）などを要求するだけ（daemon のログ: `app-server request: thread/start … transport=unix_socket`）。`hooks/list` も、daemon が答える。終了のとき「Disconnected from this task. Any running work continues.」と出て、会話は daemon に残る。
2. **2 つ目の `codex`（`SODA_PANE_ID=PANE-TUI-B`）のフックの報告は、`paneId: PANE-TUI-A`（daemon の環境）で届いた。**
   - 本物のスクリプト（`soda-agent-report.cjs`）の報告: `{"paneId":"PANE-TUI-A","kind":"codex","sessionId":"01a12318-…"}`（実行したのは B の `codex` の会話）。
   - 包みの記録: `SODA_PANE_ID=PANE-TUI-A`。フックの祖先: `node(フック) ← codex(daemon, tty0) ← init の中継（301）`。**B の `codex`（TUI）は、祖先に居ない。**
3. **フックの入力（stdin）の形**: `{"session_id","transcript_path","cwd","hook_event_name":"SessionStart","model","permission_mode","source":"startup"}`。`cwd` は、その会話の作業ディレクトリ。**`SessionStart` は、TUI を起動した直後ではなく、最初のターン（最初の入力を送ったとき）に出る**（TUI 起動の約 18 秒後。入力を送った時刻）。
4. **`codex exec`（非対話）は、daemon を使わない**（プロセス内で動く）。フックは、実行した本人の環境で動く（`SODA_PANE_ID=PANE-EXEC` で届いた）。
5. 実際の事故の記録（`~/.codex/sessions/…01a12154….jsonl`）と一致する: 会話の中の `sodactl pane current --current` が、daemon の `SODA_PANE_ID`（閉じた pane）を返した。**会話の中のツールの環境も、daemon の環境**。
6. app-server の API（`codex app-server generate-json-schema`）: `thread/start` の引数に、`cwd`・`config`（任意の object）・`serviceName`・`threadSource` はあるが、**クライアント（TUI）の環境変数・pane・pid を渡す項目は無い**。

## 推測（確かめていない）
- `-c shell_environment_policy.set.SODA_PANE_ID="…"`（`codex` の起動引数）が、会話の**ツール**の環境に効けば、`sodactl --current` の取り違えは直せる。ただし、フックの環境にも効くかは不明（フックの環境は daemon のものに見える）。利用者が自分で `codex` を打つ場合は、引数を足せない（サーバが `codex` の起動を包む `agent start` の経路だけ）。
- TUI → daemon の接続の相手の pid（`ss -xp` で、daemon の control socket の接続元）と、daemon の `thread/loaded/list` を、サーバが読めれば、「どの pid の TUI が、どの thread か」を対応づけられるかもしれない（未調査。API の `thread/loaded/list` に接続の情報があるか）。

## 正しい pane に付ける方法（案。実装していない）
- **前提（AC1）**: 報告のフックの親をたどって、pane の前面の `codex` の子孫でなければ捨てる。daemon（init の子。tty なし）は、どの pane の前面にも居ないので、**別の pane を上書きしなくなる**。ただし、正しい pane にも付かない（結果: Codex の会話は、再起動で再開されない。今と同じ。上書きの害だけが消える）。
- **案 1（突き合わせ）**: 報告の `cwd`（フックの入力）・時刻と、`kind: codex` で `agentSession` が無い（または、報告の `session_id` が違う）pane を、サーバが突き合わせる。**1 つに決まるときだけ付ける**（決まらなければ捨てて、ログ）。
  - 穴: 実際の事故は、**同じ cwd（`/workspaces/yukkuri-work`）の 2 つの Codex pane**。cwd では決まらない。`SessionStart` は最初のターンに出る（起動直後でない）ので、時刻（`agent.since`）での絞り込みも、粗い（先に起動した pane が、あとで最初のターンを打つこともある）。→ **案 1 は、この利用者の使い方では、決まらないことが多い。**
- **案 2（pane の TUI から、会話を知る）**: サーバが、pane の前面の `codex`（TUI）の pid と、その TUI が daemon に張っている接続（`ss -xp`／`/proc/<pid>/fd` の unix socket）を、daemon の thread（`thread/loaded/list` ほか）と突き合わせる。**未調査**。daemon の control socket を、サーバが読む形になり、Codex の内部 API に依存する（実験的な機能）。壊れやすい。
- **案 3（会話の開始を、サーバが包む）**: `sodactl agent start`（サーバが pane に `codex` を打ち込む経路）では、`codex --config 'shell_environment_policy.set.SODA_PANE_ID="…"'`（ツールの環境）を足せる可能性。利用者が手で打つ `codex` には効かない。
- **案 4（終了のときの `codex resume <id>` を拾う）**: TUI は、終了のとき画面に `codex resume <thread id>` と出す（今回の実験で確認）。**サーバが、pane の画面（mirror）の終了の文言から、参照を得る**。終了のとき（居なくなる直前）だけなので、サーバが止まる処理の前に Codex が先に終わる（#122 で直した形）場合や、kill のときは、得られない。補助としては使える（`codex resume` の画面表示は、安定した文言）。
- **勧め（監督役の決定）**: まず AC1（誤った pane に付けない）。そのうえで、**案 4（終了の文言を拾う）＋案 2 の調査**を、別の作業として。案 1 は、同じ cwd の複数 pane で決まらないので、勧めない。daemon の環境を直す案（daemon を、pane ごとに別の `CODEX_HOME` で動かす）は、利用者の `~/.codex` の履歴を分けてしまうので勧めない。
- **すぐできる運用上の手当て（利用者向け）**: Codex を使う最初の pane が daemon の環境を決める。daemon を、いまのサーバの pane から起動し直す（`kill` して、使う pane で `codex` を起動する）と、その pane の報告は正しく付く。2 つ目以降の pane は、それでも誤る（AC1 後は、捨てる）。
