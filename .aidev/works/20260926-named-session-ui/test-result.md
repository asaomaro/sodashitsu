# テスト結果（20260926-named-session-ui）

## 結論

- 合否: **合格**（ラウンド 2）。ラウンド 1 は全体の test で 1 本失敗 → coding へ差し戻して修正（下の「失敗の証跡」）。
- `pnpm -s build` exit 0・`pnpm -s typecheck` exit 0（終了コードで判定。ログ scratchpad/logs/build5.log・tc5.log は空）。
- `pnpm -s test`（一式を 1 回）: **210 ファイル・4085 本 passed・0 failed・skipped 0**（exit 0）。
  うちこの work で足した・変えたテスト: ServeRecordFile 20・cliArgs（applySessionEnv）15 前後・config 7・sessionCommands 3・AuthService 4・
  paneEnv 3・namedSession（listServerSessions）4・serverSessions 2・composeServer 結合 6・startupBanner 3・cli の paneEnv 結合 2・
  web: sessionTarget 9・documentTitle 2・ActionDispatcher 3・SessionSwitchDialog 10・Sidebar 4。
- `aidev smoke`: **pass（5 本）**。5 本目を足した（`WTM_SESSION` の CLI の入口。下）。
- E2E・負荷試験は実行していない（利用者の方針）。

## ラウンド 3（review ラウンド 1 の差し戻し後。docs と一覧の理由の文だけの変更）

- `pnpm -s build` exit 0・`pnpm -s typecheck` exit 0・`pnpm -s test` **210 ファイル・4085 本 passed**（exit 0）・`aidev smoke` **pass（5 本）**。

## 起動確認（smoke）

```
smoke(cli): wtmctl agent rename ok (named, resolved by name, cleared)
smoke(cli): wtmctl agent start ok (usage error for an unknown kind, agent_pane_busy on a pane with an agent)
smoke(cli): wtmctl agent send-keys ok (the RPC accepted the keys)
smoke(cli): wtmctl agent prompt ok (submitted; the shell printed the marker)
smoke(cli): wtmctl pane attach refuses a non-terminal (not_a_tty)
smoke(cli): wtmctl pane attach ok (in a real PTY: size 100x30, echo round trip, resize 90x25, Ctrl+B q exit 0, left the alternate screen)
smoke(cli): PASS
$ d=$(mktemp -d) && mkdir -p "$d/sessions/smoke" && node packages/server/dist/main.js token reset --session smoke --state-dir "$d" && test -f "$d/sessions/smoke/auth.json" && node packages/server/dist/main.js session list --state-dir "$d" | grep -q '^smoke ' && node packages/server/dist/main.js session delete smoke --state-dir "$d" && test ! -e "$d/sessions/smoke"; rc=$?; rm -rf "$d"; exit $rc
wtm: new token: <redacted>
wtm: deleted session smoke (/tmp/tmp.21GhhoXhAr/sessions/smoke)
$ WTMCTL_URL=http://127.0.0.1:9 node packages/cli/dist/main.js skill | cmp - packages/cli/skills/wtmctl/SKILL.md
$ d=$(mktemp -d) && mkdir -p "$d/sessions/smoke" && WTM_SESSION=smoke node packages/server/dist/main.js token reset --state-dir "$d" && test -f "$d/sessions/smoke/auth.json" && test ! -e "$d/auth.json" && { WTM_SESSION=a/b node packages/server/dist/main.js token reset --state-dir "$d" 2>/dev/null; test $? -eq 2; } && test ! -e "$d/auth.json"; rc=$?; rm -rf "$d"; exit $rc
wtm: new token: <redacted>
smoke: pass (exit 0, 5 本)
```

- 足した 5 本目: ビルド済みの `wtm` で `WTM_SESSION=smoke wtm token reset` が `sessions/smoke/auth.json` だけを作り、`WTM_SESSION=a/b` が
  終了コード 2 で何も作らないこと。`main.ts`（読み込むと起動するので単体テストできない）の `applySessionEnv` の配線を見る。
- 負の確認: `dist/main.js` の `applySessionEnv(...)` を外すと 5 本目が exit 1（scratchpad/logs/nc-smoke5.log。復元して cmp 一致）。

## 受け入れ基準の検証

