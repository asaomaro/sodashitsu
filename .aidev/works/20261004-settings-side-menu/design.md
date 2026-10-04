# 仕様: 設定画面にサイドメニュー（節の一覧）を付ける

## 概要

設定のダイアログ（スクロールの入れ物は今のまま `<dialog>` 自身）の中を、「左のメニュー（`<nav>`）」と「右の本文（今の節の並び）」の 2 列にする。メニューはダイアログの中で上に貼り付いて（`position: sticky`）常に見える。項目は画面の節の見出しから作り、今の節の決め方は ask-form の目次（`spy()`・`want`）の決まりを Vue に移す。計算は純関数に切り出して単体で確かめ、画面の動きは E2E で確かめる。

## 設計方針

- **スクロールの入れ物は変えない**（requirements F9）。題名の行（上に固定）・キーの節の下の帯（下に固定）・`scroll-padding`・既存の E2E（`dialog.scrollTop`・dialog の `boundingBox`）が、`<dialog>` がスクロールすることに依存している（research.md「F1」「F6」）。メニューは、スクロールする `<dialog>` の中の sticky な列として置く。
- **2 列は CSS の grid で作り、節は 1 つの入れ物（`.settings-body`）にまとめる**。節を `<dialog>` の直下から 1 段下げるが、節の要素・見出し・`aria-labelledby` は変えない（単体テストと E2E のセレクタは子孫で探しているので通る）。下の帯の sticky は、間の入れ物がスクロールしなければ `<dialog>` を基準にしたまま。
- **メニューが出るかどうかは CSS だけで決める**（`@media (min-width: 768px)`。1 列レイアウトの判定と同じ値。research.md「F4」）。ask-form のような JS での幅の調整は要らない（設定はいつも画面より長く、常に出す）。
- **メニューの項目は、画面の節の見出しから作る**（`.settings-body` の直下の `section[aria-labelledby]` と、その見出しの文言）。キーの節は別のコンポーネントだが、DOM から拾うので手を入れない。節を足せば自動で出る。
- **今の節の計算は純関数にする**（位置の配列・スクロールの位置・見えている高さ → 番号）。happy-dom は大きさが全部 0 なので、DOM に触る側は薄くし、式は単体で確かめる（research.md「設計判断に効く点」5）。
- **スクロールの計算は 1 回の描画につき 1 回**（`requestAnimationFrame` でまとめる）。高さの変化は `ResizeObserver` で拾う。
- **代替案を退けた理由**: 本文だけをスクロールする入れ物を足す（ask-form と同じ形）→ 題名の行・下の帯・`scroll-padding`・既存の E2E を全部移すことになる／メニューをダイアログの外（横）に置く → `<dialog>` のモーダルの外になり、フォーカスが届かない／`IntersectionObserver` で今の節を決める → 「いちばん下では最後の節」「選んだ節を優先」の決まりを作りにくく、ask-form と動きが揃わない。

## 対象範囲

- `packages/web/src/components/SettingsDialog.vue`（構造・メニュー・キー・CSS・古いコメント: 冒頭 :27-40 の「5 節」と「Tab で順に進むだけでキー処理が要らない」、CSS の :983「いまは 5 節」）。`KeySettings.vue:805` のコメント「ほかの 4 節」（コメントだけ直す）。
- `packages/web/src/settings/sectionSpy.ts`（新規。純関数）と単体テスト。
- `packages/web/src/components/SettingsDialog.test.ts`（メニューの単体テストを足す）。
- `packages/e2e/src/specs/settings-menu.spec.ts`（新規）、`settings.spec.ts`・`key-bindings.spec.ts`（「5 節」の期待を直す。3 件のテスト・4 行と、テストの題名 `settings.spec.ts:261, :304` の「5 節」）。
- `docs/herdr-parity.md`・`docs/verification.md`。
- 変えない: `KeySettings.vue`・`SidebarRowsSettings.vue`（見出しへのフォーカスは外から付ける）、端末版、設定の項目。

## 依拠する既存の事実

