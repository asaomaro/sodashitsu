# Validation

Node24.22.2.14 provider tests passed, including initialize-only request, bounded output/row count, effort projection, timeout, rejection and tempcleanup. Negative control substitutes the previous fixed-reference Claude behavior and fabricated Copilot effort:7 failed/7passed (rawnegative.txt); both source files restored byte-exact (restore.json),14repass (restored.txt). This is an intentional semantic negative, not an actual older adapter file (the adapter is new).

Server tsc-b exit0; final server complete test-source typecheck exit0. Initial in-flight emit had an older snapshot while source was being finalized; derive-only servertsbuildinfo was deleted and finalsource re-emitted. Actual finalcompiled adapter returned5models with explicit low/medium/high/xhigh/max in484ms; normal .claude.json/settings/credential bytes ANDmtime unchanged (actual-receipt.json). Final source is the exactrestored variant and unchanged since that finalemit. Raw CLI account data was not retained. No user prompt/modelturn was sent. Windows launch/cleanup reuses the established resolver but was not exercised on the remote Windows PC.

Full repository checks intentionally not duplicated. Sharedrouter/UIintegration validation remains the UI owner/root responsibility. Independent review requested after commit.
