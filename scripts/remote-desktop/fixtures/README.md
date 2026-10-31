# H.264 generated fixture

`h264-generated.json` and `h264-sr-pc-generated.json` contain four hardware-encoded, generated 640×360 test images (red/green/blue/yellow quadrants and a middle gray rectangle). It contains no desktop capture. They were produced on two Windows PCs (local and sr-pc), including an encoder that requires output-type renegotiation. Each was produced with `validate-h264.ps1 -FixtureFile <path>`, through the same hardware-only Media Foundation encoder and BT.709 NV12 conversion used by the helper. Only filler NAL units (CBR padding) are removed for the small fixture. SPS/PPS/IDR and dependent pictures are retained. The test repeats the complete sequence from its initial keyframe.

Regenerate explicitly on a Windows machine with a supported hardware encoder; do not substitute a desktop recording. The default validator writes no fixture.

`h264-444-software-generated.json` is a single 640×360 solid red BGR test image encoded through `GstH264Encoder(..., family="h264-444", candidates=["x264enc"])`. It contains no capture. Recreate with GStreamer x264/h264parse: generate `bytearray([0,0,255]*(640*360))`, call `encode(raw, True, lambda: True)`, normalize with `NativeBitstream("h264-444")`, and save returned codec/key/base64 bytes in the same fixture schema. The complete single IDR is repeated by the synthetic source.
