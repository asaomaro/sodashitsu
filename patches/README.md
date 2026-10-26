# werift 0.25.2

`werift@0.25.2.patch` keeps the DCEP unordered bit when adding the retransmission/lifetime reliability kind, in both ESM and CommonJS entry points. The package initially reports `ordered=true` to Chromium for a channel requested as `{ordered:false,maxRetransmits:0}`. The receiver deliberately requires the requested semantics, so it falls back to WSS with the original dependency.

The actual-browser desktop UDP test checks `ordered=false`, selected local/remote UDP candidates, generated H.264 canvas pixels and direct draw ACKs. A runtime negative temporarily restores the original ESM assignment (breaking its pnpm hardlink by atomic replacement, without modifying the shared store inode), fails the browser assertion, and restores the original installed bytes. `pnpm install --frozen-lockfile` applies the version-pinned patch through the committed pnpm patchedDependencies/lockfile; no manual node_modules change is required for deployment.

Upstream: https://github.com/shinyoshiaki/werift-webrtc (MIT; the package retains its upstream license). Recheck and remove the patch when upgrading to a release with the corrected DCEP encoding. No changes to encryption, ICE authentication or retransmission policy are included in this patch.
