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

## PR2 の決定

| # | 事項 | 決定 |
| :- | :- | :- |
| P1 | 書き換え方 | `settings.json` を読み込んで書き直さず、トップレベルの `statusLine` 1 項目の範囲だけを、文字列のまま差し替える・足す・消す（`statusLineEdit.ts`）。導入 → 外す で 1 バイトも違わず戻すため（書式・インデント・CRLF・BOM・コンパクト・項目の並び）。元が無かったときは、導入が書いた全文（`installedText`）が今と同じなら、元のファイル全体を戻す（ファイルが無かったなら、ファイルごと消す）。違えば、その 1 項目だけを消す。 |
| P2 | 包みのスクリプトは外してもそのまま | 外した後も、動いている Claude Code は、起動した時点の設定のまま包みを呼ぶ。包みは、引数（元の控え）だけで元を動かせるので、**消さない**（フックのスクリプトのように「何もしない中身」には替えない）。 |
| P3 | 保留 | 会話の id が合わない報告も、参照が替わるまで短く保留する（`/clear` の直後は、報告がフックの報告より先に届きうる）。1・3・8 秒の後に、合わなければ捨てる。依頼は「一致しなければ捨てる」。参照の替わりを待つ分だけ、緩い。 |
| P4 | アカウントの鍵 | 包みが、設定のフォルダの**一方向の印**（sha256 の先頭 16 桁）と、別のフォルダのときだけ末尾の名前を送る。サーバが種類と印から不透明な鍵を作る。場所そのものは、送らない・配らない。依頼の「有無」より、同じ機械の複数の設定のフォルダを区別できる。 |
| P5 | 「報告が届いていません」 | 導入済みで、動いている Claude Code の検出から 2 分たち、その後の報告が無いとき。検出の時刻はサーバが覚える（`AgentInfo.since` は状態の変化で変わるため使わない）。 |
| P6 | tokens | 報告の `total_input_tokens` は、いま文脈にある分（累計でない）なので、`contextTokens` に持つ。記録がある pane の `tokens`（transcript）は置き換えない。記録が読めない pane だけ、`tokens` は `basis: "context"`。 |
| P7 | 端末版 | 設定の項目は、ブラウザの設定画面だけ（端末版の設定には出さない。`sodactl agent usage` の表には、出る）。 |

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
- **モバイルの入口**: `MobileShell.vue` に触れない決まりなので、pane のピッカー（全画面の `PanePicker`）に「ダッシュボード」のボタンを足す。全体のメニューには足さない（クラシックの基本画面の画像を変えないため）。
## D7 Codex（AC4。`feature/agent-usage-codex`）
- **探し方は #132 の `agent/codexSession.ts` に寄せた（別に作らない）**: `lookupCodexRecord` の中の日付フォルダの歩きを `findUnbounded` に切り出し、`findCodexRecordFile`（場所だけ返す）を足した。時間切れの包みも共通（`withLookupTimeout`）。アカウントの枠のための `newestCodexRecordFiles`（新しい日付のフォルダから・`maxDayDirs`・`maxFiles` の上限・時間切れつき）も同じファイルに置いた。
- **読み**: `usage/codexRollout.ts`（末尾の窓を逆に・増分・大きく増えたら末尾の窓だけ・小さくなったらやり直し。開くのは `safeFile.openVerified`）。累計は最後の `token_count` の `total_token_usage` 1 つ（足し合わせない）。`info` が null の行は、累計をそのままに、制限だけ新しくする。
- **トークンの割り当て**: `input` = `input_tokens − cached − cache_write`（Claude と同じく、キャッシュでない入力）・`cacheRead` = `cached_input_tokens`・`cacheWrite` = `cache_write_input_tokens`・`reasoning` = `reasoning_output_tokens`・`total` は記録の `total_tokens`。
- **コンテキスト**: 最後の `last_token_usage.total_tokens` ÷ `model_context_window`（式は Codex 自身と違いうる。文書に）。
- **アカウント**: 鍵は `sha256(hostname + "\0" + CODEX_HOME の根)` の先頭 16 桁。ラベルは種類名（`codex`）。いちばん新しい記録は、候補（新しい日付から最大 12 件）を `lstat` の更新時刻で並べた上位 4 件の、最初に `rate_limits` を持つもの。pane の会話の記録が、もっと新しい値を持てば、そちら。結果は 10 秒覚える。`resets_at` を過ぎた枠は `stale`（`UsageWindow` の省略可の項目を足した）。
- **Claude の側の動きは変えない**。`composeServer.ts` は、受け入れた報告の記録の場所を覚えるのを、Claude の分だけにしたまま（Codex は、記録を id で探す。場所は報告から取らない）。

