# 要件: ask-form の画像・音・コード・成果物（view）・edit/rank/table を、Sodashitsu の画面内ダイアログで出す

## 背景 / 課題

Sodashitsu の pane の中で ask-form（public_docs の `ask.py`）を使うと、`sodactl ask` を経由して画面内のダイアログにフォームが出る。ただし次のどれかに当たると
`ask.py` は `sodactl ask` を使わず、**Edge などの単独ウィンドウ**を開く（利用者が Web アプリで作業しているのに、別のウィンドウに飛ばされる）。

- 選択肢に `image`・`audio`・`code` がある（画像付きのフォーム）
- 質問の型が `edit`・`rank`・`table`
- 定義に成果物 `view`（HTML・Markdown・画像・テキスト）がある（`--review` も `view` を作る）

原因は Sodashitsu 側が対応していないこと。`normalizeAskSpec` は `image` 等を黙って捨て、`edit`・`rank`・`table` は「対応していない型」として `unavailable` にする。
部品 `<ask-form>`（`third_party/ask-form/ask-form.js` 1.3.0）自体はこれらを描ける。足りないのは、定義の検査（protocol）・ファイルをブラウザへ届ける経路（server）・
画面の枠（web: `resolveMedia`・成果物の枠）・古い版との見分け（機能確認）である。
前の作業 `20261003-ask-form-component` の requirements は、これらを「別の作業 B」として明示的に残していた。この作業がその B である。
調査: `/tmp/claude-1000/-workspaces-sodashitsu/957621e5-6a11-4044-ad8d-c86e30053090/scratchpad/ask-media-popup-research.md`（依頼元の調査メモ。事実は design の「依拠する既存の事実」に出所つきで写す）。

## 目的 / ゴール

Sodashitsu の pane の中で出した ask-form が、**単独ウィンドウに落ちる条件を持たず、すべて画面内のダイアログで出る**状態。
画像・音・コードのプレビュー、`group`・`thumb`・`preview`、`edit`・`rank`・`table` の質問、成果物 `view`（text・image・markdown・html）が、ダイアログの中で使える。
外部 URL（https）の画像は、利用者の IP を画像の取得元に見せずに出る。
紐づく charter ゴール: charter なし（`.aidev/charter.md` が無い）。依頼元（利用者）の指示による。

## ユーザーストーリー

- US1: Sodashitsu の Web アプリを使う利用者として、画像付きの質問（画面案の見比べ・差分のコード）が、別のウィンドウではなく画面内のダイアログで出てほしい。なぜなら、作業の流れ（画面・フォーカス・スマホの利用）を壊されたくないから。（受け入れ: AC1, AC2, AC3, AC4, AC5, AC-I1, AC-I4）
- US2: 同じ利用者として、`edit`（文面を直す）・`rank`（並べる）・`table`（行ごとに選ぶ）も画面内で答えたい。なぜなら、画像付きのフォームにこれらが混ざるだけで窓に落ちると、US1 が満たされないから。（AC6, AC7）
- US3: スキルが作った成果物（Markdown・HTML・画像・テキスト）を確認して承認する利用者として、成果物をダイアログの横に出してほしい。なぜなら、承認の流れ（`--review`）が窓に落ちるから。（AC8, AC9, AC10, AC11, AC-I1〜AC-I5）
- US4: 画像を https の URL で渡すスキルの作者として、URL のままで画像が出てほしい。なぜなら、ファイルに落とす手間を省きたいが、利用者の IP が取得元に見えたり、ダイアログが外へ通信したりするのは避けたいから。（AC12, AC13）
- US5: Sodashitsu のサーバの管理者（利用者）として、pane のプログラムがサーバに任意のファイルを読ませたり内部ネットワークを叩かせたりできないでほしい。なぜなら、ファイル・URL を指すのは pane のプログラムで、信頼できるとは限らないから。（AC14, AC15, AC16, AC17, AC22）
- US6: ask.py（スキル）の保守者として、新旧の `sodactl`・サーバを見分ける口がほしい。なぜなら、古い版は新しい項目を黙って捨て、`view` が出ないまま承認が進むのを防ぎたいから。（AC18, AC19, AC21）
- US7: 別のマシン（保存した SSH のマシン）の pane から質問を出す利用者として、手元の画面で同じように答えたい。なぜなら、リモートでも画面内で出ることが Sodashitsu の売りだから。（AC20）

## スコープ

### 対象

