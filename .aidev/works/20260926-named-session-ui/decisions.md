# 判断の記録（20260926-named-session-ui）

## D1: 着手の判定と、1 PR に収める範囲（2026-09-27・requirements）

- 背景: backlog `product-roadmap.md`「名前付き session の残り（画面と既定）」を autonomous で進める（主エージェントの依頼。
  worktree `feature/named-session-ui`）。依存 `20260926-named-session` は deliver 済み（main 2875ad2 に取り込み済み）。
  項目は (a) 画面での session 名の表示 (b) 画面からの切り替え（herdr の `session attach`） (c) session ごとのポートの記憶
  (d) 環境変数での既定の session（herdr の `HERDR_SESSION`）の 4 つ。
  herdr の一次資料（`/workspaces/web-tn-multiplexer/scratchpad/herdr/src/session.rs`）を直読した：
  `SESSION_ENV_VAR = "HERDR_SESSION"`（:10）、`--session` が無ければ `HERDR_SESSION` を使い、`default` は既定の session に
  正規化して変数を外し、規則外は誤り（:84〜:88・:486〜:492）。`--session` を付けるとサーバのプロセスの `HERDR_SESSION` を
  その名前にする（:478）ので、pane はそれを引き継ぐ（`src/pane.rs` は `HERDR_SESSION` を外さない。:99〜:171 の `env_remove` は
  `WT_SESSION` 等だけ）。
- 決定:
  1. (a)(b)(c)(d) をこの PR に入れる。ただし (b) はデスクトップの画面のダイアログ（サイドバーの session の表示から開く）に絞り、
     キーバインド・モバイル・ログイン画面での表示は後続にする。
  2. (b) を作ると必ず踏む **Cookie の衝突**（同じホスト名の別ポートの session が同じ名前の Cookie `wtm_session` を上書きし合い、
     片方にログインすると他方がログアウトされる。RFC 6265 8.5）を、名前付き session の Cookie の名前を分けて直す（既定の session の
     名前は変えない＝既存のログインを保つ）。名前付きでない並行起動（`--state-dir` を分ける）の衝突は後続。
  3. (c) は名前付き session だけ。既定の session は `--port` が無ければ今までどおり 7780（既定の session に記憶を入れると、
     一度 `--port 8443` で起動しただけで以後の `wtm serve` のポートが変わる——互換性の要件に反する）。
  4. (d) は herdr に揃え、`wtm serve`・`wtm token reset` の既定に使い、名前付き session の pane の環境に `WTM_SESSION` を入れる。
     サーバを起動した環境の `WTM_SESSION` は pane に渡さない（既存の `WTM_PANE_ID` 等と同じ「サーバが管理する変数」）。
  5. profile は full（UI の新しい部品・認証の Cookie・環境変数という安全面を含む）。
- 理由・代替案:
  - 前 work の D1 は環境変数を「pane の中から起動した `wtm serve` が親の session を暗黙に引き継ぐ驚き」を理由に対象外にしていた。
    引き継いだ場合に起きるのは、同じ session の二重起動を `wtm.lock` が止める（終了コード 2・案内つき）ことだけで、状態を壊さない。
    案内に「`WTM_SESSION` から選んだ」ことと `--session default` を出せば迷わない。herdr も pane が自分の session を引き継ぐ。
  - (b) を後続に回す案: 項目の中心で、Cookie の衝突の修正とセットでないと価値が出ない（今でも手で URL を打てば別 session を
    開けるが、開くたびに他方がログアウトされる）。入れる。
  - Cookie の名前をポートごとにする案（`wtm_session_<port>`）: 名前付きでない並行起動の衝突も直るが、既定の session の Cookie の
    名前が変わり、更新しただけで全員が一度ログアウトされる。互換性の要件に反するので退けた。
- 影響: research を挟む（利用者が操作する部品＝ダイアログを作る。protocol.md「4.5」の 5 条件の最後）。backlog には後続の `[ ]`
  （ログイン画面の表示・キー操作とモバイル・初回の空きポート・ポート以外の記憶・名前付きでない並行起動の Cookie・
  `wtm session list` のポート表示）を deliver で足す。

## D2: requirements の独立点検が上限（2 ラウンド）に達した（2026-09-27・requirements）

