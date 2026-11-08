# Cursor context over-window followup

Product source: `aa3966a1`. The previous `2ed431e7` evidence remains the proof for the f32 source; this is an additional, separate change.

- Preserve the formally present raw uint32 used/max values even when used > max; clamp only the displayed percentage to 0..100. Presence, positive max, root hash, DB/WAL seal and post-close identity guards remain unchanged.
- Generated decoder/metadata/history API/formatter regressions: 4 files, 26 tests passed. 100 used / 50 window remains 100 / 50, percentage 100. No consumer totals, prices, or timestamps are invented.
- Old f32 runtime negative: 2 failed / 24 passed. Restore both runtime files byte-exact, then 26 passed. Raw output is in `overmax-negative.log` and `overmax-restored.log`; hashes in `overmax-restoration.json`.
- Focused strict TypeScript on all 5 changed source/test files: exit 0 (`overmax-type.log`, config copied to `overmax-tsconfig.json`).
- Common formatter already accepts the valid raw context/window pair; no common runtime validator was relaxed.
- Root owns the incremental production build after integration. No duplicate full build/test or real managed-child DB / model / Windows operation was performed for this followup.
- Independent source review reported no additional must/should; final evidence SHA verification is pending.
