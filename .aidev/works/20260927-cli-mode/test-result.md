# テスト結果: CLI 版の画面（端末版）— 親の統合 test

## 実行したもの
- `aidev coverage --strict` — exit 0（ac=24・design 24/24・tasks 24/24・gaps 0）
- `aidev smoke` — pass（exit 0・10 本。10 本目が新しい `node scripts/tui-pty-verify.mjs`）
- 06 の test で実行した全体の結果（同じ作業ツリー）: `pnpm build`・`pnpm typecheck` exit 0、`pnpm test` 323 files / 5795 passed / 0 failed、疑似端末の確かめ OK、bench 2 回（06 の test-result に生の出力）

```
$ node scripts/tui-pty-verify.mjs
- 起動した（pane のプロンプト。サーバ pid 3280005）
- 新しい状態ディレクトリではじめの案内が出て、Enter で閉じ、案内済みが共有の設定に残った
- サイドバーの pvroot3279969 の行・tab バー（1:）・pane の枠が描かれている
- pane に打ったコマンドの出力が出た
- prefix+q で 0・代替画面に入って出た・サーバ（pid 3280005）は動き続けている
- もう一度 soda で同じ画面が戻り（同じサーバ）、ホイールで最初の行（L3）まで遡れた
- 端末版 2 つを同時に開き、片方の打鍵が両方に出た
- ブラウザ相当のクライアントが同じ workspace（pvroot3279969）を見て、作った workspace（pvws3279969）がサイドバーに、送った入力が端末版に出た
- 端末版を両方 prefix+q で抜けた（終了コード 0）
tui-pty-verify: OK
smoke: pass (exit 0, 10 本)
```

## ラウンド 2（統合 review の差し戻しの後。d3941ed・ae49be9・dbd5f5d・a5c0bd8）
- `pnpm typecheck` — exit 0
- `pnpm test` — 326 files / 5815 passed / 0 failed / 0 skipped
- `aidev smoke` — pass（exit 0・10 本。`tui-pty-verify: OK`）
- 負の確認（27 件）の生の出力は `scratchpad/parent-negative-control.txt`（実装者の記録）

## ラウンド 3（統合 review 2 巡目の差し戻しの後。7f2055e・8ea10ae）
- 実装者の作業ツリー（未コミットは docs/tui.md と .aidev だけ）で `pnpm build`・`pnpm typecheck` exit 0、`pnpm test` 5819/5819 passed

### 負の確認（統合 review の修正。直した行を戻して落ちることの生の出力。r1-4-core-notify は最初に通ったので試験を強め、notify-2 で落ちることを確かめた）

