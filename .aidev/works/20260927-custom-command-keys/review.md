# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [nit][conv:-] packages/protocol/src/commands.test.ts `CommandRunParams` の cols・rows の境界の内側（2・500）を受け付けるテストが無い / 対応: 修正済（T1・ラウンド1）
- [should][conv:-] packages/server/src/commands/commandConfig.test.ts 秘密を理由に入れないテストが「JSON として読めない」経路を含まない / 対応: 修正済（T2・ラウンド1）
- [should][conv:-] packages/server/src/commands/commandConfig.ts `unrecognized_keys` のキー名を制御文字・長さを見ずに理由へ入れていた / 対応: 修正済（項目名らしい形だけ出す。T2・ラウンド1）
- [nit][conv:-] packages/server/src/commands/commandConfig.ts prettier 未整形（点検の時点） / 対応: 修正済（T2・ラウンド1）
- [nit][conv:-] packages/server/src/commands/commandConfig.ts 不正な UTF-8 を U+FFFD に置き換えて採る・BOM を断る / 対応: 修正済（fatal の TextDecoder。T2・ラウンド1）
- [nit][conv:-] packages/server/src/commands/commandConfig.ts 1 回の read で短い読みに弱い / 対応: 修正済（繰り返して読む。T2・ラウンド1）
- [nit][conv:-] packages/server/src/commands/commandConfig.test.ts 使っていない書き出しの行 / 対応: 修正済（T2・ラウンド1）
- [should][conv:-] packages/server/src/commands/commandLaunch.ts Windows の `/d /c <command>` は cmd.exe の引用符の規則で壊れうる / 対応: 修正済（Node の `shell: true` と同じ `/d /s /c "<command>"`。D6。T3・ラウンド1）
- [should][conv:-] packages/server/src/commands/commandLaunch.test.ts 実物を起動するテストに win32 の skip が無い / 対応: 修正済（T3・ラウンド1）
- [should][conv:-] packages/server/src/commands/commandLaunch.test.ts macOS で `pwd` が物理パスになり落ちる / 対応: 修正済（`pwd -P` と `realpath`。T3・ラウンド1）
- [nit][conv:-] packages/server/src/commands/commandLaunch.ts `once("error")` で 2 度目の error が投げられうる / 対応: 修正済（T3・ラウンド1）
- [nit][conv:-] packages/server/src/commands/commandLaunch.test.ts onDone の回数・spawn の指定・空の argv・darwin の `-lc` のテストが無い / 対応: 修正済（T3・ラウンド1）
- [should][conv:-] packages/server/src/session/SessionService.test.ts 「閉じた後は記録が残らない」テストが記録の削除を確かめていない（id は再利用されない） / 対応: 修正済（記録の数を直接見る・tab ごと閉じる経路も。T4・ラウンド1）
- [nit][conv:-] packages/server/src/session/SessionService.ts `commandPanes` が引き継ぎの対象外であることの注記が無い / 対応: 修正済（注記。T4・ラウンド1）
- [should][conv:-] packages/server/src/commands/CommandService.ts `run` が作業場所を確かめて待つ間の読み直しで捨てた定義を走らせうる / 対応: 修正済（待った後に一覧で引き直す・テスト 2 本。T5・ラウンド1）
- [should][conv:-] packages/server/src/commands/CommandService.test.ts 切断・停止の知らせ、途中で接続が消えた場合、モバイルのテストが無い / 対応: 修正済（T5・ラウンド1）
- [nit][conv:-] packages/server/src/commands/CommandService.ts `reload` の失敗・警告の分岐のテストが無い / 対応: 修正済（T5・ラウンド1）
- [nit][conv:-] packages/server/src/commands/CommandService.ts 重なった読み直しで古い内容が上書きしうる / 対応: 修正済（最後に始めたものだけ採る。T5・ラウンド1）
- [should][conv:-] packages/server/src/composeServer.commands.integration.test.ts テストがプロセス全体の環境変数（OUT）を書き換える / 対応: 修正済（出力先をコマンドに書く。T6・ラウンド1）
- [should][conv:-] packages/server/src/composeServer.ts 停止時の popup の後始末のテストが無い / 対応: 修正済（つながったまま `close()` するテスト。通常の停止では `closeAll` → `onClientGone` でも止まるので、`finally` だけの経路は確かめられない——D7。T6・ラウンド1）
- [nit][conv:-] packages/server/src/composeServer.ts 足した import が handoff の import の間に入っていた / 対応: 修正済（T6・ラウンド1）
- [must][conv:-] packages/web/src/keys/keymap.ts id の規則が `constructor` を通すので、割り当ての無いときに `{}` の継いだ性質を割り当てと取り違えて表を作れなくなる / 対応: 修正済（`Object.hasOwn`。T7・ラウンド1）
- [should][conv:-] packages/web/src/keys/keyPrefs.ts 保存の数の上限が読み込みでしか効かない / 対応: 修正済（足すときも効かせる。T7・ラウンド1）
- [nit][conv:-] packages/web/src/keys/commandKeys.test.ts 一覧に無い id の名前の出し方のテストが無い / 対応: 修正済（T7・ラウンド1）
- [nit][conv:-] packages/web/src/keys/assign.ts `labelOf` の包みが要らない / 対応: 修正済（`km.labelOf` を直接。T7・ラウンド1）
- [should][conv:-] packages/web/src/store/settings.test.ts 一覧が変わると keymap が作り直されることを store をつないで確かめていない / 対応: 修正済（T8・ラウンド1）
- [should][conv:-] packages/web/src/actions/ActionDispatcher.ts `refreshCommands` のテストが無い / 対応: 修正済（T10 のテストで。T8・ラウンド1）
- [should][conv:-] packages/web/src/net/clientError.ts 文言に reload_config の既定のキーを直書き（割り当てを変えた利用者に違うキーを案内する） / 対応: 修正済（キーを書かない。設定画面の案内は表から引く。T8・ラウンド1）
- [nit][conv:-] design.md store/commands の `closedPopups` の記述が実装（内部の Map と closedSeq）とずれ / 対応: 修正済（design を実装に合わせた。T8・ラウンド1）
- [nit][conv:-] packages/web/src/store/commands.test.ts 控えの上限の境目を確かめていない / 対応: 修正済（T8・ラウンド1）
- [should][conv:-] packages/web/src/components/KeySettings.vue 独自コマンドの案内が絞り込みを無視して見出しを残す / 対応: 修正済（T9・ラウンド1）
- [should][conv:-] packages/web/src/components/KeySettings.test.ts コマンドの行のフォーカスの行き先のテストが無い / 対応: 修正済（T9・ラウンド1）
- [should][conv:-] packages/web/src/components/KeySettings.test.ts コマンドが衝突の持ち主になる向きのテストが無い / 対応: 修正済（T9・ラウンド1）
- [nit][conv:-] design.md 0 件の案内の文言が実装（表から引いたキー）とずれ / 対応: 修正済（design を実装に合わせた。T9・ラウンド1）
- [nit][conv:-] packages/web/src/components/HelpDialog.test.ts 割り当ての並びを両方許していた / 対応: 修正済（T9・ラウンド1）
- [should][conv:-] packages/web/src/actions/ActionDispatcher.ts `commandErrorMessage` が worktree の JSDoc と本体の間に入っていた / 対応: 修正済（T10・ラウンド1）
- [should][conv:regression-negative-control] packages/web/src/actions/ActionDispatcher.test.ts pane 種の入力の溜め置き（D99）のテストが無い / 対応: 修正済（成功・失敗・閉じていた場合。T10・ラウンド1）
- [nit][conv:-] packages/web/src/actions/ActionDispatcher.test.ts 読み直しの失敗・code の無い失敗・popup の高さのテストが無い / 対応: 修正済（T10・ラウンド1）
- [should][conv:-] packages/web/src/components/CommandPopup.vue 横の枠の幅の見込み（16px）が CSS（18px）と合わず最後の列が欠ける / 対応: 修正済（T11・ラウンド1）
- [should][conv:-] packages/web/src/components/CommandPopup.vue popup の xterm が pane の端末と同じ前提（`windowsPty`・Unicode 11）でない / 対応: 修正済（`TerminalRegistry.baseTerminalOptions`・Unicode11Addon。T11・ラウンド1）
- [nit][conv:-] design.md 背景が覆う範囲（pane の領域）が実装（窓全体）とずれ / 対応: 修正済（design を実装に合わせた。T11・ラウンド1）
- [nit][conv:-] packages/web/src/components/CommandPopup.vue 応答の後にモジュール変数の session を使い、先に閉じられていると null / 対応: 修正済（ローカル変数。T11・ラウンド1）
- [nit][conv:-] packages/web/src/components/CommandPopup.vue 見出しの mousedown でフォーカスが端末から外れる / 対応: 修正済（端末以外は preventDefault。T11・ラウンド1）
- [nit][conv:-] packages/web/src/components/CommandPopup.test.ts unmount の経路・組み立ての不足の経路のテストが無い / 対応: 修正済（unmount はテスト、組み立ての不足は知らせて閉じるように。T11・ラウンド1）
- [should][conv:-] docs/verification.md 手動確認が docs/custom-commands.md の例に無い `touch /tmp/wtm-cmd-ok` を指していた / 対応: 修正済（例に `touch-ok` を足した。T12・ラウンド1）
- [nit][conv:-] docs/custom-commands.md 環境の説明に `WTM_AGENT_REPORT_SOCKET` が抜け / 対応: 修正済（T12・ラウンド1）
- [nit][conv:-] docs/custom-commands.md 「ログには id と種類だけ」が実装（接続・pane も出す）と違う / 対応: 修正済（T12・ラウンド1）
- [should][conv:-] packages/web/src/components/CommandPopup.vue 開いている間に応答待ちの別のダイアログ（worktree・session の一覧）へ差し替わると、popup のコマンドとサーバの記録が見えないまま残る（次の popup が断られる） / 対応: 修正済（差し替わったら止めて後始末。cross）
- [nit][conv:-] packages/web/src/term/popupSize.ts popup の大きさの範囲（2〜500）を protocol と別に持っていた / 対応: 修正済（protocol の定数を共有。cross）

## ラウンド 1（2026-09-27）
- [must][conv:-] packages/server/src/commands/commandLaunch.ts:29 Windows で popup・pane 種の argv（`"<command>"` を要素に持つ配列）を node-pty に渡すと `argsToCommandLine` が中の `"` を `\"` に書き換え、`cmd.exe /d /s /c \"lazygit\"` になって起動できない（node-pty 1.2.0-beta.15 の `windowsPtyAgent.js:278-318` で確定。D6 の「未検証」ではなく確定の不具合） / 対応: 差し戻し
- [nit][conv:-] packages/web/src/components/CommandPopup.vue:22 冒頭のコメントが背景の範囲（pane の領域）を実装（窓全体）と違って書いている / 対応: 差し戻しで一緒に直す

## ラウンド 2（2026-09-27）
ラウンド 1 の 2 件（Windows の PTY の引用・CommandPopup.vue のコメント）の解消と、その修正の差分だけを見た。指摘なし（`args` の型の拡張の波及も無し）。
