# 7B3b: signed-out viewer and native process facade

Status: source integration only. The dedicated installed Node main, local enrollment/key controller, installer and actual SYSTEM desktop validation remain separate work. Do not run the general server or repository as SYSTEM.

The finite signin endpoint accepts the existing enrollment-fixed Root/machine/viewer request, obtains a read-only identity permit, and authenticates the actual sealed viewer. A signin feature bit occupies bit 5 of the existing bounded hint. A normal `start` only produces a UUID offer. A fresh sealed `signin_grant` with that UUID chooses view or input, bounded by enrollment and the identity permit. The browser never persists this consent. Only the grant starts the fixed installed native broker. No parent, child lane, files, audio, clipboard, SAS, agent or general RPC is available.

One endpoint reserves one native slot through factory creation and completed teardown. Cancellation before a synchronous factory returns still closes its returned helper and awaits its stop proof. Failed stop proof permanently closes the endpoint; production facade also terminates the dedicated Node process so its native parent Job reaps descendants. Broker completion requires the exact final `signin_stopped` record, complete UTF-8, no trailing data and exit 0. EOF discards unsent input rather than draining it. Native launch uses only the fixed package executable, fixed args and the host's narrow environment; no shell or RPC path.

The worker facade bounds configuration, native line sizes, image encoding, one outstanding frame and 32 outstanding issued input ACKs. A fresh displayed frame and monotonic input sequence are required. The native worker remains responsible for each OS Emit's source epoch, physical target and freshness checks.

The source owns a 120-second monotonic deadline. The offer sends only `validForMs` (1..120000); the browser starts a performance.now deadline at receipt. Differing wall clocks neither reject an otherwise valid offer nor extend source authority. Browser close/reconnect resets the offer and consent; signin UI suppresses unrelated shared-source descriptions and unsupported routes.

Native broker stdin/stdout use explicit UTF-8 independent of Windows console codepages. Generated Japanese roundtrips and source-copy mutations verify both directions without invoking privileged Main.

Taskcheck required: process ownership/stop proof, sealed endpoint authorization/cancellation and protocol. Independent cross review and fixes-only delta review are required before merge. Build/type/full suite, generated loopback peers, browser DOM/pixels and Windows generated/ABI checks are validation; none is evidence of real signin capture/input or service installation.
