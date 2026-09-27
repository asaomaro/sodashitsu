# テスト結果: 複数ホストの集約（保存した SSH のマシン）

負荷試験・E2E（Playwright）は行っていない（共有マシン。ユーザーの指示）。単体・結合（vitest）と起動確認（smoke）だけ。

## 実行したもの

- `pnpm -s build` — exit 0
- `pnpm -s typecheck` — exit 0（`pnpm -s` は失敗でも無出力なので終了コードで判定）
- `pnpm -s test`（全体・vitest の全 project） — review ラウンド 1 の修正の後: 4804 passed / 1 failed（258 files）。落ちた 1 件は `composeServer.handoff.integration.test.ts` の「受け渡しに載らなかった PTY の master …」で `listen EADDRINUSE: address already in use 127.0.0.1:39570`（空きポートの取り合い。今回の変更と無関係）。単独で 1 回だけ再実行して 5/5 pass。取り込み直後（修正の前）の全体は 4800 passed / 0 failed / 0 skipped
- `aidev smoke`（`.aidev/config.yml` の 8 本。8 本目が新しい `node packages/server/dist/machineSmoke.js`） — exit 0（8 本 pass）

この work で足した主なテスト（すべて全体の実行に含まれる）:
- server: `machine/bridgeFrames.test.ts`・`BridgeEndpoint.test.ts`・`BridgeEndpoint.integration.test.ts`（実物の composeServer と bridge.sock）・`bridgeCommand.test.ts`・
  `MachineCatalog.test.ts`・`MachineLink.test.ts`・`MachineManager.test.ts`・`MachineRelay.test.ts`・`machineCommands.test.ts`・
  `machines.integration.test.ts`（2 つの実物の composeServer を偽の ssh で繋ぐ）
- protocol: `messages.test.ts`（`machine.list`）
- cli: `cliArgs.machine.test.ts`・`wsClient.test.ts`（404/503）・`withSession.test.ts`（machine の受け渡し）
- web: `net/Connection.retarget.test.ts`・`store/machineScope.test.ts`・`store/machines.test.ts`・`actions/MachineSwitcher.test.ts`・`actions/MachineWiring.test.ts`・
  `components/Sidebar.machines.test.ts`・`notify/NotificationController.test.ts`・`term/TerminalRegistry.test.ts`・`actions/ActionDispatcher.test.ts` の追加分

## 受け入れ基準ごとの判定

