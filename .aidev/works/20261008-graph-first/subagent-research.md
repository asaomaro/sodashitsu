# 調査結果: グラフにサブエージェントをノードとして出す（設計の材料。コードは変えていない）

調べた版: Claude Code **2.1.295**（この開発機）／ 読んだコード: origin/main（`git show origin/main:…`）。
凡例: **[確認]** = この機で実際に動かして確かめた／コードを読んだ。 **[文書]** = 公式文書。 **[推測]** = 確かめていない。

## 0. 確かめた方法

- **[確認]** 一時の設定 `--settings <scratchpad>/settings.json`（利用者の `~/.claude/settings.json` は触っていない）に、SessionStart・PreToolUse/PostToolUse（matcher `Agent|Task`）・SubagentStart・SubagentStop・Stop・SessionEnd のフックを置いた。スクリプトは stdin を 1 イベント 1 ファイルに書くだけ。`claude -p --model haiku --allowedTools Agent` を **2 回**だけ実行（費用は小さい）。
  - 実行 1: 外側のサブエージェント（前面）が、さらにサブエージェントを起動（入れ子。内側はバックグラウンドで起動された）。
  - 実行 2: 並行に 2 つのサブエージェント（各 `sleep 4` ×3）。実行中の 1.5 秒ごとに、記録ファイルの大きさを見た（動いている間に増えるか）。
  - 記録の置き場所・形式は、できたファイルを直接読んで確かめた。
- **[文書]** https://code.claude.com/docs/en/hooks の前半（約 10 万字）だけ読めた。SubagentStart/Stop/PreToolUse の個別の節は読めていない（ページが長く、後半は未読）。
- **[確認]** 過去の記録 `.aidev/works/20261004-subagent-display/research.md`（2.1.289 での確認）とも突き合わせた。矛盾は無く、下の事実はそれを補う。

## 1. いま、サーバが持っている情報と、捨てている情報

### 1.1 サーバが持つもの（`SubagentInfo`、`packages/protocol/src/model.ts:129`）[確認: コード]
`id`（= Claude Code の `agent_id`、例 `a1322c04d38db5cbf`）・`type?`（agent_type）・`description?`・`background?`・`startedAt`（サーバが報告を受けた時刻）。
`AgentInfo.subagents = {count, items(最大64)}`。メモリだけ（`SubagentTracker`）。pane ごと・session_id ごとに持つ。1 pane 256 件上限。

### 1.2 フックのスクリプトが捨てている情報（`agent-hook-report.cjs`）[確認: コード＋実測]
スクリプトが電文に載せるのは `session_id`・`agent_id`・`agent_type`・（PreToolUse の）description / subagent_type / run_in_background・（Stop の）background_tasks の一部だけ。次は**入力に有るのに送っていない**:

| 項目 | どのイベントに有るか [確認: 実測] | 値の例 |
|---|---|---|
| `transcript_path` | **全イベント** | 親（メイン）のセッションの記録 `~/.claude/projects/<cwdを-で繋いだ名>/<session_id>.jsonl` |
| `agent_transcript_path` | **SubagentStop だけ** | `…/<session_id>/subagents/agent-<agent_id>.jsonl` |
| `cwd`・`prompt_id`・`permission_mode`・`effort` | ほぼ全部 | |
| `agent_id`（PreToolUse/PostToolUse の中） | **サブエージェントの中のツール呼び出しのとき** | 呼び出した側（＝親）のサブエージェントの id |
| `tool_use_id`（PreToolUse/PostToolUse） | Agent 呼び出し | `toolu_…` |
| PostToolUse `tool_response` | 背景起動は起動直後に `{isAsync, status:"async_launched", agentId, description, resolvedModel, outputFile, canReadOutputFile, canContinueAgent}`、前面は完了後に `{status:"completed", agentId, agentType, content[], totalDurationMs, totalTokens, totalToolUseCount, usage…}` | |
| `last_assistant_message`（SubagentStop/Stop） | 最終の返答 | 秘密が入りうる。意図して送っていない |
| `prompt`（PreToolUse の `tool_input.prompt`） | サブエージェントへの指示文 | 同上 |

