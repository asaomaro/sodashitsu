# 判断の記録（20260927-multi-host-machines）

## D1: 着手の判定・ユーザーの決定・profile・research を挟む理由（2026-09-27・requirements）

- 背景: backlog `product-roadmap.md`「複数ホストの集約: herdr の remote / several machines 相当」を autonomous で進める（主エージェント経由のユーザーの依頼。
  worktree `feature/multi-host-machines`、main 97affb8 から）。依存 `20260918-web-terminal-multiplexer` は deliver 済み。
  **ユーザーの決定（主エージェントが伝えた指示をそのまま記す）**: herdr の形で実装まで進める。手元の `wtm serve` が SSH で他のマシンの `wtm` サーバに繋ぐ
  （各マシンは自分のサーバ・session・プロセスを持つ）。`wtm machine add/list/rename/enable/disable/remove`（保存は不透明な id・名前・SSH の宛先・リモートの session・
  有効かだけ。パスワード・鍵は持たない。認証は OpenSSH、裏の接続は `ssh -o BatchMode=yes` で非対話）。サイドバーはマシンごとに workspace をまとめる。
  選んだマシンだけが pane の画面・入力・大きさを流し、ほかは workspace・エージェント・通知の状態を送る。切れたマシンは薄い最後の状態を出し、最大 2 分の間隔で自動で繋ぎ直す。
  `wtmctl --machine <label|id>` で CLI を送る。大きいので最初の一切れを届け、残りは backlog の `[ ]` に残す。設計上ユーザーが決めるべき構造の問いが出たら、
  具体的な破綻の例つきで選択肢を記して design で止まり報告する。安全: 新しいネットワークの待ち受けを作らない、システムの `ssh` を引数の配列で（宛先を検証し `-` 始まりを拒否）、
  リモートのコマンドは固定、リモートの出力は信用しない（形の確かめ・大きさの上限）。UI には相互作用の受け入れ基準。テストは偽の `ssh` でよい。
  負荷試験・E2E はしない。
- 決定: profile は full（新しい通信の経路・SSH の起動・サーバの受け口・ブラウザの UI を足す＝安全面と横断的な影響があるため light ではない）。
  **research を挟む**（`protocol.md`「4.5」の 5 条件のうち 4 つに当たる: (1) 未検証の既存挙動に依拠する——`WsGateway` を中継の接続に使えるか、ブラウザの
  `Connection`・`TerminalRegistry`・既読の印が接続の行き先の切り替えに耐えるか、(2) 技術的実現性——SSH の標準入出力の上の多重化、リモートの認証の方法（token は
  ハッシュでしか保存されていない）、(3) 影響が横断的——protocol・server・web・cli の 4 パッケージ、(4) 利用者が操作する部品（サイドバーのマシンのまとまり・切り替え）を作る）。
- 理由・代替案: research を挟まずに design へ進む案は、リモートの認証の方法（`auth.json` は token の salt と hash しか持たない＝平文の token を読めない）を
  design の途中で発見して方針を組み直す危険があるので採らない。
- 影響: research.md で既存の構造と herdr の一次資料を確かめてから design に進む。

## D2: 最初の一切れの範囲（2026-09-27・requirements）

- 背景: herdr の several machines は、登録・裏の接続・切り替え・キーボードでのマシンをまたぐ移動・モバイル・通知・自動の導入/更新・`--remote`・`--machine` の網羅・
  画像の貼り付け・SSH の設定の自動の追加（ControlMaster・keepalive）・bridge の無通信時の片付けまでを含む。1 PR に収めると検証しきれない。
- 決定: 登録簿と CLI・中継（`wtm bridge` と受け口）・手元の接続の管理（繋ぎ直し・生きているかの確かめ・登録簿の反映）・`/ws` の行き先の選択・サイドバーのマシンごとの
  まとまりと切り替え・切れたときの薄い表示・`wtmctl --machine`（全コマンド。手元の `wtm serve` 経由）を対象にする。モバイル・ほかのマシンの通知（トースト・OS 通知・音）・
  キーボードでのマシンをまたぐ移動・自動の導入・`--remote`・直接の SSH での `wtmctl --machine`・画像の貼り付け・Windows のリモート・画面からの登録は backlog に残す。
