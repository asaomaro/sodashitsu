#!/usr/bin/env python3
"""Generated negative controls only. Never runs a helper's capture/input mode."""
import os
from pathlib import Path
import subprocess
import tempfile

source = Path(__file__).with_name("macos-desktop-helper.swift")
original = source.read_bytes()
cases = [
    ("region-revision", "input.revision &+= 1", "input.revision &+= 0", "regional config invalidates in-flight capture"),
    ("region-crop", "image.cropping(to:CGRect(x:r.x,y:r.y,width:r.width,height:r.height))", "image.cropping(to:CGRect(x:0,y:0,width:r.width,height:r.height))", "regional background remains stable"),
    ("region-nonce", r'\(r.id):\(image.width)', r'\(image.width)', "regional nonce binding"),
    ("queued-source", "!dead && !stopping && input != nil && canPublish(ticket,revision:input!.revision,now:milliseconds(),active:sourceActive())", "!dead && !stopping && input != nil && canPublish(ticket,revision:input!.revision,now:milliseconds(),active:true)", "queued source revocation never writes"),
    ("text-source", "guard active(),now()<=expires else", "guard now()<=expires else", "text continued after source revocation"),
    ("release-source", 'if releaseAllowed() { try? sink.post(InjectedEvent(kind:"key",code:key,down:false,modifiers:modifiers)) }', 'try? sink.post(InjectedEvent(kind:"key",code:key,down:false,modifiers:modifiers))', "source revocation clears trackers without injection"),
]
for name, before, after, expected in cases:
    text = original.decode()
    occurrences = text.count(before)
    assert occurrences == (2 if name == "text-source" else 1), (name, occurrences)
    try:
        with tempfile.TemporaryDirectory(prefix="soda-macos-negative-") as temporary:
            candidate = Path(temporary) / source.name
            candidate.write_text(text.replace(before, after))
            binary = Path(temporary) / "generated-helper"
            build = subprocess.run(
                ["xcrun", "swiftc", "-swift-version", "5", "-O", str(candidate), "-o", str(binary)],
                env={**os.environ, "MACOSX_DEPLOYMENT_TARGET": "14.0"},
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=120,
            )
            assert build.returncode == 0, build.stdout
            result = subprocess.run([str(binary), "--self-test"], stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, text=True, timeout=15)
            print(name, "exit", result.returncode)
            print(result.stdout, end="")
            assert result.returncode != 0 and expected in result.stdout, (name, result.stdout)
    finally:
        assert source.read_bytes() == original, "original source changed"
print("generated_negative_controls_pass")
