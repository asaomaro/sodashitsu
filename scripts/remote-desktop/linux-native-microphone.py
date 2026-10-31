"""Explicit virtual output only. Import/ABI tests never open an audio endpoint.

A dedicated owned process prevents output retirement faults from taking down
screen capture. No daemon, driver, default-device change or child process.
"""
import ctypes as C
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import select
import struct
import sys
import time

_spec = importlib.util.spec_from_file_location("soda_mic_private_audio", Path(__file__).with_name("linux-native-audio.py"))
_audio = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_audio)
HELLO = bytes([83,68,77,73,1,1,16,0,128,187,0,0,192,3,0,0])

class MicrophoneFailure(Exception):
    pass

class SampleSpec(C.Structure):
    _fields_ = [("format", C.c_int), ("rate", C.c_uint32), ("channels", C.c_uint8)]
class ChannelMap(C.Structure):
    _fields_ = [("channels", C.c_uint8), ("map", C.c_int * 32)]
class Volume(C.Structure):
    _fields_ = [("channels", C.c_uint8), ("values", C.c_uint32 * 32)]
class SinkInfo(C.Structure):
    # Stable public pa_sink_info prefix through proplist; never inspect later fields.
    _fields_ = [("name", C.c_char_p), ("index", C.c_uint32), ("description", C.c_char_p),
        ("sample_spec", SampleSpec), ("channel_map", ChannelMap), ("owner_module", C.c_uint32),
        ("volume", Volume), ("mute", C.c_int), ("monitor_source", C.c_uint32),
        ("monitor_source_name", C.c_char_p), ("latency", C.c_uint64), ("driver", C.c_char_p),
        ("flags", C.c_int), ("proplist", C.c_void_p)]
class BufferAttr(C.Structure):
    _fields_ = [(name, C.c_uint32) for name in ("maxlength", "tlength", "prebuf", "minreq", "fragsize")]
SinkCallback = C.CFUNCTYPE(None, C.c_void_p, C.POINTER(SinkInfo), C.c_int, C.c_void_p)

def library():
    if C.sizeof(C.c_void_p) != 8 or C.sizeof(SampleSpec) != 12 or SinkInfo.proplist.offset != 344:
        raise MicrophoneFailure("audio_abi")
    lib = C.CDLL("libpulse.so.0")
    p, i, u = C.c_void_p, C.c_int, C.c_uint32
    signatures = {
        "pa_mainloop_new": (p, []), "pa_mainloop_get_api": (p, [p]), "pa_mainloop_iterate": (i, [p, i, C.POINTER(i)]), "pa_mainloop_free": (None, [p]),
        "pa_context_new": (p, [p, C.c_char_p]), "pa_context_connect": (i, [p, C.c_char_p, i, p]), "pa_context_get_state": (i, [p]),
        "pa_context_disconnect": (None, [p]), "pa_context_unref": (None, [p]), "pa_context_get_server_protocol_version": (u, [p]),
        "pa_context_get_sink_info_by_name": (p, [p, C.c_char_p, SinkCallback, p]), "pa_context_get_sink_info_list": (p, [p, SinkCallback, p]),
        "pa_operation_get_state": (i, [p]), "pa_operation_unref": (None, [p]), "pa_proplist_gets": (C.c_char_p, [p, C.c_char_p]),
        "pa_stream_new": (p, [p, C.c_char_p, C.POINTER(SampleSpec), p]), "pa_stream_connect_playback": (i, [p, C.c_char_p, C.POINTER(BufferAttr), i, p, p]),
        "pa_stream_get_state": (i, [p]), "pa_stream_get_device_index": (u, [p]), "pa_stream_get_device_name": (C.c_char_p, [p]),
        "pa_stream_writable_size": (C.c_size_t, [p]), "pa_stream_write": (i, [p, p, C.c_size_t, p, C.c_int64, i]),
        "pa_stream_disconnect": (i, [p]), "pa_stream_unref": (None, [p]),
    }
    for name, (result, args) in signatures.items():
        function = getattr(lib, name); function.restype = result; function.argtypes = args
    return lib

def endpoint_name(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,256}", value):
        raise MicrophoneFailure("explicit_virtual_endpoint")
    return value

def virtual_sink(info, properties):
    # Never select a default or a physical output. A recording monitor is mandatory.
    return (not info["flags"] & 4 and info["monitor"] != 0xffffffff
            and bool(info["monitor_name"]) and
            (info["driver"] == "module-null-sink.c" or
             properties.get("node.virtual") == "true" and properties.get("media.class") == "Audio/Sink"))

