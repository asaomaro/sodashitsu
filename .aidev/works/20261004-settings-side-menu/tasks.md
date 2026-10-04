# タスク: 設定画面にサイドメニュー（節の一覧）を付ける

## 実装方針

design.md のとおり、基準の記録（T1）→ 純関数（T2）→ 構造と CSS（T3）→ メニューの項目と今の節（T4）→ 移る操作（T5）→ キー（T9）→ 既存のテストの期待（T6）→ E2E（T7）→ 既存の E2E との比較（T10）→ 文書（T8）の順に積む。変えるのは `packages/web` の設定画面と、そのテスト・文書だけ。

**全タスク共通**
- **何が正か**: 決まりの本文は design.md（「インターフェース / データ構造」「振る舞いの詳細」「エラー処理 / 異常系」「テストの方針」）。既存の事実は research.md、判断の理由は `decisions.md`（D1〜D4）。
- **スクロールの入れ物は `<dialog>` 自身のまま**。節の要素・見出し・`aria-labelledby`・節の中身（`KeySettings.vue` のコメント 1 行を除く）は変えない。
- 各タスクの完了で `pnpm build`・`pnpm typecheck` と `packages/web` のテストが通ること。回帰テストを足したら、実装の該当行を一時的に壊して落ちることを確かめ、**落ちたときの生の出力**を `review.md`（無ければ作る）の「タスク点検ログ」に貼る（条項 `regression-negative-control`）。E2E は条項 `e2e-observe-browser`（画面で観測できる結果を見る。内部の状態を覗かない）。
- **E2E の流し方**: リポジトリ直下で `corepack pnpm build` の後、`cd packages/e2e && corepack pnpm exec playwright test src/specs/<spec>`（`workers: 1`。spec ごとに自前のサーバを空きポートで立てる）。壊して落ちる確認の後は、戻してビルドし直してから流す。
- **動いている 7780 のサーバには触れない。**E2E は spec が自前で立てるサーバを使う。
- 設計と違う判断・確かめた事実は `decisions.md` に足す（D5 から）。Node は 24。
- **ほかの作業との重なり**: `SettingsDialog.vue` は別の作業（subagent-display）も触る（連携の節の中だけ）。この作業では、節の中身に手を入れない。

## チェックリスト

- [ ] T1: 基準の記録（製品コードは変えない）——設定のダイアログを開く 8 つの spec（`settings`・`theme-settings`・`appearance-settings`・`key-bindings`・`new-terminal-cwd`・`notifications`・`ask-form`・`ask-form-extras`）を、変更前のコミットで **2 回**流し、落ちる件の名前と失敗の文言を `decisions.md`（D5）に記録する。2 回で結果が違う件は「揺れる件」として分けて書く
      対象: `packages/e2e/src/specs/`（読むだけ・流すだけ）、`decisions.md`
      依存: なし
      AC: AC9
- [x] T2: 純関数 `sectionSpy.ts`——`sectionAtScroll`（ask-form の `spy()` の式。線は `y + headerHeight + 40 + k0·(h − headerHeight − 40)`）・`keepChosen(chosen, i, focus)`（見出しが見える範囲 `[y + headerHeight − 2, y + h)` にある、または `focus.section === chosen` で `focus.top` が見える範囲にある。`focus` は部品の側が DOM から作って渡す）・`stepSection`（端で止まる）・`scrollTopFor`（`clamp(tops[i] − headerHeight − 8, 0, 最大)`。最初の節は 0）。単体テストは design「テストの方針」の単体（純関数）の全項目に加えて、`keepChosen` のフォーカスの条件（見出しは外れたがフォーカスの部品が見える → 保つ／両方外れた → null／フォーカスが別の節 → 見出しだけで決まる）と、`scrollTopFor(0) === 0`。`headerHeight` を式から外して落ちることを確かめる
      対象: `packages/web/src/settings/sectionSpy.ts`（新規）、`packages/web/src/settings/sectionSpy.test.ts`（新規）
      依存: なし
      AC: AC2, AC3, AC4, AC5
