---
backlog: product-roadmap
kind: split
parent: 20260918-web-terminal-multiplexer
---

# product-roadmap

<!-- 項目は行頭の `- [ ]` で書く（見出しに書くと aidev status の未着手件数から漏れる） -->
- [x] 外部操作 API / CLI: herdr の socket API / CLI 相当（workspace 作成・分割・入力送信・出力読取・状態購読を外部から） (needs: 20260918-web-terminal-multiplexer)（出典: .aidev/works/20260918-web-terminal-multiplexer/requirements.md）
  → 着地: 20260923-external-control-api。新規パッケージ `packages/cli`（バイナリ名 `sodactl`）が、既存の
  token 認証（`POST /api/login`→session cookie）・既存の WebSocket RPC（`ControlSurface`）・既存の
  Origin/Host 判定を無改造で再利用し、`workspace create/close/rename`・`tab create/close`・
  `pane split/close/input/run/read`・`snapshot`・`watch`（状態購読）・`login`（セッションキャッシュ）を
  提供する（`packages/cli/src/main.ts`）。サーバ側の変更は `client.hello.kind` への `"external"` 追加
  （`packages/protocol/src/messages.ts:14`・`packages/server/src/clients/ClientRegistry.ts:4`）のみ。
  herdr の H39（エージェント自動化）・H40（pane 直接接続・制御ストリーム）は設計の質が異なるため対象外とし、
  本ファイルへ新規の後続項目として残した（decisions.md D2）。
  実測: 単体・統合（全パッケージ）2487 本 pass（うち `packages/cli` 133 本。実サーバ・実 PTY での統合テスト
  `main.integration.test.ts` 8本を含む）・起動確認 `aidev smoke` 2本（既存のサーバ起動確認＋新設の
  `sodactl` 起動確認）ともに pass。独立点検はタスク単位14件＋タスク横断1件（coding）・design のラウンド2件
  （internal review）・requirements/design/tasks の doccheck 各1〜2ラウンド。変更規模は実装コード
  35ファイル・+2730/-7行（`.aidev/` を除く。`.aidev/works/20260923-external-control-api/` に詳細）。
- [x] キーバインドのカスタマイズ: 割り当ての変更・保存（prefix の変更・操作ごとの割り当て・prefix なしの直接のキー）（出典: .aidev/works/20260918-web-terminal-multiplexer/requirements.md）
  → 着地: 20260921-keybinding-customization（feature/keybinding-customization）。prefix と 34 の操作の割り当てを、設定画面の節「キー」で**押したキーを取り込んで**変えられる
  （`packages/web/src/components/KeySettings.vue`）。1 つの操作に複数持てて、prefix の後のキーに加えて**直接のキー**（`ctrl+alt+d` のように prefix なしの 1 打。terminal モードだけ。
  `packages/web/src/keys/KeyRouter.ts` の `handleDirect`）も付けられる。衝突・予約・使えない形は理由を出して拒否（`packages/web/src/keys/assign.ts` の `validateAssignment`）、
  保存はブラウザごとに既定との差だけ（`soda.prefs.v1` の `keys`。`packages/web/src/keys/keyPrefs.ts`）で、壊れた値は値ごとに落として既定へ戻す。キー一覧・トースト・通知の案内文・
  モバイルの Prefix ボタンは同じ解決した表（`packages/web/src/keys/keymap.ts` の `resolveKeymap`）から作り、herdr の `ctrl+alt` の一式も 1 操作で足せる。既定のままなら
  今までのキー操作は変わらない（旧 `DEFAULT_KEYMAP` を固定した値との 1:1 を単体テストで守る。例外は decisions D8 の CapsLock＋Shift）。サーバ・protocol は変えていない。
  実測: 単体（全パッケージ）2138 本・E2E 一式 116 本（うち `key-bindings.spec.ts` 14 本・`settings.spec.ts` 11 本）・smoke pass。回帰テストは変異で落ちることを確かめ、生出力を `.aidev/works/20260921-keybinding-customization/test-result.md` に貼った（AltGr の判定は 97 個の変異を網羅）。独立 review 3 ラウンド（must 0・should 4・nit 9 を解消。差し戻しは上限の 3 回）。herdr 互換以外のプリセットは下の別の行に残した
- [x] キーバインドのプリセット（herdr 互換以外）: tmux 風などの割り当ての一式を選べるようにする。20260921-keybinding-customization で割り当ての変更・保存は済んだので、残りはプリセット（herdr の既定・herdr の文書の
  `ctrl+alt` の直接のキーの一式〔いまは「足す」ボタン〕に加え、tmux 風の `%`・`"`・`o`・`x` 等）。プリセットは `keys/bindings.ts` の `ActionDef.defaults` と同じ形の表で持てる（出典: .aidev/works/20260921-keybinding-customization/requirements.md の対象外）
  → 着地: 20260922-keybinding-presets（feature/keybinding-presets）。`.keys-bulk` の単一目的ボタンを、プリセットを選ぶ `<select>` + ［足す］ボタンへ一般化（`packages/web/src/components/KeySettings.vue`）。
  プリセットの表は `packages/web/src/keys/presets.ts` の `KEY_PRESETS`（`[ActionId, binding][]`。`assign.ts` の `applyRecommended` を `via` 決め打ちから `parseBinding` 経由の一般化へ）。新規「tmux 風」は
  tmux 公式 man page（`tmux.1` の DEFAULT KEY BINDINGS）の既定のうち本製品と 1:1 対応する 14 組だけを採用（`o` によるカーソル移動・`{`/`}` のレイアウト順入れ替え等、対応の薄いものは含めない——research F11・F12）。
  実測: 単体（全パッケージ）2150 本・E2E 一式 117 本（1 回目は無関係な既存テスト `mobile.spec.ts` D105 が負荷依存で 1 件不安定、単独 3 回・一式 2 回目はいずれも pass）・smoke pass。
  独立点検（doccheck×3・taskcheck T1〜T4+cross）は合計 must 0・should 2・nit 4（いずれも解消）。回帰テストは変異で落ちることを確かめた（`test-result.md`）。
  「節「キー」の操作の絞り込み・衝突時の「こちらへ移す」・macOS の Option 表示・Keyboard Lock API」は別行（31 行目）へ残した（decisions D2）。
- [x] navigate モードの移動キーを変えられるようにする: herdr の `navigate_workspace_up/down`・`navigate_pane_left/down/up/right`（prefix なしの素のキーを書ける別の表。`esc`・`enter`・`tab`・左右の矢印・素の `1`〜`9` は予約）。
  いまの navigate・resize・copy モードの中のキーは固定（`NavigateMode.ts`・`ResizeMode.ts`・`CopyMode.ts`）。herdr でも copy・resize の中は固定なので、対象は navigate の 6 キー（出典: .aidev/works/20260921-keybinding-customization/requirements.md の対象外）
  → 着地: 20260923-navigate-mode-keys。navigate 6操作（`navigate_workspace_up/down`・`navigate_pane_left/down/up/right`）を、既存34〜35操作（`bindings.ts`）とは独立した「別の表」（`keys/navigateKeys.ts`・`keys/navigateKeymap.ts`）として実装し、設定画面の節「キー」に新セクションを追加。
  既定は現行固定値と1:1・予約キー（`esc`/`enter`/`tab`/`shift+tab`/`left`/`right`/`ctrl+shift+v`/修飾無し`1`〜`9`）は割り当て不可・`ArrowLeft`/`ArrowRight`は表の外の固定フォールバックとして pane 左右移動を維持（decisions D3）。
  実測: 単体（`packages/web`）1734 本・リポジトリ全体 2569 本・smoke pass（2本）。独立点検（doccheck×3・taskcheck 22タスク+cross）は合計 must 1・should 8・nit 9（いずれも解消）。review は3ラウンド（must 2・should 2・nit 1、いずれも解消）。
  review で見つかった2件の不具合（修飾付き矢印キーの幽霊バインディング・`ctrl+shift+v` の予約漏れ）は回帰テストを追加し、修正前のコードに戻して落ちることを確認してから元に戻した（regression-negative-control。test-result.md 参照）。
- [x] herdr にあって本製品に操作自体が無いものを足して割り当てられるようにする: **既定なし**の操作——前後の workspace への移動（`previous_workspace`・`next_workspace`）・直前の pane（`last_pane`）・
  tab の並べ替え（`move_tab_previous/next`）・pane の resize の直接のキー（`resize_pane_*`。`resizeBy` の操作は既にある）・agent への移動（`previous_agent`・`next_agent`・`focus_agent`）。
  **既定を持つ**操作——scrollback を `$EDITOR` で開く（`edit_scrollback`＝herdr の既定 `prefix+e`）・設定の再読み込み（`reload_config`＝`prefix+shift+r`）は、いま「後続」の案内としてそのキーを使っている
  （`packages/web/src/keys/keymap.ts` の `NOT_YET_BINDINGS`）ので、実装したら**その案内を置き換える**。**実装の本体は別の行**（`edit_scrollback` は「端末機能の拡張」・`reload_config` は「外観と設定の残り」の設定の再読み込み）で、
  この行は「キーの割り当てに載せる分」だけ（同じ機能を 2 行で掴まない）。操作を足す work であって、割り当てを変える work ではない（出典: .aidev/works/20260921-keybinding-customization/requirements.md の対象外）
  実装: `.aidev/works/20260923-missing-keybinding-actions/`（12個の `ActionId` を `packages/web/src/keys/bindings.ts` の `ACTIONS` へ登録、`defaults: []`）。
  実測: 単体テスト 2608 本 green（protocol 58・server 657・web 1760・cli 133）・smoke pass（2本）。独立点検（cross）1件（対応済み）。review 指摘 0 件（test-result.md・review.md 参照）。
  `docs/herdr-parity.md` H26d に対応表を追加済み。
- [x] 独自コマンドのキー: herdr の `[[keys.command]]`（`type` が `popup`・`pane`・`shell`）。サーバで任意のコマンドを走らせる仕組みと、その権限の設計が要る。`docs/herdr-parity.md` の H12（ポップアップ端末・独自コマンドのキー割り当て）（出典: .aidev/works/20260921-keybinding-customization/requirements.md の対象外）
  → 着地: 20260927-custom-command-keys（PR は deliver の報告を参照）。コマンドはサーバの状態ディレクトリ（名前付き session ではその session）の `commands.json` だけに書き（`packages/server/src/commands/commandConfig.ts`。zod の strictObject・64 KiB・100 件・Unix は fd の fstat で持ち主・権限・リンク・FIFO を検査）、
  ブラウザは id で呼ぶだけ（`command.run` は id・pane・popup の大きさだけ。文字列はブラウザへも渡さない）。キーは設定画面の群「独自コマンド」（`packages/web/src/keys/commandKeys.ts`・`keys.commands`）。
  popup（`CommandPopup.vue`。開いたブラウザだけ・切断で止まる）・pane（`openZoomedCommandPane` を `prefix+e` と共有）・shell（同時 16 本）。環境変数 `SODA_ACTIVE_*`・`SODA_COMMAND_ID`。
  実測: 全体 4,662 tests green（244 files）・smoke pass（7 本。popup の往復を足した）・負の確認 32 件すべて落ちる。独立点検：doccheck 5 工程・taskcheck 12 タスク＋cross、review 2 ラウンド（must 1〔Windows の PTY の引用〕→ 解消）。
- [ ] 独自コマンドの `plugin_action`（herdr の `type = "plugin_action"`）：本製品にプラグインの仕組みが無いので対象外にした（出典: .aidev/works/20260927-custom-command-keys/requirements.md の対象外）
- [ ] 独自コマンドの残り：`commands.json` に既定のキーを書く／popup を他のブラウザへ出す・切断や再読み込みをまたいで保つ・窓の大きさの変化に追従させる／`sodactl` から独自コマンドを走らせるサブコマンド／`commands.json` の変更の監視（自動の読み直し）／更新時の引き継ぎ（`soda handoff`）で `pane` 種の「閉じたら戻す」を引き継ぐ／Windows ネイティブの実機での起動の確認（出典: .aidev/works/20260927-custom-command-keys/requirements.md の対象外・decisions.md D2・D9）
- [x] サイドバー・tab バーのボタン（`@keydown.stop`）にフォーカスがある間も、prefix・直接のキーを効かせる: いまはそのボタンにフォーカスが残ると、端末をクリックするまで届かない（prefix でも同じ既存の挙動）。
  ボタンの Enter/Space と入力欄への入力を守ったまま、修飾キー付き・prefix のキーだけを window へ通す形が要る（出典: .aidev/works/20260921-keybinding-customization/decisions.md D11）
  実装: `.aidev/works/20260925-focus-trapped-keybindings/`（`Sidebar.vue` 6箇所・`TabBar.vue` 1箇所の
  `@keydown.stop` を、無修飾の Enter/Space のときだけ `stopPropagation()` する `onButtonKeydown` に置換。
  `preventDefault()` はしないのでボタン自身の活性化は妨げない）。
  実測: 単体テスト139本 green（Sidebar.test.ts・TabBar.test.ts・PaneFrame.test.ts）。E2E
  `key-bindings.spec.ts` 23/24 pass（1件は無関係な既存失敗。decisions.md D4）・新設3件は実ブラウザで
  AC1・AC2・AC4 を確認。smoke pass（2本）。taskcheck 6件（T1〜T6）＋cross、review 2ラウンド
  （1回目 should 1件→E2E追加で解消・2回目 nit 2件→対応済み）。
- [x] pane の枠（`PaneFrame.vue`）にフォーカスがある間も、prefix・直接のキーを効かせる: ~~上と同じ
  問題が pane の枠（Enter・Space・↓・ContextMenu・Shift+F10 を無条件に止める既存の実装）にも残る。~~
  （起票時の記述は不正確だった。20260925-pane-frame-focus-keys の調査で判明——`PaneFrame.vue` の
  `onKeydown` は既に選択的で ctrl/alt/meta 付きは無条件で bubble し、マウスも `onMouseDown` の
  `preventDefault()` でフォーカスを奪わない。「無条件に止める」問題自体が存在しなかった。実際に
  残っていた穴は別種で、無修飾／shift 付きで pane の枠が止める5キーのうち chord 化できる4キー
  （Enter・Space・ArrowDown・Shift+F10。ContextMenu だけ chord 化不可）が、キー割り当て
  カスタマイズ画面で prefix の後・直接のキーとして予約されておらず、割り当てると理由不明に
  効かなくなる、という穴だった。）20260925-pane-frame-focus-keys で対応:
  `keymap.ts` の `RESERVED_AFTER_PREFIX` に `enter`・`space`・`down`・`shift+enter`・
  `shift+space`・`shift+down`・`shift+f10` の7エントリ、`RESERVED_DIRECT`
  （`ReadonlySet`→`ReadonlyMap` へ型変更）に `shift+f10` を追加。`PaneFrame.vue` 自体は無改修。
  実測: `assign.test.ts`・`keymap.test.ts` 92本 green・monorepo 全体
  （web 1986・protocol 68・server 829・cli 133本）green・root typecheck exit 0・
  smoke pass（2本）・`aidev coverage --strict` AC1〜AC7 gaps=0。taskcheck 2ラウンド
  （round1 ok・round2 must1/should1→対応済み）、review 2ラウンド
  （1回目 must1件→shift 付き3キー追加で解消・2回目 nit2件→対応済み）。
  20260925-focus-trapped-keybindings は対象をサイドバー・tab バーのボタンに絞り、pane の枠は
  意図的に対象外とした（出典: .aidev/works/20260925-focus-trapped-keybindings/requirements.md
  「スコープ / 対象外」）。
- [x] キーの設定の使い勝手: 20260922-keybinding-usability で対応。節「キー」に操作名・群名での絞り込み欄を足し（`KeySettings.vue` の `filterText`/`actionsByGroup`）、
      衝突したときは案内文の直後に「こちらへ移す」ボタンが出て単一の割り当てなら1回の操作で移せる（`assign.ts` の `AssignResult.conflict`・`KeySettings.vue` の `moveHere()`）。
      macOS で `navigator.keyboard.getLayoutMap()` が使えるとき、`alt+…` の chord の表示を実際に押した字へ置き換える（`packages/web/src/keys/chordDisplay.ts`。表示専用、取り込み・照合は変えない）。
      全画面のとき、ブラウザ・OS 予約キーの一部を `navigator.keyboard.lock()` で受け取る opt-in の switch を足した（既定は無効。`KeyboardLockController.ts`）。
      実測: 実装 12 ファイル・1068 行追加（工程成果物は含まず）・単体 1505 件 pass・E2E 20 件 pass（`packages/e2e/src/specs/key-bindings.spec.ts`）。
      AC12・AC13（Keyboard Lock の実効果）と AC8（macOS 実機での表示）は自動テストの対象外で `docs/verification.md` の手動確認へ（`.aidev/works/20260922-keybinding-usability/decisions.md` D6・D3）。
