# 判断の記録（20260926-agent-skill-file）

## D1: 実行三層（full）と範囲の選定——skill ファイルと `wtmctl skill`・pane の環境変数（接続先）・自分の pane への破壊的な操作の歯止めを 1 PR にし、呼び出し元 pane を既定の対象にする系は兄弟項目に割る

- **背景**: backlog 項目（`.aidev/backlog/product-roadmap.md` の「エージェント自動化: agent skill ファイル …
  pane の中から wtmctl を使うための環境変数（herdr の `HERDR_ENV` 相当）と安全ガードの検討を含む」。`docs/herdr-parity.md` の H39 の残り）。
  herdr の一次資料（`/workspaces/web-tn-multiplexer/scratchpad/herdr`。以下 herdr）を主エージェントが直読した結果:
  - skill は `skills/herdr/SKILL.md`（214 行）で、**`HERDR_ENV=1` が無ければ止まる**という歯止めから始まる（`skills/herdr/SKILL.md:10-16`）。
    バイナリに埋め込み、`herdr --skill` で出す（`src/main.rs:441-442, 725-729`）。
  - pane の環境には `HERDR_ENV=1`・`HERDR_SOCKET_PATH`・`HERDR_BIN_PATH`・`HERDR_WORKSPACE_ID`・`HERDR_TAB_ID`・`HERDR_PANE_ID` を
    入れる（`src/pane.rs:148-174`・`src/integration/env.rs:28-33`）。CLI は `HERDR_PANE_ID` を `--current` と `pane split` の既定の
    対象に使う（`src/cli/target.rs:203-210`・`docs/next/website/src/content/docs/cli-reference.mdx:227-230`）。
  - 自分の pane を対象にする操作を CLI が止める仕組みは見当たらない（`src/cli` の `caller_pane_id` の使い道は既定の対象の決定だけ）。
  本製品の現状（直読）:
  - pane の環境には既に `WTM_PANE_ID`（と、あれば `WTM_AGENT_REPORT_SOCKET`）を入れている（`packages/server/src/session/SessionService.ts:1039-1043`）。
  - wtmctl の接続先は `--url` → `WTMCTL_URL` → 既定 `http://127.0.0.1:7780`（`packages/cli/src/cliArgs.ts:154-159`）。pane の中の wtmctl は、
    サーバが別のポート（名前付き session・`--port`）で動いていると、`--url` を渡さない限り別のサーバ（か、居ないサーバ）へつなぐ
    （`docs/tls-setup.md:469` が「名前付き session には `--url` を渡す」と案内している）。
- **決定**:
  - 三層判定は **full**（server・cli・docs に波及し、安全面の判断〔環境に何を入れ・何を入れないか、自分の pane への操作をどこまで止めるか〕を含む）。
  - 本 work の範囲: (1) wtmctl の使い方をエージェントに教える Markdown の skill ファイルと、それを出す `wtmctl skill`、(2) pane の環境に
    「その pane のサーバの URL」を入れ、wtmctl が既定の接続先に使う、(3) pane の中の wtmctl が**自分の pane（とそれを含む tab・workspace）**を
    閉じる・自分の pane へ入力する・自分の pane に直結する等を断る歯止め、(4) docs。
  - 兄弟の backlog 項目に割る（deliver で `[ ]` で残す）: 呼び出し元 pane を既定の対象にする系（herdr の `--current`・`pane split` の対象の省略・
    `pane current`・`HERDR_WORKSPACE_ID`/`HERDR_TAB_ID` 相当）、token を持たない pane の中からの自動ログイン（下の D3 の検討）。
- **理由・代替案**:
  - 代替案 A「skill ファイルだけ」: pane の中の wtmctl が名前付き session のサーバへつながらない（上の現状）ままでは、skill の手順が
    既定の環境で動かない構成が残る。また backlog 項目が「環境変数と安全ガードの検討を含む」と明記している。不採用。
  - 代替案 B「herdr と同じく `--current`・対象の省略も入れる」: 全 pane コマンドの引数の形が変わり、skill の手順は `"$WTM_PANE_ID"` を明示すれば
    同じことができる。範囲を絞って兄弟項目へ。
- **影響**: requirements の対象／対象外に反映。