- AC1: pass — `machineCommands.test.ts`（確かめてから保存・失敗は保存せず 1・規則違反は ConfigError＝2・確かめの間の重複は保存しない）、smoke の `wtm machine add`（偽の ssh 越しに実物の `wtm bridge` で確かめて保存）。
- AC2: pass — `machineCommands.test.ts`（list テキスト/JSON・rename/enable/disable/remove・知らない id・名前では指さない・ssh を起こさない）。
- AC3: pass — `MachineCatalog.test.ts`（0600・原子的・知らない項目/パスワード/`-`/空白/制御文字/大きすぎ/台数/重複 id の拒否・境界）、`MachineManager.test.ts`（壊れた登録簿は接続を保ち警告は 1 回）。
- AC4: pass — `BridgeEndpoint.integration.test.ts`（0600・目印と HELLO・チャネルが client.hello に答える・一時ディレクトリを残さない）、`bridgeCommand.test.ts`（素通し・動いていなければ 3）、smoke。
- AC5: pass — `MachineLink.test.ts`（引数の配列・HELLO で online）、`MachineManager.test.ts`（反映の規則・名前だけは繋ぎ直さない・stop で閉じて待つ）、`machines.integration.test.ts`（登録簿の変化が 3 秒以内に machine.changed で届く）。
- AC6: pass — `machines.integration.test.ts`（名前・id で中継・hello/作成/入出力・401/400/404/503・local）、`MachineRelay.test.ts`、`machineSelectorOf` の単体。
- AC7: pass — `machines.integration.test.ts`（machine.list・machine.changed）、`messages.test.ts`。
- AC8: pass — `Sidebar.machines.test.ts`（まとまりの順・見出しの状態・選んでいるマシンは今までの行・ほかは要約の行と状態の印）、`machines.test.ts`（要約のイベント）。
- AC9: pass — `MachineSwitcher.test.ts`（順序・後勝ち・見出しは記憶を消す）、`machineScope.test.ts`（表示の記憶と既読の分け方・衝突する w1/t1 を持ち込まない）、`TerminalRegistry.test.ts`（disposeAll）、`NotificationController.test.ts`（reset）、`Connection.retarget.test.ts`、`machines.test.ts`（external・購読なし）。
- AC10: pass — `MachineManager.test.ts`（1 秒から倍々・最大 2 分・60 秒の規則・attention は 2 分）、`MachineLink.test.ts`（分類・PING 15 秒・45 秒で切る）、`machines.integration.test.ts`（リモートの停止で要対応「動いていません」）。
- AC11: pass — `Sidebar.machines.test.ts`（切れたマシンは薄く aria-disabled・押しても切り替わらない）、`MachineWiring.test.ts`（消えたらローカルへ）、`machines.integration.test.ts`（1 台が切れても手元は使える）。
- AC12: pass — `MachineLink.test.ts`（`--`・固定のコマンド・宛先と session の検証）、`bridgeFrames.test.ts`（型・長さ・向き・目印）、`BridgeEndpoint.test.ts`（64 本）。
- AC13: pass — `cliArgs.machine.test.ts`・`wsClient.test.ts`・`withSession.test.ts`。
- AC14: pass — `MachineRelay.test.ts`（背圧: 4MiB で ssh を読むのを止め 1MiB で再開・15 秒／80MiB でその接続だけ 1013・ブラウザ → リモートの 8MiB）、`MachineLink.test.ts`（holdReading）、`bridgeFrames.test.ts`（4MiB/64MiB）。
- AC15: pass — `MachineManager.test.ts`（無い・空・全台無効で ssh を起こさない）、`machines.integration.test.ts`（登録簿なしで ssh 0 回・404）、`Sidebar.machines.test.ts`（見出し無し）、`MachineWiring.test.ts`（軽い接続なし）、既存のテストがすべて通る（`withSession.test.ts` は `--machine` 無しで今までどおりの呼び方）。
- AC16: pass — `wtm --help`（`MACHINE_USAGE` を含む）・`wtmctl help`（`MACHINE_USAGE_LINE`）・`skills/wtmctl/SKILL.md`・`docs/machines.md`・`docs/herdr-parity.md` H43・`docs/wtmctl.md`（`skill.test.ts` が skill ファイルと help の一致を見る）。
- AC17: pass — smoke の 8 本目（下の起動確認）。
- AC-I1〜AC-I5: pass — `Sidebar.machines.test.ts`（開閉は切り替えずフォーカスはボタンに残る・aria-expanded/aria-controls・クリックで確定・切れていれば切り替わらない・全部 button で Enter/Space を window に漏らさない・ほかのマシンの行は D&D に流れない・navigate で開く）、`MachineSwitcher.test.ts`（後勝ち）。AC-I4 の前半（切り替えの後に端末へフォーカス）は `machineScope.test.ts`（切り替えの後の snapshot で、選んだ workspace の tab の focus の pane に焦点が移る）と既存の `TerminalPane.test.ts`（焦点の pane はマウント時に `term.focus()`）の組み合わせで確かめた——実ブラウザで DOM のフォーカスが端末に届くことは E2E をしていないので未検証。

## 失敗の証跡

このラウンド（test 工程）では、取り込み後の全体の実行で失敗は発生していない。取り込み前の全体の実行で `composeServer.stop.integration.test.ts` の「引き継ぎの最中に close()」が 1 回落ちた（`expected true to be false`。300ms の待ちで close が終わっていた）が、単独で再実行して 4/4 pass、取り込み後の全体でも pass——負荷に敏感な既存のテスト（再実行 1 回で通った。今回の変更は引き継ぎの pausePollers にマシンの停止を足しただけで、マシンが無ければすぐ戻る）。また coding の途中の全体の実行（`pnpm -s test`）で次の 4 件が落ち、coding の中で直してから全体をやり直した:

```
 FAIL  |@wtm/web| src/theme/uiTokens.test.ts > 部品の CSS の透明度 > 無効な部品・未対応の行・状態の丸を除き、opacity は MUTED_TEXT_ALPHA 以上
+   "../components/MachineHeader.vue .machine-header-dim .machine-label 0.6",
+   "../components/MachineRows.vue .machine-rows-dim 0.5",
+   "../components/MachineRows.vue .machine-rows-empty 0.6",
 FAIL  |@wtm/cli| src/withSession.test.ts > withSession > キャッシュ無し・token あり: login → store.set → connect → fn の順で実行し、client.close() を呼ぶ
AssertionError: expected "vi.fn()" to be called with arguments: [ 'http://127.0.0.1:7780', …(1) ]
 Test Files  2 failed | 248 passed (250)
      Tests  4 failed | 4619 passed (4623)
```

（前者は decisions D14、後者は `--machine` の無いときは今までどおり `connect(url, cookie)` と呼ぶよう直した。）

## 負の確認（変異）

`.aidev/conventions/regression-negative-control.md` に従い、安全の要と直した不具合の回帰テストを、実装の該当の行を壊して落ちることを確かめ、元に戻して `cmp` で一致を確かめた
（生の出力は `scratchpad/negctl/*.log`。作業用で PR には含めない）。

