# テスト結果: ask-form の画像・音・コード・成果物（view）・edit/rank/table を画面内ダイアログで出す

対象: `feature/ask-media-popup`（origin/main〔UUID 化・サイドバーの区画〕を取り込んだ後の HEAD）。**Node v24.15.0**。

## main の取り込み

`git merge origin/main` は `packages/web/src/components/AskDialog.vue` の 1 か所だけ衝突した（pane の呼び名）。この作業は pane 名を `paneName`（computed）に集約して成果物の枠のラベルにも渡し、main は pane が無いときの代替表記を `shortId(paneId)`（先頭 8 文字）にした。両方を保ち、`paneName` の代替表記を `pane ${shortId(a.paneId)}` にした（`p3` の形を決め打ちしない）。コミット `a68b455`。`decisions.md` D8 にも記録。

## 実行したもの

- `pnpm install --offline` → `pnpm build` → `pnpm typecheck`（Node 24）— 終了コード 0。
- `pnpm test`（全体。Node 24）— **8040 passed / 0 failed**（417 files）。端末版 2 つの同時接続の統合テストも通った。
- `pnpm lint` — 22 errors（main と同じ件数。足したテストの 2 ファイルは eslint でエラー 0）。
- `aidev smoke`（作業フォルダの外の worktree。2 回）— 2 回とも **pass（exit 0, 10 本）**。
- E2E 全体（Playwright。2 回。318 件。この work の `ask-media`・`ask-types`・`ask-view`・既存の `ask-form*`・`workspace-tab-pane` を含む）— 1 回目 **304 passed / 11 failed**、2 回目 **303 passed / 11 failed**（下の比較）。ask 関連の spec は 2 回とも 1 件も落ちない。
  - 注: ask 系の spec だけを指定して流したつもりが、引数の渡し方で全体が走った（結果として全体を 2 回流した）。
- 変異の確認（T15。下の「失敗の証跡」）— すべて落ちた。落ちない変異が 1 つ（SVG を `<img>` 以外で開く）あったので E2E を 1 本足した。足した後の `ask-view.spec.ts` — 10 passed。変異を戻した後の `git diff -- packages/server packages/web` は空。

## main との比較（E2E の失敗）

落ちた 11 件は、すべて main の既知の 18 件（appearance-settings×3・key-bindings×3・mobile×1・new-terminal-cwd×1・scrollback-copy×1・settings×4・theme-settings×4・workspace-tab-pane×1）の内側:

- 1 回目: key-bindings×1（Keyboard Lock）・mobile×2・new-terminal-cwd×1・scrollback-copy×1・settings×2・theme-settings×4。
- 2 回目: mobile×2・new-terminal-cwd×1・scrollback-copy×1・settings×2・theme-settings×4・workspace-tab-pane×1（新しい pane を作る操作の直後に打った文字）。
- 1 回目の key-bindings と 2 回目の workspace-tab-pane は回ごとに入れ替わる既知の不安定。**既知の外の失敗は無い**ので、main の worktree での比較・単独の再実行は掛けていない。

## 受け入れ基準ごとの判定