- 背景: requirements の doccheck は 1 巡目 8 件（既定の session でのサイドバーの表示の条件の食い違い・「持ち主」「既定の状態ディレクトリ」の
  未定義・US と AC の対応のずれ等）、2 巡目 4 件（既定の session がポートを記録しないと一覧から既定の session を開けない等）。
- 決定: 2 巡目の 4 件はその場で最小の差分で直し（どの session も待ち受けたポートを記録し、名前付き session だけが起動に使う。
  「名前付き session がある」は一覧に載ること。いま開いている session の理由の表示。navigate モードの説明）、3 巡目は行わず承認する。
- 理由・代替案: 2 巡目の指摘はいずれも条件の書き漏れで、方向の誤りではない。
- 影響: F5 は「書くのは全 session・読むのは名前付きだけ」になった（design で記録の形とあわせて決める）。

## D3: design の方針（記録のファイル・一覧の経路・開き方・環境変数の適用場所）（2026-09-27・design）

- 背景: autonomous で humanGates は空（承認者がいない）ので、方針の事前承認は取らず、方針と採らなかった案をここに残して design の承認で受ける
  （protocol-autonomous.md「方針の事前承認」）。
- 決定:
  1. 起動の記録 `serve.json`（pid・ホスト名・待ち受けたポート・TLS か・待ち受けのホスト）を全 session が待ち受けの直後に書き、
     ポートの記憶（名前付きだけが読む）と一覧の開くための情報（ロックの持ち主と pid・ホスト名が一致するときだけ）の 2 役に使う。
  2. 一覧は WebSocket の新しい方式 `server.sessions`。名前は hello の `snapshot.host.sessionName`（省略可能）。
  3. 開く URL はブラウザが `location.hostname` と待ち受けのホストから決め、新しいタブで `noopener,noreferrer` で開く。
  4. `WTM_SESSION` は CLI の入口（`main.ts` が `applySessionEnv` を当てる）だけで見る。`composeServer` は環境変数を見ない。
  5. ダイアログは既存の一覧のダイアログの形に閉じるボタンを足し、閉じた後は開く前にフォーカスのあった要素へ明示的に戻す。
- 理由・代替案:
  - 1 の代替「ロックのファイルにポートを書く」: ロックは token reset・delete も取り、止まると消える（記憶に使えない）。
    代替「サーバどうしで問い合わせる」: 他の session の token が要る。どちらも退けた。
  - 2 の代替「HTTP の `/api/sessions`」: Cookie・Host の検査の経路をもう 1 つ作ることになる。WebSocket は認証・Origin の検査済み。
  - 3 の代替「同じタブで移る」: 戻るたびに元の session で再びログインが要る場面があり（Cookie の期限等）、いまの画面を失う。
    代替「サーバが URL を組み立てる」: いまのページのホスト名（LAN の IP・`--origin` の名前）をサーバは知らない。
  - 4 の代替「`resolveServeOptions` が env を読む」: テスト・smoke がサーバを組み立てるとき、開発者のシェル（名前付き session の
    pane の中かもしれない）の `WTM_SESSION` で状態ディレクトリが変わってしまう。
  - `WTM_SESSION` の空: herdr は誤りにするが、シェルの `export WTM_SESSION=` で解除できるほうが扱いやすいので「無い」扱いにした（docs に書く）。
- 影響: tasks は server（記録・オプション・Cookie・一覧・env・pane の環境）→ protocol → web（純関数・ストア・ダイアログ・サイドバー）→ docs の順。

## D4: design の独立点検が上限に達した／architecture は挟まない／wtmctl の Cookie（2026-09-27・design）

- 背景: design の doccheck は 1 巡目 9 件（出所の無い断定・ホストの分類の未定義・折りたたみ時の扱い等）、2 巡目 3 件（`portSource` が
  `main.ts` へ渡る経路・`WTM_SESSION=default` の出所・AC2 の折りたたみ時のテスト）。上限 2 に達した。点検の合間に、wtmctl がログインの
  Cookie を名前に依らず扱うこと（`packages/cli/src/httpAuth.ts:23-26`）を確かめた（名前付き session の Cookie の名前を変えても wtmctl は壊れない）。
- 決定: 2 巡目の 3 件はその場で直し、3 巡目は行わず design を承認する。architecture は挟まない（protocol.md「4.5」の 4 条件のいずれにも
  当たらない：モジュールの境界は動かさず、新しい部品は既存の形——記録のファイル・方式・一覧のダイアログ——の延長）。
