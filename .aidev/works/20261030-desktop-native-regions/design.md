# Native source regional proofs

Extend the explicit regional pointer-only observation protocol implemented by PR324 to Linux Portal and macOS SCK. No authority widening or fallback. Region caps8/1,048,576 pixels/UUID+geometry remain; helpers never retain raw pixels for later replay.

Linux: fixed BGR raw caps at jpegenc sink, GstVideoInfo/VideoMeta stride and offset validation, map READ in a bounded pad probe. Compute SHA256 rows with nonce and geometry, associate only by exact source PTS and geometry/generation to JPEG output. Keep at most8 metadata-only records. No extra portal/session/OS device access. Region configure invalidates queued frames/input revision and clears prior PTS records. Streaming probe uses region-only lock, never output gate (avoid pipeline shutdown deadlock).

macOS: fingerprint CGImage crop into canonical RGBA bitmap using CryptoKit. Same captured CGImage is encoded to JPEG; region configure bumps existing input revision so capture/publication fences reject old tickets. Source state gate and source identity checks remain. No screen API in generated checks.

Dependencies: Linux requires GstVideo GI type information; ephemeral local dev package extraction allowed without system install. CI explicitly installs development package. macOS uses built-in CoreGraphics/CryptoKit, compile/self-test on macOS CI. No live desktop permission prompts/input/capture in tests.

References: [GstPad probes](https://gstreamer.freedesktop.org/documentation/gstreamer/gstpad.html), [VideoInfo and stride](https://gstreamer.freedesktop.org/documentation/video/video-info.html), [jpegenc BGR input](https://gstreamer.freedesktop.org/documentation/jpeg/jpegenc.html), [offscreen CGContext](https://developer.apple.com/documentation/coregraphics/cgcontext).
