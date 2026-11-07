# Grok/Cursor persisted conversation records

Source frozen before final checks. Node 24.22.2, own workspace dependencies/dist.

- protocol build: exit 0.
- server `tsc -b --pretty false`: exit 0 (new ConversationKind exhaustive cases included).
- server `tsc --noEmit -p tsconfig.typecheck.json`: exit 0 (test fixtures included).
- vitest GrokCursorRecords, ExtraAgentRecords, AssistantConversation, conversationResume: 4 files / 27 tests passed.
- git diff --check: exit 0.

Raw relevant test result:
```
 Test Files  4 passed (4)
      Tests  27 passed (27)
   Start at  17:50:05
   Duration  2.73s (transform 46%, tests 40%, import 14%)
```

The first test invocation preceded local protocol dist generation and failed package entry resolution (0 tests in those 3 suites); protocol build corrected that prerequisite. This is feature addition rather than a preexisting regression correction; no old-source negative control is claimed.

Grok JSONL shapes are from pinned official grok-build 2bdd1d6, session_jsonl.rs and sampling/conversation.rs. Installed Grok 1.0.77 exact source equivalence is not proven. Cursor shapes/paths are from installed cursor-agent 2026.11.05-86047df, cli-transcript-writer.ts, agent-transcript paths/serializer and cursor-config paths modules. Tests contain only generated text. No user record body was copied.

One separate normal-auth Cursor create-chat call (isolated cwd/CURSOR_DATA_DIR, zero prompts) exited 0 and returned a UUID; no DB/transcript was written for that empty chat. This validates empty chat creation, not native model-generated transcript reading. The generated exact JSONL tests validate our reader. No existing chat, settings, auth, user pane or OS device was changed. No runtime/module import of installed Cursor code is used by the product.

This commit enables exact-record reading, bounded discovery, dedicated conversation kind/freshness gates and exact UUID resume argv. New CLI launch first-hook/freshness and summary isolation are separate follow-up work; no summary or native audio support is claimed by this commit.
