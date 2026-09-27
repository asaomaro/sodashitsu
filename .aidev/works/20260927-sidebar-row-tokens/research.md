# 調査: サイドバー行の独自トークンと、行の並び・色の条件付け

発火条件: `protocol.md`「4.5」の「利用者が操作する部品を作る」（並びの編集＝一覧・並べ替え・入れ子の詳細）。decisions D1。
記述は変更前（main 97affb8）のスナップショット。

## 調査の問い

- Q1: herdr の独自トークンの報告の意味（整え方・上限・検査の順・seq・期限）は正確に何か。
- Q2: herdr の行の並び・見た目・条件の意味（値の有無・行の消え方・条件の当たり方・数の読み方・色の書式）は正確に何か。
- Q3: 今のサイドバーの行は何をどの条件で描いているか（既定を変えないための基準）。
- Q4: サーバで値を持ち・配る経路（RPC の登録・model・イベント・snapshot・保存・閉じたとき）はどうなっているか。
- Q5: `wtmctl` の引数の解釈と、`--token` の衝突。
- Q6: 設定の保存（`wtm.prefs.v1`）・ほかのウィンドウへの追従・設定画面の既存の一覧編集の部品はどうなっているか。
- Q7: UI の確立したパターン（開く・確定・取り消し・キーボード・フォーカス）は何か。本製品の既存の部品はどれに従っているか。
- Q8: 設定画面の上のキーは prefix・直接のキーへ漏れないか。

## 判明した事実

### Q1 独自トークンの報告（herdr 一次資料）

- F1: 上限の定数: TTL 1〜86_400_000ms、source 80 文字、1 回の報告のキー 16、対象ごとのキー 32、キー名 32 文字、値 80 文字
  （`herdr/src/app/api_helpers.rs:202-209`）。seq 付きの source は対象ごと 32（`src/metadata_tokens.rs:15` `MAX_SEQUENCE_SOURCES`）。
- F2: source は trim して、空・80 文字超・`[A-Za-z0-9:._-]` 以外で拒否（`api_helpers.rs:211-227` `normalize_metadata_source`、code `invalid_metadata_source`）。
- F3: キーは空・32 バイト超・`[A-Za-z0-9_-]` 以外で拒否。値は `trim` → 制御文字（Rust `char::is_control`＝Unicode Cc）を除く → 先頭 80 文字 → もう一度 trim、空なら消去（`None`）
  （`api_helpers.rs:244-280` `normalize_metadata_tokens`・テスト `token_normalization_sanitizes_values_and_turns_empty_into_clear`）。報告にキーが 1 つも無ければ
  `missing token to set or clear`、17 キー以上で拒否（code `invalid_metadata_token`）。
- F4: 検査の順: 対象の存在 → source → ttl → tokens → seq が新しいか（古ければ **成功を返して何もしない**）→ 反映後のキー数（32 超で `metadata_token_limit`）
  → seq の受け付け（新しい source が 33 個目なら `metadata_sequence_source_limit`）→ 反映 → 変わったときだけ配る（`src/app/api/workspaces.rs:241-300`
  `handle_workspace_report_metadata`）。
- F5: seq は source ごとに「最後に受け付けた値より大きい」ときだけ新しい。source の枠は消去・期限で戻らない（`metadata_tokens.rs:17-41`、
  docs `cli-reference.mdx:329`）。seq の無い報告は常に新しい。
- F6: 反映（`patch`）: 値ありは `{value, expires_at}` を上書き（同じなら変化なし）、値なしは削除。期限はその報告で設定したキーにだけ付く
  （`metadata_tokens.rs:44-66`・テスト `ttl_only_changes_keys_in_the_patch`）。期限切れの掃除は締め切り `<= now` のものを消す（`expire_at`）。
- F7: CLI の `NAME=VALUE` は最初の `=` で分け、名前が空なら拒否（`src/cli.rs:58-66`）。`--seq`・`--ttl-ms` は u64 として読めなければ誤り（`src/cli.rs:935-939`）。
  トークンは HashMap に入れるので同じキーは後が勝つ（`src/cli/workspace.rs:167-186`）。
- F8: pane の報告には `--title`・`--display-agent`・`--state-label` 等もあり、`--agent`・`--applies-to-source` はそれらだけを守る（トークンは守らない。
  docs `cli-reference.mdx:321-323`）。

### Q2 行の並び・見た目・条件（herdr 一次資料）

- F9: 既定: agents `[["state_icon","machine","workspace","tab"],["agent"]]`、spaces `[["state_icon","workspace"],["branch","git_status"]]`。行 16・1 行のトークン 16 まで
  （docs `configuration.mdx:355-372`・`src/config/sidebar.rs:11-12`）。