- [x] T3: 構造と CSS——`<dialog>` の中を grid の 2 列にする（題名の行は `grid-column: 1/-1`・sticky のまま）。左の列は入れ物 `.settings-menu-col`（セルいっぱいに伸びる）と、その中の sticky な `<nav class="settings-menu" aria-label="設定の節">`、右の列は `.settings-body`（今の節を 1 段下げてまとめる）。メニューの `max-height`（`<dialog>` の見えている高さから。`100vh` を使わない）・`overflow-y: auto`・`overscroll-behavior: contain`。ダイアログの `max-width` をメニューの幅の分だけ広げる（本文の幅は今のまま）。`@media (max-width: 767px)` で左の列を消し、grid にしない。見出しの枠の CSS `.settings-body :deep(h3[tabindex="-1"]:focus)`（`:focus-visible` は使わない。`tabindex` を付けるのは T4）。`max-height` の式は変数 `--settings-view-h` を使い、無いときの代わりの値（`var(--settings-view-h, 100dvh)` など）を書く（変数を入れるのは T4）。題名の行と下の帯の固定が今のままであること。`scroll-padding-top` は今の式のまま。この時点ではメニューの項目は空でよい（T4 で作る）。単体: 既存の `SettingsDialog.test.ts` が期待を変えずに通ること
      対象: `packages/web/src/components/SettingsDialog.vue`（template・style。:27-40 と :983 付近の古いコメントも直す）、`packages/web/src/components/KeySettings.vue`（:805 のコメントだけ）
      依存: なし
      AC: AC1, AC6, AC8, AC9, AC11, AC-I1
- [x] T4: メニューの項目と今の節——開くたびに `.settings-body` の直下の `section[aria-labelledby]` と見出しの文言から項目を作り、拾った見出しに script から `tabindex="-1"` を付ける（キーの節の見出しは `KeySettings.vue` の中なので、template からは付けられない。`KeySettings.vue` は変えない）。`aria-labelledby` の指す見出しが無い節は飛ばす。節が 1 つも拾えなければメニューを出さない。`<dialog>` の見えている高さを `--settings-view-h` として `<dialog>` の inline の style に入れる（開いたときと、`<dialog>` の `ResizeObserver`）。`ResizeObserver` が無い環境では、開いたときに 1 回だけ計算する。節の番号は `menuItems` ではなく DOM の節の並びから引く（開いた直後の `firstSwitch.focus()` は、項目を拾う前に起きうる）。位置を読む関数（`getBoundingClientRect` と `scrollTop`。`headerHeight` は題名の行の `offsetHeight`＋下の余白）。更新の契機（`<dialog>` の `scroll`・`.settings-body` の `focusin`・2 つの `ResizeObserver`）を `requestAnimationFrame` で 1 回にまとめ、`chosen = keepChosen(…)`・`current = chosen ?? sectionAtScroll(…)`。`focusin` で `chosen` を入れる（どの節にも含まれない末尾の段落は最後の節）。`wheel`・`touchmove` で `chosen` を外す（メニューの中で、メニューがスクロールできるときは外さない）。`aria-current`・印の見た目（太字・左の線）。`current` が変わったらメニューの中でその項目が見える位置へ。閉じるときに監視を外し、`chosen` を null に戻す。単体: 項目が見出しから作られる（開く前に見出しの文言を書き換える）・`<nav>` の名前・今の節の項目だけ `aria-current`・`focusin` で印が移る（位置は `getBoundingClientRect` と `scrollTop`・`clientHeight` を差し替える。`askDialogTestKit.ts:200-212` は `clientHeight`・`offsetHeight` の差し替えの手本で、`getBoundingClientRect` は要素ごとに `vi.spyOn` する。`requestAnimationFrame` は `vi.stubGlobal` で同期に呼ぶか、偽のタイマーで進める）・見出しの無い節を飛ばす・節が無いとメニューが出ない
      対象: `packages/web/src/components/SettingsDialog.vue`（script・template）、`packages/web/src/components/SettingsDialog.test.ts`
      依存: T2, T3
      AC: AC1, AC3, AC5, AC11, AC-I1