### 1.3 欲しい 4 つが入っているか（ご質問 (1) への答え）
- **サブエージェントの記録（transcript）の場所**: **SubagentStart には無い**（そこの `transcript_path` は親のもの）。**SubagentStop の `agent_transcript_path` に有る**（＝終わってから分かる）。ただし **[確認]** 場所は決まった形なので、起動時に組み立てられる:
  `dirname(transcript_path) / <session_id> / subagents / agent-<agent_id>.jsonl`（実測で 4 件とも一致）。背景起動の PostToolUse の `outputFile`（`/tmp/claude-<uid>/<同じ名前>/<session_id>/tasks/<agent_id>.output`）は、**同じファイルへのシンボリックリンク**だった（実測）。
- **セッションの id**: 全イベントに `session_id` [確認]（すでに送っている）。`/clear`・再開で変わるかは**未確認**（既存の research も未確認）。
- **エージェントの id**: SubagentStart/Stop に `agent_id` [確認]。
- **親子の関係**: **SubagentStart には親の項目が無い** [確認]。取れる経路は 3 つ [確認]:
  1. **内側の `PreToolUse`(Agent) の `agent_id` = 親のサブエージェントの id**（メインが呼ぶときはこの項目が無い）。実行 1 で、内側の PreToolUse が `agent_id: a1322c04d38db5cbf`（外側）を持っていた。その直後に来る SubagentStart（`a9755183f6b98ec47`）と順序で対にする（既存の「実行前→起動」の対応づけと同じ。実行 1・2 とも、実行前→起動が 1 組ずつ順に来た）。
  2. **`<id>.meta.json`**（記録の隣のファイル）: `{"agentType","description","toolUseId","parentAgentId"(入れ子のときだけ),"spawnDepth":1|2,"requestShape":"foreground|background"}` [確認]。**親子・深さ・説明・前面/背景が、フックを使わずに 1 ファイルで分かる**。ただし**公式の文書に載っていない内部の形**（版で変わりうる）[推測]。
  3. `tool_use_id` で、親の記録の中の Agent 呼び出しの行と結ぶ（記録を読む必要がある）。
  - 入れ子は**起きる** [確認]（haiku の general-purpose が Agent ツールを持ち、内側を起動できた。内側は `spawnDepth: 2`、`requestShape: background`）。`background_tasks` には**内側（深さ 2）も載った** [確認]（外側の SubagentStop の時点で内側が running）。
- 追加で分かったこと [確認]: **`SubagentStop` が早く来ることがある**。実行 1 の内側は、背景起動の直後に「何もすることが無い」と返して SubagentStop が来た（`background_tasks` には自分がまだ `running` で載ったまま）。**停止の報告 1 回で「終わった」と決め打ちすると、`background_tasks` の running と食い違う場面がある**（既存の実装はこの食い違いを Stop で直す作り）。
- 文書 [文書]: `agent_id`「サブエージェントの中でフックが発火するときだけ有る」、`transcript_path` は「非同期に書かれ、メモリ上の会話より遅れることがある」。

## 2. サブエージェントの「セッションに入る」ことはできるか（ご質問 (2)）

### 2.1 外から接続してやり取りする口 — **見つからなかった** [確認: CLI の --help、`claude agents --help`、`claude logs --help`]
- `claude --help` に、Agent ツールのサブエージェントを指定して resume / attach する引数は**無い**。`--resume`・`--continue`・`--fork-session` は**トップレベルのセッション**用。
- `claude --bg` / `claude attach <id>` / `claude logs` / `claude agents` は「**バックグラウンドのセッション**」（`claude` をもう 1 つ起動したもの）の機能で、**Agent ツールのサブエージェントとは別物**。`claude agents --json` が返すのも「interactive and background のセッション」[確認: help の文面]。サブエージェントが載るかは**実機では確かめていない** [推測: 載らない]。
- `--forward-subagent-text`（`-p --output-format stream-json` 専用）は、**Claude Code を SDK として起動した側**が、サブエージェントの本文・思考を `parent_tool_use_id` つきで受け取る口。pane の中で人が使う対話の `claude` には使えない。
- 背景起動の `tool_response` に `canContinueAgent: true` が有る [確認]。これは**親のセッションの中の SendMessage で続きを頼む**ための印と読める [推測]。外から口が開いている根拠にはならない。
- 結論 [推測の混じる結論]: **「入って操作する」は Claude Code 側の口が無く、できない**。ご要望の「入れるなら」は、現実的には**記録を読むだけで追う（読み取り専用の閲覧）**になる。

