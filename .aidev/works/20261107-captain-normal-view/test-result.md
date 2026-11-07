# Captain normal-view projection

Base9f01f008 (captain server contract), separate tree/branch from durable server fixce80c296 and desktop UI7c64d298. No production, actual PTY/Windows or model operations.

Data projection is pure and shared: raw snapshots/maps and lookup remain available to dedicated reply windows/terminal permissions/accounting. Only the exact server-owned captain pane through its real tab/workspace is excluded. Split layout collapses to remaining sibling; empty captain tab/workspace disappears; unrelated partial/event/old-peer structures are retained. No proved captain is an identity projection, preserving original Map references. Shared lightweight-summary projection uses retained Workspace.assistant plus pane-tab-workspace identity; it never infers names and preserves old peers without proof.

Normal Web consumers explicitly use normal selectors (raw Pinia store is not replaced): Sidebar, TabBar/BaseScreen/mobile/Goto/keyboard, graph display and candidates. TUI retains raw model Maps; ordinary currentTab/focus/history/sidebar/keyboard/Goto and graph read projected data. Saved graph nodes/links are untouched; presentation nodes and incident lines are filtered. Remote summaries are still stored raw with ownership metadata and projected only in normal lists/candidates. Busy-close and worktree-delete safety checks continue to inspect raw affected panes. Dashboard, usage watchers/results/cost/history and AssistantResponse dedicated terminal stay raw.

Validation:
- Related13suites607tests pass, including generated exact-own/mixed split/captain-only empty/focus/oldpeer/summary/retained savedgraph and visible Sidebar/graph tests, existing navigation/history/group/mobile/checklist regressions. Early overly-broad partial snapshot pruning caused95 existing test failures; fixed by preserving unproved/no-captain structures. Latest related result is allpass.
- Old9f consumer3files only (Web Sidebar, StoreAdapter and TUI SessionModel), new generated tests unchanged:3 semantic failures. Real Vite/Chromium generated browser fixture also fails because old Sidebar shows the captain. Restore3product bytes/SHA exactly;607tests and generated browser pass again. No repeated full repository test.
- Final source fixed after restore; core/Web/TUI test-inclusive typechecks and corebuild receipts adjacent.
- Browser uses actual Sidebar/TabBar/PaneLayout with generated leaf text instead of spawning terminal processes. Observes visible-worker only, repaired focus, captain-only normal empty state and raw dedicated lookup; light/dark screenshots. Page errors0. Missing optional ViewSync warning/favicon404 are fixture-only (no PTY or client.view route); screenshots do not claim actual native terminal lifecycle evidence.
- Server retirement semantics are separately reviewed/fixed in ce80c296, not duplicated or mutated here. Desktop stop/open controls are separately owned by UI agent.

Independent final root/backend review requested. No self-approval.
