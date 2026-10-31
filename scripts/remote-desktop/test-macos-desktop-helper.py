#!/usr/bin/env python3
"""Generated negative controls only. Never runs a helper's capture/input mode."""
import os
from pathlib import Path
import subprocess
import tempfile

source = Path(__file__).with_name("macos-desktop-helper.swift")
original = source.read_bytes()
rich_source=source.with_name("macos-rich-clipboard.swift").read_text()
video_source=source.with_name("macos-native-video.swift").read_text()
audio_source=source.with_name("macos-native-audio.swift").read_text()+"\n"+source.with_name("macos-system-audio.swift").read_text()+"\n"+source.with_name("macos-native-microphone.swift").read_text()
microphone_source=source.with_name("macos-native-microphone.swift").read_text()
cases = [
    ("source-audio-reentrant", " && audioCeiling && nativeVideo === video", " && nativeVideo === video", "generated source audio reentrant permission retirement"),
    ("clipboard-replay", "id>lastId", "true", "clipboard request not replayed"),
    ("clipboard-write-ceiling", "canWrite(),authorized(ticket)", "true,authorized(ticket)", "clipboard write requires input ceiling"),
    ("clipboard-write-size", "text.utf16.count<=8192,canWrite()", "true,canWrite()", "clipboard UTF16 size bound"),
    ("clipboard-read-size", "guard text.utf16.count<=8192,authorized(ticket)", "guard authorized(ticket)", "clipboard oversized read discarded"),
    ("clipboard-monotonic", "&& now<=ticket.deadline", "", "clipboard monotonic deadline survives wall clock rollback"),
    ("clipboard-write-query", "canWrite(),authorized(ticket)", "canWrite(),authorized(TextClipboardTicket(owner:ticket.owner,expires:ticket.expires,started:ticket.started,deadline:Double.greatestFiniteMagnitude))", "clipboard native write query cannot extend deadline"),
    ("region-revision", "input.revision &+= 1", "input.revision &+= 0", "regional config invalidates in-flight capture"),
    ("region-crop", "image.cropping(to:CGRect(x:r.x,y:r.y,width:r.width,height:r.height))", "image.cropping(to:CGRect(x:0,y:0,width:r.width,height:r.height))", "regional background remains stable"),
    ("region-nonce", r'\(r.id):\(image.width)', r'\(image.width)', "regional nonce binding"),
    ("queued-source", "!dead && !stopping && input != nil && canPublish(ticket,revision:input!.revision,now:milliseconds(),active:sourceActive())", "!dead && !stopping && input != nil && canPublish(ticket,revision:input!.revision,now:milliseconds(),active:true)", "queued source revocation never writes"),
    ("text-source", "guard active(),now()<=expires else", "guard now()<=expires else", "text continued after source revocation"),
    ("release-source", 'if releaseAllowed() { try? sink.post(InjectedEvent(kind:"key",code:key,down:false,modifiers:modifiers)) }', 'try? sink.post(InjectedEvent(kind:"key",code:key,down:false,modifiers:modifiers))', "source revocation clears trackers without injection"),
]
rich_cases = [
    ("rich-offset", '"stage":"chunk","offset":next,"data":chunk', '"stage":"chunk","offset":next-chunk.count,"data":chunk', "rich clipboard pull replies next offset"),
    ("rich-late-cancel", 'pending.cancelled=true', 'pending.cancelled=false', "rich clipboard cancelled output never revives after cache eviction"),
    ("rich-source", 'version==c.version', 'true', "rich clipboard permission query cannot hide local clipboard change"),
    ("rich-after-clear", 'valid(cleared)', 'true', "rich clipboard clear cannot extend write deadline"),
    ("rich-input", '!write || clipboard.canWrite()', 'true', "rich clipboard write requires input ceiling"),
]
native_cases=[
    ("native-h264-codec-case", 'String(format:"avc1.%02x%02x%02x",sps[1],sps[2],sps[3])', 'String(format:"avc1.%02X%02X%02X",sps[1],sps[2],sps[3])', "generated VideoToolbox canonical codec spelling"),
    ("native-hevc-codec", 'String(rbsp[12])', 'String(0)', "generated HEVC actual SPS profile tier level"),
    ("native-ack-deadline", ' && (stream.pending.first==nil || (time>=stream.pending[0].at && time<=stream.pending[0].at+2000))', '', "native video late ack cannot erase deadline"),
    ("native-inflight", 'guard inflight==nil,!retiring,stream.pending.count<stream.window', 'guard !retiring,stream.pending.count<stream.window', "native video single physical encoding job"),
    ("native-ledger", '!seen.contains(id)', 'true', "native video UUID cannot replay after ledger window or case change"),
]
microphone_cases=[("microphone-final-authority", "try verify();guard active() else {return false};try submit()", "try verify();try submit()", "metadata query cannot extend authority")]
for name, before, after, expected in cases+rich_cases+native_cases+microphone_cases:
    is_rich=name.startswith("rich-");is_video=name.startswith("native-");is_microphone=name.startswith("microphone-")
    text = microphone_source if is_microphone else video_source if is_video else rich_source if is_rich else original.decode()
    occurrences = text.count(before)
    assert occurrences == (2 if name in ("text-source","rich-after-clear") else 1), (name, occurrences)
    try:
        with tempfile.TemporaryDirectory(prefix="soda-macos-negative-") as temporary:
            candidate = Path(temporary) / source.name
            candidate.write_text((text.replace(before,after) if is_rich else rich_source)+"\n"+(text.replace(before,after) if is_video else video_source)+"\n"+(audio_source.replace(microphone_source,text.replace(before,after)) if is_microphone else audio_source)+"\n"+(text.replace(before,after) if not is_rich and not is_video and not is_microphone else original.decode()))
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
        assert source.with_name("macos-rich-clipboard.swift").read_text()==rich_source,"rich source changed"
        assert source.with_name("macos-native-video.swift").read_text()==video_source,"video source changed"
print("generated_negative_controls_pass")

assert source.with_name("macos-native-audio.swift").read_text()+"\n"+source.with_name("macos-system-audio.swift").read_text()+"\n"+source.with_name("macos-native-microphone.swift").read_text()==audio_source,"audio source changed"
