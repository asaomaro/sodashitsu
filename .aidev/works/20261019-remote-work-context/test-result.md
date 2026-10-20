# 検証結果

## 対象

接続先skills・work binding・ファイル/exec/メモ・Claude/Codexの主会話転送。私用の会話/メモ・本物の接続先PCには転送していない。native動作確認は一時HOMEのfixtureだけ。

## 通過済み

- 実サーバ2台のCLI統合（相手にエージェント不要）、skills/read/search/edit/exec/memory、PJ変更と切断、手元PJが不変であること。
- 対象42件、続く文書/skill整合性を含む44件。追加境界試験（scope内部競合・新規メモ作成直前・TTL失効・公開途中のPJ変更）も通過。
- Codex CLI 0.163.0の実app-serverで、転送fixtureのthread/readがユーザーメッセージ・会話ID・接続先cwdを読み込む。モデル要求なし。Claudeは会話構造・保存先・resume argvのfixture検証まで。
- build/typecheckを通過。最終版の全体build/typecheckは通過。全体vitestは11,222件通過、1 suiteのbeforeAllがdist鮮度チェックで停止（その間にfiles.tsの最終補強を追加したため）。再ビルド後に停止したPTY試験を含む関連59件が全件通過。実ブラウザのsmokeもPASS。

## 独立レビュー

`/root/review_view_maximize`が実装とは別コンテキストで点検。開始/保存中の切断、exec検証と起動の分離、Windowsの最終リンク、正規Codex履歴名、履歴探索の未完走/同ID並列、PJの実体照合、TTL失効、native公開時のPJ変更、work memoryの引継ぎを修正。修正差分を再レビューし、追加の修正必須なし。親ディレクトリguardの補強も再レビュー済み。

## Negative controls

修正箇所だけを1件ずつ外して実行し、以下の全件で期待するテスト失敗を確認。単体テストはソースを読むためdist再ビルド不要。各ソースを保存時のbytesと完全一致に戻した。生出力:

### scope

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/work/WorkContext.test.ts (8 tests | 1 failed | 7 skipped) 16ms
   × detects a project change during asynchronous scope validation 14ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/work/WorkContext.test.ts > detects a project change during asynchronous scope validation
