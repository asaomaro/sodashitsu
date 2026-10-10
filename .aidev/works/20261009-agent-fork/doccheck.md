# agent-fork 文書の点検結果（実装前）

点検日 2026-10-09 / 対象: `.aidev/works/20261009-agent-fork/` の requirements・design・tasks・research / 突き合わせたコード: worktree `agent-fork`（origin/main + 文書）。
文書・コードは変えていない。重さ: **[必須]** 直さないと実装できない（書いたとおりには作れない・誤り）／ **[推奨]** 直したほうがよい／ **[記録]** 記録だけ。

要約: 必須 6 件。多くは「design が、いまは CLI 側にある仕組みをサーバにあるものとして書いている」「protocol の検証が非 strict」「`reconcileGraph` の役割の取り違え」。安全面は、UUID の形だけを通せばコマンド行の注入は起きない（下の S1）。大きな穴は無いが、**新しい worktree の最初の知らせ**（手が空くのを待つ仕組み・信頼ダイアログ）が最も不確かで、実物での確かめが T5（最後）に置かれているのが危ない。

---

## 必須

### M1. 「`agent.start` の中の処理を呼び、検知を待つ」「手が空くのを待って送る」は、サーバに無い（CLI 側にある）
- 根拠:
  - `AgentStarter.start` は **打ち込んだ時点で返る**（`packages/server/src/agent/AgentStarter.ts:287-293`。コメント L184「起動完了は呼び出し側が待つ」）。
  - 検知を待つのは CLI の `StartWait`（`packages/cli/src/agentStartWait.ts:20-58`。`blocked` なら `agent_not_ready` で失敗、`idle/done` で ready）と `runAgentStart`（`cli/src/commands/agentStart.ts:64-139`。`pane.agent_status_changed` を購読）。
  - `agent_pane_busy` の **2 秒の再試行も CLI 側**（`cli/src/commands/agentStart.ts:30-56` の `requestStart`）。サーバは即 `busy` を投げる。
  - design「いまの作り」の「固定の表・引数の引用・起動できる pane の確かめ・**検知の待ち**」のうち、検知の待ちは `agent.start` に無い。
  - `agent.start` は `name` が必須で一意（`AgentStarter.ts:223-224,244`、`AgentStartParams` `messages.ts:950-958`）。design は fork の名前を決めていない。
- 直し方:
  - design に、サーバ内の待ちを **新しい部品として** 書く（`bus` の `pane.agent_status_changed` を購読し、`StartWait` 相当を使う。`StartWait` は client-core か protocol に寄せて共有するのが素直）。「今の仕組みのまま作れる」とは書かない。
  - `agent.fork` 内の busy 再試行（新しい pane でシェルが準備中のとき）を、サーバ側に持たせる。
  - 名前の決め方（`<元の名前>-fork` + 連番。`assertAgentNameAvailable` で衝突を避ける。元に名前が無ければ `fork-<短い id>`）を決める。
  - `blocked` を「失敗」ではなく「起動はしたが手が空かない」として結果に載せる（M1 と S2 の関係）。

### M2. 起動直後の新しい pane は、先頭の Ctrl-C で打鍵を捨てる（実在の事故）。待ち方が design に無い
- 根拠: `AgentStarter.ts` の書き込みは先頭に `INTERRUPT`（`agentStart.ts:16-17,85-87`、200ms 後に行）。既存の結合試験が実際にこれを避けている——`cli/src/agentStart.integration.test.ts:106-110`（`newPane()` のコメント「待たずに起動すると、先頭の Ctrl-C がまだ読まれていない打鍵ごと捨てる」。`cd … && command -v claude > marker` を待つ）。`checkShell` は前面がシェルだけなら available とするので、rc を読み込み中のシェルでも通ってしまう。
- 影響: fork は **作った直後の pane**（`splitPane` / `workspace.create`）へ必ず打ち込む。rc が重い環境（nvm など）では、Ctrl-C が rc の読み込みを中断する・行が消える。結果は「検知されない」まで分からず、AC7 の「理由が分かる」に反する。
- 直し方: シェルが入力待ちになった印を待ってから `start` する仕組みを設計に入れる（出力が静まるのを待つ・プロンプトの印〔OSC 133 や title〕・`pane.busy` 等、既存の手がかりから決める）。無理なら、`agent.start` を「最初の Ctrl-C を送らない」モードにしてよいか（新しい pane は PS2 の打ちかけが無いので不要）を `decisions` に書く。

