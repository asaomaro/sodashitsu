# 検証記録

2026-10-21。独立worktree feat/remote-work-local-ask で実装。既存の汎用AskService/ask-form部品を再利用し、third_partyを改変しない。

- pnpm typecheck / pnpm build: 全体成功。
- protocol/CLI/launcher/既存AskServiceとask実通信/skill: 関連7ファイル77件成功。
- Chromium E2E work-agent-ask.spec.ts: 成功。実A/Bサーバと委譲接続、fixture native Claude、実際のstdio MCP子プロセスを使用。外部モデルAPIは使わない。
- MCP remote_workでBのdesign.mdを読み、その返却本文をask_user.documentsへ渡す。操作元AのブラウザDOMでフォームと隔離iframeのMarkdown h1を観測。回答JSON、Esc取消し、MCP stdin EOFでの取消しと一時資料削除も確認。
- Aにブラウザ購読が無い場合unavailable、Bに待機フォームが作られないことを確認。対象の判断をテストクライアントのイベントだけで代用しない。
- 任意pane/machine、view.file、画像URL、サイズ/時間上限を超えた定義の拒否をprotocolの検証で確認。
- pnpm smoke: ブラウザ端末の描画と実PTYへの入力を含めPASS。
- 独立レビューAPPROVE。git diff --check成功。

## 負対照

composeでlauncherへAskServiceを渡す修正だけを外し、serverを再ビルドして同じE2Eを実行。フォーム機能が利用できない誤りで失敗した。ソースを修正済みのbyte列と完全一致する状態へ戻し、serverを再ビルド、同じE2Eとsmokeを再実行して成功。

以下は失敗時の生の出力（表示可能画面が無い場合の正しいunavailable応答に到達する前に、機能そのものが未接続で拒否された）。

```text
  1) src/specs/work-agent-ask.spec.ts:9:1 › remote-work agent asks on A; Markdown renders, answers return, and MCP exit cancels the form

    SyntaxError: Unexpected token '操', "操作元の質問フォームを利用できません" is not valid JSON

      49 |     ask(10, "表示するブラウザがない");
      50 |     await expect.poll(() => replies.has(10)).toBe(true);
    > 51 |     expect(JSON.parse(replies.get(10).result.content[0].text)).toMatchObject({ status: "unavailable" });
         |                 ^
      52 |     await openBrowser(page, appServer);
      53 |     ask(2, "操作元への確認");
      54 |     // UI is observed on A's browser; this is not inferred from the test client's ask event.
        at /workspaces/sodashitsu-work-agent/packages/e2e/src/specs/work-agent-ask.spec.ts:51:17
```

詳細ログは /workspaces/sodashitsu-check-logs/20261021-work-agent-ask/。実稼働のユーザーフォームや接続先メモには触れない。利用時には操作元Sodashitsu/CLIを更新し、エージェントを起動し直して新しいMCP/親のIPCを構成する必要がある。Yukkuri Studio等のプラグイン操作/エージェント起動連携は別対応。