出所は research.md（節名と file:line。`web/c/` = `packages/web/src/components/`）。

- 節は 6 つで、すべて `<section aria-labelledby=…>` と `<h3 id=…>`。5 つは `SettingsDialog.vue` の中、キーは `KeySettings.vue` のルート（research.md「F1」）。節の後ろに、節に属さない `<p>` が 2 つ。
- スクロールの入れ物は `<dialog class="settings-dialog">` 自身。`max-width: min(34em, calc(100% - 16px))`・`min-width: min(22em, …)`・`max-height: calc(100% - 16px)`・`padding: 1em`・`padding-top: 0`。メディアクエリは無い。題名の行は `position: sticky; top: 0`、下の帯は `position: sticky; bottom: -1em`（包含ブロックは KeySettings の `<section>`）。`scroll-padding-top: calc(1em + 2rem + 0.8em)`（research.md「F1」）。
- 開く: `showModal()` の後に `firstSwitch.focus()`（`web/c/SettingsDialog.vue:107-127`）。閉じる: `cancel()` → `view.closeDialog()`。`Esc` は `@cancel`、背景は `@click.self`。取り込み待ちの間は閉じない。**dialog レベルの keydown ハンドラは無い**。取り込みの部品は keydown を `preventDefault` + `stopPropagation` で受ける（research.md「F2」）。
- 単体テストの期待: `section h3` が 6 つ・すべての `section` に `aria-labelledby`・`[role="switch"]` の先頭 3 つが通知・開いた直後の `activeElement` が 1 つ目の switch（research.md「F6」）。E2E: Tab の回数（15 回・40 回以内）・`dialog.scrollTop`・dialog の `boundingBox`。「5 節」の期待が 3 か所（`settings.spec.ts:264, :271, :308`・`key-bindings.spec.ts:870-876`）。
- ask-form の目次の決まり（research.md「F7」）: `spy()` の式（`tail = min(h, max)`、`k0 = clamp((y − (max − tail)) / tail)`、`line = y + 40 + k0·(h − 40)`、`topOf <= line` を満たす最後の項目）、`want`（押した・フォーカスが入った項目は、見えている間は今の項目。`wheel`・`touchmove` で解除）、`go()`（即時のスクロール）、`step()`（端では何もしない）、`mark()`（`aria-current`・目次の追従）。
- `aria-current` の先例は `Sidebar.vue:482` ほか。`scoped` のスタイルは子のルート要素にしか当たらない（research.md「F1」）。
- design の点検で、design の CSS を写した最小の HTML を Chromium で動かして確かめたこと: 題名の行（`grid-column: 1/-1`・sticky）・メニュー（sticky）・下の帯（`bottom: -1em`。入れ物を挟む）は、grid でも今と同じ位置に固定される／`<select>` の `Alt+PageDown` は値を変えない／幅 800px・16px の文字では本文の幅は 510px のまま（縮むのは文字が大きいときだけ）。
- **未確認**: Firefox・Safari での同じ動き／`main` で落ちている設定関係の E2E のうち「5 節」以外の原因。

## インターフェース / データ構造

```ts
// packages/web/src/settings/sectionSpy.ts（純関数。DOM に触らない）
interface SpyInput {
  tops: number[];        // 各節の見出しの上端（本文の先頭からの位置。スクロールの位置と同じ座標）
  scrollTop: number;
  viewHeight: number;    // スクロールの入れ物の見えている高さ（clientHeight）
  scrollHeight: number;
  headerHeight: number;  // 題名の行の高さ（その下が「見えている範囲」の上端）
}
/** スクロールの位置から決まる今の節（0 始まり）。節が無ければ -1。 */
function sectionAtScroll(i: SpyInput): number;
/** 選んだ節 chosen が、見出しが見える範囲にあれば chosen、外れていれば null。 */
function keepChosen(chosen: number | null, i: SpyInput): number | null;
/** 次・前の節。端では null。 */
function stepSection(current: number, delta: 1 | -1, count: number): number | null;
/** その節へ移るときの scrollTop（見出しが題名の行のすぐ下。0 未満・最大を超えない）。 */
function scrollTopFor(index: number, i: SpyInput): number;
```

