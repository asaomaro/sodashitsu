# Codex 子会話・第1段

既存 `agent.subagent_transcript` を維持し、現在の verified Codex parent instance/session と一覧内の exact child UUID を照合。ファイルは固定sessions root下の正式rolloutのみ。先頭session_meta.idとsource.subagent.thread_spawn.parent_thread_idを二重照合し同fdから抜粋、読了後fd/pathのdev/ino/size/mtimeNs/ctimeNsとparent scopeを再確認。symlink/hardlink、親変更、他の子を拒否。POSIXはrootの所有者と現在UID・file所有者一致も必要。

1MiB窓/200件/4000字、2秒。閲覧済みchildは同parent/instanceの間だけ64件/30分grantで終了後も読む。親の正式fresh印が失われた場合は失効。response_itemのuser/assistantのtextだけ、reasoning/attachments/tool bodiesを除外。実会話/認証/モデル呼出し/Windows操作なし。

SubagentTranscriptの共通抜粋処理に同fd入口とmapperを加え、Claudeの既存挙動は維持。RPCの認証/取消を前後確認。UI可視化hasTranscript/最新turn観測は次の段で結合するので、このcommitだけで全kind対応とはしない。

生成8ケースと既存Claude34ケース=42件成功。負例はnative routingを旧挙動へ戻し、child parent照合だけを外して2件の特異的失敗を確認。2fileを保存した修正版とcmpでbyte exact復元し42件再成功。以下生出力。

## negative

```text

 RUN  v5.0.1 /workspaces/sodashitsu-native-child-transcripts

 ❯ packages/server/src/agent/NativeSubagentTranscript.test.ts (8 tests | 2 failed) 112ms
   × refuses mismatched child session_meta, child file symlink and hardlink 18ms
   × uses the existing transcript API reader without requiring a Claude hook 13ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  packages/server/src/agent/NativeSubagentTranscript.test.ts > refuses mismatched child session_meta, child file symlink and hardlink
AssertionError: expected 'ok' to be 'unreadable' // Object.is equality

Expected: "unreadable"
Received: "ok"

 ❯ packages/server/src/agent/NativeSubagentTranscript.test.ts:40:153


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  packages/server/src/agent/NativeSubagentTranscript.test.ts > uses the existing transcript API reader without requiring a Claude hook
RpcError: subagent not found
 ❯ SubagentTranscriptReader.read packages/server/src/agent/SubagentTranscript.ts:322:15
    320|       if (!g || g.instanceId !== instanceId || instanceId === null || …
    321|         this.grants.delete(key);
    322|         throw new RpcError("not_found", "subagent not found");
       |               ^
    323|       }
    324|       g.at = now;
 ❯ packages/server/src/agent/NativeSubagentTranscript.test.ts:57:9

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed | 1 passed (2)
      Tests  2 failed | 40 passed (42)
   Start at  22:49:35
   Duration  1.28s (transform 57%, tests 24%, import 18%)

```

## restored

```text

 RUN  v5.0.1 /workspaces/sodashitsu-native-child-transcripts


 Test Files  2 passed (2)
      Tests  42 passed (42)
   Start at  22:49:37
   Duration  1.32s (transform 57%, tests 24%, import 19%)

```

最終source固定後 server noEmit型検査 exit0（testsを含む）。共有distは変更せず、対象Vitestはprotocol source aliasで確認。
