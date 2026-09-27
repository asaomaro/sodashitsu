# テスト結果（20260927-custom-command-keys）

## 判定

**合格**。全体の vitest・build・typecheck・起動確認（smoke）が通り、足した判定を 1 つずつ壊した負の確認（29 件）はすべてテストが落ちた（壊した後は `cmp` で元のファイルと一致を確認）。

## 実行したもの（単発の実行のみ。E2E・負荷の試験は走らせていない——利用者の方針）

| 項目 | コマンド | 結果 |
|---|---|---|
| build | `pnpm -s build`（出力をファイルへ、終了コードを別に確認） | exit 0 |
| typecheck | `pnpm -s typecheck` | exit 0 |
| 全体のテスト | `pnpm -s test` | exit 0・**244 files / 4,658 tests passed**（失敗 0・skip の表示なし）。再実行は無し |
| 起動確認 | `aidev smoke` | pass（exit 0・7 本） |

```
 Test Files  244 passed (244)
      Tests  4658 passed (4658)
   Duration  209.09s (tests 47%, environment 27%, import 14%, transform 12%, worker 1%)
```

（負の確認で足した `commandKeys.test.ts` の 2 本は全体の実行の後に足したもの。そのファイルは単独で 17 passed。）

## 起動確認（`aidev smoke` の生出力の抜粋。全文は worktree の `scratchpad/smoke.log`）

新しい入口（`commands.json` の読み込み・`command.*`・popup の端末）は、1 本目の smoke（`dist/smoke.js`）に足した（decisions.md D8）。

```
{"ts":"2026-09-27T06:06:40.293Z","level":"info","msg":"custom commands loaded","file":"/tmp/wtm-smoke-YzXWYq/commands.json","count":1}
smoke: echo round trip ok
{"ts":"2026-09-27T06:06:42.013Z","level":"info","msg":"custom command run","commandId":"smoke-cat","type":"popup","clientId":"abf7d3a0-ed57-4e42-8baa-c198923e38d2","paneId":"p2"}
smoke: custom command popup round trip ok
smoke: PASS
...
stop-smoke: ok
smoke: pass (exit 0, 7 本)
```

## 受け入れ基準ごとの検証

| AC | 検証（テスト） |
|---|---|
| AC1 | `commandConfig.test.ts`（例の読み込み・ENOENT・0600）、`CommandService.test.ts`（一覧に文字列が無い）、`composeServer.commands.integration.test.ts`（状態ディレクトリのファイル・名前付き session のファイル）、smoke |
| AC2 | `commandConfig.test.ts`（24 通りの規則外・理由に秘密を入れない・JSON の断片・UTF-8）、`CommandService.test.ts`（読み直しで前の一覧を捨てる）、結合（`command.reload` で理由） |
| AC3 | `commandConfig.test.ts`（リンク・ディレクトリ・FIFO・別のユーザー・0620/0602/0666/0622・Windows は検査しない） |
| AC4 | `CommandService.test.ts`（popup の端末の大きさ・argv）、`popupSize.test.ts`、`CommandPopup.test.ts`（枠・`command.run` の大きさ・購読・入力）、結合（実 PTY で入力と出力の往復）、smoke |
| AC5 | `CommandService.test.ts`（終わり・閉じる・切断・停止）、`command.test.ts`（持ち主）、`WsGateway.integration.test.ts`（切断の知らせ）、結合（切断・`close()` で止まる・終了コードの知らせ） |
| AC6 | `CommandService.test.ts`（`command_popup_open`・`command_failed`・`command_not_found`）、`CommandPopup.test.ts`・`ActionDispatcher.test.ts`（トースト） |
| AC7 | `commandLaunch.test.ts`（実物の裏の起動）、`CommandService.test.ts`（上限・数の戻し）、`ActionDispatcher.test.ts`、結合（実シェルでファイルが書かれる） |
| AC8 | `SessionService.test.ts`（分割・拡大表示・焦点・戻し・失敗）、`ActionDispatcher.test.ts`（焦点・入力の溜め置き） |
| AC9 | `commands.test.ts`（protocol。余分な項目の除去・id の規則）、`command.test.ts`（方式）、`CommandService.test.ts`（argv は設定の文字列）。認証は既存の `/ws` の upgrade（この work で変えていない） |
| AC10 | `paneEnv.test.ts`、`SessionService.test.ts`（`commandEnv`）、`CommandService.test.ts`（環境・作業場所の代替）、結合（実シェルで `WTM_COMMAND_ID`・`WTM_ACTIVE_PANE_ID`・`WTM_PANE_ID` 無し） |
| AC11 | `commandLaunch.test.ts`（linux・darwin・win32・ComSpec の有無）。Windows の実機は未検証（下） |
| AC12 | `KeySettings.test.ts`（群・追加・変更・削除・衝突の両向き・こちらへ移す・フォーカス・絞り込み・0 件の案内）、`commandKeys.test.ts`・`settings.test.ts`（保存） |
| AC13 | `commandKeys.test.ts`（一覧に無いものは載らない・保存は残る・`constructor`）、`settings.test.ts`（一覧の変化で表が作り直される）、`ActionDispatcher.test.ts` |
| AC14 | `HelpDialog.test.ts` |
| AC15 | `ActionDispatcher.test.ts`（`command.reload`・問題のトースト）、`StoreAdapter.test.ts`（`command.updated`）、`CommandService.test.ts`・結合 |
| AC16 | docs（`docs/custom-commands.md`・`herdr-parity.md` H12/H26・`verification.md`）。backlog は deliver |
| AC-I1〜AC-I5 | `CommandPopup.test.ts`（開く・閉じた知らせ・閉じるボタン・終了コード・Esc で閉じない・キーとホイールが外へ漏れない・フォーカスの行き先・応答より先の知らせ・切断・別のダイアログへの差し替え）、`CommandPopupSession.test.ts` |

