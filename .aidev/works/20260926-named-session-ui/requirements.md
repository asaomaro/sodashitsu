# 要件: 名前付き session の残り（画面での表示と切り替え・ポートの記憶・環境変数の既定）

## 背景 / 課題

20260926-named-session で `wtm serve --session <名前>`・`wtm token reset --session <名前>`・`wtm session list`・
`wtm session delete` が入り、名前だけで別々の保存状態を使い分けられるようになった。ただし次が残っている
（backlog `product-roadmap.md`「名前付き session の残り（画面と既定）」、出典 `.aidev/works/20260926-named-session/decisions.md` D1・
同 `requirements.md` の対象外）。

- **ブラウザの画面には、いまどの session を開いているかが出ない**。複数の session を並行して動かすと、ブラウザのタブが
  どれも同じ見た目で、取り違えて別の session の pane に打ち込みうる。
- **画面から別の session へ移れない**。herdr の `herdr session attach <name>` はクライアントが別の session に繋ぎ直す操作で、
  Web 版では別の session は別の URL（ポート）なので、利用者は各 session のポートを覚えて URL を手で打つしかない。
- **同じブラウザで 2 つの session にログインすると、片方がログアウトされる**。Cookie はポートで分かれない
  （RFC 6265 8.5「Cookies do not provide isolation by port」）ので、同じホスト名で開いた別のポートの session が同じ名前の
  Cookie（`wtm_session`。`packages/server/src/auth/AuthService.ts:9`）を上書きし合う。切り替えを作ると必ず踏む。
- **名前付き session を起動し直すたびにポートを指定し直す必要がある**。`--port` を付け忘れると既定の 7780 で起動し、
  既定の session が動いていれば `EADDRINUSE` で止まる。ポートが変わるとブラウザのブックマークも使えない。
- **環境変数で既定の session を選べない**（herdr の `HERDR_SESSION`）。herdr の pane の中では `HERDR_SESSION` が
  その pane の session を指し（herdr `src/session.rs:84`・`:478`。サーバのプロセスに設定した値を pane が引き継ぐ）、
  pane の中のスクリプトやエージェントが自分の session を知れるが、本製品には相当するものが無い。

## 目的 / ゴール

- ブラウザの画面を見れば、いま開いているのがどの名前付き session か分かる状態。
- ブラウザの画面から、動いている別の session の画面を（その session のログインを経て）開ける状態。
  他の session の token は画面にもサーバの応答にも出ない。
- 同じブラウザで複数の名前付き session に同時にログインしたままでいられる状態。
- 名前付き session を**名前だけで**前回と同じポートに起動し直せる状態。
- `WTM_SESSION` で `wtm` の既定の session を選べ、名前付き session の pane の中では `WTM_SESSION` がその session を指す状態。
- 名前付き session を使わない利用者には何も変わらない状態（既定の session の起動・ポート・Cookie・画面の表示。
  名前付き session が 1 つも無ければ、既定の session の画面も今までと同じ）。

## ユーザーストーリー

- US1: 名前付き session を並行して動かす利用者として、ブラウザの画面でいまどの session を開いているか知りたい。
  なぜなら、見た目が同じタブを取り違えて、別の session の pane にコマンドを打ち込みたくないから。（受け入れ: AC1, AC2, AC3）
- US2: 名前付き session を並行して動かす利用者として、画面から別の session を開きたい。なぜなら、session ごとのポートを
  覚えて URL を手で打つのは面倒で、打ち間違えると別のサービスを開いてしまうから。（受け入れ: AC4, AC5, AC6, AC7, AC-I1〜AC-I5）
- US3: 同じブラウザで複数の session を使う利用者として、片方にログインしても他方からログアウトされないでほしい。
  なぜなら、切り替えるたびに token を入れ直すのでは切り替えの意味が無いから。（受け入れ: AC8, AC9）
- US4: 名前付き session を起動し直す利用者として、名前だけで前回と同じポートで起動したい。なぜなら、ポートを毎回
  正確に打つのは面倒で、変わるとブックマークと他の session との住み分けが崩れるから。（受け入れ: AC10, AC11, AC12, AC16）
- US5: シェルの設定やスクリプトで session を固定したい利用者、および pane の中で動くスクリプト・エージェントとして、
  環境変数で session を選び・知りたい。なぜなら、毎回 `--session` を打たずに済み、pane の中からは自分の session を
  調べる手段が他に無いから。（受け入れ: AC13, AC14, AC15）
