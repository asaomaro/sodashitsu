# Native multiple viewers

Use the existing explicitly negotiated sharedDesktop pool for native Linux Portal/macOS SCK. One physical source/OS permission scope, independent subscriber frame ACK windows, at most8 subscribers, exclusive control, no replay to late joiners. Scope invalidation ends all subscribers. Do not enable video/audio/clipboard/monitor/driver features incidentally; native poolMedia remains false.

Native helpers use physical monotonically increasing input seq. Each subscription records a bounded64-entry map from physical to that viewer's input seq. A frame must report monotonic sourceInputSeq <= inputs issued to that physical helper. Consume mappings through that floor for every member (including frame-blocked ones), but emit only each member's own captured local seq. Input ACKs continue existing owner-only remapping. This preserves nativeInputFloor across control handover and prevents another member's input seq from authorizing stale images.

Linux idle notices are validated against exact physical last image/counter, then routed only to members who ACKed that same image. They remain human-input liveness, never refresh frame time/agent proof. Native source failures with matching backend end all members. File channels use independent explicit per-viewer grants and the locally approved server folder; no OS file drag authority is added.

Generated checks use owned Node helpers, loopback WebSockets, memory input and disposable files. No actual Portal/ScreenCaptureKit session, source OS inputs, clipboard/audio/service/driver/model/agent or live handoff.
