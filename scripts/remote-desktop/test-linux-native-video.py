#!/usr/bin/env python3
"""Generated access units and memory sinks only; no capture/input/OS clipboard."""
import base64
import importlib.util
import json
from pathlib import Path
import unittest
import uuid
import threading
from unittest.mock import Mock,patch
from types import SimpleNamespace

root = Path(__file__).parent
spec = importlib.util.spec_from_file_location("owned_video", root / "linux-native-video.py")
video = importlib.util.module_from_spec(spec)
spec.loader.exec_module(video)
fixture = json.loads((root / "fixtures/h264-generated.json").read_text())
key = base64.b64decode(fixture["packets"][0]["data"])
delta = next(base64.b64decode(item["data"]) for item in fixture["packets"] if not item["key"])


class Flow(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.allowed = True
        self.query = None
        self.output = []
        def active():
            if self.query:
                self.query()
            return self.allowed
        self.flow = video.NativeVideoFlow(active, lambda: self.now, lambda value, valid: self.output.append((value, valid)))

    def start(self, window=3):
        identifier = str(uuid.uuid4())
        self.flow.start({"type": "native_video", "enabled": True, "id": identifier,
                         "fps": 30, "bitrateKbps": 2500, "window": window})
        return identifier

    def encode(self, data=key):
        reservation = self.flow.reserve()
        self.assertIsNotNone(reservation)
        self.flow.complete(reservation, data, fixture["width"], fixture["height"], int(self.now * 1000))
        self.now += 34
        return self.output[-1]

    def test_rate_adjustments_preserve_sequence_and_original_request_ceilings(self):
        self.flow.cadence = True
        identifier = self.start()
        self.encode()
        self.flow.rate({"type":"native_rate","id":identifier,"fps":10,"kbps":1200})
        self.assertEqual((self.flow.current["fps"],self.flow.current["kbps"],self.flow.current["seq"]),(10,1200,1))
        self.flow.rate({"type":"native_rate","id":identifier,"fps":30,"kbps":2500})
        for fields in ({"fps":31,"kbps":2500},{"fps":30,"kbps":2501},{"fps":True,"kbps":1200}):
            with self.assertRaises(video.VideoFailure):self.flow.rate({"type":"native_rate","id":identifier,**fields})
        self.flow.rate({"type":"native_bitrate","id":identifier,"kbps":1000})
        self.assertEqual(self.flow.current["kbps"],1000)
        self.flow.cadence=False
        with self.assertRaises(video.VideoFailure):self.flow.rate({"type":"native_rate","id":identifier,"fps":10,"kbps":1200})

    def test_rate_scope_query_cannot_mutate_a_replacement_stream(self):
        self.flow.cadence=True
        identifier=self.start();old=self.flow.current
        def replace():
            self.query=None;self.flow.stop();self.start()
        self.query=replace
        self.flow.rate({"type":"native_rate","id":identifier,"fps":10,"kbps":1200})
        self.assertIsNot(self.flow.current,old)
        self.assertEqual((self.flow.current["fps"],self.flow.current["kbps"]),(30,2500))

    def test_annex_b_bounded_in_band_headers(self):
        codec, is_key = video.access_unit(key)
        self.assertEqual(codec.lower(), fixture["packets"][0]["codec"].lower())
        self.assertTrue(is_key)
        self.assertFalse(video.access_unit(delta)[1])
        for value in [b"", b"x" * (512 * 1024), b"\0\0\1\x65\x01", b"\0\0\1\x80\x00"]:
            with self.assertRaises(video.VideoFailure):
                video.access_unit(value)

    def test_no_encoder_work_before_request_and_scoped_fifo_credits(self):
        self.assertIsNone(self.flow.reserve())
        identifier = self.start()
        first, valid = self.encode()
        self.assertEqual(first["seq"], 1)
        self.assertTrue(valid())
        self.encode(delta)
        self.encode(delta)
        self.assertIsNone(self.flow.reserve())
        with self.assertRaises(video.VideoFailure):
            self.flow.acknowledge({"id": identifier, "seq": 2})
        self.flow.acknowledge({"id": str(uuid.uuid4()), "seq": 1})
        self.assertIsNone(self.flow.reserve())
        self.flow.acknowledge({"id": identifier, "seq": 1})
        self.assertIsNotNone(self.flow.reserve())

    def test_cancel_invalidates_queued_frames_without_affecting_replacement(self):
        old = self.start()
        _, old_valid = self.encode()
        self.flow.stop(False)
        self.start()
        _, new_valid = self.encode()
        self.flow.start({"type": "native_video", "id": old, "enabled": False})
        self.assertFalse(old_valid())
        self.assertTrue(new_valid())

    def test_final_source_query_consumes_original_capture_budget(self):
        self.start()
        reservation = self.flow.reserve()
        self.query = lambda: setattr(self, "now", 1001)
        self.flow.complete(reservation, key, 640, 360, 1)
        self.assertIsNone(self.flow.current)
        self.assertFalse(any(value["type"] == "native_frame" for value, _ in self.output))

    def test_late_publisher_ends_predictive_chain_without_gap(self):
        self.start()
        _, valid = self.encode()
        self.encode(delta)
        second_valid = self.output[-1][1]
        self.now = 1001
        self.assertFalse(valid())
        self.assertIsNone(self.flow.current)
        self.assertFalse(second_valid())

    def test_source_revoke_pending_ack_and_encoder_stall_are_finite(self):
        self.start()
        self.encode()
        self.allowed = False
        self.flow.tick()
        self.assertIsNone(self.flow.current)
        self.allowed = True
        self.start()
        self.encode()
        self.now += 2001
        self.flow.tick()
        self.assertIsNone(self.flow.current)
        self.start()
        self.flow.reserve()
        self.now += 1001
        self.flow.tick()
        self.assertIsNone(self.flow.current)

    def test_one_encoding_job_and_keyframe_request(self):
        identifier = self.start()
        reservation = self.flow.reserve()
        self.assertIsNone(self.flow.reserve())
        self.flow.complete(reservation, key, 640, 360, 1)
        self.now += 34
        self.flow.keyframe({"id": identifier})
        reservation = self.flow.reserve()
        self.assertTrue(reservation[1][1])
        self.flow.complete(reservation, delta, 640, 360, 2)
        self.assertIsNone(self.flow.current)

    def test_ack_deadline_is_checked_without_waiting_for_tick(self):
        identifier = self.start()
        self.encode()
        self.now = 2001
        self.flow.acknowledge({"id": identifier, "seq": 1})
        self.assertIsNone(self.flow.current)
        self.start()
        self.encode()
        self.now += 2001
        self.assertIsNone(self.flow.reserve())
        self.assertIsNone(self.flow.current)

    def test_permission_callback_cannot_make_old_tick_stop_replacement(self):
        self.start()
        replacement = []
        def replace():
            self.query = None
            self.flow.stop(False)
            replacement.append(self.start())
        self.query = replace
        self.flow.tick()
        self.assertEqual(self.flow.current["id"], replacement[0])

    def test_permission_callback_cannot_replace_a_newer_stream_during_start(self):
        replacement = []
        def replace():
            self.query = None
            replacement.append(self.start())
        self.query = replace
        self.start()
        self.assertEqual(self.flow.current["id"], replacement[0])

    def test_same_stream_id_never_resets_sequence_or_consumes_other_credit(self):
        identifier = self.start()
        self.encode()
        with self.assertRaises(video.VideoFailure):
            self.flow.start({"type":"native_video", "enabled":True, "id":identifier,
                             "fps":30, "bitrateKbps":2500})
        self.assertEqual(self.flow.current["seq"], 1)
        self.flow.acknowledge({"id":identifier, "seq":1})
        self.assertEqual(self.encode(delta)[0]["seq"], 2)

    def test_cancelled_encoding_keeps_global_slot_until_actual_completion(self):
        self.start()
        old = self.flow.reserve()
        self.flow.stop(False)
        self.start()
        self.assertIsNone(self.flow.reserve())
        self.flow.complete(old, key, 640, 360, 1)
        self.assertFalse(any(value["type"]=="native_frame" for value, _ in self.output))
        newer = self.flow.reserve()
        self.assertIsNotNone(newer)
        self.flow.retire(old)
        self.assertIs(self.flow.inflight, newer)
        self.flow.retire(newer)
        self.assertIsNone(self.flow.inflight)

    def test_unsupported_live_rate_publishes_no_frame_and_retires_owned_encoder(self):
        self.flow.cadence=True;self.start();reservation=self.flow.reserve();closed=threading.Event();encoded=[]
        class Encoder:
            def __init__(self,*args):self.input_width,self.input_height=args[2:4]
            def rate(self,*args):raise video.VideoFailure("rate_unavailable")
            def encode(self,*args):encoded.append(1);return key
            def close(self):closed.set()
        raw=bytearray([1,2,3])
        with patch.object(video,"GstH264Encoder",Encoder):
            worker=video.H264Worker(None,None,self.flow,threading.RLock())
            worker.submit(reservation,raw,1,1)
            self.assertTrue(worker.closed.wait(1));self.assertTrue(closed.is_set())
            self.assertIsNone(self.flow.current);self.assertEqual(raw,bytes(3));self.assertEqual(encoded,[])
            self.assertFalse(any(value["type"]=="native_frame" for value,_ in self.output))

    def test_worker_retains_slot_through_native_encoder_shutdown(self):
        entered, finish, closing, retired = [threading.Event() for _ in range(4)]
        class Encoder:
            def __init__(self, *args):
                self.input_width,self.input_height=args[2:4]
            def rate(self, *args):pass
            def encode(self, *args):
                entered.set()
                if not finish.wait(2): raise AssertionError("generated encoder did not finish")
                raise video.VideoFailure("generated cancelled job")
            def close(self):
                closing.set()
                if not retired.wait(2): raise AssertionError("generated encoder did not retire")
        self.start()
        reservation = self.flow.reserve()
        gate = threading.RLock()
        with patch.object(video, "GstH264Encoder", Encoder):
            worker = video.H264Worker(None, None, self.flow, gate)
            try:
                worker.submit(reservation, bytearray(24), 2, 4)
                self.assertTrue(entered.wait(1))
                self.flow.stop(False)
                worker.stop()
                self.start()
                self.assertIsNone(self.flow.reserve())
                finish.set()
                self.assertTrue(closing.wait(1))
                self.assertFalse(worker.closed.is_set())
                self.assertIs(self.flow.inflight, reservation)
                retired.set()
                self.assertTrue(worker.closed.wait(1))
                self.assertIsNone(self.flow.inflight)
                self.assertIsNotNone(self.flow.reserve())
            finally:
                finish.set(); retired.set(); worker.stop(); worker.thread.join(2)

    def test_raw_copy_checks_offset_stride_and_owns_only_pixels(self):
        raw = bytearray(range(32))
        result = video.copy_bgr(raw, 2, 2, 12, 4)
        self.assertEqual(result, raw[4:10] + bytearray(2) + raw[16:22] + bytearray(2))
        result[0] = 0
        self.assertEqual(raw[4], 4)
        for fields in [(2,2,5,0),(2,2,12,30),(1921,2,6000,0)]:
            with self.assertRaises(video.VideoFailure): video.copy_bgr(raw,*fields)

    def test_failed_candidate_must_retire_before_any_encoder_fallback(self):
        made = []
        class Element:
            def set_property(self, *args): pass
            def find_property(self, *args): return True
        class Pipeline:
            def get_by_name(self, name): return Element()
            def set_state(self, state): return 0
            def get_state(self, timeout): return (0, "playing", None)
        def make(description):
            result=Pipeline();made.append(result);return result
        Gst=SimpleNamespace(ElementFactory=SimpleNamespace(find=lambda name:True),
            Caps=SimpleNamespace(from_string=lambda value:value),parse_launch=make,
            State=SimpleNamespace(PLAYING="playing",NULL="null"),SECOND=1000000000,
            StateChangeReturn=SimpleNamespace(FAILURE=0))
        with self.assertRaises(video.EncoderRetirementFailure) as caught:
            video.GstH264Encoder(Gst,None,64,64,30,2500,candidates=("first","second"))
        self.assertEqual(len(made),1)
        self.assertIs(caught.exception.pipeline,made[0])

    def test_worker_latches_unconfirmed_native_retirement_without_releasing_slot(self):
        self.start();reservation=self.flow.reserve();pipeline=object()
        def broken(*args): raise video.EncoderRetirementFailure(pipeline)
        with patch.object(video,"GstH264Encoder",broken):
            worker=video.H264Worker(None,None,self.flow,threading.RLock())
            worker.submit(reservation,bytearray(24),2,4);worker.thread.join(1)
            self.assertFalse(worker.thread.is_alive())
            self.assertFalse(worker.closed.is_set())
            self.assertIs(worker.unretired,pipeline)
            self.assertIs(self.flow.inflight,reservation)
            self.start();self.assertIsNone(self.flow.reserve())

    def test_uuid_ledger_survives_many_stops_and_canonicalizes_case(self):
        first=self.start();self.flow.stop(False)
        for _ in range(33):self.start();self.flow.stop(False)
        for spelling in (first,first.upper()):
            with self.assertRaises(video.VideoFailure):
                self.flow.start({"type":"native_video","id":spelling,"enabled":True,"fps":30,"bitrateKbps":2500})
        while len(self.flow.seen)<1024:self.start();self.flow.stop(False)
        with self.assertRaises(video.VideoFailure):self.start()
        self.assertEqual(len(self.flow.seen),1024)

    def test_first_hardware_frame_failure_retires_before_software_retry(self):
        made=[]
        class Element:
            def set_property(self,*args): pass
            def find_property(self,*args): return True
        class Pipeline:
            def __init__(self):self.state="null"
            def get_by_name(self,name):return Element()
            def set_state(self,state):self.state=state;return 1
            def get_state(self,timeout):return (1,self.state,None)
        def make(description):
            if made:self.assertEqual(made[-1].state,"null")
            pipeline=Pipeline();made.append(pipeline);return pipeline
        Gst=SimpleNamespace(ElementFactory=SimpleNamespace(find=lambda name:True),
            Caps=SimpleNamespace(from_string=lambda value:value),parse_launch=make,
            util_set_object_arg=lambda *args:None,
            State=SimpleNamespace(PLAYING="playing",NULL="null"),SECOND=1000000000,
            StateChangeReturn=SimpleNamespace(FAILURE=0))
        fault={"software":False}
        def generated_encode(encoder,*args):
            if encoder.factory=="nvh264enc" or encoder.factory=="openh264enc" and fault["software"]:raise video.VideoFailure("generated hardware unavailable")
            return key
        with patch.object(video.GstH264Encoder,"_encode",generated_encode):
            encoder=video.GstH264Encoder(Gst,None,64,64,30,2500,candidates=("nvh264enc","openh264enc","x264enc"))
            try:
                self.assertEqual(encoder.encode(bytearray(64*64*3),True,lambda:True),key)
                self.assertEqual(encoder.factory,"openh264enc");self.assertEqual(len(made),2)
                fault["software"]=True
                with self.assertRaises(video.VideoFailure):encoder.encode(bytearray(64*64*3),False,lambda:True)
                self.assertEqual(len(made),2)
            finally:encoder.close()

    def test_strict_request_does_not_accept_boolean_integer_or_unknown_codec(self):
        for fields in [{"fps": True}, {"window": 2}, {"codec": "h265"}, {"bitrateKbps": 127}, {"command": "denied"}]:
            with self.assertRaises(video.VideoFailure):
                self.flow.start({"type": "native_video", "id": str(uuid.uuid4()), "enabled": True,
                                 "fps": 30, "bitrateKbps": 2500, **fields})


class Codecs(unittest.TestCase):
    def test_actual_generated_access_units_derive_codec_key_and_preserve_bytes(self):
        for family,name in (("h264","h264-generated.json"),("h264-444","h264-444-software-generated.json"),("hevc","hevc-hardware-generated.json"),("av1","av1-software-generated.json")):
            parser=video.NativeBitstream(family);fixture=json.loads((root/"fixtures"/name).read_text());codec=None
            for packet in fixture["packets"]:
                data=base64.b64decode(packet["data"]);result,actual,is_key=parser.normalize(data)
                codec=packet.get("codec") or codec
                self.assertEqual(actual.lower(),codec.lower());self.assertEqual(is_key,packet["key"]);self.assertEqual(result,data)
                if family.startswith("h264"):self.assertEqual(actual,actual.lower(),"H264 codec metadata must use canonical lowercase")
        profiles=json.loads((root/"fixtures/av1-software-profiles-generated.json").read_text())
        for profile in profiles["profiles"]:
            parser=video.NativeBitstream("av1")
            for packet in profile["packets"]:
                _,actual,is_key=parser.normalize(base64.b64decode(packet["data"]));self.assertEqual(actual,packet["codec"]);self.assertEqual(is_key,packet["key"])

    def test_bounded_codec_headers_and_frame_units_reject_malformed_input(self):
        for family,invalid in (("hevc",[b"invalid",b"\0\0\1\x42",b"\0\0\1\x42\0",b"\0\0\1\x42\x01\x01"]),("av1",[b"",b"\x80",b"\x0a\xff",b"\x32\x01\0",b"\x12\x01\0"])):
            for data in invalid:
                with self.assertRaises(video.VideoFailure):video.NativeBitstream(family).normalize(data)
        for family in ("hevc","av1"):
            with self.assertRaises(video.VideoFailure):video.NativeBitstream(family).normalize(b"x"*(512*1024))

    def test_multiple_pictures_units_layers_and_foreign_chroma_are_rejected(self):
        hevc=json.loads((root/"fixtures/hevc-hardware-generated.json").read_text());data=base64.b64decode(hevc["packets"][0]["data"])
        units=video.re.split(b"\x00\x00\x00?\x01",data)[1:];picture=next(nal for nal in units if (nal[0]>>1)&63<=31)
        for malformed in (data+b"\0\0\0\1"+picture,data+b"\0\0\0\1\x46\x01\x10"):
            with self.assertRaises(video.VideoFailure):video.NativeBitstream("hevc").normalize(malformed)
        layered=bytes([picture[0]|1])+picture[1:]
        with self.assertRaisesRegex(video.VideoFailure,"hevc_layer"):video.NativeBitstream("hevc").normalize(b"\0\0\0\1"+layered)
        av1=json.loads((root/"fixtures/av1-software-generated.json").read_text());data=base64.b64decode(av1["packets"][0]["data"])
        with self.assertRaisesRegex(video.VideoFailure,"av1_unit_boundary"):video.NativeBitstream("av1").normalize(data+data)
        with self.assertRaisesRegex(video.VideoFailure,"av1_extension"):video.NativeBitstream("av1").normalize(bytes([data[0]|4,8])+data[1:])
        at=0;frame=None;sequence=None
        while at<len(data):
            begin=at;header=data[at];at+=1
            if header&4:at+=1
            size=shift=0
            while True:
                part=data[at];at+=1;size|=(part&127)<<shift;shift+=7
                if not part&128:break
            at+=size
            if (header>>3)&15 in (3,6):frame=data[begin:at]
            if (header>>3)&15==1:sequence=data[begin:at]
        self.assertIsNotNone(frame);self.assertIsNotNone(sequence)
        with self.assertRaisesRegex(video.VideoFailure,"av1_sequence_after_picture"):video.NativeBitstream("av1").normalize(data+sequence)
        with self.assertRaisesRegex(video.VideoFailure,"av1_picture"):video.NativeBitstream("av1").normalize(data+frame)
        with self.assertRaisesRegex(video.VideoFailure,"chroma_not_444"):video.NativeBitstream("h264-444").normalize(key)

    def test_random_access_headers_are_owned_by_one_bitstream_instance(self):
        fixture=json.loads((root/"fixtures/hevc-hardware-generated.json").read_text());data=base64.b64decode(fixture["packets"][0]["data"])
        units=video.re.split(b"\x00\x00\x00?\x01",data)[1:];bare=b"".join(b"\0\0\0\1"+nal for nal in units if (nal[0]>>1)&63 not in (32,33,34))
        parser=video.NativeBitstream("hevc");parser.normalize(data);restored,codec,is_key=parser.normalize(bare)
        self.assertTrue(is_key);self.assertEqual(codec,fixture["packets"][0]["codec"]);self.assertGreater(len(restored),len(bare))
        with self.assertRaises(video.VideoFailure):video.NativeBitstream("hevc").normalize(bare)

    def test_codec_frames_require_negotiation_and_retain_original_source_guard(self):
        for family,name in (("hevc","hevc-hardware-generated.json"),("av1","av1-software-generated.json")):
            output=[];alive=[True];flow=video.NativeVideoFlow(lambda:alive[0],lambda:0,lambda value,valid:output.append((value,valid)))
            command={"type":"native_video","id":str(uuid.uuid4()),"enabled":True,"fps":30,"bitrateKbps":2500,"codec":family}
            with self.assertRaises(video.VideoFailure):flow.start(command)
            flow.codecs=True;flow.start(command);reservation=flow.reserve();fixture=json.loads((root/"fixtures"/name).read_text());packet=fixture["packets"][0]
            flow.complete(reservation,base64.b64decode(packet["data"]),fixture["width"],fixture["height"],1)
            frame,valid=next((value,valid) for value,valid in output if value["type"]=="native_frame")
            self.assertEqual(frame["codecName"],family);self.assertEqual(frame["codec"],packet["codec"]);self.assertTrue(valid())
            alive[0]=False;self.assertFalse(valid());self.assertIsNone(flow.current)


class HelperWiring(unittest.TestCase):
    def test_helper_never_reuses_unretired_worker_and_ignores_old_disable(self):
        spec=importlib.util.spec_from_file_location("owned_helper",root/"linux-portal-helper.py")
        helper_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper_module)
        helper=helper_module.PortalHelper(None,SimpleNamespace(MainLoop=lambda:None),None)
        helper.ready=True;helper.session="/generated/session";helper.native_available=True;helper.scope=SimpleNamespace(alive=lambda:True)
        workers=[]
        class Worker:
            def __init__(self,*args):
                self.stopped=threading.Event();self.closed=threading.Event();workers.append(self)
            def stop(self): self.stopped.set()
        def request(identifier):return {"type":"native_video","id":identifier,"enabled":True,"fps":30,"bitrateKbps":2500,"window":3}
        with patch.object(helper_module._native_video,"H264Worker",Worker):
            old=str(uuid.uuid4());helper.command(request(old));self.assertEqual(len(workers),1)
            helper.command({"type":"native_video","id":old,"enabled":False});self.assertTrue(workers[0].stopped.is_set())
            newer=str(uuid.uuid4());helper.command(request(newer));self.assertEqual(len(workers),1);self.assertEqual(helper.native.current["id"],newer)
            workers[0].closed.set();helper.pump_native();self.assertEqual(len(workers),2)
            helper.command({"type":"native_video","id":old,"enabled":False})
            self.assertEqual(helper.native.current["id"],newer);self.assertFalse(workers[1].stopped.is_set())


