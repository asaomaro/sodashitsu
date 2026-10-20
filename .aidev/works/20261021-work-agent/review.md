# Independent final review: remote work agent launch

Date: 2026-10-21
Reviewer: /root/review_view_maximize (separate implementation context)
Worktree: /workspaces/sodashitsu-work-agent
Branch: feat/remote-work-agent-launch
Decision: APPROVE (code review). No outstanding mandatory findings.

Reviewed git diff HEAD, staged/unstaged changes and the new WorkAgent/workAgent/Web WorkAgentRequests source and tests. The work/exec prerequisite is already separated into main; unrelated desktop/LAN/preview changes were not present in the reviewed feature diff.

## Final fixes checked

- CLI argv allowlist and runtime validation of remote claim response.
- Fixed machine channel held by the parent; children receive only socket/secret capability and fixed-scope operations.
- Active reservation ownership and atomic parallel limit check; duplicate failures do not release an existing launch.
- Persistent pane marker before native CLI startup; ordinary native auto-resume suppressed on restore, including fail-closed marker inspection errors.
- IPC size thresholds aligned at 4MiB; escaped large-file regression and subsequent operation covered by integration test.
- Codex features.view_image=false, code_mode_host=true, local shell/unified_exec/hooks/plugins/apps/multi_agent/computer_use/browser_use disabled, read-only sandbox retained.
- New Codex feature-policy preflight rejects missing/mismatched settings. User argv cannot override the verified feature/sandbox/MCP configuration.
- Only remote_work receives MCP auto-approval; no general approval/sandbox relaxation. MCP timeout330s is above the proxy320s and remote exec300s bounds.
- Claude built-in tools disabled, dedicated MCP only, dedicated allowedTools rule, hooks and slash commands disabled.
- Prompt identifies remote OS/shell and forbids selecting a different target from resumed history.

## Wiring checked

Protocol barrel export and method/result registration; CLI parser/main dispatch; server method dependency registration and authenticated connection guard; compose-time request/launcher construction; generation-bound remote channel validation; launcher cleanup on close/handoff/error paths; internal-only AgentStarter command override; Web explicit launch through A's local client while listing/rejecting through B.

## Evidence and limits

The earlier independent localhost-only real Codex0.163 probes confirmed the deferred MCP registry, disabled image/shell tools, read-only apply_patch denial with unchanged scratch file, and successful fixture remote_work dispatch with only that tool approved. Those records are in review-probe/summary.md. Product source and user settings were not modified by this reviewer. Final worktree git diff HEAD --check passed. Build/typecheck results were supplied by the implementation session; the full test run is still in progress and was not duplicated. This approval is not a claim that the pending full test suite has completed.


# Independent review: MCP cancellation delta

Date: 2026-10-21
Reviewer: /root/review_view_maximize
Worktree: /workspaces/sodashitsu-work-agent
Decision: APPROVE (code review); no mandatory findings.

Scope: only the cancellation changes in cli/workAgentMcp.ts, workAgentIo.ts, server/work/WorkAgentLauncher.ts, and the added workAgent unit/integration assertions. Earlier final approval remains unchanged for other code.

Checked:
- The MCP input loop can consume notifications/cancelled while tools/call is pending. Cancellation is forwarded only when its requestId matches that process's current MCP request.
- The IPC cancel operation carries no arbitrary exec id, scope, method, command or destination. The parent selects its own current job and requires the requesting socket to own it.
- Socket close uses the same owner check. Unrelated socket close/cancel cannot cancel another socket's job.
- An owner cancellation received before work.exec returns is retained on the operation object; the returned exec id is cancelled before polling. Cancellation received after id assignment cancels that same owned remote job.
- Ordinary completion and finally clear the current job only when the owner object still matches. Existing fixed-scope validation and remote channel ownership are unchanged.
- Cancellation is best effort for an already-sent file/memory operation and does not promise rollback. The added mechanism actively terminates exec; it does not retry uncertain writes locally.
- The added unit test observes an outstanding MCP call, sends the matching notification, receives its cancellation result, and confirms the MCP loop still handles ping. The integration test waits for a real command's start marker, cancels it, and checks the later touch did not execute before subsequent remote memory work.

Verification: git diff HEAD --check passed. Product code was not edited and no heavy/full test suite was started by the reviewer. Added tests were inspected; their execution result remains the implementation session's responsibility.


# Independent re-review: native feature gate

2026-10-21, reviewer /root/review_view_maximize.
Worktree /workspaces/sodashitsu-work-agent, branch feat/remote-work-agent-launch.
Decision: APPROVE. No mandatory findings in the final native-policy delta.

## Deltas reviewed

