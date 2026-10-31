"""Owned native video flow. Import and generated tests never open a display/encoder."""
import base64
import re
import uuid
import queue
import threading
import time


class VideoFailure(Exception):
    pass


class EncoderRetirementFailure(VideoFailure):
    def __init__(self, pipeline):
        super().__init__("encoder_retirement")
        self.pipeline = pipeline


def retire_pipeline(Gst, pipeline):
    try:
        result = pipeline.set_state(Gst.State.NULL)
        _, state, _ = pipeline.get_state(Gst.SECOND)
        if result == Gst.StateChangeReturn.FAILURE or state != Gst.State.NULL:
            raise EncoderRetirementFailure(pipeline)
    except EncoderRetirementFailure:
        raise
    except Exception:
        raise EncoderRetirementFailure(pipeline) from None


def integer(value, low, high):
    return isinstance(value, int) and not isinstance(value, bool) and low <= value <= high


def identifier(value):
    try:
        return isinstance(value, str) and len(value) == 36 and str(uuid.UUID(value)) == value.lower()
    except (ValueError, AttributeError):
        return False


def access_unit(data):
    """Only Annex B access units; return the in-band SPS codec and IDR flag."""
    if not isinstance(data, bytes) or not 5 <= len(data) <= 512 * 1024 - 9:
        raise VideoFailure("frame_bound")
    if not data.startswith((b"\x00\x00\x01", b"\x00\x00\x00\x01")):
        raise VideoFailure("annex_b")
    units = re.split(b"\x00\x00\x00?\x01", data)[1:]
    if not units or any(not unit or unit[0] & 128 for unit in units):
        raise VideoFailure("nal_header")
    types = [unit[0] & 31 for unit in units]
    if not any(kind in (1, 5) for kind in types):
        raise VideoFailure("missing_picture")
    sps = next((unit for unit in units if unit[0] & 31 == 7), None)
    codec = None
    if sps is not None:
        if len(sps) < 4:
            raise VideoFailure("sps")
        codec = "avc1." + sps[1:4].hex().upper()
    key = 5 in types
    if key and (codec is None or 8 not in types):
        raise VideoFailure("key_headers")
    return codec, key