- `sectionAtScroll` は ask-form の `spy()` の式で、`40` を `headerHeight + 8` に替える。スクロールできない（`scrollHeight <= viewHeight`）ときは 0。
- 画面の状態（`SettingsDialog.vue` の中）: `menuItems: {id: string; label: string}[]`（節の見出しから作る）、`current: number`、`chosen: number | null`。

## 振る舞いの詳細

### 構造と CSS

```
<dialog class="settings-dialog">          ← スクロールの入れ物（今のまま）
  <div class="settings-header">…［閉じる］</div>   ← sticky top（今のまま。2 列にまたがる）
  <div class="settings-menu-col">            ← 左の列。セルいっぱいに伸びる入れ物（空きを押しても閉じないように）
    <nav class="settings-menu" aria-label="設定の節">  ← 入れ物の中で sticky
      <button …>通知</button> …
    </nav>
  </div>
  <div class="settings-body">              ← 右の列。今の節 6 つと、末尾の段落 2 つ
    <section …>…</section> …
  </div>
</dialog>
```

- 768px 以上: `dialog[open]` を `display: grid; grid-template-columns: var(--settings-menu-w) minmax(0, 1fr)`。題名の行は `grid-column: 1 / -1`。`--settings-menu-w` は `13em`（設定の単位に合わせる。16px の文字で 208px。ask-form の 212px とほぼ同じ）。`max-width: min(calc(34em + var(--settings-menu-w)), calc(100% - 16px))`。画面が狭いと本文の列（`minmax(0, 1fr)`）が縮む。
- 767px 以下: 左の列は `display: none`、`<dialog>` は今までどおり（grid にしない）。メディアクエリは、既存の 1 列レイアウトの判定（`packages/web/src/mobile/detect.ts` の `mobileViewportQuery()`＝`(max-width: 767px)`）と同じ式にする（CSS は `@media (max-width: 767px)` の側で消し、それ以外で出す。端数の幅で両方が偽にならないように）。
- **左の列は入れ物（`.settings-menu-col`）で、grid のセルいっぱいに伸ばす**（`align-self: stretch`）。閉じる判定は今の `@click.self`（`<dialog>` 自身が押されたとき）のままなので、メニューを直に grid の子にして `align-self: start` にすると、メニューの下の広い空きが「閉じる」になってしまう（design の点検で実測）。入れ物が押された要素になるので、閉じない。
- メニュー（入れ物の中）: `position: sticky; top: <題名の行の高さ>; max-height: calc(var(--settings-view-h) - <題名の行の高さ> - 1em); overflow-y: auto; overscroll-behavior: contain`。`--settings-view-h` は `<dialog>` の `clientHeight` を、開いたときと `ResizeObserver`（`<dialog>` を監視）で入れる（`100vh` は使わない——iOS Safari の事情。research.md「F1」。変数は `<dialog>` の inline の style に入れる。メニューは常に本文より短く、`<dialog>` の大きさに影響しないので、監視が繰り返しになることは無い）。題名の行の高さは `scroll-padding-top` と同じ式。
- 項目は `<button type="button">`。今の節の項目に `aria-current="true"`（ほかは属性なし）と、太字・左の線（色に頼らない）。
- 見出しへのフォーカスの枠: `.settings-body :deep(h3[tabindex="-1"]:focus)` に outline（`:focus-visible` は使わない——マウスで項目を押してプログラムからフォーカスを移したときは `:focus-visible` が付かず、枠が出ない。見出しはプログラムからしかフォーカスされないので `:focus` で足りる。キーの節の見出しにも当たるように `:deep`）。

### メニューの項目を作る

- 開くたびに（節は常に描かれていて `v-if` が無く、キーの節も同期で描かれるので、開いた時点で拾える）、`.settings-body` の直下の `section[aria-labelledby]` を順に拾い、`aria-labelledby` の指す見出しの文言と id で `menuItems` を作る。拾った見出しに `tabindex="-1"` を付ける（外から。`KeySettings.vue` は変えない）。