- protocol: 定義の項目を足す（選択肢の `image`・`audio`・`code`・`lang`・`group`、質問の `preview`・`thumb`、型 `edit`・`rank`・`table` とその項目、全体の `view`）。検査・回答の集め方・回答の検査・共通の試験データのテスト。
- server: サーバがファイル・URL・`data:` を読んで一時保存し（`AskMedia`）、ブラウザへ分割して渡す（`ask.media`）。外部 URL の取得（SSRF 対策つき）。成果物の隔離表示用の静的ページ（`/ask-view/*`）の配信と専用ヘッダ。機能確認の口（`ask.features`）。
- cli: `sodactl ask` の相対パスの絶対化・上限の事前確認・機能確認（`sodactl ask --features`）・版の古いサーバへの `unavailable`。
- web: メディアの取得と `resolveMedia`、成果物の枠 `AskViewer`（左右 2 分割・モバイルは縦積み・固定ラベル・キーの取り次ぎ）、CSP の `media-src data:`、同梱ライブラリ（marked・mermaid）の静的配置。
- docs（`docs/sodactl.md` 等）・`sodactl` の SKILL.md・E2E・単体テスト。
- public_docs 側の `ask.py`・`SKILL.md` の改修案を `decisions.md` に書く（この作業では public_docs を変えない）。

### 対象外

- public_docs の `ask.py`・`SKILL.md`・`ask-form.js` の変更（別の PR。案だけ書く）。
- `third_party/ask-form/` の手での変更（同期スクリプトのみ。今回は 1.3.0 のままで足りるので写し直さない）。
- 動画・大きなメディア（上限は 1 ファイル 8 MiB）。
- 画面外の表示（TUI 版 `soda` の ask。端末版は ask の画面を持たない）。
- `remember`（ask.py だけの機能）・`--selftest`。
- UUID への識別子の切り替え（別の worktree）。ask の `askId` を含め、id の形に依存しない。

## 機能要件

1. 定義の項目: 選択肢に `image`・`audio`（参照の文字列）・`code`・`lang`・`group`。質問に `preview`（`side`/`inline`）・`thumb`（20〜2000 の整数）。型 `edit`（`text`・`rows`・`mono`・`required` 既定 true）・`rank`（`options`・`default`）・`table`（`options`・`rows`・`rowLabel`・`pickLabel`・`default`）。全体に `view`（配列 8 件まで。`file` か `text`・`title`・`raw`）。
2. 参照の種類: ローカルのファイル（`sodactl` が呼び出し元の cwd から絶対パスにして送る）・`https://` の URL（画像だけ）・`data:` の URI（画像・音。MIME と先頭バイトを確認）。`http://`・`file:`・その他は誤り。
3. 上限: 1 ファイル 8 MiB（Markdown・テキストの `view` は 2 MiB）・1 つの質問の合計 24 MiB・32 ファイルまで・サーバ全体（待っている質問の合計）128 MiB。超えたら、窓へ落とさず、理由つきの定義の誤り（`sodactl ask` は終了コード 2。標準エラーに理由）にする。
4. サーバは、ファイルを通常のファイルだけ読み、拡張子の許可リストと先頭バイトの両方で種類を確かめ、MIME を自分で決める。SVG は `<img>` だけで出す。
5. 外部 URL の画像は、サーバが取得して一時保存し、ブラウザには自分の経路（`/ws` の分割取得）で渡す。取得の失敗は、質問を失敗にせず、その画像を無し（プレビューなし）にして、固定の行に「画像 N 件を取得できませんでした」と出す。
6. 成果物 `view`: text は `<pre>`（文字として）・image は `<img>`・markdown は整形（mermaid の図つき）・html は隔離した枠でスクリプトも動かす（外への通信は止める）。枠には固定のラベル「pane『…』の成果物（隔離表示）」を付ける。
7. 機能確認: `sodactl ask --features`（JSON。sodactl の機能・上限・サーバの機能）と、サーバの `ask.features`。古いサーバは新しい項目が要る定義に `unavailable`（理由つき）。
8. アプリ本体の CSP は、音のための `media-src data:` の追加以外は変えない。成果物の枠は専用の静的ページ `/ask-view/*` だけ別ヘッダ（`sandbox` 付き・`default-src 'none'`）で開く。

## 非機能要件 / 制約