- [x] Git worktree の作成と一覧（上の項目のうち worktree そのものを扱う部分）: 20260920-git-worktree-actions で対応。
      workspace の右クリックメニューに「新しい worktree」「worktree を開く…」、キーは `prefix+G`。
      作成先は `~/.sodashitsu/worktrees/<repo>/<branch-slug>`（`packages/protocol/src/worktreePath.ts:37-41`）。
      失敗は 6 つのコードに分類して日本語にする（`packages/web/src/net/clientError.ts:19-25`）。
      実測: 実装 36 ファイル・単体 1161 件 / E2E 69 件 pass。~~削除とグループ化は下の行に残っている~~
      グループ化は下の行（20260923-workspace-grouping）で対応済み。削除（`git worktree remove`）は
      別の backlog 項目として未着手のまま残る。
- [x] workspace のグルーピング: herdr 同等の Git worktree グループ＋利用者による任意の束ね、workspace・~~tab~~ の並べ替え〔D6〕。
      **worktree の作成・一覧は 20260920-git-worktree-actions で済んだので、残りはグループ化と並べ替え** (needs: 20260918-web-terminal-multiplexer)（出典: .aidev/works/20260918-web-terminal-multiplexer/requirements.md）
      20260923-workspace-grouping で worktree 自動グループ・手動named グループ・D&D＋キーバインドでの
      workspace 並べ替えを実装（AC1〜AC11・AC-I1〜AC-I5 全て pass。typecheck/test 2800 件 green・
      coverage --strict gap 0・smoke pass）。tab の並べ替えは取り消し線のとおり対象外
      （20260923-missing-keybinding-actions で別途対応済み）。
      （出典: .aidev/works/20260923-workspace-grouping/test-result.md）
- [x] D&D による pane の入れ替え（Web 固有の操作。上の項目のうち入れ替えだけ）: 20260923-pane-name-dnd-swap で対応。
      ~~pane 名ラベルを別の pane の上へドラッグ＆ドロップすると同一 tab 内の2つの pane が入れ替わる
      （`pane.swap_with`。`packages/server/src/session/SessionModel.ts` の `swapPaneWith`）。~~
      **20260924-pane-dnd-split-move（decisions D4）で、この「ドロップ先を問わず入れ替え」という
      挙動は縁/中央のゾーン方式（分割/分割解除）に置き換わった**——安全な入れ替えと、プロセスを
      実際に終了させる分割解除を同じジェスチャの中に両立できないため。`pane.swap_with` RPC 自体・
      `SessionModel.swapPaneWith` は変更・削除していない（呼び出し元が無くなっただけ）。
      実測: 実装 11 ファイル・単体 2372 件 pass（`packages/web/src/components/PaneFrame.test.ts` 34 件含む）。
      **分割・分割解除は下の行、別 tab / 新規 workspace への移動はさらに下の行に残っている**
- [x] D&D による pane の分割・分割解除（Web 固有の操作。上の項目のうち分割・分割解除）: 20260924-pane-dnd-split-move で対応。
      pane 名ラベルを別の pane の縁へドラッグ＆ドロップするとその方向に分割してドラッグした pane が
      移り、中央へドロップするとドロップ先を閉じてドラッグした pane がそのスペースを引き継ぐ
      （`pane.move_to_edge`/`pane.replace`。`LayoutTree.insertAtEdge`・`SessionModel.moveToEdge`/
      `replacePane`）。ドロップ先が busy なら確認ダイアログを経由する（D23 の既存パターン。
      review 指摘 must で追加）。
      実測: `pnpm -s test` 2837 passed / 0 failed（161ファイル）・`aidev coverage --strict`
      ac=16 gaps=0（`.aidev/works/20260924-pane-dnd-split-move/test-result.md`）。
      **別 tab / 新規 workspace への移動は下の行に残っている**
- [x] D&D による pane の別 tab・別 workspace への移動（Web 固有の操作。同一 tab 内の入れ替え・分割・
      分割解除は上の行で対応済み） (needs: 20260918-web-terminal-multiplexer)（出典:
      .aidev/works/20260924-pane-dnd-split-move/decisions.md D1）
      tab バーの tab・サイドバーの workspace 行へのドロップに対応（`pane.move_to_tab`・
      `pane.move_to_new_tab`）。移動元 tab が空になれば自動的に閉じる（D18 の既存規則を踏襲）。
      実測: `pnpm -s typecheck` exit 0（3パッケージ）・protocol/server/web 合計 2743 passed /
      0 failed・`aidev coverage --strict` ac=16 gaps=0
      （`.aidev/works/20260924-pane-move-cross-tab/test-result.md`）。
      review round1 で見つかった「セッション全体のグローバル focus を更新しない」制約は
      backlog に別途追加済み（下記「レイアウトだけを書き換える pane 操作」の行。decisions.md D4）。
- [ ] エージェント対応の拡充: 主要数種以外の検出、herdr の integrations / plugins 相当 (needs: 20260918-web-terminal-multiplexer)（出典: .aidev/works/20260918-web-terminal-multiplexer/requirements.md）
- [x] 複数ホストの集約: herdr の remote / several machines 相当。複数ホストのセッションを 1 画面に:
      20260927-multi-host-machines で最初の一切れを対応（PR は deliver の報告を参照）。`soda machine add/list/rename/enable/disable/remove`
      （`packages/server/src/machine/machineCommands.ts`・登録簿 `MachineCatalog.ts`＝状態ディレクトリの根の `machines.json`・0600・秘密なし）、`soda bridge`
      （`bridgeCommand.ts`）とリモートの `bridge.sock`（`BridgeEndpoint.ts`・0600・認証は socket の権限）、手元の `soda serve` のマシンの接続の管理
      （`MachineManager.ts`・`MachineLink.ts`。1 秒から倍々・最大 2 分の繋ぎ直し・要対応の分類）、`/ws?machine=`（`ws/WsServerWs.ts`・`MachineRelay.ts`）、
      ブラウザのサイドバーのマシンのまとまりと切り替え（`web/src/components/MachineHeader.vue`・`MachineRows.vue`・`actions/MachineSwitcher.ts`）、
      `sodactl --machine`。実測: vitest 4800 passed / 0 failed・`aidev smoke` 8 本 pass（`machineSmoke.js`＝偽の ssh で実物の `soda bridge` を通す）
      （`.aidev/works/20260927-multi-host-machines/test-result.md`）。使い方は `docs/machines.md`。
- [ ] 複数ホストの残り（モバイル）: モバイルの 1 列の画面でのマシンの切り替え（今は 1 列ではマシンの機能を使わず手元だけ） (needs: 20260927-multi-host-machines)（出典: .aidev/works/20260927-multi-host-machines/requirements.md の対象外）
- [ ] 複数ホストの残り（通知とキー）: ほかのマシンのエージェントの状態の変化をトースト・OS 通知・音で知らせる／`prefix+w` 相当のキーボードでのマシンをまたぐ移動／ほかのマシンの行のグループ表示 (needs: 20260927-multi-host-machines)（出典: .aidev/works/20260927-multi-host-machines/requirements.md の対象外・decisions D8）
- [ ] 複数ホストの残り（接続の入口）: `soda --remote <宛先>`（登録せずに 1 回）・手元の `soda serve` を通さない直接の SSH での `sodactl --machine`・リモートの `--state-dir` を登録簿に持つ・画面からの登録 (needs: 20260927-multi-host-machines)（出典: .aidev/works/20260927-multi-host-machines/decisions.md D5・docs/machines.md）
- [ ] 複数ホストの残り（導入と対応 OS）: リモートへの `soda` の自動の導入・更新・`soda serve` の自動の起動（herdr は承認つき）／Windows のマシンをリモートにする（`bridge.sock` の代わり）／本物の SSH・macOS・手元が Windows での確かめ (needs: 20260927-multi-host-machines)（出典: .aidev/works/20260927-multi-host-machines/test-result.md の未検証の穴）
- [ ] 複数ホストの残り（画像の貼り付け）: リモートへのクリップボードの画像の転送（herdr の H44） (needs: 20260927-multi-host-machines)（出典: docs/herdr-parity.md H44）
- [ ] ノードによるオーケストレーション: セッションをノード表示し、マウスで繋いで状態トリガ・出力受け渡し・監督関係を設定（外部操作 API の後） (needs: 20260918-web-terminal-multiplexer)（出典: .aidev/works/20260918-web-terminal-multiplexer/requirements.md）
- [x] 通知: 完了・入力待ちのアプリ内トースト / OS 通知 / 音、通知の対象への移動（herdr prefix+o）:
      20260920-agent-notifications で対応。エージェントが**入力待ち**になった／**完了**したとき、
      利用者の状態に応じて 3 経路を使い分ける（フォーカス無し→OS 通知・音・トースト／
      フォーカス有りで pane 非表示→トーストだけ／見ている pane→何も出さない。
      `packages/web/src/notify/policy.ts` の `routesFor`）。待ち行列は最大 8 件で
      `prefix+o`・トーストの［移動］・OS 通知のクリックから対象へ移れる。
      設定はサイドバーのメニュー・モバイルの上部バー・`prefix+s` の 3 入口。
      実測: 実装 30 ファイル・単体 1359 件 / E2E 76 件 pass。
      **PWA 化（ページを閉じている間の通知）・通知音の差し替え・エージェントごとの音は下の行に残っている**
- [ ] 通知の残り: **PWA 化**（Service Worker ＋ Push。ページを閉じている間の通知）／
      通知音の差し替え（herdr の `ui.sound.path` 等）／エージェントごとの音の入切
      （herdr の `ui.sound.agents.<agent>`）／通知の履歴の一覧（出典: .aidev/works/20260920-agent-notifications/requirements.md の対象外）
- [x] 外観と設定: テーマと明暗の切替〔D8〕（出典: .aidev/works/20260918-web-terminal-multiplexer/research.md）
  → 着地: 20260921-theme-settings（feature/theme-settings）。herdr の組み込みテーマ 17 種（`terminal` を除く）をブラウザごとに選べ、OS の明暗
  （`prefers-color-scheme`）に合わせて「明るいとき」「暗いとき」のテーマへ自動で切り替える。1 つのテーマが画面の枠（CSS 変数。`packages/web/src/theme/uiTokens.ts`）と
  端末の配色（`packages/protocol/src/theme.ts` の `TERMINAL_PALETTES`）の両方を決め、端末の中のアプリの色の問い合わせ（OSC 10/11/12/4）には tab の大きさを
  決めているブラウザのテーマで答える（`packages/server/src/clients/answerPalette.ts`）。最初の描画は `packages/web/public/theme-boot.js`。画面の枠の色は
  17 テーマとも WCAG のコントラスト（文字 4.5・状態の記号 3 等）を満たすよう寄せ、単体テストで総当たり。既定は今までと同じ Dracula。
  実測: 単体 protocol 57・server 616・web 1203 本、E2E `theme-settings.spec.ts` 8 本（ほかの影響を受ける spec を含め一式で確認）。
  色の個別の上書き・明暗の変化をアプリへ知らせる（DSR 996・mode 2031）・選択の背景の見やすさは下の別の行に起こした
- [x] 外観と設定の残り: サイドバー行の並び替え（開いた順/名前順）、tab バーの自動非表示・現在時刻表示、
  pane の枠・隙間の太さとエージェント名表示、設定の再読み込み（`prefix+shift+r`）〔D8〕
  (needs: 20260918-web-terminal-multiplexer)（20260922-appearance-settings-rest。
  `packages/web/src/components/Sidebar.vue:155-161`・`packages/web/src/components/TabBar.vue`・
  `packages/web/src/components/PaneFrame.vue:107-137`・
  `packages/web/src/actions/ActionDispatcher.ts` の `reloadConfig()`。
  `docs/herdr-parity.md` H21・H22・H23・H25b。実測: unit 1504 本 green、
  E2E `appearance-settings.spec.ts` 新規6本＋既存 spec 6ファイルの回帰修正
  （最後まで安定した完走は未確認——test-result.md「E2E について」参照）〔D8〕）
- [x] 外観と設定の残り（PR #12 から選択的に取り込み）: tab バーの位置（上/下）、右端の複数エントリ
  （拡大の状態・ホスト名・日時4プリセット・固定文字列。最大16件・並び替え・区切り文字）、
  pane 領域の外周の枠〔D8〕(needs: 20260918-web-terminal-multiplexer)（
  20260922-appearance-settings-rest decisions.md [[D11]]。
  `packages/web/src/tabbar/tabBarRight.ts`（新規）・
  `packages/web/src/components/TabBar.vue`・`App.vue`・`SettingsDialog.vue`。
  旧「現在時刻の常時表示」はこの右端エントリ（日時）に統合された。
  実測: unit 1542 本 green（E2E は未実行——[[e2e-only-on-request]]。ユーザー方針で
  このラウンドでは回していない）。PR #12（`20260922-tabbar-pane-appearance`）は
  この取り込みと内容が重複するため close・branch 削除した）
- [x] 外観と設定の残り（H23 分）: pane の枠の描画モード（常に/分割しているときだけ/表示しない。既定は herdr と逆の「常に」）・
  隙間の入切〔D8〕（20260926-pane-frame-auto-mode。PR: feature/pane-frame-auto-mode ブランチから作成。余白を辺ごとに決める規則
  `packages/web/src/layout/paneChrome.ts:35-47`（`resolvePaneChrome`）、隣と分割の受け渡し
  `packages/web/src/components/PaneLayout.vue`、描き分け `packages/web/src/components/PaneFrame.vue`、設定
  `packages/web/src/store/settings.ts`（`paneBorders`/`paneGaps`）・設定画面 `SettingsDialog.vue`。
  ~~`PaneFrame.vue` の「常に padding・太さ3段階」設計と両立しない~~——太さ3段階は余白を取る辺の太さとしてそのまま両立した。
  実測: unit 3042 本 green（全パッケージ）・負の確認 17 変異すべて検知・smoke pass（2本）。E2E は未実行）
- [x] 外観と設定の残り（H25b 分）: 設定の onboarding（はじめの案内）（20260926-settings-onboarding。PR: feature/settings-onboarding ブランチから作成。
  判定 `packages/web/src/store/onboarding.ts:19`（`isFreshBrowser`。保存された設定・キー一覧の案内の印・既読のどれも無いブラウザだけ）・
  `:53`（自動操作のブラウザでは出さない。decisions D11）、案内 `packages/web/src/components/OnboardingDialog.vue`（確定 `:183` は変えたものだけを
  設定画面と同じ setter で反映・スキップ `:162` は何も変えない。どちらも `soda.prefs.v1` に `onboarding: false`）、開き直し
  `packages/web/src/components/SettingsDialog.vue:917`、起動確認 `packages/server/src/smoke.ts:166`（実物の Chromium で案内が開き、Esc で端末へ
  フォーカスが戻る）。herdr の現行版（説明＋続けると連携の節）と 0.2 系（通知の選択）を合成し、テーマ・キーのプリセット・通知を選べる。
  実測: unit 3363 本 green（全パッケージ・続けて 2 回）・負の確認は全変異を検知（生き残った変異にはテストを足してやり直し）・smoke pass（3 本）。E2E は未実行）
- [x] 外観と設定の残り（H21 分）: サイドバー行の色の条件付け・独自トークン（20260927-sidebar-row-tokens。PR: feature/sidebar-row-tokens ブランチから作成。
  独自トークンの報告 `sodactl workspace|pane report-metadata`（`packages/cli/src/cliArgs.ts` の `parseReportMetadata`・RPC `workspace.report_metadata`/`pane.report_metadata`）、
  規則 `packages/server/src/metadata/metadataTokens.ts`（herdr と同じ整え方・上限・seq・TTL）、配線 `packages/server/src/metadata/MetadataService.ts`（期限のタイマー 1 つ・
  閉じた対象の破棄）、行の並びの規則 `packages/web/src/sidebar/rowLayout.ts`・解決 `resolveRows.ts`・描画 `packages/web/src/components/Sidebar.vue`・
  設定画面 `components/SidebarRowsSettings.vue`（節「表示」）。既定の見た目は変更前の描画の golden（`components/__golden__/`）と比べて同じ。
  実測: unit 4666 本 green（全パッケージ）・負の確認 52 変異（生き残った 3 本はテストを強めて落ちることを確認、1 本は等価な変異）・smoke pass（7 本）。E2E は未実行）
