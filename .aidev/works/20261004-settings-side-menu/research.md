# 調査: ブラウザ版の設定画面の現状（20261004-settings-side-menu）

調査は委譲（読んだだけ。テスト・E2E は実行していない）。対象は `origin/main`（2bef742）。`web/c/` = `packages/web/src/components/`。

## 事実

### F1 `SettingsDialog.vue`（1274 行）の構造
- 節は **6 つ**。すべて `<section class="settings-section" aria-labelledby=…>` と `<h3 id=… class="settings-heading">` で、`<dialog>` の直下に並ぶ。

  | # | 見出し | id | 行 |
  |---|---|---|---|
  | 1 | 通知 | `settings-notify` | 546-584（先頭の switch が `ref="firstSwitch"` :550） |
  | 2 | テーマ | `settings-theme` | 585-703（`<details class="settings-theme-overrides">` :640-701） |
  | 3 | 表示 | `settings-display` | 704-851（末尾に `<SidebarRowsSettings />` :848） |
  | 4 | 端末 | `settings-terminal` | 852-925 |
  | 5 | エージェント連携 | `settings-agent-integration` | 926-968 |
  | 6 | キー | `settings-keys` | 969（実体は `web/c/KeySettings.vue:502-800`。ルートが `<section aria-labelledby="settings-keys">`） |

- 節の後ろに、節に属さない `<p>` が 2 つ（［はじめの案内を開く］:971-973・注記 `.settings-hint` :974-976）。
- 冒頭のコメント（:27-40）は「5 節」のままで古い。単体テストは 6 節を期待する（`SettingsDialog.test.ts:271-274`）。
- **スクロールする入れ物は `<dialog class="settings-dialog">` 自身**（内側にスクロール用の div は無い。CSS のコメント :982-985）。
- 幅と高さ（:986-990）: `min-width: min(22em, calc(100% - 16px))`・`max-width: min(34em, calc(100% - 16px))`・`max-height: calc(100% - 16px)`・`padding: 1em`・`padding-top: 0`。`width` の指定は無い。**メディアクエリは 3 ファイル（SettingsDialog・KeySettings・SidebarRowsSettings）とも 0 個。**
- 題名の行 `.settings-header`（:542-545、CSS :1006-1017）: `position: sticky; top: 0; z-index: 1`・背景あり・`padding-top: 1em`。
- 下に固定の帯 `.keys-status-band`（`KeySettings.vue:1007-1014`）: `position: sticky; bottom: -1em; padding: 0.3em 0 1em`（**ダイアログの padding 1em が前提**。包含ブロックは KeySettings の `<section>`。経緯は `.aidev/works/20260922-keybinding-usability/decisions.md:121-140` D7）。
- `scroll-padding-top: calc(1em + 2rem + 0.8em)` :994・`scroll-padding-bottom: calc(1.4em + 1.3em + 0.6em)` :996（どちらも `<dialog>` に付く。WCAG 2.4.11）。
- `scoped` の制約: 親のスタイルは子のルート要素にしか当たらない（KeySettings は `.settings-heading` 等を自分で複製している。`KeySettings.vue:804-816, :970-997`）。
- 過去の決定: 「見出し付きのグループで 1 枚。Tabs・Accordion は退ける」（`.aidev/works/20260921-herdr-settings-gaps/design.md:103-109` D7。理由は、隠れた節を見渡せない・畳むと 1 手増える。当時は 3 節・5 項目）。**目次（全節が見えたまま・切り替えない）とは矛盾しない。**

