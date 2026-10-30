#!/usr/bin/python3
"""Generated PCM and private Unix peers only; never uses a sound server."""
import importlib.util
import os
from pathlib import Path
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location("native_audio", Path(__file__).with_name("linux-native-audio.py"))
audio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audio)


class GeneratedPcm(unittest.TestCase):
    def test_wire_contract_and_bounded_partial(self):
        frames = audio.PcmFrames()
        self.assertEqual(frames.push(b"\1\0\2\0"*480, 10, 10.01), [])
        wire = frames.push(b"\3\0\4\0"*480, 10.01, 10.02)
        self.assertEqual(len(wire), 1)
        self.assertEqual(struct.unpack("<IIQ", wire[0][:16]), (3840, 1, 10000000))
        self.assertEqual(wire[0][16:20], b"\1\0\2\0")
        self.assertEqual(wire[0][-4:], b"\3\0\4\0")
        self.assertLess(len(frames.pending), audio.FRAME_BYTES)

    def test_discontinuity_never_splices_old_audio(self):
        frames = audio.PcmFrames()
        frames.push(b"\1"*1920, 10, 10.01)
        self.assertEqual(frames.push(b"\2"*1920, 11, 11.01), [])
        wire = frames.push(b"\2"*1920, 11.01, 11.02)[0]
        self.assertEqual(wire[16:], b"\2"*3840)
        self.assertEqual(struct.unpack("<IIQ", wire[:16]), (3840, 1, 11000000))

    def test_buffer_end_and_every_frame_timestamp_are_observed_not_future(self):
        for count in (1, 5):
            with self.subTest(count=count):
                frames = audio.PcmFrames()
                with self.assertRaises(audio.AudioFailure):
                    frames.push(b"\0"*(3840*count), 10, 10)
                self.assertEqual(frames.sequence, 0)
                now = 10 + count*0.02
                emitted = frames.push(b"\0"*(3840*count), 10, now)
                self.assertEqual(len(emitted), count)
                for wire in emitted:
                    timestamp = struct.unpack("<IIQ", wire[:16])[2]/1000000
                    self.assertLessEqual(timestamp, now+0.005)

    def test_old_nonfinite_oversize_and_unaligned_never_emit(self):
        for data, captured, now in [(b"\0"*3840, 10, 10.101), (b"\0"*4, float("nan"), 11),
                                    (b"\0"*4, 11, float("inf")), (b"\0"*19204, 10, 10),
                                    (b"\0"*3, 10, 10), (b"\0"*4, 10.006, 10)]:
            frames = audio.PcmFrames()
            with self.assertRaises(audio.AudioFailure):
                frames.push(data, captured, now)
            self.assertEqual(len(frames.pending), 0)
            self.assertEqual(frames.sequence, 0)


