# レビュー記録

## タスク点検ログ（coding 工程内）

- T1: UNC パス（`\\host\share`）を `classifyMediaRef` が通していた（Windows のサーバが外部の SMB へ繋ぐ）→ 拒否に直した。`lang`・`group` が文字列でないときは誤りにせず捨てる（`str()` の既存の流儀。`code` だけが誤り=ask.py と同じ）、`view` の件数超過は他の上限と同じ `too_large`、`view.text` の長さは定義全体の 256 KiB が歯止めなので個別の検査は足さない、と判断（指摘は据え置き）。
- T2: `AskMediaParams.id` の上限が 1 大きかった（0 始まりで最大 31）→ 直した。import の並び・`ASK_MEDIA_CHUNK_BYTES` と `FILE_CHUNK_BYTES` の参照元は、値が同じ（768 KiB）ので据え置き。
- T3: 合計の上限を読む前の `stat` で断つ（残りの予算を `readRegularFile` へ）・`st.size` が 0 のファイル（`/proc` 等）は上限+1 まで読んで確かめる・`open` に `O_NOCTTY`。直した。同じファイルが image/audio と view の両方に出たときは別の保持になる（キーが種類別）＝据え置き（合計には両方数える。安全側）。`ftyp` の brand を m4a に絞らない・`data:` の MIME の大文字・`;charset=` は受けない＝拒否側に倒れるので据え置き。
- T4: 検査済みのアドレスを順に試す（IPv6 の経路が無い環境）・名前解決にも時間の上限（`raceAbort`）・IP リテラルに SNI を付けない・実物の `https.request` の固定を自己署名の証明書の local サーバで確かめるテストを足した（`makeRealRequest({ca})`）・destroy の確認。直した。
- T5: 全体の合計に足した値を Entry に持たせて引く（`heldBytes`）・準備中に時間切れ/pane が閉じた/dispose・全体の上限で断った後の後片付けのテストを足した。差し替え口の名前（`askImageFetcher`）を design に反映。
- T9: `rowPicks` が行の value `__proto__` で代入によりプロトタイプへ設定してしまう（部品は `Object.fromEntries`）→ `Object.fromEntries` に直し、回帰テストを足した。
- T11: 許可リストの名前を 1 度だけ作る・405 に `Allow` を付ける・Markdown の枠で `meta`・`link`・`base`・`form`・`iframe`・`object`・`embed` を取り除く（`<meta http-equiv=refresh>` は CSP では止まらない）。直した。
- T12（should）: 枠の中のスクリプトが `postMessage` するだけで決定（Ctrl+Enter 相当）できる→ **決定は `navigator.userActivation.isActive`（利用者の操作の直後・約 5 秒）のときだけ取り次ぐ**ようにした（未対応の環境では取り次がない）。残余のリスク: 利用者が枠の中で操作した直後の 5 秒以内に、成果物のスクリプトが決定を送ること（成果物は自分のスキルが作ったものに限る、と docs に書く）。Esc の取り消しは操作の扱いにならず、害が小さいので許す。E2E は Playwright の操作が操作の扱いを付けるため、送る前に待つ形にした。dark の配色変更の追従は据え置き（開いている間の変更は稀）。
- cross（横断・4 件）: (should) メディアを取っている間に閉じた質問が、取り終えた後に画面へ入る→ `AskController` が `ask.closed` を覚えて（`closedIds`）足さない・回帰テストを足した。(should) html の枠自身が外部ページへ遷移するのは止められない（`navigate-to` が無い）→ docs の表現を正確にし（遷移は止められない・ラベルは残る・取り次ぎは取り消しと前後だけ・決定は操作の直後だけ）、残余のリスクとして記録（Markdown の枠は `meta`・`form`・リンクを除く）。(nit) `requiredFeatures` の https 判定を `classifyMediaRef` に揃えた。(nit) sodactl の事前確認が image と view の同じファイルを 1 つに数える差は、サーバが最終判定なので据え置き。

## ラウンド 1（独立レビュー）

指摘 5 件（should）と nit 3 件。根拠は自分でも確かめてから直した。

