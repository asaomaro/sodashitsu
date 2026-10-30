"""Private system-audio transport. Import/tests never record or play audio.

Only the launching Node parent's UID/PID may receive PCM. The directory is
created by that parent; this helper neither removes preexisting paths nor
accepts a network address. Source factories are internal, never IPC options.
"""
import math
import os
import re
import select
import socket
import stat
import struct
import time
import threading
import uuid

HELLO = bytes([83,68,65,80,1,2,16,0,128,187,0,0,192,3,0,0])
FRAME_BYTES = 3840
MAX_BYTES = 19200  # 100ms, 48kHz stereo S16LE


class AudioFailure(Exception):
    pass


def identity(value):
    return value.st_dev, value.st_ino


class PcmFrames:
    """At most one incomplete 20ms frame; no sequence assigned to dropped data."""
    def __init__(self):
        self.pending = bytearray()
        self.start = None
        self.expected = None
        self.sequence = 0
        self.last = 0

    def clear(self):
        self.pending[:] = b"\0" * len(self.pending)
        self.pending.clear()
        self.start = None
        self.expected = None

    def push(self, data, captured, now):
        if (not isinstance(data, (bytes, bytearray)) or not 0 < len(data) <= MAX_BYTES
                or len(data) % 4 or not math.isfinite(captured) or not math.isfinite(now)
                or captured < 0 or captured + len(data) / 192000 > now + 0.005 or now - captured > 0.1):
            self.clear()
            raise AudioFailure("pcm_bound")
        if self.expected is not None and abs(captured - self.expected) > 0.002:
            self.clear()
        if self.start is None:
            self.start = captured
        self.pending.extend(data)
        self.expected = captured + len(data) / 192000
        frames = []
        while len(self.pending) >= FRAME_BYTES:
            timestamp = round(self.start * 1000000)
            if now - self.start <= 0.1 and timestamp > self.last:
                if self.sequence >= 0xffffffff:
                    self.clear()
                    raise AudioFailure("pcm_sequence")
                self.sequence += 1
                frames.append(struct.pack("<IIQ", FRAME_BYTES, self.sequence, timestamp)
                              + bytes(self.pending[:FRAME_BYTES]))
                self.last = timestamp
            self.pending[:FRAME_BYTES] = b"\0" * FRAME_BYTES
            del self.pending[:FRAME_BYTES]
            self.start += 0.02
        if not self.pending:
            self.start = None
        return frames


