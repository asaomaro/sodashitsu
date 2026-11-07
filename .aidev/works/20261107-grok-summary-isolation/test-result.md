# Grok summary isolation / Cursor fail-closed boundary

Grok CLI 1.0.77 was invoked only inside an unprivileged user + network namespace containing loopback and an owned local HTTP stub. The environment used synthetic authentication and generated prompts; ordinary user config/conversations/auth were not accessed. No external inference or telemetry could leave that namespace. The stub deliberately rejected inference requests, so CLI exit 1 is expected and does not demonstrate successful model-generated summary text.

The installed CLI main `/chat/completions` request omitted `tools` after `--tools read_file --disallowed-tools read_file,Agent,search_tool,use_tool --deny MCPTool --no-subagents --disable-web-search`. Empty `--tools` is unsafe here: pinned official `parse_comma_list` maps it to None. Removing read_file alone still left two MCP meta-tools; removing their observed names too removed the field. Auxiliary session_title requests remain distinct from executable OS tools and are not claimed absent.

An owned SessionStart hook only wrote a generated sentinel in its temporary directory. With no managed-only pin it ran; with `allow_managed_hooks_only = true` in the temporary requirements.toml it did not. Both cases had no main tools and no external network. Metadata receipts and the self-contained probe are retained here; all child processes/server handles/temp directories were cleaned. No driver/service/system policy was changed. This hook pin respects OS-admin and cryptographically enforced hooks; it does not bypass them or claim every hook can be disabled.

Cursor 2026.11.05-86047df has a hidden installed `--allowed-tools` parser that distinguishes omitted from explicit empty [] and emits `x-cursor-agent-allowed-tools: ""`. Empty argv preservation was verified through the standard Windows npm-shim-to-Node resolver using an own fixture (not Windows OS execution). Isolated Cursor CLI accepted the flags, authenticated against a synthetic local stub and read generated protobuf model metadata, then failed at its HTTP/2 agent transport against the HTTP/1 stub. Therefore actual Cursor inference header delivery and model-generated summary are NOT claimed.

More importantly, source backend capability defaults permit TeamHooks, WorkspaceOpenHook, marketplace/user plugins and MCP, and shared services query GetEffectiveUserPlugins even with private config/data roots. This is a source-supported capability, not a claim that the actual user account enabled every one. No formal command for disabling these optional pre-prompt execution surfaces was verified. The unsafe Cursor runner was removed; the product returns an explicit unsupported error before auth copy or CLI spawn, never falling through to Codex or silently using ask mode.

Generation-only fake CLI tests verify the correct Grok executable/arguments/output/empty stdin, private-root auth-only copy, 0600 temporary credentials and cleanup; Cursor remains fail-closed. Existing lease checks, timeout, cancellation, active-session rejection, no-retry and other provider behavior stay in SummaryService.

Negative control (before final fixed checks): only SummaryService.ts was restored to the parent version, fake executables protected against real CLI invocation, and provider-specific execution tests failed. Byte-exact restoration confirmed. Raw output:

```text

 RUN  v5.0.1 /workspaces/sodashitsu-grok-cursor-conversations/packages/server

 ❯ src/conversation/GrokCursorSummary.test.ts (6 tests | 2 failed | 4 skipped) 142ms
   × grok: isolates roots and executes its own CLI without Codex fallback 82ms
   × cursor: isolates roots and executes its own CLI without Codex fallback 58ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/conversation/GrokCursorSummary.test.ts > grok: isolates roots and executes its own CLI without Codex fallback
RpcError: 要約結果がありません
 ❯ SummaryService.runPrompt src/conversation/SummaryService.ts:646:31
    644|           } catch {}
    645|       }
    646|       if (!text.trim()) throw new RpcError("agent_prompt_failed", "要約結…
       |                               ^
    647|       return { text, sessionId };
    648|     } finally {
 ❯ src/conversation/GrokCursorSummary.test.ts:21:15

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/conversation/GrokCursorSummary.test.ts > cursor: isolates roots and executes its own CLI without Codex fallback
RpcError: 要約用エージェントが失敗しました。ログインとモデル設定を確認してください
 ❯ summaryFailure src/conversation/SummaryService.ts:672:10
    670|   )
    671|     return new RpcError("summary_model_unavailable", "要約モデルを利用できません");
    672|   return new RpcError(
       |          ^
    673|     "agent_prompt_failed",
    674|     "要約用エージェントが失敗しました。ログインとモデル設定を確認してください",
 ❯ ChildProcess.<anonymous> src/conversation/SummaryService.ts:608:50

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 4 skipped (6)
   Start at  18:12:52
   Duration  1.66s (transform 68%, import 21%, tests 10%, worker 1%)

undefined
/workspaces/sodashitsu-grok-cursor-conversations/packages/server:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/conversation/GrokCursorSummary.test.ts -t executes its own CLI

```

Final fixed source checks together with the independent resume argv work: 5 files / 138 tests passed; server tsc build exit 0; test-inclusive server typecheck exit 0. No full-suite duplicate execution.