class PulseOutput:
    @staticmethod
    def available():
        try: library(); _audio.pulse_monitor_server(); return True
        except Exception: return False
    def __init__(self, endpoint, api=None, server=None, clock=time.monotonic):
        self.endpoint = endpoint_name(endpoint); self.api = api; self.server = server; self.clock = clock
        self.loop = self.context = self.stream = None; self.target = None
        self.callbacks = []; self.operations = []; self.failed = False
    def poll(self):
        result = C.c_int()
        if self.api.pa_mainloop_iterate(self.loop, 0, C.byref(result)) < 0:
            raise MicrophoneFailure("audio_server")
    def wait(self, test, active, deadline):
        while True:
            if not active() or self.clock() >= deadline: raise MicrophoneFailure("audio_expired")
            self.poll()
            if test():
                if not active() or self.clock() >= deadline: raise MicrophoneFailure("audio_expired")
                return
            time.sleep(0.005)
    def connect(self, active, deadline):
        self.api = self.api or library(); server = self.server or _audio.pulse_monitor_server()
        self.loop = self.api.pa_mainloop_new()
        if not self.loop: raise MicrophoneFailure("audio_loop")
        self.context = self.api.pa_context_new(self.api.pa_mainloop_get_api(self.loop), b"Sodashitsu virtual microphone")
        if not self.context or not active() or self.clock() >= deadline: raise MicrophoneFailure("audio_expired")
        # Explicit owned Unix server; PA_CONTEXT_NOAUTOSPAWN prevents new daemons.
        if self.api.pa_context_connect(self.context, server.encode(), 1, None) < 0: raise MicrophoneFailure("audio_server")
        def ready():
            state = self.api.pa_context_get_state(self.context)
            if state in (5, 6): raise MicrophoneFailure("audio_server")
            return state == 4
        self.wait(ready, active, deadline)
        if self.api.pa_context_get_server_protocol_version(self.context) < 23: raise MicrophoneFailure("audio_protocol")
    def targets(self, active, deadline, all_targets=False):
        found = []; ended = [False]; failed = [False]
        @SinkCallback
        def callback(_context, pointer, eol, _user):
            try:
                if eol < 0: failed[0] = True; return
                if eol > 0: ended[0] = True; return
                if not pointer or len(found) >= 128: raise MicrophoneFailure("audio_targets_bound")
                value = pointer.contents
                def text(raw):
                    if raw is None: return ""
                    if len(raw) > 2048: raise MicrophoneFailure("audio_target_bound")
                    return raw.decode("utf-8")
                info = {"name": text(value.name), "index": value.index, "description": text(value.description), "driver": text(value.driver), "flags": value.flags, "monitor": value.monitor_source, "monitor_name": text(value.monitor_source_name)}
                props = {name: text(self.api.pa_proplist_gets(value.proplist, name.encode())) for name in ("node.virtual", "media.class")}
                if virtual_sink(info, props):
                    endpoint_name(info["name"]);found.append(info)
            except Exception: failed[0] = True
        self.callbacks.append(callback)
        operation = (self.api.pa_context_get_sink_info_list(self.context, callback, None) if all_targets else self.api.pa_context_get_sink_info_by_name(self.context, self.endpoint.encode(), callback, None))
        if not operation: raise MicrophoneFailure("audio_targets")
        self.operations.append(operation)
        try:
            self.wait(lambda: ended[0] or failed[0], active, deadline)
            if failed[0]: raise MicrophoneFailure("audio_targets")
            if not all_targets and (len(found) != 1 or found[0]["name"] != self.endpoint): raise MicrophoneFailure("virtual_endpoint_required")
            return found
        finally:
            self.api.pa_operation_unref(operation); self.operations.remove(operation)
    def start(self, active, deadline):
        self.connect(active, deadline); self.target = self.targets(active, deadline)[0]
        if not active() or self.clock() >= deadline: raise MicrophoneFailure("audio_expired")
        spec = SampleSpec(3, 48000, 1); attr = BufferAttr(3840, 1920, 0, 1920, 0xffffffff)
        self.stream = self.api.pa_stream_new(self.context, b"Sodashitsu microphone input", C.byref(spec), None)
        if not self.stream or not active() or self.clock() >= deadline: raise MicrophoneFailure("audio_expired")
        # PA_STREAM_DONT_MOVE | PA_STREAM_ADJUST_LATENCY: no speaker/default fallback.
        if self.api.pa_stream_connect_playback(self.stream, self.endpoint.encode(), C.byref(attr), 0x2200, None, None) < 0: raise MicrophoneFailure("audio_start")
        def ready():
            state = self.api.pa_stream_get_state(self.stream)
            if state in (3, 4): raise MicrophoneFailure("audio_stream")
            return state == 2
        self.wait(ready, active, deadline); self.verify()
    def verify(self):
        if (not self.stream or self.api.pa_context_get_state(self.context) != 4 or self.api.pa_stream_get_state(self.stream) != 2
                or self.api.pa_stream_get_device_index(self.stream) != self.target["index"]
                or self.api.pa_stream_get_device_name(self.stream) != self.endpoint.encode()):
            raise MicrophoneFailure("audio_target_changed")
    def write(self, pcm, active):
        if len(pcm) != 1920: raise MicrophoneFailure("microphone_packet")
        if not active(): return
        self.poll();self.verify()
        if not active(): return
        space = self.api.pa_stream_writable_size(self.stream)
        if space == C.c_size_t(-1).value: raise MicrophoneFailure("audio_stream")
        if space < 1920: return  # bounded output; never wait for old queued speech
        data = C.create_string_buffer(bytes(pcm), 1920)
        try:
            if not active(): return
            if self.api.pa_stream_write(self.stream, data, 1920, None, 0, 0) < 0: raise MicrophoneFailure("audio_write")
        finally: C.memset(data, 0, 1920)
    def close(self):
        # No background callbacks or children. Closing context retires every owned stream.
        if self.api is None: return
        if self.stream: self.api.pa_stream_disconnect(self.stream);self.api.pa_stream_unref(self.stream);self.stream = None
        if self.context: self.api.pa_context_disconnect(self.context);self.api.pa_context_unref(self.context);self.context = None
        if self.loop: self.api.pa_mainloop_free(self.loop);self.loop = None
        self.callbacks.clear();self.operations.clear()