- AC1: pass — 画像: `AskMedia.test.ts`・`ask.media.integration.test.ts`・E2E `ask-media.spec.ts`（`naturalWidth`・`currentSrc`。窓に落ちず画面内で出る）。
- AC2: pass — 音: E2E は `window.Audio` を包んで `src`（`data:`）と `play()` を観測（音は聞けない。手動項目へ）。
- AC3: pass — `AskMedia.test.ts`・`mediaSniff.test.ts`・結合・E2E（.png の名のテキスト・存在しない・相対パスは終了コード 2）。**変異 (a1)〜(a5) で落ちることを確認**。
- AC4: pass — 個数・個別・合計・サーバ全体の上限の境界値（ちょうど・+1）の単体テスト。E2E は巨大ファイルで終了コード 2。
- AC5: pass — SVG は `<img>` の `data:` URL だけ。E2E `ask-media.spec.ts`（選択肢の画像）と `ask-view.spec.ts`（**今回足した。成果物の SVG**）。**変異 (d1)(d2) で落ちることを確認**。
- AC6: pass — `ask.test.ts`・`AskController` の単体・E2E `ask-types.spec.ts`（3 型を操作して `sodactl` の JSON を見る）。
- AC7: pass — E2E: 混ぜた定義の 1 つのフォーム。
- AC8: pass — E2E `ask-view.spec.ts`（見出し・表・mermaid の `svg` 2 つ・text の `<pre>`・image・タブ・矢印キー）。
- AC9: pass — E2E の隔離の実測（`parent.document`・`localStorage`・`top.location` が SecurityError、`fetch`・WebSocket 拒否）と負の対照。**変異 (c1)〜(c3) で落ちることを確認**。
- AC10: pass — E2E: ラベルはアプリが描き、定義の題で変えられない。
- AC11: pass — E2E: Markdown 内の `<script>`・`onerror`・`javascript:` が動かず、CSP 違反が出る。
- AC12: pass — `composeServer(args, { askImageFetcher })` の偽の取得で、E2E がブラウザの外向きのリクエスト 0 を確認。
- AC13: pass — 取得に失敗しても質問が出て（画像なし）固定の行に件数。
- AC14: pass — `isBlockedAddress` の表（50 件）・`RemoteImageFetcher.test.ts`（`request` が呼ばれない）。**変異 (b1)(b2) で落ちることを確認**。
- AC15: pass — `request` に渡るヘッダに Cookie・Authorization・Referer が無い（単体）。
- AC16: pass — `AskService.test.ts`（閉じる 5 経路で `mediaBytes` が 0 に戻る）。
- AC17: pass — `AskService`・`ask.integration.test.ts`（購読していない接続・知らない askId・範囲外）。
- AC18: pass — `sodactl ask --features` の単体・結合・古いサーバの偽で `unavailable`。
- AC19: pass — 4 つの組み合わせの単体（docs の表と対応）。実物の別バージョン同士は未検証（下の穴）。
- AC20: pass — `machines.integration.test.ts` の方式のリモートの `ask.media` の中継越しの結合テスト。
- AC21: pass — docs・SKILL.md・AGENTS.md・`decisions.md`・`docs/verification.md`（実機でしか見られない項目を手動項目として記載済み）。
- AC22: pass — 下の「失敗の証跡」。変異（a1〜a5・b1・b2・c1・c1-E2E・c2・c3・d1・d2）のすべてで対応するテストが落ち、戻して `git diff` が空。穴 1 つ（成果物の SVG を `<img>` 以外で開く対照が E2E に無かった）を見つけ、E2E を足して塞いだ。
- AC-I1: pass — E2E: 枠の中にフォーカスを置いて `Escape` → `cancelled`。
- AC-I2: pass — E2E: 枠の中で `Ctrl+Enter` → `answered`。
- AC-I3: pass — E2E: タブの矢印キー・キーボードだけで通す。
- AC-I4: pass — 固定の行へフォーカス・閉じたら端末へ（既存の `restoreFocus`）。
- AC-I5: pass — 取り次ぎの 3 種以外は親へ届かない（単体＋E2E。利用者の操作なしの決定メッセージでも確定しない）。

## 手動項目（`docs/verification.md`「共通：質問のフォームの画像・音・コード・成果物・edit/rank/table」）

実機でしか見られないものが、チェックボックスの手動項目として書かれていることを確認した: 実際に鳴る音・実インターネットの画像（サーバが取得し、ブラウザは外へ出さない）・md-to-doc の HTML/Markdown の成果物・`edit`/`rank`/`table` の実機操作・別のマシンの pane から・`sodactl ask --features` と古いサーバ。「確かめていないもの」に、別のマシンのブラウザ・実機のスマートフォン・Firefox・Safari・動画・`ask.py` の改修後の連携・mermaid の全図種・社内プロキシ越しも明記されている。

## 失敗の証跡

通常の実行（変異なし）では、この work に由来する失敗は発生していない（E2E の 11 件は main の既知）。以下は T15 の変異の生の出力（実装を一時的に壊して実行し、戻した）。長いので `FAIL |...` の行（`×` の行と同じ内容）と長い行の末尾は省いた。(a1) は最初の 1 件だけログへ取り損ねたので、端末の出力をそのまま貼る。