class NativeVideoFlow:
    """One stream, one encoding job, at most three unacknowledged records.

    The owner serializes public methods. `active` may perform a native permission
    query: every admission/publication checks identity and monotonic time after it.
    `emit` enqueues records with a final validity predicate, not a raw stdout write.
    A lost predictive frame ends this stream; a later record cannot cross its gap.
    """

    def __init__(self, active, clock, emit, maximum_fps=30, cadence=False):
        self.active = active
        self.clock = clock
        self.emit = emit
        self.maximum_fps = maximum_fps
        self.cadence = cadence
        self.current = None
        self.seen = set()
        self.revision = 0
        self.inflight = None

    def stop(self, notify=True):
        self.revision += 1
        stream = self.current
        self.current = None
        if stream is None:
            return
        stream["dead"] = True
        stream["pending"].clear()
        if notify:
            self.emit({"type": "native_video_stopped", "id": stream["id"]}, None)

    def start(self, value):
        allowed = {"type", "enabled", "id", "fps", "bitrateKbps", "window", "codec"}
        if (set(value) - allowed or value.get("type") != "native_video"
                or not identifier(value.get("id")) or not isinstance(value.get("enabled"), bool)):
            raise VideoFailure("request")
        value = {**value, "id": value["id"].lower()}
        if not value["enabled"]:
            if self.current and self.current["id"] == value["id"]:
                self.stop(False)
            return None
        fps, kbps, window = value.get("fps"), value.get("bitrateKbps"), value.get("window", 1)
        if (not integer(fps, 1, self.maximum_fps) or not integer(kbps, 128, 50000)
                or not integer(window, 1, 3) or window not in (1, 3)
                or value.get("codec", "h264") != "h264" or value["id"] in self.seen or len(self.seen) >= 1024
                or self.current is not None and value["id"] == self.current["id"]):
            raise VideoFailure("settings")
        self.stop()
        revision = self.revision
        granted = self.active()
        if revision != self.revision:
            return None
        if not granted:
            self.emit({"type": "native_video_stopped", "id": value["id"]}, None)
            return None
        stream = {"id": value["id"], "fps": fps, "kbps": kbps, "window": window, "max_fps": fps, "max_kbps": kbps,
                  "seq": 0, "timestamp": -1, "pending": [], "encoding": None,
                  "next": self.clock(), "key": True, "dead": False, "codec": None,
                  "size": None}
        self.seen.add(value["id"])
        self.current = stream
        self.revision += 1
        return stream

    def live(self, stream, captured=None):
        granted = self.active()
        now = self.clock()
        return (granted and self.current is stream and not stream["dead"]
                and (captured is None or captured <= now <= captured + 1000)
                and (not stream["pending"] or stream["pending"][0][1] <= now <= stream["pending"][0][1] + 2000))

    def tick(self):
        stream = self.current
        if stream is None:
            return
        if (not self.live(stream)
                or stream["pending"] and self.clock() - stream["pending"][0][1] > 2000
                or stream["encoding"] is not None and self.clock() - stream["encoding"][0] > 1000):
            if self.current is stream:
                self.stop()

    def rate(self, value):
        kind = value.get("type")
        allowed = {"type", "id", "kbps"} | ({"fps"} if kind == "native_rate" else set())
        if kind not in ("native_rate", "native_bitrate") or set(value) != allowed or not identifier(value.get("id")):
            raise VideoFailure("rate_request")
        if kind == "native_rate" and not self.cadence:
            raise VideoFailure("rate_not_negotiated")
        stream = self.current
        if stream is None or stream["id"] != value["id"].lower():
            return
        fps = value.get("fps", stream["fps"])
        kbps = value.get("kbps")
        if not integer(fps, 1, stream["max_fps"]) or not integer(kbps, 128, stream["max_kbps"]):
            raise VideoFailure("rate_ceiling")
        if not self.live(stream):
            if self.current is stream:self.stop()
            return
        stream["fps"], stream["kbps"] = fps, kbps

    def reserve(self, captured=None):
        stream = self.current
        if stream is None:
            return None
        captured = self.clock() if captured is None else captured
        if not self.live(stream, captured):
            if self.current is stream:
                self.stop()
            return None
        if (self.inflight is not None or stream["encoding"] is not None
                or len(stream["pending"]) >= stream["window"] or captured < stream["next"]):
            return None
        token = (captured, stream["key"], object())
        stream["encoding"] = token
        stream["key"] = False
        stream["next"] = captured + 1000 / stream["fps"]
        self.inflight = (stream, token)
        return self.inflight

    def retire(self, reservation):
        if self.inflight is reservation:
            self.inflight = None
            if reservation[0]["encoding"] is reservation[1]:
                reservation[0]["encoding"] = None

    def complete(self, reservation, data, width, height, timestamp, capture_ms=0, encode_ms=0):
        stream, token = reservation
        if self.inflight is not reservation:
            return
        self.retire(reservation)
        if self.current is not stream:
            return
        try:
            if (not self.live(stream, token[0]) or not integer(width, 2, 1920)
                    or not integer(height, 2, 2400) or width % 2 or height % 2
                    or not integer(timestamp, 0, 9007199254740991)
                    or timestamp <= stream["timestamp"] or stream["seq"] >= 0xffffffff):
                raise VideoFailure("stale_frame")
            codec, key = access_unit(data)
            if token[1] and not key:
                raise VideoFailure("missing_keyframe")
            if codec is not None:
                if stream["codec"] is not None and codec != stream["codec"]:
                    raise VideoFailure("codec_changed")
                stream["codec"] = codec
            if stream["codec"] is None or stream["size"] not in (None, (width, height)):
                raise VideoFailure("format_changed")
            stream["size"] = (width, height)
            stream["timestamp"] = timestamp
            stream["seq"] += 1
            seq = stream["seq"]
            stream["pending"].append((seq, self.clock()))
            def valid():
                if self.live(stream, token[0]):
                    return True
                if self.current is stream:
                    self.stop()
                return False
            if not valid():
                return
            self.emit({"type": "native_frame", "id": stream["id"], "seq": seq,
                       "timestamp": timestamp, "key": key, "codec": stream["codec"],
                       "width": width, "height": height, "captureMs": capture_ms,
                       "conversionMs": 0, "encodeMs": encode_ms,
                       "data": base64.b64encode(data).decode("ascii")}, valid)
        except Exception:
            if self.current is stream:
                self.stop()

    def acknowledge(self, value):
        stream = self.current
        if stream is None or str(value.get("id")).lower() != stream["id"]:
            return
        if not self.live(stream):
            if self.current is stream:
                self.stop()
            return
        seq = value.get("seq")
        if not integer(seq, 1, 0xffffffff) or not stream["pending"] or seq != stream["pending"][0][0]:
            raise VideoFailure("ack_order")
        stream["pending"].pop(0)

    def keyframe(self, value):
        if self.current and str(value.get("id")).lower() == self.current["id"]:
            self.current["key"] = True


def copy_bgr(data, width, height, stride, offset):
    """Copy only bounded owned pixels; Gst's default BGR row alignment is four."""
    if (not integer(width, 2, 1920) or not integer(height, 2, 2400)
            or not integer(stride, width * 3, 65536) or not integer(offset, 0, len(data))
            or offset + (height - 1) * stride + width * 3 > len(data)):
        raise VideoFailure("raw_bounds")
    row = (width * 3 + 3) & ~3
    owned = bytearray(row * height)
    for y in range(height):
        owned[y * row:y * row + width * 3] = data[offset + y * stride:offset + y * stride + width * 3]
    return owned


