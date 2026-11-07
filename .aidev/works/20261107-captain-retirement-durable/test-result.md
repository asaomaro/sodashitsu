# Durable captain retirement P2

Independent backend review reproduced9f01f008 reopening a second captain after exit-unconfirmed stop, removal of the model pane, suspend and manager recreation. The in-memory explicitStops map was insufficient; the ordinary disabled flag could be cleared by explicit activation.

Add a separate per-device retirement record (UUID ownership metadata only, no agent messages/auth/secret). Exclusive creation and fsync complete synchronously before close/kill starts. All activation/ensure/send checks and compose's restored-pane resume guard respect it. The get API reconstructs stopping metadata even after the owned pane is gone. Actual PTY exit and final session flush must both succeed before token-matching record removal. Save failure initiates no close; failed exit or failed final persistence leaves a record that manager recreation cannot erase by activation. Successful close removes it and a recreated manager can explicitly start a fresh captain.

- Related3files98tests pass; generated memory terminals/fake exit, no real agent/window/model.
- Regression3cases: rejected exit+manager recreation blocked; record persistence obstruction→close0; failed flush retains marker versus successful exit+flush removes marker and recreated manager starts. Prior95 tests retained.
- Old9f runtime AssistantSessions/compose only→3fail/66pass; restore both exact bytes/SHA→98pass. New helper remains unused by old runtime, so regression exercises actual service wiring.
- Frozen source after restore: server tsc-b0 then test-inclusive server typecheck0. All commands Node24.22.2. No full repository test/Windows/audio/production operations.
- Raw negative/restored/build/type receipts and source SHA are adjacent. Independent root/backend re-review requested; not self-approved.

Conservative recovery: an uncertain retirement is not resolved by guessing based on absent model pane/process name/PID reuse. No new process supervisor or permission bypass was introduced.