- [ ] T5: 移る操作——`go(i)`（`scrollTopFor` へスクロール・見出しへフォーカス・`chosen`）。メニューの項目のクリック・`Enter`／`Space`。メニューの中の上下の矢印・`Home`／`End`（端で止まる）と roving tabindex（メニューにフォーカスが無い間は今の節の項目だけ 0、ある間はフォーカスのある項目だけ 0、`focusout` で戻す）。開いた直後のフォーカス（通知の最初の switch）は変えない。単体: 項目のクリックで見出しにフォーカスが移る／矢印・`Home`／`End`／矢印の後の `tabindex`／開いた直後の `activeElement`
      対象: `packages/web/src/components/SettingsDialog.vue`、`packages/web/src/components/SettingsDialog.test.ts`
      依存: T4
      AC: AC2, AC7, AC-I2, AC-I3, AC-I4
- [ ] T9: キーと幅の変化——`<dialog>` の `keydown` の `Alt+PageDown`／`Alt+PageUp`（`stepSection` → `go`。`preventDefault` と `stopPropagation`。端では何もしないが `preventDefault` はする。キーの取り込み待ちの部品が先に受けたときは移らない〔`KeySettings.vue:298` の `stopPropagation`〕。メニューが消えている幅でも効く。節が 1 つも無いときは何もしない）。`mobileViewportQuery()` の `change` で、メニューが消えるときにメニューにフォーカスがあったら今の節の見出しへ移す（`matchMedia` が無い環境では何もしない。閉じるときにリスナーを外す）。単体: `Alt+PageDown` が `preventDefault` される・端で何もしない・取り込み待ちでは移らない・幅の変化でのフォーカス
      対象: `packages/web/src/components/SettingsDialog.vue`、`packages/web/src/components/SettingsDialog.test.ts`、`packages/web/src/mobile/detect.ts`（`mobileViewportQuery` を使うだけ。変えない）
      依存: T5
      AC: AC4, AC6, AC8, AC-I3, AC-I5
- [ ] T6: 既存の E2E の期待——`settings.spec.ts`・`key-bindings.spec.ts` の「5 節」の期待を 6 節に直す（3 件のテスト・4 か所: `settings.spec.ts:264, :271, :308` と `key-bindings.spec.ts:870-876`。題名 `settings.spec.ts:261, :304`）。直した 3 件で、「5 節」による失敗が消えること（別の原因で落ち続ける件は、原因を `decisions.md` に記録して対象外にする。requirements AC9）
      対象: `packages/e2e/src/specs/settings.spec.ts`、`packages/e2e/src/specs/key-bindings.spec.ts`
      依存: なし
      AC: AC9
- [ ] T7: E2E `settings-menu.spec.ts`——design「テストの方針」の E2E の全場面（AC1〜AC8・AC11・AC-I1〜I5）。観測を壊して落ちる確認。2 回続けて同じ結果
      対象: `packages/e2e/src/specs/settings-menu.spec.ts`（新規）
      依存: T9, T6
      AC: AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC11, AC-I1, AC-I2, AC-I3, AC-I4, AC-I5
- [ ] T8: 文書——`docs/verification.md` に実機の手順（開く・押して移る・キーで移る・印・狭い画面と、design「テストの方針」の実機のみ の項目。自動テストで確かめた範囲と分けて書く）、`docs/herdr-parity.md:53`（H25 の行の「通知・テーマ・表示・端末・キーの 5 節」を 6 節に直し、サイドメニューを足す）
      対象: `docs/verification.md`、`docs/herdr-parity.md`
      依存: T9
      AC: AC9, AC10
- [ ] T10: 既存の E2E との比較——T1 の 8 つの spec を変更後のコミットで 2 回流し、T1 の記録と比べる（増えた件は単独で流し直して、揺れか退行かを判定し、結果を `decisions.md` に書く。退行は直す）
      対象: `packages/e2e/src/specs/`（流すだけ）、`decisions.md`
      依存: T1, T7
      AC: AC9