```
=== 統合の review r1 の差し戻し（2026-09-28） ===

===== r1-1-migrate-only-rev0 (2026-09-28T11:42:37)
mutation: src/actions/PrefsSync.ts
  - 'if (r.rev === 0 || !this.deps.migrated()) {'
  + 'if (r.rev === 0) {'
command: (cd packages/web && npx vitest run src/actions/PrefsSync.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/actions/PrefsSync.test.ts > PrefsSync（初回の移行） > 端末版が先に onboarding:false を書いた（rev 1）サーバへ、まだ移していないブラウザが繋ぐと、サーバに無いキー・テーマを移し、手元とサーバの両方に残る
AssertionError: expected [] to deeply equal [ { …(2) } ]

- Expected
+ Received

- [
-   {
-     "baseRev": 1,
-     "patch": {
-       "keys": {
-         "prefix": "ctrl+a",
-       },
-       "theme": "nord",
-     },
-   },
- ]
+ []

 ❯ src/actions/PrefsSync.test.ts:174:18
    172|     sync.onOpened();
    173|     await flush();
    174|     expect(sets).toEqual([{ patch: { theme: "nord", keys: { prefix: "c…
       |                  ^
    175|     expect(server.prefs).toEqual({ onboarding: false, theme: "nord", k…
    176|     expect(stored()).toEqual({

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  src/actions/PrefsSync.test.ts > PrefsSync（初回の移行） > まだ移していないブラウザでも、サーバにある項目はサーバの値が勝つ（送らない）
AssertionError: expected [] to deeply equal [ { patch: { …(1) }, baseRev: 3 } ]

- Expected
+ Received

- [
-   {
-     "baseRev": 3,
-     "patch": {
-       "statusSymbols": false,
-     },
-   },
- ]
+ []

 ❯ src/actions/PrefsSync.test.ts:202:18
    200|     sync.onOpened();
    201|     await flush();
    202|     expect(sets).toEqual([{ patch: { statusSymbols: false }, baseRev: …
       |                  ^
    203|     expect(useSettingsStore(pinia).theme).toBe("dracula");
    204|     expect(useSettingsStore(pinia).statusSymbols).toBe(false);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  src/actions/PrefsSync.test.ts > PrefsSync（初回の移行） > 移す送信が失敗したら移し終えた印を付けず、次の接続でサーバに無い項目を送り直す
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/actions/PrefsSync.test.ts:214:31
    212|     sync.onOpened();
    213|     await flush();
    214|     expect(isPrefsMigrated()).toBe(false);
       |                               ^
    215|     delete state.fail;
    216|     sync.onClosed();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯

restored: sha256 before=0b2d27ee8a36c326 after=0b2d27ee8a36c326 IDENTICAL

===== r1-1-server-wins (2026-09-28T11:42:40)
mutation: src/actions/PrefsSync.ts
  - 'const missing = (k: string): boolean => r.rev === 0 || !Object.hasOwn(r.prefs, k);'
  + 'const missing = (_k: string): boolean => true;'
command: (cd packages/web && npx vitest run src/actions/PrefsSync.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/actions/PrefsSync.test.ts > PrefsSync（初回の移行） > まだ移していないブラウザでも、サーバにある項目はサーバの値が勝つ（送らない）
AssertionError: expected [ { …(2) } ] to deeply equal [ { patch: { …(1) }, baseRev: 3 } ]

- Expected
+ Received

  [
    {
      "baseRev": 3,
      "patch": {
        "statusSymbols": false,
+       "theme": "nord",
      },
    },
  ]

 ❯ src/actions/PrefsSync.test.ts:202:18
    200|     sync.onOpened();
    201|     await flush();
    202|     expect(sets).toEqual([{ patch: { statusSymbols: false }, baseRev: …
       |                  ^
    203|     expect(useSettingsStore(pinia).theme).toBe("dracula");
    204|     expect(useSettingsStore(pinia).statusSymbols).toBe(false);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  src/actions/PrefsSync.test.ts > PrefsSync（初回の移行） > 移す送信が失敗したら移し終えた印を付けず、次の接続でサーバに無い項目を送り直す
AssertionError: expected [ Array(1) ] to deeply equal [ { theme: 'nord' } ]

- Expected
+ Received

  [
    {
+     "onboarding": false,
      "theme": "nord",
    },
  ]

 ❯ src/actions/PrefsSync.test.ts:219:38
    217|     sync.onOpened();
    218|     await flush();
    219|     expect(sets.map((x) => x.patch)).toEqual([{ theme: "nord" }]);
       |                                      ^
    220|     expect(isPrefsMigrated()).toBe(true);
    221|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  src/actions/PrefsSync.test.ts > PrefsSync（移行・失敗・大きすぎるの競合） > S2: 移行の送信が失敗しても、溜めた変更を捨てない。その間にほかのクライアントが移したら、利用者の変更だけ残して種は捨てる
AssertionError: expected [ { statusSymbols: false, …(1) } ] to deeply equal [ { statusSymbols: false } ]

- Expected
+ Received

  [
    {
      "statusSymbols": false,
+     "theme": "nord",
    },
  ]

 ❯ src/actions/PrefsSync.test.ts:427:38
    425|     sync.onOpened();
    426|     await flush();
    427|     expect(sets.map((x) => x.patch)).toEqual([{ statusSymbols: false }…
       |                                      ^
    428|     expect(useSettingsStore(pinia).statusSymbols).toBe(false);
    429|     expect(useSettingsStore(pinia).theme).toBe("dracula");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯

restored: sha256 before=0b2d27ee8a36c326 after=0b2d27ee8a36c326 IDENTICAL

===== r1-1-no-mark (2026-09-28T11:42:42)
mutation: src/actions/PrefsSync.ts
  - '    this.deps.markMigrated();\n'
  + ''
command: (cd packages/web && npx vitest run src/actions/PrefsSync.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/actions/PrefsSync.test.ts > PrefsSync（初回の移行） > 端末版が先に onboarding:false を書いた（rev 1）サーバへ、まだ移していないブラウザが繋ぐと、サーバに無いキー・テーマを移し、手元とサーバの両方に残る
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/actions/PrefsSync.test.ts:184:31
    182|     expect(useSettingsStore(pinia).theme).toBe("nord");
    183|     expect(useSettingsStore(pinia).keymap.prefix).toBe("ctrl+a");
    184|     expect(isPrefsMigrated()).toBe(true);
       |                               ^
    185|     // 移し終えた後は移さない（次の接続でサーバの値が勝つ）
    186|     sync.onClosed();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/actions/PrefsSync.test.ts > PrefsSync（初回の移行） > 移す送信が失敗したら移し終えた印を付けず、次の接続でサーバに無い項目を送り直す
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/actions/PrefsSync.test.ts:220:31
    218|     await flush();
    219|     expect(sets.map((x) => x.patch)).toEqual([{ theme: "nord" }]);
    220|     expect(isPrefsMigrated()).toBe(true);
       |                               ^
    221|   });
    222|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

restored: sha256 before=0b2d27ee8a36c326 after=0b2d27ee8a36c326 IDENTICAL

===== r1-1-mark-early (2026-09-28T11:42:44)
mutation: src/actions/PrefsSync.ts
  - '    if (seeds.some((p) => p.seed)) return;\n'
  + ''
command: (cd packages/web && npx vitest run src/actions/PrefsSync.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/actions/PrefsSync.test.ts > PrefsSync（初回の移行） > 移す送信が失敗したら移し終えた印を付けず、次の接続でサーバに無い項目を送り直す
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/actions/PrefsSync.test.ts:214:31
    212|     sync.onOpened();
    213|     await flush();
    214|     expect(isPrefsMigrated()).toBe(false);
       |                               ^
    215|     delete state.fail;
    216|     sync.onClosed();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=0b2d27ee8a36c326 after=0b2d27ee8a36c326 IDENTICAL

===== r1-2-apply (2026-09-28T11:42:47)
mutation: src/store/prefsApply.ts
  - '  if (raw["onboarding"] === false) useOnboardingStore(pinia).suppress();'
  + ''
command: (cd packages/web && npx vitest run src/store/onboarding.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/store/onboarding.test.ts > 共有の設定の onboarding（統合の review の差し戻し） > 端末版・ほかのブラウザで済ませた（onboarding: false）なら、初めてのブラウザでも起動時の案内を出さない
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/store/onboarding.test.ts:133:36
    131|     expect(store.pendingAtStartup).toBe(true);
    132|     applyPrefsToStores(pinia, { onboarding: false });
    133|     expect(store.pendingAtStartup).toBe(false);
       |                                    ^
    134|   });
    135|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/store/onboarding.test.ts > 共有の設定の onboarding（統合の review の差し戻し） > サーバの値が届く前に開いた起動時の案内は、onboarding: false が届いたら閉じる
AssertionError: expected { kind: 'onboarding' } to be null

- Expected:
null

+ Received:
{
  "kind": "onboarding",
}

 ❯ src/store/onboarding.test.ts:146:32
    144|     expect(view.dialogContext).toEqual({ kind: "onboarding" }); // 案内済…
    145|     applyPrefsToStores(pinia, { onboarding: false });
    146|     expect(view.dialogContext).toBeNull();
       |                                ^
    147|   });
    148|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

restored: sha256 before=1a8dae2369e7179f after=1a8dae2369e7179f IDENTICAL

===== r1-2-close (2026-09-28T11:42:49)
mutation: src/store/onboarding.ts
  - '    if (view.dialogContext?.kind === "onboarding") view.closeDialog();'
  + ''
command: (cd packages/web && npx vitest run src/store/onboarding.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/store/onboarding.test.ts > 共有の設定の onboarding（統合の review の差し戻し） > サーバの値が届く前に開いた起動時の案内は、onboarding: false が届いたら閉じる
AssertionError: expected { kind: 'onboarding' } to be null

- Expected:
null

+ Received:
{
  "kind": "onboarding",
}

 ❯ src/store/onboarding.test.ts:146:32
    144|     expect(view.dialogContext).toEqual({ kind: "onboarding" }); // 案内済…
    145|     applyPrefsToStores(pinia, { onboarding: false });
    146|     expect(view.dialogContext).toBeNull();
       |                                ^
    147|   });
    148|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=83a196717dfae9c2 after=83a196717dfae9c2 IDENTICAL

===== r1-2-handled (2026-09-28T11:42:52)
mutation: src/store/onboarding.ts
  - '    if (!startupOpened.value || startupHandled.value) return;'
  + '    if (!startupOpened.value) return;'
command: (cd packages/web && npx vitest run src/store/onboarding.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/store/onboarding.test.ts > 共有の設定の onboarding（統合の review の差し戻し） > 設定画面から開き直した案内（起動時の案内を終えた後）は閉じない
AssertionError: expected null to deeply equal { kind: 'onboarding' }

- Expected:
{
  "kind": "onboarding",
}

+ Received:
null

 ❯ src/store/onboarding.test.ts:158:32
    156|     view.openDialogWithContext({ kind: "onboarding" });
    157|     applyPrefsToStores(pinia, { onboarding: false });
    158|     expect(view.dialogContext).toEqual({ kind: "onboarding" });
       |                                ^
    159|   });
    160| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=83a196717dfae9c2 after=83a196717dfae9c2 IDENTICAL

===== r1-3-spawn-env (2026-09-28T11:46:50)
mutation: src/launch/findOrStart.ts
  - 'env: detachedServeEnv(opts.env, opts.platform),'
  + 'env: opts.env,'
command: (cd packages/server && npx vitest run src/launch/findOrStart.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/launch/findOrStart.test.ts > findOrStart > 動いていなければ裏で起動し、準備完了を待って、serve.out の token を知らせにして空にする。子の引数は serve --state-dir --session
AssertionError: expected { …(3) } to deeply equal { KEEP_ME: '1' }

- Expected
+ Received

  {
    "KEEP_ME": "1",
+   "TERM_PROGRAM": "vscode",
+   "TMUX": "/tmp/tmux-1/default,1,0",
  }

 ❯ src/launch/findOrStart.test.ts:150:27
    148|     expect(calls).toHaveLength(1);
    149|     // 最初の端末だけの変数は裏のサーバへ渡さない（serveEnv.ts）
    150|     expect(calls[0]!.env).toEqual({ KEEP_ME: "1" });
       |                           ^
    151|     expect(calls[0]!.args).toEqual([
    152|       "/nonexistent/main.js",

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=7c271e7376d2d41f after=7c271e7376d2d41f IDENTICAL

===== r1-3-authsock-only-ssh (2026-09-28T11:46:52)
mutation: src/launch/serveEnv.ts
  - '  if (inSsh) dropped.add("SSH_AUTH_SOCK");'
  + '  dropped.add("SSH_AUTH_SOCK");'
command: (cd packages/server && npx vitest run src/launch/serveEnv.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/launch/serveEnv.test.ts > detachedServeEnv（裏で起動する soda serve の環境） > 多重化・SSH のセッション・外側の端末だけの変数を除き、ほかは残す
AssertionError: expected { PATH: '/usr/bin', …(5) } to deeply equal { PATH: '/usr/bin', …(6) }

- Expected
+ Received

  {
    "COLORTERM": "truecolor",
    "DISPLAY": ":0",
    "HOME": "/home/u",
    "PATH": "/usr/bin",
-   "SSH_AUTH_SOCK": "/run/user/1000/keyring/ssh",
    "TERM": "xterm-256color",
    "WAYLAND_DISPLAY": "wayland-0",
  }

 ❯ src/launch/serveEnv.test.ts:41:44
     39|       SSH_AUTH_SOCK: "/run/user/1000/keyring/ssh",
     40|     };
     41|     expect(detachedServeEnv(env, "linux")).toEqual({
       |                                            ^
     42|       PATH: "/usr/bin",
     43|       HOME: "/home/u",

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=bb6553e4fc0c7b23 after=bb6553e4fc0c7b23 IDENTICAL

===== r1-3-authsock-ssh (2026-09-28T11:46:53)
mutation: src/launch/serveEnv.ts
  - '  if (inSsh) dropped.add("SSH_AUTH_SOCK");'
  + ''
command: (cd packages/server && npx vitest run src/launch/serveEnv.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/launch/serveEnv.test.ts > detachedServeEnv（裏で起動する soda serve の環境） > SSH のセッションの中なら SSH_* と SSH_AUTH_SOCK（転送したエージェント）を除く
AssertionError: expected { PATH: '/usr/bin', …(1) } to deeply equal { PATH: '/usr/bin' }

- Expected
+ Received

  {
    "PATH": "/usr/bin",
+   "SSH_AUTH_SOCK": "/tmp/ssh-x/agent.1",
  }

 ❯ src/launch/serveEnv.test.ts:64:17
     62|       "linux",
     63|     );
     64|     expect(out).toEqual({ PATH: "/usr/bin" });
       |                 ^
     65|   });
     66|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=bb6553e4fc0c7b23 after=bb6553e4fc0c7b23 IDENTICAL

===== r1-3-prefix (2026-09-28T11:46:54)
mutation: src/launch/serveEnv.ts
  - '    if (DROPPED_PREFIXES.some((p) => k.startsWith(p))) continue;'
  + ''
command: (cd packages/server && npx vitest run src/launch/serveEnv.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/launch/serveEnv.test.ts > detachedServeEnv（裏で起動する soda serve の環境） > 多重化・SSH のセッション・外側の端末だけの変数を除き、ほかは残す
AssertionError: expected { PATH: '/usr/bin', …(11) } to deeply equal { PATH: '/usr/bin', …(6) }

- Expected
+ Received

  {
    "COLORTERM": "truecolor",
    "DISPLAY": ":0",
+   "GHOSTTY_RESOURCES_DIR": "/g",
    "HOME": "/home/u",
+   "ITERM_SESSION_ID": "i",
+   "KONSOLE_VERSION": "1",
    "PATH": "/usr/bin",
    "SSH_AUTH_SOCK": "/run/user/1000/keyring/ssh",
    "TERM": "xterm-256color",
+   "VSCODE_IPC_HOOK_CLI": "/tmp/v.sock",
    "WAYLAND_DISPLAY": "wayland-0",
+   "WEZTERM_PANE": "1",
  }

 ❯ src/launch/serveEnv.test.ts:41:44
     39|       SSH_AUTH_SOCK: "/run/user/1000/keyring/ssh",
     40|     };
     41|     expect(detachedServeEnv(env, "linux")).toEqual({
       |                                            ^
     42|       PATH: "/usr/bin",
     43|       HOME: "/home/u",

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=bb6553e4fc0c7b23 after=bb6553e4fc0c7b23 IDENTICAL

===== r1-3-vscode-helper (2026-09-28T11:46:55)
mutation: src/launch/serveEnv.ts
  - 'VSCODE_HELPER.test(value)'
  + 'true'
command: (cd packages/server && npx vitest run src/launch/serveEnv.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/launch/serveEnv.test.ts > detachedServeEnv（裏で起動する soda serve の環境） > VS Code を指さない GIT_ASKPASS・BROWSER は残す
AssertionError: expected {} to deeply equal { …(2) }

- Expected
+ Received

- {
-   "BROWSER": "firefox",
-   "GIT_ASKPASS": "/usr/lib/ssh/ssh-askpass",
- }
+ {}

 ❯ src/launch/serveEnv.test.ts:70:7
     68|     expect(
     69|       detachedServeEnv({ GIT_ASKPASS: "/usr/lib/ssh/ssh-askpass", BROW…
     70|     ).toEqual({ GIT_ASKPASS: "/usr/lib/ssh/ssh-askpass", BROWSER: "fir…
       |       ^
     71|   });
     72|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=bb6553e4fc0c7b23 after=bb6553e4fc0c7b23 IDENTICAL

===== r1-3-win32 (2026-09-28T11:46:56)
mutation: src/launch/serveEnv.ts
  - '(platform === "win32" ? k.toUpperCase() : k)'
  + 'k'
command: (cd packages/server && npx vitest run src/launch/serveEnv.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/launch/serveEnv.test.ts > detachedServeEnv（裏で起動する soda serve の環境） > Windows では大文字小文字を区別せずに比べる（ほかの OS では完全一致）
AssertionError: expected { Wt_Session: 'g', Path: 'C:\\' } to deeply equal { Path: 'C:\\' }

- Expected
+ Received

  {
    "Path": "C:\\\\",
+   "Wt_Session": "g",
  }

 ❯ src/launch/serveEnv.test.ts:74:76
     72|
     73|   it("Windows では大文字小文字を区別せずに比べる（ほかの OS では完全一致）", () => {
     74|     expect(detachedServeEnv({ Wt_Session: "g", Path: "C:\\\\" }, "win3…
       |                                                                            ^
     75|       Path: "C:\\\\",
     76|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=bb6553e4fc0c7b23 after=bb6553e4fc0c7b23 IDENTICAL

===== r1-4-core-borders-default (2026-09-28T11:52:57)
mutation: src/prefs/load.ts
  - ': "always";'
  + ': "auto";'
command: (cd packages/client-core && npx vitest run src/prefs/load.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/prefs/load.test.ts > loadPaneBorders・loadPaneGaps・loadPaneAgentNameVisible > 有効な値はそのまま、壊れた値は既定（常に・隙間あり・名前なし）
AssertionError: expected 'auto' to be 'always' // Object.is equality

Expected: "always"
Received: "auto"

 ❯ src/prefs/load.test.ts:87:86
     85|   it("有効な値はそのまま、壊れた値は既定（常に・隙間あり・名前なし）", () => {
     86|     for (const v of ["always", "auto", "off"] as const) expect(loadPan…
     87|     for (const raw of [undefined, null, "Auto", 1, {}]) expect(loadPan…
       |                                                                                      ^
     88|     expect(loadPaneGaps(false)).toBe(false);
     89|     for (const raw of [undefined, "false", 0]) expect(loadPaneGaps(raw…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=a5153f2ac23327e3 after=a5153f2ac23327e3 IDENTICAL

===== r1-4-core-notify (2026-09-28T11:52:58)
mutation: src/prefs/load.ts
  - 'typeof o[k] === "boolean" ? (o[k] as boolean) : DEFAULT_NOTIFY_PREFS[k];'
  + 'o[k] === true;'
command: (cd packages/client-core && npx vitest run src/prefs/load.test.ts)  exit=0
raw output:
      Tests  12 passed (12)
restored: sha256 before=a5153f2ac23327e3 after=a5153f2ac23327e3 IDENTICAL

===== r1-4-tui-uses-core (2026-09-28T11:53:04)
mutation: src/model/PrefsModel.ts
  - 'return loadPaneBorders(this.raw.paneBorders);'
  + 'return "always";'
command: (cd packages/tui && npx vitest run src/app/t7.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/t7.test.ts > T7 の画面 > H23：枠の描き方（auto の 1 つだけの pane は枠なし・off は境目の線だけ）・エージェント名
AssertionError: expected { x: 27, y: 2, w: 72, h: 9 } to deeply equal { x: 26, y: 1, w: 74, h: 11 }

- Expected
+ Received

  {
-   "h": 11,
-   "w": 74,
-   "x": 26,
-   "y": 1,
+   "h": 9,
+   "w": 72,
+   "x": 27,
+   "y": 2,
  }

 ❯ src/app/t7.test.ts:242:25
    240|     h.app.renderNow();
    241|     const box = h.app["lastLayout"]!.panes[0]!;
    242|     expect(box.content).toEqual(box.frame);
       |                         ^
    243|     expect(await h.screen()).not.toContain("┌");
    244|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/app/t7.test.ts > T7 の画面 > H23：off の分割は枠を描かず、境目に線を 1 本だけ描く
AssertionError: expected ' Spaces       開いた順 + │ 1:t1   +      …' not to contain '┌'

- Expected
+ Received

- ┌
+  Spaces       開いた順 + │ 1:t1   +                                                   session: work
+    w1                    │┌─ pane p1 ─────────────────────────┐┌─ pane p2 ─────────────────────────┐
+    w2                    ││                                   ││                                   │
+                          ││                                   ││                                   │
+                          ││                                   ││                                   │
+                          ││                                   ││                                   │
+                          ││                                   ││                                   │
+                          ││                                   ││                                   │
+                          ││                                   ││                                   │
+                          ││                                   ││                                   │
+                          ││                                   ││                                   │
+                        « │└───────────────────────────────────⋯└───────────────────────────────────⋯

 ❯ src/app/t7.test.ts:251:22
    249|     h.app.renderNow();
    250|     const text = await h.screen();
    251|     expect(text).not.toContain("┌");
       |                      ^
    252|     const [a, b] = h.app["lastLayout"]!.panes;
    253|     const x = a!.frame.x + a!.frame.w - 1;

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

restored: sha256 before=fb2c362aacc3cf68 after=fb2c362aacc3cf68 IDENTICAL

===== r1-4-core-notify-2 (2026-09-28T11:53:11)
mutation: src/prefs/load.ts
  - 'typeof o[k] === "boolean" ? (o[k] as boolean) : DEFAULT_NOTIFY_PREFS[k];'
  + 'o[k] === true;'
command: (cd packages/client-core && npx vitest run src/prefs/load.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/prefs/load.test.ts > loadNotifyPrefs > 値ごとに既定へ落とす（toast 入・desktop 切・sound 切）
AssertionError: expected { toast: false, desktop: false, …(1) } to deeply equal { toast: true, desktop: false, …(1) }

- Expected
+ Received

  {
    "desktop": false,
    "sound": false,
-   "toast": true,
+   "toast": false,
  }

 ❯ src/prefs/load.test.ts:100:46
     98|     expect(loadNotifyPrefs([])).toEqual({ toast: true, desktop: false,…
     99|     // 壊れた値は項目ごとの既定（toast は入）
    100|     expect(loadNotifyPrefs({ toast: "no" })).toEqual({ toast: true, de…
       |                                              ^
    101|     expect(loadNotifyPrefs({ toast: false, desktop: "yes", sound: true…
    102|       toast: false,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=a5153f2ac23327e3 after=a5153f2ac23327e3 IDENTICAL

===== r1-6-stophint-stderr (2026-09-28T11:56:05)
mutation: src/app/TuiApp.ts
  - '    if (this.target.stopHint) this.io.writeError(`${this.target.stopHint}\\n`);'
  + ''
command: (cd packages/tui && npx vitest run src/app/reviewR1.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/reviewR1.test.ts > 統合の review r1（端末版） > 初回の token と止め方の注意の両方を、代替画面の前に標準エラーへ出し、画面の知らせにも順に出す
AssertionError: expected 'soda: token URL\n2 行目\n' to contain 'soda: 止め方の注意'

- Expected
+ Received

- soda: 止め方の注意
+ soda: token URL
+ 2 行目
+

 ❯ src/app/reviewR1.test.ts:18:17
     16|     const err = h.io.errors();
     17|     expect(err).toContain("soda: token URL");
     18|     expect(err).toContain("soda: 止め方の注意");
       |                 ^
     19|     const app = h.app as unknown as {
     20|       notice: string | null;

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/app/reviewR1.test.ts > 統合の review r1（端末版） > 止め方の注意だけのときも標準エラーと知らせに出す
AssertionError: expected '' to contain 'soda: 止め方の注意'

- Expected
+ Received

- soda: 止め方の注意

 ❯ src/app/reviewR1.test.ts:32:27
     30|     const h = await startedApp({ target: { stopHint: "soda: 止め方の注意" } …
     31|     closers.push(h.close);
     32|     expect(h.io.errors()).toContain("soda: 止め方の注意");
       |                           ^
     33|     expect((h.app as unknown as { notice: string | null }).notice).toB…
     34|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

restored: sha256 before=ea67fd7285666a67 after=ea67fd7285666a67 IDENTICAL

===== r1-6-notice-chain (2026-09-28T11:56:09)
mutation: src/app/TuiApp.ts
  - '      if (!this.ended) this.showNotices(rest, ms);'
  + ''
command: (cd packages/tui && npx vitest run src/app/reviewR1.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/reviewR1.test.ts > 統合の review r1（端末版） > 初回の token と止め方の注意の両方を、代替画面の前に標準エラーへ出し、画面の知らせにも順に出す
AssertionError: expected null to be '二つ目' // Object.is equality

- Expected:
"二つ目"

+ Received:
null

 ❯ src/app/reviewR1.test.ts:26:47
     24|     app.showNotices(["一つ目", "二つ目"], 30);
     25|     expect(app.notice).toBe("一つ目");
     26|     await vi.waitFor(() => expect(app.notice).toBe("二つ目"));
       |                                               ^
     27|   });
     28|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=ea67fd7285666a67 after=ea67fd7285666a67 IDENTICAL

===== r1-6-notice-old (2026-09-28T11:56:14)
mutation: src/app/TuiApp.ts
  - '    this.showNotices(notices);'
  + '    this.showNotice(this.target.startupNotice ?? null);'
command: (cd packages/tui && npx vitest run src/app/reviewR1.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/reviewR1.test.ts > 統合の review r1（端末版） > 止め方の注意だけのときも標準エラーと知らせに出す
AssertionError: expected null to be 'soda: 止め方の注意' // Object.is equality

- Expected:
"soda: 止め方の注意"

+ Received:
null

 ❯ src/app/reviewR1.test.ts:33:68
     31|     closers.push(h.close);
     32|     expect(h.io.errors()).toContain("soda: 止め方の注意");
     33|     expect((h.app as unknown as { notice: string | null }).notice).toB…
       |                                                                    ^
     34|   });
     35|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=ea67fd7285666a67 after=ea67fd7285666a67 IDENTICAL

===== r1-6-expect-stop-call (2026-09-28T11:56:16)
mutation: src/actions/TuiDispatcher.ts
  - '        if (!remote) this.host.serverStopRequested?.();'
  + ''
command: (cd packages/tui && npx vitest run src/actions/TuiDispatcher.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — stop_server > 手元のサーバの停止が通ったら serverStopRequested を呼ぶ。断られたら呼ばない
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
 ❯ src/actions/TuiDispatcher.test.ts:1000:23
    998|     ok.d.confirmStopServer();
    999|     await flush();
    1000|     expect(requested).toHaveBeenCalledTimes(1);
       |                       ^
    1001|     const ng = harness(snapshot(), { "server.stop": codeError("server_…
    1002|     const notRequested = vi.fn();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=00c6fdb6bbbde406 after=00c6fdb6bbbde406 IDENTICAL

===== r1-6-remote (2026-09-28T11:56:18)
mutation: src/actions/TuiDispatcher.ts
  - '        if (!remote) this.host.serverStopRequested?.();'
  + '        this.host.serverStopRequested?.();'
command: (cd packages/tui && npx vitest run src/actions/TuiDispatcher.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — stop_server > 別のマシンのサーバを止めても serverStopRequested は呼ばない（手元の接続は続く）
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array []


Number of calls: 1

 ❯ src/actions/TuiDispatcher.test.ts:1022:27
    1020|     await flush();
    1021|     expect(h.sent("server.stop")).toEqual([{}]);
    1022|     expect(requested).not.toHaveBeenCalled();
       |                           ^
    1023|   });
    1024| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=00c6fdb6bbbde406 after=00c6fdb6bbbde406 IDENTICAL

===== r1-6-net-onstopped (2026-09-28T11:56:20)
mutation: src/net/TuiNet.ts
  - 'if (this.stopExpected && this.h.onStopped) {'
  + 'if (false) {'
command: (cd packages/tui && npx vitest run src/net/TuiNet.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/TuiNet.test.ts > TuiNet（接続・再ログイン。AC10・AC11・AC12） > 利用者が止めたサーバ（expectStop の後）が居なくなったら、fatal ではなく onStopped で終える（統合の review）
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
 ❯ src/net/TuiNet.test.ts:145:23
    143|     await flush();
    144|     await flush();
    145|     expect(onStopped).toHaveBeenCalledTimes(1);
       |                       ^
    146|     expect(h.onFatal).not.toHaveBeenCalled();
    147|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=409ab813b70a738a after=409ab813b70a738a IDENTICAL

===== r1-6-app-exit0 (2026-09-28T11:56:23)
mutation: src/app/TuiApp.ts
  - 'onStopped: () => this.finish(0,'
  + 'onStopped: () => this.finish(1,'
command: (cd packages/tui && npx vitest run src/app/reviewR1.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/reviewR1.test.ts > 統合の review r1（端末版） > 手元のサーバを止めた後にサーバが居なくなったら、終了コード 0 で「サーバを止めました」
AssertionError: expected 1 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 1

 ❯ src/app/reviewR1.test.ts:47:29
     45|     await vi.waitFor(() => expect(net.stopExpected).toBe(true));
     46|     net.h.onStopped();
     47|     expect(await h.running).toBe(0);
       |                             ^
     48|     expect(h.io.errors()).toContain("サーバを止めました");
     49|     h.outer.dispose();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=ea67fd7285666a67 after=ea67fd7285666a67 IDENTICAL
=== 統合の review r2 の差し戻し（2026-09-28） ===

===== r2-3-clear-expect (2026-09-28T12:13:14)
mutation: src/net/TuiNet.ts
  - '      this.stopExpected = false;\n'
  + ''
command: (cd packages/tui && npx vitest run src/net/TuiNet.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/TuiNet.test.ts > TuiNet（接続・再ログイン。AC10・AC11・AC12） > expectStop の後でも繋ぎ直せたら取り消し、その後に居なくなったら fatal で終える（統合の review r2）
AssertionError: expected "vi.fn()" to be called with arguments: [ StringContaining "stopped" ]

Number of calls: 0

 ❯ src/net/TuiNet.test.ts:177:25
    175|     s2.close(1006);
    176|     await vi.waitFor(() =>
    177|       expect(h.onFatal).toHaveBeenCalledWith(expect.stringContaining("…
       |                         ^
    178|     );
    179|     expect(onStopped).not.toHaveBeenCalled();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=e680a0e42eb6da45 after=e680a0e42eb6da45 IDENTICAL

===== r2-1-toolarge-mark (2026-09-28T12:13:17)
mutation: src/actions/PrefsSync.ts
  - '          this.markMigratedIfDone();\n          return;'
  + '          return;'
command: (cd packages/web && npx vitest run src/actions/PrefsSync.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/actions/PrefsSync.test.ts > PrefsSync（初回の移行） > まだ移していないブラウザの種が大きすぎて断られても移し終えた印を付け、次の読み込みでは送らず知らせない
AssertionError: load 1: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/actions/PrefsSync.test.ts:250:49
    248|       allSets.push(...sets.map((x) => x.patch));
    249|       allToasts.push(...toasts);
    250|       expect(isPrefsMigrated(), `load ${load}`).toBe(true);
       |                                                 ^
    251|     }
    252|     expect(allSets).toEqual([{ theme: "nord" }]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=3e855291fd7207aa after=3e855291fd7207aa IDENTICAL

===== r2-2-no-merge (2026-09-28T12:13:20)
mutation: src/actions/PrefsSync.ts
  - 'r.rev === 0 || !Object.hasOwn(r.prefs, k) ? value : mergeMissing(value, r.prefs[k]);'
  + 'r.rev === 0 || !Object.hasOwn(r.prefs, k) ? value : undefined;'
command: (cd packages/web && npx vitest run src/actions/PrefsSync.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/actions/PrefsSync.test.ts > PrefsSync（初回の移行） > ブラウザに 20 個の割り当て、端末版が先に 1 個を書いたサーバへ繋ぐと、サーバと手元の両方に 21 個（同じ操作はサーバが勝つ）
AssertionError: expected { bindings: { …(2) } } to deeply equal { bindings: { …(21) }, …(1) }

- Expected
+ Received

  {
    "bindings": {
-     "close_tab": [
-       "ctrl+alt+r",
-     ],
-     "close_workspace": [
-       "ctrl+alt+k",
-     ],
-     "detach": [
-       "ctrl+alt+b",
-     ],
-     "goto": [
-       "ctrl+alt+h",
-     ],
      "help": [
        "ctrl+alt+y",
      ],
      "move_tab_previous": [
        "ctrl+alt+x",
-     ],
-     "new_tab": [
-       "ctrl+alt+m",
-     ],
-     "new_workspace": [
-       "ctrl+alt+i",
-     ],
-     "new_worktree": [
-       "ctrl+alt+l",
-     ],
-     "next_tab": [
-       "ctrl+alt+n",
-     ],
-     "next_workspace": [
-       "ctrl+alt+t",
-     ],
-     "open_notification_target": [
-       "ctrl+alt+d",
-     ],
-     "previous_tab": [
-       "ctrl+alt+o",
-     ],
-     "previous_workspace": [
-       "ctrl+alt+s",
-     ],
-     "reload_config": [
-       "ctrl+alt+e",
-     ],
-     "rename_tab": [
-       "ctrl+alt+q",
-     ],
-     "rename_workspace": [
-       "ctrl+alt+j",
-     ],
-     "settings": [
-       "ctrl+alt+c",
-     ],
-     "stop_server": [
-       "ctrl+alt+f",
-     ],
-     "switch_tab": [
-       "ctrl+alt+p",
-     ],
-     "workspace_picker": [
-       "ctrl+alt+g",
-     ],
-   },
-   "commands": {
-     "deploy": [
-       "ctrl+alt+z",
      ],
    },
  }
restored: sha256 before=3e855291fd7207aa after=3e855291fd7207aa IDENTICAL

===== r2-2-shallow (2026-09-28T12:13:23)
mutation: src/actions/PrefsSync.ts
  - '    const inner = mergeMissing(v, server[k]);'
  + '    const inner = undefined;'
command: (cd packages/web && npx vitest run src/actions/PrefsSync.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/actions/PrefsSync.test.ts > PrefsSync（初回の移行） > ブラウザに 20 個の割り当て、端末版が先に 1 個を書いたサーバへ繋ぐと、サーバと手元の両方に 21 個（同じ操作はサーバが勝つ）
AssertionError: expected { bindings: { …(2) }, …(1) } to deeply equal { bindings: { …(21) }, …(1) }

- Expected
+ Received

@@ -1,69 +1,12 @@
  {
    "bindings": {
-     "close_tab": [
-       "ctrl+alt+r",
-     ],
-     "close_workspace": [
-       "ctrl+alt+k",
-     ],
-     "detach": [
-       "ctrl+alt+b",
-     ],
-     "goto": [
-       "ctrl+alt+h",
-     ],
      "help": [
        "ctrl+alt+y",
      ],
      "move_tab_previous": [
        "ctrl+alt+x",
-     ],
-     "new_tab": [
-       "ctrl+alt+m",
-     ],
-     "new_workspace": [
-       "ctrl+alt+i",
-     ],
-     "new_worktree": [
-       "ctrl+alt+l",
-     ],
-     "next_tab": [
-       "ctrl+alt+n",
-     ],
-     "next_workspace": [
-       "ctrl+alt+t",
-     ],
-     "open_notification_target": [
-       "ctrl+alt+d",
-     ],
-     "previous_tab": [
-       "ctrl+alt+o",
-     ],
-     "previous_workspace": [
-       "ctrl+alt+s",
-     ],
-     "reload_config": [
-       "ctrl+alt+e",
-     ],
-     "rename_tab": [
-       "ctrl+alt+q",
-     ],
-     "rename_workspace": [
-       "ctrl+alt+j",
-     ],
-     "settings": [
-       "ctrl+alt+c",
-     ],
-     "stop_server": [
-       "ctrl+alt+f",
-     ],
-     "switch_tab": [
-       "ctrl+alt+p",
-     ],
-     "workspace_picker": [
-       "ctrl+alt+g",
      ],
    },
    "commands": {
      "deploy": [
        "ctrl+alt+z",

 ❯ src/actions/PrefsSync.test.ts:287:34
restored: sha256 before=3e855291fd7207aa after=3e855291fd7207aa IDENTICAL

===== r2-2-local-wins (2026-09-28T12:13:25)
mutation: src/actions/PrefsSync.ts
  - '  const out: Record<string, unknown> = { ...server };'
  + '  const out: Record<string, unknown> = { ...server, ...local };'
command: (cd packages/web && npx vitest run src/actions/PrefsSync.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/actions/PrefsSync.test.ts > PrefsSync（初回の移行） > ブラウザに 20 個の割り当て、端末版が先に 1 個を書いたサーバへ繋ぐと、サーバと手元の両方に 21 個（同じ操作はサーバが勝つ）
AssertionError: expected { bindings: { …(21) }, …(1) } to deeply equal { bindings: { …(21) }, …(1) }

- Expected
+ Received

@@ -11,11 +11,11 @@
      ],
      "goto": [
        "ctrl+alt+h",
      ],
      "help": [
-       "ctrl+alt+y",
+       "ctrl+alt+a",
      ],
      "move_tab_previous": [
        "ctrl+alt+x",
      ],
      "new_tab": [

 ❯ src/actions/PrefsSync.test.ts:287:34
    285|     };
    286|     expect(Object.keys(expected.bindings)).toHaveLength(21);
    287|     expect(server.prefs["keys"]).toEqual(expected);
       |                                  ^
    288|     expect(server.prefs["notify"]).toEqual({ toast: true, sound: true …
    289|     expect(stored()["keys"]).toEqual(expected);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=3e855291fd7207aa after=3e855291fd7207aa IDENTICAL

===== r2-2-always-send (2026-09-28T12:13:28)
mutation: src/actions/PrefsSync.ts
  - '  return added ? out : undefined;'
  + '  return out;'
command: (cd packages/web && npx vitest run src/actions/PrefsSync.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/actions/PrefsSync.test.ts > PrefsSync（初回の移行） > オブジェクトの項目でも、サーバに無い中身が無ければ送らない（配列・値は葉でサーバが勝つ）
AssertionError: expected [ { patch: { keys: { …(1) } }, …(1) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "baseRev": 2,
+     "patch": {
+       "keys": {
+         "bindings": {
+           "a": [
+             "y",
+           ],
+         },
+       },
+     },
+   },
+ ]

 ❯ src/actions/PrefsSync.test.ts:300:18
    298|     sync.onOpened();
    299|     await flush();
    300|     expect(sets).toEqual([]);
       |                  ^
    301|     expect(stored()["keys"]).toEqual({ bindings: { a: ["y"] } });
    302|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=3e855291fd7207aa after=3e855291fd7207aa IDENTICAL

===== r2-2-leftover (2026-09-28T12:13:30)
mutation: src/actions/PrefsSync.ts
  - '          if (seed === undefined) this.pending.delete(k);'
  + '          if (seed === undefined) continue;'
command: (cd packages/web && npx vitest run src/actions/PrefsSync.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/actions/PrefsSync.test.ts > PrefsSync（移行・失敗・大きすぎるの競合） > S2: 移行の送信が失敗しても、溜めた変更を捨てない。その間にほかのクライアントが移したら、利用者の変更だけ残して種は捨てる
AssertionError: expected [ { statusSymbols: false, …(1) } ] to deeply equal [ { statusSymbols: false } ]

- Expected
+ Received

  [
    {
      "statusSymbols": false,
+     "theme": "nord",
    },
  ]

 ❯ src/actions/PrefsSync.test.ts:499:38
    497|     sync.onOpened();
    498|     await flush();
    499|     expect(sets.map((x) => x.patch)).toEqual([{ statusSymbols: false }…
       |                                      ^
    500|     expect(useSettingsStore(pinia).statusSymbols).toBe(false);
    501|     expect(useSettingsStore(pinia).theme).toBe("dracula");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=3e855291fd7207aa after=3e855291fd7207aa IDENTICAL
```