- 理由・代替案: (a) 採用: 利用者が「全マシンを 1 画面で見て、切り替えて打てる」を最小で満たす範囲。(b) 却下: 登録と CLI だけ（画面に出ない）では US1・US2 の価値が出ない。
  (c) 却下: 通知・モバイルまで含める——通知は pane の id がマシンをまたいで衝突するため、通知の待ち行列・既読の印をマシンごとに分ける設計が要り、
  範囲が倍になる。サイドバーの状態の印（入力待ち等）でまず見える。
- 影響: requirements の対象外に並べ、deliver で backlog に `[ ]` の行として残す。

## D3: リモートの認証は受け口の権限（0600）に任せる。token のファイルは読まない（2026-09-27・design）

- 背景: ユーザーの指示は「リモートの token のファイルをリモートの側が読み、手元に写さない」。research F1: `auth.json` は token を `{salt, hash}` でしか持たず、平文の token が無い。
- 決定: リモートの `wtm serve` が状態ディレクトリに `bridge.sock`（Unix ドメイン socket・0600）を置き、`wtm bridge`（SSH でログインした同じ利用者）がそこへ繋ぐ。受け口に繋がった接続は認証済みとして扱う。
- 理由・代替案: (a) 採用: herdr も同じ（リモートの bridge はローカル socket へ繋ぐだけ。F3）。秘密を増やさず、手元へ何も写さない。ユーザーの意図（リモートの側だけで認証・写さない）を満たす。
  (b) 却下: 平文の token を別のファイルに保存して bridge が読む——ブラウザのログインの秘密そのものをディスクに増やす。(c) 却下: bridge がセッション id を `auth.json` に書き足す——動いている `wtm serve` の
  認証のファイルを別プロセスが書き換える（`StateDirLock` の外での書き込み・競合）。
- 構造の問いとしてユーザーに戻すか: 戻さない。ユーザーが示した方式は実現できないが、意図は同等以上に満たせ、破綻の例（どちらかを選ばないと壊れる具体の場面）が無いため。PR 本文と報告で明記する。
- 影響: `bridge.sock` は Windows では置かない（Windows のマシンはリモートにできない。backlog）。

## D4: 登録簿は状態ディレクトリの根に 1 つ（2026-09-27・design）

- 背景: 名前付き session は根の下の `sessions/<名前>/` にそれぞれの状態を持つ。マシンの登録を session ごとにするか根に 1 つにするか。
- 決定: 根（`--state-dir` を省けば既定の根）の `machines.json` に 1 つ。どの手元の session の `wtm serve` も同じ登録を読む。
- 理由・代替案: herdr の登録簿はクライアントの状態（利用者に 1 つ）で session ごとではない（F23）。session ごとにすると session を増やすたびに登録し直しになる。
  2 つの手元の session が同じマシンへ繋ぐと SSH が 2 本になるが、害は無い。
- 影響: `wtm machine … --state-dir` は根を指す（`wtm session list` と同じ）。

## D5: `wtmctl --machine` は手元の `wtm serve` を通す／`wtm bridge` は `WTM_SESSION` を読まない（2026-09-27・design）

- 背景: herdr の `--machine` は CLI が自分で SSH を張る（開いた UI は要らない）。wtm では手元の `wtm serve` が既にマシンへの接続を持っている。
- 決定: `wtmctl --machine <sel>` は手元の `/ws?machine=<sel>` に繋ぐ（手元の `wtm serve` が動いていて、そのマシンが繋がっている必要がある）。直接の SSH は backlog。
  `wtm bridge` は `--session` だけを見る（ssh の先の環境変数で思わぬ session を選ばない）。
- 理由・代替案: 直接の SSH の形は、CLI に中継の手元の側（枠・多重化・生きているかの確かめ）を複製するか server パッケージを依存に入れる必要があり、この一切れの検証の範囲が倍になる。
  `/ws` のクエリなら全コマンドが 1 か所の変更で送れ、既存の認証・session のキャッシュをそのまま使える。