AssertionError: promise resolved "'/tmp/soda-work-nVl1UH/project'" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
"/tmp/soda-work-nVl1UH/project"

 ❯ src/work/WorkContext.test.ts:76:40
     74|   let calls = 0;
     75|   const changing = new WorkContext(state, () => pane, () => ++calls ==…
     76|   await expect(changing.scope(scope())).rejects.toThrow(/検証中/);
       |                                        ^
     77| });
     78| it("checks the target again before creating a new memory file", async …

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 7 skipped (8)
   Start at  22:55:14
   Duration  840ms (transform 73%, import 24%, tests 2%)


```

### memory-scope

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/work/WorkContext.test.ts (8 tests | 1 failed | 7 skipped) 44ms
   × checks the target again before creating a new memory file 43ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/work/WorkContext.test.ts > checks the target again before creating a new memory file
AssertionError: promise resolved "{ …(3) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "directory": "/tmp/soda-work-u4eQ5Z/project/.soda/agent-memory/62908cb1-8ae5-49e3-bc8a-eae8a438109f",
+   "text": "bad",
+   "version": "2f05d4b689d270cafb02285f35f44866f7dc8a2d368a3f9d1124373eeab31fb1",
  }

 ❯ src/work/WorkContext.test.ts:81:118
     79|   const original = work.scope.bind(work); let calls = 0;
     80|   vi.spyOn(work, "scope").mockImplementation(async p => { if (++calls …
     81|   await expect(work.memory({ ...scope(), sourcePaneId: paneId, action:…
       |                                                                                                                      ^
     82|   await expect(readFile(join(folder, ".soda/agent-memory", paneId, "ME…
     83| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 7 skipped (8)
   Start at  22:55:15
   Duration  787ms (transform 71%, import 22%, tests 7%, worker 1%)


```

### transfer-expiry

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/work/SessionTransfer.test.ts (9 tests | 1 failed | 8 skipped) 47ms
   × rolls back a transfer whose lifetime expires during native publication 46ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/work/SessionTransfer.test.ts > rolls back a transfer whose lifetime expires during native publication
AssertionError: promise resolved "{ …(5) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "cwd": "/tmp/soda-transfer-EUvSXQ/project",
+   "directory": "/tmp/soda-transfer-EUvSXQ/project/.soda/agent-memory/25faed9d-f530-4b35-b701-6f4cf488edc8/handoff-e80716f9-f155-4535-ad16-89b777676c96",
+   "nativePath": "/tmp/soda-transfer-EUvSXQ/target-home/.codex/sessions/2026/10/19/rollout-2026-10-19T13-55-18-6b91f3fb-4fd1-4ccb-9e31-bcccc4995d78.jsonl",
+   "resumeArgv": [
+     "codex",
+     "resume",
+     "6b91f3fb-4fd1-4ccb-9e31-bcccc4995d78",
+     "-C",
+     "/tmp/soda-transfer-EUvSXQ/project",
+     "作業先は/tmp/soda-transfer-EUvSXQ/projectです。/tmp/soda-transfer-EUvSXQ/project/.soda/agent-memory/25faed9d-f530-4b35-b701-6f4cf488edc8/handoff-e80716f9-f155-4535-ad16-89b777676c96/SODASHITSU-HANDOFF.mdと同じフォルダのメモを読み、現在の環境で作業を再開してください。",
+   ],
+   "warnings": [
+     "履歴形式・ツール・MCP・過去の絶対パスの互換性は接続先エージェントのバージョンに依存します",
+   ],
  }

 ❯ src/work/SessionTransfer.test.ts:103:23
    101|   const id = await upload(), finish = transfers.importFinish("receiver…
    102|   await entered; await vi.advanceTimersByTimeAsync(300001); release();
    103|   await expect(finish).rejects.toThrow(/有効期限/);
       |                       ^
    104|   expect((await readdir(home, { recursive: true })).some(f => String(f…
    105| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 skipped (9)
   Start at  22:55:17
   Duration  804ms (transform 71%, import 22%, tests 7%)


```

### codex-name

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/work/SessionTransfer.test.ts (9 tests | 1 failed | 8 skipped) 52ms
   × exports and installs codex history with a target cwd and a non-destructive memory archive 51ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/work/SessionTransfer.test.ts > exports and installs codex history with a target cwd and a non-destructive memory archive
AssertionError: expected '/tmp/soda-transfer-qChmIf/target-home…' to match /rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}…/

- Expected:
/rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-[a-f0-9-]{36}\.jsonl$/

+ Received:
"/tmp/soda-transfer-qChmIf/target-home/.codex/sessions/2026/10/19/rollout-2026-10-19T13-55-19.765Z-153a7b03-e3d4-441c-aa7f-ea420a2cdcac.jsonl"

 ❯ src/work/SessionTransfer.test.ts:48:51
     46|   expect(await readFile(join(result.directory, "SODASHITSU-HANDOFF.md"…
     47|   expect(await readFile(join(result.directory, "SODASHITSU-HANDOFF.md"…
     48|   if (kind === "codex") expect(result.nativePath).toMatch(/rollout-\d{…
       |                                                   ^
     49|   else expect(await readFile(join(result.directory, "MEMORY.md"), "utf…
     50|   const old = await readFile(result.nativePath!, "utf8"), again = awai…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 skipped (9)
   Start at  22:55:18
   Duration  805ms (transform 67%, import 25%, tests 8%)


```

## 実Codexの確認（fixtureのみ）

```text
WARNING: proceeding, even though we could not create PATH aliases: Refusing to create helper binaries under temporary dir "/tmp" (codex_home: AbsolutePathBuf("/tmp/soda-native-codex-ulubFr/home/.codex"))
{"thread":{"id":"4ff82d20-6117-43cf-b5da-0f643190f441","environments":null,"extra":null,"sessionId":"4ff82d20-6117-43cf-b5da-0f643190f441","forkedFromId":null,"parentThreadId":null,"preview":"handoff-fixture-marker","ephemeral":false,"section":null,"sectionEnteredAt":null,"projectId":null,"historyMode":"legacy","modelProvider":"openai","model":null,"reasoningEffort":null,"createdAt":1792368000,"updatedAt":1792417737,"recencyAt":1792417737,"status":{"type":"notLoaded"},"path":"/tmp/soda-native-codex-ulubFr/home/.codex/sessions/2026/10/19/rollout-2026-10-19T13-48-57-4ff82d20-6117-43cf-b5da-0f643190f441.jsonl","cwd":"/tmp/soda-native-codex-ulubFr/project","cliVersion":"0.162.0","originator":"codex_cli_rs","source":"cli","canAcceptDirectInput":null,"threadSource":null,"agentNickname":null,"agentRole":null,"gitInfo":null,"name":null,"daybreakEnabled":null,"turns":[{"id":"fixture-turn","rootTurnId":null,"items":[{"type":"userMessage","id":"item-1","clientId":null,"content":[{"type":"text","text":"handoff-fixture-marker","text_elements":[]}]}],"itemsView":"full","status":"completed","error":null,"startedAt":null,"completedAt":null,"durationMs":null}]},"readState":{"firstUnread":null,"revision":"initial:4ff82d20-6117-43cf-b5da-0f643190f441"}}
{"result":"PASS","check":"installed Codex app-server thread/read loads imported native JSONL without a model request","threadIdMatches":true,"cwdMatches":true}

```

## 全体試験のdist鮮度停止と再確認

全体試験中の追加補強により、distを使うPTY試験が古い成果物での実行を拒否した。再ビルドして同試験と関連59件が通過した。全体を再度重複実行せず、未実行の試験と変更範囲を確認した。生出力:

```text
 FAIL  |@sodashitsu/server| src/launch/soda.pty.integration.test.ts > soda（引数なし）を本物の端末で（node-pty。dist が無ければ skip：先に pnpm build。Windows は対象外）
Error: dist is older than src (run pnpm build first): src/work/files.ts
 ❯ src/launch/soda.pty.integration.test.ts:133:15
    131|       const stale = [...staleOutputs(SERVER_PKG), ...staleOutputs(TUI_…
    132|       if (stale.length > 0)
    133|         throw new Error(
       |               ^
    134|           `dist is older than src (run pnpm build first): ${stale.slic…
    135|         );

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 726 passed (727)
      Tests  11222 passed | 1 skipped (11223)
   Start at  22:56:34
   Duration  670.09s (tests 83%, import 10%, transform 4%, environment 3%)

    Isolate  727 workers spawned · ~164ms startup each (spawn + environment, per file)
             at least ~59.60s faster with isolate: false — reuses workers across files instead of one per file


```

## Negative control: parent-guard

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/work/WorkContext.test.ts (9 tests | 1 failed | 8 skipped) 14ms
   × rejects a skill or memory parent directory link rather than reading unrelated files 13ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/work/WorkContext.test.ts > rejects a skill or memory parent directory link rather than reading unrelated files
AssertionError: promise resolved "'outside'" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
"outside"

 ❯ src/work/WorkContext.test.ts:72:59
     70|   await writeFile(join(home, "secret.md"), "outside");
     71|   await symlink(home, join(folder, "linked"), process.platform === "wi…
     72|   await expect(textFile(join(folder, "linked/secret.md"))).rejects.toT…
       |                                                           ^
     73| });
     74| it("refuses a replaced project identity even if the configured folder …

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 skipped (9)
   Start at  23:08:38
   Duration  761ms (transform 73%, import 24%, tests 2%)


```

## Negative control: legacy-id

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/protocol| src/work.test.ts (12 tests | 1 failed | 11 skipped) 9ms
   × accepts restored legacy entity IDs for every work entry point 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/protocol| src/work.test.ts > accepts restored legacy entity IDs for every work entry point
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/work.test.ts:5:90
      3| const scope = { workspaceId: "w3", expectedFolder: "/project", agentKi…
      4| it("accepts restored legacy entity IDs for every work entry point", ()…
      5|   expect(WorkMethods["work.binding"].safeParse({ action: "get", paneId…
       |                                                                                          ^
      6|   expect(WorkMethods["work.inspect"].safeParse(scope).success).toBe(tr…
      7|   expect(WorkMethods["work.memory"].safeParse({ ...scope, sourcePaneId…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 11 skipped (12)
   Start at  23:11:27
   Duration  253ms (import 55%, transform 35%, tests 8%, worker 2%)


```

## 稼働環境の互換性確認

初回live probeで、以前から保存されたworkspace `w3`がUUID検証で拒否されることを検出。pane `p3`も存在するため、作成済みの安全な旧IDを受け入れる共通entityIdへ修正。新規ID生成はUUIDのまま。path区切り/NUL/Windowsデバイス名を拒否する回帰試験を追加し、旧制約へ戻したnegative controlの失敗を確認。再ビルド・関連62件・稼働環境再確認が全て通過。旧ID互換性の修正差分も独立レビュー通過。

## 最終結果

- 全体build/typecheck通過、全体vitest 11,222件成功。dist鮮度で保留になったPTY試験は再ビルド後に成功。最終追加分を含む関連62件が通過。
- 実Chromiumでログイン・端末表示・PTY入力往復のsmoke PASS。
- 稼働中Aはhandoffで7個の稼働ペインを維持して更新。snapshotは従来の停止済みを含む9ペイン。既存w3/p3でworkの取得と74個のスキル検出を確認（上限未到達）。
- sr-pcはconnectingで接続できないためBへの実環境更新は未実施。ユーザーの実会話・メモの転送やnative resume起動は行っていない。

```text
soda: handing off 7 pane(s) of pid 9369 to the soda on disk…
soda: handoff complete: 7 pane(s) kept running
{"panes":9,"bindingMethodAvailable":true,"legacyPaneAccepted":true,"existingBinding":false,"catalogAvailable":true,"legacyWorkspaceAccepted":true,"skillCount":74,"truncated":false,"machines":[{"label":"sr-pc","state":"connecting"}]}

```