- US6: 運用者として、名前付き session を使わない限り今までどおり動いてほしく、他の session の秘密が画面や応答に
  漏れないでほしい。なぜなら、更新しただけでログアウトされたりポートが変わったりすると困り、切り替えの一覧が
  別の session に入る鍵になってはいけないから。（受け入れ: AC5, AC9, AC12, AC17）
- US7: herdr から移ってきた利用者として、`session attach`・`HERDR_SESSION` に当たる操作と違いを docs で知りたい。
  なぜなら、同じ操作を探すから。（受け入れ: AC18）

## スコープ

### 対象

- ブラウザの画面（デスクトップのサイドバーとブラウザのタブのタイトル）での session 名の表示。
- デスクトップの画面から開く session の一覧（切り替え）と、そこから別の session の画面を新しいブラウザのタブで開くこと。
  一覧はサーバの認証済みの接続からだけ取れる。
- 名前付き session のログインの Cookie を session ごとに分けること。
- 名前付き session のポートの記憶（`--port` を付けない起動で前回のポートを使う）。
- 環境変数 `WTM_SESSION`（`wtm serve`・`wtm token reset` の既定の session）と、名前付き session の pane の環境の `WTM_SESSION`。
- 利用者向け docs（`docs/tls-setup.md`・`docs/verification.md`）と `docs/herdr-parity.md` の H33 行の更新。

### 対象外

- ログイン画面（認証前）での session 名の表示（認証前の応答に何も足さない方針を崩さない。後続）。
- 切り替えのキー操作（キーバインド・アクション）と、モバイルの 1 列表示での session 名の表示・切り替え（後続）。
- 名前付き session を初めて起動するとき（記憶が無いとき）に空いているポートを自動で選ぶこと（後続）。
- `--host`・`--cert`・`--origin` 等、ポート以外の起動オプションの記憶（後続）。
- 名前付きでない並行起動（`--state-dir` を分けて同じホスト名の別ポートで動かす）での Cookie の衝突（後続）。
- `wtm session list` へのポート・URL の表示（後続）。
- `wtm session stop`（兄弟の backlog 行）。
- wtmctl（`packages/cli`）の変更（URL で繋ぐので session の名前を要しない）。
- E2E（packages/e2e）の追加・実行（利用者の方針）。

## 機能要件

- F1: 名前付き session のサーバに繋いだブラウザは、その session の名前を認証済みの接続で受け取り、デスクトップの
  サイドバーの上端とブラウザのタブのタイトルに出す。既定の session では、タイトルは今までどおりで、サイドバーの上端の表示は
  **他の（名前付きの）session があるときだけ**出す（切り替えの入口にするため）。「ある」は F2 の一覧に名前付き session が
  1 つ以上載ること（動いているかは問わない）。名前付き session が 1 つも無ければ今までどおり。
- F2: サーバは、認証済みの接続からの求めに応じて、**同じ「session の根」**に属する session（既定と名前付き）の一覧を返す。
  「session の根」は既定の session の状態ディレクトリ（`--state-dir` を付ければそれ、無ければ OS の既定の場所）で、名前付き
  session はその下の `sessions/<名前>/`（20260926-named-session の F2）。
  各項目は名前・動いているか・いま繋いでいる session か・開くための情報を持ち、token・Cookie・状態ディレクトリのパスは持たない。
  開くための情報（ポート・TLS か・待ち受けのホスト）は、動いていて、F5 の記録が**いまその session を動かしているプロセスが
  書いたもの**（記録に残したプロセスの識別と、状態ディレクトリのロックの持ち主が一致する）と分かるときだけ付ける。
- F3: デスクトップの画面から session の一覧を開き、動いていて開ける session を選ぶと、その session の URL を新しいブラウザの
  タブで開く。開いた先は、その session の Cookie が無ければその session のログイン画面になる。いま繋いでいる session・
  止まっている session・このブラウザから届かない session・開くための情報が無い session は開く操作の対象にせず、その理由
  （いま開いている／止まっている＋起動のコマンド／このブラウザから届かない／ポートが分からない）を出す。
- F4: 名前付き session のログインの Cookie は、既定の session・他の名前付き session と別の名前を使う。既定の session の
  Cookie は今までと同じ名前のまま。
- F5: どの session も（既定の session も）、待ち受けに成功したポートを状態ディレクトリに記録する（F2 の開くための情報に使う）。
  名前付き session は、`--port` を付けずに起動すると記録した
  ポートを使い、`--port` を付けるとそれを使って記録を更新する。記録が無い・読めない・壊れている・範囲外のポートを含むなら
  既定のポート（7780）を使う。
  既定の session は記録を**起動のポートには使わない**（今までどおり `--port` が無ければ 7780。書くのは F2 のため）。
