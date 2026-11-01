# 検証記録

隔離worktreeで生成JSONL/メモリ端末/偽RPC/ヘッドレスDOMのみ使用。実agent/model呼出し、OS画面・入力・録音・サービス設定変更なし。

- 関連5 files / 99 tests成功、actor交代2ケース追加後の全体試験は933 files / 13,457 tests成功（各1 skipped）。型補正後の関連2 files / 68 testsも成功。
- `verify:ui`: Chromium headless1217で既存UIと追加2種類の送受信DOM/宛先/HTML非実行を確認し成功。実Electronの実機検証とは別。
- 型検査中の一時negativeファイル削除によるTS6053は試験ハーネスの並列実行によるもの。privateコピー削除とtest fixtureの必須reportedAt/literal型補正後に全体型検査を独立再実行して成功。負例の証拠には使わない。

- `pnpm build`: 成功（内蔵assistant資材のbuildのみ。OS実行なし）。
- `pnpm typecheck`: 全packageとscripts成功。
- `pnpm exec vitest run --maxWorkers=4`: 933 passed / 1 skipped files、13,457 passed / 1 skipped tests。
- 文書の管理IDはR1–R5/U1–U12の17件を維持、変更文書のローカルリンク照合成功。
- 初回CIは上記test fixture型不足で失敗。修正版でCIを再実行し、通過後に統合する。起動前チェックとhandoffは統合後のmainを固定して行う。

## 負例

本番sourceは変えず隣接privateコピーを試験し、終了時にコピーを削除、元source一致をassert。旧2種類だけのgate、verified evidence検査の欠落、取得後の会話ID再検査の欠落、reset clearの欠落を各々再現。意図したAssertionErrorで失敗し、同じコピーを現在sourceに戻して成功。

### ui: negative

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-assistant-more-agents

 ❯ |@sodashitsu/desktop-assistant| src/assistantChat.negative.test.ts (22 tests | 2 failed | 20 skipped) 2114ms
   × displays copilot conversation text, replaces the bounded snapshot after history rewrites 1059ms
   × displays agy conversation text, replaces the bounded snapshot after history rewrites 1053ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/assistantChat.negative.test.ts > displays copilot conversation text, replaces the bounded snapshot after history rewrites
 FAIL  |@sodashitsu/desktop-assistant| src/assistantChat.negative.test.ts > displays agy conversation text, replaces the bounded snapshot after history rewrites
AssertionError: expected undefined to be 'generated answer' // Object.is equality

- Expected:
"generated answer"

+ Received:
undefined

 ❯ src/assistantChat.negative.test.ts:327:86


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 20 skipped (22)
   Start at  10:02:44
   Duration  2.80s (tests 78%, transform 17%, import 5%)


```

### ui: restored

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-assistant-more-agents


 Test Files  1 passed (1)
      Tests  2 passed | 20 skipped (22)
   Start at  10:02:48
   Duration  734ms (transform 62%, import 20%, tests 17%)


```

### verified: negative

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-assistant-more-agents

 ❯ |@sodashitsu/server| src/assistant/AssistantSessions.negative.test.ts (46 tests | 1 failed | 45 skipped) 20ms
   × rejects a stored reference without fresh evidence from the current actor 18ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.negative.test.ts > rejects a stored reference without fresh evidence from the current actor
AssertionError: expected [Function] to throw an error

- Expected:
null

+ Received:
undefined

 ❯ src/assistant/AssistantSessions.negative.test.ts:852:68
    850|  const f=await fixture(),{device,info,agent}=await f.ready();
    851|  f.session.getPane(info.paneId)!.agentSession={kind:"codex",sessionId:…
    852|  expect(()=>f.manager.conversationTarget(device,agent.instanceId)).toT…
       |                                                                    ^
    853| });
    854|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 45 skipped (46)
   Start at  10:02:49
   Duration  1.27s (transform 81%, import 17%, tests 2%)


```

### verified: restored

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-assistant-more-agents


 Test Files  1 passed (1)
      Tests  1 passed | 45 skipped (46)
   Start at  10:02:51
   Duration  1.37s (transform 82%, import 16%, tests 1%)


```

### late: negative

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-assistant-more-agents

 ❯ |@sodashitsu/server| src/assistant/AssistantSessions.negative.test.ts (46 tests | 1 failed | 45 skipped) 22ms
   × discards pending conversation text after session changes 21ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantSessions.negative.test.ts > discards pending conversation text after session changes
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/assistant/AssistantSessions.negative.test.ts:846:193


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 45 skipped (46)
   Start at  10:02:53
   Duration  1.34s (transform 81%, import 17%, tests 2%)


```

### late: restored

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-assistant-more-agents


 Test Files  1 passed (1)
      Tests  1 passed | 45 skipped (46)
   Start at  10:02:55
   Duration  1.34s (transform 82%, import 17%, tests 2%)


```

### reset: negative

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-assistant-more-agents

 ❯ |@sodashitsu/desktop-assistant| src/assistantChat.negative.test.ts (22 tests | 2 failed | 20 skipped) 119ms
   × displays copilot conversation text, replaces the bounded snapshot after history rewrites 64ms
   × displays agy conversation text, replaces the bounded snapshot after history rewrites 54ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/assistantChat.negative.test.ts > displays copilot conversation text, replaces the bounded snapshot after history rewrites
 FAIL  |@sodashitsu/desktop-assistant| src/assistantChat.negative.test.ts > displays agy conversation text, replaces the bounded snapshot after history rewrites
AssertionError: expected [ { id: 'generated-row', …(2) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "id": "generated-row",
+     "role": "assistant",
+     "text": "rewritten history",
+   },
+ ]

 ❯ src/assistantChat.negative.test.ts:329:181


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 20 skipped (22)
   Start at  10:03:00
   Duration  1.04s (transform 69%, import 19%, tests 12%)


```

### reset: restored

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-assistant-more-agents


 Test Files  1 passed (1)
      Tests  2 passed | 20 skipped (22)
   Start at  10:03:02
   Duration  939ms (transform 67%, import 19%, tests 13%)


```
