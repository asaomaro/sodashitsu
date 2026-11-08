# Verification

Fixed product source: 4e2c1736 (8 source/test files).

- Five related files: 69 passed. Includes same-ms/same-tool-ID separate runs; same event/message ID with changed content fails fingerprint membership; parent/other-child/private/ephemeral/missing/nontext/numeric-only rejection; 64/run and 4096 global bounds; usage purpose rejection; FD mutation; four physical slots held through close.
- All 8 changed source/test files focused strict TypeScript: exit 0, raw type.log is empty. tsconfig.json copied.
- Negative control: old b54 runtime gives 5 failures / 64 passes. Removing only fingerprint membership gives 2 failures / 67 passes. All six product runtime files restored byte-exact (restoration.json), then 69 passed. Raw logs included.
- Actual generated formal parent JSONL -> source NativeSubagentReader/HistoryService -> existing Web ChildConversationWindow DOM: 2 themes (Soda dark/One Light), public child text shown, foreign text absent, unavailable numbers have no numeric rows, expired body removed, strict history entry route only, current/control/send RPC 0, narrow390px fits. browser.json/log and screenshots included. One Light PNG visually checked. This uses source SSR and generated reply transport, not a real Copilot or authenticated production WS.
- Own generated reader/history/temp files, SSR/Vite and Chrome close in finally. No remaining own browser processes observed. Source SHA before (fixed git object) and after DOM matches all 8 files.
- Unchanged protocol/core dependencies built successfully for this isolated fixture. No duplicate production server/full repository build/type/test: root owns the combined production server build with AGY/Cursor.
- Real managed-child 1.0.105 emitter/path reachability is unverified. Child numbers and general direct send remain unavailable. Only already-observed formally attributed public text is added.
- Final independent review is required; source fixed for that review.

## Conflicting duplicate followup

Fixed source `30659988` adds a bounded eventID-to-fingerprint index within the existing per-run 64/global 4096 ownership. Identical replays are deduplicated. Conflicting content for an already retained eventID clears and permanently invalidates only that run's public set, with omission noted; current/count/terminal metadata remain unchanged. New formal start creates a fresh run. This is separate from the earlier unobserved-content mapper test.

- 5 related files, 70 passed; strict TypeScript on the full 8 changed source/test files exit 0 (`conflict-type.log`).
- Prior 4e2c two runtime files give 1 failure / 69 passes on the explicit conflicting-record fixture. Restore both files byte-exact, then 70 passed. `conflict-restoration.json`, raw negative/restored logs included.
- All 8 final source/test git-object/current hashes match in `conflict-source-sha256.json`. Original 4e2c DOM/negative evidence remains unchanged; the additional regression covers the new conflict boundary without repeating the unchanged browser UI checks.
- Root confirmed the prior combined production server build and external smoke exit 0, and owns the incremental production build after this followup. No duplicate author production build.
- Independent followup source review reported no additional findings; final evidence verification pending.