## 負の確認（regression-negative-control）

足した判定を 1 か所ずつ壊し、対応するテストファイルだけを 1 回走らせた（`scratchpad/negctl/run.py`・`m18.py`。壊す前に写しを取り、走らせた後に写しで戻して `filecmp`（`cmp` 相当・バイト単位）で一致を確認）。
**全 29 件で落ち、全件 `restored_cmp=ok`**。途中で落ちなかった W4（プリセットの作り直しで独自コマンドの一覧を落とす）はテストが捕まえていなかったので、
2 つ目のおすすめのキーと重なる形にテストを書き直し、planReset 側（W4b）のテストも足してから再度壊して落ちることを確かめた。

| ID | 壊した箇所 | 結果 |
|---|---|---|
| M1 | `commandConfig.ts` `O_NOFOLLOW` を外す | 1 failed |
| M2 | 同 グループ・その他の書き込みの検査 | 4 failed |
| M3 | 同 持ち主の uid の検査 | 1 failed |
| M4 | 同 通常のファイルかの検査 | 2 failed |
| M5 | 同 制御文字の範囲（タブを許す） | 1 failed |
| M6 | 同 知らない項目の名前を伏せる | 1 failed |
| M7 | 同 `toCommandInfo` に `command` を入れる | 1 failed |
| M8 | `CommandService.ts` 待った後の定義の引き直し | 2 failed |
| M9 | 同 `popupSize` の持ち主の確認 | 1 failed |
| M10 | 同 切断で popup を止める | 1 failed |
| M11 | 同 popup の環境に `WTM_PANE_ID` を入れる | 1 failed |
| M12 | 同 裏の実行の上限（`>=`→`>`） | 1 failed |
| M13 | `subscribe.ts` 購読の持ち主（接続の id を使わない） | 1 failed |
| M14 | `SessionService.ts` `closePane` で pane 種の戻し方を見ない | 2 failed |
| M15 | 同 閉じたときの記録の削除 | 1 failed |
| M16 | `paneEnv.ts` 古い `WTM_ACTIVE_PANE_ID` を落とす | 2 failed |
| M17 | `WsGateway.ts` 切断の知らせ | 1 failed |
| M18 | `composeServer.ts` 切断の配線と停止時の `dispose` の両方 | 2 failed |
| W1 | `keymap.ts` `Object.hasOwn`（`constructor`） | 1 failed |
| W2 | 同 独自コマンドの登録 | 6 failed |
| W3 | `keyPrefs.ts` 足すときの保存の上限 | 1 failed |
| W4 | `assign.ts` `applyRecommended` の作り直しで一覧を落とす | 1 failed（テストを直した後） |
| W4b | 同 `planReset` の作り直しで一覧を落とす | 1 failed |
| W5 | `CommandPopupSession.ts` 応答待ちの間に閉じた後の `popup_close` | 1 failed |
| W6 | `CommandPopup.vue` キー・ホイールを外へ漏らさない | 1 failed |
| W7 | 同 別のダイアログへ差し替わったときの後始末 | 1 failed |
| W8 | `ActionDispatcher.ts` pane 種の入力の溜め置きの解放 | 1 failed |
| W9 | `KeySettings.vue` 案内と絞り込み | 1 failed |
| W10 | `StoreAdapter.ts` `command.updated` | 1 failed |

