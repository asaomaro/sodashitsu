# 要件: agent skill ファイル（wtmctl の使い方をエージェントに教える Markdown）と、pane の中から wtmctl を使うための環境変数・自分の pane への操作の歯止め

## 背景 / 課題

`wtmctl` は workspace・tab・pane・エージェントを外から操作できる（`docs/wtmctl.md`）。pane の中で動くコーディングエージェント
（Claude Code・Codex 等）がこれを使えば、隣の pane でテストを走らせて結果を読む・別のエージェントを起動して作業を頼む、といった
協調ができる。しかし今は:

- エージェントが wtmctl の使い方を知る手段が無い。利用者が毎回説明するか、エージェントが `--help` から推測するしかなく、
  `agent prompt --wait` の意味・`timeout` の後に送り直してはいけないこと・自分の pane を閉じてはいけないこと等の「使い方の作法」は
  伝わらない。herdr は `skills/herdr/SKILL.md` を配り、`herdr --skill` で出せる（decisions.md D1）。
- pane の中の wtmctl は、サーバが既定以外のポート（名前付き session・`--port`）で動いていると、`--url` を渡さない限りそのサーバに
  つながらない（既定は `http://127.0.0.1:7780`）。エージェントは自分がどのサーバの pane の中にいるかを知る手段が無い
  （pane の環境にあるのは `WTM_PANE_ID` だけ）。
- pane の中のエージェントが、誤って自分の pane を閉じる・自分の pane へ文字を打ち込む（自分の入力欄に prompt を注入する）・
  自分の pane に直結する（出力が自分に返って流れ続ける）・自分の pane でエージェントを起動することを止めるものが無い。

## 目的 / ゴール

- エージェントに skill ファイルを入れるだけで、そのエージェントが pane の中から wtmctl で隣の pane・エージェントを扱う作法
  （確かめてから操作する・ID は応答から読む・送り直さない・自分が作っていないものを閉じない等）を知っている状態。
  skill ファイルは使っている wtmctl と同じ版のものがコマンド 1 つで手に入る。
- pane の中で wtmctl を打てば、何も設定しなくてもその pane を動かしているサーバにつながる状態（名前付き session・別ポートでも）。
- pane の中の wtmctl が、自分の pane（とそれを含む tab・workspace）を閉じる・自分の pane へ入力する・自分の pane に直結する・
  自分の pane のエージェントへ prompt／キーを送る・自分の pane でエージェントを起動する操作を、既定では断る状態（意図してやるときの抜け道は残る）。
- pane の環境に秘密（token・session cookie）が入らない状態。

（`.aidev/charter.md` はこの PJ に無い。）

## ユーザーストーリー

- US1: pane の中で動くコーディングエージェントとして、wtmctl で隣の pane を作ってテストを走らせ・結果を読み・別のエージェントに
  作業を頼む手順と、やってはいけないことを知りたい。なぜなら、利用者に毎回説明してもらわずに、安全に協調できるから。
  （受け入れ: AC1, AC2, AC3, AC4）
- US2: 利用者として、使っている wtmctl に合った skill ファイルをコマンド 1 つで取り出し、自分のエージェントに入れたい。
  なぜなら、wtmctl の版と説明が食い違わないから。（受け入れ: AC5, AC6, AC16）
- US3: pane の中のエージェント（や利用者）として、`--url` を渡さなくても、その pane を動かしているサーバにつながってほしい。
  なぜなら、名前付き session や別ポートのサーバでも skill の手順がそのまま動くから。（受け入れ: AC7, AC8, AC9, AC10, AC16, AC17）
- US4: 利用者として、pane の中のエージェントが誤って自分自身の pane・tab・workspace を閉じたり、自分の入力欄へ文字を打ち込んだり
  しないでほしい。なぜなら、作業中のエージェントが自分を壊して作業が失われるのを防げるから。（受け入れ: AC11, AC12, AC13, AC14, AC16）
- US5: 利用者として、pane の環境変数に token 等の秘密が入らないでほしい。なぜなら、pane の中の任意のプロセスやエージェントの
  会話の記録に秘密が流れないから。（受け入れ: AC9, AC15）

## スコープ

### 対象

- wtmctl の使い方をエージェントに教える Markdown の skill ファイル（リポジトリに置き、wtmctl と一緒に配る）。
- skill ファイルを標準出力に出す `wtmctl skill`。
- pane の環境変数に「その pane を動かしているサーバの URL」を入れることと、wtmctl がそれを既定の接続先に使うこと。
- サーバが起動した環境から受け継いだ wtmctl の設定（接続先・token）を pane の環境へ渡さないこと。
- pane の中の wtmctl が自分の pane への破壊的・自己参照的な操作を断る歯止め。
- `docs/wtmctl.md`（skill の入れ方・環境変数・歯止め・herdr との違い）・`docs/herdr-parity.md`（H39）の更新。

### 対象外

- 呼び出し元 pane を既定の対象にする系（herdr の `--current`・`pane split` の対象の省略・`pane current`・workspace／tab の ID の環境変数）。
  skill は `"$WTM_PANE_ID"` を明示して使う（decisions.md D1）。
