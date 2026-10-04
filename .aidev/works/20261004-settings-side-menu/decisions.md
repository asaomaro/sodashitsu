# 判断の記録: 20261004-settings-side-menu

## D1: 範囲と、ask-form の目次と違う点（主エージェントの判断。利用者に提示済み）

利用者の依頼は「設定画面を、ask-form にならって、設定項目のサイドメニューを付けてください」（2026-10-04）。

- **メニューは節の 1 段だけ**（節の中の小見出しは出さない）。ask-form の目次も 1 段。
- **幅 768px 以上では常に出す**。ask-form は「収まるときは出さない」が、設定は固定の 6 節で、いつも画面より長い。
- **移った後のフォーカスは節の見出し**。ask-form は項目の最初の入力へ移すが、設定の最初の部品は switch・ボタンで、続けて押した `Space`／`Enter` で設定が即保存されてしまう。
- **開いた直後のフォーカスと `Tab` の順は変えない**（既存の単体テストと E2E が依存）。メニューは `Shift+Tab` 1 回で届く位置に置く。
- **スクロールの入れ物は設定のダイアログ自身のまま**（題名の行・下の帯・`scroll-padding`・既存の E2E が依存）。
- **端末版は対象外**（すでに左に節の一覧がある）。節を指定して開く経路も対象外。
- **「5 節」の古い期待で落ちている E2E 3 件を直す**（この作業で節の見出しに触るため）。

## D2: 「今の節」の優先順位（要件の独立点検の指摘）

選んだ節（押した・キーで移った・フォーカスが入った）が、利用者が自分でスクロールするまで優先する。その後はスクロールの位置で決める。優先順位が無いと、末尾の数節が最後の 1 画面に収まる状態で `Alt+PageDown` の連打が節を飛ばす。

## D3: ほかの作業との重なり

`20261004-subagent-display`（サブエージェントの表示）も `SettingsDialog.vue` の「エージェント連携」の節を変える。変える場所は別だが、マージのときに衝突しうる。先にマージされた側に、後の側を合わせる。

## D4: 設計の独立点検で決めたこと（14 件。点検は design の CSS を Chromium で動かして実測した）

- **メニューの下の空きを押しても閉じないように、左の列をセルいっぱいの入れ物にする**（閉じる判定は `<dialog>` 自身が押されたとき、のまま）。
- **見出しのフォーカスの枠は `:focus` で出す**（マウスで押してプログラムからフォーカスを移すと `:focus-visible` が付かない）。
- **メニューの `Tab` の停止位置**: メニューにフォーカスがある間は、フォーカスのある項目だけ `tabindex="0"`。
- **選んだ節を保つ条件に「フォーカスのある部品が見えている」を足す**（長い節の途中の部品にフォーカスがあるとき、見出しが見えなくても、その節を今の節にする）。
- 着く位置と線の間に約 30px の余裕（`scrollTop` の丸めで前の節に戻らない）。最初の節は 0。
- メニューの上のホイールは、メニューがスクロールできるときは選んだ節を外さない。
- 幅の判定は、既存の `mobileViewportQuery()`（`(max-width: 767px)`）に揃える。
- 既存の E2E の比較は、設定を開く 8 つの spec を、変更の前後で 2 回ずつ流す（この環境では落ちる件数が揺れる）。

## D5: 既存の E2E の基準（T1。変更前のコミット `81170f3` 相当のビルドで、設定を開く 8 つの spec〔98 件〕を 2 回流した）

製品コードは変えていない（`sectionSpy.ts` だけが増えた時点のビルド。web の `dist` は変更前のまま）。**2 回とも同じ 15 件が落ち、83 件が通った。揺れる件は無かった。**

「5 節」の期待が原因（requirements AC9。T6 で直す）:
- `settings.spec.ts:261`（desktop）・`:304`（モバイル）・`key-bindings.spec.ts:841`（モバイル）— `toHaveText([... 5 つ])` が 6 節の実際と合わない（`Received + 1`）。

別の原因（この作業の対象外。`main` でも落ちる既知の件）:
- `appearance-settings.spec.ts:40`（spaces の並び順トグル。`toEqual` の差）・`:113`（tab バーの時刻が見つからない）・`:130`（`CompileError: WebAssembly.instantiate() … Content Security policy … 'unsafe-eval'`）
- `key-bindings.spec.ts:632`（Tab で「こちらへ移す」へ届かない。`Received: inactive`）・`:699`（同じ `CompileError` が例外として出る）
- `new-terminal-cwd.spec.ts:128`（サーバを起動した場所で開く。端末の出力が `asaomaro@my-notePC:~$` で `pwd=…` が出ない）
- `settings.spec.ts:167`（仕込みの値が `{"statusSymbols":false}` で届かない）・`:187`（`on` を期待して `off`）
- `theme-settings.spec.ts:193`（`input.settings-path` が 2 要素で strict mode violation）・`:271`（テーマの色 `rgb(40, 42, 54)` を期待して `rgb(239, 241, 245)`）・`:354`（OSC 色の問い合わせ `rgb:1010/…` を期待して `rgb:fbfb/…`）・`:528`（`#6070a1` を期待して `#222222`）

