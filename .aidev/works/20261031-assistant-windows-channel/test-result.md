# 検証

- このPCのWSL→Windows Electron 45.1.0で旧起動の即EOF・exit1を再現。診断wrapperはprivate Temp内だけで使用し配布しない。
- 修正後、実Windows GUIからattachedを受信し、stop後にGUI actual closeのretiredを受信。追加手動exe導入なし。
- build/typecheck成功。対象4ファイル30テスト成功。3 OSの生成named pipe/socket試験をCIへ追加。全体テスト・CIは実行中。
- 独立全体レビューと指摘修正の再レビュー完了。相互認証、退役証明、遅延attached拒否、認証中EOFを確認。追加mustなし。
- private別worktreeの負例：修正を2箇所戻すと3件成功→2件失敗・1件成功。元ソースとバイト一致で復元。

負例の生出力（抜粋）:

```
 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/managedChannel.test.ts > rejects a normal EOF during authentication instead of leaving startup pending
AssertionError: expected [Function] to throw error including '接続が終了' but got 'startup remained pending'

Expected: "接続が終了"
Received: "startup remained pending"

 ❯ src/managedChannel.test.ts:38:126
     36|  const server=createServer(socket=>socket.once('data',()=>socket.end()…
     37|  try{const result=managedChannel(['--soda-managed-channel=00000000-000…
     38|   await expect(Promise.race([result,new Promise((_,reject)=>setTimeout…
       |                                                                                                                              ^
     39|  }finally{await new Promise<void>(r=>server.close(()=>r()));await rm(d…
     40| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantLaunchController.test.ts > a closed generated host cannot be revived by a late attached authorization result (relay=true)
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      "00000000-0000-4000-8000-000000000001",
    ]


Number of calls: 1

 ❯ src/assistant/AssistantLaunchController.test.ts:147:463


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed (2)
      Tests  2 failed | 1 passed | 19 skipped (22)
   Start at  16:02:56
   Duration  1.17s (tests 45%, transform 43%, import 12%)


```