### M3. T1 の「接続の種類の検査」は、既存の仕組みが無い
- 根拠: `ControlSurface` に接続種別（desktop/mobile/external）で方式を絞る機構は無い（`surface/ControlSurface.ts`・`surface/methods/*` を通して `ctx.kind` の参照なし。`ctx` は `{ clientId }` のみ。種別は `client.ts:9` の `setKind` で画面の大きさ制御用）。`agent.start` も全接続に開いている。ログイン不要の `pane.sock` は `PaneOpRegistry` の **登録制**（`panesocket/PaneOpRegistry.ts:31-53`）で、`agent.fork` を登録しなければ自然に載らない。
- 直し方: T1 と design「接続の種類」から「接続の種類の検査」を外し、「`/ws` の認証済みの全接続が使える（`agent.start` と同じ）。`pane.sock` には登録しない」に直す。AC5 の「ログイン済みから使える」はそのまま成り立つ。試験は「`pane.sock` から `agent.fork` を呼ぶと `unknown_op`」を足すとよい。

### M4. 「余計な項目を足しても断られる」の試験は成り立たない（protocol の検証は非 strict）
- 根拠: 方式の入力は `z.object`（既定の strip）。余計な項目は **黙って捨てられ、断られない**。既存の試験が明記している——`protocol/src/messages.test.ts:67`「未知の項目を持つ形は strict でなく無視される（古いサーバ相当）」。T2 の「方式の入力に、余計な項目を足しても、断られる」は書いたとおりには通らない。
- 直し方: 試験を「`sessionId`・`argv`・`args` を付けて呼んでも、起動の引数に影響しない（捨てられる）」に変える。厳しくしたいなら `AgentForkParams` だけ `.strict()` にして「断られる」にする（その場合、古い CLI が余計な項目を送らないことの確認が要る）。どちらかに決めて AC5 の文言に合わせる。

### M5. 注記の掃除を `reconcileGraph` に置いているのは役割の取り違え。`rekey_node` も抜けている
- 根拠:
  - `reconcileGraph` は **ノードを足す／動かす ops だけを返す**純粋関数で、線は触らず、消す操作を持たない（`client-core/src/graph/reconcile.ts:34-35,98-104`）。閉じた pane のノードを消すのは `GraphPaneCleanup`（`server/src/graph/GraphPaneCleanup.ts:36-38,70` が `remove_node` を出す）、実際に線を消すのは `applyGraphOps` の `remove_node`（`client-core/src/graph/ops.ts:79-84`）。
  - `rekey_node` はノードの鍵を替え、線の `from/to` を付け替える（`ops.ts:85-109`）。**他のノードの `forkedFrom` が古い鍵を指したまま残る**。
  - ノードが reconcile で「作り直される」ことはない（`ops.ts:27` は `{...n}` で未知の項目も保つ。ノードを組み直す所は `ops.ts:70` の `add_node` のみ。ユーザーが外して維持が足し直したノードは注記を失う〔[記録] R3〕）。
- 直し方:
  - design「掃除」を「`applyGraphOps` の `remove_node` で、そのノードを指す `forkedFrom` を外す／`rekey_node` で付け替える」に直す。これで `GraphPaneCleanup`・利用者の削除・`sodactl graph node rm` のすべてを覆う。
  - `validateGraph`（`validate.ts:186-189`）は、`forkedFrom` が **載っていないノードを指していても落とさない**（落とすと `GraphStore.parseGraphFile`〔`GraphStore.ts:136`〕が「壊れたファイル」として退避し、グラフが空になる）。形だけ見る（自分自身を指す・循環は `null` に直して読む、など許容側に）と書く。

### M6. 新しい worktree の枝: ブランチ名が既存だと HEAD から切らない（AC3 と AC7 が食い違う）
- 根拠: `WorktreeService.create`（`git/WorktreeService.ts` の `create`）は、`refs/heads/<branch>` が **既にあれば** `git worktree add <path> <branch>`（そのブランチの先端を checkout）、無いときだけ `-b <branch> <path> HEAD`。他の worktree で使用中なら `worktree_branch_in_use`。使用中でない既存ブランチは **黙って成功**する。
  - AC3「枝は元の workspace のフォルダの `HEAD` から切る」は新規ブランチのときだけ真。fork は「いまの会話が見ているコミット」とずれた先端から始まりうる。
  - AC7「worktree を作れない（ブランチ名の重複）」は、使用中のときだけ。