### 2.2 記録を読んで追えるか — **できる** [確認]
- **場所**: 上の組み立て規則（`dirname(transcript_path)/<session_id>/subagents/agent-<agent_id>.jsonl`）。親の記録とは**別のファイル**で、親の記録には sidechain の行は**混ざらない**（親の jsonl の行を数えて確認: 全部 `isSidechain: false` / agentId なし）。ファイルの権限は `0600`。`.meta.json` は `0644`。
- **動いている間に追記されるか**: **される** [確認: 実行 2]。サブエージェントの起動後 約1.5 秒でファイルが見え、`sleep 4` を挟むたびに大きさが増え（97KB→101KB→144KB→146KB→148KB→151KB…）、終わりまで増え続けた。ただし**書き込みは数秒おきのかたまり**（行ごとにすぐ書かれるとは限らない）。文書も「非同期に書かれる」と言う [文書]。
- **大きさ**: 1 本が最初から **約 100〜150KB**（行数は少ない）。理由は先頭の attachment 行（skill の一覧 5 万字・system prompt の写し・CLAUDE.md の内容など）[確認]。**最初の数行は人が読む価値が低く、巨大**。末尾から読む／種類で飛ばす必要がある。
- **形式**（1 行 1 件の JSON）[確認]:
  - 共通: `type`（`user`|`assistant`|`attachment`|`system`…）・`uuid`・`parentUuid`・`timestamp`・`isSidechain:true`・`agentId`・`sessionId`・`cwd`・`version`・`message`。
  - 人が読む行は 3 種だけ: ① `type:"user"` で `message.content` が文字列（= サブエージェントへの指示文。1 行目）② `type:"assistant"` の `message.content[]` の `{type:"text"|"thinking"|"tool_use", name, input}` ③ `type:"user"` の `content[]` の `{type:"tool_result", content}`（`toolUseResult` は今回は空）。
  - 読まなくてよい: `attachment`（skill 一覧・環境・日付・prompt_snapshot 等。大きい）・`thinking` の中身（署名つき。表示するなら有無の印だけ）。
  - 表示の案: `assistant/text` → 吹き出し、`tool_use` → 「Bash: sleep 4」のような 1 行（`name` + `input.description` または先頭の引数）、`tool_result` → 先頭 N 文字を折りたたみ。
  - 版が変われば形も変わる [推測]（内部の形式）。未知の `type` は飛ばす作りにする。
- 秘密: 記録には**ファイルの中身・コマンドの出力・指示文**が入る [確認: tool_result・prompt が入っていた]。

### 2.3 サーバが「どのファイルなら読んでよいか」の決め方（案。実装は無い）[推測]
- **フックが報告した場所の組み立て規則に一致するものだけ**:
  1. 許す根は、`SubagentStart` 等で受けた `transcript_path`（親の記録）の `dirname` だけ。その pane のその `session_id`・`agent_id` から `…/<session_id>/subagents/agent-<agent_id>.jsonl` を**サーバが自分で組み立てる**（利用者・ブラウザからはパスを受けず、`agentId` だけ受ける）。
  2. `agent_id` は `^[A-Za-z0-9_-]{1,128}$` に限る。組み立てた後に `realpath` で根の下にあることを確かめる（シンボリックリンクで外へ出ない。`tasks/<id>.output` はリンクなので**使わず**、`subagents/` の実体だけ読む）。
  3. 「その pane のエージェントが報告したサブエージェント」だけ（`SubagentTracker` に居る id）。別の pane・居なくなったエージェントの id は断る。
  4. 親の `transcript_path` 自体が信頼できるか: 報告は pane の `agent-report.sock` から来る（`0600`、名乗りは検証されない＝既存と同じ信頼の範囲）。→ 追加で `transcript_path` を `~/.claude/projects/`（`CLAUDE_CONFIG_DIR` も考慮）の下に限る、という**二重の囲い**を勧める。名乗りの偽装で任意のファイルを読ませない（`.../subagents/agent-*.jsonl` という形も固定する）。
  5. 別のマシンのノード: 記録はそのマシンのディスクにある → そのマシンのサーバが読み、`/ws` 越しに配る（ブラウザが直接ファイルを読む設計にしない）。**現行の別マシン経路にこの種の「ファイルの末尾の取得」の口は無い**（要新設）[推測]。
  6. 配るのは**整形・上限つきの抜粋**（1 件 N 文字・全体 M 行）で、全文を既定にしない。ログに中身を出さない（既存の説明の扱いと同じ）。
- 既存の先例（ask の `view`・scrollback・ファイルのリンク `docs/file-links.md`）が、ファイルを読んでブラウザへ渡す仕組みを持つ [推測: 中身は今回読んでいない]。流用できるか要確認。

