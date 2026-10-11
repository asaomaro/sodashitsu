# 検証記録

モデル正規化/独自モデル維持/モデル利用不可の秘匿表示を含むSummaryServiceの4テスト通過。sandbox内はspawnされたNodeの標準出力が空になり、最小のspawn console.logでも再現したため、制限外で実行して通過を確認。

## 負の対照（生の出力）

正規化の2行だけを戻すと失敗し、保存した修正後ファイルへ復元してバイト一致を確認。

```text

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/conversation/SummaryService.test.ts (4 tests | 1 failed | 3 skipped) 205ms
   × uses the canonical GPT model ID for Codex summaries 204ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/conversation/SummaryService.test.ts > uses the canonical GPT model ID for Codex summaries
AssertionError: expected 'GPT-6-Luna' to be 'gpt-6-luna' // Object.is equality

Expected: "gpt-6-luna"
Received: "GPT-6-Luna"

 ❯ src/conversation/SummaryService.test.ts:96:61
     94|     });
     95|     const launch = JSON.parse(await readFile(f.log, "utf8"));
     96|     expect(launch.args[launch.args.indexOf("--model") + 1]).toBe("gpt-…
       |                                                             ^
     97|     expect(result.model).toBe("gpt-6-luna");
     98|     await f.service.generate("p", { kind: "codex", model: "CustomProvi…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  22:15:53
   Duration  628ms (transform 46%, tests 37%, import 16%, worker 1%)

undefined
/workspaces/sodashitsu/packages/server:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/conversation/SummaryService.test.ts -t canonical GPT

```

## 共有設定の負の対照（生の出力）

適用処理の2行のみを戻して回帰テスト失敗、修正後へバイト一致で復元。

```text

 RUN  v5.0.1 /workspaces/sodashitsu/packages/web

 ❯ src/store/prefsApply.test.ts (4 tests | 1 failed | 3 skipped) 14ms
   ❯ applyPrefsToStores (4)
     × applies saved conversation settings on connection and resets removed settings 13ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/store/prefsApply.test.ts > applyPrefsToStores > applies saved conversation settings on connection and resets removed settings
AssertionError: expected { kind: 'claude', model: '', …(1) } to deeply equal { kind: 'codex', …(2) }

- Expected
+ Received

  {
-   "kind": "codex",
-   "model": "GPT-6-Luna",
+   "kind": "claude",
+   "model": "",
    "sessionId": "",
  }

 ❯ src/store/prefsApply.test.ts:61:38
     59|     const summary = { kind: "codex", model: "GPT-6-Luna", sessionId: "…
     60|     applyPrefsToStores(pinia, { summarySettings: summary, agentHeaderA…
     61|     expect(settings.summarySettings).toEqual(summary);
       |                                      ^
     62|     expect(settings.agentHeaderActions).toEqual(["summary"]);
     63|     applyPrefsToStores(pinia, {});

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  22:20:55
   Duration  1.22s (transform 68%, import 15%, environment 15%, tests 1%)

undefined
/workspaces/sodashitsu/packages/web:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/store/prefsApply.test.ts -t saved conversation

```

## 最終結果

- 全体vitest: 577ファイル、10,485件成功。
- conversation-toolsブラウザテスト: 4件成功。保存済みCodex設定の表示、固定エラーの表示、生診断の非表示を画面で確認。最初のE2EがprefsApplyの適用漏れを検出し、修正後に通過。
- build/typecheck通過。CLI実行のモデルID/独自モデル維持の検証には偽Codexを使用。実際のモデルへの有料生成は実行していない。
- review_fork_multiが差分全体を独立点検、prefsApply追加修正も再レビューし指摘なし。
- TabViews.vue/TabViews.test.ts/.claudeの既存変更は保持。

## 巨大行の負の対照（生の出力）

巨大行を読み飛ばす修正箇所だけを元のthrowへ戻して失敗を確認し、バイト一致で復元。

```text

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/conversation/ConversationService.test.ts (7 tests | 1 failed | 6 skipped) 24ms
   × skips oversized records and continues with stable byte offsets after them 23ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/conversation/ConversationService.test.ts > skips oversized records and continues with stable byte offsets after them
RpcError: 会話記録の行が読み取り上限を超えています
 ❯ ConversationService.read src/conversation/ConversationService.ts:146:15
    144|       }
    145|       if (!used && bytes.length && offset + bytes.length < st.size)
    146|         throw new RpcError("invalid_params", "会話記録の行が読み取り上限を超えています");
       |               ^
    147|       return {
    148|         kind,
 ❯ src/conversation/ConversationService.test.ts:39:19

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  22:33:43
   Duration  467ms (transform 70%, import 22%, tests 6%, worker 1%)

undefined
/workspaces/sodashitsu/packages/server:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/conversation/ConversationService.test.ts -t skips oversized

```

## 実際のペインでの確認

起動中サーバのこのペインへ同じ要約要求を送り、invalid_params「会話記録の行が読み取り上限を超えています」を確認。対象CodexJSONLは約51.7MB、1MiB超行が複数あり最大4MB。新readで46ページ/317メッセージを取得できた。

`soda handoff`で6ペインを保持して修正版へ切替後、このペインの要約を実行し成功。gpt-6-luna、要約655文字、記録task_completeに結果あり・errorなしを確認。先の「有料生成未実行」はモデルID修正だけの確認時点の記録であり、今回の実動作確認では実モデルで要約した。

ビルド・typecheck通過、ConversationService 7件通過、巨大行を含む会話の成功とpartialの画面表示を含むブラウザ4件通過。全体テスト最終結果: 577ファイル、10,488件成功。

全ての修正はローカル未コミット。起動中サーバにはhandoffで反映済み。
