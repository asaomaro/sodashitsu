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


class VideoBits:
    def __init__(self, data):self.data,self.at=data,0
    def read(self, count):
        if not integer(count,0,64) or self.at+count>len(self.data)*8:raise VideoFailure("truncated_bits")
        value=0
        for _ in range(count):
            value=(value<<1)|((self.data[self.at//8]>>(7-self.at%8))&1);self.at+=1
        return value
    def skip(self,count):
        if not integer(count,0,len(self.data)*8) or self.at+count>len(self.data)*8:raise VideoFailure("truncated_bits")
        self.at+=count
    def ue(self):
        zeros=0
        while self.read(1)==0:
            zeros+=1
            if zeros>31:raise VideoFailure("golomb_bound")
        return (1<<zeros)-1+self.read(zeros)


def video_rbsp(data):
    result=bytearray();zeros=0
    for value in data:
        if zeros>=2 and value==3:zeros=0;continue
        result.append(value);zeros=zeros+1 if value==0 else 0
    return bytes(result)


class NativeBitstream:
    """Bounded codec metadata comes from actual access units, never a guessed MIME."""
    FAMILIES=("h264","h264-444","hevc","av1")
    def __init__(self,family):
        if family not in self.FAMILIES:raise VideoFailure("codec_family")
        self.family=family;self.codec=None;self.parameters={};self.av1_header=None;self.reduced=False
    def normalize(self,data):
        if not isinstance(data,bytes) or not 1<=len(data)<=512*1024-9:raise VideoFailure("frame_bound")
        if self.family=="av1":return self.av1(data)
        if self.family=="h264":
            codec,key=access_unit(data)
            if codec is not None:self.codec=codec.lower()
            return data,self.codec,key
        if not data.startswith((b"\0\0\1",b"\0\0\0\1")):raise VideoFailure("annex_b")
        units=re.split(b"\x00\x00\x00?\x01",data)[1:]
        if not 1<=len(units)<=128:raise VideoFailure("nal_count")
        hevc=self.family=="hevc";vcl=False;key=True;pictures=0;delimiters=0;present=set()
        for nal in units:
            if len(nal)<(2 if hevc else 1) or nal[0]&128:raise VideoFailure("nal_header")
            kind=(nal[0]>>1)&63 if hevc else nal[0]&31
            if hevc and (((nal[0]&1)<<5)|(nal[1]>>3) or not nal[1]&7):raise VideoFailure("hevc_layer")
            if kind==(35 if hevc else 9):
                delimiters+=1
                if delimiters>1 or vcl:raise VideoFailure("multiple_units")
            parameter=kind in ((32,33,34) if hevc else (7,8))
            if parameter:
                if vcl or len(nal)>65536:raise VideoFailure("parameter_bound")
                self.parameters[kind]=nal
                if hevc and kind==33:
                    bits=VideoBits(video_rbsp(nal[2:]));bits.skip(8)
                    space,tier,profile,flags=bits.read(2),bits.read(1),bits.read(5),bits.read(32)
                    compatibility=int(f"{flags:032b}"[::-1],2)
                    constraints=bytes(bits.read(8) for _ in range(6)).rstrip(b"\0");level=bits.read(8)
                    self.codec="hev1."+(chr(64+space) if space else "")+str(profile)+f".{compatibility:X}."+("H" if tier else "L")+str(level)+"".join(f".{v:02X}" for v in constraints)
                elif not hevc and kind==7:
                    bits=VideoBits(video_rbsp(nal[1:]));profile=bits.read(8);bits.skip(16);bits.ue()
                    if profile!=244 or bits.ue()!=3 or bits.read(1)!=0:raise VideoFailure("chroma_not_444")
                    self.codec="avc1."+nal[1:4].hex()
            present.add(kind)
            if kind<=31 if hevc else 1<=kind<=5:
                bits=VideoBits(video_rbsp(nal[2:] if hevc else nal[1:]));first=bits.read(1)!=0 if hevc else bits.ue()==0
                if first:pictures+=1
                if pictures>1 or not vcl and not first:raise VideoFailure("multiple_pictures")
                vcl=True;key=key and (16<=kind<=21 if hevc else kind==5)
        if not vcl or key and self.codec is None:raise VideoFailure("missing_picture")
        if key:
            required=(32,33,34) if hevc else (7,8)
            if any(kind not in self.parameters for kind in required):raise VideoFailure("key_headers")
            units=[self.parameters[kind] for kind in required if kind not in present]+units
        result=b"".join(b"\0\0\0\1"+nal for nal in units)
        if len(result)>512*1024-9:raise VideoFailure("frame_bound")
        return result,self.codec,key
    def sequence(self,payload,raw):
        if len(payload)>65536:raise VideoFailure("av1_sequence_bound")
        bits=VideoBits(payload);profile=bits.read(3)
        if profile>2:raise VideoFailure("av1_profile")
        bits.skip(1);reduced=bits.read(1)!=0;level=tier=0
        if reduced:level=bits.read(5)
        else:
            model=False;delay=0
            if bits.read(1):
                bits.skip(64)
                if bits.read(1):bits.ue()
                model=bits.read(1)!=0
                if model:delay=bits.read(5)+1;bits.skip(42)
            initial=bits.read(1)!=0;points=bits.read(5)+1
            for index in range(points):
                bits.skip(12);candidate=bits.read(5);candidate_tier=bits.read(1) if candidate>7 else 0
                if index==0:level,tier=candidate,candidate_tier
                if model and bits.read(1):bits.skip(delay*2+1)
                if initial and bits.read(1):bits.skip(4)
        width_bits,height_bits=bits.read(4)+1,bits.read(4)+1;bits.skip(width_bits+height_bits)
        if not reduced and bits.read(1):bits.skip(7)
        bits.skip(3)
        if not reduced:
            bits.skip(4);order=bits.read(1)!=0
            if order:bits.skip(2)
            screen=2 if bits.read(1) else bits.read(1)
            if screen>0 and bits.read(1)==0:bits.skip(1)
            if order:bits.skip(3)
        bits.skip(3);high=bits.read(1)!=0
        depth=(12 if bits.read(1) else 10) if profile==2 and high else (10 if high else 8)
        self.codec=f"av01.{profile}.{level:02d}"+("H" if tier else "M")+f".{depth:02d}"
        self.reduced=reduced;self.av1_header=raw
    def av1(self,data):
        at=0;units=[];frame=False;present=False;key=False;delimiters=0
        while at<len(data):
            begin=at;header=data[at];at+=1;kind=(header>>3)&15
            if header&0x81 or not header&2 or kind==0 or 9<=kind<=14:raise VideoFailure("av1_obu")
            if header&4:
                if at>=len(data) or data[at]!=0:raise VideoFailure("av1_extension")
                at+=1
            size=0;ended=False
            for index in range(4):
                if at>=len(data):raise VideoFailure("av1_size")
                part=data[at];at+=1;size|=(part&127)<<(index*7)
                if not part&128:ended=True;break
            if not ended or size>len(data)-at:raise VideoFailure("av1_size")
            payload=data[at:at+size];at+=size;raw=data[begin:at];units.append((kind,raw))
            if len(units)>128:raise VideoFailure("av1_obu_count")
            if kind==2:
                delimiters+=1
                if delimiters>1 or frame or payload:raise VideoFailure("av1_unit_boundary")
            if kind==1:
                if frame:raise VideoFailure("av1_sequence_after_picture")
                self.sequence(payload,raw);present=True
            if kind in (3,6):
                if frame or self.codec is None:raise VideoFailure("av1_picture")
                frame=True
                if self.reduced:key=True
                else:
                    bits=VideoBits(payload)
                    if bits.read(1)==0:key=bits.read(2)==0 and bits.read(1)==1
        if not frame:raise VideoFailure("av1_picture")
        if key and not present:
            if self.av1_header is None:raise VideoFailure("av1_key_headers")
            units.insert(1 if units and units[0][0]==2 else 0,(1,self.av1_header))
        result=b"".join(raw for _,raw in units)
        if len(result)>512*1024-9:raise VideoFailure("frame_bound")
        return result,self.codec,key


class NativeVideoFlow:
    """One stream, one encoding job, at most three unacknowledged records.

    The owner serializes public methods. `active` may perform a native permission
    query: every admission/publication checks identity and monotonic time after it.
    `emit` enqueues records with a final validity predicate, not a raw stdout write.
    A lost predictive frame ends this stream; a later record cannot cross its gap.
    """

    def __init__(self, active, clock, emit, maximum_fps=30, cadence=False, codecs=False, adaptive=False):
        self.active = active
        self.clock = clock
        self.emit = emit
        self.maximum_fps = maximum_fps
        self.cadence = cadence
        self.codecs = codecs
        self.adaptive = adaptive
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
        profile=stream.get("profile")
        if profile and profile.get("held") is not None:profile["held"][:]=b"\0"*len(profile["held"])
        stream["profile"]=None
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
                or value.get("codec", "h264") not in (NativeBitstream.FAMILIES if self.codecs else ("h264",)) or value["id"] in self.seen or len(self.seen) >= 1024
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
        stream = {"id": value["id"], "fps": fps, "kbps": kbps, "window": window, "max_fps": fps, "max_kbps": kbps, "family": value.get("codec","h264"), "bitstream": NativeBitstream(value.get("codec","h264")),
                  "seq": 0, "timestamp": -1, "pending": [], "encoding": None,
                  "next": self.clock(), "key": True, "dead": False, "codec": None,
                  "size": None, "max_size": None, "generation": 1, "profile": None}
        self.seen.add(value["id"])
        self.current = stream
        self.revision += 1
        return stream

    def live(self, stream, captured=None):
        granted = self.active()
        now = self.clock()
        return (granted and self.current is stream and not stream["dead"]
                and (captured is None or captured <= now <= captured + 1000)
                and (not stream["pending"] or stream["pending"][0][1] <= now <= stream["pending"][0][1] + 2000)
                and (not stream["profile"] or stream["profile"]["at"]<=now<stream["profile"]["at"]+3000)
                and (not stream["profile"] or stream["profile"].get("held") is None or stream["profile"]["captured"]<=now<=stream["profile"]["captured"]+1000))

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
        if stream["profile"] is None:stream["fps"], stream["kbps"] = fps, kbps

    def profile(self, value):
        if not self.adaptive:raise VideoFailure("profile_not_negotiated")
        if set(value)!={"type","id","generation","width","height","fps","bitrateKbps"} or value.get("type")!="native_profile" or not identifier(value.get("id")):
            raise VideoFailure("profile_request")
        stream=self.current
        if stream is None or stream["id"]!=value["id"].lower():return
        maximum=stream["max_size"]
        if (stream["profile"] is not None or maximum is None or not integer(value.get("generation"),2,0xffffffff)
                or value["generation"]!=stream["generation"]+1 or not integer(value.get("width"),2,maximum[0])
                or not integer(value.get("height"),2,maximum[1]) or value["width"]%2 or value["height"]%2
                or abs(value["width"]/value["height"]-maximum[0]/maximum[1])>.02
                or not integer(value.get("fps"),1,stream["max_fps"]) or not integer(value.get("bitrateKbps"),128,stream["max_kbps"])):
            raise VideoFailure("profile_ceiling")
        revision=self.revision
        if not self.live(stream):
            if self.current is stream:self.stop()
            return
        if self.revision!=revision or stream["profile"] is not None:return
        self.revision+=1
        stream["profile"]={"at":self.clock(),"generation":value["generation"],"width":value["width"],"height":value["height"],"fps":value["fps"],"kbps":value["bitrateKbps"],"stage":"draining","held":None,"bitstream":NativeBitstream(stream["family"])}

    def resume(self, value):
        if not self.adaptive or set(value)!={"type","id","generation","baseSeq"} or value.get("type")!="native_profile_resume" or not identifier(value.get("id")):
            raise VideoFailure("profile_resume_request")
        stream=self.current
        if stream is None or stream["id"]!=value["id"].lower():return
        profile=stream["profile"]
        if (profile is None or profile["stage"]!="waiting" or value.get("generation")!=profile["generation"]
                or not integer(value.get("generation"),2,0xffffffff) or not integer(value.get("baseSeq"),1,0xffffffff)
                or value["baseSeq"]!=stream["seq"] or profile.get("baseSeq")!=stream["seq"] or stream["pending"]):
            raise VideoFailure("profile_resume_fence")
        if not self.live(stream,profile["captured"]) or stream["profile"] is not profile:
            if self.current is stream:self.stop()
            return
        held=profile["held"];profile["held"]=None
        self.revision+=1
        stream["profile"]=None;stream["generation"]=profile["generation"];stream["size"]=None;stream["codec"]=None
        stream["fps"],stream["kbps"]=profile["fps"],profile["kbps"];stream["bitstream"]=profile["bitstream"];stream["next"]=self.clock()
        try:self.publish(stream,(profile["captured"],True,object()),bytes(held),profile["width"],profile["height"],profile["timestamp"],0,profile["encode_ms"],deadline=profile["at"]+3000)
        finally:held[:]=b"\0"*len(held)

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
        profile=stream["profile"]
        if profile:
            if profile["stage"]!="draining" or stream["pending"]:return None
            profile["stage"]="encoding"
        token = (captured, True if profile else stream["key"], object(), profile)
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
        profile=token[3] if len(token)>3 else None
        if profile is not None:
            try:
                if (stream["profile"] is not profile or profile["stage"]!="encoding" or stream["pending"]
                        or not self.live(stream,token[0]) or (width,height)!=(profile["width"],profile["height"])
                        or not integer(timestamp,0,9007199254740991) or timestamp<=stream["timestamp"]):raise VideoFailure("profile_frame")
                data,codec,key=profile["bitstream"].normalize(data)
                if not key or not codec:raise VideoFailure("profile_keyframe")
                profile.update(stage="waiting",held=bytearray(data),codec=codec,captured=token[0],timestamp=timestamp,encode_ms=encode_ms,baseSeq=stream["seq"])
                def valid():
                    permitted=self.live(stream,token[0])
                    return permitted and self.current is stream and stream["profile"] is profile and profile["stage"]=="waiting"
                if not valid():
                    if self.current is stream:self.stop()
                    return
                self.emit({"type":"native_profile_applied","id":stream["id"],"generation":profile["generation"],"baseSeq":stream["seq"],"width":width,"height":height,"codec":codec},valid)
            except Exception:
                if self.current is stream:self.stop()
            return
        self.publish(stream,token,data,width,height,timestamp,capture_ms,encode_ms)

    def publish(self,stream,token,data,width,height,timestamp,capture_ms=0,encode_ms=0,deadline=None):
        try:
            if (not self.live(stream, token[0]) or deadline is not None and self.clock()>=deadline or not integer(width, 2, 1920)
                    or not integer(height, 2, 2400) or width % 2 or height % 2
                    or not integer(timestamp, 0, 9007199254740991)
                    or timestamp <= stream["timestamp"] or stream["seq"] >= 0xffffffff):
                raise VideoFailure("stale_frame")
            data, codec, key = stream["bitstream"].normalize(data)
            if token[1] and not key:
                raise VideoFailure("missing_keyframe")
            if codec is not None:
                if stream["codec"] is not None and codec != stream["codec"]:
                    raise VideoFailure("codec_changed")
                stream["codec"] = codec
            if stream["codec"] is None or stream["size"] not in (None, (width, height)):
                raise VideoFailure("format_changed")
            stream["size"] = (width, height)
            if stream["max_size"] is None:stream["max_size"]=(width,height)
            stream["timestamp"] = timestamp
            stream["seq"] += 1
            seq = stream["seq"]
            stream["pending"].append((seq, self.clock()))
            def valid():
                if self.live(stream, token[0]) and (deadline is None or self.clock()<deadline):
                    return True
                if self.current is stream:
                    self.stop()
                return False
            if not valid():
                return
            self.emit({"type": "native_frame", **({"codecName": stream["family"]} if self.codecs else {}), "id": stream["id"], "seq": seq, **({"generation":stream["generation"]} if self.adaptive else {}),
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

    FAMILIES={
        "h264":("h264parse",CANDIDATES),
        "h264-444":("h264parse",("x264enc",)),
        "hevc":("h265parse",("nvh265enc","vah265enc","x265enc")),
        "av1":("av1parse",("av1enc",)),
    }
    @staticmethod
    def codecs(Gst):
        return [family for family,(parser,choices) in GstH264Encoder.FAMILIES.items()
                if Gst.ElementFactory.find(parser) and any(Gst.ElementFactory.find(name) for name in choices)]

    @staticmethod
    def available(Gst):
        return (Gst.ElementFactory.find("h264parse") is not None
                and any(Gst.ElementFactory.find(name) is not None for name in GstH264Encoder.CANDIDATES))

    def __init__(self, Gst, Video, width, height, fps, kbps, candidates=None, family="h264", target=None):
        self.Gst, self.Video = Gst, Video
        self.pipeline = None
        self.input_width, self.input_height = width, height
        self.width, self.height = target if target is not None else (width-width%2,height-height%2)
        if not integer(self.width,2,width) or not integer(self.height,2,height) or self.width%2 or self.height%2:raise VideoFailure("target_size")
        if family not in self.FAMILIES:raise VideoFailure("codec_family")
        self.family=family
        self.kbps = kbps
        self.has_output = False
        parser,defaults=self.FAMILIES[family]
        choices = tuple(candidates or defaults)
        self.fps = fps
        self.timestamp = 0
        self.factory = None
        for candidate_index, name in enumerate(choices):
            if Gst.ElementFactory.find(name) is None:
                continue
            pipeline = None
            try:
                raw = "Y444" if family=="h264-444" else "NV12" if name in ("nvh264enc", "vah264enc","nvh265enc","vah265enc") else "I420"
                parse=f"{parser} "+("config-interval=-1" if family!="av1" else "")
                media="video/x-av1,stream-format=obu-stream,alignment=tu" if family=="av1" else "video/x-h265,stream-format=byte-stream,alignment=au" if family=="hevc" else "video/x-h264,stream-format=byte-stream,alignment=au"+(",profile=high-4:4:4" if family=="h264-444" else "")
                pipeline = Gst.parse_launch(
                    "appsrc name=input is-live=true format=time block=false ! videoconvert ! videoscale ! "
                    f"video/x-raw,format={raw},width={self.width},height={self.height} ! "
                    f"{name} name=encoder ! {parse} ! {media} ! "
                    "appsink name=output max-buffers=1 drop=false sync=false")
                source, encoder = pipeline.get_by_name("input"), pipeline.get_by_name("encoder")
                source.set_property("caps", Gst.Caps.from_string(
                    f"video/x-raw,format=BGR,width={width},height={height},framerate={fps}/1"))
                source.set_property("max-bytes", ((width * 3 + 3) & ~3) * height)
                properties = {"bitrate": kbps * (1000 if name == "openh264enc" else 1)}
                if name=="av1enc":
                    properties={"target-bitrate":kbps,"cpu-used":8,"lag-in-frames":0,"threads":2,"keyframe-max-dist":fps}
                    Gst.util_set_object_arg(encoder,"usage-profile","realtime")
                    Gst.util_set_object_arg(encoder,"end-usage","cbr")
                elif name=="x265enc":
                    properties.update({"key-int-max":fps,"option-string":"pools=none:frame-threads=1:bframes=0:rc-lookahead=0"})
                    Gst.util_set_object_arg(encoder,"tune","zerolatency")
                    Gst.util_set_object_arg(encoder,"speed-preset","ultrafast")
                elif name == "x264enc":
                    properties.update({"key-int-max": fps, "bframes": 0, "threads": 2})
                    Gst.util_set_object_arg(encoder, "tune", "zerolatency")
                    Gst.util_set_object_arg(encoder, "speed-preset", "ultrafast")
                else:
                    properties["key-int-max" if name in ("vah264enc","vah265enc") else "gop-size"] = fps
                    if name == "openh264enc":
                        properties.update({"enable-frame-skip": False, "multi-thread": 2})
                        Gst.util_set_object_arg(encoder, "rate-control", "bitrate")
                        Gst.util_set_object_arg(encoder, "complexity", "low")
                    elif name in ("vah264enc","vah265enc"):
                        properties["b-frames"] = 0
                        Gst.util_set_object_arg(encoder, "rate-control", "cbr")
                    elif name in ("nvh264enc","nvh265enc"):
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
            property_name="target-bitrate" if self.factory=="av1enc" else "bitrate"
            spec = self.encoder.find_property(property_name)
            if spec is None or not spec.flags & self.Gst.PARAM_MUTABLE_PLAYING:
                raise VideoFailure("rate_unavailable")
            self.encoder.set_property(property_name, kbps * (1000 if self.factory == "openh264enc" else 1))
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
                                         self.fps, self.kbps, candidates=self.remaining, family=self.family, target=(self.width,self.height))
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
                        return not self.stopped.is_set() and self.flow.live(stream, token[0]) and (len(token)<4 or token[3] is None or stream["profile"] is token[3])
                try:
                    if not valid():
                        raise VideoFailure("cancelled")
                    profile=token[3] if len(token)>3 else None
                    target=(profile["width"],profile["height"]) if profile else stream["size"]
                    if encoder is not None and target is not None and (encoder.width,encoder.height)!=target:
                        encoder.close();encoder=None
                        if not valid():raise VideoFailure("cancelled")
                    if encoder is None:
                        encoder = GstH264Encoder(self.Gst, self.Video, width, height, profile["fps"] if profile else stream["fps"],profile["kbps"] if profile else stream["kbps"], **({"family":stream["family"]} if stream["family"]!="h264" else {}),**({"target":target} if target is not None else {}))
                    if (width, height) != (encoder.input_width, encoder.input_height):
                        raise VideoFailure("source_changed")
                    with self.gate:
                        fps, kbps = (profile["fps"],profile["kbps"]) if profile else (stream["fps"],stream["kbps"])
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