- 直し方: fork では既存のブランチ名を **断る**（`agent.fork_preview` が `show-ref` で `branchExists` を返し、ダイアログで警告／確定を押せなくする。サーバ側でも `agent.fork` が同じ検査をして `fork_branch_exists`）。または、既存ブランチへ fork する場合は、作成先の表示に「HEAD ではなく <ブランチ> の先端から」と出す。どちらかに決めて AC3・AC7 を直す。

---

## 推奨

### S1. （安全）偽の会話 id で何ができるか — UUID の形だけで、コマンド行の注入は防げる。残るのは「別の会話を fork する」
- 経路: 会話 id の出どころは `agent-report.sock` への報告のみ（`composeServer.ts:739-745` → `SessionService.reportAgentSession` `SessionService.ts:1293-1299`）。受け口は **pane の id も sessionId も検証しない**（`AgentReportSocket.ts:parseReport` は文字列であることだけ。`MAX_ID`〔128〕は subagent の `agentId` だけに掛かる）。報告は pane の実在と kind が連携の kind であることしか見ない。ソケットは 0600（同じ利用者のプロセスだけ）。
- 偽の id を `--resume` に渡してできる悪いこと:
  1. 引数の注入: UUID の形（`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`、大文字小文字を許すなら `i`）なら、`-` で始まらず、空白・引用符・`/`・`.` を含まない。`args` に分けて渡し、`quotePosixArg`（`agentStart.ts:51-53`）で単一引用符に包まれるので、**注入は起きない**。`name`・`.jsonl` の絶対パスを `--resume` に渡す道（research 7 章）も、UUID 限定で塞がる。**現在の `SAFE_SESSION_ID`（`resumeCommand.ts:9`）は `/`・`.` を通すので、fork には流用しない**（design は「UUID の形だけを通す」と書いており、これでよい。試験で `../x`・`a b`・`-x`・UUID に似た 37 文字・改行つきを断ることを足す）。
  2. 別の会話を fork: 同じ OS 利用者の `~/.claude` 内にある他の会話（別プロジェクト・別 pane）の UUID を報告すると、**その会話の内容を持った新しいエージェント**が、利用者の見る pane で起動する。会話の中の秘密が、そのエージェント（と新しい記録）に渡る。逆に、細工した `.jsonl`（同じ利用者が書ける）の UUID を指せば、利用者が「自分のエージェントの fork」と信じる pane に、**細工した会話（指示の注入）**が入る。いずれも、報告を送れる者はすでに同じ利用者のコード実行権を持つので、**新しい権限の昇格ではない**（「今の信頼の範囲」）が、利用者が誤認する点は新しい。
  3. 別の利用者・任意のファイル: id は UUID で `~/.claude`（`CLAUDE_CONFIG_DIR`）の記録名にしか使われず、別の利用者の記録・任意のパスには届かない。
- 推奨する守り（安いもの）: (a) `pane.agent.kind === "claude"` かつ `agentSession.kind === "claude"` を両方確かめる、(b) fork の結果と確認のダイアログに、元の会話 id の先頭 8 文字を出す（取り違えに気づけるように）、(c) 文書に「`pane.agentSession` はフックの報告で、同じ利用者のプロセスが書き換えられる」と限界として書く。記録が実在するかの事前確認は、pane の `CLAUDE_CONFIG_DIR` をサーバが知らないので、**偽陽性が出る（確かめない方がよい）**。

