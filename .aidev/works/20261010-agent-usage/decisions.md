# 決定の記録: エージェントの利用状況（PR1）

調査（`research.md`）と、監督役の決定（`requirements.md`「決めたこと」）の上に、実装で決めた細部を積む。

## D1 数え方（AC3）
- トークンは `message.id`（無ければ行の `uuid`）で 1 回に数える。`model` が `<synthetic>` の行は数えない。主の記録の `isSidechain: true` の行と、`<id>/subagents/agent-*.jsonl` は「サブエージェントの分」。
- `cost-state` が主の記録にあれば、**最後の行**（同じ会話の id のもの）の `modelUsage` の合計を累計とし（`basis: "cumulative"`）、その行より後（時刻が新しい）の記録の分を足す。無ければ、記録に残る分の合計（`basis: "transcript"`）。内訳（`breakdown`）は、いつも「記録に残る分」（主・サブエージェント）。
- `cost-state` の行は時刻を持たないので、**同じファイルで、その行の直前までに見えた最後の `timestamp`** を、時刻の目安（`costAsOf`）にする。形が違う（`totalCostUSD` が数でない・`modelUsage` の値がオブジェクトでない・負の値・別の会話の id）行は、黙って無い扱い。
- コストは `cost-state` の `totalCostUSD` だけ（`costBasis: "cost-state"`・`costAsOf`）。単価の表は持たない。無ければ項目ごと無い。**その後の記録の分のコストは足さない**（`costAsOf` の時点、と明記）。
- モデルは、最後の主の応答の `model`（形を検査して、合わなければ null）。コンテキストは、最後の主の応答の `input + cache_read + cache_creation`。**窓の大きさは記録に出ない**（調査: `claude-sonnet-5-5` の応答で、文脈が 96 万まで使われていた）ので、モデルの id に `[1m]` が付くときだけ 100 万と分かり、率を出す。無ければ、トークン数だけ。

## D2 読み方（AC3）
- ファイルごとに「読み終えた位置」を持ち、増分で読む。1 回の読みは 1 MiB ずつ・1 回の `advance` は 8 MiB まで・間に `setImmediate` で主スレッドを譲る。残りは背景で続ける（`agent.usage` の答えは、最大 1.5 秒までの分を返し、読み途中なら `scanning: true`）。
- 初めて読むファイルが 64 MiB を超えるときは、末尾の 64 MiB だけを読み（最初の途中の行は捨てる）、`partial: true`。1 つの会話の走査で生涯に読む量の上限は 512 MiB。サブエージェントのファイルは 256 まで（超えたら `partial`）。記録を `RECORDS_MAX`（20 万件）で畳むときも `partial`。
- 1 行が 4 MiB を超えるときは飛ばす。途中まで書かれた最後の行（改行が無い）は、次に読む。ファイルが小さくなったら、その会話の集計を捨てて最初から数え直す。
- 結果は、同じ pane・同じ会話の id では 1 秒以上あけて再確認する（`stat` ではなく、開いて増えた分だけ読む。増えていなければ読む量は 0）。PR1 は、呼ばれたときの確認だけ（5 秒おきの背景の確認と `agent.usage_changed` は PR3。呼び手が居る間だけ、という前提が要るため）。
- サブエージェントのフォルダの数え直しは 5 秒以上あけて行う。取れなかった（記録が見つからない）結果は 3 秒覚える。

## D3 場所（AC2）
- 入力は pane の id だけ。会話の id は、サーバが受け入れた `pane.agentSession`（#128 の確かめを通ったもの）だけ。フックの報告の `transcript_path` は、**その会話の id と一致する報告のものだけ**を候補にし、実体のパスが `<根>/<プロジェクト>/<会話の id>.jsonl`（根の直下の 1 段）で、リンクでない通常のファイル・リンク 1 つのときだけ使う。合わなければ、根の下の各プロジェクトのフォルダを、会話の id の名前で探す（5000 フォルダまで）。
- 根は `~/.claude/projects` と `CLAUDE_CONFIG_DIR` の `projects`。
- サブエージェントのフォルダは `<主の記録のフォルダ>/<会話の id>/subagents`。実体が、組み立てた場所と**一致する**ときだけ（リンクで外へ出ない）。
- 共通の I/O（根の実体・`lstat`・`O_NOFOLLOW|O_NONBLOCK`・開いた fd での確かめ直し・範囲の読み）は `agent/safeFile.ts` に切り出し、サブエージェントの窓（`SubagentTranscript.ts`）も使う。窓の動きは変えない（既存の試験が通る）。

