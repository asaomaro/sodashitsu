# Compact usage labels

Base: c0a18138. Isolated worktree; no user pane, settings, network provider, Windows or CPU changes.

## Change

- Remove the shared child-list membership explanation row; the pane information count is `N件`.
- Apply compact counts to the common aria/count helper, pane footer, dashboard, and TUI information/sidebar. Keep countBasis/state data, existing unknown/zero distinctions, and the footer membership tooltip.
- Remove effort/approval observation suffixes from shared visible text. Preserve observation source, basis and timestamp in the title. Parent sidebar uses this formatter too. Child creation-time effort remains explicitly marked `開始時`.
- Shorten the five detailed token labels, retaining field IDs, order, settings and numeric values.

## Verification

Node v24.15.0, pnpm 9.15.9. Worktree-owned dependency installation and generated files; no live dist symlinks.

- `tsc -b packages/client-core`: exit 0 (protocol + client-core only).
- Four affected package typechecks: exit 0 (`types.txt`).
- Existing 13 related suites: 374 passed (`restored.txt`). Additional TUI UsageView suite: 10 passed (`usage-view.txt`). No repository-wide checks duplicated.
- Actual Chromium/Vue fixture: compact footer values, all five shortened token labels, effort/approval values, provenance title, compact pane info count, no duplicate list explanation, unchanged child aria, and four themes (`browser.mjs`, `browser.json`, screenshots). Generated anonymous data only. The screenshot shows the info view's existing loading placeholder because this fixture does not run an actual usage server.
- Product negative: restore all seven changed runtime sources to base, rebuild protocol/core, run existing updated semantic suites: 15 failures / 26 passed (`negative.txt`). The same actual browser fixture fails against old rebuilt runtime (`browser-negative.txt`), observing old `所属`, long token labels and `記録` text.
- Byte-exact restore of all seven runtime sources verified by SHA256 (`restoration.json`), rebuild, 374 tests and browser pass again. Tests remain fixed during this negative control.

The common count label no longer explains working/alive semantics in visible/aria text. The data remains unchanged; membership footer title remains descriptive. No inference or provider acquisition behavior changes.