- 理由・代替案: 指摘は記述の書き漏れで、方針の誤りは出ていない。
- 影響: なし（tasks はこの design のまま分解する）。

## D5: tasks の独立点検は 1 巡で閉じた（2026-09-27・tasks）

- 背景: tasks の doccheck 1 巡目は 1 件（T6 の AC に AC13・AC15 の配線が入っていない）。
- 決定: T6 の AC に AC13・AC15 を足し、main.ts の配線は単体テストできないので実物の CLI の確認（test 工程）で代えると書いた。2 巡目は行わない（指摘は 1 行の追記で閉じる）。
- 影響: test 工程で `WTM_SESSION` を付けた実物の `wtm token reset` を確かめる。

## D6: 開く URL のホストの決め方を design から変えた（2026-09-27・coding T7）

- 背景: T7 の独立点検（must）。design は「ループバックならいまのホスト名」「全インタフェースならいまのホスト名」としていたが、相手のサーバの
  Origin の方針（`packages/server/src/auth/OriginPolicy.ts:47-57`。`localhost`・`127.0.0.1`・`::1`・待ち受けのホストだけを許す）に照らすと、
  いまのページが `foo.localhost` だと拒否され、`::1` で待ち受ける相手に `127.0.0.1` で繋ぐと届かない。
- 決定: ループバックで待ち受ける相手は**待ち受けのホストそのもの**（小文字）。全インタフェースは、いまのホスト名がループバックなら
  その族のループバックのアドレス（`0.0.0.0`→`127.0.0.1`・`::`→`::1`。server の `paneServerUrl` と同じ）、そうでなければいまのホスト名、
  ただし `0.0.0.0` でいまが IPv6 のアドレスなら unknown。特定のアドレスはそのまま（design どおり）。
- 理由・代替案: 相手が必ず許す名前を選ぶのが確実。いまのページを `--origin` の名前（ポート転送・Tailscale 等）で開いている場合は URL から
  判定できないので、限界として docs に書く（開いた先のログインの画面が 403 の理由を出す。D105 の既存の挙動）。
- 影響: design の「web」の分類の説明を上書きする（review で design との差として読む）。規則の書き直しなので T7 は 2 巡目の点検を行う。

## D7: T7 の点検が上限（2 ラウンド）に達した／開く URL の限界を docs に書く（2026-09-27・coding T7）

- 背景: T7 の 2 巡目の点検で、ページのホスト名（`--host` の名前・FQDN・mDNS）が相手の許可リストに無い場合と、ループバックへのポート転送で
  開いたページでは、`open` と出した URL が拒否される・ブラウザ側のマシンを指すことが指摘された（should 2・nit 1）。
- 決定: 規則は変えず、限界を doc コメントと docs（`docs/tls-setup.md`）に明記する。3 巡目は行わない（上限）。
- 理由・代替案: ページからは「どの名前なら相手が許すか」「ポート転送かどうか」を判定できない。代替「IP でない名前なら unknown」は、
  `os.hostname()` で開いている普通の LAN の使い方まで開けなくする。開いた先が拒否しても、相手のログインの画面が理由（403）を出し、
  token は送らないので安全上の問題は無い（ブラウザが開くだけ）。
- 影響: review で限界の説明が docs にあることを確かめる。

## D8: ダイアログのフォーカスの戻りの例外（2026-09-27・coding T9）

- 背景: T9 の点検。ダイアログを開いている間に「開く前の pane」が閉じられると、`view.closeDialog()` が `focusedPaneId` を実際に変え、
  その pane の `TerminalPane` の watch が端末へフォーカスを移しうる（design の「値が変わらなければ奪わない」の外）。
- 決定: 変えない。コメントに残す。既存のダイアログすべてに共通の挙動で、フォーカスの行き先は「開いたボタン」か「生きている pane の端末」の
  どちらかで、失われはしない。
- 影響: AC-I4 はこの例外を除いて満たす（test-result に未検証の穴として書く）。

## D9: 止まっている既定の session の起動のコマンドを `wtm serve --session default` にした（2026-09-27・coding cross）

- 背景: cross の点検。名前付き session の pane には `WTM_SESSION=<名前>` が入るので、素の `wtm serve` はいまの名前付き session を選ぶ。
- 決定: 一覧の案内を `wtm serve --session default` にし、AC7 の文言も合わせた（requirements の該当 1 行だけ）。
- 影響: なし（表示の文字列だけ）。
