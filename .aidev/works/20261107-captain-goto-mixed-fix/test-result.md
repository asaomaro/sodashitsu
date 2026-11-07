# TUI Goto mixed-view P2

Root independent review found gotoRows projecting only workspace rows while reading raw tabs/layout leaves/panes, exposing captain again in a mixed tab. Remote goto also read raw summaries.

Fix one product file: take normalView once and use it consistently for workspace/tab/layout/pane/state; remote workspace candidates use normalSummary. Raw storage/attach/usage remain untouched. New valid generated3cases cover same-tab captain+worker, same-workspace separate captain and worker tabs, and remote captain-only versus old-peer ownership-unknown fallback.

Old b3 source only ->2fail/1pass: same-tab and remote regressions are detected, separate-tab preservation was already correct. Exact SHA restore ->4related suites25tests pass. Test-inclusive TUI typecheck0 against fixed source and valid fixtures. Initial fixture typo used split direction 's'; it was corrected to formal 'right' before final typecheck and negative evidence was refreshed with the valid fixture. No production/Windows/model operations or full repository test.

Other mixed consumers checked: sidebar pane lookups use projected tabsOf leaf IDs; GraphDialog candidates and source tab are projected, while global agent-name collision checks stay raw. Web Goto uses normal selectors throughout. Web GraphCanvas raw machine store supplies connection/selection metadata only; presentation nodes/links are filtered by store/graph hiddenCaptainNode plus exact remote summaryAssistantPane. Web graph checklist/rekey candidates use normalMachines projection. No saved graph controls deleted.

Independent root re-review requested.
