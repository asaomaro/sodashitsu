# 検証

最終source固定後: build/typecheck成功。全体900ファイル13,054件pass（353.10秒）。関連3ファイル52件pass。生成CLIからinstall/update/rollback/statusを実行し、無効設定の維持と前版への切替を確認（配布内容は実行しない）。feature commit 195a5f44のgenerated-windows/generated-server CIとも成功。Windows実GUI・実配布の起動は未実施。

pnpm smokeはbranch/mainともWeb UIの.xterm-helper-textarea待ち15秒で同じTimeoutError。サーバ起動、login、WebSocket、workspace/pane、echo/custom-command往復までは両方成功。mainは未変更の2c34d081 worktreeで比較し、退行ではないと記録。再試行を増やさない。生ログ: /tmp/soda-assistant-packages-smoke.log と /tmp/soda-assistant-packages-main-smoke.log。

初回の全体実行中にZIP検証と回帰を追加したため、初回はsource/distの混在と新回帰の失敗があり、最終証拠に採用しない。sourceを固定しbuildした後に全体を再実行する。

## 回帰の負例

### pending-disable

修正ガードを除去すると失敗する。disable/digestは元bytes一致で復元。CRCは独立/tmpコピーで実行し、本作業treeを変更しない。以下は生の失敗出力。

```text
 FAIL  |@sodashitsu/server| src/assistant/AssistantPackage.test.ts > discards a pending update after disable during app shutdown
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      Object {
        "command": Array [
          "/tmp/soda-package-ZNvPat/installed/429c862c-9d71-4e39-914a-89933f0f02e5/Sodashitsu Assistant.exe",
        ],
        "origin": "http://127.0.0.1:7780",
      },
    ]


Number of calls: 1

 ❯ src/assistant/AssistantPackage.test.ts:130:26
    128|   await (closing??controller.stop());
    129|   if(newest) expect(start.mock.calls.every(call=>JSON.stringify(call[0…
    130|   else expect(start).not.toHaveBeenCalled();
       |                          ^
    131|  } finally {release?.();await controller.stop();await f.close();}
    132| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  01:13:33
   Duration  827ms (transform 62%, tests 19%, import 19%)


```

### rollback-digest

修正ガードを除去すると失敗する。disable/digestは元bytes一致で復元。CRCは独立/tmpコピーで実行し、本作業treeを変更しない。以下は生の失敗出力。

```text
 FAIL  |@sodashitsu/server| src/assistant/AssistantPackage.test.ts > refuses rollback to changed, empty, missing or expanded prior contents
AssertionError: promise resolved "{ version: 1, current: { …(3) }, …(1) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "current": {
+     "command": [
+       "/tmp/soda-package-xQrSN9/installed/45a14444-2a16-4f8c-89a2-1b397349afdf/Sodashitsu Assistant.exe",
+     ],
+     "id": "45a14444-2a16-4f8c-89a2-1b397349afdf",
+     "sha256": "3f961585737e6373be9d686c1c2f55671c4641caaa3d357625f10161556c1f5e",
+   },
+   "previous": {
+     "command": [
+       "/tmp/soda-package-xQrSN9/installed/1879051f-143d-4721-a2c5-75a4d0bbb0bf/Sodashitsu Assistant.exe",
+     ],
+     "id": "1879051f-143d-4721-a2c5-75a4d0bbb0bf",
+     "sha256": "3f961585737e6373be9d686c1c2f55671c4641caaa3d357625f10161556c1f5e",
+   },
+   "version": 1,
  }

 ❯ src/assistant/AssistantPackage.test.ts:58:51
     56|    else if(change==="extra") await writeFile(join(root,"unexpected.txt…
     57|    else await writeFile(asar,change==="empty"?"":"corrupt");
     58|    await expect(rollbackAssistantPackage(f.state)).rejects.toThrow();
       |                                                   ^
     59|    expect(await readAssistantPackage(f.state)).toEqual(second);
     60|   } finally {await f.close();}

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  01:13:34
   Duration  748ms (transform 72%, import 22%, tests 6%)


```

### crc

修正ガードを除去すると失敗する。disable/digestは元bytes一致で復元。CRCは独立/tmpコピーで実行し、本作業treeを変更しない。以下は生の失敗出力。

```text
 FAIL  AssistantPackage.test.ts > accepts Windows ZIP contents but rejects traversal and case collisions without switching
AssertionError: promise resolved "{ version: 1, current: { …(3) }, …(1) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "current": {
+     "command": [
+       "/tmp/soda-package-zeD8n7/installed/6d7fc110-ff54-4912-8ef3-a4c08ebe3fa8/Sodashitsu Assistant.exe",
+     ],
+     "id": "6d7fc110-ff54-4912-8ef3-a4c08ebe3fa8",
+     "sha256": "fb1fdfc2904e39caa5649ee07c866c361917470e3759e99bb75663261c085300",
+   },
+   "previous": {
+     "command": [
+       "/tmp/soda-package-zeD8n7/installed/92836013-caea-4f2b-99b8-67e950fbf151/Sodashitsu Assistant.exe",
+     ],
+     "id": "92836013-caea-4f2b-99b8-67e950fbf151",
+     "sha256": "7d26cb45b29876d28b6f5a7477472ed1443996c55b2075e75183819a1a18b858",
+   },
+   "version": 1,
  }

 ❯ AssistantPackage.test.ts:84:72
     82|   for(const broken of [valid.subarray(0,valid.length-22),(()=>{const r…
     83|    await writeFile(archive,broken);
     84|    await expect(installAssistantPackage(f.state,archive,f.destination)…
       |                                                                        ^
     85|    expect(await readAssistantPackage(f.state)).toEqual(first);
     86|   }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  01:22:24
   Duration  898ms (transform 67%, import 21%, tests 12%, worker 1%)


```