### F2 開閉とフォーカス
- 入口は 3 つ（どれも `{ kind: "settings" }`）: `prefix+s`（`packages/client-core/src/keys/bindings.ts:48-54` → `packages/web/src/actions/ActionDispatcher.ts:177-179`）・全体メニュー（`web/c/ContextMenu.vue:126`）・モバイルの上のバー（`packages/web/src/mobile/MobileShell.vue:89`）。
- **節を指定して開く経路は web に無い**（`DialogContext` は `{ kind: "settings" }` だけ。`packages/web/src/store/view.ts:285-286`）。端末版にはある（`{ kind: "settings"; section?: string }`。`packages/tui/src/model/UiState.ts:30-31`）。
- 開く: `watch(view.dialogContext)` → `nextTick` → `showModal()` → `firstSwitch.focus()`（:107-127）。**最初のフォーカスは通知の 1 つ目の switch**（単体 `SettingsDialog.test.ts:249-252`。E2E の Tab の数えもこの前提）。
- 閉じる: `cancel()` :519-522 → `view.closeDialog()`（`store/view.ts:518-523`）が開く前の pane へ戻す。手段は Esc（`@cancel="onNativeCancel"` :531-535）・背景クリック（`@click.self="cancel"` :539）・［閉じる］:544。
- Esc の例外: キーの取り込み待ち（`keysCapturing` :529）の間は閉じない。確認の中の Esc は `@keydown.esc.stop.prevent`（:690、`KeySettings.vue:759`）。取り込みの部品は keydown を `preventDefault` + `stopPropagation` で受ける（`KeySettings.vue:31-32`）。
- **SettingsDialog には dialog レベルの keydown ハンドラが無い**（HelpDialog・AskDialog にはある）。
- キーが端末へ漏れない仕組み: `view.modalOpen`（`store/view.ts:345`）で `keys.setMode("dialog")`（`packages/web/src/main.ts:454-457`）・window の keydown も何もしない（`main.ts:465-470`）・`showModal()` の inert。

### F3 高さが動く所
- 節そのものを `v-if` で隠す所は無い（6 節は常に出る）。
- 大きく変わる所: テーマの自動切替（:609-637）と色の上書きの `<details>`（:640。既定は閉）／表示の tab バーのエントリの増減（:784）と `SidebarRowsSettings` の `<details>`／**キー**（最大の節。操作ごとの `<details>`・絞り込みで行と群が消える `KeySettings.vue:54-78, :113`・取り込みの部品の出入り・［すべて既定に戻す］の確認 :746-768）。
- 節の高さの差は大きい（通知は 3 行、キーは数十行以上）。

### F4 モバイル
- 同じ `SettingsDialog`（`packages/web/src/App.vue:62-93`）。1 列レイアウトの判定は画面幅 768px 未満（`packages/web/src/mobile/detect.ts:3-4, :12`）。幅の狭い画面用の CSS は `min()` だけ。

### F5 端末版
- **左に節の一覧、右に項目の表の 2 ペインがすでにある**（`packages/tui/src/modes/SettingsDialog.ts:44-50, :320-350`）。節は 7 つ（`notify`・`theme`・`display`・`terminal`・`agents`・`keys`・`tui`。`packages/tui/src/settings/sections.ts:826-836`）。選んだ節の項目だけを描くページ切り替え。