@unittest.skipUnless(sys.platform == "linux", "Linux peer credentials and pinned directory")
class GeneratedPeers(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="soda-audio-test-")
        self.parent = Path(self.temp.name)/"soda-native-pcm-ABC123"
        self.parent.mkdir(mode=0o700)
        self.path = str(self.parent/"pcm.sock")
        self.pipe = None

    def tearDown(self):
        if self.pipe:
            self.pipe.close()
        self.temp.cleanup()

    def create(self, **overrides):
        args = dict(path=self.path, pipe_name="SodaDesktopAudio-"+"a"*32, client_pid=os.getpid(), parent_pid=os.getpid())
        args.update(overrides)
        return audio.ParentPipe(**args)

    def test_parent_peer_and_exact_hello_and_pcm(self):
        self.pipe = self.create()
        self.assertEqual(os.stat(self.path).st_mode & 0o777, 0o600)
        client = socket.socket(socket.AF_UNIX)
        try:
            client.connect(self.path)
            self.pipe.accept(lambda: True, time.monotonic()+1)
            client.settimeout(1)
            self.assertEqual(client.recv(16), audio.HELLO)
            record = audio.PcmFrames().push(b"\1"*3840, 10, 10.02)[0]
            self.pipe.send(record, lambda: True, time.monotonic()+1)
            self.assertEqual(client.recv(len(record)), record)
        finally:
            client.close()
        self.pipe.close()
        self.assertFalse(Path(self.path).exists())
        self.assertTrue(self.parent.exists())  # Node owns the directory.

    def test_receiver_disconnect_revokes_capture_admission(self):
        self.pipe = self.create()
        client = socket.socket(socket.AF_UNIX)
        client.connect(self.path)
        self.pipe.accept(lambda: True, time.monotonic()+1)
        self.assertEqual(client.recv(16), audio.HELLO)
        self.assertTrue(self.pipe.peer_alive())
        client.close()
        self.assertFalse(self.pipe.peer_alive())

    def test_wrong_pid_cannot_receive_hello(self):
        self.pipe = self.create()
        child = subprocess.Popen([sys.executable, "-c", "import socket,sys; s=socket.socket(socket.AF_UNIX); s.connect(sys.argv[1]); assert s.recv(16)==b''", self.path])
        try:
            with self.assertRaisesRegex(audio.AudioFailure, "peer_scope"):
                self.pipe.accept(lambda: True, time.monotonic()+2)
            self.assertEqual(child.wait(timeout=2), 0)
        finally:
            if child.poll() is None:
                child.kill()
                child.wait()

    def test_existing_path_is_never_removed(self):
        Path(self.path).write_text("retain")
        with self.assertRaises(audio.AudioFailure):
            self.create()
        self.assertEqual(Path(self.path).read_text(), "retain")

    def test_replaced_parent_blocks_accept_and_cleanup_uses_original_fd(self):
        self.pipe = self.create()
        original = self.parent.with_name("owned-original")
        self.parent.rename(original)
        self.parent.mkdir(mode=0o700)
        replacement = socket.socket(socket.AF_UNIX)
        try:
            replacement.bind(self.path)
            with self.assertRaises(audio.AudioFailure):
                self.pipe.accept(lambda: True, time.monotonic()+1)
            self.pipe.close()
            self.assertTrue(Path(self.path).is_socket())
            self.assertFalse((original/"pcm.sock").exists())
        finally:
            replacement.close()

    def test_permission_and_path_scope(self):
        self.parent.chmod(0o755)
        with self.assertRaises(audio.AudioFailure):
            self.create()
        self.parent.chmod(0o700)
        for changes in [dict(client_pid=os.getpid()+1), dict(path=self.path+"/../pcm.sock"),
                        dict(path="relative.sock"), dict(pipe_name="SodaDesktopMicrophone-"+"a"*32)]:
            with self.assertRaises(audio.AudioFailure):
                self.create(**changes)
        self.assertFalse(Path(self.path).exists())

    def test_partial_io_error_is_terminal_and_cannot_splice_another_record(self):
        self.pipe = self.create()
        peer = Mock()
        peer.send.side_effect = [3, OSError("generated write failure")]
        self.pipe.peer = peer
        with patch.object(audio.select, "select", return_value=([], [peer], [])):
            with self.assertRaises(OSError):
                self.pipe.send(b"\0"*3856, lambda: True, time.monotonic()+1)
            self.assertIsNone(self.pipe.peer)
            peer.close.assert_called_once()
            self.assertEqual(peer.send.call_count, 2)
            with self.assertRaises(audio.AudioFailure):
                self.pipe.send(b"\0"*3856, lambda: True, time.monotonic()+1)
            self.assertEqual(peer.send.call_count, 2)

    def test_active_query_cannot_authorize_a_replaced_parent(self):
        self.pipe = self.create()
        peer = Mock()
        self.pipe.peer = peer
        calls = 0
        peer.send.return_value = 3856
        def active():
            nonlocal calls
            calls += 1
            if calls == 2:
                self.parent.chmod(0o755)
            return True
        try:
            with patch.object(audio.select, "select", return_value=([], [peer], [])):
                with self.assertRaises(audio.AudioFailure):
                    self.pipe.send(b"\0"*3856, active, time.monotonic()+1)
            peer.send.assert_not_called()
            peer.close.assert_called_once()
        finally:
            self.parent.chmod(0o700)

    def test_wait_cannot_outlive_source_deadline_or_parent(self):
        for cause in ("active", "deadline", "parent"):
            with self.subTest(cause=cause):
                self.pipe = self.create()
                peer = Mock()
                self.pipe.peer = peer
                peer.send.return_value = 3856
                live = True
                now = 10
                def wait(*_args):
                    nonlocal live, now
                    if cause == "active":
                        live = False
                    elif cause == "deadline":
                        now = 11
                    else:
                        self.parent.chmod(0o755)
                    return ([], [peer], [])
                try:
                    with patch.object(audio.select, "select", side_effect=wait), patch.object(audio.time, "monotonic", side_effect=lambda: now):
                        with self.assertRaises(audio.AudioFailure):
                            self.pipe.send(b"\0"*3856, lambda: live, 11)
                    peer.send.assert_not_called()
                    peer.close.assert_called_once()
                    self.assertIsNone(self.pipe.peer)
                finally:
                    self.parent.chmod(0o700)
                    self.pipe.close()

    def test_expired_source_closes_peer_before_emitting(self):
        self.pipe = self.create()
        client = socket.socket(socket.AF_UNIX)
        try:
            client.connect(self.path)
            self.pipe.accept(lambda: True, time.monotonic()+1)
            self.assertEqual(client.recv(16), audio.HELLO)
            with self.assertRaises(audio.AudioFailure):
                self.pipe.send(b"\0"*3856, lambda: False, time.monotonic()+1)
            self.assertEqual(client.recv(1), b"")
            self.assertIsNone(self.pipe.peer)
        finally:
            client.close()