### S2. 新しい worktree の最初の知らせは、信頼ダイアログで `blocked` になるのが常態になりうる。実物での確かめを最初に
- `~/.sodashitsu/worktrees/<repo>/<slug>` は Claude Code にとって初めてのフォルダ。対話で起動すると「このフォルダを信頼するか」などの確認が出る見込み（research は `-p` でしか確かめていない: `research.md` 1.2(d)・「残る問い」）。出れば fork 直後の状態は `blocked` で、`agent.prompt` は `blocked` に送らない（`methods/agent.ts:71`）。60 秒待っても人が答えなければ「送らずに結果に書く」になり、**主要な使い方（worktree fork）で最初の知らせが既定で送れない**ことになる。
- 直し方:
  - T5 の「実物での確かめ（1〜2 回）」を、**T2 の前の調査〔スパイク〕**に前倒しする。確かめる項目: (1) 対話中の実際のセッションを fork できるか、(2) 初めての worktree で信頼ダイアログが出るか（出るなら、`blocked` のときの扱い方を決める）、(3) fork 直後に `idle` に見えるのは会話の読み込みが終わった後か、(4) `/clear` 後の `SessionStart`（source clear）で id が替わるか（research の【未確認】）、(5) 最初のプロンプトを引数で渡す `claude --resume ID --fork-session "<文>"`（research 3 章【未確認】）。(5) が使えれば、手が空くのを待つ仕組み（M1）と貼り付けの問題（S3）をまとめて避けられる。
  - 結果にも `noteStatus: "sent" | "skipped" | "timed_out" | "blocked"` を返す。

### S3. （安全）最初の知らせの文面に埋めるパスの扱い
- 知らせは `agent.prompt` と同じ書き込み（`pastePayload` + `\r`。`methods/agent.ts:77-87`）。bracketed paste が有効なら貼り付けの印は除かれる（`agentInput.ts:20-29`）が、**無効なら本文はそのまま打鍵として届く**。パスに改行があれば、そこで確定し、残りが別の入力になる。ESC などの制御文字も同じ。
- 入りうるパス: 元のフォルダ（利用者のフォルダ名。改行を含むことも技術的には可能）、新しい worktree のパス（`<root>/<repoName>/<slug>`。`repoName` は git 共通ディレクトリ名由来、`WorktreeService.ts` の `repoNameOf`。スラグは `branchToPathSlug`）。ブランチ名は git が制御文字を許さないが、`repoName`・元のフォルダは別。
- 直し方: (a) 文面に埋める前に、パスが制御文字（`hasControlChar` 相当に加えて U+2028/2029）・長さ上限（例 1000）に当たらないか確かめ、当たれば **worktree を作る前に**（`agent.fork_preview` と `agent.fork` の最初の検査で）断る、または「知らせを送らない」に落として理由を返す。(b) 文面中ではパスをバッククォートや JSON の引用で囲み、会話の指示とパスの区別を付ける（フォルダ名に指示が入る注入への軽い備え）。(c) 起動の引数にパスを入れる設計（S2 の (5)）にするなら、`startInput` が制御文字を拒否する（`AgentStarter.ts:228-233`）ので、同じ検査で足りる。

### S4. 同じフォルダの fork: 分割の向き・開く場所・フォールバックを決める
- 「分割の既定の向き」はサーバに無い。`pane.split` の `direction` は必須で、向きはブラウザが決めている（`web/src/actions/ActionDispatcher.ts:836-840`、`PaneSplitParams`）。`agent.fork` の入力に `direction` を持たせる（`sodactl` は既定を決める）か、サーバが元の pane の縦横比で決める。
- 開く場所: ブラウザは `newCwd: this.newCwdFor(null)`（利用者の方針）を渡す（同 L840）。方針が `home` だと、fork は **別のフォルダで**始まる。fork は会話の元のフォルダでなければならないので、`{ kind: "follow" }` 相当（または元の pane の `cwd`）を明示する。`splitPane` が方針のフォールバックで別の場所に回ったら `cwdFallback: true` が返る（`SessionService.ts:743`）。fork はこれを **失敗扱いにして新しい pane を閉じる**（会話が違うフォルダで始まるのを避ける）。
- 呼ぶ道: design は「`pane.split` を呼ぶ」と書く。ハンドラ（`methods/pane.ts:27-37`）は `clients.touch(ctx.clientId)`（色の問い合わせの答え）・`sizeAuthority.noteInteraction`（操作したクライアントの大きさで始める）をやっている。`agent.fork` のハンドラでも、`splitPane`／`createWorkspace` を直接呼ぶなら **同じ 2 行**（`methods/workspace.ts:17-22`、`methods/agent.ts:147`）を入れる。入れないと、新しい pane が既定の大きさで始まる。lineage は呼ばない（S7）。