class GstH264Encoder:
    """Only created on the owned worker after an explicit video request.

    An optional hardware factory is tried before local software encoders. No
    other capture source, shell command, plugin install or download is used.
    """
    CANDIDATES = ("nvh264enc", "vah264enc", "openh264enc", "x264enc")

    @staticmethod
    def available(Gst):
        return (Gst.ElementFactory.find("h264parse") is not None
                and any(Gst.ElementFactory.find(name) is not None for name in GstH264Encoder.CANDIDATES))

    def __init__(self, Gst, Video, width, height, fps, kbps, candidates=None):
        self.Gst, self.Video = Gst, Video
        self.pipeline = None
        self.input_width, self.input_height = width, height
        self.width, self.height = width - width % 2, height - height % 2
        self.kbps = kbps
        self.has_output = False
        choices = tuple(candidates or self.CANDIDATES)
        self.fps = fps
        self.timestamp = 0
        self.factory = None
        for candidate_index, name in enumerate(choices):
            if Gst.ElementFactory.find(name) is None:
                continue
            pipeline = None
            try:
                raw = "NV12" if name in ("nvh264enc", "vah264enc") else "I420"
                pipeline = Gst.parse_launch(
                    "appsrc name=input is-live=true format=time block=false ! videoconvert ! videoscale ! "
                    f"video/x-raw,format={raw},width={self.width},height={self.height} ! "
                    f"{name} name=encoder ! h264parse config-interval=-1 ! "
                    "video/x-h264,stream-format=byte-stream,alignment=au ! "
                    "appsink name=output max-buffers=1 drop=false sync=false")
                source, encoder = pipeline.get_by_name("input"), pipeline.get_by_name("encoder")
                source.set_property("caps", Gst.Caps.from_string(
                    f"video/x-raw,format=BGR,width={width},height={height},framerate={fps}/1"))
                source.set_property("max-bytes", ((width * 3 + 3) & ~3) * height)
                properties = {"bitrate": kbps * (1000 if name == "openh264enc" else 1)}
                if name == "x264enc":
                    properties.update({"key-int-max": fps, "bframes": 0, "threads": 2})
                    Gst.util_set_object_arg(encoder, "tune", "zerolatency")
                    Gst.util_set_object_arg(encoder, "speed-preset", "ultrafast")
                else:
                    properties["key-int-max" if name == "vah264enc" else "gop-size"] = fps
                    if name == "openh264enc":
                        properties.update({"enable-frame-skip": False, "multi-thread": 2})
                        Gst.util_set_object_arg(encoder, "rate-control", "bitrate")
                        Gst.util_set_object_arg(encoder, "complexity", "low")
                    elif name == "vah264enc":
                        properties["b-frames"] = 0
                        Gst.util_set_object_arg(encoder, "rate-control", "cbr")
                    elif name == "nvh264enc":
                        properties.update({"bframes": 0, "zerolatency": True, "rc-lookahead": 0})
                for key, value in properties.items():
                    if encoder.find_property(key) is None:
                        raise VideoFailure("encoder_property")
                    encoder.set_property(key, value)
                if pipeline.set_state(Gst.State.PLAYING) == Gst.StateChangeReturn.FAILURE:
                    raise VideoFailure("encoder_start")
                self.pipeline, self.source, self.encoder = pipeline, source, encoder
                self.sink = pipeline.get_by_name("output")
                self.factory = name
                self.remaining = choices[candidate_index + 1:]
                break
            except Exception:
                if pipeline is not None:
                    retire_pipeline(Gst, pipeline)
        if self.pipeline is None:
            raise VideoFailure("encoder_unavailable")

    def rate(self, fps, kbps, valid):
        if not valid():raise VideoFailure("cancelled")
        if kbps != self.kbps:
            spec = self.encoder.find_property("bitrate")
            if spec is None or not spec.flags & self.Gst.PARAM_MUTABLE_PLAYING:
                raise VideoFailure("rate_unavailable")
            self.encoder.set_property("bitrate", kbps * (1000 if self.factory == "openh264enc" else 1))
            if not valid():raise VideoFailure("cancelled")
            self.kbps = kbps
        self.fps = fps

    def encode(self, raw, force_key, valid):
        try:
            data = self._encode(raw, force_key, valid)
            self.has_output = True
            return data
        except EncoderRetirementFailure:
            raise
        except Exception:
            if self.has_output or not self.remaining or not valid():
                raise
            # Before the first AU only: fully retire the failed candidate, then
            # try a lower-priority local encoder within the original capture budget.
            self.close()
            if not valid():
                raise VideoFailure("cancelled")
            replacement = GstH264Encoder(self.Gst, self.Video, self.input_width, self.input_height,
                                         self.fps, self.kbps, candidates=self.remaining)
            self.__dict__.update(replacement.__dict__)
            return self.encode(raw, force_key, valid)

    def _encode(self, raw, force_key, valid):
        Gst = self.Gst
        if not valid():
            raise VideoFailure("cancelled")
        if force_key and self.timestamp > 0:
            event = self.Video.video_event_new_downstream_force_key_unit(
                Gst.CLOCK_TIME_NONE, Gst.CLOCK_TIME_NONE, Gst.CLOCK_TIME_NONE, True, 0)
            if not self.encoder.send_event(event):
                raise VideoFailure("keyframe_request")
        buffer = Gst.Buffer.new_allocate(None, len(raw), None)
        buffer.fill(0, raw)
        buffer.pts = self.timestamp
        buffer.duration = Gst.SECOND // self.fps
        self.timestamp += buffer.duration
        if not valid() or self.source.emit("push-buffer", buffer) != Gst.FlowReturn.OK:
            raise VideoFailure("encoder_push")
        deadline = time.monotonic() + 0.75
        while valid() and time.monotonic() < deadline:
            sample = self.sink.emit("try-pull-sample", 25 * Gst.MSECOND)
            if sample is not None:
                output = sample.get_buffer()
                if output.get_size() > 512 * 1024 - 9 or not valid():
                    raise VideoFailure("encoded_bound")
                return output.extract_dup(0, output.get_size())
            if self.pipeline.get_bus().pop_filtered(Gst.MessageType.ERROR | Gst.MessageType.EOS):
                raise VideoFailure("encoder_failure")
        raise VideoFailure("encoder_stalled")

    def close(self):
        pipeline, self.pipeline = self.pipeline, None
        if pipeline is not None:
            retire_pipeline(self.Gst, pipeline)