class GeneratedSourceLifetime(unittest.TestCase):
    @staticmethod
    def command():
        return {"type":"native_audio", "enabled":True, "id":"22222222-2222-4222-8222-222222222222",
                "pipeName":"SodaDesktopAudio-"+"a"*32, "pipePath":"/generated-only.sock", "clientPid":123}

    def test_no_source_is_created_until_parent_authenticated(self):
        pipe = Mock()
        entered = threading.Event()
        resume = threading.Event()
        factory = Mock()
        def accept(*_args, **_kwargs):
            entered.set()
            resume.wait(1)
        pipe.accept.side_effect = accept
        with patch.object(audio, "ParentPipe", return_value=pipe):
            actor = audio.SystemAudioActor(None, self.command(), lambda: True, factory)
            self.assertTrue(entered.wait(1))
            factory.assert_not_called()
            actor.stop()
            resume.set()
            actor.thread.join(1)
            self.assertFalse(actor.thread.is_alive())
            self.assertTrue(actor.closed.is_set())
            factory.assert_not_called()
            pipe.send.assert_not_called()
            pipe.close.assert_called_once()

    def test_generated_pcm_is_zeroed_and_source_retires_before_pipe(self):
        pipe = Mock()
        source = Mock()
        retired = []
        now = time.monotonic()
        raw = bytearray(b"\1"*3840)
        source.pull.side_effect = [(raw, now-0.02, now), audio.AudioFailure("generated source end")]
        source.close.side_effect = lambda: retired.append("source")
        pipe.close.side_effect = lambda: retired.append("pipe")
        with patch.object(audio, "ParentPipe", return_value=pipe):
            actor = audio.SystemAudioActor(None, self.command(), lambda: True, lambda: source)
            actor.thread.join(1)
        self.assertTrue(actor.closed.is_set())
        self.assertEqual(raw, bytearray(3840))
        self.assertEqual(retired, ["source", "pipe"])
        records = [call.args[0] for call in pipe.send.call_args_list]
        self.assertEqual(records[0], audio.HELLO)
        self.assertEqual(records[1][16:], b"\1"*3840)
        self.assertEqual(len(records), 2)

    def test_silent_source_retires_when_receiver_disconnects_without_an_audio_frame(self):
        pipe = Mock()
        source = Mock()
        order = []
        pipe.peer_alive.side_effect = [True, True, False]
        source.start.side_effect = lambda active, _deadline: self.assertTrue(active())
        source.pull.return_value = None
        source.close.side_effect = lambda: order.append("source")
        pipe.close.side_effect = lambda: order.append("pipe")
        with patch.object(audio, "ParentPipe", return_value=pipe):
            actor = audio.SystemAudioActor(None, self.command(), lambda: True, lambda: source)
            actor.thread.join(1)
        try:
            self.assertFalse(actor.thread.is_alive())
            self.assertTrue(actor.closed.is_set())
            self.assertEqual(order, ["source", "pipe"])
            source.pull.assert_called_once()
            self.assertEqual(pipe.send.call_count, 1)  # Hello only, no forged silence.
        finally:
            actor.stop()
            actor.thread.join(1)

    def test_unconfirmed_source_retirement_holds_slot_and_path(self):
        pipe = Mock()
        source = Mock()
        source.start.side_effect = audio.AudioFailure("generated startup failure")
        source.close.side_effect = audio.AudioFailure("generated unconfirmed NULL")
        with patch.object(audio, "ParentPipe", return_value=pipe):
            actor = audio.SystemAudioActor(None, self.command(), lambda: True, lambda: source)
            actor.thread.join(1)
        self.assertFalse(actor.thread.is_alive())
        self.assertFalse(actor.closed.is_set())
        self.assertIs(actor.source, source)
        self.assertIs(actor.pipe, pipe)
        self.assertEqual(actor.failure, "audio_retirement")
        pipe.send.assert_not_called()
        pipe.close.assert_not_called()

    def test_configuration_cannot_outlive_capture_admission_or_startup_deadline(self):
        for cause in ("cancel", "deadline"):
            with self.subTest(cause=cause):
                live = True
                now = 10
                pipeline = Mock()
                class GeneratedMonitor(audio.PulseMonitor):
                    def configure(self):
                        nonlocal live, now
                        self.pipeline = pipeline
                        if cause == "cancel":
                            live = False
                        else:
                            now = 12.5
                source = GeneratedMonitor(Mock())
                with patch.object(audio.time, "monotonic", side_effect=lambda: now):
                    with self.assertRaises(audio.AudioFailure):
                        source.start(lambda: live, 12.5)
                pipeline.set_state.assert_not_called()

    def test_monitor_constructor_is_idle_and_null_confirmation_is_required(self):
        Gst = Mock()
        monitor = audio.PulseMonitor(Gst)
        Gst.Pipeline.new.assert_not_called()
        monitor.close()
        pipeline = Mock()
        monitor.pipeline = pipeline
        pipeline.set_state.return_value = Gst.StateChangeReturn.SUCCESS
        pipeline.get_state.return_value = (None, Gst.State.PLAYING, None)
        with self.assertRaises(audio.AudioFailure):
            monitor.close()
        self.assertIs(monitor.pipeline, pipeline)
        pipeline.get_state.return_value = (None, Gst.State.NULL, None)
        monitor.close()

    @unittest.skipUnless(sys.platform == "linux", "Local Unix Pulse socket validation")
    def test_only_owned_local_monitor_socket_ignores_remote_server_env(self):
        with tempfile.TemporaryDirectory(prefix="soda-audio-runtime-") as root:
            pulse = Path(root)/"pulse"
            pulse.mkdir(mode=0o700)
            endpoint = socket.socket(socket.AF_UNIX)
            try:
                endpoint.bind(str(pulse/"native"))
                with patch.dict(os.environ, {"PULSE_SERVER":"tcp:remote.invalid:4713"}):
                    self.assertEqual(audio.pulse_monitor_server(root), "unix:"+str(pulse/"native"))
                Path(root).chmod(0o755)
                with self.assertRaises(audio.AudioFailure):
                    audio.pulse_monitor_server(root)
                Path(root).chmod(0o700)
            finally:
                endpoint.close()



