# 判断の記録: 20261004-ask-media-popup

追記式。既存のエントリは書き換えない。

## D1: 起こした経緯・規模・モード

- 依頼元（pane を持つ上位のセッション）から、利用者の要望「ask-form が画像付きのフォームで Edge の単独ウィンドウを開く。画面内のダイアログで出したい。成果物（`view`）も同様」を受けた（2026-10-04）。調査メモ（依頼元作成）と利用者の決定 1〜6 が付いていた。
- 利用者の決定（要件にそのまま入れた）: (1) 範囲は第 1 段（画像・音・コード・group・thumb・preview）・型（edit/rank/table）・第 2 段（view）の全部。実装順は第 1 段→型→第 2 段 (2) 上限は 1 ファイル 8 MiB・1 質問 24 MiB（Markdown・テキストの view は 2 MiB）・32 ファイル・サーバ全体 128 MiB (3) https の画像は対応。サーバが取得して一時保存し、ブラウザには自分の経路で渡す。SSRF 対策必須 (4) スクリプト付き html は動かすが外への通信は止める (5) ファイルの読み出し範囲は pane のシェルと同じ権限。通常ファイル・拡張子の許可リスト・先頭バイトの検査は入れる (6) Markdown の無害化・モバイルの出し方・機能確認の方式は推奨で決めて記録する。
- `profile: full`・`mode: autonomous`（`humanGates` なし）。この work は requirements → design → tasks → coding までを行い、`aidev approve coding` で止まる（test・review・deliver は依頼元）。ブランチ `feature/ask-media-popup`（origin/main から）。
- **research 工程は挟まない**: 事実の調査は依頼元の調査メモ（出所つき）で済んでおり、残った★（不透明 origin の iframe の `postMessage`・mermaid が eval 無しで動くか・キーの取り次ぎ・`srcdoc` の CSP）は、design の前に Chromium で実測して design の「設計方針」に結果を書いた（`scratchpad/exp`）。そのため別の research 文書は作らない。
- 部品 `third_party/ask-form/` は写し直さない: public_docs の origin/main（3aa4d16）の `ask-form/` を取り込み済みの 12a13b2 と比べ、差分が無いことを確認した（1.3.0 のまま）。

## D2: requirements の独立点検（委譲・1 ラウンド・8 件）

- must 2・should 4・nit 2。全件を最小の差分で反映した。must: 「決定 6」の確定と未確定の食い違い（未確定事項を「推奨案で書いた・design で理由を確定」と書き換え）／AC-I1〜I5 の US 対応のずれ（US3 へ移した）。should: AC21・AC22 を US に紐づけ、「窓に落ちない」は ask.py の改修（別 PR）が入って初めて届くことを未確定事項に明記、AC3 に許可リストと不正入力の一覧を足した。
- 2 ラウンド目は打っていない（上限 2 のうち 1 を使用。修正は文面の整合だけ）。

## D3: design の方針（事前承認の対象・承認者なしなので成果物と同じゲートで受ける）

採った方針と採らなかった案（理由は design「設計方針」）:
1. ファイルの運び方: **R2（サーバが読み `ask.media` で分割配布）**。退けた: R1（sodactl が data URL 化。1 MiB/256 KiB に当たる）・R3（HTTP 配信。リモートに届かない）。
2. view の枠: **専用静的ページ + `sandbox="allow-scripts"` の iframe + `postMessage`**。退けた: `srcdoc`/`blob:`（CSP を継ぐ）。
3. html を含む Markdown の無害化: **サニタイザを足さず、枠の CSP（`script-src 'self'`・`default-src 'none'`）と不透明 origin に任せる**（実験で `<script>`・インラインを止めることを確認）。退けた: DOMPurify（依存と見え方の変化のわりに上乗せが小さい）。
4. html の枠に `allow-popups`・`allow-downloads` を付けない（popup の URL へ本文を載せて外へ出せるため。外部リンクが開けないのは許容）。ask.py は付けているが、「外への通信は止める」決定を優先。
5. モバイル: **縦積み**。退けた: 別の全画面（開閉と戻りのフォーカスが増える）。
6. 外部画像の取得失敗: **画像なしで出し、件数を固定の行に出す**。ローカル・data:・view の誤りは質問を出さず `invalid_ask_spec`（終了コード 2）。
7. 機能確認: **サーバ RPC `ask.features` と `sodactl ask --features`**。退けた: `requires` を `ask.open` に足す案（古いサーバは未知の項目を黙って無視するので見分けられない）／版の比較（版の取り決めが無い）。
8. 上限の超過は窓へ落とさず理由つきの誤り（決定 2）。ask.py は `--features` の `limits` で事前確認できる。
9. 外部 URL はポート 443 のみ・直接接続（プロキシ環境変数は使わない）。社内プロキシ越しの環境では取得失敗＝画像なしになる（受け入れる）。
10. `ask.opened` はメディアが揃ってから配る。ブラウザは揃ってから `store.add`（`resolveMedia` が同期のため）。