- 影響: docs に「手元の `wtm serve` が要る」と herdr との違いを書く。

## D6: SSH の既定のオプション（2026-09-27・design）

- 決定: `-T`・`BatchMode=yes`・`NumberOfPasswordPrompts=0`・`ConnectTimeout=10`・`ConnectionAttempts=1`・`ServerAliveInterval=15`・`ServerAliveCountMax=4` を付け、`StrictHostKeyChecking` は付けない。
- 理由・代替案: herdr は `StrictHostKeyChecking=yes` を付ける（F22）。付けると利用者が `~/.ssh/config` で選んだ `accept-new` を上書きする。付けなくても BatchMode の下では未知のホスト鍵は
  確かめられず失敗する（要対応）ので、黙って受け入れることはない。
- 影響: 未知のホストは `ssh <宛先>` で先に鍵を受け入れてもらう（docs）。

## D7: 要対応でも最大の間隔で繋ぎ直しを続ける（2026-09-27・design）

- 背景: herdr は Attention のマシンをクライアントの再起動まで繋ぎ直さない。wtm では手元の `wtm serve` は長く動き続ける（再起動の機会が少ない）。
- 決定: attention は理由を出したまま 120 秒ごとに試す（リモートで `wtm serve` を起動した・鍵を ssh-agent に入れた、が自然に反映される）。
- 理由・代替案: 試さない形は `wtm serve` の再起動を強いる。120 秒ごとの 1 回の ssh は負荷として小さい。
- 影響: docs に書く。

## D8: 選んでいないマシンの行は平らな一覧（グループなし）・折りたたみはメモリだけ（2026-09-27・design）

- 決定: ほかのマシンの workspace は、そのマシンの並び順の平らな一覧（手動グループ・worktree の自動グループで畳まない）。マシンの折りたたみはブラウザのメモリだけ。
- 理由・代替案: グループまで写すと `Sidebar.vue` の行の組み立て（`groupedWorkspaceRows`・折りたたみの記憶）を要約のストアでも回す必要があり範囲が広がる。herdr は各マシンのグループの折りたたみを尊重するが、
  最初の一切れでは切り替えれば今までのグループの表示になる。
- 影響: backlog に「ほかのマシンの行のグループ表示」を残す。

## D9: research F28 の訂正と、design の独立点検の反映（2026-09-27・design）

- research の初稿 F28 は「古い `wtm` は知らないコマンドでヘルプを出して 0」と書いたが、実際は `cliArgs.ts:49` の `ConfigError` で終了コード 2（`main.ts` のヘルプの分岐は `help` だけ）。
  research.md を訂正し、design の失敗の分類は「目印が来ないまま 0・1・2 で終わる」を非互換にした（どちらの版でも要対応になる）。
- design の独立点検（ラウンド 1・15 件）で決めたこと: 見出しからの切り替えはそのマシンの記憶を消してサーバの focus を表示（AC9）、選択の消失でローカルへ戻るときは選べるかの確かめを飛ばす（`force`）、
  失敗の分類の判定の順、送り待ちの上限はチャネルごとに数える（write の callback）、枠の decoder は 1 枠の規則だけを見て状態の要る規則は受け口・Link が持つ、チャネル番号は再利用しない、
  試みの間は状態を変えない、online は「接続済み」と出す、モバイルの 1 列の画面ではマシンの機能を使わない、smoke の偽の `ssh` は PATH の先頭に置くスクリプト。

## D10: design の独立点検ラウンド 2（6 件）の反映と上限（2026-09-27・design）

- 反映: `wtm bridge` の終了コード 1（繋げないその他の失敗）を定義し非互換・繋げないの分類に含めた／`classifyLinkFailure` の入力に HELLO を受けたか・時間切れの種類を足し、HELLO の後の終了は常に transient／
  切り替えの `workspace.focus` は世代つきの `pendingFocus` で最初の `onOpened` に 1 回だけ／要約の状態の印は pane の `AgentInfo` の `instanceId` から引く／選べるかの判定を `isSelectable` 1 つにまとめる／
  `wtmctl` の 503 の文言に「起動中」を含める（要件 AC6 の 503 は変えない）。
