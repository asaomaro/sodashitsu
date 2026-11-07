# Captain conversation controls

Base f3c346d4 plus protocol-only dependency daa3e9aa (local duplicate fa6a8ac5; integration must not duplicate it). Desktop UI/runtime changes only; normal-view filtering belongs to the parallel projection task.

- Add a bubble-only stop IPC/preload path. Renderer supplies revision and intended actor UUID, never arbitrary device/pane/source. Main requires the current visible non-minimized conversation and delegates to main-owned AssistantChat. Only a ready owned actor is stoppable. Unknown/stale actor/revision/extra pane and non-conversation sender are rejected.
- During stop, publish busy/stopping and invalidate older refresh reads. Do not enable start on an interim get-null while the stop operation is still pending. Require verified `{stopped:true}` server receipt plus fresh same-scope observation before applying null. An uncertain RPC outcome keeps stopping until a fresh server state; new connection or newer same-connection actor observations are never overwritten. Closing/hiding the conversation does not cancel an already explicit stop or reopen the window afterwards.
- Keep the established separate reply-window terminal route. The button is in dedicated-session controls and labeled `船長の端末を開く`. Fixed terminalOnly:true opens the terminal even if an ask exists; undefined legacy callers retain pinned-form behavior. Notifications/form replies are unchanged. No terminal ID/path is accepted from renderer.
- Controls disable start/stop/open during stop or busy; verified completion lets explicit start become available. No auto-start, auto-send or actor substitution.

## Checks

Node24; desktop scoped build/typecheck exit0, existing and added3 suites113 tests pass. Main/Electron mocks verify separate terminal URL, pending-form compatibility, stop sender authorization, close-during-stop and post-stop start. Chat tests cover stale read, stale revision/actor, early null, uncertain retirement, connection changes and newer actor in the same connection. These are generated/mock checks, not actual model or PTY exit verification; the paired server implementation owns physical-exit proof.

Actual Chromium with generated bridge state: terminal button calls existing route with fixed terminalOnly, ready actor enables stop, stopping gates all controls, verified-null enables start, no message/audio/model action. Screenshots attached. No actual Electron/Windows, microphone, login, model, user pane or remote operation.

Two guard-only mutations (refresh epoch check and fresh-observation revision check removed) cause2 failures (`guard-negative.txt`); exact chat-file cmp restored. Then all7 product files restored to their original pre-feature versions with new tests fixed:9fail/104pass and browser failure. Seven SHA256 byte-exact restores, scoped rebuild,113pass and browser pass (`restoration.json`, raw logs). No compiled artifacts are used for that negative's TS/Vue-independent UI: unit main/chat load TypeScript, browser serves actual asset source. Appearance compiled module is unchanged.

Final assistant-host generation exit0; source bubble asset equals generated server-host copy and host manifest SHA (`host-asset.json`). No repository-wide test/build duplicated. Documentation removes the old unconditional 'stopping leaves old terminal' statement while keeping legacy terminal-side exit/retry and disable-without-killing behavior distinct.