- 安全の考え方（`20261003-ask-form-component`）を保つ: 定義の値は `textContent`・属性だけ・`innerHTML` 禁止・CSP の違反を増やさない・出どころの固定の行。
- 外部 URL の取得は SSRF 対策を必ず入れる（https のみ・ポート 443 のみ・解決後の IP がループバック/プライベート/リンクローカル/メタデータ/CGNAT 宛なら拒否・接続は検査した IP に固定・リダイレクト 3 回まで各回再検査・サイズ 8 MiB・時間 10 秒（AC13 の失敗の一種として検査）・Content-Type と先頭バイトの検査・認証情報も Cookie も送らない）。
- ファイルの読み出し範囲は pane のシェルと同じ権限のまま。ただし、通常ファイル・許可拡張子・先頭バイトの確認は必須。
- 古い sodactl・サーバとの互換: 新しい項目を使わない定義の動作は変えない。
- 識別子の形（`p3` 等）に依存しない。
- 部品 `third_party/ask-form/` は無改変。

## 完了条件 (受け入れ基準)

- [ ] AC1: 選択肢に `image`（ローカルのファイル）を持つ質問が、画面内のダイアログで、画像が描かれて出る（ブラウザで `naturalWidth` > 0・`src` が `data:`・CSP 違反が増えない）。
- [ ] AC2: `audio` の選択肢は「▶ 試聴」が付き、押すと `data:` の音源が `Audio` に渡る（`media-src` の違反なし）。`code`・`lang: diff`・`group`・`thumb`・`preview` が出る。
- [ ] AC3: `image` に無いファイル・ディレクトリ・FIFO・シンボリックリンク先が通常ファイルでないもの・許可外の拡張子（許可: 画像 png/jpg/jpeg/gif/webp/avif/svg、音 wav/mp3/ogg/oga/opus/m4a/aac/flac）・拡張子と先頭バイトが合わないもの（`.png` に偽装したテキスト）・不正な `data:`（MIME・先頭バイトの不一致）・`http:`/`file:`/相対パスの参照・`view` が 8 件超・Markdown/テキストが 2 MiB 超は、定義の誤り（終了コード 2、理由つき）。`/etc/passwd` を `.png` と名乗らせても読めない。
- [ ] AC4: 1 ファイル 8 MiB・合計 24 MiB・32 ファイル・サーバ全体 128 MiB を超える定義は、窓へ落ちずに理由つきの誤りになる（質問は出ない）。上限ちょうどは通る。
- [ ] AC5: SVG（負の対照は、SVG を `<img>` 以外〔iframe・直接の URL〕で開くとスクリプトが動くことを実験で示し、画面にその経路が無いこと） は `<img>` で描かれ、中のスクリプトは実行されない（実測）。SVG を単独で開く経路（拡大表示・リンク）が画面に無い。
- [ ] AC6: `edit`・`rank`・`table` の質問が画面内で答えられ、回答の形（`edit`＝文字列＋`edited`・`rank`＝並べた値の配列・`table`＝`{行: 値}`）が `sodactl ask` の結果に載る。サーバは回答を検査する（`rank` が選択肢の並べ替えでない・`table` の行や値が定義にない回答を断る）。
- [ ] AC7: 画像付きの質問と `edit`・`rank`・`table` が 1 つのフォームに混ざっていても、画面内に出る（窓に落ちる条件が無い）。
- [ ] AC8: `view` の text・image・markdown・html が、ダイアログの左（モバイルは上）の枠にタブで出る。markdown は整形され、mermaid の図が SVG になる。
- [ ] AC9: html の `view` の枠は `sandbox` 属性が `allow-same-origin` を含まず、枠の中のスクリプトは動くが、`parent.document`・`localStorage` は SecurityError、`fetch` は拒否され、アプリの `/ws` に届かない（実測）。負の対照として `allow-same-origin` を足すと同じ検査が落ちること。
- [ ] AC10: 枠にはアプリが描く固定のラベル「pane『…』の成果物（隔離表示）」があり、定義の文字では変えられない。
- [ ] AC11: Markdown に埋め込まれた `<script>`・`onerror` などは実行されない（枠の CSP がインラインを止める）。
- [ ] AC12: `https://` の画像は、サーバが取得して一時保存し、ブラウザは自分のオリジンの `data:` で受ける。ブラウザの画像の取得先へのリクエストは 0（実測）。アプリの CSP の `img-src` は変えない。
- [ ] AC13: 取得に失敗した画像（接続不可・404・サイズ超過・種類違い）は、質問を失敗にせず画像なしで出て、固定の行に件数が出る。
- [ ] AC14: SSRF の宛先（`127.0.0.1`・`localhost`・`169.254.169.254`・`10.0.0.1`・`[::1]`・プライベートへ解決するホスト名・プライベートへのリダイレクト）は接続を試みずに拒否される（宛先の待ち受けにリクエストが届かない）。http・ポート 443 以外・URL の認証情報・4 回目のリダイレクトも拒否。
- [ ] AC15: 取得の要求に Cookie・Authorization・Referer を付けない。
- [ ] AC16: 回答・取り消し・時間切れ・pane が閉じた・切断のいずれでも、一時保存したメディアは破棄され、サーバ全体の合計に戻る。
- [ ] AC17: `ask.media` は（機能要件 5 の経路。アクセス制御として） `ask.subscribe` 済みの画面だけが取れ、知らない askId・範囲外の id は `ask_closed`/`invalid_params`。
- [ ] AC18: `sodactl ask --features` が、sodactl の機能・上限・（接続できれば）サーバの機能を JSON で返す。サーバが古い（`ask.features` を知らない）と、新しい項目が要る定義は `unavailable` で理由が付く。新しい項目を使わない定義は古いサーバでも今までどおり動く。
- [ ] AC19: 新旧の取り合わせの表（新 sodactl×旧サーバ・旧 sodactl×新サーバ）の動作が docs に書かれ、テストされている。
- [ ] AC20: 別のマシンの pane から出した質問でも、画像・成果物が手元の画面に出る（ファイルは別のマシンのサーバが読み、`/ws?machine=` の中継で運ばれる）。
- [ ] AC21: `docs/sodactl.md`・`docs/verification.md`・sodactl の SKILL.md を更新し、`public_docs` 側の ask.py・SKILL.md の改修案を `decisions.md` に書く。
- [ ] AC22: 負の対照（`regression-negative-control`）: AC3・AC5・AC9・AC14 は、対策を外す（種類確認の削除・`allow-same-origin` の追加・IP 検査の削除）とテストが落ちることを確かめ、生の出力を `test-result.md` に残す（test 工程）。