- F6: `wtm serve`・`wtm token reset` は、`--session` が無ければ環境変数 `WTM_SESSION` の値を session の名前として使う。
  空なら無いのと同じ、`default` は既定の session。規則外の値は、`--session` と同じく何も作らず・読まずに終了コード 2 で
  止まり、値の出所が `WTM_SESSION` であることを示す。`--session` は `WTM_SESSION` より優先する。
  名前を明示して受け取る `wtm session list`・`wtm session delete` は `WTM_SESSION` を見ない。
- F7: 名前付き session のサーバが起動する pane の環境には `WTM_SESSION=<その名前>` が入る。既定の session の pane・
  名前付き session の pane とも、サーバを起動した環境から引き継いだ `WTM_SESSION` は pane に渡さない（サーバが入れた値だけ）。
- F8: 起動時の表示・ポート使用中の案内で、記録したポートを使ったことと、変えたいときの手段（`--port`）が分かる。

## 非機能要件 / 制約

- **互換性（必須）**: 名前付き session を使わない（`--session` も `WTM_SESSION` も無い）起動では、状態ディレクトリ・ポート・
  Cookie の名前・起動時の表示・画面の表示が今までと同じ。既存の Cookie でログインしたままのブラウザはログアウトされない。
- **安全性**: session の一覧は認証済みの接続でだけ返し、他の session の token・Cookie・`auth.json` の中身を返さない。
  別の session の画面を開くのはブラウザの通常の移動で、開いた先の session の認証（Cookie が無ければログイン）を必ず通る。
  session の名前は既存の規則（`packages/server/src/persist/namedSession.ts:21` `sessionNameProblem`）で検査したものだけを
  使う（Cookie の名前・環境変数・一覧）。記録したポートのファイルは他の状態ファイルと同じく利用者だけが読める。
- **可搬性**: Linux・macOS・WSL2・Windows ネイティブで同じに動く（環境変数の大文字小文字の扱いは既存の pane の環境に揃える）。
- 検証は vitest（単体・結合）と `aidev smoke`。E2E は走らせない。負荷試験（並列の繰り返し・負荷下の比較）はしない。

## 完了条件 (受け入れ基準)

