# Installed Antigravity native delegation probe

2026-11-07, installed `agy 1.4.12`, Linux, isolated self-authored empty project. Separate worktree based on `343f56c0`; existing user panes/projects/conversations untouched.

`isolatedAntigravity` provided bubblewrap read-only root/private HOME. Only OAuth token/installation ID and known model configuration were copied; global hooks/plugins/project trust and Soda reporting environment were excluded. Credentials and raw private records are not committed. Each command had `--print-timeout 120s` and an outer 150s process-group deadline; all three exited 0 without timeout. No external CLI/process substitute was requested or used by the model.

1. `agy --print <request exactly one native child returning NATIVE_SUBAGENT_PROBE_OK> --output-format stream-json --print-timeout 120s --mode plan`
2. Resume only the newly generated fixture conversation with native `manage_subagents list` request.
3. Resume that fixture again with native kill-that-child and list request.

Actual native calls: `invoke_subagent`, `manage_subagents` (`list`, `kill`), child `send_message`. Parent and child official transcripts were created. Child response reached parent. Final native kill succeeded and subsequent list contained zero children.

Fixtures preserve provider structure/status/steps/timestamps and native tool result content. IDs and absolute paths are consistently replaced; human prompts, model summaries, thinking, account/auth data and token counts omitted. `alive.json` uses the exact descriptor read before the kill (same fields as the final descriptor except state); `killed.json` is the final descriptor.

Important boundary: descriptor `SUBAGENT_STATE_ALIVE` includes an idle child that has finished its task. Provider native list first reported `running`, later `idle`, although descriptor remained ALIVE. Only after explicit native kill did descriptor become `SUBAGENT_STATE_KILLED`. Therefore ALIVE alone cannot populate the existing active-task count. Transcript DONE denotes individual steps, not documented whole-child lifecycle completion. No adapter should infer running from ALIVE or task completion from a child message's prose.