## D8 Codex のレビューの直し（`usage-codex-review-result.md`）
- **指摘 1**: `rate_limits` は `limit_id` が無いか `"codex"` の行だけ使う。ほかは無い扱い（累計の行と別の行に枠がある場合に備え、枠が見つかるまで、小さい窓〔1 MiB まで〕の中では累計の行より前も見る）。
- **指摘 2**: pane ごとに、探索（`locating`）と読み（`reading`）を 1 つの約束として共有する。2 秒で見捨てた読みが続く間は、次の読みを重ねず、同じものを待つ。
- **指摘 3（軽く）**: アカウントの枠の読みは `limitsOnly`（`model`・累計を探さず、枠が見つかった時点で止まる）。枠が無かった記録は、更新の時刻つきで 60 秒覚えて飛ばす。行を文字にする前の絞り・前の窓を読み直さない作りは、記録のまま（文書の限界）。
- **指摘 6**: 読みが投げたとき `refresh()` は false を返す（投げない）。アカウントの枠の探索が失敗したら 3 秒あけてやり直す（前の値は出し続ける）。「大きく増えたとき、窓に無い項目は前の値のまま」と、日数の上限の境界（`findCodexRecordFile` の `maxDayDirs`）の試験を足した。
- **指摘 4・5**: 直さず、`docs/agent-usage.md` の限界に書いた。

## PR2 レビューの直し（usage-pr2-review-result.md）
| # | 事項 | 決定 |
| :- | :- | :- |
| F2 | 孫が残る | 元を `detached: true`（新しいプロセスグループ）で起動し、取り消しはグループへ送る。1 秒で SIGKILL。包みが終わるとき（exit）、元がまだ動いていればグループへ SIGKILL。端末の制御は持たなくなる（パイプで動くので表示は変わらない）。普通に終わった後は、グループに残るもの（利用者の意図したバックグラウンドの更新）は止めない。 |
| F3 | 横のファイルが無いと書式が戻らない | 控えの引数を `{ soda: 1, original, valueText }` にし、値の文字列そのものも載せる。引数が 8 KiB を超える元は、valueText を載せず、それでも超えるなら original も載せず、横のファイルだけに頼る（導入は断らない。外せなくなりうることを文書に）。古い形（元のオブジェクトそのもの）も読める。 |
| F4 | CRLF | 足す行の改行を、ファイルの最初の改行に合わせる（`eolOf`）。 |
| F5 | 待っているだけで「届いていません」 | 検出の後に working になったことのある Claude Code だけを対象にし、最初に動いてから 2 分で判定する。文言は「まだ報告がありません」。 |
| F6 | configKey | 報告が言うままに使う（今回は絞らない）。枠は最新の報告が勝つ。別の pane が既存の鍵で報告したとき、鍵・pane の id・他の pane の数 をログに残す。pane の記録と照らす絞りは後続。文書の限界に書いた。 |
| F7・F8 | stdin・起動の費用 | 3 秒の上限は残す。費用（約 45〜60 ms。送りは並行で最大 200 ms）を文書に。 |
- **クラシックの切り替えのボタンの左右の余白は、3 つ（基本画面・グラフ・利用状況）を既定の 240px に収めるため、1em → 0.6em（tab の 1em より詰まる）。** モダンの余白は元のまま（`--soda-shape-seg-pad-x`。origin/main と同じ）。
- **比べる道具の基準（元）は、基準のコミットの `appServer.ts` を使う**ので、E2E の環境の隔離（`CODEX_HOME`・`CLAUDE_CONFIG_DIR` を空へ）の前後では、その機械の `~/.claude` に依る差（`08-settings-4`。エージェント連携の導入状態）が出る。画面の変更ではない。