1. [should] 枠からの決定の保護が docs より弱い → **指摘の対処（`document.activeElement === frame` を足す）では防げなかった**。実測: 枠のスクリプトが `window.focus(); input.focus()` を呼ぶと、親ページの操作の直後でも iframe にフォーカスが移り、
   `userActivation` とフォーカスの両方を満たして決定が確定した（E2E を先に書いて確認）。枠のページと成果物は同じ文書なので、枠の側にも「本物のキーだけを見る」場所が無い。→ **枠からの決定は取り次がず、質問側の固定の行へフォーカスを移すだけ**にした
   （確定は質問側での 2 度目の Ctrl/Cmd+Enter か［決定］。decisions.md D9-1）。`AskViewer` の `userActivation` の条件・単体テストを外し、docs（「枠の中のキー」）を実際の保護に合わせた。E2E: 「決定の知らせを送り続けても確定しない」（質問側のクリック直後・フォーカス奪取つき）と、
   枠の中の Ctrl+Enter ではフォーカスが移るだけで 2 度目で確定する、を足した。
2. [should] UNC（`//evil/share/a.png`・`/\evil\s\a.png`・`\/…`・`//?/…`）が "path" → 先頭が区切り 2 つのものを拒否（`/^[\\/]{2}/`）。`//` 始まりの正当な用途は docs・既存テストに無い。単体テストを足した（途中の `//` は通る対照つき）。
3. [should] 外部 URL の取得結果が合計の判定より前に溜まる → `ImageFetcher.fetchImage` に `onBytes` を足し、受け取るたびに質問の合計・サーバ全体（保持中 + 全 `prepare` の取得中）へ足す。超えたら残りの取得を中止して誤り（質問の合計: `invalid_ask_spec`、サーバ全体: `ask_busy`）。
   失敗した取得の受け取り済みの分は戻す・`prepare` が終わった後に遅れて来た通知は数えない（テスト中に、中止された取得の遅れた返金で保持量が負になる不具合を自分で見つけて直した）。`prepare` が誤りで終わるときも残りの取得を中止する。
4. [should] pane.sock の権限が docs に無い → 「安全の境界」に、`ask.open` が読み出し・外部への https GET をサーバの権限でさせられること、サンドボックスの外へ出す経路になりうること、socket を許可しない対処を書いた。取得の宛先は**ホスト名だけ**ログに残す（`ask remote image fetch`。テストで URL のパス・クエリが残らないことを確認）。
5. [should] 「今載っている操作は ask.open だけ」 → `ask.open` と `ask.features` の 2 つに直した。
- nit「外への通信は止まる」→ docs（表・隔離の節）と枠のページのコメントを「`fetch`・XHR・WebSocket・画像などの読み込みは止まる。枠自身の遷移は止められない」に直した。CSP の `navigate-to` はブラウザが実装していないので使えない旨を docs に書いた。
- nit SVG の `xlink:href` → **確認できた**（E2E を先に足して落ちることを確認: `<svg><a xlink:href>` の属性が残っていた）。実害は枠自身の遷移と同種（行き先は不透明 origin の枠の中）。Markdown の枠が `a[href]` だけでなく全部の `a` の `href`・`xlink:href` を外すようにして、docs に書いた。
- nit dark → アプリのテーマ（root の `color-scheme`）に合わせた（`AskDialog.vue`）。開いている間のテーマ変更への追従はしない（記録のみ。decisions.md D9-5）。T12 の「残余のリスク」の記述は、上の 1 で置き換わった。

### 壊して落ちる確認（regression-negative-control）

**指摘 1（`AskDialog.onViewKey` の `submit` を `el?.submit()`＝今までの直接確定に戻す。戻した後の `git diff` は元の修正と一致、AskDialog.vue は /tmp の控えと `diff` 一致）**

```
$ npx playwright test ask-view -g "決定の知らせを送り続けても|Ctrl\+Enter は決定として"
  ✘  1 src/specs/ask-view.spec.ts:234:1 › 枠の中にフォーカスがあるときの Esc は取り消し・Ctrl+Enter は決定として親へ届く。… (7.4s)
  ✘  2 src/specs/ask-view.spec.ts:319:1 › 枠のスクリプトが決定の知らせを送り続けても（…）、質問は確定しない。… (9.0s)
    Error: expect(locator).toBeFocused() failed
    Expected: false
    Received: true
  2 failed
```

（途中の試行: 指摘どおり `userActivation` + `activeElement === frame` だけにした版では、フォーカスを奪う枠で「質問は確定しない」が `Expected: false / Received: true` で落ち、この条件では防げないことを確認した。）

**指摘 2（`classifyMediaRef` の判定を元の `ref.startsWith("\\\\")` に戻す）**