- [ ] サイドバーの行の `machine` トークン（H21 の残り）: 複数ホストの対応（下記「複数ホストの集約」）が着地してから、agents 行に機械の名前を出す (needs: 20260927-sidebar-row-tokens)（出典: .aidev/works/20260927-sidebar-row-tokens/decisions.md D6）
- [ ] サイドバーの行の続き（H21 の残り）: `rows_by_agent`（エージェントの種類ごとの並びの上書き）・`row_gap`・`terminal_title_stripped`・隣り合う値の間の ` · ` と `git_status` の ↑ 緑・↓ 赤（既定は今の見た目） (needs: 20260927-sidebar-row-tokens)（出典: .aidev/works/20260927-sidebar-row-tokens/decisions.md D3・D6）
- [ ] `pane report-metadata` の表示名・状態名の上書き（herdr の `--title`・`--clear-title`・`--display-agent`・`--clear-display-agent`・`--state-label`・`--clear-state-labels`・`--agent`・`--applies-to-source`。トークンだけは対応済み） (needs: 20260927-sidebar-row-tokens)（出典: .aidev/works/20260927-sidebar-row-tokens/decisions.md D6）
- [ ] サイドバーの行の細部（review の nit）: (1) TTL 付きで同じ値を報告し直すと中身の同じ tokens を配り直す（値の表が変わったときだけ配る）。(2) `unverified` を主の行へ動かすと警告色が付かない。(3) 設定画面の［既定に戻す］で、もう一方の区画の［詳細］の開閉まで閉じる (needs: 20260927-sidebar-row-tokens)（出典: .aidev/works/20260927-sidebar-row-tokens/review.md ラウンド 1）
- [ ] 独自トークンの値の永続化（サーバの再起動・`soda handoff` をまたいで残す。herdr もメモリだけなので要否から検討） (needs: 20260927-sidebar-row-tokens)（出典: .aidev/works/20260927-sidebar-row-tokens/decisions.md D4）
- [x] セッション永続化の拡張（エージェントの会話の再開のうち Claude Code・Codex）: 20260923-agent-session-resume
      で対応。両エージェント公式の hooks 機構（`SessionStart`）を使い、pane ごとに会話IDを本製品自身の
      ローカル socket へ報告させ（`packages/server/assets/agent-hook-report.cjs`）、`session.json`
      に永続化し（`SessionFilePane.agentSession`）、サーバ再起動時に `claude --resume <id>` /
      `codex resume <id>` を自動投入する（`SessionService.ts` の `maybeResumeAgentSession`）。
      連携の導入・解除・自動再開の切替は設定画面「エージェント連携」節から明示操作で行う
      （`AgentIntegrationInstaller.ts`・`SettingsDialog.vue`）。herdr 本来の「連携（H18相当）が
      報告した正確なIDで再開する」方式と同じ発想だが、herdr のプロトコルには依存しない独自実装
      （decisions.md D1）。
      実測: 実装 48 ファイル・1631 行追加/48 行削除（工程成果物は含まず）・単体 2353 件 pass
      （protocol 57・server 647・web 1649）・起動確認（smoke）pass。E2E は実施していない
      （[[e2e-only-on-request]]）。実物の Claude Code・Codex CLI との結線・Windows の named pipe
      権限限定は未検証（`docs/verification.md` の手動確認へ回した。decisions.md D5）。
- [x] セッション永続化の拡張: Claude Code・Codex 以外で herdr が「session identity」型（セッションIDだけを
      報告し、状態は引き続き画面判定）と記載する6エージェント（Cursor Agent CLI・GitHub Copilot CLI・
      Devin CLI・Droid・Grok CLI・Qwen Code）への resume 対応〔D8〕 (needs:
      20260918-web-terminal-multiplexer, 20260923-agent-session-resume)（出典:
      .aidev/works/20260918-web-terminal-multiplexer/research.md。各エージェントの再開コマンドは
      20260923-agent-session-resume/research.md F1.2 に一覧化済み。2026-09-23、単一の
      「セッション永続化の拡張（残り）」行から4分割した一部——他3つは下の行。当初は
      Antigravity CLI・Qoder CLI・Letta Code・Hermes Agent を含む10エージェントを対象としていたが、
      requirements〜design 直前の実地調査で4者とも対象外と判明した——下の非対応の行を参照）。
      実装: `.aidev/works/20260923-other-agents-session-resume/`（`HookSpec` による kind ごとの
      hook 設定の抽象化。`packages/server/src/agent/AgentIntegrationInstaller.ts`）。
      実測: 単体テスト 2651 本 green（protocol 59・server 684・web 1775・cli 133）・smoke pass（2本）。
      独立点検（cross）2件（対応済み）。review 指摘 0 件。**6エージェントとも実機未検証**
      （`docs/verification.md` に明記。test-result.md 参照）。`docs/herdr-parity.md` H32b に
      対応表を追加済み。
- [ ] （非対応・参考）Antigravity CLI・Qoder CLI・Letta Code・Hermes Agent は resume 統合ができない
      （20260923-other-agents-session-resume の requirements〜design 直前に公式ドキュメントを直接
      確認した結果）: Antigravity CLI は `PreToolUse`/`PostToolUse`/`PreInvocation`/`PostInvocation`/`Stop`
      の5イベントのみでセッション開始時に一度だけ発火するイベントが無い
      （https://antigravity.google/docs/hooks/）。Qoder CLI は
      `UserPromptSubmit`/`PreToolUse`/`PostToolUse`/`PostToolUseFailure`/`Stop` の5イベントのみで
      同様に `SessionStart` が無い（https://docs.qoder.com/en/cli/hooks）。Letta Code は `SessionStart`
      hook 自体は文書化されているが、セッション/会話IDの stdin JSON でのフィールド名がどこにも
      明記されていない（https://docs.letta.com/letta-code/hooks/）。Hermes Agent（NousResearch）は
      `~/.hermes/config.yaml` の shell hook でのID受け渡し方法が未文書化なうえ、公式ドキュメントの
      hook 設計が Python のコールバック関数（`def my_callback(session_id, ...)`）を前提にしており、
      本製品が想定する「shell コマンドをサブプロセスとして起動する」方式と噛み合わない可能性が高い
      （https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks）。いずれも各ツール自身の
      設計・ドキュメントの制約であり、本製品側の実装課題ではないため「非対応」として記録する
      （再調査が要るのは、各ツールが将来 SessionStart 相当のイベント・exact な schema を
      ドキュメント化したとき）。
- [ ] セッション永続化の拡張: herdr が「lifecycle authority」型（idle/working/blocked の状態そのものを
      hook が報告し、画面判定を使わない——本製品が未実装の統合方式）と記載する6エージェント（Kimi Code CLI・
      OpenCode・Kilo Code CLI・MastraCode・Pi・OMP）への対応。MastraCode・OMP は本製品にまだ画面検出の
      manifest 自体が無い（`packages/server/src/agent/agents.ts` D46）ため、resume 対応の前に検出自体が
      要る〔D8〕 (needs: 20260918-web-terminal-multiplexer, 20260923-agent-session-resume)（出典:
      .aidev/works/20260918-web-terminal-multiplexer/research.md。2026-09-23、
      20260923-other-agents-session-resume の requirements 確定時にスコープから明示的に外した分。
      「session identity」型6エージェントの行と対になる）。
- [x] セッション永続化の拡張: 名前付き session〔D8〕 (needs: 20260918-web-terminal-multiplexer)（出典:
      .aidev/works/20260918-web-terminal-multiplexer/research.md。2026-09-23、4分割した一部）。
      → 着地: 20260926-named-session（feature/named-session）。herdr の `--session <name>`・`session list`・`session delete`
      に当たる `soda serve --session <名前>`・`soda token reset --session <名前>`・`soda session list [--json]`・
      `soda session delete <名前> [--json]`。状態は herdr と同じ形で `<既定の状態ディレクトリ>/sessions/<名前>/`
      （`packages/server/src/persist/namedSession.ts:42` `resolveSessionStateDir`、`config.ts:133`）。`--session` を付けなければ
      状態ディレクトリ・表示は今までどおり（既存の保存状態は動かさない）。名前は herdr の規則に先頭の `-`・末尾の `.`・Windows の
      予約名の禁止を足した（`namedSession.ts:21` `sessionNameProblem`。decisions D2）。削除はロックを持ったまま rename してから消す
      （`namedSession.ts:133`。D4）。公式フック連携の Unix socket のパスが長すぎる名前・`--state-dir` は起動前に終了コード 2
      （Linux の上限 108 バイトは実測）。
      実測: 単体・結合テスト 3291 本 green（`pnpm -s test` を 2 回）・負の確認 29 変異すべて検知・smoke pass（3 本。3 本目を追加）。
      独立点検（タスク 9 件・cross）27＋3 件・独立 review 2 ラウンド（should 2・nit 4。nit 1 は許容）。E2E は未実行。
      Windows ネイティブ・macOS は未検証（`docs/verification.md` に手動確認を追加）。`docs/herdr-parity.md` H33 を更新済み。
- [x] 名前付き session の残り（止める）: herdr の `herdr session stop <name>` に当たる `soda session stop <名前>`。本製品のサーバは外から
      止める経路を持たず、`soda.lock` の pid へシグナルを送る形は pid の再利用で無関係なプロセスを止めうるので、止めるための
      安全な経路（認証つき等）の設計が要る。~~今は Ctrl+C か `soda session list` の pid へ `kill`~~〔D8〕 (needs: 20260926-named-session)
      （出典: .aidev/works/20260926-named-session/decisions.md D1）。
      → 着地: 20260927-session-stop（feature/session-stop。Linux・macOS）。経路は既存の制御の socket `handoff.sock`（状態ディレクトリの中・0600）の
      `{"op":"stop"}`（`packages/server/src/handoff/HandoffSocket.ts`・受け付けの判断は `handoff/controlRequests.ts`）で、新しい TCP の待ち受けも
      pid へのシグナルも無い。CLI（`packages/server/src/stop/stopCommand.ts` `runSessionStop`）は返事の pid と `soda.lock` の持ち主の一致を確かめ、
      持ち主が居なくなるまで最長 30 秒待つ（終了コード 0/1/2/3・`--json`）。停止は Ctrl+C と同じ手順（`serveShutdown.ts`）。名前は必須・`default`・
      `SODA_SESSION` は見ない（decisions D3）。止める途中の `soda handoff` は `stopping` で断り、引き継ぎの最中の停止は終わるまで待つ（D9・D10）。
      実測: `pnpm -s test` 233 files / 4492 passed（1 回）・負の確認 26 変異すべて検知（main.ts の配線はビルドして smoke で）・`aidev smoke` pass（7 本。
      7 本目 `stopSmoke.js` を追加）・独立点検（タスク 8 件＋cross 2 ラウンド）・独立 review 2 ラウンド（should 1・nit 5）。E2E は未実行。
      Windows は非対応（下の行）・macOS は未検証。`docs/herdr-parity.md` H33 ⑤・`docs/tls-setup.md`・`docs/verification.md` を更新。
- [ ] 名前付き session の残り（Windows で止める）: `soda session stop` の Windows 対応（今は終了コード 2 で非対応。制御の socket を Windows では
      置かない）。候補は (a) 状態ディレクトリに置く止める専用の秘密（1 回ごとの乱数）と既存の HTTP の待ち受け（loopback からだけ）、
      (b) 名前付きパイプ——Node の `net.Server` は DACL を指定できず、既定の DACL とリモート（SMB 越し）のクライアントの扱いを実機で確かめる
      必要がある（`AgentReportSocket` の Windows の権限も未対策。`docs/verification.md`）。herdr は interprocess の名前付きパイプで対応
      （`scratchpad/herdr/src/ipc.rs`）〔D8〕 (needs: 20260927-session-stop)（出典: .aidev/works/20260927-session-stop/decisions.md D2）。
- [ ] 制御の socket（`handoff.sock`）の接続に期限を付ける: 1 行も送らずに繋ぎっぱなしにする同じ利用者のプロセスがあると、`close()` の最後の
      socket の close（`net.Server.close` は接続の終わりを待つ）で停止が止まる。20260927-session-stop で socket を閉じる位置を `lock.release()` の
      直前へ移したので、起こりうる区間が停止の全体に広がった。1 行を受けるまでの期限（数秒）と、閉じるときに残った接続を切ること
      〔D8〕 (needs: 20260927-session-stop)（出典: .aidev/works/20260927-session-stop/decisions.md D4・review.md ラウンド 1 の補足）。
- [ ] `soda handoff --session <名前>` が大文字小文字を区別しない FS で綴りの違う名前を断らない（`isDirectory` だけで見る。`soda session stop`・
      `delete` は `findExactEntry` で断る）。同じ判定にそろえる〔D8〕 (needs: 20260927-session-stop)（出典: .aidev/works/20260927-session-stop/review.md ラウンド 1）。
- [ ] 画面から session を止める: `server.sessions` の一覧（サイドバーの `session: <名前> ⇄`）から別の session を止める操作（確認つき）。
      今は CLI の `soda session stop` だけ〔D8〕 (needs: 20260927-session-stop)（出典: .aidev/works/20260927-session-stop/requirements.md の対象外）。
- [x] 名前付き session の残り（画面と既定）: ブラウザの画面での session 名の表示・session の切り替え（herdr の `session attach`。
      Web 版では別の URL〔ポート〕を開くことに当たる）、session ごとのポートの記憶（名前だけで同じポートに起動し直す）、
      環境変数での既定の session の選択（herdr の `HERDR_SESSION`）〔D8〕 (needs: 20260926-named-session)
      （出典: .aidev/works/20260926-named-session/decisions.md D1・requirements.md の対象外）。
      → 着地: 20260926-named-session-ui（feature/named-session-ui）。表示は `HostInfo.sessionName`（`packages/protocol/src/model.ts`）を
      サイドバーの `session: <名前> ⇄`（`packages/web/src/components/Sidebar.vue`）とタイトルの `[名前]`（`serverSession/documentTitle.ts`）に。
      切り替えは認証済み WS の `server.sessions`（`packages/server/src/persist/namedSession.ts` `listServerSessions`）と一覧のダイアログ
      （`components/SessionSwitchDialog.vue`。新しいタブで `noopener,noreferrer`。URL は `serverSession/sessionTarget.ts`）。同じブラウザの複数ログインの
      ために名前付き session の Cookie を `soda_session_<名前>` に（`auth/AuthService.ts` `sessionCookieName`）。ポートは状態ディレクトリの
      `serve.json`（`persist/ServeRecordFile.ts`。全 session が書き、名前付きだけが `--port` 無しの起動で読む。`composeServer.ts` `withRememberedPort`）。
      `SODA_SESSION` は `soda serve`・`soda token reset` の既定（`cliArgs.ts` `applySessionEnv`）と名前付き session の pane の環境（`session/paneEnv.ts`）。
      実測: `pnpm -s test` 4239 本 green（origin/main を取り込んだ後。取り込む前は 4085 本）・smoke pass（5 本。5 本目に `SODA_SESSION` を追加）・
      負の確認 10 変異すべて検知＋点検中の変異。独立点検（タスク 11 件・cross）・独立 review 2 ラウンド（should 1・nit 4）。E2E・実機のブラウザは未検証
      （`docs/verification.md` に手動確認）。`docs/herdr-parity.md` H33 を更新済み。
- [ ] 名前付き session の残り（画面の続き）: ログイン画面（認証前）での session 名の表示、session の一覧のキー操作（アクション・キーバインド）と
      モバイルの 1 列表示での表示・切り替え、記憶の無い初回の起動で空いているポートを選ぶこと、`--host`・`--cert` 等ポート以外の記憶、
      `soda session list` へのポート・URL の表示〔D8〕 (needs: 20260926-named-session-ui)（出典: .aidev/works/20260926-named-session-ui/requirements.md の対象外）。
- [ ] 同じホスト名で並行して動かす名前付きでない soda（`--state-dir` を分ける）・別の根の同じ名前の session の Cookie の衝突（片方にログインすると
      他方がログアウトされる。名前付き session は 20260926-named-session-ui で分けた）〔D8〕 (needs: 20260926-named-session-ui)
      （出典: .aidev/works/20260926-named-session-ui/decisions.md D1・review.md cross）。大文字小文字を区別しない FS で綴りを変えて開いた
      名前付き session が一覧で current にならない件もあわせて見る。