## D2: research を挟む（protocol.md「4.5」の条件に当たる）

- **背景**: 影響が横断的（server の pane の起動・待ち受け、cli の引数と各コマンド、docs）で、未検証の既存挙動（pane を起動する時点で
  待ち受けのポートが決まっているか・Origin/Host の検査が pane の中からの接続を通すか・サーバの環境に秘密が含まれるか）に依存する。
- **決定**: research.md を書く（一次資料の herdr と、既存コードの読み取り）。

## D3: pane の環境に秘密（token・session cookie）を入れない。認証はこれまでどおり利用者の `wtmctl login` のキャッシュに頼る

- **背景**: herdr の CLI は Unix ドメインソケット（ファイルの権限）で認証が要らない（`src/integration/env.rs:29` の `HERDR_SOCKET_PATH`）。
  本製品の wtmctl は token でログインして得た session cookie を `~/.wtmctl/session.json`（0600）に保存し、以後それを使う
  （`packages/cli/src/session.ts:27-29, 90-103`・`packages/cli/src/withSession.ts:15-36`）。pane の中のエージェントは、利用者が一度でも
  同じ OS ユーザーで `wtmctl login` していればそのキャッシュでつながる。
- **決定**: pane の環境には token も cookie も入れない。サーバが起動した環境から受け継いだ `WTMCTL_TOKEN` は pane の環境から**取り除く**
  （サーバを起動したシェルで export していた token が、pane の全プロセスと、そこで動くエージェントの記録に流れないように）。
  認証されていなければ（`unauthenticated`）、skill は「利用者に `wtmctl login` を自分の端末で打ってもらう」よう教え、token をコマンド行・
  会話に書かせない。
- **理由・代替案**:
  - 代替案 A「pane ごとに短命の token を環境に入れる」: 環境変数は同じ pane の全プロセス（エージェントが起動する任意のコマンド）から読め、
    エージェントの会話の記録・ログに写りやすい。失効・範囲の限定の仕組み（pane に紐づく権限）も新たに要る。不採用。
  - 代替案 B「同じ OS ユーザーなら状態ディレクトリの auth.json の token を読んで自動でログインする」: ファイルの権限の上では既に読めるので
    信頼の境界は広がらないが、「利用者が一度もログインを許していないのに、pane の中の任意のプロセスが操作できる」ことになる判断は
    この work の範囲を超える。兄弟の backlog 項目に残す。
- **影響**: requirements の FR・AC に反映。skill の「認証されていないとき」の節。

## D4: 環境変数は `WTM_SERVER_URL` を足し、pane の中にいる印は既存の `WTM_PANE_ID` で兼ねる。歯止めは CLI に置く

- **背景**: requirements の点検（doccheck ラウンド 1）で、未確定事項に残した 2 点が FR・AC では決まった形で書かれていると指摘された。
- **決定**:
  - pane の環境に足すのは `WTM_SERVER_URL`（その pane のサーバの URL）だけ。herdr の `HERDR_ENV=1` に当たる「pane の中にいる」印は、既に全 pane に
    入っている `WTM_PANE_ID`（`packages/server/src/session/SessionService.ts:1040`）で兼ねる。
  - 歯止めは CLI に置く（サーバは呼び出し元がどの pane の中で動いているかを知らない。research.md F6 のとおり CLI は接続時の snapshot で判定できる）。
- **理由・代替案**:
  - 代替案 A「`WTM_ENV=1` を別に足す」: `WTM_PANE_ID` があれば同じことが分かり、意味の重なる変数が増えるだけ。不採用。
  - 代替案 B「サーバが入れる変数を `WTMCTL_URL`（CLI の設定の変数）にする」: 利用者が pane の中で `WTMCTL_URL` を export して別のサーバを指したときに、
    その pane のサーバがどこかが分からなくなり、歯止めの「同じサーバか」の判定ができない。サーバが管理する変数（`WTM_SERVER_URL`）と利用者の設定
    （`WTMCTL_URL`）を分け、優先順位で `WTMCTL_URL` を上にする。不採用。
  - 代替案 C「歯止めをサーバに置く（RPC に呼び出し元の pane を載せる）」: プロトコルの変更になり、呼び出し元の申告を信じるだけなので安全の境界にも
    ならない。不採用。