### S5. 新しい worktree の「元のフォルダ」はどれか。サブディレクトリの扱い
- `worktree.create` が使うのは workspace の「いまの場所」（最初の pane の cwd。`WorktreeService.cwdOf` → `identityCwdOf`）で、fork する pane の cwd ではない（research 4 章も指摘）。注記の「元のフォルダ」・`dirtyCount`・作成先は、どれも **同じフォルダ**で数える必要がある。決めて design に書く（推奨: 元の pane の cwd の `git rev-parse --show-toplevel`。`worktree.create` にその場所を渡せるよう `create` に cwd の引数を足す。足さないなら、「workspace の場所と違う pane は fork（worktree）を出さない」）。
- 元のエージェントが repo の **サブディレクトリ**（例 `packages/server`）で動いていたとき、新しい workspace は worktree の **根**で始まる。会話の相対的な位置とずれる。新しい workspace を `<worktree>/<相対>` で開くか、注記に書く。
- 新しい workspace の最初の pane は起動できる pane か: `workspace.create` は新しいシェルの pane を 1 つ作る（`SessionService.createWorkspace`）ので、`agent.start` の条件（前面がシェルだけ・`agent == null`・予約なし。`AgentStarter.requireIdlePane` L296-306）は満たす。ただし **シェルが POSIX 系でない場合**（fish・pwsh は `unsupported_agent_shell`。`agentStart.ts:22-41,64-77`）と Windows のサーバ（`AgentStarter.ts:246-251`）は断られる。`agent.fork_preview` でも `available:false` とし、worktree を作る **前に**断る（今の design 手順は、worktree 作成後に初めて起動を試す。ここで落ちると半端な worktree が残る）。シェルの種類の検査は `checkShell`（`foregroundJob`）の結果なので、新しい pane を作る前には元の pane のシェルしか見られない——**元の pane の隣のシェルは検査できない**点に注意（M2 の待ちと合わせて、新しい pane で検査し直す）。

### S6. 手順の途中の失敗・競合: 何を残すかを手順ごとに決める
design の「どこかで失敗したら、そこで止め、できたものを結果に書く」だけでは、AC7「半端な状態が残らない」と食い違う。決めたい表:

| 段階 | 失敗 | 残るもの | 推奨 |
| :- | :- | :- | :- |
| 確かめ（元の pane・UUID・claude・シェル・パス・ブランチ） | 何もできていない | なし | すべてここで済ませる（S1・S3・S5・M6） |
| `split` / `worktree.create` / `workspace.create` | 失敗 | 同じフォルダ: なし。worktree: 作成のみ成功なら worktree が残る（AC7 のとおり。`path` を返す） | 結果に `created: { worktreePath?, workspaceId?, paneId? }` |
| 起動（打ち込み）失敗 | 空のシェル pane が残る | 同じフォルダ: **その pane を閉じる**（利用者は何も見ていない） | worktree 側は workspace を残す |
| 打ち込めたが検知されない（古い版・記録なし・`CLAUDE_CONFIG_DIR` 違い） | 空のシェルに claude のエラーが残る | 閉じない（利用者が理由を見る） | 画面末尾（`bottomLines`。`LocalAgentPort` が使う）から `No conversation found`・`unknown option` を拾い、AC7 の理由に写す |
| 元のエージェントが入れ替わった／閉じた | 手順の途中 | 作った pane | 起動の直前に `requireSameAgent` 相当（`methods/agent.ts:48-54`。`instanceId` を保つ）で、元が同じエージェントのままか確かめ、違えば止める |

- 同じ pane を 2 回続けて fork: 会話 id は同じで、別々の fork が 2 つできる（害なし）。ただし worktree では、2 回目が `worktree_branch_in_use`／M6 の `fork_branch_exists` で止まる。画面の二重押しは、元の pane ごとの **進行中の印**（ロック）で弾くとよい（`agent.fork` の同時実行は、AgentStarter の予約〔`beginAgentLaunch`〕の範囲では守れない: 新しい pane ごとに別の予約になる）。
- `soda handoff`／再起動の途中: 実行中の `agent.fork`（待ち・知らせ・注記）は **サーバの中のメモリだけの続き**なので、置き換わる／落ちると、知らせと注記が失われる。打ち込み済みの claude は動き続ける（PTY は引き継がれる）。復元は `pane.agentSession` が未報告（新しい id が来る前）だと、シェルのまま戻る（`resumeCommandFor` が使えない）。許容して文書に書く［記録］。