## D4 配るもの（AC5・AC7）
- `agent.usage {paneId?}` → `{ panes: { <paneId>: AgentUsage | null }, accounts: AccountUsage[] }`。`paneId` を省くと、対応する種類のエージェントが居て会話の id が分かる pane だけ。指定すると、取れなくても `null` で答える。対応しない種類・記録が読めないものは `null`。
- 配るのは数字・モデル名・時刻・ラベルだけ。ログには、種類と理由の種類だけ（場所・中身・会話の id を出さない）。`pane.sock` には載せない（試験）。別のマシンの pane は、そのマシンのサーバの `agent.usage`（手元は読まない。既存の中継の形で、PR1 は特別な処理を足さない）。
- フックのスクリプトが `session` の報告に `transcriptPath` を足す（全種類）。導入済みは、スクリプトが変わるので「更新が必要」になる（押したときだけ書き換える）。

## D5 切り方
- **Codex（AC4）は、この PR に入れない**: 差分を小さくするため（依頼の指示）。アダプタの枠（`UsageAdapter`）は、種類を足せる形にしてある。`fix/codex-multi-pane` の `lookupCodexRecord` が main に入ってから、同じ探索に揃えて足す。アカウント全体の枠（`accounts`）は、PR1 では空（Claude Code は、報告〔PR2〕からだけ）。

## D6 レビューの直し（U1〜U3・R1〜R6。`usage-pr1-review-result.md`）
- **U1**: 記録の場所は、`reportAgentSession` が**受け入れた**報告のものだけ覚える。`SessionService.onReportAccepted(listener)` を足し、`applyReportedSession`（pid の無い・前面が合う・保留の後で受けた・Codex の daemon の条件つき受け入れの、全部の経路が通る所）の後に呼ぶ。報告の場所は `AgentReportContext.transcriptPath` で運ぶ（保留の間も）。捨てた報告・子の claude・別の pane の分は届かない。実在しない pane の報告は受け入れられないので、覚えの上限（512）を偽の paneId で押し出せない。受け入れた報告に場所が無いときは、前の覚えを捨てる。Codex の PR で、daemon の報告は「受け入れの結果の pane」に結ばれる（同じ形）。
- **U2**: 場所の探索も `PaneState.locating`（約束）を共有する。付ける値は探索の中で 1 回（後から終わった探索が、先の値を null で上書きしない）。`forget`・会話が替わったとき・サーバの停止（`UsageService.close` → アダプタの `close`）で `closed` の印を立て、`drive` のループと `advance` の各ファイル・各チャンクの前で見て止める。
- **U3**: `model` は、先頭が英数字で、英数字と `.`・`_`・`-`・`:` と末尾の `[…]`（英数字 1〜8 文字）だけ。`/` は通さない。
- **R2**: 探索は全部の候補を見て、更新の時刻（`mtime`）が新しいほうを選ぶ。
- **R5**: 走査の生涯の読む量（512 MiB）を、書き換え（reset）での数え直しに**引き継ぐ**（`new ClaudeSessionScan(id, limits, carriedRead)`）。上限に達したら更新を止め、`partial` と `updatesStopped`（protocol の `AgentUsage` に足した省略可の項目）を立てる。
- **R1・R3・R4・R6**: 直さずに、`docs/agent-usage.md` の限界に書いた（先頭の行を取る・`CLAUDE_CONFIG_DIR` が違うと黙って無い・`cost-state` の遅れて書かれたサブエージェントの分・5000 フォルダで探索が打ち切られる）。

## D7 PR3（ダッシュボード）の決め
- **見ている、の知らせ方**: `agent.usage_watch {on: boolean}`（`ClientRecord.watchingUsage`）。`client.view` は PTY の大きさの権限（SizeAuthority）の入力なので、載せない（見えている画面の情報とは別の関心）。サーバは、`WsGateway` の配信で `agent.usage_changed` を `watchingUsage` の接続だけに送る。印は接続の寿命と同じ（接続が切れたら消える。ブラウザは、開き直したら送り直す）。
- **配信の中身**: `agent.usage_changed {panes: Record<paneId, AgentUsage|null>, accounts?: AccountUsage[]}`。前回の確かめと比べて、変わった pane だけ（取れなくなったものは null）。アカウントは、変わったときだけ全部。1 回の確かめで 1 つのできごと。
- **確かめ**: `UsageFeed` が、見ている接続が居る間だけ 5 秒おきに `UsageService.get()` を呼ぶ（中の `stat` の決まりは PR1 のまま）。前の確かめが終わっていなければ飛ばす。見ている接続が 0 になったらタイマーを止め、前回の控えを捨てる（次に始まったときは全部を配る）。サーバの終了で止める。
- **別のマシン**: 画面の接続が向いているマシンの分だけ（`requirements.md` の「決めたこと」）。
- **画面の一般化**: `view.screen` の判定は「基本画面か」に寄せる。グラフ専用の所（グラフの窓の層・空間のタグ・サイドバーの空間の見出し）は、そのまま `=== "graph"`。
- **モバイルの入口**: `MobileShell.vue` に触れない決まりなので、pane のピッカー（全画面の `PanePicker`）に「ダッシュボード」のボタンを足す。全体のメニュー（クラシックのみ。グラフの項目と同じ）にも足す。