class ParentPipe:
    """A single authenticated Unix peer, anchored cleanup through a directory fd."""
    def __init__(self, path, pipe_name, client_pid, parent_pid=None):
        parent_pid = os.getppid() if parent_pid is None else parent_pid
        self.parent_pid = parent_pid
        self.listener = None
        self.peer = None
        self.directory_fd = None
        self.witness = None
        self.socket_witness = None
        self.path = path
        if (not isinstance(path, str) or "\0" in path or len(os.fsencode(path)) > 100
                or not os.path.isabs(path) or os.path.normpath(path) != path
                or os.path.basename(path) != "pcm.sock"
                or not re.fullmatch(r"soda-native-pcm-[A-Za-z0-9]{6}", os.path.basename(os.path.dirname(path)))
                or not isinstance(pipe_name, str)
                or not re.fullmatch(r"SodaDesktopAudio-[a-f0-9]{32}", pipe_name)
                or type(client_pid) is not int or client_pid != parent_pid or parent_pid <= 1):
            raise AudioFailure("pipe_scope")
        try:
            directory = os.path.dirname(path)
            self.directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
            info = os.fstat(self.directory_fd)
            if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
                raise AudioFailure("pipe_scope")
            self.witness = identity(info)
            self.check_parent()
            self.listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            # Resolve the pinned directory, even if the path is renamed meanwhile.
            self.listener.bind("/proc/self/fd/%d/pcm.sock" % self.directory_fd)
            self.socket_witness = identity(os.stat("pcm.sock", dir_fd=self.directory_fd, follow_symlinks=False))
            os.chmod("pcm.sock", 0o600, dir_fd=self.directory_fd, follow_symlinks=False)
            self.check_parent()
            self.listener.listen(1)
            self.listener.setblocking(False)
        except Exception:
            self.close()
            raise AudioFailure("pipe_scope") from None

    def check_parent(self):
        # Tests explicitly pass the current PID and use only generated sockets.
        if self.parent_pid not in (os.getpid(), os.getppid()):
            raise AudioFailure("parent_gone")
        info = os.lstat(os.path.dirname(self.path))
        if (not stat.S_ISDIR(info.st_mode) or identity(info) != self.witness
                or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700):
            raise AudioFailure("pipe_scope")

    def accept(self, active, deadline, hello=True):
        while active() and time.monotonic() < deadline:
            self.check_parent()
            if not select.select([self.listener], [], [], min(0.02, max(0, deadline-time.monotonic())))[0]:
                continue
            peer, _ = self.listener.accept()
            try:
                pid, uid, _ = struct.unpack("3i", peer.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
                if pid != self.parent_pid or uid != os.getuid():
                    raise AudioFailure("peer_scope")
                self.check_parent()
                peer.setblocking(False)
                self.peer = peer
                self.listener.close()
                self.listener = None
                if hello:
                    self.send(HELLO, active, deadline)
                return
            except Exception:
                peer.close()
                raise
        raise AudioFailure("pipe_timeout")

    def peer_alive(self):
        if self.peer is None:
            return False
        self.check_parent()
        if select.select([self.peer], [], [], 0)[0]:
            # The receiver never writes application data. EOF or unexpected
            # reverse data invalidates capture admission just like source stop.
            return False
        return True

    def send(self, record, active, deadline):
        try:
            self._send_record(record, active, deadline)
        except Exception:
            if self.peer is not None:
                self.peer.close()
                self.peer = None
            raise

    def _send_record(self, record, active, deadline):
        if self.peer is None or not isinstance(record, bytes) or len(record) not in (16, FRAME_BYTES+16):
            raise AudioFailure("pipe_record")
        def validate():
            try:
                if not active():
                    raise AudioFailure("pipe_expired")
                self.check_parent()
                if time.monotonic() >= deadline:
                    raise AudioFailure("pipe_expired")
            except Exception:
                # A partial record must never continue under a new scope.
                self.peer.close()
                self.peer = None
                raise
        offset = 0
        while offset < len(record):
            validate()
            if not select.select([], [self.peer], [], min(0.02, max(0, deadline-time.monotonic())))[1]:
                continue
            validate()
            try:
                sent = self.peer.send(record[offset:])
            except BlockingIOError:
                continue
            if sent <= 0:
                raise AudioFailure("pipe_closed")
            offset += sent

    def close(self):
        for endpoint in (self.peer, self.listener):
            if endpoint is not None:
                endpoint.close()
        self.peer = self.listener = None
        if self.directory_fd is not None:
            try:
                value = os.stat("pcm.sock", dir_fd=self.directory_fd, follow_symlinks=False)
                if stat.S_ISSOCK(value.st_mode) and identity(value) == self.socket_witness:
                    os.unlink("pcm.sock", dir_fd=self.directory_fd)
            except FileNotFoundError:
                pass
            finally:
                os.close(self.directory_fd)
                self.directory_fd = None


def pulse_monitor_server(runtime=None):
    """Only the current user's local Pulse/PipeWire compatibility socket.

    No PULSE_SERVER, TCP address, default recording device or microphone fallback.
    """
    runtime = runtime if runtime is not None else os.environ.get("XDG_RUNTIME_DIR", "/run/user/%d" % os.getuid())
    if not isinstance(runtime, str) or not os.path.isabs(runtime) or os.path.realpath(runtime) != runtime:
        raise AudioFailure("sound_server")
    try:
        root = os.lstat(runtime)
        server = os.path.join(runtime, "pulse", "native")
        endpoint = os.lstat(server)
        if (not stat.S_ISDIR(root.st_mode) or root.st_uid != os.getuid()
                or stat.S_IMODE(root.st_mode) != 0o700
                or not stat.S_ISSOCK(endpoint.st_mode) or endpoint.st_uid != os.getuid()
                or os.path.realpath(server) != server):
            raise AudioFailure("sound_server")
        return "unix:" + server
    except OSError:
        raise AudioFailure("sound_server") from None


class PulseMonitor:
    """Lazy explicit output-monitor source; never instantiated by import/probe."""
    REQUIRED = ("pulsesrc", "audioconvert", "audioresample", "capsfilter", "appsink")

    @staticmethod
    def available(Gst):
        return all(Gst.ElementFactory.find(name) is not None for name in PulseMonitor.REQUIRED)

    def __init__(self, Gst):
        self.Gst = Gst
        self.pipeline = None
        self.sink = None

    def configure(self):
        Gst = self.Gst
        server = pulse_monitor_server()
        if not self.available(Gst) or self.pipeline is not None:
            raise AudioFailure("dependencies")
        self.pipeline = Gst.Pipeline.new(None)
        elements = [Gst.ElementFactory.make(name, None) for name in self.REQUIRED]
        if any(item is None for item in elements):
            raise AudioFailure("dependencies")
        source, convert, resample, caps, self.sink = elements
        source.set_property("server", server)
        source.set_property("device", "@DEFAULT_MONITOR@")
        source.set_property("client-name", "Sodashitsu remote desktop system audio")
        source.set_property("latency-time", 20000)
        source.set_property("buffer-time", 60000)
        caps.set_property("caps", Gst.Caps.from_string("audio/x-raw,format=S16LE,layout=interleaved,rate=48000,channels=2"))
        self.sink.set_property("sync", False)
        self.sink.set_property("max-buffers", 2)
        self.sink.set_property("drop", True)
        self.sink.set_property("enable-last-sample", False)
        for item in elements:
            self.pipeline.add(item)
        if not all(a.link(b) for a, b in zip(elements, elements[1:])):
            raise AudioFailure("audio_link")

    def start(self, active, deadline):
        self.configure()
        if not active() or time.monotonic() >= deadline:
            raise AudioFailure("audio_expired")
        if self.pipeline.set_state(self.Gst.State.PLAYING) == self.Gst.StateChangeReturn.FAILURE:
            raise AudioFailure("audio_start")

    def pull(self):
        Gst = self.Gst
        if self.pipeline.get_bus().pop_filtered(Gst.MessageType.ERROR | Gst.MessageType.EOS):
            raise AudioFailure("audio_ended")
        sample = self.sink.emit("try-pull-sample", 20 * Gst.MSECOND)
        if sample is None:
            return None  # Silence is not proof of termination.
        structure = sample.get_caps().get_structure(0)
        if (structure.get_name() != "audio/x-raw" or structure.get_string("format") != "S16LE"
                or structure.get_string("layout") != "interleaved"
                or structure.get_value("rate") != 48000 or structure.get_value("channels") != 2):
            raise AudioFailure("audio_format")
        buffer = sample.get_buffer()
        if buffer.pts == Gst.CLOCK_TIME_NONE or not 0 < buffer.get_size() <= MAX_BYTES:
            raise AudioFailure("audio_bound")
        clock = self.pipeline.get_clock()
        if clock is None:
            raise AudioFailure("audio_clock")
        now = time.monotonic()
        captured = now - ((clock.get_time() - self.pipeline.get_base_time()) - buffer.pts) / Gst.SECOND
        mapped, data = buffer.map(Gst.MapFlags.READ)
        if not mapped:
            raise AudioFailure("audio_map")
        try:
            return bytearray(data.data), captured, now
        finally:
            buffer.unmap(data)

    def close(self):
        pipeline = self.pipeline
        if pipeline is None:
            return
        result = pipeline.set_state(self.Gst.State.NULL)
        _, state, _ = pipeline.get_state(self.Gst.SECOND)
        if result == self.Gst.StateChangeReturn.FAILURE or state != self.Gst.State.NULL:
            # Keep pipeline referenced. The owning actor must retain its physical
            # slot and pipe until real helper process close, never just a timer.
            raise AudioFailure("audio_retirement")


class SystemAudioActor:
    """One physical source retained until confirmed source/pipe retirement.

    Only the helper's admitted native_audio command constructs this actor.
    source_factory is an internal generated-test seam, never a wire field.
    """
    def __init__(self, Gst, command, active, source_factory=None):
        allowed = {"type", "id", "enabled", "pipeName", "pipePath", "clientPid"}
        try:
            valid_id = (isinstance(command.get("id"), str) and len(command["id"]) == 36
                        and str(uuid.UUID(command["id"])) == command["id"])
        except (ValueError, AttributeError):
            valid_id = False
        if (set(command) != allowed or command.get("type") != "native_audio"
                or command.get("enabled") is not True or not valid_id):
            raise AudioFailure("audio_command")
        self.id = command["id"]
        self.deadline = time.monotonic() + 2.5
        self.active = active
        self.cancelled = threading.Event()
        self.closed = threading.Event()
        self.source = None
        self.pipe = None
        self.failure = None
        self.framer = PcmFrames()
        self.factory = source_factory or (lambda: PulseMonitor(Gst))
        self.command = dict(command)
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()

    def live(self):
        return not self.cancelled.is_set() and self.active() and not self.cancelled.is_set()

    def stop(self):
        self.cancelled.set()

    def capture_admitted(self):
        return self.live() and self.pipe is not None and self.pipe.peer_alive() and not self.cancelled.is_set()

    def run(self):
        try:
            if not self.live() or time.monotonic() >= self.deadline:
                raise AudioFailure("audio_expired")
            self.pipe = ParentPipe(self.command["pipePath"], self.command["pipeName"], self.command["clientPid"])
            self.pipe.accept(self.live, self.deadline, hello=False)
            if not self.live() or time.monotonic() >= self.deadline:
                raise AudioFailure("audio_expired")
            # Construct only after the launching Node parent authenticated.
            # start() is separate so failed startup still has a retained owner.
            self.source = self.factory()
            if not self.live() or time.monotonic() >= self.deadline:
                raise AudioFailure("audio_expired")
            self.source.start(self.capture_admitted, self.deadline)
            self.pipe.send(HELLO, self.live, self.deadline)
            while self.capture_admitted():
                sample = self.source.pull()
                if sample is None:
                    if not self.capture_admitted():
                        break
                    continue
                data, captured, observed = sample
                try:
                    if not self.capture_admitted():
                        break
                    frames = self.framer.push(data, captured, observed)
                finally:
                    data[:] = b"\0"*len(data)
                for record in frames:
                    timestamp = struct.unpack("<IIQ", record[:16])[2]/1000000
                    self.pipe.send(record, self.capture_admitted, timestamp+0.1)
        except Exception:
            self.failure = "audio_unavailable"
        finally:
            self.cancelled.set()
            self.framer.clear()
            try:
                if self.source is not None:
                    self.source.close()
            except Exception:
                # Do not release the physical slot or path when Gst NULL was
                # unconfirmed. The helper owner retains this actor until exit.
                self.failure = "audio_retirement"
                return
            try:
                if self.pipe is not None:
                    self.pipe.close()
            except Exception:
                self.failure = "pipe_retirement"
                return
            self.closed.set()
