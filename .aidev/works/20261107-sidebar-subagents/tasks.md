# Sidebar subagent rows

User request: show each main agent's subagents immediately below its agents-sidebar row, with a right-edge expansion icon and a count badge only while collapsed. Implement consistently in Web and terminal; preserve existing themes, rounded rows, accessibility and detail/transcript entry points.

- [x] Use existing active-only AgentInfo.subagents; no protocol/provider changes.
- [x] Readonly child rows show running state, type and description. Children are not independent panes or input targets.
- [x] Initially collapsed; identity/machine-scoped client-session expansion survives updates/sort, not replacement; retain at most 256 parent expansion entries.
- [x] Render at most 64 children, then shared remainder label. Unknown never implies zero. Neither has an expandable control; Web parent title explicitly distinguishes unknown and zero.
- [x] Web native button with aria-expanded/controls, Enter/Space propagation fencing and reduced-motion rotation; TUI right-edge mouse toggle; original keyboard/menu details stay available.
- [x] Taskcheck for local expansion/scroll state and input hit calculation: targeted Web/TUI tests cover this; root read-only review reports no must findings.
- [x] Generated source-served browser fixture: actual Sidebar DOM, keyboard interaction, badge/child visibility, update/limit and four theme geometries; screenshot visually inspected.
- [x] Baseline source negative controls, exact source restoration, raw logs and final relevant checks.
- [ ] Final integrated independent review/any correction review: coordinated by root.

Excludes audio work, new provider collection, persistent preferences, full repository build/tests. Backend active-child collection is owned by another agent.