```
$ （変異を当てて）pnpm exec vitest run packages/server/src/ask    # 変異ごと。各見出しの下が出力
### (a1) 拡張子だけで通す（ローカルファイル。先頭バイトを見ない）
 packages/server/src/ask/AskMedia.ts               | 6 ++----
     × 存在しない・許可外の拡張子・偽装（.png の名のテキスト）・種類違い（画像の欄に音）は誤り 12ms
     × ローカルの誤り（存在しない・偽装・相対パス）は ask.open が invalid_ask_spec で返り、画面には何も出ない 20481ms
 Test Files  2 failed | 4 passed (6)
      Tests  2 failed | 145 passed (147)
### (a2) 先頭バイトだけで通す（拡張子の対応を見ない。ローカル）
 packages/server/src/ask/AskMedia.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
     × 存在しない・許可外の拡張子・偽装（.png の名のテキスト）・種類違い（画像の欄に音）は誤り 9ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  1 failed | 5 passed (6)
      Tests  1 failed | 146 passed (147)
### (a3) data: の MIME だけで通す（先頭バイトを見ない）
 packages/server/src/ask/AskMedia.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
     × MIME と先頭バイトが合えば通り、合わなければ誤り 4ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  1 failed | 5 passed (6)
      Tests  1 failed | 146 passed (147)
### (a4) 外部 URL の取得結果の種類確認を外す（loadRemote）
 packages/server/src/ask/AskMedia.ts | 3 +--
 1 file changed, 1 insertion(+), 2 deletions(-)
     × 画像でない・大きすぎる取得結果も、失敗として外す 5ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  1 failed | 5 passed (6)
      Tests  1 failed | 146 passed (147)
### (a5) RemoteImageFetcher: Content-Type だけで通す（先頭バイトを見ない）
 packages/server/src/ask/RemoteImageFetcher.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
     × 200 以外・Content-Type が画像でない・本文が種類と合わない・大きすぎる は失敗 7ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  1 failed | 5 passed (6)
      Tests  1 failed | 146 passed (147)
### (b1) isBlockedAddress: 常に false（ループバック・プライベートを通す）
 packages/server/src/ask/RemoteImageFetcher.ts | 1 +
 1 file changed, 1 insertion(+)
     × 拒否: 0.0.0.0 5ms
     × 拒否: 10.1.2.3 1ms
     × 拒否: 100.64.0.1 1ms
     × 拒否: 100.127.255.255 0ms
     × 拒否: 127.0.0.1 0ms
     × 拒否: 127.255.0.1 0ms
     × 拒否: 169.254.169.254 0ms
     × 拒否: 172.16.0.1 0ms
     × 拒否: 172.31.255.255 0ms
     × 拒否: 192.0.0.1 0ms
     × 拒否: 192.0.2.1 0ms
     × 拒否: 192.168.1.1 0ms
     × 拒否: 198.18.0.1 0ms
     × 拒否: 198.19.1.1 0ms
     × 拒否: 198.51.100.1 0ms
     × 拒否: 203.0.113.1 0ms
     × 拒否: 224.0.0.1 0ms
     × 拒否: 239.1.1.1 0ms
     × 拒否: 240.0.0.1 0ms
     × 拒否: 255.255.255.255 0ms
     × 拒否: :: 0ms
     × 拒否: ::1 0ms
     × 拒否: fc00::1 0ms
     × 拒否: fd12:3456::1 0ms
     × 拒否: fe80::1 0ms
     × 拒否: ff02::1 0ms
     × 拒否: ::ffff:127.0.0.1 0ms
     × 拒否: ::ffff:7f00:1 0ms
     × 拒否: ::ffff:10.0.0.1 0ms
     × 拒否: ::ffff:169.254.169.254 0ms
     × 拒否: 64:ff9b::7f00:1 0ms
     × 拒否: ::127.0.0.1 0ms
     × 拒否: 2001:db8::1 0ms
     × 拒否: 2001::1 0ms
     × 拒否: 2002:7f00:1::1 0ms
     × 拒否: 2002:a9fe:a9fe::1 0ms
     × 拒否: fe80::1%eth0 0ms
     × 拒否: not-an-ip 0ms
     × 拒否: 1.2.3 0ms
     × 拒否: 300.1.1.1 0ms
     × 拒否: ::g 0ms
     × 拒否: 1::2::3 0ms
     × IPv4 ループバック 3ms
     × メタデータ 1ms
     × プライベート 2ms
     × IPv6 ループバック 1ms
     × 10 進整数の IP 1ms
     × 16 進の IP 4ms
     × プライベートへ解決するホスト名・1 つでもプライベートが混ざる解決は、リクエストを出さない 1ms
     × プライベート・別の scheme・認証情報つきへのリダイレクトは、次のリクエストを出さない 2ms
⎯⎯⎯⎯⎯⎯ Failed Tests 50 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  1 failed | 5 passed (6)
      Tests  50 failed | 97 passed (147)
### (b2) 接続前の検査（lookup 結果）を外す
 packages/server/src/ask/RemoteImageFetcher.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
     × IPv4 ループバック 6ms
     × メタデータ 1ms
     × プライベート 1ms
     × IPv6 ループバック 1ms
     × 10 進整数の IP 1ms
     × 16 進の IP 1ms
     × プライベートへ解決するホスト名・1 つでもプライベートが混ざる解決は、リクエストを出さない 1ms
     × プライベート・別の scheme・認証情報つきへのリダイレクトは、次のリクエストを出さない 2ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 8 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  1 failed | 5 passed (6)
      Tests  8 failed | 139 passed (147)
### (c1) iframe の sandbox 属性に allow-same-origin を足す（AskViewer.vue）
 packages/web/src/components/AskViewer.vue | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
     × iframe の sandbox は allow-scripts だけ（allow-same-origin・allow-popups・allow-top-navigation を付けない）。referrer も送らない 5ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
### (c2) 静的ページの応答ヘッダの CSP から sandbox を外す（HttpServer.ts）
 packages/server/src/http/HttpServer.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
     × markdown.html: script-src 'self' だけ・default-src 'none'・sandbox は allow-scripts だけ（allow-same-origin なし）。同じ origin の iframe に入れられる 41ms
     × html.html: スクリプト付き HTML を動かすために unsafe-inline・unsafe-eval を許すが、default-src 'none'（外へ送れない）・sandbox は allow-scripts だけ 37ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  1 failed | 1 passed (2)
      Tests  2 failed | 23 passed (25)
### (c3) ヘッダの sandbox に allow-same-origin を足す（HttpServer.ts）
 packages/server/src/http/HttpServer.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
     × markdown.html: script-src 'self' だけ・default-src 'none'・sandbox は allow-scripts だけ（allow-same-origin なし）。同じ origin の iframe に入れられる 38ms
     × html.html: スクリプト付き HTML を動かすために unsafe-inline・unsafe-eval を許すが、default-src 'none'（外へ送れない）・sandbox は allow-scripts だけ 33ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  1 failed | 1 passed (2)
      Tests  2 failed | 23 passed (25)
### (c1-E2E) 同じ変異（allow-same-origin）を E2E の隔離の実測で
built
  ✓   1 src/specs/ask-view.spec.ts:40:1 › text・image・markdown（mermaid の図）・html がタブで出て、markdown は整形される（AC8） (2.3s)
  ✘   2 src/specs/ask-view.spec.ts:102:1 › 隔離: html の枠の中のスクリプトは動くが、parent.document・localStorage・top.location は SecurityError、fetch・WebSocket・外への画像は拒否され、アプリに触れない（AC9） (1.3s)
  ✓   3 src/specs/ask-view.spec.ts:147:1 › 負の対照: 同じ実測を枠の外（アプリのページ）で動かすと全部触れる。枠の sandbox 属性に allow-same-origin を足して読み込み直しても、応答ヘッダの sandbox で隔離は保たれる (1.5s)
  ✓   4 src/specs/ask-view.spec.ts:189:1 › Markdown に埋め込んだ <script>・onerror・javascript: は動かない（CSP がインラインを止める）。HTML の埋め込みは文字として見える形で残らず、リンクは開けない（AC11） (1.7s)
  ✓   5 src/specs/ask-view.spec.ts:234:1 › 枠の中にフォーカスがあるときの Esc は取り消し・Ctrl+Enter は決定として親へ届く。枠のスクリプトが送る関係のないメッセージは無視される（AC-I1・AC-I2・AC-I5） (2.3s)
  ✓   6 src/specs/ask-view.spec.ts:284:1 › 枠の中のスクリプトが、利用者の操作なしに決定のメッセージを送っても、質問は確定しない（既定のままの承認を成果物の側から起こせない。AC-I5） (10.3s)
  ✓   7 src/specs/ask-view.spec.ts:314:1 › 固定のラベル「pane『…』の成果物（隔離表示）」は、成果物の題・本文では変えられない（AC10）。枠の外観を soda のダイアログに見せかけても、ラベルが残る (1.3s)
  ✓   8 src/specs/ask-view.spec.ts:344:1 › 配置: デスクトップは左に成果物・右に質問、モバイル（幅 390）は上に成果物・下に質問の縦積み。ダイアログは使える高さいっぱい (1.4s)
  ✓   9 src/specs/ask-view.spec.ts:383:1 › 成果物が読めない（存在しない・UTF-8 でないバイナリ・8 件超）定義は、ダイアログを出さず理由つきのエラー（終了コード 2）（AC3・AC4） (1.5s)
  ✓  10 src/specs/ask-view.spec.ts:408:1 › 成果物の SVG は <img> だけで描かれ、スクリプトは動かない。iframe・object・embed では開かない（AC5・AC22 の対照） (1.8s)
    Error: expect(received).toBe(expected) // Object.is equality
    Expected: "allow-scripts"
    Received: "allow-scripts allow-same-origin"
    > 116 |     expect(sandbox).toBe("allow-scripts");
      117 |     expect(sandbox).not.toContain("allow-same-origin");
      118 |     await expect(frameOf(page).locator("#r")).not.toHaveText("…");
  1 failed
  9 passed (26.9s)
### (d1) 成果物の image を <img> でなく sandbox 無しの <iframe> で開く（SVG を文書として開く）
 packages/web/src/components/AskViewer.vue | 5 ++---
 1 file changed, 2 insertions(+), 3 deletions(-)
built
  ✘   1 src/specs/ask-view.spec.ts:40:1 › text・image・markdown（mermaid の図）・html がタブで出て、markdown は整形される（AC8） (7.2s)
  ✓   2 src/specs/ask-view.spec.ts:102:1 › 隔離: html の枠の中のスクリプトは動くが、parent.document・localStorage・top.location は SecurityError、fetch・WebSocket・外への画像は拒否され、アプリに触れない（AC9） (1.4s)
  ✓   3 src/specs/ask-view.spec.ts:147:1 › 負の対照: 同じ実測を枠の外（アプリのページ）で動かすと全部触れる。枠の sandbox 属性に allow-same-origin を足して読み込み直しても、応答ヘッダの sandbox で隔離は保たれる (1.4s)
  ✓   4 src/specs/ask-view.spec.ts:189:1 › Markdown に埋め込んだ <script>・onerror・javascript: は動かない（CSP がインラインを止める）。HTML の埋め込みは文字として見える形で残らず、リンクは開けない（AC11） (1.6s)
  ✓   5 src/specs/ask-view.spec.ts:234:1 › 枠の中にフォーカスがあるときの Esc は取り消し・Ctrl+Enter は決定として親へ届く。枠のスクリプトが送る関係のないメッセージは無視される（AC-I1・AC-I2・AC-I5） (2.2s)
  ✓   6 src/specs/ask-view.spec.ts:284:1 › 枠の中のスクリプトが、利用者の操作なしに決定のメッセージを送っても、質問は確定しない（既定のままの承認を成果物の側から起こせない。AC-I5） (10.3s)
  ✓   7 src/specs/ask-view.spec.ts:314:1 › 固定のラベル「pane『…』の成果物（隔離表示）」は、成果物の題・本文では変えられない（AC10）。枠の外観を soda のダイアログに見せかけても、ラベルが残る (1.2s)
  ✓   8 src/specs/ask-view.spec.ts:344:1 › 配置: デスクトップは左に成果物・右に質問、モバイル（幅 390）は上に成果物・下に質問の縦積み。ダイアログは使える高さいっぱい (1.3s)
  ✓   9 src/specs/ask-view.spec.ts:383:1 › 成果物が読めない（存在しない・UTF-8 でないバイナリ・8 件超）定義は、ダイアログを出さず理由つきのエラー（終了コード 2）（AC3・AC4） (1.4s)
  ✘  10 src/specs/ask-view.spec.ts:408:1 › 成果物の SVG は <img> だけで描かれ、スクリプトは動かない。iframe・object・embed では開かない（AC5・AC22 の対照） (6.3s)
    Error: expect(received).toBe(expected) // Object.is equality
    Expected: 50
    Received: undefined
      88 |     await expect(page.locator("[data-ask-view-text]")).toHaveText("<b>タグのまま</b>\n二行目");
    Error: expect(received).toBe(expected) // Object.is equality
    Expected: 40
    Received: undefined
      425 |     expect(await page.locator("[data-ask-view-image]").evaluate((i) => i.tagName)).toBe("IMG");
      426 |     expect(await page.locator("[data-ask-view-image]").getAttribute("src")).toMatch(
  2 failed
  8 passed (35.9s)
### (d2) <img> は残したまま、同じ SVG を object でも開く（枠の外のスクリプトが動く経路を足す）
 packages/web/src/components/AskViewer.vue | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
  ✘  1 src/specs/ask-view.spec.ts:408:1 › 成果物の SVG は <img> だけで描かれ、スクリプトは動かない。iframe・object・embed では開かない（AC5・AC22 の対照） (1.6s)
    Error: expect(received).toBe(expected) // Object.is equality
    Expected: 0
    Received: 1
    Error Context: test-results/ask-view-成果物の-SVG-は-img-だけ-c5768-・embed-では開かない（AC5・AC22-の対照）/error-context.md
  1 failed

```

