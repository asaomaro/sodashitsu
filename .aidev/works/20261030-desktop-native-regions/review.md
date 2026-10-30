# Independent review

- review_pointer taskcheck: Linux exact PTS/geometry/config generation, separate streaming lock and teardown, Mac same CGImage/revision fences coherent; initial should: actual command/publication revision regression. Added real DesktopSource.command -> publishable/writeRecord checks for configure+clear, invalid old capture/writer ticket and valid new ticket.
- review_transfer cross: must, native agent.region.frame bypassed existing sourceInputSeq/nativeInputFloor check. Added same final source floor fence as full agentFrame. New generated helper/input ACK regression failed on old regional frame (raw output test-result.md), passes after fix.
- Source checks: Linux actual Gst.Buffer/VideoMeta offset4/stride16/mismatch tests supplement no-meta real generated encoder pad.28 Python generated tests pass without skip after local dev GI extraction (no system install).
- Both reviewers reread delta and reported no remaining must/should. No edits, real desktop or full test reruns by reviewers.
- Mac actual compile/self-test/source negatives still pending CI; local Linux cannot substitute for Apple SDK.
