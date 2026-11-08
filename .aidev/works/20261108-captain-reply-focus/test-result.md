# Captain dedicated reply window focus

Base95c51a85. Normal captain filtering remains unchanged. Runtime edits are main.ts, StoreAdapter.ts, new assistantPanelView.ts and a hash-continuity check in assistantPanelGuard.ts. No desktop/server actor/device/session authorization changes.

## Cause and behavior

The pinned assistant guard validates a captain pane from raw session data, then ordinary view.setView/focusPane refuses that hidden pane. Ordinary StoreAdapter restore/repair can also select another pane or clear focus. The next input event correctly rejects the mismatched destination, producing the reported overlay.

Only an explicitly parsed assistantView=reply target receives the raw dedicated focus helper. That helper rechecks pane/tab/workspace/instance. StoreAdapter restores/repairs only this target in such a window and never stores it in ordinary navigation history. Normal view hidden filters are untouched. Machine, workspace/project continuity, reconnect, wrong instance and final delayed input checks remain in the existing guard. Changing the hash invalidates the original capture; it never follows a new target.

## Fixed-source verification

- Five relevant Web suites58tests pass after restoration, restored-unit.log. Normal projection/ordinary focus refusal tests included.
- Full Web test-inclusive typecheck finds one preexisting Sidebar.test.ts:673 string/AgentIntegrationKind fixture mismatch, full-web-types.log. That file was not edited. UI owner separately fixed it as027faa4e; root will integrate it.
- All Web product source plus the changed assistantPanelView.test.ts typechecks exit0, focused-types.log. No claim of full test-inclusive type0 for this base.
- Real Chromium runs actual main.ts, StoreAdapter, App/AssistantResponse and xterm with an owned isolated compose server and real PTY. Private HOME/state/cwd, known fake masked Node Codex echo process, all model CLI names guarded stubs. Browser-sent INPUT frames target only the captain; browser-received OUTPUT/SNAPSHOT and screenshot show generated output. Keyboard and DOM clipboard paste succeed; reload/reconnect still works; hash tamper then sends0 frames and displays guard. pageerrors0/modelcalls0. This is a browser proof of the shared Electron web content, not a Windows/native Electron IPC test.
- Final restored-terminal.png and negative-failure.png visually inspected. No real conversation/credential/OS clipboard was captured or changed. Token/cookie is memory-only. Both browsers/Vite/private servers close and private state is removed (restoration.json).
- Vite initially needed exact root-package alias matching instead of prefix matching for package subpaths. Harness-only correction; product sources unchanged. One private foreground sampler timeout was logged while final typecheck ran in parallel; the browser/PTY assertions and cleanup still passed. pageerrors refers to the browser JavaScript channel, not every backend diagnostic.

## Negative control

The three existing runtime files were replaced with exact base95c51a85 source. A fresh Vite process transformed those old sources, so no positive compiled web asset was reused. The new regression failed once on null captain focus (negative-unit.log). The actual-main browser then reproduced the exact reported overlay and sent0 INPUT frames (negative-browser.log/negative-failure.png). Expected key arrival failed.

All three existing sources restored with cmp; new helper also cmp unchanged. Restored58tests and fresh actual-main browser passed. Raw logs are retained. The final runtime/test SHA is restoration.json. Independent review is assigned by root.