### F6 既存のテスト
- 単体 `SettingsDialog.test.ts`（1326 行）: `showModal`/`close` を prototype に生やす（:25-30）、`attachTo: document.body`（:54-69）。構造に依存する期待: `findAll("section h3")` が 6 つ・**すべての `section` に `aria-labelledby` の見出しがある**（:272-279）・`findAll('[role="switch"]')[0..2]` が通知の 3 つ（:71-77）・開いた直後の `activeElement` が 1 つ目の switch（:249-252）。
- レイアウト: `IntersectionObserver`・`scrollIntoView` は `packages/web/src` に無い。happy-dom は大きさが全部 0。ask のテストは getter を `vi.spyOn` で差し替える（`askDialogTestKit.ts:201-211`、`AskDialog.form.test.ts:106-131`）。`HelpDialog.test.ts:153-178` は `scrollTop` を直接代入する。
- 関連: `KeySettings.test.ts`（1457 行）・`SidebarRowsSettings.test.ts`・`SettingsDialog.symbolsNote.test.ts`。
- E2E（1280×720）: セレクタは `dialog.settings-dialog`・`section[aria-labelledby="settings-…"]`・`section h3`。開き方は `prefixKey("s")`（`settings.spec.ts:63-67`、`theme-settings.spec.ts:157-161`、`key-bindings.spec.ts:59-64`）。**Tab の順に依存**（`theme-settings.spec.ts:164-167` 15 回以内・`settings.spec.ts:281-284` 40 回以内）。**`<dialog>` がスクロールの入れ物である前提**（`key-bindings.spec.ts:292-296` が `d.scrollTop += …`、:299-314・:686-695 が dialog の `boundingBox()` と比べる）。
- **`main` でも落ちる E2E 18 件のうち 3 件の原因**: `toHaveText(["通知","テーマ","表示","端末","キー"])` が 5 節を期待しているが、実際は 6 節（`settings.spec.ts:264, :271`〔:261 のテスト〕・`:308`〔モバイル :304〕・`key-bindings.spec.ts:870-876`〔モバイル :841〕。「エージェント連携」を足したコミットは `239c41d`）。残りの原因は未特定（記録は `.aidev/works/20261003-sodactl-ask-socket/test-result.md:15`。`CompileError: WebAssembly.instantiate() … Content Security policy` 等）。

### F7 ask-form の目次（`third_party/ask-form/ask-form.js`）
- DOM: `main(.main, flex) = nav.index + div.body`（:201-203）。目次は本文のスクロールの外。CSS :52-63（`.index { flex:none; width:212px; overflow-y:auto; overscroll-behavior:contain; … }`、項目は `<button>`、今の項目は `.cur`）、`@media (max-width:767px){ .index{display:none} }` :164。
- 出す条件 `layout()` :650-661（収まらないときだけ・1 回だけ決める）。
- 今の項目 `spy()` :610-622: `tail = min(h, max)`、`k0 = clamp((y − (max − tail)) / tail)`、`line = y + 40 + k0·(h − 40)`、`topOf(fs) <= line` を満たす最後の項目。残りが画面 1 枚を切ると線が上端から下端へ下がり、いちばん下では最後の項目になる。
- `want` と `hold` :580-582, :617-620（押した・フォーカスが入った項目は、見えている間か 900ms 以内は今の項目のまま。`wheel`・`touchmove` で解除 :669。`focusin` で `choose(i)` :665-668）。
- `go(i)` :623-631（`body.scrollTop = topOf − 10`。即時。その項目の最初の入力へ `focus({preventScroll:true})`）、`step(d)` :633-637（端では何もしない）、`mark()` :597-605（`aria-current` を全項目に付け、目次を追従させる）。キー :772（`e.altKey && PageDown/PageUp` で `preventDefault` + `stopPropagation` + `step`）。
- 枠側の幅: `AskDialog.vue:156-163`（`--ask-index-width`）・CSS :286, :331-335。E2E の雛形 `ask-form-index.spec.ts:237`（クリック）・`:276`（Alt+PageDown）・`:379`（`defaultPrevented`）・`:747-851`（幅と高さ）。
- **そのまま移せる所**: `spy()` の式・`want`/`hold`・`mark()` の追従・`step()`・212px・767px のメディアクエリ・`aria-current`・`focusin` で印を移すこと。
- **合わない所**: スクロールの入れ物（設定は `<dialog>` 自身）／sticky の題名の行と下の帯（`go()` の `−10`・`spy()` の `40` を題名の行の高さに替える）／出す条件（設定は固定の 6 節で、いつも画面より長い）／高さがスクロール無しで動く（`<details>`・絞り込みでは `spy()` が呼ばれない）／`go()` のフォーカス先（設定は最初の部品が switch・ボタンで、Space/Enter の誤操作で即保存される）／幅の単位（設定は `em`）／末尾の節外の `<p>`。

