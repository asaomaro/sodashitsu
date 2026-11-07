# Sidebar agent controls

Base be88b257, separate from the host-metrics worktree. Remove only the Web/TUI agents sidebar information control. Put child expansion on first row; preserve collapsed count badge, expanded icon, custom one-row layout, accessible labels, model/effort second row, child readonly semantics and usage subscription. Main pane header information action and same-window inline children remain unchanged. No detailed/record button restored.

Production difference: Web Sidebar removes the import/button/style and moves the existing expand condition to row0. TUI sidebar stops assigning info and moves existing badge row to0; shared pane header/action rendering is unchanged. Expanded Web golden changes only removed information button markup. Existing TUI expectations remove [i]. Docs updated at the affected sidebar sections.

- Existing8 related suites315 tests pass, including pane header actions and PaneInfoView. Web/TUI typechecks exit0. No full repository checks repeated.
- Chromium/Vue generated fixture at four existing themes: sidebar information control absent, expansion first/second row placement, collapsed badge/expanded child rows, original header info button still opens/closes information window with inline child list and creation effort, child title/state/font and preference behavior retained. No actual agents/OS interaction.
- Old two production sources with updated tests fixed:6fail/222pass, browser fails on old sidebar information/placement. Byte-exact SHA256 restore2files, all315 pass and browser pass again. No rebuild needed for this negative: Vue loads SFC source, TUI Vitest loads TypeScript source; shared core output is unchanged.
- Raw negative/restored output, restoration hashes, actual browser screenshots/receipt included. Full layout golden checked to contain only removal of info button, no changed labels/title.