## 3. グラフにノードとして出すときの、いまの作りとの関係（ご質問 (3)）

### 3.1 いまの作り [確認: コード]
- `GraphNode = {key, x, y}`。鍵は `local:<paneId>`（別のマシンは別の形）。**位置はサーバが保存**する（pane ノード）。上限: ノード 手元 512・別のマシン 64、線 512、`graph.update` 1024 操作。
- ノードは **200×80 固定**、升 240×120、**囲い（workspace / worktree グループ / マシン）は保存せず、ノードの位置の外接 + 余白（見出し 40・周り 20）から毎回導く**。囲いどうしは重ならない規則で、新しいノードの置き場所は空き升を探し、詰むと**囲いごと動かす**（`graphLayout.ts`）。
- サブエージェントは pane を持たず、`SubagentInfo` は `AgentInfo.subagents`（メモリ、pane ごと最大 256、配るのは 64 件）。サブエージェントの `id` は pane id と形が違うので、**`NodeKey` の `local:<paneId>` には入れない**（新しい鍵の種類 `sub:<paneId>:<agentId>` のようなものが要る）。

### 3.2 案（利点と難点）

**案 A: 親ノードの下に「札」を並べる（ノードを足さない）**
- 親ノードの内側／直下に、小さな札（種類・説明・経過）を最大 N 枚（例 6）＋「ほか n 件」。入れ子は字下げ。札はグラフの「ノード」ではなく、`GraphNode.vue` の見た目の一部。
- 利点: 配置の計算（囲い・重なり）に**一切影響しない**／保存・上限（512/64）・線の検査に触れない／ちらつきは親ノードの中に閉じる／いまの `⤷ 件数` ボタンの延長で最小の変更。
- 難点: 「ノードとして繋がりが見える」という要望には弱い（線が無い）。ノードの高さが伸びる（200×80 固定を崩す）か、札を絶対配置ではみ出させて他ノードと重なる／入れ子の木が見づらい／1 枚ずつ選んで「入る」には小さい。

**案 B: 親から枝を出して、小さなノードを置く（置き場所の計算に入れない・重なってよい）** — 導いて描くだけ
- 親ノードの右（または下）に、親の位置から**毎回導く**小ノード（例 120×36）を放射状／縦に並べ、親→子の細い線（保存しない、見るだけの線）を引く。入れ子は子→孫。保存しない（`GraphNode` に載せず、描画のレイヤーだけ）。
- 利点: 要望（ノード＋繋がり）に最も近い／囲い・保存・上限・サーバの検査に触れない／導出だけなので親が動けば付いて動く／一覧の「見るだけ」と相性が良い。
- 難点: 重なりを許すので、親の近くに別ノードがあると**サブエージェントの小ノードが他のノードや線に被る**（`z-index` と間引きで緩和）。数十個では枝が混む（間引き・まとめ札が必須）。ズーム・パン・ヒットテスト・キーボード操作（フォーカス移動）・モバイルの閲覧画面を新設する。親ノード 1 つあたりの「占有」を計算に入れない前提を、囲いの導出（外接）にも入れない（入れると案 C）。

**案 C: 囲いの中に置き場所の計算に入れて置く**
- サブエージェントを本物のノード（`GraphNode`）のように扱い、`graphLayout` の升に載せる（保存しない導出ノードだが、囲いの外接・重ならない規則に含める）。
- 利点: 重ならない／既存の規則どおりで見た目が揃う。
- 難点（大きい）: サブエージェントは**数秒で現れて消え、数十個が同時に動く**ため、**囲いの外接が伸び縮みして他の囲いを押しのける／ちらつく**（「囲いごと動かす」が走る）。保存しないノードを囲いの導出に混ぜると、サーバの `reconcileGraph`・`graph.update` の検査・クライアントの寄せの**3 か所に同じ分岐**が要る。上限 512/64 を食う（食わないなら別の勘定）。**非推奨**。

**推奨（[推測]）**: **案 B を基本に、案 A の「件数・まとめ」を併用**。ノードに足すのは親の下／右の**固定の予約領域**（描画だけ、計算に入れない、最大 N 個、超えは「ほか n 件」の 1 枚）。線は種類を分けた「見るだけの線」（保存する線 `GraphLink` と別の型・別のレイヤー）。サブエージェントの記録の閲覧は、小ノードを選ぶ→右の横パネル（`SubagentPanel` の延長）で読む（案 A/B 共通）。