public_docs 側に必要な改修案は、coding の終わりにこのファイルへ追記する（D 末尾）。

## D4: design の独立点検（委譲・1 ラウンド・10 件）と、tasks の注記

- should 8・nit 2。全件を design.md に最小の差分で反映（既存の事実の出所の追記・上限の適用先・段の割り当て・ヘッダの上書き・AC16/19 の列挙・テストの置き場所）。**注意: 点検の結果を `report` する前に修正を当ててしまった**（CLI が「design.md が start 時点から変わっている」と指摘）。件数 10 は点検の返答どおり。
- AC22（負の対照の確認）は coding ではなく test 工程で消化する（T15。coding の承認時は未チェックで残る）。

## D5: tasks の独立点検（委譲・1 ラウンド・6 件）と、タスク点検の範囲

- should 4・nit 2。反映: T11 を T7 の後に（`HttpServer.ts` の共有）・T12 を T10 の後に（`AskDialog.vue` の共有）・T5 の対象にテストファイルを追記・T15 の対象を明記・各タスクに「点検: あり」を記載。T5 などの粒度は、段ごとに動く状態を保つ単位として据え置く（1 つの `AskService` の変更は分けるとテストが書けない）。
- **タスク単位の点検の範囲**: aidev の autonomous の既定は全タスクだが、依頼元の指示と AGENTS.md の「点検とテストの掛け方」（壊れやすいタスクだけに掛ける）に従い、T1・T2・T3・T4・T5・T9・T11・T12 だけに掛け、全タスクの後に `cross` を 1 回掛ける。

## D6: coding での判断・設計からの差分

- **機能確認の差し替え口**: テスト用の取得の差し替えは `composeServer(args, { askImageFetcher })`（design の `askMedia: { fetcher }` を、実装した名前に直した）。E2E は fixture `askImageFetcher`（`test.use`）で渡す。
- **成果物の枠の読み込み失敗の固定の文**（design「エラー処理」）は実装しなかった。iframe の `error` は 404 では発火せず（ブラウザのエラーページが枠に出る）、検知の手段が無い。成果物が出ていないまま答えられる点は、質問側の文面で扱う。
- **js・vendor の応答は CSP・X-Frame-Options を外す**（design どおり）。`/ask-view/*` の html ページは `X-Frame-Options: SAMEORIGIN`・`frame-ancestors 'self'`。許可リスト外（`SOURCE.json`・`LICENSE` を含む）は 404。
- **`ask.opened` はメディアが揃ってから**。メディアの無い定義は `prepare` を呼ばず同期で出す（既存の振る舞い・テストを変えない）。
- **同じファイルが image/audio と view の両方に出る**ときは別々に保持する（キーが種類別）。合計には両方数える（安全側）。
- **外部 URL の取得は検査済みの全アドレスを順に試す**（IPv6 の経路が無い環境で IPv4 へ回る）。接続先の固定は `https.request` の `lookup` で行い、自己署名の証明書の local サーバで実物を確かめるテストを置いた（`makeRealRequest({ca})` の `ca` はテスト専用）。
- **決定（Ctrl/Cmd+Enter）の取り次ぎは `navigator.userActivation.isActive` のときだけ**（独立点検 T12 の指摘）。残余のリスクと E2E で待つ理由は review.md のタスク点検ログ。
- **タスク点検の範囲**は D5 のとおり（T1〜T5・T9・T11・T12。T6〜T8・T10・T13・T14 は掛けず、`cross` を 1 回）。T15（AC22 の変異確認）は test 工程で消化する（coding の承認時は未チェックのまま。上の D4 とは別に、ここで再掲）。
- **public_docs 側の `ask.py`・`SKILL.md` の改修案**は D7。