- [ ] AC1: 名前付き session `work` のサーバに `client.hello` した結果に、その session の名前 `work` が含まれ、既定の session では含まれない（名前の項目が無い）。
- [ ] AC2: デスクトップの画面で、名前付き session に繋いでいるときサイドバーの上端に session の名前が出る。既定の session では、名前付き session が 1 つも無ければ出ず、あれば `default` として出る。
- [ ] AC3: ブラウザのタブのタイトルが、名前付き session ではその名前を含み、既定の session では今までと同じ（`{hostname}: {workspace}`）。
- [ ] AC4: サーバの session の一覧が、同じ session の根の既定の session と名前付き session を名前・動いているか・いま繋いでいる session か付きで返し、動いていて F5 の記録がいまのロックの持ち主の書いたものと分かる session にだけポート・TLS か・待ち受けのホストを付ける（止まっている・記録が無い・持ち主と一致しない session には付けない）。
- [ ] AC5: session の一覧の応答と、ブラウザが受け取る hello の結果に、token・Cookie の値・状態ディレクトリのパス・`auth.json` の中身が含まれない。一覧は認証済みの接続でしか取れない。
- [ ] AC6: 一覧の各 session について、ブラウザが開く URL（またはこのブラウザから開けない理由）が、待ち受けのホスト（全インタフェース・ループバック・特定のアドレス）といま開いている URL のホスト名から決まる：全インタフェースならいまのホスト名、ループバックならいまのホスト名がループバックのときだけ、特定のアドレスならそのアドレス。スキームは TLS かで決まる。
- [ ] AC7: 一覧で開ける session を選ぶと、その URL が新しいブラウザのタブで（開いた先が元のページを操作できない形で）開く。いま繋いでいる・止まっている・開けない session は選べず、それぞれ F3 の理由が出る（止まっている session には起動のコマンド `wtm serve --session <名前>`、既定の session なら `wtm serve --session default`。decisions D9）。
- [ ] AC8: 名前付き session のサーバが発行する Cookie の名前は既定の session（`wtm_session`）とも他の名前付き session とも異なり、そのサーバは自分の名前の Cookie だけを読む（別の session の Cookie だけを送られたら未ログイン）。
- [ ] AC9: 既定の session の Cookie の名前は `wtm_session` のまま変わらない（既存のログインが保たれる）。
- [ ] AC10: 名前付き session を `--port P` で起動して待ち受けに成功すると P が状態ディレクトリに記録され、次に `--port` を付けずに同じ名前で起動すると P で待ち受ける。`--port Q` を付ければ Q で待ち受けて記録が Q になる。
- [ ] AC11: 記録が無い・読めない・壊れている・範囲外のポートを含むときは既定のポート（7780）で起動し、それらの記録で起動が止まらない。
- [ ] AC12: 既定の session（`--session` も `WTM_SESSION` も無い、または `default`）も待ち受けたポートを記録するが、起動のポートには使わず、`--port` が無ければ 7780 で起動する（記録のファイルがあっても）。
- [ ] AC13: `WTM_SESSION=work wtm serve`（`--session` 無し）が `--session work` と同じ状態ディレクトリを使い、`wtm token reset` も同じく `work` の token を作り直す。`--session other` を付けると `WTM_SESSION` より優先する。`WTM_SESSION` が空か `default` なら既定の session。
- [ ] AC14: `WTM_SESSION` が規則外の値なら、`wtm serve`・`wtm token reset` とも状態ディレクトリを作らず終了コード 2 で止まり、案内に `WTM_SESSION` が出る。`wtm session list`・`wtm session delete` は `WTM_SESSION` を見ない。
- [ ] AC15: 名前付き session `work` のサーバが起動した pane の環境に `WTM_SESSION=work` が入り（サーバを起動した環境の `WTM_SESSION` が別の値でも）、既定の session のサーバの pane には `WTM_SESSION` が無い（サーバを起動した環境に `WTM_SESSION` があっても）。Windows では大文字小文字を区別せずに落とす。
- [ ] AC16: 記録したポートで起動したとき、起動時の表示にそのことが出て、そのポートが使用中なら案内に `--port` で変えられることが出る。
- [ ] AC17: `--session` も `WTM_SESSION` も無い起動の状態ディレクトリ・ポート・Cookie の名前・起動時の表示・タイトルが変更前と同じで、名前付き session が 1 つも無ければサイドバーも変更前と同じ（既存のテストが通る）。
- [ ] AC18: `docs/herdr-parity.md` の H33 行・`docs/tls-setup.md`・`docs/verification.md` が、画面での表示と切り替え・Cookie・ポートの記憶・`WTM_SESSION` と herdr との違い、対象外にしたものを説明している。

## 相互作用の受け入れ基準（UI を伴う work のみ）

session の一覧（切り替え）のダイアログ。

- [ ] AC-I1 開く / 閉じる: サイドバー上端の session の表示（ボタン）をクリック・Enter・Space で開く。Esc・閉じるボタン・背景のクリックで閉じ、何も開かない。session を開いた後も閉じる。
- [ ] AC-I2 確定 / 取り消し: 開ける session の項目をクリック・Enter で選ぶと新しいタブで開く（確定）。Esc・閉じるで取り消すと何も開かず、いまの画面はそのまま。
- [ ] AC-I3 キーボードだけで完結するか: session の表示へ Tab で移り → Enter で開き → Tab（または ↑↓）で項目を移り → Enter で開く／Esc で閉じる、をマウス無しで通せる。
- [ ] AC-I4 フォーカスの行き先: 開くと最初の開ける項目（無ければ閉じるボタン）にフォーカスが移り、閉じると開く前にフォーカスのあった場所（session の表示のボタン）へ戻る。
- [ ] AC-I5 既存の操作を妨げないか: ダイアログを開いている間のキー（文字・Esc・プレフィックスのキー・↑↓）が pane の端末や既存のキー操作（プレフィックスのキーで始まる操作と、サイドバーの項目を ↑↓ で選ぶ navigate モード）へ漏れない。

## 未確定事項 / 確認したいこと

- 一覧を取る手段（WebSocket の方式か HTTP か）と名前・hello の結果のどこに名前を載せるか → design。
- 記録のファイルの名前と形式・書く時機（待ち受けの後）・持ち主の確かめ方 → design。
- 名前付き session の Cookie の名前の形（session の名前の文字は Cookie の名前に使える文字に収まるか）→ design。
- 既定の session でサイドバーに出す条件（F1）のための一覧をいつ取るか → design。
- ダイアログの確立したパターン（既存のダイアログのフォーカス・キーの閉じ込め）→ research。
