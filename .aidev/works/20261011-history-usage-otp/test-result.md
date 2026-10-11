# 検証

- 最終build/typecheck: 成功。
- 認証・履歴・利用量の対象テスト: 6ファイル49件成功。TOTPはRFC 6238の既知ベクトル6件を照合。HTTPで設定の未認証拒否・Origin拒否・試行制限・同一コード再使用拒否を確認。
- ブラウザ: 会話機能4件と追加ログイン1件成功。本文領域のヘッダー／フッター寸法、コードの発行と別contextでのログイン、再使用拒否、登録QR、TOTP確認と別contextでのログイン・登録削除をDOMで確認。
- 認証設定の失効競合とSpace操作の回帰テストは、該当する修正を外すと失敗。実装をバイト単位で一致する状態に復元。
- 全体テスト: 581ファイル・10506件のうち10492件成功。追加ログイン節に追従していなかった設定画面の13件と、グラフ表示の負荷下タイムアウト1件が失敗。設定画面の9節の期待・位置fixture・ローカルHTTP応答を更新し、設定画面／グラフの対象2ファイル224件を再実行して全件成功（18.11秒）。実装コードは変更していない。全体ログ `/tmp/ui-otp-all.log`、対象の再確認 `/tmp/ui-otp-settings-tests.log`。

## 認証設定のnegative control（生出力）

```text

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/http/HttpServer.otp.integration.test.ts (3 tests | 1 failed | 2 skipped) 154ms
   × rejects a settings body received after its authenticated session was revoked 153ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/http/HttpServer.otp.integration.test.ts > rejects a settings body received after its authenticated session was revoked
AssertionError: expected 200 to be 401 // Object.is equality

- Expected
+ Received

- 401
+ 200

 ❯ src/http/HttpServer.otp.integration.test.ts:129:26
    127|   await f.auth.resetToken();
    128|   request!.end(body);
    129|   expect(await response).toBe(401);
       |                          ^
    130| });
    131|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
   Start at  23:45:26
   Duration  2.37s (transform 78%, import 15%, tests 7%)

undefined
/workspaces/sodashitsu/packages/server:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/http/HttpServer.otp.integration.test.ts -t rejects a settings body

```

## Space操作のnegative control（生出力）

```text

 RUN  v5.0.1 /workspaces/sodashitsu/packages/tui

 ❯ src/modes/ConversationDialog.test.ts (2 tests | 1 failed | 1 skipped) 63ms
   × Space and a mouse click open a message without generating; Enter requests a summary 62ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/ConversationDialog.test.ts > Space and a mouse click open a message without generating; Enter requests a summary
AssertionError: expected '                                     …' to contain 'あなた'

- Expected
+ Received

- あなた
+                                                                                                     
+  ┌─ 送信メッセージ ───────────────────────────────────────────────────────────────────────────────┐ 
+  │ 質問の本文                                                                                     │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │                                                                                                │ 
+  │ ↑↓選択・Enter要約・Space/クリック開く・n続き・Esc戻る                                          │ 
+  └────────────────────────────────────────────────────────────────────────────────────────────────┘ 
+                                                                                                     

 ❯ src/modes/ConversationDialog.test.ts:56:22
     54|   await vi.waitFor(() => expect(f.screen()).toContain("質問の本文"));
     55|   f.dialog.handleKey(chordToKeyInput("Space"));
     56|   expect(f.screen()).toContain("あなた");
       |                      ^
     57|   expect(f.request).not.toHaveBeenCalledWith("agent.summary", expect.a…
     58|   f.dialog.handleKey(chordToKeyInput("Escape"));

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  23:45:29
   Duration  972ms (transform 74%, import 18%, tests 7%)

undefined
/workspaces/sodashitsu/packages/tui:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/modes/ConversationDialog.test.ts -t Space and a mouse click

```

## 稼働反映

`node packages/server/dist/main.js handoff --state-dir /home/asaomaro/.local/state/sodashitsu` を実行。`handoff complete: 8 pane(s) kept running` を確認。Webを再読み込みすると追加ログイン設定を利用可能。TUIの描画変更はクライアントを切り離して再接続する。