### S7. グラフ: 注記の入れ方と古い版との互換
- 古いサーバが新しいファイルを読めるか: **読める**。`GraphNodeSchema`（`protocol/src/graph.ts:141-145`）は `z.object`（strip）で、`GraphStore.parseGraphFile`（`GraphStore.ts:130-136`）は `GraphSchema.parse` の結果を使う。`forkedFrom` は読み込みで落ちるだけで、`schema` の番号（`GRAPH_SCHEMA`）は変えないので退避もされない。ただし **古い版が一度保存すると、`forkedFrom` は消えて戻らない**（`writeFile` は strip 後の状態を書く。L318-331）。AC4 の「古い版は注記を無視する」に「その版が保存すると注記は失われる」を足す。
- 新しい版が **`GraphNodeSchema` に `forkedFrom` を足し忘れると**、読み込みで落ち、保存の `GraphSchema.safeParse(full)`（L320）は通るが `full` を書くので書く、読み直すと消える。試験は「保存して読み直しても `forkedFrom` が残る」を足す。
- 古いブラウザ・古い `sodactl`: ブラウザ側は `GraphSchema` を使っていない（`web/` 内に参照なし）ので、未知の項目は無視される。`cloneGraph`（`ops.ts:27`）は `{...n}` で保つ。古い `sodactl graph show --json` はそのまま出すだけ。
- T4 の「古い `GraphSchema` で読める」試験: 古いスキーマの **コピーを試験の中に凍結**して使う（実物の古い版は、変更後には参照できない）。
- 新しい op `set_node_note`（design）: `GraphOpSchema` は `GraphUpdateParams`（利用者の `graph.update`）と **同じ**（`graph.ts:173-196,202-205`）。「利用者の `graph.update` からは受け付けない」は、スキーマを分けるか、`guardGraphUpdate`（`graph/updateGuard.ts`）で拒否する必要があり、`GraphOp` の型（`GraphOpSchema` の推論）にも波及する。**op を足さず、`GraphStore` に専用メソッド**（`recordRun` 型。`commit` で `forkedFrom` だけを書き、rev は +1 して `graph.changed` で配る）にする方が、型・古い版・`applyGraphOps` の `satisfies never`（`ops.ts:143`）への影響が小さい。
- 注記を書く時点でノードがあるか: ノードは `GraphMaintainer` が 50ms の debounce で足す（`GraphMaintainer.ts:51,144-147`）。`pane.created` 直後の `agent.fork` では、まだ無い。`AgentLineage` と同じく **先に `ensureNodes`（`reconcileNow`）を待つ**必要がある（`AgentLineage.ts:175`）。`MethodDeps` に maintainer は無いので、`deps` に足す。ノード上限（手元 512 − 予約 8）で足せないときは、注記なしで成功し、結果に `annotated: false` を返す（fork 自体は失敗にしない）。
- 書く時機: 「新しい pane のノードに書く」は、**打ち込みが受理された直後**（`starter.start` が返った直後）にする。検知（最大 30 秒）まで待ってから書くと、サーバの再起動・handoff で失われる。失敗して pane を閉じたら、`GraphPaneCleanup` がノードごと消すので注記も消える。

### S8. `AgentLineage` に fork を伝える必要は無い（design 手順 4 の後半を外す）
- 自動の監督／承認の線が付くのは、`noteCreated`（`pane.split`／`workspace.create`／`tab.create` のハンドラが `params.callerPaneId` で呼ぶ。`methods/pane.ts:34`・`workspace.ts:22`・`tab.ts:12`）と `noteStarted`（`methods/agent.ts:148`）だけ。`agent.fork` が `SessionService.splitPane`／`createWorkspace` を直接呼び、`deps.lineage` を呼ばなければ、**何も付かない**。`AgentForkParams` に `callerPaneId` を持たせない。
- 注意: CLI 側の `callerPaneParam`（`agent start` が pane の中から呼ばれたとき自動で付ける）を `agent fork` の呼び出しに流用しない。流用しても無視される（スキーマに無い）が、将来の取り違えを避ける。
- design 手順 4 の「`AgentLineage` には、fork であることを伝えて」を削り、「lineage を呼ばない」に直す。試験は「`callerPaneId` つきで呼んでも supervise/approval が付かない」。