- token を持たない pane の中からの自動ログイン（状態ディレクトリの token を読む等。decisions.md D3）。
- skill の配布の仕組み（herdr の `npx skills add` 相当のレジストリへの登録）。
- 歯止めを安全の境界にすること（認証済みの接続は今までどおりどの pane にも書ける。歯止めは誤操作を止めるだけ）。
- 本物のエージェント（Claude Code 等）に skill を入れて振る舞いを確かめること（この環境では確かめられない。未検証の穴として残す）。
- herdr の skill の `worktree`・`notification`・`--machine`・`pane wait-output` 等、本製品に無いコマンドの説明。

## 機能要件

- FR1: skill ファイルは、Claude Code 等の skill の形（先頭に `name`・`description` の front matter）の Markdown で、少なくとも次を教える:
  (a) 最初に pane の中にいるか（`WTM_PANE_ID` があるか）を確かめ、無ければ止まって利用者にそう伝える、
  (b) 使えるコマンドと、構文の正典は `wtmctl help`（使っている版）であること、
  (c) ID（workspace・tab・pane）とエージェントの名前・状態（working／blocked／idle／done／unknown）の意味と、ID は応答の JSON から読むこと、
  (d) 自分の pane は `WTM_PANE_ID` で分かること、
  (e) 隣の pane を作ってコマンドを走らせ・出力を読む手順、エージェントを起動して prompt を送り・終わるのを待ち・結果を読む手順、承認待ちの扱い、
  (f) 作法: 自分が作っていない workspace・tab・pane を閉じない、`timeout`・`agent_prompt_stalled` の後に確かめずに送り直さない、
  承認・質問のダイアログ（`blocked`）には利用者に確かめてから答える、token をコマンド行・会話に書かない、
  (g) 認証されていない（`unauthenticated`）ときは、利用者に自分の端末で `wtmctl login` を打ってもらうよう頼んで止まる、
  (h) 自分の pane への操作の歯止め（`self_target`）と、その意味。
- FR2: skill ファイルに書いたコマンドは、その版の wtmctl に実在するもので、wtmctl の全コマンドが skill ファイルのどこかに出てくる
  （テストで食い違いを検出する）。
- FR3: `wtmctl skill` は、サーバにつながずに skill ファイルの内容をそのまま標準出力に書き、終了コード 0 で終わる。余分な引数・未知のオプションは
  使い方の誤り（終了コード 2）。
- FR4: サーバは、pane を起動するとき、その環境に `WTM_SERVER_URL`（その pane を動かしているサーバへ wtmctl がつなげる URL）を入れる。
  待ち受けのアドレスが全インタフェース（`0.0.0.0`・`::`）ならループバック、それ以外は待ち受けのホスト、ポートは実際に待ち受けているもの、
  スキームは TLS なら `https`。URL にできない待ち受け（ゾーン付きの IPv6 等）では入れない。
- FR5: wtmctl の接続先は `--url` → `WTMCTL_URL` → `WTM_SERVER_URL` → 既定 `http://127.0.0.1:7780` の順に決める。
- FR6: サーバは、自分が起動した環境から受け継いだ `WTMCTL_URL`・`WTMCTL_TOKEN` と、サーバが管理する `WTM_PANE_ID`・`WTM_SERVER_URL`・
  `WTM_AGENT_REPORT_SOCKET` の古い値を pane の環境へ渡さない（サーバが管理する変数はサーバが入れた値だけが pane に届く）。
- FR7: pane の中の wtmctl（`WTM_PANE_ID` と `WTM_SERVER_URL` があり、接続先の URL の origin が `WTM_SERVER_URL` の origin と一致する）は、
  次の操作の対象が自分の pane（`WTM_PANE_ID`）、またはそれを含む tab・workspace のとき、その操作の要求（`pane.close`・`pane input`／`pane run` の入力のフレーム・`pane.attach`・`tab.close`・
  `workspace.close`・`agent.prompt`・`agent.send_keys`・`agent.start`）を送らずに `self_target` のエラー（終了コード 1）で断る。判定に要る
  状態の読み取り（接続時の snapshot）は行ってよい:
  `pane close`・`pane input`・`pane run`・`pane attach`・`tab close`・`workspace close`・`agent prompt`・`agent send-keys`・`agent start`。
  これ以外のコマンド（`pane read`・`pane split`・`snapshot`・`watch`・`workspace create`／`rename`・`tab create`・`agent list`／`get`／`wait`／`read`／`rename`・
  `skill`・`login`）は断らない。
- FR8: 歯止めは、`WTM_PANE_ID` を空にして打てば効かない（人が自分の pane を意図して閉じる等のための抜け道）。エラーのメッセージはそれを案内する。
- FR9: 接続先の URL の origin が `WTM_SERVER_URL` の origin と違う（`--url`／`WTMCTL_URL` で別のサーバを指した）なら、歯止めは効かない（別のサーバの同じ ID の pane を
  誤って断らない）。
