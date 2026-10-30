# macOS text clipboard

Use AppKit NSPasteboard for bounded returned UTF16 text (8192 units), activated only by explicit local helper --allow-clipboard + server allowClipboard + live source human clipboard grant. Writes also require actual input ceiling. Rich/image formats remain unadvertised until implemented. Mac native sharedClipboard uses existing per-source exclusive clipboard owner independent of input; never silently downgrade encrypted connections.

Source TextClipboardGuard validates monotonic generation, one-use numeric request ID, source identity/permission and current wall+monotonic deadline before/after OS access and at final text publication. Parent source gate serializes commands and output. Teardown clears clipboard authority and queued text eligibility, leaves ordinary system clipboard contents alone. Request errors/oversized/expired/revoked results contain no text. OS API calls are synchronous, checked before/after; they cannot be preempted by this guard while inside AppKit. Real OS prompt/device behavior remains unverified.

Tests use generated in-memory sink only; Node tests use owned synthetic helper and loopback normal/shared routes. Actual SDK compilation and generated source negatives run on macOS CI; no real pasteboard API in self-test/probe. Reference: [NSPasteboard](https://developer.apple.com/documentation/appkit/nspasteboard).
