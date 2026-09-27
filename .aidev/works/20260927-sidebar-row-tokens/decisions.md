# 判断の記録（20260927-sidebar-row-tokens）

## D1: 着手の判定・profile・任意工程（2026-09-27・requirements）

- 背景: backlog `product-roadmap.md`「外観と設定の残り（未着手分）: サイドバー行の色の条件付け・独自トークン（H21）」を autonomous で進める
  （主エージェント経由のユーザーの依頼。worktree `feature/sidebar-row-tokens`、main 97affb8 から）。依存 `20260918-web-terminal-multiplexer` は deliver 済み。
  herdr の一次資料（`/workspaces/web-tn-multiplexer/scratchpad/herdr/` の docs `configuration.mdx`「Sidebar row layouts」・`cli-reference.mdx`、
  source `src/metadata_tokens.rs`・`src/app/api_helpers.rs`（`normalize_metadata_*`・上限の定数）・`src/app/api/workspaces.rs`（`handle_workspace_report_metadata` の検査の順）・
  `src/cli/workspace.rs`・`src/cli.rs`（`parse_token_assignment`）・`src/config/sidebar.rs`・`src/config/sidebar/rules.rs`・`src/ui/sidebar/tokens.rs`）を主エージェントが直読した。
- 決定: profile は full（protocol・サーバ・CLI・web の 4 パッケージにまたがり、外から入る値を全ブラウザへ配る＝安全面を含む）。
  research は挟む（`protocol.md`「4.5」の「利用者が操作する部品を作る」に当たる——並びの編集という一覧・並べ替え・入れ子の詳細を持つ部品）。
  architecture は design の終わりに「4.5」の 4 条件で決める。
- 影響: research.md で UI の確立したパターン（本製品の既存の一覧編集の部品を含む）を調べる。

## D2: ユーザーの決定——両方を実装する（2026-09-27・requirements）

- 背景: H21 の残りは (1) 外から押し込む独自トークン（herdr の `report-metadata`）と (2) 行の並び・条件付きの色（herdr の `rows`・`rules`）の 2 つ。
  本製品には利用者が書く設定ファイルが無い（H21 が対象外だった理由）。
- 決定（ユーザー）: **両方を実装する**。(1) は `wtmctl workspace report-metadata <ws> --source ID [--token NAME=VALUE] [--clear-token NAME] [--seq N] [--ttl-ms N]` と
  pane の同等品で、herdr の意味（整え方・80 文字・source の文字種と長さ・TTL 1〜86400000ms・seq で古い報告を無視・対象ごと報告元 32・空の値は消去）を守り、
  サーバに持って全ブラウザへ配る。(2) は**ブラウザの設定画面**で、このブラウザに保存する（ほかの外観の設定と同じ）: workspace 行と agent 行に出すトークンと順
  （本製品に実在する組み込みのトークン＋`$name`）、見た目（`#RGB`/`#RRGGBB` の前景色・太字・薄字）、最大 16 の順序付きの条件（equals/contains/starts_with と
  ignore_case、gt/lt の数、hide）。**既定は今のサイドバーと同じ**にする。値は安全に文字として描き（`v-html` を使わない）、大きさを抑え、認証済みの RPC だけで受ける。
  設定画面には相互作用の受け入れ基準（AC-I1〜I5）を付ける。付随するもの（`machine` トークン等）は backlog に `[ ]` で残す。
- 影響: requirements の対象・AC1〜AC17・AC-I1〜AC-I5。

## D3: 既定の見た目を変えないための、本製品独自のトークン（2026-09-27・requirements）

- 背景: 今の spaces 行の 2 行目は「上流とずれているとき（ahead か behind が 0 でない）だけ、ブランチと ↑↓ の数」を出す（`Sidebar.vue` の `showGit`）。
  herdr の `branch` は「ブランチがあれば常に」、`git_status` は「0 でないときだけ」なので、herdr の既定 `["branch","git_status"]` をそのまま使うと、
  ずれていない workspace にもブランチの行が現れて既定の見た目が変わる。agents 行の 2 行目は、付けた名前（薄めない）・表示名・「未検証」（警告色・薄めない）で、
  herdr の `agent` 1 つでは表せない。herdr は隣り合う値の間に ` · ` を入れ、`git_status` の ↑ を緑・↓ を赤で描くが、本製品は間隔（CSS の gap）だけで区切り、色は付けない。