### 3.3 上限との折り合い
- 案 B/A なら、既存の 512/64/512/1024 を**消費しない**（導出だけ）。サーバ側の持ち数（pane ごと 256、配るのは先頭 64）を、描画の上限（例 12〜16）よりさらに小さく絞る。
- 入れ子を出すなら、`SubagentInfo` に `parentId?`（と `depth?`）を足す必要がある（今は持たない）。経路は 1.3 の 1 か 2。

## 4. 数秒で終わる・数十個が同時に動くものへの手当て（ご質問 (4)）

事実 [確認]: サーバは配る前に **100ms ためてまとめる**（`PUBLISH_DELAY_MS`、最初の変化から。延ばさない）。終了の報告が先に着いた id は「終了済み」を 60 秒/64 件覚えて数えない。`Stop` の `background_tasks` で突き合わせる。実測では、前面のサブエージェントの起動〜終了は約 3〜17 秒、起動の報告は 1 件あたり 数十 ms 間隔。この開発機で数十個が同時に動く実測は**していない**（Workflow・探索の実機は未確認）。

案 [推測]:
- **出現を遅らせる**: 起動から 1〜1.5 秒たってから初めて描く（数秒で終わるものはそもそも出さない）。消えるのは 1〜2 秒遅らせる（終わった印を一瞬出して薄くする）。
- **まとめる**: 同じ種類・同じ親は 1 枚に畳んで「Explore ×12」のように数だけ出し、クリックで開く。上限 N 枚＋「ほか n 件」。
- **並びを安定させる**: 起動順で固定（`startedAt`、同時刻は受けた順＝今の並び）。途中の 1 件が終わっても、他を詰め直さない（空きを残し、一定時間後にまとめて詰める）。
- **再描画を絞る**: 100ms のまとめに加え、描画は `requestAnimationFrame` で 1 フレームに 1 回。「減った」は遅らせて、「増えた」は即時、のように非対称にする。
- **動きを止める設定**: `prefers-reduced-motion` なら、出入りの動きを省く。
- **サーバ側**: すでに 256 件で数えるのを止める。記録の追いかけ（tail）は**開いている 1 件だけ**に限る（全部を監視しない）。

## 5. 確かめられなかったこと・推測のまま

- Workflow ツールのエージェント・チームメイト・「探索」のサブエージェントが SubagentStart を出すか（今回は general-purpose のみ。`Explore` など他の型の `agent_type` と記録の置き場所は未確認）。
- `/clear`・`--resume` でセッション id が変わるか。再開後に `subagents/` の記録が引き継がれるか。強制終了のときのフック。
- 対話（TUI）の `claude` での挙動（今回は `-p` のみ。`requestNonInteractive: true`）。記録の置き場所は同じと推測するが未確認。`CLAUDE_CONFIG_DIR` を使うときの `transcript_path` も未確認（フックの入力の値を信じる設計なので影響は小さいと推測）。
- `.meta.json` が公式の形か、全版で出るか（今回の版では有った。**内部の形**なので、設計の主経路にせず補助にするのが安全）。
- 記録への追記が「行ごと」か「かたまり」か、数百 ms の細かさは測っていない（数秒おきに増えるのは確認）。ディスク上の巨大な先頭行（100KB 超）の扱い。
- 公式文書の SubagentStart/SubagentStop/PreToolUse の節（フックの入力の表）は未読。上の項目は実測が根拠で、文書の裏付けは `agent_id`・`transcript_path` の一般説明だけ。
- 別のマシン越しの記録の取得（口が無い。新設）。Windows のパス・名前付きパイプ。
- 外から「入る」口（resume / attach / SDK）が**無い**という結論は、`--help` の範囲と今回の観察からの判断で、内部／未公開の口までは調べ切れていない。

## 6. 設計に向けた要点（まとめ）

1. 親子と深さ: 内側の `PreToolUse.agent_id`（親）を使えば、フックだけで取れる。`.meta.json` は補助。
2. 記録: 起動時に組み立てられる。サーバが組み立て、`agentId` だけを受け付ける。読み取り専用の「追って読む」までが現実的な「入る」。
3. グラフ: 保存しない描画だけの小ノード（案 B）＋まとめ。囲い・保存・上限に触れない。
4. ちらつき: 遅らせて出す・畳む・詰め直しを遅らせる。
5. 先に要る確認: 入れ子の経路（1 か 2）と、読み取りの境界（2.3）を決めてから、`SubagentInfo` の項目（`parentId`・`depth`・記録の有無）を足す。