流し方: `cd packages/e2e && pnpm exec playwright test <8 spec> --reporter=list`（`workers: 1`）。T10 の比較ではこの 15 件を基準にする。生の出力は作業のセッションの一時フォルダ（`base1.txt`・`base2.txt`）にあり、リポジトリには入れていない。

## D6: T3 の独立点検の「題名の行の sticky が grid で効かない」は誤検知（実測）

点検は、grid の子の sticky は自分の grid 領域の中でしか動けないと推定した。実 Chromium で、design の CSS を写した `<dialog>`（`display: grid`・題名の行 `grid-column: 1/-1`・メニュー sticky）を 900px スクロールして実測した。`dialog.scrollTop=882` のとき、［閉じる］の上端は dialog の上端から 19px のまま、メニューも固定された。E2E（`settings-menu.spec.ts` の AC1・AC6）でも実物で確かめている。

## D7: E2E で見つけて直した、design に無かった 2 点（T7）

- **幅が 768px を下回ってメニューが消える拍に、ブラウザが先にフォーカスを外すことがある**（`focusout` が `matchMedia` の `change` より先に来て、`menuFocus` が null になっていた。E2E「開いたまま 768 をまたぐ」が間欠的に落ちた）。design は「`focusin`／`focusout` で持っておく」としていたが、それだけでは足りない。**最初は「行き先の無い `focusout` の時刻を持ち、300ms 以内の `change` はメニューにあったものとして扱う」としたが、独立レビューの指摘（review-findings-01 の 4）で、時間の窓をやめた**: `onNarrowChange` の時点の実際のフォーカスで判定する。フォーカスがメニューの中にある、または `activeElement` が `body`／`<dialog>` 自身（ブラウザが先に外した・ウィンドウが非アクティブになった）で、直前までメニューにあった（`menuFocus`）、のとき今の節の見出しへ移す。`menuFocus` は、行き先の無い `focusout`（`relatedTarget` が null）では消さず、別の要素へ移ったとき（`focusout` の `relatedTarget` が非 null、またはメニューの外への `focusin`）に消す。自分でメニューの外へ移した後は奪わない。見出しが見える範囲に無ければ `go` と同じ位置へスクロールする。
- **`Alt+PageDown`／`PageUp` は、押した時点で今の節を計算し直してから数える**。今の節の更新は `requestAnimationFrame` でまとめるので、フォーカスを移した直後（次の描画の前）に押されると、古い今の節から数えていた（E2E「絞り込みで末尾の 2 節が 1 画面に収まる」が間欠的に落ちた）。
- E2E の「末尾の 2 節が 1 画面に収まる」場面は、1280×720 では「キー」の節が絞り込んでも約 540px 残り、収まらない。高さ 1400px の画面に分けた（位置だけで決めると末尾の節を飛ばすことを、`chosen` を無効にする変異で確認済み）。
- `Alt+PageDown` が `<select>` の値を変えないことは、Chromium では元から変わらないため値だけでは確かめられない。ダイアログ自身の後ろの listener で `defaultPrevented` を見る（`preventDefault` を外す変異で落ちる）。

## D8: `SettingsDialog.vue` の節の中身は再インデントしていない

節を `<div class="settings-body">` で包んだが、中身（約 430 行）は再インデントしていない。別の作業（`subagent-display`）が「エージェント連携」の節を変えるので、再インデントすると衝突が膨らむ。元からこのファイルは prettier が通らない（`prettier --check` で警告）ため、`--write` も当てていない。マージ後に整形したくなったら、別の変更で一括して行う。

## D9: 既存の E2E との比較（T10。変更後のコミット `a210c5e` のビルドで、D5 と同じ 8 つの spec〔98 件〕を 2 回流した）

**2 回とも同じ 12 件が落ち、86 件が通った。D5 の基準（15 件）に対して、増えた件は 0。** 基準から消えた 3 件は、T6 で直した「5 節」の期待の 3 件（`settings.spec.ts:261`・`:304`、`key-bindings.spec.ts:841`）。揺れる件は無かった。

残った 12 件は D5 の「別の原因」の 12 件と同一（`appearance-settings.spec.ts:40`・`:113`・`:130`、`key-bindings.spec.ts:632`・`:699`、`new-terminal-cwd.spec.ts:128`、`settings.spec.ts:167`・`:187`、`theme-settings.spec.ts:193`・`:271`・`:354`・`:528`）。この作業の対象外（`main` でも落ちる）。

新しい `settings-menu.spec.ts`（22 件）は、変更後に 3 回続けて全件通った（途中で見つけた 2 件の間欠的な落ち方は D7 で直し、その後 `--repeat-each 3` の 66 件・`--repeat-each 4` の 80 件が通った）。

## D10: `max-width` の `+ 1em` は `column-gap` の分（review-findings-01 の 7）

ダイアログの `max-width` は `min(calc(34em + var(--settings-menu-w) + 1em), calc(100% - 16px))`。34em は本文の幅（今までの幅）、`--settings-menu-w` はメニューの列（13em）、最後の `1em` は 2 列の間の `column-gap`。これを足さないと、画面が十分広くても本文の列が 1em 縮む。