### 今の節

- 位置を読む関数: 各見出しの `getBoundingClientRect().top − dialog の top + dialog.scrollTop`。`headerHeight` は、題名の行の `offsetHeight` に、その下の余白（`margin-bottom`）を足した値（`scroll-padding-top` の式と同じ高さになる）。節の番号は、`menuItems` ではなく DOM の節の並びから引く（開いた直後の `firstSwitch.focus()` は、項目を拾う前に起きうる）。
- 式（純関数）:
  - 移るときの位置 `scrollTopFor(i) = clamp(tops[i] − headerHeight − 8, 0, 最大)`。**最初の節（0）は 0**。
  - スクロールの位置から決まる節 `sectionAtScroll`: ask-form の `spy()` の式で、線は `y + headerHeight + 40 + k0·(h − headerHeight − 40)`（着く位置との間に約 30px の余裕を持たせ、`scrollTop` の丸めで前の節に戻らないようにする）。
  - 「見える範囲」は `[y + headerHeight − 2, y + h)`（題名の行の下に隠れた見出しは、見えていない）。
- **選んだ節 `chosen` を保つ条件**（`keepChosen`）: (a) その節の見出しが見える範囲にある、または (b) フォーカスのある要素がその節の中にあり、その要素が見える範囲にある。どちらも外れたら外す（長い節の途中の部品にフォーカスがあるとき、見出しは見えていなくても、その節が今の節のまま）。
- 更新の契機は、`<dialog>` の `scroll`・`.settings-body` の中の `focusin`・`.settings-body` を監視する `ResizeObserver`（高さの変化）・`<dialog>` の `ResizeObserver`（見えている高さ）。どれも `requestAnimationFrame` で 1 回にまとめ、`chosen = keepChosen(chosen, …)`、`current = chosen ?? sectionAtScroll(…)` を計算する。
- `chosen` を入れる: メニューの項目を押した・`Alt+PageDown`／`PageUp` で移った・`.settings-body` の中で `focusin` が起きた（その要素を含む節。どの節にも含まれない末尾の段落は最後の節）。入れたら、その場で計算を予約する（スクロールが起きなくても印が変わる）。
- `chosen` を外す: `<dialog>` の `wheel`・`touchmove`（すぐ）。**ただし、押された場所がメニューの中で、メニューがスクロールできるときは外さない**（メニューの中だけがスクロールするため）。それ以外のスクロール（スクロールバー・スクロールのキー）は、`keepChosen` の条件で扱う。
- `current` が変わったら、メニューの中でその項目が見えるように、メニューの `scrollTop` を動かす（ask-form の `mark()` と同じ。項目がメニューの上下の余白の外にあるときだけ）。

### 移る（`go(i)`）

- `chosen = i`、`current = i`。`dialog.scrollTop = scrollTopFor(i, …)`（即時。アニメーションなし）。見出しへ `focus({ preventScroll: true })`。
- メニューの項目の `click`、`Alt+PageDown`／`Alt+PageUp`（`stepSection(current, ±1, count)` が null なら何もしない）から呼ぶ。

### キー

- `<dialog>` に `@keydown` を足す: `altKey` かつ `PageDown`／`PageUp`（ほかの修飾キーなし）なら `preventDefault()`・`stopPropagation()` して `go`。取り込み待ちの間は、取り込みの部品が先に受けて伝播を止めるので、ここへは届かない（今までどおり取り込まれる）。`<select>` の値が変わらないことは `preventDefault` で防ぐ（Chromium では `Alt+PageDown` は元から値を変えないことを実測した。ほかのブラウザのために `preventDefault` は残し、E2E で確かめる）。
- メニューの中（`<nav>` の `@keydown`）: `ArrowDown`／`ArrowUp` で次・前の項目へフォーカス（端で止まる）、`Home`／`End` で最初・最後の項目へ。項目の `tabindex` は、**メニューにフォーカスが無い間は今の節の項目だけ 0、メニューにフォーカスがある間は、フォーカスのある項目だけ 0**（矢印で動いた後の `Tab`／`Shift+Tab` が、メニューの外へ出るように。印 `aria-current` は今の節のまま）。メニューからフォーカスが出たら（`focusout`）、今の節の項目へ 0 を戻す。`Enter`／`Space` はボタンの既定の `click`。
- `Tab` の順: ［閉じる］→ メニュー（今の節の項目）→ 本文の部品。開いた直後のフォーカスは 1 つ目の switch のままなので、そこからの前進の `Tab` の回数は変わらない。`Shift+Tab` 1 回でメニューへ移る。