- F10: 値の有無: spaces の `branch` はブランチがあれば、`git_status` は ahead/behind のどちらかが 0 でないとき、`workspace`・`state_icon`・`state_text` は常に。agents の
  `tab`・`pane`・`agent`・`terminal_title` は値があるとき、`workspace` は常に。`$name` は報告された値があるとき。トークンが 1 つも無い行は消える
  （`src/ui/sidebar/tokens.rs:66-178`）。
- F11: 条件は `equals`・`contains`・`starts_with`・`gt`・`lt` のどれか 1 つ（2 つ以上・0 は拒否）。`ignore_case` は文字の条件だけ（数の条件に付けると拒否）。数の閾値は有限。
  `state_icon`・`git_status` に条件を付けると拒否。条件は 16 まで（`src/config/sidebar/rules.rs:55-110`・`sidebar.rs:195-219`）。
- F12: 当たり方: 先頭から見て最初に当たった条件で決まる。`hide = true` ならそのトークンを消す。それ以外は条件の `fg`/`bold`/`dim` を、指定したものだけ
  トークンの見た目に重ねる。当たらなければトークンの見た目（`rules.rs:176-193` `matching_style`）。`ignore_case` は ASCII だけ畳む（`É` と `é` は別。
  `rules.rs` のテスト `string_conditions_use_exact_case_or_ascii_folding`）。空の `contains`・`starts_with` は何にでも当たる（docs `configuration.mdx:438`）。
- F13: 数の読み方: 値を Rust の `f64::parse`（前後の空白・単位を許さない、`1e3`・`.5` は読める）で読み、有限のときだけ比べる。`gt` は厳密に大きい、`lt` は厳密に小さい
  （`rules.rs:158-170`）。
- F14: 色は `#` の後に 16 進 3 桁か 6 桁だけ（`sidebar.rs:64-98`）。`bold`・`dim` は省略＝その場の既定、`false` は既定の修飾を外す（docs `configuration.mdx:397`）。
- F15: 区切り: 状態の印の後と `git_status` の前は空白 1 つ、ほかは ` · `（`tokens.rs:180-189` `separator`）。畳んだサイドバー・モバイルには並びを使わない
  （docs `configuration.mdx:484`）。

### Q3 今のサイドバー（本製品）

- F16: spaces の workspace 行: 1 行目 `.sidebar-row-line1` に［グループの頭なら開閉ボタン］・`StateIcon.sidebar-state-icon`（`row.workspace` があるとき）・
  `span.sidebar-label`（畳んでいないとき。workspace 名か手動グループの名前）。2 行目 `.sidebar-row-line2` は畳んでおらず `showGit`（git があり ahead か behind が 0 でない）
  のときだけで、`<span>{branch}</span>`（branch が null なら空の span）と `span.sidebar-git-counts`（`↑a ↓b`）（`Sidebar.vue:433-457`・`:69-74` `rowStateFor`）。
- F17: agents 行: 1 行目に `StateIcon`・畳んでいなければ `span.sidebar-label`（workspace 名。無ければ空）・`span.sidebar-label`（tab 名）。2 行目（畳んでいないとき）に
  `span.sidebar-agent-name`（付けた名前があるとき）・`<span>{agent.label}</span>`・`span.sidebar-unverified`「未検証」（`!verified` のとき）（`Sidebar.vue:482-495`）。
- F18: 見た目: 2 行目は `font-size: 0.85em`・字下げ、子の span は既定で `opacity: 0.75`、`.sidebar-agent-name` と `.sidebar-unverified` は 1（`Sidebar.vue:595-623`）。
  `.sidebar-unverified` は警告色（`--wtm-warn-fg`）。
- F19: 状態の語は `stateLabel`（入力待ち・作業中・完了・待機中・状態不明。エージェントが居ないと null）（`packages/web/src/store/stateIndicator.ts:34-50`）。
  workspace 行の状態は pane の状態を `aggregate` したもの、agents 行は `displayStateFor`（`Sidebar.vue:70-73`・`:145`）。
- F20: 既存のテスト `Sidebar.test.ts`（1133 行）は 1 行目・2 行目のクラス・文字・2 行目の出る条件を見ている（`:78-117`・`:247-254`・`:500-530`）。

### Q4 サーバの経路（本製品）

- F21: RPC は `surface.register(名, { schema, handler })` で登録し、schema は protocol の zod（`packages/server/src/surface/methods/workspace.ts:25-33`、
  `packages/protocol/src/messages.ts:514`・`:574` の `METHOD_SCHEMAS`・`MethodResultMap`）。ハンドラの `RpcError(code, message)` はそのままエラーの code に、
  `NotFoundError` は `not_found` になる（`packages/server/src/surface/ControlSurface.ts:43-45`）。WebSocket は認証済みの接続だけ（既存の全 RPC と同じ口）。