- [x] セッション永続化の拡張: 画面履歴の保存と再生（opt-in）〔D8〕 (needs: 20260918-web-terminal-multiplexer)
      （出典: .aidev/works/20260918-web-terminal-multiplexer/research.md。2026-09-23、4分割した一部）。
      → 着地: 20260926-screen-history-replay（feature/screen-history-replay）。herdr の `[experimental] pane_history` に当たる
      `soda serve --pane-history`（既定は無効。`packages/server/src/cliArgs.ts`・`config.ts` の `paneHistory`）。各 pane の通常の画面と
      スクロールバックを色つき ANSI で状態ディレクトリの `session-history.json`（0600。`packages/server/src/persist/PaneHistoryFile.ts`）に
      30 秒ごと〔出力のあった pane だけ・内容が同じなら書かない〕と正常な停止のときに保存し（`session/PaneHistoryRecorder.ts`・`terminal/Mirror.ts`
      `historyAnsi()`）、復元で新しいシェルより前にミラーへ流して「前回のセッションの画面」の区切りの行を出す（`session/SessionService.ts`
      `spawnForPane`）。流す前に文字・色・カーソルの移動以外の制御を落とす（`terminal/historyAnsi.ts` `sanitizeHistoryAnsi`）。付けずに起動・
      `session.json` が無い／壊れた起動では消す（`composeServer.ts`）。会話を自動再開する pane には流さない。上限は pane ごと 2MiB・ファイル 64MiB。
      実測: 全体テスト 3803 本 green（`pnpm -s test`）・負の確認 22 変異すべて検知・smoke pass（3 本）・独立 review 2 ラウンド（should 2・nit 2、
      いずれも解消）。E2E は未実行。Windows ネイティブ・macOS は未検証。`docs/herdr-parity.md` H32 を更新済み。
- [ ] 画面履歴の残り（設定画面から）: `--pane-history` の有効・無効を設定画面（ブラウザ）から切り替える（herdr の Settings > Experiments >
      pane screen history）。サーバ全体の秘密の扱いを変える操作なので、ログインしたブラウザならどこからでも有効にできてよいかの判断が要る〔D8〕
      (needs: 20260926-screen-history-replay)（出典: .aidev/works/20260926-screen-history-replay/decisions.md D1）。
- [ ] 画面履歴の既知の制約: (1) 120 桁より広い端末で保存した行は、直列化の `CSI n C`（書かれていないマスの移動）が 120 桁で作るミラーの右端で
      止まり、空白の幅が詰まる（保存した幅を記録して流す前にミラーを広げる案。write と resize の順序の保証の確認が要る）。(2) 上限 2MiB を超える
      巨大な 1 論理行があると、行の境目で切る切り詰めがその行を丸ごと落とす (needs: 20260926-screen-history-replay)
      （出典: .aidev/works/20260926-screen-history-replay/decisions.md D7）。
- [x] セッション永続化の拡張: 更新時の引き継ぎ（live handoff）〔D8〕 (needs: 20260918-web-terminal-multiplexer)
      （出典: .aidev/works/20260918-web-terminal-multiplexer/research.md。2026-09-23、4分割した一部）
  → 着地: 20260926-live-handoff（feature/live-handoff）。**一部**（Linux で実機確認・macOS は未検証・Windows は非対応）: `soda handoff [--state-dir D] [--session NAME]`
  （`packages/server/src/handoff/handoffCommand.ts`）が状態ディレクトリの `handoff.sock`（0600。`handoff/HandoffSocket.ts`）で指示し、サーバは同じ Node で新しい版を
  確かめて（preflight。`handoff/preflight.ts`：実物の PTY を開いて execve し fd が残るか・読み込めるか・形式の版）から、`/ws` を閉じ・各 pane の読み取りを libuv の handle の段で止め
  （`pty/socketReading.ts`）・`session.json` と `handoff.json`（0600。画面を含む）を書き、`process.execve` で**同じ pid のまま**ディスク上の soda に入れ替わる（`handoff/HandoffController.ts`）。
  PTY の master は close-on-exec が無いので残り、新しい版は PTY を開く前に受け取って（`handoff/HandoffManifest.ts` `takeHandoff`：環境変数と `handoff.json` を必ず消す・
  nonce/pid/期限/`/dev/ptmx` を確かめる）、復元で新しいシェルの代わりに使う（`pty/AdoptedPtyProcess.ts`・`session/SessionService.ts` `adoptForPane`・`composeServer.ts` `listen`）。
  herdr との違い（`SCM_RIGHTS` ではなく execve・入口が `soda handoff`・execve の後は戻れない等）は `docs/herdr-parity.md` H32、方式の選択は decisions D2。
  実測: 全体テスト 4446 本 green（origin/main の取り込みの後）（`pnpm -s test`）・smoke pass（6 本。6 本目が `packages/server/dist/handoffSmoke.js` の実物の通し）・負の確認 29 変異すべて検知。E2E は未実行。
- [ ] live handoff の残り（macOS）: macOS の実機で `soda handoff` を確かめる（`process.execve` と node-pty の master の close-on-exec の無さは同じ設計。PTY の確かめが master と slave を
      区別しない弱いもの・ゾンビの終了コードが読めず 0 になる点も含めて見る） (needs: 20260926-live-handoff)（出典: .aidev/works/20260926-live-handoff/test-result.md「未検証の穴」）
- [ ] live handoff の既知の制約: (1) 引き継いだ pane のシェルが終わるとサーバが終わるまで `<defunct>` で残る（Node から任意の pid を回収できない。ネイティブのアドオンか回収の補助のプロセスが要る）。
      (2) 確かめた後に新しい版が起動の途中で落ちると戻れない（herdr のように新しい版を別のプロセスで起動して確かめてから渡す形は、`soda serve` が端末・systemd の前面のプロセスである限り pid が変わる）。
      (3) 境目で割れた多バイト文字の 1 文字・Kitty graphics の転送の途中の画像と送った画像は引き継がない（残りの base64 が文字として出うる）。(4) 読み取りを止める途中にできた
      Kitty の応答（`a=q` 等）の PTY への書き込みが execve までに終わる保証が無い (needs: 20260926-live-handoff)（出典: .aidev/works/20260926-live-handoff/decisions.md D2・D6・D11・review.md ラウンド 2）
- [x] 端末機能の拡張: スクロールバックを $EDITOR で開く〔D8〕（herdr の `edit_scrollback`。2026-09-26、画像表示と 2 つに割った一部）（出典: .aidev/works/20260918-web-terminal-multiplexer/research.md）
  → 着地: 20260926-edit-scrollback（feature/edit-scrollback）。`prefix+e`（操作名 `edit_scrollback`。「後続」の案内だった `NOT_YET_BINDINGS` を撤去）で、フォーカス中の pane の
  スクロールバック全体を平文で一時ファイルに書き、サーバの `EDITOR`（未設定・空なら `vi`）を起動した pane を同じ tab に拡大表示で開く。閉じると焦点・拡大表示が戻り一時ファイルが消える。
  新しい要求 `pane.edit_scrollback`（`packages/protocol/src/messages.ts`）・`SessionService.editScrollback`（`packages/server/src/session/SessionService.ts`）・
  一時ファイルとエディタの起動（`packages/server/src/terminal/scrollbackEditor.ts`。専用の 0700 のディレクトリに 0600 の新規ファイル、パスは `sh -c` の `$1` で渡す）・
  `Mirror.plainText()`（折り返しを戻す）。herdr との違いは `docs/herdr-parity.md` H11。
  実測: 全体テスト 3129 本 green × 2 回・smoke pass（2 本）・負の確認は test-result.md。review 通算 must 0・should 1・nit 2（いずれも解消）。
- [x] 端末機能の拡張: 端末内の画像表示（Kitty graphics。herdr H13）〔D8〕 (needs: 20260918-web-terminal-multiplexer)（出典: .aidev/works/20260918-web-terminal-multiplexer/research.md。2026-09-26、スクロールバックを $EDITOR で開く分〔20260926-edit-scrollback〕と割った残り）
  → 着地: 20260926-kitty-graphics（feature/kitty-graphics）。**一部**: サーバが Kitty graphics（直接転送 `t=d`・PNG/生の画素/zlib・分割送信・`a=q/t/T/p`・`c`/`r`/`C=1`）を解釈し、
  ブラウザの `@xterm/addon-image` 0.9.0 が描ける iTerm2 形式（セル数を指定）に作り直して送る（`packages/server/src/terminal/KittyGraphics.ts`・`TerminalHost.ts`）。Sixel・iTerm2 形式も表示。
  応答はサーバだけ（`a=q`・`CSI 14/16 t`）、PTY の画素の大きさも設定。`t=f/t/s` は開かずにエラー。残り（削除・アニメーション・再接続での復元・流量等）は下の 3 行に割った。
  実測: 全体テスト 4312 本 green・smoke pass（5 本）・負の確認は test-result.md。review 通算 must 0・should 2・nit 2（いずれも解消）。実物のブラウザでの描画は未検証（E2E を走らせない指示）。
- [ ] 端末内の画像の残り（Kitty graphics の削除・アニメーション・Unicode placeholder・切り出し・重なり順）: `@xterm/xterm` 6.1 と `@xterm/addon-image` 0.10 の安定版が出たら、ブラウザで Kitty graphics を直接解釈する案（decisions D1 の案 A）へ移るかを見直す。応答はサーバだけ（D17）を保つ形が要る (needs: 20260926-kitty-graphics)（出典: .aidev/works/20260926-kitty-graphics/decisions.md D1）
- [ ] 端末内の画像の再接続での復元: SNAPSHOT は文字だけなので、再接続・再読み込み・後から開いたブラウザでは画像が消える。サーバが保存している Kitty の画像と配置（位置・セル数）を覚えて SNAPSHOT の後に流し直すか (needs: 20260926-kitty-graphics)（出典: .aidev/works/20260926-kitty-graphics/requirements.md 対象外）
- [ ] 端末内の画像の細部: (1) プログラムが直接出した Sixel・iTerm2 形式の画像では、サーバのミラーのカーソルが動かず、ブラウザ同士でも行数がフォントで変わる（サーバで大きさを読んでセル数を決め直す案）。(2) DA1 で Sixel の対応を告げるか（画像を使わないアプリへの影響の確認が要る）。(3) 基準のセル 9×17 px の代わりに、大きさを決める権利を持つブラウザのセルの画素を使うか（decisions D3）。(4) herdr の `[terminal].kitty_graphics` に当たる有効・無効の設定。(5) ブラウザへ送る PNG の上限 1.25 MiB（配信の stale の閾値 2MB の手前）を超える画像・続けて出る画像を送れるよう、画像のバイト数を流量制御に入れるか画像を別の経路で送る。生の画素の PNG 化（最大 4 MP で約 0.4 秒）を主スレッドの外へ出す。(6) ブラウザで画像を置けなかったとき・DECSDM（`CSI ? 80 h`）のときにサーバの画面のカーソルだけが下がる食い違い (needs: 20260926-kitty-graphics)（出典: .aidev/works/20260926-kitty-graphics/decisions.md D3・D4・D5・D13）
- [ ] 配布と運用: 自己更新・更新チャネル、ログ、シェル補完〔D8〕 (needs: 20260918-web-terminal-multiplexer)（出典: .aidev/works/20260918-web-terminal-multiplexer/research.md）
- [ ] 規則・契約の一元化: レイアウトの隣と深さ優先の順・`/api/login` の状態コードの意味・ログインの制限の回数を `@sodashitsu/protocol` に置き、server と web の二重持ちをなくす (needs: 20260918-web-terminal-multiplexer)（出典: .aidev/works/20260918-web-terminal-multiplexer/review.md 統合 review ラウンド1 の nit）
- [ ] AgentMonitor の判定の失敗のログを間引く（`LogThrottle`。Windows で前面プロセスの取得が詰まり続けると server.log が伸び続ける） (needs: 20260918-web-terminal-multiplexer)（出典: .aidev/works/20260918-web-terminal-multiplexer/review.md 統合 review ラウンド1 の nit）
- [ ] SNAPSHOT で端末のモードを戻す: サーバの Mirror が parser のハンドラでカーソルの表示（?25）・SGR のマウス報告（?1006）・スクロール領域（DECSTBM）・カーソルの形（DECSCUSR）を追い、SNAPSHOT の末尾に足す（`@xterm/addon-serialize` 0.14.0 は出さない。再接続・新しいページで動いている TUI が崩れうる） (needs: 20260918-web-terminal-multiplexer)（出典: .aidev/works/20260918-web-terminal-multiplexer/decisions.md D107）
- [ ] モバイルの fit の状態の持ち方: (1) fit の有無を `MobileShell` の中に持つので、幅でデスクトップの本体へ替わってから戻るとボタンは押していない表示に戻るが、サーバでは fit が有効のまま。(2) fit 中に別のクライアントが操作で権限を取り返すと、`scale` が fit の有無だけで決まるためモバイルは等倍のまま描いてはみ出す（権限の有無を見て縮小に戻す） (needs: 20260918-web-terminal-multiplexer)（出典: .aidev/works/20260918-web-terminal-multiplexer/decisions.md D108）
- [ ] タブレットの扱い: タッチが主で幅 768px 以上の端末はデスクトップの画面になるが、種別が mobile なので PTY の大きさを決められず「この端末に合わせる」も無い（AC12 はスマートフォンが対象。タブレットをデスクトップ扱いにするか、fit のボタンを出すかの判断が要る） (needs: 20260918-web-terminal-multiplexer)（出典: .aidev/works/20260918-web-terminal-multiplexer/decisions.md D109）
- [ ] マウスの細部: (1) アプリがマウス報告を求めている pane で Ctrl＋クリックすると、リンクを開くのと同時に Ctrl 付きの左クリックの報告もアプリへ届く（design に定め無し）。(2) モバイルには pane の枠が無いので、「pane に送る」にした pane でマウスを使うアプリが動いている間はスマートフォンからその pane のメニューを開けない (needs: 20260918-web-terminal-multiplexer)（出典: .aidev/works/20260918-web-terminal-multiplexer/decisions.md D110）
- [ ] 拒否の理由の取り違え（狭い経路）: 前段のプロキシが Host を許可外の名前に書き換える構成（`--origin` は正しい）でサーバを起動し直すと、`/api/session` は Host で 403・`/ws` は起動の途中の 503 になり、Web が `rejected`（「`--origin` を加えて起動し直してください」）を出す。既にその `--origin` は付いているので理由が誤り（「再試行」で回復する）。403＋503 の切り分けを足す (needs: 20260918-web-terminal-multiplexer)（出典: .aidev/works/20260918-web-terminal-multiplexer/review.md 統合 review ラウンド2 の nit）
- [ ] サイズ権限の移譲の時計: `SizeAuthority.transferOwnership` が `lastInteractionAt`（`ClientRegistry` の `Date.now()`）の降順で移譲先を選ぶが、D103・D106 でログの間引き・ログイン制限・不正フレームの窓を単調な時計に移した後も、ここだけ壁時計のまま（時刻が巻き戻ると「最後に操作した人が勝つ」が反転しうる） (needs: 20260918-web-terminal-multiplexer)（出典: .aidev/works/20260918-web-terminal-multiplexer/walkthrough.md 作成時の発見）
- [ ] E2E の観測点をブラウザ側にそろえる共通部品: support/frames.ts の CDP／中継と panes.ts の client.view 観測を入口 1 つに整理し、spec がテスト自身の WebSocket クライアントだけで合否を決められないようにする（条項 e2e-observe-browser の実装面）（出典: .aidev/works/20260918-web-terminal-multiplexer/retro.md）
- [x] pnpm のスクリプトを「失敗が見える」形にする: pnpm -s の再帰実行は失敗時に何も出力せず終了コードだけが変わる。ルートの script か CI の呼び出しで出力と終了コードを必ず残す（この work で誤った結論を decisions.md に書き、後で訂正した）（出典: .aidev/works/20260918-web-terminal-multiplexer/retro.md）
  20260926-pnpm-script-visible-failures で対応。原因は2段: (1) `pnpm -s` の `-r` 実行は対象が2パッケージ以上だと
  子の出力を失敗時も含めて全部捨てる、(2) `-s` 時に pnpm が子へ渡す `npm_config_reporter=silent` を継承すると
  ラッパー内側の pnpm も黙る。ルートの `typecheck`・`build` を `scripts/run-quiet.mjs` 経由にし、`-s` のときだけ
  出力をためて失敗時に吐き出す（環境変数は外す）。`-s` 無しは素通し。`test`（vitest）・`lint` は影響なし（実測）。
  実測: 型エラーを仕込んで `pnpm -s typecheck`/`-s build`/`typecheck`/`build` の4通りとも失敗内容が出る、
  戻すと `-s` は0バイト・exit 0、ラッパー無し・環境変数を消さない形はそれぞれ無出力・バナーのみで落ちる
  （decisions.md D2 の A〜H）。vitest 3010 passed・smoke pass。doccheck 4ラウンド・taskcheck 2ラウンド・review 2ラウンド。