### 幅が 768px をまたぐ

- `mobileViewportQuery()`（`(max-width: 767px)`）の `change` を見て、メニューが消えるときに、メニューにフォーカスがあった（`focusin`／`focusout` で持っておく）なら、今の節の見出しへ移す。出るときは何もしない。

### 取り込み待ち・確認の表示中にメニューを押したとき

- メニューの項目はふつうのボタンなので、設定画面のほかの場所を押したときと同じ（取り込みの部品・確認の今の決まりのまま）。そのうえで `go` が走る。特別な処理は足さない。E2E で、押した後に取り込み・確認が中途半端な状態で残らないことを確かめる。

### 閉じる・後始末

- 閉じたら、`ResizeObserver`・`matchMedia` のリスナーを外し、`chosen = null` に戻す（次に開いたときは最初の節から）。

## ドメイン固有の考慮

- AGENTS.md の条項: E2E を書く・直す → `e2e-observe-browser`（合否はブラウザの DOM・フォーカス・`scrollTop`・`boundingBox` で見る）。不具合の回帰テスト → `regression-negative-control`。
- 「Tabs にも Accordion にもしない」という過去の決定（`.aidev/works/20260921-herdr-settings-gaps/design.md:103-109`）は変えない（全部の節が見えたまま）。
- 別の作業（`20261004-subagent-display`）が「エージェント連携」の節の中を変える。この work は節の中身に触れず、構造（入れ物・メニュー・CSS・キー）だけを変える。

## エラー処理 / 異常系

- 節が 1 つも拾えない（想定外）: メニューを出さない。キーは何もしない。
- `ResizeObserver`・`matchMedia` が無い環境（単体テストの happy-dom など）: あれば使う、無ければ何もしない（開いたときに 1 回計算する）。
- 見出しが見つからない節（`aria-labelledby` の指す要素が無い）: その節は飛ばす。

## テストの方針