- 決定: herdr の `branch`・`git_status`・`agent` は herdr と同じ意味で用意し、それとは別に**本製品独自の組み込みのトークン**を足して、既定の並びを
  それで書く: `git`（spaces。ずれているときだけ、ブランチと ↑↓ の数を今と同じ 2 つの要素で）、`name`（agents。付けた名前）、`unverified`（agents。
  検証していないエージェントのときだけ「未検証」）。既定の並びは spaces `[["state_icon","workspace"],["git"]]`、agents `[["state_icon","workspace","tab"],["name","agent","unverified"]]`。
  区切り文字と `git_status` の既定の色は入れない（今の見た目を保つ）。
- 理由・代替案:
  - (a) 採用: 独自のトークンで既定を書く。既定も利用者の並びも**同じ描画の経路**を通るので、「既定を少し変えただけで 2 行目の出方まで変わる」ことが起きない。
  - (b) 却下: 設定が無いときだけ古い描画を残し、設定したら新しい経路で描く。設定画面が既定として見せる並び（herdr と同じ `["branch","git_status"]`）を
    1 つ動かしただけで、ずれていない workspace にもブランチの行が出る——利用者は並びを動かしただけのつもりで、2 行目の出る条件まで変わる。
  - (c) 却下: 本製品の `branch` を「ずれているときだけ」にする。herdr の `branch` と意味が変わり、herdr の設定を写した利用者が「ブランチが出ない」と迷う。
- 影響: docs の H21 に herdr との違い（独自のトークン 3 つ・区切り文字・色）を書く。区切り文字・色は backlog に `[ ]` で残す。

## D4: 独自トークンの値はサーバのメモリに持ち、`Workspace`/`Pane` の項目として配る（2026-09-27・requirements）

- 背景: 値は全ブラウザに配る必要があり、接続し直したブラウザにも今の値が要る。herdr は値を workspace・pane の状態（メモリ）に持ち、期限を 1 つの締め切りで掃く
  （`metadata_tokens.rs`・`sync_agent_metadata_deadline`）。
- 決定: サーバのメモリに持つ。値の一覧は `Workspace.tokens`・`Pane.tokens`（任意の項目。空なら無い）として model に載せ、snapshot と既存の `workspace.updated`・
  `pane.updated` で配る。`session.json` には保存しない（再起動・`wtm handoff` で消える。herdr と同じくメモリだけ）。
- 理由・代替案: 新しいイベント（`metadata.updated`）を足す案は、snapshot にも別の欄が要り、ブラウザ・`wtmctl watch` の両方に新しい受け口が要る。既存のイベントに
  載せれば受け口は増えない。`session.json` の書き出しは項目を名指しで写す（`composeServer.ts` の `toSessionFileData`）ので、model に載せても保存には混ざらない。
- 影響: 対象外に「値の永続化」を置く。

## D5: `wtmctl` の `--token` の見分け方（2026-09-27・requirements）

- 背景: `wtmctl` の `--token` は全コマンド共通の**接続の token**（`--token <TOKEN>`。`cliArgs.ts` の `globalOptsFrom`）。herdr の `report-metadata` は
  `--token NAME=VALUE` で独自トークンを設定する。ユーザーの決定（D2）は herdr と同じ形。
- 決定: `report-metadata` の 2 つのコマンドでだけ、`--token` の値が `=` を含めば独自トークンの `NAME=VALUE`、含まなければ接続の token として扱う。
- 理由・代替案:
  - (a) 採用: 接続の token は `randomBytes(...).toString("base64url")`（`packages/server/src/auth/AuthService.ts`）で `=` を含まない。したがって
    接続の token が独自トークンと読まれて**全ブラウザに表示される**ことは起きず、`NAME=VALUE` が接続の token と読まれることも無い（`=` を必ず含む）。
    herdr のスクリプトをそのまま使える。
  - (b) 却下: `--set NAME=VALUE`・`--clear NAME` のように名前を変える。衝突は無いが、herdr の `report-metadata` を呼ぶフック・スクリプトを写した利用者の
    `--token summary=...` が**接続の token として送られ**、認証に失敗する（値が表示されないうえ、何が悪いか分かりにくい）。
  - (c) 却下: `report-metadata` では `--token` をすべて独自トークンとして読む。`--token <接続の token>` を付けて呼んだ既存の使い方（全コマンド共通の書き方）で、
    `=` の無い値が「NAME=VALUE ではない」として断られ、接続の token を渡す手段が環境変数だけになる。
- 影響: `wtmctl help`・skill ファイル・`docs/wtmctl.md` に見分け方を書く（AC8）。`=` を忘れた `--token summary` は独自トークンにならない——ほかに `NAME=VALUE` が
  無ければ `missing token to set or clear`（2）、あれば接続の token の候補になり、`wtmctl login` のキャッシュが使えるあいだは使われずに捨てられる（報告は成功し
  `summary` だけが出ない）。キャッシュが無ければ認証の失敗（`unauthorized`）。値は表示されないので害は無いが、案内に書く（タスク点検 T5 の指摘で訂正。
  当初「認証の失敗になる」とだけ書いていたが、`withSession` はキャッシュを先に使う——`packages/cli/src/withSession.ts:16-33`）。