class H264Worker:
    """Physical slot stays owned until the thread and Gst pipeline really retire."""
    def __init__(self, Gst, Video, flow, gate):
        self.Gst, self.Video, self.flow, self.gate = Gst, Video, flow, gate
        self.jobs = queue.Queue(maxsize=1)
        self.stopped = threading.Event()
        self.closed = threading.Event()
        self.unretired = None
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()

    def stop(self):
        self.stopped.set()

    def submit(self, reservation, raw, width, height):
        try:
            if self.stopped.is_set():
                raise VideoFailure("worker_stopped")
            self.jobs.put_nowait((reservation, raw, width, height))
        except Exception:
            raw[:] = b"\0" * len(raw)
            with self.gate:
                if self.flow.current is reservation[0]:
                    self.flow.stop()

    def run(self):
        encoder = None
        reservation = None
        try:
            while not self.stopped.is_set():
                try:
                    reservation, raw, width, height = self.jobs.get(timeout=0.05)
                except queue.Empty:
                    continue
                stream, token = reservation
                def valid():
                    with self.gate:
                        return not self.stopped.is_set() and self.flow.live(stream, token[0])
                try:
                    if not valid():
                        raise VideoFailure("cancelled")
                    if encoder is None:
                        encoder = GstH264Encoder(self.Gst, self.Video, width, height, stream["fps"], stream["kbps"])
                    if (width, height) != (encoder.input_width, encoder.input_height):
                        raise VideoFailure("source_changed")
                    with self.gate:
                        fps, kbps = stream["fps"], stream["kbps"]
                    encoder.rate(fps, kbps, valid)
                    started = time.monotonic()
                    data = encoder.encode(raw, token[1], valid)
                    with self.gate:
                        self.flow.complete(reservation, data, encoder.width, encoder.height,
                                           int(token[0] * 1000), encode_ms=(time.monotonic() - started) * 1000)
                finally:
                    raw[:] = b"\0" * len(raw)
        except Exception as error:
            if isinstance(error, EncoderRetirementFailure):
                self.unretired = error.pipeline
            with self.gate:
                if reservation is not None and self.flow.current is reservation[0]:
                    self.flow.stop()
        finally:
            self.stopped.set()
            retired = [reservation] if reservation is not None else []
            while True:
                try:
                    queued, raw, _, _ = self.jobs.get_nowait()
                    retired.append(queued)
                    raw[:] = b"\0" * len(raw)
                except queue.Empty:
                    break
            # No source gate while a native encoder is shutting down.
            if encoder is not None:
                try:
                    encoder.close()
                except EncoderRetirementFailure as error:
                    self.unretired = error.pipeline
                except Exception:
                    self.unretired = encoder
            if self.unretired is not None:
                return
            with self.gate:
                for finished in retired:
                    self.flow.retire(finished)
            self.closed.set()