1. assertWorkAgentCodexPolicy no longer requires unified_exec=false. It still requires shell_tool=false, view_image=false, code_mode_host=true and all other previously required disabled features. The unit test now accepts unified_exec=true and still rejects shell_tool=true or a missing view_image feature. The best-effort unified_exec=false launch override is retained.
2. CORRECTION: the proposed Web timeoutMs60000 third argument was removed from both Vue and its test. LocalClientFactoryKey resolves to MachineSummaryClient, whose request(method, params) has only two arguments and no per-request timeout. Its pending map is resolved by onMessage and rejected by stop/onclose through failPending. The only timer in this implementation is reconnect backoff, not RPC expiry. Therefore the two-argument Web call already waits for launch completion or connection closure, and no Web timeout addition is required. The earlier review incorrectly assumed the ordinary SodaClient request signature without checking this concrete client; that assessment is superseded by this direct implementation check.

Root and delivery copies of the native-policy source/test and reverted Web source/test were byte-identical when checked. The final change under review is only the native-policy gate and its test. git diff HEAD --check passed. No source was modified or full test suite duplicated by this reviewer.

## Real-CLI positive and negative controls

Using Codex0.163.0, both -c features.unified_exec=false and --disable unified_exec still read back unified_exec=true, while shell_tool=false is effective. Requiring unified_exec=false therefore blocks this supported CLI before launch.

Local fake Responses-provider probes used the final delivery workAgentNativeArgs, temporary CODEX_HOME/project and a fixture MCP, with no real model API or OS-command invocation. The synthetic Code mode call only inspected enabled tool metadata/properties.

- Positive policy result: shell_tool=false returned a registry containing remote_work and no exec_command/write_stdin/view_image.
- Boundary control: changing only shell_tool=true exposed exec_command and write_stdin. This demonstrates that the shell flag, rather than the unified_exec readback, controls tool exposure in this CLI.
- Actual runtime-object check with the fixed policy returned typeof tools.exec_command=undefined, write_stdin=undefined, view_image=undefined and remote_work=function. These were not merely hidden entries in a displayed catalog.

Evidence: review-probe/codex-shell-policy-request.json, codex-shell-positive-control-request.json, codex-shell-properties-request.json and the copied soda-review-codex-shell-*.mjs scripts. Earlier read-only apply_patch rejection and actual fixture remote_work dispatch remain documented in review-probe/summary.md. These are measured results for the installed version, not an untested guarantee about future CLI versions.

The implementation session is rerunning its feature-readback assertion and affected tests; this review does not claim those pending runs have finished.

Confirmed source: packages/web/src/injection.ts:80 and packages/web/src/main.ts:654 instantiate MachineSummaryClient; packages/client-core/src/net/MachineSummaryClient.ts:73 implements its two-argument request. No product files were edited by the reviewer.


# Independent review: per-command exec channels

2026-10-21, reviewer /root/review_view_maximize.
Delivery: /workspaces/sodashitsu-work-agent.
Decision: APPROVE. No mandatory findings in this delta.

Scope: only WorkAgentLauncher per-command channel ownership/cleanup and workAgent.integration.test.ts repeated-exec/cancellation assertions.

- work.exec, exec.read and exec.cancel use the same commandRemote, preserving ExecService connection ownership. File/skill/memory operations still use the original fixed control channel.
- The original control remote.valid() and pane/scope checks remain in force. After awaiting connect(machineId), check() runs before work.exec, so a changed machine generation does not silently rebind the launch to a new destination. B still verifies the fixed project root/identity in work.exec.
- A command connection opened after cancellation or launcher cleanup is immediately rejected by the post-connect checks and closed in finally. An exec id returned after cancellation is cancelled through that command's own channel.
- Socket cancellation selects job.remote only for that socket's owned job; other socket cancellations cannot address an arbitrary connection/id.
- Every commandRemote closes in finally after success, RPC failure, cancellation completion, or invalidated control/pane checks. Launcher cleanup also closes the currently owned command channel, including before work.exec replies. Command-channel close lets B reclaim retained completed results and terminate an unfinished command through its existing clientGone path.
- The 33 sequential exec regression crosses the retained-job limit in one launch, and cancellation now explicitly checks cancelled=true plus absence of the later side effect. Subsequent memory and invalid-scope checks still exercise the same launch.

Verification: git diff HEAD --check passed. Reviewer performed static review only; product files were not modified and no heavy test run was duplicated. Test execution remains with the implementation session.

Review snapshot note: the reviewed implementation uses commandRemote=await connect(machineId) and finally commandRemote.close(). The implementation session subsequently began a temporary negative-control mutation in delivery; the final source must be restored to that reviewed implementation before delivery. The root corrected source was rechecked after notification and contains those same ownership/cleanup operations.
