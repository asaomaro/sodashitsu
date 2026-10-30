#!/usr/bin/env python3
"""Generated access units and memory sinks only; no capture/input/OS clipboard."""
import base64
import importlib.util
import json
from pathlib import Path
import unittest
import uuid
import threading
from unittest.mock import patch
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

    def test_worker_retains_slot_through_native_encoder_shutdown(self):
        entered, finish, closing, retired = [threading.Event() for _ in range(4)]
        class Encoder:
            def __init__(self, *args):
                pass
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

    def test_strict_request_does_not_accept_boolean_integer_or_unknown_codec(self):
        for fields in [{"fps": True}, {"window": 2}, {"codec": "h265"}, {"bitrateKbps": 127}, {"command": "denied"}]:
            with self.assertRaises(video.VideoFailure):
                self.flow.start({"type": "native_video", "id": str(uuid.uuid4()), "enabled": True,
                                 "fps": 30, "bitrateKbps": 2500, **fields})


class GeneratedCodec(unittest.TestCase):
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