- **影響**: requirements の FR4〜FR9。design で詳細を決める。

## D5: design の独立点検はラウンド上限（2）で止め、残りは review に委ねる。architecture は挟まない

- **背景**: design の doccheck はラウンド 1 で 11 件、ラウンド 2 で 8 件（must 1: 小文字の変数の扱いの食い違い）。上限 2 に達した。
- **決定**: ラウンド 2 の 8 件はすべて最小の差分で直した（小文字の変種は win32 だけ消す・各 AC に入力の出所・AC5 の「つながない」の確かめ方・出所の無い断定に
  出所か「未確認」・AC7 の比べる値・help の書き方の統一・F7.1 の参照）。3 巡目の点検はしない。直した箇所の正しさは 60 review で確かめる。
  architecture は protocol.md「4.5」の 4 条件（モジュール境界の移動・新しい構造・複雑なインターフェース・粗い設計）に当たらない（新しいファイルは既存の層の中に置き、
  依存の向きを変えない）ので挟まない。
- **影響**: review の観点に「design のラウンド 2 の修正箇所（`buildPaneEnv` の platform・AC5・AC7）が実装と一致するか」を足す。

## D6: tasks の独立点検もラウンド上限（2）で止める

- **背景**: tasks の doccheck はラウンド 1 で 5 件、ラウンド 2 で 3 件（should 1: URL を決める順序の制約が書かれていない）。
- **決定**: 3 件とも tasks.md に最小の差分で書き足した（順序の制約と、それを捕まえるのが T7 の結合テスト〔最初の pane の環境を見る〕であること・スキームは `secure`・`skillFilePath`）。3 巡目はしない。
- **影響**: なし（実装は design どおり）。

## D7: 歯止めの「同じサーバか」は origin の文字列ではなく、ループバックの名前と既定のポートを正規化して比べる（design からの逸脱）

- **背景**: T8 の点検で、`WTMCTL_URL=http://localhost:7780` を export している利用者（docs の冒頭の例がこの形を勧めている）が pane の中で打つと、
  接続先の origin（`http://localhost:7780`）が `WTM_SERVER_URL`（`http://127.0.0.1:7780`）と文字列で一致せず、同じサーバなのに歯止めが黙って外れると指摘された。
- **決定**: `selfGuard.ts` の比較の鍵を「スキーム＋ホスト（`localhost`・`127.0.0.1`・`[::1]` は `loopback` にまとめる）＋ポート（省略は既定の 80/443）」にする。
  http(s) 以外・読めない URL は従来どおり一致しない扱い。
- **理由・代替案**: 同じマシンのループバックの同じポートで待ち受けるのは同じサーバ（別々のサーバが `127.0.0.1:7780` と `[::1]:7780` に分かれて待ち受ける構成は
  事実上無く、そのときの誤りは「断りすぎ」の側＝抜け道で回避できる）。代替案「docs で注意するだけ」は、歯止めが外れていることに利用者が気づけないので不採用。
- **影響**: requirements FR7/FR9・design の「origin が一致」を、この鍵の一致と読み替える。docs に明記。

## D8: ループバック以外の名前で同じサーバを指したときに歯止めが外れる件は、判定を広げずに docs と skill に明記する

- **背景**: review ラウンド 1 の should。TLS で証明書に `127.0.0.1` が無い構成で `WTMCTL_URL=https://myhost:8443` を export すると、同じサーバでも歯止めが外れる。
- **決定**: 判定は D7 のまま（ループバックの名前だけ正規化）。docs の TLS の項・歯止めの節と、skill の歯止めの節に「そのときは効かない・自分で確かめる」を書く。
- **理由・代替案**: 代替案「サーバが待ち受けのホスト名・`--origin` も pane の環境に入れて比べる」は、名前の解決（別名・IP）まで追うことになり、
  比べ方を誤ると別のサーバの同じ ID の pane を断る側にも外れる。歯止めは安全の境界ではない（D4）ので、効かない条件を明示するほうを採る。
  兄弟の backlog 項目（呼び出し元 pane の既定化）と一緒に、サーバの同一性を ID で確かめる（hello でサーバの識別子を返す）方式を検討に残す。
- **影響**: docs・SKILL.md だけ。