- **単体（純関数）** `sectionSpy.test.ts`: いちばん上は 0／いちばん下は最後／途中は題名の行のすぐ下に掛かっている節／残りが 1 画面を切ると線が下へ寄る（末尾の短い節が順に今の節になる）／スクロールできないときは 0／`keepChosen`（見えていれば保つ・外れたら null）／`stepSection` の端／`scrollTopFor` の上限と下限。式の `headerHeight` を壊して落ちることを確かめる。
- **単体（部品）** `SettingsDialog.test.ts`: メニューの項目が節の見出しから作られる（6 つ・同じ順・同じ文言。開く前に DOM の見出しの文言を書き換えてから開き、メニューの文言が変わることを見る）／`<nav>` に名前がある／今の節の項目だけ `aria-current` と `tabindex="0"`／項目のクリックで見出しにフォーカスが移る（大きさは getter を差し替える。`askDialogTestKit.ts:201-211` の手本）／`Alt+PageDown` が `preventDefault` される・端で何もしない／矢印・`Home`／`End`／矢印の後の `Tab` の停止位置（フォーカスのある項目だけ `tabindex="0"`）／開いた直後の `activeElement` が 1 つ目の switch のまま／既存の期待（`section h3` が 6 つ・全 `section` に `aria-labelledby`・switch の順）が通る。
- **E2E** `settings-menu.spec.ts`（1280×720 と、幅を変える件）: requirements の AC1〜AC8・AC11・AC-I1〜I5 の場面（メニューが見えたまま・いちばん下までスクロールしても［閉じる］が上端にある／**メニューの下の空きを押しても閉じない・背景を押すと閉じる**／押して移る・見出しが題名の行のすぐ下・フォーカスと枠（**マウスのクリックの後**の outline を計算後のスタイルで見る）／メニューの中の矢印の後の `Tab`／`Shift+Tab` がメニューの外へ出る／ホイールでの印／`Alt+PageDown` 5 回で 6 節・絞り込んだ状態でも／`<select>` の値が変わらない／Tab の順と `Shift+Tab`／幅 1280・800・767 と、開いたまま 768 をまたぐ／取り込み待ちの間の `Alt+PageDown`・取り込み中にメニューを押す／低い高さでメニューがスクロールする）。観測を壊して落ちる確認（`go` のスクロール・`chosen` の優先・`preventDefault`）。
- **既存の E2E**: `settings.spec.ts`・`key-bindings.spec.ts` の「5 節」の期待を 6 節に直す。設定のダイアログを開く **8 つの spec**（`settings`・`theme-settings`・`appearance-settings`・`key-bindings`・`new-terminal-cwd`・`notifications`・`ask-form`・`ask-form-extras`）を比べる。この環境では落ちる件数が回によって揺れるので、**実装の前に、基準（変更前のコミット）で 2 回流して、落ちる件の名前と失敗の文言を記録する**。変更の後も 2 回流し、増えた件は単独で流し直して、揺れか退行かを判定する。直した 3 件は、「5 節」による失敗が消えたことを見る。
- **実機のみ**（`docs/verification.md`）: 明暗のテーマでの見え方・タッチ・ブラウザの拡大・読み上げ・Firefox と Safari での固定（sticky）と `<select>` の `Alt+PageDown`・文字を大きくしたときに本文の列が縮むこと。

## 受け入れ基準との対応

- AC1: メニューは `<nav aria-label>` で、項目は `.settings-body` の節の見出しから作る。sticky で常に見える。入力は画面の DOM。
- AC2: `go(i)`（`scrollTopFor`・見出しへフォーカス・`chosen`）。見出しに `tabindex="-1"` と `:focus-visible` の枠。
- AC3: `sectionAtScroll`（ask-form の式）と `aria-current`・太字・左の線。入力は `<dialog>` の `scroll`。
- AC4: `<dialog>` の `keydown`（`Alt+PageDown`／`PageUp`）→ `stepSection` → `go`。`chosen` が優先されるので、末尾の節が 1 画面に収まっていても 1 つずつ進む。メディアクエリに依らない。
- AC5: `focusin` で `chosen`。`ResizeObserver` で計算し直す。
- AC6: grid と `max-width`、`@media`、`matchMedia` の `change` でのフォーカスの移動。
- AC7: DOM の順（題名の行 → メニュー → 本文）と roving の `tabindex`。開いた直後のフォーカスは今のまま。
- AC8: 取り込みの部品が先に keydown を受ける（今のまま）。スクロールの入れ物を変えないので、下の帯と題名の行の固定は今のまま。
- AC9: 節の要素・見出しは変えない。「5 節」の期待とコメント・文書を直す。
- AC10: `docs/verification.md` に手順を足す。
- AC11: メニューの `max-height`・`overflow-y: auto`・`overscroll-behavior: contain` と、今の項目を見える位置に保つ処理。
- AC-I1: メニューは設定の中の要素で、一緒に出入りする。
- AC-I2: `go` は表示の位置とフォーカスだけを変える。
- AC-I3: `Shift+Tab` → 矢印 → `Enter` → `Tab`。`Alt+PageDown`／`PageUp`。
- AC-I4: `go` が見出しへフォーカスを移す（メニューにあったときも）。閉じるのは今のまま。
- AC-I5: 設定のダイアログがモーダルのまま（今の仕組み）。`Alt+PageDown`／`PageUp` は `preventDefault` + `stopPropagation`。節の中身は変えない。