## D6: 対象外として backlog に残すもの（2026-09-27・requirements）

- `machine` トークン（複数ホストの対応の着地待ち）・`rows_by_agent`・`row_gap`・`terminal_title_stripped`・`pane report-metadata` の表示名・状態名の上書き
  （`--title`・`--display-agent`・`--state-label`・`--clear-state-labels`・`--agent`・`--applies-to-source`）・区切り文字と `git_status` の既定の色・値の永続化。
- 理由: 本製品にまだ無い情報（machine）か、行の並びと独自トークンとは独立に足せるもの。まとめると 1 つの PR が大きくなりすぎる。

## D7: RPC の `tokens` は `{name, value}` の配列、生の長さに抑えを置く（2026-09-27・design）

- 背景: herdr の API は `tokens` を map（`HashMap<String, Option<String>>`）で受ける。本製品の RPC は JSON を zod で読む。キー名の規則 `[A-Za-z0-9_-]` は
  `__proto__` を通す。
- 決定: RPC の `tokens` は `{name, value | null}` の配列（後が勝つ）。`source`・`name`・`value` の生の長さは 4096、組の数は 256 を schema の上限にする。
- 理由・代替案:
  - (a) 採用: 配列。`{"__proto__": "x"}` の map を zod の record で読むと、組み立て（`obj[key] = …`）がプロトタイプの差し替えになり、キーが黙って消える
    （`__proto__` という名前のトークンを herdr では設定できるのに本製品ではできない、しかも誤りも出ない）。配列なら名前はただの文字列で、順（後が勝つ）も明示できる。
  - (b) 却下: map のまま `__proto__` 等を名前の規則で拒否する。herdr で使える名前が使えなくなる（利用者から見た違いが増える）。
  - 生の長さの抑え: 値は 80 文字に切り詰めるので 4096 を超える値に意味は無いが、抑えが無いと 1 つの要求（WebSocket の上限 4MB）の中で大きな文字列を整える処理を
    毎回させられる。herdr には抑えが無い（違いとして docs に書く）。
- 影響: `wtmctl` の利用者から見た形（`--token NAME=VALUE`）は herdr と同じ。RPC を直接呼ぶ人だけが違いを見る（docs の H21 に書く）。

## D8: 行の並びの設定画面は、既存の tab バー右端の編集と同じ形にする（2026-09-27・design）

- 背景: 並びは「行の並び × 行の中のトークンの並び × トークンごとの条件の並び」の入れ子。research F34〜F36 のパターン（APG の Disclosure・Rearrangeable Listbox、
  OS・VS Code の一覧編集）と、本製品の既存の部品（tab バー右端・キーの割り当て）。
- 決定: 項目ごとの［上へ］［下へ］［削除］と末尾の［追加］、選んだ時点で保存。トークンの見た目と条件は［詳細］の開閉。行をまたぐ移動は無い（消して足し直す）。
- 理由・代替案: D&D での並べ替えはキーボードだけで完結しない（AC-I3）うえ、本製品の設定画面に前例が無い。APG の Listbox（選んでから上下）は 1 次元の一覧向けで、
  入れ子の 3 段には選択の状態が 3 つ要り、どれを選んでいるかが分かりにくい。既存の部品と同じ形なら、設定画面の中で操作が揃う。
- 影響: 行をまたいでトークンを動かすには削除と追加の 2 手が要る（herdr は設定ファイルを書き換えるので制約は無い）。

## D9: 独自トークンの名前の入力欄は、Enter か［追加］で足す（2026-09-27・coding。タスク点検 T10 の指摘で requirements・design を訂正）

- 背景: requirements AC-I2 と design は、文字の入力（色・条件の値・独自トークンの名前）をまとめて「Enter か入力欄を離れた時点で確定、閉じるとき規則に合うものは確定」
  としていた。色・条件の値は保存されている値の編集だが、独自トークンの名前は**足す操作の引数**（保存されている値ではない）。
- 決定: 名前の入力欄は Enter か［追加］で足す。入力欄を離れただけでは足さず、設定画面を閉じるときは捨てる。requirements AC-I2・design の「設定画面」節を訂正した。
- 理由・代替案: 入力欄を離れたときに足すと、［追加］を押そうとして Tab で移っただけで足され、続けて［追加］で 2 つ足される。閉じるときに足すと、
  閉じる操作が意図しない追加を起こす。tab バー右端の「追加する種類」も、選んだだけでは足さず［追加］で足す（同じ形）。
- 影響: なし（保存値の扱いは変わらない）。