### 生の出力（各ログの落ちたテスト名・最初のアサーション・件数。全文は `scratchpad/negctl/<ID>.log`）

```
== M1
     × シンボリックリンクは採らない（リンク先が正しいファイルでも） 
 FAIL  |@wtm/server| src/commands/commandConfig.test.ts > loadCommandsFile（AC1・AC3） > シンボリックリンクは採らない（リンク先が正しいファイルでも）
AssertionError: expected [ { id: 'a', type: 'shell', …(1) } ] to deeply equal []
      Tests  1 failed | 44 passed (45)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
== M2
     × グループかその他が書ける（400）なら採らない 
     × グループかその他が書ける（386）なら採らない 
AssertionError: expected [ { id: 'a', type: 'shell', …(1) } ] to deeply equal []
      Tests  4 failed | 41 passed (45)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯
== M3
     × 別のユーザーの持ち物は採らない 
 FAIL  |@wtm/server| src/commands/commandConfig.test.ts > loadCommandsFile（AC1・AC3） > 別のユーザーの持ち物は採らない
AssertionError: expected [ { id: 'a', type: 'shell', …(1) } ] to deeply equal []
      Tests  1 failed | 44 passed (45)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
== M4
     × ディレクトリ（通常のファイルでない）は採らない 
     × FIFO でも止まらずに断る 
AssertionError: expected 'commands.json: 読めません（EISDIR）' to match /通常のファイルではありません/
      Tests  2 failed | 43 passed (45)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
== M5
     × コマンドにタブ → 全体を採らず、理由を出す 
 FAIL  |@wtm/server| src/commands/commandConfig.test.ts > parseCommandsJson（20260927-custom-command-keys の AC1・AC2） > コマンドにタブ → 全体を採らず、理由を出す
AssertionError: expected [ { id: 'a', type: 'shell', …(1) } ] to deeply equal []
      Tests  1 failed | 44 passed (45)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
== M6
     × JSON として読めない文の断片（秘密）も理由に入れない・知らない項目の名前は安全な形だけ出す 
 FAIL  |@wtm/server| src/commands/commandConfig.test.ts > parseCommandsJson（20260927-custom-command-keys の AC1・AC2） > JSON として読めない文の断片（秘密）も理由に入れない・知らない項目の名前は安全な形だけ出す
AssertionError: expected 'commands.json: commands[0]: 知らない項目です（…' to be 'commands.json: commands[0]: 知らない項目です（…' // Object.is equality
      Tests  1 failed | 44 passed (45)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
== M7
     × 3 種類の例を読み、ブラウザへの形では command が落ちる 
 FAIL  |@wtm/server| src/commands/commandConfig.test.ts > parseCommandsJson（20260927-custom-command-keys の AC1・AC2） > 3 種類の例を読み、ブラウザへの形では command が落ちる
AssertionError: expected [ { id: 'lazygit', …(5) }, …(2) ] to deeply equal [ { id: 'lazygit', …(4) }, …(2) ]
      Tests  1 failed | 44 passed (45)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
== M8
     × 作業場所を確かめている間に読み直されて定義が消えたら、捨てた定義を走らせない 
     × 待つ間に書き換わったら、新しい定義の文字列で走る 
AssertionError: promise resolved "{ type: 'shell' }" instead of rejecting
      Tests  2 failed | 24 passed (26)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
== M9
     × 持ち主でない接続は閉じられず、購読の大きさも見えない（not_found） 
 FAIL  |@wtm/server| src/commands/CommandService.test.ts > CommandService — popup の終わり（AC5・AC-I1） > 持ち主でない接続は閉じられず、購読の大きさも見えない（not_found）
AssertionError: expected { cols: 80, rows: 24 } to be undefined
      Tests  1 failed | 25 passed (26)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
== M10
     × 持ち主の接続が切れたら止める。ほかの接続の popup は残す 
 FAIL  |@wtm/server| src/commands/CommandService.test.ts > CommandService — popup の終わり（AC5・AC-I1） > 持ち主の接続が切れたら止める。ほかの接続の popup は残す
AssertionError: expected [] to deeply equal [ 'p100' ]
      Tests  1 failed | 25 passed (26)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
== M11
     × popup：モデルに入れない端末を大きさどおりに作り、WTM_PANE_ID を入れない。文字列は設定のまま 
 FAIL  |@wtm/server| src/commands/CommandService.test.ts > CommandService — run（AC4〜AC11） > popup：モデルに入れない端末を大きさどおりに作り、WTM_PANE_ID を入れない。文字列は設定のまま
AssertionError: expected 'p1' to be undefined
      Tests  1 failed | 25 passed (26)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
== M12
     × shell：上限に達したら command_busy。終われば（成功でも失敗でも）数が戻る 
 FAIL  |@wtm/server| src/commands/CommandService.test.ts > CommandService — run（AC4〜AC11） > shell：上限に達したら command_busy。終われば（成功でも失敗でも）数が戻る
AssertionError: promise resolved "{ type: 'shell' }" instead of rejecting
      Tests  1 failed | 25 passed (26)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
== M13
     × pane.subscribe は popup を持ち主の接続にだけ許し、大きさは popup の値 
 FAIL  |@wtm/server| src/surface/methods/command.test.ts > command.* の方式（20260927-custom-command-keys） > pane.subscribe は popup を持ち主の接続にだけ許し、大きさは popup の値
AssertionError: expected { ok: true, …(1) } to match object { ok: false, …(1) }
      Tests  1 failed | 4 passed (5)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
== M14
     × コマンドが終わると pane が閉じ、焦点は対象へ・拡大表示は開く前（対象が拡大表示なら対象）へ戻る 
     × 利用者が閉じても戻る。閉じ方によらず戻し方の記録は消える（残さない） 
AssertionError: expected 'p1' to be 'p2' // Object.is equality
      Tests  2 failed | 150 passed (152)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
== M15
     × 利用者が閉じても戻る。閉じ方によらず戻し方の記録は消える（残さない） 
 FAIL  |@wtm/server| src/session/SessionService.test.ts > SessionService — 独自コマンドの pane 種・文脈・環境（20260927-custom-command-keys の AC8・AC10） > 利用者が閉じても戻る。閉じ方によらず戻し方の記録は消える（残さない）
AssertionError: expected 1 to be +0 // Object.is equality
      Tests  1 failed | 151 passed (152)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
== M16
     × extra を足し、受け継いだ古い WTM_ACTIVE_*・WTM_COMMAND_ID・wtmctl の設定は落とす 
     × extra が無ければ今までと同じ（古い WTM_ACTIVE_* は普通の pane にも渡さない） 
AssertionError: expected { PATH: '/usr/bin', …(3) } to deeply equal { PATH: '/usr/bin', …(2) }
      Tests  2 failed | 9 passed (11)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
== M17
     × 接続が閉じたら onClientGone をその接続の id で 1 度呼ぶ（その接続の popup を止めるため） 
 FAIL  |@wtm/server| src/ws/WsGateway.integration.test.ts > WsGateway — 接続の終わりの知らせ（20260927-custom-command-keys） > 接続が閉じたら onClientGone をその接続の id で 1 度呼ぶ（その接続の popup を止めるため）
AssertionError: expected [] to deeply equal [ Array(1) ]
      Tests  1 failed | 16 passed (17)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
== M18
     × commands.json が一覧になり（文字列は載らない）、popup の端末へ購読・入力が届き、接続を切ると止まる（AC1・AC4・AC5） 
     × サーバを止めると、つながったままの接続の popup も止まる（AC5） 
AssertionError: expected DefaultTerminalHost{ …(19) } to be undefined
      Tests  2 failed | 4 passed (6)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
== W1
     × constructor という id のコマンドでも、割り当てが無ければ表を作れる（継いだ性質を割り当てと取り違えない） 
 FAIL  |@wtm/web| src/keys/commandKeys.test.ts > 点検で足した場面（T7 の独立点検） > constructor という id のコマンドでも、割り当てが無ければ表を作れる（継いだ性質を割り当てと取り違えない）
TypeError: list is not iterable
      Tests  1 failed | 15 passed (16)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
== W2
     × 一覧にあるコマンドの割り当てを runCommand として表に載せ、名前と割り当てを引ける 
     × 一覧に無いコマンドの割り当ては載らず、他の操作を塞がない（保存は残る） 
AssertionError: expected undefined to deeply equal { type: 'runCommand', …(1) }
      Tests  6 failed | 10 passed (16)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 6 ⎯⎯⎯⎯⎯⎯⎯
== W3
     × 保存しておく数の上限は足すときも効く（既にあるものの差し替え・削除は通す） 
 FAIL  |@wtm/web| src/keys/commandKeys.test.ts > 点検で足した場面（T7 の独立点検） > 保存しておく数の上限は足すときも効く（既にあるものの差し替え・削除は通す）
AssertionError: expected { prefix: null, bindings: {}, …(2) } to be { prefix: null, bindings: {}, …(2) } // Object.is equality
      Tests  1 failed | 16 passed (17)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
== W4
     × プリセットを足すとき、コマンドが持っているキーは足さない（1 つ足した後に作り直した表でも見える） 
 FAIL  |@wtm/web| src/keys/commandKeys.test.ts > 取り込み・戻し（AC12） > プリセットを足すとき、コマンドが持っているキーは足さない（1 つ足した後に作り直した表でも見える）
AssertionError: expected [] to include 'ctrl+alt+j'
      Tests  1 failed | 16 passed (17)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
== W4b
     × 操作を既定へ戻すとき、既定のキーをコマンドが使っていれば戻さず、その名前を理由に出す 
 FAIL  |@wtm/web| src/keys/commandKeys.test.ts > 取り込み・戻し（AC12） > 操作を既定へ戻すとき、既定のキーをコマンドが使っていれば戻さず、その名前を理由に出す
AssertionError: expected [] to deeply equal [ { binding: 'prefix+v', …(1) } ]
      Tests  1 failed | 16 passed (17)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
== W5
     × 応答を待つ間に閉じられたら、後から来た成功の応答は表示せず popup_close を送る（サーバに残さない） 
 FAIL  |@wtm/web| src/term/CommandPopupSession.test.ts > CommandPopupSession（20260927-custom-command-keys の AC4・AC-I1〜AC-I3） > 応答を待つ間に閉じられたら、後から来た成功の応答は表示せず popup_close を送る（サーバに残さない）
AssertionError: expected { ok: true, popupId: 'p9' } to deeply equal { ok: false, abandoned: true }
      Tests  1 failed | 4 passed (5)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
== W6
     × キー（Esc・prefix を含む）とホイールは枠の外へ漏れず、Esc では閉じない（AC-I2・AC-I5） 
 FAIL  |@wtm/web| src/components/CommandPopup.test.ts > CommandPopup（20260927-custom-command-keys の AC4・AC5・AC-I1〜AC-I5） > キー（Esc・prefix を含む）とホイールは枠の外へ漏れず、Esc では閉じない（AC-I2・AC-I5）
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
      Tests  1 failed | 12 passed (13)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
== W7
     × 開いている間に別のダイアログへ差し替わったら、コマンドを止めて後始末し、フォーカスは奪わない（cross の点検） 
 FAIL  |@wtm/web| src/components/CommandPopup.test.ts > CommandPopup（20260927-custom-command-keys の AC4・AC5・AC-I1〜AC-I5） > 開いている間に別のダイアログへ差し替わったら、コマンドを止めて後始末し、フォーカスは奪わない（cross の点検）
AssertionError: expected [ 'pane.subscribe', …(1) ] to deeply equal [ 'command.popup_close', …(1) ]
      Tests  1 failed | 12 passed (13)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
== W8
     × pane：応答を待つ間に打った文字は新しい pane へ届き、失敗・応答の時点で閉じていれば元の pane へ（D99。editScrollback と同じ） 
 FAIL  |@wtm/web| src/actions/ActionDispatcher.test.ts > ActionDispatcher — 独自コマンド（20260927-custom-command-keys） > pane：応答を待つ間に打った文字は新しい pane へ届き、失敗・応答の時点で閉じていれば元の pane へ（D99。editScrollback と同じ）
AssertionError: expected "vi.fn()" to be called with arguments: [ 'p2', 'q' ]
      Tests  1 failed | 160 passed (161)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
== W9
     × 一覧が 0 件なら群の代わりに置き場所の案内、読めなかった理由があればそれも出す 
 FAIL  |@wtm/web| src/components/KeySettings.test.ts > KeySettings — 独自コマンド（AC12） > 一覧が 0 件なら群の代わりに置き場所の案内、読めなかった理由があればそれも出す
AssertionError: expected <div data-v-916cdd3a …(3)>…(3)</div> to be null
      Tests  1 failed | 97 passed (98)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
== W10
     × command.updated は独自コマンドの一覧を置き換え、command.popup_closed は閉じた控えに残す（20260927-custom-command-keys の AC15） 
 FAIL  |@wtm/web| src/store/StoreAdapter.test.ts > StoreAdapter > command.updated は独自コマンドの一覧を置き換え、command.popup_closed は閉じた控えに残す（20260927-custom-command-keys の AC15）
AssertionError: expected [] to deeply equal [ { id: 'git', type: 'popup' } ]
      Tests  1 failed | 30 passed (31)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
```

