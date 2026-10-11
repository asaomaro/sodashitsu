# 検証

- build/typecheck: 成功。
- 対象テスト: SummaryService 10件、ConversationService 7件、計17件成功。
- ブラウザE2E: conversation-tools 4件成功。DOMで保存済み要約の再表示・再生成を確認。右下からドラッグし、実際の幅・高さが縮むことをboundingBoxで確認。
- 全体テスト: 576ファイル・10,492件成功。soda.pty.integration.test.tsのみ、テスト実行中に最後の修正を行ったためdistがsrcより古いという事前チェックで停止。最後の追加テスト1件は対象テストで成功。最終build後に該当PTYテストを再実行して1件成功。対象テストの最後の追加1件と合わせ、計10,494件の成功を確認。
- 回帰テストのnegative control: モデル変更時の基準を取り直す修正だけを外すと、追記＋モデル変更テストが失敗した。実装はバイト単位で一致する状態に復元。

## Negative control の生出力

```text

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/conversation/SummaryService.test.ts (10 tests | 1 failed | 9 skipped) 385ms
   × rebuilds with a new model when the cached source has appended data 384ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/conversation/SummaryService.test.ts > rebuilds with a new model when the cached source has appended data
AssertionError: promise rejected "RpcError: 会話記録が変更されました。読み直してください { code: '…' }" instead of resolving
 ❯ src/conversation/SummaryService.test.ts:209:6
    207|     await expect(
    208|       f.service.generate("p", { ...settings, model: "different" }),
    209|     ).resolves.toMatchObject({ model: "different" });
       |      ^
    210|     expect(f.read.mock.calls[0]?.[2]).toBe(0);
    211|   },

Caused by: RpcError: 会話記録が変更されました。読み直してください
 ❯ SummaryService.verifySource src/conversation/SummaryService.ts:212:13
 ❯ SummaryService.generate src/conversation/SummaryService.ts:472:21
 ❯ src/conversation/SummaryService.test.ts:207:5

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Serialized Error: { code: 'not_found', toProtocolError: 'Function<toProtocolError>' }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  23:02:44
   Duration  821ms (tests 52%, transform 36%, import 12%)

undefined
/workspaces/sodashitsu/packages/server:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/conversation/SummaryService.test.ts -t rebuilds with a new model

```

TUIの保存済み要約でも、省略・未反映・更新日時・モデルを表示する小さな差分を追加し、独立再レビューを通過。最終buildのTUI型チェック成功。