```
M2 宛先のパスワードを許す: mutant_rc=1 restored=True Tests  2 failed | 7 passed (9)
M2b 利用者名・ホスト名の先頭の - を許す: mutant_rc=1 restored=True Tests  1 failed | 8 passed (9)
M3 ssh の引数から -- を外す: mutant_rc=1 restored=True Tests  2 failed | 12 passed (14)
M4 枠の長さを本体を待つ前に見ない: mutant_rc=1 restored=True Tests  2 failed | 8 passed (10)
M5 リモートの close code を消毒しない: mutant_rc=1 restored=True Tests  1 failed | 4 passed (5)
M6 リモートの TEXT を全部通す: mutant_rc=1 restored=True Tests  1 failed | 4 passed (5)
M7 受け口のチャネル数の上限を外す: mutant_rc=1 restored=True Tests  1 failed | 4 passed (5)
M8 端末を部品が外れる前に捨てる: mutant_rc=1 restored=True Tests  2 failed | 4 passed (6)
M9 行の Enter を window へ漏らす: mutant_rc=1 restored=True Tests  1 failed | 7 passed (8)
M10 既読の鍵をマシンで分けない: mutant_rc=1 restored=True Tests  1 failed | 5 passed (6)
M11 表示の記憶のキーをマシンで分けない: mutant_rc=1 restored=True Tests  2 failed | 4 passed (6)
M12 軽い接続で購読しない印の external をやめる: mutant_rc=1 restored=True Tests  1 failed | 8 passed (9)
M13 upgrade で認証の前に行き先を見る（認証を飛ばす）: mutant_rc=1 restored=True Tests  1 failed | 4 passed (5)
M14 リモート → 手元も 4MiB で切る: mutant_rc=1 restored=True Tests  1 failed | 9 passed (10)
M15 引き継ぎ・停止で子の終わりを待たない: mutant_rc=1 restored=True Tests  1 failed | 11 passed (12)
M16 中継の接続を失効で閉じない: mutant_rc=1 restored=True Tests  1 failed | 4 passed (5)
R1 背圧で読むのを止めない: mutant_rc=1 restored=True Tests  1 failed | 5 passed (6)
R2 止めたまま上限時間で閉じない: mutant_rc=1 restored=True Tests  1 failed | 5 passed (6)
R3 最初の読み込みを待たずに一覧: mutant_rc=1 restored=True Tests  1 failed | 12 passed (13)
R4 止めている間も沈黙に数える: mutant_rc=1 restored=True Tests  1 failed | 16 passed (17)
R5 リモートが閉じたとき読むのを戻さない: mutant_rc=1 restored=True Tests  1 failed | 5 passed (6)
T3 reason を UTF-16 の単位で切る: AssertionError: expected 180 to be less than or equal to 120 / Tests  1 failed | 4 passed (5)
T7 反映の途中の一覧を配る: AssertionError: expected [ [ 'Build' ], [ 'Renamed' ], …(1) ] to deeply equal [ [ 'Build' ], [ 'Renamed', 'GPU' ] ]
T8 中継の接続を失効で閉じない: Error: timed out: revoked / Tests  1 failed | 4 skipped (5)
T11 閉じる途中の socket で retarget: AssertionError: expected [ FakeWebSocket{ …(7) }, …(1) ] to have a length of 1 but got 2
T13 機能の有効の判定を常に偽: Tests  6 failed | 2 passed (8)
T13 main.ts で真偽値を渡す（型）: src/main.ts(311,3): error TS2322: Type 'boolean' is not assignable to type 'Ref<boolean, boolean>'.
```

- **生き残った変異**: M1（宛先の全体の先頭の `-` の判定を外す）は落ちなかった。利用者名・ホスト名それぞれの先頭の `-` の判定（M2b）が同じ入力を必ず先に拒むので、
  M1 の行は冗長（等価な変異）。案内の文言のために残した。
- 単体テストで確かめられず変異をしていないもの: `main.ts` の配線（`windowsPty` を外す・`MachineWiring` への受け渡し）——読み込むと起動するため。判断は `MachineWiring`・`MachineSwitcher` に寄せた。
  `MachineManager` の読み直しのまとめの窓（T7 の点検）はタイミングで再現できない。

## 起動確認（smoke）