class GeneratedCodec(unittest.TestCase):
    def test_mutable_playing_is_required_before_any_bitrate_write(self):
        encoder=object.__new__(video.GstH264Encoder)
        setter=Mock();encoder.encoder=SimpleNamespace(find_property=lambda name:SimpleNamespace(flags=0),set_property=setter)
        encoder.kbps=2500;encoder.factory="x264enc";encoder.Gst=SimpleNamespace(PARAM_MUTABLE_PLAYING=4096)
        with self.assertRaises(video.VideoFailure):encoder.rate(10,1200,lambda:True)
        setter.assert_not_called();self.assertEqual(encoder.kbps,2500)

    def test_live_software_bitrate_update_uses_generated_pixels_without_restarting_encoder(self):
        try:
            import gi
            gi.require_version("Gst","1.0");gi.require_version("GstVideo","1.0")
            from gi.repository import Gst,GstVideo
        except (ImportError,ValueError):self.skipTest("GStreamer video GI unavailable")
        Gst.init(None)
        if not all(Gst.ElementFactory.find(name) for name in ("x264enc","h264parse")):
            self.skipTest("Generated x264 dependencies unavailable")
        encoder=video.GstH264Encoder(Gst,GstVideo,64,64,30,2500,candidates=["x264enc"])
        try:
            raw=bytearray([0,0,255]*(64*64));first=encoder.encode(raw,True,lambda:True);pipeline=encoder.pipeline
            encoder.rate(10,1200,lambda:True);second=encoder.encode(raw,True,lambda:True)
            self.assertIs(encoder.pipeline,pipeline);self.assertEqual(encoder.encoder.get_property("bitrate"),1200)
            self.assertEqual(video.access_unit(first)[0],video.access_unit(second)[0]);self.assertTrue(video.access_unit(second)[1]);self.assertEqual(encoder.fps,10)
        finally:encoder.close()

    def test_additional_software_codecs_encode_only_generated_pixels(self):
        try:
            import gi
            gi.require_version("Gst","1.0");gi.require_version("GstVideo","1.0")
            from gi.repository import Gst,GstVideo
        except (ImportError,ValueError):self.skipTest("GStreamer video GI unavailable")
        Gst.init(None);tested=[]
        for family,factory in (("h264-444","x264enc"),("hevc","x265enc"),("av1","av1enc")):
            if family not in video.GstH264Encoder.codecs(Gst):continue
            encoder=video.GstH264Encoder(Gst,GstVideo,64,64,30,2500,candidates=[factory],family=family)
            try:
                data=encoder.encode(bytearray([0,0,255]*(64*64)),True,lambda:True)
                _,codec,key=video.NativeBitstream(family).normalize(data)
                self.assertTrue(key);self.assertTrue(codec.startswith({"h264-444":"avc1.f4","hevc":"hev1.","av1":"av01."}[family]));tested.append(family)
            finally:encoder.close()
        if not tested:self.skipTest("Additional generated software codecs unavailable")
        print("Generated additional software codecs:",",".join(tested))

    def test_real_software_encoder_and_decoder_use_generated_pixels_only(self):
        try:
            import gi
            gi.require_version("Gst","1.0");gi.require_version("GstVideo","1.0")
            from gi.repository import Gst,GstVideo
        except (ImportError,ValueError):
            self.skipTest("GStreamer video GI unavailable")
        Gst.init(None)
        factories=[name for name in ("openh264enc","x264enc") if Gst.ElementFactory.find(name)]
        if not factories or not all(Gst.ElementFactory.find(name) for name in ("h264parse","avdec_h264")):
            self.skipTest("Generated software H264 dependencies unavailable")
        encoder=video.GstH264Encoder(Gst,GstVideo,64,64,30,2500,candidates=factories)
        decoder=Gst.parse_launch("appsrc name=input format=time is-live=true ! h264parse ! avdec_h264 ! videoconvert ! video/x-raw,format=RGB ! appsink name=output sync=false max-buffers=1 drop=false")
        try:
            source=decoder.get_by_name("input");source.set_property("caps",Gst.Caps.from_string("video/x-h264,stream-format=byte-stream,alignment=au"))
            self.assertNotEqual(decoder.set_state(Gst.State.PLAYING),Gst.StateChangeReturn.FAILURE)
            for index,bgr in enumerate((bytes([0,0,255]),bytes([0,255,0]))):
                encoded=encoder.encode(bytearray(bgr*64*64),True,lambda:True)
                self.assertTrue(video.access_unit(encoded)[1])
                buffer=Gst.Buffer.new_allocate(None,len(encoded),None);buffer.fill(0,encoded);buffer.pts=index*Gst.SECOND//30;buffer.duration=Gst.SECOND//30
                self.assertEqual(source.emit("push-buffer",buffer),Gst.FlowReturn.OK)
                sample=decoder.get_by_name("output").emit("try-pull-sample",Gst.SECOND)
                self.assertIsNotNone(sample)
                info=GstVideo.VideoInfo.new_from_caps(sample.get_caps());data=sample.get_buffer().extract_dup(0,sample.get_buffer().get_size())
                pixel=data[info.offset[0]+32*info.stride[0]+32*3:][:3]
                self.assertGreater(pixel[0 if index==0 else 1],200)
                self.assertLess(pixel[2],40)
        finally:
            encoder.close();video.retire_pipeline(Gst,decoder)


if __name__ == "__main__":
    unittest.main()