### F8 ほかの部品・文書
- 左に一覧を持つダイアログ・スクロールスパイを持つ部品は web に無い（再利用できる Vue の部品は無く、手本は ask-form.js だけ）。`aria-current` の先例は `Sidebar.vue:482`・`PaneFrame.vue:283`・`MachineHeader.vue:90`。
- 文書で節に触れている所: `docs/herdr-parity.md:53`（「5 節」と記述）、`docs/tui.md:165`、`docs/verification.md:66, :74, :77, :102, :116, :189, :193, :210, :222, :238, :650, :684`（節の位置や移動の記述は無い）。

## 設計判断に効く点

1. **スクロールの入れ物**: `<dialog>` 自身に依存しているのは、sticky の題名・sticky の帯（`bottom:-1em`）・`scroll-padding`・E2E（`dialog.scrollTop`・dialog の `boundingBox`）。ask と同じ「目次と本文が兄弟で本文だけスクロール」にすると 4 つとも移す。dialog をスクロールの入れ物のままにして目次を sticky にすれば動かないが、目次自身の高さの上限が要る。
2. **幅**: `max-width`（と `min-width`）に 212px を足す形。常に出すなら CSS の `@media (min-width:768px)` だけで足り、JS の幅の調整は要らない。768 は 1 列レイアウトの判定と同じ値。
3. **キー**（`Alt+PageDown`／`PageUp`）: 既定の割り当て・プリセットに pagedown/pageup は無い。ダイアログ中は KeyRouter が dialog モードなので、利用者が直接のキーに割り当てていても競合しない。dialog レベルの keydown ハンドラは新設。取り込み待ちの間は取り込みの部品が先に受ける（割り当てとして取り込まれる）。`<select>` にフォーカスがあるときの PageDown はネイティブで値を変えうる（Alt 付きは未確認。`preventDefault` が要る）。
4. **フォーカス**: 最初のフォーカス（通知の 1 つ目の switch）への依存が、単体と E2E の Tab の数えにある。目次を DOM で節より前に置いても、初期フォーカスが変わらなければ前進の Tab の数は変わらない。
5. **テスト**: `spy()` の式を純関数（位置の配列＋scrollTop＋高さ → index）に切り出せば単体で検証できる。DOM 側は getter のモックか E2E。設定系の E2E は元から落ちるものがあり（うち 3 件は「5 節」の期待の古さ）、新しい E2E の合否は分けて見る。
6. **リスク**: 単体の `findAll("section")` は全 section に `aria-labelledby` を要求する（目次を `<nav>` にすれば影響しない）。`[role="switch"]` の順番に依存するテストがある。節の高さがスクロール無しで変わると印が古いまま残りうる。`scoped` なので、目次を別コンポーネントにすると親のスタイルはルートにしか当たらない。

## 実装アンカー

- A1 設定の本体: `web/c/SettingsDialog.vue:27-40`（コメント）・`:107-127`（開く）・`:519-545`（閉じる・題名の行）・`:546-976`（節）・`:982-1017`（CSS）。
- A2 キーの節: `web/c/KeySettings.vue:502-503, :788-799, :1007-1014`。
- A3 手本: `third_party/ask-form/ask-form.js:52-63, :164, :596-637, :665-669, :772`、`web/c/AskDialog.vue:156-163, :286, :331-335`。
- A4 テスト: `web/c/SettingsDialog.test.ts:25-30, :54-77, :249-252, :271-279`、`web/c/askDialogTestKit.ts:201-211`、`packages/e2e/src/specs/settings.spec.ts:63-67, :261-271, :281-284, :304-308`、`key-bindings.spec.ts:292-314, :686-695, :841-876`、`theme-settings.spec.ts:157-167`、`ask-form-index.spec.ts:237, :276, :379, :747-851`。
- A5 文書: `docs/herdr-parity.md:53`、`docs/verification.md`（設定の手順の節）。
