# 旧IDと端末版PJ設定

実環境/workspaces/sodashitsuの保存済workspace idはw3。既存RPCが受け付けるIDをworkspace.toolsだけUUID必須として拒否していた。workspaceIdを他workspace RPCと同様に非空文字列へ変更。ID照合とPJ範囲制限を維持。

端末版のworkspace右クリックにPJ設定を追加。既存path表示、変更、空解除、失敗時の入力保持。

build/typecheck通過。protocol/TUI全73ファイルのテスト通過、WorkspaceTools 6件通過。独立レビュー backend:review_summary_cache/UI:review_history_usage とも通過。

否定対照: UUID必須へ戻すと新規回帰テストがInvalid UUIDで失敗。復元後のbytes一致を確認。生出力:

```text
 FAIL  |@sodashitsu/protocol| src/workspaceTools.test.ts > accepts restored legacy workspace IDs consistently with project folder settings
ZodError: [
  {
    "origin": "string",
    "code": "invalid_format",
    "format": "uuid",
    "pattern": "/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/",
    "path": [
      "workspaceId"
    ],
    "message": "Invalid UUID"
  }
]
 ❯ src/workspaceTools.test.ts:19:35
     17|       "git-diff",
     18|     ] as const)
     19|       expect(WorkspaceToolsParams.parse({ workspaceId, operation }).wo…
       |                                   ^
     20|   }
     21|   expect(WorkspaceToolsParams.safeParse({ workspaceId: "", operation: …

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

実サーバーへhandoffし7ペインを維持。認証済RPCでworkspaceId=w3、expectedFolder=/workspaces/sodashitsuの一覧を取得、23件・package.jsonありを確認。