- [ ] AC17 の実機計測の結果を反映する: GPU のある実機で大量出力中の 16 pane を測り直し、合否を決める。D98 の閾値（2MB / 256KB）の見直しを含む（出典: .aidev/works/20260918-web-terminal-multiplexer/retro.md）
- [ ] 配色トークンの衝突を解く: --soda-menu-border と --soda-menu-active-bg がどちらも #44475a。(1) 選択中の pane の枠（2px の線）と地色 --soda-bg(#1e1f29) の輝度比が約 1.8:1 で非テキストの目安 3:1 を下回る。(2) spaces 区画の最後の行が表示中のとき、行の背景と .sidebar-agents の border-top が同色で区切り線が消える。直すときは :focus-visible の outline-offset:-1px が選択線の内側 1px に重なる点も一緒に見る（出典: .aidev/works/20260920-ui-selection-visuals/design.md）
- [ ] xterm.js のカーソルの描き方を決める: cursorStyle / cursorInactiveStyle をリポジトリで一度も設定しておらず（TerminalRegistry.ts の new Terminal）、フォーカスの無い pane のカーソルの見え方が xterm.js の既定任せ（出典: .aidev/works/20260920-ui-selection-visuals/design.md）
- [ ] mobile.spec.ts の D105 が一式で走らせると落ちる（単独では通る）: 分割後に隠れた pane の rows が 41→38 に変わる。負荷でタイミングが変わると現れる競合で、20260918 の着手前コードでも一式では落ちる。E2E 一式が安定して緑にならない原因（出典: .aidev/works/20260920-ui-selection-visuals/decisions.md）
- [ ] サイドバーの帯を下端に固定する: 行が多いと .sidebar-section-footer（新規・メニュー）が画面外へ流れ、「一度折りたたむ」以外に到達できないことがある（.sidebar-footer の折りたたみボタンは margin-top:auto で常に見える）。固定するには .sidebar の overflow-y を内側の入れ物へ移す必要があり、それは 20260920-ui-selection-visuals の AC3 の判定（.sidebar の scrollWidth）を空振りにするので、判定の作り直しと同時に行う（出典: .aidev/works/20260920-sidebar-tabbar-controls/design.md）
- [x] worktree の削除（git worktree remove）: 作成と一覧だけ実装したので、UI から片付けられない。時間切れ等で登録だけ残った中途半端な worktree も消せない（WorktreeService.ts:10 に対象外と明記）（出典: .aidev/works/20260920-git-worktree-actions/decisions.md）
      一覧ダイアログの各行から削除できるようにした（`worktree.remove`）。開いている workspace
      と一致すれば自動的に閉じる。dirty なら `--force` の確認を挟む2段階式（herdr と同じ）。
      実測: `pnpm -s typecheck` exit 0（3パッケージ）・protocol/server/web 合計 2920 passed /
      0 failed・`aidev coverage --strict` ac=16 gaps=0
      （`.aidev/works/20260924-worktree-remove/test-result.md`）。
      review round1 で見つかった2件の狭い既知の制約（多クライアント競合・lock 済み worktree）は
      backlog に別途追加済み（下記2行。review.md round1）。
- [x] worktree の作成先を設定できるようにする: いまは ~/.sodashitsu/worktrees 固定で、DefaultWorktreeService は root を受け取れるのに composeServer.ts:141 が渡していない。herdr の worktrees.directory 相当。E2E から逃がせないため spec 側で後片付けしている（D7）（出典: .aidev/works/20260920-git-worktree-actions/decisions.md）
  → 着地: 20260924-worktree-dir-config（feature/worktree-dir-config）。`soda serve --worktree-dir <path>` を追加。
  設定ファイル機構は新設せず（このリポジトリに元々存在せず、host/port/scrollback/shell 等を巻き込む横断判断が要るため見送り、
  独立した backlog 項目とした）、既存の `--shell`（素通し・既定値は解決しない）と全く同じ CLI フラグの慣習に合わせた。
  `cliArgs.ts`→`config.ts`→`composeServer.ts`→`DefaultWorktreeService`（既存の `root` 引数へそのまま渡すだけ。
  `WorktreeService.ts` 自体は無改修）の4段階のリレー。`docs/herdr-parity.md`（H37行）・`docs/tls-setup.md`に追記。
  実測: server 800 本・ルート一括 2941 本・smoke pass・`aidev coverage --strict` gaps=0。独立点検・cross-task check・
  レビュー各ラウンドで計6件の指摘を解消（switch 分岐の実装漏れ〔セッション中断で一度失われていた〕・弱いテストの強化・
  `main.ts` の `printHelp()` の追記漏れ・ドキュメントの矛盾2件・テストのprecedent不一致1件）。負の確認は生ログ付きで
  test-result.md/decisions.md に記録。**E2E harness を実際にこのフラグへ乗せ替え、spec 側の手動後片付け（`madeRepos`）を
  撤去する作業はこの work の対象外**——次の行として backlog に残す。
- [ ] E2E の worktree spec を --worktree-dir に乗せ替え、手動の後片付けを撤去する: workspace-tab-pane.spec.ts の
  afterEach（madeRepos を使った手動削除）は、E2E が worktree の作成先を実ホームディレクトリ（~/.sodashitsu/worktrees）から
  差し替えられなかったことの回避策（D7。20260920-git-worktree-actions decisions.md）。20260924-worktree-dir-config で
  --worktree-dir が使えるようになったので、packages/e2e/src/support/appServer.ts の startAppServer/bootServer に
  worktreeDir オプションを足し（scrollback と同じ形で composeServer へ素通しする）、該当 spec がテスト用の一時
  ディレクトリを渡すようにすれば、afterEach の手動後片付けと .worktree-dialog-preview-path の "/.sodashitsu/worktrees/"
  という決め打ちの文字列一致（実際のパスに合わせて直す必要がある）を両方とも解消できる（出典:
  .aidev/works/20260924-worktree-dir-config/requirements.md「対象外」）
- [ ] E2E が古いビルドを見る: pnpm -C packages/e2e test は再ビルドせず、@sodashitsu/server の dist と packages/web/dist を読む。直さずに走らせても通ったように見える。test スクリプトか CI で build を前置する（D8）（出典: .aidev/works/20260920-git-worktree-actions/decisions.md）
- [x] workspace のメニューをキーボードから開く: Sidebar.vue の行に tabindex も keydown も無く、右クリック（マウス）でしか開けない。pane の枠だけ PaneFrame.vue で対応済み。「worktree を開く…」がキーだけで到達できない原因（AC-I3 の制限）（出典: .aidev/works/20260920-git-worktree-actions/decisions.md）
  → 着地: 20260925-sidebar-keyboard-menu（feature/sidebar-keyboard-menu）。独立した Tab フォーカスは作らず、
  既存の navigate モード（prefix+w→矢印キーの仮想カーソル）を拡張し、選択中の行で space を押すとその行の
  メニューが開く（7つ目の navigate キー `navigate_open_menu`。既存6件と同じカスタマイズ可能なカタログ機構
  に乗せた）。ActionDispatcher は DOM に一切触れない既存原則を守り、実際に DOM から位置計算して開くのは
  Sidebar.vue が担う。review round1 で must（ContextMenu.vue に stopPropagation() が無く、navigate モード中に
  メニューを開いた状態で矢印キー・space が window まで二重配送され navigateSelection が意図せず動く不具合）
  を発見・修正——「変更しない」としていた ContextMenu.vue への差し戻しが実際に発生した。
  実測: web 1948 本・ルート一括 2949 本・smoke pass・`aidev coverage --strict` gaps=0。独立点検・cross-task
  check・レビュー2ラウンドで計8件の指摘を解消（負の確認は生ログ付きで decisions.md D1〜D4 に記録）。
- [x] Connection がエラーコードをプロパティで持つ: いまは new Error(`<code>: <message>`) の文字列で、web は書式を正規表現で読む（errorCodeOf）。書式が変わると黙って汎用の文言に落ちる（D4）（出典: .aidev/works/20260920-git-worktree-actions/decisions.md）
  → 着地: 20260925-connection-error-code（feature/connection-error-code）。`Connection.ts` が
  サーバのエラー応答を reject する際、`Object.assign` で `code` プロパティを付与するように
  変更（`message` の文字列書式は変えない、保守的な設計）。`clientError.ts` の `errorCodeOf` は
  `.code` を最優先で読み、無ければ既存の正規表現フォールバックへ落ちる。`@sodashitsu/protocol` の
  `RpcError` 採用（message から code 接頭辞を除く「本筋」の完全な形）は、変更範囲の割に価値が
  小さいとして見送り、理由を design.md に記録（decisions.md 参照）。review round1 で nit
  1件（negative-control の diff/cmp 記録漏れ）を発見・修正。
  実測: root 一括 2978 本・smoke pass・`aidev coverage --strict` gaps=0。
- [x] Workspace.git の即時化: GitInfoPoller が 5 秒周期なので、workspace を作った直後は最大 5 秒 git が null で、メニューに worktree の項目が出ない（D3）（出典: .aidev/works/20260920-git-worktree-actions/decisions.md）
  → 着地: 20260925-workspace-git-immediate（feature/workspace-git-immediate）。GitInfoPoller に
  `pollWorkspaceNow(workspaceId)` を追加（対象1件だけを probe。`pollNow()` のように全件を巻き込まない）し、
  `workspace.create` ハンドラから作成直後に fire-and-forget（`void ... .catch(() => undefined)`）で呼ぶ。
  応答は待たせず、結果は既存の `workspace.updated` イベントで届く。重複更新は既存の
  `updateWorkspaceGit`（`sameGit` による idempotent dedup）にそのまま乗せた。taskcheck T3 round1 で
  「fire-and-forget の検証テストが同期的すぎて await との違いを区別できていない」不備を発見し、
  `FakeGitInfoPoller` を deferred promise 方式に直して修正。taskcheck T5 round1 で「新規 end-to-end
  テストの負の確認の記録漏れ」（regression-negative-control）を発見し、decisions.md D1・
  test-result.md に生ログを記録。review は5観点とも findings 0。
  実測: server 807 本・ルート一括 2963 本・smoke pass・`aidev coverage --strict` gaps=0。
- [x] 既読（soda.seen.v1）の意味論を直す: markVisibleAgentsSeen はウィンドウにフォーカスがあれば pane の表示を見ずに全 pane を既読にする（main.ts の「意図的な簡略化」）。結果、フォーカス中は displayStateFor が done を返せず、通知は「完了しました」と言うのにサイドバーに印が無い。正しい規則 shouldMarkSeen(paneVisible, windowFocused) は本番から一度も呼ばれていない。20260920-agent-notifications が TerminalRegistry.isVisible を足したので、結線できる前提が揃った（出典: .aidev/works/20260920-agent-notifications/decisions.md）
  → 着地: 20260925-seen-semantics-fix（feature/seen-semantics-fix）。main.ts の markVisibleAgentsSeen を、
  store/seen.ts に新設したテスト可能な純関数 sweepMarkSeen（pane ごとに shouldMarkSeen(isVisible, hasFocus) で
  判定してから markSeen する）の呼び出しに差し替えた。TerminalRegistry.isVisible が非 reactive なため、既存の
  2発火点（completionSeq の変化・window の focus）だけでは拾えない「ウィンドウは既にフォーカスされたまま pane
  を切り替えて表示する」遷移を、TerminalPane.vue の onMounted に直接判定を足して拾う。NotificationController の
  shouldQueue（既に正しい）と shouldMarkSeen が論理否定の対関係にあることを review で確認——サイドバーの完了の
  印と通知が構造的に一致するようになった。実測: web 1955 本・ルート一括 2956 本・smoke pass・
  `aidev coverage --strict` gaps=0。独立点検・cross-task check・レビュー1ラウンドで計6件の指摘を解消
  （負の確認は生ログ付きで decisions.md D1 に記録）。main.ts 自体の配線は単体テスト基盤が無く未検証のまま
  （design.md に明記した既知の制約）。
- [ ] E2E 一式の安定性: 4 回走らせて 2 回、別々の spec が負荷で落ちた（workspace-tab-pane の時間切れ・mobile の D105）。どちらも単独では通る。先行 work から続く課題で、通知の 7 本が加わって所要が延びている。workers や timeout の見直し、または重い spec の分離（出典: .aidev/works/20260920-agent-notifications/decisions.md）
- [x] 単体・結合テストが高負荷のときだけ落ちる（2026-09-26、別 worktree・別セッションの vitest と同時に走り load average 13〜16 のとき。どれも単独では3回とも通る）: (1) `packages/cli/src/main.integration.test.ts`「Origin ヘッダが許可リストに無い接続は…403 で拒否される（AC9）」が `TypeError: Invalid value "undefined" for header "cookie"`（ログインが間に合わず cookie が空のまま接続）で3回落ちた。(2) `packages/web/src/components/SettingsDialog.test.ts:537`「矢印キー（radio）・Enter/Space（switch）…（AC-I3）」が 5000ms の既定タイムアウトで1回落ちた。(3) server の結合テストが `listen EADDRINUSE`（`getFreePort` で得たポートを並行実行の別テストが先に使う）で落ちた。ログイン成否の待ち合わせ・重いテストの timeout・空きポートの取り方（listen(0) の結果を使う）の見直し。追記（PR #44 マージ後の main、F の並行テストと重なった回）: (4) `packages/web/src/App.test.ts:190`「モバイル（MobileShell）は pane の枠を描かない」と (5) `packages/server/src/composeServer.integration.test.ts:258`「組み立てと listen() の間に token reset が走っても…（D103 の独立点検 #1）」がどちらも既定の 5000ms タイムアウトで落ちた（単独では5回とも通る）（出典: 20260926-persist-flush-drops-changes の test-result.md、PR #42・#41 マージ後の main の全体テスト）
- [ ] 高負荷のときだけ落ちるテスト（続き）: `packages/server/src/composeServer.integration.test.ts:605`「workspace.create は、実際の git リポジトリなら定期ポーリング（5秒）を待たずに Workspace.git が埋まる」の `expect(responseMs).toBeLessThan(2000)` が、load average 11〜14（別 worktree の work と並走）で `expected 2161 to be less than 2000` になり 1 回落ちた（単独では通る）。コメントのとおり粗い sanity check で、厳密な検証は index.test.ts の FakeGitInfoPoller が担うので、壁時計の閾値をやめる（または `GIT_TIMEOUT_MS` 級の遅延だけを弾く値にする）（出典: PR #53 マージ後の main の全体テスト 1 回目、2026-09-27）
- [ ] 高負荷のときだけ落ちるテスト（続き・web）: `packages/web/src/components/KeySettings.test.ts`「KeySettings — herdr のおすすめの直接のキー（AC10）> すでに全部あるうえで 1 個が別の操作の持ち物になったときは…足さなかった分を出す」が既定の 5000ms で時間切れ（1 回は 6,202ms）。2026-09-27、別 worktree の work と並走する全体テストで 2 回（20260927-custom-command-keys の test 工程と、PR #61 マージ後の main の 2 回目。load average 11〜19）。単独では 98 本とも通る。重い操作を分けるか、このファイルの timeout を実測の 2 倍にする（出典: PR #61 マージ後の main の全体テスト）
  → 着地: 20260926-load-flaky-tests（feature/load-flaky-tests）。(1) `packages/cli/src/session.ts` の `FsSessionStore.save` を「同じディレクトリの一時ファイルへ書いて `rename` で置き換える＋同じプロセス内で同じファイルへの更新を直列化（`serializeUpdate`）」にし、並行した読み取りが空の cookie を読まないようにした（decisions D2）。(3) 番号だけ先に取って後で待ち受ける形をやめ、`packages/server/src/composeServerOnFreePort.ts` の `composeServerOnFreePort`（EADDRINUSE のときだけ組み立て直す）と `listenOnFreePort`（自前の http.Server は `listen(0)`）へ置き換えた（D3）。(2)(4)(5) と GitInfoPoller の追従は、負荷の下の実測の最大の 2 倍で上限を決めた（D5・D8・D9）。実測: 負荷条件 C（busy loop 12 本＋対象 6 ファイル）で修正前 6/6 落ち→修正後 8/9 通過（落ちた 1 回は load average 41＝コア数の約 3.4 倍）、条件 F（busy loop 4 本＋全体）で修正前 2/4 落ち→修正後 4/4 通過。main.integration 単独 20 回: 修正前 2/20 落ち→0/20。全体 3719 本通過（main 6e079d9 の上）。負の確認は test-result.md。load average がコア数の約 3 倍を超えると `--follow`・watch はまだ時間切れになりうる（未検証の穴）