### S9. 要件の穴
- **モバイル**: AC1 は「右クリックのメニュー」だけ。モバイルは右クリックが無い（長押し／pane のヘッダー）。入口を要件に書く（ダイアログはスマホ幅で収まるか。ブランチ名・作成先・注意の 3 点が縦に収まる、など）。
- **別のマシンの pane**: ローカルのサーバのセッションに別のマシンの pane は無い（グラフのノードの鍵だけ）。グラフのノードのメニューで `<machineId>:` のノードは「押せない・理由」。AC1 の「別のマシンの pane」はこの意味だと明記。
- **名前付き session**: pane id は session ごとのサーバが持つので問題なし。同じ `~/.claude` を共有するので、別 session の pane の会話 id を使う道は無い（pane id から引くため）。要件の「限界」に 1 行。
- **端末版**: 要件は「対象外（`sodactl` は使える）」。AGENTS.md は `docs/tui-parity.md` に機能の扱いの一覧を持つので、T5 の文書に「端末版での扱い: サーバ機能」を足す。
- **fork する元が「作業中」**: 元が `working`（ツール実行中）のとき、fork は **その時点の記録の写し**（research 1.2(d)：未完了のツール呼び出しは未完了として受け取る）。UI の説明に 1 行。自分自身を fork するエージェント（`sodactl agent fork <自分の pane>`）も同じ状況。
- **確かめようのない基準**: AC7「古い Claude Code（会話の fork に対応していない版）」。サーバは pane の `claude` の版を知らない（`agent.fork_preview` の `claudeVersion` を `claude --version` で取ると、**サーバの環境の `claude`** であって pane の PATH のものとは限らない）。確かめる方法を決めるか、基準を「検知されなければ画面の末尾から理由を拾う」（S6）に変える。AC1 の「会話の id が分からない」の 2 理由（フック未導入／導入前に起動）は、`pane.agentSession == null` と `AgentIntegrationService` の導入状況から分けられる。
- **AC4 と AC3 の食い違いはなし**。ただし AC4「元のノードが無くなったら線は消える（注記は掃除）」は、元のノードを **ユーザーが外しても維持が足し直す**（I1。`reconcile.ts:28`）ので、足し直されたノードに注記は戻らない。「元の pane が閉じた」と「ノードを外した」のどちらでも線が消える、と書く。

### S10. 切り方（PR1 サーバ＋sodactl／PR2 画面）と偽の `claude` での結合試験
- 切り方は妥当。ただし T5 に「対話の実物の確認」が入っているのは遅い（S2）。前倒しのスパイクを T0 として足し、結果で design を直す。T3（worktree＋知らせ）は M1・M2・S2・S5・S6 を抱えて最も大きい。`agent.fork`（同じフォルダ）を最初に出し、worktree の枝を次にして、PR1 の中でも分けられる。T4（グラフの注記）は T2 の後でよいが、`agent.fork` が `forkedFrom` を書く点（S7）で T2 にも触れるので、依存を T2→T4 から「T4 の `GraphStore` の専用メソッドを T2 が使う」に直す。
- 偽の `claude` の結合試験は作れる。前例:
  - `cli/src/agentStart.integration.test.ts`（偽の `claude` = PATH の先頭の bash の `exec -a claude node fake-agent.mjs`。検出は argv[0]、引数の記録、title の `✳` で idle）、
  - `server/src/composeServer.lineage.integration.test.ts`（同じ型）。
- fork 用に偽に足すもの:
  - フックの報告を真似る（pane の環境に `agent-report.sock` のパスがある〔`paneEnv.ts`、`hook` の説明にある `SODA_AGENT_REPORT_SOCKET`〕。`{paneId, kind:"claude", sessionId}` の 1 行 JSON を書く）。元の pane の偽が先に報告して `agentSession` を作る。
  - `--resume X --fork-session` を受けたら、新しい UUID で報告する。
  - 手が空く／`blocked`（信頼ダイアログの画面）の再現は、`ManifestEngine`／`AgentMonitor` の判定に合う画面・title を出す必要がある（既存の偽は title のみ。blocked は判定の文言を調べる）。
  - worktree の試験は実 git（一時リポジトリ）が要る。`worktreeRoot` を試験用に差し替えられること（`defaultWorktreeRoot` は `homedir()`。`DefaultWorktreeService` の `root` 引数で渡せるが、`composeServer` が受けるかは確認。受けなければ `HOME` を一時に替える）。実際の `~/.sodashitsu` を汚さないこと。