## D7: public_docs の ask.py・SKILL.md に必要な改修案（この作業では public_docs を変えない。別の PR）

窓に落ちる条件をなくすための、ask.py の変更案。Sodashitsu 側の口は `sodactl ask --features`（docs/sodactl.md「機能確認」）。

1. **`ask_via_soda` の落とす条件を、機能確認に置き換える**（今の `SODA_TYPES`・`view`・`image`/`audio`/`code` の除外を外す）:
   - `sodactl ask --features` を 1 回呼ぶ（`subprocess`。終了コード 0 で 1 行の JSON）。**古い `sodactl` は `--features` を知らず終了コード 2 → 窓へ**。`server` が `null`（繋げない・古い・pane の外）でも窓へ。
   - 定義が使う機能（`edit`/`rank`/`table` → `types:<型>`、`image`/`audio`/`code`/`lang`/`group`/`preview`/`thumb` → `media`、`https://` の `image` → `remote-image`、`view` → `view`）が `server.features` に全部あるときだけ `sodactl ask` へ渡す。足りなければ窓へ（今までどおり）。
2. **パスの扱い**: ask.py の `normalize()` が `local_file`/`normalize_view` で `file/N`・`view/N` に書き換える**前**の定義（`raw`。`ask_via_soda` は既に `raw` を渡している）を渡す。`image`・`audio`・`view.file` の**相対パスは `base_dir`（定義ファイルの場所）から解いた絶対パスに直して**渡す
   （`sodactl` は自分の cwd から解くので、定義ファイルが別の場所にあるとずれる）。`~/` も ask.py 側で展開してよい。
3. **上限の事前確認**: `--features` の `limits`（`fileBytes`・`textBytes`・`totalBytes`・`files`・`views`）で、ローカルのファイルの大きさ・個数・合計を確かめ、超えるなら**窓へ落とさず**エラー（終了コード 1・理由）にする。`sodactl ask` が終了コード 2 を返したとき（定義の誤り・上限・種類の不一致。stderr に
   `invalid ask spec: …`）も、**窓へ落とさず**その理由を標準エラーへ出して終了コード 1 にする（今は終了コード 0 以外を `None`＝窓へ、にしている。`unavailable`・古い `sodactl`・サーバのエラー〔終了コード 1〕だけが窓へ）。
4. **`--review`**: 成果物の `view` を持つ定義を作るだけなので、上の 1〜3 で画面内に出る。`SODA_*` の判定は `view` の除外を外す。
5. **SKILL.md**: 「Sodashitsu の pane の中で動いているとき」の節の「次のときは `sodactl ask` を使わず…（`edit`・`rank`・`table`／`image`・`audio`・`code`／成果物がある）」を、「`sodactl ask --features` で確かめて、使えるときは画面内に出す。使えない（古い `sodactl`・`soda`・繋がっていない）ときだけ窓へ」に直す。
   「成果物があるときは、Sodashitsu の pane の中でも、このマシンのウィンドウで聞く」の行を削除する。画像は絶対パス・相対パス・`https://`（`soda` が取得する。社内プロキシ越しの環境では取れず画像なしになる）・`data:` が使え、上限は 1 ファイル 8 MiB・合計 24 MiB・32 ファイル、と書く。
   成果物の HTML は**スクリプトが動くが外へ通信しない**（CDN・Google Fonts は崩れる）ことと、決定は枠の中の操作の直後だけ効くことも書く。
6. **利用者に確認が要る点**: (a) 窓へ落とさずエラーにする範囲（上の 3。`sodactl` が終了コード 2 のときを窓へ落とすか）。(b) 外部 URL の画像の取得をサーバ側にした結果、`ask.py` の窓（ローカルのブラウザが直接取る）と見え方が変わる（プロキシ越しで差が出る）。(c) HTML の `allow-popups`・`allow-downloads` を
   窓の側は許し、画面内の枠は許さない（外へ通信させない決定）。窓の側も揃えるか。