- [x] サイドバー幅・折りたたみ状態を保存する: UI は既にある（ドラッグで変えられる・prefix+b で畳める）のに ref() に置いているだけで、再読み込みのたびに 240px・展開に戻る。herdr は preferences に保存している。既存の soda.prefs.v1 に 2 フィールド足すだけで済む（herdr 設定調査で投資対効果が最も高いと判断）（出典: .aidev/works/20260920-agent-notifications/research.md）
  → 着地: 20260921-herdr-settings-gaps（feature/herdr-settings-gaps）。`soda.prefs.v1` に `sidebarWidth`・`sidebarCollapsed`（`packages/web/src/store/view.ts` の `loadSidebarWidth`・`commitSidebarWidth`・`toggleSidebar`）。ドラッグ中は書かず、終えたとき（`pointerup`・`pointercancel`・`lostpointercapture`・ダブルクリック・ダイアログが開いたとき）に 1 回だけ保存（`Sidebar.vue` の `endDrag`）。E2E `settings.spec.ts` の AC1・AC2（`storageState` を持ち越した新しい context で幅と折りたたみが戻る）
- [x] ブラウザから別のリポジトリの workspace を作れるようにする: 全 workspace がサーバの process.cwd() 固定で、web は workspace.create に cwd を送っていない。herdr の terminal.new_cwd 相当。設定というより機能の穴で、複数リポジトリを並行して見る使い方を塞いでいる（出典: .aidev/works/20260920-agent-notifications/research.md）
  → 着地: 20260921-new-terminal-cwd（feature/new-terminal-cwd）。既定は herdr と同じ「引き継ぐ」で、新しい workspace・tab・分割がいま見ている pane の、いまの場所（Linux は前面プロセスの cwd を読み直す）で開く。ホーム・起動した場所・指定した場所をブラウザごとに選べる（設定の「端末」）。規則は `packages/server/src/session/newCwd.ts` の `resolveNewCwd`、要求は `packages/web/src/actions/ActionDispatcher.ts` の `newCwdFor`。E2E `new-terminal-cwd.spec.ts`（`cd` → 新しい tab・分割・workspace → `pwd` をブラウザが受けたフレームで読む）。workspace の名前が一律「1」で見分けにくい件は別の項目に起こした
- [x] エージェントの状態表示を記号でも区別できるようにする: いまは色の点だけなので、色覚特性のある利用者に状態が読めない。herdr の ui.status_indicators = symbols 相当（blocked/working/done/idle/unknown に別々の字形）（出典: .aidev/works/20260920-agent-notifications/research.md）
  → 着地: 20260921-herdr-settings-gaps（feature/herdr-settings-gaps）。字形は herdr の `symbols` と同じ × ◐ ✓ ○ ·（`packages/web/src/store/stateIndicator.ts`）を色と併記し、読み上げの名前も付けた（`components/StateIcon.vue`。3 か所の複製を 1 部品に寄せた）。**既定は「入」で herdr（`dots`）と逆**（WCAG 1.4.1。同 work の decisions D1）。blocked と idle の色は 1.4.11 の 3:1 のため明るくした（D6。選択行の背景で 3.36・3.32）。E2E `settings.spec.ts` の AC5〜AC8
- [x] scrollback をクライアント側から設定できるようにする: いまは --scrollback でサーバ起動時にしか決められず、モバイルは 1000 行にハードコード。「このブラウザだけ長く持ちたい／スマートフォンでは軽くしたい」に応えられない（出典: .aidev/works/20260920-agent-notifications/research.md）
  → 着地: 20260921-herdr-settings-gaps（feature/herdr-settings-gaps）。`packages/web/src/term/scrollback.ts` の `effectiveScrollback`（「自動」は以前の値＝デスクトップはサーバの上限・モバイルは 1000、数を選べばサーバの上限で押さえる）と設定ダイアログの「端末」の節（`SettingsDialog.vue`）。モバイルの 1000 固定は「自動」のときだけになった。E2E `settings.spec.ts` の AC9（選んだ後に開いた pane が 1,000 行を求める）・AC11（iPhone 13 で 5,000 行を選ぶと開き直した pane が 5,000 行を求める）
- [ ] E2E の偽エージェントを support へ切り出す: 入力待ちの画面を出す偽のエージェント（exec -a claude と画面の文言）が agent-detection.spec.ts・notifications.spec.ts・settings.spec.ts の 3 か所に複製されている。判定ルール（herdr の toml）が変わると 3 か所を直すことになる。安定している 2 本の spec を書き換えるので、20260921-herdr-settings-gaps の範囲からは外した（出典: .aidev/works/20260921-herdr-settings-gaps/review.md）
- [x] workspace の既定の名前をリポジトリ名（git でなければフォルダ名）から自動で付ける: 今はどこで開いても一律に「1」で、別のリポジトリで開いた workspace がサイドバーで見分けられない。herdr は repo 名か cwd のフォルダ名を自動の名前にし（src/workspace.rs の display_name・automatic_workspace_label。名前を変えた後は変えた名前のまま）、cwd が変われば追従する。worktree を開く経路が label を明示しているのはこの穴への個別の手当て（出典: .aidev/works/20260921-new-terminal-cwd/review.md）
  → 着地: 20260921-workspace-auto-label（feature/workspace-auto-label）。名前を付けていない workspace を、開いた場所のリポジトリの根のフォルダ名（git の外ならフォルダ名・ホームなら `~`）で呼ぶ。規則は `packages/server/src/session/workspaceLabel.ts`（herdr の `git_repo_root` 等を移植。git のコマンドは使わない）、自動か付けたものかは `Workspace.autoLabel`。名前を空にして確定すると自動に戻る（herdr に無い）。`cd` への追従は別の項目に起こした。E2E `workspace-auto-label.spec.ts`（ほかのブラウザが受けた `workspace.created` の名前が最初から根の名前）
- [x] workspace の名前と git の情報を、最初の pane のいまの場所に追従させる: 自動の名前（20260921-workspace-auto-label）とサイドバーの git の情報（GitInfoPoller）はどちらも workspace を開いた場所（Workspace.cwd）から決めていて、cd しても変わらない。herdr は最初の tab の根の pane のいまの場所から名前と git の状態を決め直す（src/workspace.rs の display_name_from_terminals）。名前だけ追従させると git の情報と食い違うので、両方をまとめて扱う（出典: .aidev/works/20260921-workspace-auto-label/requirements.md）
  → 着地: 20260926-workspace-label-follow-cwd（feature/workspace-label-follow-cwd）。いまの場所＝最初の tab の、画面の並びで先頭の pane の `Pane.cwd`
  （`packages/server/src/session/SessionService.ts:289` の `identityCwdOf`。herdr の根の pane とは入れ替え・移動のときだけ違う——decisions D2）。
  `GitInfoPoller` が 1 回の見直しで同じ場所の git と自動の名前を決めてまとめて入れ（`SessionService.ts:301` `followedLabel`・`:317` `applyWorkspaceIdentity`）、
  バスのイベントで場所の変化にすぐ気づく（`packages/server/src/git/GitInfoPoller.ts:15`）。名前を空にして確定・復元もいまの場所から。worktree の一覧・作成・削除も
  いまの場所のリポジトリで（`packages/server/src/git/WorktreeService.ts:104`）。保存の tab の並びを並べ替えた順に直した。実測: `pnpm -s test` 3050 passed、
  負の確認は変異 39 個のうち 36 個が落ちた（生き残った 3 個の理由は decisions D6・D7 と test-result.md）。E2E は未実行。
- [x] テーマの色の個別の上書き: herdr の `[theme.custom]`（`accent`・`panel_bg`・`sidebar_bg`・状態の色など）と明暗別の `[theme.custom.light]`/`[theme.custom.dark]`。herdr でも設定ファイルでだけ変えられる。~~本製品には利用者が書く設定ファイルが無いので、設定の再読み込み（H25b）と合わせて置き場所から決める~~（20260921-theme-settings の対象外）（出典: .aidev/works/20260921-theme-settings/requirements.md）
  → 着地: 20260922-theme-custom-overrides（feature/theme-custom-overrides）。「置き場所」は設定の再読み込み（H25b）を待たず、既存の節「テーマ」に
  上級者向けの折りたたみとして決着した（本製品の設定は元々すべて即時反映・保存で、herdr の「再読み込み」に相当する操作はどの設定にも無い）。
  herdr の 19 トークンではなく、本製品が実際に使う 19 個の CSS 変数（`packages/web/src/theme/uiTokens.ts` の `CSS_VARS`）を対象にし、
  「明るいとき」「暗いとき」の 2 層で上書きできる（`packages/web/src/theme/themeOverrides.ts`）。上書きは選んだテーマの計算結果（コントラスト
  調整後）の上にそのまま当たり（自動調整はしない）、`ThemeController`（`applyOverrides`）・起動用の控え（`writeBoot`）の両方に反映する。
  色ごと・すべてまとめて既定に戻せる（すべては確認あり）。保存は既定との差だけ（`soda.prefs.v1` の `themeOverrides`）。
  実測: 単体（全パッケージ）2181 本・E2E 一式 120 本（うち `theme-settings.spec.ts` 12 本）・smoke pass。回帰テストは
  結線（`ThemeController` の watch・store の返り値）を外して落ちることを確かめ、生出力を
  `.aidev/works/20260922-theme-custom-overrides/test-result.md` に貼った。独立 review 2 ラウンド（must 0・should 1・
  nit 3 を解消）。
- [x] 明暗の変化を端末の中のアプリへ知らせる: DSR 996（`CSI ? 996 n` → `CSI ? 997 ; 1|2 n`）への応答と mode 2031 の通知（herdr の `src/terminal_theme.rs` の `HostAppearance::color_scheme_report`）。サーバの Mirror が、その pane の tab の大きさを決めているブラウザのテーマの明暗で答え、テーマや OS の明暗が変わったら通知する。いまは応えていない（20260921-theme-settings の対象外）（出典: .aidev/works/20260921-theme-settings/requirements.md）
  → 着地: 20260924-dark-mode-report（feature/dark-mode-report）。`Mirror.ts` に CSI ハンドラ（`?996n`・`?2031h`・`?2031l`）と
  ESC（RIS）ハンドラを追加し、「どちらの明暗か」は色の問い合わせ（`answerPaletteFor`）と同じ4段階優先順位を共有する
  `resolveThemeFor`/`answerAppearanceFor`（`answerPalette.ts`）で解決。push のトリガーは `client.theme` RPC だけに絞り、
  OS の自動切替も既存の `ThemeController.apply()` の経路にそのまま乗るため web パッケージは無改修。
  実測: server 796 本・ルート一括 2937 本・smoke pass・`aidev coverage --strict` gaps=0。独立 review 2 ラウンド
  （must 1・should 2・nit 2 を解消——CSI ハンドラが複数 Pm の束ね（例 `?2031;1049h`）に対応しておらず、束ねられた
  他のモードを無効化するバグを発見・修正。生ログは `.aidev/works/20260924-dark-mode-report/decisions.md` D2 参照）。
- [ ] 端末の選択の背景を見えるようにする: 上流の配色の選択の背景と端末の背景の比が低いテーマがあり（one-light 1.11・solarized-light 1.14・solarized 1.15・rose-pine-dawn 1.27・one-dark 1.31）、copy モードやマウスで選んだ範囲がほとんど見えない。`finalizePalette`（packages/protocol/src/theme.ts）に「選択の背景を端末の背景から寄せる」規則を足す案。20260921-theme-settings では「上流の値のまま、選んだ文字とカーソルだけ直す」（decisions D5）の内側として見送った（出典: .aidev/works/20260921-theme-settings/review.md）
- [x] エージェント自動化 API / CLI（一部）: herdr の agent start／agent prompt --wait／agent wait／agent read 相当（pane とは別の「エージェント」という名前付きの対象・状態遷移の待ち合わせ・agent skill ファイルの検討を含む） (needs: 20260923-external-control-api)（出典: .aidev/works/20260923-external-control-api/decisions.md D2）（出典: .aidev/works/20260923-external-control-api/decisions.md）
  → 着地: 20260926-agent-automation-api。`sodactl agent list`／`agent get`／`agent wait`（`--until` 繰り返し・既定 idle/done/blocked・`--timeout` 省略で無期限・`agent_not_running`）／`agent read`（alt screen は今の画面だけ・末尾 N 行）を pane ID 指定で追加（`packages/cli/src/commands/agent.ts:157` の `runAgentWait`・`packages/cli/src/agentStatus.ts:26` の `statusOf`・`:91` の `currentScreen`）。サーバ・プロトコル・web は無変更（既存の `client.hello` snapshot と `pane.agent_status_changed` を CLI 側で待ち合わせ。hello 応答の同期区間で購読を始める `packages/cli/src/wsClient.ts` の `hello(onEventAfterHello)`）。実測: `pnpm -s test` 3155 passed ×2・負の確認 22 通り全て検出・smoke pass。使い方は `docs/sodactl.md`。
- [x] エージェント自動化: `agent prompt`（`--wait`）・`agent send-keys` 相当——prompt を bracketed paste の live な状態に合わせて送り、遅延 Enter で確定し、`blocked` なら送らず、送信後 5 秒以内に working/blocked を観測できなければ `agent_prompt_stalled` (needs: 20260926-agent-automation-api)（出典: .aidev/works/20260926-agent-automation-api/decisions.md D1）
  → 着地: 20260926-agent-prompt-send-keys（feature/agent-prompt-send-keys）。`sodactl agent prompt [--wait]`・`agent send-keys` とサーバの RPC `agent.prompt`/`agent.send_keys`。送る瞬間のモードで包む `packages/server/src/agent/agentInput.ts:20`（本文中の印は除去）・遅延 Enter 300ms `agentInput.ts:10`・送信中の他の入力の後回し `packages/server/src/terminal/TerminalHost.ts:117`・blocked なら送らない `packages/server/src/surface/methods/agent.ts:65`・送信後 5000ms で `agent_prompt_stalled` `packages/cli/src/agentStatus.ts:86`・`packages/cli/src/commands/agent.ts:208`。偽のエージェント（node・argv[0]=claude・bracketed paste 有効）の結合テストで、複数行の本文が 1 つの貼り付けとして届き CR が 250ms 以上後に別の読み取りで届き、working を経て idle で返ることを実測（`packages/cli/src/agentPrompt.integration.test.ts`）。全体テスト 3407 passed ×2。
- [ ] エージェント自動化: 本物のエージェント（Claude Code・Codex 等）で `sodactl agent prompt --wait`・`agent send-keys` を確かめる——複数行の prompt が 1 つの入力として確定されるか（300ms の遅延 Enter で足りるか）・送信後に working/blocked が 5 秒以内に検出されるか・承認ダイアログに send-keys で答えられるか。Windows（ConPTY）での送信も (needs: 20260926-agent-prompt-send-keys)（出典: .aidev/works/20260926-agent-prompt-send-keys/decisions.md D13・test-result.md「未検証の穴」）
- [x] エージェント自動化（一部）: `agent rename` と名前による対象指定——live なエージェント間で一意な名前（`[a-z][a-z0-9_-]{0,31}`）。`AgentInfo` に名前を足すとサーバ・プロトコル・web に波及する (needs: 20260926-agent-automation-api)（出典: .aidev/works/20260926-agent-automation-api/decisions.md D1）
  → 着地: 20260926-agent-start-rename（feature/agent-start-rename）。`sodactl agent rename <target> <name>|--clear`（RPC `agent.rename`・`packages/server/src/surface/methods/agent.ts` の末尾）と、全 `agent` サブコマンドの `<target>`（pane ID → 名前の順に解決する `packages/cli/src/agentTarget.ts:16` `resolveAgentTarget`）。名前は `AgentInfo.name?`（省略可。`packages/protocol/src/model.ts`）で、書式 `packages/protocol/src/agentName.ts` `isValidAgentName`・一意性と `invalid_agent_name`/`agent_name_taken` は `SessionService.renameAgent`、判定の周期をまたいだ引き継ぎ（同じ instanceId のときだけ）は `SessionService.updatePaneRuntime`。名前は終了・入れ替わり・pane の close で消え、保存しない（herdr は検出の揺れでは消さず session に保存する）。web はサイドバー・携帯の一覧・pane の呼び名（`paneNameOf`）に表示。実測: `pnpm -s test` 3711 passed ×2・負の確認 34 通り全て検出・smoke pass（ビルド済みの sodactl で rename → 名前で get → --clear）。
