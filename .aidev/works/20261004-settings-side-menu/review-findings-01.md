# 独立レビューの指摘（依頼元から。must 0・should 4・nit 7）

直すもの（should は全部。nit は 5・7・9・10）。直したら、壊して落ちる確認をして、タスクごとではなく 1〜2 コミットにまとめる。

1. [should] E2E の AC8「取り込み待ちの間の Alt+PageDown は節を移さず取り込まれる」が常に通る（最後の節「キー」に居るので、端で何も起きない）。`Alt+PageUp` で押す形にし、取り込まれたこと（帯の文か、割り当ての候補）を画面で見る — settings-menu.spec.ts:355-364
2. [should] E2E の AC4「`<select>` にフォーカスがあっても節は移り…」の最後の `currentLabel(page).length == 1` は必ず通る。`<select>` から押して、今の節の印とフォーカス（見出し）が次の節へ変わることを見る — settings-menu.spec.ts:252-258
3. [should] メニューの項目のフォーカスの枠が、`.settings-menu` の `overflow-y: auto` で切れる（padding が無く、UA の outline は外側に描かれる）。項目に `:focus-visible` の内側の outline（`outline-offset` を負に）を指定する。E2E で、項目にキーでフォーカスしたときの outline（計算後のスタイル）を見る — SettingsDialog.vue:1308-1329
4. [should] D7 の 300ms の窓をやめ、`onNarrowChange` の時点の実際のフォーカスで判定する: `menuEl.contains(document.activeElement)`、または `activeElement` が `body`／`<dialog>` 自身で、直前にメニューにフォーカスがあった（`menuFocus` を `relatedTarget === null` の `focusout` では消さない）。ウィンドウが非アクティブになった後に幅を割っても見出しへ移ること、メニューの外へ自分で移った後は奪わないこと、を単体で見る。コメントと decisions.md の D7 も直す — SettingsDialog.vue:654-663, :748-755
5. [nit] 幅を割ったときに移す先の見出しが画面の外にあることがある（`preventScroll: true`）。見える範囲に無ければ `go(current)` と同じ位置へスクロールする — SettingsDialog.vue:660-661
7. [nit] `max-width` の `+ 1em`（`column-gap` の分）を decisions.md に 1 行で記録する — SettingsDialog.vue:1298-1300
9. [nit] AC5 の Tab のテストの変数名 `inTheme`（実際は `settings-terminal`）を直し、到達を明示の `expect` にする — settings-menu.spec.ts:264-269
10. [nit] AC6 の幅の検証を、メニューの幅との差で見る（`> 740` だけにしない） — settings-menu.spec.ts:71-75

直さないもの（記録だけ。review.md に残す）: 6（wheel は位置が変わらなくても chosen を外す。design どおり）、8（AC5 の展開は 1 種類だけ。仕組みは同じ）、11（単体の 300ms の境界。4 で窓が無くなる）。

注意: 依頼元が origin/main（PR #78 まで）をこのブランチへ取り込んだ（a7e0a49）。その上に積むこと。終わったら、直した内容と、流したテストの結果を報告して止まる（push・PR はしない）。
