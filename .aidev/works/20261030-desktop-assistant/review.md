# Independent review — stage A

review_pointer performed read-only taskcheck of protocol/preferences/controller/geometry/native IPC and Electron lifecycle. A real startup defect was found and corrected: custom protocol registration belongs to the assistant-local session, not defaultSession. The taskcheck also confirmed startup-setting rejection occurs before saving, and save failure rolls login-startup back. Final taskcheck: no additional must. No native GUI/OS setting/agent process was started.

review_transfer independently reviewed the whole stage-A diff and found no must. One should was corrected: changing captains while a bubble exists now destroys that stale character bubble; opening it again reads the selected captain. The correction review found no additional must/should.

Scope: native shell/settings/three built-in captain assets/initial disconnected bubble. Authenticated notices, dedicated session, actual chat, OCR/plugins/transcription and standard assistant tools remain explicit subsequent tasks.

Final CI/metadata delta review by review_transfer: no additional must/should. Windows workflow remains generated-test/packaging-only; productName stabilizes the native application identity.

## B1 readonly verbal notices

review_pointer taskcheck found and verified fixes for (1) stale completion while working, (2) old completion/blocked event keys surviving a newer resolved event, and (3) named-session cookies not selected. Added monotonic inbox revisions, shared deferred handling, bounded per-pane dedup, strict TLS, generation/deadline/heartbeat ownership; taskcheck found no additional must.

review_transfer independent whole review found timer-only handshake expiry. Fixed absolute monotonic time checks before/after cookie, CA/socket creation, hello/shared callbacks and connected publication. Late pong handling uses the same absolute-budget principle. Correction review: no additional must/should. Final deferred-state delta review: no additional must/should. No reviewer launched actual desktop/OS/real Soda/agents or repeated tests.

## B2 dedicated server session

review_pointer taskcheck found retained-conversation instance confusion and first8-UUID name collisions. Fixed runtime owner instance fences, actual restore provenance plus fresh current-agent session evidence, and injective full-UUID base36 names. Correction: no additional must/should.

review_transfer whole review found requested-only restored markers could adopt a matching name; removed name-only ownership and serializer promotion. Subsequent explicit-adoption recovery was reviewed independently. Self-check added fresh proof to ensure's sessionId update so it cannot reintroduce a stale pane reference after adoption.

The final delta review found successful-start state was a pane boolean and could adopt a same-name replacement before the first detection was claimed. SessionService now records only the actual instance accepted by a launch reservation, invalidates that record on any instance change/null/attribution cleanup, and initial adoption requires this evidence. Regression covers direct and null-mediated replacement before the manager observes A. Correction review confirmed the fix and found no additional must/should. Reviewers read source only; no desktop, actual PTY, agent/model or OS change.

## B3a dedicated bubble conversation

review_pointer read-only taskcheck found initial enable/origin-change stopped the newly created control socket in the unrelated notice reset. Removed that stop and added generated main enable→control.start/not-stopped→scoped assistant.get and bubble-only state-read assertions. Final taskcheck confirmed the fix and found no additional must.

review_transfer independently reviewed the complete native/main/preload/controller/RPC/identity/renderer delta, including exact target generation, real ConversationService record bounds, no input replay, strict TLS/auth and complete-file exclusive hardlink identity publication. Final UI/cursor/cookie delta and added post-JSON absolute hello-budget guard/test were reviewed: no additional must/should. No reviewer ran actual GUI/PTY/model/network or edited source.

## D1 standard tools / local file transcription

review_pointer taskcheck identified nonregular blocking file open before validation and cancellation freeing the apparent slot while old I/O remained. Corrected lstat→O_NONBLOCK open→fstat, per-boundary AbortSignal checks, read-before-inference budget and an exclusive physical-operation slot retained through retirement/stopping. It also identified delayed clipboard output racing note save; corrected shared editorBusy serialization and browser regression. Correction review: no additional must/should.

review_transfer whole review found no must and suggested checking selected audio identity/change metadata. Added lstat-vs-fstat identity/size/time comparison plus post-read metadata/size verification, with generated replacement/same-size-edit regressions and handle closure. Reviewed explicit copy, local voice cancellation behavior, protocol default/loopback validation and final test boundary improvements (literal budget, valid oversized JSON, ready chat before no-auto-send checks). Correction review: no additional must/should. Concluding delta review confirmed explicit credentials omission, real generated localhost multipart/redirect fixtures, neutral filename and bounded failure output; no additional must/should. No reviewer edited source or invoked real GUI, OS/media, production network, agents or models.

## D2 microphone

review_pointer read-only taskcheck confirmed owner/token/phase/deadline, visible main-frame/audio-only permission checks, late-stream stop, explicit review/upload and scoped cancellation. It suggested capturing WebContents.id before closed; fixed and correction confirmed. Closing the tools section now also stops/discards capture.

review_transfer whole and concluding delta review found no must/should. Confirmed persistent indicator, native hide/minimize/navigation/expiry fallback, oversized upload not consuming the lease, mock cleanup, current-key isolation, explicit-only Audio construction, layout/DOM geometry verification and generated-vs-real-media boundaries. No reviewer ran GUI, actual microphone/speaker, production network or models.


## D3 local OCR

review_pointer taskcheck found two musts: OCR import bypassed the notes editorBusy fence, and native crop could revive a lease expiring during decode/crop/encode. Fixed a shared cancelable text-import path that rejects saving and resets note identity, plus post-crop original owner/image/deadline/generation checks. Generated browser and clock/discard unit regressions cover them; both intentional removals fail the relevant assertions. Independent correction review confirmed both resolved with no further must. Whole review and restored-source delta review by review_transfer found no confirmed must/should. Final verification record review found no additional must/should and confirmed8 valid negative failures, invalid initial attempts excluded, generated-vs-device boundaries and601 runtime count. Windows zip later exited0; exact CI receipt follows PR creation. No reviewer ran actual GUI, OS capture/clipboard, Tesseract or model.

## Final native-only form integration

Pointer taskcheck found two musts: initial subscribe snapshot could erase a preceding opened push, and counting the assistant as a full form renderer left ordinary nonagent shell forms waiting without a native display path. Corrected initial opened/snapshot merge with closed tombstones, plus renderer:assistant eligibility and visibility using live pane.agent. Correction review confirmed both and the original10s subscription deadline, bounded opaque production ask IDs and no additional must.

Transfer independently reviewed the whole new delta: read-only subscription, actor/source pinning, exact live form open-only validation, terminal reply/key rejection, exact Web form selection/no fallback and fresh-document navigation. No additional must. A targeted navigation UUID query addresses the earlier conditional same-document hash caching concern. Suggested retaining assistant renderer in the positive test is applied after the final full run and verified with affected tests. No review used real GUI/media/agents/models or edited product source.