## 受け入れ基準ごとの判定
- AC1: pass（pty の実物の `soda`：裏の起動・接続。smoke 10 本目）
- AC2: pass（描画・分割・大きさの追従〔単体〕・狭い幅）
- AC3: pass（prefix+q・SIGHUP・再接続でスクロールバック。smoke）
- AC4: 未検証（SSH 越しの実機は無し。手元の pty と同じ経路。手順は docs/verification.md）
- AC5: pass（全 56＋D-7 操作の RPC 照合・結合）
- AC6: pass（色・全角・マウスの受け渡し・ブラケットペースト〔単体〕。vim・htop・Claude Code の実物の見た目は未確認）
- AC7: pass（copy モード・マウスの選択・OSC 52・手元の道具）
- AC8: pass（共有のキーマップ・プリセット・直接のキー）
- AC9: pass（herdr の M1〜M14〔M6 の下線は非対応・理由つき〕と Web の拡張 W01〜W03）
- AC10: pass（状態の記号・集約・既読。bench (c) で出るまで 263 ms）
- AC11: pass（ブラウザ相当と端末版の同時接続・構成と入力の反映〔smoke〕。設定の共有〔単体・結合〕。最後に操作した側の大きさ〔結合〕）
- AC12: pass（端末版 2 つの同時接続。smoke と結合テスト）
- AC13: pass（通知の経路・OSC 9/99/777・tmux・prefix+o〔単体〕。外側の端末での実際の表示は未確認）
- AC14: pass（マシンの一覧・要約・切り替え〔単体・偽の接続〕。本物の SSH 先は未確認。machine の smoke 8 本目は server 側の中継）
- AC15: pass（docs/tui-parity.md。D20 の書き方）
- AC16: 未検証（3 つの OS の実物の端末。Linux の疑似端末だけ確認）
- AC17: pass（条件つき。足した遅延 p95 11.9〜33.1 ms。(d) の打鍵 p95 は通常負荷 49.6 ms・高負荷 75 ms）
- AC18: pass（local-login の秘密の不一致・別アドレス・回数の制限〔結合〕、4401 での再ログイン）
- AC19: pass（既存のテストは全部通る。移行の説明は docs）
- AC-I1〜AC-I5: pass（オーバーレイ・モードの試験。はじめの案内は AC-I1 の例外〔D19〕）

## 失敗の証跡
このラウンドでは失敗が発生していない（bench の高負荷での外れは 06 の test-result に記録。負の確認の意図した失敗は上の節）。

## 起動確認（smoke）
上の `aidev smoke` の出力（pass・10 本）。

## 未検証の穴（skip / 環境不足）
- Windows ネイティブ（ConPTY・Windows Terminal の入力・WMI での裏の起動・`rundll32` のリンク・PowerShell の画像の読み取り・`%LOCALAPPDATA%` の ACL）。
- WSL2 の Windows Terminal・VS Code の統合端末での実物の見た目・IME の候補窓の位置。
- SSH 越し（AC4）・本物の SSH 先のマシン（AC14）。
- 外側の端末ごとのデスクトップ通知・Kitty graphics・OSC 52 の実際の表示。
- vim・htop・Claude Code などの実物の TUI の見た目（AC6）。
- E2E（ブラウザ）は回していない。設定がブラウザ同士で共有されるようになった（D3）ことの E2E への影響は未確認。
- 高負荷のマシンでの (d) の打鍵の p95（AC17）。
