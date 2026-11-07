# Subagent state and membership display — shared helpers/footer

Contract dependency: backend protocol acbee885 (local equivalent 953cc0c2), optional countBasis working/alive and child state working/idle/unknown. Omission retains working meaning.

Shared client-core labels distinguish running, idle and unknown, count membership and unavailable/zero data. Shared Web/TUI statusline keeps its old text for omitted basis and labels alive as membership, with an explanatory Web tooltip. All five kinds are tested without usage/kind gating.

Evidence: footer-negative.log restores baseline statusline formatter while preserving new tests and fails 5 alive cases; footer-restore.json asserts exact byte restoration and SHA. footer-positive.log (16 tests) and helper-positive.log (6 tests) pass on restored current source. Pure source tests do not consume a built formatter. No repository-wide CI duplicated. UI integrations, CLI serializer and docs follow in separate commits; root coordinates final independent review.