```
$ npx vitest run packages/protocol/src/ask.test.ts
 FAIL  |@sodashitsu/protocol| src/ask.test.ts > … > 参照の分類: 許すのは絶対パス・https（…）・同じ種類の data:
AssertionError: //evil/share/a.png: expected 'path' to be null
 Test Files  1 failed (1)
      Tests  1 failed | 69 passed (70)
```
戻し後: `git diff --stat packages/protocol/src/ask.ts` は修正の差分（3 行追加・2 行削除）。70 件通過。

**指摘 3（`loadRemote` が `fetchImage(url, signal, count)` の `count` を渡さない＝受け取りを数えない版に戻す）**

```
$ npx vitest run packages/server/src/ask/AskMedia.test.ts
 ❯ |@sodashitsu/server| src/ask/AskMedia.test.ts (20 tests | 3 failed) 430ms
     × 質問の合計 24 MiB を、取り終える前の受け取りで超えたら、残りの取得を中止して誤りにする。溜めた分は戻る 55ms
     × サーバ全体の上限は、取得中の分も含めて判定する（保持している分との合計）。超えたら ask_busy 8ms
     × 別の質問の取得中の分も、サーバ全体に数える（同時に 2 つの質問） 7ms
AssertionError: expected 4 to be +0 // Object.is equality
AssertionError: expected 1 to be +0 // Object.is equality
AssertionError: expected [ 'fulfilled', 'fulfilled' ] to deeply equal [ 'fulfilled', 'rejected' ]
```
戻し後（`/tmp/AskMedia.fix` と置き換え）: 20 件通過（その後ホスト名のログのテストを足して 21 件）。

**nit（SVG の `xlink:href`。`markdown.js` を直す前）**

```
  ✘  1 src/specs/ask-view.spec.ts:189:1 › Markdown に埋め込んだ <script>・onerror・javascript: は動かない…
    - Expected  - 1
    + Received  + 1
    -   false,
    +   true,
```
修正後は通過。

### 検証

- `pnpm build` 通過。`pnpm typecheck` は E2E の型 2 件（自分の足した spec）を直して通過。
- 単体: `npx vitest run packages/protocol packages/server/src/ask packages/web/src packages/cli scripts` → 181 ファイル・3908 件通過。
- E2E: `ask-view`・`ask-media`・`ask-types`（24 件）、`ask-form*`（73 件）通過。

## ラウンド 2（d180d44 の再レビュー）

1. [should] SMIL（`<set>`・`<animate>`）でリンク外しをすり抜けて枠が外へ遷移 → Markdown の枠が `svg`・`math`・`map`・`area` を取り除く（decisions.md D10-1。mermaid の SVG は整形の後に足すので残る）。E2E に SMIL の 2 パターン・`<math href>`・`<area href>`・`href="#x"` と `xlink:href` の混在を足した（取り除いた後はクリックしても遷移せず、`svg a` 自体が無い）。
2. [should] フォーカス奪取による入力の横取り → **防げない**と実測して docs を正直に直した（確定は防げるが入力の漏えいは防げない・信頼できる成果物だけにする・入力のある質問と信頼できない成果物を組み合わせない）。`inert`・`visibility:hidden`・`display:none` はどれも防げず（実測）、検知して戻す案は窓が残るので入れない（D10-2）。E2E は限界を実測で assert する（iframe がフォーカスを得る・打った文字が枠の入力欄に入る・確定はしない）。
3. [nit] `href="#x"` と `xlink:href` の混在 → `xlink:href` を常に外す（E2E に混在のケース）。
4. [nit] `remaining()` が取得中の途中経過に左右される → 許容と記録（D10-3）。

### 壊して落ちる確認（`markdown.js` の取り除く対象から `svg, math, map, area` を外す。戻した後は `/tmp` の控えと差分なし）

```
$ npx playwright test src/specs/ask-view.spec.ts -g "Markdown に埋め込んだ"
  ✘  1 src/specs/ask-view.spec.ts:189:1 › Markdown に埋め込んだ <script>・onerror・javascript: は動かない… (2.4s)
    - Expected  - 1
    + Received  + 1
        "links": 0,
        "mixed": false,
    -   "shapes": 0,
    +   "shapes": 6,
      231 |     ).toEqual({ shapes: 0, links: 0, mixed: false });
  1 failed
```

### 検証

`pnpm build`・`pnpm typecheck` 通過。単体（protocol・server/ask・web・cli・scripts）181 ファイル・3908 件通過。E2E: `ask-view`・`ask-media`・`ask-types` 25 件、`ask-form*` 73 件通過。