| AC | 検証 | 結果 |
|---|---|---|
| AC1 | composeServer 結合（名前付きの snapshot.host.sessionName・hello・既定に項目なし） | pass |
| AC2 | Sidebar（名前付きで表示・既定は 0 件で無し／1 件で default・折りたたみ） | pass |
| AC3 | documentTitle（既定は従来の文字列と完全一致・名前付きは [名前]） | pass |
| AC4 | namedSession listServerSessions（持ち主一致・不一致・記録なし・止まっている・別ホスト・current）＋結合の server.sessions | pass |
| AC5 | キーの集合の完全一致・パス/pid を含まない・/ws は Cookie が無いと 401 | pass |
| AC6 | sessionTarget（全インタフェース・ループバック・特定・IPv6・TLS・URL にできない。D6 で規則を修正） | pass |
| AC7 | SessionSwitchDialog・ActionDispatcher（window.open の引数・開けない項目は何もしない・理由の文） | pass |
| AC8・AC9 | AuthService 単体・結合（wtm_session_work／wtm_session・別の名前の Cookie では 401） | pass |
| AC10〜AC12 | composeServer 結合（記録→次の起動で同じポート・--port で更新・壊れた/範囲外で 7780・既定は読まず書く）・ServeRecordFile（読めない権限を含む） | pass |
| AC13・AC14 | cliArgs applySessionEnv・sessionCommands・config・composeServer 結合（案内の WTM_SESSION）・smoke 5 本目 | pass |
| AC15 | paneEnv 単体・cli の結合（実 PTY：名前付きの pane に work・既定の pane に無し。受け継いだ値は落ちる） | pass |
| AC16 | startupBanner・bindFailureHint 単体（main.ts の配線は目視） | pass |
| AC17 | 既存のテスト一式が通る（smoke のタイトルの完全一致を含む） | pass |
| AC18 | docs（tls-setup・verification・herdr-parity H33） | review で目視 |
| AC-I1〜AC-I5 | SessionSwitchDialog（開く/閉じる・Enter/クリック・↑↓/j/k・フォーカスの戻り・preventDefault）・Sidebar（Enter/Space を window へ渡さない） | pass |

## 負の確認（regression-negative-control。変異の網羅）

主要な振る舞いの行を 1 つずつ壊し、そのテストファイルだけを 1 回走らせて落ちることを確かめ、元に戻して cmp で一致を確かめた
（スクリプト scratchpad/nc/sweep.sh・生ログ scratchpad/nc/M*.log）。

```
M1 rc=1 restored  Tests 1 failed | 5 passed | 32 skipped (38)
M2 rc=1 restored  Tests 3 failed | 12 passed (15)
M3 rc=1 restored  Tests 3 failed | 5 passed (8)
M4 rc=1 restored  Tests 1 failed | 51 passed (52)
M5 rc=1 restored  Tests 1 failed | 28 passed (29)
M6 rc=1 restored  Tests 1 failed | 10 passed (11)
M7 rc=1 restored  Tests 1 failed | 79 passed (80)
M8 rc=1 restored  Tests 1 failed | 9 passed (10)
M9 rc=1 restored  Tests 1 failed | 5 passed | 32 skipped (38)
M10 rc=1 restored  Tests 1 failed | 35 passed (36)
```

- M1 ポートの記憶を既定の session にも効かせる／M2 Cookie の名前を固定／M3 受け継いだ WTM_SESSION を落とさない／M4 記録の pid の照合を外す／
  M5 --session より WTM_SESSION を優先／M6 ループバックの届かない判定を外す／M7 名前付きが 0 件でもボタンを出す／M8 止まっている項目も開く／
  M9 既定の session に sessionName を載せる／M10 既定の session に sessionSource を付ける。**10 変異すべて検知**。
- M4 の生出力の抜粋:

```
     × 動いていて記録の pid・ホスト名がロックの持ち主と一致する session にだけ開くための情報を付ける 88ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  |@wtm/server| src/persist/namedSession.test.ts > listServerSessions（server.sessions の一覧） > 動いていて記録の pid・ホスト名がロックの持ち主と一致する session にだけ開くための情報を付ける
      Tests  1 failed | 51 passed (52)
```

- ほかに、coding の独立点検の中で 60 を超える変異を点検者が当て、生き残ったものはテストを足して検知させた（review.md のタスク点検ログ・
  scratchpad/logs/nc-T2-default.log・nc-T5-otherhost.log・nc-T8-current.log〔等価な変異として許容〕・nc-T9-*.log）。

## 未検証の穴

- **実機のブラウザでの動作**（E2E は利用者の方針で実行していない）：ネイティブの `<dialog>` のフォーカスの戻り・Tab の閉じ込め・
  `window.open` がポップアップとして止められないこと・同じブラウザで 2 つの session にログインしたままでいられること（Cookie の名前は
  サーバの結合テストで確かめたが、ブラウザの Cookie の保存は未確認）・畳んだサイドバーでの ⇄ の見た目。`docs/verification.md` に手動確認を足した。
- ダイアログを開いている間に開く前の pane が閉じられたときのフォーカスの行き先（decisions D8。端末へ移りうる）。
- TLS で起動したときの `serve.json` の `https: true`（証明書の fixture が無い）。
- Windows ネイティブ・macOS（`WTM_SESSION` の大文字小文字・`window.open`）。
- 大文字小文字を区別しない FS で綴りを変えて開いたときの current（許容。review.md）。

## 失敗の証跡

### ラウンド 1（全体の pnpm -s test。exit 1。4085 本中 1 本失敗）

```
 FAIL  |@wtm/web| src/theme/uiTokens.test.ts > 部品の CSS の透明度 > 無効な部品・未対応の行・状態の丸を除き、opacity は MUTED_TEXT_ALPHA 以上
AssertionError: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "../components/SessionSwitchDialog.vue .session-switch-dialog-item-disabled .session-switch-dialog-name 0.6",
+ ]

 ❯ src/theme/uiTokens.test.ts:275:19
    273|     }
    274|     expect(Object.keys(sources).length).toBeGreaterThan(20);
    275|     expect(found).toEqual([]);
```

原因: SessionSwitchDialog.vue の開けない項目の名前を opacity 0.6 で描いていた（MUTED_TEXT_ALPHA 0.7 未満）。coding へ差し戻し、その規則を消した。