- [x] エージェント自動化（一部）: `agent start <name> --kind KIND --pane ID [--timeout MS] [-- <args>]`——空いているシェル pane の判定（前面プロセスグループがシェル自身だけ）・kind から実行ファイルを決める固定表（任意のコマンド行は受けない）・`--` の後の引数の制御文字の拒否とシェルごとのクォート（POSIX のみ。PowerShell／cmd.exe は下の兄弟項目）・起動中（pending）→ blocked/active と 3 秒の猶予・既定 30 秒の締め切り・起動完了の待ち合わせ（`agent_not_ready`）。名前は 20260926-agent-start-rename の `renameAgent`（書式・一意性の検査）の上に載せ、`updatePaneRuntime` に名前付きの `AgentInfo` を渡す経路を作らない（decisions.md D7。herdr の start は名前必須） (needs: 20260926-agent-start-rename)（出典: .aidev/works/20260926-agent-start-rename/decisions.md D1）
  → 着地: 20260926-agent-start（feature/agent-start）。`sodactl agent start <name> --kind KIND --pane ID [--timeout MS] [-- <args>]`：RPC `agent.start`（`packages/server/src/agent/AgentStarter.ts`）・kind の固定表 22 種類（`packages/protocol/src/agentStart.ts` `AGENT_START_EXECUTABLES`）・制御文字（C0・DEL・C1）の拒否と全引数の単一引用符（`packages/server/src/agent/agentStart.ts` `hasControlChar`/`quotePosixArg`）・前面プロセスグループがシェル自身だけ（`checkShell`。受け付け時と、他の入力を後回しにした書き込み直前の 2 回。`TerminalHost` の `ModalInput.prepare`）・Ctrl-C → 200 ms → Ctrl-E Ctrl-U＋行＋CR・起動中の名前の予約と検出時の名前付け（`SessionService.beginAgentLaunch`/`updatePaneRuntime`）・CLI の待ち合わせ（`packages/cli/src/agentStartWait.ts`）。対応シェルは Linux／WSL2 の sh・bash・dash・zsh・ksh・mksh（実物で確かめたのは bash・dash）。実測: `pnpm -s test` 3816 passed ×2（main 取り込み後 3824 passed）・負の確認 111＋9 通り（観測上等価の 2 通りを除き全て検出）・smoke pass。