```
$ aidev smoke
smoke(cli): wtmctl snapshot ok
smoke(cli): wtmctl workspace/pane report-metadata ok (normalized, in snapshot, cleared, bad source refused)
smoke(cli): wtmctl agent list ok (no agents)
smoke(cli): wtmctl agent rename ok (named, resolved by name, cleared)
smoke(cli): wtmctl agent start ok (usage error for an unknown kind, agent_pane_busy on a pane with an agent)
smoke(cli): wtmctl agent send-keys ok (the RPC accepted the keys)
smoke(cli): wtmctl agent prompt ok (submitted; the shell printed the marker)
smoke(cli): wtmctl pane attach refuses a non-terminal (not_a_tty)
smoke(cli): wtmctl pane attach ok (in a real PTY: size 100x30, echo round trip, resize 90x25, Ctrl+B q exit 0, left the alternate screen)
smoke(cli): wtmctl pane observe/control ok (pipes: full first frame, control size 100x30, NDJSON input round trip, invalid line warned, release exit 0, observe pane_closed exit 0)
smoke(cli): PASS
$ d=$(mktemp -d) && mkdir -p "$d/sessions/smoke" && node packages/server/dist/main.js token reset --session smoke --state-dir "$d" && test -f "$d/sessions/smoke/auth.json" && node packages/server/dist/main.js session list --state-dir "$d" | grep -q '^smoke ' && node packages/server/dist/main.js session delete smoke --state-dir "$d" && test ! -e "$d/sessions/smoke"; rc=$?; rm -rf "$d"; exit $rc
wtm: new token: 4XNAMcIYbp4KCIAMHeo-cQIruv4FRYtl
wtm: deleted session smoke (/tmp/tmp.u2Q6CYB85E/sessions/smoke)
$ WTMCTL_URL=http://127.0.0.1:9 node packages/cli/dist/main.js skill | cmp - packages/cli/skills/wtmctl/SKILL.md
$ d=$(mktemp -d) && mkdir -p "$d/sessions/smoke" && WTM_SESSION=smoke node packages/server/dist/main.js token reset --state-dir "$d" && test -f "$d/sessions/smoke/auth.json" && test ! -e "$d/auth.json" && { WTM_SESSION=a/b node packages/server/dist/main.js token reset --state-dir "$d" 2>/dev/null; test $? -eq 2; } && test ! -e "$d/auth.json"; rc=$?; rm -rf "$d"; exit $rc
wtm: new token: JnTrpY5N-mXCoWXb1xge00wrcOZi_T1E
$ node packages/server/dist/handoffSmoke.js
handoff-smoke: not running → exit 3, nothing created ok
handoff-smoke: before: server pid 65856, pane p1, shell pid 65869
handoff-smoke: wtm handoff → exit 0: wtm: handoff complete: 1 pane(s) kept running
handoff-smoke: same server pid, /ws closed with 1012, handoff.json removed ok
handoff-smoke: same pane, same shell pid, previous screen visible, input/output ok
handoff-smoke: resize reaches the adopted pty ok
handoff-smoke: pane closes when the adopted shell exits ok
handoff-smoke: ok
$ node packages/server/dist/stopSmoke.js
stop-smoke: not running → exit 3, nothing created ok
stop-smoke: started: pid 65958, pane p2, marker shown
stop-smoke: stopped: CLI exit 0, server exit 0, list shows stopped, lock released, state saved ok
stop-smoke: stopped → exit 3 ok
stop-smoke: restarted: same pane, previous screen restored ok
stop-smoke: ok
$ node packages/server/dist/machineSmoke.js
machine-smoke: remote wtm serve started (pid 66053)
machine-smoke: wtm machine add (probed over the fake ssh) and list ok
machine-smoke: local wtm serve connected to the remote machine (machine.list: online)
machine-smoke: relay ok: hello (hostname OSK2-024680-2), workspace.create and echo reached the remote wtm serve
machine-smoke: ok
smoke: pass (exit 0, 8 本)
```

- 中断前の 1 回目の `aidev smoke` は、1 本目（`pnpm -s build && pnpm -s smoke` のブラウザの部分）が 180 秒で打ち切られた（exit 124。直前の出力は `agent judgment failed … foregroundJob timed out after 2000ms`＝マシンの高負荷の兆候）。マシンの再起動後、1 本目だけを単独で打つと 19 秒で PASS、上の全 8 本も PASS。コードの問題ではなく再起動前の高負荷によるものと判断した（1 本目は今回の変更を含む `composeServer` を使うが、マシンの登録簿が無いので ssh は起こさない）。

## 未検証の穴（skip / 環境不足）

- **本物の SSH のサーバ**（OpenSSH の BatchMode・ServerAlive・ホスト鍵・認証の失敗の実際の文言）: 偽の ssh（スクリプト）でしか確かめていない。分類の文言は OpenSSH の既知の出力に合わせた。
- **macOS・Windows**（手元が Windows・リモートが macOS）: 未検証。リモートが Windows は非対応。
- **実ブラウザ（E2E）**: 行っていない（ユーザーの指示）。サイドバー・切り替えは happy-dom の部品のテストと、配線の判断の単体テストまで。
- 全体の vitest で skip されたテスト: 0 件
