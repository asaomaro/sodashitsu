# H.264 generated fixture

`h264-generated.json` contains four hardware-encoded, generated 640×360 test images (red/green/blue/yellow quadrants and a middle gray rectangle). It contains no desktop capture. It was produced on Windows with `validate-h264.ps1 -FixtureFile <path>`, through the same hardware-only Media Foundation encoder and BT.709 NV12 conversion used by the helper. Only filler NAL units (CBR padding) are removed for the small fixture. SPS/PPS/IDR and dependent pictures are retained. The test repeats the complete sequence from its initial keyframe.

Regenerate explicitly on a Windows machine with a supported hardware encoder; do not substitute a desktop recording. The default validator writes no fixture.
