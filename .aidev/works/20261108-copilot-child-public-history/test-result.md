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