- F22: model は変更のたびに新しいオブジェクトへ置き換える（`{...ws, label}` を `Map.set`。`SessionModel.ts:232-237` `renameWorkspace`・`:698-703` `renamePane`）。
  snapshot は model の一覧をそのまま返す（`SessionModel.ts:884-896` `buildSnapshot`）。
- F23: `session.json` への書き出しは項目を名指しで写す（`composeServer.ts:535-573` `toSessionFileData`）——model に項目を足しても保存には混ざらない。
- F24: イベントは `bus.publish` で購読者へ同期で配られる（`packages/server/src/bus/EventBus.ts:7-17`）。workspace・pane の変化は `workspace.updated`・`pane.updated`
  で配り（`SessionService.ts:432` 等）、閉じたときは `workspace.closed`・`pane.closed`（`packages/protocol/src/events.ts`）。ブラウザは `workspace.updated`・
  `pane.updated` をオブジェクトごと置き換える（`packages/web/src/store/StoreAdapter.ts:95-97`・`:120-123`）。
- F25: 部品の組み立てと終了は `composeServer.ts:223-250`（`registerAllMethods` に `MethodDeps` を渡す）・`:474-510`（`close()`）。単調な時計は
  `monotonicNow()`＝`performance.now()`（`packages/server/src/log/LogThrottle.ts:55-57`）。

### Q5 wtmctl

- F26: 引数は `parseFlags(rest, {bools, values, multi})`。`multi` は繰り返しを配列で持つ。値の直後が `--` で始まると「値が無い」（`packages/cli/src/cliArgs.ts:120-160`）。
- F27: `--url`・`--token` は全コマンド共通（`cliArgs.ts:178-189` `globalOptsFrom`）。接続の token は `randomBytes(TOKEN_BYTES).toString("base64url")`
  （`packages/server/src/auth/AuthService.ts:127`）で `=` を含まない。
- F28: 誤りの終了コード: 使い方の誤り 2、RPC の失敗は `{"error":{code,message}}` を stderr に出して 1（`packages/cli/src/output.ts:55-66`）。RPC の結果は
  `printJson` でそのまま出す（`commands/workspace.ts:44-49`）。
- F29: `USAGE_LINES` と skill ファイルの食い違いはテストが見る（`packages/cli/src/skill.test.ts`）。skill ファイルはビルドの成果物からも `cmp` で比べる
  （`.aidev/config.yml` の smoke 4 本目）。

### Q6 設定の保存と既存の一覧編集

- F30: 設定は `wtm.prefs.v1` を `readPrefs`/`writePrefs` だけで読み書きし、読み込みは値ごとに落とす（`packages/web/src/store/settings.ts:1-200`）。まとまりを丸ごと書く
  設定（`keys`・`themeOverrides`）は `storage` イベントで追従する（`settings.ts:399-418`）。tab バー右端の一覧は「正規化 → 状態と保存の両方が同じなら何もしない」
  （`settings.ts:228-238` `setTabBarRight`）。
- F31: 一覧の編集の既存の部品: tab バー右端（`SettingsDialog.vue:760-825`。［上へ］［下へ］［削除］、種類を選んで［追加］、上限で［追加］を無効化、文字は
  `@change` と Enter で確定）。削除後のフォーカスは「繰り上がった行の［削除］、無ければ［追加］」（`SettingsDialog.vue:243-253` `removeTabBarRightEntry`、
  `KeySettings.vue:324-338` `removeBinding` と同じ考え方）。
- F32: 取り消せない一括の戻しは、その場に出る確認（［戻す］［やめる］、Esc で確認だけ閉じる、閉じたら元のボタンへフォーカス）（`SettingsDialog.vue:472-490`・`:656-680`）。
- F33: 色の入力は文字の入力欄で、Enter か `change` で確定し、規則外なら保存せず理由を出す（`SettingsDialog.vue:434-460` `commitOverride`）。

### Q7 UI の確立したパターン

- F34: WAI-ARIA APG「Disclosure (Show/Hide)」: ボタン（または `details`/`summary`）で開閉し、`aria-expanded` で状態を伝える。Enter・Space で開閉、フォーカスはボタンに残る。
- F35: WAI-ARIA APG「Listbox」の「Rearrangeable」例: 並べ替えは選んだ項目に対する「上へ／下へ」のボタン（またはキー）で行い、移動後も項目の選択を保つ。
  macOS の「システム設定」のリスト編集（＋／−のボタン）、VS Code の設定の配列の編集（項目ごとの編集・削除、末尾の［項目の追加］）も、項目ごとのボタンと末尾の追加で行う。