def microphone_packet(packet, previous, now):
    if len(packet) != 1932: raise MicrophoneFailure("microphone_packet")
    sequence, expires = struct.unpack_from("<Id", packet)
    if sequence <= previous or not math.isfinite(expires) or expires > now + 150: raise MicrophoneFailure("microphone_order")
    return sequence, expires, memoryview(packet)[12:]

def read_bootstrap(fd, deadline):
    data = bytearray()
    while time.monotonic() < deadline:
        if not select.select([fd], [], [], min(0.02, max(0, deadline-time.monotonic())))[0]: continue
        chunk = os.read(fd, 4097-len(data))
        if not chunk: break
        data.extend(chunk)
        if len(data) > 4096: raise MicrophoneFailure("bootstrap_bound")
        if b"\n" in data:
            if data.count(b"\n") != 1 or not data.endswith(b"\n"): raise MicrophoneFailure("bootstrap_record")
            value = json.loads(data.decode("utf-8"))
            if (not isinstance(value, dict) or set(value) != {"version", "pipeName", "pipePath", "clientPid", "endpoint"}
                    or type(value["version"]) is not int or value["version"] != 1): raise MicrophoneFailure("bootstrap_record")
            endpoint_name(value["endpoint"])
            return value
    raise MicrophoneFailure("bootstrap_eof")

def worker():
    deadline = time.monotonic()+2.5; value = read_bootstrap(0, deadline);parent = os.getppid();pipe = sink = scope = None
    def control():
        return os.getppid() == parent and not select.select([0], [], [], 0)[0]
    try:
        pipe = _audio.ParentPipe(value["pipePath"], value["pipeName"], value["clientPid"], microphone=True)
        pipe.accept(control, deadline, hello=False)
        # Reuse the normal native backend's current-user/active/unlocked logind scope.
        spec = importlib.util.spec_from_file_location("soda_mic_login_scope", Path(__file__).with_name("linux-portal-helper.py"))
        source = importlib.util.module_from_spec(spec);spec.loader.exec_module(source)
        import gi
        gi.require_version("Gio", "2.0");from gi.repository import Gio, GLib
        scope = source.LoginScope(Gio, GLib)
        def active(): return control() and scope.alive() and pipe.peer_alive(allow_input=True)
        sink = PulseOutput(value["endpoint"]);sink.start(active, deadline)
        pipe.send(HELLO, active, deadline);previous = 0
        while active():
            packet = pipe.receive(1932, active, time.monotonic()+2)
            try:
                previous, expires, pcm = microphone_packet(packet, previous, time.time()*1000)
                if expires >= time.time()*1000: sink.write(pcm, lambda: active() and expires >= time.time()*1000)
            finally: packet[:] = b"\0"*len(packet)
    finally:
        if sink is not None: sink.close()
        if scope is not None: scope.close()
        if pipe is not None: pipe.close()

if __name__ == "__main__":
    try:
        if len(sys.argv) != 1: raise MicrophoneFailure("arguments")
        worker()
    except Exception: sys.exit(1)
