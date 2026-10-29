# Linux静止画面の接続維持

- [x] Primary-source investigation, finite design, human/agent authority split. Independent design taskcheck.
- [x] Typed idle/counter and1000ms reception-based liveness. No capture/frame/input-floor renewal. Fragile taskcheck required.
- [x] Source Portal/logind/pipeline/owner/ACK/sequence/revision recheck at final locked publication. Generated Python checks. Fragile taskcheck required.
- [x] Provider/Relay human-only private marker; agent real-frame freshness unchanged. Unit/browser plain+sealed and cross-lane overtaking regressions. Fragile taskcheck and whole/correction reviews passed.
- [x] Actual-source negative controls, independent whole/correction review, frozen checks/browser/CI/clean startup.
- [x] Guarded root reflection, scoped PR/main, explicit real-device limits.

Delivered PR#306: sourcee13c63f43c8b0ed4ee65e61af7409d764b9c15a9, main d736bd32079e6082ce9b3e537b809055b059ba60. Source12717/856 PASS402.03s, root12779/864 PASS399.85s, whole suites serial/maxWorkers4. Source/root build/force/typecheck and new Linux plain/sealed quiet/crosssocket regressions passed. Broad browser14passed/1 existing agent takeover failure, new-source repeat and fixed b93 baseline reproduce that same failure; root14 excluding that known case passed1.8m. No repository test disabled. Agent takeover is the next fix. Clean fixed-head build/smoke and final16-path root/frozen/replayed matches independently checked. Exacthead6CI jobs allgreen: native Linux/Mac40949104704, Windows Node40949104576, protected/upgrade/maintenance40949104932. No actual Linux/macOS desktop test or live A/B handoff.

No Linux/macOS desktop device is available per user. WSL generated checks do not prove actual Portal/Wayland screen/input behavior. Experimental local opt-in remains required. Native audio/microphone/clipboard/monitor/GPU parity and other platform residual work are not completed by this slice.
