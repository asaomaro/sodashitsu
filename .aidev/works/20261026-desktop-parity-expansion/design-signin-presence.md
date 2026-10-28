# 7B3c: readonly signed-out presence mode

A dedicated Node agent must prove the physical console is signed out before it attaches its delegation connection. Otherwise its link could compete with the normal logged-in machine connection. A viewer request must still never start capture/input before its own sealed consent.

Add an explicit `presence` purpose to the fixed native broker/worker argv allowlist. It uses the existing installed-package leases, SYSTEM/token/session/process/nonce checks, native epoch/observer and physical target pin. It publishes only private `signin_presence` records (monotonic sequence, relative freshness 1000ms) at most every 250ms. Only heartbeat/stop are admitted. No configure, frames, capture, input, control, ACK, quality, keyframe or held-key cleanup is routed in this purpose.

The pure publisher stops permanently on source loss, 15-second heartbeat expiry, 120-second lifetime, backward clock, clock failure, reentrant publication or callback failure. It rechecks freshness after source callbacks and serialization before output. It cannot grant a viewer or authorize an OS input.

The actual worker dispatches purpose work and cleanup through methods shared with generated fake capture/release tests. Invalid command tests use the actual presence admission method. Product-source copy mutations must hit intended assertions; no privileged Main/capture/input runs in validation.

This phase does not connect Node startup, reuse presence as a viewer grant, install a service, or provide service restart/session-transition policy. Those remain required before enabling signed-out connections.