- FR10: `docs/wtmctl.md` に skill の取り出し方・入れ方・pane の環境変数・接続先の優先順位・歯止めと抜け道・herdr との違いを書き、
  `docs/herdr-parity.md` の H39 を更新する。

## 非機能要件 / 制約

- pane の環境に秘密（token・session cookie）を入れない（decisions.md D3）。
- 既存の wtmctl の振る舞い（pane の外での接続先・出力・終了コード）を変えない。
- skill ファイルはリポジトリで版管理し、ビルドした wtmctl と同じ版のものを `wtmctl skill` が出す（別の場所から取ってこない）。
- 既存の docs の流儀に合わせ、利用者向けの文書は日本語。

## 完了条件 (受け入れ基準)

- [ ] AC1: skill ファイルに front matter（`name`・`description`）があり、FR1 の (a)〜(h) の各事項が書かれている（レビューで各項を突き合わせる）。
- [ ] AC2: skill ファイルが最初に `WTM_PANE_ID` の有無を確かめ、無ければ止まるよう指示している。
- [ ] AC3: skill ファイルの手順の中の `wtmctl <コマンド> <サブコマンド>` がすべて wtmctl に実在する（テスト）。
- [ ] AC4: wtmctl の全コマンド（`wtmctl help` の一覧の各行）が skill ファイルに出てくる（テスト）。
- [ ] AC5: `wtmctl skill` がサーバにつながずに skill ファイルと同じ内容を標準出力に出し、終了コード 0 で終わる（ビルド済みの wtmctl で確かめる）。
- [ ] AC6: `wtmctl skill extra`・`wtmctl skill --x` は終了コード 2。
- [ ] AC7: 待ち受けが `127.0.0.1:<port>`（http）のサーバが起動した pane の環境に `WTM_SERVER_URL=http://127.0.0.1:<実際のポート>` が入る（ポートはサーバが実際に待ち受けているもの）。
- [ ] AC8: URL の組み立て: `0.0.0.0` → `127.0.0.1`、`::` → `[::1]`、`::1` → `[::1]`、`localhost` → `localhost`、TLS なら `https`、ゾーン付きの IPv6 は入れない。
- [ ] AC9: サーバの環境に `WTMCTL_URL`・`WTMCTL_TOKEN`・古い `WTM_PANE_ID`・`WTM_SERVER_URL`・`WTM_AGENT_REPORT_SOCKET` があっても、pane の環境には
  `WTMCTL_URL`・`WTMCTL_TOKEN` が無く、`WTM_*` はサーバが入れた値（report の socket が無ければ `WTM_AGENT_REPORT_SOCKET` は無い）。
- [ ] AC10: wtmctl の接続先の優先順位が FR5 のとおり（`--url` > `WTMCTL_URL` > `WTM_SERVER_URL` > 既定）。
- [ ] AC11: pane の中（`WTM_PANE_ID=p1`・接続先が `WTM_SERVER_URL` と同じ origin）で、`pane close p1`・`pane input p1 x`・`pane run p1 x`・
  `pane attach p1`・`agent prompt <p1 のエージェント> x`・`agent send-keys <p1 のエージェント> esc`・`agent start n --kind claude --pane p1` が
  `self_target`（終了コード 1）で断られ、エラーのメッセージが `WTM_PANE_ID` を空にする抜け道を案内し、サーバに操作の要求（`pane.close`・`pane input`／`pane run` の入力のフレーム・`pane.attach`・`agent.prompt`・`agent.send_keys`・`agent.start`）が届かない。
  エージェントを名前で指しても同じ。
- [ ] AC12: `tab close <p1 を含む tab>`・`workspace close <p1 を含む workspace>` が `self_target` で断られ（メッセージは AC11 と同じく抜け道を案内し、
  `tab.close`・`workspace.close` の要求はサーバに届かない）、別の tab・workspace は閉じられる。
- [ ] AC13: `WTM_PANE_ID` が空・無い、`WTM_SERVER_URL` が無い、または接続先が `WTM_SERVER_URL` と別の origin のときは、同じ操作が断られない。
  別の pane（`p2`）が対象なら断られない。
- [ ] AC14: FR7 で断らないとしたコマンド（例: `pane read p1`・`pane split p1`・自分の pane の `agent get`／`wait`／`read`／`rename`）は断られない。
- [ ] AC15: pane の環境変数の組み立てに token・cookie が入らない（AC9 と同じテストで、サーバの token が pane の環境のどの値にも含まれないことを確かめる）。
- [ ] AC16: `docs/wtmctl.md` に skill の取り出し方・入れ方（Claude Code・skill の仕組みの無いエージェント）・pane の環境変数・接続先の優先順位・
  歯止めと抜け道・herdr との違いが書かれ、`docs/herdr-parity.md` の H39 が更新されている。
- [ ] AC17: pane の外（`WTM_PANE_ID`・`WTM_SERVER_URL` が無い）での wtmctl の既存のテスト（接続先・出力・終了コード）が、期待値を変えずに通る。

## 未確定事項 / 確認したいこと

- なし（環境変数の名前・pane の中にいる印・歯止めの置き場は decisions.md D4 で決めた）。