## 相互作用の受け入れ基準（UI を伴う work のみ）

- [ ] AC-I1 開く / 閉じる: 質問が来るとダイアログが開く（今までどおり）。`view` つきでも `Esc`・［キャンセル］で取り消し、枠の中にフォーカスがあるときの `Esc` も取り消す（枠のスクリプトが止めない限り）。閉じると質問は `cancelled`。
- [ ] AC-I2 確定 / 取り消し: ［決定］・`Ctrl/Cmd+Enter` で確定。枠の中にフォーカスがあるときの `Ctrl/Cmd+Enter` も確定する（枠から親への取り次ぎ。実測）。取り消せば回答は送られない。
- [ ] AC-I3 キーボードだけで完結: 開く→（`view` のタブを矢印キーで移る）→質問に答える→決定、がマウス無しで通る。`rank` は `↑↓` で並べ替えられる（部品の機能）。
- [ ] AC-I4 フォーカスの行き先: 開いたときは固定の行（今までどおり）。閉じたら質問の pane の端末へ戻る。枠（iframe）へ勝手にフォーカスを奪わせない（`autofocus` は効かない）。
- [ ] AC-I5 既存の操作を妨げない: 枠の中のキーは、取り次ぎの 3 種（`Esc`・`Ctrl/Cmd+Enter`・`Alt+PageUp/Down`）以外を親へ流さず、端末へ漏らさない（質問が開いている間は端末へキーが流れない既存の仕組みを保つ）。

## 未確定事項 / 確認したいこと

- 利用者が任せた 3 点（依頼元の指示の「決定 6」）: html を含む Markdown の無害化・モバイルの出し方・機能確認の方式。機能要件 6・7 と AC8・AC11・AC18 は推奨案（枠の CSP に任せる・縦積み・`ask.features`＋`sodactl ask --features`）で書いてあり、design で採否の理由を確定して `decisions.md` に記録する。
- 目的の「窓に落ちない」状態は、public_docs の `ask.py` の改修（別 PR）が入って初めて利用者に届く。この作業の範囲は Sodashitsu 側（`sodactl ask` が受けて出せること）までで、その旨を最終報告にも書く。
- `public_docs` の ask.py の改修（機能確認を使った窓への落とし分け・パスの絶対化・上限の事前確認・`--review` の扱い）は、依頼元が別に PR にする。