- 点検の上限（`maxDocCheckRounds`=2）に達したので 3 巡目はしない。残る疑問は review に委ねる。

## D11: architecture の独立点検の反映と上限（2026-09-27・architecture）

- ラウンド 1（10 件）・ラウンド 2（4 件）を反映: `WsServerWs` は router の関数だけを受け、`relayToMachine` を包むのは `composeServer`／`MachineSummaryClient` はコールバックだけ／
  `MachineSwitcher` の ports を design の手順に揃え `onOpened` を公開／`main.ts`（配線）と既存の口・`ActionDispatcher`（切り替えはしない）の行を足した／
  `MachineProfile` の型と規則を純粋な `machineRules.ts` に分けた（`MachineLink`・`sshArgs` が fs を持つ登録簿を取り込まない）／状態図に target・session の変更と初回の無効化を足した。
- 上限（2 ラウンド）に達した。残りは review に委ねる。

## D12: tasks の独立点検の反映と上限（2026-09-27・tasks）

- ラウンド 1（7 件）・ラウンド 2（3 件）を反映: `getSeenSeqIn`・`forgetStoredView` を T11 へ、T12 は T11 に依存、モバイルと origin の疑いを T13 へ、チャネルごとの送り待ちを T6 へ（AC14）、
  `/ws?machine=` の 400 のテストを T8 とテスト方針へ、`machine.list` の方式のファイルを T8 の対象へ、AC12 を T5・AC9 を T12・AC15 を T10 に足した。上限に達した。
- 進め方の記録: coding の一部（T1・T2・T3・T5 の途中）を tasks の承認より前に書き始めた（待ち時間の間に）。tasks の分解は design・architecture の承認後に確定しており、書いた範囲は分解と食い違わない。

## D13: coding の点検で決めたこと（2026-09-27・coding）

- 中継の受け口は 0700 の一時ディレクトリで待ち受けて 0600 にしてから `bridge.sock` へ rename する（T3 の点検。待ち受けと chmod の間の窓を作らない）。`handoff.sock` は従来どおり（この work の範囲外）。
- 中継の接続は `WsGateway` を通らないので、手元のセッションの失効（ログアウト・token の作り直し）は `composeServer` が持つ「セッション id → 中継の接続」で 4401 にする（T8 の点検の must。design に無かった）。
- `wtm machine` の同時の書き換え（add・rename・remove を別の端末で同時に打つ）は排他をしない——後から書いた方が勝つ。add は確かめの後に読み直すので、長い確かめの間の変更は保つ。既知の制約として docs に書く。
- 宛先の規則を強めた（T5 の点検）: 利用者の部分の `%`（ssh:// で OpenSSH が %xx を戻すのでパスワードを隠せる）・利用者名／ホスト名の先頭の `-`（ssh_config の %r・%h 展開に入る）を拒む。名前は双方向の上書き等の書式の文字も拒む。

## D14: 切れているマシンの行は aria-disabled（無効な部品）として薄く描く（2026-09-27・coding）

- 背景: 全体のテストの `uiTokens.test.ts`（薄い文字は MUTED_TEXT_ALPHA 以上。対象外は無効な部品・未対応の行・状態の丸）が、切れているマシンの行の 0.5 の薄さを拾った。
  行は T14 の点検で Tab で辿れるよう `disabled` をやめ `aria-disabled` にしたため、対象外の判定（`:disabled`）に当たらなくなっていた。
- 決定: 切れているマシンの行と見出しは「無効な部品」として扱い、対象外の判定に `[aria-disabled="true"]` を足す。見出しの名前・「未接続」の文字は 0.7（MUTED_TEXT_ALPHA）にそろえる。
- 理由: 無効な部品は WCAG の対比の対象外（既存の判定と同じ扱い）。薄い表示は要件（AC11「最後の状態を薄く」）。