(d1) の E2E では、既存の「image が描かれる」の件（AC8）も `naturalWidth` が取れずに落ちる。足した SVG の件は (d2)（`<img>` を残したまま同じ SVG を `<object>` でも開く）で落ちる（`Expected: 0 / Received: 1`）。足す前は、(d2) を落とすテストが無かった（変異が生き残った）。足したもの: `packages/e2e/src/specs/ask-view.spec.ts` の「成果物の SVG は <img> だけで描かれ…」と、`packages/e2e/src/support/media.ts` の `EVIL_SVG` がコンソールに `svg-script-ran` を出す変更。

## 起動確認（smoke）

```
$ aidev smoke   （2 回。作業フォルダの外の worktree）
- 端末版 2 つを同時に開き、片方の打鍵が両方に出た
- ブラウザ相当のクライアントが同じ workspace を見て、作った workspace がサイドバーに、送った入力が端末版に出た
- 端末版を両方 prefix+q で抜けた（終了コード 0）
tui-pty-verify: OK
smoke: pass (exit 0, 10 本)
```

この work は新しい入口 `sodactl ask --features` を足したが、`smokeCommands` に行は足さない。pane の中（pane.sock）でないと意味のある結果が出ず（pane の外では `server: null`）、起動確認の環境では pane 内の実行を再現できないため。代わりに結合テスト（実物の `/ws`・`pane.sock`）と E2E（ビルドした `sodactl` を子プロセスで起動）が見ている。

## 未検証の穴（skip / 環境不足）

- 実際に鳴る音・実インターネットの画像・実機のスマートフォン・Firefox・Safari・別のマシンのブラウザ・社内プロキシ越し・mermaid の全図種・動画は未検証（手動項目。`docs/verification.md`）。
- 実物の `ask.py`（public_docs）の改修後の連携は別の PR（decisions D7）。新旧の `sodactl`・サーバの 4 つの組み合わせは単体の偽で確かめた。
- 選択肢の画像（第三者の部品 `third_party/ask-form/` が描く）が SVG を `<img>` 以外で開く変異は、部品が無改変のため作っていない。E2E は「DOM に iframe・object・embed・a が無い」「スクリプトが動かない」ことを見ている。
- E2E の全体は約 14 分（`workers: 1`）。落ちる 11 件は main の既知で、main の worktree との比較は、既知の外の失敗が無いので掛けていない。