class GeneratedGstreamer(unittest.TestCase):
    def test_generated_tone_uses_the_same_pcm_pull_and_retirement_path(self):
        try:
            import gi
            gi.require_version("Gst", "1.0")
            from gi.repository import Gst
        except (ImportError, ValueError):
            self.skipTest("GStreamer GI unavailable")
        Gst.init(None)
        if any(Gst.ElementFactory.find(name) is None for name in ("audiotestsrc", "audioconvert", "identity", "appsink")):
            self.skipTest("Generated audio plugins unavailable")
        class GeneratedMonitor(audio.PulseMonitor):
            def configure(self):
                self.pipeline = Gst.parse_launch("audiotestsrc is-live=true wave=sine freq=440 volume=0.3 samplesperbuffer=960 ! audioconvert ! audio/x-raw,format=S16LE,layout=interleaved,rate=48000,channels=2 ! identity sleep-time=20000 ! appsink name=pcm sync=false max-buffers=2 drop=true enable-last-sample=false")
                self.sink = self.pipeline.get_by_name("pcm")
        source = GeneratedMonitor(Gst)
        frames = audio.PcmFrames()
        try:
            source.start(lambda: True, time.monotonic()+2)
            deadline = time.monotonic()+2
            emitted = []
            while not emitted and time.monotonic() < deadline:
                sample = source.pull()
                if sample is not None:
                    data, captured, observed = sample
                    emitted.extend(frames.push(data, captured, observed))
            self.assertTrue(emitted)
            pcm = struct.unpack("<1920h", emitted[0][16:])
            self.assertGreater(max(abs(value) for value in pcm), 1000)
            self.assertEqual(len(emitted[0]), 3856)
        finally:
            frames.clear()
            source.close()
        self.assertEqual(source.pipeline.get_state(Gst.SECOND)[1], Gst.State.NULL)


if __name__ == "__main__":
    unittest.main()