- 実物での確かめ（1〜2 回）の費用: research の見積り（1 往復 0.17 ドル）で足りるが、対話で行う都合上、手で行う手順書にしておく。

---

## 記録だけ

- **R1**: 既存の `agent.start` は任意の `args` を受ける（`AgentStartParams`〔`messages.ts:950-958`〕）。AC5「ブラウザから、起動するコマンドの文字列を受け取らない」は **新しい `agent.fork` の口について**であり、`agent.start` 経由で `claude --resume <任意> --fork-session` を打つことは、今も `/ws` の認証済みの接続からできる。AC5 の文言を「`agent.fork` は…」に限定して書く（research の注記と同じ）。
- **R2**: design「いまの作り」の事実の判定。合っている: `GraphNode` は未知の項目を落とす（`z.object`）／`LinkKind` を足すと古い版が退避する（`GraphStore.ts:123-124,176-186` の schema と `parseGraphFile`）／`AgentLineage` は `callerPaneId` つきの作成・起動にだけ線を付ける／サーバは未コミットの変更を知らない（`GitInfo` に無い）／`pane.agentSession` はエージェントが非 null→null になると消える（`SessionService.ts:1152`）／フックの `SessionStart` の新しい id で `agentSession` が替わる（`reportAgentSession`）。誤り・不正確: 検知の待ち（M1）、`worktree.create` が「HEAD から枝を切る」（M6）、`reconcileGraph` が掃除（M5）、「SessionStart の `source`」はサーバに届かない（報告は `source` を持たない。`AgentReportSocket.parseReport`。fork かどうかをサーバは区別しない。fork 側の `agentSession` が正しくなることには影響しない）。
- **R3**: ユーザーが、fork したノードを外す／元のノードを外すと、維持が足し直したノードに注記は無い（線は消える）。undo（`GraphCanvas.vue`）がノードを足し直す場合も同じ。許容してよい。
- **R4**: `agentSession` は **どの agent の instance のものか** を持たない（`AgentSessionRef` は `{kind, sessionId, reportedAt}`。`AgentInfo.since` は状態が変わるたびに更新されるので、`reportedAt` と比べられない）。フックの無い別の claude に直接入れ替わった（`CLAUDE_CONFIG_DIR` 違いなど。null を挟まない）場合、古い id が残りうる。fork が「別の会話」になる。(a) `kind` の両方一致、(b) ダイアログに id の先頭 8 文字、で緩和。
- **R5**: `dirtyCount` は `git status --porcelain` の行数（未追跡を含む。node_modules を無視していないリポジトリは大きく、2 秒で `null` になりうる）。表示は「数えられませんでした」も許す。`GitRunner.run` は時間切れで reject（`WorktreeService.run` のように包む）。
- **R6**: `worktree.create` 後に `recordedPath`（git が記録した実パス）を返すので、注記・`workspace.create` の `cwd` は **返った `path`** を使う（組み立てた文字列を使わない。`WorktreeService.ts` の `recordedPath` のコメント）。
- **R7**: `agent.fork_preview` と `agent.fork` の検査の重複（TOCTOU）: preview は表示用で、`agent.fork` が同じ検査を必ずやり直す（preview を信用しない）。design の「壊れやすい所」に 1 行。
- **R8**: protocol の方式の表（`messages.ts` の `ParamsOf` のマップ。L1128 付近）と、その型の試験・docs の方式一覧に `agent.fork`／`agent.fork_preview` を足す。`sodactl` の `callerPaneParam` は使わない。
- **R9**: `fork` で起こした孫の fork（research 1.2）は、`agentSession` が自動で入るので動く。連鎖の `forkedFrom` は 1 つ前の pane を指す（根までは辿らない）。ノードが 1 つ消えると連鎖は途切れる。