- F36: 3 つとも「選んだ時点で反映」か「項目ごとの確定」で、全体の［保存］を持たない。削除後のフォーカスは、APG の Listbox 例では「次の項目（無ければ前）」、本製品の
  既存の部品（F31）は「繰り上がった項目の［削除］、無ければ［追加］」。

### Q8 キーの漏れ

- F37: ダイアログが開いている間、window の keydown は何もしない（`packages/web/src/main.ts:281-285`）。`KeyRouter` はダイアログのモードで全キーを消費する
  （`main.ts:268-273`）。Esc はネイティブの `cancel` で設定画面を閉じる（`SettingsDialog.vue:511-515` `onNativeCancel`）。

## 影響範囲

- protocol: `model.ts`（`Workspace.tokens`・`Pane.tokens`）・`messages.ts`（2 つの RPC）。
- server: 新しい独自トークンの帳簿（期限のタイマー・閉じたときの破棄）、`SessionService`/`SessionModel`（値の反映と配布）、`surface/methods`（登録）、`composeServer`（組み立て・終了）。
- cli: `cliArgs.ts`・`commands/workspace.ts`・`commands/pane.ts`・`main.ts`・skill ファイル・smoke。
- web: `Sidebar.vue`（描画）、設定の保存（`settings.ts`）、設定画面（`SettingsDialog.vue` と新しい部品）、並びの解決（新しい純関数）。
- docs: `herdr-parity.md`・`wtmctl.md`。

## 実現性 / リスク

- 実現性: いずれも既存の仕組みの延長で実現できる（新しい依存は要らない）。
- リスク R1: 描画を並びの経路へ移すと、既定の見た目が細部（空の span・クラス・2 行目の出る条件）で変わりうる——既存の `Sidebar.test.ts` と、変更前の描画との比較で守る。
- リスク R2: 外から来た値の描画の安全。Vue のテキストの差し込み（`{{ }}`）は文字として扱う（HTML にしない）。`v-html`・`:style` への生の値の差し込みを避ける
  （色は検証済みの `#RGB`/`#RRGGBB` だけを `style` に入れる）。
- リスク R3: 期限のタイマーがテスト・終了の邪魔をする——`unref` と `close()` での解除。

## 実装アンカー

- A1: workspace の RPC の登録（`packages/server/src/surface/methods/workspace.ts:12`）・pane は `surface/methods/pane.ts`。
- A2: 方式の表（`packages/protocol/src/messages.ts:505-620`）。model（`packages/protocol/src/model.ts:32-95`）。
- A3: model の置き換え（`packages/server/src/session/SessionModel.ts:232`・`:698`・`:838`）。配布（`SessionService.ts:432` の `bus.publish`）。
- A4: 組み立てと終了（`packages/server/src/composeServer.ts:223-250`・`:474-510`）。
- A5: CLI の解釈（`packages/cli/src/cliArgs.ts:17-44` `USAGE_LINES`・`:262-282` `parseWorkspace`・`:300-382` `parsePane`）。実行（`packages/cli/src/main.ts:60-100`）。
- A6: サイドバーの行（`packages/web/src/components/Sidebar.vue:69-120`・`:138-153`・`:433-495`）。
- A7: 設定の保存（`packages/web/src/store/settings.ts:153-200`・`:399-435`）、設定画面の節「表示」（`SettingsDialog.vue:684-827`）。
- A8: smoke の CLI（`packages/cli/src/smoke.ts`、未読——coding で既存の流れを読んでから足す）。

## 実装時の注意

- `exactOptionalPropertyTypes` が効いている（`commands/workspace.ts:23` の注記）——任意の項目は `undefined` を入れず、キーごと付けない。
- model のオブジェクトは置き換えで更新する（F22）。独自トークンの値も、変わったときは新しいオブジェクト（と新しい `tokens`）にする。
- `prettier --write` は新しいファイルか HEAD で整形済みのファイルだけ（利用者の記憶）。`Sidebar.vue`・`SettingsDialog.vue` が整形済みかは coding で確かめる。
- `pnpm -s` は失敗しても何も出さないことがある——終了コードで判定する。

## design への申し送り

- 独自のトークン（`git`・`name`・`unverified`）で既定の並びを書き、既定も利用者の並びも同じ描画の経路にする（decisions D3）。区切りは CSS の間隔のまま。
- 設定画面の部品は既存の tab バー右端の編集（F31）と同じ形（項目ごとの［上へ］［下へ］［削除］と末尾の［追加］、選んだ時点で保存）に揃える。見た目と条件は
  トークンごとの開閉（F34。`aria-expanded` のボタン）。［既定に戻す］は F32 の確認。削除後のフォーカスは F31 の規則。
- 独自トークンの帳簿は純粋な部分（整え方・検査・反映・期限）と、時計・タイマー・配布の部分を分けて、前者を単体テストで網羅する。