## 未検証の穴

- **E2E（playwright）は走らせていない**（利用者の方針）。popup の見た目・実物のブラウザでのキーの流れ（Esc・Tab・prefix が実際に popup の xterm に届くか、
  ブラウザの既定の動作に取られないか）は happy-dom の単体テストと smoke の生の WebSocket でしか確かめていない。`docs/verification.md` に手動確認の項目を足した。
- **Windows ネイティブの起動**（`%ComSpec% /d /s /c "<command>"`、node-pty が argv を引用し直す場合の popup・pane 種）は実機で確かめていない（decisions.md D6）。
- macOS は確かめていない（`commandLaunch.test.ts` の実物のテストは `pwd -P`・`realpath` で macOS でも通るように書いたが、走らせたのは Linux だけ）。
- 停止時の `commands.dispose()`（`finally`）だけの経路は単体では確かめていない（decisions.md D7。M18 で切断の配線と両方を壊すと落ちる）。

## 差し戻し後（review ラウンド 1 の must：Windows の PTY の引用）

`ptyArgs`（Windows の PTY には 1 本のコマンドライン）を足した。負の確認（`run.py R1 R1b R1c`）:

```
== R1
     × Unix は配列のまま、Windows は 1 本の文字列にする 
     × node-pty が作る Windows のコマンドラインは cmd.exe /d /s /c "<command>" のまま（中の引用符を書き換えない） 
AssertionError: expected [ '/d', '/s', '/c', '"dir"' ] to be '/d /s /c "dir"' // Object.is equality
      Tests  2 failed | 7 passed (9)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
== R1b
     × Windows：popup・pane 種は PTY へ 1 本のコマンドライン（/d /s /c "<command>"）で渡す（review ラウンド 1） 
AssertionError: expected { shell: 'C:\cmd.exe', …(2) } to match object { shell: 'C:\cmd.exe', …(1) }
      Tests  1 failed | 26 passed (27)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
R1c: exit=1 1 failed | 26 passed (27) restored_cmp=ok
```

### 差し戻し後の再実行（セッションの再起動の後。`pnpm install --frozen-lockfile` からやり直した）

| 項目 | 結果 |
|---|---|
| `pnpm -s build` | exit 0 |
| `pnpm -s typecheck` | exit 0 |
| `pnpm -s test` | exit 0・**244 files / 4,662 tests passed**（+4 は差し戻しで足した Windows の PTY の引数のテスト） |
| `aidev smoke` | pass（7 本。`smoke: custom command popup round trip ok` を含む） |

```
 Test Files  244 passed (244)
      Tests  4662 passed (4662)
```
