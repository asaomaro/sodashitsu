# research: codex-multi-pane（AC1: 手がかりの確かめ。2026-10-10）

Codex 0.162.1（fnm の Node 24 の `@openai/codex`）。#128 の調査（`20261009-agent-session-attribution/research.md`・`session-attribution-codex.md`）を引く。

## 確かめ方
- 一時の `CODEX_HOME`（scratchpad の `cx`。認証は読める形の複製。終わったら `shred`・削除済み）。**最初の画面を読んでから打った**（更新の問いは出ず、入力欄の画面だった。信頼の問いも無し〔`config.toml` に信頼を書いた〕）。利用者の daemon（`~/.codex`・`/tmp/codex-daemon-1000`）には繋いでいない（一時の `CODEX_HOME` は別の daemon になる。終了後に、その daemon だけを止めた）。会話は 1 往復（「OK と答えて」）。`npm -g` などの全体の置き場は触っていない。
- 擬似端末のドライバ（node-pty＋`@xterm/headless`）で、画面の変化・送った入力・フックの報告（`SODA_AGENT_REPORT_SOCKET` を自前の受け口にした）を、ミリ秒の時刻つきで記録。
- 利用者の動いている Codex（WSL の再起動の直後に Sodashitsu が復元したもの）の `ps` と、会話の記録 `~/.codex/sessions/…`（読むだけ）。

## 手がかり 1: 前面のプロセスの引数 — **成り立つ**
- 復元で打ち込まれた pane（利用者の実際の pane 5 つ）: `node /run/user/1000/fnm_multishells/…/bin/codex resume 01a1231b-281e-7593-9c2b-5f51fd04e427` と、その子のネイティブの本体 `…/vendor/…/bin/codex resume <同じ id>`。つまり `argv[1]=resume, argv[2]=<UUID>`（前面のジョブの全メンバーが持つ。`ForegroundJob` が既に読んでいる）。
- 利用者が起動時の設定を付けた形（`-m … -c … -s … ` の引数）でも、`resume <id>` は先頭にあり、id は `resume` の直後。
- 直前に `codex resume <id>` ではなく、ただの `codex …` で起動した pane（実際の pane 4 つ）の引数には、id が無い（会話は、daemon の中にある）。→ 手がかり 1 は「`resume <id>` で始めた pane」だけ。
- `resume` で再開した会話は、同じ id・同じ記録のファイルに追記される（`01a12326-…` の記録の更新時刻が、再開の時刻に進んだ）。id は替わらない。

## 手がかり 2: 最初の入力の時刻 — **成り立つ**
一時の `CODEX_HOME` で、最初の入力（本文の送信の約 2 秒後に Enter）を送った実測（ミリ秒）:
| 出来事 | 時刻（Enter を 0 とする） |
| :- | :- |
| Enter を PTY へ書いた | 0 |
| 画面が「`• Working (0s • esc to interrupt)`」に変わった | +173 ms |
| **`SessionStart` のフックの報告が、受け口に届いた** | **+407 ms** |
| 応答の表示（`• OK`）・`Worked for 2s` | +2.6 s・+2.7 s |
- 報告の中身: `{"paneId":"PANE-EXP","kind":"codex","sessionId":"01a1235d-a77d-7e90-9c85-266bd8da0aa1"}`（古い版のスクリプト。フックの入力には `cwd`・`source` がある。#128 の確かめ）。報告の `paneId` は、daemon を起動した（この実験では、唯一の）pane のもの。
- **報告は、画面が「動いている」に変わる（約 0.17 秒）より後（約 0.4 秒）に届く**。ただし、サーバの画面の判定は 500〜1000ms の周期なので、報告が届いた時点では、まだ「動き始めた」を観測していないことがある。→ **判定の変化ではなく、「サーバが、その pane の PTY に Enter を書いた時刻」（サーバは、全ての入力がここを通るので、正確に知っている）を使う**。窓は、実測 0.4 秒に余裕を見て 6 秒。
- 2 回目以降のターンでは、`SessionStart` は出ない（#128 の事実 3）。

## 手がかり 3: 終了のときの画面 — **成り立つ（補助）**
`/exit` で終えた直後の画面（そのまま）:
```
Disconnected from this task. Any running work continues.
To reconnect, run:
  codex resume 01a1235d-a77d-7e90-9c85-266bd8da0aa1
Stop the current turn: run codex agents, select this task, and press x.
Token usage so far: total=9,164 input=9,159 (+ 12,160 cached) output=5
```
- `codex` のバイナリの文字列には、別の形 `To continue this session, run:` も含まれる（`strings`。実際に出る条件は未確認）。どちらも、**次の行に `codex resume <UUID>`**。→ 文言（`To reconnect, run:`／`To continue this session, run:`）の次の行だけを拾う。シェルの履歴の `$ codex resume <id>`（打った行）は、文言が無いので拾わない。
- kill・サーバが先に止まる（SIGHUP）では、出るかは未確認。→ 補助にとどめる。
- 前の実行の文言が画面に残るので、検出の時点で画面にあった id は、終了のときに拾わない。

## 手がかり 4: 会話の記録 — **成り立つ**
- 場所: `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-YYYY-MM-DDTHH-MM-SS-<id>.jsonl`（日付は**会話の始まり**の現地時刻。再開した会話は、元の日付のフォルダの同じファイルに追記される）。
- **ファイルは最初のターンで作られる**（最初の行の `timestamp` が Enter の時刻。TUI の起動直後〔入力前〕には無い）。報告（+0.4 秒）の時点では、書かれていることが多いが、遅れうる。→ 検算は、無ければ短い間隔で数回やり直す。
- 先頭の 1 行（`type: session_meta`）は約 23 KB（`base_instructions` が大きい）。**`payload.session_id`・`payload.id`・`payload.timestamp`・`payload.cwd` は、先頭の数百バイトにある**。→ 先頭の 8 KiB だけ読んで、`"id"` が一致することと、`"cwd"` を JSON の文字列として取る。
- `payload.cwd` は、会話を始めた作業フォルダ（利用者の記録で、`/workspaces/yukkuri-work`）。`source` は環境で変わる（`cli`・`vscode`）。
- 注意: `sessions` の下は、`CODEX_HOME`（無ければ `~/.codex`）。pane の中の `codex` の環境の `CODEX_HOME` は、サーバの環境と違うことがありうる（pane のシェルが設定した場合）。→ 見つからなければ「確かめられない」（2 の道では付けない）。

## 結論
手がかり 1〜4 が成り立つ。1 と 2 のどちらも成り立たない、ではないので、そのまま実装へ進む。使うもの: 1（引数）・2（最初の入力の時刻。判定の変化ではなく PTY への Enter の書き込み）・3（補助）・4（検算）。5（daemon の内部 API）は使わない。