- [ ] エージェント自動化: `agent start` の fish・PowerShell・cmd.exe の pane と Windows のサーバへの対応——シェルごとのクォート（fish の単一引用符の `\`、PowerShell の `''`、cmd.exe の `^`・`%`）と実物での argv の確認・Windows の前面プロセスの判定。今は `unsupported_agent_shell` で何も打ち込まない（`packages/server/src/agent/agentStart.ts` `OTHER_SHELLS`・`AgentStarter.ts` の `win32` の検査） (needs: 20260926-agent-start)（出典: .aidev/works/20260926-agent-start/decisions.md D1）
- [ ] エージェントの検出が一度外れただけで別のエージェントとして数え直さない: `AgentTracker.update` は前面にエージェントが見えない判定が 1 回あると `null` にし、次に見えたら新しい `instanceId` を払い出すので、付けた名前・`agent wait` の待ち（`agent_not_running`）が一時的な揺れで切れる。herdr は「Temporary detection uncertainty does not clear it」（`cli-reference.mdx:348`・CHANGELOG の #3225）。数回続けて見えないときだけ外す等のヒステリシスの検討 (needs: 20260926-agent-start-rename)（出典: .aidev/works/20260926-agent-start-rename/requirements.md「対象外」・research.md R3）
- [x] エージェント自動化: agent skill ファイル（sodactl の使い方をエージェントに教える Markdown）——pane の中から sodactl を使うための環境変数（herdr の `HERDR_ENV` 相当）と安全ガードの検討を含む (needs: 20260926-agent-automation-api)（出典: .aidev/works/20260926-agent-automation-api/decisions.md D1）
  → 着地: 20260926-agent-skill-file（feature/agent-skill-file）。skill ファイル `packages/cli/skills/sodactl/SKILL.md`（日本語・front matter つき。最初に `SODA_PANE_ID` を確かめて無ければ止まる・構文の正典は `sodactl help`・ID は JSON から・隣の pane でコマンド／エージェントを動かす手順・作法・`self_target`）と `sodactl skill`（`packages/cli/src/skill.ts`。サーバにつながない）。pane の環境に `SODA_SERVER_URL`（`packages/server/src/util/net.ts` `paneServerUrl`・待ち受けた後・復元の前に決める `packages/server/src/composeServer.ts`）を入れ、sodactl の接続先を `--url` > `SODACTL_URL` > `SODA_SERVER_URL` > 既定に（`packages/cli/src/cliArgs.ts` `globalOptsFrom`）。サーバを起動した環境の `SODACTL_URL`・`SODACTL_TOKEN` と古い `SODA_*` は pane に渡さない（`packages/server/src/session/paneEnv.ts` `buildPaneEnv`。token・cookie は環境に入れない）。pane の中にいる印は既存の `SODA_PANE_ID`。自分の pane とそれを含む tab・workspace を対象にする 9 コマンドを `self_target` で断る（`packages/cli/src/selfGuard.ts`。ループバックの名前は同じサーバとみなす。抜け道は `SODA_PANE_ID=`。安全の境界ではない）。実測: `pnpm -s test` 3896 passed・負の確認 30 通り全て検出・smoke pass（4 本目に `sodactl skill`）・実サーバの pane の中から `pane close "$SODA_PANE_ID"`・`tab close` が self_target。
- [x] エージェント自動化: 呼び出し元の pane を既定の対象にする——herdr の `--current`・`pane split` の対象の省略・`pane current`、`HERDR_WORKSPACE_ID`/`HERDR_TAB_ID` 相当の環境変数（pane の移動で古くなる点の扱いを含む）。今は skill が `"$SODA_PANE_ID"` を明示して渡す (needs: 20260926-agent-skill-file)（出典: .aidev/works/20260926-agent-skill-file/decisions.md D1）
  → 着地: 20260927-caller-pane-default（feature/caller-pane-default）。`sodactl pane current [--pane ID|--current]`（`packages/cli/src/commands/pane.ts` `runPaneCurrent`。接続時の snapshot から今の `tabId`・`workspaceId`・`focused` を返す）と `pane split [<paneId>|--pane ID|--current]`（省略は pane の中なら呼び出し元・外ならサーバのフォーカスの pane。`packages/cli/src/cliArgs.ts` `parsePaneTarget`）。呼び出し元の pane は接続先がその pane のサーバだと `self_target` と同じ判定（`selfPaneId`）で確かめられるときだけ使い、確かめられなければ `caller_pane_unknown`（`packages/cli/src/paneTarget.ts` `resolveCallerPane`）。`--machine`（local 以外）では `--current` は誤り・省略はそのマシンのフォーカス。~~`HERDR_WORKSPACE_ID`/`HERDR_TAB_ID` 相当の環境変数~~ は足さない（pane の移動で古くなり、利用者の別の workspace を操作させる。decisions.md D2。`pane current` で代える）。実測: `pnpm -s test` 5004 passed（無関係な web の 1 件のタイムアウトは単独の再実行で 98 passed）・負の確認 32 変異中 29 検出（生存 3 は観測上等価）・smoke pass（ビルド済みの sodactl に pane の中の環境を与えて、フォーカスを別の workspace へ移した状態で `pane current`・対象を省いた `pane split`）。
- [ ] エージェント自動化: herdr のスクリプトの移植のために `SODA_WORKSPACE_ID`・`SODA_TAB_ID` を pane の環境に入れるか（pane の移動で古くなる。今は `sodactl pane current` で今の値を聞く）。herdr の `--current` を受ける残りのコマンド（`pane layout`・`process-info`・`neighbor`・`edges`・`focus`・`resize`・`zoom`・`swap`・`input --right-click`）はコマンドを足すときに `--current` も足す (needs: 20260927-caller-pane-default)（出典: .aidev/works/20260927-caller-pane-default/decisions.md D1・D2）
- [ ] エージェント自動化: `self_target` の「同じサーバか」をサーバの識別子で確かめる——今は接続先の URL と `SODA_SERVER_URL` を比べる（ループバックの名前だけ正規化）ので、`SODACTL_URL` に証明書の名前・LAN の IP で同じサーバを指すと歯止めが効かない（docs・skill に明記済み）。hello でサーバの識別子を返し、pane の環境の識別子と比べる案 (needs: 20260926-agent-skill-file)（出典: .aidev/works/20260926-agent-skill-file/decisions.md D8）
- [ ] エージェント自動化: token を持たない pane の中からの sodactl の自動ログインの検討——同じ OS ユーザーなら状態ディレクトリの token を読めるので信頼の境界は広がらないが、「一度も login を許していないのに pane の中の任意のプロセスが操作できる」ことの是非を決める (needs: 20260926-agent-skill-file)（出典: .aidev/works/20260926-agent-skill-file/decisions.md D3）
- [ ] エージェント自動化: 本物のエージェント（Claude Code・Codex）に `sodactl skill` を入れて、pane の中で skill の手順と作法どおりに振る舞うか・Claude Code が front matter を skill として読むかを確かめる。Windows のサーバ・PowerShell の pane での `SODA_SERVER_URL` と環境の取り除き、TLS のサーバの pane の中からの接続も (needs: 20260926-agent-skill-file)（出典: .aidev/works/20260926-agent-skill-file/test-result.md「未検証の穴」）
- [x] pane 直接接続・制御ストリーム（一部）: herdr の terminal attach／session observe／session control 相当（pane 単体への直接接続・書き込み権限の排他制御・閲覧専用の購読ストリーム。既存の pane.subscribe は複数購読者を許す設計のため前提が異なる） (needs: 20260923-external-control-api)（出典: .aidev/works/20260923-external-control-api/decisions.md D2）（出典: .aidev/works/20260923-external-control-api/decisions.md）
  → 着地: 20260926-pane-direct-connect（feature/pane-direct-connect）。`sodactl pane attach <paneId> [--takeover]`（herdr の terminal attach）。pane ごとに書き込み可能な直結は 1 つ（サーバの `SizeAuthority` の所有者の表と大きさの鍵 `packages/server/src/clients/SizeAuthority.ts:136` `attach`・`:211` の `applyOwnerSize` の除外。別の所有者がいれば `pane_attached`、`--takeover` で奪うと前の直結は `attach_taken_over`）・直結中は pane の大きさを直結の端末に合わせブラウザのサイズ権限からは変えず、切り離すと tab の権限者の大きさへ戻す・ブラウザの表示と入力は止めない。RPC `pane.attach`/`attach_resize`/`detach` とイベント `pane.attach_changed` は既存の `/ws` の上だけ。CLI は raw モード・代替画面・`Ctrl+B q` で切り離し（`packages/cli/src/commands/attach.ts:95` `runPaneAttach`）、出力から端末への問い合わせを取り除いて二重応答を防ぐ（`packages/cli/src/attachOutput.ts:23` `TerminalQueryFilter`）。実測: `pnpm -s test` 3587 passed ×2・負の確認 40 通り全て検出（Q5 はテスト追加後に検出）・smoke pass（node-pty の実物の PTY で 100x30・echo・resize 90x25・Ctrl+B q で終了コード 0）。
- [x] pane 直接接続・制御ストリーム（残り・一部）: herdr の `terminal session observe`（閲覧専用・NDJSON の `terminal.frame`/`terminal.closed`・複数の観測者）と `terminal session control`（書き込み可能・stdin の NDJSON `terminal.input`/`resize`/`release`・`--takeover`）。所有者と大きさの鍵は 20260926-pane-direct-connect の `SizeAuthority` の上に載せる (needs: 20260926-pane-direct-connect)（出典: .aidev/works/20260926-pane-direct-connect/decisions.md D1）
  → 着地: 20260926-pane-observe-control（feature/pane-observe-control）。`sodactl pane observe <paneId>` と `sodactl pane control <paneId> [--takeover] [--cols N] [--rows N]`。サーバ・protocol・web は変えず、既存の `pane.subscribe`・`pane.attach`/`attach_resize`/`detach`・INPUT フレームだけで作った（`packages/cli/src/commands/sessionStream.ts` `PaneStream`・`runPaneObserve`・`runPaneControl`）。記録の組み立て・行の切り出し（1 MiB 上限）・コマンドの厳密な検査（未知の type・知らないキー・非正規の base64・1〜1000 の範囲外・BOM を不正として読み飛ばし stderr に理由）は `packages/cli/src/sessionStream.ts`。読み手が遅いときは ws の受信と control の stdin を止めてサーバの流量制御に任せ、`full: true` のフレームから続ける（decisions D4・D9・D12）。control は `pane attach` と所有者を共有し、`self_target` の歯止めも同じ。実測: `pnpm -s test` 4068 passed（main 取り込み前）・負の確認 47 通り（観測上等価の 1 通りを除き全て検出）・smoke pass（ビルド済みの sodactl をパイプで observe/control）。
- [ ] pane 直接接続・制御ストリームの残り: `terminal.scroll`（直結中のサーバ側のスクロールと同じ土台）・observe の `--cols/--rows`（観測者ごとの大きさでサーバが描き直したフレーム。今は pane の生の出力を区切って流す）・observe/control の対象に agent の名前と herdr の `w1:p1` 形式 (needs: 20260926-pane-observe-control)（出典: .aidev/works/20260926-pane-observe-control/requirements.md「対象外」・decisions.md D2・D7・D8）
- [x] サーバ側の大きさと入力の上限: `pane.attach`・`pane.attach_resize`・`client.view` の `cols/rows` にサーバのスキーマの上限が無い（`sodactl` は 1〜1000 に絞るが生の `/ws` からは巨大なミラーを作らせられる）。INPUT フレームに背圧が無く、pane が stdin を読まないと PTY の書き込みキューが増え続ける（`pane control` でパイプから流し込むのが容易になった） (needs: 20260926-pane-observe-control)（出典: .aidev/works/20260926-pane-observe-control/decisions.md D6・D13・review.md ラウンド 1）
  → 着地: 20260927-server-size-input-limits（feature/server-size-input-limits）。大きさ: `@sodashitsu/protocol` の `packages/protocol/src/terminalLimits.ts`（1 辺 4096・`cols×rows` 1,000,000 セル・`client.view` の visible 4096 件。herdr のクライアントの画面の上限と同じ）を `ClientViewParams`・`PaneAttachParams`・`PaneAttachResizeParams` のスキーマが見て、外は `invalid_params`（ハンドラに届かず pane の大きさは変わらない）。ブラウザ（`packages/web/src/term/measure.ts`）と `sodactl pane attach` は `clampTerminalSize` で丸めて送る。入力: pane ごとに、まだ PTY へ書けていない入力（node-pty の内部の待ち〔`NodePtyProcess` が渡した長さを覚えて O(1) で出す `SentLengths`〕・引き継いだ PTY の待ち・`TerminalHost` の後回しの待ち）を「バイト数＋件数×256」で数え、16 MiB を超える INPUT は丸ごと捨てて送った接続へ `client.error`（`input_queue_full`・paneId）を同じ pane について 2 秒に 1 回知らせる（`packages/server/src/terminal/TerminalHost.ts` `writeInput`・`packages/server/src/ws/WsGateway.ts` `inputDropped`。背圧で接続の読み取りを止めない——同じ接続の他の pane・RPC、中継の他のチャネルまで止まるため。herdr も捨てる）。`agent prompt`/`send-keys`/`start` は `input_queue_full` で失敗。ミラーの問い合わせへの応答は捨てない。`sodactl pane control` は stderr に出す。中継の先は同じ `WsGateway` で判定。実測: `pnpm -s test` 5023 passed・負の確認 51 通り全て検出・smoke pass（8 本）・実物の node-pty の raw の読まない子で待ちが残り量が測れることを 1 回の書き込みで確認（決定と壊れる具体例は decisions D2〜D11）。
- [ ] サーバ側の上限の残り: (1) node-pty の `EAGAIN` の書き直しが `setImmediate` の輪で、読まない raw モードの pane に待ちが 1 バイトでもあると CPU を 1 コア近く使い続ける（実測 1 秒に user 278ms＋sys 543ms）。子の終了後に待ちの残りを書き直して `EBADF`（fd の番号が再利用されていれば別のファイルに書く恐れ）——fd の寿命と競合しない自前の書き手（`AdoptedPtyProcess` と同じ 5ms の待ち）へ替える。(2) Windows（ConPTY）の待ちの量・件数（`inSocket` の内部）を実機で確かめる。ready の前の `_deferreds` は数えない・writev の束を 1 件と数える。(3) `sodactl pane attach` は `input_queue_full` の知らせを表示しない（直結の画面に割り込ませない表示の場所を決める）。`pane input`・`pane run` は捨てられても `{"ok":true}`（ack の無い送信）。(4) 名前（workspace・tab・group・pane の label）と `cwd`/`path` の文字列の長さに上限が無い（`/ws` の 1 通 4 MiB まで。保存され全クライアントへ配られる）。(5) 本当の背圧（クレジット方式。`pane control` の流し込みを読む側の速さに合わせる）。(6) 上限の無い古い版の `soda serve` を中継の先にすると効かない。(7) ミラー・kitty の問い合わせへの応答は上限の外（問い合わせを出し続けて読まないプログラムで積まれる）。pane の数の上限。`AdoptedPtyProcess` の kill と書き込みの戻りの行き違いで `queuedBytes` が負になりうる（今は害が無い） (needs: 20260927-server-size-input-limits)（出典: .aidev/works/20260927-server-size-input-limits/decisions.md D5・D8・D10・D11・research.md F9・F14・F18・F22・review.md ラウンド 1・2）
- [ ] pane 直結の残り: 直結中のサーバ側のスクロール（herdr はホイール・PageUp/PageDown で遡れる）・ブラウザでの直結中の表示（`pane.attach_changed` を使って「sodactl が直結中」の印）とブラウザからの奪取・切り離し・`agent attach <name>`（エージェントの名前による対象指定が要る） (needs: 20260926-pane-direct-connect)（出典: .aidev/works/20260926-pane-direct-connect/requirements.md「対象外」）
- [ ] `sodactl pane attach` の小さな穴: (1) SIGHUP で端末が既に無いとき、戻しの書き込みの失敗が次の tick に 'error' で出るのに同じ tick の `setRawMode(false)` で受け手を外すので、受け手の無い 'error' で落ちうる（`packages/cli/src/commands/attach.ts` の `processTerminal`）。(2) 問い合わせの取り除きが列の途中の ESC・CSI の中の C0（`ESC ESC [6n`・`ESC [6 BS n`・`ESC ( ESC [c`）を扱わず素通りする（`packages/cli/src/attachOutput.ts`）。(3) 本物の端末エミュレータ・Windows/macOS の端末・本物のエージェントを直結して切り離した後の状態（kitty keyboard 等を戻さない）を確かめる (needs: 20260926-pane-direct-connect)（出典: .aidev/works/20260926-pane-direct-connect/review.md ラウンド 2・test-result.md「未検証の穴」）
- [ ] キーバインドでの workspace 並べ替え（AC8: move_workspace_previous/next）は flat な隣接1件だけを入れ替える実装のため、手動グループの非アンカーメンバーを動かすと、隣が別グループ/無所属の workspace の場合に画面上は何も変化しないことがある（20260923-workspace-grouping レビューで発見。D&D 側は同レビューで修正済み。キーバインド側は workspace.move の delta 方式を anchor 方式へ変えるプロトコル改修が要るため今回は見送り）。（出典: .aidev/works/20260923-workspace-grouping/review.md）
- [x] クリップボード画像のリモート貼り付け: herdr は `remote_image_paste`（既定 Ctrl+V、`herdr --remote` 使用時だけ有効）でクライアントの画像クリップボードをリモートのペインへ貼り付けられるが、当時の本製品にはこれに相当する実装が無い（`packages/web/src/term/clipboard.ts` はテキストの readText/writeText のみ、画像用の navigator.clipboard.read()・ClipboardItem・サーバー側の画像アップロード経路とも未実装）。サーバーとブラウザが別マシンの構成（WSL2 のようにOSクリップボードが共有される環境を除く、純粋なリモート接続）では、pane 内のプロセスがクライアント側の画像クリップボードに触れる手段が無い。（出典: .aidev/works/20260923-workspace-grouping/review.md）
  → 着地: 20260927-clipboard-image-paste（feature/clipboard-image-paste）。herdr と同じく**サーバ（pane のマシン）に画像を置いてパスを pane へ貼る**方式。操作 `remote_image_paste`（既定 `ctrl+v`・節「キー」で変える・外せる。画像が無い・読めないときは `\x16` を送り、確かめている間のキーはその後に届く。`packages/web/src/keys/bindings.ts`・`KeyInputController.ts`）・画像だけの paste イベント（`packages/web/src/term/TerminalRegistry.ts`）・`Ctrl+Shift+V`／メニュー（テキストが無いとき）。画像は `/ws` の RPC `pane.image.begin`/`chunk`/`commit`/`cancel` で 768 KiB ずつ（`packages/protocol/src/image.ts`・`messages.ts`。`/ws?machine=` の中継越しも同じ）、サーバは種類と先頭のバイト・16 MiB・pane の有無を確かめ `<状態ディレクトリ>/clipboard-images/`（0700）に推測できない名前・`wx`・0600 で書き、24 時間・100 個・256 MiB を書くたび・起動時・1 時間ごとに消す（`packages/server/src/image/ImageStore.ts`）。同時（接続 1・全体 4）・頻度（直近 60 秒に 20/60）・30 秒・合計 5 分の上限（`ImageUploads.ts`）。ブラウザは返ったパスを `isPastablePath` で確かめ bracketed paste の状態で貼る（`packages/web/src/term/ImagePaster.ts`）。キーから読むのは Chromium の secure context だけ（Firefox・Safari は読む度に「ペースト」のメニューが出るため）。実測: `pnpm -s test` 5127 passed（main 取り込み後）・負の確認 36 通り全て検出・smoke pass。
- [ ] クリップボード画像の残り: 画像ファイルのドラッグ＆ドロップで送る（herdr はファイルのドロップも送る）・独自コマンドの popup の端末への画像の貼り付け（herdr は popup も対象）・`sodactl` から画像を送るコマンド（RPC `pane.image.*` は既にある） (needs: 20260927-clipboard-image-paste)（出典: .aidev/works/20260927-clipboard-image-paste/requirements.md「対象外」）
- [ ] クリップボード画像の実機確認: 実物の Chromium・Firefox・Safari・スマートフォンのクリップボード・許可の画面・paste イベントと、本物の Claude Code・Codex での添付（`[Image #N]`）、Windows ネイティブのサーバの置き場所の権限・空白を含むパス、実物の SSH を越えた中継を `docs/verification.md`「共通：クリップボードの画像の貼り付け」の手順で確かめる (needs: 20260927-clipboard-image-paste)（出典: .aidev/works/20260927-clipboard-image-paste/test-result.md「未検証の穴」）
- [x] 複数クライアントで同じtabを見ているとき、片方のD&Dによる pane 分割解除（pane.replace）でドロップ先が閉じられると、そのpaneへローカルでfocusしていた別クライアントの focus 復帰先が想定とずれる: viewRepair.ts のフォールバック規則（閉じたpaneの代わりはレイアウト木の最初の葉。SessionModel.closePaneの規則をそのまま写したもの）は、SessionModel.replacePaneの「後継は必ずドラッグした pane 自身」という規則を知らない（pane.closed/layout.updated イベントに推奨後継のヒントが無いため、クライアント側では区別できない）。20260924-pane-dnd-split-move の cross-check で発見。直すには protocol（イベントへの後継ヒント追加）とviewRepair.ts双方の変更が要る。（出典: .aidev/works/20260924-pane-dnd-split-move/review.md）
  → 着地: 20260925-pane-replace-focus-hint（feature/pane-replace-focus-hint）。
  `PaneClosedEvent.data` に任意の `successorPaneId` を追加し、`replacePane` だけが生存した
  pane（ドラッグした pane）を埋めて発行する。`closePane`/`closeTab`/`closeWorkspace` は
  発行しない（既存の DFS-first-leaf のまま）。`viewRepair.ts` はヒントがあれば最優先で採用し、
  `StoreAdapter.ts` が `pane.closed` からヒントを取り出して使い捨てで渡す。protocol→server→
  web の3層にまたがる変更のため research 工程を実施。coding 中に taskcheck が
  `exactOptionalPropertyTypes` による型エラーと、`toEqual({ successorPaneId: undefined })`
  が「キー不在」と「値が undefined」を区別できない無効な回帰テストを発見（`Object.hasOwn`
  ベースへ是正）。`StoreAdapter.test.ts` に元のバグ（decisions.md D5）を end-to-end で
  再現する回帰テストを追加。review は5観点とも findings 0。
  実測: server 829 本・ルート一括 3003 本・smoke pass・`aidev coverage --strict` gaps=0。
- [x] レイアウトだけを書き換える pane 操作（swapPaneWith/moveToEdge/replacePane/moveToTab/moveToNewTab）はセッション全体のグローバル focus（this.focus）を更新しない: ローカル保存 view の無い新規クライアントが直後に再接続すると、移動先ではなく元の focus が指す pane へ復元されうる（20260924-pane-move-cross-tab decisions.md D4）
  → 着地: 20260925-pane-move-global-focus（feature/pane-move-global-focus）。5操作全ての
  成功パス末尾に `this.setFocus(workspaceId, tabId, paneId)`（動かした pane が新しい
  グローバル focus 先）を追加。design 段階の調査で backlog の想定より実態が複雑だと判明——
  `moveToNewTab` は既に主経路で `setFocus` を呼んでいたが、移動元 tab の自動クローズ
  （`closeEmptyTabShell`）内の「救済」ロジックが無条件にそれを上書きする別のバグがあった。
  `moveToTab`/`moveToNewTab` は `setFocus` の呼び出しを `closeEmptyTabShell` の**後**に
  置くことでこれも解消（decisions.md D3 がこの上書きバグをそのまま再現）。
  `closeEmptyTabShell` の救済ロジック自体（無関係な workspace の focus まで巻き込みうる、
  より広い既存の潜在的不具合）はスコープ外とし、backlog 新項目（下記）へ送った（D0）。
  review は5観点とも must 0 件（nit 1件を修正）。
  実測: server 824 本・ルート一括 2991 本・smoke pass・`aidev coverage --strict` gaps=0。
- [ ] worktree 削除の確認ダイアログの openWorkspaceId は開いた瞬間のスナップショットで確定まで再評価されない: 複数クライアントが同じ repo を開いている状況で、確認ダイアログが開いている間に別クライアントがその path を新しく workspace として開くと、確定時にサーバはその workspace を黙って閉じる（AC4/US2 が求める確認が効かない狭い競合）。design が『一覧の即時同期は作らない』と決めた既存のトレードオフの範囲内（20260924-worktree-remove review.md round1）
- [x] worktree の削除で lock 済み（git worktree lock）の対象は classifyWorktreeRemoveError のどの分岐にもマッチせず worktree_failed に落ちる: --force 単体では削除できず（-f -f が要る）、利用者は汎用メッセージのまま行き詰まる（20260924-worktree-remove review.md round1。実機確認: fatal: cannot remove a locked working tree; use 'remove -f -f' to override or unlock first）
  → 着地: 20260925-worktree-remove-locked（feature/worktree-remove-locked）。
  `classifyWorktreeRemoveError` に専用のエラーコード `worktree_locked` を追加し（`worktree_failed`
  から切り出す）、`remove()` の `--force` を2回渡す（`-f -f`）実装に変更。web 側は既存の dirty
  worktree の `--force` 確認フロー（`confirmWorktreeRemoveForce`）に `reason: "dirty" | "locked"`
  を足して合流させ、ロック専用のメッセージ（「この worktree はロックされています。ロックを
  解除せずに強制的に削除しますか？」）を出す。ロック済みかつ dirty でも常にロックのエラーが
  優先されることを実機確認済み（`git worktree lock` した本物の worktree でテスト）。taskcheck
  T2 round1・T6 round1 で計2件の should 指摘（負の確認の記録の粒度・見せかけのキーボード
  テスト）を発見・修正。review は5観点とも findings 0。
  実測: server 811 本・ルート一括 2974 本・smoke pass・`aidev coverage --strict` gaps=0。
- [ ] `SessionModel.closeEmptyTabShell` の「救済」ロジック（自動的に閉じた tab が所属
  workspace の `activeTabId` だったら、新しい active tab へ `this.focus` を書き換える）は、
  `this.focus` が実際にその workspace/tab を指していたかどうかに関わらず無条件に発火する:
  無関係な workspace の `this.focus` まで巻き込んで上書きしうる（例: workspace A の
  `this.focus` とは無関係な pane P に固定されている状態で、workspace B の
  `moveToTab`/`moveToNewTab` が B の active tab を空にして自動的に閉じると、B 側の救済が
  `this.focus` を B の新しい active tab へ書き換えてしまい、A の pane P を指していたはずの
  `this.focus` が失われる）。修正するには「`this.focus` が実際に閉じた tab を指していた
  ときだけ救済する」という条件を足す必要があるが、影響範囲の見積もりに別の調査が要るため
  見送った（20260925-pane-move-global-focus decisions.md D0）。（出典:
  .aidev/works/20260925-pane-move-global-focus/decisions.md）
- [ ] 消えたフォルダにいる pane の場所を「分からない」として扱う: Linux の監視は `/proc/<pid>/cwd` の readlink をそのまま `Pane.cwd` に入れるので、外で消されたフォルダ（消した worktree 等）にシェルがいると `"/path (deleted)"` が入る（`packages/server/src/platform/LinuxProcessInspector.ts:65`・`:120`）。新しく開く場所に加え、20260926-workspace-label-follow-cwd からは workspace の自動の名前にも `xxx (deleted)` が出うる。末尾の ` (deleted)` を読めなかったものとして扱う（出典: .aidev/works/20260926-workspace-label-follow-cwd/review.md）
- [ ] 空になった後の作り直し・起動時の最初の workspace でも、作った直後に git の情報を取る: `workspace.create` の RPC だけが `pollWorkspaceNow` を呼ぶ（`packages/server/src/surface/methods/workspace.ts:17-21`）ので、`SessionService.recreateIfEmpty`・`ensureNotEmpty` が作った workspace は次の周期（最長 5 秒）までサイドバーの git の情報が空で、左上の pane の `cd` にもバスで気づかない（周期で拾う）（出典: .aidev/works/20260926-workspace-label-follow-cwd/review.md）
- [ ] ダイアログを開いたまま 4401 でログイン画面へ切り替わると、戻ったあと view.openDialog が残ったまま showModal されず、KeyRouter が dialog モードのままキーを食う: SettingsDialog.vue（:105-124 の dialogContext の watch に immediate が無い）ほか既存のダイアログ。はじめの案内（OnboardingDialog.vue）は 20260926-settings-onboarding で immediate にして直した。onAuthRequired で closeDialog するか、各ダイアログの watch を immediate にするかを決める（出典: .aidev/works/20260926-settings-onboarding/review.md）
- [ ] packages/cli/src/main.integration.test.ts の captureStdout() の restore() が finally に無い: it が時間切れになると stdout の差し替えが残り、後続の it（login など）が連鎖して落ちる（20260926-load-flaky-tests の test-result post2C-6 の連鎖の原因）（出典: .aidev/works/20260926-load-flaky-tests/review.md）
- [ ] packages/cli/src/attach.integration.test.ts:86 の eslint no-control-regex エラー（/\x1b\[.../）で pnpm lint が赤になる（HEAD から）（出典: .aidev/works/20260926-load-flaky-tests/review.md）
- [ ] 端末版（`soda` 引数なし）の実機の確かめ: Windows ネイティブ（ConPTY・Windows Terminal の入力・WMI での裏の起動・`rundll32` のリンク・PowerShell の画像の読み取り・`%LOCALAPPDATA%` の ACL）・WSL2 の Windows Terminal・VS Code の統合端末・SSH 越し（AC4・AC16）・外側の端末ごとの通知・Kitty graphics・OSC 52 の表示・vim/htop/Claude Code の見た目（出典: .aidev/works/20260927-cli-mode/test-result.md の未検証の穴・decisions D21。手順は docs/verification.md の「端末版」）
- [ ] 端末版の残り: 裏で起動した `soda serve` の環境の `WSL_INTEROP`（最初の端末の socket が残る。落とした場合の影響の確かめ）・共有の設定の移行の印がオリジンごと（既定の session は `--state-dir` を替えても同じオリジン。サーバの識別子を hello に持たせる案）・高負荷のマシンでの大量出力の最中の打鍵の p95（bench (d) で 75 ms）（出典: .aidev/works/20260927-cli-mode/decisions.md D22・06-docs-verify/test-result.md）
- [ ] Windows の pane の場所の追従（20260928-windows-pane-cwd）の実機の確かめ: PowerShell 5.1・7・cmd での `cd` の追従・再起動後の復元・oh-my-posh/starship の見た目と失敗の表示・OS の ConPTY（`SODA_WINDOWS_CONPTY=system`）・起動の遅れ（手順は docs/verification.md の Windows の節）。あわせて UNC の場所の知らせの既知の危険（decisions D4）の対策の要否
- [ ] `packages/tui/src/image/image.test.ts` の「出し直しは同期の更新の中へ…」が高負荷（load average 24）で `expected -1 to be greater than 0` で落ちた（単独では通る。時刻の依存の疑い）（出典: .aidev/works/20260928-windows-pane-cwd/test-result.md）
