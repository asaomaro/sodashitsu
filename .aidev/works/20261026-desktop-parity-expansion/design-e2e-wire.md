# 10C: ordered endpoint transport

Scope: a transport component around 10A crypto, usable by Node and browser. It is not yet connected to the production desktop route. No new public RPC, local key initialization, stored pin, capture, input or audio device access is enabled. Task10 remains incomplete.

Each physical reliable ordered socket has a unique session UUID, ephemeral handshake, lane/direction keys and generation. Caller supplies an independently trusted fingerprint, role and active permit bound to the single endpoint owner and source epoch. Both hello transcripts must be signed before onReady/any application plaintext is released. Only public handshake metadata and authenticated ciphertext may cross sendRaw. Lane IDs/generations and lengths are observable metadata; traffic analysis and availability against a relay that drops traffic are outside this component.

All nine lanes have a physical send/receive FIFO above the lane crypto. Provider initiates rekey at a per-lane 768MiB or750k-record budget, below the crypto hard cap. A viewer/agent can request rekey with a reserved authenticated control record when its own lower budget is reached. The old seal and request drain before hello/proof; each side stops application sends, authenticates a fresh ECDH transcript, replaces the session and resumes the same application without restarting capture. Different lower limits need not match. No counter is reset under the same key.

Initial and rotation exchanges have a15s deadline. Both possible initiation orders preserve an existing earlier deadline; authenticated old-key traffic cannot extend it. Source validity/deadlines are checked after awaits and before publication, even if the timer callback has not run. Authenticated encrypted ping/pong runs after20s;60s without an authenticated receive closes the connection. Raw WebSocket pings or public handshakes do not keep it alive.

Queues admit at most8 records/16MiB per direction, each raw record at most4MiB. Incoming admission precedes copying; outgoing buffers are owned snapshots. Close revokes crypto and rejects/zeros queued plaintext. sendRaw must synchronously consume/copy; the enclosing socket must also bound its own bufferedAmount. onRecord receives a borrowed view zeroed on return: deferred consumers must copy and recheck their own source/permit before publishing/acting. Each child socket must separately bind to an authenticated parent/one-use lane capability in the following route integration.

Reference boundaries: RustDesk documents encrypted endpoint transport and configured public keys, while WebRTC authenticates DTLS certificate fingerprints through the signaling identity. We use these architectural ideas, not copied implementation/code or a claim of compatibility:

- https://rustdesk.com/docs/en/
- https://rustdesk.com/docs/en/self-host/client-configuration/
- https://www.rfc-editor.org/rfc/rfc8827.html
- https://webrtc.googlesource.com/src/+/HEAD/pc/g3doc/dtls_transport.md

Remaining integration: opaque A relay, private owner B backplane, required-encryption policy, local owner pairing/pin UI and nonextractable browser key, all child lanes and agent recipients, single-owner lifecycle/handoff/source epoch. JavaScript delivery, endpoint OS and actors with endpoint command execution remain trusted; this work does not revoke existing machine exec privileges. Protected/signin scopes remain separately gated.
